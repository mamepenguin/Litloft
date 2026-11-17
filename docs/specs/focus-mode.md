# Focus mode: hide the sidebar, the header and the tree on a file page

SPEC-ID: SPEC-CORE-128
SPEC-ID: SPEC-CORE-129

Approval:

## Summary

A viewer reading or watching a file at 768px or wider can enter **focus mode** with one
press (the header button or `T`). It hides the app sidebar, the app header (with the menu
and tree buttons) and the folder tree, and gives that room to the page: the player or
document, the workbench panels and the inspector, which stays as the viewer left it. One
more press lays the chrome out again. While in focus mode, moving the pointer to the top
edge of the window (or tapping a small handle there on a touch screen) brings the header
back over the page, so search, quick note, the inspector toggle and the button that ends
focus mode stay reachable without a keyboard. Measured on the build of 2026-11-15, a file
page always gives 240px (sidebar) or 280px (tree) of width and 56px of height to chrome:
at 1280×800 with the inspector open a video grows from 624×351 to 864×486, at 1440×900
from 784×441 to 1024×576. It is for the viewer who wants more room for the file and its
panes without going to the player's full screen, which hides the panes too.

SPEC-CORE-128 is the mode: who can enter it, what it hides, how long it lasts, what it
leaves untouched. SPEC-CORE-129 is the header reveal while in it.

Design: https://claude.ai/artifact/Ku4F9y35xD25d4bb1LhewN, saved in
`docs/process/reviews/feature-focus-mode/design/` (`Main.dc.html` draws every artboard;
the others are its props). The human chose exit form A (the header reveal) over B (a
floating button cluster, drawn in `ExitFloat.dc.html` for comparison only and not to be
built), "suspend, keep the state" below 768px, every in-shell file page as the scope, the
tree button ending focus mode and showing the tree, a fresh layout on leaving, and a
dismissing tap that does not reach the page.

## Terms

- **File page**: any screen whose file row is drawn into the app header, that is, while
  `FileHeaderRowProvider` has a registered drawer (`top !== null`). This covers every way
  a file opens inside the app shell: `?file=` on a folder (`TwoPaneLayout`), `?file=` on a
  view or a search (`app/drive/[name]/layout.tsx`'s cross-folder `RightPaneFile`), and
  every form of `/files/{id}` (`FileDetailFullScreen`: `?collection=`, `?folder_play=1`,
  `?smart_collection=`, `?nav=inbox`, and none), in its loading, loaded and failed
  states, whether or not the file kind uses `FileDetailShell`. SPEC-CORE-094 I1 already
  holds this signal continuous across loading → loaded and file → file. A page outside
  the shell (no app header) is not a file page.
- **Wide**: a viewport 768px or wider (`MOBILE_BREAKPOINT`).
- **Focus state**: an in-memory boolean for the tab. **Focus layout**: the focus state is
  on, the screen is a file page, and the viewport is wide. Only the focus layout changes
  anything on screen.
- **Chrome**: the app sidebar's inline column, the app header (`<header>` in
  `Header.tsx`), the fixed `ChromeButtons` (menu and tree buttons) and the folder tree's
  `<aside>` in `TwoPaneLayout`.
- **Hidden / revealed**: the two forms of the header in the focus layout
  (SPEC-CORE-129). "The header" in 129 means the `<header>` and `ChromeButtons` together.
- **Full screen**: the player's pseudo or system full-screen frame (`useFullscreen`'s
  `isFullscreen`), and the PDF / EPUB / image full-screen viewers.

## Required items

### 1. Normal flow

SPEC-CORE-128:

1. On a wide file page, the header shows a **Focus mode** button in the trailing unit
   after the avatar: a vertical divider, the Focus mode button, then the inspector toggle
   where the page has one. Where the page has no inspector toggle (the error state, a
   collection video), the Focus mode button is the header's last control. The button is
   drawn in the loading, loaded and failed states alike, so focus mode can always be left
   from the header.
2. The viewer presses it, or presses `T` with no editing element focused, no overlay
   context with `blocksLower` open and no full screen shown. The focus state turns on.
