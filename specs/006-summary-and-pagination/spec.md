# Spec 006: summary and pagination

Status: in progress. The API part is implemented (AC-1 to AC-4); the web app part (AC-5 and AC-6) and the live check (AC-7) are still to do.

## Goal

The summary is exact to the cent whatever the number of rows, and listing transactions does not depend on the API row cap. Totals travel as decimal strings. The list is paged with a total order.

## Current state

- `getSummary` reads every transaction of the user in one query and adds the amounts in JavaScript with floating point. The REST layer caps the rows of a response (`max_rows`), so a user with more rows than the cap gets a truncated, wrong summary.
- `findAll` returns every row, ordered only by `occurred_at`. Rows with the same date have no stable order.
- The web app expects totals as numbers.

## Requirements

1. The API computes the summary by calling the SQL function created by spec 003. It does no arithmetic on amounts.
2. Totals (`totalExpense`, `totalIncome`) are decimal strings, for example `"1234.50"`. `transactionCount` stays a number. Field names and the month validation (`YYYY-MM`) stay as they are.
3. `GET /v1/transactions` accepts `limit` (1 to 200, default 100) and `offset` (0 or more). The order is total: `occurred_at` descending, then `created_at` descending, then `id` descending. The response stays a JSON array.
4. The list uses `.range()` with that order. Invalid `limit` or `offset` values are 400.
5. The web app accepts a total as a number or as a string during the window in which the API and the web app are deployed at different times. It formats decimal strings without floating point arithmetic.
6. The web app pages through the list until a page is shorter than `limit`.

## Contracts

- `GET /v1/transactions?limit=&offset=` returns a JSON array.
- `GET /v1/transactions/summary?month=YYYY-MM` returns `{ selectedMonth, byCategory[], byMonth[] }`. `totalExpense` and `totalIncome` are decimal strings; `transactionCount` is a number.

## Edge cases

- A month without rows returns empty `byCategory` and a `byMonth` that omits it.
- Two categories with the same expense total sort by category name, so the order is stable.
- The summary function runs as the caller, so one user never sees another user's rows.

## Acceptance criteria

- **AC-1.** The summary is exact for more than 1000 rows.
  - Test: `supabase/tests/database/007-summary-function.test.sql` with 1200 rows (AC-1).
- **AC-2.** The summary is not truncated by the API row cap: with `max_rows` in `supabase/config.toml` equal to the hosted value, a user with more rows than the cap gets the exact totals through the REST layer.
  - Test: `apps/api/test/summary-max-rows.spec.ts` against the local stack, run by CI step "Summary row cap test" (AC-2).
- **AC-3.** The API returns totals as decimal strings and counts as numbers.
  - Test: `apps/api/src/transactions/transactions.service.spec.ts` (AC-3).
- **AC-4.** The list order is total and `limit` and `offset` are validated.
  - Test: `transactions.service.spec.ts` and Bruno request `transactions/07-list-paging.bru` (AC-4).
- **AC-5.** The web app shows correct totals for number and string inputs and does not use floating point to add amounts.
  - Test: `apps/web/src/lib/money.test.ts`, run by CI step "Web unit tests" (AC-5).
- **AC-6.** The web app loads every page of the list.
  - Test: `apps/web/src/lib/paging.test.ts`, run by CI step "Web unit tests" (AC-6).
- **AC-7.** After the merge, the web app shows the correct totals against the deployed API. Live check by the maintainer.
  - Test: manual check recorded in the pull request (AC-7).

## Out of scope

Changing the summary fields, adding filters, or caching.

## Order

After the contract stage of spec 003. It does not depend on specs 004 and 005 and can move earlier with the maintainer's approval.
