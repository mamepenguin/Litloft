# Office viewer: Word and Excel files shown in the browser

SPEC-ID: SPEC-CORE-029
SPEC-ID: SPEC-CORE-155

Approval:

## Summary

A `.docx` or `.xlsx` file page today shows the **No preview** panel with **Download**,
**Open in new tab** and the first lines of the document's text (`OfficeExcerpt`). This
change shows the document itself in the browser instead: Word files through the
`docx-preview` library (SPEC-CORE-029), Excel files through the `@js-preview/excel`
library (SPEC-CORE-155). Nothing runs on the server; the browser downloads the file
through the existing stream endpoint and the library draws it. The libraries are loaded
only when such a file is shown, the way the PDF and EPUB viewers already are.

What is shown is whatever the library draws. Litloft does not correct or extend the
drawing: a difference from Word or Excel that the library has is accepted, not fixed.
When the library cannot draw a file, the page falls back to today's panel. PowerPoint
and the legacy `.doc` / `.xls` / `.ppt` formats keep today's panel.

It is for the owner reading their own Word and Excel documents (specifications, design
sheets, estimates) on the file page without downloading them. Production holds a handful
of such files; the design documents on the development machine are the realistic case.

The libraries were tried on six real files before this spec (three `.docx`, three
`.xlsx`, up to 6.7 MB and 28 sheets): `docx-preview` 0.4.1 drew pages close to Word in
under 60 ms; `@js-preview/excel` 1.7.14 drew cell borders, fills, merged cells and
embedded pictures, and took about 5 s on the 6.7 MB workbook. `@js-preview/excel` draws
nothing unless its stylesheet (`@js-preview/excel/lib/index.css`) is loaded. Its last
release is December 2024 and it bundles ExcelJS and x-data-spreadsheet; both newer
alternatives tried (ExcelJS with a hand-written renderer, Univer with a community
importer) were rejected, the first for the code Litloft would own, the second for size
(about 2.3 MB gzip) and a 103 s load on the same workbook.

## Required items

### 1. Normal flow

1. The viewer opens a file page whose `mime_type` is
   `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (Word) or
   `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (Excel), whose
   `file_size` is at most 20 MB (`OFFICE_PREVIEW_MAX_BYTES`, the cap the excerpt already
   uses) and which is not missing.
2. `FilePreview` renders the Office viewer for that kind. The viewer component is loaded
   with `next/dynamic` and `ssr: false`, like `PdfPreview` and `EpubPreview`, and it in
   turn imports its library (and, for Excel, the library's stylesheet). While the module,
   the file and the drawing are pending, the viewer shows a loading frame like the PDF
   viewer's.
3. The viewer fetches `getStreamUrl(file.id)` with `credentials: "include"` and reads the
   body as an `ArrayBuffer`.
4. Word: `docx-preview`'s `renderAsync` draws the document's pages into the viewer's
   container. Excel: `@js-preview/excel`'s `init(container)` then `preview(buffer)` draws
   the workbook with one tab per sheet, starting on the first sheet.
5. The viewer sits in a frame with the PDF viewer's height rule (the file page canvas
   when `fillCanvas`, 80vh otherwise, as the PDF viewer) and scrolls inside it.
6. The rest of the page is unchanged: the header, the `⋮` menu with **Download**, the
   inspector, comments and the previous / next buttons.

### 2. Failure cases

| Where | What happens |
|---|---|
| The fetch fails, answers non-2xx (missing file 410, locked drive 404) or is aborted | Today's fallback: the **No preview** panel with **Download** and **Open in new tab**, and `OfficeExcerpt` under it |
| The library module fails to load (network, chunk error) | Today's fallback |
| The library rejects or throws while drawing (corrupt file, a structure it cannot read) | Today's fallback; whatever it drew so far is removed |
| The library draws without error but differs from Word / Excel | Shown as drawn. Not a failure (see *Checked, no action*) |
| The library never settles | The loading frame stays. No timeout (see *Checked, no action*) |
| The file page moves to another file while a load is pending | The pending fetch is aborted; a result that arrives anyway is discarded |

### 3. States

Per mounted viewer, keyed by file id:

- `loading` → `shown` when the library finishes drawing.
- `loading` → `failed` on any failure in §2; `failed` renders today's fallback.
- Any state → `loading` (for the new file) when the file id changes; the previous file's
  drawing is removed before anything of the new file is drawn.

