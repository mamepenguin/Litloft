# Review — view transitions, Phase 1 (`e8a80a93`)

Reviewed commit: `e8a80a93` ("feat: start view transitions from one place, and
hold the chrome still"), parent `2618efc9`. The tree did not move during the
review; every mutation was reverted with `git checkout --` and the working tree
is back to `e8a80a93` (only the pre-existing untracked `ios/Design/` remains).

Material read: the diff; `CLAUDE.md`; `.claude/rules/frontend-conventions.md`,
`comments.md`, `review-workflow.md`; `frontend/AGENTS.md`;
`docs/superpowers/specs/2026-09-20-native-navigation-transitions-design.md`
(§8 invariants, §9 what a test can hold, §11 measurements) and the matching
plan, including `## 12 Checked, no action`.

Method: mutation, plus real-browser measurement where jsdom cannot reach.
`want=kill` means a test should fail; `want=live` means the survivor is
expected. Baseline: `src/lib/__tests__/viewTransitions.test.ts` (12) and
`src/components/__tests__/NavigationCommitSignal.test.tsx` (5) — 17 passed.
Full frontend suite at `e8a80a93`: 514 files, 7526 passed. `tsc --noEmit` and
`eslint` on the three new source files: clean.

Browser measurements used the repo's own Playwright Chromium
(`@playwright/test@1.58.2`, chromium-1234) against standalone `file://`
fixtures, per `review-workflow.md` ("layout, spacing and overflow need a named
instruction to measure in a real browser").

**Bucket A is empty.** No path I could find breaks a §8 invariant *today* —
largely because nothing calls `navigateWithTransition`, so no transition runs
at all in this commit. Everything below is B, and two of them (F1, F3) become
user-visible the moment Phase 2 adds a caller.

---

## Mutation log

### `frontend/src/lib/viewTransitions.ts`

| # | mutation | want | result |
|---|---|---|---|
| M1 | `typeof start !== "function"` → `false` | kill | **killed** |
| M2 | `prefersReducedMotion()` → `false` in the guard | kill | **killed** |
| M3 | `dirtyRegistry.isDirty()` → `false` in the guard | kill | **killed** |
| M4 | `prefersReducedMotion`: no-`matchMedia` branch returns `true` | live | survived → F8 |
| M5 | write the hero name / `data-vt` **after** `startViewTransition` | kill | **killed** |
| M6 | drop `if (pending) supersede(pending)` | kill | **killed** |
| M7 | drop `p.resolve?.()` from `supersede` | kill | survived → F7 |
| M8 | drop `p.skip?.()` from `supersede` | live | survived → F7 |
| M9 | drop `if (p.cleaned) return` from `cleanup` | live | survived → F7 |
| M10 | `if (pending === p) pending = null` → unconditional | live | survived → F7 |
| M11 | drop `url === p.startUrl` from `notifyNavigationCommit` | kill | **killed** (2 tests) |
| M12 | drop `p.cleaned` from `notifyNavigationCommit` | live | survived → F7 |
| M13 | timeout: drop `transition?.skipTransition()` | kill | **killed** |
| M14 | timeout: drop `resolve()` | kill | **killed** (2 tests) |
| M15 | `COMMIT_TIMEOUT_MS` 250 → 5000 | kill | survived → **F3** |
| M16 | `currentUrl()` drops the query | kill | **killed** |
| M17 | `catch`: drop `cleanup(p)` | kill | **killed** |
| M18 | drop `p.skip = () => transition?.skipTransition()` | live | survived → F7 |
| M19 | drop `Promise.allSettled([...]).then(() => cleanup(p))` | kill | **killed** (3 tests) |
| M20 | `allSettled` → bare `transition.finished.then(...)` | kill | survived → **F2** |

### `frontend/src/components/NavigationCommitSignal.tsx`

| # | mutation | want | result |
|---|---|---|---|
| M21 | `useLayoutEffect` → `useEffect` | kill | survived → F6 |
| M22 | drop the `reported.current === url` guard | kill | survived → **F5** |
| M23 | `url` always carries `?` | kill | **killed** (2 tests) |
| M24 | deps `[url]` → `[]` | kill | **killed** (2 tests) |
| M25 | drop the `<Suspense>` boundary | live | survived → F9 |
| M26 | `url` drops the query entirely | kill | **killed** (2 tests) |

---

## Findings

### F1 — `animation: none` on the sidebar's old/new pseudos double-exposes it `[introduced]` — B

`frontend/src/app/view-transitions.css:14-22` sets `animation: none` and
`mix-blend-mode: normal` on `::view-transition-old(app-sidebar)` /
`::view-transition-new(app-sidebar)`. With both animations cancelled, both
snapshots sit at `opacity: 1`, and `mix-blend-mode: normal` replaces the UA's
`plus-lighter` — so the new snapshot is alpha-composited over the old rather
than cross-fading with it. Where the new snapshot is **transparent**, the old
shows through: a double exposure for the whole transition.

`app-sidebar` is written onto the `<nav>` in `Sidebar.tsx:138-141`, and that
`<nav>` has no background of its own — `bg-bg-sidebar` is on the parent
`<aside>` (`Sidebar.tsx:295`), which is *not* the named element. So the
sidebar's snapshot is transparent everywhere except its glyphs and its active
row, and the sidebar's content changes on essentially every navigation (the
active-row highlight moves; pins / collections / tags differ per drive).

Measured, Chromium 1234, fixture mirroring the real nesting (background on the
parent, `view-transition-name` on the transparent child), sampling dark pixels
in the first row:

```
before (row reads HHHHHHHH) : 512
mid-transition              : 672      <- more than either state: both are painted
after  (row reads XXXXXXXX) : 448
```

The header does not have this problem: `app-header` is on the `<header>` itself
and that element carries `bg-bg-primary`, so its new snapshot is opaque and
covers the old. The tree `<aside>` is opaque in practice because
`FolderTreePane`'s root fills it with `bg-bg-card` — except the mobile-only
close-button strip (`TwoPaneLayout.tsx:114`), which has no background.

Not reachable today: nothing starts a transition in this commit. It lands with
the first Phase 2 caller.

### F2 — the test fake's `finished` cannot reject, so `Promise.allSettled` is unheld `[introduced]` — B

`viewTransitions.ts:131` uses `Promise.allSettled([transition.finished])` rather
than `transition.finished.then(...)`. That choice is what keeps invariants §8.2
and §8.3 when the update callback rejects: in a browser, `navigate()` throwing
inside the callback rejects `updateCallbackDone` and therefore `finished`, and a
bare `.then` would never run `cleanup(p)` — the hero name and `data-vt` would
stay on the DOM permanently.

No committed test holds it. `installViewTransition`
(`viewTransitions.test.ts:27-34`) builds both `ready` and `finished` as
`updateCallbackDone.then(() => undefined, () => undefined)`, which **swallows
rejection**, so `finished` always resolves. M20 survives all 12 tests.

Demonstrated with a throwaway probe using browser-accurate semantics — the
update callback's throw rejects `finished`, and `startViewTransition` does *not*
rethrow synchronously:

```
unmutated code + probe : pass  (hero name cleared, data-vt cleared)
M20 mutant  + probe    : fail  — expected 'file-hero' to be ''
M20 mutant  + committed suite : 12 passed
```

Related: the test named *"leaves nothing behind when the navigation throws"*
(`viewTransitions.test.ts:240`) does not exercise the browser's path at all. The
fake evaluates `Promise.resolve(cb())`, so a synchronous throw in `cb` escapes
`start.call` synchronously and is caught by the `try/catch` at
`viewTransitions.ts:125-128`. A browser never throws there. So the test holds
the `catch` branch (M17 killed) and leaves the branch a browser actually takes
(M20) uncovered. The probe above is the shape that would close it.

### F3 — `COMMIT_TIMEOUT_MS` is derived from the observation, so the input-block budget is unheld `[introduced]` — B

M15 raises `COMMIT_TIMEOUT_MS` from 250 to 5000 and all 17 tests still pass,
because both tests that use it advance timers by `COMMIT_TIMEOUT_MS + 1` rather
than by a declared number. That is `review-workflow.md` detector rule 5 —
"never build the expected value out of the observation". The constant is the
only thing standing between a missed commit signal and a frozen page
(design §8.6, and the plan's own HIGH risk), and nothing asserts what it is.

Separately, and not measurable in jsdom: §8.6 is "no transition blocks input
for more than 300ms", but the budget spent is `COMMIT_TIMEOUT_MS` (up to 250ms
waiting for the commit) **plus** the transition's own animation, and nothing in
`view-transitions.css` caps the root animation — it takes the UA default of
250ms. A commit that takes even 60ms therefore exceeds 300ms. Worth a declared
number and a measurement on device (R-5) before Phase 2 ships a caller.

### F4 — naming the sidebar `<nav>` makes it a backdrop root `[introduced]` — B

Per CSS View Transitions Level 1 §2.1.1, an element whose `view-transition-name`
is not `none` **"at any time"** forms a stacking context and a backdrop root —
unconditionally, not only while a transition runs. So the three names in this
commit change rendering today, with no transition involved.

Measured, Chromium 1234: a `backdrop-filter: blur(8px)` descendant sampling a
striped background behind its parent, red channel across a 60px strip:

```
control, no name on the parent : min 112 max 141   (blurred: uniform grey)
with view-transition-name      : min 0   max 255   (not blurred: stripes intact)
```

Reachable instance: `SidebarSmartFoldersSection` renders `ConfirmDialog`
(`ConfirmDialog.tsx:45-47`, `backdrop-blur-sm`) and `SmartFolderSaveDialog`
inside the now-named `<nav>`.

Scope caveat, measured so the finding is not overstated: those dialogs are
*already* confined to the 240px sidebar column, because the parent `<aside>`
carries Tailwind's `translate-x-0` / `-translate-x-full`, and a non-`none`
`translate` is already a containing block for `position: fixed` descendants:

```
aside with translate (today)  : dialog rect = 240 x 400
aside with translate: none    : dialog rect = 800 x 400
```

That confinement is `[pre-existing]`. What this commit adds is that the blur
inside the already-confined dialog stops sampling anything painted outside the
`<nav>`. Cosmetic, and small — recorded because the *mechanism* (unconditional
backdrop root and stacking context on three chrome elements, paid before any
transition exists) is the part worth knowing.

I checked and could **not** find a reachable consequence of the new stacking
contexts themselves:
- `app-header` is on an element that is already `sticky z-20`, hence already a
  stacking context.
- inside the `folder-tree` `<aside>`, the only competing z-indices
  (`FilterField`'s `DismissScrim` at `fixed inset-0 z-30`, `FolderTreePane`'s
  `z-20` / `z-30` overlays) sit geometrically below the header, and
  `DismissScrim` dismisses from a document-level capture listener with
  `pointer-events: none` inline on the scrim, so being re-ordered under the
  header changes nothing.
- the `<nav>` is the aside's only child, so it has nothing to be re-ordered
  against.

I also measured, and it is **not** true, that `view-transition-name` creates a
containing block for `position: fixed` descendants (a fixed child's rect stayed
at 0,0 with and without the name). So nothing inside the three named elements
moves.

### F5 — the ref guard in `NavigationCommitSignal` is unheld; the test that looks like its detector is held by the deps array `[introduced]` — B

M22 deletes `if (reported.current === url) return;`
(`NavigationCommitSignal.tsx:16`) and all 17 tests pass. The test
*"stays quiet on a re-render that did not change the url"*
(`NavigationCommitSignal.test.tsx:63`) cannot distinguish the guard from the
dependency array: when `url` is unchanged React does not re-run the effect at
all, so the guard is never reached. M24 (`[url]` → `[]`) is what that test
actually kills.

The guard is not wrong — it covers StrictMode's double-invoked mount effect —
but a reader will believe there is a test for it and there is not.

### F6 — the layout-effect choice is unheld `[introduced]` — B

M21 (`useLayoutEffect` → `useEffect`) survives. The comment at
`NavigationCommitSignal.tsx:13-15` states the choice is load-bearing ("After
paint would be too late"), and it is: the update callback's promise gates the
browser's capture of the destination. jsdom + React Testing Library flush both
kinds synchronously and there is no capture to be late for, so nothing here can
hold it. Recorded so the guarantee is not silently downgraded later; §9 already
says this class of behaviour belongs in `e2e-components/`.

### F7 — the supersede and cleanup guards are belt-and-braces, and none are held `[introduced]` — B

All of M7, M8, M9, M10, M12, M18 survive the suite:

- `p.resolve?.()` in `supersede` (M7). Without it, the superseded transition's
  update-callback promise stays pending forever, and in a browser `finished`
  chains on it and never settles. `supersede` calls `cleanup(p)` directly, so no
  name leaks — but the pending promise is real and untested.
- `p.skip?.()` in `supersede` (M8) and the `p.skip` assignment (M18): a second
  `startViewTransition` already makes the browser skip the first, so these are
  redundant in a browser and invisible to the fake.
- `cleanup`'s `if (p.cleaned) return` (M9) and `if (pending === p)` (M10):
  re-entry and ownership guards, both currently unreachable given the call
  order.
- `p.cleaned` in `notifyNavigationCommit` (M12) is **dead**: `cleanup` sets
  `pending = null` whenever `pending === p`, so a cleaned `p` can never be the
  value `notifyNavigationCommit` reads — the `!p` test already covers it.

No action implied beyond knowing these are unheld; M7 is the only one with a
plausible browser consequence.

### F8 — the missing-`matchMedia` branch is unheld `[introduced]` — B

M4 makes `prefersReducedMotion` return `true` when `window.matchMedia` is
absent (`viewTransitions.ts:47`) and all 17 tests pass — that inversion would
silently disable transitions everywhere on such a client. The branch exists for
a host that has `startViewTransition` but no `matchMedia`, which no real browser
is; the survivor is acceptable, it is recorded only because nothing pins the
direction.

### F9 — the `<Suspense>` boundary is untested, and the check that would catch its absence is broken here `[introduced]` — B

M25 removes the `<Suspense>` wrapper and all tests pass, because
`NavigationCommitSignal.test.tsx:11-14` mocks `next/navigation` and never
suspends. The docstring's stated reason is that a production build of a
prerendered route fails without it — that is `pnpm build`'s job, and `pnpm build`
does not complete in this checkout (`[pre-existing]`, see below). So the
boundary is currently held by nothing that runs.

---

## Checked, no finding

- **§8.1 (no name on two elements at once).** `Header` and `Sidebar` are each
  mounted once, from `AppShell.tsx:25,32`. `TwoPaneLayout` has two call sites —
  `app/drive/[name]/layout.tsx:57` and `CollectionDetail.tsx:229` — but the
  layout returns `<>{children}</>` when `isDriveCollectionPath(pathname)`
  (`layout.tsx:34-36`), so the two never coexist. React commits the layout's
  unmount and the page's mount together, so there is no paint with both.
  `fileHero` is written and cleared in exactly one place.
- **§8.4 / §8.5** are held by M1 and M2 respectively.
- **§8.7** holds by construction: the signal is the committed url, never the
  destination's data, and it is capped by `COMMIT_TIMEOUT_MS`.
- **`popup-dismissal.test.ts` 447 → 450** is exactly right: `sourceFiles`
  (`popup-dismissal.test.ts:30-46`) excludes `__tests__` and `*.test.ts?`, and
  counts only `.tsx?`, so the three new non-test modules are the whole delta and
  `view-transitions.css` is correctly not counted.
- **`useSelectedFile`** reaches the url through `router.push` / `router.replace`
  (`useSelectedFile.ts:41-42,53`), not raw `history` calls, so
  `useSearchParams` updates and the commit signal will fire for the Phase 3
  path. It also already routes through `navigationGuard.request`, matching the
  dirty-tab bail in `navigateWithTransition`.
- **`_resetViewTransitionsForTests` exported from production code.** Matches the
  existing `dirtyRegistry.reset()` precedent.
- **`view-transitions.css` imported from `layout.tsx` rather than
  `globals.css`** (the plan said `globals.css`). It is a plain global stylesheet
  with no Tailwind directives, so the import site does not change what it
  produces.
- **Prose.** Not a mutation target, and nothing in the comments, the commit
  message or the CSS docstring would lead a reader to a wrong code change.
- **Phase 1 ships no caller**, so the design's stated Phase 1 Output ("the page
  cross-fades on navigation", "the header/sidebar/tree hold still") is not
  observable in this commit and R-5 has nothing to exercise yet. The brief
  states this is intentional; recorded only because F1 and F3 are latent behind
  the same fact.

## Pre-existing, not re-derived

- `pnpm build` fails in this checkout on addon `slots.ts` symlink resolution.
  `[pre-existing]`
- `src/__tests__/design-tokens.test.ts` compiles `globals.css` with the wrong
  base. `[pre-existing]` — it would not have covered `view-transitions.css`
  either way, since that file is imported from `layout.tsx`.
- The sidebar `<aside>`'s Tailwind `translate` already makes it a containing
  block for `position: fixed` descendants, so dialogs rendered inside the
  sidebar are already confined to the 240px column rather than the viewport
  (measured above under F4). `[pre-existing]`

TOTAL: 9 findings
