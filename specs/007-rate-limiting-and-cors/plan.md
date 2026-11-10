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

## Starting values, and why

They are proposed for approval and are the ones in `apps/api/deploy/service.yaml`. The limiter counts per client address, in memory and per instance, and the service runs with at most two instances, so the real limit can be up to twice the number set.

| Variable | Value | Why |
| --- | --- | --- |
| `RATE_LIMIT_WINDOW_SECONDS` | 60 | A short fixed window: a client that goes over waits at most a minute (`Retry-After`), and the counters of a quiet client are dropped quickly. |
| `RATE_LIMIT_MAX` | 120 | One load of the web app makes about four calls (categories, the first page of the list, the summary), and a change of month makes one more. 120 per minute is about two calls per second: far above what a person does, and a script that loops exceeds it at once. A shared address (an office) with a handful of people stays below it. |
| `RATE_LIMIT_HEALTH_MAX` | 30 | The uptime monitor and the keep-alive workflow call `/v1/health` at most once every ten seconds, which is 6 per minute; 30 leaves five times that, so the monitor is never limited, and a loop on this open route is still bounded. |
| `RATE_LIMIT_TRUSTED_PROXY_HOPS` | 1 | Cloud Run puts one proxy in front of the service, which appends the client address to `X-Forwarded-For`. The live measurement below confirms it. A wrong value makes every client look like the proxy again. |

The per-user limit on `POST /transactions` stays as it is, 20 requests in 5 minutes. Each request is one call to the AI provider, so it allows at most 240 calls per hour for one user, and the prepaid balance of the provider is the ceiling above that. This spec does not change it.

CORS lists only the production origin of the web app. The preview deployments of the web app are not allowed; a preview that needs the API has to be added to `CORS_ORIGINS` on purpose.

## Measurement of the client address in Cloud Run

It confirms that the address the limiter counts by is the real client and not the proxy, and that the forged entries at the left of `X-Forwarded-For` change nothing. It runs after the change is deployed, from Cloud Shell, against the deployed API; nothing in it writes data.

1. Note the public address of Cloud Shell: `curl -s https://ifconfig.me`.
2. Check that the deployed revision has the five variables (`RATE_LIMIT_WINDOW_SECONDS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_HEALTH_MAX`, `RATE_LIMIT_TRUSTED_PROXY_HOPS`, `CORS_ORIGINS`). If a limiter variable is missing, the limiter is inactive and the probe below shows no `429`.
3. Forged entries must not give a new bucket. Send 40 requests to `/v1/health`, each with a different forged first entry, and read the status codes:
   `for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code} " -H "X-Forwarded-For: 9.9.9.$i" "$API/health"; done`
   With the proxy count right, the first 30 answer `200` and the rest `429` (the threshold of `/v1/health` is 30 in the window). If all 40 answer `200`, the address counted is not the real client: the hop count is wrong.
4. Another client must not be blocked. Within the same minute, send a few requests to `/v1/health` from another network (for example, from a computer outside Google Cloud): they answer `200` while step 3 is blocked.
5. The window must end. Wait 60 seconds and repeat step 3: the first 30 answer `200` again.
6. Read what Cloud Run recorded for the client: the `httpRequest.remoteIp` and the status of the requests of step 3, with `gcloud logging read` on the service `ai-finance-api`. The address must be the one of step 1, and the `429` must appear.

What to record: the address of step 1 (the last octet can be masked), the sequences of status codes of steps 3 to 5, the address and the statuses read in step 6, and the name of the revision. A result that differs from the expected ones is a reason to change the hop count in `service.yaml`, not the code.

## What changed while implementing

- **The tests of the throttler are read from the sources.** Jest cannot load `@nestjs/throttler`: the package is CommonJS and requires an ES module in a cycle, which Node 24 allows but Jest's runtime does not. The structure checks (one `ThrottlerModule.forRoot`, no global throttler guard, the guards of the creation route) read the source files, and the logic that counts by user or by address is a function of its own (`tracker.ts`) that is tested directly.
- **The CORS test goes through the framework.** It builds a small application with the same adapter and `enableCors` call as `main.ts`, so the headers tested are the ones the server sends.
- **Local development needs `CORS_ORIGINS`.** CORS is closed by default, so the web app in development needs its origin in `apps/api/.env` (`.env.example` lists it).
- **The limiter is inactive by omission in CI.** The workflow does not set the limiter variables, so the Bruno requests are not limited, and the application logs one line saying so.

