# Keep where each line of video frame text sits on the frame

SPEC-ID: SPEC-ADDON-134

Approval: sha256:11dbb51d14a823b1f5ca9edd236aa2484a6538b7a8cc493c309e79f4e33501b5 Yuichi Senga 2026-11-18

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

The frame reader (SPEC-ADDON-066, revised by SPEC-ADDON-133 and SPEC-ADDON-123) detects a
box for every line of text on a read frame and recognises it. It then keeps only the text:
each segment stores its lines joined by `\n`, and where they sat on the frame is lost.
A later screen could show a search hit as the frame cropped around the matched line, or
outline the line on the video, but only if the box was kept when the frame was read.
Reading every video again later costs days of engine time and a fresh download of every
YouTube `.loft`. Keeping the box now costs a few numbers per line.

This change keeps, for every stored segment, its lines in order. Each line has its box as
a quad normalised to the frame, stored in a new table `video_frame_lines`. No screen,
search result or answer changes.

The frame read rule goes from 2 to 3. Every native video read without boxes becomes
outdated and is read again in the background, exactly as SPEC-ADDON-133 already does for
reads below rule 2. A `.loft` stays never outdated. The YouTube `.loft`s already read are
read again once, by an operator reindex after this ships (item 7).

With the lines kept per segment, per-line spans can be derived later without reading
again: a line's span is the run of time-adjacent segments that contain it.

## Required items

### 1. Normal flow

1. The frame reader reads frames exactly as SPEC-ADDON-066 I2 and SPEC-ADDON-133 I1–I5
   define, and nothing in this list changes that:
   - which frames are read;
   - the engine calls;
   - the lines and their order;
   - the segments and their texts;
   - the chunks.
2. A read frame opens a segment when its joined text is non-empty and differs from the
   open segment's.
   - The segment keeps that frame's lines, in the order they are joined into the segment
     text.
   - Each line keeps a quad: the four corners of its detected box. Each `x` is divided by
     the width and each `y` by the height of the image given to the engine (`_ocr_image`),
     and the result is clamped to `[0, 1]`.
   - The quad is stored as eight Python floats `[x1, y1, x2, y2, x3, y3, x4, y4]`, in the
     engine's corner order, each rounded to 4 decimal places.
   - A box the engine dropped (no line) is not kept.
   - A read frame that continues the open segment changes nothing about the segment's
     lines.
3. A box reused from the previous read frame (SPEC-ADDON-123) takes its earlier line and
   this frame's detected quad. A segment opened by a frame with reused boxes therefore
   still has one quad per line, from the frame that opened it.
4. The store step (SPEC-ADDON-133 item 1, step A5) runs in one transaction.
   - It deletes every `video_frame_lines` row of the file. That includes the store of an
     empty read, the first-read `Unreadable` path (`_store_read(file_id, [])`).
   - It writes one `video_frame_lines` row per segment, unless the segment's quads are
     unusable (item 2.2). Each row holds:
     - `file_id`;
     - `segment_index`: the segment's position among all segments of the read, 0, 1, …
       in time order. A skipped segment leaves a gap in the numbers.
     - `start_time` and `end_time`: the segment's own, equal to those of its
       `video_frame_texts` chunks;
     - `lines_json`: `json.dumps` of a list of `{"text": <line>, "quad": [8 floats]}`
       with `ensure_ascii=False` and separators `(",", ":")`.
   - The lines' texts joined by `\n` equal the segment text exactly, before `chunk_text`.
     `ContentExtractor.chunk_text` of that joined text gives exactly the segment's
     `video_frame_texts` chunks, in `chunk_index` order.
   - It writes `frame_ocr_rule` 3.
5. The build step (A6) reads only `video_frame_texts`, as today, and writes no
   `video_frame_lines` row.
6. `FRAME_OCR_RULE` becomes 3. Under `on_index`, every native video whose stored read has
   `frame_ocr_rule` NULL, 1 or 2 is outdated, exactly as SPEC-ADDON-133 states for a rule
   below 2:
   - it is read again at priority -10 and counted as pending;
   - `prioritize` and a reindex raise it;
   - an incomplete re-read keeps the earlier read and sets the rule to 3.
7. A `.loft` is never outdated, as SPEC-ADDON-133 states.
   - After this ships and `video_frame_ocr` is back to `on_index`, the operator requests a
     `frame_ocr` reindex of each YouTube `.loft` that has frame text and a rule below 3
     (47 in production): active `indexed_files` rows with the `.loft` mime type,
     `loft_source` `youtube`, and at least one `video_frame_texts` row.
   - The operator sends five at a time. The next five go once each of the previous five
     has settled: `frame_ocr_read` true again, through a new read or `loft_media`'s
     failure cap.
   - A reindex of a `.loft` runs the first read of the downloaded file, as it does today,
     not the re-read of item 6. Its outcomes are today's, item 2.6 included.
   - The operation is done when every one of them has settled. This is an operation, not
     code.