3. In the focus layout:
   - the header and `ChromeButtons` are hidden: they take no height, paint nothing, are
     `inert` (out of the tab order and the accessibility tree), and stay mounted (search,
     quick note, the `header-actions` slot and the file row keep their state, and
     `Cmd/Ctrl+K`, `Cmd/Ctrl+Shift+F`, `N` and `Cmd/Ctrl+\` keep working). If keyboard
     focus was inside the header on entry, it moves to the file page's content region;
   - the sidebar takes no inline width and is closed; it is borrowed in its overlay form
     the way `useOverlaySidebarWhen` borrows it, so the menu button (once revealed) opens
     it over the page and the stored `sidebar-open` preference is not written;
   - the folder tree's pane has zero width and is `inert`, without writing
     `tree:enabled:{drive}`, without touching `treeYieldStore` and without a yield being
     recorded (`useInspectorFit` sees no pane to yield while the focus layout hides it);
   - the page's content starts at the top of the safe area (`env(safe-area-inset-top)`).
     On a page laid out in `h-below-header` (folder, view and search file pages) that box
     fills the viewport below the safe area; on `/files/{id}`, which scrolls the
     document, the content column keeps the gap above it it has today (40px at 1440×900),
     measured from the safe area's top;
   - `--app-header-h` is `0px`, so everything that reads it (`useCompanionMetrics`'s H and
     `--player-avail` on `/files/{id}`) measures from the viewport's top;
   - the inspector, the workbench and the player keep their own rules, applied to the
     larger room: the inspector stays open or closed as it was, the workbench's split
     eligibility (SPEC-CORE-126) is computed from the new width, and `--player-avail` is
     measured from the new geometry.
   The change happens in one frame: the sidebar's `padding` transition and the tree's
   `width` transition do not run for entering or leaving.
4. The viewer moves to another file (next or previous file, a collection item, folder
   play's next file, an Inbox step, a link from Related, a search result). The screen
   stays a file page, the focus state stays on, and every frame of the next file page is
   in the focus layout.
5. The viewer presses the Focus mode button (in the revealed header) or `T`. The focus
   state turns off, and the chrome is laid out as it would be for the current file page
   had focus mode never been on: the sidebar from its stored preference and its overlay
   rules, the tree from `tree:enabled:{drive}`, `treeYieldStore` and the yield rule
   (SPEC-CORE-084) evaluated for the current file, the header in its file row form. With
   no other input since entering, that is exactly the layout before entering.
6. The screen stops being a file page (a folder listing, Home, a search results list,
   settings), or the tab reloads. The focus state turns off and is never restored from
   storage.

SPEC-CORE-129:

1. In the focus layout, where `(any-pointer: fine)` matches, the pointer reaching the top
   8px below the safe area's top reveals the header. This is a position check on
   `pointermove`, not an element: a click in those 8px reaches the page as it does today.
2. Revealed: the `<header>` is drawn at the top of the safe area over the page, full width,
   at its ordinary height, with `ChromeButtons` in their usual place on its left and a
   shadow under it. Nothing under it moves and `--app-header-h` stays `0px`. Every header
   control works as on any file page; the Focus mode button shows its pressed state; the
   tree button shows not pressed (the tree is not visible).
3. The header stays revealed while any of these holds: the pointer is over the header,
   a menu or popover opened from a header control (the file row's menus, `header-actions`
   popovers) is open, or the overlay sidebar is open. It hides as soon as none holds. The
   search window and the quick note panel are full overlays of their own and do not hold
   it.
4. Where `(any-pointer: coarse)` matches, a handle is drawn at the top centre, at the
   safe area's top: a visible 56×22px pill with a down chevron inside an 88×44px hit
   area. A tap reveals the header, and the handle is not drawn while revealed. A tap
   outside the header (and outside any menu, popover or overlay sidebar it opened) hides
   the header and closes what it opened; that tap is not delivered to the page.
5. Pressing the menu button while revealed opens the sidebar in its overlay form; focus
   mode stays on, and the header stays revealed while the sidebar is open.
6. Pressing the tree button while revealed ends focus mode (step 5 of 128). If the tree is
   then not visible, the press continues as the tree button's ordinary press on that page
   (SPEC-CORE-084 §3: yielded → reopened with nothing written; hidden by setting →
   `true` written); if the tree is then visible, nothing more happens.
7. Entering the focus layout, by a press or by widening past 768px, starts hidden. A
   file-to-file navigation leaves the reveal as it is, so a navigation started from the
   revealed header keeps it revealed while the pointer stays over it.

### 2. Failure cases

- `T` while an editing element (input, textarea, select, contenteditable, including the
  Markdown editor) has focus: it types `t`; focus mode does not change.
- `T` while an overlay context with `blocksLower` is open (dialogs, the PDF / EPUB /
  image full-screen viewers, the quick note panel, the cheat sheet): nothing happens, as
  for every other page shortcut.
- `T` while the player's full screen is shown: nothing happens. The header button is out
  of reach there too, so focus mode never changes under a full-screen frame
  (SPEC-CORE-126 I5, SPEC-CORE-113 I8).
- `T` and the button while the mini player is shown: they work. The mini player's window
  keeps its size (SPEC-CORE-126 I5) and the page under it is laid out again.
- `T` while keyboard focus is inside an iframe (a `.loft` YouTube embed, an HTML file, the
  EPUB reader): the key never reaches the document, so nothing happens. The reveal and the
  button still work.
- The viewport becomes narrower than 768px while the focus state is on (a window resize,
  an iPad rotated to portrait): the focus layout ends and the page is laid out as an
  ordinary phone file page, while the focus state stays on. Widening again to 768px or
  more returns to the focus layout, hidden. No storage is written either way.
- `localStorage` throws or is empty: focus mode does not read or write it.
- The file fails to load or is not found while in focus mode: the error state is drawn in
  the focus layout; the header can be revealed, and its Focus mode button and trail work.

### 3. States

Focus state: `off` (initial, after reload) and `on`.

| From | Input | To |
|---|---|---|
| off | button press, or `T` on a file page at any width with no editing element, `blocksLower` overlay or full screen | on |
| on | button press, or `T` under the same conditions | off |
| on | the tree button pressed while revealed | off, then 129 step 6 |
| on | the screen stops being a file page; reload | off |

Not transitions (the state is unchanged): a file-to-file navigation, a resize across
768px, an inspector toggle, a panel or split toggle, opening Find, the overlay sidebar
opened or closed, the menu button, entering or leaving full screen or the mini player,
`Cmd/Ctrl+K`, `Cmd/Ctrl+Shift+F`, `N`, `Cmd/Ctrl+\`, `Esc`. `T` on a phone file page (a
hardware keyboard on a narrow window) turns the state on without changing the layout; the
button is not drawn there.

Header in the focus layout (SPEC-CORE-129): `hidden` and `revealed`.

| From | Input | To |
|---|---|---|
| hidden | pointer reaches the top 8px (fine) / tap on the handle (coarse) | revealed |
| revealed | none of 129 step 3's holds remains (fine) / a tap outside (coarse) | hidden |
| either | focus layout ends | the ordinary header |
| (none) | focus layout begins | hidden |

Not transitions: keyboard shortcuts, a file-to-file navigation, a resize that keeps the
focus layout, opening the search window or the quick note panel, `Esc`.

### 4. Data read and written

- New: an in-memory store for the focus state (module scope, like `treeYieldStore`). Not
  persisted.
- Never written by entering, leaving, revealing or hiding: `sidebar-open`,
  `tree:enabled:{drive}`, `inspector-open:{drive}`, `workbench-panels`,
  `workbench-player-focus`, `workbench-split`, `treeYieldStore`, `treeNarrowOpenStore`.
- The inspector toggle, the panel toggles, the split button and the tree button keep
  writing their own values when the viewer presses them, as they do today (129 step 6).
- `--app-header-h` on `<html>`: written `0px` in the focus layout, the header's measured
  height otherwise.
- No backend data, no API call.

### 5. External services

None. The change is frontend layout only.

### 6. Authorization

None. Focus mode shows nothing the page does not already show, and every page it
applies to has already passed the drive's access check.

### 7. Effect on existing features

- `AppShell` (the sidebar column and its padding transition), `Header` (hidden and
  revealed forms, `--app-header-h`), `ChromeButtons`, `SidebarProvider` (one more
  borrower of the overlay counter), `TwoPaneLayout` and `useTreeVisible` (the tree's
  width, `inert`, the tree button's pressed state), `TreeToggle` / `DriveTreeToggle` (129
  step 6), the `h-below-header` utility and its users, `FileHeaderRowProvider` (the file
  page signal), `FileDetailChrome` (the button), `RightPaneFile` (the error chrome and
  the cross-folder file page), `FileDetailFullScreen`, `useInspectorFit` (no yield while
  hidden), `useCompanionMetrics` (reads `--app-header-h`).
- The sidebar overlay counter is shared with `TwoPaneLayout`'s tree borrow and
  `FileDetailFullScreen`'s borrow. Leaving focus mode must not let the counter pass
  through zero between two borrows, or the provider reapplies the stored preference
  mid-exit.
- The header row inset (`Header.tsx`, measured from `ChromeButtons` and the content box)
  is measured again when the header is revealed and when focus mode ends.
- The workbench split (SPEC-CORE-126/127) and no-page-scroll (SPEC-CORE-113) state their
  invariants in W and H, which hold unchanged with the larger values.
- The single header (SPEC-CORE-094, as revised by SPEC-CORE-098) and the inspector toggle
  at the right end (SPEC-CORE-098): revised in `## Revises`. SPEC-CORE-098 I1 (the toggle
  is the last control, 16px from the right end) and I8 (no wrap at 768px with a
  200-character name, the toggle inside the header) stay binding with the wider unit.
