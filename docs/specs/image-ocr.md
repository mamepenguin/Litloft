# Text in pictures becomes searchable

SPEC-ID: SPEC-ADDON-050

Approval: sha256:10d7b3560a941338b4c1e6ac6cf5b4d59bf3cae4d282e4269885a95d77a3598a Yuichi Senga 2026-11-03

## Summary

Screenshots, slides and photos of signs and documents carry text that search cannot find
today: a picture is indexed by its file name, its representative-frame embedding and, when
requested, an LLM description, but not by the words in it. On production the photos drive
alone has about 230 pictures whose suggested tags say they are screenshots or text.

This change runs a local OCR engine, RapidOCR with the PP-OCRv6 small models, over
pictures when they are indexed, and stores the text it reads as the picture's text chunks,
the same rows documents use. Semantic search, exact search, Ask and the single-file
question surface then find and quote it like a document's text. Existing pictures are
processed in the background.

Measured on 2026-11-03 against 24 test pictures and 15 production Japanese screenshots
(hako `z5TzKM4gi7O_4RdAhy9Ru`): RapidOCR v6 took 0.5 to 1.6 s per picture on the Mac
mini's CPU, adds about 300 MB to the image, ships its PP-OCRv6 models inside the wheel (the
production run logged "File exists and is valid" for both, with no download), and never
produced text that was not in the picture; its errors are single characters. A local
vision LLM invented sentences, emitted icons and placeholders and repeated lines; YomiToku
was heavier (about 1.8 GB) and turned pictograms into text. The user chose RapidOCR v6,
the `on_index` default with a background pass over existing pictures, no new panel for viewers
(the recognised text does show as search excerpts and citations), and the decisions
below, on 2026-11-03. Scanned PDFs are out of scope (one on
production).

## Required items

### 1. Normal flow

1. **Which files.** OCR applies to active files whose mime type is in `IMAGE_TYPES`
   (`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/bmp`) or is `image/heic`
   or `image/heif`. A GIF is read from its first frame.
2. **Queueing.** With `features.image_ocr` `on_index` (the default), `_queue_file_tasks`
   queues an `OCR` task for such a file at priority 0, like CLIP. `_resume_incomplete`
   (which runs at startup and at the end of every reconcile) queues an `OCR` task at
   priority -10 for every active such file with `ocr_indexed` false, so the backlog is taken
   after any priority-0 OCR task. With `manual`, OCR is queued only through the per-file
   reindex and prioritize paths; with `false`, never.
3. **Reading.** The worker takes one picture at a time and does all of this in a worker
   thread, holding no `search.db` lock. It checks the file size and then the image header
   first; a file over 50 MB or over 50 million pixels is not decoded. It decodes the
   original file with Pillow (`pillow-heif` for HEIC/HEIF), takes the first frame, applies
   the EXIF orientation (`ImageOps.exif_transpose`), converts it to RGB (flattening alpha
   onto white and palettes to RGB), and runs RapidOCR 3.10.0 (`Det` and `Rec` PP-OCRv6
   small, `Rec.lang_type` Japan, with the engine's angle classifier on, as in its default
   pipeline) with 2 threads, keeping the recognised lines in the engine's order with its
   own score threshold. The engine is created on the first OCR task and released by the
   addon's existing idle-unload worker like the other models.
4. **Storing.** The lines joined by newlines are chunked with `ContentExtractor.chunk_text`
   at its defaults (1000 characters, 200 overlap) and embedded, still outside any lock.
   Then, in one short transaction: if the file is no longer an active row, nothing is
   written; otherwise its earlier `text_content` embeddings and `fts_text_content` rows are
   removed, the new ones are stored with `page` null (none if no line was kept), and
   `ocr_indexed` is set true.
5. **Pausing.** The OCR worker honours the indexing queue's pause like the other workers.
6. **Manual run.** For a picture (the set in step 1) and a mode other than `false`, the
   per-file reindex path accepts `ocr` as a task (setting `ocr_indexed` false and queueing
   it at priority 100), `prioritize` includes OCR, and the **Index details** dialog lists
   OCR among the tasks it can run again, with its status. With `false`, or for a file that
   is not a picture, reindex answers 422 for `ocr`, `prioritize` skips it and the dialog has
   no OCR row.
