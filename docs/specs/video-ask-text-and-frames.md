# Ask about a video sends its frames with its text

SPEC-ID: SPEC-ADDON-114

Approval: sha256:523402ef6d2c2453383a05b090de5aef9a2da01a698b972ce8f89985c66d7730 Yuichi Senga 2026-11-15

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
not changed. Every frame sent with a question, for a video with text and for a
text-less one alike, is now introduced by its own number and time right before
the image, because a small local model (gemma4:e4b) pairs numbers listed apart
from the images with the wrong pictures. It is for the viewer asking about one
video.

## Terms

- **Text video**: an active video of the request drive, a native video or a
  readable YouTube `.loft`, with at least one `transcript_chunks` or
  `fts_text_content` row whose text is not empty. A video whose rows all have
  empty text stays a 404, as today.
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
3. The passages are selected before the slot is taken, exactly as today
   (`load_material`). When the profile can see (`profile_can_see`), the route takes
   one Ask slot and under it prepares the frame set. A `position_seconds` of
   exactly 0 counts as no position, as for a text-less video. No later than 45 s
   after the slot was taken the route sends the model request or ends the stream.
4. Until the first `answer_chunk`, including during a text-only retry, the stream
   writes the `: keepalive` SSE comment so that no 10 s pass without a byte.
