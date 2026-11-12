# Inspector layout on tablets and small windows

SPEC-ID: SPEC-CORE-082
SPEC-ID: SPEC-CORE-083
SPEC-ID: SPEC-CORE-084

Approval: sha256:fea82ee561a276893564fc5100b78c8df5975729860059480447f7f2298c3f11 Yuichi Senga 2026-11-11

## Summary

On the file page, the inspector's header block (title, duration, the action row and the tag
chips) moves from above the tab strip into the top of the Info tab, on every surface: the
desktop pane, the new stacked form and the phone sheet (SPEC-CORE-082). On a file with a
player (video, audio, `.loft`), on a non-phone viewport, a row too narrow for the inspector
beside the canvas (under 60.5rem, about 968px) no longer lays the inspector over the video:
it stacks the inspector under a smaller player, and the inspector of a player file starts
open on every non-phone viewport (SPEC-CORE-083). And when the left pane of the two-pane
route (the folder tree, or a collection's item list) is what stops the inspector fitting
beside the player, that pane is collapsed for the file page without touching the stored
tree setting; reopening it is the viewer's call and is not undone (SPEC-CORE-084). It is
for the owner watching on an iPad, an iPad mini or a narrow desktop window, where today the
inspector covers the player's controls and the header leaves the transcript a few lines.

Agreed design: https://claude.ai/artifact/18AtPuVJChEK1A74GhYHHq (version 10), saved in
`docs/process/reviews/feature-inspector-responsive-layout/design/`. Its visible decisions:

- D1. Every inspector (Main 1180×820, MiniLandscape 1133×650, MiniLandscapeInfo 1133×650,
  Portrait 820×1180, SmallWindow 900×700, MiniPortrait 744×1133, PhoneInfo 390×844): the
  tab strip is the inspector's first row. Nothing of the header is above it.
- D2. Info selected (Main, MiniLandscapeInfo, SmallWindow, PhoneInfo): the Info panel
  starts with the header block (title, duration, action row, "+ Add tag" / tag chips), then
  the rest of Info (Visual index, Comments, …).
- D3. Transcript selected (MiniLandscape, Portrait, MiniPortrait) is a drawn state, not a
  default: under the strip come the transcript's own controls and then the cues; no title
  or action row. The default tab stays Info.
- D4. Beside (Main, MiniLandscape): left pane collapsed, player on the left, 384px
  inspector on the right at full height, not over the player.
- D5. Stacked (Portrait, SmallWindow): chrome row, then the player centred and shrunk, then
  the inspector at full width to the bottom. The chrome row's inspector button shows a
  panel-bottom icon, and the layout toggle (transcript beside / below) is absent.
- D6. Phone sheet (MiniPortrait, PhoneInfo): grabber, then the strip; the sheet's resting
  strip (name + action row) is unchanged.

Owner decisions taken during spec review: the collection item list yields like the tree;
the sidebar stays in its overlay form while the left pane is yielded; the default tab
stays Info in every form; files without a player keep today's overlay in a narrow row and
never trigger a yield; the stacked inspector starts open.

## Required items

### 1. Normal flow

Terms.
- *Row*: the fit host, `inspector-fit-host`, holding canvas and inspector.
- *Narrow row*: row width below `INSPECTOR_BESIDE_MIN_REM` (60.5rem).
- *Phone*: `useIsMobile()` true (viewport under 768px).
- *Player file*: `playerKind(file) !== null`.
- *Inspector open*: the effective desktop state — the stored per-drive value, else the
  default of 083.6, overridden while in-file find holds it open.
- *File page*: a file is open in the page or in a two-pane right pane. Moving to another
  file with `selectFile` (arrows, inbox Next, the tree, a gallery) stays on the file page.
- *Left pane present*: the shell is inside a `TwoPaneLayout` that draws a pane (folder
  tree or collection item list); `TwoPaneLayout` says so through a context. Search and
  cross-folder file pages have no left pane.

SPEC-CORE-082, header in the Info tab:

1. `InspectorShell` keeps receiving `header` and `tabs`. It draws the strip first.
2. The header is rendered as the first block of the Info panel (`#inspector-panel-info`),
   before Info's own content. With Info the only listed tab (no strip), the Info panel is
   the whole inspector and the header is still its first block.
3. Selecting another tab hides the Info panel and the header with it (`hidden`, as every
   unselected panel today). The header stays mounted.
4. In `column` mode (phone sheet) the separate header block above the strip is gone; the
   strip stays sticky and `--inspector-sticky-top` is still published.
5. Where the header shows the description (files whose description is not in the canvas,
   and player files in the stacked layout), it is where `FileMetaBlock` already puts it
   with `hoistDescription` false.

SPEC-CORE-083, stacked inspector:

1. The row observer (the existing one in `useInspectorFit`) computes the *form*:
   - `stacked`: not phone, player file, narrow row;
   - `overlay`: not phone, not a player file, narrow row;
   - `beside`: otherwise;
   - `absent`: no width has been measured yet for this file.
   It writes `data-inspector-fit` on the row as today (including clearing it at zero
   width, so a stale `overlay` never outlives its width) and publishes the row's height as
   `--fit-row-h` on the row. The store of step 2 keeps the last measured form across a
   zero width, so content placed by it is not moved by a `display:none` moment. On a phone
   the attribute is written as today and the store's form is `phone`: nothing on a phone
   depends on the form, and step 8 does not apply there.
   Within one shell mount (one file) the store's form goes `absent` → first measured form
   once and never back to `absent`; afterwards it moves only between `beside` and
   `stacked` (player file) or `beside` and `overlay` (other files), or to and from
   `phone`, as the width changes. Opening or closing the inspector never changes the form.
2. The form reaches the components above the shell through a module store holding
   `{ fileId, form, open }`, written only by the shell that renders the file page
   (`FileDetailShell` with the new prop `publishesForm`; the skeleton and the markdown
   layout do not set it, and pass `isPlayerFile` false). A reader passes its own `fileId`
   and gets `absent` when the stored `fileId` differs, so a skeleton, a previous file or a
   file change never hands a stale form to the first render. On unmount a shell resets the
   store only if it still holds that shell's own `fileId`, so the next file's shell, which
   measures in its commit before the old shell's cleanup runs, is never wiped. `open` is
   the effective open state, find's override included.
3. *Stacked layout* = form `stacked` and inspector open. The row is a column. The canvas
   holds, in order, the find bar (while open), the player block (`.media-detail-player`,
   with its preview-actions row) and the `.loft` player aside, and nothing else; it is at
   most 60% of the row's height. The inspector takes the rest (at least 40% of the row) at
   full width, panels scrolling inside it as in the desktop pane. The mini player is not
   shown in the stacked layout.
4. Player size in the stacked layout: a framed player (video, `.loft`) gets
   `max-width: min(<today's --player-avail bound>, H * 16 / 9)`, where H is half the row's
   height minus the height of the find bar (while open), the preview-actions row (when it
   has content) and the canvas padding. So the frame is at most half the row, and the find
   bar, frame, actions row and padding together fit the 60% without scrolling; the frame's
   controls are always on screen. Only a `.loft` aside, below the frame, can make the
   canvas scroll. An audio player keeps its natural height. `--player-avail` is measured
   as today; the stacked bound is an extra term of the `min`.
5. In the stacked layout: the *companions* — core's `ChaptersPanel` and every
   `player-side` slot entry (transcript, addon companions) — are inspector tabs whatever `media-layout-preference` says; the layout
   toggle is not rendered; the description is in the header block; the summaries
   (`ActiveSummaryHost`, `detailed-summary`) are at the end of Info, as on the phone sheet.
   Form `stacked` with the inspector closed is today's page: description, summaries and
   companion in the canvas per the preference, layout toggle shown.
6. Default open: with no stored per-drive value, the inspector of a player file is open on
   every non-phone viewport (stacked, or beside after a yield, neither covers the player);
   any other file keeps today's viewport default (open at 1120px and wider). The default
   depends on the file kind, not on the form, so a form change or a yield never opens or
   closes the inspector. A stored value always wins.
7. Inspector button in the chrome row: form `stacked` → `PanelBottom` when closed,
   `PanelBottomClose` when open; every other form → `PanelRight` / `PanelRightClose` as
   today. Label and title unchanged.
8. First frame: while the form read for this file is `absent`, on a player file off a
   phone the description, the summaries and the companions are not mounted anywhere;
   they mount once, in the place the first measured form gives. Files without a player
   render as today.
9. In-file find in `stacked` with the inspector closed: opening find turns the stacked
   layout on (its override counts as open for the layout). The canvas `scrollTop` is
   remembered when find opens and restored when find closes and the canvas is back.
10. The stacked layout turns on and off only with the effective open state: the chrome
    button, Ctrl+\, find's override, and `MediaLayoutToggle`'s `onBeside` (reachable in
    `stacked` with the inspector closed, where it writes `open = true` as today); and
    with the form, on a width change.

SPEC-CORE-084, left pane yields:

1. The yield is evaluated whenever any of its inputs changes (row width, inspector open,
   file, phone, pane shown). It is set when all hold: left pane present; the pane shown by
   the stored setting (`tree:enabled:{drive}` on, viewport md or wider); player file;
   the inspector open by the stored value or the default (find's override does not count:
   find is momentary, a yield is not); not phone; the form measured; the row narrow; and
   neither "yielded" nor "reopened" already set on this file page. It is evaluated in the
   layout phase, so the first painted frame of a file page that yields already has the
   pane collapsed.
2. Setting it: a per-drive, in-memory flag. The pane collapses without its width
   transition. `tree:enabled:{drive}` is not written. The sidebar keeps its overlay form
   (`useOverlaySidebarWhen` reads "shown by setting or yielded").
3. The form for the frame that sets the yield is computed from the row width plus the
   pane's width (read from the pane element's `offsetWidth` at that moment, not observed),
   so a row that fits without the pane goes straight to `beside` and one that does not
   goes straight to `stacked`; no other form is drawn in between.
