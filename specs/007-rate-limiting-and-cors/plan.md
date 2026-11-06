# Plan: spec 007

## Files

- `apps/api/src/common/guards/rate-limit.guard.ts` and its module.
- `apps/api/src/app.module.ts`, `apps/api/src/transactions/transactions.module.ts`: a single `ThrottlerModule.forRoot`.
- `apps/api/src/common/guards/user-throttler.guard.ts`: track by user id, fall back to the extracted address.
- `apps/api/src/main.ts`: CORS from `CORS_ORIGINS`.
- `apps/api/deploy/service.yaml`: the four limiter variables and `CORS_ORIGINS`.
- `apps/api/.env.example`.
- Tests as named in the spec.

## Decisions

- The extraction function is pure and tested on its own. It takes the header value and the hop count and returns an address.
- Counters live in memory, per instance. A fixed window is enough for this project.
- The guard runs as the first guard, before authentication, so a flood does not reach the identity provider.
- Production values are the ones in `service.yaml`; the plan uses 60 seconds, 120 requests and 30 for health as starting points, to be tuned after the live measurement.

## Risks

- A wrong hop count makes every client look like the proxy again. The live measurement of the address that the service sees is the check.
- Per-instance counters mean the real limit scales with the number of instances (at most two).
