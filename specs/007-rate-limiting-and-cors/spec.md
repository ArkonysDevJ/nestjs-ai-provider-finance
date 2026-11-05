# Spec 007: rate limiting and CORS

Status: draft, waiting for review.

## Goal

The rate limit counts each client separately behind the Cloud Run proxy, cannot be evaded by forging forwarded headers, and keeps the per-user limit on creation. CORS fails closed: without a configured list of origins, no cross-origin request is allowed.

## Current state

- `ThrottlerModule.forRoot` is registered twice (in `AppModule`, 100 requests per 5 minutes, and in `TransactionsModule`, 20 per 5 minutes for `create-transaction`).
- The global `ThrottlerGuard` tracks by `req.ip`. Behind Cloud Run that is the proxy address, so every client shares one bucket, including `/v1/health`.
- A response from `/v1/health` already carries `x-ratelimit-*-create-transaction` headers with a counter that other clients have consumed.
- `UserThrottlerGuard` tracks by user id and falls back to `req.ip`.
- `main.ts` enables CORS with `origin: true`, which reflects any origin.

## Requirements

1. A rate limiter of the project's own runs before authentication. It tracks by the client address taken from `X-Forwarded-For`, counting from the right. `RATE_LIMIT_TRUSTED_PROXY_HOPS` says which entry from the right holds the client address: with the production value 1 it is the last entry, which the platform proxy writes. Entries to its left are written by the client and are ignored.
2. It is configured by four environment variables: `RATE_LIMIT_WINDOW_SECONDS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_HEALTH_MAX` and `RATE_LIMIT_TRUSTED_PROXY_HOPS`. If any of them is missing, the limiter is inactive and the application logs one line at startup saying so. `service.yaml` sets all four.
3. `/v1/health` has its own threshold, above the cadence of the uptime monitor and the keep-alive workflow.
4. The per-user limit on `POST /v1/transactions` stays (20 per 5 minutes), applied after authentication, tracked by user id.
5. There is exactly one `ThrottlerModule.forRoot` call in the application, and the global per-IP throttler guard is removed.
6. Exceeding a limit returns 429 with the `Retry-After` header.
7. CORS reads `CORS_ORIGINS`, a comma-separated list of exact origins. If the variable is missing or empty, no origin is allowed. `service.yaml` sets the web app origin. Allowed methods and headers are the ones the web app needs.

## Edge cases

- A client that puts extra entries at the left of `X-Forwarded-For` does not change its tracked address.
- A request without `X-Forwarded-For` (local development) is tracked by the socket address.
- Two clients behind the proxy do not share a bucket.
- Preview deployments of the web app are not allowed unless their origin is listed.

## Acceptance criteria

- **AC-1.** Forged leftmost `X-Forwarded-For` entries do not change the tracked address.
  - Test: `apps/api/src/common/guards/rate-limit.guard.spec.ts` (AC-1).
- **AC-2.** Two clients with different last entries have separate buckets; one reaching the limit does not block the other.
  - Test: `rate-limit.guard.spec.ts` (AC-2).
- **AC-3.** `/v1/health` uses its own threshold and answers 200 at the cadence of the monitor.
  - Test: `rate-limit.guard.spec.ts` (AC-3).
- **AC-4.** The per-user creation limit still applies and counts by user id, after authentication.
  - Test: `apps/api/src/transactions/transactions.controller.spec.ts` (AC-4).
- **AC-5.** The application has one `ThrottlerModule.forRoot` and no global per-IP throttler guard.
  - Test: `apps/api/test/modules.spec.ts` (AC-5).
- **AC-6.** Exceeding a limit returns 429 with `Retry-After`.
  - Test: `rate-limit.guard.spec.ts` (AC-6).
- **AC-7.** With the four variables missing, the limiter is inactive and one startup log line says so.
  - Test: `rate-limit.guard.spec.ts` (AC-7).
- **AC-8.** An origin that is not listed gets no CORS headers; with no variable, no origin is allowed; a listed origin is allowed.
  - Test: `apps/api/src/cors.spec.ts` (AC-8).
- **AC-9.** In Cloud Run, the address that the service sees for a client is measured and recorded, to confirm the hop count. Live check by the maintainer.
  - Test: manual check recorded in the pull request (AC-9).

## Out of scope

Distributed rate limiting across instances (the counters are per instance and reset on restart, as documented). Authentication changes.

## Order

Independent of the other specs after spec 002. It can move earlier with the maintainer's approval.