4. `useTreeVisible` while yielded: `visible` and `beside` false, for the pane width,
   `TreeToggle`, `DriveTreeToggle` and `FolderBrowser`; a separate `yielded` field for the
   sidebar borrow. The precondition of step 1 reads the stored setting, not `visible`.
5. The tree button, on a file page with a left pane present, follows the table in §3. It
   is drawn outside `TwoPaneLayout`, so it learns this from the yield store:
   `TwoPaneLayout` sets a per-drive "file page active" bit while a file is open in its
   right pane, and `useTreeVisible(drive).toggle` reads it and sets "reopened" itself.
   The pane appears with its normal width transition whenever it comes back (reopen, or
   the listing after leaving the file page).
6. Leaving the file page clears both flags and the "file page active" bit: `TwoPaneLayout`
   clears its drive's flags when no file is open in its right pane and when it unmounts.
   At md and wider the listing then shows the pane exactly as the stored setting says;
   below md it follows today's narrow request (`treeNarrowOpenStore`).

### 2. Failure cases

- No width measured yet: form `absent`, layout as beside, no yield; on a player file the
  deferred content of 083.8 waits one frame.
- No `ResizeObserver`: measured once on mount, as today.
- A video without metadata: the cap is a CSS bound, so the split does not wait for it.
- A shell with no left-pane context: the yield is a no-op and the form uses the row width
  alone.
