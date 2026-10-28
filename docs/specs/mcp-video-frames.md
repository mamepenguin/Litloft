# MCP: let an agent look at a video's frames

SPEC-ID: SPEC-CORE-008
SPEC-ID: SPEC-CORE-009
SPEC-ID: SPEC-ADDON-030
SPEC-ID: SPEC-ADDON-031

Approval:

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

An agent using the Litloft MCP server today knows a video only through its transcript,
so anything shown and not said (on-screen text, captions, slides, ingredients, a silent
demonstration) is out of its reach. This change lets the agent look at the video itself.
Two MCP tools are added: `get_video_frame` returns the frame at a given time as an image,
large enough to read on-screen text, and `list_video_scenes` returns a handful of
representative scenes, each with its time, the nearby transcript and a small frame image.
The scenes are chosen from the scene-change frames the intelligence addon already
extracts and embeds with CLIP while indexing, using the same deterministic, LLM-free
selection the Visual Index uses, so it works for every indexed native video whether or
not a Visual Index was ever generated. The agent reads the frames with its own model; no
description is generated or stored. Two intelligence endpoints back this: the existing
frame endpoint gains a large size, and a new scenes endpoint returns the selection.

- SPEC-CORE-008: MCP tool `get_video_frame`.
- SPEC-CORE-009: MCP tool `list_video_scenes`.
- SPEC-ADDON-030: intelligence `GET /files/{file_id}/frame` gains `size=large`.
- SPEC-ADDON-031: intelligence `GET /files/{file_id}/scenes`.

## Required items

### 1. Normal flow

**`get_video_frame(drive, file_id, t, size?)`** (SPEC-CORE-008)

1. The agent calls the tool with a drive, a file id, a time `t` in seconds and an optional
   `size`, `"large"` (default) or `"small"`. The zod schema requires `t` to be a finite
   number ≥ 0 and `size` to be one of the two values.
2. The MCP server reads `GET /api/files/{file_id}` (core). When its `mime_type` is the
   `.loft` mime (`application/vnd.litloft.loft+json`), the tool returns `isError` with
   `<file_id> is a .loft reference; it has no local video to read frames from` and sends
   no further request. When it reports a `duration` and `t > duration`, the tool returns
   `isError` with `t=<t> is past the end of the video (duration <duration>s)` and requests
   no frame. When `duration` is null, the duration check is skipped.
3. The MCP server sends `GET /api/addons/intelligence/files/{file_id}/frame?t=<t>&size=<size>`
   with `X-Lit-Drive: <drive>` and the configured bearer token, through a new client
   method `requestBytes`. It returns the response body as bytes, unaltered, with its
   Content-Type; it takes an optional caller `AbortSignal`, combined with the existing 30 s
   timeout so either one aborts the request; on a non-2xx status it throws
   `LitloftApiError(status, body)` with the body parsed as JSON when it is JSON and as
   text otherwise, as `requestRaw` does.
4. The endpoint (SPEC-ADDON-030) checks the file belongs to that drive and is a video, then
   returns the cached WebP for `(file_id, t, size)` or extracts it with ffmpeg and caches it.
