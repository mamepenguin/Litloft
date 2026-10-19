# Review — view transitions, Phase 2 (`37e05900`)

Reviewed: `c426dd21`, `74d0a4d8`, `37e05900` (HEAD), parent `2c15a871`.
Nothing earlier. The tree did not move during the review; every mutation was
reverted and `git status` is back to only the pre-existing untracked
`ios/Design/`.

Material read: the three diffs; `CLAUDE.md`; `.claude/rules/`
`frontend-conventions.md`, `comments.md`, `review-workflow.md`;
`docs/superpowers/specs/2026-09-20-native-navigation-transitions-design.md`
(§5, §6, §8 invariants, §9, §12) and the matching plan;
`docs/superpowers/specs/review-vt-phase1.md`; `DESIGN.md` tokens via the
`@theme inline` block in `globals.css`.

Method: mutation. `want=kill` means a test should fail; `want=live` means the
survivor is expected. Baselines at `37e05900`:

- `pnpm vitest run src/lib/__tests__/viewTransitions.test.ts
  src/lib/__tests__/folderTransition.test.ts` — 24 passed.
- `pnpm exec playwright test --config=playwright-components.config.ts
  view-transition-push` — 4 passed (3.7s).

## The trajectory question

> Read the three fix diffs in order. Does each round add a branch, a state or a
> prediction that the round before it also added?

**No. This loop is converging, not patching.** Measured on the diffs:

| round | branches / names / predictions |
|---|---|
| `c426dd21` | +2 names (`listing` on `[data-page-frame]`, `page-heading` on its `> header`), +4 CSS rules, +1 prediction ("the breadcrumb is stationary chrome and should hold still") |
| `74d0a4d8` | **−1 name** (`page-heading` deleted), **−2 CSS rules**, **−1 prediction** (the breadcrumb is not chrome; the sheet moves as one). The `listing` selector *moves*; it is not joined by a second one. Both halves of the time budget shrink (300→200ms, 250→100ms) |
| `37e05900` | +1 declaration (`bg-bg-primary` on the element already named), +1 test. No branch, no state, no new prediction |

Round two is the shape `review-workflow.md` calls the loop converging: it removes
a name, removes rules, and removes the assumption that produced them. Round three
adds a property to an element that already existed, not a case the previous round
failed to anticipate. Nothing in the three diffs is a special case stacked on a
special case.

Two caveats, stated as fact rather than as a verdict:

- **Both fix rounds came from R-5, not from the loop.** Neither was found by a
  test, and both are the same class of miss — *what a snapshot does that the
  element it was taken from does not* (it is not clipped; it is not opaque).
  Invariant 9 was added for the first. Nothing was added to §8 for the second.
- **Round three's commit message says the check is "general rather than another
  patch". It is not general, and this is F1**: the check reads the fixture's
  copy of the scroller, and the real component can lose its background with
  every test green.

## Mutation log

### The real components (`src/components/folder/TwoPaneLayout.tsx`)

| # | mutation | want | result |
|---|---|---|---|
| MA1 | drop `bg-bg-primary` from the named `<section>` | kill | **survived** — 515 files / 7539 tests green, 4 e2e green → **F1** |
| MA2 | rename `data-listing-scroller` → `data-listing-scrollerX` | kill | **survived** → **F1** |
| MA3 | replace the `navigateWithTransition(...)` wrapper with a bare `router.push` | kill | **survived** → **F1** |

### `src/lib/folderTransition.ts`

| # | mutation | want | result |
|---|---|---|---|
| MB1 | `shorter.length < longer.length` → `<=` | kill | **killed** |
| MB2 | swap the `folder-up` / `folder-down` returns | kill | **killed** |
| MB3 | `segments()` drops `.filter(Boolean)` | kill | **killed** |
| MB4 | `shorter.every(...)` → `true` | kill | **killed** |

This file is the one thing in the phase that is properly held.

### `src/lib/viewTransitions.ts`

| # | mutation | want | result |
|---|---|---|---|
| MC1 | `COMMIT_TIMEOUT_MS` 100 → 5000 | kill | **killed** (3 tests) |

Phase 1's F3 (first half) is closed: `74d0a4d8` added
`expect(COMMIT_TIMEOUT_MS).toBe(100)` and replaced the two derived
`COMMIT_TIMEOUT_MS + 1` advances with literals. The second half of F3 — the
animation's share of the 300ms budget — is still open; see ME5.

The rest of this file is unchanged since Phase 1 apart from the argument order,
and was mutated there (M1-M20). Not re-derived.