### 2. Failure cases

1. An engine call fails on a frame. No text is stored for it, as today. It opens no
   segment, so it adds no lines.
2. A line's quad is unusable: not four points of two finite numbers, or the image has a
   width or height of 0.
   - That segment gets no `video_frame_lines` row.
   - Its text, chunks and search rows, and the flags, are written exactly as with usable
     quads.
   - One warning per such segment names the file id and the segment's start time.
3. The store transaction fails. Nothing is written, `video_frame_lines` included, as
   SPEC-ADDON-133 states for the store step.
4. An incomplete re-read (ffmpeg error or stall, `Unreadable`, no frame decoded,
   `times_failed`, an engine error), or a re-read that cannot start: as the revised
   SPEC-ADDON-133 I8 states.
5. A YouTube `.loft` whose video can no longer be downloaded is closed by `loft_media`'s
   failure cap during item 7's reindex.
   - It keeps its earlier text at its earlier rule, with no lines.
   - Its boxes cannot be produced again. Its text is not lost and stays searchable.
   - The operator sees this as that file's frame text closed with no new read. Nothing
     else is done.
6. A reindexed `.loft` is downloaded, but its read is incomplete or `Unreadable`. As
   today, the first read stores what it read. A partial read replaces the earlier text,
   and an `Unreadable` file leaves no text. Item 7's operator checks each settled file's
   text and requests the reindex again if it is short.
7. A native re-read that is incomplete closes the video at rule 3 with its earlier text
   and no lines (the revised SPEC-ADDON-133 I8). Such videos are the active native videos
   with `frame_ocr_read` true, `frame_ocr_rule` 3, at least one `video_frame_texts` row
   and no `video_frame_lines` row. A **Regenerate** reads one again.

### 3. States

`frame_ocr_rule` gains the value 3. A stored read is current at 3. It is outdated at
NULL, 1 or 2, but only for native videos under `on_index`.

Each combination of `frame_ocr_read`, `frame_ocr_indexed`, `frame_ocr_rule` and
`video_frame_lines` for a native video under `on_index` (under `manual` or `false`,
"Outdated" is not reached: a read below rule 3 stays as it is):

| State | read / indexed / rule | `video_frame_lines` | Moves out by |
|---|---|---|---|
| Never read | false / false / any | none | a store (to "Stored") |
| Stored, not built | true / false / 3 | one row per segment with usable quads | the build (to "Current"), a reindex, a purge |
| Current | true / true / 3 | one row per segment with usable quads | a reindex (to "Reindex requested"), a purge |
| Outdated | true / true / NULL, 1, 2 | none, or rows left by an earlier rule-3 read or an older build | a re-read's store (to "Stored"), an incomplete re-read (to "Kept") |
| Kept by an incomplete re-read | true / true / 3 | as before the re-read | a reindex, a purge |
| Reindex requested | false / false / unchanged | as before | a store |
| File inactive (soft-deleted or missing) | unchanged | unchanged | a purge (rows deleted) |

A `.loft` moves as SPEC-ADDON-117 states, and its stores follow the same rules:
- it is never outdated, so a read below rule 3 stays as it is;
- `loft_media`'s failure cap closes the frame flags true with the rule and
  `video_frame_lines` as they were, from "Never read" or "Reindex requested";
- a non-YouTube `.loft` is closed without a read;
- `_reopen_unclassified_lofts` reopens an unclassified `.loft` that has no frame text.

Transitions that never happen:
- `video_frame_lines` rows written by anything but the store step;
- rows deleted by anything but the store step or `_purge_file`;
- `frame_ocr_rule` lowered.

A build older than this change also leaves rows that may not match the text:
- when it stores a read, it writes rule 2 and does not touch `video_frame_lines`;
- when it purges a file, it does not delete them.

Such rows are accepted. The next store of that file deletes them, a file re-read under
this build is outdated, and no reader exists in this change. A future reader uses a
segment's row only when `chunk_text` of its lines joined by `\n` equals the
`video_frame_texts` chunks with the same `start_time` and `end_time`, in `chunk_index`
order.

### 4. Data read and written

- `search.db` gets a new table `video_frame_lines`:
  - columns: `id` INTEGER PRIMARY KEY, `file_id` TEXT NOT NULL, `segment_index` INTEGER
    NOT NULL, `start_time` REAL NOT NULL, `end_time` REAL NOT NULL, `lines_json` TEXT NOT
    NULL;
  - unique (`file_id`, `segment_index`), and an index on `file_id`;
  - created by a migration that only adds (`CREATE TABLE IF NOT EXISTS`, safe to run
    twice), on the same startup path as the frame OCR column migration.
