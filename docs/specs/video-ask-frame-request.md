# Ask about a video lets the model ask for more frames

SPEC-ID: SPEC-ADDON-116

Approval: sha256:27eca2e86f23a0b3783646ff50ca31036984331d8bc3fadb932dec297ad4837e Yuichi Senga 2026-11-15

## Summary

A question about one video in the file Ask tab, answered by a profile that can
see, now offers the model a tool, `get_frames`, with which it asks for the frames
at times it chooses, after it has read what SPEC-ADDON-114 sends today (the
passages and up to 8 frames). With the question it also gets the video's duration
and a table of contents: the sections of the SPEC-ADDON-112 navigation list, each
with its time range and the start of what is said and shown in it. The model may
call the tool at most 3 times, for at most 4 frames each; the frames are cut on
demand, like `get_video_frame`'s, and are labelled and numbered as the first
frames are, so the answer can cite them. After the third call, or once 120 s have
passed, the model is asked without the tool and must answer. A profile on ollama
gets thinking turned on for these requests, because the production local model
(gemma4:e4b) did not call the tool without it. Whatever goes wrong on the new
path, the question falls back to exactly today's request. The work is for the
viewer asking about something the 8 frames missed: measured on 14 sample videos,
the representative frames are like (CLIP cosine ≥ 0.85) only 37–54% of the other
moments of home videos, anime and vlogs, and the signs and panels a question asks
about are among what they miss. The normal (cross-file) Ask, the MCP tools,
pictures, audio, documents and every profile that cannot see are unchanged.

## Terms

- **Frames path**: the SPEC-ADDON-114 / SPEC-ADDON-108 path a video question takes
  today when its profile can see.
- **Today's request**: the single request the frames path sends today for the
  question (passages and initial frames for a text video, initial frames for a
  text-less one), byte for byte, with its own refusal and failure handling.
- **Initial frames**: the kept frames of the frame set, numbered `[P+1]` to
  `[P+F]` as today.
- **Tool request**: a request on this path that offers `get_frames`.
- **Final request**: a request on this path that carries the exchange so far and
  offers no tool (OpenAI-compatible: the same `tools` with `tool_choice` `"none"`;
  ollama: no `tools`).
- **Contents**: the navigation list of the same `select_scenes` run that chooses
  the frame set (`choose_frame_times`), over `[0, duration)`, or with `hi` left to
  `select_scenes` when the duration is unknown; at most 40 sections, each one line
  `<start>–<end> <excerpt>` with times as `m:ss` or `h:mm:ss`. The excerpt is the
  text of the file's `transcript_chunks` and `video_frame_texts` rows whose span
  overlaps the section (a row's span `[start, end)`, or its start alone when it has
  no end, overlaps `[a, b)` when it starts before `b` and ends after `a`), ordered
  by start, a transcript row before a frame-text row at the same start, whitespace collapsed to single spaces, cut
  at 120 characters; a section with no such text has none. No line carries a
  bracketed number. A file whose selection is empty or fails has no contents.
- **Frame request**: one tool call in a reply to a tool request.
- **Readable time**: a JSON number (not a boolean), or a string that, after
  surrounding whitespace is removed, is a number (`"83"`, `"83.5"`), `m:ss` (any
  whole `m`, `ss` below 60) or `h:mm:ss` (`mm` and `ss` below 60), with optional
  fractional seconds; not negative. Anything else is unreadable.
- **Within 1 s**: an absolute difference below 1.0 s; exactly 1.0 s apart is not
  within, as in the frame set.
- **Requested frame**: a frame cut at a time of a frame request and sent. Its time,
  for its label, its citation and every within-1 s test, is the requested time
  rounded to the millisecond (`frame_time`), as an initial frame's is.
- **Total deadline**: 300 s after the slot was taken.

## Required items

### 1. Normal flow

1. The viewer asks about a video in the file Ask tab. The route takes the frames
   path as today: passages selected before the slot, one Ask slot, the frame set
   prepared under it. The contents are built in the same preparation, from the
   selection it already runs, under the same 45 s deadline.
