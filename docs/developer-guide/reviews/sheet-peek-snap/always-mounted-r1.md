# Review: feat/sheet-peek-snap, round 1

Reviewed: `5a5af7c6` (range `2957e640..5a5af7c6`), worktree
`/Users/libre/Sources/video_share/.claude/worktrees/feat-sheet-peek-snap`.

Baseline at `5a5af7c6`: the 7 unit files for the sheet pass (185 tests);
`playwright-components` 102/102 pass; `playwright-layout` 296 pass, 1 fail
(`toolbar-menu.spec.ts` "takes the sheet form at 500px").

## Findings

(Written as they are confirmed.)

### F1. A focused text field on the page lifts the resting sheet above the on-screen keyboard  [introduced]

- Invariant: **5** (at peek the header row's bottom edge is at `innerHeight − inset`).
- Cause: vaul 1.1.2 `Root` installs a `visualViewport` `resize` handler
  (`onVisualViewportChange`) that runs whenever `document.activeElement` is
  *any* text input, textarea or contenteditable — it does not check that the
  field is inside the drawer. With the drawer now mounted at rest, a keyboard
  opened for a field on the page writes `bottom: <keyboard height>px` (and a
  pixel `height`) onto `Drawer.Content`.
- Reachable path: a Markdown note on a phone in edit mode
  (`MarkdownDocumentLayout` → `FileDetailShell` → sheet at peek). The opaque
  74px+inset header then sits directly on top of the keyboard, over the
  editor lines just above it — where the caret is when typing at the end of a
  note. The chrome's `EditableTitle` is another field on the page. At half /
  full the page is now operable too (non-modal), so the same handler runs
  there.
- Reproduction (component fixture, Pixel 5, `innerHeight` 727): open
  `#sheet-peek-down`, append and focus a `<textarea>` on the page, override
  `visualViewport.height` to `innerHeight − 300` and dispatch `resize` on
  `visualViewport`. Resting row bottom:
  - `5a5af7c6`: 727 → **427**; drawer inline style gains `bottom: 300px`.
  - `2957e640` (same probe, same arrangement): 727 → 727 (the resting strip is
    not a vaul drawer, so nothing moves it).
  Restoring the height puts `bottom: 0px` back and leaves
  `height: 654.297px` written inline by vaul.
- No test covers it: nothing in `e2e-components/` or the unit tests focuses a
  page field or resizes `visualViewport`. vaul's `repositionInputs={false}`
  is the prop that turns this handler off; whether that is the fix is the
  author's call.

### F2. Tapping the handle at `full` no longer does anything  [introduced]

- Invariant: none of the nine (not listed; see "missing from the list").
- vaul's `Handle` click cycles to the next snap; past the last one it calls
  `closeDrawer()` only when `dismissible`. With `dismissible={false}` it calls
  `setActiveSnapPoint(snapPoints[3])` = `undefined`, which
  `sheetStateForSnap` maps to `null`, and the tap is dropped. So the handle's
  tap goes peek → half → full and then is dead.
- Reproduction (component fixture `#sheet-gesture`, which starts at half):
  tap `[data-vaul-handle]` twice, 1.2 s apart, reading `data-snap` after each.
  - `5a5af7c6`: `half → full → full`.
  - `2957e640`: `half → full → unmounted` (i.e. collapsed to the resting
    strip).
  From `#sheet-gesture-peek` at `5a5af7c6`: `peek → half → full → full`.
- The user guide now says "tap the handle to go up one step", which is true;
  the chrome toggle and a drag still lower the sheet from full, but a user
  who taps the handle at full (which used to lower it) gets no response. No test pins either behaviour at full
  (`sheet-gesture.spec.ts` only taps at peek).

### F3. Every Escape on a phone-width file page is `defaultPrevented`, so CodeMirror drops it  [introduced]

- Invariant: none.
- Radix `DismissableLayer` listens for Escape in a capture listener on
  `document` and, whenever the sheet is the top dismissable layer, ends up
  calling `preventDefault()` on the key event — through the sheet's own
  `onEscapeKeyDown`, and, if that did not, itself before `onDismiss`
  (mutation M6 below: deleting the sheet's `preventDefault()` leaves
  `Escape:true`). Now that the drawer is always mounted, that is every
  Escape on a file page below 768px (`useIsMobile` is a width test, so this
  includes a narrow desktop window and a tablet with a keyboard), at peek
  too.
- `@codemirror/view` `eventBelongsToEditor` returns `false` for a
  `defaultPrevented` event, so the note editor's `defaultKeymap` Escape
  (`simplifySelection`) never runs there. More importantly, the editor binds
  `indentWithTab` (`addons/knowledge/frontend/MarkdownEditor.tsx`), and
  CodeMirror's way out of that is "Escape, then Tab" — the Escape arms
  `tabFocusMode` in a `keydown` handler (`@codemirror/view` dist,
  `if (event.keyCode == 27 && view.inputState.tabFocusMode != 0)`), which
  sits behind the same `eventBelongsToEditor` early return. So a keyboard
  user in the note editor at < 768px can no longer Tab out of it (keyboard
  trap). This part is read from the library source, not run in a browser: the
  component fixture has no editor.
- Reproduction (component fixture, `#sheet-peek-down`, a page `<input>`
  focused, `keyboard.press("Escape")`, `defaultPrevented` read in the
  input's own `keydown` listener):
  - `5a5af7c6`: `Escape:true`
  - `2957e640`: `Escape:false`
- Related, same handler: at half/full, an Escape meant for a page control (the
  chrome's `EditableTitle` cancel, the player's over-frame settings panel)
  now also lowers the sheet, because the page is operable while the sheet is
  up. Before, the page was inert at half/full so the case did not arise.
- Removing the sheet's own `preventDefault()` does not fix this (M6); the
  Radix layer is what prevents it. Any fix has to keep the sheet from being a
  Radix dismissable layer that sees the key (e.g. while at peek) — the
  author's call.

### F4. Nothing tests the sheet's own resting snap against a non-zero inset or a viewport change  [introduced]

- Invariant: **5** (a test that lets it through).
- The inset reaches two places: `FileDetailShell`'s `main` padding (tested
  with a mocked 34px probe in `MediaShell.test.tsx`) and
  `MobileInspectorSheet`'s `peekSnapFor(…, sheetPeekPx(inset))` (not tested
  with any inset: jsdom and Chromium both report 0).
