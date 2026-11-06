# Text in video frames and scanned PDF pages becomes searchable

SPEC-ID: SPEC-ADDON-066
SPEC-ID: SPEC-ADDON-069
SPEC-ID: SPEC-CORE-048

Approval:

## Summary

Two kinds of text cannot be found today:

- **Text shown in a video**: slides, terminal output and captions burned into the picture.
  Only the Visual Index reads it, and that runs a vision LLM per scene, which is too heavy
  to run on every video.
- **The text of a scanned PDF page**, a page with no text layer. The PDF extractor skips
  such a page (`addons/intelligence/app/extractors/pdf.py:370-374`, `:445-446`), so it has
  no chunk, no search hit and no find row.

This change reads both with the engine picture OCR already uses (SPEC-ADDON-050:
RapidOCR 3.10.0, PP-OCRv6 small detection and recognition, recognition `LangRec.JAPAN`,
2 threads; `addons/intelligence/app/workers/ocr.py:55-69`). No LLM or vision model is
involved.

- **Video frames (SPEC-ADDON-066).** The video is decoded at one frame per second. A
  frame is read when it looks different enough from the last frame that was read, and at
  least 10 seconds after it. The text is stored with the time it was on screen, and
  becomes the video's text chunks. Search, Ask and the single-file question find it, and
  find-in-file (B2, SPEC-ADDON-061) lists it under 「画面内の文字」 with its time.
- **Scanned PDF pages (SPEC-ADDON-069).** Each page with an empty text layer is rendered at
  300 dpi and read. The text is stored per page, and the PDF's text extraction uses it for
  that page. The page's text then behaves like any other page's text: search hits on the
  page, find rows 「p. N」 that open the page, Ask, summaries and `read_document`.
- **Search passages (SPEC-CORE-048).** A passage found in a video's frame text is shown
  with its time and 「画面内の文字」, and opens the video at that time.

### What was measured (2026-11-06)

A trial on the development Mac (Apple M3 Max, OrbStack, the intelligence image, RapidOCR
3.10.0 with the settings above, 2 ORT threads). The human chose not to repeat it on the
production Mac mini.

**Scanned PDF.** JIS Z 2801 (CC0), 28 pages, rebuilt as image-only pages (text layer
0 characters).

| Rendering | Render | OCR | Total per page | Slowest page |
|---|---|---|---|---|
| 200 dpi (1653×2337) | 0.05 s | 2.47 s | 2.52 s | 4.05 s |
| 300 dpi (2480×3505) | 0.09 s | 2.51 s | 2.60 s | 4.20 s |

Under load from other containers 300 dpi took 3.4–3.5 s per page; with 4 threads, 1.75 s.
The text at 300 dpi was good, better than archive.org's OCR layer for the same book. The
pass criterion was at most 3 s per page.

**Video.** Four CC-BY lecture videos from YouTube, 1280×720, 92.8 minutes in all.
Selection: 1 frame per second, scaled to 160 px wide grayscale, a 16×16 difference hash
(256 bits), a frame selected when it differs from the last selected frame by 16 bits or
more. Selected frames were read at source resolution. Recall is the share of the distinct
text lines that OCR of every second frame finds in a 10-minute excerpt, also found in the
selected frames.

| Video | Content | Minutes per video hour | Frames per hour | Recall |
|---|---|---|---|---|
| K_h43OO89bo | English slides | 2.8 | 110 | – |
| OZadUvOXkxc | English slides and speaker | 4.1 | 182 | 0.93 (0.99 at 8 bits) |
| eyHnGEqVij8 | Japanese, handwriting on slides | 19.2 | 2473 | 0.89 |
| rWGP9uWfeco | Japanese, handwriting on slides | 17.4 | 2339 | – |

- Decoding and selection took about 1 minute per video hour; OCR is the rest. OCR took
  0.58 s per frame on eyH and 1.97 s on OZ (denser text).
- The numbers include 20–35 % contention from other containers.
- With a minimum gap between read frames: eyH at 5 s 5.0 min/h with recall 0.62; at 10 s
  2.6 min/h with recall 0.50. OZ at 10 s 2.1 min/h with recall 0.99.
- The pass criterion was at most 5 minutes per video hour. Without a gap, handwriting
  lectures were 3.5 to 4 times over it. The human chose the 10-second gap and accepted
  that text being written is partly missed (recall about 0.5 on such lectures).

The trial applied the gap by thinning the selected frames afterwards. This spec applies
it while selecting, against the last frame actually read (Normal flow, A3), which reads
at least the frames the thinning kept for a change that stays on screen.

The human decided the requirements on 2026-11-05 and 2026-11-06 (hako `p_XmkcHJMhBnNt-EPKhHJ`,
`sp1Eo5RSgiFKB8oj87fqV`).

### Owner decisions (2026-11-06)

The owner answered the eight questions the draft raised with 「8 つとも推奨どおり」, and
accepted the settings labels 「動画内の文字」 and 「スキャンしたページの文字」 as proposed, with
no Design Artifact. The body below states each as decided:

1. Both `features.video_frame_ocr` and `features.scanned_pdf_ocr` default to `on_index`.
2. Resolution above 720p is measured as the first implementation step (1080p and 4K HEVC),
   which stops and asks if either exceeds 5 minutes per video hour (Non-functional).
3. The fixed 10-second gap stays. The worst case it allows, a dense-text screen changing
   every 10 seconds (360 frames at about 2 s, about 12 minutes per video hour), is
   accepted; there is no adaptive budget.
4. The image query's text part failing more often during the backlog is accepted.
5. The search passages gain the `screen_text` kind (SPEC-CORE-048).
6. The pending window of a scanned PDF's `text` stage and find `indexed` during its forced
   re-extraction is accepted.
7. A partly scanned PDF that already has a summary keeps it: the re-queue uses
   `requeue_after_whisper`'s gates.
8. In find, Visual Index scene rows and frame-text rows are both listed; a word both found
   can appear twice near the same time.

## Required items

### 1. Normal flow

#### A. Video frames (SPEC-ADDON-066)

1. **Which files.** Active files whose mime type is in `VIDEO_TYPES` (`video/mp4`,
   `video/webm`, `video/quicktime`, `video/x-matroska`;
   `addons/intelligence/app/workers/clip.py:76`). Not `.loft` references (no local video)
   and not audio.