2. When at least one initial frame was prepared, the first request is a tool
   request: today's prompt and initial frames (SPEC-ADDON-114 I11 layout), with
   the duration (when known) and the contents added to the prompt text after the
   passages, the system prompt's tool instructions (I8), and `get_frames`. It goes
   to the profile's `vision_model`. An ollama profile's requests on this path are
   sent with `think` on and `num_predict` of twice `rag.max_tokens`.
3. A tool request is streamed from the provider, as today's request is, and its
   reply is read to its end before anything of it is written to the stream; its
   thinking text is dropped. If it holds no tool call, its text is the answer: it is
   written as `answer_chunk` events, then `citations`, `meta`, `done`.
4. If it holds tool calls, each is a frame request, handled in the order given:
   1. The first 3 frame requests of the question are served; each after them gets
      a tool result saying the limit is reached, and no frame.
   2. A call that is not `get_frames`, or whose arguments are not an object with a
      `times` list, gets a tool result saying so, and counts as served.
   3. The times are taken in the order given. A time that is not readable or is
      past the known duration is not used. A time within 1 s of a frame already
      sent for the question, of an earlier used time of the same reply, or of the
      position stated in the prompt, is not used. Of the rest, the first 4 are
      used, and the others are not.
   4. The used times are cut as the frame set is (the `large` frame from the cache,
      ffmpeg or the YouTube frame route; at most 4 at once, started in time order;
      15 s each). A frame that fails is not replaced.
   5. The tool result is a text that says how many frames follow, and lists each
      time that was not used or not cut with its reason (unreadable, past the end,
      already sent as `[n]`, at the position, over the limit of 4, not
      available). It pairs no
      number with a time of a frame that follows.
5. The next request carries the whole exchange: the reply (without its thinking
   text) and, for every tool call of the reply in order, its tool result; then the
   cut frames of all its calls, numbered on from the last number sent, in call
   order and within a call in time order, each with its label right before its
   image (OpenAI-compatible: one user message of alternating label and image
   parts after the last tool message; ollama: one user message per label and
   image). It is a tool request while fewer than 3 frame requests have been
   served and less than 120 s have passed since the slot was taken; otherwise it
   is the final request. No request is started after the total deadline.
6. The final request's reply is streamed as `answer_chunk` events as it arrives.
7. `citations` maps each number to what it was sent with: a passage to its
   position, an initial or requested frame to `{"seconds": <its time>}`.
   `meta.image` is `"attached"`; `meta.partial` is as today.

### 2. Failure cases

- **No initial frame prepared**: no tool request; the question goes as today
  (text-only request, or `frames_unusable` for a text-less video).
- **A tool request, or a final request before its first `answer_chunk`, is
  refused or fails** (any error, including `ImageRejected`, a timeout, a status
  other than 400/404, or a reply that leaves no answer): today's request is sent
  once, and from there SPEC-ADDON-114 / SPEC-ADDON-108 handle it, including their
  own refusal handling. No vision-unsupported verdict is written by this path.
  Log `frame_tool_fallback (file <id>)`.
- **A final request fails after its first `answer_chunk`**: `meta` with `image`
  `"attached"`, then `done` with `"Answer generation failed"`, as today.
- **A final request replies with only a tool call and no text**: counts as a reply
  that leaves no answer (fallback above).
- **A frame request gives no frame** (all times unusable or failed): the tool result
  says why; it counts as served.
- **The total deadline passes**: a request or frame cut in flight is stopped and
  no other is started. Before the first `answer_chunk`: `meta` with `image`
  `"attached"`, then `done` with `"Answer generation failed"`. After it: the same.
  Log `frame_tool_deadline (file <id>)`.
- **An unexpected error while cutting** (not a frame's own failure, which is a
  drop): treated as a failed tool request (fallback).
