# Plan: spec 009

## Files

- `.github/workflows/ci.yml`: the step "Container smoke test", right after "Build the container image", and a line in the header comment. The comment of the build step no longer says that the image is not run.
- `apps/api/test/hermetic-ci.spec.ts`: the Gemini key check accepts only the placeholder (see Decisions). `specs/001-test-harness/spec.md` follows.
- `apps/api/test/ci-workflow.spec.ts` (new): reads `ci.yml` and checks what the step guarantees, so that removing the network restriction or a check fails a unit test.
- `specs/002-framework-upgrade/plan.md`: a line that records the change of start and points here.
- `ARCHITECTURE.md`: the description of the pull-request job mentions the container start.

Nothing else changes. The Dockerfile and the code of the API stay as they are.

## Decisions

- **No network at all.** The container runs with `--network none`, so it cannot reach the hosted project, Google or anything else, whatever the application tries. This is stronger than pointing the variables at placeholders, which is also done.
- **Probe from inside.** With no network there is no published port, so the step runs a small Node `fetch` against `127.0.0.1:3000` inside the container with `docker exec`. The image already has Node, and nothing is installed in it.
- **Two routes.** `/v1/categories` answers `401` because the guard runs before any query, and `/v1/health` answers `503` because it queries a database that is not there. Together they show that the server routes, the guard works and the health route handles its own error.
- **Placeholders that pass the startup checks.** The startup reads the Supabase address and the anon key, the Gemini key, and an exact Gemini model name (an alias is refused). All are fake; `CORS_ORIGINS` is a local origin.
- **The Gemini key name appears in the workflow, as a placeholder.** The image runs with `NODE_ENV=production`, where the local provider is refused, so the startup needs a value for `GEMINI_API_KEY`. The hermetic test of spec 001 (AC-4) used to forbid the name anywhere in `ci.yml`; it now accepts it only as `GEMINI_API_KEY=placeholder-...`, and still forbids the Google host. `apps/api/test/hermetic-ci.spec.ts` and the wording of AC-4 in spec 001 change with this.
- **A step in the existing job.** The image is already built there, and a second job would build it again.

## Risks

- A change of the startup variables makes the step fail until the placeholders follow it. That is what the step is for, and the message says what failed.
- `/v1/health` answering `503` is an expectation about its error mapping. If that mapping changes on purpose, the expectation changes in the same pull request.

## Recorded results

To be filled with the runs of the pull request: the green run, the red run of AC-5, and the time that the step adds.