5. The tool returns exactly two content blocks: a text block `{"file_id", "t", "size"}`,
   then an image block (`type: "image"`, `data` = base64 of the response bytes,
   `mimeType` = the response's Content-Type without parameters, `image/webp`).

**`list_video_scenes(drive, file_id, start_time?, end_time?)`** (SPEC-CORE-009)

1. The agent calls the tool, optionally with `start_time` and/or `end_time` in seconds to
   look closer at one part of a long video. The zod schema requires each to be a finite
   number ≥ 0; `end_time ≤ start_time` is passed through and answered by the API's 422.
   The tool first reads `GET /api/files/{file_id}` (core) and returns the same `.loft`
   error as `get_video_frame` when the file is a `.loft` reference.
2. The MCP server sends `GET /api/addons/intelligence/files/{file_id}/scenes` with
   `start`/`end` for whichever were given, and `X-Lit-Drive`.
3. The endpoint (SPEC-ADDON-031) returns the selected scenes in time order (details below).
4. The MCP server fetches each scene's frame at `size=small` from the frame endpoint, at
   most 4 requests in flight at once, within an overall frame budget of 45 seconds
   measured from the first frame request. When the budget runs out, requests still in
   flight are aborted through `requestBytes`' signal and requests not yet started are not
   sent; both kinds of scene get the reason `time budget exceeded`, never
   `request failed: …`.
5. The tool returns: one text block with the summary (`file_id`, `duration`, `window`,
   `candidate_count`, `scene_count`, and per scene `index` (from 1), `start`, `end`,
   `transcript_excerpt` and `frame`: `"included"` or `"unavailable"`), then for each scene
   in order a text block `Scene <index> at <start>s`, followed either by that scene's image
   block or by a text block `frame unavailable: <reason>`. In the tool output an excerpt
   longer than 300 Unicode code points is cut to its first 299 code points plus `…`; an
   excerpt of 300 code points or fewer is unchanged; a null excerpt stays null. The proxy-added
   `available` key of the endpoint response is ignored.

**Scenes endpoint** (SPEC-ADDON-031): `GET /files/{file_id}/scenes?start=&end=`

- 400 `Not a video file` when the indexed file's `file_type` is not `video` or its
  `mime_type` is the `.loft` mime.
- 422 when a given `start` or `end` is negative or non-finite, or when both are given and
  `end ≤ start`.
- The candidates are what `_load_candidates(file_id)` returns (scene-CLIP rows that have a
  vector). Let `dur` be `IndexedFile.duration` (possibly null). The window, the candidate
  filter and the duration `D` passed to `select_candidates(candidates, duration_seconds=D)`
  follow this table:

  | Given | Effective window | Candidates kept | `D` |
  |---|---|---|---|
  | neither | none (`window: null`) | all | `dur` (null → `None`) |
  | `start` only, `dur` known | `[start, dur)` | `start ≤ ts < dur` | `dur - start`; when `start ≥ dur`, no selection and `scenes: []` |
  | `start` only, `dur` null | `[start, open)` | `start ≤ ts` | `None` |
  | `end` only | `[0, end)` | `ts < end` | `end` |
  | both | `[start, end)` | `start ≤ ts < end` | `end - start` |

  `None` uses the existing unknown-duration budget of 12. `window` in the response is
  `{"start", "end"}` with the effective values (`end` null when open). A window that lies
  wholly at or past the known duration is not an error; it returns 200 with `scenes: []`.
  `candidate_count` is the number of candidates kept.
- The number of scenes is at most `min(24, candidate_count)`. It can be fewer than 6 even
  with many candidates, because `select_candidates` drops near-duplicate frames.
- Each scene's `start` is its candidate timestamp. Its `end` is the next selected scene's
  `start`. For the last scene it is the effective window `end` when the window has one;
  with no window it is `dur` when `dur` is known and greater than the scene's `start`;
  otherwise `null`.
- `transcript_excerpt` is `_select_transcript_excerpt(file_id, start, None)`: transcript
  chunks overlapping `start ± 7.5 s`, joined, at most 1,200 characters; an empty result
  becomes `null`.
- Response: `{"file_id", "duration", "window", "candidate_count",
  "scenes": [{"start", "end", "transcript_excerpt"}]}`; `duration` is
  `IndexedFile.duration`, possibly null.
- The handler is a sync `def` (FastAPI runs it in the thread pool), so no DB read or numpy
  work runs on the event loop.
- The route is declared in `manifest.json` with `pre_check: {type: file_access, param:
  file_id}`, no `drive_optional`, and `"timeout": 30`.

**Frame endpoint `size`** (SPEC-ADDON-030)

- `size` is `small` or `large`; any other value is 422. The default is `small`, which is
  what every existing caller gets by omission.
- `small`: unchanged. 320 px wide, `libwebp -q:v 70`, cached at `frames/{file_id}/{ms}.webp`.
- `large`: the long edge scaled to at most 1280 px, aspect ratio kept, never scaled up,
  `libwebp -q:v 80`, cached at `frames/{file_id}/{ms}.large.webp` in the same per-file
  directory. Dimensions are those ffmpeg's scale filter sees: after its default
  autorotation, in stored pixels, with no sample-aspect-ratio correction (as for small).
- Signatures: `frame_cache_path(file_id, t, size="small")` and
  `extract_frame_to_cache(abs_path, cache_path, t, size="small")`. With the default size
  both produce exactly today's path and ffmpeg argument list, output path last.
  `ensure_frame_cached(file_id, t, abs_path)` keeps its signature, serves only small
  frames, and still calls `extract_frame_to_cache(abs_path, cache_path, t)` with exactly
  three arguments. The endpoint calls `frame_cache_path` and `extract_frame_to_cache`
  directly, as today, passing `size` only when it is `large`.
- No duration check is added to the endpoint; both lookup paths (with and without
  `X-Lit-Drive`) behave as today apart from `size`.

### 2. Failure cases

| Step | What goes wrong | What happens |
|---|---|---|
| Any request | `drive` is not one the token can access (locked, unknown) | The addon proxy returns 403 `Drive not accessible`, as for every intelligence tool; the tool returns `isError` |
| Frame / scenes request | Drive accessible but the file is not in it | 404; tool returns `isError` |
| `get_video_frame` step 2 | File not visible to the token | Core 404; tool returns `isError` |
| Either tool, core read | File is a `.loft` reference | Tool returns `isError` with the `.loft` message; no intelligence request is sent |
| Frame / scenes request | File is not a video (image, document) | 400 `Not a video file`; tool returns `isError` |
| Scenes | `.loft` reached directly (outside the tool) | 400 `Not a video file` |
| Frame / scenes request | File not indexed by intelligence | 404 `File not indexed`; tool returns `isError` |
| `get_video_frame` step 2 | `t` past the known duration | Tool returns `isError` with the duration; no frame request is sent |
| Frame | Duration unknown and `t` past the real end, or `t` within the container/stream rounding at the end | ffmpeg yields no frame → existing 500 `Frame extraction failed`; nothing cached |
| Frame | ffmpeg times out (15 s) | Existing 504; nothing cached |
| Frame | `size` not `small`/`large` (only reachable outside the MCP tool) | 422 |
| Scenes | Invalid window (see above) | 422; tool returns `isError` |
| Scenes | No scene-CLIP candidates yet (indexing pending), or none in the window | 200 with `scenes: []`; the tool returns the summary plus a text block saying there are no scene candidates and that `get_video_frame` with a time from `get_transcript` or `semantic_search` still works |
| Scenes | Endpoint slower than 30 s | Proxy 502 `Addon service unavailable`; tool returns `isError` |
| List tool frames | One frame fails with an HTTP status | That scene is `unavailable` with reason `<status> <detail>` |
| List tool frames | One frame fails without a status (network error, the 30 s client timeout) | That scene is `unavailable` with reason `request failed: <error message>` |
| List tool frames | The 45 s budget runs out | Every scene whose frame has not arrived, in flight or not yet sent, is `unavailable` with reason `time budget exceeded` |
| Any request | Intelligence addon down | Proxy error status; tool returns `isError` |

In every list-tool frame failure the other scenes are still returned and the result is
not `isError`.

### 3. States

No new persistent state. A frame cache entry for `(file_id, ms, size)` is absent or
present; a request moves it from absent to present, and file purge (`purge_frame_cache`)
removes the whole per-file directory, both sizes included. A scene list is computed per
request and not stored.

### 4. Data read and written

- Read (core): `GET /api/files/{file_id}` for `duration`.
- Read (intelligence): `embeddings` (`embedding_type="clip"`, id and `timestamp_start`),
  `vec_clip` vectors, `indexed_files` (drive, file path, file type, duration),
  `transcript_chunks`, through the existing `_load_candidates` and
  `_select_transcript_excerpt`.
- Read: the video file on the drive (ffmpeg).
- Written: the frame cache under `intelligence_data_dir/frames/{file_id}/`, atomically
  (`.tmp` then `os.replace`), as today. The large size adds files named `{ms}.large.webp`.
- Not touched: the core DB (read only through its API), the Visual Index tables
  (`video_visual_runs`, `video_visual_scenes`), any embedding.

### 5. External services

None outside Litloft. ffmpeg is a local subprocess with the existing 15 s timeout. The
scenes route has a 30 s proxy timeout. The MCP client calls the Litloft API with its
existing 30 s per-request timeout; the list tool's frame fetching is additionally bounded
by the 45 s budget, so its worst-case wall time is about 30 s (scenes) + 45 s (frames).

### 6. Authorization

Unchanged model. The bearer token decides the accessible drives; the addon proxy rejects
an inaccessible `X-Lit-Drive` with 403 before routing (intelligence has `scope: "drive"`,
so the header is required on every route that is not `drive_optional`). The proxy's
`file_access` pre_check verifies the caller can read the file. The MCP tools always send
`X-Lit-Drive`, so the frame endpoint applies its strict current-drive match, and the
scenes endpoint checks the drive through `_get_indexed_file_or_404`. The scenes route
carries no `addon_feature`, matching `clip-timestamps`, which exposes the same candidate
timestamps today.

### 7. Effect on existing features

- `ClipFramesSection`, the Visual Index UI and the Visual Index worker call the frame
  endpoint or `ensure_frame_cached` without a size and keep getting the 320 px frame from
  the same cache path with the same ffmpeg arguments.
- `select_candidates`, `_load_candidates` and `_select_transcript_excerpt` are called, not
  changed, so Visual Index selection and its candidate fingerprint stay as they are.
- `purge_frame_cache` already removes the per-file directory, so it covers large frames.
- `addons/intelligence/tests/test_frame_cache.py` pins the small ffmpeg argument list
  (`cmd[-1]` is the output path) and `ensure_frame_cached` calling
  `extract_frame_to_cache` with exactly three arguments; the signatures above keep both.
- The MCP `ToolTextResult` type widens to allow image content blocks; existing tools keep
  returning text only, and `runTool`'s error shape is unchanged.

### 8. Error behavior

A failed request reaches the agent as `isError: true`. A Litloft HTTP failure reads
`Litloft API error (<status>): <detail>` as for every other tool; a failure with no HTTP
status (network error, client timeout) reads as the error's own message, which is what
`runTool` does today. Per-scene frame failures appear inline as
`frame unavailable: <reason>` with the reasons in the table above. The endpoint logs
extraction failures and timeouts as it does today (warning with file id and time); the
400s and 422s are not logged.

### 9. User-visible behavior

- Two new tools in the MCP tool list, both annotated read-only, non-destructive,
  idempotent, closed-world.
- `get_video_frame` defaults to `size: "large"`.
- Scenes are in ascending time order, numbered from 1.
- The server instructions (`SERVER_INSTRUCTIONS` in `mcp-server/src/server.ts`) mention
  the two tools and the intended flow: list scenes for an overview, then fetch a large
  frame at a time of interest from the scene list, the transcript or a `semantic_search`
  time range.
- The web UI shows nothing new.

### 10. Non-functional

- Size: a large frame is a q80 WebP of at most 1280 px on the long edge; a list returns at
  most 24 small frames. Excerpts in the tool output are at most 300 characters each.
- Time: the list tool spends at most 45 s fetching frames; a warm cache returns at once.
- Concurrency: at most 4 frame requests in flight per list call, so one call starts at
  most 4 ffmpeg processes.
- Cost: no LLM call on the Litloft side. On the agent side, roughly 80 image tokens per
  small frame and about 1,200 per large frame.
- Privacy: frames leave Litloft only to the MCP client that already holds a token for
  that drive, the same exposure as the web UI's frame list.
- Disk: large frames add to the frame cache without a cap, as small frames already do.

## Touch points

- `mcp-server/src/tools/read.ts`: new tools `get_video_frame`, `list_video_scenes`.
- `mcp-server/src/tools/types.ts`: result type allows image content; an image-result helper.
- `mcp-server/src/client.ts`: a binary GET that returns bytes and Content-Type.
- `mcp-server/src/server.ts`: `SERVER_INSTRUCTIONS`.
- `mcp-server/src/__tests__/read.test.ts`, `client.test.ts`, `testClient.ts` (the fake
  client learns the binary GET), `toolMetadata.test.ts` (tool names and annotations).
- `mcp-server/README.md`: tool list.
- `addons/intelligence/app/routers/files.py`: `GET /files/{file_id}/frame` (`size`).
- `addons/intelligence/app/frame_cache.py`: size-aware cache path and ffmpeg scale.
- `addons/intelligence/app/routers/video_visual.py` (or a new router module in the addon):
  `GET /files/{file_id}/scenes`.
- `addons/intelligence/app/schemas.py`: scenes response model.
- `addons/intelligence/manifest.json`: route entry for `/files/{file_id}/scenes`.
- `addons/intelligence/tests/`: endpoint and frame-cache tests.
- `docs/addons/intelligence.md`: one sentence that agents can read scene frames through the
  MCP server, under Scene search or Visual index.
- `addons/intelligence` submodule pointer bump in the core repository.
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary; addon
  drive-scope context propagation; no core-to-addon dependency),
  `.claude/rules/backend-conventions.md` (atomic writes), the intelligence event-loop
  discipline (`addons/intelligence/tests/test_event_loop_discipline.py`: no sync DB call
  on the event loop). `.claude/rules/internal-api-policy.md` is not reached (no Internal
  API change).