- Existing tests that pin the revised invariants change with them:
  `frontend/e2e-components/file-header-row-desktop.spec.ts`,
  `frontend/e2e-components/header-row-crowding.spec.ts`,
  `FileDetailChrome.test.tsx`, `FileDetailHeaderRow.test.tsx`, and the source inventory
  in `frontend/src/__tests__/anchoredDropdowns.test.ts` that pins `TwoPaneLayout`'s
  `h-below-header … overflow-clip` line. No other check is loosened.
- The iOS app's `shellImmersive` serves the player's full screen in the native shell and
  is not involved.
- The shortcut cheat sheet (`?`) lists `T` on file pages.

### 8. Error behavior

No new error path. Nothing is logged.

### 9. User-visible behavior

- The button: lucide `Focus` at 16px in a 32×32 button with the inspector toggle's
  styling; the unit is the divider, the Focus mode button and the inspector toggle, 12px
  apart, the divider 12px from the avatar. `aria-pressed` is true while the focus state
  is on. Accessible name and `title`: `focusMode.enter` 「集中モード (T)」 / "Focus mode (T)"
  when off, `focusMode.exit` 「集中モードを終える (T)」 / "Leave focus mode (T)" when on.
  The handle's accessible name: `focusMode.reveal` 「ヘッダーを表示」 / "Show header".
