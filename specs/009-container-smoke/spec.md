# Spec 009: smoke test of the container in CI

Status: in progress. The step is written and waits for its first runs in CI.

## Goal

A change that stops the API container from starting as an ES module is caught in the pull request, before the merge, and not by the health check of the deployment.

## Current state

- The API is an ES module since spec 002: `"type": "module"` in `apps/api/package.json`, `nodenext`, `.js` suffixes on relative imports. That changed how the process starts, not only how it is built.
- The runtime stage copies `apps/api/package.json`, which declares `"type": "module"`, and runs `node dist/main.js`. Node 24 would also run the code as an ES module if the manifest were missing, because it detects the module syntax and only prints a warning (checked, see the plan). It cannot if the manifest says otherwise: with `"type": "commonjs"` the process stops at the first `import`. A missing dependency or a wrong entry file stops it too.
- `ci` builds the image (`docker build -t ai-finance-api:ci .`) and does not run it. The first run of the container is the health check of the deploy workflow, after the commit reached `main`.
- In production the container runs as an ES module on Cloud Run and answers its health check, so the risk is not an open failure but a late one.

## Requirements

1. After the existing step that builds the image, `ci` starts that image as a container.
2. The container has no network. The database address is a loopback port where nothing listens, every key is a placeholder, and no variable names a host outside the container. Nothing in the step can reach the hosted project or any external service.
3. The step waits for the process to answer HTTP, for at most 30 seconds.
4. It checks two routes from inside the container: a route that needs a token answers `401`, and `/v1/health` answers `503`, because there is no database. What is checked is that the process started and answers, not the database.
5. If the container stops, does not answer in time, or answers something else, the step fails and prints the last lines of the container logs. It never prints the environment of the container.
6. The container is removed when the step ends, whether it passed or failed.
7. The step is shown to fail when the ES module start is broken, with a run on a branch that is not merged.
8. The Dockerfile and the code of the API do not change.

## Contracts

- No route, variable, image or deployment changes. The only change is a step in `.github/workflows/ci.yml` and a test that keeps its guarantees in place.

## Edge cases

- The process is slow to start on a busy runner: the 30 seconds leave room, and the step answers as soon as the process does.
- The health route answers `503` for any reason that is not the database being down, such as an error in its own code. The step cannot tell them apart and does not try: the unit tests cover the route.
- The `401` comes from the guard, which runs before any query, so it shows that the server routes and the guard works, not that the database does.

## Acceptance criteria

- **AC-1.** The step runs after the image is built, runs that image with the network off, and names no host outside the container and no real key.
  - Test: `apps/api/test/ci-workflow.spec.ts` (AC-1).
- **AC-2.** The step waits at most 30 seconds, and passes only with `401` from a route that needs a token and `503` from `/v1/health`.
  - Test: `apps/api/test/ci-workflow.spec.ts` (AC-2) and CI step "Container smoke test" (AC-2).
- **AC-3.** A container that stops or does not answer fails the step and prints its logs, never its environment.
  - Test: `apps/api/test/ci-workflow.spec.ts` (AC-3).
- **AC-4.** The container is removed whether the step passes or fails.
  - Test: `apps/api/test/ci-workflow.spec.ts` (AC-4).
- **AC-5.** The step fails when the ES module start is broken. A run on a branch that is not merged, where the runtime stage declares the code as CommonJS (`"type": "commonjs"` in `apps/api/package.json`), is linked in the pull request.
  - Test: manual check recorded in the pull request (AC-5).

## Out of scope

Running the container against a database, calling a provider, testing routes beyond the two, and any change to the Dockerfile, the API code, the deploy workflow or the deployment files.