- Rows are written by the store step only. They are deleted by the store step, and by the
  file purge `_purge_file`, which every purge path goes through, the drive purge
  included.
- `indexed_files.frame_ocr_rule` is written 3 where SPEC-ADDON-133 writes 2.
- `video_frame_texts`, the `text_content` embeddings and `fts_text_content` are
  unchanged.

### 5. External services

None. The `.loft` download is unchanged, and this change adds no download.

### 6. Authorization

None. No endpoint is added or changed, and no route reads `video_frame_lines`.

### 7. Effect on existing features

- Search, find in this file, Ask, the scene list, the Visual Index selection and the
  index details read `video_frame_texts` and the search rows. Those do not change.
- The background re-read of SPEC-ADDON-133 starts over.
  - Under `on_index`, every native video read so far is outdated again, rule 2 included.
    In production that is 3,508 native videos with frame text.
  - The re-read reads the same frames with the same engine calls as at rule 2, so a video
    costs what SPEC-ADDON-133 measured.
  - `pending.frame_ocr` and `pending.total` count those videos again, and
    `indexed.frame_ocr` drops to the videos read at rule 3.
- The production setting `video_frame_ocr` stays `manual` until this ships, then returns
  to `on_index`. Under `manual`, none of item 6 happens (SPEC-ADDON-133 I7).
- `docs/addons/intelligence.md` says only that videos read under the earlier rule
  (16 bits and 10 seconds) are read again. It will say instead that:
  - a video read under an earlier rule is read again in the background, so that its lines
    are stored with where they sit on the frame;
  - a `.loft` is not read again by itself.

### 8. Error behavior

Only logged: one warning per segment whose quads were unusable (item 2.2). Store and
re-read failures log as SPEC-ADDON-133 states. Nothing new is shown to a user.

### 9. User-visible behavior

Nothing directly. When the rule changes, the admin widget shows the frame text count drop
and the pending count rise. Both recover as the backlog is read again, as they did for
SPEC-ADDON-133.

### 10. Non-functional

- Size: one row per segment. At about 30 segments per video and a few lines each, a row
  is under a kilobyte, which is well under 100 MB for the whole library.
- Time: there is no extra engine call. Serialising the quads in the store step is
  negligible next to the engine time.
- The quads hold positions only, not pixels.

## Touch points

Intelligence addon repository:

- `addons/intelligence/app/workers/frame_ocr.py`:
  - `_Segment`: keeps the lines and their quads;
  - `_read_video`: records the lines of the frame that opens a segment;
  - `_chunks_for_segments` and `_store_read`: the store receives the segments, and
    writes and deletes `video_frame_lines`;
  - the callers of `_store_read`, `index_frame_ocr` and `_reread`, including the
    first-read `Unreadable` path that stores an empty read;
  - `FRAME_OCR_RULE`: 2 → 3.

  Read, and not changed beyond the constant: `_read_boxes`, the selection constants,
  `_keep_earlier_read`, `_build_rows`, `frame_read_is_outdated`.
- `addons/intelligence/app/models.py`: the new `VideoFrameLines`.
- `addons/intelligence/app/database.py`: the migration that creates `video_frame_lines`.
- `addons/intelligence/app/indexer.py`: `_purge_file` deletes the file's
  `video_frame_lines` rows, probing for the table as it does for `video_frame_texts`.
- `addons/intelligence/tests/`:
  - tests citing SPEC-ADDON-134;
  - existing tests that seed `frame_ocr_rule` 2 as the current rule and assert it is not
    outdated or is closed without an engine call. These are in
    `test_spec_addon_133_frame_ocr_outdated.py`, `test_spec_addon_133_frame_ocr_reread.py`
    and `test_frame_ocr_worker_reread.py`. They seed 3 instead and keep every assertion.
    A test name that says "rule two" says "current rule" instead.
  - existing tests that assert a stored or kept read writes 2 now expect 3;
  - the existing tests that seed outdated rules (NULL) also cover 2 as outdated, as an
    added case.

Core repository:

- `docs/addons/intelligence.md`: the re-read paragraph (item 7).
- The `addons/intelligence` gitlink, moved to the merged addon commit.
- The `docs/specs/INDEX.md` row of SPEC-ADDON-134.

Both repositories:

- Rules passed through: `.claude/rules/backend-conventions.md` (migrations only add).
  `.claude/rules/design-decisions.md` (data that cannot be regenerated) applies only to
  the boxes of a `.loft` whose source is gone (item 2.5).
- No protected path is edited.

## Invariants

