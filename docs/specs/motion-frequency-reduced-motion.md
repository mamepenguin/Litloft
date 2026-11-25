# Motion: frequent surfaces open instantly, reduced motion covers JavaScript, a flick completes a swipe

SPEC-ID: SPEC-CORE-178
SPEC-ID: SPEC-CORE-179
SPEC-ID: SPEC-CORE-180
SPEC-ID: SPEC-ADDON-186

Approval: sha256:7c9e4d333c1235062d6a1e59a2343a133136791ef1b449fe464daa394f424fc0 Yuichi Senga 2026-11-25

## Summary

Three corrections to how the web app moves, for the viewer who uses it every day.

- **SPEC-CORE-178.** The search palette, the shortcut cheat sheet, the quick note panel
  and every menu drawn by the shared `ContextMenu` component appear in their final state
  in the first painted frame, with no fade or scale. `ContextMenu` draws the file and
  folder menus and the menus of the sidebar collections, the trash and missing lists and
  grids, and the video app's cards. These surfaces are opened dozens of times a day, by
  a key or a right-click / long-press; the 200 ms entrance stood between the press and
  the input. The context menu also grew from its own centre while pinned to the pointer
  by its corner, and was clamped into the viewport only after it had been painted.
- **SPEC-CORE-179 / SPEC-ADDON-186.** DESIGN.md §7 already says reduced motion moves
  nothing, including motion started from JavaScript. The global CSS override does not
  reach WAAPI, `behavior: "smooth"` scrolling or rAF loops, and several of them do not
  check. Under `prefers-reduced-motion: reduce` they now jump instead of glide: core
  (collection list changes, collection panel, passage highlight, in-file find, tree
  reveal, mini player) and addons (intelligence transcript follow and detailed-summary
  jump, knowledge graph inertia).
- **SPEC-CORE-180.** On a touch screen, an Inbox row swiped left is marked done when
  released past a third of its width (as now) **or** when thrown: released after at least
  32 px of leftward travel at an average speed above 0.11 px/ms. A short, quick flick no
  longer springs back. A press that has already become a long-press never marks the row
  done.

## Required items

### 1. Normal flow

**CORE-178.**
1. The viewer opens the search palette — `ctrl+k`, `ctrl+shift+f`, the header search
   button, or the search button on a phone. The palette (desktop: dimmed backdrop +
   panel; phone: full-screen sheet) is drawn at full opacity and final scale in the first
   painted frame; focus lands in the input as today.
2. The viewer opens the shortcut cheat sheet — `?` outside an editable element, or the
   link in the search footer. The sheet and its blurred backdrop are drawn in their final
   state in the first frame; `?` again closes it.
3. The viewer opens the quick note panel — `n` or its button. The panel and its backdrop
   are drawn in their final state in the first frame.
4. The viewer right-clicks (fine pointer) or long-presses (coarse pointer) anything that
   opens a `ContextMenu`. In the first painted frame the menu is at full opacity and
   scale and already at its final position, `left = max(8, min(x, innerWidth - width -
   8))` and `top = max(8, min(y, innerHeight - height - 8))`, with `(x, y)` the pointer
   and `width`, `height` the menu's full-size box. So its top-left corner is at the
   pointer, moved left / up as far as needed to keep the menu 8 px inside the right and
   bottom edges, and right / down to keep it 8 px inside the left and top edges. A menu
   taller (wider) than the viewport minus 16 px sits at `top = 8` (`left = 8`) and runs
   past the bottom (right) edge, as today. The clamp runs before paint (a layout
   effect), also when `position` changes while the menu is open, so no frame shows the
   unclamped position.

**CORE-179 / ADDON-186.** With `prefers-reduced-motion: reduce`:
1. Any change to a collection's item list in `CollectionItemsPane` (reorder, add,
   remove): rows are drawn in their new places in one frame; no `Element.animate` call
   is made. The measured row positions are still recorded, so the first change after
   reduced motion is turned off animates from the layout the last change left.
2. Every programmatic scroll listed in Touch points moves to the same target it does
   today, with `behavior: "auto"` (a jump) instead of `"smooth"`.
3. Knowledge graph: releasing a drag leaves the graph where the pointer left it; no
   inertia frame is scheduled.
Without reduced motion, all of the above behave exactly as today. The answer is read
each time a motion would start.

