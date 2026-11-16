# YouTube references go through the video pipeline

SPEC-ID: SPEC-ADDON-117
SPEC-ID: SPEC-ADDON-118

Approval:

## Summary

A YouTube `.loft` (a reference file whose source is a YouTube video) today gets
storyboard-tile CLIP frames and, on request, single frames cut from YouTube, but
never the frame scan, the on-screen text (frame OCR) or the Visual Index that a
native video gets. A video whose words are only on screen — a silent cooking
video whose ingredients appear as burned-in captions — is answered from at most
20 sampled frames, and an ingredient shown between two of them is lost (seen in
production on 2026-11-16). With this change the intelligence addon fetches each
YouTube `.loft`'s video once, at up to 720p and without audio, runs the frame scan
and frame OCR on it exactly as on a native video, keeps a small picture of each
change frame, and deletes the video (SPEC-ADDON-117). Its on-screen text then
reaches search, find and both kinds of Ask like a native video's. The Visual Index
runs on a YouTube `.loft` under its own settings, reading each scene frame from the
kept pictures or from YouTube, and the Scenes section shows and generates it as for
a native video (SPEC-ADDON-118). The fetch also fills the `.loft`'s duration when
it is missing. Existing `.loft`s are worked through after native work. It is for a
viewer who keeps YouTube references in the library. Transcription is unchanged.

## Terms

- **`.loft`**: an active `IndexedFile` with mime `application/vnd.litloft.loft+json`.
- **Loft source**: a new nullable column `indexed_files.loft_source`: NULL until a
  fetch has read the `.loft`; `youtube` when `read_loft` returns provider `youtube`;
  `other` when it returns another provider or `None` (too large, not JSON, no
  provider or url). A `.loft` that raises `LoftNotAccessible` or `LoftUnreadable`
  stays NULL.
- **YouTube `.loft`**: a `.loft` whose loft source is `youtube`.
- **Unclassified `.loft`**: a `.loft` whose loft source is NULL.
- **Pipeline video**: a native video (mime in `VIDEO_TYPES`) or a YouTube `.loft`.
- **Fetch**: one run of the new `loft_media` task for one `.loft` (section 1).
- **Rendition**: the format `pick_format` returns from the lookup (video only,
  `https`, height at most 720, the tallest, then `avc1`, then mp4).
- **Fetch directory**: `<intelligence data dir>/loft_media/`.
- **Failure count**: a new column `indexed_files.loft_fetch_failures`, integer,
  default 0.
- **Counted failure**: a lookup failure, no rendition, a download failure (ffmpeg
  error, 120 s without growth, free space below 1 GiB, or the time limit), or a
  stage that returned without setting its flag (still pending).
- **Time limit** of a download: 1.5 × the lookup's duration, at least 600 s; 7200 s
  when the duration is unknown.
- **OCR requested**: an in-memory set of file ids for which a `frame_ocr` reindex or
  prioritize was accepted; a restart forgets it.
- **Stages wanted** of a fetch: the scan when `frame_scan_indexed` is false; the OCR
  read when `frame_ocr_read` is false and either `features.video_frame_ocr` is
  `on_index` or the file is in OCR requested (never under `false`).
- **Requested during a run**: an in-memory set of file ids for which a reindex or a
  CLIP regenerate arrived while that file's fetch was running.

## Required items

### 1. Normal flow

SPEC-ADDON-117, the fetch:

1. **Reopening.** On every start, before the first sweep, every unclassified `.loft`
   that has no `video_frame_scans` row and no `video_frame_texts` row gets
   `frame_scan_indexed`, `frame_ocr_read` and `frame_ocr_indexed` set to false (they
   were closed as not applicable by an older build). The sweep (`_resume_incomplete`)
   closes the flags of a `.loft` of source `other` as it does today and no longer
   closes those of an unclassified or YouTube `.loft`.
2. **Queuing.** An unclassified or YouTube `.loft` with a stage wanted, or an
   unclassified one with an open flag, gets one `loft_media` task: a new file at
   priority 0, the sweep's backlog at -10, a reindex or prioritize at 100 (section 3
   for reindex). A `.loft` never gets a `frame_scan` task or a reading `frame_ocr`
   task. A YouTube `.loft` with `frame_ocr_read` true and `frame_ocr_indexed` false
   gets the existing rebuild-only `frame_ocr` task, which reads no video, under every
   mode, as a native video does.