2. **Queueing.** A new task type `FRAME_OCR` beside `TaskType.OCR`
   (`addons/intelligence/app/indexer.py:84-90`), with the same rules as picture OCR
   (`indexer.py:922-929`, `:887-895`, `:1025-1032`), under the new setting
   `features.video_frame_ocr`:
   - `on_index` (the default): `_queue_file_tasks` queues it at priority 0 for a new
     video; `_resume_incomplete` queues it at priority -10 for every active video whose
     `frame_ocr_indexed` is false.
   - `manual`: only the per-file reindex (`frame_ocr`) and `prioritize` queue it.
   - `false`: never.

   The rebuild of A6 alone, for a video with `frame_ocr_read` true and
   `frame_ocr_indexed` false, calls no engine and is queued by `_resume_incomplete` at
   priority -10 under every mode, so stored text stays searchable after a text-embedding
   model change.
3. **Reading.** One video at a time, in a worker thread, holding no `search.db` lock.
   - ffmpeg decodes the first video stream with the `fps=1` filter. The k-th output frame
     (from 0) is taken as time k seconds.
   - Each frame is scaled to 160 px wide, keeping its aspect ratio, in grayscale. Its
     difference hash is 256 bits: the picture resized with area averaging to 17×16, and
     for each row each pixel compared with its right neighbour (`dhash` in the trial's
     `bench.py`).
   - The first frame is read. A later frame is read when both hold:
     - its hash differs from the hash of the last frame read by 16 bits or more;
     - at least 10 seconds have passed since the last frame read.
   - A frame is read at the source resolution, in RGB, through `run_engine`
     (`ocr.py:124-140`), so it never runs at the same time as another OCR call. The
     engine is fetched with `_get_engine` for each frame, which marks it as used, so the
     idle unload (`ocr.py:114-121`) does not release it during a read. The
     engine's lines are kept in the engine's order with its own score threshold, as for
     pictures.
   - Between frames, while the indexing queue is paused (`is_paused`, `indexer.py:293-295`),
     the reader waits before its next OCR call and continues when the queue resumes.
   - While paused, the reader stops taking frames from ffmpeg, so decoding and hashing
     stop too.
   - If ffmpeg produces no frame for 120 seconds of unpaused time while it is still
     running, the reader stops it and handles it as an ffmpeg error (Failure cases).
4. **Segments.** The read frames become segments, in time order:
   - A frame whose lines, joined by `\n`, are empty starts no segment.
   - A frame whose joined text equals the text of the segment still open continues that
     segment, and starts nothing new.
   - Any other frame with text starts a segment at its time.
   - A segment ends at the time of the next read frame that does not continue it. The last
     segment ends at the time of the last decoded frame plus one second.
5. **Storing the read.** One short transaction, only if the file is still an active row:
   the file's earlier `video_frame_texts` rows, `text_content` embeddings and
   `fts_text_content` rows are removed, so stored times and search rows never disagree,
   and new `video_frame_texts` rows are written, one per chunk:
   - each segment's text chunked with `ContentExtractor.chunk_text` at its defaults (1000
     characters, 200 overlap), as for pictures;
   - `chunk_index` from 0 in time order across the whole video;
   - each chunk carrying its segment's `start_time` and `end_time`;
   - and `frame_ocr_read` set true.
6. **Building the search rows.** The chunk texts are embedded outside any lock. Then, in a
   second transaction, only if the file is still an active row and its `frame_ocr_read` is
   still true (a manual reindex in between makes it write nothing):
   - any `text_content` embeddings and `fts_text_content` rows are removed (none after A5;
     the earlier build's on a rebuild);
   - one `text_content` embedding per chunk is stored in `vec_text`, with `page` null,
     `chunk_index`, `timestamp_start` and `timestamp_end` from the chunk, and an id of the
     document text shape, `txt_<file_id>_<chunk_index>_<hex>`, which Ask's vector chunk
     lookup parses (`rag/context.py:210`, `:272`); the picture shape `ocr_…` is not
     parsed there;
   - one `fts_text_content` row per chunk with `page` null;
   - `frame_ocr_indexed` set true.

   When a task finds `frame_ocr_read` true, it skips steps 3–5 and builds the search rows
   from the stored `video_frame_texts` rows.
7. **Find in file.** `GET /files/{file_id}/find` (SPEC-ADDON-061) reads a video's
   `text_content` rows per segment, not as one text:
   - Each segment is one unit. Its chunks, in `chunk_index` order, are merged with B2's
     overlap merge with the replay limit of 200 characters that picture text uses
     (`_CHUNK_TEXT_OVERLAP` in `_replay_limit`, `file_find.py:53-56`), because A5 chunks at 200 overlap.
   - Every occurrence is a row of kind `scene`, with `start` and `end` the segment's. The
     core already lists `scene` rows as 「mm:ss」 over 「画面内の文字」 and seeks the player
     to `start` (`frontend/src/components/FileDetail/find/FindTab.tsx:97-98`,
     `useFindInFile.ts:107-112`), so the core find code is unchanged.
   - These rows do not need the drive's Visual Index to be open. Visual Index scene rows
     keep that condition.
   - Order: by `start`; at an equal `start`, utterance, then Visual Index scene, then frame
     text; then `ordinal`.
   - `indexed` (today `whisper_indexed` for a video, `_stage_done`, `file_find.py:40-50`) is also true when `frame_ocr_indexed` is true.
8. **Ask.**
   - For a video, the context builder (`rag/context.py:951-1000`) adds the frame text
     after the transcript snippets, or before them when the candidate's matches include
     a `text_content` match and no transcript match (a video found only by its frame
     text). The per-file budget (`max_context_chars_per_file`, `_cap_snippets`) still
     applies, so frame text placed after a long transcript excerpt can be cut: the document chunk selection
     (`_collect_document_snippets`, `:788`) over the video's `text_content` matches, each
     snippet located by its segment's start as `m:ss`. A timed frame-text vector match
     also still brings in the transcript window around its time
     (`_collect_transcript_snippets`, `:746-777`), as any timed match does.
   - A citation of a frame-text snippet carries that `m:ss` location; `rag/service.py`
     (`_segment_location_for`, `:121-180`) looks the time up in `video_frame_texts` by
     `chunk_index` for a video's `text_content` match, which otherwise has no time on the
     keyword path.
   - The single-file question (`rag/file_question.py:92-196`) gives a frame-text chunk the
     position `{"seconds": start_time}`. Rows stay in today's order: transcript chunks
     first, then text chunks (`:161-190`). A video with no transcript but with frame text
     becomes askable there (`available`, `:80-88`).
9. **Exact search.** `/search/exact` (and the MCP tool `search_exact`) reads the rows
   already (`exact_search.py:80-103`). A video's text hit also carries `start_time` and
   `end_time`, the segment's, looked up by `chunk_index` in `video_frame_texts`.
10. **Detailed-summary citations.** A video's summary is written from its transcript
    (`summaries.py:499-500`), so its citations are computed over the transcript only:
    the citation pools leave out the video's `text_content` rows (`citations.py:125-135`
    dense, `:376-397` BM25), which would otherwise become `document:N` citations that the
    viewer cannot seek to.
