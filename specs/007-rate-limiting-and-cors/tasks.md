# Tasks: spec 007

- [ ] Write the address extraction function and the guard; test with forged headers and two clients. (stage: 007)
- [ ] Wire the guard first; remove the global per-IP throttler guard and the duplicate module registration. (stage: 007)
- [ ] Keep the per-user creation limit; track by user id. (stage: 007)
- [ ] Add the health threshold and the 429 `Retry-After` response. (stage: 007)
- [ ] Implement CORS from `CORS_ORIGINS` and test it. (stage: 007)
- [ ] Add the variables to `service.yaml` and `.env.example`. (stage: 007)
- [ ] Measure the client address seen in Cloud Run (maintainer) and record it. (stage: 007)
- [ ] Update this spec and this file with anything that changed. (stage: 007)
