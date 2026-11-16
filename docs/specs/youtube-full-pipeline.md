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
reaches search, find and Ask like a native video's. The Visual Index runs on a
YouTube `.loft` under its own settings, reading each scene frame from YouTube as
Ask does, and the Scenes section shows and generates it as for a native video
(SPEC-ADDON-118). The fetch also fills the `.loft`'s duration when it is missing.
Existing `.loft`s are worked through once at low priority. It is for a viewer who
keeps YouTube references in the library. Transcription is unchanged.

## Terms

- **`.loft`**: an active `IndexedFile` with mime `application/vnd.litloft.loft+json`.
- **Loft source**: a new nullable column `indexed_files.loft_source`: NULL until a
  fetch has read the `.loft`, then `youtube` when `read_loft` gives provider
  `youtube`, or `other` when it reads a source of another provider. A `.loft` that
  cannot be read stays NULL.
- **YouTube `.loft`**: a `.loft` whose loft source is `youtube`.
- **Pipeline video**: a native video (mime in `VIDEO_TYPES`) or a YouTube `.loft`.
- **Unclassified `.loft`**: a `.loft` whose loft source is NULL.
- **Fetch**: one run of the new `loft_media` task for one `.loft` (section 1).
- **Rendition**: the format `pick_format` returns from the lookup (video only,
  `https`, height at most 720, the tallest, then `avc1`, then mp4).
- **Fetch directory**: `<intelligence data dir>/loft_media/`.
- **Failure count**: a new column `indexed_files.loft_fetch_failures`, integer,
  default 0.
- **OCR requested**: an in-memory set of file ids for which a `frame_ocr` reindex or
  prioritize arrived (and `features.video_frame_ocr` is not `false`); a restart
  forgets it.
- **Stages wanted** of a fetch: the scan when `frame_scan_indexed` is false; the OCR
  read when `frame_ocr_read` is false and either `features.video_frame_ocr` is
  `on_index` or the file is in OCR requested.

## Required items

### 1. Normal flow

SPEC-ADDON-117, the fetch:

1. **Reopening.** A one-time migration sets `frame_scan_indexed`, `frame_ocr_read`
   and `frame_ocr_indexed` to false for every `.loft` that has no
   `video_frame_scans` row and no `video_frame_texts` row (they were closed as not
   applicable). From then on, the startup and periodic sweep (`_resume_incomplete`)
   no longer closes a `.loft`'s flags.
2. **Queuing.** A `.loft` that is unclassified or a YouTube `.loft`, with a stage
   wanted, gets one `loft_media` task: a new file at priority 0, the sweep's backlog
   at -10, a reindex (`frame_scan` through a CLIP regenerate, or `frame_ocr`) or a
   prioritize at 100. A `.loft` never gets a `frame_scan` task or a reading
   `frame_ocr` task. A YouTube `.loft` with `frame_ocr_read` true and
   `frame_ocr_indexed` false gets the existing rebuild-only `frame_ocr` task, which
   reads no video, under every mode, as a native video does.
3. **Worker.** One fetch runs at a time. Each fetch, in order:
   1. Reads the `.loft` (`read_loft`), outside any database transaction. Readable with
      another provider: writes loft source `other`, closes the three flags, ends.
      Unreadable: counts a failure (below), ends. YouTube: writes loft source
      `youtube` and continues.
   2. Recomputes the stages wanted; none: ends. Drive `index` feature off
      (`is_feature_enabled(drive, "index", default_on_failure=True)`): ends with
      nothing written.
   3. Looks the video up (`yt-dlp -J`, the existing `run_lookup`, 60 s). When
      `IndexedFile.duration` is NULL and the lookup has a positive `duration`, writes
      it.
   4. Picks the rendition; none: counts a failure, ends.
   5. Checks the disk: with the rendition's `filesize` or `filesize_approx` known,
      free space in the fetch directory minus it must be at least 2 GiB; unknown,
      free space must be at least 4 GiB. Otherwise ends with nothing more written
      (not a failure).
   6. Downloads: `ffmpeg` reads the rendition's `url` with its `http_headers`
      (`-headers`, as the frame route does) and copies the stream (`-c copy`, no
      audio) to `loft_media/<file_id>.part`, renamed to `<file_id>.mp4` when ffmpeg
      exits 0. It is stopped, and counts a failure, when the file has not grown for
      120 s or free space falls below 1 GiB.
   7. Runs the frame scan (`index_frame_scan`) when wanted, then the frame OCR read
      (`index_frame_ocr`) when wanted, each on the downloaded file in place of the
      `.loft`'s path, with the queue's pause hook. Each writes and sets flags as for
      a native video. The scan also writes the `small` frame cache entry (320 px
      WebP, as `frame_ffmpeg_argv` makes it) of each change frame it embeds. After a
      scan that sets its flag, the Visual Index hook runs as for a native video.
   8. Deletes the downloaded file (also on every earlier exit and on an error), sets
      the failure count to 0 when step 7 ran, and removes the file from OCR
      requested when the OCR read ran.