11. **Manual run.** For a video and a mode other than `false`:
   - The per-file reindex accepts `frame_ocr`. It sets `frame_ocr_read` and
     `frame_ocr_indexed` false and queues the task at priority 100. The stored rows stay
     until the new read replaces them.
   - `prioritize` includes `FRAME_OCR` when `frame_ocr_indexed` is false.
   - The **Index details** dialog lists 「動画内の文字」 among the tasks it can run again,
     with its status. The index-details response gains `video_frame_ocr` and
     `scanned_pdf_ocr` (the modes) beside `image_ocr` (`routers/files.py:538`), and
     `status.frame_ocr` / `status.page_ocr`; `isTaskApplicable` reads them.

   With `false`, or for a file that is not a video, reindex answers 422 for `frame_ocr`,
   `prioritize` skips it and the dialog has no such row.
12. **Settings.** `features.video_frame_ocr` (`false` / `manual` / `on_index`) is set in
    `search-config.yml` and on the admin screen like `image_ocr`
    (`features_overrides.py`, `_FEATURES_ENUM_FIELDS` in `routers/admin.py:313`,
    `FeaturesUpdate`, `GET` and `PUT /admin/features`). A change takes effect after a
    restart and raises the restart banner. Turning it off keeps the stored text, which stays
    searchable.
13. **Other files.** `frame_ocr_read` and `frame_ocr_indexed` are meaningful for videos
    only. `_resume_incomplete` sets both true for any other file, as it does for
    `ocr_indexed` (`indexer.py:816-817`). A mode never changes a video's flags.

#### B. Scanned PDF pages (SPEC-ADDON-069)

1. **Which files.** Active files of mime type `application/pdf`. A file over 200 MB
   (`MAX_PDF_SIZE`, `pdf.py:24`) is not read. Only pages 1 to 500 (`MAX_PAGES`, `pdf.py:27`)
   are considered, the pages text extraction indexes.
2. **Queueing.** A new task type `PAGE_OCR`, with the same rules as A2 under the new setting
   `features.scanned_pdf_ocr` and the flag `page_ocr_indexed`.
3. **Which pages.** A page is scanned when its text layer, read with PyMuPDF
   `page.get_text("text")`, is empty after stripping whitespace. A page with any text,
   even a page number alone, is not read. The test does not depend on the script of the
   text.
4. **Reading.** One PDF at a time, in a worker thread, holding no `search.db` lock.
   - The text-layer test and each page's rendering run under `PYMUPDF_LOCK`
     (`pdf.py:63`), as every PyMuPDF call does. The lock is not held during OCR.
   - A scanned page is rendered in RGB at 300 dpi. A page whose rendering at 300 dpi would
     exceed 50 million pixels is rendered at the highest resolution within that, the
     picture cap of SPEC-ADDON-050.
   - It is read through `run_engine`, as in A3, with the queue's pause honoured between
     pages.
5. **Storing.** One short transaction, only if the file is still an active row:
   - the file's earlier `pdf_page_ocr_texts` rows are replaced by one row per scanned page:
     the page number and the engine's lines joined by `\n`, empty if none were kept;
   - `page_ocr_indexed` is set true;
   - only when at least one stored page text is non-empty, or the earlier rows had one:
     `text_indexed` is set false.

   In that case a `TEXT_CONTENT` task is then queued for the file at priority 0, even if
   one is already queued or running (`_enqueue(..., force=True)`, `indexer.py:953-973`).
   A text task that started before this write may finish with the old text; the forced
   task runs after it. A PDF with no scanned page, or whose scanned pages gave no text,
   is not extracted again.
6. **Text extraction uses it.** The text task (`index_text_content`,
   `workers/metadata.py:329-448`) reads the file's `pdf_page_ocr_texts` rows before it
   extracts. In both PDF paths (PyMuPDF4LLM, `pdf.py:361-389`, and the fitz fallback,
   `pdf.py:433-463`):
   - a page that B3 calls scanned (its fitz text layer empty), and that has a non-empty
     stored OCR text, takes that text as its text, in place of whatever PyMuPDF4LLM wrote
     for it (an image placeholder, for example);
   - it is chunked with `indexing.text_chunking` like any page, with `page` set;
   - this holds under every `scanned_pdf_ocr` mode: the mode decides only whether pages
     are read;
   - on the PyMuPDF4LLM path it also goes into the page's part of the stored Markdown
     (`_join_page_markdown`, `pdf.py:392`), which summaries read (`summaries.py:503`).

   The rest of the text task is unchanged: chunk ids `txt_…`, the unchanged-chunk check
   (`metadata.py:451`), the citation recompute and the `pdf_markdown` row.
7. **Reading a document by unit.** `GET /files/{file_id}/document-text` (`read_document`
   over MCP) gives a page that B3 calls scanned its stored non-empty OCR text, on both its
   paths (PyMuPDF4LLM and the plain-text fallback, `document_text.py:164-190`), so the unit
   text stays what indexing builds for the page (SPEC-ADDON-036 I3). The unit's
   `extractor` is the path's, as today.