7. **Settings.** `features.image_ocr` (`false` / `manual` / `on_index`) is set in
   `search-config.yml` and from the admin screen like the other three-state features
   (`features_overrides`, `_FEATURES_ENUM_FIELDS`, `FeaturesUpdate`, `GET` and
   `PUT /admin/features`). Like them, a change takes effect after a restart and raises the
   restart banner; the in-memory queue, including any backlog, is empty after the restart.
   Turning it off keeps the stored OCR text; it stays searchable until a picture is
   reindexed or the file leaves the index.
8. **Other files.** `ocr_indexed` is meaningful for pictures only. For files outside the
   set in step 1, `_resume_incomplete` sets it true (as it does for other tasks that do not
   apply), so they never count as pending. A picture's flag is never changed by a mode.

### 2. Failure cases

- The file cannot be reached (not found, path invalid, permission denied, or the drive
  not mounted): nothing is written, earlier OCR rows stay, `ocr_indexed` stays false, a
  WARNING names the file id and the error class, and the next `_resume_incomplete` tries
  again.
- The file is reached but is over 50 MB or 50 million pixels, cannot be decoded, or the
  engine raises on it: its earlier OCR rows are removed, `ocr_indexed` is set true, and a
  WARNING names the file id and the error class. It is not queued again until a manual
  reindex.
- The file is trashed, missing or purged while it is being read: the transaction finds no
  active row and writes nothing.
- The text embedding fails: nothing is written (the earlier rows stay), `ocr_indexed`
  stays false, and the next `_resume_incomplete` queues it again.
- The engine cannot be created (models missing or the runtime fails to load): one ERROR at
  the first OCR task, every OCR task is then dropped without touching `ocr_indexed`, other
  indexing continues, and the next process start tries again; pictures stay pending until
  OCR works.
- The drive's `index` policy is off: the drive's files are not indexed at all, as today
  (`_add_new_files`, `handle_scan_complete`, the startup purge), so no OCR task exists for
  them.
- A text-embedding model change that purges `text_content` rows
  (`_migrate_vec_text_if_needed`) also resets `ocr_indexed` for pictures, so their text is
  read again.

### 3. States

Per picture: `ocr_indexed` false → true (text stored, nothing found, or a reached file
that cannot be read); true → false on a manual reindex or a text-embedding model change.
Not allowed: false → true on an embedding failure, an unreachable file, or a missing
engine; any change on a mode switch; any change for a file that is no longer an active
row. Files that are not pictures: false → true once, by `_resume_incomplete`; never
queued. A replaced picture is not detected (intelligence has no content-change signal
for any task); its OCR text is refreshed by a manual reindex.

### 4. Data read and written

- Read: the picture file through the read-only drive mount.
- Written: intelligence `search.db`: `text_content` rows in `embeddings` and `vec_text`,
  `fts_text_content` and `fts_text_content_word`, and `indexed_files.ocr_indexed` (a new
  column, default false, added by an idempotent migration).

### 5. External services

None for OCR itself: the engine runs inside the container and no picture leaves it. The
stored text is then treated like a document's text: Ask and the single-file question
surface may send it to the routed LLM, and an off-host profile only when the drive's
`llm_cloud` policy allows it.

### 6. Authorization

Unchanged: only drives whose `index` policy is on are indexed, and every search and read
path keeps its access checks. There is no per-drive OCR switch.

### 7. Effect on existing features

- Search, exact search, Ask and Find see a picture's text like a document's chunks; a
  picture with text can be found by its words, and ranking channels that weight
  `text_content` now include pictures.
- Similar files, pickup, and the rarity and IDF statistics over `fts_text_content_word`
  include pictures' text, as the user accepted.
- Where the single-file question surface is installed, a picture with OCR chunks becomes
  askable, with citations that carry no position.
