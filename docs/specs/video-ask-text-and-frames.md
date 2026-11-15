# Ask about a video sends its frames with its text

SPEC-ID: SPEC-ADDON-114

Approval:

## Summary

A question about one video from the file Ask tab now gets both of what the video
offers: the text it already got (transcript and on-screen text passages) and the
frames a text-less video gets under SPEC-ADDON-108 (up to 8, chosen from the Ask
list of SPEC-ADDON-112). Until now a video with a single text chunk was treated as
text only: one frame at the playing position at most, and none otherwise. A video
whose only "speech" is what the transcriber made of music or noise
("うにゃ。にゃ。", "И и / и") lost every frame, and a question about what a talking
video shows could not be answered. The change applies only when the profile
serving the question can read images; with any other profile the text path is
unchanged. The Visual Index text, the normal (cross-file) Ask and audio files are
not changed. It is for the viewer asking about one video.

## Terms

- **Text video**: an active video of the request drive, a native video or a
  readable YouTube `.loft`, with at least one `transcript_chunks` or
  `fts_text_content` row.
- **Frame set**: the frames SPEC-ADDON-108 Terms steps 1 to 4 choose, as revised by
  SPEC-ADDON-112 (the position frame when the position is greater than 0, plus the
  scene frames of the Ask list, removal within 1 s of the position, index thinning,
  evenly spaced filling; budget 8, or 7 with a position frame), prepared as that
  spec prepares them (at most 4 at once, 15 s each, 45 s in all from the slot).
- **Passages**: the chunks SPEC-ADDON-053 selects for the question within
  `rag.file_question_max_chars` minus the history, ranked by the question.

## Required items

### 1. Normal flow

1. The viewer asks a question about a text video in the file Ask tab, with or
   without `position_seconds`.
2. The route reads the material and resolves the `rag` profile as today
   (`resolve(drive, "rag")`, with the `llm_cloud` policy).
3. When the profile can see (`profile_can_see`), the route takes one Ask slot, and
   under it selects the passages exactly as without frames and prepares the frame
   set. A `position_seconds` of exactly 0 counts as no position, as for a
   text-less video.
4. Until the first `answer_chunk`, the stream writes the `: keepalive` SSE comment
   so that no 10 s pass without a byte.
5. The prompt lists the passages numbered `[1]` to `[P]`, then the kept frames
   numbered `[P+1]` to `[P+F]` in time order, each with its time in the video
   (`m:ss` or `h:mm:ss`), and states the position when there is one greater than 0.
   The images are sent in the order of their numbers, to the profile's
   `vision_model`.
6. The answer streams. The `citations` event maps `[n]` with `n ≤ P` to that
   passage's position, and `P < n ≤ P+F` to `{"seconds": <frame time>}`; any other
   number is dropped. `meta.image` is `"attached"`.
7. When the profile cannot see, steps 3 to 6 are today's text path with no image:
   passages only, `meta.image` `"none"`.

### 2. Failure cases

- **Some frames fail or run out of time.** They are left out, never replaced by a
  frame of another time; the answer uses the kept frames. No note is shown, as for
  a text-less video.
- **No frame can be prepared.** The question is answered from the passages alone,
  and `meta.image` is `"unavailable"`, so the tab shows its existing line (the
  image could not be used and the answer is from the text only).
- **The provider refuses the request with images** (`ImageRejected`, a 400 or 404 on
  the multi-image call). The route closes that stream and asks again with the same
  passages and no image; `meta.image` is `"unavailable"`. The vision-unsupported
  verdict is not written (SPEC-ADDON-108 I6).
- **The selection inputs cannot be read.** The scene frames come from evenly
  spaced filling, as SPEC-ADDON-108 does.
- **Generation fails, or the answer is empty.** The generic failure line, as today.
- **The tab disconnects.** No further frame preparation or model request starts;
  the slot is released (SPEC-ADDON-108 I7).

### 3. States

No stored state. One question moves through: preparing (frames and passages under
the slot), answering with images, answering from text only (after no frame or a
refusal), done or failed. A refusal moves to text only once; there is no other
retry.

### 4. Data read and written

- Read: `indexed_files`, `transcript_chunks`, `fts_text_content`,
  `video_frame_texts`, `document_sections`, `embeddings` / `vec_text` (passages, as
  today); the selection inputs of SPEC-ADDON-112 (`vec_clip`, `vec_clip_change`,
  `video_frame_scans`, whisper embeddings).
- Written: only the `large` frame cache entries `{ms}.large.webp` that
  `get_video_frame` also writes. Nothing else: no question, answer or frame byte is
  stored or logged.

### 5. External services

