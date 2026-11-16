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
20 sampled frames, and an ingredient shown between two of them is lost (measured
in production on 2026-11-16: one of the steps missed). With this change the
intelligence addon fetches each YouTube `.loft`'s video once, at up to 720p and
without audio, runs the frame scan and frame OCR on it exactly as on a native
video, and deletes it (SPEC-ADDON-117). Its on-screen text then reaches search,
find and Ask like a native video's, and its change frames improve the
representative frames. The Visual Index runs on a YouTube `.loft` under its own
settings, reading each scene frame from YouTube as Ask does (SPEC-ADDON-118). The
fetch also fills the `.loft`'s duration when it is missing. It is for a viewer
who keeps YouTube references in the library. Transcription is unchanged.

## Terms

- **YouTube `.loft`**: an active `IndexedFile` with mime
  `application/vnd.litloft.loft+json` whose `read_loft` source has provider
  `youtube`. A `.loft` of another provider, or one that cannot be read, is not one.
- **Pipeline video**: a native video (mime in `VIDEO_TYPES`) or a YouTube `.loft`.
- **Fetch**: one run of the new `loft_media` task for one YouTube `.loft`: a
  `yt-dlp -J` lookup, the choice of one rendition, its download to the fetch
  directory, the frame scan and the frame OCR read on the downloaded file, and the
  deletion of the file.
- **Rendition**: the format `pick_format` returns for the lookup (video only,
  `https`, height at most 720, the tallest, then `avc1`, then mp4).
- **Fetch directory**: `<intelligence data dir>/loft_media/`.
- **Stages wanted**: the scan when `frame_scan_indexed` is false; the OCR read when
  `frame_ocr_read` is false and `features.video_frame_ocr` is `on_index`, or the
  fetch was queued by a reindex or prioritize of `frame_ocr`.

## Required items

### 1. Normal flow

SPEC-ADDON-117, the fetch:

1. A YouTube `.loft` gets a `loft_media` task wherever a native video gets a
   `frame_scan` or `frame_ocr` task today: a new file at priority 0, the startup
   backlog at -10, a reindex or prioritize at 100, a CLIP regenerate. One task per
   file; the task replaces the `frame_scan` and `frame_ocr` tasks for that file.
2. The `loft_media` worker runs one fetch at a time. It skips the file, leaving
   every flag as it is, when no stage is wanted, when the drive's `index` feature is
   off (`is_feature_enabled(drive, "index", default_on_failure=True)`), or when the
   file is no longer a YouTube `.loft`.
3. It looks the video up (`yt-dlp -J`, 60 s). When `IndexedFile.duration` is NULL and
   the lookup has a positive `duration`, it writes that duration.
4. It picks the rendition and downloads it with yt-dlp to
   `loft_media/<file_id>.part`, renamed to `<file_id>.mp4` when complete.
5. It runs the frame scan (`index_frame_scan`) when wanted, then the frame OCR read
   (`index_frame_ocr`) when wanted, each on the downloaded file instead of the
   `.loft`'s path, with the queue's pause hook. Each writes and sets its flags as it
   does for a native video. After a scan that sets its flag, the Visual Index hook
   runs as for a native video.
6. It deletes the downloaded file, whatever the stages did.
7. The `.loft`'s on-screen text is then indexed (`text_content`, FTS), found by
   find, shown as 「画面内の文字」 passages and sent to Ask exactly as a native
   video's.

SPEC-ADDON-118, the Visual Index:

1. A YouTube `.loft` is eligible for the Visual Index on the same terms as a native
   video: the `video_visual_index` feature, the drive policy, `llm_cloud` through
   `resolve(drive, "video_visual_index")`, scene candidates and a finished scan.
2. A run's scene frame is the `small` frame at the scene's time read through
   `ensure_youtube_frame` (the same cache entry the frame route uses), not ffmpeg on
   a local path.