- Auto tags and summaries build their context by file type and do not read text for
  pictures; unaffected.
- The upload drawer's processing view, where installed, is unaffected: its `text` stage is
  for `TEXT_MIMES`, and OCR does not gate readiness.
- The admin status and queue views count OCR: waiting and in-progress OCR tasks in the
  queue breakdown and a queue card (lucide `ScanText`); `indexed.ocr` (pictures with
  `ocr_indexed` true) and `pending.ocr` (pictures with it false, counted only while the mode
  is `on_index`, and included in `pending.total` then) in the status response; and an OCR
  progress bar in `IndexStatusWidget` like whisper, CLIP and text.
- The image-hits continuation (`GET /search/images`, SPEC-ADDON-055) stays ranked by the
  representative frame only; a picture found by its words appears in the main results.
- The backlog shares CPU with other indexing for a few hours after the upgrade (about
  7,000 pictures on production); the user accepted this.

### 8. Error behavior

As in 2. Nothing is shown to viewers. OCR writes no `JobRecord`; its failures are the
WARNING and ERROR lines.

### 9. User-visible behavior

Search and Ask find words that appear in pictures, and a picture found that way shows the
recognised text, single-character errors included, as its search excerpt and in Ask
citations, like a document's text. Operators see OCR in **Index details** and in the admin
status, queue and feature settings, with the labels 「画像の文字」 / "Text in image". `docs/addons/intelligence.md` documents OCR, `features.image_ocr`, the
background pass, its cost and that the text follows `llm_cloud`;
`docs/reference/configuration.md` lists `features.image_ocr`; `docs/user-guide/search.md`
says search finds text inside pictures.

### 10. Non-functional

- About 1 to 2 s per picture on the Mac mini, one picture at a time, 2 engine threads.
- Image size about +300 MB (`rapidocr==3.10.0`, `opencv-python-headless`, and `libgl1` /
  `libglib2.0-0` if the base image lacks them), with the models in the wheel; no download at
  run time. The addon already pins `onnxruntime==1.21.0`; the measurement used 1.31.1, so
  the first implementation step checks that RapidOCR 3.10.0 runs on the pinned version and
  stops to ask if it does not.
- Memory: the engine's resident size is measured during implementation and recorded in
  `docs/addons/intelligence.md`; it is unloaded when idle like the other models.

## Touch points

- `addons/intelligence/requirements.txt`, `addons/intelligence/Dockerfile` (a CRITICAL
  zone glob): the engine and its system libraries, pinned.
- `addons/intelligence/app/workers/ocr.py` (new): the worker.
- `addons/intelligence/app/indexer.py`: `TaskType.OCR`, `_TASK_NAME_TO_TYPE`,
  `_queue_file_tasks`, `_resume_incomplete` (backlog at -10, non-pictures set true),
  `prioritize`, the pause, `IndexStatus` and `get_index_status`, the idle unload.
- `addons/intelligence/app/extractors/base.py` (`ContentExtractor.chunk_text`) and the
  embedding helpers in `app/workers/metadata.py`: called, not changed.
- `addons/intelligence/app/models.py`, `app/database.py`: `ocr_indexed`, its migration, and
  its reset in `_migrate_vec_text_if_needed`.
- `addons/intelligence/app/config.py`, `search-config.yml.example`,
  `app/features_overrides.py`: `features.image_ocr`.
- `addons/intelligence/app/schemas.py` (`StatusResponse`, `FeaturesStatus`, `FeaturesUpdate`),
  `app/main.py` (the status assembly), `app/routers/files.py` (`_REINDEX_ALLOWED_TASKS`,
  `_REINDEX_FLAG_COLUMN`, the index-details `status`), `app/routers/admin.py`
  (`_FEATURES_ENUM_FIELDS`, `GET` and `PUT /admin/features`; `_FAILED_JOB_TASK_FLAG_COLUMN`
  and `_job_kind_to_resolvable_task` stay unchanged, since OCR writes no `JobRecord`).
