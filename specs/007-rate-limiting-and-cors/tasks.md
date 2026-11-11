# Tasks: spec 007

- [x] Write the address extraction function and the guard; test with forged headers and two clients. (stage: 007)
- [x] Wire the guard first; remove the global per-IP throttler guard and the duplicate module registration. (stage: 007)
- [x] Keep the per-user creation limit; track by user id. (stage: 007)
- [x] Add the health threshold and the 429 `Retry-After` response. (stage: 007)
- [x] Implement CORS from `CORS_ORIGINS` and test it. (stage: 007)
- [x] Add the variables to `service.yaml` and `.env.example`, and the test that checks `service.yaml` declares them. (stage: 007)
- [x] Approve the starting values of the limiter (maintainer), proposed in the plan. (stage: 007)
- [x] Measure the client address seen in Cloud Run (maintainer), with the procedure of the plan, and record it. (stage: 007)
- [x] Update this spec and this file with anything that changed. (stage: 007)