### `src/hooks/useFolderLink.ts`

| # | mutation | want | result |
|---|---|---|---|
| MD1 | replace the whole `folderTransitionKind(...)` expression with the literal `"folder-down"` | kill | **survived** — 515/515 green, 4 e2e green → **F3** |

There is no `useFolderLink` test file, and the e2e fixture does not use the hook.

### `src/app/view-transitions.css`

| # | mutation | want | result |
|---|---|---|---|
| ME1 | `folder-down`'s new listing enters from `vt-push-from-start` (the wrong edge) | kill | **survived** → **F2** |
| ME2 | `@media (max-width: 767px)` → `(max-width: 1px)` — the push never applies | kill | **survived** → **F2** |
| ME3 | drop the `html[data-vt]` gate from the name declaration | kill | **killed** |
| ME5 | `animation: 200ms` → `3000ms` on all four rules | kill | **survived** (run time 3.7s → 10.7s) → **F2** |
| MF2 | name `[data-page-frame]` again instead of `[data-listing-scroller]` | kill | **killed** (2 tests) |

MF2 is the round-2 regression, and it is held — because the selector is one
shared string. What is not held is which element in the *app* carries the
attribute (MA2).

### `e2e-components/fixtures/app.tsx`

| # | mutation | want | result |
|---|---|---|---|
| MF1 | drop `bg-bg-primary` from the fixture's scroller | kill | **killed** |

MF1 against MA1 is F1 in one line: the round-3 detector fires on the fixture and
not on the component the fixture is a copy of.

## Findings

### F1 — nothing this phase put in the real app is held by a test `[introduced]` — A

Three separate mutations to `TwoPaneLayout.tsx` each delete a load-bearing part
of Phase 2 from the running application, and all three pass the full frontend
suite (515 files, 7539 tests) *and* all four cases of
`view-transition-push.spec.ts`:

- **MA1** — remove `bg-bg-primary` from the named `<section>`. This is the whole
  of `37e05900`. Removing it restores the exact defect the user reported (the
  previous screen showing through the gaps of the arriving one).
- **MA2** — remove `data-listing-scroller`. Nothing in the app is named any
  more; the transition degrades to the root cross-fade. Phase 2 is gone.
- **MA3** — replace the tree path's `navigateWithTransition(...)` wrapper with
  the bare `router.push` it was before `c426dd21`.

The cause is that `e2e-components/fixtures/app.tsx` hand-writes its own scroller:

```
<section data-listing-scroller="" className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-bg-primary">
```

`37e05900` added `bg-bg-primary` to that line **and** to `TwoPaneLayout.tsx` in
the same commit, so the assertion `box.backgroundAlpha === 1` is satisfied by the
copy. MF1 (drop it from the fixture) kills; MA1 (drop it from the component) does
not. Same for the attribute's placement: the CSS selector is shared and is held
(MF2 kills), but which element in the app carries the attribute is not.

This is an A rather than a B by `review-workflow.md` R-4's "a test that lets an A
through is an A": invariant §8.9 was added *by this phase, by the user, after
seeing it break*, and its detector cannot see the application. Putting
`data-listing-scroller` back on a tall inner element — the precise thing §8.9
forbids — is a green change today.

`componentFixtureParity.test.tsx` is the existing mechanism for exactly this
("this catches the app moving while the fixture stays still"): it already pins
`SelectionBar`'s and `InspectorShell`'s positioning by reading the real source
and comparing it to the fixture's class list. The scroller got an arrangement
name added to that file's list and no parity assertion.

### F2 — the push itself is measured by nothing `[introduced]` — B

`view-transition-push.spec.ts` asserts that a group named `listing` is animating.
The browser's default cross-fade produces that group too, so every property that
makes the motion a *push* is free:

- **ME2**, `max-width: 767px` → `1px`: the four push rules never match at the
  phone width the spec runs at. Green. The deliverable of §5 is absent and no
  test notices.
- **ME1**, `folder-down`'s incoming listing enters from `vt-push-from-start`:
  old and new both travel leftward, which reads as the new page chasing the old
  off-screen rather than pushing it. Green.
- **ME5**, `200ms` → `3000ms` on all four rules: green. This is the open half of
  Phase 1's F3. §8.6 says no transition blocks input for more than 300ms, and
  §7 of the design spells the budget as 100ms commit + 200ms animation. The
  100ms is now asserted (MC1 kills); the 200ms is asserted nowhere. The only
  thing bounding it is `settled()`'s 4000ms poll timeout.

