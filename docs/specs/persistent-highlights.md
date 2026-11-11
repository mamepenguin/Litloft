# Persistent highlights on PDF and text

SPEC-ID: SPEC-CORE-052
SPEC-ID: SPEC-CORE-053

Approval: sha256:a3289475f0de7eb5baceb80b7f281b4ade7283f8f1bde522e601d41974e1cfce Yuichi Senga 2026-11-07

## Summary

A viewer reading a PDF, a Markdown note or a plain-text file can select a stretch of text and
keep a highlight on it. The mark is drawn again every time the file is opened, in the same
place, and the viewer can remove it. Today a selection can only go into the quote basket (a
note elsewhere): the source document keeps no trace, and a comment belongs to the whole file
and has no position.

- **SPEC-CORE-052**: a per-viewer store of highlights. A highlight is the selected text
  (`quote`), a little text on each side of it (`prefix`, `suffix`) and, for a PDF, the page.
  The backend adds a `highlights` table and three routes; with no profile the same records are
  kept in `localStorage`, like reading positions.
- **SPEC-CORE-053**: the file page draws the stored highlights over the rendered text, offers
  "Highlight" on a text selection and "Remove" on a mark, in the PDF viewer (inline and full
  screen), the Markdown preview and the plain-text view.

Position is the quote with its neighbours, never an offset: a Markdown or text file can be
edited and a PDF text layer is rebuilt on every zoom. A highlight whose text cannot be found any
more stays stored and is not drawn; if the text comes back it is drawn again.

Out of scope for this unit, decided with the human on 2026-11-07: audio and video stretches,
EPUB, Office files and pictures, a note or a colour on a highlight, a list of all highlights,
sharing between viewers, and any link to the quote basket or to Knowledge notes. Highlights are
the viewer's own, keyed by `viewer_id` as watch history is.

## Required items

### 1. Normal flow

1. The viewer selects text in the PDF viewer (inline or full screen), a Markdown preview or a
   plain-text view. A "Highlight" control appears near the selection (placement is decided in
   the design artifact before implementation; see item 9).
2. The viewer chooses it. The page builds `quote` (whitespace runs collapsed to one space,
   trimmed) from the selection, and `prefix` and `suffix` (up to 32 characters each side, built
   the same way) from the same text source; for a PDF it also takes the page. Which store is
   used is decided before anything is sent (item 4). On success the record, with its id, is
   kept in page state, the selection is cleared and the mark is drawn.
3. On a later visit the page loads the file's highlights from the store and draws each by
   finding `quote` in the text source it is showing, using `prefix` and `suffix` to choose
   among repeated occurrences. For a PDF only the highlights of the page being drawn are
   searched. Marks are recomputed whenever the text source renders again: a Markdown or text
   re-render, a content reload or edit, a PDF zoom, resize or page change (text-layer rebuild).
4. Clicking a mark offers "Remove". Removing deletes the record and the mark disappears.

**Opt-in by file id.** `MarkdownPreview` and `TextLines` offer and draw highlights only when
they are inside a `HighlightFileContext` that supplies the file's id; with none they show no
control and no mark. Core supplies it where they render the file's own text (`MarkdownFileViewer`,
`TextPreview`) and the `knowledge-edit` slot supplies it in `ShellLayout.tsx` (where the existing
text-scroll context is already supplied), so the Knowledge editor's reading view gets
highlights without an edit to the addon repository. A `MarkdownPreview` that renders something
else (an AI summary, a note excerpt) is never inside that context.

**One state per file.** The highlight list of the open file lives in one page-level store keyed
by file id (an external store like `pdfStore`), read by the inline PDF viewer, the full-screen
viewer, the Markdown preview and the text view. A save or remove in one is visible in the others
at once, including when full screen opens or closes.

**Text source.** The text a highlight is matched against is the concatenation of the text nodes
of the viewer's text container, in document order, skipping `script` and `style`, exactly as
in-file find indexes it (`lib/findMarks.ts`): the PDF page's text layer, the Markdown preview
body, the text view's text column (the line-number gutter is not part of it). Runs of
whitespace in that text are matched as one space. Text that is not in the DOM is never matched.
Marks that already exist (find marks, highlight marks) are transparent to the text: wrapping a
stretch in a mark does not change the text.

