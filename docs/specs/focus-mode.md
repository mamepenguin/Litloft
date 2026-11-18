# Focus mode: hide the sidebar, the header and the tree on a file page

SPEC-ID: SPEC-CORE-128
SPEC-ID: SPEC-CORE-129

Approval: sha256:f0acbb73f68d5af93860666e9ddaedc9330d1b16a847745bbd9f83af185f0800 Yuichi Senga 2026-11-18

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
the others are its props). Human decisions taken while writing this spec: exit form A
(the header reveal) over B (a floating cluster, drawn in `ExitFloat.dc.html` for
comparison only and not to be built); below 768px, suspend and keep the state; every
in-shell file page is in scope; the tree button ends focus mode and shows the tree;
leaving lays the chrome out fresh for the current file; a dismissing tap does not reach
the page; on a device with both a fine and a coarse pointer both reveal paths work and
the way the header was revealed decides how it hides; keyboard focus inside the header
keeps it revealed; while something covers the page, neither the reveal nor `T` acts; the
touch and safe-area paths are checked by emulation and then by the human on an iPad; the
top-edge strip is a transparent element so it works over iframes; a collection's item
list hides like the tree; the reading position stays put on entering and leaving; and a
note's failed or conflicted save reveals the header.

## Terms

- **File page URL**: `/files/{id}` (any query), or a `/drive/{drive}/…` URL whose query
  has a non-empty `file`. This covers every way a file opens inside the app shell:
  `?file=` on a folder (`TwoPaneLayout`), `?file=` on a collection
  (`/drive/{drive}/collections/{id}`, `CollectionDetail`'s `TwoPaneLayout`, whose left
  pane is the collection's item list), `?file=` on a view or a search
  (`app/drive/[name]/layout.tsx`'s cross-folder `RightPaneFile`), and every form of
  `/files/{id}` (`FileDetailFullScreen`: `?collection=`, `?folder_play=1`,
  `?smart_collection=`, `?nav=inbox`, and none), in the loading, loaded and failed states,
  whether or not the file kind uses `FileDetailShell`. It is read from the router's
  current URL, so it is known on the first render and has no gap during a handover
  between hosts. A URL whose drive layout draws `DriveUnavailable` instead of a file is
  not a file page URL.
- **Wide**: a viewport 768px or wider (`MOBILE_BREAKPOINT`).
- **Focus state**: an in-memory boolean for the tab. **Focus layout**: the focus state is
  on, the URL is a file page URL, and the viewport is wide. Only the focus layout changes
  anything on screen.
- **Chrome**: the app sidebar (inline column and overlay), the app header (`<header>` in
  `Header.tsx`), the fixed `ChromeButtons` (menu and tree buttons) and the **left pane**:
  `TwoPaneLayout`'s `<aside>`, which holds the folder tree, or on a collection route the
  collection's item list. "The tree" below means the left pane, whichever it holds.
- **The header** (in 129): the `<header>` and `ChromeButtons` together. **Hidden /
  revealed**: its two forms in the focus layout.
- **Covered**: something is in front of the page: a system full screen
  (`document.fullscreenElement`), the player's pseudo full screen
  (`data-player-fullscreen` on `<html>`), any `[aria-modal="true"]` element other than
  the app sidebar, or an overlay shortcut context with `blocksLower`. This is
  `canTakeFindShortcut()` in `frontend/src/lib/findShortcut.ts` with the app sidebar left
  out. The modal surfaces are the confirm dialog, the rename dialog, the search window,
  the quick note panel and the PDF / EPUB / image full-screen viewers; `ConfirmDialog`,
  `RenameDialog` and `GlobalSearch`'s window gain `aria-modal="true"` so the test sees
  them. The open overlay sidebar does not cover the page.
- **Header menu**: a menu or popover whose trigger is inside the header, observed as a
  control inside the header carrying `aria-expanded="true"`.

## Required items

### 1. Normal flow

SPEC-CORE-128:

1. On a wide file page, the header shows a **Focus mode** button in the trailing unit
   after the avatar: a vertical divider, the Focus mode button, then the inspector toggle
   where the page has one. Where the page has no inspector toggle (the error state, a
   collection video), the Focus mode button is the header's last control. The button is
   drawn in the loading, loaded and failed states alike, so focus mode can always be left
   from the header.
2. The viewer presses it, or presses `T` with no editing element focused, no header menu
   open and the page not covered. The focus state turns on.
3. In the focus layout:
   - the header is hidden: it takes no height, paints nothing, is `inert` (out of the tab
     order and the accessibility tree), and stays mounted (search, quick note, the
     `header-actions` slot and the file row keep their state, and `Cmd/Ctrl+K`,
     `Cmd/Ctrl+Shift+F`, `N` and `Cmd/Ctrl+\` keep working). On entry, keyboard focus
     inside the header moves to `<body>`. No header menu is open on entry: a press on
     the button closes it as any outside press does, and `T` does nothing while one is
     open;
   - the sidebar takes no inline width, and an open overlay sidebar is closed. The inline
     column is gone in the same commit that turns the state on, not after the provider's
     effects, and its `transform` transition does not run. The stored `sidebar-open`
     preference is not written, and no press in the focus layout writes it: the menu
     button (once revealed) opens the sidebar as an overlay and shows pressed only while
     that overlay is open, and closing the overlay (the menu button, the backdrop, `Esc`)
     writes nothing;
   - the left pane has zero width and is `inert`, without writing
     `tree:enabled:{drive}`, without touching `treeYieldStore` and without a yield being
     recorded (`useInspectorFit` sees no pane to yield while the focus layout hides it);
   - the page's content starts at the top of the safe area (`env(safe-area-inset-top)`).
     On a page laid out in `h-below-header` (folder, view and search file pages) that box
     fills the viewport below the safe area; on `/files/{id}`, which scrolls the
     document, the content column keeps the gap above it that it has today (40px at
     1440×900), measured from the safe area's top;
   - `--app-header-h` equals the safe-area inset (`0px` where there is none), so
     everything that reads it (`useCompanionMetrics`'s H and `--player-avail` on
     `/files/{id}`) measures from the safe area's top;
   - the inspector, the workbench and the player keep their own rules, applied to the
     larger room: the inspector stays open or closed as it was, the workbench's split
     eligibility (SPEC-CORE-126) is computed from the new width, and `--player-avail` is
     measured from the new geometry.
   The change happens in one frame: the sidebar's `padding` and `transform` transitions
   and the tree's `width` transition do not run for entering or leaving. The reading
   position stays put: the content that was at the top of the visible content area
   before the press is at the top of the new visible content area after it, in whichever
   element scrolls (the document on `/files/{id}`, the pane elsewhere).
4. The viewer moves to another file (next or previous file, a collection item, folder
   play's next file, an Inbox step, a link from Related, a search result). The URL stays a
   file page URL, the focus state stays on, and every frame of the next file page is in
   the focus layout.
5. The viewer presses the Focus mode button (in the revealed header) or `T`. The focus
   state turns off, an open overlay sidebar is closed, and the chrome is laid out as it
   would be for the current file page had focus mode never been on: the sidebar from its
   stored preference and width, the tree from `tree:enabled:{drive}`, `treeYieldStore`
   and the yield rule (SPEC-CORE-084) evaluated for the current file, the header in its
   file row form, all in the first frame, with the reading position kept as in step 3.
   With no other input since entering, that is exactly the layout before entering.
6. The router's URL stops being a file page URL (a folder listing, Home, a search results
   list, settings, a drive that became unavailable), or the tab reloads. The focus state
   turns off in that same commit, an overlay sidebar opened in focus mode closes, and the
   next screen is in its ordinary layout from its first frame (inline sidebar where the
   stored preference and width call for it). The state is never restored from storage.

SPEC-CORE-129:

1. In the focus layout, where `(any-pointer: fine)` matches and the page is not covered,
   a transparent strip covers the top 8px below the safe area's top, full width, above
   the page (including iframes). A pointer entering it with no button pressed reveals the
   header **by pointer**. A press that starts in the strip lands on the strip, not the
   page. A drag or selection in progress (a button held) reaching the strip does not
   reveal.
2. Revealed: the `<header>` is drawn at the top of the safe area over the page, full
   width, at its ordinary height, with `ChromeButtons` in their usual place on its left
   and `shadow-lg` under it. Nothing under it moves and `--app-header-h` keeps its focus
   layout value. Every header control works as on any file page; the Focus mode button
   is pressed; the tree button shows not pressed (the tree is not visible).
3. A header revealed by pointer stays revealed while any of these holds: the pointer is
   over the header, keyboard focus is inside the header (a rename input, a focused
   button), a header menu is open, or the overlay sidebar is open. It hides as soon as
   none holds; keyboard focus inside it then moves to `<body>`.
   A note's save in the `error` or `conflict` state (`SaveDot`) reveals the header **by
   status** whatever the pointer, and holds it while the state lasts; it then hides by
   the rule of whatever else holds it, or at once if nothing does. The file row marks
   this with `data-needs-attention` on an element inside the header, so the rule reads
   the header, not the note.
4. Where `(any-pointer: coarse)` matches and the page is not covered, a handle is drawn at
   the top centre, at the safe area's top: a visible 56×22px pill with a down chevron
   inside an 88×44px hit area. A tap reveals the header **by tap**, and the handle is not
   drawn while the header is revealed. While a header menu or the overlay sidebar is
   open, a `pointerdown` outside it is theirs: it closes them as it does today and the
   header stays revealed. With neither open, a `pointerdown` outside the header hides
   it; that `pointerdown` and the gesture it starts (a tap, a scroll) are not delivered
   to the page. Keyboard focus inside the header then moves to `<body>`.
5. On a device where both queries match, both the strip and the handle work; each reveal
   hides by its own rule in step 3 or step 4.
6. Pressing the menu button while revealed opens the sidebar in its overlay form; focus
   mode stays on, and the header stays revealed while the sidebar is open.
7. Pressing the tree button while revealed ends focus mode (step 5 of 128). On the layout
   that produces, after the yield rule has run for the current file: if the tree is not
   visible, the press continues as the tree button's ordinary press (SPEC-CORE-084 §3:
   yielded → reopened with nothing written; hidden by setting → `true` written); if it is
   visible, nothing more happens.
8. Entering the focus layout, by a press or by widening past 768px, starts hidden (unless
   a save needs attention, step 3). The page becoming covered hides a revealed header and
   removes the handle and the strip; this includes opening the search window or quick
   note from the revealed header. When the cover closes, the header stays hidden and
   keyboard focus, whose trigger is now `inert`, is on `<body>`. A file-to-file
   navigation leaves the reveal as it is.

### 2. Failure cases

- `T` while an editing element (input, textarea, select, contenteditable, including the
  Markdown editor) has focus: it types `t`; focus mode does not change.
- `T` while the page is covered (a confirm or rename dialog, the search window, the quick
  note panel, a full-screen viewer, the player's pseudo or system full screen): nothing
  happens. The header button is out of reach there too.
- `T` and the button while the mini player is shown: they work. The mini player's window
  keeps its size (SPEC-CORE-126 I5) and the page under it is laid out again.
- `T` while keyboard focus is inside an iframe (a `.loft` YouTube embed, an HTML file, the
  EPUB reader): the key never reaches the document, so nothing happens. The reveal and the
  button still work.
- The pointer leaves the window through its top edge without entering the strip: no
  reveal; the viewer moves back to the edge.
- The viewport becomes narrower than 768px while the focus state is on (a window resize,
  an iPad rotated to portrait): the focus layout ends and the page is laid out as an
  ordinary phone file page, while the focus state stays on. Widening again to 768px or
  more returns to the focus layout, hidden. No storage is written either way.
- `localStorage` throws or is empty: focus mode does not read or write it.
- The file fails to load or is not found while in focus mode: the error state is drawn in
  the focus layout; the header can be revealed, and its Focus mode button and trail work.
- The drive becomes unavailable while moving file to file in focus mode: its screen is
  not a file page, so the focus state turns off and `DriveUnavailable` is drawn with the
  header and sidebar (SPEC-CORE-125 I10 holds).
- A note's save fails or conflicts while the header is hidden: the header is revealed by
  status (129 step 3), so the save dot is visible.

### 3. States

Focus state: `off` (initial, after reload) and `on`.

| From | Input | To |
|---|---|---|
| off | button press, or `T` on a file page URL at any width, no editing element focused, no header menu open, not covered | on |
| on | button press, or `T` under the same conditions | off |
| on | the tree button pressed while revealed | off, then 129 step 7 |
| on | the URL stops being a file page URL; reload | off |

Not transitions (the state is unchanged): a file-to-file navigation, a resize across
768px, an inspector toggle, a panel or split toggle, opening Find, the overlay sidebar
opened or closed, the menu button, entering or leaving full screen or the mini player,
`Cmd/Ctrl+K`, `Cmd/Ctrl+Shift+F`, `N`, `Cmd/Ctrl+\`, `Esc`. `T` on a phone file page (a
hardware keyboard on a narrow window) turns the state on without changing the layout; the
button is not drawn there.

Header in the focus layout (SPEC-CORE-129): `hidden`, `revealed by pointer`,
`revealed by tap`.

| From | Input | To |
|---|---|---|
| hidden | pointer enters the strip with no button held, not covered | revealed by pointer |
| hidden | tap on the handle, not covered | revealed by tap |
| hidden | a save enters `error` or `conflict` | revealed by status |
| revealed by pointer | none of 129 step 3's holds remains | hidden |
| revealed by tap | `pointerdown` outside the header with no header menu or overlay sidebar open | hidden |
| revealed by status | the save leaves `error` / `conflict` | hidden, unless another hold applies (then revealed by pointer) |
| either revealed | the page becomes covered | hidden |
| any | the focus layout ends | the ordinary header |
| (none) | the focus layout begins | hidden |

Not transitions: keyboard shortcuts, a file-to-file navigation, a resize that keeps the
focus layout, pointer movement while covered or with a button held, `Esc`.

### 4. Data read and written

- New: an in-memory store for the focus state (module scope, like `treeYieldStore`). Not
  persisted.
- Never written by entering, leaving, revealing or hiding: `sidebar-open`,
  `tree:enabled:{drive}`, `inspector-open:{drive}`, `workbench-panels`,
  `workbench-player-focus`, `workbench-split`, `treeYieldStore`, `treeNarrowOpenStore`.
- The inspector toggle, the panel toggles, the split button and the tree button keep
  writing their own values when the viewer presses them, as they do today (129 step 7).
- `--app-header-h` on `<html>`: the safe-area inset in the focus layout, the header's
  measured height otherwise.
- No backend data, no API call.

### 5. External services

None. The change is frontend layout only.

### 6. Authorization

None. Focus mode shows nothing the page does not already show, and every page it
applies to has already passed the drive's access check.

### 7. Effect on existing features

- `AppShell` (the sidebar column and its padding transition), `Sidebar` (inline column,
  overlay, `transform` transition, backdrop), `Header` (hidden and revealed forms,
  `--app-header-h`, the row inset), `ChromeButtons`, `SidebarProvider`, `TwoPaneLayout`
  and `useTreeVisible` (the tree's width, `inert`, the tree button's pressed state),
  `TreeToggle` / `DriveTreeToggle` (129 step 7), the `h-below-header` utility and its
  users, `FileHeaderRowProvider` / `FileHeaderRowPortal` (the trailing slot now always
  carries a node on a wide file page), `FileDetailChrome` (the button), `RightPaneFile`
  (the error chrome and the cross-folder file page), `FileDetailFullScreen`,
  `useInspectorFit` (no yield while hidden), `useCompanionMetrics` (reads
  `--app-header-h`), `HighlightControls` (gains `aria-expanded` on its trigger so it
  counts as a header menu), `CollectionDetail` (its item-list pane hides like the tree),
  `ConfirmDialog`, `RenameDialog` and `GlobalSearch` (gain `aria-modal="true"`, which also
  makes the find shortcut yield under them, as it already does under other modals),
  `MarkdownDocumentLayout` / `SaveDot` (`data-needs-attention`).
- The sidebar overlay counter is shared with `TwoPaneLayout`'s tree borrow and
  `FileDetailFullScreen`'s borrow. Focus mode must not let it pass through zero between
  two borrows, or the provider reapplies the stored preference mid-exit.
- The header row inset (`Header.tsx`, measured from `ChromeButtons` and the content box)
  is measured again when the header is revealed and when focus mode ends.
- The workbench split (SPEC-CORE-126/127) and no-page-scroll (SPEC-CORE-113) state their
  invariants in W and H, which hold unchanged with the larger values.
- The single header (SPEC-CORE-094, as revised by SPEC-CORE-098), the inspector toggle at
  the right end (SPEC-CORE-098, with the human's revision of I3) and the tree button's
  table (SPEC-CORE-084 I8): revised in `## Revises`.
- `header-actions` addon entries are not given a new contract. An addon popover that
  sets `aria-expanded` on its trigger holds the reveal; one that does not hides with the
  header when the pointer leaves. No extension point changes.
- Existing tests that pin the revised invariants change with them, and only as far as the
  revised lines say: `frontend/e2e-components/file-header-row-desktop.spec.ts`,
  `frontend/e2e-components/header-row-crowding.spec.ts`,
  `frontend/e2e-components/fixtures/fileHeaderRow.tsx`, `FileDetailChrome.test.tsx`,
  `FileDetailHeaderRow.test.tsx`, the source inventory in
  `frontend/src/__tests__/anchoredDropdowns.test.ts` that pins `TwoPaneLayout`'s
  `h-below-header … overflow-clip` line, and the source-parity tests
  `frontend/src/components/__tests__/pseudoFullscreenFixtureParity.test.tsx` (the
  `className` of `Header.tsx` and `ChromeButtons.tsx`) and
  `frontend/src/components/__tests__/componentFixtureParity.test.tsx` (`TwoPaneLayout`'s
  `<section>` and `<aside>`), with their fixtures updated to the new declarations so
  parity still holds.
- The iOS app's `shellImmersive` serves the player's full screen in the native shell and
  is not involved.

### 8. Error behavior

No new error path. Nothing is logged.

### 9. User-visible behavior

- The button: lucide `Focus` at 16px in a 32×32 button with the inspector toggle's
  shape; the unit is the divider, the Focus mode button and the inspector toggle, 12px
  apart, the divider 12px from the avatar. Not pressed, it is `text-text-muted` on no
  fill; pressed (the focus state on), it is `bg-bg-elevated text-text-primary`, the menu
  and tree buttons' pressed look, with the same icon. `aria-pressed` follows the focus
  state. Accessible name and `title`: `focusMode.enter` 「集中モード (T)」 /
  "Focus mode (T)" when off, `focusMode.exit` 「集中モードを終える (T)」 /
  "Leave focus mode (T)" when on. The handle's accessible name: `focusMode.reveal`
  「ヘッダーを表示」 / "Show header".
- No animation on entering, leaving, revealing or hiding.
- Layering: the revealed header and the handle sit above the page, the inspector's
  overlay form and the sticky find bar (all `z-20`) and below the overlay sidebar's
  backdrop (`z-30`), so an open overlay sidebar dims the revealed header as it dims the
  page. `ChromeButtons` keep their own `z-50`.
- The cheat sheet (`?`) gains a section from a shortcut context with id `focus-mode`,
  pushed on every file page URL: section label `focusMode.title` 「集中モード」 /
  "Focus mode", one row `T` — `focusMode.toggle` 「集中モードの切り替え」 /
  "Toggle focus mode".
- `docs/user-guide/keyboard-shortcuts.md` (File detail) gains `T`, and
  `docs/user-guide/viewers-and-players.md` (The page row) gains how to enter focus mode,
  how to get the header back, and that it ends when leaving the file.
- Defaults: off on every load.

### 10. Non-functional

- Entering and leaving focus mode, revealing and hiding never remount the `<video>`
  element, a `.loft` or HTML iframe, the EPUB / PDF viewer, a workbench panel, the
  inspector, the folder tree pane or the header, and never change the playback position
  or play state.
- No network request is made by focus mode.
- Verification (`agent_cannot_verify` in `docs/process/PROJECT.md`): the acceptance tests
  and R-5 check the coarse handle, the safe-area offset and a 768px crossing with an
  emulated touch pointer and an injected inset. Before merge the human checks on an iPad
  (Safari and the iOS app): the handle's place and response, its distance from the status
  bar, no clash with the edge gestures, and rotation between landscape and portrait.

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
  pressed (filled).
- D7. Touch (iPad landscape 1180×820): a handle pill with a down chevron at the top
  centre is the only thing focus mode draws over the page.
- D8. PDF in the focus layout: the page toolbar and the page are centred in the wider
  canvas; the page keeps its width cap.
- D9. `/files/{id}` in the focus layout: the content column keeps its width and its gap
  above it, measured from the viewport's top.
- D10. With only a fine pointer and the header hidden, focus mode draws nothing visible
  over the page (the strip is transparent).
- D11. The handle: a 56×22px pill inside an 88×44px hit area, centred, its top at the
  safe area's top. The revealed header and the handle are above the inspector's overlay
  form and the sticky find bar and below the overlay sidebar's backdrop.

## Touch points

- `frontend/src/lib/focusModeStore.ts` (new): the in-memory focus state.
- `frontend/src/hooks/useFocusMode.ts` (new): the state, the focus layout (state × file
  page URL × wide), the reveal state, and the `focus-mode` shortcut context.
- `frontend/src/components/AppShell.tsx`: the focus layout's attribute on the shell, the
  sidebar column and its transition, the reveal's pointer check and handle.
- `frontend/src/components/Sidebar.tsx`: the inline column, the overlay, the `transform`
  transition, the backdrop's tier relative to the revealed header.
- `frontend/src/components/SidebarProvider.tsx`: the stored preference stays unwritten;
  the open overlay closes on entering and leaving.
- `frontend/src/components/Header.tsx`: hidden / revealed / ordinary forms, `inert`,
  `--app-header-h`, the row inset; stays mounted.
- `frontend/src/components/ChromeButtons.tsx`: hidden and revealed with the header.
- `frontend/src/components/FileHeaderRowProvider.tsx` (and its `FileHeaderRowPortal`):
  the trailing slot carrying the button.
- `frontend/src/components/folder/TwoPaneLayout.tsx`, `frontend/src/hooks/useTreeVisible.ts`:
  the tree's width, transition and `inert`; the tree button's pressed state.
- `frontend/src/components/DriveTreeToggle.tsx`, `frontend/src/components/TreeToggle.tsx`:
  129 step 7.
- `frontend/src/components/FileDetailShell.tsx`,
  `frontend/src/components/FileDetail/hooks/useInspectorFit.ts`: no yield while the focus
  layout hides the pane; the yield evaluated on leaving within the first frame.
- `frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts`: reads
  `--app-header-h`.
- `frontend/src/components/FileDetail/FileDetailChrome.tsx`: the Focus mode button in the
  trailing unit.
- `frontend/src/components/CollectionDetail.tsx`: the collection route's left pane.
- `frontend/src/components/ConfirmDialog.tsx`, `frontend/src/components/RenameDialog.tsx`,
  `frontend/src/components/GlobalSearch.tsx`: `aria-modal="true"`.
- `frontend/src/components/markdown/MarkdownDocumentLayout.tsx`,
  `frontend/src/components/markdown/SaveDot.tsx`: `data-needs-attention`.
- `frontend/src/components/HighlightControls.tsx`: `aria-expanded` on its trigger.
- `frontend/src/components/folder/RightPaneFile.tsx`: the error chrome and the
  cross-folder file page.
- `frontend/src/components/FileDetailFullScreen.tsx`: `/files/{id}`.
- `frontend/src/lib/findShortcut.ts`: the covered test (`canTakeFindShortcut` with the
  app sidebar left out; the find shortcut's own behaviour is unchanged except under the
  three dialogs above).
- `frontend/src/components/ShortcutsProvider.tsx`, `frontend/src/lib/shortcuts.ts`,
  `frontend/src/components/ShortcutCheatSheet.tsx`: read; the `focus-mode` context uses
  the existing editing and overlay rules.
- `frontend/src/components/MiniPlayerContainer.tsx`, `frontend/src/lib/bottomChrome.ts`:
  read only.
- `frontend/src/app/globals.css`: `h-below-header` in the focus layout; the revealed
  header's tier.
- `frontend/src/app/drive/[name]/layout.tsx`, `frontend/src/components/DriveUnavailable.tsx`:
  users of `h-below-header` (`DriveUnavailable` is never a file page and keeps its
  height).
- `frontend/src/messages-core/ja.json`, `frontend/src/messages-core/en.json`:
  `focusMode.enter`, `focusMode.exit`, `focusMode.reveal`, `focusMode.title`,
  `focusMode.toggle`.
- `DESIGN.md` §Header (the button's place and look, the hidden and revealed forms) and
  §Layering (the revealed header's tier).
- `docs/user-guide/keyboard-shortcuts.md`, `docs/user-guide/viewers-and-players.md`.
- Tests: new ones under `frontend/src/**/__tests__/` and `frontend/e2e-layout/` or
  `frontend/e2e-components/` for geometry, frames, the reveal and the restore, as
  `docs/process/PROJECT.md` requires for layout; the existing tests listed in §7, changed
  only as far as the revised invariants say.
- `.claude/rules/frontend-conventions.md` (DESIGN.md, i18n in `messages-core/`): read.
- No protected path is edited.

## Invariants

I1. In the focus layout with the header hidden, at any wide viewport: no pixel of the app
header, `ChromeButtons`, the sidebar or the folder tree is painted, the header and
`ChromeButtons` are `inert` and still mounted, and focus mode itself draws nothing visible
over the page except, where `(any-pointer: coarse)` matches, the handle (the strip of 129
step 1 is transparent); on a folder, view or
search file page the `h-below-header` box runs from the safe area's top to the viewport's
bottom, and on `/files/{id}` the content column's top is its normal gap below the safe
area's top and the player's frame is no taller than `--player-avail` measured from there
(within 1px); at 1440×900 and 1280×800 with the inspector open the canvas is the
viewport's width less 384px, and with no workbench panel shown a video's frame is
1024×576 and 864×486 (within 1px).

I2. Entering and leaving, revealing and hiding write none of `sidebar-open`,
`tree:enabled:{drive}`, `inspector-open:{drive}`, `workbench-panels`,
`workbench-player-focus`, `workbench-split`, `treeYieldStore` or `treeNarrowOpenStore`,
and no yield is recorded while in the focus layout. Entering then leaving at the same
viewport with no other input puts every box of the page (header, sidebar, tree pane,
canvas, inspector, player frame) where it was (within 1px), with the tree shown by
setting, hidden, yielded and reopened, and the sidebar stored open and closed, at 1440 and
at 1024 wide; and when the content is scrolled, the element at the top of the visible
content area keeps its distance from that area's top across entering and across leaving
(within 1px).

I3. Entering or leaving focus mode, a reveal or a hide never remounts the `<video>`
element, a `.loft` or HTML iframe, the PDF or EPUB viewer, any workbench panel, the
inspector, the tree pane or the header, and never changes the playback position or play
state.

I4. The first painted frame after a press that enters or leaves, and every frame of a
file-to-file navigation in the focus layout, is already in the target layout: no frame
shows the header taking height, the sidebar or tree taking width, or a width, padding or
transform mid-transition. The focus state is off in the first commit whose URL is not a
file page URL, and after a reload; that screen's first frame is in its ordinary layout,
and an overlay sidebar opened in focus mode is closed on leaving by either path.

I5. Below 768px the page is laid out exactly as a phone file page whatever the focus
state, and widening back to 768px or more with the state on gives the focus layout,
hidden.

I6. `T` toggles the focus state on a file page URL only when no editing element has focus,
no header menu is open and the page is not covered (each of the confirm dialog, the
rename dialog, the search window, the quick note panel, the full-screen viewers and the
player's pseudo and system full screen covers it; the open overlay sidebar does not);
otherwise it changes nothing and, in an editing element, types the character. `T` and the button both work while the mini player is shown.

I7. Revealing and hiding move nothing on the page: the canvas, the inspector, the player
frame and the `/files/{id}` column keep their boxes (within 1px), and `--app-header-h`
equals the safe-area inset in the focus layout whether hidden or revealed.

I8. In the focus layout, `Cmd/Ctrl+K`, `Cmd/Ctrl+Shift+F`, `N` and `Cmd/Ctrl+\` do what
they do outside it, the search window and quick note panel they open are visible, and
the header stays hidden.

I9. On a wide file page the Focus mode button is drawn in the loading, loaded and failed
states whenever the header is shown (outside the focus layout, or revealed in it); it is
32×32, not filled when off and `bg-bg-elevated` when on; its `aria-pressed`, accessible
name and `title` follow the focus state with §9's keys in both locales; and the cheat
sheet lists `T` under `focusMode.title` on every file page URL.

I10. With a fine pointer the header is revealed exactly when the pointer, with no button
held, enters the top 8px below the safe area (over an iframe too) or one of 129 step 3's
holds applies; a save in `error` or `conflict` reveals it whatever the pointer; with a
coarse pointer a tap on the handle reveals it, and with no header menu or overlay
sidebar open a `pointerdown` outside hides it and reaches no page element; whenever the
header hides, keyboard focus inside it is on `<body>`; while the page is covered neither
path reveals and neither the strip nor the handle is present; a file-to-file navigation
keeps the reveal; the menu button opens the overlay sidebar with focus mode still on and
no press in the focus layout writes `sidebar-open`; and the tree button pressed while
revealed ends focus mode and leaves the left pane visible, writing
`tree:enabled:{drive}` only when it was hidden by setting.

## Revises

SPEC-CORE-084 I8. On a file page the tree button follows the table in §3: while yielded it reports the pane as hidden and pressing it shows the pane without writing storage; from "hidden by setting" it writes `true` and the pane is not collapsed afterwards; from "reopened" it writes `false`. A reopened pane, at md width and wider, stays shown across widths, file changes and inspector toggles until the file page is left. In the focus layout of SPEC-CORE-128 the tree button reports the pane as hidden, and a press ends focus mode and then applies this table only when the pane is not visible in the layout that leaving produces.

SPEC-CORE-094 I1. On a file page (canonical or collection route; loading, loaded or failed) outside the focus layout of SPEC-CORE-128, the page shows exactly one row above the content, its height equals the header's height on a folder page of the same drive at the same width, the content's top y is the same in all three states, and the header never shows its ordinary form while the viewer stays on a file page (loading → loaded, file → file); in the focus layout with the header hidden the page shows no row, and with it revealed the row is drawn over the content without moving it.

SPEC-CORE-094 I2. At ≥ 768px on a file page, outside the focus layout or with the header revealed in it, the trail's first crumb starts at the edge D2 defines, and the search button, the quick note button and the profile button each sit left of their x on a folder page of the same drive at the same width by the same amount, equal to the distance from the profile button's right edge to the right edge of the header's last control on that page.

SPEC-CORE-094 I3. At < 768px on a file page, the row shows no quick note button, no avatar, no tree button, no Focus mode button and no inspector toggle, and while walking the Inbox no search and no document controls; at ≥ 768px, outside the focus layout or with the header revealed in it, it shows the quick note button, the avatar, the tree button wherever a current drive is known, the Focus mode button, and, wherever the page has an inspector, the inspector toggle as the header's last control, including while a rename is open.

SPEC-CORE-098 I1. On a hosted file page with an inspector at a viewport of 768px or wider, outside the focus layout or with the header revealed in it, the inspector toggle is the header's last control. Its left edge is right of the profile button's right edge, no other button is right of it, and its right edge is 16px from the header's right end.

SPEC-CORE-098 I2. On a hosted file page at a viewport of 768px or wider, outside the focus layout or with the header revealed in it, exactly one divider lies right of the profile button, 12px from it and 12px from the Focus mode button that follows it; where the page has an inspector the toggle follows the Focus mode button 12px away; and the divider that separates the file's controls from search is still present.

SPEC-CORE-098 I3. On a page that is not a file page, or below 768px, the header contains no inspector toggle, no Focus mode button and no divider after the profile button; on a hosted file page without an inspector at 768px or wider, outside the focus layout or with the header revealed in it, the Focus mode button is the header's last control and its right edge is 16px from the header's right end; wherever the profile button is the header's last control, its right edge is 16px from the header's right end.

SPEC-CORE-098 I5. Across a file-to-file swap, a loading-to-loaded swap, a beside-to-stacked resize, a resize across 768px, or a move to a hosted file page without an inspector, every frame at 768px or wider in which the header is shown (outside the focus layout, or revealed in it) shows exactly one trailing divider and one Focus mode button, and either no inspector toggle or exactly one as the last control. The header never holds a toggle inside the row, never holds two, and never holds one left by a file page that is no longer on top. Where the outgoing and the incoming hosted file page both have an inspector at 768px or wider, every such frame shows the toggle.

SPEC-CORE-098 I8. At 768px wide, on the canonical route with a video file (find and the file kind's controls shown), the tree closed, not walking the Inbox, no `header-actions` entries, a 200-character file name and the set-up button in place of the avatar, outside the focus layout or with the header revealed in it, the header does not wrap, none of its controls overlap, the trail's leaf is truncated, and the Focus mode button and the toggle lie inside the header's box.

SPEC-CORE-098 I10. On a hosted file page at 768px or wider, outside the focus layout or with the header revealed in it, the Focus mode button follows the profile button in the header's focus order, the inspector toggle follows it where the page has one, and nothing focusable follows the last of them inside the header.

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
- **Deciding "file page" from the registered header row** (`FileHeaderRowProvider`'s
  `top`). It has a gap when `/files/{id}` hands its row to `FileDetailShell` and when a
  link moves from `?file=` to `/files/{id}`; the URL has none.
- **A close API for header menus.** Not needed: `T` does nothing while one is open, a
  press on the button closes it as any outside press does, and on touch an outside
  `pointerdown` goes to the open menu first.
- **A contract for `header-actions` addon popovers.** An addon that sets `aria-expanded`
  on its trigger already holds the reveal; adding a slot prop would be an extension-point
  change for one hold.
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
  swipe at the screen's very top edge, which Safari's toolbar or the status bar owns. The
  human confirms it on a device (§10).
- **`T` inside an iframe.** A document listener cannot see keys typed into a
  cross-document frame; the reveal and the button cover that case.
- **The native iOS shell's immersive mode (`shellImmersive`).** It serves the player's
  full screen; focus mode does not hold it.
- **Animating the reveal.** The header is reached by aiming at the top edge; a slide-in
  would put the controls under the pointer only after the motion ends.
- **Addon `t` bindings.** No core or addon frontend (`addons/*`, searched in the main
  checkout on 2026-11-18) binds `t`.
