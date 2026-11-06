# Keep where each OCR line sits in a picture, and mark it when find in this file hits it

SPEC-ID: SPEC-ADDON-075
SPEC-ID: SPEC-CORE-051

Approval: sha256:34e34c624bf5010e494acb27acd3d641490b7c3488504c1991d0e22a06f90414 Yuichi Senga 2026-11-07

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

The picture OCR worker (SPEC-ADDON-050) reads a picture with RapidOCR and keeps only the
text of each line; where each line sits in the picture is thrown away. Find in this file
(SPEC-ADDON-061, SPEC-CORE-028) therefore lists a hit in a picture's text as a row that
"moves nothing": the viewer learns that the word is in the picture, not where.

- **075** The OCR worker also keeps, for each line it keeps, the four corners of the line's
  box (as fractions of the picture), and the engine's confidence. A find row for a hit in a
  picture's text carries the boxes of the lines the hit sits on.
- **051** While find in this file shows hits, the picture page draws those boxes over the
  picture; the current row's boxes are drawn as the current place.

For the person who keeps screenshots, receipts and scans, searches for a word, and wants to
see where in the picture it is. The picture text, its chunks, its embeddings, the
corrections of SPEC-ADDON-067 and the restore of SPEC-ADDON-068 are not changed: the boxes
are an addition that is used only while they still describe the stored text.

Out of scope, by decision: reading order (see Checked, no action), boxes for video frames
and scanned PDF pages (SPEC-ADDON-066), a position in the Ask prompt, cutting a region out
for the vision model, marking an Ask citation, and re-reading existing pictures
automatically.

## Required items

### 1. Normal flow

Terms used below:

- **kept line**: one string of the engine's `txts`, with the box and score the engine
  returned for it. The picture text is the kept lines joined by `\n`, exactly as today
  (`ocr.py`, SPEC-ADDON-050 I1).
- **quad**: eight numbers `[x1, y1, x2, y2, x3, y3, x4, y4]`, the four corners of a line's
  box in the order the engine returns them, each divided by the width (x) or height (y) in
  pixels of the picture the engine read (oriented by EXIF, flattened to RGB, as
  `_load_picture` returns it) and clamped to `[0, 1]`.
- **the picture's lines**: the one `picture_lines` row of a picture (Data), holding its kept
  lines in the engine's order, each with `text`, `quad` and `score`. A kept line whose text
  is empty is kept like any other, so that the joined text stays equal to the picture text.
- **line range**: the characters a line's own `text` occupies in the joined text. Line `i`
  occupies `[s_i, s_i + len(text_i))` with `s_0 = 0` and `s_(i+1) = s_i + len(text_i) + 1`;
  the `\n` between two lines belongs to neither. A line whose text itself contains `\n`
  keeps one range covering all of its characters. Lengths are counted in Unicode code
  points, as `file_find.py` counts them.
- **occurrence**: the range `[at, at + len(needle))` of one match in the merged text, where
  `at` is what `_positions` yields for the row's `ordinal`, and `len(needle)` is its own
  length: the folding of `file_find.py` is ASCII-only and keeps every length, so the span
  in the merged text is `len(needle)` characters. A line is **overlapped** by an
  occurrence when `s_i < at + len(needle)` and `at < s_i + len(text_i)` and its text is not
  empty; an occurrence that only touches a line's edge, or lies on a `\n`, does not overlap
  it. A needle that contains `\n` is an occurrence like any other and overlaps every
  non-empty line it covers.
- **usable lines**: the picture's lines exist, and the stored picture text
  (`picture_texts.text`) equals their `text` values joined by `\n`, and the text rebuilt
  from the picture's `fts_text_content` chunks by find in this file's merge
  (`file_find.py`) equals that stored picture text.

#### A. Keeping the lines (SPEC-ADDON-075)

