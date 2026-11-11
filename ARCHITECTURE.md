# Architecture

How the system is put together, and why. The commands are in `AGENTS.md`, the behavior of each change is in `specs/`, and the setup of the cloud project is in `apps/api/deploy/RUNBOOK-SETUP.md`. This file describes the repository as it is on `main`.

## What it is

A personal finance tracker that demonstrates one pattern: an `AIProvider` port with two implementations (Gemini in production, a local model in development), chosen by an environment variable, with the provider and the model recorded on each transaction. The rest of the system exists so that the pattern is exercised under real conditions: authentication, per-user data isolation, a deployed API and a deployed web app.

## Components

```
 browser ──► web app (React + Vite, Vercel)
                │  Bearer token of the signed-in user
                ▼
            API (NestJS 12 on Fastify, ES modules, Cloud Run)
                │  the same token, one Supabase client per request
                ├──► Supabase (Postgres 17, Auth, PostgREST)
                └──► AI provider: Gemini API (production)
                                  or a local MCP server (development only)
```

| Part | Where | What it does |
| --- | --- | --- |
| Web app | `apps/web` | Sign-in with Supabase Auth, the dashboard, the transaction list and the form. It reads money as decimal text and loads the list page by page (`src/lib/money.ts`, `paging.ts`). |
| API | `apps/api` | Validates the token, classifies a new transaction with the active provider, stores it, serves the list and the summary. It acts with the user's token, never with an admin key. |
| Database | `supabase/` | The schema, the rules that the database enforces on its own, the privileges, the summary function, and their tests. |
| Local classifier | `finance-classifier-mcp/` | A Python MCP server on Ollama that the local provider calls. Development only: the API refuses to start with it when `NODE_ENV` is `production`. |
| HTTP tests | `bruno/` | A request collection that runs in CI against the local stack. |

## The API

- **Modules.** `transactions`, `categories`, `health`, and `ai`. `AiModule` is the only place that selects a provider; the transaction service depends on the `AIProvider` port and not on an SDK.
- **Authentication.** `SupabaseAuthGuard` validates the bearer token and puts the user and a Supabase client scoped to that token on the request. Every query then runs as that user, so Row Level Security is the barrier.
- **Errors.** Every error from Supabase goes through one function, `mapBackendError`, which turns it into an HTTP exception with a generic message and logs the detail. A response never carries a message of the database, the REST layer or Auth. Reads go through `readWithRetry`, which retries once when the token is refused for being issued a moment ahead of the server's clock; writes are never retried.
- **The summary and the list.** The summary is computed by a database function and returned as one document, with the totals as decimal strings, so it is exact whatever the number of rows. The list is paged with `limit` and `offset` in a total order (date, creation time, id).
- **Rate limiting and CORS.** A limiter counts requests per client address and the creation of transactions is limited per user; CORS allows only the origins that are listed. See `specs/007-rate-limiting-and-cors`.

### The AI provider

`classify` returns one of two results. `ai` carries the category and the model that produced it. `fallback` carries the category `Otros`, the model that was asked for, and a reason: `provider_error`, `timeout`, `quota_exceeded` or `invalid_output`. A provider failure is therefore recorded as a fallback and never as a classification. The answer is accepted only if it is exactly one of the categories allowed for the transaction type; anything else is `invalid_output`, which also bounds prompt injection through the description.

The Gemini provider enforces its own timeout on top of the SDK's, and its model comes from `GEMINI_MODEL`, a required exact name (a `-latest` alias is rejected at startup). The settings are read and validated once, in `ai/config.ts`: an unknown provider, a missing model or `local` in production stops the startup.

## The database

Postgres 17 on Supabase. Two tables, `categories` (a fixed catalog) and `transactions`, both with Row Level Security enabled and forced.

**Rules the database enforces on its own** (migrations 006 and 007, tested with pgTAP):

