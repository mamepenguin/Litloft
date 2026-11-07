# Persistent highlights on PDF and text

SPEC-ID: SPEC-CORE-052
SPEC-ID: SPEC-CORE-053

Approval:

## Summary

A viewer reading a PDF, a Markdown note or a plain-text file can select a stretch of text and
keep a highlight on it. The mark is drawn again every time the file is opened, in the same
place, and the viewer can remove it. Today the only things a selection can do are go into the
quote basket (a note elsewhere) or nothing: the source document keeps no trace, and a comment
belongs to the whole file and has no position.

- **SPEC-CORE-052**: a per-viewer store of highlights. A highlight is the selected text
  (`quote`), a little text on each side of it (`prefix`, `suffix`) and, for a PDF, the page.
  The backend adds a `highlights` table and three routes; with no profile the same records are
  kept in `localStorage`, like reading positions.
- **SPEC-CORE-053**: the file page draws the stored highlights over the rendered text, offers
  "Highlight" on a text selection and "Remove" on a mark, in the PDF viewer (inline and full
  screen), the Markdown preview and the plain-text view.

Position is the quote with its neighbours, never an offset, because a Markdown or text file can
be edited and a PDF text layer is rebuilt on every zoom. A highlight whose text cannot be found
any more stays stored and is simply not drawn.

Out of scope for this unit, decided with the human on 2026-11-07: audio and video stretches,
EPUB, Office files and pictures, a note or a colour on a highlight, a list of all highlights,
sharing between viewers, and any link to the quote basket or to Knowledge notes. Highlights are
the viewer's own (keyed by `viewer_id`, as watch history is).

## Required items

### 1. Normal flow

1. The viewer selects text in the PDF viewer (inline or full screen), in a Markdown preview or
   in a plain-text view. A "Highlight" control appears near the selection.
2. The viewer chooses it. The page reads the selection as `quote` (whitespace collapsed,
   trimmed), takes `prefix` and `suffix` from the same text source (up to 32 characters each
   side), and for a PDF the page number. It stores the record and clears the selection.
3. The mark appears at once over the selected text.
4. On a later visit the page fetches the file's highlights and draws each one by finding
   `quote` in the text it is showing, using `prefix` and `suffix` to choose among repeated
   occurrences. For a PDF only the highlights of the page being drawn are searched, and the
   marks are drawn again whenever the text layer is rebuilt (zoom, resize, page change).
5. Choosing a mark offers "Remove". Removing deletes the record and the mark disappears.

### 2. Failure cases

- The server is down or answers an error on save: the mark is not drawn, the selection is
  kept and a one-line failure message is shown. Nothing is stored.
- The server fails on the initial fetch: nothing is drawn and no message is shown (the file is
  still readable); the next visit tries again.
- The quote is not found in the text now shown (the file was edited, or the PDF has no text
  layer for that page): the highlight stays stored and is not drawn. Nothing is deleted.
- The quote is found more than once and the neighbours do not decide: the occurrence whose
  neighbours match best is used; on a tie, the first.
- A selection that spans two PDF pages, crosses a Markdown block that renders no text, or
  touches an already highlighted stretch: see item 9.
- The file has 500 highlights already: the 501st is refused and the viewer is told.
- A selection of more than 2,000 characters is not offered "Highlight".
- Delete of a record that no longer exists succeeds quietly.

### 3. States

A highlight is `absent`, `stored-and-drawn`, or `stored-and-not-drawn` (quote not found, page
not shown, or text still loading). Transitions: absent → stored (save succeeds); stored → absent
(remove succeeds); drawn ↔ not drawn follows the text on screen and changes nothing in storage.
A file moved to trash keeps its highlights; they are reachable again on restore. A purged file
deletes them (foreign key cascade).

### 4. Data read and written

