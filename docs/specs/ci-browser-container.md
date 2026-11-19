# Browser tests in the Playwright image, split across jobs

SPEC-ID: SPEC-CORE-149

Approval:

## Summary

The CI job `frontend (layout invariants and components in a browser)` sets the wall time
of the whole workflow: 17 to 40 minutes, against 12 for the next slowest job. Most of the
spread is not testing. `playwright install --with-deps` runs `apt-get` on every run, and
the Ubuntu mirror is sometimes slow: run 44444618581 fetched 94.2 MB in 17 min 42 s
(88.8 kB/s) for WebKit and 32.1 MB in 7 min 20 s for Chromium, while the browser
binaries themselves came from the cache. This change runs the browser suites inside the
official Playwright image, which already has the system libraries and both browsers, and
splits the suites across jobs so no browser job is the critical path. The same suites
run, in the same browsers and projects; only where and in how many jobs changes. It is
for the developer waiting on CI, most of all for an addon change that needs an addon CI
run and then a core CI run.

## Required items

### 1. Normal flow

1. A push or pull request starts `ci.yml`, as today.
2. The browser suites run in three jobs instead of one, each on `ubuntu-latest` in a
   container from `mcr.microsoft.com/playwright:v<V>-noble`, where `<V>` is the
   `@playwright/test` version resolved in `frontend/pnpm-lock.yaml` (1.58.2 at design
   time), written as the same literal in every browser job, with `options: --user 1001`
   as Playwright's own GitHub Actions guide gives it.
   - `frontend-components`: a matrix over `shard: [1, 2]` with `fail-fast: false`, named
     `frontend (browser components ${{ matrix.shard }}/2)`, so the check names are
     `frontend (browser components 1/2)` and `frontend (browser components 2/2)`. It runs
     `pnpm exec playwright test --config=playwright-components.config.ts --shard=${{ matrix.shard }}/2`,
     spelled out rather than through the package script so the shard flag does not
     depend on pnpm's argument forwarding.
   - `frontend-layout-epub`, named `frontend (layout invariants and EPUB reader in a browser)`:
     `pnpm test:e2e:layout`, then `pnpm test:e2e:epub` (Chromium and WebKit), both with
     no extra arguments. The EPUB step carries
     `if: ${{ !cancelled() && steps.browsers.outcome == 'success' }}`: it runs after a
     layout failure, so one suite's failure does not hide the other's result, and it does
     not run when setup or the browser check failed. The job is red if either suite
     failed.
3. Each browser job, in this order: checks out with `submodules: recursive`; runs
   `./setup-addons.sh`; sets up pnpm and Node 20 (`pnpm/action-setup`, `actions/setup-node`
   with the pnpm cache) as the vitest jobs do; runs `pnpm install --frozen-lockfile`; runs
   the browser check (step id `browsers`); runs the tests. No translation merge step, as
   in today's browser job. The image ships git (Playwright's `Dockerfile.noble` installs
   it) and Node 24; `setup-node` puts Node 20 first on `PATH`, so pnpm and the tests run
   on Node 20. Actions sets `CI=true` in container jobs, so the configs keep the `line`
   reporter.
4. The browser check is `node scripts/check-playwright-browsers.mjs <names…>` in
   `frontend/`. The names per job are fixed: `chromium chromium-headless-shell` in the
   component jobs, `chromium chromium-headless-shell webkit` in the layout-and-EPUB job.
   - It reads `browsers.json` from the path in `--browsers-json <path>` (the test passes
     a temporary file). Without the flag, it finds the installed `playwright-core` by
     module resolution from `frontend/`: `@playwright/test`'s `package.json`, then
     `playwright`'s from there, then `playwright-core`'s from there, and reads the
     `browsers.json` beside it. pnpm keeps `playwright-core` out of the top level of
     `node_modules/`, so a fixed path would not find it. The CI command passes no flag.
   - For each name, it finds the entry whose `name` equals it and takes its `revision`,
     replaced by `revisionOverrides["ubuntu24.04-x64"]` when that key exists (the image
     is Ubuntu 24.04 on x64; other platform keys are ignored).
   - The directory it expects is `<name with every "-" replaced by "_">-<revision>`
     under `PLAYWRIGHT_BROWSERS_PATH` (for 1.58.2: `chromium-1208`,
     `chromium_headless_shell-1208`), which is how Playwright lays out `/ms-playwright`.
   - It exits non-zero, with one `::error::` line per problem, when `browsers.json`
     cannot be read, `PLAYWRIGHT_BROWSERS_PATH` is unset, no name is given, a name is not
     in the file, or a directory is missing. Otherwise it prints one line per verified
     directory and exits zero.

   It compares what the image holds with what the lockfile installed, not the tag text,
   so a tag left behind by a lockfile bump fails here.
5. No step of a browser job runs `playwright install` or `apt-get`. The `Cache the
   Chromium build` step is removed; the image carries the browsers.
