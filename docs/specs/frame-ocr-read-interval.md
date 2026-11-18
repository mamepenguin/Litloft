# Video frame text is read every 3 seconds, reusing unchanged text boxes

SPEC-ID: SPEC-ADDON-133
SPEC-ID: SPEC-ADDON-123

Approval: sha256:ce242fcb7edbe2b2146caa6d16027c09c341688228aea67ccc1a754b3d849426 Yuichi Senga 2026-11-18

## Summary

The video frame OCR (SPEC-ADDON-066) reads a frame only when its difference hash moved
by at least 16 bits and at least 10 seconds passed since the last read. Text that is on
screen for less than that is missed: a cooking video loses 「ごま油 小さじ1」, and on
seven measured videos the reads catch 0.20–0.79 of the distinct lines an every-second
read finds. This change, for the owner who searches their videos by on-screen text, does
two things. SPEC-ADDON-133 reads a frame when its hash moved by at least 8 bits and at
least 3 seconds passed, and re-reads videos already read under the old rule in the
background. SPEC-ADDON-123 keeps the added reads affordable: a text box whose pixels have
not changed since its text was recognised takes that text again instead of being
recognised a second time. Measured on the production Mac mini (M4, two engine threads),
the time per video hour goes from 1.2–6.1 to 3.9–14.3 minutes, and the share of lines
caught from 0.20–0.79 to 0.40–1.00.

Measurement (2026-11-17, hako `iMGA79Qrd0PZEACfbgQMs` and `4gyXOzOemorX-x6cfjRVM`):
each of seven clips (a 77 s cooking video, an anime episode, a home video, an English
subtitled talk, a conference pitch, a slide talk, a coding screencast; at most 600 s
each) was OCRed at every second, and each selection rule was replayed over that cache.
A "line" is a distinct recognised line after OCR spelling jitter (similarity 0.8) is
merged. The reuse figures below used a whole-box mean; the window rule this spec adopts
(item 1, step 3) reused 24–63 % of boxes on the two text-heavy clips against 32–46 % for
the whole-box mean, so the final figures are measured again before shipping (item 10).

| Clip | Now: min/h (caught) | This change: min/h (caught) |
|---|---|---|
| cooking | 1.6 (0.55) | 4.8 (1.00) |
| anime | 1.2 (0.20) | 3.9 (0.70) |
| home video | 2.8 (0.21) | 9.2 (0.40) |
| subtitled talk | 3.1 (0.31) | 9.4 (0.49) |
| pitch | 2.8 (0.42) | 9.0 (0.81) |
| slide talk | 5.0 (0.79) | 5.6 (0.86) |
| coding screencast | 6.1 (0.42) | 14.3 (0.69) |

Reuse saves 25–30 % on the slide talk and the screencast and nearly nothing elsewhere.
Every sampled reused box whose fresh recognition differed from the reused text was
recognition jitter of the same pixels (「スマサポ」/「スマサボ」, 「IOSDC」/「1OSDC」,
「9」/「6」 flipping back and forth), not a change of text.

The production library holds 8,834 native videos, 1,928 hours in total, all read under
the old rule (and 6,562 `.loft` references, which this change never re-reads by
itself). At 4–14 minutes per video hour the automatic re-read is about 130–450 hours of
engine time, roughly 9–11 days at the clips' mix.

## Required items

### 1. Normal flow

Reading one video (the frame reader of SPEC-ADDON-066, `index_frame_ocr`):

1. The video is decoded as today: one frame per second up to 1080 lines on the short
   side, key frames only above that (SPEC-ADDON-066 revision, `feature-frame-ocr`).
2. The first decoded frame is read. A later frame is read when its 256-bit difference
   hash differs from the last read frame's by at least **8** bits and at least **3**
   seconds passed since that read. Before this change: 16 bits and 10 seconds. The
   frame reader gets constants of its own; the frame scan keeps the shared ones.