3. `GET /files/{id}/visual-index` answers `eligible` for a YouTube `.loft` as for a
   native video, and `POST .../visual-index/generate` accepts it.

### 2. Failure cases

- **The lookup fails** (yt-dlp error, timeout, private or removed video): nothing is
  written, flags stay false, the file is fetched again on the next startup backlog
  or reindex. Log `loft_media lookup failed (file <id>)`.
- **No rendition** (live, or no `https` video-only format at or below 720p): the
  wanted stages are closed as for a native video with no decodable picture — the
  scan sets `frame_scan_indexed` with no scan row, the OCR sets `frame_ocr_read`
  and `frame_ocr_indexed` with no text. Log `loft_media no rendition (file <id>)`.
- **The download fails, stalls 120 s without a byte, or exceeds the size limit**:
  the partial file is deleted, flags stay false, retried as for a lookup failure.
- **Not enough disk**: when the rendition's `filesize` or `filesize_approx` is known
  and the fetch directory's free space minus it is below 2 GiB, or it is unknown and
  free space is below 4 GiB, nothing is downloaded and flags stay false. Log
  `loft_media no space (file <id>)`.
- **A stage fails** after the download (ffmpeg error, engine error, embedding
  failure): as for a native video (SPEC-ADDON-066 I3/I4, SPEC-ADDON-111 I7); the
  other stage still runs; the file is deleted.
- **Restart during a fetch**: at startup every file in the fetch directory is
  deleted before any fetch starts.
- **The file is purged or leaves the drive during a fetch**: the stages write
  nothing for a row that is no longer active (as today); the file is deleted.
- **A scene frame cannot be read from YouTube** (SPEC-ADDON-118): the scene fails as
  a native scene whose frame cannot be extracted does.

### 3. States

Per YouTube `.loft`, the existing flags `frame_scan_indexed`, `frame_ocr_read`,
`frame_ocr_indexed`, all false until a fetch closes them; no new column. A fetch is
`queued` → `running` → done (flags as the stages left them, file deleted). A
`.loft` that is not a YouTube `.loft` keeps today's state: the startup sweep closes
its flags as not applicable.

### 4. Data read and written

- Read: the `.loft` file (`read_loft`), the YouTube lookup and rendition, `IndexedFile`.
- Written: `IndexedFile.duration` (only from NULL), the scan's `video_frame_scans`
  and `vec_clip_change` rows, the OCR's `video_frame_texts`, `text_content`
  embeddings and FTS rows, the flags; Visual Index runs and scenes; the `small`
  frame cache entries; the fetch directory (temporary).
- Nothing in core, nothing next to the `.loft` (the drives are mounted read-only).

### 5. External services

YouTube through yt-dlp: one lookup and one download per fetch; one `small` frame
per Visual Index scene. Slow: the stall limit (120 s) and the lookup limit (60 s).
Down or refusing: retried on the next backlog; no retry loop inside a run.
Wrong (a rendition that is not a video): the scan and OCR fail as on a corrupt
native file. yt-dlp and ffmpeg are the versions the addon image already installs.

### 6. Authorization

None changes: workers act on the indexed files of drives the addon serves; the
`index` policy gates the fetch as it gates the scan; the Visual Index keeps its
`video_visual_index` policy and `llm_cloud` checks. Routes keep their drive checks.

### 7. Effect on existing features

- Native videos: unchanged.
- YouTube `.loft`: gains change frames (representative frames use them),
  on-screen text in search, find and Ask, a Visual Index; the storyboard CLIP
  frames, the frame and scene-tile routes, transcription and the `.stt_temp`
  handling are unchanged.
- `.loft` of other providers: unchanged.
- `/status` and the index widget count YouTube `.loft`s in the scan and frame-OCR
  counts.
- Network and disk: one download per YouTube `.loft` (about 300–500 MB per 30
  minutes at 720p), one at a time, deleted after.

### 8. Error behavior