6. A new pytest, `tests/test_ci_browser_jobs.py`, reads `.github/workflows/ci.yml` and
   `frontend/pnpm-lock.yaml` and asserts I1, I2, I3, I5, I8, I9, the check names in
   step 2, the browser-check step and its per-job names from step 4, and that the
   `browsers` step precedes every test step (I4's wiring). The other invariants are
   checked elsewhere: I4's logic by the vitest in step 7, I6 and I11 by review of the
   diff, I7 by the read-back in step 8, I10 by the test importing `yaml` directly and
   appearing in the `bootstrap` log. It runs in the `bootstrap (configure.py)`
   job, whose install step becomes `pip install pytest PyYAML==6.0.2`. The test imports
   `yaml` directly, so a missing PyYAML is an error, not a skip.
7. A vitest test under `frontend/src/` runs `check-playwright-browsers.mjs` against a
   temporary `browsers.json` and directory tree, and shows it failing for each condition
   in step 4 and passing when every directory exists.
8. Branch protection on `develop` (classic protection, `strict: false`, 14 entries under
   `checks`, all with `app_id` 15368) replaces the entry for
   `frontend (layout invariants and components in a browser)` with the three new names,
   same `app_id`. Order: the PR's checks are green; the author shows the human the new
   list; on the human's approval the author sends
   `PATCH /repos/{owner}/{repo}/branches/develop/protection/required_status_checks`
   with the full `checks` list and `strict: false`; the author merges right after; the
   author reads the list back and records it in the review's `decisions.md`.
9. On the PR's first green run, each component shard's count is read from its `line`
   reporter summary as passed + skipped + flaky, and the sum is compared with the total
   that `pnpm exec playwright test --config=playwright-components.config.ts --list`
   prints at the PR's head commit (1009 cases ran at design time). The result goes in
   `decisions.md`. A mismatch stops the merge and goes to the human.

### 2. Failure cases

- **A test fails in the container that passes on the runner.** The image's fonts and
  libraries are not byte-for-byte the runner's after `--with-deps`, and several
  component cases measure text width (`header-row-crowding.spec.ts`,
  `search-results-bar.spec.ts`). The implementer does not adjust the test, its margin or
  its expectation. The difference is reported to the human with the case, both
  measurements and the fonts involved, and the human decides.
- **A setup step fails in the container** (checkout, `pnpm/action-setup`, the pnpm cache,
  file ownership under `--user 1001`, including a permission error from a suite's
  `globalSetup` writing its bundle or fixture, which shows inside the test step). The implementer stops and reports; changing the
  user, the Node version, the host image or adding an install step is the human's call.
- **The lockfile moves `@playwright/test` and the image tag is not moved.** The browser
  check fails the job before any test runs, naming the missing build.
- **The image cannot be pulled** (registry down). The job fails at container start, and
  is re-run like any other infrastructure failure. No fallback to the runner path.
- **A shard collects no tests.** Playwright exits non-zero when it finds no tests, and no
  command passes `--pass-with-no-tests` (I1), so the job goes red.
- **Protection is changed and the merge does not follow** (a new red, a conflict, the
  human stops). The author restores the previous 14-entry list with the same call before
  ending the session, and reads it back.
- **A PR open at merge time** keeps runs that carry the old job name, so it waits until
  it is updated from `develop` and CI runs again, the normal path for a PR behind
  `develop`.

### 3. States

None. CI keeps no state between runs beyond Actions caches, see 4.

### 4. Data read and written

- Reads: the repository, its submodules, `frontend/pnpm-lock.yaml`, the image's
  `/ms-playwright`, the pnpm store cache.
- Writes: each job's workspace. The pnpm cache: the container's store path may differ
  from the runner's, in which case `setup-node` saves a separate entry; that entry is
  accepted. The `playwright-Linux-*` cache key is no longer written and expires on its
  own. Branch protection on `develop` (step 8).
- No application data, database or user file is touched.

### 5. External services

- `mcr.microsoft.com` serves the image. Slow: the job waits; the job's wall time,
  container start included, is what item 10 measures. Down: the job fails, see 2.
- `registry.npmjs.org` through `pnpm install`, as today; PyPI for PyYAML in `bootstrap`.
- The Ubuntu apt mirror is no longer called by the browser jobs.

### 6. Authorization

`permissions: contents: read` stays. The protection change needs a repository admin; the
author runs it with `gh api` only after the human approves the list in that session.

### 7. Effect on existing features

- No application code, existing test, Playwright or vitest configuration, or
  `package.json` script changes.
- `bootstrap (configure.py)` gains PyYAML and the new test. `configure.py` itself stays
  stdlib-only; PyYAML is a test dependency of the job, not of the script.
- The other CI jobs are untouched.
- `docs/developer-guide/testing.md` lists the CI jobs by name; its `### Core jobs` table
  is updated. Its `## Browser suites` section describes local runs and is unchanged.
- Local runs (`pnpm test:e2e:*` on a developer's machine) are unchanged.

### 8. Error behavior

A failure shows as a red job in the PR's checks, with Playwright's `line` reporter output
as today; in the layout-and-EPUB job the failed step names the suite. The browser check
prints one `::error::` line per problem.

### 9. User-visible behavior

None for a Litloft user. For the developer: three browser check names instead of one,
and a shorter wall time.

### 10. Non-functional

- Target: no browser job above 12 minutes on a normal run, so the workflow's critical
  path becomes `backend (pytest in the test image)` (9 to 12 minutes measured). The
  target is a goal, not a merge condition.
- Merge condition: on the PR's first two green workflow runs (a re-run of the same commit
  counts as a run), the longest browser job's wall time, from the job's start to its end
  with container start included and queue time excluded, is below 17 minutes, today's
  best case, in both. If the two disagree, a third run decides. A job above 12 minutes
  is reported in the PR. If the condition fails, the author stops and gives the human the
  per-step times; the human decides.
- Public repository runners are free. The workflow goes from 14 to 16 jobs (17 with
  `process.yml`). The 20-job concurrency limit is per account, so overlapping runs may
  queue; queueing is out of scope here, as it is today.

## Touch points

- `.github/workflows/ci.yml`: the `frontend-layout` job, replaced by `frontend-components`
  and `frontend-layout-epub`; the `bootstrap` job's install step (risk zone CRITICAL;
  not a protected path).
