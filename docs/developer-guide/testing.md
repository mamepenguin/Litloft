# Testing

Litloft has three test layers: unit, integration, end-to-end. Where coverage is gated, the threshold is set at what that package measures today, not at an aspirational figure — see [Coverage](#coverage) for the frontend's four and how to move them.

Which packages are gated is not uniform, and the gaps are decisions rather than
omissions. The table is the list; add a row when you add a package, and say in it
why, if it is not gated.

| package | measured | gated | notes |
|---|---|---|---|
| `frontend/` | istanbul | four thresholds, below | — |
| `backend/` | `--cov=app` | not yet | the floor lands with the unit that adds it; until then the command reports and nothing refuses |
| `mcp-server/` | not yet | not yet | same unit |
| `addons/intelligence` | `--cov=app` | yes | floor and its bracket in that repo's `pytest.ini` |
| `addons/knowledge` | `--cov=app` | yes | same |
| `addons/media_import` | `--cov=addons.media_import` | yes | same |
| `addons/cloud-sync` | `--cov=addons.cloud_sync` | **no floor** | out of scope by decision; it is the lowest-covered package in the tree |
| `configure.py` | **not measured** | — | it runs on a bare interpreter outside the test image, so measuring one file means standing up a second mechanism. `tests/test_configure.py` holds the three mount invariants from `design-decisions.md` instead |

The addon floors are deliberately not repeated here. They live in the repository
that enforces them, beside the bracket that was measured to set them, and a copy
in this file would be one nothing re-runs — which is how a figure goes false
without anyone touching it.

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

- **Every test ends with a `pointercancel` at `document`.** `setup.ts`
  dispatches one after each test, and
  `src/test/__tests__/press-lift.test.tsx` guards it the way
  `storage-shim.test.ts` guards the shim.

  It is there because `DismissScrim` keeps two pieces of module-scope state
  across a file — a press in flight, and an armed click-swallow — and
  `fireEvent.pointerDown` has no reason to end either. A test that presses
  without lifting hands both to the next test in the file: a popup mounted
  then arms a swallow for a press that is already over, and a plain
  `fireEvent.click` can be eaten outright. `pointercancel` is the one event
  that ends the press *and* abandons the swallow.

  Two things about it are worth knowing before they cost an afternoon. It
  runs **before** Testing Library's `cleanup()`, so it lands on a tree that
  is still mounted: a component that ends a drag on a document-level
  `pointercancel` will run its drag-end handler during teardown, outside
  `act()`, and the act warning will name a file whose author changed
  nothing. And it does **not** bubble, so a `window`-level bubble listener
  — `usePlayerGestures` follows a scrub on one — never sees it; a gesture
  that leaks the same way from there needs its own lift.

### Addon frontends run here too

An addon's frontend has no runner of its own. Its components import core's
(`@/components`, `@/hooks`, `@/lib`), and `frontend/src/addons/<name>` is a
real directory holding one symlink per file of `addons/<name>/frontend`, so
**core's vitest collects every addon test**. A directory rather than a symlink
to one, because tools that walk the tree do not descend a symlinked directory —
that is what kept addon files no test imports out of the coverage denominator.
`setup-addons.sh` builds it and it is gitignored; without it the suite still
passes, having silently collected nothing from any addon.

What a fresh checkout needs before `pnpm test` is therefore:

```bash
./setup-addons.sh
pnpm install --dir frontend --frozen-lockfile
node frontend/scripts/merge-addon-messages.mjs
```

and nothing else — no `drives.json`, `passwords.json`, `.env`, or
`docker-compose.override.yml`.

`tsc --noEmit` follows the links and type-checks addon sources; `eslint` covers
core only, because `frontend/eslint.config.mjs` ignores `src/addons/**`.
Nothing lints the addon frontends today — none of the four addon repositories
has an eslint config or a `package.json` — so `tsc` is the only static check
those files get.

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

### Components in a browser, which is a third suite

`frontend/e2e-components/` is Playwright again, and it is the only place in the
tree where **a real component is driven by a real gesture**. The repo's own vite
bundles `fixtures/app.tsx`, which imports `DismissScrim`, `ContextMenu` and
`useContextMenu` out of `src/`; Playwright then drives the bundle in an emulated
Pixel 5 with CDP `Input.dispatchTouchEvent`, so the compatibility `click` after
`touchend` is Chromium's own.

```bash
cd frontend
pnpm test:e2e:components       # a few seconds, including the bundle
```

Why it exists, plainly: `e2e-layout/` cannot import a `.tsx`. Its fixtures
hand-write a copy of whatever mechanism they measure, and a copy is right by
construction — so a component can stop doing the thing while its fixture keeps
passing. Unit F shipped four functional defects across four review rounds and
**every one of them passed the browser suite**, including one the new mechanism
created: a popup raised by a 500 ms long press had no swallow armed for the
click that press produces, so long-pressing a file card opened its menu *and*
navigated to the file. Nothing in the tree could see it until a target that runs
the component existed.

What it holds that `e2e-layout` cannot:

- the component itself, through React's own dispatch path (handlers delegated at
  the root container, under a swallow that stops the click at `document` above
  it);