3. **Order.** The `loft_media` worker starts a fetch only when the `frame_scan` and
   `frame_ocr` queues are empty and neither worker is processing, and when the
   indexing queue is not paused. One fetch at a time. Each fetch, in order:
   1. Reads the `.loft` (`read_loft`) outside any database transaction. Raises
      `LoftNotAccessible` or `LoftUnreadable`: ends, nothing written, not counted.
      `None` or another provider: writes loft source `other`, closes the three
      flags, ends. YouTube: writes loft source `youtube`.
   2. Recomputes the stages wanted; none: ends. Drive `index` feature off
      (`is_feature_enabled(drive, "index", default_on_failure=True)`): ends, nothing
      more written. The CLIP image model cannot load (when the scan is wanted) or the
      OCR engine cannot be created (when the OCR read is wanted): ends, nothing more
      written, not counted.
   3. Looks the video up (`run_lookup`, `yt-dlp -J --no-playlist --ignore-config`,
      60 s). When `IndexedFile.duration` is NULL and the lookup has a positive
      `duration`, writes it.
   4. Picks the rendition; none: counted failure.
   5. Disk guard: with the rendition's `filesize` or `filesize_approx` known, free
      space in the fetch directory minus it must be at least 2 GiB; unknown, at least
      4 GiB. Otherwise ends, not counted.
   6. Downloads: `ffmpeg` reads the rendition's `url` with its `http_headers`
      (`-headers`, as the frame route does) and copies the stream (`-c copy`, `-an`)
      to `loft_media/<file_id>.part`, renamed to `<file_id>.mp4` when ffmpeg exits 0.
      It is stopped, as a counted failure, after 120 s without growth, when free
      space falls below 1 GiB, or at the time limit.
   7. Runs the frame scan (`index_frame_scan`) when wanted, then the frame OCR read
      (`index_frame_ocr`) when wanted, each given the downloaded file as its source,
      with the queue's pause hook. Each writes and sets flags as for a native video.
      After its row commit, the scan of a `.loft` writes the `small` frame cache
      entry (320 px WebP, as `frame_ffmpeg_argv` makes it, from the downloaded file)
      of each change frame it stored, keeping an entry already there; a picture that
      cannot be written is skipped. After a scan that sets its flag, the Visual Index
      hook runs as for a native video.
   8. Deletes the downloaded file (also on every earlier exit and on an error). When
      every stage it ran set its flag, sets the failure count to 0; when one returned
      without setting it, that is a counted failure. Removes the file from OCR
      requested when the OCR read ran. When the file is in requested during a run, it
      removes it, opens the requested flags again and queues a new fetch at 100.
4. **The cap.** A counted failure adds 1 to the failure count. At 3, the wanted
   stages are closed as for a native video with no decodable picture: the scan sets
   `frame_scan_indexed` with no scan row; the OCR sets `frame_ocr_read` and
   `frame_ocr_indexed` with no text. A reindex or CLIP regenerate of the file sets the
   count to 0 and opens its flag again.
5. **Using the result.** The `.loft`'s on-screen text is indexed (`text_content`,
   FTS), found by find, shown as 「画面内の文字」 passages, sent to the one-file Ask,
   and sent to the drive-wide Ask as frame-text snippets after its transcript
   snippets, exactly as a native video's. Its change frames join the representative
   frame selection (the Visual Index sections, the Ask frame set, the `/scenes` route
   and `list_video_scenes`).
6. **Pictures.** `GET /files/{id}/scene-tile?t=` for a `.loft` serves the storyboard
   tile at that time as today; when there is none, the `small` frame cache entry at
   that time when it exists; otherwise 404. It never contacts the network, runs
   ffmpeg or writes a file. A native video still answers as today.
