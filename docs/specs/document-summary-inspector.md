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
selected beside the document the inspector widens so the summary reads at about 30
characters a line. A citation's jump to the open file moves that viewer in place. It is
for the owner reading documents: a PDF today stops at 80% of the viewport height and
leaves a blank band under it (wider in focus mode), and the detailed summary is out of
reach below it.

- SPEC-CORE-131: on the file page the PDF, EPUB and archive viewers fill the canvas height.
- SPEC-CORE-132: a new slot, `document-side`, whose entries are inspector tabs on the file
  page of a file without a player; such a file's summaries are never in the canvas.
- SPEC-CORE-133: a `document-side` tab whose entry declares `wide` widens the inspector
  while it is selected in the `beside` form.
- SPEC-ADDON-135: intelligence registers the detailed summary in `document-side` with
  `wide`, jumps in place through the slot's `openInViewer`, and selects its tab when the
  reader starts generating it.

Design: https://claude.ai/artifact/NgeJpnF7bv9jMqWS8pTp1C, saved in
`docs/process/reviews/feature-pdf-viewer-height/design/` (Main = today, Info, Detail,
DetailFocus; `Main.dc.html` draws all four). Decided differences from it: the Info
artboard's 「詳細要約を読む」 link is not built; the tab body has no heading or model line of
its own beyond what a player file's tab shows (see §9). The Info artboard's 「要約」 block
is the AI summary, which is already there.

## Terms

- **File page**: the canonical route `/files/{id}` and the drive route `/drive/…?file=`
  (`FileDetailShell`). The collection route (`FileDetailCanvas`) is not a file page here.
- **File without a player**: a file the file page draws in `MediaCanvas` with
  `hasPlayer` false: PDF, EPUB, archive, image, a text preview, an Office excerpt, a
  Markdown file shown without the editor, and the no-preview card. Files drawn by
  `MarkdownDocumentLayout` (Markdown with the editor, plain-text documents, HTML) are not.
- **Filled viewer**: the PDF viewer, the EPUB reader and the archive viewer.
- **Row**: in the `beside` form, the canvas plus the inspector pane.
- **Wide width**: `max(round(0.4 × row), 512px)`.
- **Summary note**: `ActiveSummaryHost` (a knowledge note made the file's summary). The
  AI summary (intelligence's `summary` entry in `file-detail-sections`) is already in Info
  and does not move.

## Required items

### 1. Normal flow

1. The viewer opens a PDF on a file page at any width. The PDF viewer (toolbar and page
   area) ends at the canvas's content bottom: it starts under the find bar when that is
   open and ends above the preview actions when they are present. The canvas does not
   scroll. The EPUB reader and the archive viewer do the same. In focus mode
   (SPEC-CORE-128) the canvas is taller and the viewer follows. On a phone the content
   bottom is above the sheet's peek, as the EPUB reader does today.
2. For a file without a player, the Info tab holds what it holds today, plus the summary
   note (when the file has one) as the last block before Comments. Nothing in Info links
   to the detailed summary.
3. Each `document-side` entry that has reported itself available is an inspector tab with
   the entry's own label (`i18n_key`), placed after the core tabs Find and Pages (when
   present) and before Related; several such tabs sort by priority. intelligence
   registers `detailed-summary` there (label 「詳細要約」 / "Detailed summary"), so a PDF's
   strip reads Info, (Find), Pages, 詳細要約, Related, Ask.
4. On such a file, an id registered in `document-side` is not drawn from
   `file-detail-sections` (as an id in `player-side` is not, on a player file).
5. With the inspector open in `beside`, selecting a tab whose `document-side` entry
   declares `wide: true` sets the pane to the wide width in the render that selects it;
   selecting any other tab sets it back to 384px in that render. The canvas narrows by
   the same amount and the filled viewer re-fits (a fit-width PDF re-renders at the new
   width, keeping its reading position as it does on any width change). In `overlay` and
   on a phone the width does not change.
6. In the detailed summary, a citation shows its excerpt card as today. Its jump first
   calls the slot prop `openInViewer({ fileId, page })` or `({ fileId, section })`. Core
   answers `true` when `fileId` is the open file and its viewer has a
   `documentController`: it calls `goTo`, and on a phone lowers the sheet; the URL does
   not change, nothing remounts, and the tab stays selected. Otherwise it answers `false`
   and the add-on navigates as today. Only `document-side` entries get `openInViewer`, so
   the collection route (where the detailed summary is a `file-detail-sections` entry
   under the viewer) keeps navigating.
7. The reader starts a detailed summary from the AI button on a file without a player:
   the entry calls the slot prop `select()` once generation has started, the tab is
   selected and, in `beside`, the pane widens and shows the generating state.

### 2. Failure cases

- The detailed summary fails or is generating: the tab shows the add-on's own state and
  Retry, as the player file's tab does.
- The add-on is missing or off for the drive, or reports unavailable: no tab, and nothing
  widens the pane.
- An entry that has not reported yet is not listed, so the strip never shows an empty tab
  and the pane never widens for one.
- `goTo` with a page beyond the document or before the viewer is ready: whatever the
  viewer does today for the Ask tab's citations (which already call `goTo`).
- A narrow `beside` row: it is at least 968px (`INSPECTOR_BESIDE_MIN_REM`), so a wide pane
  leaves the canvas at least 456px.

### 3. States

Pane width ∈ {384px, wide}. It is wide exactly when: the page is a file page, the file has
no player, the inspector is open in the `beside` form, and the selected tab is a
`document-side` entry's that declares `wide`. The selected tab is known during render (not
from an effect), so each event below gives its width in the commit it lands in:

