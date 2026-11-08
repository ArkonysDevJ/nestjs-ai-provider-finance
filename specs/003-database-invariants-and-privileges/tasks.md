# Tasks: spec 003

- [x] Attach the measured hosted catalog and counts to this spec. (stage: 003-prepare)
- [ ] Settle the open points of the spec in the review of the privilege change; finalize the DDL and the backfill mapping (5 manual, 90 legacy). (stage: 003-prepare)
- [ ] Compare the local catalog (from spec 001's `config.toml`) with the measured hosted catalog; record the differences. The configuration-level comparison is in the spec; the catalog-level one needs the local stack. (stage: 003-prepare)
- [ ] Write the expand migration and its pgTAP tests (AC-1 to AC-10, AC-12, AC-14, AC-15). (stage: 003-expand)
- [ ] Add the migration backfill check to CI (AC-2). (stage: 003-expand)
- [ ] Review the DDL as a privilege change before it is merged or applied. (stage: 003-expand)
- [ ] Apply the expand migration to the hosted database (maintainer only); repeat the catalog queries in read-only mode. (stage: 003-expand)
- [ ] Write the contract migration and its test variants (AC-11). (stage: 003-contract)
- [ ] Apply the contract migration only when the code of specs 004 and 005 is deployed (maintainer only). (stage: 003-contract)
- [ ] Live check after the contract stage (AC-16). (stage: 003-contract)
- [ ] README: state the creation-provenance limit, the demo data exposure and the removal of `DELETE`. (stage: final-docs)
- [ ] Update this spec and this file with anything that changed. (stage: each stage)
