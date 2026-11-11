# Spec 008: export my transactions as CSV (practice)

Status: practice. It is written to try a coding agent on a clean clone, and it is not scheduled for `main`. Whatever the try produces is discarded.

## Goal

A signed-in user downloads their own transactions as a CSV file that opens correctly in a spreadsheet, that cannot run a formula in it, and that does not depend on the row cap of the REST layer.

## Current state

- There is no export. `GET /v1/transactions` returns a page of the list (spec 006), in a total order.
- Every read of Supabase goes through `readWithRetry` and every error through `mapBackendError`.
- The REST layer caps the rows of one response (`max_rows`, 1000).

## Requirements

1. `GET /v1/transactions/export` returns the transactions of the signed-in user as CSV. The optional query parameter `month=YYYY-MM` limits the file to the transactions whose `occurred_at` is in that month. Without it, the file has every transaction of the user.
2. The response has status 200, `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="transactions-all.csv"`, or `filename="transactions-YYYY-MM.csv"` when a month is given.
3. The columns are, in this order: `date`, `description`, `type`, `category`, `amount`, `classification`. The first line is the header row with those names. Then one line per transaction, in the order of the list: `occurred_at`, then `created_at`, then `id`, all descending.
   - `date` is `occurred_at` as `YYYY-MM-DD`.
   - `type` is `expense` or `income`.
   - `category` is the name of the category; it is empty if the transaction has none.
   - `amount` is a decimal with exactly two places and a dot, with no thousands separator and no exponent, for example `35.00` and `1234.50`.
   - `classification` is the `classification_status` of the transaction.
4. The file follows RFC 4180. Every line, the last one included, ends with CRLF. A field that contains a comma, a double quote, a carriage return or a line feed is wrapped in double quotes, and the double quotes inside it are doubled. There is no byte order mark.
5. A text field (`description` or `category`) whose first character is `=`, `+`, `-`, `@`, a tab or a carriage return is written with a single quote (`'`) before it, so that a spreadsheet does not read it as a formula. The quote is added before the RFC 4180 quoting.
6. The export is not capped by the REST layer: it reads the transactions in pages of 500, in the order of requirement 3, until a page is shorter than 500. For a user with more rows than `max_rows`, the file has every row.
7. An invalid month (not `YYYY-MM`, or a month outside 01 to 12) is a 400, before any read.
8. The export reads with the Supabase client of the request, that is, as the signed-in user, and takes no user id from the request, so Row Level Security isolates the rows. The route requires a valid token.
9. An error while reading is mapped by `mapBackendError`, and a response never carries a message of the database. A failure in a page after the first is an error, never a truncated file with status 200.
10. The existing routes keep working. The new route is declared so that `GET /v1/transactions/export` is not read as a transaction id.

## Contracts

- `GET /v1/transactions/export?month=YYYY-MM` returns CSV, as above.
- Nothing in the database, the other routes or the web app changes.

## Edge cases

- A user with no transactions (or none in the month) gets only the header row, with its CRLF.
- A description with commas, quotes, line breaks or accents (UTF-8) is written correctly.
- A description that starts with `=` becomes `'=...`; if it also contains a comma, the result is then quoted.
- A leading space before `=` is not a formula start for this rule: only the first character counts.

## Acceptance criteria

- **AC-1.** The response has status 200, the CSV content type and the attachment name of requirement 2, for the whole list and for a month.
  - Test: `apps/api/src/transactions/export/export.service.spec.ts` (the name of the file) and `bruno/nestjs-ai-provider-finance/transactions/09-export-csv.bru` (AC-1).
- **AC-2.** The header row and the columns are as in requirement 3, and the values are formatted as it says (date, type, category, amount with two places, classification).
  - Test: `apps/api/src/transactions/export/csv.spec.ts` (AC-2).
- **AC-3.** The lines follow the order of the list.
  - Test: `apps/api/src/transactions/export/export.service.spec.ts` (AC-3).
- **AC-4.** The file follows RFC 4180: CRLF on every line, quoting and doubled quotes, no byte order mark.
  - Test: `apps/api/src/transactions/export/csv.spec.ts` (AC-4).
- **AC-5.** A text field that starts with a formula character gets the single quote before it, and only the first character counts.
  - Test: `apps/api/src/transactions/export/csv.spec.ts` (AC-5).
- **AC-6.** The export reads in pages of 500 until a short page, and a user with 2300 rows gets all of them.
  - Test: `apps/api/src/transactions/export/export.service.spec.ts` (AC-6).
- **AC-7.** An invalid month is a 400 before any read.
  - Test: `apps/api/src/transactions/export/export.service.spec.ts` and `bruno/nestjs-ai-provider-finance/transactions/10-export-invalid-month.bru` (AC-7).
- **AC-8.** The export reads with the client of the request and takes no user id, and the route requires a token.
  - Test: `apps/api/src/transactions/export/export.service.spec.ts` and `bruno/nestjs-ai-provider-finance/transactions/11-export-requires-token.bru` (AC-8).
- **AC-9.** A read error is mapped without the message of the backend, and a failure after the first page is an error and not a short file.
  - Test: `apps/api/src/transactions/export/export.service.spec.ts` (AC-9).
- **AC-10.** The existing routes keep working with the new route in place.
  - Test: CI step "Integration tests (Bruno)" (AC-10).

## Out of scope

A button in the web app, other formats, a different set of columns, background jobs and e-mail delivery. Changing the database, `AGENTS.md`, the workflows or the deployment.
