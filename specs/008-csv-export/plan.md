# Plan: spec 008

## Files

New:

- `apps/api/src/transactions/export/csv.ts`: a pure function that writes the CSV from rows, with the quoting of RFC 4180 and the protection against formulas. It has no dependency on Nest or Supabase.
- `apps/api/src/transactions/export/csv.spec.ts`.
- `apps/api/src/transactions/export/export.service.ts`: reads the pages with the client of the request and returns the text and the file name.
- `apps/api/src/transactions/export/export.service.spec.ts`: uses `test/support/fake-supabase.ts`.
- `bruno/nestjs-ai-provider-finance/transactions/09-export-csv.bru`, `10-export-invalid-month.bru` and `11-export-requires-token.bru`.

Changed:

- `apps/api/src/transactions/transactions.controller.ts`: the route `GET export`, before any route with a parameter.
- `apps/api/src/transactions/transactions.module.ts`: the provider of the export service.
- `apps/api/test/support/fake-supabase.ts`, only if a test needs it.
- This spec, `plan.md` and `tasks.md`.

Nothing else changes. In particular: no new dependency, no migration, no change to the workflows, the Dockerfile, `AGENTS.md` or the deployment files.

## Decisions

- The CSV writer is a pure function so that quoting and formulas are tested without a database.
- The pages are 500 rows, below `max_rows`, so one page is never cut by the REST layer, and a short page ends the loop.
- The order is the one of the list (spec 006), so the file and the screen agree.
- The amount is formatted from the number that the database returns, with two places; no amounts are added.
- The month check is the one of the summary: the format `YYYY-MM`, months 01 to 12.
- The whole file is built in memory. That is acceptable for a demo; a large export would be streamed, and that is out of scope.

## Risks

- A formula character at the start of a text field is the way a CSV carries an attack into a spreadsheet; requirement 5 is the control, and its test is the one to read first.
- The route has to be declared before `:id/reclassify`-style routes, or `export` is read as an id.