5. The prompt text lists the passages numbered `[1]` to `[P]`, states the
   position when there is one greater than 0, and says that the frames follow,
   each introduced by its number and time. Then come the kept frames, numbered
   `[P+1]` to `[P+F]` in time order, each as its label `[n] <time>` (`m:ss` or
   `h:mm:ss`) immediately followed by its image, to the profile's `vision_model`.
   For an OpenAI-compatible profile the user message's content is the prompt text,
   then for each frame a text part with its label and an `image_url` part with its
   image. For an ollama profile the prompt text is one user message and each frame
   is one more user message whose content is its label and whose `images` holds
   that frame alone. A text-less video (SPEC-ADDON-108) gets the same layout with
   `P = 0`. The prompt text has no list or line pairing a frame number with a
   time; the position sentence is not such a line. The system prompt calls the
   frames "the numbered frames that follow the question" (not "attached to this
   message"), so its rules read the same in both layouts. The system prompt says that the answer comes from the numbered
   passages and the numbered frames attached; that both are cited inline as `[n]`
   and only numbers that were given may be cited; that where a passage and a frame
   differ, exact characters are taken from the passage; that a frame's characters
   are taken from the frame when no passage has them; and that when neither the
   passages nor the frames contain the answer, the model says so instead of
   guessing. With history, the earlier turns are context and only the numbered
   passages and the numbered frames that follow may be cited.
6. The answer streams. The `citations` event maps `[n]` with `n ≤ P` to that
   passage's position, and `P < n ≤ P+F` to `{"seconds": <frame time>}`; any other
   number is dropped. The `meta` event carries `partial` as the passages give it
   (`material.partial`) and `image: "attached"`.
7. When the profile cannot see, the request is today's text path, unchanged in
   every respect (no image, no keep-alive, the position stated as today, `meta` as
   today). A `.loft` that is not YouTube or is unreadable is not a text video and
   keeps today's text path too, including its position image attempt
   (`load_image`) and its `"unavailable"`.

### 2. Failure cases

- **Some frames fail or run out of time.** They are left out, never replaced by a
  frame of another time; the answer uses the kept frames. No note is shown, as for
  a text-less video.
- **No frame time is chosen at all** (no position, no Ask-list scene and no known
  duration). Nothing was tried: the question is answered from the passages alone
  with `meta.image` `"none"`, no notice and no log line.
- **No frame can be prepared** (times were chosen and every preparation failed or
  ran out of time). The question is answered from the passages alone,
  and `meta.image` is `"unavailable"`, so the tab shows its existing line (the
  image could not be used and the answer is from the text only).
- **The request with images raises `ImageRejected`** for any reason (a 400 or 404
  from the provider, or the client refusing before any HTTP call). The route closes that stream and asks again with the same
  passages and no image; `meta.image` is `"unavailable"`. The vision-unsupported
  verdict is not written (SPEC-ADDON-108 I6).
- **The selection inputs cannot be read.** The scene frames come from evenly
  spaced filling, as SPEC-ADDON-108 does.
- **Generation fails, or the answer is empty.** The generic failure line, as today.
  `meta.image` is `"attached"` when it failed while answering with frames, and
  `"unavailable"` when it failed during the text-only request.
- **The tab disconnects.** No further frame preparation or model request starts;
  the slot is released (SPEC-ADDON-108 I7).

### 3. States

No stored state. The passages are read before the slot. One question then moves
through: preparing (frames under the slot), answering with images, answering from text only (after no frame or a
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
- Text-less videos (SPEC-ADDON-108) keep their availability, frame selection,
  `meta` and error values and citations; only their request layout changes, to
  the per-frame labels of I11. Pictures (SPEC-ADDON-071), audio, documents,
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
- `docs/user-guide/search.md` (the Ask paragraph), `docs/addons/intelligence.md`
  (the privacy line of Ask) and `docs/reference/api.md` (the `POST .../ask` row:
  for a video with indexed text and a model that can read images, up to 8 frames
  are sent with the passages, `position_seconds` greater than 0 adds the frame at
  that position, frame numbers follow the passage numbers in `citations`, and
  `: keepalive` comments are written) say that a question about a video sends a
  handful of its frames along with its text when the model can read images.

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
  `prepare_frames`, `citations`. `load_image` stays for pictures and for a `.loft`
  that is not a text video.
- `addons/intelligence/app/llm.py`: `generate_stream_with_images` of the
  OpenAI-compatible client and of the ollama client take each frame's label and
  lay the labels and images out as step 5 says. Their callers are only the file
  question; the single-image call and the Visual Index are unchanged.
- `addons/intelligence/app/rag/prompt.py`,
  `addons/intelligence/app/prompts/rag/file_question_system.jinja2`,
  `addons/intelligence/app/prompts/rag/file_question_user.jinja2`: passages and
  frames in one prompt, one numbering.
- New tests under `addons/intelligence/tests/` citing SPEC-ADDON-114.
- Existing tests whose expectation this change replaces. Each one that asserts the
  single position image of a native or YouTube video with a text chunk under a
  profile that can see is rewritten to the SPEC-ADDON-114 expectation (the frame
  set, a failed position frame left out with the scene frames still sent,
  `"attached"` while any frame was sent): in
  `test_spec_addon_071_picture_frame.py` the tests from
  `test_the_large_frame_at_the_millisecond_key_is_sent` to
  `test_without_a_stored_duration_the_extraction_decides`; in
  `test_spec_addon_077_youtube_ask.py` the tests from
  `test_the_large_frame_of_the_stream_is_attached_once` to
  `test_a_lookup_slower_than_15_seconds_ends_as_unavailable`; and in
  `test_spec_addon_071_image_stream.py` and `test_spec_addon_072_position.py`
  any test that uses a seeing profile on a video with a text chunk; and
  `test_spec_addon_108_video_frames.py::TestWhenTextArrives::test_the_next_question_after_a_transcript_lands_takes_the_text_path`,
  which is rewritten so that the question after the transcript lands sends the
  passages with the frame set and `"attached"`. Tests that assert the
  multi-image request shape or the frame list inside the prompt text
  (`test_vision_llm_client.py`, `test_spec_addon_108_video_frames.py`, and the
  SPEC-ADDON-114 acceptance tests) are updated to the I11 layout. A test whose
  property still holds is kept as it is, or moved to a non-seeing profile when
  the property it guards is the text path's (422, position wording, the text-only
  retry's passages). No assertion about pictures, audio, documents or text-less
  videos is changed, apart from the 108 test named above, whose video gains a
  transcript and so stops being text-less, and the 108 tests that assert the
  multi-image request layout, which move to I11.
- `docs/user-guide/search.md`, `docs/addons/intelligence.md`,
  `docs/reference/api.md`.
- `docs/specs/INDEX.md`, and the core repository's `addons/intelligence` submodule
  pointer, bumped to the merged addon commit.
- Rules passed through: `.claude/rules/design-decisions.md` (LLM features: every
  call through `resolve(drive, feature)`, `offhost` only when `llm_cloud` allows;
  Access control; LLM output is not a source), and
  `.claude/rules/backend-conventions.md` (no language-dependent rule).
- No protected path, no migration, no Internal API, no core code, no frontend
  change.

## Invariants

I1. For a text video and a profile that can see, the images sent are exactly the kept frames of the frame set, each the frame at the time in its own label, sent in the order of their numbers, only to the `vision_model` of the profile resolved by `resolve(drive, "rag")`; for a profile that cannot see, no image is sent.
I2. The passages sent for a text video are the same, by budget and ranking, whether frames are attached, none could be prepared, or the request is retried after a refusal.
I3. The prompt numbers the passages `[1]` to `[P]` and then the kept frames `[P+1]` to `[P+F]` in time order; every `citations` entry names a number that was sent, with the passage's position for `n ≤ P` and the frame's time as `position.seconds` for `P < n ≤ P+F`, and no other number appears.
I4. With a profile that can see, a text video always receives a generated answer from its passages when frames cannot be used: no frame prepared, or a refusal of the request with images, each lead to one text-only request with `meta.image` `"unavailable"`, never to `frames_unusable`, `frames_rejected` or `image_unusable`; a refusal never writes the vision-unsupported verdict.
I5. With a position greater than 0 the frame set has the position frame plus at most 7 scene frames, none within 1 s of the position, and the prompt states the position; with no position or a position of exactly 0 it has at most 8 scene frames and the prompt states no position; a frame that failed is never replaced by a frame of another time.
I6. A text-video question with a profile that can see holds exactly one Ask slot from after the material is read until its stream ends, fails or is cancelled; it has at most 4 frame preparations running at once, starts none after 45 s from the slot or after a disconnect, has sent the model request or ended the stream no later than 45 s after the slot was taken, and until the first `answer_chunk`, including during a text-only retry, no 10 s pass without a byte written to the stream.
I7. Questions, answers, history and frame bytes are neither stored nor logged; the only write is the `large` frame cache entry `get_video_frame` also writes.
I8. Text-less videos (apart from the request layout of I11, which they share), pictures, audio, documents, a `.loft` that is not a text video, every request whose profile cannot see, the availability route and the normal Ask answer as they did before this change.
I9. The `meta` event of a text-video answer with a profile that can see carries `partial` equal to whether the passages were cut by the budget, and `image` as `"attached"` whenever at least one frame was sent (also when generation then fails) and `"none"` when no frame time was chosen.
I10. The system prompt sent with passages and frames tells the model that both numbered passages and numbered frames may be cited and nothing else, to take exact characters from a passage where it and a frame differ and from a frame when no passage has them, and to say so instead of guessing when neither contains the answer.

I11. For every video question that sends frames (a text video or a text-less one), each image is preceded, with nothing else between them, by a text whose whole content is that frame's label `[n] <time>`, the labels run in the order the images are sent, and the prompt text before the first label has no list or line pairing a frame number with a time (the position sentence is not one); with an OpenAI-compatible profile the labels and images are alternating parts of one user message after the prompt text, and with an ollama profile each label and its one image are a user message of their own after the prompt message.

## Revises

SPEC-ADDON-053 I1. The LLM receives passages, and for a picture one image, for a video with a text chunk and a profile that can see up to 8 frames, or for a video with no text chunk up to 8 frames (a `.loft` with a text chunk that is not a text video gets no image: its attempt ends in `"unavailable"`), of the requested file only, and only when the file is an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on.
SPEC-ADDON-053 I3. Every entry of the `citations` event names a number that was sent: a chunk number with that chunk's position, or a frame number (after the chunk numbers for a video with a text chunk, from 1 for a video with none) with that frame's time; a number that was not sent never appears.

SPEC-ADDON-071 I1. A question's passages, picture and frames come only from the requested file, an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on, and the only other text sent is the history the request carried; a picture gets at most one image of at most 1024 px on its long edge, and a video, with or without a text chunk, gets at most 8 frames of at most 1280 px when its profile can see.
SPEC-ADDON-071 I3. `meta.image` is `"attached"` when an image or at least one frame was sent, `"unavailable"` only when the route tried to send one and could not or the provider refused it, and `"none"` otherwise, including when the profile cannot see; the notice line is shown for `"unavailable"` and never for the other two.
SPEC-ADDON-071 I5. The prompt mentions an image or frames, and tells the model to take exact characters from the passages when they and the image or frames differ, only when an image or frames are attached; it states a position only when `position_seconds` was sent for a video or audio file.
SPEC-ADDON-071 I7. `position_seconds` that is negative, non-finite or above 1,000,000 is rejected with 422 for any kind of file before any model is called; a position past the end of the video, one at which ffmpeg returns no frame, or a frame extraction that times out leaves the position frame out, and no other frame is sent in its place.
SPEC-ADDON-077 I6. Ask on a YouTube `.loft` that has a text chunk, with a profile that can see, sends the frame set of SPEC-ADDON-114 read through the `large` frame route, under every invariant of SPEC-ADDON-071 (profile, `llm_cloud`, one slot, nothing stored or logged but the `large` cache entries); any frame failure leaves that frame out, and when none is sent the answer is from the text with `"unavailable"`; a YouTube `.loft` with no text chunk is answered from frames by SPEC-ADDON-108; Ask on a `.loft` of another provider is unchanged.
SPEC-ADDON-108 I2. Each frame sent is the frame at the time in its own label, and goes only to the `vision_model` of the profile resolved by `resolve(drive, "rag")`.
SPEC-ADDON-108 I4. The kept frames are numbered from 1 in time order and each image is sent right after its own label, as SPEC-ADDON-114 I11 states; every `citations` entry for a text-less video names a frame number that was sent, `1 ≤ n ≤ m`, with that frame's time as `position.seconds`, and no other number appears.
SPEC-ADDON-108 I5. The frames prompt of a video with no text chunk has no passages section; when there is a position greater than 0 it states it whether or not the position frame was kept, and no frame other than the position frame is labelled at the position's time. (I7 and I8 of SPEC-ADDON-108 speak of a video with no text chunk; a text video holds the same properties by SPEC-ADDON-114 I6.)
SPEC-ADDON-108 I1. A video with at least one `transcript_chunks` or `fts_text_content` row gets the availability and passages it had before SPEC-ADDON-108, and its frames by SPEC-ADDON-114; availability answers `true` for a text-less video only when some profile can see, and `false` for audio with no text chunk and for a `.loft` that is unreadable or whose source is not YouTube.

## Checked, no action

- **Why each image carries its own label.** Measured on 2026-11-15 with
  gemma4:e4b (the production model) and eight frames of one video, asked to say
  what each numbered frame shows: with the numbers listed in the prompt text and
  the images attached after it, 4 and 5 of 8 descriptions matched their frames
  (they slipped by one from the fifth on); with each image preceded by its label,
  8 of 8 in each of four runs, whether the question came before or after the
  frames. The R-5 run saw the same slip as frame pills seeking to the wrong scene.

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
  `position.seconds`, reads `meta.image`, and shows the `imageUnavailable` line
  under an answered turn. No frontend test is added; the wire values it reads are
  pinned by I3, I4 and I9.
- **The keep-alive on the text path for a profile that cannot see.** Not added:
  that path prepares no frame and starts the model request at once, as today.
- **Frame numbers above 999.** The citation marker reads one to three digits, so a
  frame numbered above 999 cannot be cited. That takes more than 990 passages,
  which the default budget (16,000 characters) never reaches; with a budget raised
  that far, frames are simply not citable. Accepted.
- **A position of exactly 0 on the text path of a profile that cannot see.** Kept
  as today (stated as 0:00); the "0 is no position" rule belongs to the frames
  paths, where a position frame would be taken.
- **Recording the vision-unsupported verdict after a refusal on a text video.** Not
  recorded (human decision, 2026-11-15), although the single position image of
  SPEC-ADDON-071 did record it: a provider may refuse several images and accept
  one, and the verdict would also stop picture questions and image descriptions.
  Accepted cost: with a profile whose model refuses images, every question about
  a text video pays the frame preparation, the refused request and the text-only
  retry, and shows the existing notice line.
- **Retrying with fewer frames after a refusal.** Not done, as in SPEC-ADDON-108;
  the text-only retry already answers.