| Event | Result |
|---|---|
| select the wide tab / another tab | wide / 384 |
| the entry calls `select()` | that tab, wide |
| find opens (find selects its own tab) | 384 |
| close the inspector / open it again | pane gone / Info, 384 (as today) |
| resize `beside` → `overlay` | 384, the tab stays selected |
| resize `overlay` → `beside` with the wide tab selected | wide |
| resize to a phone / back | sheet; on return, Info, 384 (the sheet is another shell) |
| enter / leave focus mode | stays wide, recomputed for the new row |
| the wide tab disappears while selected | selection moves as `InspectorShell` does, 384 |
| move to another file | Info (`resetKey`), 384 |

Not allowed: a wide pane while any other tab is selected; a wide pane in `overlay`, on a
phone, for a player file or on a `MarkdownDocumentLayout` page; any width transition.

### 4. Data read and written

- Read: `document-side` entries (`id`, `i18n_key`, `priority`, `wide`) and their
  availability reports; the summary note and the detailed summary as today.
- Written: nothing. No storage key, API, table or event.

### 5. External services

None. The detailed summary's own fetches and LLM work are unchanged.

### 6. Authorization

Unchanged. A jump within the open file reaches nothing the viewer could not scroll to.

### 7. Effect on existing features

- Player files: unchanged. Their summaries stay workbench panels and narrow-form tabs
  (SPEC-CORE-085..090, 104); their pane never widens.
- `MarkdownDocumentLayout` files: unchanged in every form; summaries under the text on
  desktop as today; no `document-side` tab. The two places where core names
  `detailed-summary` today (`canvasSlotIds`, `heavySummaries`' `includeIds`) stay for
  this layout only; for a file without a player the exclusion is driven by `document-side`.
- The collection route: its viewers keep today's heights (the fill applies on the file
  page only), and citations navigate as today.
- `inspector-tabs` is unchanged; `document-side` shares its rules (listed only after
  reporting `true`, `i18n_key` required, ids keyed by slot, core tab ids reserved) and
  differs in where it appears (files without a player on a file page only) and where it
  sits (before Related). Its entries also get `active`, `select` and `openInViewer`.
- Closing the desktop inspector unmounts its contents, so for a file without a player the
  detailed summary stops polling while closed, an unsaved edit of it is lost on close,
  and opening refetches (owner accepted; the AI button is in the inspector too).
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
- A 「詳細要約」 / "Detailed summary" tab after Pages. Its body is drawn exactly as a player
  file's detailed summary tab draws it (`labelledByHost`, so the tab label is its heading;
  whatever that tab shows of the model is shown), body text 16px.
- Wide pane in `beside`: 1440×900 with the sidebar 512px (PDF 688px); 1280×800 512px;
  focus mode at 1440 576px. No width animation.
- Jump in place: the PDF shows the cited page at the top of the page area; the EPUB opens
  the section. A URL opened with `?page=`/`?section=` keeps it after a jump (a reload
  returns there; accepted).

### 10. Non-functional

- No remount of a filled viewer on a tab change, a width change or a jump.
- Each summary component is mounted at most once per file page.
- The width is CSS on the existing pane element, driven by an attribute, so the pane's
  children do not re-render for it.

## Slot contract: `document-side`

Manifest: `"document-side": [{ "id", "component", "i18n_key", "priority"?, "wide"? }]`.
Props core passes to an entry, in addition to the common file props:

