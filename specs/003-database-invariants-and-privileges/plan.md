# Plan: spec 003

Status: implemented. The inputs were measured on the hosted database on 2026-11-07 (see the spec). The expand stage and the contract stage were applied to the hosted database by the maintainer, and the review of the privilege change settled the open points of the spec.

## Inputs (measured 2026-11-07)

- Privilege catalog of tables, columns and functions: in the spec. It shows `REFERENCES`, `TRIGGER` and `TRUNCATE` for `anon`, `authenticated` and `service_role`, and a third function, `rls_auto_enable()`.
- Rows with `amount <= 0`: none, out of 95. Distribution by `ai_classified` and `ai_provider`: 5 manual, 37 `gemini`, 53 `local`.
- The migration role (`postgres`) holds `TRIGGER` on `auth.users`, which `supabase_auth_admin` owns, and no trigger exists in `auth` today. Creating the demo identity trigger is therefore allowed on the hosted project; that the same holds on the local stack is checked by the test of that criterion in CI.
- The API `max_rows` of the hosted project is 1000, and the local configuration already uses it.
- The demo user id is `94f56c85-36dd-4feb-89ae-92254754fc93`.

## Files

- `supabase/migrations/20261108000000_006_classification_and_invariants_expand.sql`: the whole expand stage in one transaction, including the explicit privileges, the summary function and the demo identity trigger. There is no separate privileges migration.
- `supabase/migrations/20261110050540_007_classification_contract.sql`: the contract stage. It was kept outside `supabase/migrations` while the code of specs 004 and 005 was not deployed, so the expand state stayed testable. Once that code was deployed and verified it moved into the folder, renamed with the timestamp of that moment so that it sorts after every migration already applied. The maintainer applies it to the hosted database.
- `supabase/tests/database/001` to `008`: they describe the contract state, the state of the local stack once every migration is applied (rows are inserted with a status of `ai`, and the update tests expect `42501` for every column except `category_id`). `001` seeds each user's row as that user, because `service_role` loses its privileges.
- `scripts/test-migration-backfill.sh`: the data checks of both stages, on sample rows.
- `.github/workflows/ci.yml`: the step "Migration backfill check", which runs last because it resets the local database. It applies the expand and the contract migrations one at a time with `psql`.

## DDL outline (expand)

1. Add the three columns with their checks; add the check that ties the reason to `fallback`.
2. Backfill existing rows (statement kept in one place so the test reuses it).
3. Add `CHECK (amount > 0)` validated: the measured data has no violating row. Use `NOT VALID` only if a later measurement finds one.
4. Create the category/type trigger function and trigger.
5. Create the classification guard function and trigger, after the backfill. In this stage the insert rule accepts a null status; the contract stage tightens it together with `NOT NULL`.
6. Revoke and grant per the matrix (on the schema only `CREATE` is revoked from `PUBLIC`), including `REFERENCES`, `TRIGGER` and `TRUNCATE`; set default privileges for the migration role; fix `search_path` on `ping()` and `set_updated_at()`; revoke `DELETE`.
7. Create the summary function and grant `EXECUTE` to `authenticated`.
8. Create the demo identity trigger, or record the alternative.

## DDL outline (contract)

1. Fill null statuses as `legacy`, passing the guard by the mechanism chosen below.
2. Revoke `UPDATE` on the table from client roles and grant `UPDATE (category_id)`.
3. Set `NOT NULL`.

## Decisions

- Custom SQLSTATE values: `TX001` category does not apply to the type; `TX002` classification columns cannot be changed directly. Both are five characters and outside the standard Postgres classes. The review of the DDL confirms them.
- Guard mechanism for the contract fill: disable the guard trigger inside the migration transaction and re-enable it in the same transaction. It is disabled **by name** (`ALTER TABLE ... DISABLE TRIGGER <name>`), never with `ALL`, which would also turn off the foreign key triggers. No standing exception is left in the trigger code.
- The demo user id is a literal in the migration. It is an identifier that anyone who signs in obtains, and a database setting would add state outside version control.
- All objects schema-qualified; functions use an empty `search_path`.
- The summary function is `public.get_transactions_summary(p_month text default null)`. It returns one `jsonb` document with `selectedMonth`, `byCategory` and `byMonth`, totals as decimal text with two places. `byMonth` covers every row of the caller and `byCategory` the selected month, ties sorted by category name. An invalid month raises `22023`.
- SQLSTATE values: `TX001` category does not apply to the type, `TX002` classification columns, `TX003` demo identity.
- The category and type trigger also fires on update of `type`, so that a change of type cannot leave a category that no longer applies.
- The classification guard has no exception for any role. A maintenance change disables it by name inside a migration transaction.
- The demo identity trigger compares values, so an update that rewrites the same values (as the auth service does) is accepted. It is created only if the migration role holds `TRIGGER` on `auth.users`; otherwise a warning is printed and the account is regenerated by hand.
- Decisions confirmed by the privilege review (see the open points of the spec): the `DELETE` policy is dropped together with the privilege; `service_role` loses its privileges on the tables and on the project functions (separate statements); `EXECUTE` is revoked from `PUBLIC`, `anon`, `authenticated` and `service_role` on `rls_auto_enable()` when it exists; the default privileges of `supabase_admin` are not touched, because the migration role is not a member of that role.
- `PUBLIC` keeps `USAGE` on schema `public`; only `CREATE` is revoked. Revoking `USAGE` would also affect roles that reach the schema through `PUBLIC`, and with every object privilege revoked it adds nothing. The PostgREST check of AC-17 covers the path that a role switch takes.

## Live check after the expand stage (maintainer)

Run by the maintainer on the hosted project after applying the expand migration, in three parts:

1. the sign-in of the demo account works;
2. an attempt to change the password of the demo account fails;
3. the sign-up and the sign-in of another user are not affected.

Then the grants comparison of the setup runbook, section 14.

## Risks

- A trigger on `auth.users` is allowed on the hosted project (the migration role holds `TRIGGER`). It may still fail on the local stack; the alternative is in the spec.
- Default privileges of `supabase_admin` in `public` give every client role full table privileges, and the migration role cannot change them (it is not a member of that role). Objects created by that role are outside the guarantee; the mitigation is the grants comparison after every hosted migration (setup runbook, section 14).
- A hosted object that the migrations do not mention (extensions, Supabase defaults) can alter the privilege catalog. The measured catalog is the reference, and the local comparison explains any difference.
- Locks during the expand migration: `ALTER TABLE` takes short exclusive locks. The table is small; the plan records the expected duration.