- No animation on entering, leaving, revealing or hiding.
- The revealed header's tier is above the page, the inspector's overlay form and the
  sticky find bar (all `z-20`), and below the overlay sidebar and the mini player
  (`z-40`) and `ChromeButtons` (`z-50`). The handle is on the revealed header's tier.
- The cheat sheet, in the file page's section: `T` — 「集中モード」 / "Focus mode".
- `docs/user-guide/keyboard-shortcuts.md` (File detail) gains `T`, and
  `docs/user-guide/viewers-and-players.md` (The page row) gains how to enter focus mode,
  how to get the header back, and that it ends when leaving the file.
- Defaults: off on every load.

### 10. Non-functional

- Entering and leaving focus mode, revealing and hiding never remount the `<video>`
  element, a `.loft` or HTML iframe, the EPUB / PDF viewer, a workbench panel, the
  inspector or the folder tree pane, and never change the playback position or play
  state.
- No network request is made by focus mode.

## Design decisions to check

From `docs/process/reviews/feature-focus-mode/design/`. The artboards draw the header's
icon buttons at 40px; §9's 32px follows the inspector toggle as built, and the order is
what the design decides.

- D1. Focus layout at 1440×900, inspector open: no sidebar, no header, no tree; the
  canvas is 1056px wide and starts at the viewport's top; the inspector is 384px at the
  right edge, full height.