- `frontend/scripts/check-playwright-browsers.mjs` (new).
- A vitest test for it under `frontend/src/` (new).
- `tests/test_ci_browser_jobs.py` (new).
- `docs/developer-guide/testing.md`: the `### Core jobs` table.
- Branch protection on `develop`: the required status check list (GitHub setting).
- Read, not changed: `frontend/playwright-components.config.ts`,
  `frontend/playwright-epub.config.ts`, `frontend/playwright-layout.config.ts`,
  `frontend/package.json`, `frontend/pnpm-lock.yaml`.

## Invariants

I1. Every case that `pnpm test:e2e:layout`, `pnpm test:e2e:components` and `pnpm test:e2e:epub` run today runs in CI after the change, in the same Playwright projects: the component jobs cover exactly shards 1/2 and 2/2 of `playwright-components.config.ts`, the layout and EPUB steps run the package scripts with no extra arguments, and no browser test command carries `--project`, `--grep`, `--grep-invert` or `--pass-with-no-tests`.
I2. A failing case in any of the three suites turns its job red; no browser step has `continue-on-error`, no test command is piped into another command, and the component matrix has `fail-fast: false`.
I3. No step of the browser jobs runs `apt-get` or `playwright install`.
I4. When a build a job uses (chromium and chromium-headless-shell in every browser job, webkit too in the layout-and-EPUB job) is absent at the revision the installed `playwright-core` expects, or the check cannot read what it expects, the job fails and no test step runs.
I5. The browser jobs test the pinned addon commits: they check out submodules recursively and run `setup-addons.sh` before installing.
I6. No existing test, Playwright or vitest configuration, retry count or `package.json` script changes in this change.
I7. After merge, the required checks on `develop` are exactly the names of the jobs `ci.yml` runs on a pull request.
I8. A failing layout case does not stop the EPUB suite from running in the same job.
I9. The browser jobs run their tests on Node 20, in the same image tag in every job, and that tag's version equals the `@playwright/test` version in `frontend/pnpm-lock.yaml`.
I10. The CI-shape test runs in `bootstrap (configure.py)` and is collected, not skipped.
I11. The `### Core jobs` table in `docs/developer-guide/testing.md` names the three browser checks and the suites and browsers each runs, and no longer names the removed job.

## Checked, no action

- **Caching the apt packages instead of switching to the image.** `--with-deps` runs
  `apt-get update` and installs into system paths; caching `/var/cache/apt` still pays
  the index fetch and the install, and it breaks when the runner image moves. The
  official image removes the call.
- **Raising the number of Playwright workers** instead of sharding. It changes test
  configuration (I6), and the runner has 4 vCPUs, so the gain is bounded; sharding
  across runners scales without touching the config.
- **Sharding the EPUB suite.** It runs about 3.6 minutes; with the layout suite the job is
  about 5 minutes, below the target.
- **Separate jobs for layout and EPUB.** The layout suite takes 30 seconds; a job of its
  own adds a checkout and an install for no wall-time gain.
- **Running every frontend job in the image.** Only the browser jobs call apt. The vitest
  jobs run in 3 to 5 minutes and are not on the critical path.
- **The backend pytest job (9 to 12 minutes)**, which becomes the critical path. Its
  `docker build` has no layer cache; caching it is a separate change, measured first.
- **Branch protection on `main`.** `main` has none (`gh api` returns 404).
- **The protection window.** This PR cannot merge while the old name is required, so the
  protection changes first; between that call and the merge, other PRs lack the new
  names and cannot merge, and no PR can merge without browser tests. The window is the
  time between two commands, and step 8 and the rollback case bound it.
- **The `ubuntu-24.04` pin.** It exists because Playwright refuses to install on
  `ubuntu-26.04`. In a container the job installs nothing, so the browser jobs return to
  `ubuntu-latest`.
- **A CI step comparing shard counts on every run.** Playwright splits shards itself; I1
  pins the shard set and the absence of filters in the pytest, and step 9 checks the
  wiring once.
- **The translation merge step.** Today's browser job does not run it, and the fixtures
  import addon message files directly; adding it would change what the suites run
  against.
