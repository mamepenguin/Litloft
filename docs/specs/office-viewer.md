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
Litloft's own code is limited to loading, sizing, falling back, and keeping the
library's side effects (window listeners, a global stylesheet) from reaching the rest of
the app. When the library cannot draw a file, the page falls back to today's panel.
PowerPoint and the legacy `.doc` / `.xls` / `.ppt` formats keep today's panel.

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

Facts read from the library sources (`@js-preview/excel` 1.7.14,
`docx-preview` 0.4.1) that the design depends on:

- x-data-spreadsheet binds `keydown` (twice), `click`, `copy`, `paste` and `resize` on
  `window` and never removes them (one `keydown` belongs to a modal and is removed when it closes). The grid's handlers act only while its `focusing`
  flag is true; a click on the grid sets it, a `window` click outside the grid clears
  it. While set, `paste` and `copy` are `preventDefault`ed and keys are handled by the
  grid.
- The grid takes its size from its wrapper element when it draws (300 px tall when the
  wrapper has no height) and redraws only on a `window` `resize`.
- The stylesheet holds three unscoped rules, `form fieldset`, `form fieldset label` and
  `form fieldset select` (border, label display, margin, size, colour). Litloft's setup
  wizard, and settings sections of the intelligence, knowledge and media_import addons,
  draw `<fieldset>` inside forms.
- `docx-preview` reads pictures only from the document package and turns an external
  hyperlink into an `<a href>` without a `target`. Neither library fetches a URL named
  inside a document.

## Required items

### 1. Normal flow

1. The viewer opens a file page whose `mime_type` is
   `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (Word) or
   `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (Excel), whose
   `file_size` is at most 20 MB (`OFFICE_PREVIEW_MAX_BYTES`, the cap the excerpt already
   uses) and which is not missing.
2. `FilePreview` renders the Office viewer (`components/office/`), a component in the
   normal bundle that draws the frame and the loading state. Inside an effect it imports
   its library with a dynamic `import()` (for Excel, the stylesheet with it), so the
   library never runs during server rendering and is not in any route's first load.
3. From the first paint the frame has its final height: the file page canvas height
   when `fillCanvas`, 80vh otherwise, the PDF viewer's rule. Until the drawing is done
   the frame shows one loading look throughout (module, fetch and drawing): the PDF
   viewer's pulse block (`animate-pulse rounded-xl bg-bg-card`), filling the frame.
4. The viewer fetches `getStreamUrl(file.id)` with `credentials: "include"` and reads the
   body as an `ArrayBuffer`.
5. Word: `docx-preview`'s `renderAsync` draws the document's pages into the frame.
   External hyperlinks in the drawing open in a new tab (`target="_blank"`,
   `rel="noopener noreferrer"`), as EPUB links do; links within the document are left
   as drawn. Excel: `@js-preview/excel`'s `init(container)` then `preview(buffer)` draws
   the workbook with one tab per sheet, starting on the first sheet.
6. The drawing scrolls inside the frame; the frame never grows to its content. The Excel
   grid fills the frame's current size, and follows it when the frame changes size
   without a window resize (the inspector opening or closing, the first height
   measurement, a split change).
7. The rest of the page is unchanged: the header, the `⋮` menu with **Download**, the
   inspector, comments and the previous / next buttons.

### 2. Failure cases

| Where | What happens |
|---|---|
| The fetch fails, answers non-2xx (missing file 410, locked drive 404) or is aborted by something other than leaving the file | Today's fallback: the **No preview** panel with **Download** and **Open in new tab**, and `OfficeExcerpt` under it |
| The library module or the stylesheet fails to load | Today's fallback |
| The library rejects or throws while drawing (corrupt file, a structure it cannot read) | Today's fallback; whatever it drew so far is removed |
| The library throws later, inside its own event handler (a tab click, a scroll) | Not caught: the error reaches the console and the drawing stays as it is. The viewer does not switch to the fallback |
| The library draws without error but differs from Word / Excel | Shown as drawn. Not a failure (see *Checked, no action*) |
| The library never settles | The loading look stays. No timeout (see *Checked, no action*) |
| The file page moves to another file while a load is pending | The pending fetch is aborted; a result that arrives anyway is discarded |