- **The viewer closes the tab**: as today, the model stream and any frame cutting
  stop; no further request is sent and no further frame is cut.
- **The contents are not built by the deadline, or the selection fails**: the
  request carries no contents; the tool is still offered.
- **The duration is unknown** (a YouTube `.loft` with none): no time is refused as
  past the end; a time with no frame is reported as not available.

### 3. States

Nothing is kept between questions. A follow-up question (history) starts again
from the initial frames, and its history carries only the earlier answer text.

Per question:

- `preparing` (frame set and contents) → `tool` (a tool request in flight) when an
  initial frame was prepared; → today's path otherwise.
- `tool` → `answer` (its reply has no tool call); → `cutting` (it has frame
  requests); → `fallback` (refused, failed or empty).
- `cutting` → `tool` (fewer than 3 served and under 120 s); → `final`;
  → `fallback` (an unexpected error).
- `final` → `answer`; → `fallback` (refused, failed or empty before the first
  `answer_chunk`); → `failed` (after it).
- `answer` → done. `fallback` → today's path, done or failed as it decides.
- From every state, the fallback's included: a disconnect → ended, nothing
  further sent or cut; the total deadline → failed.
- Not allowed: `final` → `tool`; `fallback` → `tool` or `final`; a second
  `fallback`; `cutting` after 3 served frame requests.

### 4. Data read and written

- Read: `transcript_chunks` and `video_frame_texts` for the excerpts; the rows
  `load_selection_inputs` reads (once per question, shared with the frame set);
  the video file or its YouTube source.
- Written: the `large` frame cache entries, which `get_video_frame` also writes.
  Nothing else.

### 5. External services

The routed profile's model. Per question at most 3 tool requests and 1 final
request; on a fallback, today's request once more, after which SPEC-ADDON-114 may
add its one text-only request: at most 6 requests in all. Each request has the
client's own timeout, which bounds each wait for bytes, not the request; a
streamed tool request therefore does not time out while the model is producing.
The 120 s limit decides only whether the next request offers the tool. The total
deadline (300 s) stops everything, so the stream ends before the core proxy's
600 s wall clock (`backend/app/routers/addon_proxy.py`). A YouTube frame goes through
the existing frame route.

### 6. Authorization

Unchanged: the file Ask route's (`X-Lit-Drive`, drive access, `rag` feature,
`llm_cloud` through `resolve(drive, "rag")`). A requested frame is a frame of the
requested file only.

### 7. Effect on existing features

- File Ask on a video with a profile that can see: the tool, duration, contents
  and, on ollama, thinking are added; the passages and initial frames are as
  today. The answer is written when the model's reply is complete, not as it
  streams, except for the final request's.
- The Ask slot (shared with `/ask` and `/find`, 3 at once) is held longer by a
  question that requests frames: at most the total deadline, 300 s.
- The normal Ask with its agentic loop (`app/rag/agentic.py`), the MCP `ask`,
  `list_video_scenes` and `get_video_frame`: unchanged.
- Requests whose profile cannot see, pictures, audio, documents, a `.loft` that is
  not a text video: unchanged.
- The frame cache gains entries at the requested times.

### 8. Error behavior

As in SPEC-ADDON-114 for the viewer: a fallback is invisible except for its
answer. Logged: `frame_tool_fallback (file <id>)`; and once per question that
served a frame request, `frame requests: <calls> calls, <frames> frames (file
<id>)`. No question, answer, tool argument or frame bytes are logged.

### 9. User-visible behavior

- An answer may cite frames beyond the first 8; their pills seek to their times as
  frame pills do today.
- A video answer appears when the model's reply is complete rather than token by
  token, except after frame requests, when the final answer streams.
- Measured per frame request: 1–7 s with DeepSeek V4.1 Flash, 5–12 s with
  gemma4:e4b with thinking. Thinking adds about 1 s to an ollama question that
  requests nothing (gemma4:e4b, 3.5 s → 4.4 s to the reply).
