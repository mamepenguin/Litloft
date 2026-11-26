# Backdrops fade in, choice menus open instantly, toasts leave and close the gap

SPEC-ID: SPEC-CORE-181
SPEC-ID: SPEC-CORE-182
SPEC-ID: SPEC-CORE-183

Approval: sha256:1f92c18c13c3ce37f146c87b8c5a5ebc4b257e7c069279842b4ff0735daff925 Yuichi Senga 2026-11-26

## Summary

Follow-up to SPEC-CORE-178, which made the search palette, the shortcut cheat sheet,
the quick note panel and the context menu appear without animation. Their full-screen
dim backdrops now also appear in one frame, and the whole screen darkening at once
reads as a flash. This change separates a surface from the dim behind it:

- **SPEC-CORE-181 — backdrops.** Every dim this change touches fades in over 150ms
  (opacity only) and disappears in one frame when its surface closes: the backdrops of
  the three instant surfaces, the overlay sidebar's backdrop (today it cuts in and out
  while the panel slides), the shared phone menu scrim `MENU_SCRIM`, and the player
  settings panel's sheet scrim (today it cuts in while the sheet slides). The three
  instant surfaces and the sidebar share one dim: `bg-black/40`, no blur.
- **SPEC-CORE-182 — toasts.** A dismissed toast (timer, close button or action) fades
  out over 150ms before it is removed, and the toasts that stay travel to their new
  places over 200ms `ease-out` instead of jumping, both when one leaves and when a new
  one pushes the stack up.
- **SPEC-CORE-183 — choice menus.** The dropdown menus opened by a click to choose
  from — sort, every menu built on `useMenuSurface`, the add menu, the trash type filter
  and the selection bar's overflow menu — lose `animate-fade-in-scale` and appear in one
  frame. DESIGN.md §7's instant rule is widened from "opened from a shortcut key or a
  right-click" to menus and palettes however they are opened, with modal dialogs and
  edge sheets named as keeping their motion (wording under Touch points).

Under `prefers-reduced-motion: reduce` none of this moves: dims appear in one frame,
toasts are removed at once and nothing travels.

## Required items

### 1. Normal flow

SPEC-CORE-181:

1. The viewer opens the search palette on a desktop-width window (`ctrl+k`,
   `ctrl+shift+f` or the search button). The panel appears at full opacity and size,
   with focus in its input, as today. The backdrop starts at opacity 0 and reaches
   its final `bg-black/40` 150ms later (`ease-out`). Typing works from the start.
2. The same for the shortcut cheat sheet (`?`) and the quick note panel (`n` or its
   button).
3. The viewer closes any of the three (Escape, backdrop click, the close button, or
   choosing a result). The panel and the backdrop are removed in the same render. With
   the quick note holding unsaved text, a backdrop click opens the discard confirmation
   as today; the backdrop stays mounted and does not fade again.
4. Below 1200px (or on the file detail page) the viewer opens the overlay sidebar. The
   panel slides in over 150ms as today; the backdrop fades in over the same 150ms. On
   close the panel slides out as today and the backdrop is removed at once.
5. Below 640px the viewer opens a menu whose `DismissScrim` uses the default
   `MENU_SCRIM`: sort, every `useMenuSurface` menu (`ToolbarMenu`, `FilterMenu`,
   `OverflowMenu`, `ArchiveToolbar`'s and `FolderToolbar`'s more menus,
   `ConditionMenu`). The menu appears at once; the `bg-black/30` scrim fades in over
   150ms. At 640px and wider the scrim is transparent, so the fade is invisible there.
6. The viewer opens the player settings panel in its sheet form (not the popover). The
   sheet slides as today (`animate-slide-up-bar` / `animate-slide-down-bar`); its
   `bg-black/40` scrim fades in over 150ms. The popover form has no dim and is
   unchanged.

SPEC-CORE-182:

1. A toast is pushed. It enters as today (150ms opacity + 8px rise). Toasts already on
   screen move up by the new toast's height plus the gap, travelling over 200ms
   `ease-out` from where they are drawn at that moment.
