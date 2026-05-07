# Testing

Litloft has three test layers: unit, integration, end-to-end. Coverage target is 80%+; exact thresholds vary by directory.

## Backend tests

Run inside the test container — local Python 3.14 is incompatible with Litloft's pinned Pydantic.

```bash
docker build -f backend/Dockerfile.test -t litloft-test backend/
docker run --rm litloft-test
```

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
pnpm test
pnpm test --watch
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
pnpm e2e            # headless
pnpm e2e --ui       # Playwright UI runner
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
pnpm e2e --reporter=html
pnpm playwright show-report
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

- Run the full suite once.
- For tests with timing or ordering, run them twice. If different on the second run, fix the flake before merging.
- Use Playwright's `--repeat-each=5` for new e2e tests to spot flakes.

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
