# Testing

Litloft is tested by package: the core backend (pytest in Docker), the core
frontend (vitest, which also runs every addon's frontend tests), the MCP server
(vitest), each addon backend (pytest in its own image), and two Playwright
suites that run against static fixtures. CI runs all of them on every pull
request.

## Coverage by package

| package | measured | gated | where the floor lives |
|---|---|---|---|
| `frontend/` | istanbul | four thresholds | `frontend/vitest.config.ts` |
| `backend/` | `--cov=app --cov-branch` | one floor | `COV_FLOOR` in the `backend` step of `.github/workflows/ci.yml` |
| `mcp-server/` | v8 | four thresholds | `mcp-server/vitest.config.ts` |
| `addons/intelligence` | `--cov=app --cov-branch` | one floor | `COV_FLOOR` in that repository's CI |
| `addons/knowledge` | `--cov=app --cov-branch` | one floor | same |
| `addons/media_import` | `--cov=addons.media_import --cov-branch` | one floor | same |
| `addons/cloud-sync` | `--cov=addons.cloud_sync` | no floor | not gated, by decision |
| `configure.py` | not measured | — | runs on a bare interpreter outside the test image; `tests/test_configure.py` holds its invariants instead |

Add a row when you add a package. The floor values are not copied here; read
them from the file that enforces them.

## Backend tests

Run them in the test image. Local Python 3.14 is not compatible with the pinned
Pydantic.

```bash
docker build -f backend/Dockerfile.test -t litloft-test .
docker run --rm litloft-test
```

The build context is the **repository root**, not `backend/`: the tests read
`configure.py` and the compose files, which sit above it.

To pass arguments to pytest, give the whole command. Anything after the image
name replaces the image's `CMD`, so a bare `-k …` is run as the program and the
container fails to start:

```bash
docker run --rm litloft-test pytest -k internal_api_contract -vv
```

Coverage flags are in `backend/pytest.ini`, so a partial run is measured too.
Add `--no-cov` for a faster loop.

### Addon backends

Each addon has its own test image, and a change to an addon backend needs that
image run; core's image does not include any addon.

`cloud-sync` and `media_import` run in the core process and import core's `app`
package, so the build context is the repository root:

```bash
docker build -f addons/cloud-sync/Dockerfile.test -t cloud-sync-test .
docker run --rm cloud-sync-test

docker build -f addons/media_import/Dockerfile.test -t media-import-test .
docker run --rm media-import-test
```

`intelligence` and `knowledge` are independent services with their own `app`
package, so the build context is the addon directory:

```bash
docker build -f addons/intelligence/Dockerfile.test -t intelligence-test addons/intelligence
docker run --rm intelligence-test

docker build -f addons/knowledge/Dockerfile.test -t knowledge-test addons/knowledge
docker run --rm knowledge-test
```

### The bootstrap script

`configure.py` is stdlib-only and is not in the backend test image. Its tests
run on a bare interpreter with only pytest installed, as CI runs them:

```bash
python3 -m pip install pytest
python3 -m pytest tests -v
```

They build their own addon trees under `tmp_path`, so a checkout without
submodules is enough.

### What to test

- Routers: status code and response shape per endpoint.
- Services: business logic, especially scanner state transitions and the failure
  paths of atomic writes.
- Models: `active_file_filter`, restore semantics, lifecycle transitions.
- Internal API: the two contract-test layers in
  [`.claude/rules/internal-api-policy.md`](../../.claude/rules/internal-api-policy.md).

### Patterns

- Import config as `import app.config as config` and patch with
  `monkeypatch.setattr(config, "DATA_DIR", ...)`. `from app.config import DATA_DIR`
  cannot be patched (see
  [`.claude/rules/backend-conventions.md`](../../.claude/rules/backend-conventions.md)).
- Do not mock the database. Tests use a real SQLite; mocked SQLAlchemy hides
  migration and constraint bugs.
- Scanner tests populate a temporary directory.
- Use a real ffmpeg in thumbnail tests, or skip with `pytest.mark.skipif`.
- Mock HTTP clients that reach external APIs (LLM providers, cloud
  transcription), and capture WebSocket broadcasts with a test double.

## Frontend tests

A fresh checkout needs three steps before the suite can run, and nothing else
(no `drives.json`, `passwords.json`, `.env` or `docker-compose.override.yml`):

```bash
./setup-addons.sh
pnpm install --dir frontend --frozen-lockfile
node frontend/scripts/merge-addon-messages.mjs
```

Then:

```bash
cd frontend
pnpm test          # vitest run
pnpm test:watch    # vitest, watch mode
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint
```

Re-run `merge-addon-messages.mjs` after changing a message catalogue:
`src/messages/` is generated and goes stale.

Version constraints (see
[`.claude/rules/frontend-conventions.md`](../../.claude/rules/frontend-conventions.md)):
vitest 3.x, jsdom 25.x. CI and `frontend/Dockerfile` use Node 20.

### Addon frontends run here too

An addon's frontend has no runner of its own. `setup-addons.sh` builds
`frontend/src/addons/<name>/` (gitignored) with one symlink per file of
`addons/<name>/frontend`, so core's vitest collects every addon's tests. Without
that tree the suite still passes, having collected nothing from any addon.

`tsc --noEmit` type-checks the addon sources through the links. `eslint` does
not: `frontend/eslint.config.mjs` ignores `src/addons/**`, and no addon
repository has its own eslint config, so `tsc` is the only static check addon
frontends get.

### Test setup to know about

`frontend/src/test/setup.ts` does three things every test relies on:

- **Web Storage is replaced by a class-based shim** (`globalThis.Storage` is the
  class). Both `vi.spyOn(localStorage, "setItem")` and patches on
  `Storage.prototype` work against it. Do not turn it into an object literal:
  tests that make storage throw patch `Storage.prototype`.
  `src/test/__tests__/storage-shim.test.ts` guards it.
- **Every test ends with a `pointercancel` dispatched at `document`**, which
  clears the press-in-flight and click-swallow state `DismissScrim` keeps at
  module scope. It runs before Testing Library's `cleanup()`, so a component
  that ends a drag on a document-level `pointercancel` runs that handler during
  teardown, outside `act()`. It does not bubble, so a `window`-level listener
  never sees it. `src/test/__tests__/press-lift.test.tsx` guards it.
- **Testing Library's async timeout is 3000 ms.** Do not raise it to hide a
  wait on the wrong thing.

### What to test

- Components: render, interaction, accessibility where reasonable.
- Hooks: edge cases.
- API helpers such as `saveFileTags` (especially its MIME branching), with
  `fetch` stubbed.

## MCP server tests

`mcp-server/` is a separate package with its own lockfile:

```bash
cd mcp-server
pnpm install --frozen-lockfile
pnpm test
pnpm exec tsc -p tsconfig.json --noEmit
```

## Browser suites

There is no whole-stack browser suite. Both Playwright suites run against a
bundled or static fixture and need no server. A flow that needs a live stack
and a seeded library is checked by hand. Install the browser once:

```bash
cd frontend
pnpm exec playwright install --with-deps chromium
```

### Components in a browser

`frontend/e2e-components/` bundles `fixtures/app.tsx`, which imports real
components from `src/`, and drives it with real gestures (CDP touch input,
including long presses and touch drags) in Chromium. Most specs run in an
emulated Pixel 5; the ones listed in `e2e-components/projects.ts` run at a
desktop viewport.

```bash
cd frontend
pnpm test:e2e:components
```

The pages around the components are hand-written: anything that needs Next.js,
`next-intl` routing or a backend is represented by a copy of its layout in the
fixture.

### Layout invariants

`frontend/e2e-layout/` opens static pages from `file://` that link the app's
compiled `globals.css`, and measures the boxes Chromium lays out. Its
`globalSetup` compiles the stylesheet, so there is no build step to run first.

```bash
cd frontend
pnpm test:e2e:layout
```

Use it for anything about a box's size, position, overflow, stickiness or
transition. jsdom lays nothing out, and matching the text of a stylesheet cannot
verify a layout (see
[`.claude/rules/review-workflow.md`](../../.claude/rules/review-workflow.md)).

Its fixtures hand-write the markup they measure, so a fixture can drift from the
component. `justified-grid` is held to its components by
`src/components/__tests__/justifiedGridFixtureParity.test.tsx`: **a new cell
shape inside `.justified-grid` needs a row in the fixture's table**, or the
parity test will not know about it.

Each suite has its own config (`playwright-components.config.ts`,
`playwright-layout.config.ts`), so neither pulls in the other. Use
`--repeat-each=5` on a new spec to look for flakes.

## Before you push

```bash
cd frontend
node scripts/merge-addon-messages.mjs
pnpm test && pnpm exec tsc --noEmit && pnpm lint
```

`deploy/pre-push` runs exactly that when the push touches `frontend/` or an
addon's `frontend/`. It is opt-in:

```bash
ln -s ../../deploy/pre-push .git/hooks/pre-push
```

`git push --no-verify` skips it for one push.

## Coverage

| package | command |
|---|---|
| backend | `docker run --rm litloft-test` (always measured) |
| frontend | `pnpm exec vitest run --coverage`, then `node scripts/check-coverage-denominator.mjs` |
| mcp-server | `pnpm exec vitest run --coverage`, then `node scripts/check-coverage-population.mjs` |

For an HTML report of the frontend, add it to the configured reporters rather
than replacing them, then open `frontend/coverage/index.html`:

```bash
pnpm exec vitest run --coverage \
  --coverage.reporter=text-summary --coverage.reporter=json-summary \
  --coverage.reporter=html
```

`--coverage.reporter=html` on its own drops `json-summary`, and the denominator
check then fails because `coverage-summary.json` is missing.

### Floors

A floor is a lower bound, so it cannot see the population shrink. Every gated
package therefore also runs a population check that compares the files the
collector measured with an independent walk of the tree:
`frontend/scripts/check-coverage-denominator.mjs`,
`mcp-server/scripts/check-coverage-population.mjs` and
`backend/scripts/check-coverage-population.py`.

Rules for setting one:

- **A Python floor never goes in `addopts`.** `--cov-fail-under` there fails
  every partial run. It goes in the CI step as `PYTEST_ADDOPTS`.
- **A Python floor is the measured total truncated, not rounded**, with
  `--cov-precision=2`. coverage.py computes its exit code from the rounded
  total, so a rounded-up floor can print `FAIL` and still exit 0.
- **A vitest floor is the displayed value.** vitest compares the same truncated
  figure it prints.
- **The frontend floors are CI's numbers.** Coverage varies slightly between
  runs and between machines on an unchanged tree (the numerators move; the
  population does not), and CI reports slightly less than a developer machine.
  A higher local number is not headroom. Each threshold sits at the lowest value
  observed in CI.

Raise a threshold when coverage rises. Do not lower one to make a build pass
without saying so in the commit.

### When a frontend threshold goes red

1. Read the coverage summary from the merge step and the file count from the
   denominator step below it. Both are written even when a test failed
   (`coverage.reportOnFailure` is on).
2. If the denominator step passed, the population is intact and the numerator
   moved:
   - if the branch changed code that runs under test, it lost coverage; add a
     test;
   - if it did not, re-run the same commit. Green is run-to-run variation; red
     again means coverage really dropped.
3. If the denominator step failed, the population changed (an addon did not
   link, a file stopped being instrumented). Find out why before touching any
   number.
4. Re-measure a floor only when the CI environment changes (runner size,
   provider, population), from several samples.

## CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `develop`
and `main`. Each addon repository has its own workflow.

### Core jobs

| Job name | What it runs |
|---|---|
| `frontend (vitest 1/4)` … `(vitest 4/4)` | `setup-addons.sh`, install, merge translations, then a quarter of the suite: `vitest run --coverage --retry=1 --shard=k/4` with thresholds zeroed |
| `frontend (coverage floor and denominator)` | merges the four shard reports (`vitest --merge-reports --coverage`), applies the thresholds, runs `check-coverage-denominator.mjs` |
| `frontend (tsc / eslint)` | checks every addon contributed tests (`vitest list --filesOnly`), then `tsc --noEmit` and `pnpm lint` |
| `frontend (shuffled order)` | the whole suite under `--sequence.shuffle --retry=1`, without coverage |
| `frontend (layout invariants and components in a browser)` | `pnpm test:e2e:layout` and `pnpm test:e2e:components` in Chromium |
| `mcp-server (vitest / tsc)` | vitest with coverage, the population check, `tsc` |
| `backend (pytest in the test image)` | builds and runs `backend/Dockerfile.test` with the floor, then `check-coverage-population.py` |
| `bootstrap (configure.py)` | `python -m pytest tests -v` on Python 3.12 |
| `addon backend (cloud-sync)`, `addon backend (media_import)` | builds and runs that addon's test image from the repository root |
| `production images` | builds `frontend/Dockerfile` and `backend/Dockerfile` |

The frontend jobs check out submodules recursively, so they test the **pinned**
addon commits, the pairing a fresh clone gets. They fail if pinned addon code
conflicts with core (for example a removed design token or a clashing message
namespace), or if a submodule did not check out. They do not catch a pointer
that is behind but still consistent with core; that is a review responsibility
(see [CLAUDE.md](../../CLAUDE.md)).

`production images` is the only place `next build` runs. It cannot run against
the `frontend/src/addons` link tree, because Turbopack does not resolve the
dynamic `@/addons/<name>/Page` import through symlinks; `frontend/Dockerfile`
copies the addon trees in as real files first.

`ruff` and `mypy` are not run; the repository configures neither.

**Read the exit code, never the pass count.** No step pipes a test command
through another program, sets `continue-on-error`, or uses vitest's JSON
reporter. If you need more output from a job, make the command louder; do not
wrap it.

### Addon jobs

Each addon workflow has a backend job and a frontend job.

- **Backend:** `intelligence` and `knowledge` build their own test image from
  their own checkout. `cloud-sync` and `media_import` check out core `develop`
  and build against it; core's CI also runs these two.
- **Frontend:** checks out core `develop` with submodules, puts the commit under
  test at `addons/<name>`, checks vitest collected that addon, and runs core's
  whole suite and `tsc`.

Because both resolve core `develop` at run time, an addon's CI result is not
reproducible: a pull request that changes nothing in the addon can turn red when
core moves. If a job fails in a core file on a branch you did not touch, re-run
it once core has the fix.

### Branch protection

Core's `develop` uses classic branch protection (the `branches/*/protection`
API, not a ruleset). Every job in the core table above is a required status
check. There are no required reviewers, `enforce_admins` is off, and `strict` is
off (a branch need not be up to date before merging).

