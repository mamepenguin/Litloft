# Ask about this file: pictures, the playing frame, and Markdown answers

SPEC-ID: SPEC-ADDON-071
SPEC-ID: SPEC-ADDON-072
SPEC-ID: SPEC-ADDON-073
SPEC-ID: SPEC-ADDON-074

Approval: sha256:e56dcacbe129568785fabd48d2e73fc599d10d4e6ad781c401e97d7960907358 Yuichi Senga 2026-11-07

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

The single-file question (`POST /files/{id}/ask`, SPEC-ADDON-053) answers only from the
file's indexed text. This change lets it see.

- **071** A picture's pixels go to the model together with its OCR text; the OCR text stays
  the source for exact characters. A video question carries one frame.
- **072** While a video or audio file plays, the tab sends the player's position with the
  question; the prompt tells the model it is "where the viewer is now" and to use it when
  the question points at the current moment. For a video the frame at that position is the
  frame sent in 071.
- **073** The answer is written in Markdown and drawn as formatted text, with `[n]` still
  becoming citation pills.
- **074** A picture with no indexed text can be asked about when some profile can see.

For the person who keeps screenshots, charts, diagrams and photos next to their videos and
asks "what is the amount on this receipt", "what is wrong with this screen", "what is on
the table at this point in the video". The purpose is questions about what a file shows,
which text alone cannot answer. Only the single-file question changes; the drive-wide Ask
(`/ask`) and its prompts do not (SPEC-ADDON-053 I12 still holds).

Terms used below:

- **The profile** is the one `resolve(drive, "rag")` returns for the request, honouring the
  viewer's chosen profile.
- **The profile can see** when it names a `vision_model`, its client is enabled, and the
  per-model verdict the picture-description path keeps in process (`llm.py`) does not
  already say the model cannot see. A model with no verdict yet counts as able to see: no
  probe is run before a question, and a refusal during a question records the verdict, so
  from then until the process restarts the profile cannot see, for availability, the 409
  and the attempt alike.
- **An image applies** to a picture, and to a video when the request carries a position.
  It applies to nothing else.

## Required items

### 1. Normal flow

1. The viewer opens a picture, a video or another file with the **Ask** tab. The tab
   asks `GET /files/{id}/ask` for availability as it does today (074 widens the answer
   for pictures).
2. The viewer types a question and submits. The tab sends `{question, profile?,
   position_seconds?}`. `position_seconds` is present only when a `mediaController` exists,
   it is not `isInterrupted()`, and `getCurrentTime()` is finite and not negative; it is a
   snapshot at submit time, not followed afterwards.
3. The route checks, in this order and without taking a slot: `features.rag` (404), the
   profile and `llm_cloud` (the existing profile-unavailable response), the file's indexed
   chunks, selected under `rag.file_question_max_chars` exactly as today (404 when the file
   cannot be asked about), and last, for a picture with no chunk whose profile cannot see,
   409 `picture_needs_vision`.
4. The route takes the semaphore slot. Under that slot, and only if an image applies and
   the profile can see, it prepares the image:
   - **picture**: the picture's bytes, re-encoded with the long-edge limit the
     picture-description worker uses (`_preprocess_image`, 1024 px);
   - **video**: the `large` frame (long edge ≤ 1280) at `position_seconds`, rounded to the
     millisecond key the frame cache uses, from the shared frame cache.
5. The route streams the answer. With an image attached the request goes to the profile's
   `vision_model` instead of its `model`, and the passages and the image travel in the same
   request. The stream events are as today: `answer_chunk`, `citations`, `meta`, `done`.
6. `meta` gains `image`: `"attached"` (an image was sent), `"unavailable"` (the route
   tried to send one and could not), or `"none"` (no image applies, or the profile cannot
   see). A profile that cannot see is therefore silent; only an attempt that failed is
   reported.
7. The tab renders the answer as Markdown (073), turns each cited `[n]` into the existing
   pill once the `citations` event arrives, and, when `image` is `"unavailable"`, shows
   one line under the answer saying the image could not be used.

