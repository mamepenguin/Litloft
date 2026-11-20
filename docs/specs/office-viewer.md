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
Litloft's own code is limited to loading, sizing, falling back, opening web links in a
new tab, and keeping the library's side effects (window listeners, a global stylesheet)
from reaching the rest of the app. When the library cannot draw a file, the page falls
back to today's panel. PowerPoint and the legacy `.doc` / `.xls` / `.ppt` formats keep
today's panel.

It is for the owner reading their own Word and Excel documents (specifications, design
sheets, estimates) without downloading them. Production holds a handful of such files;
the design documents on the development machine are the realistic case.

The libraries were tried on six real files before this spec (three `.docx`, three
`.xlsx`, up to 6.7 MB and 28 sheets): `docx-preview` 0.4.1 drew pages close to Word in
under 60 ms; `@js-preview/excel` 1.7.14 drew cell borders, fills, merged cells and
embedded pictures, and took about 5 s on the 6.7 MB workbook. `@js-preview/excel` draws
nothing unless its stylesheet (`@js-preview/excel/lib/index.css`) is loaded. Its last
release is December 2024 and it bundles ExcelJS and x-data-spreadsheet; both newer
alternatives tried (ExcelJS with a hand-written renderer, Univer with a community
importer) were rejected, the first for the code Litloft would own, the second for size
(about 2.3 MB gzip) and a 103 s load on the same workbook.

Facts read from the library sources (`@js-preview/excel` 1.7.14, `docx-preview` 0.4.1)
that the design depends on:

- x-data-spreadsheet binds `keydown`, `click`, `copy`, `paste` and `resize` on `window`
  and never removes them (one more `keydown` belongs to a modal and is removed when it
  closes). The grid's handlers act only while its `focusing` flag is true; a click on
  the grid sets it, a `window` click outside the grid clears it. While set, `paste` and
  `copy` are `preventDefault`ed and keys are handled by the grid.
- `@js-preview/excel` creates the grid with `mode: "read"` and `showToolbar: false`;
  in read mode x-data-spreadsheet's cell-text setter returns without changing the cell,
  and the sheet-tab context menu and "add sheet" do nothing.
- The grid takes its size from its wrapper element when it draws (300 px tall when the
  wrapper has no height) and redraws only on a `window` `resize`.
- Apart from its own `.x-spreadsheet*` classes, the stylesheet holds exactly three
  unscoped rules, `form fieldset`, `form fieldset label` and `form fieldset select`
  (border, label display, margin, size, colour). Litloft's setup wizard, and settings
  sections of the intelligence, knowledge and media_import addons, draw `<fieldset>`
  inside forms.
- `docx-preview` reads pictures only from the document package and turns a hyperlink
  into an `<a href>` without a `target`. Neither library fetches a URL named inside a
  document.

## Required items

### 1. Normal flow

1. A host draws `FilePreview` for a file whose `mime_type` is
   `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (Word) or
   `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (Excel), whose
   `file_size` is at most 20 MB (`OFFICE_PREVIEW_MAX_BYTES`, the cap the excerpt already
   uses) and which is not missing. `FilePreview` is drawn on two surfaces today, and
   "file page" below means either:
   - the canonical file page, `RightPaneFile` → `ShellLayout` → `MediaCanvas` with
     `fillCanvas`, shown in the folder's two-pane layout and full-width on the
     cross-folder routes; ← / → change file there through `useFileNav`;
   - the collection route `/files/{id}?collection=…`, `FileDetailFullScreen` →
     `FileDetailContent` → `FileDetailCanvas` without `fillCanvas`; `useFileNav` is
     disabled there, so ← / → never change file, for any kind.
2. `FilePreview` asks `lib/officeFiles.ts` which viewer the file gets and renders the
   Office viewer (`components/office/`), a component in the normal bundle that draws the
   frame and the loading look. Inside an effect it imports its library with a dynamic
   `import()` (for Excel, the stylesheet with it), so the library never runs during
   server rendering and is not in any route's first load.
