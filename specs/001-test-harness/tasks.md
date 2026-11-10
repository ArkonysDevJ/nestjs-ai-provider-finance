# Tasks: spec 001

Each task names the stage that executes it.

- [x] Add Jest, ts-jest and the test scripts; add the smoke test. (stage: 001)
- [x] Add ESLint and Prettier configuration and scripts. (stage: 001)
- [x] Format the existing code in one separate commit; add `.prettierignore`; list the files of that commit in the pull request. (stage: 001)
- [x] Add `supabase/config.toml`. (stage: 001)
- [x] Replace the provisional `max_rows` and Postgres major version in `supabase/config.toml` with the measured hosted values. Done on 2026-11-07: Postgres 17 and `max_rows` 1000. (stage: 001)
- [x] Rename the Bruno `local` environment to `demo`; add `local-stack`; add `bruno/setup-local.sh`. (stage: 001)
- [x] Add the fake MCP server and its test. (stage: 001)
- [x] Extend `ci.yml` with the steps of the spec; keep the job name `ci`. (stage: 001)
- [x] Add the hermetic CI, Bruno environments and `.prettierignore` tests. (stage: 001)
- [x] Add the acceptance criteria coverage script and its CI step. (stage: 001)
- [x] Update the commands table in `AGENTS.md`. (stage: 001)
- [x] Update this spec and this file with anything that changed during implementation. (stage: 001)
- [x] Run the CI end to end in GitHub Actions and fix what only a real run shows (database stack, Bruno run, setup script). (stage: 001)