3. Reading a frame (SPEC-ADDON-123). All geometry is in the image passed to the engine
   (after `_ocr_image` scaling), in integer pixels. A box is the axis-aligned bounding
   rectangle of a quadrilateral the engine's detection returns. **Detection order** is
   the order of the boxes after the engine's own box sorting, which is the order in
   which one `engine(image)` call returns its lines.
   1. A frame makes at most two engine calls: detection, then one call that classifies
      and recognises every box needing it, using the engine's own preprocessing, crop,
      classification, recognition and `text_score` steps (the ones `engine(image)`
      runs, in the pinned RapidOCR). Both go through the same one-at-a-time lock as
      `run_engine`, whose existing whole-image form stays unchanged for its other
      callers (`index_ocr`, `page_ocr`, `image_query`). Before each call the reader
      waits while the indexing queue is paused, then continues the same frame. Time
      spent paused does not count towards the 120 s stall limit.
   2. The boxes of this frame are taken in detection order. Each looks among the boxes
      of the previous read frame not yet taken by an earlier box of this frame, for
      those whose unpadded rectangles have intersection over union of at least 0.8
      with it, and picks the one with the highest; a tie goes to the earlier box in the
      previous frame's detection order. A picked box is taken whether or not the
      region test below passes.
   3. The picked box's region is unchanged when, over this frame's box padded by
      4 pixels and clipped to the image, the absolute difference of grayscale values
      between this frame and the picked box's recognition frame has a mean below 2.0 in
      every window. Grayscale is PIL's `L` conversion (ITU-R 601-2 luma, 0–255). The
      windows are squares whose side `s` is the padded box's shorter side, placed along
      its longer side at offsets 0, `max(1, s // 2)`, 2 × that, … while the offset is
      inside the box; a window that reaches past the end is cut at the end and averages
      only the pixels inside. A box at least as wide as it is tall is walked left to
      right, a taller one top to bottom.
   4. An unchanged match gives this box the picked box's result again: its line, or no
      line when the engine dropped that box (`text_score`).
   5. Every other box is recognised in the frame's recognition call. A box's
      recognition frame is the frame where its result was last recognised: this frame
      for a recognised box, the picked box's recognition frame for a reused one. The
      reader keeps the full grayscale image of every recognition frame that a box of
      the last read frame refers to, and no other.
   6. The frame's text is its lines in detection order joined by newlines, as today.
4. If an engine call of a frame raises, the frame's text is empty, as today, and its
   boxes are not offered to the next frame. If the engine cannot be obtained between
   the two calls of one frame, the read ends as an engine loss (SPEC-ADDON-066 I4:
   nothing written).
5. Segments and chunks are built as SPEC-ADDON-066 I2 states.

Storing and re-reading (SPEC-ADDON-133):

6. A new nullable integer column `indexed_files.frame_ocr_rule` records the selection
   rule a stored read was made under. A read stored under this change writes `2`, and
   the store step also sets `frame_ocr_indexed` false, so the rows are then built as
   after a first read (SPEC-ADDON-066 A5 → A6). Between the two steps the video has no
   `text_content` rows (SPEC-ADDON-066 I2); a failed build leaves it pending and the
   next run rebuilds from the stored read (SPEC-ADDON-066 I3). Rows read before this
   change have NULL, meaning the old rule.
7. A row is **outdated** when it is an active video (not a `.loft`), `frame_ocr_read`
   and `frame_ocr_indexed` are true, `frame_ocr_rule` is NULL or below 2, and
   `video_frame_ocr` is `on_index`. `_collect_incomplete` also selects outdated rows,
   and `_resume_incomplete` queues a `FRAME_OCR` task at -10 for each.
8. The worker decides when the task runs, from the row and the current mode:
   - `frame_ocr_read` false: read, as today.
   - `frame_ocr_read` true and `frame_ocr_indexed` false: rebuild only, calling no
     engine, as today, whatever `frame_ocr_rule` holds.
   - Outdated: read again (a **re-read**).
   - Otherwise (done under the new rule, done and the mode is not `on_index`, or a
     `.loft` that is done): close as done without reading.
9. An outdated row counts as pending frame OCR and not as indexed:
   `IndexStatus.pending_frame_ocr`, `pending.frame_ocr` and `pending.total` include it
   and `indexed.frame_ocr` excludes it (`get_status` and the status endpoint in
   `main.py`), so the widget's `indexed + pending` stays the number of videos. Index
   details report its `status.frame_ocr` as `false`. `prioritize` queues it at 100 like
   any pending frame task. A reindex request for `frame_ocr` on a video that is outdated
   at request time and has a frame task queued (not running) answers `already_queued`,
   as today, and raises that queued task to 100, changing no flag, as the `.loft`
   reindex does (SPEC-ADDON-117 I13). Any other reindex of `frame_ocr`, including one
   while a frame task runs, behaves as today. The status, index details, `prioritize`
   and reindex all use one shared definition of "outdated".