- The LLM provider of the resolved profile: one streamed request with images, and
  at most one text-only request after a refusal. Slow: the answer is slow; there is
  no new timeout beyond the keep-alive.
- ffmpeg for native frames; `yt-dlp` and ffmpeg for a YouTube `.loft`, under the
  limits of SPEC-ADDON-077 (15 s per frame, at most 4 reads). A failure drops that
  frame.

### 6. Authorization

Unchanged: the file must be an active file of the `X-Lit-Drive` drive the viewer
can access, with `rag` on for that drive (`routers/rag.py`); frames go only to the
resolved profile, and an off-host profile only when `llm_cloud` allows it.

### 7. Effect on existing features

- A text video with a playing position used to get one position image under
  SPEC-ADDON-071; with a seeing profile it now gets the frame set, of which the
  position frame is the first. With a position of exactly 0 it now gets no
  position frame and 8 scene frames, where it used to get the frame at 0.
- A YouTube `.loft` with a text chunk is treated like a native text video: the
  frame set is read through `/frame`, where it used to read one frame at the
  position (SPEC-ADDON-077 I6).
- Text-less videos (SPEC-ADDON-108), pictures (SPEC-ADDON-071), audio, documents,
  the availability route, the normal Ask, the MCP `ask` tool and
  `list_video_scenes` are unchanged.
- The frame set of a text video uses the same selection as a text-less video, so
  every later change to the Ask list changes both.

### 8. Error behavior

- The viewer sees the existing line under the answer when no frame could be used
  (`meta.image: "unavailable"`); the frames errors of a text-less video
  (`frames_unusable`, `frames_rejected`) are never sent for a text video, because
  its passages still answer.
- Logged, at warning, with the file id and no content: `frames_unusable` when no
  frame was prepared, `frames_rejected` on a refusal, the existing
  `scene_candidates_failed`, and the existing generation failure line.

### 9. User-visible behavior

- An answer about a text video can cite frame times as well as transcript and
  on-screen text times; each is a time pill that seeks the player.
- The answer can start later than before: frame preparation takes up to 45 s, and
  the model reads up to 8 images. While waiting, the tab shows its existing
  waiting state; the connection is kept alive.
- No new control, setting or text.
- `docs/user-guide/search.md` (the Ask paragraph) and `docs/addons/intelligence.md`
  (the privacy line of Ask and the frames description) say that a question about a
  video sends a handful of its frames along with its text when the model can read
  images.

### 10. Non-functional

- At most 8 frames of at most 1280 px per question, the same as a text-less video.
- The passages budget is unchanged; the frames are not counted against it.
- One Ask slot per question; at most 4 frame preparations at once; nothing started
  after 45 s from the slot.
- Privacy: frames leave the host only to an off-host profile the `llm_cloud` policy
  allows, as for pictures and text-less videos.
- Cost: an off-host profile is billed for up to 8 images on every question about a
  video.

## Touch points

- `addons/intelligence/app/routers/rag.py`: the file-question route and
  `_text_question_stream` (frame set for a text video with a seeing profile,
  keep-alive, text-only retry, citations across passages and frames).
- `addons/intelligence/app/rag/file_question.py`: `choose_frame_times`,
  `prepare_frames`, `citations`, `load_image` (no longer used for a video's
  position image).
- `addons/intelligence/app/rag/prompt.py`,
  `addons/intelligence/app/prompts/rag/file_question_system.jinja2`,
  `addons/intelligence/app/prompts/rag/file_question_user.jinja2`: passages and
  frames in one prompt, one numbering.
- `addons/intelligence/frontend/AskTab.tsx`: unchanged behavior; the
  `imageUnavailable` line is reached by the new path.
- Tests under `addons/intelligence/tests/` and `addons/intelligence/frontend/`.
- `docs/user-guide/search.md`, `docs/addons/intelligence.md`.
- `docs/specs/INDEX.md`.
- No protected path, no migration, no Internal API, no core code.

## Invariants

