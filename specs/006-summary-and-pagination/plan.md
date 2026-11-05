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

- The window between the API and web deployments: the web app accepts both shapes, which is why the order of merges matters (API first).
- A very large number of pages for a large user: acceptable for this demo, and documented.