- Until the first `answer_chunk`, `: keepalive` is written so that no 10 s pass
  without a byte.
- The docs say the model may look at up to 12 more frames of the video, and that
  an ollama server needs a context length of at least 32768 for it.

### 10. Non-functional

- At most 12 requested frames per question, 4 per frame request, 3 served frame
  requests; at most 6 model requests (section 5); nothing after 300 s from the
  slot.
- No tool request after 120 s from the slot.
- Cost (measured, OpenRouter): $0.001–0.004 per question with DeepSeek V4.1 Flash.
- Contents: at most 40 lines, excerpts of at most 120 characters, outside the
  passage budget.
- Privacy: as SPEC-ADDON-114; frames go only to the resolved profile.

## Touch points

- `addons/intelligence/app/routers/rag.py`: `_frames_question_stream` (the loop,
  fallback, keep-alive, citations, meta).
- `addons/intelligence/app/rag/file_question.py`: contents built from the
  selection `choose_frame_times` runs, readable times, cutting requested frames
  with `_frame_image` and the preparation limits.
- `addons/intelligence/app/llm.py`: `LLMClient` and `OllamaLLMClient` gain one
  request over a message list with images and an optional tool, returning the
  reply's text and tool calls, and one streamed final request; ollama with `think`
  on, its thinking text never returned or sent back.
- `addons/intelligence/app/rag/prompt.py`,
  `addons/intelligence/app/prompts/rag/file_question_system.jinja2`,
  `addons/intelligence/app/prompts/rag/file_question_user.jinja2`, and the tool's
  definition: duration, contents, tool instructions (I8).
- Tests whose single-request expectation changes: the SPEC-ADDON-108 and
  SPEC-ADDON-114 frames-path tests that assert the request bodies or the request
  count with a profile that can see (`tests/test_spec_addon_108_*`,
  `tests/test_spec_addon_114_*`, the 071 / 072 / 077 frames-path tests). Each is
  rewritten to this spec only where the tool changes what it asserts; assertions
  about profiles that cannot see, pictures, audio and documents are not touched.
- The shared test helpers `tests/file_question_vision_doubles.py` (its OpenAI and
  ollama handlers learn to return tool calls and ollama `thinking`) and
  `tests/frame_label_layout.py` (frames after tool messages), extended in place so
  that what they return and check today is unchanged; and the suites that run the
  frames path with a profile that can see: `tests/test_spec_addon_109_frame_citations.py`,
  `tests/test_spec_addon_113_ask_frames.py`, `tests/test_spec_addon_081_file_question_history.py`.
- `tests/test_llm_caller_inventory.py` if the new client methods are new callers.
- `docs/addons/intelligence.md`, `docs/user-guide/search.md`,
  `docs/reference/api.md` (the file Ask row).
- `docs/specs/INDEX.md` (the SPEC-ADDON-116 row) and the core's `addons/intelligence`
  submodule pointer, moved to the merged addon commit.
- Rules passed through: `.claude/rules/design-decisions.md` (LLM features: one
  routed client, citations only to what was sent, `llm_cloud`),
  `.claude/rules/backend-conventions.md` (no language-dependent rules).
- No protected path.

## Invariants

I1. For a video question with a profile that can see, every image sent is an initial frame or a requested frame of the requested file, each the frame at the time in its own label, sent only to the `vision_model` of the profile resolved by `resolve(drive, "rag")`; per question at most 12 requested frames are sent, at most 4 for one frame request, none within 1 s of another frame sent for the question or of the stated position, none at an unreadable time, and none past a known duration (an unknown duration refuses no time).

I2. At most 3 frame requests per question are served; a request is a final request once 3 have been served or 120 s have passed since the slot was taken, and no request after a final request offers the tool.

I3. Numbers run without a gap: passages `[1]`–`[P]`, initial frames `[P+1]`–`[P+F]`, then requested frames in the order sent; every `citations` entry names a number that was sent, with the passage's position or the frame's time as `position.seconds`, and no other number appears.

