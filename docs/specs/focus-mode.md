# Focus mode: hide the sidebar, the header and the tree on a file page

SPEC-ID: SPEC-CORE-128
SPEC-ID: SPEC-CORE-129

Approval:

## Summary

A viewer reading or watching a file at 768px or wider can enter **focus mode** with one
press (the header button or `T`). It hides the app sidebar, the app header (with the menu
and tree buttons) and the folder tree, and gives that room to the page: the player or
document, the workbench panels and the inspector, which stays as the viewer left it. One
more press puts everything back as it was. While in focus mode, moving the pointer to the
top edge of the window (or tapping a small handle there on a touch screen) brings the
header back over the page, so search, quick note, the inspector toggle and the button
that ends focus mode stay reachable without a keyboard. Measured on the build of
2026-11-15, a file page always gives 240px (sidebar) or 280px (tree) of width and 56px of
height to chrome: at 1280×800 with the inspector open a video grows from 624×351 to
864×486, at 1440×900 from 784×441 to 1024×576. It is for the viewer who wants more room
for the file and its panes without going to the player's full screen, which hides the
panes too.

SPEC-CORE-128 is the mode: who can enter it, what it hides, how long it lasts, what it
leaves untouched. SPEC-CORE-129 is the header reveal while in it.

Design: https://claude.ai/artifact/Ku4F9y35xD25d4bb1LhewN, saved in
`docs/process/reviews/feature-focus-mode/design/` (`Main.dc.html` draws every artboard;
the others are its props). The human chose exit form A (the header reveal) over B (a
floating button cluster, drawn in `ExitFloat.dc.html` for comparison only and not to be
built), and chose "suspend, keep the state" below 768px.

## Terms

- **File page**: a page that draws a file through `FileDetailShell` inside the app shell:
  the canonical route (`/drive/{drive}/{path}?file={id}`, inside `TwoPaneLayout`) and the
  collection surface (`/files/{id}`, `FileDetailFullScreen`, reached with `?collection=`
  or `?folder_play=1`). A page drawn outside the shell (no app header) is not one.
- **Wide**: a viewport 768px or wider (`MOBILE_BREAKPOINT`).
- **Focus state**: an in-memory boolean for the tab. **Focus layout**: the focus state is
  on, the page is a file page, and the viewport is wide. Only the focus layout changes
  anything on screen.
- **Chrome**: the app sidebar's inline column, the app header (`<header>` in
  `Header.tsx`), the fixed `ChromeButtons` (menu and tree buttons) and the folder tree's
  `<aside>` in `TwoPaneLayout`.
- **Revealed**: in the focus layout, the header is drawn over the page (SPEC-CORE-129).

## Required items

### 1. Normal flow

SPEC-CORE-128:

1. On a wide file page, the header shows a **Focus mode** button. Its place is after the
   second vertical divider and before the inspector toggle where the page has an
   inspector; where it has none (the collection surface), a vertical divider follows the
   avatar and the button is the header's last control.
2. The viewer presses it, or presses `T` with no editing element focused and no overlay
   holding the keys. The focus state turns on.
3. In the focus layout:
   - the header and `ChromeButtons` are not shown and take no height; the header stays
     mounted (search, quick note, the `header-actions` slot and the file row keep their
     state, and `Cmd/Ctrl+K`, `Cmd/Ctrl+Shift+F` and `N` keep working);
   - the sidebar takes no inline width: focus mode borrows its overlay form the way
     `useOverlaySidebarWhen` does, so the menu button (once revealed) opens it over the
     page and the stored `sidebar-open` preference is not written;
   - the folder tree's pane has zero width and is inert, without writing
     `tree:enabled:{drive}` and without recording a yield in `treeYieldStore`;
   - the page's content starts at the top of the safe area (`env(safe-area-inset-top)`)
     and fills the viewport's height below it. Everything that today subtracts the
     header's 3.5rem (the `h-below-header` utility and its users) subtracts nothing in
     the focus layout;
   - the inspector, the workbench and the player keep their own rules, applied to the
     larger room: the inspector stays open or closed as it was, the workbench's
     split eligibility (SPEC-CORE-126) is computed from the new width, and
     `--player-avail` is measured from the new geometry.
