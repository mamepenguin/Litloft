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
- **Node 20** is what CI and `frontend/Dockerfile` run. `src/test/setup.ts`
  replaces Web Storage with its own Map-backed shim, so the suite no longer
  runs against a different storage object depending on the local Node version.
  `src/test/__tests__/storage-shim.test.ts` guards two properties of that shim,
  and both were learned the hard way:

  - **It is installed unconditionally.** It used to appear only where jsdom
    handed back an empty `{}`, which is version-dependent. jsdom's `Storage` is
    a Proxy whose defineProperty trap treats any string key as a stored entry,
    so `vi.spyOn(localStorage, "setItem")` against it writes a storage item
    named `setItem`, leaves the real method in place, and records nothing.
  - **It is a class, with `globalThis.Storage` pointing at it.** Do not
    "simplify" it into an object literal. Tests that make storage throw patch
    `Storage.prototype` — `nativePlayerUi`, `mediaLayout` and `listSnapshot` all
    do — and a literal shares no prototype with anything, so those patches land
    where the instance never looks and three error-path tests quietly stop
    testing their error path.

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

### What to test

- Components — render, interaction, accessibility (where reasonable).
- Hooks (`useDebounce`, `useShortcuts`) — edge cases.
- API helpers (`saveFileTags`, especially the MIME branching) — unit tests with `msw` for network.

## MCP server tests

`mcp-server/` is a separate package with its own lockfile:

```bash
cd mcp-server
pnpm install --frozen-lockfile
pnpm test
pnpm exec tsc -p tsconfig.json --noEmit
```

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

### Layout invariants, which are a separate suite

`frontend/e2e-layout/` is also Playwright, and has nothing else in common with
the eleven specs above. It opens a **static page off `file://`** — no app, no
backend, no drives — carrying the app's own compiled `globals.css`, and measures
the boxes Chromium produces. There is one fixture and one spec per property:
`justified-grid` (cell ratios and line filling), `related-files` (the rail's
tiles), `addon-policy` (a sticky table heading), `file-actions-menu` (which
side of a trigger a popup lands on) and `mobile-inspector-sheet` (where the
Bottom Sheet's drawer, scroller and tab strip land at each snap, and whether the
end of a tab can be brought on screen).

```bash
cd frontend
pnpm test:e2e:layout          # a few seconds, browser already installed
```

The CI job around it has finished **under a minute in every run**, with the
ceiling at 57s on a cold cache — 25s of which was the Chromium download. Only
`bootstrap` and `mcp-server` are cheaper; `frontend` and the two Docker jobs are
minutes.

**The stable part is the test step: 6-7s in every run so far** (6 at 22 tests,
7 at 26). Everything else is preamble — checkout, `setup-node`, `pnpm install`, and the apt half of
`playwright install --with-deps`, which runs on a cache hit too — and that is
where the run-to-run spread lives. It is spread, not one step: between two warm
runs that differed by 9s, apt carried 5 of them, `setup-node` 2, and six of the
eight steps moved. Read the current figures from the job rather than from here;
these are the runs on one branch, and the runner varies.

It has its own config (`playwright-layout.config.ts`) so that neither run can
pull the other in, and its `globalSetup` compiles `src/app/globals.css` into the
sheet the fixture links, so there is no build step to forget. **It is the one
job in CI that starts a browser** — `frontend (layout invariants in a browser)`.

Why it exists: jsdom lays nothing out. Every `getBoundingClientRect()` in
`justifiedGrid.test.tsx` returns zeros, so a cell drawn at the wrong aspect
ratio measures exactly like one drawn at the right one, and what that file
settled for instead is reading `globals.css` as a string and checking the
declarations are present. In #200 that was measured and found wanting: the
defect came back in full by appending one line to the end of the stylesheet, and
every suite stayed green through two rounds of review. **Text matching cannot
verify a layout.** A later rule at any specificity, an `@media` / `@container` /
`@layer` block, or an inline style each override a declaration that is still,
textually, right where the assertion looks for it.

What `file-actions-menu` holds, measured in Chromium:

- the `⋮` menu hung `top-full` inside the Bottom Sheet's 56px resting strip
  starts at the bottom edge of the screen and runs off it, and `bottom-full`
  brings the whole box back — at two phone heights and three menu lengths, with
  both directions giving the menu the same height, which is what lets a
  `ResizeObserver` drive the flip without oscillating;
- a `whitespace-nowrap` error toast hung `right-0` from a trigger at its
  column's left edge crosses that edge, and `left-0` keeps it inside both of
  them.

