# Tasks: spec 006

- [x] Use the SQL function from the API; return decimal strings. (stage: 006)
- [x] Page the list with the total order; validate `limit` and `offset`. (stage: 006)
- [ ] Update the web app: money helpers, accept number or string, page through the list. (stage: 006)
- [x] Add the pgTAP test with 1200 rows and the local row-cap test. The pgTAP test with 1200 rows already exists from spec 003; the row-cap test runs in CI step "Summary row cap test". (stage: 006)
- [x] Add the paging Bruno request; the existing Bruno requests that list must keep passing, or be adjusted in the same pull request. (stage: 006)
- [ ] Merge the web app first, because it accepts the totals as numbers or strings, then merge the API and verify the web app against the deployed API. The web app that is deployed today calls `toFixed` on the totals, which fails on a string, so the API must not reach production before the web app does. (stage: 006)
- [ ] Update this spec and this file with anything that changed. (stage: 006)