Viewers see nothing new on failure: the `.loft` simply has no on-screen text or
Visual Index until a fetch succeeds. The operator sees the log lines in section 2
(file id only, never a URL or video id, as `youtube_source` already scrubs) and
the pending counts in `/status`.

### 9. User-visible behavior

- A YouTube `.loft` gets 「画面内の文字」 passages and find rows, and its on-screen
  text is part of what Ask reads.
- Its representative frames and scene list include its change frames.
- The index widget's scan and frame-OCR counts include YouTube `.loft`s; the backlog
  of existing ones is worked through after native work.
- The Visual Index can be generated for a YouTube `.loft` where the routes and
  widgets that already show it for a native video show it.

### 10. Non-functional

- One fetch at a time; at most one downloaded file on disk.
- Free-space guard as in section 2.
- Privacy: the download is the video the viewer already referenced, kept only
  while it is processed; no audio is downloaded.
- The `.loft` duration is never overwritten once set.

## Touch points

- `addons/intelligence/app/indexer.py`: `TaskType` (new `loft_media`), its worker,
  `_queue_file_tasks`, `_resume_incomplete` (stop closing YouTube `.loft` flags),
  `prioritize`, `get_index_status` counts, startup cleanup of the fetch directory.
- `addons/intelligence/app/workers/loft_media.py` (new): the fetch.
- `addons/intelligence/app/youtube_source.py`: the download (yt-dlp), reusing
  `read_loft`, `run_lookup`, `pick_format`.
- `addons/intelligence/app/workers/frame_scan.py`, `app/workers/frame_ocr.py`: an
  optional source path in place of `file_path`, and the mime gate accepting a
  YouTube `.loft` when that path is given.
- `addons/intelligence/app/workers/video_visual.py`: eligibility, `enqueue_unprocessed`,
  the scene frame of a YouTube `.loft`.
- `addons/intelligence/app/routers/video_visual.py`, `app/routers/files.py`
  (frame-OCR reindex and the CLIP-regenerate rescan for a YouTube `.loft`).
- `addons/intelligence/app/database.py`: the `vec_clip_change` dimension reset and
  the text-model rebuild include YouTube `.loft`s.
- Tables: `indexed_files` (duration, flags), `video_frame_scans`, `vec_clip_change`,
  `video_frame_texts`, `embeddings`/`vec_text`, FTS, Visual Index tables.
- Docs: `docs/addons/intelligence.md`, `docs/addons/media-import.md` (what happens to
  a YouTube reference), `docs/user-guide/search.md` if a viewer needs it.
- Rules: `.claude/rules/design-decisions.md` (drive policy, `llm_cloud`, missing
  files), `.claude/rules/backend-conventions.md` (atomic writes, no language rules).
- The core's `addons/intelligence` pointer and `docs/specs/INDEX.md`.
- No protected path.

## Invariants

I1. Only YouTube `.loft`s and native videos are ever scanned or frame-read; a `.loft` that is not a YouTube `.loft` is never fetched and keeps its flags closed as not applicable.

I2. A fetch downloads at most one rendition, video only, of height at most 720, to the fetch directory, and the downloaded file is deleted when the fetch ends, whatever happened; at startup the fetch directory is emptied before any fetch starts; nothing is ever written next to the `.loft`.

I3. No fetch runs while the drive's `index` feature is off, while another fetch runs, or when no stage is wanted; a fetch that fails before its stages ran leaves every flag and every stored row as it was.

I4. For the same pictures, the scan and the frame OCR of a YouTube `.loft` write the same rows and flags as they would for a native video of that file id; the `.loft`'s on-screen text reaches search, find and Ask through the same paths as a native video's.

I5. `IndexedFile.duration` of a YouTube `.loft` is written only when it is NULL, and only with the lookup's positive duration.

I6. A YouTube `.loft` with no rendition has its wanted stages closed with no scan row and no text, and is not fetched again unless a reindex or a CLIP regenerate opens a flag.

