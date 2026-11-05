# Plan: spec 002

## Files

- `apps/api/package.json`, `package-lock.json`.
- Source files only where the upgrade forces a change.
- `.github/workflows/ci.yml`: the audit step, if it becomes blocking.

## Decisions

- Read the NestJS 12 migration notes before changing anything, and list in the pull request every change they force. The details of that release are not assumed by this plan.
- Upgrade in one commit for the framework packages and one for the tools (`@nestjs/cli`), so a failure points to the right layer.
- Keep `--omit=dev` semantics in the audit, because the production image installs only production dependencies.

## Risks

- A default changes silently. The Bruno suite and the unit suite are the net. The limiter and CORS specs add focused tests later.
- The throttler package lags the framework. If no compatible version exists, stop and ask the maintainer.
