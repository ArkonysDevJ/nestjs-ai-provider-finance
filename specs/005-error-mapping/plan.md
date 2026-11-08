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

## What changed while implementing

- **Files.** The mapping is `apps/api/src/common/errors/map-error.ts` and the retry is `retry.ts` next to it. The services share them; `mapSupabaseError` is gone.
- **The generic messages** are fixed constants (`GENERIC_MESSAGES`), so the Bruno request can pin the exact text of a 409.
- **`PGRST300` is not a token error.** It means that the REST layer lacks its own signing secret, a fault of the service, so it is a 500 and not a 401. Codes `PGRST301`, `PGRST302` and `PGRST303`, or a message that names the JWT, are 401.
- **The retry waits 250 ms**, once, and only on a read whose error says the token was issued in the future. The services do not accept a delay, so a test of the retry through a service waits that time.
- **An already mapped exception passes through unchanged**, so a service can throw a domain error (not found, bad request) without it being remapped.
- **`TX003`** (the demo account guard) is not in the table: it is raised on the auth tables, which this API does not write. It would be a 500 with the generic message.
- **The response body for a validation error** still carries the messages of the validation pipe (for example, that `amount` may not have more than two decimals). Those describe the request, not the backend.
- **Not verified in CI:** this branch has no pull request, so the continuous integration did not run on it. The unit tests, the lint and the build ran locally. The two Bruno requests ran locally with the CI's own Bruno CLI against a stand-in server, to check that their assertions pass on the generic body and fail on a raw one; they have not run against the local stack.
