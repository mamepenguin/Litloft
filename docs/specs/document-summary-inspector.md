# Document viewers fill the canvas; their summaries live in the inspector

SPEC-ID: SPEC-CORE-131
SPEC-ID: SPEC-CORE-132
SPEC-ID: SPEC-CORE-133
SPEC-ID: SPEC-ADDON-135

Approval:

## Summary

On the file page of a file without a player (PDF, EPUB, archive, image), the viewer
takes the canvas down to its bottom edge, and the two summaries that sat under it move
into the inspector: the short (active) summary to the end of the Info tab, the detailed
summary to its own inspector tab. While the detailed summary tab is selected the inspector
widens, so the summary reads at a comfortable measure beside the document and a citation
can be checked against the page next to it. Pressing a citation's jump to the open file
moves that viewer in place instead of navigating. It is for the owner reading documents;
a PDF today stops at 80% of the viewport height and leaves a blank band under it, wider
still in focus mode, and the detailed summary is out of reach below it.

- SPEC-CORE-131: the document viewers fill the canvas height.
- SPEC-CORE-132: the summaries of a file without a player are in the inspector (Info and
  the detailed summary tab), never in the canvas.
- SPEC-CORE-133: the detailed summary tab widens the inspector while it is selected.
- SPEC-ADDON-135: a citation to the open file moves the open viewer in place.

Design: https://claude.ai/artifact/NgeJpnF7bv9jMqWS8pTp1C, saved in
`docs/process/reviews/feature-pdf-viewer-height/design/` (Main = today, Info, Detail,
DetailFocus; `Main.dc.html` draws all four).

## Terms

- **File without a player**: a file the file page shows in `MediaCanvas` with no player
  (`hasPlayer` false): PDF, EPUB, archive, image. Markdown, text and HTML use
  `MarkdownDocumentLayout` and are out of scope.
- **Row**: the canvas plus the inspector, side by side, in the inspector's `beside` form.
- **Wide inspector**: the inspector at `max(round(0.4 × row width), 512px)`.

## Required items

### 1. Normal flow

1. The viewer opens a PDF on a file page (`/drive/…?file=`, `/files/{id}`) at 768px or
   wider. The PDF viewer (toolbar and page area) runs from the canvas top to the canvas
   bottom; the canvas does not scroll. The same holds for the EPUB reader and the archive
   viewer. In focus mode (SPEC-CORE-128) the canvas is taller and the viewer follows it.
2. The inspector's Info tab ends with the active summary (when the file has one), after
   the comments, followed by a link 「詳細要約を読む」 / "Read the detailed summary" when
   the detailed summary tab exists. The link selects that tab.
3. The tab strip reads Info, Pages (when present), 詳細要約 / Detailed summary, Related,
   then the add-on inspector tabs, in that order; the detailed summary tab exists exactly
   when the `detailed-summary` entry reports itself available (the same availability the
   workbench toggle uses for a player file: present for `ready`, `pending`, `failed`;
   absent for `insufficient_content` and when the add-on is off for the drive).
4. Selecting the detailed summary tab in the `beside` form widens the inspector to the wide
   width in the same frame; the canvas narrows by the same amount and the viewer re-fits
   to the new width (a PDF in fit-width mode re-renders at the new width; the reading
   position is kept as the viewer keeps it on any width change). Selecting another tab
   returns the inspector to 384px in the same frame.
5. In the `overlay` form the inspector covers the canvas; with the detailed summary tab
   selected it covers it at the wide width (never wider than the viewport minus 48px).
   In the `stacked` form and on a phone (bottom sheet) the tab exists and the width does
   not change.
6. In the detailed summary, pressing a citation shows its excerpt card as today; its jump
   button, for an excerpt of the open file with a page (PDF) or a section (EPUB), moves the
   open viewer to that page or section. The URL path and query do not change, nothing
   remounts, and the inspector stays on the detailed summary tab. An excerpt of another
   file navigates as today (`/files/{id}?page=` / `?section=`).

### 2. Failure cases

- The detailed summary fails to load or reports `failed`: the tab stays, showing the
  add-on's own error and Retry, as the workbench panel does today.
- The add-on is missing or off for the drive: no tab, no link in Info, and no width
  change is possible.
- No `documentController` (the viewer has not reported one yet, or the file is an image
  or archive with no page model): the jump button keeps today's navigation.
