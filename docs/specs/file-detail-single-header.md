# File detail: one header row

SPEC-ID: SPEC-CORE-094
SPEC-ID: SPEC-CORE-095

Approval: sha256:d7dacebc30fe3cedb69e9435864254124e5f362ae87a840aa00504eab89b3b47 Yuichi Senga 2026-11-13

## Summary

A file's page draws two bars before any content: the app header (56px: search, quick
note, the `header-actions` slot, the avatar, with the menu and tree buttons fixed over its
left end) and, under it, the file-detail row (`FileDetailChrome`, 48px: back link or
breadcrumb, the file kind's controls, Inbox actions, the inspector toggle). That is 104px,
plus the safe-area inset in the iOS app, and on a phone it is about half the height of a
16:9 video.

SPEC-CORE-094 puts both into one 56px row on every file-detail surface. Below 768px the
row is trimmed to what a file page needs and its heading becomes two lines (parent above,
file name below). SPEC-CORE-095 moves the phone's way of raising the inspector sheet from
the header to the sheet's resting strip, which today shows the file name but cannot be
pressed.

The agreed design is the canvas https://claude.ai/artifact/9bUY3gRthnVNBiP32QXfB6
(version 12), saved in `docs/process/reviews/feature-file-detail-single-header/design/`.
Artboards: `Current-PC` / `Main` (proposed, 1440×900), `Current-Phone` / `Proposed-Phone`
(390×844, video), `Md-Current-Phone` / `Md-Proposed-Phone` / `Md-Renaming-Phone` (390×844,
Markdown note). Points decided after the canvas and not drawn on it: the trail's left
edge (D2); the narrow row without the tree button, and its Inbox-walk form (D4); the
narrow rename hiding every control right of the heading (D7); the strip button's label and
popup behaviour (D8). Decisions: hako `0Uh0-EamBqBfW5dLpC1Go`.

"File page" below means any of: the canonical route (`/drive/{drive}/{path}?file={id}`,
drawn by `RightPaneFile`, including its cross-folder and search forms) and the collection
route (`/files/{id}`, drawn by `FileDetailFullScreen`), in each of the states loading,
loaded and failed. "Wide" is a viewport ≥ 768px, "narrow" < 768px (`MOBILE_BREAKPOINT`).

### The design's checkable lines

Wide:

- D1. One row, 56px tall plus the safe-area inset, with one bottom border. No second row
  under it.
- D2. Left to right: menu button, tree button (both where they are today), the trail
  (breadcrumb ending in the file name, or the back control plus title where the host
  supplies `onBack`), then the file kind's controls, the Inbox actions, the inspector
  toggle where the page has an inspector, a 1px × 20px divider, then search, quick note,
  the `header-actions` slot and the avatar. The trail starts at whichever is further
  right: 12px past the right edge of the menu/tree buttons, or the left edge of the box
  that holds the file's content — on the canonical route the right pane (`RightPaneFile`'s
  section, right of the folder tree when it is open and of the sidebar when it is inline at
  ≥ 1200px), on the collection route the centred content column (`max-w-5xl` /
  `max-w-6xl`, at its `px-4` padding). While the tree pane's width animates (150ms) the
  trail may arrive at the new edge when the animation ends.
- D3. Search, quick note and the avatar sit at the same x as on a folder page of the same
  drive at the same width.

Narrow:

- D4. One row, 56px tall plus the safe-area inset: menu button, a two-line heading, the
  file kind's controls, then search. While walking the Inbox (`?nav=inbox`) the row is
  menu button, heading, then the Inbox actions (previous, next, **Done**) only: the file
  kind's controls and search are not shown. No tree button, no quick note button, no
  avatar, no inspector toggle. (The tree button does nothing on a narrow file page today:
  `TwoPaneLayout` gives the tree `w-0` below `md` while a file is open.) The
  `header-actions` slot stays mounted at the row's end; it draws nothing visible today.
- D5. Heading line 1: `‹` and the parent folder's name, or the drive's name for a file at
  the drive root (12px, muted, a link to that folder); where the host supplies `onBack`,
  `‹` and the back label, and pressing it calls `onBack`. Line 2: the file name (14px,
  semibold, one line, truncated with an ellipsis). A Markdown note's save indicator
  follows the name on line 2. When there is no name yet (loading) or none at all (failed),
  the heading shows line 1 alone, centred vertically; the row's height does not change.