What **justified-grid** holds, all of it measured rather than matched. This list
and every paragraph after it is about that fixture, which is the oldest and the
most worked-over; the others follow the same shape, each with its own parity
test:

- a justified cell's realized aspect ratio equals its `--jg-ratio`, at five grid
  widths;
- the `max-height` ceiling — a cell that reaches it keeps its width and gives up
  its ratio;
- the row height the container query picks, and the 40rem boundary it picks it
  at, read as a length;
- that every line but the last ends flush with the grid, and that the last one
  stays at its bases — which is where `.justified-grid-tail`'s `flex-grow: 9999`
  becomes visible as a number;
- the `[data-flip]` transition Chromium resolves, against the hook's own
  `FLIP_DURATION_MS`;
- all of the above **once per declared cell shape** — every class list the cell
  can carry (six for `JustifiedFileCell`, two for `ArchiveEntryCard`), and
  every element, attribute and class either component puts inside a cell.

This last is the axis that decides what a selector can reach, and it has cost
three rounds of findings, because a browser suite sees only the markup the
fixture writes. Each of these breaks a shipped cell and was green while the
fixture drew less than the app does: `button.justified-grid-cell`,
`.justified-grid-cell.overflow-hidden`, `.justified-grid-cell.select-none`,
`.justified-grid-cell.opacity-50.select-none` (cut a file in a folder grid),
`.justified-grid-cell[draggable]` (React writes it on every photo cell,
`"false"` included), `:has(.justified-grid-name)`, `:has(> a[download])`.

The rows are **not** the cross product of the class axis with the wrapper
states, and the two things that leaves out are named in the fixture's own
table rather than left to be discovered.

The fixture's fidelity is itself asserted, in the other suite.
`src/components/__tests__/justifiedGridFixtureParity.test.tsx` declares one
render state per row, renders it, and requires the row to match — element, class
list, attributes and descendant tree, all compared exhaustively. It is a parity
test rather than one table read twice: one side is a React render, the other
hand-written HTML.

**The shape of that comparison is the part to keep.** It compared a flattened
token vocabulary once, and two rows went missing from the table without either
side noticing — every token still appeared somewhere, so the sets stayed equal.
That is detector rule 5: an expected value built out of the observation catches
wrong values and unregistered additions but cannot catch a deletion. Expected
sets are declared per state now, and every looser variant of the comparison that
was tried let a deletion through — a subset check on children let three, a subset
check on attributes let one more. Thirty-two mutations on both sides, all
killed.

**What it cannot see, because there is no app in it:** the forced reflow
(`void grid.offsetWidth`) between `useJustifiedFlip`'s invert and play, the
hook's settle timing, its rect rounding, its unmount cleanup, and the FLIP
wiring itself. Those are jsdom's, by postcondition, in
`useJustifiedFlip.test.tsx`. An inline `style` written by a component rather
than by the fixture is in the same class. A green tick here says nothing about
any of them.

**And the case list is finite.** The fixture sizes the window to the grid, so a
`@media` rule keyed to a phone width is now tested at a phone width; but a query
keyed outside the range the tested widths imply — `@container justified-grid
(min-width: 1500px)`, past the widest grid here — is unreachable and survives.
Adding a width is how that closes, not prose. Likewise the parity test knows the
two components that write a `.justified-grid-cell` today; a third would arrive
unnoticed until someone gave it a row in the table.

### Why e2e is not in CI

Deliberate, and worth restating before anyone "fixes" it:

- `playwright.config.ts` declares no `webServer`. The suite expects a live stack
  already answering on `localhost:3000`.
- Ten of the eleven read the real library through `/api/drives` and **skip
  themselves when no drive answers** (`test.skip(() => !driveName)`). A CI run
  without seeded drives would skip almost everything and report green — the
  exact "passed, therefore fine" failure this CI exists to remove. The
  eleventh, `source-capture.spec.ts`, carries no guard and would go red
  instead. Neither result is a check.
- Several assertions are written against a Japanese UI (`browse.spec.ts` expects
  `main h1` to contain `ドライブ`) while `defaultLocale` is `en`. The suite
  assumes a developer's own environment, not a clean one.

The e2e sources are not unguarded: `tsc --noEmit` and `eslint` both cover
`frontend/e2e/`, so type and syntax rot is caught. Putting the suite in CI needs
a compose profile that seeds a fixture drive first; that is its own piece of
work, not a workflow edit.

This reasoning is about **these eleven specs**, not about browsers. The layout
suite above runs in CI precisely because it shares none of the three problems:
nothing to serve, nothing to seed, and nothing to skip.

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

### The other shape: a test that needs another test to have run first