4. **Failures.** A counted failure adds 1 to the failure count. At 3, the wanted
   stages are closed as for a native video with no decodable picture: the scan sets
   `frame_scan_indexed` with no scan row; the OCR sets `frame_ocr_read` and
   `frame_ocr_indexed` with no text. A reindex or CLIP regenerate of the file sets
   the count to 0 and opens its flag again.
5. **Using the result.** The `.loft`'s on-screen text is then indexed
   (`text_content`, FTS), found by find, shown as 「画面内の文字」 passages and sent
   to Ask exactly as a native video's; its change frames join the representative
   frame selection.
6. **Pictures.** `GET /files/{id}/scene-tile?t=` for a `.loft` serves the storyboard
   tile at that time as today, and when there is none, the `small` frame cache entry
   at that time when it exists; otherwise 404 as today.
7. **Status.** `/status` counts pipeline videos in `frame_scan`, `frame_ocr` and their
   pending counts, and counts an unclassified `.loft` with an open flag as pending.
   The queue breakdown has a `loft_media` row, shown in the index widget as
   「YouTube の取得」 / "YouTube fetch" with its own icon, between the Scene change
   scan row and the frame OCR row.
8. **Per-file dialog.** The Index details dialog offers the `frame_ocr` row for a
   `.loft` whose per-file status reports loft source `youtube` (the per-file status
   gains `loft_source`), under the same mode rule as a native video.

SPEC-ADDON-118, the Visual Index:

1. A YouTube `.loft` is eligible for the Visual Index on the same terms as a native
   video: the `video_visual_index` feature, the drive policy, `llm_cloud` through
   `resolve(drive, "video_visual_index")`, scene candidates and a finished scan.
   `enqueue_unprocessed` sweeps pipeline videos.
2. A run's scene frame of a YouTube `.loft` is the `small` frame at the scene's time
   read through `ensure_youtube_frame` (the same `small` cache entry), not ffmpeg on
   a local path.
3. `GET /files/{id}/visual-index` answers for a YouTube `.loft` as for a native video;
   for any other `.loft` it answers `eligible: false`. `POST .../visual-index/generate`
   accepts a YouTube `.loft` and answers 404 for any other `.loft`.
4. The Scenes section of a `.loft` requests `visual-index` and draws the Visual Index
   part (marks, tile dots, scene card, actions including generate) under the same
   rules as for a native video; its pictures still come from the scene-tile route.

### 2. Failure cases

- **`.loft` unreadable** (mount hiccup): counted failure; loft source stays NULL.
- **Lookup fails** (yt-dlp error, timeout, private or removed video): counted
  failure; duration not written. Log `loft_media lookup failed (file <id>)`.
- **No rendition** (live, an archive still only in HLS, no `https` video-only format
  at or below 720p): counted failure. Log `loft_media no rendition (file <id>)`.
- **Download fails, stalls 120 s, or free space falls below 1 GiB**: partial file
  deleted; counted failure. Log `loft_media download failed (file <id>)`.
- **Not enough disk before downloading**: nothing written beyond duration; not
  counted; tried again on the next sweep. Log `loft_media no space (file <id>)`.
- **A stage fails** after the download (ffmpeg, engine, embedding): as for a native
  video (SPEC-ADDON-066 I3/I4, SPEC-ADDON-111 I7); the other stage still runs; the
  file is deleted; the failure count is reset (the video was read).
- **Restart or shutdown during a fetch**: at startup the fetch directory is emptied
  before the first sweep can queue a fetch; a `.part` an orphaned process still
  writes is removed again by the next startup.
