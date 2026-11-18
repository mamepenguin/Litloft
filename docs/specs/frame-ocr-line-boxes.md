# Keep where each line of video frame text sits on the frame

SPEC-ID: SPEC-ADDON-134

Approval:

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

The frame reader (SPEC-ADDON-066, revised by SPEC-ADDON-133 and SPEC-ADDON-123) detects a
box for every line of text on a read frame, recognises it, and then keeps only the text:
each segment stores the lines joined by `\n`, and where they sat on the frame is thrown
away. A later screen could show a search hit as the frame cropped around the matched line,
or outline the line on the video, but only if the box was kept when the frame was read.
Reading every video again later costs days of engine time and a fresh download of every
YouTube `.loft`, while keeping the box now costs a few numbers per line.

This change keeps, for every stored segment, its lines in order, each with its box as a
quad normalised to the frame, in a new table `video_frame_lines`. It changes no screen,
no search result and no answer. It raises the frame read rule from 2 to 3, so that every
native video read without boxes becomes outdated and is read again in the background
exactly as SPEC-ADDON-133 already does for rule 2. A `.loft` stays never outdated; the
YouTube `.loft`s already read are read again once, by an operator reindex after this
ships (item 7).

Lines per segment also keep per-line spans derivable later without reading again: a
line's span is the run of consecutive segments that contain it.

## Required items

### 1. Normal flow

1. The frame reader reads frames exactly as SPEC-ADDON-133 and SPEC-ADDON-123 state:
   the same frames, the same engine calls, the same lines and the same segments.
