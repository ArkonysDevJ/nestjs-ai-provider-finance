# Spec 003: database invariants and privileges

Status: the expand stage is merged and the maintainer applied it to the hosted database; the contract stage is prepared as a migration in `supabase/migrations` and is applied to the hosted database only by the maintainer, after the code of specs 004 and 005 is deployed and verified (both are). The measured catalog of the hosted database is attached below (read-only queries, 2026-11-07). The review of the privilege change settled the open points listed in this spec (see "Open points").

## Goal

Move the data invariants that today live only in the API into the database, and make every privilege explicit, so that the hosted and the local database behave the same. The change ships in two stages that surround the code changes of specs 004 and 005:

- **expand:** add what is new without removing anything the running code still uses.
- **contract:** remove what the new code no longer uses, and tighten.

## Current state

- `transactions.amount` has no `CHECK`. A zero or negative amount can be stored.
- The update policy lets the owner change any column of an own row, including `ai_classified`, `ai_provider`, `type`, `category_id` and `amount`.
- Nothing in the database ties `category_id` to the transaction `type`. Only the API checks it, and only on reclassification.
- The failure of an AI provider is stored as a classification: "Otros", `ai_classified = true` and the provider name. There is no way to tell a real classification from a fallback.
- Grants are partial and wider than the API needs: `authenticated` has `SELECT` on `categories` and full CRUD on `transactions`, and `anon`, `authenticated` and `service_role` also hold `REFERENCES`, `TRIGGER` and `TRUNCATE` on both tables (see the measured catalog). On hosted Supabase new tables get no implicit grants; on the local CLI they do. `ping()` is `SECURITY DEFINER` with `search_path = public` and does not revoke `EXECUTE` from `PUBLIC`. `set_updated_at()` does not fix `search_path`. A third function, `rls_auto_enable()`, exists in `public` and is not covered by the requirements below.
- The demo account has full CRUD and public credentials. Any visitor can change its password through Auth.
- The summary is computed in the API from a full table read.

## Measured hosted catalog (2026-11-07)

Read-only queries against the hosted project, each inside `begin read only; ... rollback;`. They return catalog data and counts only, never row contents or key values.

**Privileges on tables** (`information_schema.role_table_grants`; column privileges repeat the table grants on every column):

| Table | `anon` | `authenticated` | `service_role` |
| --- | --- | --- | --- |
| `categories` | references, trigger, truncate | select, references, trigger, truncate | references, trigger, truncate |
| `transactions` | references, trigger, truncate | select, insert, update, delete, references, trigger, truncate | references, trigger, truncate |

**Functions in `public`:**

| Function | Owner | Definer | Volatility | `search_path` | ACL |
| --- | --- | --- | --- | --- | --- |
| `ping()` | `postgres` | yes | volatile | `public` | `PUBLIC`, `postgres` and `anon` execute |
| `set_updated_at()` | `postgres` | no | volatile | not fixed | default (`PUBLIC` executes) |
| `rls_auto_enable()` | `postgres` | yes | volatile | `pg_catalog` | default (`PUBLIC` executes) |

**Default privileges in `public`:**

| Role that creates the object | Tables | Functions | Sequences |
| --- | --- | --- | --- |
| `postgres` | owner full; `anon`, `authenticated`, `service_role`: truncate, references, trigger, maintain | owner only | owner only |
| `supabase_admin` | owner, `anon`, `authenticated`, `service_role`: all table privileges | execute for all four | usage and read/write for all four |

**Row Level Security:** enabled and forced on `categories` and `transactions`. Policies: `categories_select_authenticated` (select, `true`); `transactions_select_own`, `transactions_delete_own` (`auth.uid() = user_id`), `transactions_insert_own` (check `auth.uid() = user_id`) and `transactions_update_own` (using and check `auth.uid() = user_id`).

**`transactions`:** one trigger (`trg_transactions_updated_at`, before update). Constraints: primary key, `type` in (`income`, `expense`), `ai_provider` in (`gemini`, `local`) or null, foreign key to `categories(id)` without cascade, foreign key to `auth.users(id)` with `ON DELETE CASCADE`. No check on `amount`, no category/type trigger.

**Data (counts only):** 95 rows, none with `amount <= 0`. By `ai_classified` and `ai_provider`: 5 with `false` and no provider, 37 with `true` and `gemini`, 53 with `true` and `local`.