When `frontend (shuffled order)` goes red, take the seed from its log, reproduce
it (see [Order dependence](#order-dependence)), and fix the cause. Do not re-run
until green.

**A required check is matched by the job's `name:` string.** Renaming a job
leaves the old name required and never reported, so every pull request waits on
it. Rename a job and update the protection together.

```bash
gh api repos/mamepenguin/Litloft/branches/develop/protection
gh api -X DELETE repos/mamepenguin/Litloft/branches/develop/protection
```

Core also has a ruleset on `refs/heads/main` (deletion and non-fast-forward
protection), listed at `gh api repos/mamepenguin/Litloft/rulesets`. The API
above does not see or remove it.

## TDD workflow

1. Write the test first.
2. Run it; it should fail.
3. Write the minimum to make it pass.
4. Refactor.
5. Check coverage did not fall (see [Coverage](#coverage)). `cloud-sync` has no
   floor, so a green run there says nothing about coverage.

Pull requests that change behaviour without touching tests are rejected.

## Flake hygiene

Before opening a PR, run the full suite and **read the exit code, not the pass
count.** Vitest reports an unhandled rejection as `Errors 1 error` and exits 1
while printing every test as passed. The JSON reporter does not include those
errors; they appear only on the default reporter's stderr.

### Reproducing a timing flake

Re-running a suspect test proves little. Oversubscribing the worker pool
reproduces timing flakes far more often:

```bash
cd frontend && pnpm exec vitest run --poolOptions.forks.maxForks=48
```

Add `--reporter=json --outputFile.json=<file>` to count failing test names
across runs, and keep stderr so unhandled errors are not lost.

Do not use `--poolOptions.forks.singleFork=true` on this suite: tests start
failing within seconds and the run does not finish.

### Order dependence

A test that only passes because another test ran first shows up in a shuffled
run, which shuffles files and the tests inside each file:

```bash
cd frontend && pnpm exec vitest run --sequence.shuffle
```

Vitest prints the seed (`Running tests with seed "…"`). Pass it back to
reproduce that exact order, and use it to verify a fix:

```bash
pnpm exec vitest run --sequence.shuffle --sequence.seed=<seed>
```

The usual deterministic form is running one block on its own:

```bash
pnpm exec vitest run <file> -t "<describe name>"
```

The usual cause is state a sibling test wrote that nothing clears, most often
`localStorage`. Give the block its own setup or clear the store in
`beforeEach`; do not reorder tests. State a component keeps at module scope is
cleared centrally in `setup.ts` instead (see
[Test setup to know about](#test-setup-to-know-about)); do not add a per-file
copy.

### Waiting on the right thing

Most flakes are an assertion reading a state the test never waited for.
Waiting for a mock to have been called is not waiting for its result:

```ts
// Races the response.
await waitFor(() => expect(api.getFile).toHaveBeenCalled());
expect(screen.getByTestId("title")).toHaveTextContent("Sample");

// Waits for the thing being asserted.
expect(await screen.findByTestId("title")).toHaveTextContent("Sample");
```

The same applies to a container rendered before its contents, such as a
`<select>` before its options. A negative assertion passes while nothing has
rendered yet, so pair it with a positive one in the same `waitFor`.

## See also

- [`.claude/rules/review-workflow.md`](../../.claude/rules/review-workflow.md):
  detector rules, and how a change is reviewed.
- [Backend development](backend-dev.md)
- [Frontend development](frontend-dev.md)
- [Contributing](contributing.md)
