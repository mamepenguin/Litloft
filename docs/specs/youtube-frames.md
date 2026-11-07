# Frames of a YouTube reference for Ask, the MCP tools and scene search

SPEC-ID: SPEC-ADDON-076
SPEC-ID: SPEC-ADDON-077
SPEC-ID: SPEC-ADDON-078
SPEC-ID: SPEC-CORE-058

Approval:

## Summary

A `.loft` that points at a YouTube video has no file to take a frame from, so everything
that looks at pictures stops at it: Ask cannot send the frame being played, the MCP tools
`get_video_frame` and `list_video_scenes` answer with the URL and nothing else, and the
video is absent from scene search because it has one thumbnail and no scene rows. This
change gives such a `.loft` a frame source and a scene index, both read from YouTube
without downloading the video.

- **A frame at a time.** The intelligence addon asks `yt-dlp` for the video's stream URLs
  and lets `ffmpeg -ss <t> -i <stream URL>` read one frame from the 720p-or-lower video
  stream. The frame is cached at the path a native video's frame uses. This feeds the
  existing frame endpoint (`small` and `large`), Ask's picture of the playing frame, and
  the MCP tools. A frame that cannot be read is unavailable; no other frame is ever
  substituted.
- **A scene index.** The storyboard YouTube publishes for the video (usually 320x180
  tiles, 3x3 per sheet, one tile per 10 s) is read once when the `.loft` is indexed, a
  tile is kept every 30 s at most, and each kept tile is embedded with CLIP as a scene row
  (`embedding_type = "clip"`) of the `.loft`. The existing scene list, scene-segment
  search and `include_scene_clip` search then see it. Tiles are never shown to a model or
  a person: they are index input only.

Measured on 2026-11-08 (hako: "YouTube の storyboard と時刻指定フレームの実測"; yt-dlp
2026.08.19, ffmpeg 8.0.1, eight videos, on the host): `yt-dlp -J` 1.4 to 2.1 s; a
time-addressed 720p frame 20 of 20 times, 0.7 to 5.2 s; a one-hour storyboard 43 sheets,
1.1 to 1.5 MB. Not measured: expiry of a stream URL, age-restricted and members-only
videos, many requests in a row, and any of this inside the intelligence container.

Two decisions are put to the human at approval, each with the author's default:

1. **Native search on a drive that holds a YouTube `.loft` can shift.** The YouTube scene
   rows join the drive's frame-vector population from which the scene-segment threshold
   is taken, and CLIP concept tagging and similar-files read the same rows. Default:
   accepted. The alternative, excluding those rows, keeps native results fixed but adds a
   second population and ranks YouTube moments on a scale different from the one they are
   searched with.
2. **No automatic backfill.** A YouTube `.loft` indexed after this change gets its
   scene rows automatically. An existing one gets them when its `clip` task is reindexed
   (the existing reindex action). Default: no backfill, so an upgrade causes no burst of
   YouTube requests whose throttling is unmeasured. The alternative is a one-time reset
   of every existing `.loft`.

- SPEC-ADDON-076: `GET /files/{file_id}/frame` serves a YouTube `.loft`.
- SPEC-ADDON-077: Ask attaches the frame at the player position for a YouTube `.loft`.
- SPEC-ADDON-078: a YouTube `.loft` gets scene rows from its storyboard, and
  `GET /files/{file_id}/scenes` serves it.
- SPEC-CORE-058: `get_video_frame` and `list_video_scenes` serve a YouTube `.loft`.

Out of scope: reading on-screen text of YouTube frames (frame OCR), the Visual Index,
downloading the whole video. They are separate changes.

## Required items

### 1. Normal flow

**A frame (SPEC-ADDON-076).**

1. A caller (the MCP tool, Ask, or an `<img>`) requests `GET /files/{file_id}/frame?t=<t>&size=<small|large>`.
2. As today the route finds the active indexed file, requires `file_type == "video"`, and
   answers from the cache `frames/{file_id}/{ms}.webp` or `{ms}.large.webp` on a hit.