- No protected path is edited; `backend/app/routers/addon_proxy.py` is not changed.

## Invariants

I1. A frame request without `size`, or with `size=small`, returns the same 320 px wide q70
image from the same cache file `{ms}.webp`, produced by the same ffmpeg arguments, as
before this change.
I2. A `size=large` frame's long edge is at most 1280 px and never larger than the source
video's, its aspect ratio matches the source's within one pixel of rounding, and it is
cached in `{ms}.large.webp`, so a small and a large frame at the same time never return or
overwrite each other.
I3. A frame or scenes request whose `X-Lit-Drive` is accessible to the caller but is not the
file's drive returns 404 and reveals nothing about the file.
I4. With no window, the scenes endpoint returns exactly the timestamps, in ascending order,
that `select_candidates` picks over all of `_load_candidates(file_id)` with the file's
duration; with a window it uses the candidates and `D` of the window table; the same
input always gives the same output.
I5. When a window is given, every scene the endpoint returns lies inside the effective
window; there are never more than `min(24, candidate_count)` scenes; a given `end ≤ start`
or a negative or non-finite bound is 422.
I6. The scenes endpoint and both MCP tools make no LLM call and write nothing except frame
cache files; Visual Index runs, scenes and embeddings are unchanged by them.
I7. When some frames of a scene list fail or run out of time, `list_video_scenes` still
returns every scene's time and excerpt, marks exactly the scenes without an image
`frame: "unavailable"` with a reason, is not an error result, and places each image block
right after the `Scene <index> at <start>s` block of the scene it shows.
I8. `list_video_scenes` never has more than 4 frame requests in flight, sends or keeps no
frame request after 45 s from the first, and never outputs an excerpt longer than 300
Unicode code points; a cut excerpt ends with `…`; a frame aborted by the budget is
reported as `time budget exceeded`.
I9. `get_video_frame` without `size` requests `size=large`, and its result is a text block
followed by one image block whose base64 data decodes to exactly the bytes the endpoint
returned and whose `mimeType` is the response's Content-Type.
I10. `get_video_frame` with `t` greater than a non-null core `duration`, and either tool on
a `.loft` file, returns an error result and sends no intelligence request, so the frame
cache is unchanged.