7. **Status.** `/status` counts pipeline videos in `frame_scan`, `frame_ocr` and their
   pending counts, and counts an unclassified `.loft` with an open flag as pending;
   a `.loft` of source `other` is never counted. The queue breakdown has a
   `loft_media` row, placed in the index widget's `TASK_ORDER` right after
   `frame_scan`, labelled 「YouTube の取得」 / "YouTube fetch", with the lucide
   `Download` icon.
8. **Per-file dialog.** `GET /files/{id}/index-details` (`IndexDetailsResponse`) gains
   `loft_source`: `"youtube"`, `"other"`, or `null` (unclassified or not a `.loft`).
   The dialog offers the `frame_ocr` row for a `.loft` exactly when `loft_source` is
   `"youtube"`, under the mode rule a native video follows; never for another `.loft`.

SPEC-ADDON-118, the Visual Index:

1. A YouTube `.loft` is eligible for the Visual Index on the same terms as a native
   video (the `video_visual_index` feature, the drive policy, `llm_cloud` through
   `resolve(drive, "video_visual_index")`, scene candidates and a finished scan),
   except that a `.loft` whose scan was closed by the cap (flag true, no
   `video_frame_scans` row) is not eligible. `enqueue_unprocessed` sweeps eligible
   pipeline videos.
2. A run's scene frame of a YouTube `.loft` is the `small` frame cache entry at the
   scene's time when it exists, otherwise the `small` frame read through
   `ensure_youtube_frame` (which writes that entry); never ffmpeg on the `.loft`'s path.
3. `GET /files/{id}/visual-index` answers for a YouTube `.loft` as for a native video,
   and `eligible: false` for any other `.loft`. `POST .../visual-index/generate`
   accepts a YouTube `.loft` and answers 404 for any other `.loft`.
