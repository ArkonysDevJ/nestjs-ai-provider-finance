# Plan: spec 003

Status: draft. Sections marked "pending" wait for the measured catalog of the hosted database.

## Inputs (pending)

- Privilege catalog of tables, columns and functions in the hosted database.
- Count of rows with `amount <= 0`, and the distribution of existing rows by `ai_classified` and `ai_provider` (counts only).
- Whether the migration role may create a trigger on `auth.users`, and who owns that table.
- The API `max_rows` of the hosted project.

## Files

- `supabase/migrations/<timestamp>_006_classification_and_invariants_expand.sql`
- `supabase/migrations/<timestamp>_007_privileges_explicit.sql` (may be part of the expand migration)
- `supabase/migrations/<timestamp>_008_classification_contract.sql`
- `supabase/tests/database/002` to `009` (names in the spec).
- `scripts/test-migration-backfill.sh` for the backfill check.

## Draft DDL outline (expand)

1. Add the three columns with their checks; add the check that ties the reason to `fallback`.
2. Backfill existing rows (statement kept in one place so the test reuses it).
3. Add `CHECK (amount > 0)`, `NOT VALID` first if the data requires it.
4. Create the category/type trigger function and trigger.
5. Create the classification guard function and trigger, after the backfill. In this stage the insert rule accepts a null status; the contract stage tightens it together with `NOT NULL`.
6. Revoke and grant per the matrix; set default privileges; fix `search_path` on `ping()` and `set_updated_at()`; revoke `DELETE`.
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

- A trigger on `auth.users` may not be permitted. The alternative is in the spec.
- A hosted object that the migrations do not mention (extensions, Supabase defaults) can alter the privilege catalog. The measured catalog is the reference, and the local comparison explains any difference.
- Locks during the expand migration: `ALTER TABLE` takes short exclusive locks. The table is small; the plan records the expected duration.
