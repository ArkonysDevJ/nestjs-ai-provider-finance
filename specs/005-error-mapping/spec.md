# Spec 005: error mapping

Status: draft, waiting for review.

## Goal

HTTP errors are predictable. No raw database or auth message reaches a client. Token errors from the REST layer become 401, with one retry for a clock-skew case. The errors that the new database rules produce have their own status codes.

## Current state

- `TransactionsService.mapSupabaseError` maps `23505` and `23503` to 409 and returns every other error as 500 with the raw message.
- A real run returned `500 "JWT issued at future"` twice in three hours, right after a login: the REST layer rejected a token issued a moment earlier. The API forwarded the message as a 500.
- `CreateTransactionDto` requires a positive number for `amount` but sets no upper bound and no decimal limit. The column is `numeric(12,2)`.
- Reclassification ignores the error of its category lookup.
- `CategoriesService.findAll` throws the raw error object.

## Requirements

1. `amount` has an upper bound equal to the largest value of `numeric(12,2)` and at most two decimals. Invalid values are 400.
2. No message from Postgres, the REST layer or Auth reaches the response body. The response carries a stable generic message. The detail goes to the server log, without secrets.
3. REST-layer token errors (expired, invalid, or issued in the future) become 401. For "issued in the future", the call is retried at most once after a short delay before it becomes 401.
4. Mapping table:
   - `23505` and `23503`: 409;
   - `23514` (check violation) and `22P02` (invalid text representation): 400;
   - `22023` (invalid parameter value, such as an invalid month in the summary function): 400;
   - `42501` (insufficient privilege): 403;
   - the category-does-not-apply trigger error: 400;
   - the classification-columns trigger error: 403;
   - anything else: 500 with the generic message.
5. Every Supabase call in `TransactionsService` and `CategoriesService` goes through the same mapping. Errors of lookups are never ignored.
6. The mapping lives in one module that the services share.

## Contracts

- Error body: `{ statusCode, message, error }` as the framework produces it, with a generic `message` for unmapped errors.
- Status mapping: the table in requirement 4.
- The retry is internal and invisible to clients.

## Edge cases

- The retry must not repeat a write that may already have happened. It applies to reads and to the token check only; a write that fails with a token error is not retried.
- An unknown error code is a 500 with the generic message, never a 200 and never a raw message.
- The generic 500 body does not reveal whether the failure came from the database or from the network.

## Acceptance criteria

- **AC-1.** `amount` above the bound or with more than two decimals is rejected with 400.
  - Test: `apps/api/src/transactions/dto/create-transaction.dto.spec.ts` (AC-1).
- **AC-2.** No raw backend message appears in any error response.
  - Test: `apps/api/src/common/errors/map-error.spec.ts` (AC-2).
- **AC-3.** Token errors map to 401. "Issued in the future" is retried once for reads and then becomes 401; writes are not retried.
  - Test: `map-error.spec.ts` and `transactions.service.spec.ts` (AC-3).
- **AC-4.** Each code in the mapping table maps to its status.
  - Test: `map-error.spec.ts`, one case per row (AC-4).
- **AC-5.** Lookups no longer ignore errors; a failing lookup becomes a mapped error.
  - Test: `transactions.service.spec.ts` (AC-5).
- **AC-6.** Against the local stack, an invalid amount returns 400 and a write rejected by the database returns the mapped status.
  - Test: Bruno requests `transactions/05-invalid-amount.bru` and `transactions/06-rejected-by-database.bru` (AC-6).

## Out of scope

Changes to the database (spec 003). Pagination and the summary (spec 006).

## Order

After spec 004, before the contract stage of spec 003 (the contract stage produces `42501`).