- M17: `sheetPeekPx(useSafeAreaInsetBottom())` → `sheetPeekPx(0)` in
  `MobileInspectorSheet.tsx`. Full unit suite 7253 passed; components and
  layout suites pass (only my probe files' own spec-count check failed). On a
  notched iPhone this puts the header row back on the home indicator while
  `main` still reserves 108px — the exact defect the change exists to fix.
- M18: `useMemo(..., [peekSnap, halfSnap])` → `[halfSnap]`. Full unit suite
  passes; `sheet-gesture`/`popup-dismiss`/`anchored-direction` pass. The
  effect is real: probe P6 (component fixture `#sheet-gesture-peek`, resize
  the viewport 727 → 660 → 800 → 727, 900 ms each, header bottom vs
  `innerHeight`):
  - unmutated: `727/727, 660/660, 800/800, 727/727`
  - M18: `727/727, 667/660, 681/800, 727/727` — the resting row floats 119px
    above the bottom edge, or 7px below it. This is the URL-bar case, and
    also the first-paint case on a notched phone (inset reads 0 on the first
    render, then 34).
- The existing "follows the window when the URL bar moves" unit test checks
  only the drawer's `height`, at half.

### F5. The "no jump" check in `sheet-gesture.spec.ts` cannot see a jump at the hand-off  [introduced]

- Invariant: none of the nine directly; it is the spec's own verification
  item ("verify no jump in e2e-components") and the test named
  "how the sheet comes to rest".
- `cameToRest` compares `collapseTops[0]` with `surfaceTopAtCollapse` and
  then asserts the tops only move down. Both values are read in the fixture's
  `onStateChange`, which `useSheetCollapse` calls *after* it has already
  moved the pull onto the drawer — so both sides of the comparison are taken
  after any jump (review-workflow detector rule 5: the expectation is built
  from the observation).
- M21: delete `drawer.style.transition = "none";` in `useSheetCollapse.ts`.
  Unit 48/48 pass, `sheet-gesture.spec.ts` 26/26 pass. Probe P7 (rAF sampler
  installed *before* the swipe, 180px content pull from half) shows the
  sheet leaping up 180px at the hand-off and then animating down:
  - unmutated: `…,674,689,688,686,…,653` (largest upward step 3px — the
    pull went past rest and eases back up to it)
  - M21: `…,674,689,509,514,520,…,653` (upward step 180px)
- M19 (`drawerY + pull` → `drawerY`) produces the same 180px leap in the
  browser; only the unit test's string compare catches it, not the browser
  test.
- M20 (delete `void drawer.offsetHeight`) shows no jump in Chromium (P7
  identical to unmutated); expected-live there.

### F6. "One action row" is held by a test only for video/audio; a Markdown note can get two and stay green  [introduced]

- Invariant: **4** (a test that lets it through).
- Before this change the single row was structural (the strip existed only
  at peek, the meta block only when raised). Now it rests on one boolean,
  `actionsInSheetHeader={ridesShell && isMobile}` in
  `FileDetailContainer.tsx`, and the only assertions of "exactly one
  `file-action-row`" are in `MediaShell.test.tsx` (video).
- M26: `actionsInSheetHeader={ridesShell && isMobile && !useDocumentLayout}`
  → full unit suite 7253 passed. A temporary test (copy of
  `ViewerShell.test.tsx`'s harness, viewport 600, counting
  `file-action-row` at peek and after the inspector toggle) shows the
  mutation gives a Markdown note two rows — two `⋮` menus over one file —
  in both states; unmutated it is 1 for Markdown, PDF, image and archive.
- M27: same flag also false for images and PDFs → the only failure is
  `ViewerShell.test.tsx` "keeps the sheet's fixed half where there is no
  player", a half-snap test that trips over the duplicate by accident; M25
  (`&& hasPlayer`) likewise fails only two archive tests about the canvas
  floor and the half snap.

### F7. Invariant 9 (changing files resets the sheet to peek) has no test  [pre-existing]

- Invariant: **9** (a test that lets it through).
- M23: delete `setSheetState(SHEET_STATE_PEEK)` from the `[resetKey]` effect
  in `FileDetailShell.tsx` → full unit suite 7253 passed, and nothing in
  `e2e-components/` renders the shell.
- Same mutation on `2957e640` (effect identical there): no test about the
  sheet fails (the parent copy's only failures were the addon/backend tree
  walkers that cannot run outside the repo). So the gap predates this
  change, but the invariant was declared for it, and the drawer now stays
  mounted across files, so a missing reset leaves a raised vaul drawer (not
  a remounted one) over the next file.

### F8. Nothing would notice the always-open sheet taking focus when a file page loads  [introduced]

- Invariant: none (proposed addition below).
- vaul's `autoFocus` defaults to false, which is what keeps Radix's
  `onOpenAutoFocus` from focusing the drawer. Before this change the drawer
  was only mounted when the user raised it, so this could not arise on load.
- M34: add `autoFocus` to `Drawer.Root`. Full unit suite passes; components
  suite passes. The effect is real: probe P2 (`#sheet-gesture-peek`, read
  `document.activeElement` after load) gives `BODY` unmutated and
  `DIV#radix-…` (the drawer) under M34 — focus lands in the sheet on every
  file page, at peek, which for a keyboard user means the first Tab goes
  into the sheet header instead of the page.

### F9. Two comments now state the opposite of the code  [introduced]

- Invariant: none. Prose; reported only because each would steer a code
  change. Suggest deleting, not rewording.
- `frontend/src/components/DialogPortal.tsx` (top comment): "The mobile
  Bottom Sheet runs vaul in `modal` mode, which puts `pointer-events: none`
  on `<body>` and `aria-hidden` on every other body child" — no longer true
  (the sheet is `modal={false}`); a reader would keep routing dialogs into
  the sheet's transformed, `z-[25]` host for a reason that is gone.
- `frontend/e2e-layout/mobile-inspector-sheet.spec.ts` above `SNAPS`:
  "`peek` is not among them — the drawer is not mounted there at all" — the
  drawer is mounted at peek now; a reader would not add a peek case.

### F10. `e2e-layout/toolbar-menu.spec.ts` "takes the sheet form at 500px" failed once in the baseline run  [pre-existing]

## Mutations

Tree restored after each (`git checkout -- <file>`; the vaul dist was
restored from a byte copy and checked with `cmp`). Final `git status
--short` at the end of the review: empty.

| # | File | Mutation | want | got | caught by |
|---|---|---|---|---|---|
| M1 | MobileInspectorSheet | delete `modal={false}` | kill | kill | unit "leaves the page exposed" ×3, MarkdownDocumentLayout |
| M2 | MobileInspectorSheet | delete `dismissible={false}` | kill | kill | e2e "flicked down at rest, it stays on the screen" only |
| M3 | MobileInspectorSheet | `inert={false}` | kill | kill | unit "out of reach at rest", MarkdownDocumentLayout |
| M4 | MobileInspectorSheet | content always `opacity-100` | kill | kill | e2e "rests with … the content hidden" |
| M5 | MobileInspectorSheet | Escape collapses at peek too | kill | kill | unit "ignores Escape at rest" |
| M6 | MobileInspectorSheet | delete `event.preventDefault()` in `onEscapeKeyDown` | live | live | — (Radix still prevents; see F3) |
| M7 | MobileInspectorSheet | pull listener attached at peek | kill | kill | unit ×2 |
| M8 | MobileInspectorSheet | `sheetStateForSnap` peek → half | kill | kill | unit |
| M9 | MobileInspectorSheet | `snapForState` peek → halfSnap | kill | kill | unit ×2 |
| M10 | MobileInspectorSheet | `z-[25]` → `z-40` | kill | kill | e2e sidebar, unit class check |
| M11 | MobileInspectorSheet | header row 56px → 48px | kill | kill | fixture parity, e2e ×2 |
| M12 | MobileInspectorSheet | delete `handleOnly` | kill | kill | e2e ×5 |
| M13 | sheetSnap | `sheetPeekPx` drops the inset | kill | kill | sheetSnap ×2, MediaShell |
| M14 | sheetSnap | inset guard → `insetBottom !== 0` | kill | kill | sheetSnap |
| M15 | sheetSnap | `SHEET_KNOB_AREA_PX` 18 → 20 | kill | kill | sheetSnap ×4, unit, e2e |
| M16 | MobileInspectorSheet | vaul patch reverted in `node_modules` (no `modal` forwarded) | kill | kill | vaulModalForwarding, unit ×3, e2e ×1 |
| M17 | MobileInspectorSheet | `sheetPeekPx(0)` for the snap | kill | **live** | — (F4) |
| M18 | MobileInspectorSheet | `useMemo` deps drop `peekSnap` | kill | **live** | — (F4) |
| M19 | useSheetCollapse | `drawerY + pull` → `drawerY` | kill | kill | unit only (browser test blind, F5) |
| M20 | useSheetCollapse | delete `void drawer.offsetHeight` | live in Chromium | live | — (no jump in Chromium, P7) |
| M21 | useSheetCollapse | delete `drawer.style.transition = "none"` | kill | **live** | — (F5; 180px jump in P7) |
| M22 | FileDetailShell | `main` padding fixed at 74px | kill | kill | MediaShell inset case |
| M23 | FileDetailShell | delete reset-to-peek on `resetKey` | kill | **live** | — (F7; also live on parent) |
| M24 | FileDetailContainer | `actionsInSheetHeader={false}` | kill | kill | MediaShell ×3, ViewerShell ×2 |
| M25 | FileDetailContainer | `… && hasPlayer` | kill | kill (incidental) | ViewerShell archive floor / half tests |
| M26 | FileDetailContainer | `… && !useDocumentLayout` (Markdown gets two rows) | kill | **live** | — (F6) |
| M27 | FileDetailContainer | flag false for image and PDF | kill | kill (incidental) | ViewerShell "fixed half" |
| M28 | FileMetaBlock | extras not rendered in the sheet | kill | kill | MediaShell "trust and cast … once each" |
| M29 | FileActionRow | compact row renders extras too | kill | kill | FileActionRowForms ×3, MediaShell |
| M30 | FileActionRow | gallery button never rendered | kill | kill | FileActionRowForms, FileDetailContent |
| M31 | useSafeAreaInsetBottom | drop `orientationchange` listener | live | live | — (resize covers it) |
| M32 | useSafeAreaInsetBottom | drop `Number.isFinite` guard | kill | kill | unit |
| M33 | useSafeAreaInsetBottom | drop `resize` listener | kill | kill | unit |
| M34 | MobileInspectorSheet | add `autoFocus` | kill | **live** | — (F8) |
| M35 | frontend/Dockerfile | drop `COPY frontend/patches/` (emulated: install from package.json + lockfile + workspace yaml only, `--frozen-lockfile --offline`) | kill | kill by the build itself (`ENOENT … patches/vaul@1.1.2.patch`); with the patch present the same install succeeds | no CI job builds `frontend/Dockerfile`, so only a user's `docker compose up --build` catches it |

Probe-only observations (no finding):

- P5: dragging the knob up from peek, the content stays `opacity: 0` and
  `inert` for the whole drag (state changes only on release), so an empty
  card follows the finger and the content fades in after release. Design
  question for the device check, not a defect.
- P6 unmutated: header bottom tracks `innerHeight` across 727 → 660 → 800 →
  727 at peek.
- P7 unmutated: a content pull past the resting position eases back *up* to
  rest after the hand-off (≤3px steps). `cameToRest`'s "moves only down"
  holds only because its pulls stop short of rest.
- Invariant 4 at HEAD holds for Markdown, PDF, image and archive, at peek and
  after the inspector toggle (temporary test, deleted).
- `pnpm typecheck` clean at `5a5af7c6`.

## Is anything missing from the invariant list?

Proposed additions, each written so a mutation can violate it:

1. Focusing a text field on the page, and the keyboard opening for it, does
   not move the resting sheet (F1).
2. Opening a file page on a phone leaves `document.activeElement` outside the
   sheet (F8).
3. An Escape pressed while focus is on the page is delivered to the page
   un-prevented and does not change the sheet's state (F3).
4. Tapping the handle at `full` lowers the sheet (or: does something) — the
   author/user should decide which; today it does nothing (F2).
5. From the moment a content pull is released until the sheet rests, its
   top edge never moves up by more than a pixel between frames when the pull
   ended above the resting position (F5).
6. Invariant 5 should name the cases it must survive: a non-zero inset, and
   a change of `innerHeight` while at peek (F4).

TOTAL: 10 findings