10. Re-reads do not hold back `.loft` work: the rule that no backlog `.loft` download
    starts while a native `frame_ocr` task is queued or processing counts only native
    tasks that are not re-reads (Revises, SPEC-ADDON-117 I3).

### 2. Failure cases

- An engine call fails on a frame, or the engine is lost partway: item 1, step 4.
- A first read or a reindex: every outcome as today (SPEC-ADDON-066 I4). A stored read
  writes `frame_ocr_rule` 2.
- A re-read whose outcome is anything but a complete read, that is: it ended early
  (ffmpeg error or stall while the file is still reachable), found the file
  `Unreadable`, decoded no frame, had key-frame times that did not match
  (`times_failed`), or had an engine call raise on any frame. It writes nothing to
  `video_frame_texts`, the search rows, `frame_ocr_read` or `frame_ocr_indexed`. It
  sets `frame_ocr_rule` to 2, so the video keeps its earlier read and is not tried
  again automatically; a reindex still reads it.
- A re-read that cannot reach the file, cannot create the engine, loses the engine
  partway, finds the row no longer active, or fails to write: nothing is written,
  `frame_ocr_rule` included, and a later backlog pass tries again.
- Until a re-read's store step, a running re-read changes no row and no flag, so the
  earlier frame text stays searchable while it runs.
- A `.loft` is never re-read automatically; a reindex reads its downloaded source under
  the new rule as any reindex does.

### 3. States

Per native video, with `R` = `frame_ocr_read`, `X` = `frame_ocr_indexed`, `F` =
`frame_ocr_rule`, and "outdated" as in item 1, step 7:

| From (R, X, F) | Event | To |
|---|---|---|
| (false, false, any) | read stored | (true, false, 2), then build → (true, true, 2) |
| (false, false, any) | read fails (SPEC-ADDON-066 I4) | unchanged |
| (true, false, any) | build succeeds | (true, true, same F) |
| (true, false, any) | build fails | unchanged, retried |
| (true, true, NULL), outdated | re-read stored | (true, false, 2), then build → (true, true, 2) |
| (true, true, NULL), outdated | re-read incomplete (item 2) | (true, true, 2), earlier rows kept |
| (true, true, NULL), outdated | re-read unreachable, no engine, engine lost, inactive, write failure | unchanged, retried |
| (true, true, any) | text-embedding model change (`database.py`) | (true, false, same F); after the build, a row with F NULL is outdated again |
| (true, true, NULL), not `on_index` | none (not outdated) | unchanged; becomes outdated if the mode is set to `on_index` and the process restarts |
| any | reindex `frame_ocr` | R and X false, F unchanged |
| (true, true, 2) | none | unchanged |

A `.loft` follows SPEC-ADDON-066 and SPEC-ADDON-117 as today; a stored read of its
source writes F = 2, and it is never outdated.

Forbidden: F never goes from 2 to NULL or lower. F is written only by a stored read and
by an incomplete re-read. The rebuild-only path, a reindex, the `.loft` cap and
`other`-source closings, and the closing of an inapplicable MIME type never write F.

Per box within one read: recognised in this frame, or reused from a box of the previous
read frame, carrying its recognition frame along.

### 4. Data read and written

- `indexed_files`: new column `frame_ocr_rule` (INTEGER, nullable), added by a migration
  that can run twice. Written by the frame reader as items 1 and 2 state; read by
  `_collect_incomplete`, `_resume_incomplete`, the worker, `get_status`, index details,
  `prioritize` and reindex.
- `indexed_files.frame_ocr_indexed`: now also set false by a stored re-read (item 1,
  step 6).
- `video_frame_texts`, `text_content` embeddings, `fts_text_content`: written exactly as
  today (SPEC-ADDON-066 I2), now with more segments per video.
- Video files: read only, as today.
- No other table or file.

### 5. External services