The failures above are about timing. This one is about order, and no amount
of re-running in the usual order will show it — that order is the only reason
it passes.

```bash
cd frontend && pnpm exec vitest run --sequence.shuffle
```

That shuffles the files *and* the tests inside each file, which is the half
that matters: both defects found the day this was written were between two
tests in one file. Vitest prints the seed it picked —
`Running tests with seed "1788505971306"` — and passing it back reproduces
that exact order:

```bash
pnpm exec vitest run --sequence.shuffle --sequence.seed=1788505971306
```

Use that to verify a fix, rather than watching shuffled runs come back green.
A shuffle that happens to pick a harmless order proves nothing, and eight of
them prove nothing eight times. The deterministic form of the bug is usually
"run this block on its own":

```bash
pnpm exec vitest run <file> -t "the second describe"
```

Both examples were the same defect, and it is worth recognising: **state a
sibling test wrote, that nothing clears between tests.** `localStorage` in
both cases — a capture basket seeded in one `describe` and read in the next,
and a loop toggle that one test switches off and the next expects on. The
fix is never to reorder; it is to give the block its own setup, or to clear
the store in `beforeEach`.

The `frontend (shuffled order)` CI job runs this on every pull request so
the next one does not have to be found by hand.

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
| `frontend` | `setup-addons.sh`, install, merge translations, the collection check below, then `pnpm test`, `tsc --noEmit`, `pnpm lint` |
| `frontend (shuffled order)` | the same suite under `--sequence.shuffle`. Required since 2026-09 — when it is red, reproduce with its seed rather than re-running; see below |
| `frontend (layout invariants in a browser)` | `frontend/e2e-layout/` under Chromium — the geometry jsdom cannot see. Not required yet; see below |
| `mcp-server` | `pnpm test`, `tsc --noEmit` |
| `backend` | `backend/Dockerfile.test` built and run |
| `bootstrap` | `pytest tests/test_configure.py` on a bare Python 3.12 |
| `addon-backends` | `cloud-sync` and `media_import` test images built and run |
| `images` | `frontend/Dockerfile` and `backend/Dockerfile` built |

`frontend` checks out submodules recursively, so it tests the **pinned** addon
commits — the pairing a fresh clone would get, not each addon's branch tip.

Be precise about what that catches, because it is easy to overclaim.
`design-tokens.test.ts` and `i18n-keys.test.ts` walk `addons/*/frontend`
directly, so the job fails when pinned addon code uses a design token core has
removed, or ships a message namespace that displaces one of core's. It also
fails when a submodule did not check out at all: `i18n-keys.test.ts` asserts it
found at least one addon catalogue, and an uninitialised submodule leaves an
empty directory rather than no directory.

What it does **not** catch is a pointer that is simply behind, on an addon tree
that is still internally consistent with core. That passes. The submodule bump
described in [CLAUDE.md](../../CLAUDE.md) is enforced here only to the extent
that the older code actually conflicts; the rest of it is still a review
responsibility.

Before running the suite, the job asks `vitest list --filesOnly` what it
actually collected, and fails naming any addon that contributed nothing. This is
the step that makes the green tick mean something: a submodule that did not
check out, or a symlink `setup-addons.sh` did not make, costs nothing at
collection time — vitest simply finds fewer files and reports every remaining
one as passing. It is the **first** line of defence for that, and
`i18n-keys.test.ts`'s "found at least one addon catalogue" assertion is the
second. Neither is redundant; do not remove one on the strength of the other.

Each addon's own workflow runs the same check for itself.

`images` builds what no test builds. For the frontend that is `next build`,
covered by neither vitest nor tsc, and impossible to run against the
`frontend/src/addons` symlinks: Turbopack fails to resolve the dynamic
`@/addons/<name>/Page` import through them. `frontend/Dockerfile` deletes the
symlinks and copies the addon trees in first, so building the image is the only
honest rehearsal. The backend earns a build by the same argument — its
production Dockerfile has steps the test image does not share, notably the addon
copy loop and the `addons/__init__.py` it creates.

### Addons

Each addon repository has its own workflow with two jobs.

Its **backend** job depends on which way the addon points. `intelligence` and
`knowledge` are independent services and build their own image from their own
checkout. `cloud-sync` and `media_import` compile against core's `app` package,
so their images need a core tree; those two are *also* run by core's own CI,
because a core change is what breaks them.

Its **frontend** job checks out core `develop` with submodules, replaces
`addons/<name>` with the commit under test, checks that `vitest list` collected
that addon, and runs core's whole suite. That is not redundancy: an addon's
frontend tests only exist inside core's runner, and running them this way is
what verifies the addon against the core it is about to be pinned into. The
collection check is what stops a tree that failed to land from producing a
green run that tested none of it.

