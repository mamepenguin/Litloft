# Testing

Litloft has three test layers: unit, integration, end-to-end. Coverage target is 80%+; exact thresholds vary by directory.

## Backend tests

Run inside the test container — local Python 3.14 is incompatible with Litloft's pinned Pydantic.

```bash
docker build -f backend/Dockerfile.test -t litloft-test .
```

The build context is the **repository root**, not `backend/`. Tests reach `configure.py` and `docker-compose.override.yml.example`, which sit above it; `.dockerignore` keeps the context from including the media library.

```bash
docker run --rm litloft-test
```

### Addon backends

Each addon carries its own image. The build context differs between them, and
it follows the direction of the dependency.

`cloud-sync` and `media_import` run **in the core process** and their images
`COPY backend/app/`, so the addon and the core package it imports have to land
in one tree. Context is the repository root:

```bash
docker build -f addons/cloud-sync/Dockerfile.test -t cloud-sync-test .
docker run --rm cloud-sync-test

docker build -f addons/media_import/Dockerfile.test -t media-import-test .
docker run --rm media-import-test
```

`intelligence` and `knowledge` are **independent services** with their own `app`
package, and import nothing from core. Context is the addon directory:

```bash
docker build -f addons/intelligence/Dockerfile.test -t intelligence-test addons/intelligence
docker run --rm intelligence-test

docker build -f addons/knowledge/Dockerfile.test -t knowledge-test addons/knowledge
docker run --rm knowledge-test
```