- **The file is purged or leaves the drive during a fetch**: the stages write nothing
  for a row that is no longer active (as today); the file is deleted.
- **A scene frame cannot be read from YouTube** (SPEC-ADDON-118): the scene fails as a
  native scene whose frame cannot be extracted does.
- Retries: a counted failure is retried on each later sweep (startup and every
  `reconciliation_interval`) until the count reaches 3.

### 3. States

Per `.loft`: loft source (NULL / `youtube` / `other`), the three existing flags, the
failure count, membership in OCR requested.

- Unclassified, flags open → (fetch) → `other` with flags closed; or `youtube`
  continuing; or still unclassified with the count + 1.
- YouTube, a stage wanted → queued (`loft_media`) → running → stages done (flags as
  the stages left them, count 0) | failure (count + 1; at 3, wanted stages closed)
  | no space (unchanged).
- Any → reindex or CLIP regenerate → that flag open, count 0, queued at 100.
- A request (reindex, prioritize) for a file whose fetch is queued raises the queued
  task's priority and, for `frame_ocr`, adds the file to OCR requested; for a file
  whose fetch is running, it is recorded (flag opened, OCR requested) and the next
  sweep or the request's own enqueue after the run queues another fetch.
- Not allowed: two fetches at once, of one file or of two; a fetch for a `.loft` of
  source `other`; a reading `frame_ocr` or a `frame_scan` task for any `.loft`; a
  download when no stage is wanted or the `index` feature is off; a queue pause
  starting a new fetch (a running download continues; its stages wait on the pause).

### 4. Data read and written

- Read: the `.loft` (`read_loft`), the lookup and the rendition, `IndexedFile`.
- Written in `search.db`: `indexed_files.loft_source`, `loft_fetch_failures`,
  `duration` (only from NULL), the three flags; the scan's `video_frame_scans` and
  `vec_clip_change`; the OCR's `video_frame_texts`, `text_content` embeddings and FTS;
  Visual Index runs and scenes. A migration adds the two columns (nullable / default
  0) and reopens the flags once.
- Written on disk: the `small` frame cache entries of change frames and Visual Index
  scenes; the fetch directory (temporary).
- Nothing in core, nothing next to the `.loft` (the drives are mounted read-only).

### 5. External services

YouTube: one lookup (`yt-dlp -J --no-playlist --ignore-config <stored url>`, as
today) and one ffmpeg read of the rendition URL per fetch; one `small` frame per
Visual Index scene (existing `ensure_youtube_frame`). Slow: 60 s lookup limit, 120 s
stall limit. Down or refusing: counted failure, retried on a later sweep, closed
after 3. Wrong (not a video): the stages fail as on a corrupt native file. No cookie,
credential or account option is passed to yt-dlp or ffmpeg.

### 6. Authorization

Unchanged: workers act on indexed files; the `index` policy gates the fetch as it
gates the scan; the Visual Index keeps its `video_visual_index` policy and
`llm_cloud` checks; routes keep their drive checks.

### 7. Effect on existing features

- Native videos: unchanged (queuing, priorities, the rebuild-only task, the 422 for a
  wrong type, the counts).
- YouTube `.loft`: gains change frames and their small pictures, on-screen text in
  search, find and Ask, a Visual Index in the Scenes section. Ask about one file: a
  `.loft` with no transcript but with frame text becomes a text video
  (SPEC-ADDON-114) and gets passages plus frames. The storyboard CLIP frames, the
  frame route, transcription and `.stt_temp` handling are unchanged.
- `.loft` of other providers: read once, then closed as today.
- Network and disk: one download per YouTube `.loft` (about 300–500 MB per 30
  minutes at 720p), one at a time, deleted after; again after a CLIP regenerate, a
  `vec_clip_change` dimension change or a `frame_ocr` reindex of that file.

### 8. Error behavior

Viewers see nothing new on failure: the `.loft` has no on-screen text or Visual Index
until a fetch succeeds. The operator sees the log lines of section 2 (file id only,
never a URL or video id) and the pending counts and the 「YouTube の取得」 row in the
index widget.

### 9. User-visible behavior

- A YouTube `.loft` gets 「画面内の文字」 passages and find rows, and its on-screen
  text is part of what Ask reads.