I7. A Visual Index scene of a YouTube `.loft` takes its frame from YouTube through `ensure_youtube_frame` and never runs ffmpeg on the `.loft`'s path; eligibility, policy and `llm_cloud` decide a YouTube `.loft`'s runs exactly as a native video's.

I8. `/status` counts a YouTube `.loft` in `frame_scan`, `pending.frame_scan`, `frame_ocr` and `pending.frame_ocr` (the latter under `on_index` only) as it counts a native video.

## Revises

SPEC-ADDON-111 I8. Only native videos and YouTube `.loft`s are ever scanned, and every active one with the flag false is queued (a YouTube `.loft` through its fetch), new videos and regenerates ahead of the backfill; purging a file and the orphan cleanup remove its scan row, its change frames and their vectors; a `vec_clip_change` dimension mismatch removes every change frame and sets the flag false for every native video and YouTube `.loft`; a CLIP regenerate of either queues one scan and sets its flag false unless a scan is running.
SPEC-ADDON-111 I10. Every item of the scenes route and of `list_video_scenes` carries `frame_time`, `list_video_scenes` fetches each scene's frame at its `frame_time`, and `/status` counts native videos and YouTube `.loft`s whose scan is pending in `pending.frame_scan` and `pending.total`, shown as the Scene change scan bar and queue row.
SPEC-ADDON-066 I4. An unreachable file (checked before reading and again after an ffmpeg error or stall, or a render error), or an engine that cannot be created at the start or partway, writes nothing and leaves every flag as it was; a file that is no longer an active row at write time gets nothing written; neither reader sends anything over the network (a YouTube `.loft` is read from the file its SPEC-ADDON-117 fetch downloaded) or writes or removes another file's rows; purging a file deletes its `video_frame_texts` and `pdf_page_ocr_texts` rows.
SPEC-ADDON-066 I7. With `on_index`, a new file's frame or page task is queued at priority 0, backlog tasks at -10 and a reindex at 100 (for a YouTube `.loft`, as its SPEC-ADDON-117 fetch); with `manual` only reindex or prioritize queue it; with `false` never, and reindex answers 422 for `frame_ocr` or `page_ocr`, as it does for a task on a file of the wrong type; a mode change takes effect only after a restart and removes no stored text. A file that is neither a video nor a YouTube `.loft` never gets a frame task and one that is not a PDF never gets a page task, and neither counts as pending. `pending.frame_ocr` and `pending.page_ocr` count only under `on_index`, and only then join `pending.total`. The rebuild-only frame task, which calls no engine, is the exception: `_resume_incomplete` queues it under every mode.

## Checked, no action

- **Transcription from the download**: media_import already offers speech-to-text
  for a video without captions (「字幕がなければ」/「常に」, and 「音声認識で字幕を
  生成」); re-transcribing every YouTube `.loft` would compete with OCR and the scan
  on the production Mac mini for a small gain over YouTube's captions. The download
  is video only.
- **Keeping the download as a cache for Ask frames**: rejected by the human; frames
  are still cut from YouTube per request.
- **Streaming the scan and OCR from the YouTube URL instead of downloading**: two
  passes over a long stream and no yt-dlp retry; the human chose download and delete.
- **CLIP scene candidates from the download** instead of the storyboard tiles: the
  storyboard already gives a YouTube `.loft` its candidates (SPEC-ADDON-078); the
  scan's change frames add the rest.
- **`.loft` of other providers**: no source to fetch.
- **A length limit**: none; the disk guard and one-at-a-time bound the cost.
- **The scene timeline drawing the Visual Index of a `.loft`** (SPEC-ADDON-089/090 I7,
  I9): see the question for the human.
- **Frame URLs of a `.loft`'s 「画面内の文字」 passage**: they follow the existing rule
  for a `.loft` (SPEC-ADDON-048 I7 sets `frame_url` only for a non-`.loft` video's
  utterance and scene passages); not changed here.