**Quote source.** `quote`, `prefix` and `suffix` are always cut from the text-node concatenation
(the selection's range ends are mapped to offsets in it), never from `Selection.toString()`,
which adds line breaks at block boundaries that the matched text does not have. A selection
across paragraphs, list items or table cells is therefore matched the way it was cut.

### 2. Failure cases

- Save fails (server error, network, `localStorage` throws or is full, limit reached): no mark
  is drawn, nothing is stored, the selection is kept, a one-line message is shown.
- Remove fails: the mark is kept and a one-line message is shown.
- Loading fails (server error, `localStorage` unreadable or corrupt JSON): nothing is drawn, no
  message is shown (the file stays readable); the next load tries again. A corrupt
  `localStorage` entry is ignored, not overwritten, until the viewer saves a new highlight.
- The quote is not found in the text now shown (edited file, a PDF page with no text layer):
  stored, not drawn.
- The quote occurs more than once: the occurrence whose neighbours best match `prefix` and
  `suffix` is used; on a tie the first.
- The same selection saved twice (same `quote`, `prefix`, `suffix`, `page`): the second save
  returns the existing record and creates nothing (a double click is harmless).
- A save is checked in this order: validity (422), duplicate (returns the existing record, even
  at 500), then the limit (409 on a new 501st; the local store refuses the same). Concurrent
  identical saves create one record and never exceed 500 on the server; across two tabs the
  local store is not synchronised (item Checked).
- Invalid input to the server answers 422: empty or whitespace-only `quote`; over-length
  fields; `page` below 1; `page` missing for a file whose `mime_type` is `application/pdf`; `page` present for any
  other file. The server limits no other file type (the viewers decide where the control shows).
- A locked drive, a trashed or missing file, or an unknown id answers 404 on all three routes,
  `DELETE` included. A `DELETE` for a record that does not exist, belongs to another viewer, or
  belongs to another file answers 204 and deletes nothing.
- The profile is not resolved yet (the provider has not read the cookie): no control is offered
  and nothing is loaded; both start when it resolves. A cookie that expired while the page was
  open makes a save answer 401, which is shown as a failed save; the list stays as drawn.
- The profile changes while the page is open (a nickname is set or cleared): marks are reloaded
  from the store the new state selects, and the result of a save or remove still in flight to
  the old store is discarded. Records and ids are never copied between the two stores; a local
  id (`local-` and random text) is never sent to the server.

### 3. States

A highlight is `absent`, `stored-and-drawn` or `stored-and-not-drawn` (quote not found, PDF page
not shown, text not yet rendered). absent → stored when a save succeeds; stored → absent when a
remove succeeds; drawn ↔ not drawn follows the text on screen and each re-render, and changes
nothing in storage. A file in the trash keeps its highlights, reachable again on restore; a
purged file deletes them (foreign key cascade).

### 4. Data read and written

- Backend: a new table `highlights`: `id` String(12) primary key (nanoid, as other tables),
  `viewer_id` String(16), `file_id` String(12) FK `files.id` ON DELETE CASCADE, `page` integer
  null, `quote`, `prefix`, `suffix` text, `created_at` (UTC datetime, as `Comment`); index on
  (`viewer_id`, `file_id`). It is created, with its index, by the existing
  `Base.metadata.create_all` in `init_db` on a new and on an existing database; no entry is
  added to `_migrate`, and an extra table does not break a rollback to an older version.
- Routes (all under `/api/files`):
  - `GET /{file_id}/highlights` → 200 `[{id, page, quote, prefix, suffix, created_at}]`, oldest
    first; `[]` when there is no viewer.
  - `POST /{file_id}/highlights` with `{page, quote, prefix, suffix}` → 201 with the record
    (200 with the existing record for a duplicate); 401 when there is no viewer.
  - `DELETE /{file_id}/highlights/{highlight_id}` → 204.
- Which store the page uses: `useProfile().nickname !== null` read when the action starts
  (the same signal reading-position hooks use). No profile → `localStorage` key
  `highlights:<fileId>`, a JSON array of the same record shape with a locally generated id; the
  server is not called. A profile → the routes; `localStorage` is not read or written.
- The file itself is never read for this feature beyond what the viewer already loaded, and
  never written.

### 5. External services

None. No addon, LLM or network call beyond the three core routes.

### 6. Authorization

- A new `backend/app/routers/highlights.py`, using the same `_get_file_or_404` shape as
  `progress.py` and `comments.py` (`active_file_filter()`, then `check_drive_access` with the
  request's `unlocked_groups`, which answers 404 for an unknown or locked drive).
- `viewer_id` comes from `Depends(get_viewer_id)`. Records are always filtered by viewer.
- No response carries `viewer_id`. A viewer never sees another viewer's highlights.

### 7. Effect on existing features

- Quote basket and Knowledge: unchanged. The "Highlight" control does not cover the addon's
  quote button or take its pointer events, and neither control hides the other.
- In-file find: unchanged. Find clears and redraws its marks without removing highlight marks,
  and a find mark drawn over a highlight stays visible; the two redraws do not trigger each
  other.
- Resume position and text scroll (SPEC-CORE-050): drawing marks scrolls nothing and records
  nothing.
- Document capture (`selectionchange` publishers): a click on a mark neither publishes a
  candidate nor changes the selection result; what a selection produces is unchanged.
- Comments, tags, watch history, trash, purge: untouched, except that the file foreign key
  removes highlights of a purged file.
- Knowledge's Markdown editor draws core `MarkdownPreview` and `TextLines`: highlights are drawn
  in its reading view, not in edit mode (the preview is hidden then, so nothing is matched).
  After an edit the preview renders again and the marks are recomputed (item 1).
- The PDF text layer is rebuilt on zoom and resize; wrapping text in marks must not change the
  text layer's layout or the selection and find marks that live in it.

### 8. Error behavior

The viewer sees one of three lines, as `highlight.*` keys in English and Japanese:
`saveFailed` for every failed save (network, 401, 404, 422, a full or throwing `localStorage`),
`removeFailed` for a failed remove, and `limitReached` for the 500 limit. Nothing is shown for
a failed load or an unfound quote.
The backend logs the usual request line and never the text of a quote.

### 9. User-visible behavior

- "Highlight" appears only for a non-collapsed selection inside a PDF page, a Markdown preview
  or a text view, of at most 2,000 characters after collapsing. A selection that spans PDF
  pages is cut to the part on the page where it starts: `quote` is that part and `page` is that
  page. A Markdown selection is the text of the selected nodes whether or not a block between
  renders any text. Marks may overlap or touch; a selection that starts or ends inside a mark
  makes a new highlight.
- The mark is a soft yellow background behind the text, no change to the glyphs, readable in
  the light and dark themes, drawn at reduced alpha on a PDF text layer as find marks are.
- Clicking a mark shows "Remove" for the newest highlight whose drawn range covers the click
  point (newest by `created_at`, then by list order); removing it and clicking again reaches the
  next older one. The target is resolved from the highlight records and their resolved ranges,
  not from which DOM wrapper was hit, and a click on a find mark drawn over a highlight reaches
  the highlight. Nothing else is offered: no list, colour,
  note or edit.
- Pointer use is the target (PC browser). The controls' placement, when they appear and when
  they dismiss (selection collapses, page changes, scroll) are fixed in a design artifact the
  human agrees before implementation; keyboard and touch are not promised.
- Highlights are per viewer: another nickname sees none. With no nickname they live in this
  browser only.
- Reopening the same file shows the same marks in the same places, after the text is drawn and
  never before.

### 10. Non-functional

- At most 500 highlights per viewer per file, in both stores. `quote` at most 2,000 characters;
  `prefix` and `suffix` at most 64 each. Stored text is plain text, never interpreted as HTML.
- Drawing: one pass over the text source per render finds all of a file's highlights; a PDF page
  searches only its own. Speed is not a tested promise. It is looked at once in R-5 with a
  1 MB text file and 500 highlights, and a visible stall goes to the human.
- Drive separation: a highlight is reachable only through its file's drive check.
- Privacy: highlights are the viewer's reading history. They live in the core database, which
  independent-service addons may read through their read-only data mount (an accepted exposure
  under the personal-tool premise); no Internal API endpoint exposes them and no core code sends
  them to an addon. The new routes list only the requester's own records, in line with the rule
  against a profile-listing API.

## Touch points

- `backend/app/models.py`: `Highlight` model. `backend/app/database.py` is not edited
  (`create_all` creates the table).
- `backend/app/schemas.py`: request and response models with the caps and the PDF page rule.
- `backend/app/routers/highlights.py` (new), included from `backend/app/main.py`:
  `GET`/`POST /api/files/{file_id}/highlights`, `DELETE /api/files/{file_id}/highlights/{highlight_id}`.
- `backend/tests/`: model and route tests.
- `frontend/src/lib/api.ts`: three calls. `frontend/src/lib/highlightStore.ts` (new): server or
  `localStorage` by `useProfile()`, with a local id generator, in the shape of
  `lib/pdfPageProgress.ts`. `frontend/src/components/ProfileProvider.tsx`: read only.
- `frontend/src/lib/highlightAnchor.ts` (new): build `prefix`/`suffix`, normalise, find a quote
  in a text source and pick the best occurrence.
- `frontend/src/lib/findMarks.ts` and `frontend/src/hooks/useFindMarksIn.ts`: share the
  text-node indexing and wrapping; a new `useHighlightMarksIn` hook.
- `frontend/src/components/FileDetail/ShellLayout.tsx`, `MarkdownFileViewer.tsx`,
  `TextPreview.tsx`, `FilePreview.tsx`: supply `HighlightFileContext` (the id) where the file's
  own text is rendered. `frontend/src/lib/__tests__/findMarks*.test.ts` and
  `TextPreview.test.tsx` change with the shared indexing.
- `frontend/src/components/MarkdownPreview.tsx`, `TextLines.tsx`, `PdfPreview.tsx`,
  `pdf/PdfFullscreenViewer.tsx` (including their text-layer render callbacks): draw marks and
  host the "Highlight" and "Remove" controls.
- `frontend/src/lib/documentCapture.ts`, `frontend/src/hooks/useDocumentCapturePublisher.ts`:
  only if the selection reading is shared; no change to what a capture produces.
- `frontend/src/app/globals.css`: the mark style. `DESIGN.md`: the mark rule.
- `frontend/src/messages-core/en.json`, `ja.json`: `highlight.*`.
- `frontend/e2e-components/` (fixtures, `projects.ts`, `spec-viewport.spec.ts`,
  `componentFixtureParity.test.tsx`): a real-browser check of drawing in a PDF text layer after
  zoom and in a re-rendered Markdown preview.
- `docs/specs/INDEX.md` (two rows), `docs/user-guide/viewers-and-players.md` and the user-guide
  page of the text and Markdown viewers, `docs/reference/api.md`.
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary, file state, watch
  history and profiles), `backend-conventions.md`, `frontend-conventions.md`, `DESIGN.md`. No
  protected path is edited. The change adds a table, which the risk classifier counts as a
  schema modifier; that is accepted and no file in a HIGH zone is touched.

## Invariants

I1. All three routes answer only for an active file of an accessible drive (404 otherwise), return and delete only the requesting viewer's records of that file (a delete of another viewer's or another file's record answers 204 and removes nothing), and no response carries a `viewer_id`.
I2. A highlight is stored as quote, prefix, suffix and (PDF only) page, never as an offset or a rectangle; the server answers 422 for an empty quote, a quote over 2,000 or a prefix or suffix over 64 characters, and a wrong `page`; a duplicate save returns the existing record; no more than 500 exist per viewer per file in either store.
I3. With no profile highlights are read and written only in `localStorage` and the server receives no highlight request; with a profile `localStorage` is not read or written.
I4. A highlight whose quote is not found in the text now shown is neither drawn nor deleted, and is drawn again when the text returns.
I5. A PDF highlight is drawn only on the page it was made on, and again after the text layer is rebuilt.
I6. Where a quote occurs more than once, the occurrence whose neighbours best match the stored prefix and suffix is marked, the first on a tie.
I7. A failed save stores and draws nothing, a failed remove keeps the mark, and a successful remove deletes exactly that record.
I8. Drawing marks changes neither the text of the text source nor the scroll position, and records no reading position (SPEC-CORE-050).
I9. Selecting, drawing marks or clicking a mark adds nothing to the quote basket, does not change what a selection captures, does not hide or cover the quote button, and leaves in-file find marks visible and working; a `MarkdownPreview` or `TextLines` outside `HighlightFileContext` shows no control and no mark.
I10. Moving a file to the trash keeps its highlights, purging it deletes them, and saving or removing a highlight never modifies the file.

## Checked, no action

- Offsets or XPath for position: rejected, text files are editable and a PDF text layer is
  rebuilt; the quote with neighbours survives both.
- A selection rectangle for PDF: rejected, it breaks on zoom and window width.
- Sharing between viewers or a drive-level layer (as comments are): decided against on
  2026-11-07; the human keeps personal reading marks.
- Linking a highlight to the quote basket, a Knowledge note, a memo or a colour: next unit.
- Audio and video stretches: next unit; a time range needs no text anchor.
- EPUB: the reader lives in an iframe with its own selection; separate unit.
- Keyboard and touch operation, and the iOS selection menu: PC pointer is the environment and
  the agent cannot verify iOS; the controls are checked on touch only for not breaking the
  quote button.
- A list of all highlights or a page for them: not asked for.
- Moving local highlights to the server when a profile is created: reading positions do not
  move either.
- Windowed or truncated text views: none of these viewers windows its text; matching is against
  what is in the DOM.
- Hyphenation and line breaks inside a PDF text layer: matching is on the text-layer text as
  pdf.js emits it; a quote that crosses a hyphenated break is matched the way find matches it.
- A tested performance bound: unmeasurable in CI; looked at once in R-5.
- Local `highlights:<fileId>` entries of purged files, and edits made in two tabs at once with no
  profile: accepted. Orphan entries are small and unbounded in number only by what one browser
  has opened; two-tab races lose at worst a mark, which the viewer sees and redoes.
- Compound invariant lines (I2, I4, I5, I9): each states one rule with its parts; a finding cites
  the part it breaks.
- `Selection.toString()` for the quote: rejected (see Quote source).