- Backend: a new table `highlights` (`id` 12-character nanoid primary key, `viewer_id`
  String(16), `file_id` String(12) FK to `files.id` ON DELETE CASCADE, `page` integer null,
  `quote` text, `prefix` text, `suffix` text, `created_at`), index on (`viewer_id`,
  `file_id`). Created by the hand-rolled migration in `backend/app/database.py`
  (`checkfirst`), as `watch_history` is. Read by `GET`, written by `POST` and `DELETE`.
- Frontend, no profile: `localStorage` key `highlights:<fileId>`, the same records. Never read
  or written when a profile is set.
- No other table, file or cache is touched. The file itself is never modified.

### 5. External services

None. No addon, LLM or network call beyond the three core routes.

### 6. Authorization

- Routes live in a new `backend/app/routers/highlights.py` under `/api/files`, using the same
  `_get_file_or_404` shape as `progress.py`: an active file (`active_file_filter()`), and
  `check_drive_access`, which answers 404 for an unknown or locked drive.
- `viewer_id` comes from `Depends(get_viewer_id)`. A list returns `[]` when there is no
  viewer; a create returns 401 (the page then uses `localStorage`); a delete of another
  viewer's record changes nothing and answers 204.
- A viewer never sees another viewer's highlights; no response carries a `viewer_id`.

### 7. Effect on existing features

- Quote basket and the Knowledge addon: unchanged. The core "Highlight" control sits beside
  the addon's quote button and must not cover it or take its pointer events.
- In-file find marks: unchanged. Highlight marks use their own class and survive find's
  clear-and-redraw; find marks drawn over a highlight stay visible.
- Resume position and text scroll (SPEC-CORE-050): unchanged. Wrapping text in marks does not
  change scroll height enough to be recorded as a reader move beyond what a re-render does today.
- Comments, tags, watch history, trash, purge: untouched, except that purge and the file
  foreign key remove the highlights of a deleted file.
- Document capture publishers (`selectionchange`): a highlight click must not publish a
  capture candidate.
- The Markdown editor of Knowledge draws core `MarkdownPreview` and `TextLines`; highlights
  are drawn there too in the reading view and not in edit mode (the preview is hidden then).

### 8. Error behavior