Files that never get a viewer (other mimes, over 20 MB, missing) render today's fallback
directly and never enter `loading`.

### 4. Data read and written

- Read: the file's bytes, through the existing stream endpoint, once per mount.
- Written: nothing. No DB row, no cache, no file, no `localStorage`. The Excel viewer is
  read-only; nothing typed into it is kept or sent.

### 5. External services

None. Both libraries are npm dependencies bundled by the frontend build and served by
Litloft; no CDN, no font or worker fetched from outside.

### 6. Authorization

Unchanged. The stream endpoint already applies drive access control; a locked drive
answers 404 and the viewer falls back (§2).

### 7. Effect on existing features

- `OfficeExcerpt` and `GET /api/files/{id}/preview-text` stay. The excerpt is now drawn
  only in the fallback for `.docx` / `.xlsx`, and as today for `.pptx`.
- Card excerpts (`TextThumbnail`, `lib/textExcerpt.ts`), thumbnails, search indexing and
  `read_document` are unchanged.
- `useFileNav`'s `PAGED_MIMES` gains the Excel mime, so ← / → on an Excel page no longer
  change file (the spreadsheet uses them to move the selected cell). Word pages keep ← /
  → for changing file.
- Find in this file (intelligence) still lists Office hits with no place to go.
- The PDF / EPUB viewers, `isDocumentViewer` and the document shell are not touched.

### 8. Error behavior

The viewer shows today's fallback panel; no new error text, no toast. A failure is
logged once with `console.warn` naming the file id and the error, so a file that always
falls back can be told apart from one that never tried.

### 9. User-visible behavior

- A `.docx` page shows the document as pages on the library's grey background, scrolled
  inside the frame. On a phone the page is wider than the screen and scrolls sideways
  inside the frame.
- A `.xlsx` page shows a spreadsheet grid with row and column headings and sheet tabs at
  the bottom. Clicking a tab shows that sheet. Cells can be selected but not edited.
- Both appear after a loading frame; a large workbook takes seconds.
- Limits the library has and Litloft keeps (not exhaustive): in Excel, text that
  overflows into an empty neighbour cell is cut at its own cell; with many sheets the
  tabs wrap and can run past the frame; shapes drawn in Excel (boxes, arrows) and charts
  are not shown; cell text cannot be selected or copied; dates and numbers follow the
  library's formatting. In Word, layout can differ from Word where the library differs.
- `.pptx`, `.doc`, `.xls`, `.ppt`, files over 20 MB and missing files look exactly as
  today.
- `docs/user-guide/viewers-and-players.md` (*Office files*) and
  `docs/user-guide/keyboard-shortcuts.md` (← / → on Excel pages) say so.

### 10. Non-functional

- Bundle: neither library, nor the Excel stylesheet, is part of any route's first load.
  Measured in the trial build: `docx-preview` about 50 KB gzip, `@js-preview/excel` about
  500 KB gzip, each its own chunk.
- Size: the 20 MB cap bounds what the browser downloads and parses.
- Time: no limit beyond the library's own; the loading frame covers it.
- Privacy: the file never leaves the home LAN; no third-party fetch (§5).
- Licences: `docx-preview` Apache-2.0, `@js-preview/excel` MIT.

## Touch points

- `frontend/package.json`, `frontend/pnpm-lock.yaml`: add `docx-preview` 0.4.1 and
  `@js-preview/excel` 1.7.14, exact versions.
- `frontend/src/components/FilePreview.tsx`: a branch for the two mimes before the
  fallback, rendering the dynamically loaded viewer; the fallback branch (EmptyState +
  `OfficeExcerpt`) is reused for the viewer's `failed` state.
- `frontend/src/components/office/` (new): the Word viewer, the Excel viewer and their
  shared loading / fetch / fallback handling.
- `frontend/src/lib/officeFiles.ts`: which mimes have a viewer, sharing
  `OFFICE_PREVIEW_MAX_BYTES`.
- `frontend/src/hooks/useFileNav.ts`: `PAGED_MIMES` gains the Excel mime.
- `frontend/src/messages-core/en.json`, `ja.json`: an accessible name for the viewer
  frame, if one is added.
- Tests under `frontend/src/` for the invariants below that do not need the libraries'
  drawing (see *Checked, no action*, Tests).
- `docs/user-guide/viewers-and-players.md`, `docs/user-guide/keyboard-shortcuts.md`.
- Rules passed through: `.claude/rules/frontend-conventions.md` (Next 16, i18n in
  `messages-core`), `DESIGN.md` for the loading frame.