1. The OCR worker reads a picture as today. From the engine's result it takes `txts`
   (as today), `boxes` and `scores`. Each box is four points of two numbers; its quad is
   the eight numbers in row-major order, normalised as above. The coordinates are in the
   pixels of the picture the engine was given. The lines are the pairs of a text and its
   quad, in order, when `boxes` is present, holds as many boxes as `txts` holds texts, and
   every box has four points of two finite numbers. `score` is the engine's score for the
   line when `scores` is present with as many entries as `txts` and the entry is a finite
   number; otherwise it is null for every line of the picture.
2. In the same transaction in which `_write` stores the picture text and its rows, and
   only in the branches that call `extraction.set_picture_text` (an uncorrected picture, and
   a corrected one with a confirmed redo and at least one chunk), after the active-row and
   correction guards, the picture's lines are replaced by these lines. The empty write
   (`_write(file_id, [], [])`: no text, unreadable, engine exception) goes through the same
   branch for an uncorrected picture and removes its lines; for a picture corrected without
   a redo it returns at the guard, and for a confirmed redo with no chunk it ends as
   failed, and neither touches the lines. A picture that ends with no lines, or whose `boxes` are absent or differ in
   number from the texts, has its lines row removed instead, and its text is written
   exactly as before this change.
   If inserting the lines fails, the exception leaves `_write` as a failure of the text
   rows' insert does today, the transaction is rolled back, nothing of this write is kept
   and `ocr_indexed` stays as it was; the lines add no handling and no return value of
   their own. `lines_json` has no size cap beyond the picture's own limits.
3. Nothing else changes how text is stored: the picture text, its chunks and embeddings are
   the same as they would have been without the lines.

#### B. Rows for find in this file (SPEC-ADDON-075)

1. `GET /files/{file_id}/find` answers as today. For a picture, each `picture_text` row
   gains a field `boxes` when the picture's lines are usable. `boxes` is the list of quads
   of every kept line that the occurrence overlaps, in line order, as defined above. Every
   `picture_text` row has at least one overlapped line when the lines are usable, because
   the merged text equals the joined lines; a row for which none is found has no `boxes`.
2. When the lines are not usable, the row has no `boxes` field. Rows of every other kind
   never have it.
3. Everything else in the answer (`total`, `truncated`, the rows, their order, snippets
   and offsets) is what it would be without the lines.

#### C. Marking the picture (SPEC-CORE-051)

1. The viewer opens a picture's page with find in this file open and a term answered with
   hits. `FindRow` gains an optional `boxes` field.
2. The picture page of the file view (`ImageCanvas`, inside the find provider) reads the
   answered rows from the find marks (`useFindMarks()`: `term`, `currentRow`, `rows`; empty
   outside the provider) and draws a layer over the picture once the full picture is painted
   (`paintedId` equals the file's id, the signal that removes the thumbnail, so never over
   the thumbnail held under it) and its natural width and height are positive; before that,
   and for any picture whose natural size is zero, nothing is drawn. The layer covers the **painted
   picture**: the rectangle the picture occupies inside the `img` element after
   `object-fit: contain`, computed from the element's box and the picture's natural size
   (which the browser reports EXIF-oriented). For every row that has `boxes`, one outline
   per quad is drawn at the quad's fractions of that rectangle. A quad that several rows
   share is drawn once, in the current style when the current row has it and otherwise in
   the mark style. A row whose `boxes` is not a list of lists of eight finite numbers
   draws nothing; the other rows draw. The layer is recomputed when the `img` element's box
   changes (window resize, the `70vh` bound) and is `aria-hidden`. There is no cap on the
   number of outlines: distinct quads are at most the picture's lines.
3. Stepping to another row, changing the term, closing the bar or opening another file
   changes or removes the outlines as the marks of the other viewers change (SPEC-CORE-028
   I8).
4. Nothing is scrolled, zoomed, seeked or opened: a `picture_text` row still moves nothing
   (SPEC-CORE-028 I4); it only becomes the current row.

### 2. Failure cases

