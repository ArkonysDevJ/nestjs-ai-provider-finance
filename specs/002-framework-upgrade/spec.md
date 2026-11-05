# Spec 002: framework upgrade

Status: draft, waiting for review.

## Goal

Move the API from NestJS 11 to NestJS 12, with the Fastify version that the lockfile resolves for it. Close the dependency advisories that the upgrade closes. No behavior change.

## Current state

- `apps/api` depends on `@nestjs/common`, `@nestjs/core` and `@nestjs/platform-fastify` `^11.1.28`, and on `@nestjs/config`, `@nestjs/throttler` and `@nestjs/cli`.
- `npm audit --omit=dev` reports 11 advisories (4 moderate, 6 high, 1 critical) at the start of this work. Several come from `fastify` and `@nestjs/platform-fastify`.
- The audit step in CI is informational and always ends with status 0.

## Requirements

1. Upgrade the NestJS packages to the 12.x line and align `@nestjs/config`, `@nestjs/throttler` and `@nestjs/cli` to versions that support it.
2. The upgrade is its own pull request. It contains no other behavior change.
3. Record `npm audit --omit=dev` before and after in the pull request.
4. If the advisories that remain are only the ones that spec 004 removes, switch the audit step to blocking. Otherwise list each remaining advisory with the spec that closes it, and leave the step informational.
5. Fix only what the upgrade forces (changed imports, options, types). Do not refactor.

## Edge cases

- The throttler guard, the Fastify adapter and the `ValidationPipe` options must behave the same. The specs that cover them (007 for the limiter) are written against the behavior of the current code.
- If NestJS 12 changes a default that alters an HTTP response, that is a behavior change: stop and ask the maintainer.

## Acceptance criteria

- **AC-1.** The test suites defined by spec 001 pass unchanged on NestJS 12.
  - Test: CI (unit tests, database tests, Bruno).
- **AC-2.** The API image builds and, after deployment, `GET /v1/health` answers 200.
  - Test: CI image build; the deploy workflow health check.
- **AC-3.** The HTTP contract is unchanged: the Bruno collection passes without edits to its requests or assertions.
  - Test: CI step "Integration tests (Bruno)".
- **AC-4.** The pull request shows the audit output before and after. The audit step is blocking if and only if no advisory remains except those listed for spec 004.
  - Test: `.github/workflows/ci.yml` audit step; `apps/api/test/audit-policy.spec.ts` (AC-4) checks that the blocking setting matches the recorded list of remaining advisories.
- **AC-5.** `package.json` and the lockfile resolve every NestJS package to the 12.x line.
  - Test: `apps/api/test/nest-versions.spec.ts` (AC-5).

## Out of scope

Replacing `@google/generative-ai` and moving the MCP SDK (spec 004). New features.

## Order

After spec 001, before the database expansion in spec 003.