**Platform:** Postgres 17.6. Role settings: `anon` `statement_timeout` 3 s; `authenticated` 8 s; `authenticator` 8 s plus `lock_timeout` 8 s, with `supautils` and `safeupdate` preloaded. `postgres` holds `TRIGGER` on `auth.users` (owned by `supabase_auth_admin`), and there is no trigger in the `auth` schema today.

**Data API:** `max_rows` 1000; exposed schemas `public` and `graphql_public`; extra search path `public, extensions`.

**Auth:** sign-up enabled; e-mail confirmation required; anonymous sign-ins off; password minimum length 6, no required character classes; access token lifetime 3600 s; refresh token rotation on, reuse interval 10 s; built-in e-mail limit 2 per hour; limits per hour for tokens 150, verification 30, one-time codes 30, anonymous users 30; the configured site URL is `http://localhost:3000`.

**Demo account:** its user id is `94f56c85-36dd-4feb-89ae-92254754fc93`. It is an identifier, not a credential.

**Local stack comparison** (`supabase/config.toml`): major version 17, `max_rows` 1000, token lifetime 3600 s, sign-up enabled and password minimum 6 match the hosted values. They differ in e-mail confirmation (off locally so the test users can sign in without a mailbox) and in the site URL (a loopback address). The catalog-level comparison needs the local stack and is recorded in the pull request of the expand stage.

## Requirements

### Classification state (expand)

1. Add `classification_status` (`text`, check in `ai`, `fallback`, `manual`, `legacy`), `classification_reason` (`text`, check in `provider_error`, `timeout`, `quota_exceeded`, `invalid_output`) and `ai_model` (`text`, nullable).
2. `classification_reason` is set if and only if `classification_status = 'fallback'`.
3. Existing rows are filled before any trigger that guards these columns is created, in the same migration: rows with `ai_classified = false` become `manual`; rows with `ai_classified = true` become `legacy`. The measured distribution is 5 rows with `ai_classified = false` and 90 with `true`, so the mapping gives 5 `manual` and 90 `legacy` rows.
4. `classification_status` stays nullable in this stage. Rows created between this stage and the deployment of spec 004 have it null, because the running code does not write it.
5. `ai_classified` keeps its current meaning. It is not reinterpreted.

### Invariants (expand)

6. `CHECK (amount > 0)`. The measured data has no violating rows, so the check is added validated, in one step. If a later measurement finds violating rows, it is added `NOT VALID` and validated after those rows are handled.
7. A trigger rejects a `category_id` whose `applies_to` is neither the transaction `type` nor `both`, on insert and on update of `category_id`.
8. A trigger guards the classification columns:
   - on insert, in the expand stage: `classification_status` may be null, and then `classification_reason` must be null too (the running code does not write them yet), or it is `ai` or `fallback` with the reason rule of requirement 2; in the contract stage, together with `NOT NULL`, an insert requires `ai` or `fallback`;
   - on update of `category_id`, it derives the manual state: `classification_status = 'manual'`, reason null, `ai_model` null, `ai_classified = false`, `ai_provider` null;
   - any direct change of `classification_status`, `classification_reason` or `ai_model` by a client role is rejected.
9. During this stage the update of `ai_classified` and `ai_provider` by the owner still works, because the running code still writes them.
10. `DELETE` on `transactions` is revoked from `authenticated`.

### Privileges (expand)

11. Revoke all privileges on the `public` tables and functions from `anon`, `authenticated`, `service_role` and `PUBLIC`, including the `REFERENCES`, `TRIGGER` and `TRUNCATE` privileges found in the measured catalog, then grant exactly the matrix below. On the schema itself only `CREATE` is revoked from `PUBLIC`: its `USAGE` is inherited from the platform and is kept, because with no privilege on any object it reaches nothing. Set default privileges so that new objects in `public` start with none. Revoke `EXECUTE` on functions from `PUBLIC` by default. `rls_auto_enable()` is kept, and `EXECUTE` is revoked from `PUBLIC`, `anon`, `authenticated` and `service_role` on it when it exists.
12. Fix `search_path` on `ping()` and on `set_updated_at()`.

| Object | `anon` | `authenticated` | `PUBLIC` |
| --- | --- | --- | --- |
| schema `public` | usage | usage | usage, inherited from the platform; no accessible objects; `CREATE` revoked |
| `categories` | none | select | none |
| `transactions` (expand) | none | select, insert, update | none |
| `transactions` (contract) | none | select, insert, update on `category_id` only | none |
| `ping()` | execute | none | none |
| summary function | none | execute | none |

