# Spec 001: test harness

Status: draft, waiting for review.

## Goal

Make the project testable from a clean clone. Unit tests, database tests and HTTP tests run locally and in CI without touching the hosted project or any external service. Linting and formatting work. No behavior change.

## Current state

- `apps/api` has no test runner and no `npm test`.
- `supabase/` has migrations and a pgTAP suite (`001-user-isolation.test.sql`, 5 assertions) but no `config.toml`, so `supabase start` and `supabase test db` do not run from a clean clone.
- The Bruno environment `local` points to the local API but to the hosted Supabase project.
- The `lint` and `format` scripts call tools that are not declared as dependencies.
- CI builds the API, the web app and the image, and reports `npm audit --omit=dev` informationally.
- `GeminiProvider` requires `GEMINI_API_KEY` when it is constructed and calls Google at runtime.

## Requirements

1. Jest runs in `apps/api`. `npm test` works at the repository root and in the workspace. Tests sit next to the code as `*.spec.ts` or under `apps/api/test/`. They use no network.
2. `supabase/config.toml` exists. Its Postgres major version and its API `max_rows` match the hosted project (the hosted values are measured before this spec is implemented).
3. CI runs, in this order: install, lint, format check, build API and web, unit tests, start the local database stack, database tests, start the API against that stack, run the Bruno collection with the local environment, build the image, informational audit.
4. Bruno has two environments. `local-stack` points to the local stack and gets its keys at run time from the CLI output, so no key is stored. The environment that points to the hosted project is renamed `demo`. No environment named `local*` may point to a non-loopback host. CI uses only `local-stack`.
5. The API runs in CI without a Gemini key and without any call to Google. It runs with the local provider against a loopback fake MCP server kept under `apps/api/test/support/`.
6. ESLint and Prettier are configured. The scripts are `lint` (check only), `lint:fix`, `format` (write) and `format:check`.
7. The first formatting pass is its own commit, with no logic change. `.prettierignore` excludes `supabase/migrations/**` and `package-lock.json`.
8. The existing pgTAP suite keeps passing unchanged.
9. No workflow step contacts the hosted project or Google.

## Contracts

- Root scripts: `npm test`, `npm run lint`, `npm run lint:fix`, `npm run format` and `npm run format:check`.
- Bruno environments: `local-stack` (loopback only) and `demo` (hosted project).
- The CI job keeps the name `ci`.

## Edge cases

- Two Bruno requests sign in as two different demo users. Locally, the setup script creates them through the Auth sign-up endpoint with the publishable key. It never uses an admin key.
- The CI database stack excludes services the project does not use, to keep the job short.
- The Supabase CLI and the Bruno CLI are pinned by version. The Bruno CLI is installed outside the repository with install scripts disabled.

## Acceptance criteria

- **AC-1.** From a clean clone, `npm ci && npm test` passes with no environment variables and no network.
  - Test: CI step "Unit tests"; `apps/api/test/smoke.spec.ts` (AC-1).
- **AC-2.** `supabase start` and `supabase test db` run from a clean clone, and the existing 5 pgTAP assertions pass.
  - Test: CI step "Database tests".
- **AC-3.** The Bruno collection runs in CI against the local stack and passes with the same requests as before, apart from the environment names.
  - Test: CI step "Integration tests (Bruno)".
- **AC-4.** No workflow step contacts the hosted project or Google: the workflow contains no hosted project URL, no hosted key and no Gemini key, and the API runs with the local provider against a loopback server.
  - Test: `apps/api/test/hermetic-ci.spec.ts` (AC-4) reads `.github/workflows/ci.yml`.
- **AC-5.** No Bruno environment whose name starts with `local` points to a non-loopback host.
  - Test: `apps/api/test/bruno-environments.spec.ts` (AC-5).
- **AC-6.** `npm run lint` and `npm run format:check` pass from a clean clone and run in CI.
  - Test: CI steps "Lint" and "Format check".
- **AC-7.** `.prettierignore` excludes `supabase/migrations/**` and `package-lock.json`.
  - Test: `apps/api/test/prettierignore.spec.ts` (AC-7). The pull request also lists the files of the formatting commit.
- **AC-8.** The fake MCP server answers the classification tool deterministically and listens only on loopback.
  - Test: `apps/api/test/support/fake-mcp-server.spec.ts` (AC-8).
- **AC-9.** Every acceptance criterion of every spec is cited by name in at least one test file listed in its `Test:` line, and CI fails if one is not. Criteria marked as manual checks are exempt and listed by the script.
  - Test: `scripts/check-ac-coverage.mjs`, CI step "Acceptance criteria coverage" (AC-9).

## Out of scope

Any behavior change in the API. Tests of specific features (they belong to the specs of those features). Making the audit step blocking.

## Order

First in the sequence. Every later spec depends on it.