None. The OCR engine runs in-process. A `.loft` is never re-read automatically, so the
change adds no download from YouTube.

### 6. Authorization

None changes. The reader runs as the background indexer with no request context; the
drive policy gates (`index` feature) apply as they do today.

### 7. Effect on existing features

- **Frame scan** (`app/workers/frame_scan.py`, SPEC-ADDON-111) keeps 16 bits and
  10 seconds. Its change frames and `vec_clip_change` rows do not change.
- **Representative-frame selection** (`app/workers/video_visual_selection.py`) reads
  `video_frame_texts` to mark representatives as textual and to merge scenes by shared
  text. With shorter, more numerous segments, the live scene list
  (`GET /files/{id}/scenes`), the frames the single-file question picks, and a Visual
  Index built after the re-read can choose and merge differently. A Visual Index run
  stored before the re-read stays as it is until it is regenerated; nothing marks it
  stale.
- **Search, Ask, find in file, `/search/exact`** read the same rows in the same shape.
  They see more `screen_text` segments, with start times within 3 seconds of the text's
  first appearance instead of within 10. Between a re-read's store and build (normally
  seconds), the video's frame text is out of search and find in file reports it as not
  indexed when it has no transcript (`file_find._stage_done`), as after a first read.
- **`.loft` backlog fetches** wait today while any native `frame_scan` or `frame_ocr`
  task is queued or processing (SPEC-ADDON-117 I3). Without step 10 the re-read would
  stop them for its 9–11 days; with it, they keep going alongside the re-read.
- **Picture OCR, scanned-PDF page OCR and image queries** share the engine and
  `run_engine`'s one-at-a-time lock. They now wait between more, shorter engine calls. An image query that waits
  with a timeout may time out more often while the re-read runs; its behaviour on
  timeout is unchanged.
- **The backlog**: the re-read adds every native video at -10, behind new files
  (priority 0), prioritized files and reindexes (100).
- **Status widget and index details** show the re-read as pending frame OCR (item 1,
  step 9).
- Visual Index CLIP, transcription: unchanged.

### 8. Error behavior

As today: a failed frame logs one warning (`Frame OCR failed for one frame`), a failed
read leaves the video pending with the existing log lines. An incomplete re-read logs
one warning naming the outcome and that the earlier read was kept, in place of the
first-read lines for that outcome ("keeping the frames read", "closing it as read"),
which would be false for a re-read. Nothing new is shown
in the UI beyond the pending counts of item 1, step 9.

### 9. User-visible behavior

- More on-screen text is found by search, Ask and find in file, and its times are
  closer to when it appeared.
- A video's frame-text work takes up to about 2–3 times as long, more for videos dense
  with text.
- After the upgrade, under `on_index`, every native video counts as pending frame OCR
  and not as indexed until re-read, so the status widget's frame OCR bar drops to near
  zero and climbs over days. Old frame text stays searchable until each video's re-read
  is stored.
- Index details show 「動画内の文字」 as not done for a video waiting for its re-read.
- Scenes and their merging may change for videos whose frame text was re-read (item 7).
- `docs/addons/intelligence.md` (the frame-OCR paragraph and its "what is missed"
  paragraph) states the new rule, the box reuse, the re-read and the measured cost.

### 10. Non-functional

- Time: about 10 minutes per video hour on the production Mac mini, at most 15 for
  videos dense with text. This replaces the B2b target of about 5 minutes
  (`feature-frame-ocr` clarifications).
- Shipping gate, per clip. The implementing session:
  - commits the measuring harness under `scripts/dev/frame_ocr_bench/`: an
    every-second reference read, and a run of the frame reader as built that reports
    the engine time (decoding excluded) per video hour and the share of reference
    lines its segments catch, lines merged at similarity 0.8;
  - uses the seven clips of 2026-11-17, kept on the development Mac under
    `~/Downloads/動画サンプル/` (first 600 s of the anime, home video, subtitled talk,
    slide talk and coding screencast, first 400 s of the pitch) and the 77 s cooking
    video, and names each file in `decisions.md`;
  - runs the harness on the production Mac mini in a one-off container of the addon
    image to be merged, mounting only the clips and an output directory (no `data/`),
    with the production intelligence queue paused for the run and resumed after;
  - records the minutes per video hour and the share caught per clip in
    `docs/process/reviews/<topic>/decisions.md`.
  If any clip exceeds 15 minutes per video hour, or catches a share more than 0.05
  below this spec's table, stop and ask. The 10-minute figure is a description, not a
  gate.