3. On a miss for a file whose mime is the `.loft` mime, the route reads the `.loft` from
   the drive (JSON `{"provider": "...", "url": "..."}`) through the path validation the
   native route uses, in a helper the scenes route and the indexer share. Only
   `provider == "youtube"` continues.
4. The route obtains the video's stream description with `yt-dlp -J --no-playlist <url>`.
   The description is kept in memory for 5 minutes per file id. Concurrent requests for a
   file id share one lookup (single flight); the lookup does not take one of the 4 ffmpeg
   slots and has its own 15 s limit, so a waiting request whose own deadline passes
   answers 504 without ending it.
5. The route picks the video-only, plain-HTTPS format with the greatest height not above
   720, preferring an H.264 (`avc1`) stream and then an mp4 container among equal
   heights, and runs `ffmpeg -ss <t> -i <that format's URL>` with the format's request
   headers, one frame, scaled exactly as for a native frame (`small`: 320 wide, q70;
   `large`: long edge at most 1280, never enlarged, q80), through the same atomic write:
   a `.tmp` name unique per call (uuid), then `os.replace`. If ffmpeg cannot decode the
   chosen stream the request fails; no other format is tried.
6. The response is the cached WebP with the same headers as for a native frame.

**Ask (SPEC-ADDON-077).** For a question about a YouTube `.loft` carrying
`position_seconds`, the route's image step asks the same `large` cache entry (steps 3 to 5
on a miss) instead of running ffmpeg on the `.loft`. Its time limit is the frame route's
15 s. Everything else about the question is as in `docs/specs/file-ask-vision.md`.

**Scene index (SPEC-ADDON-078).** The `clip` task of a `.loft` runs two legs in this order,
and the storyboard leg runs whatever the thumbnail leg did, including when the `.loft`
has no thumbnail path:

1. The thumbnail leg is as today, but it is skipped when `clip_thumbnail_indexed` is
   already true, so a rerun of the task does not embed the thumbnail again.
2. For a YouTube `.loft` the storyboard leg follows. `yt-dlp -J` gives the `sb0` format,
   whatever tile size it declares, as a list of sheet URLs with the grid (`rows`,
   `columns`) and each sheet's duration.