- D2. Focus layout at 1280×800, inspector open: the canvas is 896px wide.
- D3. Focus layout, inspector closed: the canvas is the viewport's full width.
- D4. The ordinary header on a wide file page with an inspector, right end: avatar,
  divider, Focus mode button, inspector toggle (the last control).
- D5. On a wide file page without an inspector toggle: avatar, divider, Focus mode button
  (the last control).
- D6. Revealed: the full header with the menu and tree buttons at its left overlays the
  top of the page with a shadow; the page does not move; the Focus mode button is
  pressed.
- D7. Touch (iPad landscape 1180×820): a handle pill with a down chevron at the top
  centre is the only thing focus mode draws over the page.
- D8. PDF in the focus layout: the page toolbar and the page are centred in the wider
  canvas; the page keeps its width cap.
- D9. `/files/{id}` in the focus layout: the content column keeps its width and its gap
  above it, measured from the viewport's top.
- D10. With a fine pointer and the header hidden, focus mode draws nothing over the page.

## Touch points

- `frontend/src/lib/focusModeStore.ts` (new): the in-memory focus state.
- `frontend/src/hooks/useFocusMode.ts` (new): the state, the focus layout (state × file
  page × wide), and the `T` shortcut context.
- `frontend/src/components/AppShell.tsx`: the focus layout's attribute on the shell, the
  sidebar column and its transition, the reveal's pointer check and handle.
- `frontend/src/components/Header.tsx`: hidden / revealed / ordinary forms, `inert`,
  `--app-header-h`, the row inset; stays mounted.
- `frontend/src/components/ChromeButtons.tsx`: hidden and revealed with the header.
- `frontend/src/components/SidebarProvider.tsx`: the overlay borrow (no change to the
  stored preference).
- `frontend/src/components/FileHeaderRowProvider.tsx`: the file page signal.
- `frontend/src/components/folder/TwoPaneLayout.tsx`, `frontend/src/hooks/useTreeVisible.ts`:
  the tree's width, transition and `inert`; the tree button's pressed state.
- `frontend/src/components/DriveTreeToggle.tsx`, `frontend/src/components/TreeToggle.tsx`:
  129 step 6.
- `frontend/src/components/FileDetailShell.tsx`,
  `frontend/src/components/FileDetail/hooks/useInspectorFit.ts`: no yield while the focus
  layout hides the pane.
- `frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts`: reads
  `--app-header-h`.
- `frontend/src/components/FileDetail/FileDetailChrome.tsx`: the Focus mode button in the
  trailing unit.
- `frontend/src/components/folder/RightPaneFile.tsx`: the error chrome and the
  cross-folder file page.
- `frontend/src/components/FileDetailFullScreen.tsx`: `/files/{id}`.
- `frontend/src/components/player/hooks/useFullscreen.ts`, the PDF / EPUB / image
  full-screen viewers: read, so `T` can do nothing under them.
- `frontend/src/components/MiniPlayerContainer.tsx`, `frontend/src/lib/bottomChrome.ts`:
  read only.
- `frontend/src/components/ShortcutsProvider.tsx`, `frontend/src/lib/shortcuts.ts`: read
  only; the `T` context uses the existing editing and overlay rules.
- `frontend/src/app/globals.css`: `h-below-header` in the focus layout; the revealed
  header's tier.
- `frontend/src/app/drive/[name]/layout.tsx`, `frontend/src/components/DriveUnavailable.tsx`:
  users of `h-below-header` (`DriveUnavailable` is never a file page and keeps its
  height).
- `frontend/src/messages-core/ja.json`, `frontend/src/messages-core/en.json`:
  `focusMode.enter`, `focusMode.exit`, `focusMode.reveal`, and the cheat sheet label.
