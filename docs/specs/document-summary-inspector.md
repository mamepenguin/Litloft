# Document viewers fill the canvas; their summaries live in the inspector

SPEC-ID: SPEC-CORE-131
SPEC-ID: SPEC-CORE-132
SPEC-ID: SPEC-CORE-133
SPEC-ID: SPEC-ADDON-135

Approval:

## Summary

On the file page of a file without a player, the summaries that sat under the viewer
move into the inspector, and the document viewers then take the canvas down to its bottom
edge. The summary note (a knowledge note chosen as the file's summary) goes into the Info
tab; the detailed summary becomes an inspector tab of its own, and while that tab is
selected the inspector widens so the summary reads at about 30 characters a line beside
the document. A citation's jump to the open file moves that viewer in place. It is for the
owner reading documents: a PDF today stops at 80% of the viewport height and leaves a
blank band under it (wider in focus mode), and the detailed summary is out of reach below.

- SPEC-CORE-131: on the file page the PDF, EPUB and archive viewers fill the canvas height.
- SPEC-CORE-132: a new slot, `document-side`, whose entries are inspector tabs on the file
  page of a file without a player; such a file's summaries are never in the canvas.
- SPEC-CORE-133: an inspector tab whose entry asks for it widens the inspector while it is
  selected.
- SPEC-ADDON-135: intelligence registers the detailed summary in `document-side`, asking
  for the wide width, and a citation's jump to the open file moves the open viewer in place.

Design: https://claude.ai/artifact/NgeJpnF7bv9jMqWS8pTp1C, saved in
`docs/process/reviews/feature-pdf-viewer-height/design/` (Main = today, Info, Detail,
DetailFocus; `Main.dc.html` draws all four). The Info artboard draws the AI summary that
is already in Info; the summary note, when present, sits in the same place.

## Terms

- **File page**: the canonical route `/files/{id}` and the drive route `/drive/…?file=`
  (`FileDetailShell`). The collection route (`FileDetailCanvas`) is not a file page here.
- **File without a player**: a file the file page draws in `MediaCanvas` with
  `hasPlayer` false: PDF, EPUB, archive, image, a text preview, an Office excerpt, a
  Markdown file shown without the editor, and the no-preview card. Files drawn by
  `MarkdownDocumentLayout` (Markdown with the editor, plain-text documents, HTML) are not.
- **Filled viewer**: the PDF viewer, the EPUB reader and the archive viewer.
- **Fit host**: the element the inspector pane is laid out in (`data-inspector-fit` host).
  **Row**: its width. In `beside` the row is the canvas plus the inspector.
- **Wide width**: `max(round(0.4 × row), 512px)`; in `overlay` also at most `row − 48px`.
- **Summary note**: `ActiveSummaryHost` (a knowledge note made the file's summary). The
  AI summary (intelligence's `summary` entry in `file-detail-sections`) is already in Info
  and does not move.

## Required items

### 1. Normal flow

1. The viewer opens a PDF on a file page at any width. The PDF viewer (toolbar and page
   area) ends at the canvas's content bottom: with no find bar and no preview actions it
   runs from the canvas top; with a find bar it starts under it; with preview actions it
   ends above them. The canvas does not scroll. The EPUB reader and the archive viewer do
   the same. In focus mode (SPEC-CORE-128) the canvas is taller and the viewer follows.
   On a phone the content bottom is above the sheet's peek, as the EPUB reader does today.
2. For a file without a player, the Info tab holds what it holds today, and the summary
   note (when the file has one) at its end, before Comments. Nothing links to the
   detailed summary from Info.
3. Each `document-side` entry that reports itself available is an inspector tab, labelled
   with the entry's own label, placed after the core tabs Find and Pages (when present)
   and before Related; several entries sort by their priority. intelligence registers
   `detailed-summary` there (label 「詳細要約」 / "Detailed summary"), so a PDF's strip
   reads Info, (Find), Pages, 詳細要約, Related, Ask.
4. An id registered in `document-side` is not drawn from `file-detail-sections` on the
   file page of a file without a player (as an id in `player-side` is not, on a player
   file).
5. Selecting a tab whose entry declares `wide: true`, with the inspector open in `beside`
   or `overlay`, sets the pane to the wide width in that commit; selecting any other tab
   sets it back to 384px in that commit. In `beside` the canvas narrows by the same amount
   and the filled viewer re-fits (a fit-width PDF re-renders at the new width, keeping its
   reading position as it does on any width change). On a phone the sheet keeps its
   width.
6. In the detailed summary, a citation shows its excerpt card as today. Its jump, for an
   excerpt of the file whose viewer is open on the page with a `documentController`, calls
   `goTo({ page })` (PDF) or `goTo({ section })` (EPUB); the URL does not change, nothing
   remounts, and the tab stays selected. On a phone the sheet is lowered
   (`lowerInspector`) in the same handler so the moved page is visible; in `overlay` the
   pane stays. An excerpt of another file, or with no controller, navigates as today.

### 2. Failure cases

- The detailed summary fails or is generating: the tab shows the add-on's own state and
  Retry, as the player file's tab does.
- The add-on is missing or off for the drive, or reports unavailable: no tab, and nothing
  can widen the pane.
- An entry that has not reported yet is not listed (so the strip does not show an empty
  tab and the pane never widens for one).
- `goTo` with a page beyond the document or before the viewer is ready: whatever the
  viewer does today for the Ask tab's citations (it already calls `goTo`); no new handling.
- A narrow row: `beside` needs a row of at least 968px (`INSPECTOR_BESIDE_MIN_REM`), so a
  wide pane there leaves the canvas at least 456px; below it the form is `overlay`.

### 3. States

Pane width ∈ {384px, wide}. It is wide exactly when all hold: the inspector is open, the
form is `beside` or `overlay` (not phone), and the selected tab's entry declares `wide`.
Each event below recomputes it in the commit the event lands in:

| Event | Result |
|---|---|
| select the wide tab / another tab | wide / 384 |
| find opens (find selects its own tab) | 384 |
| close / open the inspector with the wide tab selected | pane gone / wide |
| resize across a form change `beside`↔`overlay` | stays wide, recomputed for the new row |
| resize to a phone | sheet, width unchanged |
| enter / leave focus mode | stays wide, recomputed for the new row |
| the wide tab disappears while selected (availability flips) | selection moves as `InspectorShell` does today, 384 |
| move to another file | tab resets to Info (`resetKey`), 384 |

Not allowed: a wide pane while a tab other than a `wide` entry's is selected; a wide pane
on a phone or for a player file; any width transition.

### 4. Data read and written

- Read: `document-side` entries and their availability reports; the summary note and the
  detailed summary as today.
- Written: nothing. No storage key, API, table or event.

### 5. External services

None. The detailed summary's own fetches and LLM work are unchanged.

### 6. Authorization

Unchanged. A jump within the open file reaches nothing the viewer could not scroll to.

### 7. Effect on existing features

- Player files: unchanged. Their summaries stay workbench panels and narrow-form tabs
  (SPEC-CORE-085..090, 104); their pane never widens.
- `MarkdownDocumentLayout` files (Markdown with the editor, plain-text documents, HTML):
  unchanged in every form, summaries under the text on desktop as today, no new tab.
- The collection route: its viewers keep today's heights (the fill applies on the file
  page only); a citation's jump to the file open there also moves its viewer in place,
  because the same props reach it.
- Closing the desktop inspector unmounts its contents, so for a file without a player the
  detailed summary stops polling while closed, an unsaved edit of it is lost on close,
  and opening refetches (owner accepted; the AI button that offers it is in the
  inspector too).
- `DocumentController.goTo` gains a second caller beside the Ask tab's citations.
- The canvas floor (`viewerTakesCanvasFloor`, `useCanvasFloor`, `data-canvas-floor`, its
  CSS rule) is replaced by the fill and removed.

### 8. Error behavior

Nothing new is logged or shown.

### 9. User-visible behavior

- PDF / EPUB / archive on a file page: down to the canvas's content bottom, no blank band,
  no canvas scrollbar, at every width and in focus mode. The archive keeps the host's 16px
  padding; PDF and EPUB bleed to the edges as today.
- Info for a file without a player: the summary note, when present, before Comments.
- A 「詳細要約」 / "Detailed summary" tab after Pages; its body is the add-on's section as
  a player file's tab draws it (`labelledByHost`, so the tab label is its heading), body
  text 16px.
- Wide pane: 1440×900 with the sidebar 512px (PDF 688px); 1280×800 512px; focus mode at
  1440 576px. No width animation.
- Jump in place: the PDF shows the cited page at the top of the page area; the EPUB opens
  the section. A URL opened with `?page=`/`?section=` keeps it after a jump (a reload
  returns there; accepted).

### 10. Non-functional

- No remount of a filled viewer on a tab change, a width change or a jump.
- Each summary component is mounted at most once per file page.
- The width is a CSS width on the existing pane element, set from an attribute.

## Touch points

- `frontend/src/components/epub/useFillHeight.ts` → `frontend/src/hooks/useFillHeight.ts`
  (now three callers), unchanged; `EpubPreview.tsx` import path.
- `frontend/src/components/PdfPreview.tsx`, `frontend/src/components/ArchivePreview.tsx`:
  take a `fillCanvas` prop; with it the viewer's height is `useFillHeight`'s, without it
  today's (`h-[80vh]`, the archive's own). `FilePreview.tsx`, `MediaPlayerBlock.tsx`,
  `MediaCanvas.tsx` pass it on the file page only.
- `frontend/src/lib/fileDetailShell.ts` (`viewerTakesCanvasFloor`),
  `frontend/src/components/FileDetail/hooks/useCanvasFloor.ts`,
  `frontend/src/components/FileDetailShell.tsx` (`data-canvas-floor`),
  `frontend/src/app/globals.css` (the floor rule): removed.
- Slots: slot ids are strings with no registry; `SlotEntry` in `frontend/src/lib/addons`
  gains the optional `wide` field read from the manifest entry; core reads
  `getSlotEntries("document-side")`. `docs/ADDON-DEVELOPMENT.md` documents the slot and the
  field (a new extension point).
- `frontend/src/components/FileDetail/ShellLayout.tsx`: no `heavySummaries` in the canvas
  for a file without a player; the summary note at the end of Info before Comments;
  `document-side` entries as inspector tabs with availability; ids in `document-side`
  excluded from `file-detail-sections` for those files; the selected tab's `wide` reported
  to the shell.
- `frontend/src/components/FileDetail/MediaCanvas.tsx`: the `heavySummaries` slot removed.
- `frontend/src/components/FileDetail/inspector/` (`buildInspectorTabs`, `InspectorShell`):
  the `document-side` tabs' place; the selected tab reported.
- `frontend/src/components/InspectorPane.tsx`, `FileDetailShell.tsx`, `globals.css`:
  `data-inspector-wide` and the width rule (`beside`, `overlay`).
- `frontend/src/lib/layoutSizes.ts`: `INSPECTOR_WIDE_SHARE = 0.4`,
  `INSPECTOR_WIDE_MIN_REM = 32`, `INSPECTOR_OVERLAY_GUTTER_REM = 3`.
- `addons/intelligence/frontend/manifest.json` (or the add-on's manifest): `detailed-summary`
  in `document-side` with `wide: true`, reporting availability as its `player-side` entry
  does; `DetailedSummarySection.tsx`, `CitationInlinePanel.tsx`: the in-place jump and the
  sheet lowering. The add-on PR merges first; core bumps the gitlink.
- `DESIGN.md`: §"A floor under the canvas viewer" becomes the fill rule; the inspector
  section gains the wide pane.
- Docs: `docs/user-guide/viewers-and-players.md` (where the detailed summary is on a
  document page, line ~27); `docs/addons/intelligence.md` (~804: "On a file without a
  player, Detailed summary is a tab in the inspector"); `docs/addons/knowledge.md` (~199:
  the summary note is in Info on a file without a player); `docs/ADDON-DEVELOPMENT.md`.
- Tests: new `frontend/e2e-components/document-summary-inspector-desktop.spec.ts`;
  existing tests that find the summaries or the floor in the canvas are revised.

## Invariants

I1. On a file page, for a PDF, an EPUB and an archive, at 1440×900 and 1280×800, in the
`beside` and `overlay` forms and in focus mode, the filled viewer's bottom edge is within
1px of the canvas's content bottom (the canvas's inner bottom less its own padding and,
for the archive, the host's 16px), and the canvas's `scrollHeight` equals its
`clientHeight`; on the collection route the PDF page area is still 80vh tall.
I2. On the file page of a file without a player, no element of the summary note or of any
`document-side` entry is inside `main`, in any form; the summary note, when present, is
inside `#inspector-panel-info` immediately before the comments; each is mounted at most
once.
I3. A `document-side` entry is an inspector tab exactly when it has reported available,
labelled with its own label, after Find and Pages and before Related, and an id it shares
with `file-detail-sections` is not drawn from that slot on such a file.
I4. In `beside` with the inspector open, the pane is `max(round(0.4 × row), 512)`px wide
(±1px) while a `wide` entry's tab is selected and 384px otherwise, the canvas plus the
pane equals the row, the width changes in the commit that changes the selection, and the
pane's computed `transition` includes no width.
I5. In `overlay` the pane follows I4's rule capped at `row − 48`px with no width
transition; on a phone the sheet's width does not change with the tab; a player file's
pane is 384px for every tab.
I6. Each event in §3's table gives the width its row states; in particular opening find
and moving to another file give 384px in that commit.
I7. A tab change, a width change and a jump in place leave the same filled-viewer element
mounted (the same PDF page-area element, the same EPUB iframe).
I8. A citation's jump in the detailed summary, to a page or section of the file whose
viewer is open with a `documentController`, calls `goTo` with that location and leaves
`location.pathname` and `location.search` unchanged; on a phone it also lowers the sheet;
with another file or no controller it navigates to `/files/{id}?page=` / `?section=` as
today.
I9. Files drawn by `MarkdownDocumentLayout` keep today's placement of every summary in
every form and get no `document-side` tab; player files keep theirs.
I10. Nothing in this change writes `localStorage` or `sessionStorage`.

## Checked, no action

- The detailed summary as a workbench-style panel for documents (owner): it needs a
  toggle row, and with the inspector it makes three columns, narrowing the PDF most.
- Leaving the summaries under the viewer (owner): under a full-height viewer they sit
  behind a second scroll.
- A plain 40% wide width (owner): at 1280 it is 416px, about 24 characters a line at
  16px. 512px keeps about 30.
- Half and half (owner): at 1440 a 600px PDF shrinks the page more than the summary needs.
- A 「詳細要約を読む」 link in Info (owner): the AI summary is an add-on section core cannot
  append to, and without a summary note the link would stand alone; the tab is in the
  strip.
- Keeping the detailed summary mounted while the desktop inspector is closed (owner):
  accepted to lose polling and an unsaved edit on close; the AI button is in the inspector.
- Core naming `detailed-summary` (owner): rejected in favour of the `document-side` slot,
  so core knows no add-on id (design-decisions "no core-to-addon dependencies").
- Closing or lowering an `overlay` pane on a jump (owner): part of the page stays visible
  beside it; the pane stays.
- A stale `?page=` after a jump (owner): accepted.
- The stacked form: `useInspectorFit` gives it to player files only, so it never applies
  here.
- Remembering the wide state or the tab across files: the existing per-file reset stays.
- The dormant detailed summary (a summary note is active): the add-on reports
  availability as it does on a player file today; core shows what it reports.
- A preview-actions row (`file-preview-actions`) is empty today; when an add-on fills it
  the filled viewer ends above it, which `useFillHeight` measures.
- Text previews, Office excerpts, images and Markdown without the editor keep their own
  heights; their canvas may scroll as today. Only the summaries move for them.