- Size: production holds 102,277 frame-text rows (1.3 M characters) in a 9.5 GB
  `search.db`. Two to three times as many segments and their embeddings is expected,
  well under 1 GB added.
- Concurrency: one engine call at a time across all callers, as today. The frame reader
  makes no call while the queue is paused, counting detection and recognition calls
  separately.
- Memory: at most one full grayscale image per box of the last read frame (in practice
  a few distinct frames), at the engine input size.
- Privacy: no change. Nothing leaves the container.

## Touch points

**Addon** (intelligence repository):

- `addons/intelligence/app/video_frames.py`: the shared `GAP_SECONDS` and
  `HASH_BITS_THRESHOLD` stay for the frame scan; the frame reader's rule is separated
  from them.
- `addons/intelligence/app/workers/frame_ocr.py`: selection constants, the per-box
  reading (detection, matching, windowed comparison, the recognition call), pause
  checks inside a frame, the worker's read / rebuild / re-read / close decision, the
  re-read outcomes, the store step (`frame_ocr_rule`, `frame_ocr_indexed`).
- `addons/intelligence/app/workers/frame_scan.py`: read only. Its module docstring calls
  the shared constants "the frame-OCR rule" (prose to correct).
- `addons/intelligence/app/workers/ocr.py`: `run_engine` and its lock; the engine's
  detection, crop, classification and recognition steps, called separately. The
  whole-image `run_engine` keeps its behaviour for `index_ocr`,
  `app/workers/page_ocr.py` and `app/image_query.py` (read only).
- `addons/intelligence/app/workers/loft_media.py` and the `.loft` download gate in
  `indexer.py`: the native-task condition of SPEC-ADDON-117 I3 excludes re-reads; a
  `.loft` read (`loft_media` calls `index_frame_ocr`) writes `frame_ocr_rule` 2 through
  the store step.
- `addons/intelligence/app/indexer.py`: `_collect_incomplete` (outdated rows),
  `_resume_incomplete` (queueing them at -10), `get_status` / `IndexStatus`
  (`pending_frame_ocr`, `frame_ocr_indexed` count), `prioritize`, and raising a queued
  task's priority for reindex.
- `addons/intelligence/app/main.py`: the status endpoint's `indexed.frame_ocr`,
  `pending.frame_ocr` and `pending.total`.
- `addons/intelligence/app/routers/files.py`: index details' `status.frame_ocr`;
  reindex (`frame_ocr` resets R and X, leaves F; a queued re-read is raised to 100).
- `addons/intelligence/app/file_find.py`: read only; `_stage_done` reads
  `frame_ocr_indexed`, which a re-read now sets false between store and build.
- `addons/intelligence/app/workers/video_visual_selection.py`, `app/routers/scenes.py`,
  `app/rag/file_question.py`, `app/workers/video_visual.py`: read only; their results
  change with the new segments (item 7).
- `addons/intelligence/frontend/IndexDetailsDialog.tsx`, `IndexStatusWidget.tsx`: read
  only; they show what the backend reports.
- `addons/intelligence/app/models.py`, `app/database.py`: the `frame_ocr_rule` column
  and its migration.
- `addons/intelligence/tests/`: tests citing SPEC-ADDON-133 and SPEC-ADDON-123, and the
  existing frame-OCR tests that assert the 10 s / 16-bit selection, the pending counts
  or the reindex answer.

**Core:**

- `docs/addons/intelligence.md`: the video frame OCR paragraphs.
- `docs/specs/INDEX.md`: the two rows.
- `scripts/dev/frame_ocr_bench/`: the measuring harness of item 10.
- The `addons/intelligence` submodule pointer, bumped after the addon PR merges.

**Rules passed through:**

- `.claude/rules/backend-conventions.md`, *Database migrations*: the column is added,
  nullable. Nothing is dropped or reinterpreted.
- `.claude/rules/backend-conventions.md`, language-dependent rules: box matching is a
  pixel comparison and reads no language; it treats horizontal and vertical boxes
  alike.
