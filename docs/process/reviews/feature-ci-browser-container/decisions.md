# Decisions

decision: continue (r1, human: "continue")
ran_in_app: not-applicable
at: 7fddd2033ae4bce3f7c37256e888793db6a91384
by: agent
evidence: The changed paths (git diff --name-only origin/develop...HEAD) are .github/workflows/ci.yml, frontend/scripts/check-playwright-browsers.mjs, frontend/src/__tests__/check-playwright-browsers.test.ts, tests/test_ci_browser_jobs.py, docs/developer-guide/testing.md and docs/specs/ + docs/process/reviews/. None is under backend/app, frontend/src outside __tests__, frontend/server.js, a Dockerfile or docker-compose.yml. check-playwright-browsers.mjs is referenced only by ci.yml and its own test, not by frontend/package.json, a Dockerfile, docker-compose.yml or server.js, so the built images and the running app are unchanged. Spec section 9 states no Litloft-user-visible behavior; the only observable change is CI check names and wall time, which R-5 cannot exercise in the app. No stack was started.
pending: none

## After CI run 44498253376

- Component shards: 505 + 504 = 1009, equal to `playwright test --config=playwright-components.config.ts --list` (Total: 1009 tests in 84 files).
- Two layout cases in `e2e-layout/addon-policy.spec.ts` measured the table at 560 against `APP_TABLE_HEIGHT = 548`. In the image, `fc-match` resolves `system-ui` and `sans-serif` to WenQuanYi Zen Hei; the fixture loads no web font.
- Human decision: option 1, re-measure `APP_TABLE_HEIGHT` to 560 (human: "1"). Recorded as an I6 revision in invariants.md.