- A narrow row: the `beside` form needs a row of at least `INSPECTOR_BESIDE_MIN_REM`
  (60.5rem, 968px; SPEC-CORE-082), so a wide inspector there leaves the canvas at least
  456px; below it the form is `overlay` and the widened pane covers the canvas.

### 3. States

- Inspector width: `normal` (384px) or `wide`. `wide` ⇔ form is `beside` or `overlay`
  AND the inspector is open AND the selected tab is the detailed summary. Any change of
  those three recomputes it in the same commit. Nothing persists it.
- The selected tab follows today's rules (`resetKey` per file: a file change returns to
  Info), so moving to another file returns the inspector to 384px.
- Viewer height: derived from the canvas on every resize (`useFillHeight`), never stored.

### 4. Data read and written

- Read: the `detailed-summary` slot entry's availability report, the file's active
  summary (unchanged fetches).
- Written: nothing new. No storage key, no API, no table. The add-on writes nothing new.

### 5. External services

None. The detailed summary's own fetches and LLM work are unchanged.

### 6. Authorization

Unchanged. The tab and the jump show only what the page already loads for the viewer; a
jump within the open file reaches nothing the viewer could not scroll to.

### 7. Effect on existing features

- Player files (video, audio) are unchanged: their summaries stay workbench panels and
  inspector tabs as SPEC-CORE-085..090/104 say; their inspector never widens.
- Find is unchanged; the find tab and the detailed summary tab
  are different tabs, and widening follows whichever is selected.
- Focus mode: the canvas and the row are wider; the wide width is computed from the row.
- The collection route (`FileDetailCanvas`) keeps its card viewers and today's heights;
  its summaries are not in a canvas column.
- `DocumentController.goTo` gains a caller (the add-on); its contract is unchanged.

### 8. Error behavior

Nothing new is logged. A jump that cannot move the viewer (controller missing) falls back
to today's navigation rather than doing nothing.

### 9. User-visible behavior

- PDF / EPUB / archive viewer: from the canvas top (under the find bar when open) to the
  canvas bottom; no blank band below at any width or in focus mode; the canvas scrollbar
  does not appear.
- Info tab, after Comments: heading 「要約」 / "Summary" (the active summary's own heading,
  unchanged), its text, then the link 「詳細要約を読む」 / "Read the detailed summary" in
  the prose link colour (`--accent`).
- Tab label 「詳細要約」 / "Detailed summary"; the tab body is the add-on's
  `DetailedSummarySection` as drawn today, its body text 16px.
- Wide inspector: at 1440×900 with the sidebar 512px (PDF 688px), at 1280×800 512px, in
  focus mode at 1440 576px. No transition animates the width.
- Jump in place: the PDF scrolls so the cited page's top is at the top of the page area
  (as the Pages tab does); EPUB opens the section.
- i18n keys (core, `messages-core`): `inspector.tabs.detailedSummary` 「詳細要約」 /
  "Detailed summary"; `inspector.readDetailedSummary` 「詳細要約を読む」 / "Read the
  detailed summary".

### 10. Non-functional

- No remount of the viewer when the tab or the width changes, and none on a jump.
- `ActiveSummaryHost` and `detailed-summary` are each mounted at most once per file page,
  in one place (as I5 of `docs/specs/inspector-responsive-layout.md` requires for player files).
- The width change is a CSS width on the existing pane element, not a new element.

## Touch points

- `frontend/src/components/PdfPreview.tsx`: the page area's `h-[80vh]` replaced by the
  fill height.
- `frontend/src/components/epub/useFillHeight.ts`: moved to
  `frontend/src/hooks/useFillHeight.ts` (second caller), behaviour unchanged.
- `frontend/src/components/epub/EpubPreview.tsx`: import path only.
- The archive viewer's height (`ArchivePreview` / its listing container): the fill height.
- `frontend/src/components/FileDetail/ShellLayout.tsx`: `heavySummaries` no longer passed
  to the canvas; for a file without a player the active summary goes to Info in every form
  and the detailed summary becomes a core tab built from the `detailed-summary` entry; the
  selected tab is reported to the shell.
- `frontend/src/components/FileDetail/MediaCanvas.tsx`: the `heavySummaries` prop and its
  slot removed.
- `frontend/src/components/FileDetail/inspector/` (`buildInspectorTabs`, `InspectorShell`):
  the tab's place in the order; the link from Info selects it.