- A short row in the stacked layout: the canvas is capped at 60% and scrolls inside
  itself; the inspector keeps at least 40%.

### 3. States

Form: `absent` (before the first measurement for the file) / `beside` / `overlay` /
`stacked`. Stacked layout = `stacked` and inspector open.

Left pane, per drive, on a file page with a left pane present:

| From | Event | To |
|---|---|---|
| shown by setting | yield conditions of 084.1 hold | yielded (nothing written) |
| shown by setting | tree button | hidden by setting (`tree:enabled = false` written, as today; no flag) |
| yielded | tree button | reopened (pane shown, nothing written) |
| hidden by setting | tree button | reopened (`tree:enabled = true` written) |
| reopened | tree button | hidden by setting (`tree:enabled = false` written, "reopened" cleared) |
| yielded / reopened | leaving the file page, `TwoPaneLayout` unmount | cleared |

Disallowed: "yielded" does not change on closing the inspector, widening the window,
crossing the phone width or moving to a file without a player; "reopened" does not change
on any of those either, and never returns to "yielded" on the same file page. Below md the
pane is never drawn with a file open, whatever the state.

Tab selection: unchanged; reset to the first listed tab (Info) per file.

### 4. Data read and written

- `localStorage` `tree:enabled:{drive}`: read; written only by the tree button (table in
  §3), never by the yield or the reopen from "yielded".
- `localStorage` `media-layout-preference`: read; never written by a form change, an
  inspector toggle or a yield.
- `localStorage` `inspector-open:{drive}`: read; written by the viewer's inspector button
  and by `MediaLayoutToggle`'s `onBeside`, as today. One key per drive for every form: a
  narrow and a wide window on the same browser share the viewer's last choice.
- New in-memory stores: the form store (083.2) and the per-drive yield store. Neither is
  persisted.
- No server data, API or DB.

### 5. External services

None: layout only.

### 6. Authorization