2. A toast is dismissed — its 5 s timer fires, the viewer presses its close button, or
   presses its action (the action's `onClick` runs first, as today). The toast becomes
   leaving: it carries the `inert` attribute and `aria-hidden="true"`, its opacity goes
   to 0 over 150ms in place, and it is then removed. If focus is still inside it when
   it becomes leaving (after the action's `onClick`, which may move focus elsewhere),
   focus is moved to `document.body`, where removal leaves it today.
   Toasts that were above it travel down to close the gap over 200ms `ease-out` once it
   is removed.
3. A toast still in its entrance when the stack moves keeps its entrance running; the
   travel applies to its layout position, and the entrance's own 8px rise adds to it
   until the entrance ends.
4. A leaving toast keeps its slot in the stack until removed. When the stack moves while
   it fades (a new toast is pushed), it travels with the stack like any other toast.

SPEC-CORE-183:

1. The viewer clicks the sort button, a `useMenuSurface` menu's trigger, the add button,
   the trash type-filter button, or the selection bar's overflow button. The menu is
   drawn at full opacity and scale in its first painted frame.

### 2. Failure cases

- `Element.animate` is not a function (test environment, old engine): the stack skips
  the travel, toasts land at their new positions at once, and nothing throws.
- A toast dismissed twice (timer fires during its fade, or a second press): the second
  call changes nothing; the toast is removed once.
- A travel interrupted by the next change: the new travel starts from where the toast
  is drawn at that moment (its bounding rect, which includes the in-flight transform),
  and the earlier animation on that toast is cancelled.
- The provider unmounts while toasts are showing or leaving. In the app this does not
  happen (`ToastProvider` sits in the root layout); it happens in tests. Every toast
  timer — the 5 s timers and the leave timers — is tracked and cleared on unmount, so no
  timer fires and no state update runs afterwards.

### 3. States

- Dim (each backdrop and scrim above): absent → fading in (150ms) → shown → absent.
  fading in → absent is allowed (closing within 150ms removes it at once). There is no
  fading-out state; a closing surface never leaves its dim mounted. shown → fading in is
  not allowed while the surface stays open: the quick note's discard confirmation, a
  `DismissScrim`'s `disabled` toggle and any other re-render keep the same dim element
  mounted, so its animation does not restart.
- Toast: entering (existing 150ms) → shown → leaving (150ms, inert) → removed. entering
  → leaving is allowed (closing or acting during the entrance). leaving → shown and
  leaving → entering are not allowed. The 5 s timer firing on a leaving or removed toast
  changes nothing. Under reduced motion: shown → removed, no leaving state.
- Choice menus: closed ↔ open, with no intermediate drawn state.

### 4. Data read and written

None. No stored data, local storage or server state changes. Reads
`prefers-reduced-motion` through `prefersReducedMotion()` (`frontend/src/lib/reducedMotion.ts`).

### 5. External services

None.

### 6. Authorization

None: purely presentational, nothing gated.

### 7. Effect on existing features

- `MENU_SCRIM` is the default `className` of `DismissScrim`, used by `SortButton`,
  `ToolbarMenu`, `FilterMenu`, `OverflowMenu`, `ArchiveToolbar`, `FolderToolbar` and
  `ConditionMenu`. Scrims that pass their own `className` are unchanged, except
  `OverFrameSettingsPanel`, edited directly. The scrim's press handling (dismiss on the
  press, swallow the click) is untouched; the fade changes only opacity, and the scrim
  takes presses from its first frame as today. A scrim that stays mounted while its
  menu stays open (`FolderToolbar`'s `disabled` toggle, `AddButton`'s addon dialog) does
  not replay the fade, because the element is not remounted.
- `useMenuSurface`'s default base (`MENU_SURFACE_BASE` in `ToolbarMenu.tsx`) is shared by
  `ToolbarMenu`, `FilterMenu`, `OverflowMenu`, `ArchiveToolbar`, `FolderToolbar` and
  `ConditionMenu`; `SortButton` passes its own `SORT_MENU_SURFACE_BASE`, edited
  separately.
- `ToastProvider`'s public API (`useToast().error/success/info`, `ToastOptions.action`)
  is unchanged. A dismissed toast stays in the DOM 150ms longer; role queries skip it
  (`aria-hidden`), text queries do not. Tests elsewhere that render a real
  `ToastProvider` and assert a toast's text is gone right after dismissal need to wait
  150ms; none is known, and any found is updated the same way.
- The panels of the three instant surfaces, the context menu and the mobile search sheet
  keep their SPEC-CORE-178 behaviour (no animation).
- Modal dialogs and their backdrops are unchanged.
- Existing tests that pin what this change edits are updated to the new behaviour,
  keeping their assertions as strict:
  - `src/__tests__/motionEntranceBaseline.test.ts` — the five menu files move to 0.
  - `src/components/__tests__/GlobalSearch.test.tsx` and
    `src/components/__tests__/QuickNote.test.tsx` (SPEC-CORE-178 I1) — assert that the
    panel carries no `animate-*` and that the backdrop carries exactly
    `animate-backdrop-in`, per the revised SPEC-CORE-178 I1; no other element carries
    an `animate-*` class.
  - `ToolbarMenu.test.tsx`, `FilterMenu.test.tsx` — the surface class list without
    `animate-fade-in-scale`.
  - `ToastProvider.test.tsx`, `ToastProvider.action.test.tsx` — removal 150ms after
    dismissal.
  - The e2e-layout fixtures that copy these class strings (`popup-dismiss.html`
    `scrimClass`, `sidebar-shell.html` `scrim`, `toolbar-menu.html` `surfaceBase`) take
    the new strings; their parity tests keep comparing them exactly with `MENU_SCRIM`,
    the sidebar backdrop and `MENU_SURFACE_BASE`.

### 8. Error behavior

None: no failure path is visible to the viewer, and nothing is logged.

### 9. User-visible behavior

- Opening the palette, the cheat sheet or the quick note: the panel is instantly there;
  the page behind darkens over 150ms to a lighter dim than today (`/40` instead of
  `/50`–`/60`) and is no longer blurred behind the cheat sheet and the quick note.
- Closing them: the page brightens in one frame, as today.
- Overlay sidebar: the backdrop darkens along with the slide; its dim becomes `/40`
  (from `/50`).
- Phone menus: the `/30` scrim fades in instead of cutting in.
- Player settings sheet: its `/40` scrim fades in along with the slide.
- Toasts fade out instead of vanishing, and the stack slides instead of jumping.
- Sort, toolbar, filter, condition, add, trash filter and selection-bar overflow menus
  appear without the 200ms grow-in.
- Reduced motion: everything above appears and disappears in one frame.

No text, ordering or default changes. No user-guide page changes (DESIGN.md is updated).

### 10. Non-functional

- Opacity and transform only, so no layout is recomputed per frame. Removing
  `backdrop-blur-sm` from the two backdrops also removes a per-frame blur of whatever is
  behind them (a playing video).
- No timer outlives its toast (§2).

## Touch points

- `frontend/src/app/globals.css` — new `animate-backdrop-in` utility: the existing
  `fade-in` keyframes, `150ms ease-out both`.
- `frontend/src/components/GlobalSearch.tsx` — desktop backdrop: `bg-black/40
  animate-backdrop-in`.
- `frontend/src/components/ShortcutCheatSheet.tsx` — backdrop: `bg-black/40
  animate-backdrop-in`, no `backdrop-blur-sm`.
- `frontend/src/components/quick-note/QuickNotePresenter.tsx` — backdrop: as above.
- `frontend/src/components/Sidebar.tsx` — overlay backdrop: `bg-black/40
  animate-backdrop-in`.
- `frontend/src/components/DismissScrim.tsx` — `MENU_SCRIM` gains `animate-backdrop-in`.
- `frontend/src/components/player/MediaControls/parts/OverFrameSettingsPanel.tsx` — the
  sheet form's scrim: `bg-black/40 animate-backdrop-in`; the popover form unchanged.
- `frontend/src/components/ToastProvider.tsx` — leaving state (`inert`, `aria-hidden`,
  opacity 0), 150ms leave timer, all toast timers tracked and cleared on unmount, focus
  handling (only when focus is still inside the toast after the action's `onClick`), FLIP travel of the remaining toasts
  with `Element.animate`, reduced-motion bypass.
- `frontend/src/components/SortButton.tsx`, `frontend/src/components/ToolbarMenu.tsx`,
  `frontend/src/components/AddButton.tsx`, `frontend/src/components/trash/TrashToolbar.tsx`,
  `frontend/src/components/SelectionBar.tsx` — remove `animate-fade-in-scale` from the
  menu surface.
- Tests updated (§7): `frontend/src/__tests__/motionEntranceBaseline.test.ts`,
  `frontend/src/components/__tests__/GlobalSearch.test.tsx`,
  `frontend/src/components/__tests__/QuickNote.test.tsx`,
  `frontend/src/components/__tests__/ToolbarMenu.test.tsx`,
  `frontend/src/components/folder/__tests__/FilterMenu.test.tsx`,
  `frontend/src/components/__tests__/ToastProvider.test.tsx`,
  `frontend/src/components/__tests__/ToastProvider.action.test.tsx`.
- e2e-layout fixtures and the tests that read them: `frontend/e2e-layout/fixtures/popup-dismiss.html`,
  `frontend/e2e-layout/fixtures/sidebar-shell.html`,
  `frontend/e2e-layout/fixtures/toolbar-menu.html`, their `*FixtureParity.test.tsx`
  files, `frontend/e2e-layout/popup-dismiss.spec.ts`,
  `frontend/e2e-layout/sidebar-shell.spec.ts`.
- New acceptance tests for I4, I6 and I10 in `frontend/e2e-components/` (real browser).
- `DESIGN.md` §7 Animation — a row for `animate-backdrop-in`; the `animate-slide-up` row
  no longer claims toasts (nothing uses it; `ToastProvider` draws its own transition);
  the instant paragraph replaced by:

  > **Menus and palettes appear without animation**, however they are opened: the
  > search palette, the shortcut cheat sheet, the quick note panel, the context menu and
  > every dropdown menu of choices. Each is opened to type or choose in, many times a
  > day; motion would only stand between the press and the input. **Modal dialogs**
  > (confirm, rename, move, pick a collection) keep their fade, and **sheets that slide
  > from an edge** (the overlay sidebar, the player settings sheet, the selection bar)
  > keep their slide: they are not opened to pick at once, and the slide says where
  > they came from.
  >
  > **The dim behind a menu, a palette or an edge sheet fades in over 150ms
  > (`animate-backdrop-in`) and disappears at once.** Darkening the whole screen in one
  > frame reads as a flash; brightening it does not, and a dim that lingers after its
  > surface closes would swallow the next press. A modal dialog's dim follows its
  > dialog.
  >
  > **A toast fades out, and the toasts that stay travel** to their new places over
  > 200ms `ease-out`.

- Rule passed through: `.claude/rules/frontend-conventions.md` (DESIGN.md is the design
  system).

No protected path is edited.

## Invariants

I1. When the search palette (desktop), the shortcut cheat sheet or the quick note panel opens, the panel carries no `animate-*` class (an `animate-spin` on a descendant is allowed), and the search palette's input holds focus as before this change.
I2. The backdrops of those three surfaces, the overlay sidebar's backdrop, `MENU_SCRIM` and the player settings sheet's scrim each carry `animate-backdrop-in` and no other `animate-*` class; the three surfaces' and the sidebar's backdrops are `bg-black/40` with no `backdrop-blur-*` class; the player settings popover's scrim carries no dim and no `animate-*` class.
I3. When any of those surfaces closes, including within 150ms of opening, its dim element is absent from the DOM in the same render that closes it; while it stays open it is the same DOM node from open to close: opening the quick note's discard confirmation, or toggling a `DismissScrim`'s `disabled`, does not replace it.
I4. In a real browser, an element carrying `animate-backdrop-in` has exactly one running animation, which changes only `opacity`, from 0 to 1, over 150ms; with `prefers-reduced-motion: reduce` emulated, that animation's duration is under 1ms.
I5. A dismissed toast stays in the DOM for 150ms carrying `inert` and `aria-hidden="true"`, with focus moved out of it to `document.body` if it held focus, then is removed; under reduced motion it is removed in the same render as the dismissal. A second dismissal, or the timer firing on a leaving or removed toast, changes nothing.
I6. In a real browser, when a toast is pushed or removed while no toast is in its entrance, every other toast's on-screen top in the first frame after the change equals its top in the frame before, within 1px, and every toast reaches its new resting place within 250ms; this holds also when the change arrives while an earlier travel is still running.
I7. Under reduced motion `Element.animate` is called zero times for toast changes; when `Element.animate` is not a function, a toast change throws nothing and every toast is at its new resting place in the next frame.
I8. A toast's action `onClick` runs exactly once, before its leave begins, and cannot run during the leave (pointer or keyboard); the 5 s timer still dismisses an untouched toast; `useToast()`'s API and its no-op fallback outside the provider are unchanged; after the provider unmounts, no toast timer (5 s or leave) fires and no state update runs.
I9. The menu surfaces of `SortButton`, `MENU_SURFACE_BASE`, `AddButton`, `TrashToolbar`'s type filter and `SelectionBar`'s overflow menu carry no `animate-*` class; every other product file keeps its `animate-fade-in` / `animate-fade-in-scale` count from the SPEC-CORE-178 baseline; the e2e-layout fixture parity tests still compare `popup-dismiss.html`'s `scrimClass`, `sidebar-shell.html`'s `scrim` and `toolbar-menu.html`'s `surfaceBase` exactly with the product strings.
I10. In a real browser, a leaving toast's computed opacity falls from 1 to 0 within 150ms (below 0.5 by 100ms) while its on-screen top stays within 1px unless the stack moves; an entering toast starts at opacity 0 and 8px below its resting top and is at opacity 1 and its resting top within 200ms.

## Revises

SPEC-CORE-178 I1. Opening the search palette (desktop panel, phone sheet), the shortcut cheat sheet (panel), the quick note panel (panel) or any `ContextMenu` starts no CSS animation on those elements: none of them carries an `animate-*` class (an `animate-spin` on a descendant is allowed); the backdrops behind the palette, the cheat sheet and the quick note carry `animate-backdrop-in` and no other `animate-*` class (SPEC-CORE-181).

SPEC-CORE-178 I2. Outside the elements named in I1, every element that carried `animate-fade-in` or `animate-fade-in-scale` before SPEC-CORE-178 still carries it, except the menu surfaces of `SortButton`, `ToolbarMenu`, `AddButton`, `TrashToolbar` and `SelectionBar`, which carry none (SPEC-CORE-183): each file's count matches the Baseline for I2 table with those five rows at 0.

SPEC-CORE-032 I17. A toast without an action renders as before SPEC-CORE-032 and is dismissed by its 5 s timer as before; since SPEC-CORE-182 every dismissal, with or without an action, leaves through a 150ms fade (none under reduced motion).

## Checked, no action

- **Modal dialog backdrops** (`ConfirmDialog`, `MoveDialog`, `NameInputDialog`,
  `CopyIdDialog`, `SmartFolderSaveDialog`, `BatchRenameDialog`, `CollectionPicker`, the
  addon dialogs): they already fade in with their panel, are opened occasionally and
  keep `bg-black/60 backdrop-blur-sm`. Unifying them with `/40` would touch ~15 files in
  three repositories for no reported problem.
- **Fading a dim out on close.** A fading dim must stay mounted and must not take
  presses, or it swallows the click that follows the close (the reason the capture
  basket closes at once). Brightening in one frame is far less noticeable than darkening.
- **The mobile search sheet** is an opaque full-screen page, not a dim; replacing the
  screen at once is navigation, and stays as SPEC-CORE-178 left it.
- **Transparent scrims with their own `className`** — `ContextMenu`, `AddButton`,
  `FileActions`, `FolderPicker`, `EditableTagChips`, `FilterField`, `TrashToolbar`,
  `SelectionBar`, `EpubPreview`, and the player settings popover — draw no dim; nothing
  to fade.
- **The player settings sheet's slide** is kept: it is an edge sheet (DESIGN.md wording
  above).
- **Handing off from one dimmed surface to another** (the palette footer's Keyboard
  Shortcuts button closes the palette and opens the cheat sheet): the outgoing dim is
  removed and the incoming one fades in from 0, a 150ms dip. Accepted: the path is rare,
  and keeping one dim across two unrelated components needs shared state for it.
- **Dialogs whose dim cuts in today** (`CollectionDetail`'s delete confirmation,
  `DrivesSection`'s two dialogs, `PasswordsSection`'s dialog — `bg-black/50`, no
  animation): they are modal dialogs, opened occasionally, and the DESIGN.md sentence
  leaves a dialog's dim to its dialog. Giving every dialog one entrance is a separate
  change.
- **The `origin-*` classes** on the menu surfaces (`ToolbarMenu.tsx`,
  `useAnchoredDirection.ts`) existed for the removed scale. They are kept with their
  tests unchanged (`toolbar-menu.spec.ts` still measures the origin): without an
  animation they draw nothing, and removing them is cleanup outside this change.
- **Easing and duration tokens** (the audit's LOW item): one new utility does not justify
  a token system; the duration is stated in DESIGN.md beside it.
- **Toast entrance**: kept as is (150ms opacity + rise); only the exit and the travel are
  added.
- **Sidebar close**: the panel keeps its 150ms slide-out; only the backdrop is cut, per
  the dim rule.
- **Addons**: no addon menu carries the entrance any more (`FileAIActionsButton` already
  dropped it); addon dialogs are dialogs, above. No addon change.
