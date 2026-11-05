# Spec 003: database invariants and privileges

Status: draft. The DDL in `plan.md` stays a draft until the measured catalog of the hosted database is attached to this spec.

## Goal

Move the data invariants that today live only in the API into the database, and make every privilege explicit, so that the hosted and the local database behave the same. The change ships in two stages that surround the code changes of specs 004 and 005:

- **expand:** add what is new without removing anything the running code still uses.
- **contract:** remove what the new code no longer uses, and tighten.

## Current state

- `transactions.amount` has no `CHECK`. A zero or negative amount can be stored.
- The update policy lets the owner change any column of an own row, including `ai_classified`, `ai_provider`, `type`, `category_id` and `amount`.
- Nothing in the database ties `category_id` to the transaction `type`. Only the API checks it, and only on reclassification.
- The failure of an AI provider is stored as a classification: "Otros", `ai_classified = true` and the provider name. There is no way to tell a real classification from a fallback.
- Grants are partial: `authenticated` has `SELECT` on `categories` and full CRUD on `transactions`. On hosted Supabase new tables get no implicit grants; on the local CLI they do. `ping()` is `SECURITY DEFINER` with `search_path = public` and does not revoke `EXECUTE` from `PUBLIC`. `set_updated_at()` does not fix `search_path`.
- The demo account has full CRUD and public credentials. Any visitor can change its password through Auth.
- The summary is computed in the API from a full table read.

## Requirements

### Classification state (expand)

1. Add `classification_status` (`text`, check in `ai`, `fallback`, `manual`, `legacy`), `classification_reason` (`text`, check in `provider_error`, `timeout`, `quota_exceeded`, `invalid_output`) and `ai_model` (`text`, nullable).
2. `classification_reason` is set if and only if `classification_status = 'fallback'`.
3. Existing rows are filled before any trigger that guards these columns is created, in the same migration: rows with `ai_classified = false` become `manual`; rows with `ai_classified = true` become `legacy`. The final mapping follows the measured distribution of the hosted data.
4. `classification_status` stays nullable in this stage. Rows created between this stage and the deployment of spec 004 have it null, because the running code does not write it.
5. `ai_classified` keeps its current meaning. It is not reinterpreted.

### Invariants (expand)

6. `CHECK (amount > 0)`. If the measured data has violating rows, add it `NOT VALID` and validate it after those rows are handled.
7. A trigger rejects a `category_id` whose `applies_to` is neither the transaction `type` nor `both`, on insert and on update of `category_id`.
8. A trigger guards the classification columns:
   - on insert, the status must be `ai` or `fallback`, with the reason rule of requirement 2;
   - on update of `category_id`, it derives the manual state: `classification_status = 'manual'`, reason null, `ai_model` null, `ai_classified = false`, `ai_provider` null;
   - any direct change of `classification_status`, `classification_reason` or `ai_model` by a client role is rejected.
9. During this stage the update of `ai_classified` and `ai_provider` by the owner still works, because the running code still writes them.
10. `DELETE` on `transactions` is revoked from `authenticated`.

### Privileges (expand)

11. Revoke all privileges on the `public` tables and functions from `anon`, `authenticated` and `PUBLIC`, then grant exactly the matrix below. Set default privileges so that new objects in `public` start with none. Revoke `EXECUTE` on functions from `PUBLIC` by default.
12. Fix `search_path` on `ping()` and on `set_updated_at()`.

| Object | `anon` | `authenticated` | `PUBLIC` |
| --- | --- | --- | --- |
| schema `public` | usage | usage | none |
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

- New SQLSTATE values raised by the triggers (draft, final values in the plan): category does not apply to the type; classification columns cannot be changed directly. The API maps them in spec 005, together with `42501` (insufficient privilege) and `23514` (check violation).
- The provenance written at creation is recorded by the API and is not verified by the database. The README states this limit.

## Edge cases

- Concurrent inserts during the expand migration: the migration runs in one transaction and takes the locks it needs; the plan lists them.
- A reclassification to a category that does not apply to the type is rejected by the trigger even if the API check is removed.
- Updating `amount`, `type` or `description` is not an API feature. After the contract stage the client roles cannot do it either.

## Acceptance criteria

- **AC-1.** The three columns exist with their checks, and invalid values are rejected.
  - Test: `supabase/tests/database/003-classification-columns.test.sql` (AC-1).
- **AC-2.** After the expand migration every pre-existing row has a non-null status according to the mapping.
  - Test: CI step "Migration backfill check", which applies the earlier migrations, inserts sample rows, applies the new migration and asserts (AC-2).
- **AC-3.** A zero or negative amount is rejected with `23514`. Rows that violated it before are handled as the measured data requires.
  - Test: `supabase/tests/database/004-amount-check.test.sql` (AC-3).
- **AC-4.** A category that does not apply to the type is rejected on insert and on update of `category_id`; `both` is accepted.
  - Test: `supabase/tests/database/005-category-type.test.sql` (AC-4).
- **AC-5.** An update of `category_id` derives the manual state and clears the provenance. A direct change of the classification columns is rejected.
  - Test: `supabase/tests/database/006-classification-transitions.test.sql` (AC-5).
- **AC-6.** At creation, a fallback without a reason and a reason without a fallback are rejected. A forged but well-formed provenance at creation is accepted, and the test documents that declared limit.
  - Test: `supabase/tests/database/006-classification-transitions.test.sql` (AC-6).
- **AC-7.** The privilege catalog matches the matrix for `anon`, `authenticated` and `PUBLIC`, at table, column and function level.
  - Test: `supabase/tests/database/002-privileges.test.sql` using `table_privs_are`, `column_privs_are` and `function_privs_are` (AC-7).
- **AC-8.** The owner cannot delete a transaction (`42501`).
  - Test: `supabase/tests/database/002-privileges.test.sql` (AC-8).
- **AC-9.** `ping()` is executable by `anon` and by no one else; `ping()` and `set_updated_at()` have a fixed `search_path`.
  - Test: `supabase/tests/database/002-privileges.test.sql` (AC-9).
- **AC-10.** The summary function is invoker, stable, with an empty `search_path`; it is executable by `authenticated` only; one user does not see another user's rows; sums are exact.
  - Test: `supabase/tests/database/007-summary-function.test.sql` (AC-10).
- **AC-11.** After the contract stage a client role can update only `category_id`, `classification_status` is `NOT NULL`, and no row has a null status.
  - Test: `supabase/tests/database/002-privileges.test.sql` and `006-classification-transitions.test.sql`, contract variants (AC-11).
- **AC-12.** Changes of password, e-mail and phone of the demo user are rejected by the trigger, or the regeneration is recorded.
  - Test: `supabase/tests/database/008-demo-identity.test.sql` (AC-12), skipped with a recorded reason if the platform does not allow the trigger.
- **AC-13.** The differences between the local catalog and the measured hosted catalog are listed and explained.
  - Test: reviewed in the pull request of the expand stage (AC-13).

## Out of scope

The API code that uses the new columns (spec 004), the error mapping (spec 005) and the use of the summary function (spec 006). Moving the demo account to another authentication method.

## Order

Expand after spec 002. Contract after the code of specs 004 and 005 is deployed and verified.