None: no data access changes.

### 7. Effect on existing features

- Every file page with an inspector (documents, images, PDFs, archives, markdown) gets the
  header inside Info.
- In-file find: it selects its own tab, so the title is not above find results any more.
  Its override counts as open; `in-file-find` I8 still holds, through 083.9 for the
  canvas scroll.
- Crossing into or out of the stacked layout (resize, or opening/closing the inspector in
  `stacked`) moves the description and summaries between canvas and Info, and with
  `media-layout-preference = stacked` the transcript between canvas and tabs; those
  remount and fetch again. Accepted: a rotation or a deliberate action. With preference
  `beside` the transcript is in tabs on both sides and is not remounted.
- Collection page: its item list is the left pane and yields like the tree.
- Tests that stub `useTreeVisible` (`SearchPage.*`, `FolderBrowser.imageQuery`) get the
  new `yielded` field.
- `file-ask-thread` I6: the Ask panel keeps a bounded height (at least 40% of the row) in
  the stacked inspector.
- `scene-timeline` I5: the section caps itself at 24rem in a full-width Info as anywhere.
- `no-horizontal-scroll-on-mouse` I5: the strip wraps on mouse as today.
- Documents changed in the same PR:
  - `DESIGN.md`: "The tabs under the inspector's fixed header" (§ Inspector tab strip)
    and "the inspector's header scrolls away … only the tab strip sticks" become "the strip
    is the inspector's first row; the header is the top of Info"; the inspector-width row
    ("covers the canvas") gains the stacked form for player files; the companion table's
    "below" gains "a tab in the stacked layout"; the "does the inspector start open"
    question answers "a player file: always off a phone; otherwise the viewport (1120px)".
  - `docs/ADDON-DEVELOPMENT.md`: the `player-side` row adds "always a tab in the stacked
    layout"; the `file-detail-sections` row lists the stacked inspector's Info among the
    places `detailed-summary` goes. The props and the contract are unchanged, so it is not
    an extension-point change.
  - `docs/user-guide/viewers-and-players.md`: the pinned inspector header, the
    narrow-window overlay, the sheet's button row and the layout toggle.
  - `docs/user-guide/file-browsing.md`: one sentence — on a narrow window the tree steps
    aside while a video's inspector is open, and the tree button brings it back.

### 8. Error behavior

No new error path; nothing is logged.

### 9. User-visible behavior

- All widths: the strip is the inspector's first row; the header appears only on Info, at
  its top, and scrolls with Info's content.
- A player file off a phone: the inspector starts open unless the viewer closed it before.
- Not phone, player file, narrow row, inspector open: player on top, at most half the
  height and centred; inspector under it at full width; panel-bottom icon; no layout
  toggle; the transcript is a tab; the description and summaries are in Info. Closing the
  inspector gives today's page.
- Two-pane route: opening a player file in a narrow row with the inspector open collapses
  the left pane at once, without animation; the tree button brings it back, animated, and
  it stays.
- Phone: the sheet; strip directly under the grabber; resting strip unchanged.

### 10. Non-functional

- `InspectorPane` and every panel listed both before and after a form change or a tab
  switch are not remounted.
- The `<video>` element / `.loft` iframe is not remounted by a form change, an inspector
  toggle, a find round-trip or a yield; playback position and state survive.
- No new observer: the row's height comes from the existing row observer; the pane width
  is read once when the yield is set.
- Strip tap targets keep `pointer-coarse:min-h-11`.

## Touch points

- `frontend/src/components/FileDetail/inspector/InspectorShell.tsx` — strip first, header
  into the Info panel, `column` header block removed.
- `frontend/src/components/FileDetail/hooks/useInspectorFit.ts` — the four forms,
  `isPlayerFile`, `--fit-row-h`, the yield arithmetic.
- New `frontend/src/lib/inspectorFormStore.ts` — the store of 083.2.
- `frontend/src/components/FileDetailShell.tsx` — `isPlayerFile`, `publishesForm`; stacked
  layout; effective open published; yield evaluation; canvas scroll kept across find.
- `frontend/src/components/FileDetail/FileDetailSkeleton.tsx`,
  `frontend/src/components/markdown/MarkdownDocumentLayout.tsx` — their shells neither
  publish nor claim a player.
- `frontend/src/components/InspectorPane.tsx` — full-width form via CSS only.
- `frontend/src/components/FileDetail/ShellLayout.tsx` — `companionInTabs`, summaries
  placement, layout toggle, the deferral of 083.8.