I4. Any refusal or failure of a tool request, or of a final request before its first `answer_chunk`, is followed by exactly one request identical to today's request for the question, and by nothing else from this path; this path never writes the vision-unsupported verdict.

I5. An ollama profile's tool and final requests are sent with thinking on and `num_predict` of twice `rag.max_tokens`; no thinking text appears in any `answer_chunk` or in any later request. An OpenAI-compatible profile's tool and final requests differ from today's request only by the messages of the exchange, `tools`, and `tool_choice` (`"auto"` on a tool request, `"none"` on a final request); `stream`, temperature and max tokens are as today's.

I6. No text of a reply to a tool request is written to the stream before that reply is complete and known to hold no tool call; the reply to a final request is written as it arrives.

I7. The contents list at most 40 sections in time order with no bracketed number, each excerpt at most 120 characters, drawn only from the requested file's transcript and frame text in that section's span; a tool result names no frame number except as the frame an unused time duplicates.

I8. The system prompt of a tool request says that the frames sent are a sample of the video, that `get_frames` returns the frames at given times, up to 4 per call and 3 calls, that it is to be called when the answer depends on what is shown at moments the frames do not show, that the user is never asked for times, and that requested frames are numbered and cited as the other frames are, under the SPEC-ADDON-114 I10 rules.

I9. No model request is started and no frame is cut after the total deadline, 300 s from the slot.

## Revises

SPEC-ADDON-114 I1. For a text video and a profile that can see, the images sent are the kept frames of the frame set and the requested frames of SPEC-ADDON-116, each the frame at the time in its own label, sent in the order of their numbers, only to the `vision_model` of the profile resolved by `resolve(drive, "rag")`; for a profile that cannot see, no image is sent.
SPEC-ADDON-114 I3. The prompt numbers the passages `[1]` to `[P]`, then the kept frames `[P+1]` to `[P+F]` in time order, then the requested frames of SPEC-ADDON-116 in the order sent; every `citations` entry names a number that was sent, with the passage's position for a passage and the frame's time as `position.seconds` for a frame, and no other number appears.
SPEC-ADDON-114 I4. With a profile that can see, a text video always receives a generated answer from its passages when frames cannot be used: no frame prepared, or a refusal of today's request with images (sent first, or as the fallback of SPEC-ADDON-116), each lead to one text-only request with `meta.image` `"unavailable"`, never to `frames_unusable`, `frames_rejected` or `image_unusable`; a refusal never writes the vision-unsupported verdict.
SPEC-ADDON-114 I6. A video question (a text video or a text-less one) with a profile that can see holds exactly one Ask slot from after the material is read until its stream ends, fails or is cancelled; it has at most 4 frame preparations running at once, starts none of the frame set after 45 s from the slot and none at all after a disconnect, sends no model request after a disconnect, has sent the first model request or ended the stream no later than 45 s after the slot was taken, and until the first `answer_chunk`, including during frame requests, a fallback and a text-only retry, no 10 s pass without a byte written to the stream.
SPEC-ADDON-114 I7. Questions, answers, history, tool calls and frame bytes are neither stored nor logged; the only write is the `large` frame cache entry `get_video_frame` also writes.
SPEC-ADDON-114 I8. Pictures, audio, documents, a `.loft` that is not a text video, every request whose profile cannot see, the availability route, the normal Ask with its agentic loop and the MCP tools answer as they did before this change; text-less videos differ only by the request layout of I11 and by SPEC-ADDON-116.
SPEC-ADDON-114 I11. For every video question that sends frames (a text video or a text-less one), each image, initial or requested, is preceded, with nothing else between them, by a text whose whole content is that frame's label `[n] <time>`, the labels run in the order the images are sent, and no prompt text or tool result pairs a number with the time of a frame sent (the position sentence, the contents and a tool result's note that an unused time duplicates `[n]` are not such a pairing); with an OpenAI-compatible profile the labels and images are alternating parts of one user message after the prompt text or the last tool message, and with an ollama profile each label and its one image are a user message of their own.
SPEC-ADDON-108 I2. Each frame sent is the frame at the time in its own label, and goes only to the `vision_model` of the profile resolved by `resolve(drive, "rag")`.
SPEC-ADDON-108 I4. The kept frames are numbered from 1 in time order and the requested frames of SPEC-ADDON-116 on from there in the order sent, each image right after its own label as SPEC-ADDON-114 I11 states; every `citations` entry for a text-less video names a frame number that was sent with that frame's time as `position.seconds`, and no other number appears.
SPEC-ADDON-108 I8. Once the first model request of a question is sent, no frame of the frame set is prepared; a requested frame of SPEC-ADDON-116 is cut only in answer to a served frame request, before the next request is sent; the 45 s first-request bound and the keep-alive of a text-less video are those of SPEC-ADDON-114 I6 as revised by SPEC-ADDON-116.
SPEC-ADDON-108 I7. The frame set's preparations start with the position frame and then in time order; the requested frames of one frame request start in time order; at most 4 run at once in either case.
SPEC-ADDON-071 I1. A question's passages, picture and frames come only from the requested file, an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on, and the only other text sent is the history the request carried and, for a video on the path of SPEC-ADDON-116, its duration, contents, the tool's definition and the tool results; a picture gets at most one image of at most 1024 px on its long edge, and a video gets at most 8 initial frames and 12 requested frames of at most 1280 px when its profile can see.
SPEC-ADDON-053 I1. The LLM receives passages, and for a picture one image, for a video with a profile that can see up to 8 frames plus up to 12 frames it requests (a `.loft` with a text chunk that is not a text video gets no image: its attempt ends in `"unavailable"`), of the requested file only, and only when the file is an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on.