The position is also written into the prompt, for video and audio files only and only when
it was sent, as `h:mm:ss` (`m:ss` under an hour). The range check of `position_seconds`
applies to every kind of file; a valid position sent for any other kind is ignored without
an error.

A picture with no passages gets an image-only wording: it does not tell the model to cite
passages, `citations` carries an empty list, and the tab draws no pill. The text-only retry
goes to the profile's `model` with the same passages and the without-image wording.

### 2. Failure cases

| Step | Failure | What the system does |
|---|---|---|
| 2 | `getCurrentTime()` non-finite or negative, player interrupted (an ad break), no player | `position_seconds` is omitted; the question is asked without a position |
| 2 | `position_seconds` negative, non-finite or above 1,000,000 reaches the route | 422, nothing is sent to a model |
| 3 | Picture with no chunk and a profile that cannot see | 409 `picture_needs_vision`; no slot, no model call |
| 4 | Picture unreadable, over the 50 MB image limit, or undecodable | No image; `image: "unavailable"` |
| 4 | Frame extraction fails or times out (15 s), the position is above the duration the index holds for the file, or ffmpeg returns no frame at the position. When the index holds no duration the extraction is attempted and ffmpeg's result decides | No image; `image: "unavailable"`. The last frame is never substituted |
| 5 | The provider refuses the image before the first answer token, as the existing vision-rejection classification of that client decides (vision unsupported, content refused) | One retry of the same question as text only, under the same slot; `image: "unavailable"`. A 5xx, a timeout or any other failure is a plain generation failure and is not retried |
| 5 | The refusal in the row above or any image-step failure in step 4, for a file with no chunk | The stream ends with `done` carrying `error: "image_unusable"`; nothing is answered from nothing |
| 5 | A 5xx, a timeout or any other failure before the first token, for a file with no chunk | The generic generation failure of 053; no answer |
| 5 | Failure after the first token | As today: the text received is kept, `done` carries `error` |
| 4–5 | The client disconnects during image preparation or the request | The work is cancelled and the slot is released, as for any stream of 053 I11 |

"No image" never turns into "the model answered as if it saw one": the prompt for a
request without an image does not mention one, and `meta.image` says which case it was.

### 3. States

The route is stateless. The tab's per-file ask entry keeps the states of SPEC-ADDON-053
(`idle`, `streaming`, `answered`, `failed`).

- The entry gains `image`, set from `meta.image`, readable only in `answered`. `beginAsk`
  clears it, and so does any move to `failed`, so a failed entry shows its failure line and
  never the image notice.
- `failed` gains two failure kinds beside the existing ones: `picture_needs_vision` (409)
  and `image_unusable` (`done` with that error). Each has its own line in the tab, below.
- A `meta` that arrives before a `done` with an error is dropped when the entry fails.
- A failed entry keeps the text received, still drawn as Markdown, above its failure line
  (053 I11).
- Transitions are 053's; none is added.

### 4. Data read and written

| Store | Access |
|---|---|
| `search.db` `indexed_files`, `transcript_chunks`, `fts_text_content`, `document_sections`, `embeddings` | read, as 053 |
| The picture file, through the host's file path lookup used by the description worker | read |
| The video file, through ffmpeg in the frame cache | read |
| `intelligence_data_dir/frames/{file_id}/{ms}.large.webp` | read, and written on a miss with the cache's own atomic write: the cache `get_video_frame` already fills, purged with the file |
| The vision-unsupported verdict kept by the description path | read; written when a refusal is classified as unsupported, as that path does |
| Core DB, `search.db` rows, the question, the answer, the image bytes | not written |

### 5. External services

