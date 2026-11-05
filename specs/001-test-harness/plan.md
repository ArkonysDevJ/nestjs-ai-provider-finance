# Plan: spec 001

## Files

- `apps/api/package.json`: scripts `test`, `lint`, `lint:fix`, `format`, `format:check`; dev dependencies for Jest, ts-jest, ESLint, typescript-eslint and Prettier.
- `apps/api/jest.config.ts`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore` (repository root for the last three).
- `apps/api/test/`: smoke test, hermetic CI test, Bruno environments test, `.prettierignore` test.
- `apps/api/test/support/fake-mcp-server.mjs` and its test.
- `supabase/config.toml`.
- `bruno/nestjs-ai-provider-finance/environments/`: new `local-stack.bru`; rename the current `local.bru` to `demo.bru`.
- `bruno/setup-local.sh`: creates the two local users through the sign-up endpoint.
- `.github/workflows/ci.yml`: new steps in the order of the spec. The job keeps the name `ci`.
- `scripts/check-ac-coverage.mjs`: reads every `specs/*/spec.md`, takes each `AC-n` and its `Test:` paths, and checks that each listed file exists and cites that `AC-n`; manual checks are skipped and printed.
- `AGENTS.md`: the commands table loses its "available after" caveat.

## Decisions

- Jest with ts-jest. The API compiles to CommonJS, so no ESM setup is needed.
- The fake MCP server uses the MCP SDK server classes, which are available as a dev dependency. It answers `classify_transaction` from a small keyword table, so Bruno assertions are deterministic. This avoids both a Gemini key and any change to production code.
- The CI starts the API with `NODE_ENV` set to `test`, because a later spec rejects the local provider in production.
- The CLI emits the local publishable key and URL. The workflow passes them to the API and to Bruno as environment variables for the run and masks them. They are local-only values.
- `max_rows` and the Postgres major version in `config.toml` come from the measured hosted values.
- ESLint uses the flat config with typescript-eslint recommended rules. Only rules that the existing code already satisfies are enabled, to keep the formatting pass free of logic changes. Anything else is a follow-up.

## Risks

- The fake MCP server depends on the SDK server API. A test pins its behavior.
- CI time grows. The database stack excludes unused services.
- Prettier may touch many files. The formatting commit is separate and reviewed for logic changes by comparing the compiled output.
