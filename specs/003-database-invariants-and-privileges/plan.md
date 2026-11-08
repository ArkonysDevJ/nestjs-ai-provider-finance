# Plan: spec 003

Status: draft. The inputs were measured on the hosted database on 2026-11-07 (see the spec). The DDL stays a draft until the review of the privilege change settles the open points of the spec.

## Inputs (measured 2026-11-07)

- Privilege catalog of tables, columns and functions: in the spec. It shows `REFERENCES`, `TRIGGER` and `TRUNCATE` for `anon`, `authenticated` and `service_role`, and a third function, `rls_auto_enable()`.
- Rows with `amount <= 0`: none, out of 95. Distribution by `ai_classified` and `ai_provider`: 5 manual, 37 `gemini`, 53 `local`.
- The migration role (`postgres`) holds `TRIGGER` on `auth.users`, which `supabase_auth_admin` owns, and no trigger exists in `auth` today. Creating the demo identity trigger is therefore allowed on the hosted project; that the same holds on the local stack is checked by the test of that criterion in CI.
- The API `max_rows` of the hosted project is 1000, and the local configuration already uses it.
- The demo user id is `94f56c85-36dd-4feb-89ae-92254754fc93`.

## Files

- `supabase/migrations/<timestamp>_006_classification_and_invariants_expand.sql`
- `supabase/migrations/<timestamp>_007_privileges_explicit.sql` (may be part of the expand migration)
- `supabase/migrations/<timestamp>_008_classification_contract.sql`
- `supabase/tests/database/002` to `009` (names in the spec).
- `scripts/test-migration-backfill.sh` for the backfill check.

## Draft DDL outline (expand)

1. Add the three columns with their checks; add the check that ties the reason to `fallback`.
2. Backfill existing rows (statement kept in one place so the test reuses it).
3. Add `CHECK (amount > 0)` validated: the measured data has no violating row. Use `NOT VALID` only if a later measurement finds one.
4. Create the category/type trigger function and trigger.
5. Create the classification guard function and trigger, after the backfill. In this stage the insert rule accepts a null status; the contract stage tightens it together with `NOT NULL`.
6. Revoke and grant per the matrix, including `REFERENCES`, `TRIGGER` and `TRUNCATE`; set default privileges for the migration role; fix `search_path` on `ping()` and `set_updated_at()`; revoke `DELETE`.
7. Create the summary function and grant `EXECUTE` to `authenticated`.
8. Create the demo identity trigger, or record the alternative.

## Draft DDL outline (contract)

1. Fill null statuses as `legacy`, passing the guard by the mechanism chosen below.
2. Revoke `UPDATE` on the table from client roles and grant `UPDATE (category_id)`.
3. Set `NOT NULL`.

## Decisions

- Custom SQLSTATE values: `TX001` category does not apply to the type; `TX002` classification columns cannot be changed directly. Both are five characters and outside the standard Postgres classes. The review of the DDL confirms them.
- Guard mechanism for the contract fill: disable the guard trigger inside the migration transaction and re-enable it in the same transaction. It is disabled **by name** (`ALTER TABLE ... DISABLE TRIGGER <name>`), never with `ALL`, which would also turn off the foreign key triggers. No standing exception is left in the trigger code.
- The demo user id is a literal in the migration. It is an identifier that anyone who signs in obtains, and a database setting would add state outside version control.
- All objects schema-qualified; functions use an empty `search_path`.

## Risks

- A trigger on `auth.users` is allowed on the hosted project (the migration role holds `TRIGGER`). It may still fail on the local stack; the alternative is in the spec.
- Default privileges of `supabase_admin` in `public` give every client role full table privileges, and the migration role may not be able to change them. Objects created by that role are outside the guarantee.
- A hosted object that the migrations do not mention (extensions, Supabase defaults) can alter the privilege catalog. The measured catalog is the reference, and the local comparison explains any difference.
- Locks during the expand migration: `ALTER TABLE` takes short exclusive locks. The table is small; the plan records the expected duration.