## Checked, no action

- **Exposing the pre-built Visual Index** (`/visual-index`): out of scope by the user's
  decision. Most videos have none, it is off by default, and the agent reading frames with
  its own model is both stronger and verifiable.
- **Scene-description text search** (`include_video_visual_scene`): depends on the Visual
  Index; left for the intelligence-side spec.
- **A core frame endpoint** that works without intelligence: every video intelligence has
  indexed already has frames through the addon, and the scene list needs the addon's CLIP
  candidates anyway. A core endpoint would duplicate `frame_cache.py`.
- **Doing the selection in the MCP server** from `clip-timestamps`: that endpoint carries no
  vectors, so near-duplicate removal could not run, and the algorithm would exist twice.
- **A duration check in the frame endpoint**: it would also apply to the header-less
  `<img src>` path of the existing UI, where a CLIP candidate stamped just past the probed
  duration would turn from a picture into an error. The check lives in the MCP tool, which
  can read the duration from core.
- **Duration check for `list_video_scenes` frames**: its times come from CLIP candidates,
  which ffmpeg already extracted once; a rare failure is reported per scene.
- **Sample-aspect-ratio correction for `size=large`**: the small path does not apply it,
  and anamorphic sources are rare in a home library.
- **A contact sheet (one tiled image)**: separate images keep each frame's time attached
  and let a failed frame drop alone.
- **Free width parameter**: two sizes keep the cache to two files per time.
- **`require_drive` in the manifest**: the proxy does not read it; `scope: "drive"`
  already requires the header.
- **A drive policy check on the scenes route**: `clip-timestamps` and `frame` have none and
  expose the same data; adding one only here would be inconsistent. Revisit with them.
- **Frame cache size cap or eviction**: none exists for small frames; the personal-tool
  premise accepts the growth.
- **`.loft` on the frame endpoint**: core files `.loft` as video, so a direct frame request
  runs ffmpeg on the JSON pointer and gets the existing 500. The MCP tools stop before
  that, and the UI never asks for a `.loft` frame, so the endpoint is left as it is.
- **ChatGPT through Secure MCP Tunnel**: whether ChatGPT shows MCP image content is
  unverified; the text blocks still carry times and excerpts.
- **`docs/reference/api.md`**: lists core endpoints only; the addon surface is documented in
  `docs/addons/intelligence.md`.