- gestures no `page.touchscreen` API expresses — a **long press** is touchStart,
  a wait, touchEnd, and only CDP can hold one open.

What it still cannot hold: the *pages* are hand-written. `SelectionBar`,
`InspectorShell` and `FileCard` need Next.js, `next-intl` and a backend, so what
is measured is the real primitive inside a copy of their arrangements — a
`fixed bottom-0 z-50` bar, a sticky strip written after the scrim, a transformed
ancestor, a long-press opener. It is Chromium only, like the layout suite.

### Layout invariants, which are a separate suite

`frontend/e2e-layout/` is also Playwright, and has nothing else in common with
the eleven specs above. It opens a **static page off `file://`** — no app, no
backend, no drives — carrying the app's own compiled `globals.css`, and measures
the boxes Chromium produces. There is one fixture and one spec per property:
`justified-grid` (cell ratios and line filling), `related-files` (the rail's
tiles), `addon-policy` (a sticky table heading), `file-actions-menu` (which
side of a trigger a popup lands on) and `mobile-inspector-sheet` (where the
Bottom Sheet's drawer, scroller and tab strip land at each snap, whether the
end of a tab can be brought on screen, and whether the sheet's derived `half`
leaves the player above it).

```bash
cd frontend
pnpm test:e2e:layout          # a few seconds, browser already installed
```

The CI job around it has finished **under a minute in every run**, with the
ceiling at 57s on a cold cache — 25s of which was the Chromium download. Only
`bootstrap` and `mcp-server` are cheaper; `frontend` and the two Docker jobs are
minutes.

**The stable part is the test step: 6-7s in every run so far**, and it has stayed
there across every size the suite has been — the count is in the job's own output
and in the PR that changed it, not here, because a figure written down here is
one nobody re-measures. Everything else is preamble — checkout, `setup-node`, `pnpm install`, and the apt half of
`playwright install --with-deps`, which runs on a cache hit too — and that is
where the run-to-run spread lives. It is spread, not one step: between two warm
runs that differed by 9s, apt carried 5 of them, `setup-node` 2, and six of the
eight steps moved. Read the current figures from the job rather than from here;
these are the runs on one branch, and the runner varies.

It has its own config (`playwright-layout.config.ts`) so that neither run can
pull the other in, and its `globalSetup` compiles `src/app/globals.css` into the
sheet the fixture links, so there is no build step to forget. It shares its CI
job with the component suite below —
`frontend (layout invariants and components in a browser)` — which is **the one
job in CI that starts a browser**.

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

Backend: `docker run --rm litloft-test` measures on every run — the flags are in
`backend/pytest.ini`, not in the image's CMD, so a partial run (`pytest -k x`) is
measured too. Frontend: `pnpm exec vitest run --coverage`. mcp-server:
`pnpm exec vitest run --coverage`.