4. The Scenes section of a `.loft` requests `visual-index` once on mount and on every
   `fileId` change, applies WebSocket Visual Index events for the current file at any
   time (a `.loft`'s section has no collapsed state), and draws the Visual Index part
   (marks, tile dots, scene card, actions including generate) under the drawing rules
   of a native video. Its pictures still come only from the scene-tile route.

### 2. Failure cases

- **`.loft` not accessible or unreadable** (mount outage): ends, not counted, loft
  source stays NULL; tried again on a later sweep, as a native file that is
  unreachable is.
- **`.loft` with no usable reference** (`None`): source `other`, flags closed.
- **Model or engine unavailable**: ends before any network call, not counted.
- **Lookup fails** (yt-dlp error, timeout, private or removed video): counted.
  Log `loft_media lookup failed (file <id>)`.
- **No rendition** (live, an archive still only in HLS, no `https` video-only format
  at or below 720p): counted. Log `loft_media no rendition (file <id>)`.
- **Download fails, stalls 120 s, free space below 1 GiB, or the time limit**:
  partial file deleted; counted. Log `loft_media download failed (file <id>)`.
- **Not enough disk before downloading**: not counted; tried again on a later sweep.
  Log `loft_media no space (file <id>)`.
- **A stage writes nothing and returns without setting its flag** (unreachable
  download, CLIP or engine failure partway): counted; the other stage still runs;
  the file is deleted.
- **Restart or shutdown during a fetch**: at startup the fetch directory is emptied
  before the first sweep can queue a fetch.
- **The file is purged or leaves the drive during a fetch**: the stages write nothing
  for a row that is no longer active (as today), so no small picture is written; the
  file is deleted.
- **A scene frame cannot be read** (SPEC-ADDON-118): the scene fails as a native
  scene whose frame cannot be extracted does.
- Retries: a counted failure and an uncounted end are retried on later sweeps
  (startup and every `reconciliation_interval`); counted failures stop at 3.
- Log lines name the file id only; neither a log line nor a stored error contains a
  URL, a video id or ffmpeg's stderr.

### 3. States

Per `.loft`: loft source (NULL / `youtube` / `other`), the three flags, the failure
count, membership in OCR requested and in requested during a run.

- Unclassified, flags open → fetch → `other` with flags closed; `youtube` continuing;
  or unchanged (not accessible).
- YouTube, a stage wanted → queued → running → stages set their flags (count 0) |
  counted failure (count + 1; at 3 wanted stages closed) | uncounted end (unchanged).
- **Reindex `frame_ocr`** (`POST /files/{id}/reindex`): under `false`, 422 for every
  file as today. Otherwise: a YouTube `.loft` gets `frame_ocr_read` and
  `frame_ocr_indexed` false, count 0, OCR requested, and a fetch at 100; an
  unclassified `.loft` the same; a `.loft` of source `other` answers 422 as a file of
  the wrong type. The answer is `already_queued` when a `loft_media` task for the file
  is queued (its priority is raised to 100 and the flags and sets are still updated),
  otherwise `accepted`, with `tasks_reset` naming `frame_ocr`.
- **CLIP regenerate** of a YouTube or unclassified `.loft`: sets `frame_scan_indexed`
  false, count 0, and queues a fetch at 100; of a `.loft` of source `other`, no scan.
- A reindex or regenerate whose file's fetch is running adds it to requested during
  a run and changes no flag; the running fetch, at its end, opens the flags and
  queues a new fetch (step 8). `is_queued` / `is_processing` for `frame_scan` and
  `frame_ocr` of a `.loft` answer from the `loft_media` queue.
- Not allowed: two fetches at once; a fetch while a native `frame_scan` or
  `frame_ocr` task is queued or processing; a fetch for a `.loft` of source `other`;
  a reading `frame_ocr` or a `frame_scan` task for any `.loft`; either worker reading
  a `.loft`'s own path; a download when no stage is wanted, the `index` feature is
  off, the model or engine is unavailable, or the queue is paused.

### 4. Data read and written

- Read: the `.loft` (`read_loft`), the lookup and the rendition, `IndexedFile`.
- Written in `search.db`: `indexed_files.loft_source`, `loft_fetch_failures`,
  `duration` (only from NULL), the three flags; the scan's `video_frame_scans` and
  `vec_clip_change`; the OCR's `video_frame_texts`, `text_content` embeddings and FTS;
  Visual Index runs and scenes. A migration adds the two columns (nullable / default
  0).
- The `vec_clip_change` dimension reset and the text-model rebuild apply to native
  videos and YouTube `.loft`s; the rebuild sets `frame_ocr_indexed` false for a
  `.loft` only when its loft source is `youtube`.
- Written on disk: the `small` frame cache entries of change frames and Visual Index
  scenes; the fetch directory (temporary).
- Nothing in core, nothing next to the `.loft` (the drives are mounted read-only).

### 5. External services

YouTube: one lookup and one ffmpeg read of the rendition URL per fetch; one `small`
frame per Visual Index scene that has no kept picture (`ensure_youtube_frame`).
Slow: 60 s lookup limit, 120 s stall limit, the time limit. Down or refusing: counted,
retried on a later sweep, closed after 3. Wrong (not a video): the stages fail as on
a corrupt native file. No cookie, credential or account option is passed to yt-dlp
or ffmpeg.

### 6. Authorization

Unchanged: workers act on indexed files; the `index` policy gates the fetch as it
gates the scan; the Visual Index keeps its `video_visual_index` policy and
`llm_cloud` checks; routes keep their drive checks.

### 7. Effect on existing features

- Native videos: unchanged (queuing, priorities, the rebuild-only task, the 422 for a
  wrong type, the counts, `scene-tile` answering 404 when no tile exists, no small
  pictures written by their scan).
- YouTube `.loft`: gains change frames and their small pictures, on-screen text in
  search, find and both Asks, a Visual Index in the Scenes section. One-file Ask: a
  `.loft` with no transcript but with frame text becomes a text video
  (SPEC-ADDON-114) and gets passages plus frames. The storyboard CLIP frames, the
  Scene candidates grid, the timeline's own frames, the frame route, transcription
  and `.stt_temp` handling are unchanged.
- `.loft` of other providers: read once, then closed as today.
- Network and disk: one download per YouTube `.loft` (about 300–500 MB per 30
  minutes at 720p), one at a time and only while the native frame queues are idle,
  deleted after; again after a CLIP regenerate, a `vec_clip_change` dimension change
  or a `frame_ocr` reindex of that file.

### 8. Error behavior

Viewers see nothing new on failure: the `.loft` has no on-screen text or Visual Index
until a fetch succeeds. The operator sees the log lines of section 2 and the pending
counts and the 「YouTube の取得」 row in the index widget.

### 9. User-visible behavior

- A YouTube `.loft` gets 「画面内の文字」 passages and find rows, and its on-screen
  text is part of what both Asks read.
- Its Visual Index sections, Ask frames and `list_video_scenes` draw on its change
  frames; its Scenes section shows the Visual Index and its generate action, with
  scene cards pictured from the kept small pictures.
- The index widget shows 「YouTube の取得」 after the Scene change scan row and counts
  YouTube `.loft`s in the scan and frame-OCR rows; existing `.loft`s are fetched only
  while native frame work is idle.
- The Index details dialog offers frame OCR for a YouTube `.loft`.

### 10. Non-functional

- One fetch at a time, only while the native frame queues are idle; at most one
  downloaded file on disk; the disk guard and the download stop rules.
- Privacy: the video the viewer referenced, kept only while processed, no audio.
- The `.loft` duration is never overwritten once set.

## Touch points

- `addons/intelligence/app/indexer.py`: `TaskType.LOFT_MEDIA` and its worker (waiting
  on the native frame queues), `_queue_file_tasks`, `_resume_incomplete`,
  `prioritize`, `is_queued` / `is_processing` / `_TASK_NAME_TO_TYPE`,
  `get_index_status`, `get_queue_breakdown`, the start-time reopen and fetch
  directory cleanup.
- `addons/intelligence/app/workers/loft_media.py` (new): the fetch.
- `addons/intelligence/app/youtube_source.py`: the download, reusing `read_loft`,
  `run_lookup`, `pick_format`, `_header_option`.
- `addons/intelligence/app/workers/frame_scan.py`, `app/workers/frame_ocr.py`: a
  source path parameter; neither reads a `.loft`'s own path; the scan's small
  pictures for a `.loft`.
- `addons/intelligence/app/workers/video_visual.py`: eligibility,
  `enqueue_unprocessed`, the scene frame of a YouTube `.loft`.
- `addons/intelligence/app/rag/context.py`: frame-text snippets of a YouTube `.loft`.
- `addons/intelligence/app/routers/video_visual.py`, `app/routers/files.py`
  (`scene-tile` fallback, reindex and CLIP regenerate of a `.loft`, `index-details`
  `loft_source`), `app/schemas.py` (`IndexDetailsResponse.loft_source`).
- `addons/intelligence/app/database.py`, `app/models.py`: the two columns, the
  `vec_clip_change` reset and the text-model rebuild.
- Frontend (`addons/intelligence/frontend/`): `ScenesSection/ScenesSectionContainer.tsx`,
  `ScenesSection/ScenesSectionPresenter.tsx`, `IndexDetailsDialog.tsx`,
  `IndexStatusWidget.tsx`, `api.ts` (`QueueTaskKind`, `loft_source`),
  `messages/en.json`, `messages/ja.json`.
- Tables: `indexed_files` (two new columns, duration, flags), `video_frame_scans`,
  `vec_clip_change`, `video_frame_texts`, `embeddings`/`vec_text`, FTS, Visual Index
  tables; the frame cache.
- Docs: `docs/addons/intelligence.md`, `docs/addons/media-import.md`.
- Rules: `.claude/rules/design-decisions.md` (drive policy, `llm_cloud`),
  `.claude/rules/backend-conventions.md` (additive migration, no language rules),
  `.claude/rules/frontend-conventions.md` (i18n).
- The core's `addons/intelligence` pointer and `docs/specs/INDEX.md`.
- No protected path.

## Invariants

I1. Only pipeline videos are ever scanned or frame-read, neither worker ever reads a `.loft`'s own path, a `.loft` of source `other` is never looked up or downloaded and keeps its flags closed, and an unclassified `.loft` is read and classified before any network call.

I2. A fetch downloads at most one rendition, video only, of height at most 720, with ffmpeg reading the lookup's rendition URL and no cookie, credential or account option, to the fetch directory only; the downloaded file is deleted when the fetch ends, whatever happened; at start the fetch directory is emptied before any fetch is queued; nothing is written next to the `.loft`; log lines and stored errors name only the file id.

I3. No download starts while another fetch runs, while a native `frame_scan` or `frame_ocr` task is queued or processing, while the queue is paused, while the drive's `index` feature is off, when no stage is wanted, when the model or engine a wanted stage needs is unavailable, or when the disk guard fails; a fetch that ends before its stages ran leaves every flag and stored row as it was, except the duration (written from NULL after a lookup), the loft source and the failure count.

I4. For the same pictures, the scan and the frame OCR of a YouTube `.loft` write the same rows and flags as for a native video of that file id, and its on-screen text reaches search, find, the one-file Ask and the drive-wide Ask through the same paths.

I5. `IndexedFile.duration` of a `.loft` is written only when NULL and only with a lookup's positive duration.

I6. The failure count changes only by a counted failure (+1), a fetch whose stages all set their flags (to 0), or a reindex or CLIP regenerate (to 0); at 3 the wanted stages are closed with no scan row and no text; a not-accessible `.loft`, an unavailable model or engine and the disk guard are never counted.

I7. Under `features.video_frame_ocr` `manual`, a fetch runs the OCR read only for a file in OCR requested; under `false` never, and a `frame_ocr` reindex answers 422 for every file; a `frame_ocr` reindex of a `.loft` of source `other` answers 422; a YouTube `.loft` with the read stored and the rows not built gets the rebuild-only task and no download.

I8. A Visual Index scene of a YouTube `.loft` uses the `small` cache entry at its time when one exists and otherwise `ensure_youtube_frame` at `small`, and never runs ffmpeg on the `.loft`'s path; eligibility, policy and `llm_cloud` decide its runs exactly as a native video's, except that a `.loft` whose scan was closed by the cap is not eligible; any other `.loft` is never eligible.

I9. `scene-tile` for a `.loft` serves the storyboard tile when one exists at that time, otherwise the `small` cache entry at that time, otherwise 404; for a native video it answers as before; it never contacts the network, runs ffmpeg or writes a file.

I10. On every start, every unclassified `.loft` with no scan row and no frame-text row has its three flags opened before the first sweep, and no native video's or YouTube `.loft`'s flags are changed by that step; `/status` counts pipeline videos in `frame_scan`, `frame_ocr` and their pending counts (`pending.frame_ocr` under `on_index` only) as a native video, counts an unclassified `.loft` with an open flag as pending, and never counts a `.loft` of source `other`.

## Revises

SPEC-ADDON-111 I8. Only native videos and YouTube `.loft`s are ever scanned, and every active one with the flag false is queued (a YouTube or unclassified `.loft` as its SPEC-ADDON-117 fetch), new videos and regenerates ahead of the backfill; purging a file and the orphan cleanup remove its scan row, its change frames and their vectors; a `vec_clip_change` dimension mismatch removes every change frame and sets the flag false for every native video and YouTube `.loft`; a CLIP regenerate of either queues one scan (a fetch for a `.loft`) and sets its flag false, unless one is running, when it is recorded and applied as SPEC-ADDON-117 step 8 says.
SPEC-ADDON-111 I10. Every item of the scenes route and of `list_video_scenes` carries `frame_time`, `list_video_scenes` fetches each scene's frame at its `frame_time`, and `/status` counts native videos and YouTube `.loft`s whose scan is pending, and unclassified `.loft`s with an open flag, in `pending.frame_scan` and `pending.total`, shown as the Scene change scan bar and queue row.
SPEC-ADDON-066 I4. An unreachable file (checked before reading and again after an ffmpeg error or stall, or a render error), or an engine that cannot be created at the start or partway, writes nothing and leaves every flag as it was; a file that is no longer an active row at write time gets nothing written; neither reader sends anything over the network (a YouTube `.loft` is read from the file its SPEC-ADDON-117 fetch downloaded) or writes or removes another file's rows; purging a file deletes its `video_frame_texts` and `pdf_page_ocr_texts` rows.
SPEC-ADDON-066 I7. With `on_index`, a new file's frame or page task is queued at priority 0, backlog tasks at -10 and a reindex at 100 (for a `.loft`, as its SPEC-ADDON-117 fetch); with `manual` only reindex or prioritize queue it; with `false` never, and reindex answers 422 for `frame_ocr` or `page_ocr`, as it does for a task on a file of the wrong type (a `.loft` of source `other` is one); a mode change takes effect only after a restart and removes no stored text. A file that is neither a video nor a YouTube or unclassified `.loft` never gets a frame task and one that is not a PDF never gets a page task, and neither counts as pending. `pending.frame_ocr` and `pending.page_ocr` count only under `on_index`, and only then join `pending.total`. The rebuild-only frame task, which calls no engine, is the exception: `_resume_incomplete` queues it under every mode.
SPEC-ADDON-079 I1. `GET /files/{id}/scene-tile?t=` returns only a file under `frames/{id}/tiles/` whose name is `t` in milliseconds with the frame cache's rounding, or, for a `.loft` with no such tile, the `small` frame cache entry at that time, as `image/webp`; when neither exists it answers 404, `t` is validated as the frame route validates it (422), a non-video file answers 400, and it never contacts the network, never runs ffmpeg and never writes a file.
SPEC-ADDON-089 I7. A `.loft` requests `clip-timestamps` and `visual-index` on mount and on every `fileId` change and at no other time (WebSocket Visual Index events for the current file reload `visual-index`), never applies a response for an earlier `fileId`, and takes every picture from the scene-tile route and none from the frame route. It draws the Visual Index part under the drawing rules of a native video. A tile that fails draws a blank tile-sized block, with its time label and click-to-seek.
SPEC-ADDON-090 I9. When the policy is off, when the first `visual-index` request fails, answers 404, or answers `eligible: false` or `available: false`, the section draws no Visual Index part: no dot count, no progress, no marks, no tile dots, no scene card and no actions. The timeline is otherwise unchanged. Otherwise every active-run scene is marked at its `start_time`, styled by its status as §9 says. A tile carries the dot exactly when a `succeeded` scene's `start_time` is within 0.05 s of its frame's `start`. The scene card shows the last succeeded, labelled scene at or before the point being looked at (or the first such scene before all of them), with its `visible_text` and never its `transcript_excerpt`. Activating the card seeks to that scene's `start_time`.

## Checked, no action

- **Transcription from the download**: media_import already offers speech-to-text
  for a video without captions; re-transcribing every YouTube `.loft` would compete
  with OCR and the scan on the production Mac mini for a small gain over YouTube's
  captions. The download is video only.
- **Keeping the download as a cache for Ask frames**: rejected by the human.
- **Streaming the scan and OCR from the YouTube URL instead of downloading**: two
  passes over a long stream; the human chose download and delete.
- **Downloading with yt-dlp `-f <id>`**: it resolves the video again and can pick
  another format; ffmpeg on the chosen URL downloads exactly the rendition looked up.
- **CLIP scene candidates from the download** instead of the storyboard tiles: the
  storyboard already gives a YouTube `.loft` its candidates (SPEC-ADDON-078); the
  Scene candidates grid and the timeline's frames stay storyboard-only, as a native
  video's stay scene-candidate-only.
- **A length limit**: none; the disk guard, the time limit and one-at-a-time bound
  the cost.
- **Pausing a running download**: a pause stops new fetches and the stages; a
  download in progress finishes (a paused download would trip the stall rule).
- **The scene timeline's frame route for change frames** (a YouTube request per
  card): rejected by the human in favour of the small pictures kept by the fetch.
- **A design artifact**: the Visual Index part and the queue row reuse the native
  video's existing UI; only a label and an icon are new.
- **Frame URLs of a `.loft`'s 「画面内の文字」 passage**: they follow the existing
  rule for a `.loft` (SPEC-ADDON-048 I7); not changed here.
- **scene-timeline.md numbering**: its invariants are shared by SPEC-ADDON-089 (the
  timeline, I7) and SPEC-ADDON-090 (the Visual Index on it, I9); each is revised
  under its own id. SPEC-ADDON-089 I6 (native expand rules) is unchanged.
- **A reopen marker**: none; the start-time reopen is idempotent and also recovers
  from a rollback that closed `.loft` flags again.