- D6. A Markdown or plain-text document shows, right of the heading: find-in-page, one
  edit/preview toggle button, then search. The toggle shows the mode it switches to
  (pencil while previewing, eye while editing).
- D7. Renaming a Markdown or plain-text note: line 2 becomes the input, as wide as the
  heading plus the space every visible control right of the heading used (document
  controls, Inbox actions, search), all of which are hidden — not shown and not pressable —
  while it is open, and shown again when the rename is committed or cancelled. The save
  indicator is hidden with line 2's name. The fixed suffix (`.md`, or the four characters
  `EditableTitle` fixes for plain text) sits outside the input. Line 1 stays.
- D8. The inspector's resting strip: the file name, preceded by a chevron-up glyph, is one
  button whose accessible name is today's `inspector.expandSheet` label, with
  `aria-expanded="false"`; it exists only at `peek`. The like / favourite / `⋮` buttons
  beside it are unchanged and separate from it. A press on it while a strip popup (`⋮`) is
  open only dismisses the popup (DESIGN.md §Context Menus: the dismissing press's click is
  swallowed).

Every width:

- D9. The find-in-page button uses a glyph different from the global search's magnifier
  (lucide `FileSearch`).

## Required items

### 1. Normal flow

SPEC-CORE-094:

1. The viewer opens a file page.
2. From the first paint (loading), through loaded, and in the failed state, the file
   page's row content is drawn in the app header's row, not in a row of its own. The
   controls drawn there stay part of the file page's React tree (a portal into the
   header, or an equivalent that keeps the page's providers): find opens that page's find
   bar, the image arrows walk that page's list, the Inbox actions act on that page's item,
   the save indicator and the view-mode toggle read that page's editor.
3. The viewer leaves the file page (back link, breadcrumb, file close, any navigation):
   the header returns to the form every other screen has. A file-to-file change inside a
   file page (image arrows, Inbox walk, collection next, `?file=` change) and loading →
   loaded swap the row's content without passing through the ordinary form.
4. Several components can draw the row: `FileDetailFullScreen` (no file yet, or a file
   that does not ride the shell), every `FileDetailShell` (skeleton, `ShellLayout`,
   `MarkdownDocumentLayout`), and `RightPaneFile`'s error state. The header shows the
   content of the most recently mounted one that is still mounted; when it unmounts, the
   one before it shows again. The header shows the ordinary form only when none is
   mounted.

SPEC-CORE-095:

1. On a narrow viewport the inspector rests as the 56px strip at the bottom.
2. The viewer presses the strip's name button. The sheet rises to `half`, exactly as the
   header's inspector toggle raises it today (`handleInspectorButton`), including its
   handling of an open find bar (`setLayoutTouched`, `setSheetOverride(null)`).
3. The sheet is lowered as it is today: dragging the handle down, pulling the content
   down from its top, or Escape.

### 2. Failure cases

- Canonical route, loading (`FileDetailSkeleton`): the row shows the trail as today's
  skeleton row does (the drive crumb with an empty end); no title placeholder is added.
  Narrow: line 1 alone (D5). The strip shows its skeleton line, which is not a button.
- Canonical route, failed (`RightPaneFile` error state): the row shows the drive crumb
  alone, as today's error row does; the pane shows the existing "not found" text. Narrow:
  line 1 alone, the drive's name.
- Collection route, loading or failed (`FileDetailFullScreen` with no file): the row shows
  the back control (`onBack`) and nothing after it; today's `h-12` placeholder row is not
  drawn. Narrow: line 1 alone, the back label.
- The viewport crosses 768px while a file page is open (rotation, window drag): the row
  switches form without remounting the rename control, so a rename in progress keeps its
  typed text and is neither committed nor discarded (the reason `FileDetailChrome` places
  `titleNode` once). The buttons D7 hides follow the new form: hidden on narrow while the
  rename is open, shown on wide.
- The file page unmounts while a rename is open: the rename behaves as it does today on
  unmount; the header returns to the ordinary form.

### 3. States

The header row has two forms:

- **Ordinary**: every screen that is not a file page. Unchanged.
- **File page**: a file page is mounted. Wide or narrow by viewport width.