### 3. States

The viewer's identity is the file's `id`, `file_size` and `modified_at` together.

- `loading` → `shown` when the library finishes drawing.
- `loading` → `failed` on any failure in §2 that leads to the fallback; `failed` renders
  today's fallback panel and excerpt.
- Any state → `loading` for the new identity when the identity changes (another file, or
  the same file overwritten with new bytes, size or modification time). The previous
  drawing is removed before anything of the new one is drawn.
- Any state → today's fallback, without a fetch, when the file becomes missing
  (`missing_since` set by the `files.missing` event) or its size grows past 20 MB: the
  branch that chooses the viewer stops choosing it, as for a file that was so from the
  start.

Not allowed:

- `failed` → `loading` or `shown` for the same identity within one mount. A later visit
  to the file (a new mount) tries again.
- `shown` → `loading` while the identity is unchanged (a parent re-render, an inspector
  toggle, a resize do not reload or redraw from the file).
- `shown` → `failed` (see the row for errors inside the library's handlers).

Files that never get a viewer (other mimes, over 20 MB, missing) render today's fallback
directly and never enter `loading`.

### 4. Data read and written

- Read: the file's bytes, through the existing stream endpoint, once per identity.
- Written: nothing. No DB row, no cache, no file, no `localStorage`. The Excel viewer is
  read-only; nothing typed, pasted, cut or deleted in it changes a cell or is sent.

### 5. External services

None. Both libraries are npm dependencies bundled by the frontend build and served by
Litloft; no CDN, no font or worker fetched from outside. Neither library fetches a URL
named inside a document (see the facts in *Summary*); a link is followed only when the
viewer clicks it.

### 6. Authorization

Unchanged. The stream endpoint already applies drive access control; a locked drive
answers 404 and the viewer falls back (§2).

### 7. Effect on existing features

- `OfficeExcerpt` and `GET /api/files/{id}/preview-text` stay. For `.docx` / `.xlsx` the
  excerpt is now drawn only in the fallback, so its request starts only after the viewer
  has failed, once per failure; `.pptx` keeps it as today.
- Card excerpts (`TextThumbnail`, `lib/textExcerpt.ts`), thumbnails, search indexing and
  `read_document` are unchanged.
- `lib/officeFiles.ts` stays the only file that spells an OOXML mime. It gains the
  exports the viewer branch and `useFileNav` read (which mimes have a viewer, the Excel
  mime); `useFileNav`'s `PAGED_MIMES` takes the Excel mime from there, so ← / → on an
  Excel page no longer change file. Word pages keep ← / → for changing file.
- On an Excel page, before the grid is clicked, ← / → do nothing; after a click they move
  the selected cell. The user guide says so.
- Find in this file (intelligence) still lists Office hits with no place to go.
- The PDF / EPUB viewers, `isDocumentViewer` and the document shell are not touched.
- Forms with `<fieldset>` (setup wizard, addon settings) look the same whether or not an
  Excel page was opened earlier in the session (I12).

### 8. Error behavior

The viewer shows today's fallback panel; no new error text, no toast. A failure that
leads to the fallback is logged once with `console.warn` naming the file id and the
error, so a file that always falls back can be told apart from one that never tried.

### 9. User-visible behavior

- A `.docx` page shows the document as pages on the library's grey background, scrolled
  inside the frame. On a phone the page is wider than the screen and scrolls sideways
  inside the frame.
- A `.xlsx` page shows a spreadsheet grid with row and column headings and sheet tabs at
  the bottom. Clicking a tab shows that sheet. Cells can be selected and copied but not
  changed. On a phone the grid scrolls by touch inside the frame (the library's own
  handling); the page header, the previous / next buttons and the inspector sheet stay
  reachable outside the frame.
- Both appear after the loading look; a large workbook takes seconds.
- With the grid clicked on an Excel page, the app's shortcuts (`t`, `?`, `n`, `Ctrl/Cmd+F`,
  `Ctrl/Cmd+K`, `Ctrl/Cmd+\`, `Esc`) still work. Once focus moves outside the grid, by a
  click or by Tab, keys, paste and copy go where focus is, as on any page.
- Limits the library has and Litloft keeps (not exhaustive): in Excel, text that
  overflows into an empty neighbour cell is cut at its own cell; with many sheets the
  tabs wrap and can run past the frame; shapes drawn in Excel (boxes, arrows) and charts
  are not shown; cell text cannot be selected as text; dates and numbers follow the
  library's formatting. In Word, layout can differ from Word where the library differs.
- `.pptx`, `.doc`, `.xls`, `.ppt`, files over 20 MB and missing files look exactly as
  today.
- The frame carries the accessible name `file.officeViewer` ("Document" / 「文書」).
- `docs/user-guide/viewers-and-players.md` (*Office files*), `docs/user-guide/overview.md`
  (the Office line) and `docs/user-guide/keyboard-shortcuts.md` (← / → on Excel pages)
  say so.

### 10. Non-functional

- Bundle: neither library, nor the Excel stylesheet, is part of any route's first load.
  Measured in the trial build: `docx-preview` about 50 KB gzip, `@js-preview/excel` about
  500 KB gzip, each its own chunk.
- Size: the 20 MB cap bounds what the browser downloads and parses.
- Time: no limit beyond the library's own; the loading look covers it.
- Privacy: the file never leaves the home LAN; no third-party fetch (§5).
- Licences: `docx-preview` Apache-2.0, `@js-preview/excel` MIT.

## Touch points

- `frontend/package.json`, `frontend/pnpm-lock.yaml`: add `docx-preview` 0.4.1 and
  `@js-preview/excel` 1.7.14, exact versions.
- `frontend/src/components/FilePreview.tsx`: a branch for the two mimes before the
  fallback, rendering the viewer; the fallback branch (EmptyState + `OfficeExcerpt`) is
  what the viewer's `failed` state renders.
- `frontend/src/components/office/` (new): the frame, the Word and Excel adapters, the
  shared loading / fetch / fallback handling, and the containment of the Excel library's
  window listeners and unscoped stylesheet rules.
- `frontend/src/lib/officeFiles.ts`: new exports for which mimes have a viewer and for
  the Excel mime, sharing `OFFICE_PREVIEW_MAX_BYTES`.
- `frontend/src/hooks/useFileNav.ts`: `PAGED_MIMES` gains the Excel mime, imported from
  `lib/officeFiles.ts`, never spelled out.
- `frontend/src/__tests__/officeMimes.test.ts`: the expected importer list of
  `@/lib/officeFiles` grows by exactly the new importers (`FilePreview.tsx` or the
  `components/office/` file that tests the mime, and `hooks/useFileNav.ts`). The "written
  down once" check is unchanged and must still pass.
- `frontend/src/components/__tests__/FilePreview.test.tsx`: the test "puts the extracted
  text under the panel that says there is no preview" keeps its assertions and moves its
  fixture from `.xlsx` to `.pptx`, which still gets the panel. The `.xlsx` case is
  covered by the new tests.
- `frontend/src/messages-core/en.json`, `ja.json`: `file.officeViewer`.
- New tests under `frontend/src/` for the invariants that do not need the libraries'
  drawing (see *Checked, no action*, Tests).
- `docs/user-guide/viewers-and-players.md`, `docs/user-guide/overview.md`,
  `docs/user-guide/keyboard-shortcuts.md`.
- Rules passed through: `.claude/rules/frontend-conventions.md` (Next 16, i18n in
  `messages-core`), `DESIGN.md` for the loading look.
- No protected path. No backend, addon, Dockerfile, workflow or `process/` change.

## Invariants

I1. A Word file at or under 20 MB that is not missing shows the document drawn by `docx-preview` in the file page, and the **No preview** panel is not rendered. (SPEC-CORE-029)
I2. An Excel file at or under 20 MB that is not missing shows the workbook drawn by `@js-preview/excel` with its sheet tabs, and the **No preview** panel is not rendered. (SPEC-CORE-155)
I3. When the fetch fails or answers non-2xx, the library module or stylesheet fails to load, or the library rejects or throws while drawing, the page shows the **No preview** panel with **Download**, **Open in new tab** and the text excerpt, nothing the library drew remains, and the failure is logged once with `console.warn` naming the file id.
I4. A `.pptx`, `.doc`, `.xls` or `.ppt` file, an Office file over 20 MB and a missing Office file render the **No preview** panel as today, without requesting the file's stream or either library; a shown Office file that becomes missing or grows past 20 MB switches to that panel.
I5. A page that is not a Word or Excel file page (a video, a PDF, a folder) requests neither library's code nor the Excel stylesheet.
I6. After the viewer's identity changes (another file, or the same file with a new size or modification time), nothing of the previous drawing is visible at any point, and a fetch or drawing for the previous identity that completes later changes nothing on the page.
I7. On an Excel file page, ← and → do not change file, and the previous / next buttons still do; on a Word file page ← and → still change file.
I8. After leaving an Excel file page, by any means and whether or not the grid was clicked, keys, paste, copy and clicks on the next page behave as they would had the Excel page never been opened.
I9. On an Excel file page, once focus is outside the grid (moved by a click or by Tab), keys and paste reach the focused element unchanged, and the app shortcuts fire with the grid clicked or not.
I10. The viewer itself makes no request other than the stream GET and the library and stylesheet chunks; `/preview-text` is requested only in the fallback. No keyboard or clipboard action in the Excel grid (typing, Delete, Backspace, cut, paste, undo, redo) changes what any cell shows.
I11. The frame's height is the canvas height when `fillCanvas` and 80vh otherwise from its first paint, the drawing scrolls inside the frame, and the Excel grid fills the frame after every change in the frame's size, including ones without a window resize.
I12. Forms with a `<fieldset>` look the same after an Excel page has been opened in the session as before it.

## Checked, no action

- **Fidelity.** No invariant compares the drawing to Word or Excel, and no Litloft code
  adjusts it. Text cut at the cell edge, wrapping sheet tabs, missing shapes and charts,
  number formats, uncopyable cell text and Word layout differences are the library's and
  stay. A file that looks wrong can still be downloaded from the `⋮` menu.
- **Tests.** The libraries' drawing is not tested in CI: no golden screenshot, no e2e
  that renders a real document. CI tests cover only Litloft's side, with the libraries
  mocked: which file gets which viewer at 20 MB and 20 MB + 1 (I1, I2, I4), the fallback
  for each failure (I3), identity changes (I6), the arrow keys (I7) and the viewer's
  requests (I10, first sentence). The rest needs the real libraries in a real browser
  and is R-5's, at 1280px and 390px:
  - I5: the network panel on a video page and a PDF page, and the build's chunk list.
  - I8, I9: click the grid, then leave by the previous / next button, by a keyboard
    shortcut and by browser back; and, staying, Tab into the comment field. Type, paste
    and press the shortcuts each time.
  - I10, second sentence: the editing keys and clipboard actions on a clicked cell.
  - I11: the frame's box against the canvas, the page not scrolling while the drawing
    does, and the grid's size after opening and closing the inspector.
  - I12: the setup or settings page's fieldset before and after opening an Excel page.
  - Excel on a phone (390px): the grid scrolls by touch, and the header, the previous /
    next buttons and the inspector sheet are reachable.
- **Why I8, I9 and I12 exist.** They are the library's side effects (see *Summary*), not
  its drawing. How the viewer contains them (clearing the grid's focus when focus leaves
  it or the viewer unmounts, scoping or rewriting the three rules, or anything else) is
  the implementation's choice; the invariants are the observable results. This is the
  one place Litloft writes code around the library rather than calling it.
- **No timeout.** A library that never settles leaves the loading look. The trial's
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
- **Scripts in documents.** Neither library runs macros. The files are the owner's own,
  under the personal-tool threat model.
- **No design artifact.** The change draws no Litloft chrome of its own beyond the
  frame and the loading look copied from the PDF viewer; everything inside the frame is
  the library's.
- **`isDocumentViewer` / document shell.** Not extended; the viewers sit in the canvas as
  the fallback panel does today. R-5 looks at the margin; a change there is a later
  decision.
- **Dependency age.** `@js-preview/excel` (Dec 2024) bundles ExcelJS (Dec 2024) and
  x-data-spreadsheet (May 2022). Accepted by the owner: the viewer is one component
  behind a fallback and can be replaced alone.
- **The iOS app's web view** gets the viewers like any browser; nothing iOS-specific.
