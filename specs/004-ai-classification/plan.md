# Plan: spec 004

## Files

- `apps/api/src/ai/ai-provider.interface.ts`: the result type, the reason type and the narrow client interfaces.
- `apps/api/src/ai/gemini.provider.ts`, `local.provider.ts`: mapping, timeout, lazy import.
- `apps/api/src/ai/ai.module.ts`: the single selection; delete `ai-provider.factory.ts`.
- `apps/api/src/ai/config.ts`: reads and validates `AI_TIMEOUT_MS` and the model variable.
- `apps/api/src/transactions/transactions.service.ts`: persistence and reclassification.
- `apps/api/package.json`, `package-lock.json`: SDK swap and dev dependency.
- `finance-classifier-mcp/server.py`: bind to loopback.
- `apps/api/deploy/service.yaml`: the model variable.
- `apps/api/.env.example`: the new variables with placeholder values.
- Tests as named in the spec.

## Decisions

- The Gemini adapter hides the SDK behind a small `GeminiClient` interface with one `generate` method. The adapter is transport only: it calls the SDK and returns the text and the model, or lets the raw error propagate. It is excluded from unit tests by design and is covered by the live check.
- The classification of errors (HTTP status, SDK error code, timeout) lives in `GeminiProvider`, not in the adapter, and is unit-tested with errors built with the shape of the SDK's own errors.
- The local provider is rejected when `NODE_ENV` is `production`, so the CI starts the API with a different value.
- Default timeout 10000 ms, set by `AI_TIMEOUT_MS`. It stays under the platform limit with room for the database work.
- Error classification looks at an HTTP status when present, then at the SDK error code, then at the error name for timeouts.
- Lazy import uses a dynamic `import()` inside `LocalProvider`, so a production image without dev dependencies never loads the SDK.
- Persisting `ai_classified = true` on a fallback keeps the old meaning. Readers use `classification_status`.

## Risks

- The new SDK may expose the served model differently; the plan falls back to the requested model.
- Moving the SDK to dev dependencies must not break the image. The image build in CI is the check.
- The prompt is unchanged, so the real answer quality is unchanged. The live check with balance confirms it.

## What changed while implementing

- **Names.** The model variable is `GEMINI_MODEL`. The new files are `classification.ts` (the exact-match parser, the timeout wrapper and the mapping of errors to reasons), `gemini.sdk-client.ts` and `local.mcp-client.ts` (the transport adapters) and `test/support/fake-supabase.ts` (a stand-in for the query builder that spec 005 reuses).
- **The local provider's model.** It has no configurable model, so the result carries the label `local-mcp`.
- **The timeout is enforced twice.** The provider wraps the call in its own timer and aborts a signal that it passes to the client, so a timeout is reported even if a client ignores the signal. The maximum accepted `AI_TIMEOUT_MS` is 50000.
- **A "-latest" value is rejected at startup**, in addition to a missing model.
- **The SDK as a development dependency is not enough for the audit.** `@google/genai` lists the MCP SDK as an optional peer, so the lockfile keeps one copy marked optional. The production image omits optional dependencies and does not install it, but `npm audit --omit=dev` still reported the advisories of its dependency tree. The audit step now uses `--omit=dev --omit=optional`, which is what the image installs. The one advisory left, in `fast-uri`, closed with a lockfile-only update to its patched versions (the same major versions).
- **The MCP SDK moved from 1.30.0 to 1.32.2** as a development dependency, because moving it re-resolved the range. The fake MCP server and its tests still pass.
- **The model name in `service.yaml` is `gemini-3.8-flash`, and a direct call verified it.** The maintainer listed the models of the project (`models.list`): `gemini-3.8-flash` is there with `generateContent`, and it is the latest flash version without a preview suffix. After the prepayment credits were restored, a direct call to it with the project key answered `ok` and reported `modelVersion` equal to `gemini-3.8-flash`. Production used the `gemini-flash-latest` alias until now, and nothing here says which model that alias resolved to, so pinning a name can change the model that serves the requests. Google retires versions: when classifications start to fall back with `provider_error`, check the name again. The live check of the whole path (AC-13) is still the maintainer's.
- **Reclassifying to the same category is an explicit no-op.** It is not a reclassification: the category does not change, so the classification stays as it was. The database derives the manual state only when `category_id` changes. The previous code wrote the manual state on every request, so a request that named the category the transaction already had marked it as manual; this behavior is kept on purpose and named here. The local test fixtures pick a different category for the reclassify request, since the fake classifier files the fixture transaction under the category the old fixtures used.