**CORE-180.** On a coarse pointer, the viewer presses an Inbox row, drags left and
releases. With `dx`, `dy` the pointer-up position minus the pointer-down position,
`width` the row's width at pointer-down and `elapsedMs` the difference of
`performance.now()` read in the pointer-down and pointer-up handlers:

- The row is marked done (same `onDone`, same undo toast, same 200 ms `ease-out`
  fly-out, no slide under reduced motion) when all of these hold:
  - the long-press has not fired during this press;
  - the press has not been handed to vertical scrolling (a pointer move with
    `|dy| > |dx|` and `|dy| > 8`, the existing `scrolled` flag);
  - at release `dx < 0` and `|dx| > |dy|`;
  - and either `|dx| >= width / 3`, or a swipe started during the press (a pointer move
    with `dx < 0`, `|dx| > |dy|` and `|dx| > 8`, the existing `swiping` flag) and
    `|dx| >= 32` and `elapsedMs > 0` and `|dx| / elapsedMs > 0.11`.
- Otherwise a started swipe springs back as today, and a press without a swipe is a tap
  or a long-press as today.

### 2. Failure cases

- `window` undefined (server render) or `window.matchMedia` missing (old test
  environments): the shared helper answers "not reduced". Every motion then behaves as
  without reduced motion.
- `elapsedMs <= 0` (identical event timestamps): the speed rule does not apply; only the
  distance rule decides.
- Nothing here calls the network or writes data, so there is no other failure.

### 3. States

- Search palette, cheat sheet, quick note, context menus: closed ↔ open, unchanged. The
  transient 200 ms "entering" state is removed.
- Reduced motion: read when each motion starts (`matchMedia(...).matches`), not cached.
- Inbox press. Three flags are set during one press and never cleared until the next
  pointer-down: `swiping`, `longPressed`, `scrolled`.
  - pressed → released with no flag: tap (opens the item).
  - `swiping` set → released: done or spring-back, per §1.
  - `longPressed` set (the 500 ms timer fired; a move before then cancels the timer, as
    today): from then on pointer moves change nothing — the row does not follow the
    finger and `swiping` is not set. Released: the row stays selected; never done.
  - `scrolled` set (also after a swipe had started): the row's transform is reset at
    once, as today. Released: nothing; never done.
  - `pointercancel` at any point: the transform is reset, nothing is marked done, as today.
  - Not allowed: `longPressed` → done, `scrolled` → done, a right drag → done.

### 4. Data read and written

None. No store, table, file, cache or `localStorage` key is read or written. The media
query is read.

### 5. External services

None.

### 6. Authorization

None: purely presentational and client-side; who can open a menu, search or mark a row
done is unchanged.

### 7. Effect on existing features

- `animate-fade-in` / `animate-fade-in-scale` stay in `globals.css`. Every element that
  carries one today keeps it, except the roots named in I1 (see I2).
- Every caller of `ContextMenu` (`FileContextMenu`, `FolderContextMenu`,
  `SidebarCollectionsSection`, `TrashFileList`, `TrashFileGrid`, `MissingFileList`,
  `MissingFileGrid`, `VideoCard`) loses the entrance together; no caller passes anything
  new.
- The menu's final position at a viewport edge moves by a few pixels: it was measured
  while scaled to 0.95, so it sat about 3–4 px closer to the right edge than 8 px (and a
  tall menu could reach past the bottom). It is now exactly 8 px.
- The reduced-motion helper becomes one module, `frontend/src/lib/reducedMotion.ts`.
  The five private copies in core (`openGhost.ts`, `viewTransitions.ts`,
  `useFrameTransition.ts`, `useJustifiedFlip.ts`, `InboxRow.tsx`) import it. The three
  that did not guard `window` now do; in the browser, where `window` always exists, they
  answer the same.
- Addons do not import the new core module. Each addon file checks the media query
  locally with the same rule as the core helper (missing `window` or `matchMedia` means
  "not reduced"), so each addon PR builds and merges without waiting for core, in the
  CLAUDE.md order (addon PR → core pointer bump). The addon diffs add or remove no
  `animate-*` class.
- Inbox: SPEC-CORE-032 item 8 states the distance rule; this spec adds the throw rule and
  the long-press exclusion. No SPEC-CORE-032 invariant names either. SPEC-CORE-157 I8
  and SPEC-CORE-150 I6 say `ContextMenu` behaves as before and are revised.