## Checked, no action

- **Sending the representatives in order instead of free times**: rejected by the
  human after the coverage measurement (hako `HFr0HlFYxk00r8ngImKJh`).
- **Change frames (`vec_clip_change`) as the only allowed times**: not needed; a
  frame is cut at any time on demand, as `get_video_frame` does.
- **The normal Ask and the MCP `ask`**: out of scope; an MCP client already has
  `list_video_scenes` and `get_video_frame`.
- **Reusing `app/rag/agentic.py`**: its loop is non-streamed, text-only,
  OpenAI-compatible only, and ends in a parsed JSON answer with file citations;
  this path sends images, serves ollama and cites numbers.
- **Thinking on an OpenAI-compatible profile**: DeepSeek V4.1 Flash called the
  tool without it; a provider option risks the 400 that `_without_rejected_extras`
  exists for.
- **Setting `num_ctx` on ollama requests**: not needed for production, whose
  ollama loads gemma4:e4b with a 32768-token context (app setting, read from the
  server log 2026-11-15). The largest question is about 23k tokens: 20 frames at
  about 450 tokens each (8 frames measured 3,632), passages of 16k characters
  (about 8k), contents (about 2k), thinking up to 4k. A server left at a smaller
  default truncates silently; the docs name the context length to set.
- **A provider that refuses `tools` or `think` on every question**: nothing is
  remembered, so each question costs one refused request before its fallback.
  Accepted; such a profile still answers as today.
- **SPEC-ADDON-108 I5** (no frame but the position frame labelled at the
  position's time): still holds; a requested time within 1 s of the position is
  not used (normal flow 4.3).
- **SPEC-ADDON-108 I9 (`frames_rejected`)**: still holds; a refusal on this path
  falls back to today's request, whose refusal is what yields `frames_rejected`.
- **A frontend change**: none; frame pills already seek, and the stream events
  are the same.
- **Separating what was read from what was inferred in the answer**: a later
  prompt change.
- **Pictures**: one image; nothing more to request.
- **Questions that need very many frames** (a full recipe from a long silent
  cooking video): 12 extra frames may not reach them; the human said such uses are
  not a goal when they cannot be done.