Within either file-page form, a Markdown or plain-text note's title is **reading** or
**renaming** (its `EditableTitle` is open). On wide, renaming hides nothing (as today); on
narrow it hides the controls right of the heading (D7).

The inspector sheet keeps its states `peek`, `half`, `full` and its transitions. One
transition is added: `peek` → `half` by the strip's name button.

Not allowed:

- File page → ordinary → file page while the viewer stays on a file page (loading →
  loaded, file → file). Observed by I1.
- The wide form hiding any control during a rename. Observed by I3.
- The strip's name button lowering the sheet: it exists only at `peek`. Observed by I7.
- A narrow rename leaving a hidden control pressable. Observed by I6.

### 4. Data read and written

None stored. No table, file, endpoint or storage key is read or written by this change.
The inspector's open state (`useInspectorOpen`) and the sheet state keep their current
storage and defaults. `--app-header-h` keeps its meaning (the header's measured height).

### 5. External services

None. The change is client layout only.

### 6. Authorization

None changes. The file page renders only what the viewer could already open; the row
shows the same names it shows today.

### 7. Effect on existing features

- `Header` (`AppShell`) is the only owner of the top row on every screen; screens other
  than file pages see no change.
- The `header-actions` slot keeps today's gate (mounted whenever the current drive is
  known) and stays mounted on narrow file pages. Knowledge's `ClipNotifier` draws nothing
  there but announces clip results. On narrow it sits at the row's end; no addon draws
  visible content there today.
- Quick note: only its button is hidden on a narrow file page. `QuickNoteProvider` and the
  quick-note keyboard shortcuts stay.
- Tree button: hidden on a narrow file page only; elsewhere it keeps today's rule (shown
  wherever a current drive is known, which on `/files/{id}` is only once the file's drive
  has been set).