| Step | Failure | What the system does |
|---|---|---|
| A1 | The result's boxes and texts differ in number | No lines are kept for this picture, an earlier lines row is removed, the text is stored as it is today, a warning is logged with the file id |
| A1 | `boxes` is absent, a box has fewer than four points, or a number is not finite | Same as above |
| A1 | `scores` is absent, differs in length from the texts, or holds a non-finite number | The lines are kept with a null `score` on every line |
| A2 | The write is discarded (the picture is corrected without a confirmed redo, the row left the index, the embedding failed, the file is unreachable, the engine could not be created) | Lines are not written and the earlier lines row stays, exactly as the text rows do (SPEC-ADDON-050 I3, SPEC-ADDON-067 C6) |
| A2 | The picture is unreadable, or has no recognised text | Ends read with no lines; an earlier lines row is removed |
| A2 | Inserting the lines fails | The text write fails with it and is not kept; the picture stays pending and is read again |
| B1 | Reading the lines row fails | The find answer is returned without `boxes`; a warning is logged with the file id; find does not fail |
| B1 | The picture was read before this change | It has no lines row; its rows have no `boxes` until it is read again |
| B1 | The picture is corrected | The stored text no longer equals the joined lines; rows have no `boxes` |
| C2 | A row has `boxes` that are empty or malformed | That row draws nothing; the rest draw |

### 3. States

A picture is in one of these states for the lines:

- **no lines**: no `picture_lines` row (never read since this change, read with no lines, or
  purged);
- **lines**: a row exists. They are **usable** when the text conditions of the term above
  hold, and **unusable** otherwise (a corrected picture, or a text rebuilt differently).

Transitions:

- no lines → lines: an OCR run stores a result with at least one kept line.
- lines → lines: an OCR run replaces them (a reindex, a confirmed redo).
- lines → no lines: an OCR run that ends with no lines, a result with mismatched counts, or
  a purge of the file or of its drive's index.
- No other transition exists: the lines row is created, replaced or deleted only by the
  text-storing branch of the OCR write and by the file purge. A correction, a restore, a
  rebuild or follow-up item, a discarded OCR write and a text-embedding model purge are not
  transitions of the lines.
- The `\n`-joined text of a picture with a blank or whitespace-only kept line may not be
  what the chunk merge returns; such a picture is unusable and shows no outline. This is
  accepted: it is the same state a corrected picture shows, and no log is written for it.
- usable ↔ unusable: no transition is made on the lines. A correction makes them unusable
  by changing the picture text, and a restore makes them usable again by putting the
  machine text back; neither writes the lines row.

### 4. Data read and written

| Store | Access |
|---|---|
| `search.db` `picture_lines` (new): `file_id` (primary key, 12 chars), `lines_json`, `updated_at` | written by the OCR worker's `_write`; deleted with the file's other rows on a purge; read by the find route |
| `search.db` `picture_texts`, `fts_text_content`, `indexed_files` | read by the find route as today; written by the OCR worker as today |
| `search.db` `kept_originals`, `followup_items` | not touched |
| The picture file | read by the OCR worker as today; the browser reads it for display |

`lines_json` is a JSON list of `{"text": str, "quad": [8 numbers], "score": number|null}`.
The table is created like the other addon tables; no existing row is migrated.

### 5. External services

None. The OCR worker sends nothing over the network (SPEC-ADDON-050 I7), and the find route
and the overlay add no call.

### 6. Authorization

Unchanged. The boxes travel only inside the find answer, which `require_drive` and the
file-access check of SPEC-ADDON-061 already guard; no route is added. The lines row is read
by `file_id` after that check.

### 7. Effect on existing features

- **OCR worker**: `_write` and the code that builds the lines gain the lines; text, chunks,
  embeddings, flags and events are unchanged. The frame and scanned-page OCR of
  SPEC-ADDON-066 share the engine but write no lines.
- **Corrections and restore (SPEC-ADDON-067/068)**: they neither write nor read the lines
  row. A correction saved, a restore, a rebuild item and a follow-up item leave it as it is.
  The kept original is unchanged and holds no boxes.