I1. After a stored read, the file has exactly one `video_frame_lines` row per segment with usable quads and no other row: `segment_index` is the segment's position among all the read's segments, `start_time` and `end_time` are the segment's, and `chunk_text` of its lines' texts joined by `\n` equals that segment's `video_frame_texts` chunks in `chunk_index` order; a stored empty read leaves no row.
I2. Each stored line's quad is eight floats in `[0, 1]`, each equal to the corresponding corner of that line's box on the frame that opened the segment divided by the width (for `x`) or height (for `y`) of the image given to the engine, clamped and rounded to 4 decimal places, in the engine's corner order; a box the engine dropped adds no line, and a reused box gives this frame's quad with its earlier line.
I3. For the same video and engine answers, the frames read, the engine calls, the segments, the `video_frame_texts` rows, the `text_content` embeddings, the `fts_text_content` rows and the flags are those SPEC-ADDON-066 I2 and SPEC-ADDON-133 I1–I5 define.
I4. A segment with an unusable quad gets no `video_frame_lines` row and exactly one warning naming the file id and its start time, and its text, chunks, search rows and the flags are as they would be with usable quads.
I5. `lines_json` decodes to a list holding one object per kept line, in the order the lines are joined into the segment text, each with exactly the keys `text` (a string) and `quad` (a list of eight numbers).
I6. `video_frame_lines` rows are written only by the store step, in the same transaction as the `video_frame_texts` rows, and deleted only by the store step and `_purge_file`; the build step, a rebuild after a text-embedding model change, a reindex request and a store transaction that fails leave them byte for byte as they were.
I7. Purging a file deletes its `video_frame_lines` rows, and a purge on a database that has no `video_frame_lines` table still completes and deletes the file's other rows.

## Revises

SPEC-ADDON-133 I6. A stored read writes `frame_ocr_rule` 3 and `frame_ocr_indexed` false in the same transaction as its `video_frame_texts` and `video_frame_lines` rows, and the build that follows sets `frame_ocr_indexed` true only after the search rows exist; `frame_ocr_rule` is never lowered, and the rebuild-only path, a reindex and the closing paths that read nothing never write it; the migrations adding the column and the `video_frame_lines` table can run twice and leave existing rows' values and flags unchanged.

SPEC-ADDON-133 I7. Under `on_index`, every outdated native video (`frame_ocr_read` and `frame_ocr_indexed` true, `frame_ocr_rule` NULL or below 3) is queued at -10, counts in `pending.frame_ocr` and `pending.total` and not in `indexed.frame_ocr`, shows `status.frame_ocr` false in index details, gets a frame task at 100 from `prioritize`, and is read again when its task runs; under `manual` or `false`, or for a `.loft` at any rule, none of this happens, no download is queued, and a task that reaches such a row reads nothing. A rebuild after a text-embedding model change calls no engine whatever `frame_ocr_rule` holds.

SPEC-ADDON-133 I8. A running re-read changes no row and no flag before its store step. A re-read that is not complete (ended early, `Unreadable`, no frame decoded, `times_failed`, or an engine call raised on any frame) leaves the video's `video_frame_texts`, `video_frame_lines`, `text_content` and `fts_text_content` rows and its `frame_ocr_read` and `frame_ocr_indexed` as they were and sets `frame_ocr_rule` to 3; a re-read that cannot reach the file, create the engine, keep the engine, find the row active or write changes nothing, `frame_ocr_rule` and `video_frame_lines` included.

## Checked, no action

- **A screen that uses the boxes** (a cropped frame in search results, an outline on the
  video): a later spec, with its own design. This change only keeps the data.
- **Per-line segments**: a later spec. Keeping the lines per segment means they can be
  derived from stored data without reading again.
- **Making `.loft` reads outdated by rule**: rejected. Every future rule change would then
  download every YouTube `.loft` again. The 47 read before this change are read again
  once, by an operator reindex (item 7).
- **A quad per read frame rather than per segment**: a segment's text is fixed, and the
  opening frame's quad locates every line in it. Per-frame quads would multiply the rows
  by the number of reads per segment, with no planned use.
- **The engine's score per line**: `recognise_boxes` returns only the line, and a reused
  box has no fresh score. Not kept.
- **A column on `video_frame_texts` instead of a table**: a segment's text is split into
  overlapping chunks, so lines do not map to chunks. One row per segment avoids that.
- **The frame size in pixels**: not stored.
  - Normalised quads do not depend on the rendition.
  - The image given to the engine is the decoded frame, rotated as the player shows it
    (ffmpeg's auto-rotation) and scaled with its proportions kept. The fractions
    therefore apply to the displayed frame at any size.
- **Removing orphaned rows left by an older build's purge**: not done. The future-reader
  rule in item 3 ignores them, and the next store of the file deletes them.
- **Serialisation options** (`ensure_ascii=False`, compact separators): an
  implementation choice. I5 is the contract a reader relies on.
- **Rounding precision**: 4 decimal places is under 0.2 pixels on a 1920-pixel frame,
  finer than a box's own edge.
