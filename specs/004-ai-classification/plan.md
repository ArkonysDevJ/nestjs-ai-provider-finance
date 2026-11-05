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

- The Gemini adapter hides the SDK behind a small `GeminiClient` interface with one `generate` method. The SDK is wrapped in one file that is excluded from unit tests by design, and is covered by the live check.
- Default timeout 10000 ms, set by `AI_TIMEOUT_MS`. It stays under the platform limit with room for the database work.
- Error classification looks at an HTTP status when present, then at the SDK error code, then at the error name for timeouts.
- Lazy import uses a dynamic `import()` inside `LocalProvider`, so a production image without dev dependencies never loads the SDK.
- Persisting `ai_classified = true` on a fallback keeps the old meaning. Readers use `classification_status`.

## Risks

- The new SDK may expose the served model differently; the plan falls back to the requested model.
- Moving the SDK to dev dependencies must not break the image. The image build in CI is the check.
- The prompt is unchanged, so the real answer quality is unchanged. The live check with balance confirms it.