The user sees the one-line failure message of item 2 for a failed save, a limit message at 500,
and nothing for a failed fetch or an unfound quote. The backend logs nothing about quote text
(it is the viewer's reading); it logs the usual request line only.

### 9. User-visible behavior

- "Highlight" appears only for a non-collapsed selection inside a PDF page, a Markdown preview
  or a text view, of at most 2,000 characters. On a PDF a selection that spans pages is cut to
  the page where it starts. A selection that already contains a highlighted stretch makes a
  second, overlapping highlight; marks may overlap and each is removed on its own.
- A mark is a soft yellow background behind the text (no change to the glyphs), readable in
  light and dark themes, drawn on a PDF text layer at reduced alpha like find marks.
- A mark shows a "Remove" control on click or tap, and nothing else; there is no list, colour
  or note.
- Highlights are per viewer: another nickname sees none. With no nickname they live in this
  browser only.
- Marks appear after the text is drawn, never before; reopening the same file shows the same
  marks in the same places.
- Text is `highlight.*` keys in `messages-core/{en,ja}.json`; no emoji.

### 10. Non-functional

- At most 500 highlights per file per viewer; `quote` at most 2,000 characters, `prefix` and
  `suffix` at most 64 each; stored text is not interpreted or rendered as HTML.
- Matching a file's highlights is done per text source in a single pass and must not make
  typing or scrolling in a long document visibly slower; a PDF page searches only its own
  highlights.
- Drive separation holds: a highlight is reachable only through its file's drive check.
- Privacy: highlights are the viewer's reading history; they are not sent to any addon.

## Touch points

- `backend/app/models.py`: `Highlight` model.
- `backend/app/database.py` (HIGH zone): create `highlights` when absent.
- `backend/app/schemas.py`: request and response models with length caps.
- `backend/app/routers/highlights.py` (new) and its inclusion in `backend/app/main.py`:
  `GET /api/files/{file_id}/highlights`, `POST` the same, `DELETE /api/files/{file_id}/highlights/{highlight_id}`.
- `backend/tests/`: route and model tests.
- `frontend/src/lib/api.ts`: three calls. `frontend/src/lib/highlightStore.ts` (new): server or
  `localStorage` by profile, in the shape of `lib/textScrollProgress.ts` and
  `lib/pdfPageProgress.ts`.
- `frontend/src/lib/highlightAnchor.ts` (new): build `prefix`/`suffix` from a text source,
  find a quote in a text source.
- `frontend/src/lib/findMarks.ts`, `frontend/src/hooks/useFindMarksIn.ts` (new sibling hook
  `useHighlightMarksIn`): text-node wrapping shared with find marks.
- `frontend/src/components/MarkdownPreview.tsx`, `TextLines.tsx`, `PdfPreview.tsx`,
  `pdf/PdfFullscreenViewer.tsx`: draw marks, host the "Highlight" and "Remove" controls.
- `frontend/src/lib/documentCapture.ts` / `hooks/useDocumentCapturePublisher.ts`: only if the
  selection reading is shared; no change to what a capture produces.
- `frontend/src/app/globals.css`: the mark style. `DESIGN.md`: the mark rule (soft yellow,
  light and dark).
- `frontend/src/messages-core/en.json`, `ja.json`: `highlight.*`.
- `frontend/e2e-components/`: a real-browser check (selection, drawing in a PDF text layer
  after zoom, Markdown re-render).
- `docs/user-guide/viewers-and-players.md`, `docs/reference/api.md`.
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary, file state, watch
  history and profiles), `backend-conventions.md`, `frontend-conventions.md`, `DESIGN.md`.
  No protected path other than `backend/app/database.py` (HIGH) is edited.

## Invariants

I1. A viewer's highlights of a file are returned only to that viewer, and only for an active file of a drive the request may access; a locked or unknown drive answers 404.
I2. A highlight is stored by quote, prefix, suffix and (PDF) page, never by an offset, and storing or removing one never modifies the file.
I3. With no profile, highlights are read and written only in `localStorage` and the server receives no highlight request; with a profile, `localStorage` is neither read nor written.
I4. A highlight whose quote is not found in the text now shown is neither drawn nor deleted.
I5. A PDF highlight is drawn only on the page it was made on, and is drawn again after the text layer is rebuilt by a zoom or resize.
I6. Where the quote occurs more than once, the occurrence whose neighbours best match the stored prefix and suffix is marked, one occurrence per highlight.
I7. Removing a highlight deletes exactly that record; the other highlights of the file are unchanged.
I8. A failed save draws no mark and stores nothing; a mark is drawn only for a record that was stored.
I9. Selecting text, drawing marks or clicking a mark does not add anything to the quote basket and does not change the quote capture a selection produces.
I10. No more than 500 highlights exist per viewer per file, and a longer selection than 2,000 characters is not offered "Highlight".

## Checked, no action

- Offsets or XPath for position: rejected, text files are editable and a PDF text layer is
  rebuilt; the quote with neighbours is the W3C text-quote selector's idea and survives both.
- Storing a selection rectangle for PDF: rejected, it breaks on zoom and window width.
- Sharing between viewers and a shared drive-level layer (as comments are): decided against on
  2026-11-07; the user keeps personal reading marks.
- Linking a highlight to the quote basket or a Knowledge note, a memo or colour: next unit.
- Audio and video stretches: next unit; a time range needs no text anchor.
- EPUB: the reader lives in an iframe with its own selection; separate unit.
- Mobile touch selection handles: PC browser is the environment; the control is checked on
  touch only for not breaking the quote button.
- A server list of all highlights for a drive or a "highlights" page: not asked for.
- Migrating `localStorage` highlights to the server when a profile is created: reading
  positions do not migrate either.
