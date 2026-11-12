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

Runs of 2026-11-11, in CI:

- **Green run.** On the pull request of this spec, [run 42963434704](https://github.com/ArkonysDevJ/nestjs-ai-provider-finance/actions/runs/42963434704): "Container smoke test" passed (`/v1/categories` answered 401 and `/v1/health` answered 503) and every other step passed. The run after the correction of this spec also passed.
- **Time added.** The step takes 2 seconds (from 05:08:52 to 05:08:54 in that run), and its test adds under a second to the unit tests. The whole `ci` job took 3 minutes 34 seconds; the runs of `main` that day took between 3 and 4 minutes, so the change is inside the noise.
- **Negative run, CommonJS manifest (AC-5).** [Run 42964318505](https://github.com/ArkonysDevJ/nestjs-ai-provider-finance/actions/runs/42964318505): every step before the smoke test passed, the smoke test failed after 2 seconds with "The container stopped before it answered" and the container log ended in `SyntaxError: Cannot use import statement outside a module`. The steps after it were skipped.
- **Negative run, missing dependency.** [Run 42964321509](https://github.com/ArkonysDevJ/nestjs-ai-provider-finance/actions/runs/42964321509): the smoke test failed after 1 second, and the log showed `ERR_MODULE_NOT_FOUND: Cannot find package '@supabase/supabase-js'`. Build, lint and unit tests had passed, which is the case the step is for.
- **A missing manifest does not break the start.** [Run 42963465843](https://github.com/ArkonysDevJ/nestjs-ai-provider-finance/actions/runs/42963465843): the runtime stage without `apps/api/package.json` passed the smoke test. Node 24.22.1 detects the module syntax and starts the code as an ES module, with a warning. The first negative run was planned with that change and it did not fail, which is why the spec now describes what Node does and why the AC-5 run uses a CommonJS manifest. The same three outcomes were reproduced locally with Node 24.22.1.
- **The logs do not show the environment of the container.** The failing runs print the last lines of the container log, and the step does not print the variables. The `env:` block that Actions prints for each step belongs to the job, not to the container.