- `amount` is positive.
- A category must apply to the transaction type, or to both.
- A classification state (`classification_status`, `classification_reason`, `ai_model`) that a client cannot edit. A change of category derives the manual state and clears the provenance; a request that names the category a transaction already has changes nothing, because the category did not change.
- The identity of the demo account (its password, e-mail and phone) cannot change.

**Privileges are explicit.** The client roles can read the catalog, read and insert their own transactions, and update only `category_id`. There is no `DELETE` privilege and no delete endpoint, so rows are removed only by the maintainer from the SQL editor. `anon` can call only the health ping. New objects in `public` start with no privileges. One limit remains: the migration role cannot change the default privileges of the platform role `supabase_admin`, so after every migration applied to the hosted project the grants of `public` are compared with the intended matrix (runbook, section 14).

**Provenance is declared, not verified.** The provider and the model of a classification are written by the API at creation. A client with direct access to the database API could insert a well-formed but false provenance; the database rejects malformed ones, and a test documents the limit.

### Migrations: expand, then contract

A change that the running code depends on ships in two stages around the code. The expand migration adds what is new and removes nothing that the running code still uses. After the code that writes the new data is deployed and verified, the contract migration tightens: it fills what is still empty, makes the column required, and removes the privileges that the new code no longer needs. A migration that already exists is never edited. The maintainer applies migrations to the hosted project; the repository never does.

## Delivery

- **Pull requests.** Two jobs run on every pull request. `ci` builds and checks the code from a clean checkout: lint, format, build, unit tests, acceptance-criteria coverage, the database tests (pgTAP) and the HTTP tests (Bruno) against a local Supabase stack, the container image, which is also started with no network to check that it boots and answers, the data steps of the migrations, and the audit of the production dependencies. It touches no hosted service: the API runs with the local provider against a fake classifier on loopback. `guard` checks who wrote the commits and what the commit messages, the pull request text and the versioned files contain, and runs a secret scan. Both are required checks on `main`.
- **Deployment.** The deploy workflow runs after `ci` finishes on a commit that reached `main`. It builds that commit, publishes the image and deploys it to Cloud Run by digest, with Workload Identity Federation and no key file. An older commit never replaces a newer one. The service runs with at most two instances. Merging the web app deploys it to Vercel.
- **Keep-alive.** A scheduled workflow calls the health endpoint every two days, which runs a database function, so the free-tier project is never idle long enough to pause.
- **Secrets.** The Gemini key and the Supabase publishable key live in Secret Manager and are read at a pinned version, so rotating a key is a deployment.

## Tests, by layer

| Layer | What it covers | Where |
| --- | --- | --- |
| Unit | Services, providers, the error mapping, DTOs, the limiter, the web modules for money and paging, and policy checks on dependencies and configuration. No network. | `apps/api/src`, `apps/api/test`, `apps/web/src/lib` |
| Database | Isolation between users, privileges, constraints, triggers, the summary function, and the data steps of the migrations. | `supabase/tests/database`, `scripts/test-migration-backfill.sh` |
| HTTP | The API and the REST layer of Supabase against a local stack. | `bruno/` |
| Criteria | Every acceptance criterion of an implemented spec is cited by a test that runs in CI. | `scripts/check-ac-coverage.mjs` |

## How changes are made

One folder per change in `specs/`, with `spec.md` (what and why, with numbered acceptance criteria), `plan.md` (how) and `tasks.md` (the steps). The specs are living documents: a change of behavior updates its spec in the same pull request, and a spec is marked implemented only when every criterion has a test that cites it or a recorded manual check.

## What it does not do

- It does not limit the creation of accounts: signup is self-service, directly against Supabase Auth, and does not go through the API.
- Its rate-limit counters live in memory and per instance, so they start again with each instance.
- It does not protect the demo's data: the demo credentials are public, and anyone who signs in can read and change the demo's transactions.
- It does not verify where a classification came from beyond what the API records at creation.
