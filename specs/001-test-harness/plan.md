# Plan: spec 001

## Files

- `apps/api/package.json` and the root `package.json`: scripts `test`, `lint`, `lint:fix`, `format`, `format:check`; dev dependencies for Jest and ts-jest (API workspace) and for ESLint, typescript-eslint, `globals` and Prettier (root).
- `apps/api/tsconfig.build.json` (the build excludes tests; `nest-cli.json` points to it, so the compiled layout stays `dist/main.js`) and `apps/api/tsconfig.spec.json`.
- `apps/api/jest.config.cjs`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore` (repository root for the last three).
- `apps/api/test/`: smoke test, hermetic CI test, Bruno environments test, `.prettierignore` test.
- `apps/api/test/support/fake-mcp-server.cjs` and its test.
- `supabase/config.toml`.
- `bruno/nestjs-ai-provider-finance/environments/`: new `local-stack.bru`; rename the current `local.bru` to `demo.bru`.
- `bruno/setup-local.sh`: `users` creates the two local users through the sign-up endpoint; `fixtures` creates one transaction and prints the two ids that the reclassify request needs.
- `.github/workflows/ci.yml`: new steps in the order of the spec. The job keeps the name `ci`.
- `scripts/check-ac-coverage.mjs`: reads every `specs/*/spec.md`, takes each `AC-n` and its `Test:` paths, and checks that each listed file exists and cites that `AC-n`; manual checks are skipped and printed.
- `AGENTS.md`: the commands table loses its "available after" caveat.

## Decisions

- Jest with ts-jest. The API compiles to CommonJS, so no ESM setup is needed. ts-jest keeps type checking; its warning about the hybrid module kind is silenced by ignoring that diagnostic code.
- The fake MCP server uses the MCP SDK server classes, which are available as a dev dependency. It answers `classify_transaction` from a small keyword table, so Bruno assertions are deterministic. This avoids both a Gemini key and any change to production code.
- The CI starts the API with `NODE_ENV` set to `test`, because a later spec rejects the local provider in production.
- The CLI emits the local publishable key and URL. The workflow passes them to the API and to Bruno as environment variables for the run and masks them. They are local-only values.
- `max_rows` and the Postgres major version in `config.toml` come from the measured hosted values. Until they arrive the file carries the platform defaults, marked in comments as provisional.
- ESLint uses the flat config with typescript-eslint recommended rules, over `apps/api` only (the web app is not covered yet). The existing code satisfied them with one annotated exception (a signature that must match the base class). The Prettier pass is its own commit; the compiled JavaScript differs from the previous commit only by one line break.
- The mechanical formatting pass is exempt from the rule that asks to bump the version line of a changed file; the one file changed for a lint annotation does carry a version bump.
- `scripts/check-ac-coverage.mjs` enforces only the specs whose `Status:` line starts with "implemented". A test file that several specs list must cite its criteria as `NNN AC-n`.

## Risks

- The fake MCP server depends on the SDK server API. A test pins its behavior.
- CI time grows. The database stack excludes unused services.
- Prettier may touch many files. The formatting commit is separate and reviewed for logic changes by comparing the compiled output.