8. **Find in file.** Nothing changes in the route: the page's chunks are `page` units, and
   a hit is a 「p. N」 row. Choosing it opens the page (`useFindInFile.ts:113-117`). The
   page's pdf.js text layer is empty, so no find mark and no current mark is drawn there:
   `chooseCurrentOccurrence` finds no occurrence (`frontend/src/lib/findMarks.ts:289-293`),
   which is B2's fallback 4, "the page is still shown".
9. **Manual run.** As A11, with the task name `page_ocr`, the flag `page_ocr_indexed`, for
   PDFs only, and the dialog label 「スキャンしたページの文字」.
10. **Settings.** `features.scanned_pdf_ocr`, as A12.
11. **Other files.** As A13, for `page_ocr_indexed`.

#### C. Search passages (SPEC-CORE-048)

1. **Addon.** In the passage view (`_passage_kind`, `search.py:2280-2295`), which tests
   the file type before it calls the shared `text_content_kind` (`search.py:2267`, which
   is not changed, so find and `search_documents` keep their kinds), a `text_content` match with a
   `chunk_index` on a file of `file_type` `video` becomes a passage of the new kind
   `screen_text`.
   - Its `start` and `end` are the stored segment's, looked up by `file_id` and
     `chunk_index` in `video_frame_texts`. A match whose chunk has no row there gives no
     passage.
   - `chunk_index` is the text chunk's index; `page` and `section` are null.
   - Its `text` is the keyword excerpt or the content preview, as for `text`.
   - `frame_url` is the frame at `floor(start)` (`_frame_url`, `search.py:2341`).
   - Its place, for merging a vector and a keyword match into one passage, is the chunk
     index.
2. **Core.** `PassageList` and `searchPassages.ts`:
   - the locator is 「mm:ss」 (「h:mm:ss」 at an hour or more) over 「画面内の文字」;
   - the excerpt is drawn and marked like a `text` passage's;
   - the picture is `frame_url`, with the existing fallbacks;
   - the row links to `/files/{id}?t=<floor(start)>`.
3. **Search by image.** `search_documents` (`search.py:1226`, used by the image query)
   leaves out videos' text rows, as it leaves out pictures' (`search.py:1216`).

### 2. Failure cases

**Video frames**

- **The file cannot be reached** (not found, path invalid, permission denied, drive not
  mounted, checked with `stat` before decoding): nothing is written, earlier rows stay,
  both flags stay false, a WARNING names the file id and the error class, and the next
  `_resume_incomplete` tries again.
- **ffmpeg exits with an error, stalls (A3), or yields no frame** (a corrupt file, no
  video stream, a drive that dropped away mid-read): the file is checked with `stat`
  again.
  - Not reachable now: handled as an unreachable file (above), retried.
  - Reachable: the frames decoded before the error are used, the read is stored as in A5
    (with no rows when there was no text), and a WARNING names the file id and ffmpeg's
    exit status or the stall. It is not read again until a manual reindex. A file that
    keeps stalling is therefore read once, partly, and not retried.
- **The engine raises on one frame**: that frame counts as read with no text, reading
  continues, and one WARNING per video gives the file id and the number of such frames.
- **The engine cannot be created**: as for pictures (`ocr.py:72-104`). One ERROR, every
  frame task that needs a read is dropped without changing a flag, and the next process
  start tries again. A rebuild-only task (A6, `frame_ocr_read` true) needs no engine and
  still runs. If the engine is lost partway (released while paused and not re-created),
  the frames read so far are discarded, nothing is written, and the file is retried.
- **The text embedding fails**: the read stays stored, `frame_ocr_read` stays true and
  `frame_ocr_indexed` false. The next `_resume_incomplete` queues the file, and the task
  builds the rows from the stored text without reading frames again. An ERROR names the
  file id.
- **The file is trashed, missing or purged while it is read**: the transaction finds no
  active row and writes nothing.
- **The process stops during a read**: nothing was written; the flags are false and the
  next `_resume_incomplete` queues the file, which is read from the start.
- **The drive's `index` policy is off**: no indexing task exists for its files, as today.
- **A `search.db` write raises** (for example a busy database): the transaction rolls back.
  At A5 the read is discarded and nothing changes; at A6 it is as an embedding failure. An
  ERROR names the file id.
- **Retries** of the cases above come from `_resume_incomplete`, so a full read is retried
  only under `on_index`. Under `manual`, a failed or interrupted read leaves the video
  pending until the next manual run, as picture OCR does under `manual`.

**Scanned pages**

- **The file cannot be reached**: as for video. Nothing written, flag stays false,
  WARNING, retried.
- **Over 200 MB, cannot be opened, or a page cannot be rendered**: the file is checked
  with `stat` again; if it is not reachable now, it is handled as unreachable. Otherwise
  an unopenable or oversized file is stored as read with no rows, and a page that cannot
  be rendered, or on which the engine raises, is stored with empty text. A WARNING names
  the file id and the error class. Not retried until a manual reindex.
- **The engine cannot be created**: as for video.
- **The text task fails afterwards** (embedding failure): `text_indexed` stays false, and
  the next `_resume_incomplete` queues `TEXT_CONTENT` (`indexer.py:871-875`), which uses
  the stored page texts. OCR is not run again.
- **The file is trashed, missing or purged while it is read**: nothing is written.
- **The engine is lost partway**: as for video; nothing written, retried.
- **The process stops during a read**: nothing was written; `page_ocr_indexed` is false and
  the next `_resume_incomplete` queues the file again (under `on_index`, as for video).
- **The B5 write raises**: nothing is stored, no text task is queued, an ERROR names the
  file id, and the file is retried as an unreachable one is.

**Both**

- **A text-embedding model change** (`_migrate_vec_text_if_needed`,
  `database.py:546-733`) purges every `text_content` row and resets `text_indexed`
  (`:693-698`).
  - It also sets `frame_ocr_indexed` false for videos, leaving `frame_ocr_read`, so their
    rows are rebuilt from the stored text without reading frames.
  - PDFs need nothing more: the text task re-extracts with the stored page texts.
  - `video_frame_texts` and `pdf_page_ocr_texts` are not touched by it.

### 3. States

**A video**, as (`frame_ocr_read`, `frame_ocr_indexed`):