- `.claude/rules/design-decisions.md`, *Transcript Refine* "Automatic paths never
  overwrite a correction": video frame text has no correction or kept original today
  (only transcripts and picture text do), so the automatic re-read overwrites nothing a
  person wrote. If frame text later gains corrections, that change must exclude
  corrected videos from the re-read.
- `.claude/rules/design-decisions.md`: the drive boundary (the reader writes only its
  own file's rows).
- No protected path is edited: no Dockerfile, requirements, Internal API, core backend,
  core DB or gate change.

## Invariants

I1. A video, or the downloaded source of a `.loft`, is read at its first decoded frame and at a later decoded frame only when that frame's 256-bit difference hash differs from the last read frame's by at least 8 bits and at least 3 seconds have passed since that read, so no two read frames are less than 3 seconds apart; the frame scan's change seconds still use 16 bits and 10 seconds.
I2. For a read frame in which no box is reused (the first read frame, a frame after a failed frame, a frame whose boxes all changed), the stored lines and their order equal those of one `engine(image)` call on the same image, including boxes the engine drops.
I3. A detected box takes an earlier result only from a not-yet-taken box of the previous read frame with intersection over union of at least 0.8 (the highest such), and only when every square window along the padded box (side = its shorter side) has a mean absolute grayscale difference below 2.0 against the frame where that result was recognised, never against a frame that only reused it; a change whose mean difference within one window is 2.0 or more is therefore recognised again, whatever the box's length or direction. A picked box is taken whether or not it passes.
I4. A reused box gives exactly the earlier result: the same line, or no line when the engine dropped that box.
I5. A frame where any engine call fails stores no text, as today, and none of its boxes is reused by the next read frame.
I6. A stored read writes `frame_ocr_rule` 2 and `frame_ocr_indexed` false in the same transaction as its `video_frame_texts` rows, and the build that follows sets `frame_ocr_indexed` true only after the search rows exist; `frame_ocr_rule` is never lowered, and the rebuild-only path, a reindex and the closing paths that read nothing never write it; the migration adding the column can run twice and leaves existing rows' values and flags unchanged (NULL).
I7. Under `on_index`, every outdated native video (`frame_ocr_read` and `frame_ocr_indexed` true, `frame_ocr_rule` NULL or below 2) is queued at -10, counts in `pending.frame_ocr` and `pending.total` and not in `indexed.frame_ocr`, shows `status.frame_ocr` false in index details, gets a frame task at 100 from `prioritize`, and is read again when its task runs; under `manual` or `false`, or for a `.loft`, none of this happens and a task that reaches such a row reads nothing. A rebuild after a text-embedding model change calls no engine whatever `frame_ocr_rule` holds.
I8. A running re-read changes no row and no flag before its store step. A re-read that is not complete (ended early, `Unreadable`, no frame decoded, `times_failed`, or an engine call raised on any frame) leaves the video's `video_frame_texts`, `text_content` and `fts_text_content` rows and its `frame_ocr_read` and `frame_ocr_indexed` as they were and sets `frame_ocr_rule` to 2; a re-read that cannot reach the file, create the engine, keep the engine, find the row active or write changes nothing, `frame_ocr_rule` included.
I9. No two engine calls run at once across all callers. The frame reader makes at most one detection and one recognition call per frame, starts none while the indexing queue is paused (including between the two calls of one frame), does not count paused time towards the 120 s stall limit, and keeps across frames only the grayscale images of recognition frames that a box of the last read frame refers to.
I10. A reindex of `frame_ocr` on a video that is outdated and has a frame task queued answers `already_queued` and leaves exactly one queued frame task for it, at priority 100, with its flags unchanged.
I11. A backlog `.loft` download is not held back by a queued or processing native re-read; it is still held back by any other native `frame_scan` or `frame_ocr` task, as SPEC-ADDON-117 I3 states.

## Revises

SPEC-ADDON-066 I1. A video is read only at its first decoded frame and at frames whose 256-bit difference hash differs from the last read frame's by at least 8 bits and that come at least 3 seconds after it, so no two read frames of a video are less than 3 seconds apart.

SPEC-ADDON-117 I3. No download starts while another fetch runs, while the queue is paused, at priority -10 while a native `frame_scan` or `frame_ocr` task that is not a re-read of an outdated read (SPEC-ADDON-133) is queued or processing, while the drive's `index` feature is off, when no stage is wanted, when the model or engine a wanted stage needs is unavailable, or when the disk guard fails; a fetch that ends before its stages ran changes nothing but the duration (from NULL after a lookup), the loft source, the failure count, the flags closed for source `other`, the wanted stages closed at the cap, and the candidates, tile files and `clip_indexed` its storyboard step wrote (SPEC-ADDON-121).

SPEC-ADDON-117 I10. On every start, the fetch directory is emptied and every unclassified `.loft` with no scan row and no frame-text row has its three flags opened, both before any `loft_media` task is queued, and no native video's or classified `.loft`'s flags are changed by that step; `/status` counts pipeline videos and unclassified `.loft`s as native videos with the same flags (`pending.frame_ocr` under `on_index` only), except that a native video's outdated read (SPEC-ADDON-133) counts as pending frame OCR and a `.loft` is never outdated, and never counts a `.loft` of source `other`.

## Checked, no action

- **Adaptive gaps** (read again 2–3 s after the text changed, 10 s otherwise, with or
  without holding the short gap for two unchanged reads): on the same seven clips they
  lie on the same cost–recall line as fixed gaps and gave no advantage. Rejected.
- **A text-or-no-text gate** before OCR (detection at 360p, a CLIP probe, or a "decision
  model"): the engine scales any input up to 736 lines for detection, so a 360p
  detection still costs about half. It missed 5 of 8 and 7 of 11 text frames on two
  clips, and frames from online videos almost always carry a logo or caption, so it has
  little to skip. Rejected.
- **Detecting only the changed region**: the frames that reach OCR were selected by the
  whole-frame hash, and the bounding box of their changed area is a median 80–100 % of
  the frame. Nothing to save. Rejected.
- **Discarding "uninteresting" text** (a brand name on an appliance): the decision needs
  the recognised text, so it saves no time. It would also silently drop text the owner
  may search for. Rejected.
- **A whole-box mean** for the unchanged test: one changed digit in a 1200×50 line
  moves the mean by under 1.0, so the old number would stay. The window rule bounds the
  area a change is averaged over by the box's shorter side. A change smaller than a
  character (a period becoming a comma) can still stay under 2.0 in its window and keep
  the old result; that is accepted.
- **Recognising reused boxes' neighbours in a smaller batch**: on a frame with some
  boxes reused, the engine recognises a subset, and its batching can pad crops
  differently from a whole-frame call. The recognised text of such a frame may differ
  from `engine(image)` at the level of recognition jitter; I2 covers only frames with no
  reuse.
- **Writing the re-read's text and search rows in one transaction**: not done. The
  store-then-build split of SPEC-ADDON-066 is kept, with `frame_ocr_indexed` set false
  at the store, so a failed build is retried as after a first read.
- **Per-line segments**: a segment is the whole frame's text, so a persistent logo or
  caption repeats in each segment when another line changes. Box reuse removes the
  repeats caused by recognition jitter but not these. Changing the stored shape is a
  separate change, agreed with the owner on 2026-11-17.
- **More engine threads** (`ENGINE_THREADS` is 2 on a 10-core M4): not measured and not
  requested. It competes with the other indexing workers.
- **The frame scan's rule**: kept at 16 bits / 10 s. Changing it would change the Visual
  Index's change frames and needs its own measurement.
- **Marking stored Visual Index runs stale after a re-read**: not done. A stored run
  stays until regenerated, as stored v2 runs did when representative frames v3 shipped.
- **A rollback to an older build**: an older build ignores `frame_ocr_rule`. A read it
  stores keeps the value the column already had, so a video read again by the old rule
  may still be marked 2. Rollbacks are rare and the text is only less complete. Accepted.
- **Key frames above 1080p**: the 3-second gap applies to key-frame times. A video whose
  key frames are further apart is read at every key frame that passes the hash test, as
  today.
- **Denser segments and readers' limits**: find in file caps its rows at 2000
  (SPEC-ADDON-061) and reports truncation; search, Ask and `/search/exact` rank and cap
  results as today. More segments can push a video's find answer past the cap sooner.
  Accepted.
