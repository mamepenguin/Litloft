# Ask about this file: a video with no text, answered from its frames

SPEC-ID: SPEC-ADDON-108
SPEC-ID: SPEC-ADDON-109

Approval:

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

The single-file question (`POST /files/{id}/ask`, SPEC-ADDON-053, -071 to -074, -081 to
-084) needs at least one text chunk for a video: a transcript chunk or a frame-OCR text.
A video with neither (a silent clip, a screen recording with no readable text, a video
whose speech produced no transcript) has no **Ask** tab. The earlier spec deferred this
(`file-ask-vision.md`, Checked, no action: "Video or audio with no transcript stays
unaskable ... Raise it as its own change"). This change makes such a video askable from
its frames.

- **108** A video with no text chunk is askable when some profile can see. A question
  about it carries up to 8 frames of at most 1280 px on the long edge: representative
  scenes chosen without a model, plus the frame at the playing position when the player
  sends one.
- **109** Each frame is numbered and labelled with its time, the model cites frames as
  `[n]`, and the tab turns each cited `[n]` into the existing time pill, which seeks the
  player to that frame's time.

For the person who keeps silent clips, screen recordings and home videos next to their
other files and asks "what happens in this video" or "what is on the table at this point".
A video with any text chunk keeps the behavior of SPEC-ADDON-071/072 exactly: text
passages, plus one frame only while playing. Audio is unchanged.

Terms, as in `file-ask-vision.md`:

- **The profile** is the one `resolve(drive, "rag")` returns for the request, honouring the
  viewer's chosen profile.
- **The profile can see** is `profile_can_see(resolved)`; **some profile can see** is
  `any_profile_can_see(settings)`. Both are unchanged.
- **A text-less video** is an active `indexed_files` row of the request drive with
  `file_type = "video"`, no `transcript_chunks` row and no `fts_text_content` row, that is
  not a `.loft` file (`LOFT_MIME`) unless that `.loft` names a YouTube source
  (`read_loft(...).provider == YOUTUBE_PROVIDER`).
- **The scene frames** of a text-less video are the timestamps returned by
  `select_candidates(candidates, duration_seconds=duration)` over the file's scene-CLIP
  candidates (`_load_candidates`), exactly as `GET /files/{id}/scenes` selects them with no
  window. When the file has no candidate and its duration is known and positive, they are
  `k` evenly spaced times `(i + 0.5) * duration / k` for `i = 0 .. k-1`. With no candidate
  and no usable duration there are none.
- **The frame budget** `k` is 8, or 7 when a position frame is requested. When the scene
  frames number more than `k`, the kept ones are the entries at index
  `round(i * (n - 1) / (k - 1))` for `i = 0 .. k-1` of the time-ordered list of `n`.

## Required items

### 1. Normal flow

1. The viewer opens a text-less video. The tab asks `GET /files/{id}/ask` for
   availability as today. It answers `available: true` when some profile can see.
2. The viewer types a question and submits. The tab sends the body it sends today:
   `{question, profile?, position_seconds?, history?}`. Nothing in the tab's request
   changes.
3. The route checks, in this order and without taking a slot: `features.rag` (404), the
   profile and `llm_cloud` (the existing profile-unavailable response), the file (404 when
   it is neither askable by text nor a text-less video), and last, for a text-less video
   whose profile cannot see, 409 `video_needs_vision`.
4. The route takes the semaphore slot. Under that slot it prepares the frames:
   - the position frame, when `position_seconds` was sent: the `large` frame at that
     time, by the rules of SPEC-ADDON-071 step 4 (millisecond key, the same cache, the
     same duration check);
   - the scene frames, thinned to the frame budget; a scene frame less than 1 s from the
     position is left out;
   - each as the `large` cache entry (long edge ≤ 1280, WebP), filled on a miss by the
     same native or YouTube path the position frame uses.
   Frames are prepared at most 4 at a time, each bounded by the existing 15 s frame
   timeout, and all of them by 45 s in total. A frame that fails or is not ready at 45 s
   is dropped; the rest are kept.
5. The kept frames are sorted by time and numbered `[1]` to `[m]`. The route streams the
   answer from the profile's `vision_model`, with the frames as `m` images in one request,
   in that order, and the user prompt listing each number with its time (`h:mm:ss`, or
   `m:ss` under an hour). No passages are sent. The history block of SPEC-ADDON-081 is sent
   as today; the frames are prepared again for every turn.
6. The stream events are as today: `answer_chunk`, `citations`, `meta`, `done`.
   `citations` lists each `[n]` the answer names, `1 ≤ n ≤ m`, once, in first-named order,
   with `position: {"seconds": <that frame's time>}`. `meta.image` is `"attached"`.
7. The tab draws the answer as today. A cited `[n]` becomes the existing time pill, and
   clicking it seeks the open player to that time (053 I8).

The prompt for frames says that the frames are the only moments of the video the model
sees, that each is labelled with its time, that it cites a frame as `[n]` after the
sentence it supports, that it never names a number it was not given, and that it says so
plainly when the frames do not show the answer. When a position was sent it states the
position as today (071 I5); when the position frame was not kept, the position is still
stated and no frame carries that time.

### 2. Failure cases

| Step | Failure | What the system does |
|---|---|---|
| 1 | No profile can see | `available: false`, as today; no tab |
| 1 | A `.loft` whose source is not YouTube, or that cannot be read | Not a text-less video; `available: false` |
| 3 | Text-less video and the request's profile cannot see | 409 `video_needs_vision`; no slot, no frame work, no model call |
| 4 | Some frames fail (extraction error, ffmpeg returns nothing, 15 s per-frame timeout, a position past the duration the index holds) or are not ready at 45 s | Those frames are dropped; the question goes on with the rest. A failed position frame is never replaced by another frame at its time |
| 4 | Every frame fails, or there are none (no candidate, no usable duration, no position) | The stream ends with `meta` (`image: "unavailable"`) and `done` carrying `error: "frames_unusable"`; no model call |
| 5 | The provider refuses the request with the status the image call classifies as a refusal (400/404) before the first token | `done` with `error: "frames_unusable"`; no retry, no text-only answer, and the vision-unsupported verdict is **not** written |
| 5 | A 5xx, a timeout or any other failure before the first token | The generic generation failure of 053 |
| 5 | Failure after the first token | As today: the text received is kept, `done` carries `error` |
| 5 | An empty answer | The generic generation failure, as today |
| 4–5 | The client disconnects | Frame work and the request are cancelled and the slot is released (053 I11) |

The verdict is not written because a refusal of 8 large frames can come from a context or
image-count limit of a model that reads one image well, and the verdict would also switch
off picture questions and picture descriptions for that model until restart.

### 3. States

The route is stateless. The tab's thread and turn states are those of SPEC-ADDON-053 and
-081; none is added.

- `failed` gains two failure kinds: `video_needs_vision` (409) and `frames_unusable`
  (`done` with that error), each with its own line (section 8).
- A text-less video becomes a text video when a transcript or frame-OCR text is indexed.
  The tab already re-reads availability on `intelligence.transcription.completed`; the
  answer stays `true`. The next question in the same thread is answered by the text path
  of SPEC-ADDON-071 (passages, plus one frame only while playing); earlier turns keep their
  answers and pills. The reverse, a text video losing its text, follows the same rule the
  other way.

### 4. Data read and written

| Store | Access |
|---|---|
| `search.db` `indexed_files` (type, mime, path, duration), `transcript_chunks`, `fts_text_content` | read |
| `search.db` `embeddings` (`embedding_type = 'clip'`) and `vec_clip` | read, through `_load_candidates` |
| The video file, through ffmpeg; a YouTube `.loft` through the existing yt-dlp frame path | read |
| `intelligence_data_dir/frames/{file_id}/{ms}.large.webp` | read, and written on a miss with the cache's atomic write, the entries `get_video_frame` already fills, purged with the file |
| The vision-unsupported verdict | read; never written by this path |
| Core DB, `search.db` rows, the question, the answer, the frame bytes | not written |

### 5. External services

The routed LLM, with the gates of 053 and 071: the profile's `vision_model` on its own
`base_url` and key, only when `llm_cloud` allows the profile for the drive. A new
streaming call carries a list of images on every client class `resolve` can return: the
OpenAI-compatible client sends one `image_url` data-URL block per frame after the text
block, and the Ollama client sends them in the `images` list of its native chat protocol,
in frame order. A client class without that call is treated as a profile that cannot see
for a text-less video.

YouTube: each frame that misses the cache is a yt-dlp signed-URL lookup and an ffmpeg seek,
bounded per frame and in total as in step 4. Slow or down: the frame is dropped. Wrong (a
frame of another time): not detectable here; the same path already feeds `get_video_frame`.

### 6. Authorization

Unchanged. `require_drive` checks the `X-Lit-Drive` header; the file must be an active
`indexed_files` row of that drive. Frames are read by `file_id` after that check; no path
or time list comes from the request other than the single `position_seconds`.

### 7. Effect on existing features

- A video with any text chunk: unchanged in availability, material, prompt, image and
  retry (SPEC-ADDON-071/072). The new path is taken only for a text-less video.
- Pictures, audio, documents: unchanged. A video's 409 is a new code; `picture_needs_vision`
  keeps its meaning and text.
- The single-image streaming call `generate_stream_with_image` and its verdict write are
  unchanged; the multi-image call is a separate method.
- `GET /files/{id}/scenes`, `get_video_frame` and the MCP scene list share the frame cache
  and the scene selection, which are read, not changed. A frame made for a question is
  reused by them and the reverse.
- `tests/test_llm_caller_inventory.py` registers the new streaming call as reached only
  through the resolved client.
- The shared Ask semaphore counts a frames question as one slot.
- Availability widens for text-less videos, so the **Ask** tab appears on them when some
  profile can see, including before their transcription finishes.
- `/ask`, `/find` and the MCP `ask` tool are unchanged (053 I12).

### 8. Error behavior

- 409 `video_needs_vision` shows: "This video has no text, and the selected model cannot
  read images." Japanese: 「この動画には文字情報がなく、選んだモデルは画像を読めません。」
- `frames_unusable` shows: "This video has no text and its frames could not be read."
  Japanese: 「この動画には文字情報がなく、フレームも読めませんでした。」
- Other request-level failures keep their codes (404, 422, 503, profile unavailable).
- Logged: per question, the number of frames requested and dropped with the file id
  (`frames_dropped`), and `frames_unusable` or `frames_rejected` with the file id. Never the
  question, the answer or any frame byte.

### 9. User-visible behavior

- The **Ask** tab is listed on a text-less video when some profile can see; nothing is
  listed for it otherwise, as today.
- Answers about a text-less video cite moments as time pills, drawn and behaving like the
  transcript pills; clicking one seeks the player.
- The time to the first token grows by the frame preparation: on a cache miss up to 8
  ffmpeg seeks, at most 45 s.
- No new control, preview or setting. The position is not shown.

### 10. Non-functional

- Size: at most 8 images per question, each ≤ 1280 px on the long edge. About 1,200 input
  tokens per frame for the configured vision models, about 10,000 for a question.
- Time: 4 frame preparations at a time, 15 s each, 45 s in total; under the slot, so the
  semaphore bounds parallel work and a full semaphore answers 503 before any ffmpeg work.
- Privacy and cost: frames go only where `llm_cloud` allows the profile for the drive, the
  same decision as for text and the picture of 071. A follow-up turn sends the frames again.
- Concurrency: one slot for the whole question.

## Touch points

- `addons/intelligence/app/rag/file_question.py`: `available` (text-less video), 
  `load_material` (a text-less video is material with no chunk), a frames loader that
  reuses `frame_cache.py`, `youtube_source.py` and the scene selection
  (`workers/video_visual.py` `_load_candidates`, `workers/video_visual_selection.py`
  `select_candidates`), and frame citations.
- `addons/intelligence/app/routers/rag.py`: `file_ask_endpoint` (409
  `video_needs_vision`), `_file_question_stream` (the frames path, `frames_unusable`,
  `meta.image`, citations from frames).
- `addons/intelligence/app/llm.py`: a multi-image streaming call on every client class,
  which does not write the verdict.
- `addons/intelligence/app/rag/prompt.py`, `app/prompts/rag/file_question_system.jinja2`,
  `file_question_user.jinja2`: the frames wording.
- `addons/intelligence/tests/test_llm_caller_inventory.py`.
- `addons/intelligence/frontend/AskTab.tsx`, `askStream.ts`, the ask store, and the
  addon's `messages/{ja,en}.json`: the two failure kinds and lines.
- Rules passed through: `.claude/rules/design-decisions.md` (Access control, Drives, LLM
  features, Addons), `.claude/rules/frontend-conventions.md`.
- Docs: `docs/user-guide/` (the Ask-about-this-file page), `docs/reference/api.md` (the 409
  and the `done` error), `docs/addons/intelligence.md`.
- No protected path from `docs/process/risk-and-human-review.md`. No core code change.
- A submodule pointer bump in the core (CLAUDE.md, Git).

## Invariants

I1. A video with at least one `transcript_chunks` or `fts_text_content` row gets the same availability, passages, prompt, image and retry as before this change, for every request.
I2. Frames come only from the requested file, an active video of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on; at most 8 are sent, each at most 1280 px on its long edge, and each is the frame at the time it is labelled and cited with.
I3. The frames sent are the position frame when `position_seconds` was sent and its frame was produced, plus the scene frames chosen by `select_candidates` (or the evenly spaced times when there is no candidate) thinned by the index rule; a frame that failed is left out and never replaced by a frame of another time.
I4. Frames are sent only through the profile resolved by `resolve(drive, "rag")`, only to its `vision_model`, and only when `llm_cloud` allows that profile for the drive; a policy that cannot be read sends nothing.
I5. A text-less video never receives a generated answer without at least one frame sent with it: it ends in 409 `video_needs_vision` before a slot is taken, in `done` with `error: "frames_unusable"`, or in the generic generation failure.
I6. Every `citations` entry for a text-less video names a frame number that was sent, `1 ≤ n ≤ m`, with that frame's time as `position.seconds`; no other number appears.
I7. A refusal of the multi-frame request never writes the vision-unsupported verdict, so `profile_can_see` and `any_profile_can_see` answer after it as they did before it.
I8. A frames question holds exactly one semaphore slot from after the material is read until its stream ends, fails or is cancelled, frame preparation runs under it, and a disconnect cancels the frame work and releases the slot.
I9. The question, the answer and every frame byte are neither stored nor logged by the route or the tab, apart from the `large` frame cache entries that `get_video_frame` also writes.
I10. Availability answers `true` for a text-less video only when some profile can see, and `false` for audio with no text chunk and for a `.loft` whose source is not YouTube.

## Revises

SPEC-ADDON-053 I1. The LLM receives passages, and for a picture or a playing video one image, or for a video with no text chunk up to 8 frames, of the requested file only, and only when the file is an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on.
SPEC-ADDON-053 I3. Every entry of the `citations` event names a chunk number that was sent, with that chunk's position, or for a video with no text chunk a frame number that was sent, with that frame's time; a number that was not sent never appears.
SPEC-ADDON-053 I6. The availability route answers `available: true` only for an active file of the request drive with at least one text chunk, for an active picture of the request drive when some profile can see, or for an active video of the request drive with no text chunk, not a `.loft` unless its source is YouTube, when some profile can see; for every other kind of file it is unchanged.
SPEC-ADDON-071 I1. A question's passages, picture and frames come only from the requested file, an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on; a file with a text chunk gets at most one image, a picture of at most 1024 px on its long edge or the frame at the request's `position_seconds` of at most 1280 px, and a video with no text chunk gets at most 8 frames of at most 1280 px.
SPEC-ADDON-071 I6. A picture or a video with no text chunk whose image or frames were not sent never receives a generated answer: it ends in a 409 (`picture_needs_vision` or `video_needs_vision`) before a slot is taken, in `done` with `error: "image_unusable"` or `"frames_unusable"`, or in the generic generation failure.
SPEC-ADDON-071 I7. `position_seconds` that is negative, non-finite or above 1,000,000 is rejected with 422 for any kind of file before any model is called; a position past the end of the video, one at which ffmpeg returns no frame, or a frame extraction that times out yields `"unavailable"` for a video with a text chunk and leaves the position frame out for a video with none, and in neither case is another frame sent in its place.

## Checked, no action

- **Audio with no transcript stays unaskable.** There is nothing to show the model.
- **Visual Index scene descriptions (`video_visual_scenes`) as passages.** They are LLM
  output, which is not a source until a viewer promotes it (LLM output trust policy), and
  the MCP frame decision chose raw frames over pre-generated descriptions for the same
  reason. Raw frames also cover the many videos that have no Visual Index.
- **Scene frames for a video that has text.** The text path stays as approved in 071; a
  question about what a talk video shows overall is a later change if asked for.
- **More than 8 frames, or a smaller size.** Decided by the human: 8 frames at 1280 px, so
  on-screen text stays readable and a local 27B model stays usable.
- **Retrying with fewer frames, or as one frame, after a refusal.** A retry doubles the
  wait for a request that is likely to be refused again; the failure line names the
  cause. Revisit if refusals are seen in use.
- **A contact sheet instead of separate images.** Rejected for the Visual Index and the
  MCP scene list for readability and provider compatibility; the same applies here.
- **Scene CLIP candidates not yet indexed.** Covered by the evenly spaced fallback when the
  duration is known; otherwise the position frame alone, or `frames_unusable`.
- **The tab appearing before transcription finishes.** Accepted: the answer is from
  frames until the transcript lands, and the next question then uses the text path (States).
  Hiding the tab until transcription would leave silent videos, which never get a
  transcript, without it.
- **Availability that follows the chosen profile.** As in 071: availability reads "some
  profile can see"; a viewer whose chosen profile cannot see gets the 409 line, which names
  the cause.
- **Non-YouTube `.loft` providers.** No frame can be taken; they stay unaskable.
- **053 I2, I4, I5, I7–I12, 071 I3, I5, I8–I10 and 081–084 stand as written.** I2's budget
  applies to chunks, and there are none; `meta.image` is `"attached"` whenever a frame was
  sent and `"unavailable"` only when every attempt failed (071 I3); the prompt names frames
  only when they are attached and the position only when it was sent (071 I5); the history
  block and its budget are unchanged (081 I2).