### Summary function (expand, base of spec 006)

13. A function in `public` computes the summary: `SECURITY INVOKER`, `STABLE`, empty `search_path`, schema-qualified names, exact decimals, totals returned as decimal text. It respects Row Level Security.

### Demo account identity (expand)

14. A trigger on `auth.users`, limited to the demo user id, rejects changes of password, e-mail and phone. If the platform does not allow that trigger, the maintainer regenerates the account by hand from the dashboard, and no secret key is used. In both cases the README states that visitors can read and edit the demo's transaction data.

### Contraction

15. Applied only when the code of specs 004 and 005 is deployed.
16. Before `NOT NULL`, rows whose `classification_status` is still null are filled as `legacy`. The fill passes the guard trigger through a documented mechanism: disabling and re-enabling the trigger inside the migration transaction, or an exception limited to the role that applies migrations. The plan states which one and why.
17. The `UPDATE` privilege on `ai_classified` and `ai_provider` is removed: the client roles keep `UPDATE (category_id)` only.
18. `classification_status` becomes `NOT NULL`.

## Contracts

- New SQLSTATE values raised by the triggers (draft, final values in the plan): category does not apply to the type; classification columns cannot be changed directly. The API maps them in spec 005, together with `42501` (insufficient privilege), `23514` (check violation) and `22023` (invalid month in the summary function, mapped to 400).
- The provenance written at creation is recorded by the API and is not verified by the database. The README states this limit.

## Edge cases

- Concurrent inserts during the expand migration: the migration runs in one transaction and takes the locks it needs; the plan lists them.
- A reclassification to a category that does not apply to the type is rejected by the trigger even if the API check is removed.
- Updating `amount`, `type` or `description` is not an API feature. After the contract stage the client roles cannot do it either.

## Open points

The measured catalog raised five points. The review of the privilege change settled them.

1. **`rls_auto_enable()`.** Settled: it is kept, and `EXECUTE` is revoked from `PUBLIC`, `anon`, `authenticated` and `service_role` on it, only when the function exists (it is created by the hosted platform, not by the local stack).
2. **Default privileges of `supabase_admin`.** Settled: the limit is accepted, with a mitigation. A read-only check on the hosted project showed that the migration role is not a member of `supabase_admin` and holds no `USAGE` on it, so the migration does not touch those default privileges. The guarantee "new objects start with no privileges" therefore holds for objects created by the migration role only (AC-14). An object created by the platform role can start with privileges for the client roles. The mitigation is a mandatory step after every migration applied to the hosted project: compare the grants of `public` in `information_schema.role_table_grants` with the matrix, and stop and report on any privilege outside it (`apps/api/deploy/RUNBOOK-SETUP.md`, section 15). The README states the limit.
3. **`service_role`.** Settled: its privileges on the two tables and on the project functions are revoked.
4. **The `DELETE` policy on `transactions`.** Settled: it is dropped in the expand stage, together with the privilege.
5. **Auth settings.** Open sign-up, a 6-character minimum, no required character classes and a loopback site URL are not changed by this spec. They are recorded here as input for the README and for a separate decision of the maintainer.

## Acceptance criteria

- **AC-1.** The three columns exist with their checks, and invalid values are rejected.
  - Test: `supabase/tests/database/003-classification-columns.test.sql` (AC-1).
- **AC-2.** After the expand migration every pre-existing row has a non-null status according to the mapping.
  - Test: CI step "Migration backfill check" (`scripts/test-migration-backfill.sh`), which applies the earlier migrations, inserts sample rows, applies the new migration and asserts (AC-2).
- **AC-3.** A zero or negative amount is rejected with `23514`. Rows that violated it before are handled as the measured data requires.
  - Test: `supabase/tests/database/004-amount-check.test.sql` (AC-3).
- **AC-4.** A category that does not apply to the type is rejected on insert and on update of `category_id`; `both` is accepted.
  - Test: `supabase/tests/database/005-category-type.test.sql` (AC-4).
- **AC-5.** An update of `category_id` derives the manual state and clears the provenance. A direct change of the classification columns is rejected.
  - Test: `supabase/tests/database/006-classification-transitions.test.sql` (AC-5).