What would hold it is a measurement of the snapshot's `transform` partway
through — the pseudo-element's computed transform, or its box, sampled at a
known fraction of the animation, in the direction the kind declares. The spec
already reaches into `document.getAnimations()`, so the material is there:
`getAnimations()` entries for `::view-transition-old(listing)` carry
`effect.getTiming().duration` and the keyframes, neither of which is read.

### F3 — `useFolderLink` is the path most folder navigations take, and it has no test `[introduced]` — B

`FolderCard`, `FolderListRow` and `Breadcrumb` all go through
`hooks/useFolderLink.ts`. There is no `src/hooks/__tests__/useFolderLink.test.*`,
and the fixture's `folder-push` arrangement calls `navigateWithTransition`
directly from two buttons rather than rendering a `<Link>`. So nothing exercises:

- that `onNavigate` is the prop Next 16.2.1 actually calls (it exists —
  `next/dist/client/link.d.ts:89` — but nothing here would notice a rename);
- `href.split("?")[0]`, the query stripping;
- the pathname → href argument order.

**MD1** replaces the entire kind expression with the literal `"folder-down"`, so
every breadcrumb click animates as if it were descending, and 515/515 files plus
the four e2e cases stay green. `folderTransition.ts` is well tested (MB1-MB4 all
kill) and its only two callers are untested, so the tested part is the part that
cannot be wrong.

Note the asymmetry with the tree path: `TwoPaneLayout` calls
`folderTransitionKind(pathname, ...)` with no fallback, while `useFolderLink`
guards `pathname ?`. In `next@16.2.1` `usePathname(): string`
(`navigation.d.ts:42`), so the guard is dead and the two spellings say different
things about the same value.

### F4 — `TRANSITION_NAMES.pageHeading` is dead, and its docstring now describes behaviour the code deliberately dropped `[introduced]` — B

`74d0a4d8` deleted the only rule that used `page-heading`. The constant remains
in `src/lib/transitionNames.ts` with:

```
/** Breadcrumb and page title, which cross-fade in place. */
pageHeading: "page-heading",
```