- No protected path. No backend, addon, Dockerfile, workflow or `process/` change.

## Invariants

I1. A Word file at or under 20 MB that is not missing shows the document drawn by `docx-preview` in the file page, and the **No preview** panel is not rendered. (SPEC-CORE-029)
I2. An Excel file at or under 20 MB that is not missing shows the workbook drawn by `@js-preview/excel` with its sheet tabs, and the **No preview** panel is not rendered. (SPEC-CORE-155)
I3. When the fetch fails or answers non-2xx, the library module fails to load, or the library rejects or throws, the page shows the **No preview** panel with **Download**, **Open in new tab** and the text excerpt, and nothing the library drew remains.
I4. A `.pptx`, `.doc`, `.xls` or `.ppt` file, an Office file over 20 MB and a missing Office file render the **No preview** panel as today, without requesting the file's stream or either library.
I5. A page that shows no Word or Excel viewer (a video, a PDF, a folder, a `.pptx`) requests neither library's code nor the Excel stylesheet.
I6. After the file page moves from one Office file to another, nothing of the previous file's drawing is visible at any point, and a fetch or drawing for the previous file that completes later changes nothing on the page.
I7. On an Excel file page, ← and → do not change file, and the previous / next buttons still do; on a Word file page ← and → still change file.
I8. After leaving an Excel file page for another page, keys pressed there (typing in a field, arrows on a video, shortcuts) reach that page as they would had the Excel page never been opened.
I9. Opening and using either viewer writes nothing: no request other than the stream GET and the library and stylesheet chunks, and typing into an Excel cell does not change what the cell shows.

## Checked, no action

- **Fidelity.** No invariant compares the drawing to Word or Excel, and no Litloft code
  adjusts it. Text cut at the cell edge, wrapping sheet tabs, missing shapes and charts,
  number formats, uncopyable cell text and Word layout differences are the library's and
  stay. A file that looks wrong can still be downloaded from the `⋮` menu.
- **Tests.** The libraries' drawing is not tested in CI: no golden screenshot, no e2e
  that renders a real document. Tests cover only Litloft's side, with the libraries
  mocked: which mime gets which viewer (I1, I2, I4), the fallback on each failure (I3),
  the file switch (I6) and the arrow keys (I7). I5 is checked by R-5 in the running app
  (network panel on a video and a PDF page) and by the build's chunk list; I8 by R-5 in
  a real browser, because it is the library's window listeners that cause it (below).
- **Why I8 exists.** x-data-spreadsheet, inside `@js-preview/excel`, adds `keydown` and
  `click` listeners on `window` and never removes them; its `destroy()` does not either.
  While its `focusing` flag is true (set by a click on the grid, cleared by a click
  outside it), its handler acts on every key. Leaving the page by keyboard after clicking
  the grid would leave a dead grid consuming keys. How the viewer prevents it is the
  implementation's choice; the invariant is the observable result.
- **No timeout.** A library that never settles leaves the loading frame. The trial's
  slowest file took 5 s; a timeout would turn a slow large workbook into a fallback.
- **The 20 MB cap.** Reused from the excerpt rather than chosen anew. A 20 MB workbook
  may take tens of seconds; the owner's files are far smaller.
- **PowerPoint.** No browser-only library drew `.pptx` acceptably enough to try; it keeps
  the panel. The legacy binary formats have no browser library at all.
- **Phone width.** Word pages keep their paper width and scroll sideways inside the
  frame. `docx-preview` has options that drop the page width; they change the document's
  look and are not used.
- **Dark theme.** Both libraries draw light documents on their own backgrounds in both
  themes, like a PDF page.
- **Links inside a Word document** behave as the library draws them; no rewriting to new
  tabs.
- **Scripts in documents.** Neither library runs macros. The files are the owner's own,
  under the personal-tool threat model.
- **No design artifact.** The change draws no Litloft chrome of its own beyond the
  loading frame copied from the PDF viewer; everything inside the frame is the library's.
- **`isDocumentViewer` / document shell.** Not extended; the viewers sit in the canvas as
  the fallback panel does today. R-5 looks at the margin; a change there is a later
  decision.
- **Dependency age.** `@js-preview/excel` (Dec 2024) bundles ExcelJS (Dec 2024) and
  x-data-spreadsheet (May 2022). Accepted by the owner: the viewer is one component
  behind a fallback and can be replaced alone.
