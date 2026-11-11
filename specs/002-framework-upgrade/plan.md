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
| ------- | -------- | ------------ | ---- |

<!-- remaining-advisories:end -->

After the upgrade, nine advisories remained: eight through the MCP SDK and one in `fast-uri`. Spec 004 closed the first eight by moving the SDK to development dependencies (the production image installs neither it nor its dependencies), and a lockfile-only update of `fast-uri` to its patched versions closed the last one. No advisory remains, so the audit step is blocking. The step audits with `--omit=dev --omit=optional`, which is what the production image installs.

## Findings during the upgrade

- All NestJS 12 packages are ESM-only. The API therefore became an ES module: `"type": "module"`, `nodenext` module resolution, `.js` suffixes on relative imports (17 files), and Jest in ESM mode through `NODE_OPTIONS=--experimental-vm-modules`. This is forced by the upgrade, but it is larger than "changed imports, options, types" in requirement 5. No route, body, status code, header or variable changed.
- The change to ES modules also changed how the container starts: the runtime stage needs `apps/api/package.json` with `"type": "module"` next to `dist/`, and the process runs `node dist/main.js`. CI built the image and never ran it, so only the health check of the deploy exercised that start. Spec 009 adds a step that starts the image in CI with no network and checks that it answers.
- `@nestjs/throttler` has its own numbering (6.x). Version 6.7.1 declares `@nestjs/common` and `@nestjs/core` `^12.0.0` as peers, so it is the compatible line. AC-5 checks it by peer range, not by major number.
