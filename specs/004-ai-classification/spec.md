# Spec 004: AI classification

Status: implemented, not merged. The live check (AC-13) is the maintainer's and waits for the provider credits; the model name is set to `gemini-3.8-flash` in `service.yaml`, not yet verified by a successful call.

## Goal

Make the outcome of a classification explicit and testable. A provider failure is recorded as a fallback with its reason, never as a classification. The provider call has a timeout, the model is pinned, the SDK is supported, the local provider is development-only, and the whole thing is testable without network.

## Current state

- `AIProvider.classify` returns only `{ categoryName }`. Providers catch every error and return "Otros", so a failure, an unrecognized answer and a real "Otros" look the same.
- `TransactionsService.create` always stores `ai_classified = true` and the provider name.
- `GeminiProvider` calls `gemini-flash-latest` with `@google/generative-ai` (out of support) and has no timeout. It reads `GEMINI_API_KEY` in its constructor.
- `AiModule` builds the provider in an inline factory. `ai-provider.factory.ts` holds a second copy of the same selection logic that the module does not use.
- `LocalProvider` imports `@modelcontextprotocol/sdk` at load time. The SDK is a production dependency. The MCP server in `finance-classifier-mcp/server.py` is meant for the local machine.
- Reclassification updates `category_id`, `ai_classified` and `ai_provider`.
- A real run showed the provider returning HTTP 402 "prepayment credits are depleted"; the row was stored as "Otros", `gemini`, `ai_classified = true`.

## Requirements

### Port contract

1. `classify` returns a discriminated result:
   - `{ status: 'ai', categoryName, model }`
   - `{ status: 'fallback', categoryName: 'Otros', reason, model }`
   with `reason` in `provider_error`, `timeout`, `quota_exceeded`, `invalid_output`.
2. Providers never throw for provider errors. They map them:
   - HTTP 402, HTTP 429 and `RESOURCE_EXHAUSTED` map to `quota_exceeded`;
   - the call exceeding its timeout maps to `timeout`;
   - an answer that is not exactly one allowed category for the type maps to `invalid_output`;
   - any other error maps to `provider_error`.
3. A real answer of "Otros" is `status: 'ai'`. Only failures are `fallback`.
4. `model` is the model requested in `fallback`. In `ai` it is the model that served the answer when the SDK exposes it, and the requested model otherwise.

### Timeout and model

5. The provider call has an explicit timeout, set by an environment variable with a default well below the platform request timeout.
6. The model comes from a required environment variable when the provider is `gemini`. The `-latest` alias is not used. Startup fails with a clear message if it is missing.
7. `@google/genai` replaces `@google/generative-ai`.

### Persistence

8. Creation stores `classification_status`, `classification_reason` and `ai_model`, and keeps writing `ai_classified` and `ai_provider` as today.
9. Reclassification writes only `category_id`. The database derives the manual state (spec 003).

### Provider selection and the local provider

10. One place selects the provider from `AI_PROVIDER`. A value other than `gemini` or `local` stops startup. The provider that is not selected is never constructed.
11. `AI_PROVIDER=local` is for development only. Selecting it when `NODE_ENV` is `production` stops startup with a clear message. The local provider loads the MCP SDK lazily, only when selected.
12. `@modelcontextprotocol/sdk` moves to `devDependencies`. The production image installs without dev dependencies.
13. The MCP classifier server listens on `127.0.0.1` only.
14. The duplicate selection code is removed.

### Deployment configuration

15. `apps/api/deploy/service.yaml` gets the model variable. A change of secret version is not part of this spec.

### Tests

16. Two layers, both without network:
    - the service is tested against a fake `AIProvider` injected through the `AI_PROVIDER` token;
    - each provider is tested against a narrow interface of its own (for Gemini, a `generate` function that takes the prompt and the timeout and returns text and model). The SDK module is not mocked.
17. The provider tests cover at least these cases: an exact category; a category with different case or surrounding whitespace; unrecognized text; a quota error (402 and 429); a timeout; and any other error.