- `frontend/src/components/InspectorPane.tsx`, `frontend/src/components/FileDetailShell.tsx`,
  `frontend/src/app/globals.css`: a `data-inspector-wide` attribute and the width rule.
- `frontend/src/lib/layoutSizes.ts`: `INSPECTOR_WIDE_SHARE = 0.4`,
  `INSPECTOR_WIDE_MIN_REM = 32`.
- `frontend/src/messages-core/ja.json`, `en.json`: the two keys in §9.
- `addons/intelligence/frontend/CitationInlinePanel.tsx`, `DetailedSummarySection.tsx`:
  take `documentController` and `fileId` from the slot props and jump in place for the
  open file (SPEC-ADDON-135). The add-on PR merges first; core bumps the gitlink.
- `DESIGN.md`: §"A floor under the canvas viewer" becomes a fill rule; the inspector
  section gains the wide width rule.
- `docs/user-guide/reading.md` (or `viewers-and-players.md`): where the detailed summary
  is on a document page.
- Tests: new `frontend/e2e-components/document-summary-inspector-desktop.spec.ts`; existing
  tests that find the summaries in the canvas for a non-player file are revised.

## Invariants

I1. On a file page at 768px or wider, in the `beside` and `overlay` forms, in the ordinary
and the focus layout, at 1440×900 and 1280×800, the bottom edge of the PDF viewer, of the
EPUB reader and of the archive viewer is within 1px of the canvas's bottom inner edge, and
the canvas's `scrollHeight` equals its `clientHeight`.
I2. For a file without a player, no element of `ActiveSummaryHost` or of the
`detailed-summary` entry is inside the canvas (`main`) in any form; `ActiveSummaryHost`
is inside `#inspector-panel-info` after the comments; each is mounted at most once.
I3. The detailed summary tab is present exactly when the `detailed-summary` entry reports
available, sits after Pages and before Related, and its label is 「詳細要約」 / "Detailed
summary"; the Info link to it is present exactly when the tab is.
I4. In the `beside` form with the inspector open, the inspector's width is
`max(round(0.4 × row), 512)` px while the detailed summary tab is selected and 384px
otherwise, within 1px, the canvas's width plus the inspector's equals the row, and the
change happens in the commit that changes the selected tab, with no width transition.
I5. In the `overlay` form the inspector's width follows I4's rule, capped at the viewport
width minus 48px; in the `stacked` form and on a phone the inspector's width does not
change when the tab is selected.
I6. Selecting the detailed summary tab, selecting another tab, and a jump in place leave
the same viewer element mounted (the same PDF page-area element, the same EPUB iframe),
and a file change returns the inspector to 384px.
I7. For a player file nothing in this spec applies: the inspector is 384px whatever tab is
selected, and its summaries stay where SPEC-CORE-085..090 and 104 put them.
I8. In the detailed summary of the open file, a citation's jump to a page (PDF) or section
(EPUB) of that same file calls the viewer's `goTo` and leaves `location.pathname` and
`location.search` unchanged; a citation of another file navigates as today.
I9. Nothing in this change writes `localStorage` or `sessionStorage`.

## Checked, no action

- The detailed summary as a workbench-style panel for documents (owner): it needs a
  toggle row and makes three columns with the inspector, which narrows the PDF most.
- The detailed summary left under the viewer (owner): with the viewer filling the canvas it
  would sit below a full-height document, behind a second scroll.
- The wide width at plain 40% (owner): at 1280 it is 416px, about 24 characters a line at
  16px, barely more than today's 384px. 512px keeps about 30 characters a line.
- Half and half (owner): 600px PDF at 1440 shrinks the page more than the summary needs.
- Remembering the wide state or the selected tab across files: today's tab reset per file
  is kept; a document opened next starts on Info.
- The collection route's viewers and summaries: a separate surface with card viewers; not
  changed.
- Markdown, text, HTML: their own layout already fills and puts the sections under the
  text as a document's continuation; out of scope.
- A transition on the width: SPEC-CORE-128 removed width transitions on this row for focus
  mode; the same holds here, and a re-fitting PDF would animate through every width.
- `useFillHeight`'s 60% share when content follows the viewer: after this change nothing
  follows a document viewer in the canvas, so the viewer always fits; the share stays for
  the EPUB's case where it does (a find bar is above, not below).
- The PDF/archive "70% floor" rule in DESIGN.md becomes moot: filling is never shorter
  than the floor except on a phone, where the rule already did not apply.