2. When a read frame opens a segment (its joined text is non-empty and differs from the
   open segment's), the segment keeps that frame's lines, in the order they are joined
   into the segment text, each with its quad: the four corners of the line's detected
   box, each `x` divided by the width and each `y` by the height of the image given to
   the engine (`_ocr_image`), clamped to `[0, 1]`, as eight numbers
   `[x1, y1, x2, y2, x3, y3, x4, y4]` in the engine's corner order. A box the engine
   dropped (no line) is not kept. A read frame that continues the open segment changes
   nothing about the segment's lines.
3. A box reused from the previous read frame (SPEC-ADDON-123) takes its earlier line and
   this frame's detected quad, so a segment opened by a frame with reused boxes still has
   one quad per line, from the frame that opened it.
4. The store step (SPEC-ADDON-133 item 1, step A5) writes, in the same transaction as the
   `video_frame_texts` rows, one `video_frame_lines` row per segment: `file_id`,
   `segment_index` (0, 1, … in time order), `start_time` and `end_time` (the segment's,
   equal to the `start_time` and `end_time` of that segment's `video_frame_texts`
   chunks), and `lines_json`, a JSON list of `{"text": <line>, "quad": [8 numbers]}`.
   The lines' texts joined by `\n` equal the segment text, which `chunk_text` splits into
   that segment's `video_frame_texts` chunks. Every earlier `video_frame_lines` row of
   the file is deleted in that transaction. It writes `frame_ocr_rule` 3.
5. The build step (A6) reads only `video_frame_texts`, as today, and writes no
   `video_frame_lines` row.
6. `FRAME_OCR_RULE` becomes 3. Every native video whose read is stored with
   `frame_ocr_rule` NULL, 1 or 2 is outdated under `on_index` and is read again at
   priority -10, counted as pending, raised by `prioritize` and a reindex, and kept on an
   incomplete re-read, exactly as SPEC-ADDON-133 states for a rule below 2. An
   incomplete re-read sets the rule to 3 and leaves `video_frame_lines` as it was.
7. A `.loft` is never outdated, as SPEC-ADDON-133 states. After this ships the operator
   requests a `frame_ocr` reindex of each YouTube `.loft` with frame text (47 in
   production), a few at a time, which downloads and reads each again under rule 3. This
   is an operation, not code.

### 2. Failure cases

- An engine call fails on a frame: no text is stored for it, as today; it opens no
  segment, so it adds no lines.
- A quad that is not four points of two finite numbers, or an image of width or height 0:
  that segment gets no `video_frame_lines` row. The text, the chunks, the search rows
  and the flags are written exactly as without this change. A warning names the file.
- The store transaction fails: nothing is written, `video_frame_lines` included, as
  SPEC-ADDON-133 states for the store step.
- An incomplete re-read (ffmpeg error or stall, `Unreadable`, no frame decoded,
  `times_failed`, an engine error): `video_frame_texts`, the search rows, the flags and
  `video_frame_lines` stay as they were; `frame_ocr_rule` becomes 3.
- A re-read that cannot start (unreachable file, no engine, an engine lost partway, row no
  longer active, a write failure): nothing changes, `video_frame_lines` and the rule
  included.

### 3. States

`frame_ocr_rule` gains the value 3. A stored read is current at 3 and outdated at NULL, 1
or 2 (native videos under `on_index` only). Each stored read at rule 3 has one
`video_frame_lines` row per segment, except a segment whose quads were unusable
(item 2). A read at a lower rule, or kept by an incomplete re-read, may have no rows, or
rows written by an earlier rule-3 read of the same file. A file with no frame text has no
`video_frame_lines` rows.

A build older than this change that stores a read writes rule 2 and does not touch
`video_frame_lines`, so the rows it leaves may not match the text. Any future reader of
`video_frame_lines` uses a segment's lines only when their texts joined by `\n` equal the
text of that segment's `video_frame_texts` chunks merged in order. No reader exists in
this change. When this build next runs, such a read is outdated and is read again.

### 4. Data read and written

- `search.db`, new table `video_frame_lines` (`id` INTEGER PRIMARY KEY, `file_id`
  TEXT NOT NULL, `segment_index` INTEGER NOT NULL, `start_time` REAL NOT NULL,
  `end_time` REAL NOT NULL, `lines_json` TEXT NOT NULL; unique (`file_id`,
  `segment_index`); index on `file_id`). Created by a migration that only adds
  (`CREATE TABLE IF NOT EXISTS`, runs twice).
- Written by the frame reader's store step only; deleted there, and by the file purge
  `_purge_file` (which every purge path, the drive purge included, goes through).
- `indexed_files.frame_ocr_rule`: written 3 where SPEC-ADDON-133 writes 2.
- `video_frame_texts`, `text_content` embeddings, `fts_text_content`: unchanged.

### 5. External services

None. The `.loft` download is unchanged; this change adds no download.

### 6. Authorization

None. No endpoint is added or changed; `video_frame_lines` is read by no route.

### 7. Effect on existing features

- Search, find in this file, Ask, the scene list, the Visual Index selection and the
  index details read `video_frame_texts` and the search rows, which do not change.
- The background re-read of SPEC-ADDON-133 starts over: under `on_index` every native
  video read so far, at rule 2 included, is outdated again (3,508 native videos with
  frame text in production). The re-read reads the same frames with the same engine
  calls as at rule 2, so its cost per video is SPEC-ADDON-133's.
- `pending.frame_ocr` and `pending.total` count those videos again; `indexed.frame_ocr`
  drops to the videos read at rule 3.
- The production setting `video_frame_ocr` is `manual` until this ships, then back to
  `on_index`; under `manual` nothing of item 6 happens (SPEC-ADDON-133 I7).

### 8. Error behavior

Logged only: a warning per segment whose quads were unusable (item 2). Store and re-read
failures log as SPEC-ADDON-133 states. Nothing new is shown to a user.

### 9. User-visible behavior

None directly. The admin widget shows the frame text count drop and the pending count
rise when the rule changes, then recover as the backlog is read again, as it did for
SPEC-ADDON-133.

### 10. Non-functional

- Size: one row per segment. At about 30 segments per video and a few lines each, under
  a kilobyte per segment; well under 100 MB for the whole library.
- Time: no extra engine call. The store step serialises the quads; negligible against the
  engine time.
- The quads hold positions only, not pixels.

## Touch points

- `addons/intelligence/app/workers/frame_ocr.py`: `_Segment` (keeps lines and quads),
  `_read_video` (records the opening frame's lines), `_store_read` (writes and deletes
  `video_frame_lines`), `FRAME_OCR_RULE` 2 → 3. `_read_boxes`, the selection constants,
  `_keep_earlier_read`, `_build_rows`, `frame_read_is_outdated` are read, not changed
  beyond the constant.
- `addons/intelligence/app/models.py`: new `VideoFrameLines`.
- `addons/intelligence/app/database.py`: migration creating `video_frame_lines`.
- `addons/intelligence/app/indexer.py`: `_purge_file` deletes the file's
  `video_frame_lines` rows (probing the table as it does for `video_frame_texts`).
- `addons/intelligence/tests/`: tests citing SPEC-ADDON-134; existing tests that assert
  `frame_ocr_rule` 2 (SPEC-ADDON-133 tests among them) change only that expected value.
- Rules passed through: `.claude/rules/backend-conventions.md` (migrations only add),
  `.claude/rules/design-decisions.md` (data that cannot be regenerated: none here; the
  lines are regenerated by a read).
- No protected path is edited.

## Invariants

I1. After a stored read at rule 3, the file has exactly one `video_frame_lines` row per segment with usable quads, `segment_index` 0, 1, … in time order, each with the segment's `start_time` and `end_time`, and its lines' texts joined by `\n` equal to that segment's text, which is exactly the merge of its `video_frame_texts` chunks; no row from an earlier read remains.
I2. Each stored line's quad is eight finite numbers in `[0, 1]`: the four corners of that line's box on the frame that opened the segment, `x` divided by the width and `y` by the height of the image given to the engine, in the engine's corner order; a box the engine dropped adds no line.
I3. The text, segments, chunks, `video_frame_texts` rows, search rows, engine calls and frames read are the same as without this change for the same video and engine answers; a segment with an unusable quad gets no `video_frame_lines` row and changes nothing else.
I4. `video_frame_lines` rows are written and deleted only by the frame reader's store step, in the same transaction as the `video_frame_texts` rows, and deleted by `_purge_file`; the build step, a rebuild after a text-embedding model change, an incomplete re-read, a re-read that cannot start and a failed store leave them byte for byte as they were.
I5. A stored read writes `frame_ocr_rule` 3 and an incomplete re-read sets it to 3; under `on_index` a native video with a stored read at `frame_ocr_rule` NULL, 1 or 2 is outdated and is read again as SPEC-ADDON-133 states, and one at 3 is not.
I6. A `.loft` is never outdated, whatever its `frame_ocr_rule`; raising the rule queues no download.
I7. The migration creating `video_frame_lines` can run twice, drops, renames and rewrites nothing, and leaves every existing row and flag unchanged.

## Revises

SPEC-ADDON-133 I6. A stored read writes `frame_ocr_rule` 3 and `frame_ocr_indexed` false in the same transaction as its `video_frame_texts` and `video_frame_lines` rows, and the build that follows sets `frame_ocr_indexed` true only after the search rows exist; `frame_ocr_rule` is never lowered, and the rebuild-only path, a reindex and the closing paths that read nothing never write it; the migrations adding the column and the table can run twice and leave existing rows' values and flags unchanged.

SPEC-ADDON-133 I7. Under `on_index`, every outdated native video (`frame_ocr_read` and `frame_ocr_indexed` true, `frame_ocr_rule` NULL or below 3) is queued at -10, counts in `pending.frame_ocr` and `pending.total` and not in `indexed.frame_ocr`, shows `status.frame_ocr` false in index details, gets a frame task at 100 from `prioritize`, and is read again when its task runs; under `manual` or `false`, or for a `.loft`, none of this happens and a task that reaches such a row reads nothing. A rebuild after a text-embedding model change calls no engine whatever `frame_ocr_rule` holds.

SPEC-ADDON-133 I8. A running re-read changes no row and no flag before its store step. A re-read that is not complete (ended early, `Unreadable`, no frame decoded, `times_failed`, or an engine call raised on any frame) leaves the video's `video_frame_texts`, `video_frame_lines`, `text_content` and `fts_text_content` rows and its `frame_ocr_read` and `frame_ocr_indexed` as they were and sets `frame_ocr_rule` to 3; a re-read that cannot reach the file, create the engine, keep the engine, find the row active or write changes nothing, `frame_ocr_rule` included.

## Checked, no action

- **A screen that uses the boxes** (a cropped frame in search results, an outline on the
  video): a later spec with its own design. This change only keeps the data.
- **Per-line segments**: a later spec. The lines per segment keep it derivable from
  stored data without reading again.
- **Making `.loft` reads outdated by rule**: rejected. It would make every future rule
  change download every YouTube `.loft` again. The 47 read before this change are read
  again once by an operator reindex (item 7).
- **A quad per read frame rather than per segment**: a segment's text is fixed, and the
  opening frame's quad locates every line; boxes that move inside a segment move by less
  than the 0.8 IoU match allows when reused. Per-frame quads would multiply the rows by
  the reads per segment for no planned use.
- **The engine's score per line**: `recognise_boxes` returns the line only, and a reused
  box has no fresh score. Not kept.
- **A column on `video_frame_texts` instead of a table**: a segment's text is split into
  overlapping chunks, so lines do not map to chunks; one row per segment avoids that.
- **Frame size in pixels**: not stored. Normalised quads are independent of the
  rendition; a crop needs the frame at the segment's start, which the player or a frame
  grab supplies at its own size. The image given to the engine is the decoded frame
  (rotated as the player shows it), scaled so its short side is at most 1080 lines, so
  the fractions apply to the displayed frame.