| From | To | When |
|---|---|---|
| (false, false) | (true, false) | the read is stored (A5) |
| (true, false) | (true, true) | the search rows are stored (A6) |
| (true, true) | (true, false) | a text-embedding model change |
| any | (false, false) | a manual `frame_ocr` reindex |

A task for a video at (true, true) does nothing. A manual reindex while a task is running
does not stop it. If the reset lands before that task's A5 commit, the read stores its
result and the re-queued task finds (true, false) or (true, true) and does not read
again: the running read is a read of the file as it is, so the request is met by it. If
the reset lands after A5, A6 writes nothing and the re-queued task finds (false, false)
and reads again.

Not allowed: `frame_ocr_indexed` true with `frame_ocr_read` false; any change on a mode
switch; any change for a file that is no longer an active row; a change on an unreachable
file or a missing engine. A file that is not a video: (false, false) → (true, true) once,
by `_resume_incomplete`; never queued.

**A PDF**, `page_ocr_indexed`: false → true when the page texts are stored (scanned pages
found or not, or the file unreadable); true → false on a manual `page_ocr` reindex. When
the stored or replaced page texts include a non-empty one, the same write sets
`text_indexed` true → false, and the forced text task sets it back to true. Not allowed:
any change on a mode switch, on an unreachable file, with a missing engine, or for a file
that is no longer an active row; a `text_indexed` change on a read that stores and
replaces no text. A file that is not a PDF: false → true once, by `_resume_incomplete`;
never queued.

**Pending counts**: `pending.frame_ocr` counts videos with `frame_ocr_indexed` false and
`pending.page_ocr` PDFs with `page_ocr_indexed` false, only while the mode is `on_index`;
a rebuild-pending video outside `on_index` is queued (A2) but not counted.

**A replaced file** is not detected (intelligence has no content-change signal for any
task). A manual reindex reads it again. A PDF that gains a text layer uses it: the stored
OCR text is used only for a page whose fitz text layer is empty.

### 4. Data read and written

- **Read**: the video or PDF through the read-only drive mount.
- **Written**, all in the intelligence `search.db`:
  - `indexed_files`: new columns `frame_ocr_read`, `frame_ocr_indexed`, `page_ocr_indexed`
    (boolean, default false), added by an idempotent migration like
    `_migrate_ocr_indexed_column` (`database.py:1050`), and `text_indexed` (B5).
  - New table `video_frame_texts`: `file_id`, `chunk_index`, `start_time`, `end_time`,
    `text`; unique on (`file_id`, `chunk_index`).
  - New table `pdf_page_ocr_texts`: `file_id`, `page`, `text`; unique on (`file_id`,
    `page`).
  - `embeddings` / `vec_text` (`text_content`) and `fts_text_content` /
    `fts_text_content_word` for videos (A6), and for PDFs through the existing text task.
  - `pdf_markdown` through the existing text task.
- **Deleted**: `_purge_file` (`indexer.py:2307`, also used by `purge_drive`) deletes the
  file's rows in both new tables.
- The core DB is not touched.

### 5. External services

None. ffmpeg, PyMuPDF and the OCR engine run inside the container, and no frame or page
leaves it. The stored text is then treated like a document's text: Ask, the single-file
question and summaries may send it to the routed LLM, an off-host profile only when the
drive's `llm_cloud` policy allows it.

### 6. Authorization

Unchanged. Only drives whose `index` policy is on are indexed. Every search and read path
keeps its access checks: the find route goes through the proxy's drive, `file_access`
and `addon_feature: search` checks, and the passage view through the search route's. There
is no per-drive switch for either OCR.

### 7. Effect on existing features

- **Search, exact search, Ask and the single-file question** see a video's frame text and a
  scanned page's text. A video can be found by words shown in it. Ranking channels that
  weight `text_content` now include videos.
- **Search results' `segments`**: a vector match on frame text carries its time
  (`search.py:1902-1913`), so a video hit can gain a timed segment from it; a keyword match
  on frame text has no time and joins the untimed group (`search.py:2200-2252`), as a
  document's does.
- **Similar files, pickup, and the rarity and IDF statistics** over
  `fts_text_content_word` include the new text, as they include pictures' text. Pickup's
  `text_content` lanes (`pickup/profile.py:387-440`, `pickup/retrieval.py:138-155`) now
  hold videos too. The file-type similar search uses `clip_thumbnail` and
  `tfidf_keywords` for videos (`search.py:2826`) and is unchanged.
- **Ask's shortlist**: a rare frame word can bring a video in through
  `rag/exact_match.py:25-30`; its context then quotes the frame text (A8).
- **Find in file** (SPEC-ADDON-061): a video gains frame-text `scene` rows; a scanned PDF
  gains `page` rows. See Revises.
- **The passage view** (SPEC-CORE-040) gains the `screen_text` kind. See Revises.
- **LLM passes for a scanned PDF**: summaries, detailed summaries, auto tags
  (`auto_tags.py:603-606`) and retrieval keywords read the PDF's text, so they now see the
  page OCR text. These passes are queued from the metadata batch (`indexer.py:1424-1459`),
  which for a new scanned PDF runs before its pages are read, finds too little text and
  writes nothing. So whenever a text task completes for a PDF that has a non-empty
  `pdf_page_ocr_texts` row, whichever path queued it (and so also after a failure or a
  restart), the text worker re-queues the PDF's summary and auto-tag passes whose mode is
  `on_index`, with the gates
  `requeue_after_whisper` (`indexer.py:1103-1183`) applies: only when `metadata_indexed`
  is true, a summary only when the file has no `file_summaries` row with a short summary,
  tags only when it has no `suggested_tags` row. A partly scanned PDF that already has a
  summary keeps it (owner decision 7). Retrieval keywords are not re-queued; they follow their own sweep.
- **Auto tags, summaries and detailed summaries for videos** read the transcript and are
  unchanged. A scanned PDF's summary now has text to read.
- **The upload drawer's processing stages** (SPEC-ADDON-057): neither OCR is a stage and
  neither gates readiness, as for picture OCR. But B5 resets `text_indexed` for a PDF
  whose scanned pages gave text, so for the minute or so until the forced text task ends,
  that PDF's `text` stage (`routers/files.py:98-105`), its Index details `text` status
  and find's `indexed` read pending / false again. Its existing search rows stay
  meanwhile. The owner accepted this window (decision 6).