- **Reindex and confirmed redo**: an OCR run that stores a result replaces the lines with it.
- **Find in this file**: rows of pictures gain an optional field; every other field and every
  other kind is unchanged (SPEC-ADDON-061 I1).
- **Purges**: `_purge_file` removes the lines row beside `PictureText`. Every purge ends in
  it: `_purge_files` (trash, missing and the startup purge of a drive whose `index` policy
  is off) and the orphan purge. The text-embedding
  model purge does not remove it, because it does not remove `picture_texts` either.
- **Search, Ask, summaries, tags**: none read the lines.
- **Pictures read before this change**: no lines. Lines are written by every OCR run that
  stores a result: a reindex, a confirmed redo, the `on_index` backlog and a resume of a
  picture with no stored text. A text-embedding model rebuild rebuilds an uncorrected
  picture's rows from its stored text without reading it (SPEC-ADDON-068 C7), so it adds no
  lines.

### 8. Error behavior

No new error is shown to the viewer. A picture without usable lines shows find rows as it
does today. Logged, with the file id and never the text: the mismatch of boxes and texts in
a result (warning), and a failure to read the lines for a find answer (warning).

### 9. User-visible behavior

- With find in this file open on a picture that was read after this change and a term that
  hits, each hit's lines are outlined over the picture. The line is outlined as a whole, not
  the matched characters.
- Making a row current changes its outlines to the current style; the other rows' outlines
  keep the mark style. Nothing moves.
- A picture that was read before this change, or whose text was corrected, shows the rows
  with no outline. The user guide says so, for older pictures, with the way to read it
  again.
- The outlines use the find mark's colours and shape of the other viewers (`DESIGN.md`); no
  new token is added. Before implementation the outline's look gets a Design Artifact for
  agreement.
- The outlines do not take pointer events: the picture can be clicked, dragged and zoomed
  exactly as without them.

### 10. Non-functional

- Layout: the outlines are placed by measurement in a real browser (Touch points), not by
  jsdom.
- Size: one row per picture, about 100 bytes per kept line; a picture with a thousand lines
  stores about 100 KB. The find answer adds one to a few quads (8 numbers each) per
  `picture_text` row, at most 2,000 rows.
- Time: the OCR worker adds a loop over its lines; the find route adds one primary-key read
  and a pass over the picture's lines.
- Concurrency: the lines are written inside the transaction that already holds the text
  write; the OCR worker still processes one picture at a time (SPEC-ADDON-050 I5).
- Privacy: the boxes are positions of text already stored; they are local to the addon's
  DB and sent only to the viewer who may open the file.

## Touch points