- `frontend/src/components/FileDetail/FileDetailContainer.tsx` — `hoistDescription`.
- `frontend/src/components/FileDetail/MediaCanvas.tsx`,
  `frontend/src/components/FileDetail/MediaPlayerBlock.tsx`,
  `frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts`,
  `frontend/src/components/FileDetail/mediaHostStyle.ts` — canvas content and the player
  cap (only where they hold today's `--player-avail` bound).
- `frontend/src/components/FileDetail/FileDetailChrome.tsx` — the icon of 083.7.
- `frontend/src/lib/inspectorOpenStore.ts`, `frontend/src/hooks/useInspectorOpen.ts` —
  the default by file kind (083.6).
- `frontend/src/hooks/useTreeVisible.ts`, `frontend/src/components/folder/TwoPaneLayout.tsx`
  (left-pane context, clearing, no-transition collapse), `frontend/src/components/TreeToggle.tsx`,
  `frontend/src/components/DriveTreeToggle.tsx`, `frontend/src/components/SidebarProvider.tsx`
  (borrow while yielded), new `frontend/src/lib/treeYieldStore.ts`.
- `frontend/src/app/globals.css` — `[data-inspector-fit="stacked"]` rules next to the
  overlay rules.
- `frontend/src/lib/layoutSizes.ts` — the stacked shares (player frame 1/2, canvas 60%).
- `DESIGN.md`, `docs/ADDON-DEVELOPMENT.md`, `docs/user-guide/viewers-and-players.md`,
  `docs/user-guide/file-browsing.md` — as in item 7.
- Tests and fixtures that mirror today's structure; none is loosened, each asserts the new
  structure:
  - `frontend/e2e-layout/mobile-inspector-sheet.spec.ts`, its fixture
    `frontend/e2e-layout/fixtures/mobile-inspector-sheet.html` and
    `frontend/src/components/__tests__/mobileInspectorSheetFixtureParity.test.tsx`: the
    header measurements (`headerPx`, `headerTopInScroller`) become measurements of the
    header block at the top of the Info panel under the sticky strip; "the strip is on
    screen from the start" holds unconditionally; the header-taller-than-the-sheet case
    becomes Info content taller than the sheet with the strip still stuck at the top.
  - `frontend/e2e-layout/fixtures/no-horizontal-scroll.html` with
    `noHorizontalScrollFixtureParity.test.tsx`: strip first.
  - `frontend/src/components/FileDetail/__tests__/InspectorFit.test.tsx` (four forms),
    `frontend/src/app/__tests__/mediaDetailTheaterCss.test.ts` (overlay rules kept, stacked
    added), `frontend/src/components/FileDetail/inspector/__tests__/InspectorShell.test.tsx`,
    `frontend/src/hooks/__tests__/useInspectorOpen.test.ts`.
  - Under `frontend/src/components/FileDetail/__tests__/`: `MediaShell`, `ViewerShell`,
    `FileDetailContent`, `FileDetailCanvas`, `LowerInspector`, `InspectorTabsSlot`,
    `DocumentController`, `FindInFile`, `FileDetailChrome` tests, where they assert the
    header's position or the icon.
  - `TwoPaneLayout`, `TreeToggle`, `DriveTreeToggle` tests, and the `useTreeVisible` stubs
    in `SearchPage.*` and `FolderBrowser.imageQuery` tests.
- `frontend/e2e-components/projects.ts` (register the new `-desktop` spec) and
  `frontend/e2e-components/build-bundle.ts` (if a new bundle entry is needed); each test
  sets its own viewport with `page.setViewportSize`.
- New real-browser measurements in `frontend/e2e-components/` (real components):
  - I1 and I10 at 390×844 and 744×1133 (sheet), and I1 at 1180×820 (pane).
  - I3 at 820×1180, 900×700 and 1133×650 with the tree reopened, video file, with find
    closed and open.
  - I7's "no `stacked` frame" at 1180×820 and at 1100×800 with the tree on, inspector
    open, video file, in a real `TwoPaneLayout`; the yield to `stacked` at 900×700.
  - I2's player identity and `currentTime` across a resize from 1180 to 820 wide.
  - I6's overlay for a PDF at 900×700.
- Rules passed through: `.claude/rules/frontend-conventions.md`.
- No protected path.

## Invariants

I1. Inside `inspector-shell`, on every surface, the tab strip (when shown) is the first
row, and the file's title, action row and tag chips are inside `#inspector-panel-info`, so
none of them is visible while another tab is selected.
I2. A tab switch, a form change, opening or closing the inspector, a find round-trip and a
yield leave the same `<video>` element or `.loft` iframe with its playback position and
play state; a tab switch or a form change also leaves the same `InspectorPane` element and
the same element for every panel listed both before and after; a find round-trip in
`stacked` with the inspector closed leaves the canvas `scrollTop` as it was.
I3. In the stacked layout (not phone, player file, narrow row, inspector open): no part of
the inspector overlaps the player block, the player's controls bar is inside the viewport,
a framed player's 16:9 frame is at most half the row's height, the inspector is at least
40% of the row's height, and neither the layout toggle nor the description is under the
player. The inspector button is `PanelBottomClose` there and `PanelBottom` in `stacked`
with the inspector closed; in every other form it is `PanelRight` / `PanelRightClose`.
I4. In the stacked layout every companion (`ChaptersPanel` and each `player-side` entry)
is mounted exactly once, as an inspector tab; in `stacked` with the inspector closed the page is today's (layout toggle
shown, description under the player); no form change, inspector toggle or yield writes
`media-layout-preference`.
I5. Opening a player file — first load, after the skeleton, or by `selectFile` from any
file — mounts the description, `ActiveSummaryHost`, `detailed-summary` and each companion
once, in the place the first measured form gives; none of them is
ever mounted in two places at once.
I6. With no stored `inspector-open:{drive}`, a player file's inspector starts open on
every non-phone viewport and any other file follows today's 1120px default; a stored value
wins; a form change or a yield never opens or closes the inspector. A file without a
player never gets the stacked form or a yield, and in a narrow row gets today's overlay.
I7. A yield happens only when a left pane is present and shown by the stored setting, the
file has a player, the inspector is open by the stored value or the default (not by find),
the viewport is not a phone and the measured row is narrow; it never writes
`tree:enabled:{drive}`, keeps the sidebar in its overlay form, no frame is painted with the
pane at full width once the yield conditions hold, and a row that fits without the pane
goes to `beside` with no `stacked` frame drawn.
I8. On a file page the tree button follows the table in §3: while yielded it reports the
pane as hidden and pressing it shows the pane without writing storage; from "hidden by
setting" it writes `true` and the pane is not collapsed afterwards; from "reopened" it
writes `false`. A reopened pane, at md width and wider, stays shown across widths, file
changes and inspector toggles until the file page is left.
I9. A yielded pane stays collapsed across closing the inspector, widening, a phone
crossing and a file without a player; leaving the file page, by any route or by
`TwoPaneLayout` unmounting, clears the yield state, and at md and wider the listing shows
the pane exactly when the stored setting is on.
I10. On a phone the inspector is the bottom sheet, its strip is directly under the
grabber, `--inspector-sticky-top` on `inspector-shell` equals the strip's height, and the
resting strip shows the file name and the action row.

