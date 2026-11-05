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
5. Create the classification guard function and trigger, after the backfill.
6. Revoke and grant per the matrix; set default privileges; fix `search_path` on `ping()` and `set_updated_at()`; revoke `DELETE`.
7. Create the summary function and grant `EXECUTE` to `authenticated`.
8. Create the demo identity trigger, or record the alternative.

## Draft DDL outline (contract)

1. Fill null statuses as `legacy`, passing the guard by the mechanism chosen below.
2. Revoke `UPDATE` on the table from client roles and grant `UPDATE (category_id)`.
3. Set `NOT NULL`.

## Decisions

- Custom SQLSTATE values (draft): `TX001` category does not apply to the type; `TX002` classification columns cannot be changed directly.
- Guard mechanism for the contract fill: disable and re-enable the trigger inside the migration transaction (no standing exception). The alternative, an exception for the migration role, is kept in mind and decided with the DDL review.
- The demo user id is an identifier, not a credential. Whether it is a literal in the migration or a database setting is decided with the measured inputs.
- All objects schema-qualified; functions use an empty `search_path`.

## Risks

- A trigger on `auth.users` may not be permitted. The alternative is in the spec.
- A hosted object that the migrations do not mention (extensions, Supabase defaults) can alter the privilege catalog. The measured catalog is the reference, and the local comparison explains any difference.
- Locks during the expand migration: `ALTER TABLE` takes short exclusive locks. The table is small; the plan records the expected duration.