- **Search by image** shares the engine (`image_query.py:59`, `:133`, a 10-second wait for
  the engine lock). During the backlog the three background readers keep the lock busy,
  so the image query's text part fails more often than today; the rest of its answer is
  unaffected. The owner accepted this (decision 4).
- **The admin status and queue views** count both as picture OCR is counted
  (`get_index_status`, `indexer.py:326`; `main.py:575-597`): `indexed.frame_ocr` and
  `indexed.page_ocr`, `pending.frame_ocr` and `pending.page_ocr` (counted only while the
  mode is `on_index`, and then in `pending.total`), queue cards, and progress bars in
  `IndexStatusWidget`.
- **Picture OCR** shares the engine. The three OCR workers each take one file at a time,
  and their engine calls never overlap (`run_engine`). A long video does not block
  pictures: their calls interleave frame by frame.
- **The backlog**: every existing video and PDF is read once in the background after the
  upgrade, sharing CPU with other indexing. On the trial's numbers this is at most about 5
  minutes per video hour.
- **B4** (`docs/specs/extraction-edits.md`, SPEC-ADDON-065/067/068, not approved): B4 keeps
  human corrections of transcripts and of picture OCR, and adds tables for kept
  originals, picture texts and follow-up items. This change adds `video_frame_texts`,
  `pdf_page_ocr_texts` and three flags, none of which B4 names, and does not change
  `ocr_indexed` or the picture OCR worker. The new text is not editable in B4. Whichever
  merges second keeps the other's purge rows and migrations.

### 8. Error behavior

As in Failure cases. Nothing is shown to viewers. Neither OCR writes a `JobRecord`; their
failures are the WARNING and ERROR lines.

### 9. User-visible behavior

- Search and Ask find words shown in videos and on scanned PDF pages. The excerpt and the
  citation show the recognised text, single-character errors included.
- In the passage view, a video's frame-text passage reads 「mm:ss」 over 「画面内の文字」 with
  the excerpt and the frame, and opens the video at that second.
- Find in file lists frame text under 「画面内の文字」 with its time, interleaved with
  utterances, and a scanned page's hits as 「p. N」. Choosing a scanned page shows the page
  with no mark on it.
- Operators see 「動画内の文字」 / "Text in video" and 「スキャンしたページの文字」 / "Text in
  scanned pages" in **Index details**, the admin status, the queue and the feature
  settings.
- Docs:
  - `docs/addons/intelligence.md`: both OCR passes, their settings, the frame selection
    and its 10-second gap, what is missed (text while it is being written), the measured
    cost, and that the text follows `llm_cloud`.
  - `docs/reference/configuration.md`: `features.video_frame_ocr`,
    `features.scanned_pdf_ocr`.
  - `docs/user-guide/search.md`: search finds text shown in videos and on scanned pages.
  - `docs/user-guide/viewers-and-players.md`: the sentence "the text inside video frames
    and scanned PDF pages is not read yet" (line 53) is replaced by what is read, and that
    a scanned page opens without a mark.
  - `docs/addons/intelligence.md` also: the `screen_text` passage kind in the passages
    kind list (`:180`), the find route's sources (`:184`), the reindex task list
    (`:727`), the features block (`:421-424`) and the `/search/exact` times.
  - `mcp-server/src/tools/search.ts:30`: the `search_exact` description gains a video's
    text hits with times.

### 10. Non-functional

- **Video**: at most one read frame per 10 seconds, so at most 360 frames per video hour.
  The target is 5 minutes of processing per video hour. Measured: 2.1 to 2.8 minutes per
  hour with the gap on 720p lectures; selection alone about 1 minute. A dense-text screen
  that changes every 10 seconds can take about 12 minutes per video hour; the owner
  accepted that worst case (decision 3).
- **Resolution beyond 720p** was not measured. The first implementation step measures one
  1080p video with dense on-screen text and one 4K HEVC phone video, and stops to ask if
  either exceeds 5 minutes per video hour (decision 2).
- **Scanned PDF**: about 2.6 s per page (300 dpi, 2 threads); the target is 3 s. A
  500-page scanned PDF takes about 22 minutes.
- **Memory**: one decoded frame or one rendered page at a time (a 300 dpi A4 page is about
  26 MB in RGB), plus the engine already loaded for pictures, released when idle.
- **Image size**: unchanged. ffmpeg, PyMuPDF, OpenCV and RapidOCR are already in the image.
- **Privacy**: nothing leaves the container during reading.

## Touch points

**Addon** (the intelligence repository):

- `addons/intelligence/app/workers/ocr.py`: the shared engine and `run_engine`, called;
  the picture path unchanged.
- New worker modules in `addons/intelligence/app/workers/` for the frame reader (ffmpeg
  decoding, the difference hash, the gap, segments) and the page reader.
- `addons/intelligence/app/indexer.py`: `TaskType.FRAME_OCR` and `TaskType.PAGE_OCR`,
  their workers, `_TASK_NAME_TO_TYPE`, `_queue_file_tasks`, `_resume_incomplete`,
  `prioritize`, `IndexStatus` / `get_index_status`, `_purge_file`, the forced
  `TEXT_CONTENT` enqueue, and the text worker's re-queue of summary and auto-tag passes
  after it.
- `addons/intelligence/app/extractors/pdf.py` and `app/workers/metadata.py`
  (`index_text_content`): stored page texts for empty pages.
- `addons/intelligence/app/document_text.py`: stored page texts for empty pages.
- `addons/intelligence/app/models.py`, `app/database.py`: the three columns, the two
  tables, their migrations, and the `frame_ocr_indexed` reset in
  `_migrate_vec_text_if_needed`.
- `addons/intelligence/app/file_find.py`: video frame-text units, their order and
  `indexed`.
- `addons/intelligence/app/search.py`: `_passage_kind`, `_finish_passage`, `_frame_url`,
  `_drive_text_neighbours`; the `SearchPassage` kind literal
  (`search.py:140`). `FileFindRow.kind` (`schemas.py:468`) is not changed.
- `addons/intelligence/app/rag/context.py`, `app/rag/file_question.py`: frame text for
  videos.