3. The frame's height follows the PDF viewer's rule: with `fillCanvas`, the height
   `useFillHeight` gives it (the PDF viewer's measured fit); otherwise the whole frame is
   80vh (the PDF viewer's page box is 80vh under its toolbar; the Office frame has no
   toolbar, so it is not compared with the PDF frame on this path). Until the
   drawing is done the frame shows one loading look throughout (module, fetch and
   drawing): the PDF viewer's pulse block (`animate-pulse rounded-xl bg-bg-card`) filling
   the frame. The frame is the same element in loading and shown, so the drawing
   replaces the loading look in place.
4. The viewer fetches `getStreamUrl(file.id)` with `credentials: "include"` and reads the
   body as an `ArrayBuffer`. It starts on the file object it is given, which may be the
   list's copy the page shows first.
5. Word: `docx-preview`'s `renderAsync` draws the document's pages into the frame. Every
   drawn link whose `href` starts with `http://` or `https://` gets `target="_blank"` and
   `rel="noopener noreferrer"`, as EPUB links open apart from the page. Other links
   (`#bookmark`, `mailto:`, `file:`) are left as drawn. Excel: `@js-preview/excel`'s
   `init(container, { showContextmenu: false })` then `preview(buffer)` draws the
   workbook with one tab per sheet, starting on the first sheet.
6. The drawing scrolls inside the frame; the frame never grows to its content. The Excel
   grid fills the frame's current size, and follows it when the frame changes size
   without a window resize (the inspector opening or closing, a height measurement, a
   split change).
7. The rest of the page is unchanged: the header, the `⋮` menu with **Download**, the
   inspector and comments. On the canonical file page a Word or Excel file has no
   previous / next buttons today (they are drawn for pictures and the inbox walk only);
   ← / → are how a viewer steps to the next file there, and they stay so (§7).

### 2. Failure cases

| Where | What happens |
|---|---|
| The fetch fails, answers non-2xx (missing file 410, locked drive 404) or is aborted by something other than the viewer leaving the file | Today's fallback: the **No preview** panel with **Download** and **Open in new tab**, and `OfficeExcerpt` under it |
| The library module or the stylesheet fails to load | Today's fallback |
| The library rejects or throws while drawing (corrupt file, a structure it cannot read) | Today's fallback; whatever it drew so far is removed |
| The library throws later, inside its own event handler (a tab click, a scroll) | Not caught: the error reaches the console and the drawing stays as it is |
| The library draws without error but differs from Word / Excel | Shown as drawn. Not a failure (see *Checked, no action*) |
| The library never settles | The loading look stays. No timeout (see *Checked, no action*) |
| The viewer leaves the file (another identity, unmount) while a load is pending | The pending fetch is aborted, no warning is logged, and a result that arrives anyway is discarded |

### 3. States

One mounted viewer has an identity: the `id`, `file_size` and `modified_at` of the file
object it was last given.

- `loading` → `shown` when the library finishes drawing.
- `loading` → `failed` on any failure in §2 that leads to the fallback; `failed` renders
  today's fallback panel and excerpt.
- Any state → `loading` for the new identity when the identity changes. This happens
  when the host hands a file object with another `id` (← / →, a tree click, the inbox
  walk's buttons), or the same `id` with another `file_size` or `modified_at` (the page
  replaced the list's copy with the detail answer, or refetched after a tag, metadata
  or rename save and the file had changed). The previous drawing is removed before
  anything of the new one is drawn.

Not allowed:

- `failed` → `loading` or `shown` for the same identity within one mount. A later visit
  (a new mount) tries again.
- `shown` → `loading`, a new stream request or a redraw while the identity is unchanged:
  a parent re-render, a file object replaced with the same `id`, `file_size` and
  `modified_at`, an inspector toggle, a resize.
- `shown` → `failed` (see the row for errors inside the library's handlers).

There is no live update of an open page. No host subscribes to `files.missing` or a file
change event today, and this change adds none: a file that goes missing or is overwritten
while shown keeps its drawing until the page is opened again or refetches, at which point
the branch in §1.2 decides afresh. A host that hands a missing or over-20 MB file object
gets today's fallback with no fetch; if it later hands a file object the branch accepts,
that is a new mount and loads.

### 4. Data read and written

- Read: the file's bytes, through the existing stream endpoint, once per identity per
  mount.
- Written: nothing. No DB row, no cache, no file, no `localStorage`. The Excel viewer is
  read-only (I11).

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
  excerpt is drawn only in the fallback, so its request starts only after the viewer has
  failed; `.pptx` keeps it as today.
- Card excerpts (`TextThumbnail`, `lib/textExcerpt.ts`), thumbnails, search indexing and
  `read_document` are unchanged.
- `lib/officeFiles.ts` stays the only file that spells an OOXML mime. It gains an export
  that names the viewer a file gets (Word, Excel or none, from mime, size and missing).
  `FilePreview.tsx` imports it.
- ← / → on an Excel file. `PAGED_MIMES` is not changed. Instead the Excel grid is
  *active* from a click inside the grid until a click outside it, focus moving to an
  element outside the frame, or the viewer unmounting. While the grid is active, ← / →
  move the selected cell (the library's handling) and `useFileNav` does not change file;
  otherwise ← / → change file as they do today for every document. `useFileNav` learns
  of the active grid through a signal the Office viewer sets (`components/office/`),
  not through the mime. Word files, Excel files in the fallback and every other kind are
  unaffected. On the collection route ← / → change no file for any kind, as today.
- Find in this file (intelligence) still lists Office hits with no place to go.
- The PDF / EPUB viewers, `isDocumentViewer` and the document shell are not touched.
- Forms with `<fieldset>` (setup wizard, addon settings) look the same whether or not an
  Excel file was opened earlier in the session (I13).

### 8. Error behavior

The viewer shows today's fallback panel; no new error text, no toast. A failure that
leads to the fallback is logged once with `console.warn` naming the file id and the
error, so a file that always falls back can be told apart from one that never tried.

### 9. User-visible behavior

- The frame is a `role="region"` element named by `file.officeViewer` ("Document" /
  「文書」), in loading and shown alike.
- A `.docx` shows the document as pages on the library's grey background, scrolled
  inside the frame. On a phone the page is wider than the screen and scrolls sideways
  inside the frame. Web links open in a new tab; a link to a place in the document
  moves within it as the library draws it, and may change the page address's `#` part.
- A `.xlsx` shows a spreadsheet grid with row and column headings and sheet tabs at the
  bottom. Clicking a tab shows that sheet. Cells can be selected but not changed; what a
  copy from the grid puts on the clipboard is the library's and is not promised. Rows
  and columns can be resized by dragging their edge (a view change, kept only while the
  page is open). On a phone the grid scrolls by touch inside the frame (the library's
  own handling); the page header and the inspector sheet stay reachable outside the
  frame.
- Both appear after the loading look; a large workbook takes seconds.
- With the grid clicked, the app's shortcuts (`t`, `?`, `n`, `Ctrl/Cmd+F`,
  `Ctrl/Cmd+K`, `Ctrl/Cmd+\`, `Esc`) still work. Once focus is outside the grid, moved by
  a click or by a shortcut that focuses a field, keys and paste go where focus is, as on
  any page. What `Tab` does while the grid is clicked is the library's.
- Limits the library has and Litloft keeps (not exhaustive): in Excel, text that
  overflows into an empty neighbour cell is cut at its own cell; with many sheets the
  tabs wrap and can run past the frame; shapes drawn in Excel (boxes, arrows) and charts
  are not shown; cell text cannot be selected as text; dates and numbers follow the
  library's formatting. In Word, layout can differ from Word where the library differs.
- `.pptx`, `.doc`, `.xls`, `.ppt`, files over 20 MB and missing files look exactly as
  today.
- `docs/user-guide/viewers-and-players.md` (*Office files*), `docs/user-guide/overview.md`
  (the Office line) and `docs/user-guide/keyboard-shortcuts.md` (← / → on Excel files)
  say so.

### 10. Non-functional

- Bundle: neither library, nor the Excel stylesheet, is part of any route's first load.
  Measured in the trial build: `docx-preview` about 50 KB gzip, `@js-preview/excel` about
  500 KB gzip, each its own chunk.
- Size: the 20 MB cap bounds what the browser downloads and parses.
- Time: no limit beyond the library's own; the loading look covers it.
- Memory: on unmount the viewer removes its drawing and drops its references to the
  library instance and the file's bytes. The x-data-spreadsheet `window` listeners
  cannot be removed (the library keeps no handle to them), so each Excel file opened
  leaves its listeners, and whatever they hold, until the page is reloaded. Accepted:
  the owner opens a few workbooks per session, and a reload clears it.
- Privacy: the file never leaves the home LAN; no third-party fetch (§5).
- Licences: `docx-preview` Apache-2.0, `@js-preview/excel` MIT.

## Touch points

- `frontend/package.json`, `frontend/pnpm-lock.yaml`: add `docx-preview` 0.4.1 and
  `@js-preview/excel` 1.7.14, exact versions.
- `frontend/src/components/FilePreview.tsx`: a branch for the viewer, chosen by the new
  `lib/officeFiles.ts` export, before the fallback; the fallback branch (EmptyState +
  `OfficeExcerpt`) is what the viewer's `failed` state renders.
- `frontend/src/components/office/` (new): the frame, the Word and Excel adapters, the
  shared loading / fetch / fallback handling, the Word link rewrite, and the containment
  of the Excel library's window listeners and unscoped stylesheet rules. It does not
  import `@/lib/officeFiles`.
- `frontend/src/lib/officeFiles.ts`: the export naming a file's viewer, sharing
  `OFFICE_PREVIEW_MAX_BYTES`.
- `frontend/src/hooks/useFileNav.ts`: ← / → do not change file while an Excel grid is
  active, read from the Office viewer's signal. `PAGED_MIMES` is unchanged, and the
  file does not import `@/lib/officeFiles`.
- `frontend/src/__tests__/officeMimes.test.ts`: the expected importer list of
  `@/lib/officeFiles` becomes exactly `frontend/src/components/FilePreview.tsx`,
  `frontend/src/components/OfficeExcerpt.tsx`, `frontend/src/components/TextThumbnail.tsx`,
  `frontend/src/lib/textExcerpt.ts`. The "written
  down once" check is unchanged and must still pass.
- `frontend/src/components/__tests__/FilePreview.test.tsx`: the test "puts the extracted
  text under the panel that says there is no preview" keeps its assertions and moves its
  fixture from `.xlsx` to `.pptx`, which still gets the panel. Any other existing test
  that renders the real `FilePreview` with a `.docx` or `.xlsx` fixture keeps its
  assertions and mocks the viewer's library and fetch.
- `frontend/src/messages-core/en.json`, `ja.json`: `file.officeViewer`.
- New tests under `frontend/src/` for the invariants that do not need the libraries'
  drawing (see *Checked, no action*, Tests).
- `docs/user-guide/viewers-and-players.md`, `docs/user-guide/overview.md`,
  `docs/user-guide/keyboard-shortcuts.md`.
- Rules passed through: `.claude/rules/frontend-conventions.md` (Next 16, i18n in
  `messages-core`), `DESIGN.md` for the loading look.
- No protected path. No backend, addon, Dockerfile, workflow or `process/` change.

## Invariants

I1. A Word file at or under 20 MB that is not missing shows the document drawn by `docx-preview` inside a region named 「文書」 / "Document", and the **No preview** panel is not rendered. (SPEC-CORE-029)
I2. An Excel file at or under 20 MB that is not missing shows the workbook drawn by `@js-preview/excel` with its sheet tabs inside a region named 「文書」 / "Document", and the **No preview** panel is not rendered. (SPEC-CORE-155)
I3. (SPEC-CORE-029, SPEC-CORE-155) When the fetch fails or answers non-2xx, the library module or stylesheet fails to load, or the library rejects or throws while drawing, the page shows the **No preview** panel with **Download**, **Open in new tab** and the text excerpt, nothing the library drew remains, and the failure is logged once with `console.warn` naming the file id.
I4. (SPEC-CORE-029, SPEC-CORE-155) A `.pptx`, `.doc`, `.xls` or `.ppt` file, an Office file over 20 MB and a missing Office file render the **No preview** panel as today, without requesting the file's stream or either library.
I5. (SPEC-CORE-029, SPEC-CORE-155) A page that shows no Word or Excel file (a video, a PDF, a folder) requests neither library's code nor the Excel stylesheet; a Word file requests neither `@js-preview/excel` nor its stylesheet, and an Excel file does not request `docx-preview`.
I6. (SPEC-CORE-029, SPEC-CORE-155) After the viewer's identity changes (`id`, `file_size` or `modified_at`), nothing of the previous drawing is visible at any point, and a fetch or drawing for the previous identity that completes later changes nothing on the page and logs nothing.
I7. (SPEC-CORE-029, SPEC-CORE-155) While the identity is unchanged (re-render, a file object replaced with equal `id`, `file_size` and `modified_at`, inspector toggle, resize), the viewer makes no new stream request and does not redraw; after `failed`, it makes no new stream request in the same mount.
I8. (SPEC-CORE-155) On the canonical file page, ← and → change file on an Excel file whose grid is not active (never clicked, or clicked outside since, or focus moved out of the frame) and do not change file while the grid is active; on a Word file, and on an Excel file in the fallback, ← and → change file as today.
I9. (SPEC-CORE-155) After leaving an Excel file, by any means and whether or not the grid was clicked, keys, paste, copy and clicks on the next page behave as they would had the Excel file never been opened.
I10. (SPEC-CORE-155) On an Excel file, once focus is outside the grid (moved by a click or by a shortcut that focuses a field), keys and paste reach the focused element unchanged, and the app shortcuts fire with the grid clicked or not.
I11. (SPEC-CORE-029, SPEC-CORE-155) The viewer itself makes no request other than the stream GET and the library and stylesheet chunks, and `/preview-text` is requested only in the fallback; no keyboard, clipboard or mouse action in the Excel grid (typing, Delete, Backspace, cut, paste, undo, redo, double-click, right-click, dragging a selection's corner) changes what any cell shows.
I12. (SPEC-CORE-029, SPEC-CORE-155) With `fillCanvas` the frame's height equals the height `useFillHeight` gives it, otherwise 80vh; the drawing scrolls inside the frame and never makes the page scroll by growing it; the Excel grid fills the frame after every change in the frame's size, including ones without a window resize.
I13. (SPEC-CORE-155) Forms with a `<fieldset>` look the same after an Excel file has been opened in the session as before it.
I14. (SPEC-CORE-029) In a Word drawing, every link whose `href` starts with `http://` or `https://` has `target="_blank"` and `rel="noopener noreferrer"`, and no other link is changed.

## Checked, no action

- **Fidelity.** No invariant compares the drawing to Word or Excel, and no Litloft code
  adjusts it. Text cut at the cell edge, wrapping sheet tabs, missing shapes and charts,
  number formats, uncopyable cell text and Word layout differences are the library's and
  stay. A file that looks wrong can still be downloaded from the `⋮` menu.
- **Tests.** The libraries' drawing is not tested in CI: no golden screenshot, no e2e
  that renders a real document. CI tests cover only Litloft's side, with the libraries
  mocked: which file gets which viewer at 20 MB and 20 MB + 1 (I1, I2, I4), the fallback
  for each failure (I3), identity changes and their absence (I6, I7), the arrow keys
  (I8, with the grid's active signal set directly), the viewer's requests (I11, first clause) and the link rewrite on a stand-in
  drawing (I14). The rest needs the real libraries in a real browser and is R-5's, at
  1280px and 390px, on the canonical file page in the folder's two-pane layout and once
  full-width on a cross-folder route, and once on the collection route:
  - I5: the network panel on a video page and a PDF page, and the build's chunk list.
  - I8: ← / → before clicking the grid, after clicking it, and after clicking outside it.
  - I9, I10: click the grid, then leave by a click outside then →, by a tree click, by a
    keyboard shortcut and by browser back; and, staying, focus the comment field by
    a click and the find field by `Ctrl/Cmd+F`. Type, paste and press the shortcuts each
    time.
  - I11, second clause: the editing keys, clipboard actions and mouse actions on a
    clicked cell.
  - I12: on the canonical page, the frame's box against a PDF viewer's on the same
    layout; on the collection route, 80vh; on both, the page not
    scrolling while the drawing does, and the grid's size after opening and closing the
    inspector.
  - I13: a setup or settings fieldset before and after opening an Excel file.
  - Excel on a phone (390px): the grid scrolls by touch, and the header and the inspector
    sheet are reachable.
- **Why I9, I10 and I13 exist.** They are the library's side effects (see *Summary*), not
  its drawing. How the viewer contains them (clearing the grid's focus when focus leaves
  it or the viewer unmounts, scoping or rewriting the three rules, or anything else) is
  the implementation's choice; the invariants are the observable results. With I14, this
  is the code Litloft writes around the library rather than calling it.
- **A second load on open.** The viewer starts on the list's copy of the file. When the
  detail answer differs in `file_size` or `modified_at` (the list was stale), the viewer
  loads again. Accepted: it needs a file changed since the list was read, and waiting for
  the detail answer would delay every open.
- **No live update.** §3: no host learns of a file going missing or being overwritten
  while it is open, and adding that is outside this change.
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
- **In-document links.** A `#bookmark` link can change the address's `#` part and add a
  history entry; browser back then returns within the document's address before leaving
  it. Accepted as the library draws it.
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