The routed LLM, with the same gates as 053. With an image the call is a Chat Completions
streaming request with an `image_url` data-URL block to the profile's `vision_model`, on
the same `base_url` and key as its text model, so an off-host profile stays off-host and
`llm_cloud` governs the picture exactly as it governs the text. Every client class that
`resolve` can return gets an image-carrying streaming call in its own wire shape: the
OpenAI-compatible client sends the `image_url` block above, and the Ollama client sends
the image in the `images` list of its native chat protocol. A client with no such call is
treated as a profile that cannot see. Slow: the stream is as slow as the
model; frame extraction is bounded at 15 s and counts as `"unavailable"` past that. Down or
wrong: a refused image falls back to text once (step 5); any other failure is the
generation failure of 053. Two concurrent frame requests for the same millisecond are
safe because the cache writes a temporary file and renames it.

### 6. Authorization

Unchanged. `require_drive` checks the `X-Lit-Drive` header; the file must be an active
`indexed_files` row of that drive. The picture and the frame are read by `file_id` after
that check, so no path comes from the request. `position_seconds` is a number and selects
a time within the same file only.

### 7. Effect on existing features

- `/ask` and `/find` and their prompts are untouched. The MCP `ask` tool calls `/ask`
  only, and the file-question route's one caller is the tab (`askStream.ts`), so no other
  consumer reads the Markdown answer as plain text.
- `get_video_frame` and the scenes list use the same `large` frame cache entries; a frame
  made for a question is reused by them and the reverse.
- The picture-description worker's `_load_image_bytes` and `_preprocess_image` are reused
  by the new path and keep their behavior for the worker.
- The shared Ask semaphore counts an image question as one slot.
- `tests/test_llm_caller_inventory.py` pins every LLM call to `resolve`; the new streaming
  call is registered there as a caller reached only through the resolved client.
- Availability for pictures widens (074), which changes when the **Ask** tab is listed on a
  picture's page; text, PDF, EPUB, video and audio availability does not change.
- The prompt's output rules change from "prose only" to Markdown for this route only, so
  the file-question prompt files change and the drive-wide Ask prompts do not.

### 8. Error behavior

- Request-level failures keep their codes: 404 for a file that cannot be asked about, 422
  for a malformed body (now including a bad `position_seconds`), 503 for a full semaphore,
  and the existing profile-unavailable response when `llm_cloud` denies the profile.
- 409 `picture_needs_vision` shows: "This picture has no text, and the selected model
  cannot read images." `image_unusable` shows: "This picture has no text and could not be
  read as an image." Both are Japanese in `ja.json`.
- A failure to attach an image for a file that has text is not an error: the user sees the
  answer and one line under it, "The image could not be used, so this answer is from the
  text only." (Japanese in `ja.json`).
- Logged: the failure class of an image step (`picture_unreadable`, `frame_failed`,
  `image_rejected`) with the file id. Never the question, the answer, or any image byte.

### 9. User-visible behavior

- A picture's **Ask** tab is offered when the picture has indexed text, or when some LLM
  profile has a `vision_model` (074). Everything else is offered as before.
- Answers appear with headings, lists, tables and bold drawn as such, following
  `DESIGN.md`. They are drawn by a renderer for the answer alone, built on the Markdown
  component the addon's detailed summary already uses and configured for these rules;
  the detailed summary and every other surface keep drawing as they do. Raw HTML in an
  answer is shown as text. A Markdown image is not drawn: its alternative text is shown
  and nothing is fetched. A link whose scheme is `http`, `https` or `mailto` is an ordinary
  link that opens in a new tab with `noopener noreferrer`; any other scheme is shown as
  text.
- The prompt asks for short answers, the most useful point first.
- While the answer streams, the text received so far is rendered on every update; syntax
  not yet closed is drawn as the renderer draws it, and corrects itself as it closes.
- `[n]` markers become pills once the `citations` event arrives, wherever they sit in a
  text node outside code (headings, lists, table cells, bold, links included). A marker
  inside a code span or block is left as written.
- During playback the answer can refer to what is on screen at the moment the question was
  sent. The position is not shown in the UI.
- When an attempted image could not be used, one line under the answer says so. A profile
  that cannot see produces no line.
- The tab shows nothing new before a question is asked: no frame preview, no toggle.