- `addons/intelligence/app/exact_search.py`: times on a video's text hits.
- `addons/intelligence/app/rag/service.py`: the citation location of frame text.
- `addons/intelligence/app/citations.py`: videos' `text_content` rows left out of the
  citation pools.
- `addons/intelligence/app/config.py`, `search-config.yml.example`,
  `app/features_overrides.py`, `app/schemas.py`, `app/main.py`, `app/routers/files.py`
  (`_REINDEX_ALLOWED_TASKS`, `_REINDEX_FLAG_COLUMN`, the 422s, index-details `status`),
  `app/routers/admin.py`: the two settings.
- `addons/intelligence/frontend/`: `api.ts`, `IndexDetailsDialog.tsx`,
  `IndexStatusWidget.tsx`, `AdminFeaturesSettingsSection.tsx`, `messages/ja.json` and
  `en.json`.
- `addons/intelligence/tests/`: fixtures (a short video with known slides; an image-only
  PDF page and a page with a text layer) and tests citing the SPEC-IDs.

**Core:**

- `frontend/src/lib/searchPassages.ts`, `frontend/src/components/search/PassageList.tsx`,
  `frontend/src/lib/searchMerge.ts` (`PassageKind`, `:10-16`) and the test helpers that
  repeat that union, `frontend/src/messages-core/ja.json` and `en.json`: `screen_text`.
- `frontend/src/components/FileDetail/find/` and `frontend/src/lib/findMarks.ts`: read, not
  changed.
- Docs: `docs/addons/intelligence.md`, `docs/reference/configuration.md`,
  `mcp-server/src/tools/search.ts`, `docs/user-guide/search.md`,
  `docs/user-guide/viewers-and-players.md`.
- The `addons/intelligence` submodule pointer, bumped after the addon PR merges.

**Rules passed through:**

- `.claude/rules/backend-conventions.md`, language-dependent rules: the frame test is a
  picture difference and the page test is "no text-layer character"; neither reads any
  language's words. The Japan recognition model is a model choice, as in SPEC-ADDON-050.
- `.claude/rules/design-decisions.md`: the drive boundary (both readers are per file and
  write only that file's rows); data that cannot be regenerated (none: every new row can
  be rebuilt by reading the file again); LLM features and `llm_cloud` (the stored text is
  sent only under that policy).
- `.claude/rules/frontend-conventions.md`: i18n in `messages-core`; `DESIGN.md` for the new
  passage label (no new token).
- No protected path is edited: no Dockerfile, requirements, Internal API, core backend or
  core DB change.

## Invariants

I1. A video is read only at its first decoded frame and at frames whose 256-bit difference hash differs from the last read frame's by at least 16 bits and that come at least 10 seconds after it, so no two read frames of a video are less than 10 seconds apart.
I2. After a successful read and build, a video has `frame_ocr_read` and `frame_ocr_indexed` true, one `video_frame_texts` row per chunk of its segments — a segment starting at a read frame with non-empty text unequal to the open segment's, continued by read frames with equal text, ending at the next read frame that does not continue it or at the last decoded frame plus 1 s — chunked at 1000/200 with `chunk_index` in time order, and exactly those chunks as its `text_content` embeddings (ids `txt_<file_id>_<chunk_index>_<hex>`, `page` null, the segment's start and end) and `fts_text_content` rows, with no earlier rows; between A5 and A6 the video has no `text_content` rows at all.
I3. A failed embedding keeps the stored read and sets no `frame_ocr_indexed`, and the next run builds the rows from `video_frame_texts` without calling the OCR engine; a text-embedding model change sets `frame_ocr_indexed` false and leaves `frame_ocr_read`, `video_frame_texts` and `pdf_page_ocr_texts` as they were, and the rows are rebuilt from them under every mode. The migration adding the three columns can run twice without changing existing rows.
I4. An unreachable file (checked before reading and again after an ffmpeg error or stall, or a render error), or an engine that cannot be created at the start or partway, writes nothing and leaves every flag as it was; a file that is no longer an active row at write time gets nothing written; neither reader sends anything over the network or writes or removes another file's rows; purging a file deletes its `video_frame_texts` and `pdf_page_ocr_texts` rows.
I5. A PDF page is read only when its text layer is empty after stripping whitespace, and its stored text is used, by indexing and by `document-text` alike, only for a page whose text layer is empty by that same test; the pages with a text layer keep the same sequence of (page, text) chunks as before this change, `chunk_index` free to shift.
I6. After a page read that stores or removes non-empty text, a `TEXT_CONTENT` task for the file starts after that write, and under every mode the file's `text_content` rows for each scanned page with non-empty stored text are that text chunked with `indexing.text_chunking`, with `page` set, the page's part of `pdf_markdown` holds it, and `document-text` returns it for that page; a read that stores no text leaves `text_indexed` as it was. Whenever a text task completes for a PDF with a non-empty stored page text, summary and auto-tag passes in `on_index` mode are queued for the PDF under `requeue_after_whisper`'s gates.
I7. With `on_index`, a new file's frame or page task is queued at priority 0, backlog tasks at -10 and a reindex at 100; with `manual` only reindex or prioritize queue it; with `false` never, and reindex answers 422 for `frame_ocr` or `page_ocr`, as it does for a task on a file of the wrong type; a mode change takes effect only after a restart and removes no stored text. A file that is not a video never gets a frame task and one that is not a PDF never gets a page task, and neither counts as pending. `pending.frame_ocr` and `pending.page_ocr` count only under `on_index`, and only then join `pending.total`. The rebuild-only frame task, which calls no engine, is the exception: `_resume_incomplete` queues it under every mode.
I8. No two OCR engine calls run at the same time; each reader holds no `search.db` lock while decoding, rendering or reading, holds `PYMUPDF_LOCK` only for PyMuPDF calls, and makes no engine call while the indexing queue is paused.
I9. The find answer for a video includes one `scene` row per occurrence in each frame-text segment, with the segment's `start` and `end`, whether or not the drive's Visual Index is open, ordered by `start` with utterance, then Visual Index scene, then frame text at an equal start; the answer's `indexed` is true for a video whose `frame_ocr_indexed` is true; for a scanned PDF it includes `page` rows for the stored page text.
I10. A `text_content` match on a video becomes a `screen_text` passage with its segment's `start` and `end`, `frame_url` at `floor(start)`, and a link to `?t=<floor(start)>`, shown as 「mm:ss」 over 「画面内の文字」 with its excerpt; no video becomes a `text` or `picture_text` passage, search by image returns no video, a video's text hit in `/search/exact` carries its segment's `start_time` and `end_time`, and no detailed-summary citation of a video points at its `text_content` rows; Ask's context for a video places its frame text after the transcript snippets, or first when only frame text matched, an Ask citation of frame text carries its segment's `m:ss`, and the single-file question gives it `{"seconds": start_time}`.