- Its scene list and Scene candidates include change frames, drawn from their small
  pictures.
- Its Scenes section shows the Visual Index and its generate action as a native
  video's does.
- The index widget shows 「YouTube の取得」 and counts YouTube `.loft`s in the scan and
  frame-OCR rows; existing `.loft`s are worked through after native work.
- The Index details dialog offers frame OCR for a YouTube `.loft`.

### 10. Non-functional

- One fetch at a time; at most one downloaded file on disk; the disk guard of step 5
  and 6.
- Privacy: the video the viewer referenced, kept only while processed, no audio.
- The `.loft` duration is never overwritten once set.

## Touch points

- `addons/intelligence/app/indexer.py`: `TaskType.LOFT_MEDIA` and its worker,
  `_queue_file_tasks`, `_resume_incomplete` (stop closing `.loft` flags; queue
  fetches; the rebuild-only task), `prioritize`, `reindex_file` mapping,
  `is_queued` / `is_processing` / `_TASK_NAME_TO_TYPE`, `get_index_status`,
  `get_queue_breakdown`, startup cleanup of the fetch directory.
- `addons/intelligence/app/workers/loft_media.py` (new): the fetch.
- `addons/intelligence/app/youtube_source.py`: the download, reusing `read_loft`,
  `run_lookup`, `pick_format`, `_header_option`.
- `addons/intelligence/app/workers/frame_scan.py`, `app/workers/frame_ocr.py`: an
  optional source path in place of `file_path`, accepted for a YouTube `.loft`;
  the scan's small pictures of change frames.
- `addons/intelligence/app/workers/video_visual.py`: eligibility, `enqueue_unprocessed`,
  the scene frame of a YouTube `.loft`.
- `addons/intelligence/app/routers/video_visual.py`, `app/routers/files.py`
  (`scene-tile` fallback, reindex / CLIP-regenerate for a `.loft`, per-file status
  `loft_source`).
- `addons/intelligence/app/database.py`, `app/models.py`: the two columns, the
  one-time reopen, the `vec_clip_change` reset and text-model rebuild including
  YouTube `.loft`s.
- Frontend (`addons/intelligence/frontend/`): `ScenesSection/ScenesSectionContainer.tsx`
  and `ScenesSectionPresenter.tsx` (Visual Index for a `.loft`),
  `SceneCandidatesSection.tsx` if it gates on `.loft`, `IndexDetailsDialog.tsx`
  (`frame_ocr` row), `IndexStatusWidget.tsx` and `api.ts` (`loft_media` row,
  `QueueTaskKind`), `messages/en.json`, `messages/ja.json`.
- Tables: `indexed_files` (two new columns, duration, flags), `video_frame_scans`,
  `vec_clip_change`, `video_frame_texts`, `embeddings`/`vec_text`, FTS, Visual Index
  tables; the frame cache.
- Docs: `docs/addons/intelligence.md`, `docs/addons/media-import.md`,
  `docs/user-guide/search.md` if a viewer needs it.
- Rules: `.claude/rules/design-decisions.md` (drive policy, `llm_cloud`),
  `.claude/rules/backend-conventions.md` (additive migration, no language rules),
  `.claude/rules/frontend-conventions.md` (i18n, DESIGN.md).
- The core's `addons/intelligence` pointer and `docs/specs/INDEX.md`.
- No protected path.

## Invariants

I1. Only pipeline videos are ever scanned or frame-read; a `.loft` of source `other` is never looked up or downloaded and keeps its flags closed; an unclassified `.loft` is read and classified before any network call.

I2. A fetch downloads at most one rendition, video only, of height at most 720, with ffmpeg reading the lookup's rendition URL and no cookie, credential or account option, to the fetch directory only; the downloaded file is deleted when the fetch ends, whatever happened; at startup the fetch directory is emptied before any fetch is queued; nothing is written next to the `.loft`.

I3. No download starts while another fetch runs, while the queue is paused, while the drive's `index` feature is off, when no stage is wanted, or when the disk guard fails; a fetch that ends before its stages ran leaves every flag and stored row as it was, except the duration (written from NULL after a lookup), the loft source and the failure count.

I4. For the same pictures, the scan and the frame OCR of a YouTube `.loft` write the same rows and flags as for a native video of that file id, and its on-screen text reaches search, find and Ask through the same paths.