3. The sheets are downloaded and cut into tiles by the declared tile size. The tile at
   position `k` of the sheet starting at `s` with duration `d` has timestamp
   `s + k * d / (rows * columns)`. The video's duration is the lookup's `duration`, else
   the indexed duration (media_import copies yt-dlp's into the core file row). A tile
   whose timestamp is not below it is dropped, so the empty cells of the last sheet go.
   With no known duration (null or not above 0) the video is treated as having no
   storyboard.
4. Tiles are kept in time order, a tile only when its timestamp is at least the spacing
   after the last kept one. The spacing is `indexing.frame_extraction.min_interval`, or
   `duration / max_frames` when that is larger, so a long video is spread over its whole
   length rather than cut at the cap.
5. Each kept tile is embedded with the same CLIP model and stored as an `embeddings` row
   of type `clip` with `timestamp_start` set, through the same insert path native scene
   frames use. The file's earlier `clip` rows are replaced in the same transaction, after
   every kept tile has been embedded.
6. `clip_indexed` becomes true, and the job returns True, on a definite result: rows
   written, or no `sb0` (or no known duration), or a `.loft` that is not YouTube. It stays
   false, and the job returns False, on a transient failure (see item 2). This is the same
   meaning `clip_indexed` has for a native video, so every existing site that reads,
   resets or queues on `clip_indexed` serves a YouTube `.loft` unchanged.
7. `GET /files/{file_id}/scenes` accepts a YouTube `.loft` (decided by the shared `.loft`
   reader) and runs the selection it runs for a native video over these rows.

**MCP (SPEC-CORE-058).** For `get_video_frame` and `list_video_scenes` on a `.loft`, the
tool reads the `.loft` through the core stream route, as SPEC-CORE-021 describes. When the
provider is `youtube` the tool continues as for a native video: the duration check, then
the intelligence request, and a frame is returned as an image block. For any other
provider, or an unreadable `.loft`, it returns the SPEC-CORE-021 error text. The tools'
descriptions, which say a `.loft` has no frames, are reworded.

### 2. Failure cases

| Where | What goes wrong | What happens |
|---|---|---|
| Frame, step 3 | `.loft` of another provider, unreadable, not JSON, no `url` | 400 `No frame source`; nothing is cached |
| Frame, step 4 | `yt-dlp` missing, fails (private, removed, age-restricted, members-only, live, region), or finds no plain-HTTPS video format | 502 `Frame source unavailable`; no cache file; the description is not kept |
| Frame, step 5 | ffmpeg fails (expired URL, 403, no frame at `t`) or the deadline passes during it | 500, or 504 for the deadline; the kept description of that file is dropped so the next request looks it up again; no cache file |
| Frame | The one 15 s deadline, spanning the lookup and ffmpeg, passes | 504 `Frame extraction timed out`; this request's ffmpeg is killed; no cache file |
| Frame | More than 4 ffmpeg runs already going in the process | The request waits for a slot inside its 15 s deadline; at the deadline 504. `list_video_scenes` never has more than 4 requests in flight (`mcp-video-frames` I8), so a scene list does not queue |
| Frame | Several requests for one file id arrive while its description is not kept | One lookup serves them all; if it fails they all fail with 502 |
| Frame | Two requests for the same file and time at once | Each writes its own uniquely named `.tmp` and replaces the cache path; the last replace wins with identical bytes |
| Frame as an `<img>` | Any failure | The browser shows its broken-image state, as for a native frame; the UI never requests a `.loft` frame, so no new UI |
| Ask | Any failure above, or `position_seconds` above a known indexed duration | `image: "unavailable"`, text-only retry or the notice, exactly as for a native video |
| Storyboard | The `.loft` cannot be read, `yt-dlp` fails, a sheet cannot be downloaded or decoded, or CLIP fails on a tile | Nothing is written, existing `clip` rows stay, `clip_indexed` stays false and the job returns False; the resume machinery queues it again, but a file that already failed in this process is not tried again until restart (its job ends False at once, with no network call) |
| Storyboard | The video has no `sb0`, or no known duration, or the `.loft` is not YouTube | No `clip` rows; `clip_indexed` true |
| Scenes | YouTube `.loft` with no `clip` rows | `scenes: []`, `candidate_count: 0`, as for a native video without candidates |
| Scenes | `.loft` of another provider | 400 `Not a video file`, as today |
| MCP | Intelligence answers 400, 500, 502 or 504 | `isError` `Litloft API error (<status>): <detail>`, as for a native video |
| MCP | Some of a scene list's small frames fail | The list is still returned without them (`mcp-video-frames` I7) |

### 3. States

- **A `.loft` row** is one of: not YouTube (no frame source, no storyboard rows,
  `clip_indexed` true after the thumbnail leg); YouTube not yet indexed (`clip_indexed`
  false); YouTube indexed (`clip_indexed` true, with rows or with none). Every move is the
  existing one: a reindex of the `clip` task, a vector-dimension migration, the per-drive
  policy purge, the Failed Jobs retry and the other existing resets set `clip_indexed`
  false and drop `clip` rows as they do for a native video.
- **A frame cache entry** exists or does not; it is written only whole.
- **The in-memory stream description** exists for at most 5 minutes, or is dropped on an
  ffmpeg failure or deadline.
- **The in-memory record of failed storyboard attempts** holds a file id from its first
  failure until the process restarts.

### 4. Data read and written

| Store | Access |
|---|---|
| The `.loft` file on the drive | read (provider, url); never written |
| `intelligence_data_dir/frames/{file_id}/{ms}.webp`, `{ms}.large.webp` | read; written on a miss; purged with the file by the existing purge |
| `embeddings` and `vec_clip` rows of type `clip` for the `.loft` | written (replace) by the storyboard leg; read by scenes, search, scene-segment search, similar files and CLIP concept tagging |
| `embeddings` row of type `clip_thumbnail` | untouched by the storyboard leg |
| `indexed_files.clip_indexed` | existing column; set by the storyboard leg as item 1 step 6 says |
| Schema, migrations, core DB | not touched |

### 5. External services

YouTube, from the intelligence container (which therefore needs outbound access to
`youtube.com`, `i.ytimg.com` and `googlevideo.com`): the page lookup `yt-dlp` makes, the
storyboard sheets (small images) and the video stream (`googlevideo.com` range reads).
Slow: the 15 s deadline (frames) and, for the storyboard leg, 60 s for the lookup and
120 s for all sheets, after which the leg ends as a failure; CLIP embedding of the kept
tiles then runs at the rate it runs for a native video, and the single CLIP worker is
busy meanwhile as it is for a native video. Down or changed (yt-dlp broken by a YouTube
change): every frame request is 502 and the storyboard leg fails without writing; native
videos, Ask text, and search are unaffected. Wrong (a different video, a 403 page):
ffmpeg cannot decode it and the request fails; nothing is cached.

### 6. Authorization

Unchanged. The frame route is reached through the host proxy whose `file_access`
pre_check authorizes the file, plus the strict `X-Lit-Drive` match when the header is
present. The scenes route uses `require_drive`. Ask's checks are SPEC-ADDON-053 and
SPEC-ADDON-071. The MCP tools use the caller's bearer token. No endpoint is added, and
the Internal API is not touched.

### 7. Effect on existing features

- **Native videos** take the same code path as before; only the `.loft` branch is new.
- **Search.** A YouTube `.loft` gains `clip` rows, so `include_scene_clip` and
  `/search/scene-segments` can return it with timestamps. Its rows join the drive's
  frame-vector population from which the scene-segment threshold (the top share of the
  drive's frames) is taken, so on a drive that holds a YouTube `.loft` that threshold, and
  with it the segments of native videos, can shift (decision 1). `frame_url` stays unset
  for every `.loft` passage (`passage-results-view` I7 holds).
- **Similar files and CLIP concept tagging** read `clip` rows by file id; for a YouTube
  `.loft` they now see scene rows as for a native video, and may suggest or rank it as
  they would a native video (decision 1).
- **Reindex, resume and status.** Nothing in them changes: the storyboard leg uses
  `clip_indexed`, so the queue, the status counters and the resets already count a YouTube
  `.loft` as they count a native video. A YouTube `.loft` whose lookup keeps failing stays
  counted as not indexed, as a native video whose CLIP keeps failing does.
- **Purge** of a file already removes its `clip` rows and frame directory.
- **The Visual Index** reads `clip` rows for candidates but stays native-only: it still
  refuses a `.loft`.
- **media_import** is not touched.

### 8. Error behavior

The statuses in item 2. The route logs one WARNING per failure with the file id, the
failure class (`not_youtube`, `lookup_failed`, `no_format`, `ffmpeg_failed`, `timeout`)
and no URL, no signed URL and no header; a failed lookup also logs the last line of
yt-dlp's error with URLs removed. The storyboard leg logs the class, the file id and the
counts of sheets and tiles. Ask's log classes are unchanged. The viewer sees what a
native video shows: Ask's notice line for an unavailable frame, an MCP error result, and
nothing at all for a missing storyboard.

### 9. User-visible behavior

- Ask on a YouTube `.loft` answers with the playing frame attached, and the answer can
  name what is on screen; when the frame cannot be read the existing notice appears. The
  answer starts up to 15 s later than a text-only one, the time the frame takes.
- The MCP tools return a frame, and a scene list of at most 24 scenes with small frames,
  for a YouTube `.loft`.
- Scene search can find a moment of a YouTube video, listed with its timestamp and no
  thumbnail.
- A first frame of a video takes about 2 to 7 s (lookup plus read); later frames of the
  same video within 5 minutes about 1 to 5 s; a repeated time is instant.
- A YouTube reference that was saved before this change has no scene rows until its
  `clip` task is reindexed.

### 10. Non-functional

- Size: a frame is at most 1280 px on the long edge; the storyboard leg downloads about
  1 to 6 MB per video, once.
- Time: 15 s per frame including the lookup; the storyboard leg's network part 3 minutes
  at most.
- Concurrency: at most 4 ffmpeg runs for YouTube frames per process, one shared lookup per
  file id; the storyboard leg runs one video at a time inside the indexer's existing CLIP
  worker.
- Acceptance without a network: the lookup and the ffmpeg run are replaceable in tests by
  fakes (a recorded `-J` description, a local video served as the stream), so every
  failure row is testable and CI never contacts YouTube. R-5 runs once inside the built
  intelligence container against a real video, because the measurement above was made on
  the host and the container may lack what yt-dlp needs for YouTube.
- Privacy: the server contacts YouTube for videos the user already saved; no cookie or
  credential is sent. A frame reaches an LLM only through Ask, under `llm_cloud` and the
  chosen profile, and reaches an agent only through the MCP caller's own token.
- Cost: no LLM call. CLIP embedding of up to 500 tiles per video, as for a native video.
- Fragility: `yt-dlp` follows YouTube's changes; the image build installs
  `yt-dlp>=2026.8.19`, the version measured, and a rebuild picks up fixes.

## Touch points

- `addons/intelligence/app/frame_cache.py` and a new module beside it holding the shared
  `.loft` reader (provider, url): a source lookup for a `.loft`, the 5-minute description
  cache with its single flight, the 4-slot bound, the one 15 s deadline.
- `addons/intelligence/app/routers/files.py`: `GET /files/{file_id}/frame`, the `.loft`
  branch.
- `addons/intelligence/app/rag/file_question.py`: `_frame_image` for a YouTube `.loft`.
- `addons/intelligence/app/workers/clip.py`: `_handle_thumbnail_fallback` (the skip when
  `clip_thumbnail_indexed` is true, and its early returns) and the storyboard leg after
  it.
- `addons/intelligence/app/routers/scenes.py`: the `.loft` refusal (the line
  `indexed["mime_type"] == LOFT_MIME`).
- `mcp-server/src/tools/video.ts` and its tests: the `.loft` branch and the two tool
  descriptions; `mcp-server/README.md`.
- `addons/intelligence/Dockerfile` and `addons/intelligence/Dockerfile.test`: install
  `yt-dlp`. **Protected path**: `risk-zones.conf` classifies `**/Dockerfile*` CRITICAL.
- `docs/specs/INDEX.md`: the four ledger rows.
- Docs: `docs/addons/intelligence.md` (YouTube frames, the outbound access the container
  needs, the `yt-dlp` dependency, that an older reference needs a `clip` reindex),
  `docs/user-guide/` (Ask and scene search on a YouTube reference).
  `docs/reference/api.md` does not list the frame route (checked), so it is unchanged.
- Rules passed through: `design-decisions.md` (drive boundary; LLM features, `llm_cloud`;
  Handling missing files), `backend-conventions.md` (atomic writes; no language-dependent
  rules), `internal-api-policy.md` (not engaged: no Internal API change).
- Read, not changed: `addons/intelligence/app/workers/video_visual.py`
  (`_load_candidates`), `app/scene_segments.py`, `app/search.py` (`_frame_url`), and every
  site that resets `clip_indexed` or deletes `clip` rows (`database.py`,
  `indexer.py`, `main.py`, `routers/admin.py`, `routers/files.py`, `purge.py`), which
  serve a YouTube `.loft` unchanged.
- Submodule: the addon change and the core pointer bump go in the order `CLAUDE.md`
  (Git) states.

## Invariants

What must not break at the touch points. Each is one observable sentence; after approval
this spec is not edited and a revision goes into the change's `invariants.md`.

I1. For a `.loft` whose JSON `provider` is `youtube`, `GET /files/{id}/frame` returns the video stream's frame at `t`, `small` 320 px wide q70 or `large` with its long edge at most 1280 px and never enlarged, and stores it under the same cache path a native frame uses; for a `.loft` of any other provider, an unreadable `.loft`, or one without a `url`, it answers 400 and writes nothing.
I2. A failure to look up, fetch or decode the frame leaves no cache file and no `.tmp` file and answers 502 (lookup, no usable format), 500 (ffmpeg) or 504 (deadline), and no frame of another time, no storyboard tile and no thumbnail is returned or cached in its place.
I3. One request spends at most 15 s in all, lookup and ffmpeg together; at most 4 ffmpeg runs for YouTube frames go at once in a process, and a request that cannot take a slot in time answers 504; concurrent requests for one file id share one lookup, and a waiting request whose deadline passes neither fails the others nor ends the lookup.
I4. A stream description is reused for 5 minutes, is dropped after any ffmpeg failure or deadline for its file, and is never kept after a failed lookup.
I5. `yt-dlp` is given only the `.loft`'s stored `url`, with `--no-playlist` and no cookie or credential option, ffmpeg and the sheet downloads are given only addresses that lookup returned, and no log line the change writes contains a URL or a request header.
I6. Ask on a YouTube `.loft` with `position_seconds` attaches exactly one `large` frame at that position, under every invariant of SPEC-ADDON-071 (profile, `llm_cloud`, one slot, nothing stored or logged but the `large` cache entry); a position above a known indexed duration, or any frame failure, ends in `"unavailable"` and the text-only retry; Ask on a `.loft` of another provider is unchanged.
I7. The storyboard leg replaces a YouTube `.loft`'s `clip` rows in one transaction after every kept tile has been embedded, keeps a tile only when its timestamp is below the known duration and at least the spacing (`min_interval`, or `duration / max_frames` when larger) after the last kept tile, so a long video is spread over its whole length with at most `max_frames` tiles, writes no `clip_thumbnail` row and no row for another file, and runs whatever the thumbnail leg did.
I8. After the `clip` task of a `.loft`, `clip_indexed` is true exactly when the thumbnail leg is done and the storyboard leg wrote rows, found no `sb0` or no known duration, or found the `.loft` not YouTube; on a transient failure it is false, the existing `clip` rows are as they were, and the same file is not attempted again in that process; a repeat run never leaves two sets of rows or a second `clip_thumbnail` row.
I9. `GET /files/{id}/scenes` for a YouTube `.loft` returns the selection a native video gets from the same rows, makes no network call and no LLM call, and writes nothing; for a `.loft` of another provider it answers 400 `Not a video file`; for a native video it answers exactly as before.
I10. No passage of a `.loft` carries a `frame_url`, and on a drive that holds no YouTube `.loft` every result of `/search` and `/search/scene-segments`, with its score and order, is the same as before this change.

## Revises

SPEC-CORE-021 I1. Either tool on a `.loft` whose provider is not `youtube` and whose stream body is a JSON object with a non-empty string `url` returns an error result whose content is exactly one text block, `<file_id> is a .loft reference to <url>; it has no local video to read frames from`, with `<url>` identical to the stored value.
SPEC-CORE-021 I3. On a `.loft` whose provider is not `youtube`, the requests either tool sends are exactly `GET /api/files/{file_id}` followed by `GET /api/files/{file_id}/stream`; none goes to `/api/addons/intelligence/`, and in `get_video_frame` the `.loft` check runs before the duration check. On a `.loft` whose provider is `youtube` the tool sends those two requests and then continues as for a native video, duration check included, and returns the frame as an image block.
SPEC-CORE-021 I5. A result for a `.loft` whose provider is not `youtube` never contains an image block and is never reported as `Litloft API error`.
SPEC-CORE-021 I6. A call on a `.loft` whose provider is not `youtube` returns the same result whatever `drive` argument is passed; a call on one whose provider is `youtube` sends the `drive` argument as `X-Lit-Drive`.

## Checked, no action

- **A storyboard tile as a fallback when the large frame fails**: refused by
  SPEC-ADDON-071 I7 (never another frame); tiles are index input only.
- **A storyboard for `small` frames**: a scene list asks for up to 24 small frames, and a
  tile at the scene's time would be quicker. Using the one frame path keeps one rule
  (the picture at exactly `t`) and the cost stays inside the existing 45 s budget.
- **A new `storyboard_indexed` column**: `clip_indexed` already means "the CLIP legs of
  this file reached a result", so reusing it avoids a migration, a second flag for every
  reset site to remember, and a perpetually incomplete native row.
- **A one-time reset of every existing `.loft` (backfill)**: decision 2.
- **A changed URL under the same file id** (a `.loft` rewritten to another video): frames
  and rows are keyed by file id, so the old ones would stay. Media_import writes a `.loft`
  once and nothing edits it in normal use; left out.
- **On-screen text of YouTube frames (frame OCR) and the Visual Index**: a 320 px tile is
  not readable and the Visual Index is native-only by an approved decision; each is its
  own change.
- **The whole-video 720p download**: a separate opt-in spec; the user judged it a last
  resort.
- **Frames of other providers (Vimeo and the rest)**: their stream and storyboard
  behavior is unmeasured; `provider == "youtube"` is the only gate.
- **A browser-driven source (an embedded player in headless Chromium)**: heavier and
  slower in a container (480 p start, error 150 for IP origins); measured in
  `yt-frames-mcp`, not chosen for the server.
- **`frame_url` for YouTube scene passages**: a result list would trigger one 2 to 7 s
  lookup per thumbnail; the passage shows its time without a picture.
- **A setting that turns the storyboard leg off**: it downloads 1 to 6 MB per video once,
  under the drive's existing `index` policy; a switch would add a settings screen for
  one flag.
- **Streams of 1080 p and above, HLS and DASH-fragmented formats**: the `large` frame is
  capped at 1280 px, so a 720 p stream is enough, and plain HTTPS formats are the ones
  measured.
- **Live, premiere, members-only, age-restricted videos**: they fail the lookup or have no
  usable format and fall under the failure rows; whether any works is not measured.
- **A frontend change**: Ask already sends `position_seconds` for a YouTube player while
  it is not interrupted (`file-ask-vision` Checked, no action), so no UI change is
  planned; R-5 confirms.
- **Core change and Internal API**: none; the addon reads the `.loft` from the drive and
  the core's data is untouched.
- **SPEC-CORE-021 I2 and I4 stand**: an unreadable `.loft` keeps the no-URL error text,
  and a non-`.loft` file never requests the stream.
- **Excluding YouTube rows from the scene-segment threshold population**: decision 1.
- **A per-key guard for two requests of one time**: the native code already writes a
  uniquely named `.tmp` per call, so the last replace wins with identical bytes.
- **A codec fallback when ffmpeg cannot decode the chosen stream**: H.264 is preferred and
  a failure is reported as `ffmpeg_failed`; a second attempt would double the time of the
  failing case for a stream shape no measured video had.
- **An invariant for the Dockerfile install and the docs**: a missing `yt-dlp` shows as
  502 and a `lookup_failed` log (I2, I5) and R-5 runs in the built container; documentation
  is not behavior a mutation can break.
