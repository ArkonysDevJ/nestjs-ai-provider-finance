# Plan: spec 006

## Files

- `apps/api/src/transactions/transactions.service.ts`: call the function with `rpc`; page the list.
- `apps/api/src/transactions/transactions.controller.ts` and a query DTO for `limit` and `offset`.
- `apps/api/src/transactions/dto/summary-response.dto.ts`: totals typed as strings.
- `apps/web/src/lib/api.ts`, `apps/web/src/lib/money.ts`, and the components that show totals.
- `bruno/.../transactions/`: a paging request.
- Tests as named in the spec.

## Decisions

- Decimal text is parsed and formatted by integer arithmetic on cents in the web app, so no float is involved.
- The default `limit` of 100 keeps the demo list on one page. The web app still pages for correctness.
- The function returns one JSON document, so the API does not reshape rows.
- The local test of the row cap uses the same `max_rows` value as the hosted project, taken from the configuration measured for spec 001.

## Risks

- The window between the API and web deployments: the web app accepts both shapes, which is why the order of merges matters. The web app goes first: the one deployed today calls `toFixed` on the totals, which fails on a string, so the API must not reach production before the new web app does.
- A very large number of pages for a large user: acceptable for this demo, and documented.

## What changed while implementing

- **The function takes the month explicitly.** The API validates the month (`YYYY-MM`) and passes it as `p_month`, so the default month is decided in one place; the function's own default (the current month of the database) is not used. A month rejected by the function itself (`22023`) maps to 400.
- **The summary reads no row.** `getSummary` makes one `rpc` call and returns the document as it comes, so the service tests can assert both the call and that no row is read.
- **The row-cap test needs a stack.** It runs in its own CI step, after the Bruno requests, and is skipped when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are not set to a loopback address, so `npm test` stays hermetic. It inserts `max_rows + 100` rows for a new user, shows that a plain read is cut at `max_rows`, and checks the exact totals through the function.
- **The test rows stay in the local database.** The client roles cannot delete, and the stack is discarded after the run.
- **Unknown query parameters are rejected.** The global validation pipe forbids parameters that are not listed, so `GET /v1/transactions` now answers 400 to any parameter other than `limit` and `offset`.
- **The test of the paging module is `paging.test.ts`.** The spec named `api.test.ts`, but `api.ts` imports the Supabase client and the i18n setup, which do not load outside the browser, so the pure module is tested instead.
- **The order of the merges was reversed.** The web app went first, because the one deployed before this spec called `toFixed` on the totals, which fails on a string.
- **A cached web app can survive a deployment.** After the API deployment, the first load in the browser still ran the previous web app and the dashboard stayed blank; a reload fixed it. A user with a long-lived tab can see this once.