## Checked, no action

- Files without a player in a narrow row keep the overlay, never yield and keep today's
  default-open (owner): a document is read top to bottom, and a stacked inspector would
  take half of it.
- The default tab stays Info in the stacked form (owner); D3 is a drawn state.
- In-file find's override does not trigger a yield: find is momentary and closing it does
  not bring the pane back, so a yield from it would outlive the search.
- The mini player is off in the stacked layout: the player stays on screen there, and a
  second copy would sit over the inspector.
- The default-open rule is by file kind rather than by form: tied to the form, a yield
  from `stacked` to `beside` below 1120px would close the inspector it was made for.
- A height threshold for the header (pinned on tall windows only) was designed and dropped
  by the owner: one form everywhere.
- Collapsing the header on scroll is rejected: the transcript scrolls itself with
  playback, which would collapse and expand the header on its own.
- Squeezing the header into one row is rejected: it does not fit 384px.
- The action row is one tab switch away while another tab is open; accepted by the owner.
- Remounts on a crossing (description, summaries, and the transcript under preference
  `stacked`): accepted, see item 7. The first open is protected by 083.8 instead.
- One `inspector-open:{drive}` key for every form: different devices have different
  storage, so the shared key only meets one browser resized or rotated, where the last
  choice is the right one to keep.
- `FileDetailSkeleton` does not predict the stacked form: it does not know the file kind.
- The pane width is read from the element rather than shared as a constant: the class
  `md:w-[280px]` must stay a literal for Tailwind, and a second copy of 280 would drift.
- iOS app: it wraps the web UI; no native change.