## Contracts

- Port: `classify(input)` returns `{ status: 'ai', categoryName, model }` or `{ status: 'fallback', categoryName: 'Otros', reason, model }`, with `reason` in `provider_error`, `timeout`, `quota_exceeded`, `invalid_output`.
- Environment variables: `AI_PROVIDER` (`gemini` or `local`), the model variable (required for `gemini`), `AI_TIMEOUT_MS`, `GEMINI_API_KEY`, `LOCAL_AI_ENDPOINT`.
- Persistence: the columns of spec 003; `ai_classified` and `ai_provider` keep their current meaning.

## Edge cases

- The category must belong to the allowed list of the transaction type. A category valid for the other type is `invalid_output`.
- Prompt injection through the description is bounded by the exact-match rule: only an allowed category name is accepted.
- The model name recorded in `fallback` is the requested one even if no request reached the provider.

## Acceptance criteria

- **AC-1.** A valid answer produces `status: 'ai'` with the category and the model.
  - Test: `apps/api/src/ai/gemini.provider.spec.ts` and `local.provider.spec.ts` (AC-1).
- **AC-2.** Text that is not exactly one allowed category produces `fallback` with `invalid_output`.
  - Test: `apps/api/src/ai/gemini.provider.spec.ts` and `apps/api/src/ai/local.provider.spec.ts` (AC-2).
- **AC-3.** Each failure kind maps as in requirement 2, and no provider error escapes as an exception.
  - Test: `apps/api/src/ai/gemini.provider.spec.ts` and `apps/api/src/ai/local.provider.spec.ts`, one case per reason (AC-3).
- **AC-4.** The timeout is applied to the call and its default is below the platform request timeout.
  - Test: `apps/api/src/ai/gemini.provider.spec.ts`, `apps/api/src/ai/local.provider.spec.ts` and `apps/api/src/ai/config.spec.ts` (AC-4).
- **AC-5.** Creation persists status, reason and model, keeps `ai_classified` and `ai_provider`, and never stores a fallback as `ai`.
  - Test: `apps/api/src/transactions/transactions.service.spec.ts` with a fake provider (AC-5).
- **AC-6.** Reclassification sends only `category_id`.
  - Test: `apps/api/src/transactions/transactions.service.spec.ts` (AC-6).
- **AC-7.** Provider selection: `gemini`, `local`, and an invalid value that stops startup; the unselected provider is never constructed.
  - Test: `apps/api/src/ai/ai.module.spec.ts` (AC-7).
- **AC-8.** Selecting `local` with `NODE_ENV=production` stops startup, and the MCP SDK is a dev dependency in the lockfile.
  - Test: `ai.module.spec.ts` and `apps/api/test/dependencies.spec.ts` (AC-8).
- **AC-9.** The MCP server binds `127.0.0.1`.
  - Test: `apps/api/test/dependencies.spec.ts`, which reads the source of the MCP server (AC-9).
- **AC-10.** A missing model variable stops startup when the provider is `gemini`; no source file uses a `-latest` alias; `service.yaml` sets the variable.
  - Test: `apps/api/src/ai/ai.module.spec.ts` and `apps/api/test/dependencies.spec.ts` (AC-10).
- **AC-11.** `@google/generative-ai` is gone from the lockfile and `@google/genai` is used.
  - Test: `apps/api/test/dependencies.spec.ts` (AC-11).
- **AC-12.** None of these tests uses the network.
  - Test: CI step "Unit tests", which runs with no key and no external host, as defined by spec 001 (AC-12).
- **AC-13.** Live check by the maintainer. Without Gemini balance: the stored row is `fallback` with `quota_exceeded` and the requested model. With balance: a real classification that is not "Otros" for an unambiguous description.
  - Test: manual check: the live check recorded in the pull request (AC-13).

## Out of scope

The error mapping of HTTP responses (spec 005). The database columns (spec 003). Changing the prompt.

## Order

After the expand stage of spec 003, before its contract stage.