- Existing tests that assert `behavior: "smooth"` (`useTreeAutoReveal.test.ts`,
  intelligence `TranscriptSection.test.tsx`) run in jsdom without `matchMedia`, so the
  helper answers "not reduced" and they pass unchanged.
- `frontend/src/__tests__/inboxActions.test.tsx` "SPEC-CORE-032 leaves the row alone when
  the swipe is short" (50 px of a 300 px row) would become timing-dependent. It is edited
  to stub `performance.now()` so the press lasts 1000 ms (0.05 px/ms): it still asserts
  that a short slow swipe springs back. Its assertion is unchanged.

### 8. Error behavior

None user-visible: there is no new failure path, and nothing is logged.

### 9. User-visible behavior

- The palette, cheat sheet, quick note and every context menu appear and disappear with
  the press, no 200 ms fade / scale. A context menu near an edge appears already inside
  the window, 8 px from it.
- Under reduced motion the listed scrolls jump, collection rows snap, the graph stops on
  release.
- An Inbox row thrown left is marked done; holding a row until it is selected and then
  dragging never marks it done.
- `docs/user-guide/inbox.md` "With touch", first bullet becomes: "Swipe a row to the
  left, past a third of its width or with a quick flick, to mark it done. A short slow
  swipe springs back, and a mostly vertical gesture scrolls."
- `docs/user-guide/keyboard-shortcuts.md` Inbox row "Swipe left past a third of the row"
  becomes "Swipe left past a third of the row, or flick left".
- DESIGN.md §7 gains, under the utility table:
  "**The search palette, the shortcut cheat sheet, the quick note panel and the context
  menu appear without animation**, however they are opened. Each is a surface the viewer
  opens to type or choose in, from a shortcut key or a right-click, dozens of times a
  day; the motion would only stand between the press and the input. Bars and modes that
  follow from an action — the selection bar after a long-press — keep their motion."

### 10. Non-functional

- No new dependency. One `matchMedia` read per motion start, as the existing helpers do.
- `0.11` px/ms and `32` px are constants beside their decision function, not settings.

## Touch points

- `frontend/src/components/GlobalSearch.tsx` — remove `animate-fade-in` /
  `animate-fade-in-scale` from the desktop backdrop and panel and the mobile sheet.
- `frontend/src/components/ShortcutCheatSheet.tsx` — remove them from the backdrop and panel.
- `frontend/src/components/quick-note/QuickNotePresenter.tsx` — remove them from the
  backdrop and panel.
- `frontend/src/components/ContextMenu.tsx` — remove `animate-fade-in-scale`; the clamp
  effect becomes a layout effect.
- `frontend/src/lib/reducedMotion.ts` (new) — the API below.
- `frontend/src/components/CollectionItemsPane.tsx` — skip `el.animate` under reduced motion.
- `frontend/src/components/CollectionPanel.tsx` — two `scrollIntoView` calls.
- `frontend/src/hooks/useHighlightPassage.ts` — three `scrollIntoView` calls.
- `frontend/src/hooks/useFindMarksIn.ts` — one `scrollIntoView` call.
- `frontend/src/hooks/useTreeAutoReveal.ts` — `virtualizer.scrollToIndex`.
- `frontend/src/hooks/useMiniPlayer.ts` — one `scrollIntoView` call.
- `frontend/src/lib/openGhost.ts`, `frontend/src/lib/viewTransitions.ts`,
  `frontend/src/components/player/hooks/useFrameTransition.ts`,
  `frontend/src/hooks/useJustifiedFlip.ts` — use the shared helper.
- `frontend/src/components/inbox/InboxRow.tsx` — shared helper; read `performance.now()` at
  pointer-down and pointer-up; remember whether the long-press fired; release decision through
  `swipeCompletes`.
- `frontend/src/components/inbox/swipeDecision.ts` (new) — the API below.
- `frontend/src/__tests__/inboxActions.test.tsx` — the short-swipe case stubs
  `performance.now()` (assertion unchanged).
- `frontend/e2e-components/` — a real-browser case for the context menu at a viewport
  edge.
- `addons/intelligence/frontend/TranscriptSection.tsx` — follow scroll.
- `addons/intelligence/frontend/DetailedSummarySection.tsx` — section jump.
- `addons/knowledge/frontend/graph/useGraphPanZoom.ts` — inertia start.
- `addons/intelligence`, `addons/knowledge` — submodule pointer bumps after the addon PRs.
- `DESIGN.md` §7 — the new rule.
- `docs/user-guide/inbox.md` — "With touch".
- `docs/user-guide/keyboard-shortcuts.md` — the Inbox swipe row.
- `.claude/rules/design-decisions.md`, `.claude/rules/frontend-conventions.md` — read, not edited.