### 10. Non-functional

- Size: picture long edge ≤ 1024 px (re-encoded), frame long edge ≤ 1280 px, one image per
  question. No picture over 50 MB is sent.
- Time: image preparation runs under the slot, bounded by the 15 s frame timeout and the
  picture re-encode; it adds to the time to the first token. Parallel preparations are
  bounded by the semaphore, and a disconnect cancels them.
- Cost and privacy: an image is sent only through the profile and only if `llm_cloud`
  allows it for the drive (053 I4); a policy that cannot be read sends nothing. Using the
  picture lets an off-host profile receive pixels, not only text; this is the same decision
  the drive's `llm_cloud` policy already makes for text.
- Concurrency: one slot of the shared semaphore for the whole question, including the
  text-only retry.
- The `vision_model` answers instead of `model` when an image is attached, so quality and
  price follow the vision model for those questions.

## Touch points

- `addons/intelligence/app/routers/rag.py`: `file_ask_availability`, `file_ask_endpoint`
  (409 `picture_needs_vision`), `_file_question_stream` (image preparation under the slot,
  `meta.image`, the text-only retry, `image_unusable`).
- `addons/intelligence/app/rag/file_question.py`: `available`, `load_material` (a picture
  may have no chunk), a new image loader that reuses `workers/vision.py`
  `_load_image_bytes` / `_preprocess_image` and `frame_cache.py`.
- `addons/intelligence/app/schemas.py`: `FileQuestionRequest.position_seconds`.
- `addons/intelligence/app/llm.py`: a streaming request that carries an image to
  `vision_model`, on every client class beside its `generate_stream`; the existing
  vision-rejection classification and verdict are read and written.
- `addons/intelligence/app/llm_routing.py`, `config.py`: `has_vision_profile` is read; the
  routing key, the feature flags and the profile fields do not change.
- `addons/intelligence/app/prompts/rag/file_question_system.jinja2`,
  `file_question_user.jinja2`, `app/rag/prompt.py`: Markdown rules, position hint, the
  with-image and without-image wording.
- `addons/intelligence/tests/test_llm_caller_inventory.py`.
- `addons/intelligence/frontend/AskTab.tsx`, `askStream.ts`, the ask store, the answer
  renderer, `messages/{ja,en}.json` of the addon.
- Rules passed through: `.claude/rules/design-decisions.md` (Access control, Drives,
  LLM features, Addons), `.claude/rules/frontend-conventions.md`, `DESIGN.md` for the
  rendered answer.
- Docs: `docs/user-guide/` (the Ask-about-this-file page), `docs/reference/api.md` (the
  `position_seconds` field, `meta.image`, the 409), `docs/addons/intelligence.md`.
- No protected path from `docs/process/risk-and-human-review.md`. No core change; the
  `mediaController` already reaches the tab.
- A submodule pointer bump in the core (CLAUDE.md, Git).

## Invariants

I1. A question's passages, picture and frame come only from the requested file, an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on; the frame is the one at the request's `position_seconds`, and at most one image is sent, a picture of at most 1024 px on its long edge or a frame of at most 1280 px.
I2. An image is sent only through the profile resolved by `resolve(drive, "rag")`, only to that profile's `vision_model`, and only when `llm_cloud` allows that profile for the drive; a policy that cannot be read sends neither image nor text.
I3. `meta.image` is `"attached"` when an image was sent, `"unavailable"` only when the route tried to send one and could not, and `"none"` otherwise, including when the profile cannot see; the notice line is shown for `"unavailable"` and never for the other two.
I4. The passages sent for a question are the same, by the budget and ranking of SPEC-ADDON-053, whether or not an image is attached, and the text-only retry sends those same passages.
I5. The prompt mentions an image, and tells the model to take exact characters from the passages when they and the image differ, only when an image is attached; it states a position only when `position_seconds` was sent for a video or audio file.
I6. A picture with no text chunk whose image was not sent never receives a generated answer: it ends in 409 `picture_needs_vision` before a slot is taken, in `done` with `error: "image_unusable"`, or in the generic generation failure.
I7. `position_seconds` that is negative, non-finite or above 1,000,000 is rejected with 422 for any kind of file before any model is called, and a position past the end of the video, one at which ffmpeg returns no frame, or a frame extraction that times out yields `"unavailable"`, never another frame.
I8. The question, the answer and every image byte are neither stored nor logged by the route or the tab, apart from the `large` frame cache entry that `get_video_frame` also writes.
I9. An image question holds exactly one semaphore slot from after the material is read until its stream ends, fails or is cancelled, and image preparation and the text-only retry both run under that slot.
I10. The rendered answer never injects raw HTML, draws a Markdown image as its alternative text without fetching it, opens a link in a new tab, and turns a cited `[n]` into a pill in any text outside a code span or block and nowhere inside one.