I1. For a text video and a profile that can see, the images sent are exactly the kept frames of the frame set, each the frame at the time the prompt lists for it, sent in the order of their numbers, only to the `vision_model` of the profile resolved by `resolve(drive, "rag")`; for a profile that cannot see, no image is sent and the request is the text path of SPEC-ADDON-053 with `meta.image` `"none"`.
I2. The passages sent for a text video are the same, by budget and ranking, whether frames are attached, none could be prepared, or the request is retried after a refusal.
I3. The prompt numbers the passages `[1]` to `[P]` and then the kept frames `[P+1]` to `[P+F]` in time order with their times; every `citations` entry names a number that was sent, with the passage's position for `n ≤ P` and the frame's time as `position.seconds` for `P < n ≤ P+F`, and no other number appears.
I4. A text video always receives a generated answer from its passages when frames cannot be used: no frame prepared, or a refusal of the request with images, each lead to one text-only request with `meta.image` `"unavailable"`, never to `frames_unusable`, `frames_rejected` or `image_unusable`; a refusal never writes the vision-unsupported verdict.
I5. With a position greater than 0 the frame set has the position frame plus at most 7 scene frames, none within 1 s of the position, and the prompt states the position; with no position or a position of exactly 0 it has at most 8 scene frames and the prompt states no position; a frame that failed is never replaced by a frame of another time.
I6. A text-video question holds exactly one Ask slot from after the material is read until its stream ends, fails or is cancelled; it has at most 4 frame preparations running at once, starts none after 45 s from the slot or after a disconnect, and until the first `answer_chunk` no 10 s pass without a byte written to the stream.
I7. Questions, answers, history and frame bytes are neither stored nor logged; the only write is the `large` frame cache entry `get_video_frame` also writes.
I8. Text-less videos, pictures, audio, documents, the availability route and the normal Ask answer every request as they did before this change.

## Revises

SPEC-ADDON-071 I1. A question's passages, picture and frames come only from the requested file, an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on, and the only other text sent is the history the request carried; a picture gets at most one image of at most 1024 px on its long edge, and a video, with or without a text chunk, gets at most 8 frames of at most 1280 px when its profile can see.
SPEC-ADDON-071 I3. `meta.image` is `"attached"` when an image or at least one frame was sent, `"unavailable"` only when the route tried to send one and could not or the provider refused it, and `"none"` otherwise, including when the profile cannot see; the notice line is shown for `"unavailable"` and never for the other two.
SPEC-ADDON-071 I5. The prompt mentions an image, and tells the model to take exact characters from the passages when they and the image or frames differ, only when an image or frames are attached; it states a position for a video only when `position_seconds` greater than 0 was sent, and for an audio file when `position_seconds` was sent.
SPEC-ADDON-071 I7. `position_seconds` that is negative, non-finite or above 1,000,000 is rejected with 422 for any kind of file before any model is called; a position past the end of the video, one at which ffmpeg returns no frame, or a frame extraction that times out leaves the position frame out, and no other frame is sent in its place.
SPEC-ADDON-077 I6. Ask on a YouTube `.loft` that has a text chunk, with a profile that can see, sends the frame set of SPEC-ADDON-114 read through the `large` frame route, under every invariant of SPEC-ADDON-071 (profile, `llm_cloud`, one slot, nothing stored or logged but the `large` cache entries); any frame failure leaves that frame out, and when none is sent the answer is from the text with `"unavailable"`; a YouTube `.loft` with no text chunk is answered from frames by SPEC-ADDON-108; Ask on a `.loft` of another provider is unchanged.
SPEC-ADDON-108 I1. A video with at least one `transcript_chunks` or `fts_text_content` row gets the availability and passages it had before SPEC-ADDON-108, and its frames by SPEC-ADDON-114; availability answers `true` for a text-less video only when some profile can see, and `false` for audio with no text chunk and for a `.loft` that is unreadable or whose source is not YouTube.

## Checked, no action

- **Sending the Visual Index text.** Not sent to either Ask. It is an LLM's output,
  and LLM output is not a source until a person promotes it; the frames it was
  written from are sent instead (human decision, 2026-11-15, and SPEC-ADDON-108).
- **Frames in the normal (cross-file) Ask.** Unchanged, text only: frames for every
  retrieved video multiply the images and the wait, and the file Ask is where a
  question about what a video shows belongs (human decision, 2026-11-15).
- **Sending frames only when the transcript is sparse.** Rejected by the human: a
  threshold in characters per minute depends on the language, and a talking video
  still needs frames for a question about what it shows.
- **Fewer frames for a text video (4), or a toggle in the tab.** Rejected by the
  human in favour of always 8.
- **Shrinking the passages budget to make room for the images.** Not done: the
  budget is a character count and the image cost depends on the provider; I2 keeps
  the passages identical with and without frames so that the text-only retry
  answers from the same material. If a local model's context turns out to be too
  small, `rag.file_question_max_chars` is the operator's setting.
- **Audio.** No frames exist.
- **A `.loft` of another provider.** No frame source.
- **A frontend change.** None needed: the tab already shows time pills for
  `position.seconds`, reads `meta.image`, and shows the `imageUnavailable` line.
- **The keep-alive on the text path for a profile that cannot see.** Not added:
  that path prepares no frame and starts the model request at once, as today.
- **Retrying with fewer frames after a refusal.** Not done, as in SPEC-ADDON-108;
  the text-only retry already answers.