### API for tests

```ts
// frontend/src/lib/reducedMotion.ts
export function prefersReducedMotion(): boolean;
// false when window or window.matchMedia is undefined; otherwise
// window.matchMedia("(prefers-reduced-motion: reduce)").matches, read on every call.
export function scrollBehavior(): ScrollBehavior;
// "auto" when prefersReducedMotion(), otherwise "smooth".

// frontend/src/components/inbox/swipeDecision.ts
export const SWIPE_FLICK_VELOCITY: number; // 0.11, px/ms
export const SWIPE_FLICK_MIN_PX: number;   // 32
export function swipeCompletes(input: {
  dx: number;          // pointer-up x minus pointer-down x
  dy: number;          // pointer-up y minus pointer-down y
  width: number;       // row width at pointer-down
  elapsedMs: number;   // performance.now() at pointer-up minus at pointer-down
  swiping: boolean;    // a swipe started during the press (§1)
  longPressed: boolean;// the long-press fired during the press
  scrolled: boolean;   // the press was handed to vertical scrolling
}): boolean;           // true exactly when §1 CORE-180 says the row is marked done
```

### Baseline for I2

Count of `animate-fade-in` / `animate-fade-in-scale` occurrences per file in
`frontend/src` at the branch base (`81154d347`), non-test files. After the change every
row keeps its count, except the four marked, which drop to 0.

| File (under `frontend/src/components/`) | Count |
|---|---|
| `AddButton.tsx` | 1 |
| `appshell/ManageTargetsDialog.tsx` | 2 |
| `BatchRenameDialog.tsx` | 2 |
| `CollectionPicker.tsx` | 2 |
| `ConfirmDialog.tsx` | 2 |
| `ContextMenu.tsx` | 1 → 0 |
| `CopyIdDialog.tsx` | 2 |
| `ExifSection.tsx` | 1 |
| `FileSaveDialog.tsx` | 2 |
| `GlobalSearch.tsx` | 3 → 0 |
| `MoveDialog.tsx` | 2 |
| `NameInputDialog.tsx` | 2 |
| `player/MediaControls/GestureOverlay.tsx` | 3 |
| `quick-note/QuickNotePresenter.tsx` | 2 → 0 |
| `RenameDialog.tsx` | 2 |
| `SelectionBar.tsx` | 1 |
| `ShortcutCheatSheet.tsx` | 2 → 0 |
| `SmartFolderSaveDialog.tsx` | 2 |
| `SortButton.tsx` | 1 |
| `ToolbarMenu.tsx` | 1 |
| `trash/TrashToolbar.tsx` | 1 |

The addons are covered by their diffs, which touch only the three files in Touch points,
none of which carries these classes.

## Invariants

I1. Opening the search palette (desktop backdrop and panel, phone sheet), the shortcut cheat sheet (backdrop and panel), the quick note panel (backdrop and panel) or any `ContextMenu` starts no CSS animation on those elements: none of them carries an `animate-*` class (an `animate-spin` on a descendant is allowed).
I2. Outside the elements named in I1, every element that carried `animate-fade-in` or `animate-fade-in-scale` before this change still carries it: each file's count matches the Baseline for I2 table.
I3. In the first painted frame after a `ContextMenu` opens, by right-click or by long-press, its box is at `left = max(8, min(x, innerWidth - width - 8))` and `top = max(8, min(y, innerHeight - height - 8))`, where `(x, y)` is the pointer and `width`, `height` the menu's full-size box; it is never painted at another position first.
I4. With `prefers-reduced-motion: reduce`, any change to `CollectionItemsPane`'s items calls `Element.animate` zero times; after reduced motion is turned off, the next change animates rows from the positions the previous change left.
I5. With `prefers-reduced-motion: reduce`, every programmatic scroll in Touch points passes `behavior: "auto"`; without it, `behavior: "smooth"`; `block`, `align` and `top` are the same in both.
I6. With `prefers-reduced-motion: reduce`, releasing a knowledge-graph drag schedules no inertia frame; without it, inertia runs as before.
I7. `swipeCompletes` returns true exactly when §1 CORE-180 says so; in particular it is false whenever `longPressed` or `scrolled` is true, `dx >= 0`, `|dx| <= |dy|`, or (below a third of the width) `|dx| < 32`, `swiping` is false, `elapsedMs <= 0`, or the speed is not above 0.11 px/ms.
I8. `InboxRow` marks a row done only when `swipeCompletes` answers true for that press, and a row marked by a throw goes through the same `onDone` path as one marked by distance: the same undo toast, and under reduced motion no slide.
I9. `prefersReducedMotion()` answers false when `window` or `window.matchMedia` is undefined and otherwise the query's current `matches`, so changing the OS setting affects the next motion without a reload.
I10. `openGhost`, view transitions, the player's frame transition, the justified-grid FLIP and the Inbox swipe skip their motion under reduced motion exactly as before, now through `prefersReducedMotion()`.
I11. After the long-press fires, no pointer move in the same press changes the row's transform.
I12. Each addon check (transcript follow, detailed-summary jump, graph inertia) answers "not reduced" when `window` or `window.matchMedia` is undefined, so it never throws in jsdom.

