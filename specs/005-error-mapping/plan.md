# Plan: spec 005

## Files

- `apps/api/src/common/errors/map-error.ts` and a Nest exception filter or helper that uses it.
- `apps/api/src/transactions/dto/create-transaction.dto.ts`.
- `apps/api/src/transactions/transactions.service.ts`, `apps/api/src/categories/categories.service.ts`.
- `bruno/nestjs-ai-provider-finance/transactions/`: two new requests.
- Tests as named in the spec.

## Decisions

- One function maps an error object to an HTTP exception. The services call it and never build exceptions from raw messages.
- The retry wrapper takes an operation and a flag that says whether it is safe to repeat. Only reads and the token check pass `true`. The delay is short (a few hundred milliseconds) and fixed.
- The upper bound of `amount` is written once as a constant next to the DTO and tied to the column precision by a test that reads the migrations.
- Trigger error codes are the ones defined by spec 003. If spec 003 changes them, this spec changes in the same pull request.

## Risks

- A new database error code that the table does not list becomes a generic 500. The tests include one such case.
- Hiding messages makes debugging harder. The server log keeps the detail.