## Revises

SPEC-ADDON-053 I1. The LLM receives passages, and for a picture or a playing video one image, of the requested file only, and only when the file is an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on.
SPEC-ADDON-053 I6. The availability route answers `available: true` only for an active file of the request drive with at least one text chunk, or for an active picture of the request drive when some profile has a `vision_model` and is not recorded as vision-unsupported; for every other kind of file it is unchanged.

## Checked, no action

- **053 I3, I5, I8 and I11 stand as written.** I3 holds with no passages (the list is
  empty); I5 gains only the image bytes, covered by I8 below; I8's rule that an uncited or
  null-position `[n]` leaves no pill is kept by the new renderer; I11's abort and
  retention rules cover the retry and the failed entry.
- **Prompt wording asking for short answers, and the `h:mm:ss` format**: prompt prose, not
  an invariant a mutation can meaningfully violate; the position clause is I5.
- **The frame cache write and the verdict write** are the existing behaviors of
  `get_video_frame` and the description path, reused unchanged, so they get no invariant
  here. Docs and the submodule pointer need none either.
- **Probing for vision before a question**: no probe is run. The first refusal records the
  verdict, so one refusal disables vision for that model until the process restarts, the
  same as the description path.

- **Cross-file Ask (`/ask`) and its prompts**: unchanged by decision; its citation form is
  a different contract, and 053 I12 already pins its responses.
- **Video or audio with no transcript stays unaskable**: a silent screen recording could be
  asked about by its frame alone, but nobody asked for it and it widens availability for a
  kind whose answer today depends on the transcription event. Raise it as its own change.
- **Availability that follows the chosen profile and `llm_cloud`**: availability reads only
  "some profile can see". A viewer whose chosen profile cannot see gets the 409 line on
  asking, which names the cause; making the tab appear and disappear with the chosen
  profile would hide the feature without explanation.
- **A notice when the profile cannot see**: left silent, because the usual setup would put
  the line under nearly every answer. Only an attempt that failed is reported.
- **More than one frame, or frames around the position**: one frame keeps cost, latency and
  the amount of data sent off-host small. A question about motion is a later change.
- **Ranking passages by closeness to the position**: the position is a prompt hint only;
  chunk selection is not changed.
- **A new routing key for pictures**: the `rag`-resolved profile and its `vision_model` are
  used; a separate key would add a settings screen for one field.
- **YouTube embeds**: no file exists to take a frame from, so the frame fails and, for a
  file with text, the answer is text-only with the notice; the position is still sent
  while not interrupted.
- **A frame preview or a "use the picture" toggle in the tab**: the person asking about a
  picture means the picture; no control is added.
- **Page of a PDF currently shown**: not sent in this change.
- **The position at the time the answer finishes**: the snapshot is the question's moment.
- **Streaming a retry notice before the answer**: the notice follows the answer because the
  fallback is only known once the provider has refused.
- **Bounding image preparation outside the slot**: preparation runs under the slot, so the
  semaphore bounds it and a full semaphore answers 503 before any ffmpeg or re-encode work.
- **Markdown in stored output**: nothing is stored.