The frontend command is spelled out rather than `pnpm test --coverage`, because
that is what CI runs and it should not depend on argument forwarding through a
package script; `pnpm test` stays the plain, faster run. There is no HTML report
in CI. Locally, ask for it
alongside the others rather than instead of them:

```bash
pnpm exec vitest run --coverage \
  --coverage.reporter=text-summary --coverage.reporter=json-summary \
  --coverage.reporter=html
```

then open `frontend/coverage/index.html`. `--coverage.reporter=html` on its own
**replaces** the configured reporters: the run prints no coverage summary and
writes no `coverage-summary.json`, so the denominator check run afterwards fails
with "No …/coverage-summary.json … This is never a pass" — a false alarm produced
by following two instructions from this page in a row.

Hard-to-test surfaces (the scanner's filesystem walking, ffmpeg integration) are
exercised primarily via integration tests with real fixtures.

### Floors, and the two rules that make them mean something

A floor is a lower bound, so it cannot see the denominator shrink: drop files
from the population and the percentage goes *up*. Every package that carries one
therefore also runs a population check, which asks the collector what it measured
and compares that against an independent walk of the tree, as sets, failing in
both directions. `backend/scripts/check-coverage-population.py` and
`mcp-server/scripts/check-coverage-population.mjs` are those; each says in its
own docstring what it catches.

**A Python floor never goes in `addopts`.** `--cov-fail-under` there fails every
partial run, so `pytest tests/test_files.py` would exit 1 on passing tests —
including the single-file reproductions a reviewer is asked to run. A floor is a
claim about a complete run, so it lives where completeness is known: the CI step,
as `PYTEST_ADDOPTS`, which appends to the image's CMD rather than replacing it.

**A Python floor is the truncated total, never the rounded one.** coverage.py
prints its pass/fail message from the raw total and computes its exit code from
the rounded one, so the two disagree wherever a total rounds up: at such a value
a run prints `FAIL … not reached` and still exits 0. Truncate, and bracket the
exit code rather than reading the message. `--cov-precision=2` widens the
comparison from whole percents to two decimals and is load-bearing for the same
reason.

vitest does not share that defect, and its absence is structural rather than
lucky: `istanbul-lib-coverage` truncates with `Math.floor` and vitest compares
the same figure it displays, so the number shown and the number compared cannot
diverge. A vitest floor goes at the displayed value.

No floor value is repeated in this page. Each lives in the file that enforces it,
beside the bracket measured to set it; a copy here would be one nothing re-runs.

### The frontend thresholds, and why they are four numbers

| metric | threshold | CI, 5 samples | this machine, 20 runs |
|---|---|---|---|
| statements | **77.33** | 77.33 | 77.35 – 77.36 |
| lines | **79.76** | 79.76 | 79.78 |
| functions | **73.83** | 73.83 – 73.85 | 73.88 – 73.90 |
| branches | **71.86** | 71.86 – 71.89 | 71.86 – 71.88 |

Four numbers because they are four claims; one figure standing for four hides
which of them moved. Raise them when coverage rises. Do not lower one to make a
build pass without saying so in the commit that does it.

**The thresholds are CI's numbers, and a higher local number is not headroom.**
Coverage here is machine-dependent — CI's two cores report 0.02 to 0.05 lower
than a 16-core machine on the same tree, because some time-dependent path does
not execute the same way. The *denominator* is not machine-dependent: istanbul
fixes the population before anything runs, and all four totals are identical on
both (21383 statements / 18946 lines / 14198 branches / 5109 functions).

That identity is what makes the two sets of numbers comparable at all — the same
population, differently covered — and it is why the floor belongs at CI's value.
A floor is a claim about the environment that enforces it, and only CI enforces
this one. Had the denominator moved between machines, a red build could not have
been attributed to the code rather than to the runner.

Five CI samples rather than two, because the fifth found a value the first four
did not: `functions` reached 73.83 once, below the 73.85 the others agreed on.
Two samples would have set a threshold that flakes.

The five are `run_attempt` 1-5 of a single run, `34559535103`, taken 2026-09-11.
That matters for re-deriving them: re-runs collapse into one run id, so
`gh run list` shows one run and the samples are reached through
`actions/runs/34559535103/attempts/<n>/jobs`. Without that pointer the column is
a standing claim nobody can check, and once the branch is deleted it is not
falsifiable at all.

### When a threshold goes red

The floors sit at the lowest of five samples of a measurement that is not
deterministic, so a red build on a tree nobody changed is a possible outcome
rather than a contradiction. It is diagnosed, not argued about:

1. **Read both lines the job prints.** The four totals come from the coverage
   summary the `Test` step printed — it is written even on a red suite. The file
   count comes from the denominator line below it, which runs even when `Test`
   fails.
2. **If the totals are unchanged** — 21383 / 18946 / 14198 / 5109 — the
   population is intact and the tree really did lose coverage. The fix is a
   test. Do not move the number.
3. **If they moved**, the population changed, and the percentage is not
   comparable to the floor at all. Find out why before touching anything: an
   addon that did not link, a file that stopped being instrumented, a
   dependency that changed what is bundled.
4. **Re-measure a floor only when the environment the gate runs in changes** —
   new runner size, new provider, new population — and then re-take five
   samples, not one.

The jitter is real and bounded: across those five CI samples `branches` spanned
four units and `statements` and `functions` one each, with every floor at the
observed minimum. That is why step 1 exists. The local spread quoted below is
narrower than CI's and is not the one the gate is exposed to.

**A threshold is a lower bound, which on its own is not a detector**: shrink the
denominator and the percentage goes up without anything improving. What makes
these legitimate is `frontend/scripts/check-coverage-denominator.mjs`, which runs
after the coverage step in CI, reads the report the collector wrote, and compares
the files it actually measured against a declared population. If an addon is not
linked, or a file stops being instrumented, that step goes red even while every
percentage looks healthy.

### Why the provider is istanbul

`v8` takes coverage from the engine, so it knows only about code that executed.
Measured over four identical runs of this suite, that made the branch
**denominator itself** move — 12699, 12701, 12702 — because a module loaded on
one run and not the next changes how much there is to cover. A floor over a
moving population cannot tell "the code got worse" from "that module did not load
this time".

`istanbul` instruments the AST, so the population is fixed before anything runs:
21383 statements / 18946 lines / 14198 branches / 5109 functions, identical on
every run measured, including one with a failing test.

It is also **not slower than v8 here**, which is the opposite of what the plan
assumed. Why is not established, and no explanation is offered: both providers
remap through source maps — `@vitest/coverage-istanbul` depends on
`istanbul-lib-source-maps` and calls `createSourceMapStore` — so the obvious
guess is not the answer. Treat the ordering as an observation and do not build
on a cause for it.

No absolute seconds are quoted either, because one machine in one thermal state
is not a figure anyone can check later: the two measurements taken of this
differ by 60%, and both were of this same machine. The number that decides
anything is CI's own before/after on the job that gates, in the pull request
that changed it.

It lists 515 files where v8 listed 524. The nine are barrel re-exports and
type-only modules holding seven statements between them; they are declared by
name in the denominator script. Four of them were the case where v8 gave a
never-imported file `branches 1/1 = 100%` — a branch it invented and counted as
covered.

### The two required frontend jobs no longer run the same program

Nobody chose this and it is worth knowing. istanbul rewrites the AST — that is
why its population is static — so `frontend (vitest / tsc / eslint)`, which
collects coverage, executes babel-instrumented sources, while
`frontend (shuffled order)` executes the sources as written.

The consequences are small but real: a test that fails only under
instrumentation would show up in the required coverage job alone; every branch
now carries a counter, so the interleaving that produces the timing jitter below
is not the interleaving the shuffled job sees; and the numbers the floors are set
from describe instrumented execution rather than what the app does.

**The shuffled job is therefore the control, and that is worth keeping.** If you
are tempted to add coverage to it — for a fuller picture, or to gate it too —
that would remove the only run of the real sources from the required set, and it
is also the reason the shuffled job exists: instrumenting the run changes the
timing it is there to sample.

### What moves, and what it means

Locally, two files move by one branch between runs and nothing else does:

| file | observed |
|---|---|
| `src/components/ToastProvider.tsx` | 17/18 and 16/18 |
| `src/addons/media_import/SubscriptionsDashboard.tsx` | 37/65 and 36/65 |

Both are stable in isolation, so this is cross-test interaction rather than a
defect in either file — `ToastProvider`'s auto-dismiss `setTimeout` is the likely
mechanism for the first. Each threshold sits at the **lowest** observation in the
environment that enforces it. This local pair — two branches in 14198 — is
measurement noise rather than room to spend; it is not a statement about CI's
spread, which is wider and is given above.

**The same mechanism, larger, is what separates CI from a developer machine.**
Coverage that depends on whether a timer fired before a test finished will
depend on how many cores are available. That is a defect in the suite rather
than in the gate, and a real one — it is why no figure here is exactly
reproducible — but it is bigger than the coverage configuration and is recorded
as an input to the test-noise phase rather than fixed alongside the thresholds.
Anyone picking it up starts with those two files and with the fact that the
denominator never moves, so only execution timing is in question.

### Flake hygiene notes

- **`--poolOptions.forks.singleFork=true` does not work on this suite.** It is a
  natural first diagnostic for an ordering flake, and it does not finish: tests
  start failing within seconds, and vitest does not bail, so it keeps going while
  every failing test dumps its DOM. No duration is given here because there isn't
  one — an independent run was killed at 9m36s with a 16 MB log and no summary.
  Use `--sequence.shuffle` or `--sequence.seed` instead, which is what the
  `frontend (shuffled order)` job runs.
- **`coverage.reportOnFailure` is set to `true`.** Its default is `false`, which
  means a red suite writes no coverage report at all — so a missing report says
  coverage did not run, not that a test failed, and the denominator check treats
  absence as a failure.

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
5. Verify coverage did not fall: `pnpm exec vitest run --coverage` for the frontend, `--cov` for the backend. Where there are thresholds they are floors, not targets — and the table at the top of this file says where there are none, so a green run is not by itself evidence that coverage held.

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

The third one this job found was not `localStorage`, and it did not take a
per-block fix: it was module-scope state inside a component
(`DismissScrim`'s press-in-flight and armed click-swallow), reached by a
test that pressed without lifting. State a component keeps for the life of
a file cannot be cleared by the block that happens to notice — every file
that renders it is exposed — so it is ended centrally instead, by the
`pointercancel` the *Library constraints* list above describes. Read that
bullet before writing a `beforeEach` for anything of this shape; a per-file
copy of it was deliberately removed, because the file that keeps one is the
file that cannot notice the shared clean-up disappearing.

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
| `frontend (layout invariants and components in a browser)` | `frontend/e2e-layout/` and `frontend/e2e-components/` under Chromium — the geometry and the gestures jsdom cannot see. Not required yet; see below |
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
check out, or a link tree `setup-addons.sh` did not build, costs nothing at
collection time — vitest simply finds fewer files and reports every remaining
one as passing. It is the **first** line of defence for that, and
`i18n-keys.test.ts`'s "found at least one addon catalogue" assertion is the
second. Neither is redundant; do not remove one on the strength of the other.

Each addon's own workflow runs the same check for itself.

`images` builds what no test builds. For the frontend that is `next build`,
covered by neither vitest nor tsc, and impossible to run against the
`frontend/src/addons` link tree: Turbopack fails to resolve the dynamic
`@/addons/<name>/Page` import through a symlinked file. `frontend/Dockerfile`
discards that directory and copies the addon trees in as real files first, so
building the image is the only honest rehearsal. (Measured: the same build
succeeds against real files and fails against links, so this is about the
links themselves and not about how the directory above them is made.) The backend earns a build by the same argument — its
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