- `DESIGN.md` §Header (the button's place, the hidden and revealed forms) and §Layering
  (the revealed header's tier).
- `docs/user-guide/keyboard-shortcuts.md`, `docs/user-guide/viewers-and-players.md`.
- Tests: new ones under `frontend/src/**/__tests__/` and `frontend/e2e-layout/` (or
  `frontend/e2e-components/`) for geometry, the reveal and the restore, as
  `docs/process/PROJECT.md` requires for layout; the existing tests listed in §7, changed
  only as far as the revised invariants say.
- `.claude/rules/frontend-conventions.md` (DESIGN.md, i18n in `messages-core/`): read.
- No protected path is edited.

## Invariants

I1. In the focus layout with the header hidden, at any wide viewport, no pixel of the app
header, `ChromeButtons`, the sidebar or the folder tree is painted, and focus mode itself
draws nothing over the page except, where `(any-pointer: coarse)` matches, the handle; on
a folder, view or search file page the `h-below-header` box runs from the safe area's top
to the viewport's bottom, and on `/files/{id}` the content column's top is its normal gap
below the safe area's top (within 1px); at 1440×900 and 1280×800 with the inspector open
the canvas is the viewport's width less 384px (within 1px).

I2. Entering and leaving, revealing and hiding write none of `sidebar-open`,
`tree:enabled:{drive}`, `inspector-open:{drive}`, `workbench-panels`,
`workbench-player-focus`, `workbench-split`, `treeYieldStore` or `treeNarrowOpenStore`,
and no yield is recorded while in the focus layout. Entering then leaving at the same
viewport with no other input puts every box of the page (header, sidebar, tree pane,
canvas, inspector, player frame) where it was (within 1px), with the tree shown by
setting, hidden, yielded and reopened, and the sidebar stored open and closed, at 1440 and
at 1024 wide. The tree button pressed while revealed ends focus mode and leaves the tree
visible, writing `tree:enabled:{drive}` only when the tree was hidden by setting.

I3. Entering or leaving focus mode, a reveal or a hide never remounts the `<video>`
element, a `.loft` or HTML iframe, the PDF or EPUB viewer, any workbench panel, the
inspector or the tree pane, and never changes the playback position or play state.

I4. The first painted frame after a press that enters or leaves, and every frame of a
file-to-file navigation in the focus layout, is already in the target layout: no frame
shows the header taking height, the sidebar or tree taking width, or a width or padding
mid-transition. The focus state is off on the first frame of any screen that is not a
file page and after a reload.

I5. Below 768px the page is laid out exactly as a phone file page whatever the focus
state, and widening back to 768px or more with the state on gives the focus layout,
hidden.

I6. `T` toggles the focus state on a file page only when no editing element has focus, no
`blocksLower` overlay is open and no full screen is shown; otherwise it changes nothing
and, in an editing element, types the character. `T` and the button both work while the
mini player is shown.

I7. Revealing and hiding move nothing on the page: the canvas, the inspector, the player
frame and the `/files/{id}` column keep their boxes (within 1px), and `--app-header-h`
reads `0px` in the focus layout whether hidden or revealed.

I8. In the focus layout, `Cmd/Ctrl+K`, `Cmd/Ctrl+Shift+F`, `N` and `Cmd/Ctrl+\` do what
they do outside it, the search window and quick note panel they open are visible, and the
header stays hidden.

I9. On a wide file page outside the focus layout or with the header revealed, the
trailing unit is the divider, the Focus mode button and the inspector toggle (the last
control) where the page has one, otherwise the divider and the Focus mode button (the last
control); the Focus mode button is 32×32, 12px from its neighbours, with `aria-pressed`,
accessible name and `title` as §9 states; in the loading, loaded and failed states alike.

I10. With a fine pointer the header is revealed exactly when the pointer reaches the top
8px below the safe area or one of 129 step 3's holds applies, and a click in those 8px
reaches the page; with a coarse pointer a tap on the handle reveals it, and a tap outside
hides it, closes what the header opened and does not reach the page; the menu button
opens the overlay sidebar with focus mode still on.

## Revises

SPEC-CORE-094 I1. On a file page (canonical or collection route; loading, loaded or failed) outside the focus layout of SPEC-CORE-128, the page shows exactly one row above the content, its height equals the header's height on a folder page of the same drive at the same width, the content's top y is the same in all three states, and the header never shows its ordinary form while the viewer stays on a file page (loading → loaded, file → file); in the focus layout with the header hidden the page shows no row, and with it revealed the row is drawn over the content without moving it.

SPEC-CORE-094 I2. At ≥ 768px on a file page, the trail's first crumb starts at the edge D2 defines, and the search button, the quick note button and the profile button each sit left of their x on a folder page of the same drive at the same width by the same amount, equal to the distance from the profile button's right edge to the right edge of the header's last control on that page.

SPEC-CORE-094 I3. At < 768px on a file page, the row shows no quick note button, no avatar, no tree button, no Focus mode button and no inspector toggle, and while walking the Inbox no search and no document controls; at ≥ 768px, outside the focus layout or with the header revealed in it, it shows the quick note button, the avatar, the tree button wherever a current drive is known, the Focus mode button, and, wherever the page has an inspector, the inspector toggle as the header's last control, including while a rename is open.

SPEC-CORE-098 I2. On a hosted file page at a viewport of 768px or wider, exactly one divider lies right of the profile button, 12px from it and 12px from the Focus mode button that follows it; where the page has an inspector the toggle follows the Focus mode button 12px away; and the divider that separates the file's controls from search is still present.

SPEC-CORE-098 I3. On a page that is not a file page, or below 768px, the header contains no inspector toggle, no Focus mode button and no divider after the profile button, and the profile button's right edge is 16px from the header's right end; on a hosted file page without an inspector at 768px or wider, the Focus mode button is the header's last control and its right edge is 16px from the header's right end.

SPEC-CORE-098 I5. Across a file-to-file swap, a loading-to-loaded swap, a beside-to-stacked resize, a resize across 768px, or a move to a hosted file page without an inspector, every frame at 768px or wider shows exactly one trailing divider and one Focus mode button, and either no inspector toggle or exactly one as the last control. The header never holds a toggle inside the row, never holds two, and never holds one left by a file page that is no longer on top. Where the outgoing and the incoming hosted file page both have an inspector at 768px or wider, every frame shows the toggle.

SPEC-CORE-098 I10. On a hosted file page at 768px or wider, the Focus mode button follows the profile button in the header's focus order, the inspector toggle follows it where the page has one, and nothing focusable follows the last of them inside the header.

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
- **Restoring a snapshot taken on entry.** The human chose a fresh layout for the current
  file on leaving (§1 step 5); a snapshot could restore a tree that does not fit the file
  now shown.
- **Exit form B (a floating cluster).** Drawn for comparison; rejected by the human. It
  covers the player's corner, and search and quick note would be key-only.
- **Hiding the inspector too.** The request is to widen the page with its panes; the
  inspector keeps its own toggle.
- **Revealing the header when keyboard focus reaches it.** The hidden header is `inert`,
  so Tab never reaches it; a keyboard user leaves focus mode with `T`.
- **Screens that are not file pages** (folder listings, Home, the Ask page, addon apps).
  The request is about reading and watching a file; the listing screens have no single
  thing to give the room to.
- **The phone.** Its file page already gives the header a single row and the inspector a
  sheet; below 768px the focus layout is suspended (human decision).
- **Gain on `/files/{id}` and for PDF / Markdown is mainly the 56px of height.**
  Measured; kept for one consistent behaviour across file pages.
- **The handle over a page's own top-centre toolbar** (the PDF page toolbar at the top of
  the canvas). Accepted by the human: the 88×44 hit area covers the toolbar's middle on a
  touch screen, and revealing the header does not move the toolbar.
- **iPadOS edge gestures.** The handle answers a tap, not a swipe, and sits at the safe
  area's top, below the status bar; Notification Center and Control Center start from a
  swipe at the screen's very top edge, which Safari's toolbar or the status bar owns.
- **`T` inside an iframe.** A document listener cannot see keys typed into a
  cross-document frame; the reveal and the button cover that case.
- **The native iOS shell's immersive mode (`shellImmersive`).** It serves the player's
  full screen; focus mode does not hold it.
- **Animating the reveal.** The header is reached by aiming at the top edge; a slide-in
  would put the controls under the pointer only after the motion ends.
- **Addon `t` bindings.** No core or addon frontend (`addons/*`, searched in the main
  checkout on 2026-11-18) binds `t`.
