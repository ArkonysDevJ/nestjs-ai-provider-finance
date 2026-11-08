#!/usr/bin/env bash
# Checks the data steps of spec 003 on sample rows, against the local stack:
#
#   1. reset the local database to the state before the expand migration (the
#      expand migration is the last file of supabase/migrations at this stage);
#   2. insert sample rows written the way the old code wrote them;
#   3. apply the expand migration and check the backfill of the status;
#   4. insert rows without a status, as the old code would still write them;
#   5. apply the contract file and check that those rows are filled, that nothing
#      else changed, and that every trigger is enabled again.
#
# The database is left in the contract state, so run this step last. It talks
# only to the local stack and refuses to run against anything else.
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
CONTRACT_FILE="${CONTRACT_FILE:-supabase/contract/20261108000100_007_classification_contract.sql}"

case "$DB_URL" in
  postgresql://*@127.0.0.1:* | postgresql://*@localhost:* | *host=/*) ;;
  *) echo "Refusing to run: DB_URL is not a local address." >&2; exit 1 ;;
esac

run() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
expect() {
  local description="$1" expected="$2" query="$3" got
  got="$(run -At -c "$query")"
  [ "$got" = "$expected" ] || fail "$description: expected '$expected', got '$got'"
  echo "ok: $description"
}

echo "Resetting the local database to the state before the expand migration"
supabase db reset --last 1
# A reset that does not happen must not pass in silence.
expect "the expand migration is not applied after the reset" "0" \
  "select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'classification_status'"

echo "Inserting sample rows, as the old code wrote them"
run <<'SQL'
insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'backfill-check@example.com', 'x');

insert into public.transactions
  (user_id, description, amount, type, category_id, ai_classified, ai_provider, updated_at)
select '11111111-1111-1111-1111-111111111111', 'sample ' || n, 10.00, 'expense',
       (select id from public.categories where name = 'Otros'),
       v.ai_classified, v.ai_provider, timestamptz '2026-01-01 00:00:00+00'
  from (values (1, false, null), (2, false, null), (3, false, null),
               (4, true, 'gemini'), (5, true, 'gemini'),
               (6, true, 'local'), (7, true, 'local')) as v(n, ai_classified, ai_provider);
SQL

echo "Applying the expand migration"
supabase migration up

expect "every pre-existing row has a status" "0" \
  "select count(*) from public.transactions where classification_status is null"
expect "rows that were manual stay manual" "3" \
  "select count(*) from public.transactions where classification_status = 'manual'"
expect "rows that were AI-classified become legacy" "4" \
  "select count(*) from public.transactions where classification_status = 'legacy'"
expect "the backfill did not touch updated_at" "0" \
  "select count(*) from public.transactions where updated_at <> timestamptz '2026-01-01 00:00:00+00'"

echo "Inserting rows without a status, as the old code still writes them"
run <<'SQL'
insert into public.transactions
  (user_id, description, amount, type, category_id, ai_classified, ai_provider, updated_at)
select '11111111-1111-1111-1111-111111111111', 'late ' || n, 5.00, 'expense',
       (select id from public.categories where name = 'Otros'),
       true, 'gemini', timestamptz '2026-01-01 00:00:00+00'
  from generate_series(1, 2) as n;
SQL
expect "the old code leaves the status null during the expand stage" "2" \
  "select count(*) from public.transactions where classification_status is null"

echo "Applying the contract file"
run -f "$CONTRACT_FILE"

expect "no row is left without a status" "0" \
  "select count(*) from public.transactions where classification_status is null"
expect "the late rows are filled as legacy" "6" \
  "select count(*) from public.transactions where classification_status = 'legacy'"
expect "the manual rows are untouched" "3" \
  "select count(*) from public.transactions where classification_status = 'manual'"
expect "the contract fill did not touch updated_at" "0" \
  "select count(*) from public.transactions where updated_at <> timestamptz '2026-01-01 00:00:00+00'"
expect "classification_status is NOT NULL" "NO" \
  "select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'classification_status'"
expect "every trigger of transactions is enabled again, internal ones included" "0" \
  "select count(*) from pg_trigger where tgrelid = 'public.transactions'::regclass and tgenabled <> 'O'"

echo "Migration data checks passed."