- `addons/intelligence/frontend/`: `api.ts` (`ReindexTask`, `QueueTaskKind`),
  `IndexDetailsDialog.tsx` (`isTaskApplicable`), `IndexStatusWidget.tsx` (`TASK_ORDER`,
  `TASK_ICON`, the progress bar), `AdminFeaturesSettingsSection.tsx`, `messages/ja.json`
  and `en.json`.
- `addons/intelligence/tests/`: worker, queueing, priority, storage, failure, migration and
  settings tests, with small fixture pictures holding known text (including one HEIC).
- `docs/addons/intelligence.md`, `docs/reference/configuration.md`,
  `docs/user-guide/search.md` (core repository, with the gitlink bump).
- Rules passed through: `.claude/rules/design-decisions.md` (HEIC through Pillow; LLM
  features and `llm_cloud`), `.claude/rules/backend-conventions.md` (no language-dependent
  rules). The core is untouched except docs and the gitlink.

## Invariants

I1. After a successful OCR run on an active picture, it has `ocr_indexed` true and exactly the engine's kept lines, joined by newlines and chunked at 1000/200, as its `text_content` embeddings and `fts_text_content` rows with `page` null, and no earlier OCR rows.
I2. A reached picture with no recognised text, one that cannot be decoded, or one over 50 MB or 50 million pixels (checked before decoding) ends with `ocr_indexed` true and no OCR rows, and no sweep queues it again.
I3. A failed text embedding, an unreachable file, or an engine that cannot be created writes nothing, keeps earlier OCR rows, and leaves `ocr_indexed` false, so the next `_resume_incomplete` queues the picture again; other indexing continues.
I4. With `on_index`, a new picture's OCR task is queued at priority 0 and backlog tasks at -10, and a reindex at 100; with `manual`, OCR is queued only by reindex or prioritize; with `false`, never, and reindex answers 422 for `ocr`; HEIC, HEIF and a GIF's first frame are read like the others, after EXIF orientation is applied.
I5. The OCR worker processes one picture at a time with 2 engine threads, outside any `search.db` lock, and takes no task while the queue is paused.
I6. A picture's `text_content` and `fts_text_content` rows are removed only by its own OCR write, a text-embedding model purge, a file purge, or the startup purge of a drive whose `index` policy is off; OCR never writes or removes another file's rows.
I7. The OCR worker sends nothing over the network and downloads nothing at run time.
I8. A text-embedding model change that purges `text_content` also sets `ocr_indexed` false for pictures, and the `ocr_indexed` migration can run twice without changing existing rows.
I9. A file that is not a picture never gets an OCR task and never counts as pending; `pending.ocr` counts pictures with `ocr_indexed` false only while the mode is `on_index`.
I10. A mode change takes effect only after a restart, and turning OCR off removes no stored OCR text.

## Checked, no action

- **Scanned PDFs.** One on production; needs page rendering and merging with PDF text.
- **Showing or correcting the text for viewers.** Left to B4 (extraction correction).
- **Detecting a replaced picture.** Intelligence has no content-change signal for any task;
  a manual reindex refreshes OCR, as it does CLIP and text.
- **A per-drive OCR switch.** OCR is local; the drive's `index` policy is the gate.
- **Keeping OCR text away from LLMs.** It follows `llm_cloud` like document text.
- **A vision LLM, or YomiToku.** Measured and rejected (see Summary).
- **A confidence threshold of our own.** The engine's threshold produced no invented text
  in either measurement.
- **Reading order on multi-column screenshots.** RapidOCR can interleave columns; search
  and Ask use chunks by meaning and words, so order costs little here.
- **Yielding the backlog to other queues.** CPU contention for a few hours is accepted.
- **Scripts other than Japanese and Latin.** The Japan recognition model can read Korean,
  Arabic or Cyrillic text as plausible wrong characters. Production pictures are almost all
  Japanese and English, so this is a known limit, not a per-language switch. The model is a
  model choice, not a rule on any language's words, so `backend-conventions.md`'s rule on
  language-dependent rules is not engaged.
- **A content-change signal.** None exists for any intelligence task.