## Revises

SPEC-CORE-157 I8. `FileContextMenu` calls each of `onTrashed`, `onRenamed` and `onMoved` exactly once after its request succeeds, before `onUpdate`, and never on failure; with `beforeChange` it sends a rename, move or trash request only after `beforeChange` calls `run`, and never when it does not; `VideoCard` and `FileContextMenu` used without the new opt-in, callbacks or gate, and `useFileMenuItems`, `ContextMenu` and `useContextMenu`, render the same DOM and behave as before, except that `ContextMenu`'s root carries no `animate-*` class and is clamped before its first paint (SPEC-CORE-178).

SPEC-CORE-150 I6. `ContextMenu`, `FileContextMenu`, `useFileMenuItems`, `useContextMenu`, `CarouselSection`, `FileGrid`, `FileActions` and `VideoCard` used without the new props render the same rows and behave as before, except that `ContextMenu` appears without an entrance animation and is clamped before its first paint (SPEC-CORE-178).

## Checked, no action

- **Other dialogs** (`ConfirmDialog`, `MoveDialog`, `RenameDialog`, …) keep their
  entrance: opened by a click on a command, occasionally — the case DESIGN.md §7 gives
  the animation to.
- **Toolbar / Add / Sort / trash toolbar menus, `CollectionPicker`, the `SelectionBar`
  overflow menu** keep their entrance and anchored origin: opened from a visible trigger,
  far less often, and not through `ContextMenu`.
- **Origin-corrected fade for the context menu** (`origin-top-left`, 120 ms): rejected;
  at its frequency the motion itself is the cost.
- **vaul / MobileInspectorSheet**: vaul's inline transition loses to the global
  `!important` override, so it already moves nothing under reduced motion.
- **`animate-spin` / `animate-pulse` frozen under reduced motion**: a separate question
  (a busy state needs a non-motion cue); not in this change.
- **Sheet pull-to-collapse velocity (0.5 px/ms)**: close to vaul's 0.4, appropriate for a
  sheet; unchanged.
- **Inbox swipe rubber-banding, right-swipe, velocity measured near release**: not added;
  the average speed with a 32 px floor is enough to separate a throw from a slip.
- **Transcript follow under reduced motion**: following is cleared only by `wheel` and
  `touchmove` on the scroller (`TranscriptSection.tsx`, `suspend`), never by a `scroll`
  event, so a jump instead of a glide cannot clear it.
- **Other rAF users** (`readingAnchor.ts`, `useShellSurface.ts`, `FileDetailShell.tsx`,
  `useInspectorFit.ts`, `useFullscreen.ts`, `excelAdapter.ts`): they measure or restore
  positions by setting them directly; none animates a position over time.
- **Easing / duration tokens, toast exit, sidebar backdrop fade, progress bars,
  `transition-all`**: LOW items from the same audit, not in this change.
- **Verification in a real browser**: only I3 needs layout and paint
  (`frontend/e2e-components/`, a fine pointer at 1280×800 and a coarse pointer at
  390×844, right-click and long-press within 20 px of the bottom-right corner, reading the
  box in the first `requestAnimationFrame` after the menu mounts; the long-press case
  matters most, because it opens from a timer rather than a discrete event). I1, I2, I4–I10 are class,
  call and pure-function checks and run in vitest.