- Global search keeps its modal and mobile overlay; only the button's place changes.
- `Cmd/Ctrl+\` keeps working at ≥ 768px only, as today (`useShortcuts(..., !isMobile)`).
- `h-below-header` (`calc(100dvh - 3.5rem - safe-area)`) stays correct because the header
  stays 56px; the 48px the file row took is returned to the pane below.
- `useCompanionMetrics` reads `--app-header-h` for the player's height budget; with no
  second row inside the pane, the player's budget grows by 48px.
- `useFullscreen`: rotating a playing video to landscape still opens fullscreen, which
  covers the row; nothing changes there.
- Collection playback: the `onBack` control keeps its label and behaviour, in the merged
  row.
- The folder tree pane (`TwoPaneLayout`) and its yield on a file page are unchanged.
- The page's `<h1>` is unchanged (see Checked, no action).
- Existing tests that this spec reverses on purpose, and what replaces them:
  - `e2e-components/header-row-crowding.spec.ts`, the phone cases asserting the back
    control is the only name (`leadingCount` 1) and the phone control counts: replaced by
    D4/D5 (line 2 is the file name; the narrow control set of D4) and I8.
  - Tests asserting the inspector toggle on a narrow viewport (`expandSheet` /
    `collapseSheet` labels, e.g. `MobileInspectorSheet.test.tsx`,
    `FileDetailChrome.test.tsx`): replaced by I3 and I7.
  - `e2e-components/segmented-control.cases.ts`, "the Markdown view toggle in the file
    header" at 390px (2 `view-mode-` segments, a 48px `file-detail-chrome`): replaced by
    D6 / I10 and D1 / I1.
  - `e2e-components/plain-text-document.spec.ts` expecting one `file-detail-chrome`:
    replaced by I1 (one row).
  - `FileDetailPageRow.test.tsx` ("draws none on the collection route, where the host
    owns the row") and `FileDetailFullScreen.test.tsx` (the host's own row and its `h-12`
    placeholder): replaced by flow step 4 and I1.
  - `e2e-components/fixtures/app.tsx` `file-detail-chrome-*` arrangements, which draw the
    row without a `Header`: rebuilt to draw it inside the header.
  - Tests and fixtures that locate the 48px `file-detail-chrome` bar
    (`e2e-layout/fixtures/mobile-inspector-sheet.html`, `componentFixtureParity.test.tsx`,
    `fileActionsMenuFixtureParity.test.tsx`): updated to the merged row; their properties
    otherwise stay.

### 8. Error behavior

No new error surface. A failed load shows today's "not found" pane text under the merged
row. Nothing new is logged.

### 9. User-visible behavior

- The D1–D9 lines above.
- Wide: the content (player, document, inspector tabs) starts 48px higher. A 16:9 video is
  sized by width, so on a wide screen the gain shows below the video and in the inspector.
- Narrow: quick note, the avatar and the tree button are not on a file page; they are on
  every other screen. The inspector toggle is not in the header; the sheet is raised from
  its strip.
- Narrow: the Markdown edit/preview switch is one button instead of two segments (split was
  already hidden below 768px).
- `docs/user-guide/viewers-and-players.md` is updated in the same PR: "The page row" now
  describes the one row, and "On a phone" says the sheet is raised by pressing the strip.

### 10. Non-functional

- No layout step: loading, loaded and failed draw the header at the same height, and the
  content below starts at the same y in all three.
- The row never wraps to a second line at 320px wide or wider; long names truncate.
- Touch targets this change adds or moves (the controls moved into the header row and the
  strip's name button) are at least 44px on a coarse pointer (DESIGN.md §Row Actions).
  The fixed menu button keeps its size (40px), which this change does not touch.
- No new network requests or timers.

## Touch points

- `frontend/src/components/Header.tsx`, `frontend/src/components/AppShell.tsx`: the row
  gains a file-page form and a place a file page draws into.
- `frontend/src/components/ChromeButtons.tsx`, `frontend/src/components/DriveTreeToggle.tsx`,
  `frontend/src/components/TreeToggle.tsx`: the fixed menu and tree buttons; the tree
  button hides on a narrow file page.
- `frontend/src/components/markdown/SaveDot.tsx`, `frontend/src/lib/markdownChromeContext.tsx`:
  the save indicator on line 2, and the rename-open state D7 reads.
- `frontend/src/components/FileDetail/FileDetailChrome.tsx`: draws into the header row
  instead of as its own 48px bar; narrow two-line heading; trail left edge.
- `frontend/src/components/Breadcrumb.tsx`: the wide trail.
- `frontend/src/components/FileDetailShell.tsx`: passes the inspector toggle (wide only)
  and connects the strip button to `handleInspectorButton`.
- `frontend/src/components/FileDetail/ShellLayout.tsx`: builds the file kind's controls
  (`FindButton`, `FileNavControls`) and passes `sheetPeek`.
- `frontend/src/components/FileDetail/FileDetailPresenter.tsx`,
  `frontend/src/components/FileDetail/FileDetailContainer.tsx` (`sheetPeek`, its `inert`
  wrapper): the strip's name button.
- `frontend/src/components/FileDetail/FileDetailSkeleton.tsx`,
  `frontend/src/components/folder/RightPaneFile.tsx` (error state),
  `frontend/src/components/FileDetailFullScreen.tsx` (its `h-12` placeholder): the other
  places that draw the row.
- `frontend/src/components/MobileInspectorSheet.tsx`: the strip.
- `frontend/src/components/inbox/InboxDetailActions.tsx`,
  `frontend/src/components/FileDetail/FileNavControls.tsx`: placement in the narrow row.
- `frontend/src/components/markdown/MarkdownDocumentLayout.tsx`,
  `frontend/src/components/markdown/EditableTitle.tsx`,
  `frontend/src/components/MarkdownViewModeToggle.tsx`,
  `frontend/src/components/FileDetail/find/FindButton.tsx`: narrow controls and rename,
  the find glyph.
- `frontend/src/components/quick-note/`, `frontend/src/components/GlobalSearch.tsx`: only
  where they are placed; their behaviour is unchanged.
- `frontend/src/app/globals.css` (`h-below-header`): read, expected unchanged.
- `frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts`: reads
  `--app-header-h`; expected unchanged.
- `frontend/src/messages-core/{ja,en}.json`: labels for the strip button and the single
  view-mode toggle.
- Tests: unit tests under `frontend/src/components/**/__tests__`,
  `frontend/e2e-components/` (including `header-row-crowding.spec.ts`,
  `sheet-gesture.spec.ts`, `segmented-control.cases.ts`, `plain-text-document.spec.ts`,
  `popup-dismiss.spec.ts` and `fixtures/app.tsx`), `frontend/e2e-layout/` and its fixture
  parity tests.
- Docs: `DESIGN.md` (§Page Header: the trail's left edge on a file page and the narrow
  row without the tree button; §Header; §File detail), `docs/user-guide/viewers-and-players.md`.
- Rules passed through: `DESIGN.md` §Page Header ("controls that change the layout belong
  to the app toolbar"; "the header starts at the content's left edge"), §Row Actions
  (44px), §Sticking below the header; `.claude/rules/frontend-conventions.md`. No
  protected path is edited.

## Invariants

I1. On a file page (canonical or collection route; loading, loaded or failed), the page
shows exactly one row above the content, its height equals the header's height on a
folder page of the same drive at the same width, the content's top y is the same in all
three states, and the header never shows its ordinary form while the viewer stays on a
file page (loading → loaded, file → file).
I2. At ≥ 768px on a file page, the search button, the quick note button and the avatar
sit at the same x as on a folder page of the same drive at the same width, and the
trail's first crumb starts at the edge D2 defines.
I3. At < 768px on a file page, the row shows no quick note button, no avatar, no tree
button and no inspector toggle, and while walking the Inbox no search and no document
controls; at ≥ 768px it shows the quick note button, the avatar, the tree button wherever
a current drive is known, and the inspector toggle wherever the page has an inspector,
including while a rename is open.
I4. Leaving a file page restores the ordinary header: no part of the file row (trail,
controls, inspector toggle) remains in it on the next screen, and at < 768px the quick
note button, the avatar and (wherever a current drive is known) the tree button are back.
I5. Every trail link (and the narrow heading's line 1) navigates to the same destination
as today's `FileDetailChrome` link; where the host supplies `onBack`, that control calls
`onBack` and does not navigate to the parent folder.
I6. Crossing 768px while a Markdown or plain-text rename is open sends no rename request,
and the typed text is still in the input afterwards; at < 768px, while the rename is open,
no control right of the heading can be pressed, and all of them are back after it is
committed or cancelled.
I7. At < 768px, pressing the resting strip's name button raises the sheet to `half`,
also while the file's data is refetching; pressing the strip's like, favourite or `⋮`
does what it does today and leaves the sheet at `peek`; a press on the name button while
a strip popup is open only closes the popup; the loading strip and a raised sheet have no
such button.
I8. At 320px wide with a 200-character file name, including while walking the Inbox, the
row does not wrap and none of its controls overlap.
I9. A control drawn in the row acts on its own file page: find opens that page's find
bar, the image arrows and the Inbox actions move through that page's list, and the
Markdown save indicator and view-mode toggle reflect and change that page's editor.
I10. At < 768px the single view-mode toggle switches to the mode its glyph shows (pencil →
edit, eye → preview).

## Checked, no action

- **Removing the header on a file page (YouTube-app style).** The row carries the title
  and, for a note, the rename control (title left the inspector header on 2026-11-11), and
  PDF / Markdown / images have no player to carry the file's identity.
- **Hiding the row in landscape on a phone.** `useFullscreen` already opens fullscreen when
  a playing video is rotated to landscape and leaves it when rotated back. A paused video
  and non-video files keep the row on purpose.
- **Hiding the row on scroll.** The file page's canvas often does not scroll (workbench,
  document editor), so a hidden row would be hard to bring back.
- **A button to lower the sheet on a phone.** Dragging the handle, pulling from the top and
  Escape stay the ways down, as today. Under the personal-tool premise no assistive-tech
  path is added.
- **`Cmd/Ctrl+\` below 768px.** Stays off, as today (human decision).
- **The strip's name button while the file's data is refetching.** The button only
  raises the sheet, which needs no fresh data, so it sits outside the `inert` wrapper that
  holds the action row; the action row stays inert as today.
- **Making the row's file name the page's `<h1>`** (`page-headings.test.ts` lists
  `FileMetaBlock.tsx` as waiting for it). A heading-structure change, separate from this
  layout change.
- **The tree button on a narrow file page doing nothing.** It is hidden there (D4) rather
  than made to work; opening the tree over a file on a phone is a separate question.
- **The `header-actions` slot before the drive is known** on `/files/{id}`. Keeps today's
  gate; nothing in the slot needs a file page without a drive.
- **The landscape artboard** in the canvas history (`Proposed-Landscape`) was withdrawn and
  is not part of the design.