**An addon's CI result is not reproducible, by design.** That job resolves
`develop` to whatever its tip is at run time, not to a fixed SHA, so a pull
request that changes nothing in the addon can turn red later because core moved
underneath it. There is no way around it — an addon's frontend tests only run
inside a core tree — and it is not a defect, but it will cost you an afternoon
if you meet it without knowing. The symptom is a red job on a branch you have
not touched, failing in a core file. Re-run it; if core has since merged the
fix, that is all it needs. This has already happened once: the four addon pull
requests that introduced these workflows were all red on a single core test
until core's own fix merged.

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

Core's `develop` carries **classic branch protection** (the
`branches/*/protection` API, not a ruleset) listing eight of core's nine job
names as required status checks. The ninth,
`frontend (layout invariants in a browser)`, is not on the list yet: it has no
run history here, and the same argument that kept `frontend (shuffled order)`
off at first applies until it has one. Adding it is a protection edit, not a
workflow edit. `frontend (shuffled order)` joined the list in
2026-09; the reasoning is below, because a check that runs the suite in a
different order each time is an unusual thing to make mandatory and the case
for it is not the one first expected. The four addon repositories' `main`
branches will carry the same shape, with their own two job names, once their
workflows have been observed green; until then they are unprotected.

What **is** set, and was not at first:

- **`frontend (shuffled order)` is required**, since 2026-09-05. It was kept
  off the list through the redesign's largest phase on the theory that a random
  seed could block a pull request over a test order nobody chose and which the
  next run would not pick again. **The measurement did not support that.**

  Between the job landing and Phase 2 finishing — 48 runs across 15
  pull-request branches — it went red **once**, with **no false positives**: no
  case of a red with nothing behind it that a re-run turned green. Where the
  false-positive rate is zero, a red is a defect, and a defect is a red worth
  stopping for.

  **What it buys is a second sample of a non-deterministic suite**, which is
  broader than the order-dependence detector it was built as — and is the
  stronger case for making it mandatory. Not everything it has surfaced was
  order dependence. One was a shared module mock that a test left dirty, which
  is. One was a passive-effect flush race, which is not: the run that caught it
  had the tests in source order, and the same race had already reddened the
  **required** `frontend (vitest / tsc / eslint)` job once, in a run where this
  job was green. Two independent samples of one flaky suite, each catching it
  once. A check that only found ordering bugs would have a narrow claim on being
  required; one that finds non-determinism whose kind has no name yet has a wide
  one.

- **When it goes red, take the seed from its log, reproduce, and fix the
  non-determinism.** Do not re-run until it is green. On a zero-false-positive
  record, re-running past a red is waving through a real defect — and the next
  person to meet it will have less to go on than you have now.

What is deliberately *not* set:

- **No required reviewers.** A single-developer repository with mandatory review
  cannot merge its own pull requests.
- **`enforce_admins` is false**, so an administrator can still force a merge
  that is genuinely stuck — including one stuck behind the shuffled job, though
  see the line above for why that is the wrong reflex.
- **`strict` is false**, so a branch does not have to be rebased onto the tip
  before merging.

**A required check is matched by the job's `name:` string, literally.** Rename a
job and the old name stays required forever: it can never be reported again, so
every pull request sits on "Expected — Waiting for status to be reported" while
the renamed job, no longer on the list, is free to fail without blocking
anything. The protection is then simultaneously stricter and emptier than it
looks. Renaming a job is therefore a two-part edit — the workflow and the
protection, together. This has already been got wrong once, when
`frontend image (next build)` became `production images`.

Read the current setting, or take it off:

```bash
gh api repos/mamepenguin/Litloft/branches/develop/protection
gh api -X DELETE repos/mamepenguin/Litloft/branches/develop/protection
```

Substitute a repository and `main` for an addon, once it has been protected.
Note that GitHub offers two independent mechanisms and the API above only sees
one of them: core also has a
**ruleset** on `refs/heads/main` (deletion and non-fast-forward, unrelated to
CI), and anything added later through the web UI defaults to a ruleset too.
Those live at `gh api repos/mamepenguin/Litloft/rulesets`, and the delete above
will not touch them.

## See also

- `.claude/rules/review-workflow.md` — the detector rules (what an enumerating
  test must assert, and why a lower bound is never enough), and how a change is
  reviewed before it merges.
- [Backend development](backend-dev.md)
- [Frontend development](frontend-dev.md)
- [Contributing](contributing.md)