I5. `IndexedFile.duration` of a `.loft` is written only when NULL and only with a lookup's positive duration.

I6. A counted failure adds 1 to the failure count and nothing else; at 3 the wanted stages are closed with no scan row and no text; a stage run resets the count to 0, and a reindex or CLIP regenerate resets it and opens that flag.

I7. Under `features.video_frame_ocr` `manual`, a fetch runs the OCR read only for a file in OCR requested; under `false` never, and a `frame_ocr` reindex of a `.loft` answers 422 as for a native video; a YouTube `.loft` with the read stored and the rows not built gets the rebuild-only task and no download.

I8. A Visual Index scene of a YouTube `.loft` takes its frame from YouTube through `ensure_youtube_frame` at `small` and never runs ffmpeg on the `.loft`'s path; eligibility, policy and `llm_cloud` decide a YouTube `.loft`'s runs exactly as a native video's; any other `.loft` is never eligible.

I9. `scene-tile` for a `.loft` serves the storyboard tile when one exists at that time, otherwise the `small` cache entry at that time, otherwise 404; it never starts a YouTube request.

I10. `/status` counts pipeline videos in `frame_scan`, `frame_ocr` and their pending counts (`pending.frame_ocr` under `on_index` only) as it counts a native video, counts an unclassified `.loft` with an open flag as pending, and never counts a `.loft` of source `other`; the widget shows the `loft_media` queue row.

## Revises

SPEC-ADDON-111 I8. Only native videos and YouTube `.loft`s are ever scanned, and every active one with the flag false is queued (a YouTube or unclassified `.loft` as its SPEC-ADDON-117 fetch), new videos and regenerates ahead of the backfill; purging a file and the orphan cleanup remove its scan row, its change frames and their vectors; a `vec_clip_change` dimension mismatch removes every change frame and sets the flag false for every native video and YouTube `.loft`; a CLIP regenerate of either queues one scan (a fetch for a `.loft`) and sets its flag false unless one is running.
SPEC-ADDON-111 I10. Every item of the scenes route and of `list_video_scenes` carries `frame_time`, `list_video_scenes` fetches each scene's frame at its `frame_time`, and `/status` counts native videos and YouTube `.loft`s whose scan is pending, and unclassified `.loft`s with an open flag, in `pending.frame_scan` and `pending.total`, shown as the Scene change scan bar and queue row.
SPEC-ADDON-066 I4. An unreachable file (checked before reading and again after an ffmpeg error or stall, or a render error), or an engine that cannot be created at the start or partway, writes nothing and leaves every flag as it was; a file that is no longer an active row at write time gets nothing written; neither reader sends anything over the network (a YouTube `.loft` is read from the file its SPEC-ADDON-117 fetch downloaded) or writes or removes another file's rows; purging a file deletes its `video_frame_texts` and `pdf_page_ocr_texts` rows.
SPEC-ADDON-066 I7. With `on_index`, a new file's frame or page task is queued at priority 0, backlog tasks at -10 and a reindex at 100 (for a `.loft`, as its SPEC-ADDON-117 fetch); with `manual` only reindex or prioritize queue it; with `false` never, and reindex answers 422 for `frame_ocr` or `page_ocr`, as it does for a task on a file of the wrong type; a mode change takes effect only after a restart and removes no stored text. A file that is neither a video nor a YouTube or unclassified `.loft` never gets a frame task and one that is not a PDF never gets a page task, and neither counts as pending. `pending.frame_ocr` and `pending.page_ocr` count only under `on_index`, and only then join `pending.total`. The rebuild-only frame task, which calls no engine, is the exception: `_resume_incomplete` queues it under every mode.
SPEC-ADDON-089 I7. A `.loft` requests `clip-timestamps` on mount and on every `fileId` change and at no other time, never applies a response for an earlier `fileId`, and takes every picture from the scene-tile route and none from the frame route. It requests `visual-index` and draws the Visual Index part under the rules a native video follows. A tile that fails draws a blank tile-sized block, with its time label and click-to-seek.
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
  storyboard already gives a YouTube `.loft` its candidates (SPEC-ADDON-078).
- **A length limit**: none; the disk guard and one-at-a-time bound the cost.
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
  under its own id.