That is the assumption round two measured and rejected (design §5: "the
breadcrumb is not stationary chrome here"). A reader adding Phase 3's names finds
a live-looking constant asserting the opposite of the design, in the file whose
own docstring says "Keeping every value here is what makes that checkable" —
while nothing checks, and `view-transitions.css` hardcodes the literal `listing`
rather than reading the constant. `fileHero` is the only member with a consumer.

Remedy per `comments.md`: delete `pageHeading` and the sentence. `appHeader`,
`appSidebar` and `folderTree` are dead too, but they died in `2c15a871`
(Phase 1) — `[pre-existing]`, one line, not re-derived.

### F5 — `h-below-header` mirrors a height that `Header.tsx` says is not constant, and §8.9 now depends on it `[pre-existing]` — B

The named `<section>` is bounded by
`height: calc(100dvh - 3.5rem - env(safe-area-inset-top, 0px))`
(`globals.css:667`), which mirrors the header's *min*-height. `Header.tsx:24-27`
states the opposite about the value it mirrors — "The height is not a constant —
the PWA safe-area inset changes it, and the row could wrap — so it is measured
rather than mirrored" — and publishes `--app-header-h` for that reason.

Measured (repo Chromium, `devices["Pixel 5"]`, a standalone fixture reproducing
`AppShell` → `h-below-header` → `h-full` section):

```
header at min-height : headerH 56  secTop 56  secBottom 727  innerHeight 727
header one row taller: headerH 81  secTop 81  secBottom 752  innerHeight 727
```

The named element then reaches 25px past the bottom of the window, which §8.9
forbids. The visible consequence is smaller than the one round two fixed: the
overflow is below the fold, where nothing is painted, rather than above it over
the header. The utility predates this phase; what this phase adds is that a
`view-transition-name` now sits on an element whose bound is that expression.
Recorded rather than fixed — the shape that removes the dependency is
`height: calc(100dvh - var(--app-header-h, 3.5rem))`, which is a change to a
shared utility and out of this change's scope.

### F6 — the box detector bounds two of the four edges `[introduced]` — B

`view-transition-push.spec.ts:160-163` asserts `top >= 0` and
`bottom <= viewportHeight`. §8.9 says "outside the window", and the axis this
transition actually travels on is horizontal. `left` / `right` are collected
nowhere (`Named` carries only `top` and `bottom`). Nothing reaches outside
horizontally today — the section is `flex-1` inside `w-full overflow-clip` — so
this is a gap in the detector, not a live defect.

### F7 — `backgroundAlpha` reads any non-`rgba()` computed value as opaque `[introduced]` — B

`view-transition-push.spec.ts:72-76`:

```
const parts = colour.match(/[\d.]+/g) ?? [];
return parts.length === 4 ? Number(parts[3]) : 1;
```

`rgb(255, 255, 255)` gives three numbers and reads 1, which is right. But so does
any value with a number count other than four — `color(srgb 1 1 1 / 0.5)` gives
five, `oklch(0.7 0.1 250)` gives three — and the detector calls all of them
opaque. `--bg-primary` is `#ffffff` / `#1a0e10` today
(`globals.css:29,67`), so Chromium computes `rgb(...)` and the check is sound;
it stops being sound the moment a colour token moves to a modern colour space,
and it fails open rather than closed. Declaring the expected computed string, or
asserting `parts.length === 3 || Number(parts[3]) === 1`, closes it.

## Triage against §8

Bucket A: **F1**. The shipped code does not break any invariant — I could not
find a path at `37e05900` that does. F1 is an A under R-4's "a test that lets an
A through is an A": §8.9 was added by this phase because breaking it was visible
to the user, and the detector written for it reads a copy of the element rather
than the element.

Bucket B: F2, F3, F4, F5, F6, F7.

Bucket C: none. See the trajectory section — the diffs are converging.

## Checked, no finding

- **§8.1 (no value on two elements at once).** `data-listing-scroller` is on
  exactly one element in the tree (`grep` over `src`, `e2e-components`,
  `e2e-layout`: the CSS rule, the component, and the fixture). `TwoPaneLayout`'s
  two call sites cannot coexist — established in Phase 1's review, not
  re-derived. The e2e asserts `new Set(names).size === names.length` and
  `boxes` has a declared length of 1.
- **§8.2 / §8.3 (nothing left behind).** `AT_REST` and `DURING` are declared
  constants, not collected from the run, and the at-rest probe runs before and
  after. ME3 (dropping the `html[data-vt]` gate) is killed by it. This is the
  detector worth keeping and it works.
- **§8.5 / §8.4.** Unchanged from Phase 1 (M1, M2 there).
- **Flakiness at `retries: 0`,** which the plan makes a named gate for this
  target: `--repeat-each=15` → **60 passed, 0 failed, 17.6s**. The commit-one
  claim still holds after the shape changed in rounds two and three.
- **`tsc --noEmit` and `eslint`** on the phase's files: clean.
- **`bg-bg-primary` is the page colour, not a new one.** `--color-bg-primary`
  is `var(--bg-primary)` (`globals.css:101`) and `body { background:
  var(--bg-primary) }` (`globals.css:150`), so painting it on the section
  changes nothing at rest in either theme. No `DESIGN.md` scale is involved.
- **The backdrop-root cost of the name.** It is paid only while `data-vt` is
  set, which is the fix Phase 1's F4 asked for. The scroller holds the whole
  page body — including anything with `backdrop-filter` — but for the length of
  one transition rather than always.
- **Counts.** `coarseNeedleSources` 60 → 61 is the one new `REQUIRED` needle
  (`vt-push-from-end`); `popup-dismissal` 450 → 452 is exactly
  `hooks/useFolderLink.ts` and `lib/folderTransition.ts`, with
  `view-transitions.css` correctly not counted.
- **`spec-viewport.spec.ts`'s new entry** is out of alphabetical order in the
  literal, which is cosmetic: the assertion sorts both sides.
- **Design §12 (`## Checked, no action`)** read before flagging omissions. The
  plan's Phase 2 items that this change does not do — the `PageFrame` heading /
  content wrappers and the `e2e-layout` before/after measurement of
  `PageFrame`'s boxes — were made unnecessary by round two deleting the separate
  heading name. Not a finding; the design moved and §5 records the measurement
  that moved it.
- **Prose.** Not a mutation target. The only prose I would delete is covered by
  F4, which is a dead constant rather than a comment. The comment on the
  `<section>` in `TwoPaneLayout.tsx` states two traps that are real and not
  derivable from the code, which `comments.md` allows.

## Pre-existing, not re-derived

- `pnpm build` fails in this checkout on addon `slots.ts` symlink resolution;
  identical on the parent. `[pre-existing]`
- `src/__tests__/design-tokens.test.ts` compiles `globals.css` with the wrong
  base. `[pre-existing]`
- `TRANSITION_NAMES.appHeader`, `.appSidebar`, `.folderTree` are dead as of
  `2c15a871`. `[pre-existing]` (F4 covers only `pageHeading`, which this phase
  killed).

TOTAL: 7 findings