- **AC-6.** Creation rules, in two variants.
  - Expand stage: an insert with a null status and a null reason succeeds; an insert with a status but a fallback without a reason, or a reason without a fallback, is rejected; a forged but well-formed provenance is accepted, and the test documents that declared limit.
  - Contract stage: an insert with a null status is rejected; the other rules of the expand variant stay.
  - Test: CI step "Migration backfill check" (`scripts/test-migration-backfill.sh`) for the expand variant (a row inserted without a status after the expand migration is accepted), and `supabase/tests/database/006-classification-transitions.test.sql` for the contract variant and the shared rules (AC-6).
- **AC-7.** The privilege catalog matches the matrix for `anon`, `authenticated`, `service_role` and `PUBLIC`, at table, column and function level. On the schema, `PUBLIC` holds `USAGE` and nothing else, and `anon` and `authenticated` cannot create objects.
  - Test: `supabase/tests/database/002-privileges.test.sql` using `table_privs_are`, `column_privs_are` and `function_privs_are` (AC-7).
- **AC-8.** The owner cannot delete a transaction (`42501`).
  - Test: `supabase/tests/database/002-privileges.test.sql` (AC-8).
- **AC-9.** `ping()` is executable by `anon` and by no one else; `ping()` and `set_updated_at()` have a fixed `search_path`.
  - Test: `supabase/tests/database/002-privileges.test.sql` (AC-9).
- **AC-10.** The summary function is invoker, stable, with an empty `search_path`; it is executable by `authenticated` only; one user does not see another user's rows; sums are exact.
  - Test: `supabase/tests/database/007-summary-function.test.sql` (AC-10).
- **AC-11.** After the contract stage a client role can update only `category_id`, `classification_status` is `NOT NULL`, and no row has a null status.
  - Test: `supabase/tests/database/002-privileges.test.sql` and `supabase/tests/database/006-classification-transitions.test.sql`; the fill of the null statuses is checked by `scripts/test-migration-backfill.sh` (AC-11).
- **AC-12.** Changes of password, e-mail and phone of the demo user are rejected by the trigger, or the regeneration is recorded.
  - Test: `supabase/tests/database/008-demo-identity.test.sql` (AC-12), skipped with a recorded reason if the platform does not allow the trigger.
- **AC-13.** The differences between the local catalog and the measured hosted catalog are listed and explained.
  - Test: reviewed in the pull request of the expand stage (AC-13).
- **AC-14.** An object created in `public` after this stage starts with no privileges for `anon`, `authenticated` and `PUBLIC` (default privileges).
  - Test: `supabase/tests/database/002-privileges.test.sql` creates a temporary table and function and checks their privileges (AC-14).
- **AC-15.** After the expand stage the running code keeps working: an insert that does not set the new columns succeeds, and an owner update of `ai_classified` and `ai_provider` succeeds.
  - Test: CI step "Migration backfill check" (`scripts/test-migration-backfill.sh`), which inserts rows without the new columns after the expand migration and checks them; and the live check after the expand migration was applied to the hosted database, done by the maintainer on 2026-11-09, which covers the running API. The pgTAP test that used to check the owner's update of `ai_classified` and `ai_provider` (`009-expand-compatibility`) was removed when the contract migration moved into `supabase/migrations`, because it describes a state that no longer exists in the local stack (AC-15).
- **AC-16.** After the contract stage, a creation, a reclassification and a summary read through the deployed API return no server error. Live check by the maintainer.
  - Test: manual check recorded in the pull request of the contract stage (AC-16).
- **AC-17.** Through PostgREST on the local stack: a call to the summary function with the publishable key and no user token is refused with 401 or 403 and `42501`; the same call with a user token answers 200; afterwards the database still accepts connections (the API health endpoint answers 200). If the server goes down, nothing is applied to the hosted database and the server log is reported.
  - Test: `bruno/nestjs-ai-provider-finance/security-tests/03-summary-function-denied-without-jwt.bru`, `04-summary-function-allowed-with-jwt.bru` and `05-database-still-answers.bru`, run by CI step "Integration tests (Bruno)" (AC-17).

## Out of scope

The API code that uses the new columns (spec 004), the error mapping (spec 005) and the use of the summary function (spec 006). Moving the demo account to another authentication method.

## Order

Expand after spec 002. Contract after the code of specs 004 and 005 is deployed and verified.