| Prop | Meaning |
|---|---|
| `onAvailability(available: boolean)` | as for `inspector-tabs`; unanswered = not listed |
| `labelledByHost: true` | the tab label is the heading |
| `fillHeight: true` | the tab body is a bounded column |
| `active: boolean` | true only while this tab is the selected one; an entry turns off window-level keys (the detailed summary's `v` and Escape) when false |
| `select(): void` | selects this tab |
| `openInViewer(target: { fileId: string; page?: number; section?: number }): boolean` | §1.6 |

Ids: tab, DOM and availability ids are keyed by slot as `inspector-tabs`' are, so
`detailed-summary` in `player-side`, `file-detail-sections` and `document-side` never
share a key. An entry whose id is a core tab id is ignored, as in `inspector-tabs`. `wide`
is read on `document-side` entries only.

## Touch points

- `frontend/src/components/epub/useFillHeight.ts` → `frontend/src/hooks/useFillHeight.ts`
  (three callers), unchanged; `EpubPreview.tsx` import path.
- `frontend/src/components/PdfPreview.tsx`, `frontend/src/components/ArchivePreview.tsx`:
  a `fillCanvas` prop; with it the height is `useFillHeight`'s, without it today's
  (`h-[80vh]`; the archive's own). `FilePreview.tsx`, `MediaPlayerBlock.tsx`,
  `MediaCanvas.tsx` pass it on the file page only.
- Removed: `viewerTakesCanvasFloor` (`frontend/src/lib/fileDetailShell.ts`),
  `frontend/src/components/FileDetail/hooks/useCanvasFloor.ts`, `data-canvas-floor` in
  `frontend/src/components/FileDetailShell.tsx`, the floor rule in
  `frontend/src/app/globals.css`.
- `frontend/src/lib/addons` (`SlotEntry`): optional `wide`.
- `frontend/src/components/FileDetail/ShellLayout.tsx`: for a file without a player, no
  summaries in the canvas; the summary note last before Comments in Info (desktop pane and
  phone sheet); `document-side` tabs with the props above; their ids excluded from
  `file-detail-sections`; the selected tab and its `wide` known during render. The
  Markdown path unchanged.
- `frontend/src/components/FileDetail/MediaCanvas.tsx`: the `heavySummaries` slot removed.
- `frontend/src/components/FileDetail/inspector/` (`tabs.ts`, `InspectorShell`): the
  `document-side` tabs' place; the selection readable by the shell during render
  (controlled or lifted state, not an `onSelect` effect).
- `frontend/src/components/InspectorPane.tsx`, `FileDetailShell.tsx`, `globals.css`:
  `data-inspector-wide` and the width rule in `beside`.
- `frontend/src/lib/layoutSizes.ts`: `INSPECTOR_WIDE_SHARE = 0.4`,
  `INSPECTOR_WIDE_MIN_REM = 32`.
- `addons/intelligence/manifest.json`: `detailed-summary` in `document-side` with
  `i18n_key` `intelligence.slots.detailedSummary`, `wide: true` (the component is already
  mapped in `frontend/slots.ts`). `addons/intelligence/frontend/DetailedSummarySection.tsx`
  and `CitationInlinePanel.tsx`: call `openInViewer` before navigating; call `select()`
  when its AI-menu action starts generation; honour `active`. The add-on PR merges first;
  core bumps the gitlink.
- `DESIGN.md`: §"A floor under the canvas viewer" becomes the fill rule; the inspector
  section gains the wide pane.
- Docs: `docs/user-guide/viewers-and-players.md` (~27, where the detailed summary is on a
  document page); `docs/addons/intelligence.md` (~804, "On a file without a player,
  Detailed summary is a tab in the inspector"); `docs/addons/knowledge.md` (~199, the
  summary note is in Info on a file without a player); `docs/ADDON-DEVELOPMENT.md`: the
  `document-side` slot and its contract, the `file-detail-sections` row (~823), the
  per-add-on slot table (~1754), and an *Extension-point changes* row (a new slot; the
  placement of `file-detail-sections` ids that are also in `document-side`).
- Tests changed or removed, each replaced by the invariant named:
  - `frontend/src/components/FileDetail/hooks/__tests__/useCanvasFloor.test.tsx`: removed
    with the hook (I1).
  - `frontend/src/lib/__tests__/fileDetailShell.test.ts`: the `viewerTakesCanvasFloor`
    block removed (I1).
  - `frontend/src/components/archive/__tests__/archiveJustifiedCells.test.tsx`: the floor
    assertions re-pinned to the fill (I1).
  - `ViewerShell.test.tsx`: the `main[data-canvas-floor]` assertions removed (I1).
  - `frontend/src/__tests__/i18n-keys.test.ts`: `document-side` added to `TAB_SLOTS`.
  - `addons/intelligence/tests/test_manifest_navigation.py`,
    `addons/intelligence/frontend/ScenesSection/__tests__/WorkbenchManifest.test.ts`: the
    new slot list.
  - New: `frontend/e2e-components/document-summary-inspector-desktop.spec.ts`; existing
    specs that find the summaries in the canvas for a file without a player re-pinned to
    the inspector (I2).

## Invariants

I1. On a file page, for a PDF, an EPUB and an archive, at 1440×900 and 1280×800, in the
`beside` and `overlay` forms, in focus mode and with the find bar open, the filled
viewer's bottom edge is within 1px of the canvas's content bottom (its inner bottom less
its padding and, for the archive, the host's 16px), and the canvas's `scrollHeight`
equals its `clientHeight`; on the collection route the PDF page area, the EPUB reader and
the archive viewer keep today's heights.
I2. On the file page of a file without a player, no element of the summary note or of any
`document-side` entry is inside `main`, in any form; the summary note, when present, is
the last block of `#inspector-panel-info` before the comments; nothing in Info links to
the detailed summary; each is mounted at most once.
I3. A `document-side` entry is an inspector tab exactly when it has reported available,
labelled from its `i18n_key`, after Find and Pages and before Related, sorted by priority
among its slot, and its id is not drawn from `file-detail-sections` on such a file.
I4. In `beside` with the inspector open, the pane is `max(round(0.4 × row), 512)`px wide
(±1px) while a `wide` `document-side` tab is selected and 384px otherwise, the canvas plus
the pane equals the row, the width is right in the first frame after the selection
changes, and the pane's computed `transition` includes no width.
I5. In `overlay`, on a phone, for a player file and on a `MarkdownDocumentLayout` page the
pane's width does not change with the selected tab.
I6. Each event in §3's table gives the width its row states, in the first frame after it.
I7. A tab change, a width change and a jump in place leave the same filled-viewer element
mounted (the same PDF page-area element, the same EPUB iframe).
I8. On a file page, a citation's jump in the detailed summary tab to a page or section of
the open file calls `goTo` with that location and leaves `location.pathname` and
`location.search` unchanged; on a phone it also lowers the sheet; to another file, or
with no controller, and on the collection route, it navigates to `/files/{id}?page=` /
`?section=` as today.
I9. `MarkdownDocumentLayout` files keep today's placement of every summary in every form
and get no `document-side` tab; player files keep theirs.
I10. A `document-side` entry receives `active: true` only while its tab is selected; the
detailed summary does not act on `v` while another tab is selected.
I11. Starting a detailed summary from the AI button on a file without a player selects its
tab.
I12. Nothing in this change writes `localStorage` or `sessionStorage`.

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
  accepted to lose polling and an unsaved edit on close.
- Restoring the detailed summary tab on reopening the inspector (owner): today's reset to
  Info stays.
- Core naming `detailed-summary` for the new tab (owner): the `document-side` slot carries
  it, so core adds no add-on id; the two existing names stay on the Markdown path only.
- `inspector-tabs` with extra fields instead of a new slot (owner): its tabs appear on
  every file, so on a player file the detailed summary would be both a panel and a tab;
  `document-side` mirrors `player-side` for files without a player.
- Widening in `overlay` (owner): the pane would cover nearly all of a narrow canvas and a
  jump would move a page nobody can see; the pane stays 384px and stays open on a jump.
- In-place jumps on the collection route (owner): the summary is under the viewer there
  and the viewer is usually scrolled away; it keeps navigating.
- A heading or model line inside the tab beyond what a player file's tab shows (owner).
- A stale `?page=` after a jump (owner): accepted.
- The stacked form: `useInspectorFit` gives it to player files only.
- The dormant detailed summary (a summary note is active): the add-on reports
  availability as it does on a player file today; core shows what it reports.
- A preview-actions row (`file-preview-actions`) is empty today; when an add-on fills it
  the filled viewer ends above it, which `useFillHeight` measures.
- Text previews, Office excerpts, images and Markdown without the editor keep their own
  heights; their canvas may scroll as today. Only the summaries move for them.
- The tab body's 16px and the wide widths at the §9 sizes are checked by the design check
  and R-5 as well as by I4; the manifest-to-`SlotEntry` path for `wide` is checked by R-5
  on the real add-on (the e2e fixture stubs slots).