Core's image does not pick any of these up, so a change to an addon backend
needs its own image run. The same asymmetry decides who tests what in CI: see
[CI](#ci) below.

Pass arguments through to `pytest`:

```bash
docker run --rm litloft-test -k internal_api_contract -vv
```

### The bootstrap script

`configure.py` is stdlib-only and is deliberately **not** copied into the
backend test image, so its tests run on a bare interpreter:

```bash
python3 -m pytest tests/test_configure.py
```

They build their own addon trees under `tmp_path`, so a checkout without
submodules is enough.

### What to test

- Routers: status code + response shape per endpoint.
- Services: business logic in isolation, especially scanner state transitions and atomic write failure paths.
- Models: `active_file_filter`, restore semantics, lifecycle transitions.
- Internal API contract tests: every endpoint exercised against its documented wire shape and validator parity.

### Patterns

- Use `import app.config as config` and patch attributes via `monkeypatch.setattr(config, "DATA_DIR", ...)`. Direct `from app.config import DATA_DIR` will not be patchable.
- Avoid mocking the database. Litloft has been bitten by mocked tests passing while real-DB migrations failed; integration tests should hit a real SQLite.
- For scanner tests, populate a temporary directory; do not depend on the project's own `videos/`.

## Frontend tests

```bash
cd frontend
pnpm test          # vitest run
pnpm test:watch    # vitest, watch mode
```

Library constraints:

- **vitest 3.x** only — vitest 4 has a rolldown native-bindings issue.
- **jsdom 25.x** only — jsdom 29 breaks ESM compatibility.
- **Node 20** is what CI and `frontend/Dockerfile` run. A newer local Node
  changes what jsdom hands back for Web Storage, so `src/test/setup.ts`
  installs its own Map-backed `localStorage` / `sessionStorage`
  unconditionally, and `src/test/__tests__/storage-shim.test.ts` guards that.
  Do not make the shim conditional: jsdom's `Storage` is a Proxy that turns
  `vi.spyOn(localStorage, "setItem")` into a *stored entry* named `setItem`,
  leaving the real method in place and the spy recording nothing.

### Addon frontends run here too

An addon's frontend has no runner of its own. Its components import core's
(`@/components`, `@/hooks`, `@/lib`), and `frontend/src/addons/<name>` is a
symlink into `addons/<name>/frontend`, so **core's vitest collects every addon
test**. `setup-addons.sh` creates those symlinks and they are gitignored;
without them the suite still passes, having silently collected nothing from any
addon.

What a fresh checkout needs before `pnpm test` is therefore:

```bash
./setup-addons.sh
pnpm install --dir frontend --frozen-lockfile
node frontend/scripts/merge-addon-messages.mjs
```

and nothing else — no `drives.json`, `passwords.json`, `.env`, or
`docker-compose.override.yml`.

`tsc --noEmit` follows the symlinks and type-checks addon sources; `eslint` does
not follow them and covers core only.

## MCP server tests

`mcp-server/` is a separate package with its own lockfile:

```bash
cd mcp-server
pnpm install --frozen-lockfile
pnpm test
pnpm exec tsc -p tsconfig.json --noEmit
```

### What to test

- Components — render, interaction, accessibility (where reasonable).
- Hooks (`useDebounce`, `useShortcuts`) — edge cases.
- API helpers (`saveFileTags`, especially the MIME branching) — unit tests with `msw` for network.

## End-to-end tests

Playwright. Launches a stack and walks the UI.

```bash
cd frontend
pnpm test:e2e          # headless
pnpm test:e2e --ui     # Playwright UI runner
```

Tests live under `frontend/e2e/`. Critical user flows:

- First-run setup wizard.
- Login (unlock a protected drive).
- Browse a folder, open a file, scrub a video.
- Upload a file via drag-and-drop.
- Trash → restore → permanently delete.
- (When intelligence is enabled) Ask, semantic search, scene search.

### Artefacts

Playwright produces screenshots, videos, and traces. Read them locally:

```bash
pnpm test:e2e --reporter=html
pnpm test:e2e:report
```

### Why e2e is not in CI

Deliberate, and worth restating before anyone "fixes" it:

- `playwright.config.ts` declares no `webServer`. The suite expects a live stack
  already answering on `localhost:3000`.
- The specs read the real library through `/api/drives` and **skip themselves
  when no drive answers** (`test.skip(() => !driveName)`). A CI run without
  seeded drives would skip almost everything and report green — the exact
  "passed, therefore fine" failure this CI exists to remove.
- Several assertions are written against a Japanese UI (`browse.spec.ts` expects
  `main h1` to contain `ドライブ`) while `defaultLocale` is `en`. The suite
  assumes a developer's own environment, not a clean one.

The e2e sources are not unguarded: `tsc --noEmit` and `eslint` both cover
`frontend/e2e/`, so type and syntax rot is caught. Putting the suite in CI needs
a compose profile that seeds a fixture drive first; that is its own piece of
work, not a workflow edit.

## Coverage

Backend: `pytest --cov=app --cov-report=term-missing`. Frontend: `pnpm test --coverage`. Open the HTML report under `coverage/`.

Aim for 80%+ unit + integration. Hard-to-test surfaces (the scanner's filesystem walking, ffmpeg integration) are exercised primarily via integration tests with real fixtures.

## What not to mock

- The database. Use SQLite in tests; mocked SQLAlchemy hides migration / constraint bugs.
- The filesystem in scanner tests. Use a temp dir.
- ffmpeg in thumbnail tests. Use a real ffmpeg or skip the test under `pytest.skipif`.

## What to mock

- HTTP clients in addon tests when calling external APIs (LLM providers, transcription cloud).
- Time (`freezegun` or equivalent) for trash auto-purge tests.
- The WebSocket broadcaster — capture events via a test double rather than a real connection.

## TDD workflow

For new features and bugfixes:

1. Write the test first (RED).
2. Run; it should fail.
3. Implement the minimum to make it pass (GREEN).
4. Refactor (IMPROVE).
5. Verify coverage stayed at 80%+.

The repo expects this rhythm; PRs that change behaviour without touching tests are rejected.

## Flake hygiene

Before opening a PR:

- Run the full suite once, and **read the exit code, not the pass count.**
  Vitest reports an unhandled rejection as `Errors 1 error` and exits 1
  while still printing every test as passed. The JSON reporter does not
  carry those at all — they reach the default reporter's stderr only.
- Use Playwright's `--repeat-each=5` for new e2e tests to spot flakes.

### Reproducing a frontend flake

Running a suspect test again proves nothing: these failures cluster, and
a long green streak says only that the timing went the other way. What
does reproduce them is **oversubscribing the worker pool**, which starves
every worker evenly instead of starving the machine:

```bash
cd frontend && pnpm vitest run --poolOptions.forks.maxForks=48
```

On a 16-core machine that raised the observed failure rate from roughly
one run in twenty-five to seven runs in eight, at the same 30 seconds per
run. Loading the machine from outside does not work — it slows the suite
far more than it perturbs it.

Two things make the output usable: `--reporter=json --outputFile.json=…`
so failing test names can be counted across runs, and keeping stderr, so
unhandled errors are not lost.

### The shape almost every one of these has

An assertion reading a state the test never waited for. In particular,
**waiting on a mock having been called is not waiting for its result**:
the call is made during the first commit, so the wait is already
satisfied when it runs and returns before the response lands.

```ts
// Races the response.
await waitFor(() => expect(api.getFile).toHaveBeenCalled());
expect(screen.getByTestId("title")).toHaveTextContent("Sample");

// Waits for the thing being asserted.
expect(await screen.findByTestId("title")).toHaveTextContent("Sample");
```

The same holds for a container that is rendered before its contents — a
`<select>` before its options, a filter box before the listing. Waiting
for the element finds it empty, and the interaction that follows lands on
a node the loaded layout then replaces.

A negative assertion has the mirror problem: it passes while nothing has
rendered yet, so it needs a positive control beside it — assert what
*should* appear in the same `waitFor`, or the test is vacuous forever.

Testing Library's async budget is raised to 3000 ms in
`frontend/src/test/setup.ts`. It is a wall-clock budget and the speed of
the machine is not part of any test's contract; a wait on a condition
that is never satisfied still fails, only later. Do not paper over a
wrong wait by raising it further.

## CI

GitHub Actions, one workflow per repository (`.github/workflows/ci.yml`), on
every pull request and on pushes to the default branch.

### Core

| Job | What it runs |
|---|---|
| `frontend` | `setup-addons.sh`, install, merge translations, then `pnpm test`, `tsc --noEmit`, `pnpm lint` |
| `mcp-server` | `pnpm test`, `tsc --noEmit` |
| `backend` | `backend/Dockerfile.test` built and run |
| `bootstrap` | `pytest tests/test_configure.py` on a bare Python 3.12 |
| `addon-backends` | `cloud-sync` and `media_import` test images built and run |
| `frontend-image` | `frontend/Dockerfile` built, which is what runs `next build` |

`frontend` checks out submodules recursively, so it tests the **pinned** addon
commits. `design-tokens.test.ts` and `i18n-keys.test.ts` walk `addons/*/frontend`
directly, so an addon pointer left behind fails the job — which is what makes
the submodule bump described in [CLAUDE.md](../../CLAUDE.md) load-bearing.

`frontend-image` exists because `next build` is covered by nothing else, and
cannot be run against the `frontend/src/addons` symlinks: Turbopack fails to
resolve the dynamic `@/addons/<name>/Page` import through them. `frontend/Dockerfile`
deletes the symlinks and copies the addon trees in first, so building the image
is the only honest rehearsal of the production build.

### Addons

Each addon repository has its own workflow with two jobs.

Its **backend** job depends on which way the addon points. `intelligence` and
`knowledge` are independent services and build their own image from their own
checkout. `cloud-sync` and `media_import` compile against core's `app` package,
so their images need a core tree; those two are *also* run by core's own CI,
because a core change is what breaks them.

Its **frontend** job checks out core `develop` with submodules, replaces
`addons/<name>` with the commit under test, and runs core's whole suite. That is
not redundancy: an addon's frontend tests only exist inside core's runner, and
running them this way is what verifies the addon against the core it is about to
be pinned into.

### The rule the workflows are built around

**Read the exit code, never the pass count.** No step pipes a test command into
`tee`, a formatter, or a summariser; no step sets `continue-on-error`; no vitest
run passes `--reporter=json`. Vitest reports an unhandled rejection as
`Errors 1 error` while printing every test as passed, and exits 1 — and its JSON
reporter does not carry those errors at all. Four PRs merged through that gap.
If you need more output from a failing job, make the command itself louder;
do not wrap it.

`ruff` and `mypy` are not run: the repository configures neither and installs
neither.

### Branch protection

Both branches that CI guards — `develop` on core, `main` on each addon — carry
**classic branch protection** (the `branches/*/protection` API, not a ruleset)
listing that repository's job names as required status checks.

What is deliberately *not* set:

- **No required reviewers.** A single-developer repository with mandatory review
  cannot merge its own pull requests.
- **`enforce_admins` is false**, so an administrator can still force a merge
  that is genuinely stuck.
- **`strict` is false**, so a branch does not have to be rebased onto the tip
  before merging.

Read the current setting, or take it off:

```bash
gh api repos/mamepenguin/Litloft/branches/develop/protection
gh api -X DELETE repos/mamepenguin/Litloft/branches/develop/protection
```

Substitute a repository and `main` for the addons. Note that GitHub offers two
independent mechanisms and the API above only sees one of them: core also has a
**ruleset** on `refs/heads/main` (deletion and non-fast-forward, unrelated to
CI), and anything added later through the web UI defaults to a ruleset too.
Those live at `gh api repos/mamepenguin/Litloft/rulesets`, and the delete above
will not touch them.

## See also

- [Backend development](backend-dev.md)
- [Frontend development](frontend-dev.md)
- [Contributing](contributing.md)
