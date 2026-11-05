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

## Recorded results

`npm audit --omit=dev` reports 11 advisories before the upgrade (4 moderate, 6 high, 1 critical) and 9 after (4 moderate, 4 high, 1 critical). The upgrade closed `fastify` and `@nestjs/platform-fastify`. The remaining ones, with the spec that closes each. The "closing spec" is inferred from the dependency path in `npm ls`; spec 004 confirms it when it runs.

<!-- remaining-advisories:start -->
| package | severity | closing spec | path |
| --- | --- | --- | --- |
| @modelcontextprotocol/sdk | high | 004 | direct |
| @hono/node-server | moderate | 004 | via the MCP SDK |
| hono | moderate | 004 | via the MCP SDK |
| body-parser | high | 004 | via the MCP SDK (express) |
| proxy-addr | critical | 004 | via the MCP SDK (express) |
| qs | moderate | 004 | via the MCP SDK (express) |
| ip-address | moderate | 004 | via the MCP SDK (express-rate-limit) |
| zod | high | 004 | via the MCP SDK |
| fast-uri | high | none | via ajv (MCP SDK, Nest CLI) and fastify |
<!-- remaining-advisories:end -->

`fast-uri` is also reached through Fastify and the Nest CLI, so spec 004 alone does not clearly close it. Because one advisory has no closing spec, the audit step stays informational (requirement 4).

## Findings during the upgrade

- All NestJS 12 packages are ESM-only. The API therefore became an ES module: `"type": "module"`, `nodenext` module resolution, `.js` suffixes on relative imports (17 files), and Jest in ESM mode through `NODE_OPTIONS=--experimental-vm-modules`. This is forced by the upgrade, but it is larger than "changed imports, options, types" in requirement 5. No route, body, status code, header or variable changed.
- `@nestjs/throttler` has its own numbering (6.x). Version 6.7.1 declares `@nestjs/common` and `@nestjs/core` `^12.0.0` as peers, so it is the compatible line. AC-5 checks it by peer range, not by major number.
