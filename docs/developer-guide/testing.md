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

Each addon carries its own image, built from the repository root for the same
reason — an in-process addon imports the core `app` package, so both have to
land in one tree:

```bash
docker build -f addons/cloud-sync/Dockerfile.test -t cloud-sync-test .
docker run --rm cloud-sync-test
```

`knowledge`, `intelligence` and `media_import` follow the same shape. Core's
image does not pick these up, so a change to an addon backend needs its own
image run.

Pass arguments through to `pytest`:

```bash
docker run --rm litloft-test -k internal_api_contract -vv
```

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

Playwright produces screenshots, videos, and traces. CI uploads these on failure for diagnosis. Locally:

```bash
pnpm test:e2e --reporter=html
pnpm test:e2e:report
```

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

CI runs:

- Backend pytest in the test container.
- Frontend `pnpm test`.
- Playwright e2e against a freshly-built compose stack.
- Linting (`ruff`, `eslint`) and type-checking (`mypy`, `tsc --noEmit`).

A failed lint or type check blocks merge. A failed flaky e2e test should be quarantined (skipped with a referenced issue) rather than retried.

## See also

- [Backend development](backend-dev.md)
- [Frontend development](frontend-dev.md)
- [Contributing](contributing.md)