## Revises

SPEC-ADDON-060 I1. A PDF page with no line overlapping the top or bottom 50 points has exactly the text, chunks and `pdf_markdown` part it has today, except that a page whose text layer is empty takes its stored non-empty OCR text (SPEC-ADDON-069).

SPEC-ADDON-061 I1. The find answer's `total` equals the number of non-overlapping occurrences of the folded term within the file's text units (a video's units being its frame-text segments), transcript chunks that have a start, and — only while the drive's Visual Index is open — scene `visible_text` (never `scene_label`); an occurrence inside the overlap of two adjacent text chunks of one unit counts once; `rows` is the first `min(total, 2000)` of them in position order, `truncated` is true exactly when `total > 2000`, and each row's `snippet[match_start:match_start+match_length]` folds to the term.
SPEC-CORE-040 I3. Each hit's `passages` holds exactly one entry per distinct (kind, place) among its matches of the types in the closed kind table, `screen_text` included, and none for any other type (`tfidf_keywords` and `metadata` included), an untimed transcript match, a text match without `chunk_index` or a video's text match with no stored segment; a text vector match and a keyword match of the same chunk or the same transcript stretch are one passage.
SPEC-CORE-040 I7. `frame_url` is set exactly for `utterance`, `scene` and `screen_text` passages of a non-`.loft` video, and no passage of kind `scene` exists unless `include_scene_clip=true`.
SPEC-CORE-040 I11. Each row links to its file at `?t=<floor(start)>` for utterances, scenes and screen text, `?page=` for pages, `?section=` for sections, and with no locator for picture text and text.
SPEC-CORE-040 I15. A `section` passage has `section` and `section_title` and a null `page`; a `page` passage has `page` and null `section`; `chunk_index` is the text chunk's index on `section`, `page`, `picture_text`, `text` and `screen_text` passages, the transcript chunk's index or null on `utterance`, and null on `scene`.
SPEC-CORE-040 I23. Locators and excerpts follow the per-kind table: a `section` without a title shows 「セクション N」, `picture_text` 「画像の文字」, `text` 「本文」, `screen_text` its time over 「画面内の文字」 with its excerpt, a `scene` 「映像一致」 muted in place of an excerpt; no excerpt is line-clamped or cut on the client.

## Checked, no action

- **A vision LLM or the Visual Index for frame selection.** Rejected by the human as too
  heavy. Selection is a picture difference only.
- **Scene detection with ffmpeg's `select=gt(scene,…)`**, which scene CLIP uses
  (`clip.py:455-515`). It was not measured; the trial measured the difference hash, and
  its frames are not the scene CLIP frames, so the two are independent.
- **Reading every changed frame while text is being written.** The 10-second gap misses
  part of such text (recall about 0.5 on the two handwriting lectures); the human accepted
  this.
- **Showing or correcting the frame or page text for viewers.** Not part of B4 and not
  here; it is shown only as search excerpts, find rows and citations.
- **Marks on a scanned page.** The pdf.js text layer is empty and OCR stores no boxes, so
  the page is shown without a mark. Drawing boxes would need positions stored and a new
  overlay.
- **Pages with a partial text layer**, such as a scanner's stamped line or a page number
  over a scanned picture. They are not read; the test is "no text at all".
- **Merging Visual Index scene rows and frame-text rows in find.** Both are listed; a word
  that both found appears twice near the same time (owner decision 8).
- **The core find kind.** Find rows for frame text use the existing `scene` kind, so B2's
  core needs no change. The passage view needs a distinct kind because there `scene`
  means a picture match with no text.
- **The Files-view card's badge.** A video found by its frame text shows 「内容一致」
  (`buildMatchMeta`, `frontend/src/lib/searchMerge.ts:113-119`; `MatchOverlay.tsx:71`),
  whose help text 「ファイルの中の文章に入っています。」 is true of text shown in the video,
  and no time pill, since the pills read transcript and scene matches only. Not changed:
  the passage view carries the time.
- **Search result cards** (`frontend/src/lib/searchCapture.ts:96-118`) quote
  `content_matches` only for PDFs, plain text and pictures; a video card keeps quoting its
  transcript. Not changed.
- **Summaries and auto tags for videos** read the transcript only
  (`summaries.py:499-500`, `auto_tags.py:586-589`); frame text is not added to them. A
  slide-only video without speech still gets no summary.
- **`ocr_…` ids in Ask's vector lookup.** `rag/context.py:272` parses `txt_` ids only, so
  pictures' OCR rows are skipped on that path today. Frame text avoids it by using the
  `txt_` shape; the picture path is SPEC-ADDON-050's and is not changed here.
- **A per-drive switch.** Both readers are local; the drive's `index` policy is the gate.
- **Detecting a replaced file.** No intelligence task has a content-change signal; a manual
  reindex reads it again.
- **More threads.** 4 threads read a page in 1.75 s instead of 2.6 s, but would take more
  of the shared CPU; the engine's 2 threads are kept for all three uses.
- **`.loft` references and audio.** No local picture to read.
- **Invariants not written for every touch point.** The Index details row's visibility,
  the admin counts' labels and the 50-megapixel render cap follow SPEC-ADDON-050's
  patterns and are covered by its tests' shape; the ten invariants guard selection,
  storage, deletion, modes, locking and what search shows.
- **A processing stage for the upload drawer.** Picture OCR has none either.
- **Agentic Ask's `get_file_chunks` tool** (`rag/tools/get_file_chunks.py:114-149`) returns
  a video's transcript chunks and reads a document's text through the core content
  endpoint, so it does not return frame text or scanned-page text. Not changed: the
  retrieval context (A8) already carries both, and the tool's shape is shared with the
  transcript path.