- `addons/intelligence/app/workers/ocr.py`: `index_ocr`, `_write` (pair texts and boxes,
  normalise, write the lines in the text write's transaction, remove them when none).
- `addons/intelligence/app/models.py`: the new `PictureLines` table. `addons/intelligence/app/database.py`
  creates tables with `Base.metadata.create_all`, which adds the table to an existing DB
  without a migration; a test opens an existing DB and finds it created.
- Read, not edited, and pinned by I3: `addons/intelligence/app/extraction.py`
  (`set_picture_text`, `restore_picture_text`, `clear_corrections`) and
  `addons/intelligence/app/workers/followup.py`.
- `addons/intelligence/app/indexer.py`: `_purge_file` (delete the lines row where
  `PictureText` is deleted).
- `addons/intelligence/app/file_find.py`: `_text_occurrences` for pictures (the `boxes`
  field); `addons/intelligence/app/routers/files.py` find route and its response schema in
  `addons/intelligence/app/schemas.py`.
- `frontend/src/lib/fileFind.ts` (`FindRow.boxes`, `readAnswer`) and
  `frontend/src/components/ImageCanvas.tsx` (the layer, reading `useFindMarks()` from
  `frontend/src/components/FileDetail/find/FindContext.tsx`, which is read and not edited;
  `find/types.ts` is unchanged because `FindMarksValue` already carries `rows`).
  `findMarks.ts` and `useFindMarksIn.ts` mark text and are not touched. `FilePreview.tsx`
  renders `ImageCanvas` and is not touched. No label is added.
- `frontend/e2e-layout/`: a new case with a static fixture that measures each outline's
  rectangle against the painted picture's rectangle, for a landscape picture, a portrait
  picture scaled by `max-h-[70vh]` and a picture whose EXIF orientation rotates it.
- Rules passed through: `.claude/rules/design-decisions.md` (Drives: the lines row is
  keyed by `file_id` of one drive's file; Handling missing files; Addons),
  `.claude/rules/backend-conventions.md` (no language-dependent rule), `.claude/rules/frontend-conventions.md`,
  `DESIGN.md` for the outline.
- `.claude/rules/design-decisions.md` "Transcript Refine" gains one rule: the picture's
  lines are the machine's and are never corrected; they are used only while the stored
  text still equals them.
- Docs: `docs/reference/api.md` (`boxes` on a find row), `docs/addons/intelligence.md`
  (the table and when marks appear), `docs/user-guide/` (the find page: older pictures show
  no outline until read again).
- Tests under `addons/intelligence/tests/` and `frontend/src/` citing the two ids.
- No protected path from `docs/process/risk-and-human-review.md`. No core backend change; no
  Internal API endpoint. A submodule pointer bump in the core (CLAUDE.md, Git).

## Invariants

I1. After a successful OCR run on an active picture, it has exactly one `picture_lines` row holding, for each kept line in the engine's order, the text, a quad whose eight numbers are the engine's box corners divided by the width or height of the picture the engine was given and clamped to `[0, 1]`, and the engine's score or null; the lines' texts joined by `\n` equal the stored picture text; it was written in the same transaction as the text rows, and no earlier lines remain.
I2. A picture read with no recognised text, one that cannot be decoded, one over the size limits, and one whose result has no `boxes`, a different number of boxes than texts, or a box that is not four points of two finite numbers end with no `picture_lines` row, and the picture text and its rows are written exactly as they were before this change.
I3. A `picture_lines` row is created, replaced or deleted only by the text-storing branches of the OCR write, after its active-row and correction guards, and by the file purge `_purge_file`; a correction save, a restore, a rebuild or follow-up item and a text-embedding model purge write, change and delete no such row, and the kept original holds no boxes.
I4. A discarded or failed OCR write (an unreachable file, a failed embedding or lines insert, an engine that cannot be created, a picture corrected without a confirmed redo, a confirmed redo with no chunk, a row that left the index) leaves an existing `picture_lines` row byte for byte as it was.
I5. A `picture_text` find row has `boxes` exactly when the picture's lines are usable (the stored picture text and the text merged from its `fts_text_content` chunks both equal the lines' texts joined by `\n`) and at least one non-empty line is overlapped by its occurrence; then `boxes` holds the quads, in line order, of exactly the overlapped lines, with a touch of an edge or a `\n` overlapping nothing. A row of any other kind, and a row of a picture with unusable or no lines, has no `boxes`, and `boxes` is never an empty list; a corrected picture's rows therefore have none, and after a restore puts the machine text back they have them again.
I6. A find answer with the lines present equals the answer without them in every field except `boxes`: the same `total`, `truncated`, rows, order, snippets and offsets; a find request writes nothing; and a failure to read the lines returns the answer without `boxes` rather than an error.
I7. Purging a picture's file by any purge path deletes its `picture_lines` row, and the find route reads the lines of the requested `file_id` only, after the drive and access check.
I8. The OCR of video frames and scanned PDF pages writes no `picture_lines` row, and its text and rows are unchanged.
I9. While find in this file shows hits on a picture, and only after the full picture has decoded, one outline is drawn for each distinct quad of the rows that have `boxes`, at the quad's fractions of the painted picture (the contain-fitted rectangle of the picture inside its `img` element), in the current style when the current row has that quad and in the mark style otherwise; a row whose `boxes` is malformed, missing or null is read as having none, keeps its place in the answer, and draws nothing, and the other rows still draw.
I10. A new query, an answer that is not hits, closing the bar, and opening another file each leave no outline on the picture.
I11. The outline layer takes no pointer events, is `aria-hidden`, follows the `img` element's box when it resizes, and does not change the picture's size, position or scroll; a picture with no row that has `boxes` is drawn exactly as without the layer.

## Checked, no action

- **Reading order.** Restoring the order of lines from their boxes (columns of prose) was
  part of the request and is not in this change. The text today is in the engine's order,
  which is row by row; a rule that splits the picture into columns would turn a receipt or a
  table, with names on the left and amounts on the right, into all the names and then all the
  amounts, which separates what the picture pairs, and the questions this app is asked of
  receipts ("what is the amount") depend on that pairing. A rule has to tell prose columns
  from table rows, and a vertical-text picture needs its own test; that wants a measurement
  on real pictures first. With the boxes stored, it can be a later change that only re-joins
  the stored lines. This is a human decision (see the approval message).
- **Marking the matched characters instead of the whole line.** It needs a box per
  character, which the engine does not return for these models. The whole line is marked.
- **Marking an Ask citation or a search result card.** A citation of a picture has no term
  and no locator (SPEC-ADDON-050 revision r1 quotes the matches without one), and the card
  overlay shows no picture. Both need a locator that does not exist; raise them as their own
  change.
- **Cutting a region out for the vision model, and the position in the Ask prompt.** Out of
  scope by decision; SPEC-ADDON-071 is independent of this change.
- **Boxes for video frames and scanned PDF pages.** Out of scope; SPEC-ADDON-066 stores no
  boxes and draws nothing on those.
- **Reading existing pictures again automatically.** A backfill would run the engine over
  every picture (about 2.6 s each on the author's machine in the B2b trial) to add boxes the
  text already matches, and a corrected picture must not be read at all (SPEC-ADDON-068). A
  picture gets its boxes when it is read again by the existing per-file reindex. A
  background fill that writes only the lines is a separate change if wanted.
- **The table's name.** The request called it `ocr_lines`; it is `picture_lines`, beside
  `picture_texts`, because it is one row per picture, not per line.
- **`score`.** It is stored because it cannot be regenerated without reading the picture
  again, and nothing reads it in this change.
- **A picture replaced in place under the same `file_id`.** Indexing reads a changed file
  again; until then the boxes describe the earlier content, as the picture text does.
- **HEIC and rotated pictures.** The quads are fractions of the EXIF-oriented picture the
  engine read, and the browser shows the picture oriented. That a converted HEIC preview has
  the same orientation is checked in R-5 on a rotated HEIC, not assumed.
- **SPEC-CORE-028 I4 stands.** A `picture_text` row still moves nothing: no scroll, seek,
  page or zoom. The outline is not a move.
- **SPEC-ADDON-067 and SPEC-ADDON-050 stand.** The text the worker stores is unchanged, so
  nothing is revised.
- **A new route for the lines.** Not added: the find answer already carries what the overlay
  needs, and a route would be a new surface to guard.
- **Text selection or copy from the picture.** Not part of this change.
- **Zoom and drag.** `ImageCanvas` has neither; the layer takes no pointer events so that
  whatever the picture does today (click, context menu, long press, drag out) is unchanged.
- **Other full-size viewers.** The find bar exists only on the file surface (SPEC-CORE-028
  I7, I10), so the full-screen viewer and the gallery have no answered term and draw no
  outline; the layer reads the same empty marks outside the provider.
- **The picture's pixel size in the row.** It is not stored: the painted picture is
  computed from the browser's natural size, which is oriented like the engine's picture.
  A viewer whose picture differs in aspect from the engine's (a converted preview) is the
  R-5 check above.
- **Two rows on one line.** Both hold the same quad; it is drawn once, in the current style
  when the current row has it. The exact look is for the Design Artifact.