4. The viewer moves to another file (next or previous file, a collection item, folder
   play's next file, a link from Related, a search result opened as a file page). The
   focus state stays on, and the new file page opens in the focus layout from its first
   painted frame.
5. The viewer presses the button again (in the revealed header) or `T`. The focus state
   turns off, and the chrome comes back exactly as it was before entering: the sidebar in
   its stored form, the tree shown or hidden or yielded as it was, the header in its file
   row form. At the same viewport the page's boxes are where they were before entering.
6. The viewer reaches a screen that is not a file page (a folder listing, Home, search
   results, settings), or reloads. The focus state is off there and stays off; focus mode
   is never restored from storage.

SPEC-CORE-129:

1. In the focus layout with a fine pointer, an 8px tall strip along the top of the
   viewport is live. When the pointer enters it, the header is revealed: drawn at the top
   of the viewport over the page, full width, with `ChromeButtons` in their usual place
   on its left, a shadow under it, and the page under it not moving.
2. While revealed, every header control works as on any file page. The Focus mode
   button shows its pressed state.
3. The header hides again when the pointer leaves the header's box, unless a menu or
   popover opened from the header is open or keyboard focus is inside the header; then
   it hides once neither holds and the pointer is outside it.
4. With a coarse pointer (touch), the strip is replaced by a handle at the top centre of
   the viewport: a visible 56×22px pill with a chevron, inside a 88×44px hit area. A tap
   reveals the header. A tap anywhere outside the header hides it. The handle is not
   drawn while the header is revealed.
5. Keyboard focus moving into the header (Tab from the page's first focusable, or
   Shift+Tab) reveals it, so the header is never focused while invisible.
6. Pressing the menu button while revealed opens the sidebar in its overlay form; focus
   mode stays on. Pressing the tree button while revealed ends focus mode (step 5 of
   128) and then acts as the tree button does on that page.

### 2. Failure cases

- `T` while an editing element (input, textarea, select, contenteditable, including the
  Markdown editor) has focus: it types `T`; focus mode does not change.
- `T` while an overlay context with `blocksLower` is open (dialogs, the PDF / EPUB /
  image full-screen viewers, the quick note panel, the cheat sheet): nothing happens, as
  for every other page shortcut.
- `T` while the player's pseudo or system full-screen frame or the mini player is shown:
  nothing happens. A layout change under the full-screen frame would contradict
  SPEC-CORE-126 I5 and SPEC-CORE-106 I8.
- `T` while keyboard focus is inside an iframe (a `.loft` YouTube embed, an HTML file, the
  EPUB reader): the key never reaches the document, so nothing happens. The header button
  (through the reveal) still works.
- The viewport becomes narrower than 768px while the focus state is on (a window resize,
  an iPad rotated to portrait): the focus layout ends and the page is laid out as an
  ordinary phone file page, while the focus state stays on. Widening again to 768px or
  more returns to the focus layout. No storage is written either way.
- `localStorage` throws or is empty: focus mode does not read or write it, so nothing
  changes.
- The file fails to load or is not found while in focus mode: the error state is drawn in
  the focus layout; the header can be revealed to navigate away.

### 3. States

Focus state: `off` (initial, after reload) and `on`.

| From | Input | To |
|---|---|---|
| off | button press or `T` on a file page at any width | on |
| on | button press or `T` | off |
| on | the tree button pressed while revealed | off, then the tree button's own transition |
| on | a screen that is not a file page is shown | off |
| on | file-to-file navigation, a resize, an inspector toggle, a panel toggle, opening Find, the sidebar overlay opened or closed | on |

`T` on a phone file page (a hardware keyboard on a narrow window) turns the state on
without changing the layout; the button is not drawn there.

Header in the focus layout (SPEC-CORE-129): `hidden` and `revealed`.

| From | Input | To |
|---|---|---|
| hidden | pointer enters the top strip (fine) / tap on the handle (coarse) / focus enters the header | revealed |
| revealed | pointer leaves the header with no header menu open and focus outside it (fine) / a tap outside the header (coarse) / focus leaves the header with the pointer outside it | hidden |
| either | focus layout ends | the ordinary header |

Entering the focus layout always starts `hidden`.

### 4. Data read and written

- New: an in-memory store for the focus state (module scope, like `treeYieldStore`). Not
  persisted.
- Read, never written by focus mode: `sidebar-open`, `tree:enabled:{drive}`,
  `inspector-open:{drive}`, `workbench-panels`, `workbench-player-focus`,
  `workbench-split`, `treeYieldStore`, `treeNarrowOpenStore`.
- The inspector toggle, the panel toggles and the split button keep writing their own
  stored values when the viewer presses them in focus mode, as they do today.
- No backend data, no API call.

### 5. External services

None. The change is frontend layout only.

### 6. Authorization

None. Focus mode shows nothing the page does not already show, and every page it
applies to has already passed the drive's access check.

### 7. Effect on existing features

- `AppShell`, `Header`, `ChromeButtons`, `SidebarProvider` (as a borrower through the
  existing overlay counter), `TwoPaneLayout` and `useTreeVisible` (the tree's width),
  the `h-below-header` utility and its users (`app/drive/[name]/layout.tsx`,
  `DriveUnavailable`), `FileDetailChrome` (the button in the trailing slot), and
  `FileDetailFullScreen` (the collection surface).
- The tree yield (SPEC-CORE-084): while in the focus layout the left pane is not shown, so
  `useInspectorFit` must not see it as a pane to yield; no yield is recorded. On leaving,
  the yield inputs are what they were before entering, so the result is the same.
- The workbench split (SPEC-CORE-126/127) and no-page-scroll (SPEC-CORE-106) read W and H
  from the page; their invariants are stated in W and H and hold unchanged with the
  larger values.
- The single header (SPEC-CORE-094/095) and the inspector toggle at the right end
  (SPEC-CORE-098): revised in `## Revises`.
- The iOS app's `shellImmersive` is about the player's full screen in the native shell
  and is not involved.
- The shortcut cheat sheet (`?`) lists `T` on file pages.

### 8. Error behavior

No new error path. Nothing is logged.

### 9. User-visible behavior

- The button: lucide `Focus` icon, a 40×40 icon button like the inspector toggle,
  `aria-pressed` true in the focus state. Accessible name and `title`: `focusMode.enter`
  「集中モード (T)」 / "Focus mode (T)" when off, `focusMode.exit` 「集中モードを終える (T)」
  / "Leave focus mode (T)" when on. The handle's accessible name: `focusMode.reveal`
  「ヘッダーを表示」 / "Show header".
- No transition animation on entering or leaving; the header reveal appears and disappears
  without animation.
- The cheat sheet, under the file page's section: `T` — 「集中モード」 / "Focus mode".
- `docs/user-guide/keyboard-shortcuts.md` (File detail) gains `T`, and
  `docs/user-guide/viewers-and-players.md` (The page row) gains how to enter focus mode,
  how to get the header back, and that it ends when leaving the file.
- Defaults: off on every load.

### 10. Non-functional

- Entering and leaving focus mode never remounts the `<video>` element, a `.loft` or HTML
  iframe, the EPUB / PDF viewer, a workbench panel, the inspector, or the folder tree
  pane, and never changes the playback position or play state.
- The first painted frame after a press is already in the new layout (no frame with the
  header hidden and the old heights, nor the reverse).
- No network request is made by focus mode.

## Design decisions to check

From `docs/process/reviews/feature-focus-mode/design/`:

- D1. Focus layout at 1440×900, inspector open: no sidebar, no header, no tree; the
  canvas is 1056px wide and starts at the viewport's top; the inspector is 384px at the
  right edge, full height.
- D2. Focus layout at 1280×800, inspector open: the canvas is 896px wide.
- D3. Focus layout, inspector closed: the canvas is the viewport's full width.
- D4. The ordinary header on a wide canonical file page, right end: avatar, divider,
  Focus mode button, inspector toggle (the last control).
- D5. On the collection surface: avatar, divider, Focus mode button (the last control).
- D6. Revealed (A): the full header with the menu and tree buttons at its left overlays
  the top 56px of the page with a shadow; the page does not move; the Focus mode button
  is pressed.
- D7. Touch (iPad landscape 1180×820): a handle pill with a down chevron at the top
  centre; nothing else floats over the page.
- D8. PDF in the focus layout: the page toolbar and the page are centred in the wider
  canvas; the page keeps its width cap.
- D9. Collection surface in the focus layout: the content column keeps its width and
  starts 40px below the viewport's top.
- D10. Nothing floats over the page in the focus layout with a fine pointer while the
  header is hidden.

## Touch points

- `frontend/src/lib/focusModeStore.ts` (new): the in-memory focus state.
- `frontend/src/hooks/useFocusMode.ts` (new): the state, the focus layout (state × file
  page × wide), and the `T` shortcut context.
- `frontend/src/components/AppShell.tsx`: the focus layout's attribute on the shell, the
  sidebar borrow, the reveal strip and handle.
- `frontend/src/components/Header.tsx`: hidden / revealed / ordinary forms; stays
  mounted.
- `frontend/src/components/ChromeButtons.tsx`: hidden with the header, shown with it.
- `frontend/src/components/SidebarProvider.tsx`: read only (`useOverlaySidebarWhen`),
  unless the borrow needs a new entry point.
- `frontend/src/components/folder/TwoPaneLayout.tsx`, `frontend/src/hooks/useTreeVisible.ts`:
  the tree's width and `inert` in the focus layout; the overlay borrow.
- `frontend/src/components/FileDetailShell.tsx`, `frontend/src/components/FileDetail/hooks/useInspectorFit.ts`:
  no yield while the focus layout hides the pane.
- `frontend/src/components/FileDetail/FileDetailChrome.tsx`: the Focus mode button in the
  trailing unit.
- `frontend/src/components/FileDetailFullScreen.tsx`: the collection surface as a file
  page for the focus state.
- `frontend/src/app/globals.css`: `h-below-header` in the focus layout; the reveal's
  overlay and layering (`DESIGN.md` §Layering).
- `frontend/src/app/drive/[name]/layout.tsx`, `frontend/src/components/DriveUnavailable.tsx`:
  users of `h-below-header`.
- `frontend/src/components/ShortcutsProvider.tsx` / `frontend/src/lib/shortcuts.ts`: read
  only; the `T` context uses the existing editing and overlay rules.
- `frontend/src/components/player/hooks/useFullscreen.ts` and the mini player: read, so
  `T` can do nothing while their frame is shown.
- `frontend/src/messages-core/ja.json`, `frontend/src/messages-core/en.json`:
  `focusMode.enter`, `focusMode.exit`, `focusMode.reveal`, and the cheat sheet label.
- `DESIGN.md` §Header (the button's place, the hidden and revealed forms) and §Layering
  (the revealed header's tier).
- `docs/user-guide/keyboard-shortcuts.md`, `docs/user-guide/viewers-and-players.md`.
- Tests: `frontend/src/**/__tests__/` (state, store, shortcut), `frontend/e2e-layout/`
  (geometry, the reveal, the restore), as `docs/process/PROJECT.md` requires for layout.
- `.claude/rules/design-decisions.md` (SPA navigation; no rule changes),
  `.claude/rules/frontend-conventions.md` (DESIGN.md, i18n in `messages-core/`).
- No protected path is edited.

## Invariants

I1. In the focus layout at any wide viewport, no pixel of the app header, the menu
button, the tree button, the sidebar or the folder tree is painted while the header is
hidden; the page's content box starts at the top of the safe area and ends at the
viewport's bottom (within 1px); and at 1440×900 and 1280×800 with the inspector open the
canvas is the viewport's width less 384px (within 1px).

I2. Entering and then leaving focus mode at the same viewport, with no other input in
between, leaves `sidebar-open`, `tree:enabled:{drive}`, `inspector-open:{drive}` and
`treeYieldStore`'s state for the drive exactly as they were, and every box of the page
(header, sidebar, tree pane, canvas, inspector, player frame) where it was before
entering (within 1px); this holds with the tree shown by setting, hidden, yielded and
reopened, and with the sidebar stored open and closed.

I3. Entering or leaving focus mode, a reveal or a hide never remounts the `<video>`
element, a `.loft` or HTML iframe, the PDF or EPUB viewer, any workbench panel, the
inspector or the tree pane, and never changes the playback position or play state.

I4. The focus state survives every file-to-file navigation listed in §1 (step 4 of 128),
and the first painted frame of the next file page has no header and no sidebar or tree
width; it is off on the first frame of any screen that is not a file page and after a
reload.

I5. Below 768px the page is laid out exactly as a phone file page whatever the focus
state, and widening back to 768px or more with the state on gives the focus layout.

I6. `T` toggles the focus state on a file page only when no editing element has focus,
no `blocksLower` overlay is open, and neither the player's full-screen frame nor the mini
player is shown; in every other case it changes nothing and, in an editing element,
types the character.

I7. In the focus layout with the header revealed, the header is drawn at the viewport's
top over the page, and the canvas, the inspector and the player frame are at the same
positions as while hidden (within 1px); hiding leaves them there too.

I8. In the focus layout, `Cmd/Ctrl+K`, `Cmd/Ctrl+Shift+F`, `N` and `Cmd/Ctrl+\` do what
they do outside it, and the search window and quick note panel they open are visible.

I9. On a wide file page outside focus mode, the inspector toggle is still the header's
last control where the page has an inspector, and the Focus mode button sits between the
second divider and it; on the collection surface a divider follows the avatar and the
Focus mode button is the last control.

I10. With a coarse pointer in the focus layout, the handle is the only thing drawn over
the page while the header is hidden, a tap on it reveals the header, and a tap outside
the header hides it.

## Revises

SPEC-CORE-094 I1. On a file page (canonical or collection route; loading, loaded or failed) outside the focus layout of SPEC-CORE-128, the page shows exactly one row above the content, its height equals the header's height on a folder page of the same drive at the same width, the content's top y is the same in all three states, and the header never shows its ordinary form while the viewer stays on a file page (loading → loaded, file → file); in the focus layout the page shows no row above the content and the content's top is the top of the safe area in all three states.

SPEC-CORE-094 I3. At < 768px on a file page, the row shows no quick note button, no avatar, no tree button, no inspector toggle and no Focus mode button, and while walking the Inbox no search and no document controls; at ≥ 768px, outside the focus layout or with the header revealed in it, it shows the quick note button, the avatar, the tree button wherever a current drive is known, the Focus mode button, and the inspector toggle wherever the page has an inspector, including while a rename is open.

SPEC-CORE-098 I2. On a hosted file page with an inspector at a viewport of 768px or wider, exactly one divider lies between the profile button and the Focus mode button, 12px from each, the Focus mode button sits immediately left of the inspector toggle, and the divider that separates the file's controls from search is still present.

SPEC-CORE-098 I3. On a page that is not a file page, or below 768px, the header contains no inspector toggle, no Focus mode button and no divider after the profile button, and the profile button's right edge is 16px from the header's right end; on a hosted file page without an inspector at 768px or wider, one divider follows the profile button and the Focus mode button is the header's last control, its right edge 16px from the header's right end.

## Checked, no action

- **Calling `requestFullscreen` on the document when entering.** The human agreed not to:
  the address bar disappearing makes it hard to tell from the player's `F` full screen,
  and `Esc` would leave only the browser full screen, a half state. The OS's own full
  screen works together with focus mode.
- **`Esc` to leave focus mode.** `Esc` already closes the topmost dialog and leaves the
  player's full screen; a fourth meaning would make one press do two things.
- **Persisting the focus state.** The agreed lifetime is "while on file pages in this
  tab". A stored value would land a viewer on a header-less screen on the next visit
  with no memory of why.
- **Exit form B (a floating cluster).** Drawn for comparison; rejected by the human. It
  covers the player's corner, and search and quick note would be key-only.
- **Hiding the inspector too.** The request is to widen the page with its panes; the
  inspector keeps its own toggle.
- **Pages outside the shell and non-file screens** (folder listings, Home, the Ask page,
  addon apps). The request is about reading and watching a file; the listing screens
  have no single thing to give the room to.
- **The phone.** Its file page already gives the header a single row and the inspector a
  sheet; below 768px the focus layout is suspended (human decision).
- **Gain on the collection surface and for PDF / Markdown is mainly the 56px of
  height.** Measured; kept for one consistent behaviour across file pages.
- **`T` inside an iframe.** A document listener cannot see keys typed into a
  cross-document frame; the reveal and the button cover that case.
- **The native iOS shell's immersive mode (`shellImmersive`).** It serves the player's
  full screen; focus mode does not hold it.
- **Animating the reveal.** The header is reached by aiming at the top edge; a slide-in
  would put the controls under the pointer only after the motion ends.
