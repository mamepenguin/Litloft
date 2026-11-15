# Ask about a video lets the model ask for more frames

SPEC-ID: SPEC-ADDON-116

Approval:

## Summary

A question about one video in the file Ask tab, answered by a profile that can
see, now offers the model a tool, `get_frames`, with which it asks for the frames
at times it chooses, after it has read what SPEC-ADDON-114 sends today (the
passages and up to 8 frames). With the question it also gets a table of contents
of the video: the sections of the SPEC-ADDON-112 navigation list, each with its
time range and the start of what is said and shown in it. The model may call the
tool at most 3 times, for at most 4 frames each; the frames are cut on demand,
like `get_video_frame`'s, and are labelled and numbered as the first frames are,
so the answer can cite them. After the third call, or when time runs out, the
model is asked once more without the tool and must answer. A profile on ollama
gets thinking turned on for these requests, because the production local model
(gemma4:e4b) did not call the tool without it. The work is for the viewer asking
about something the 8 frames missed: measured on 14 sample videos, the
representative frames are like (CLIP cosine ≥ 0.85) only 37–54% of the other
moments of home videos, anime and vlogs, and the signs and panels a question asks
about are among what they miss. The normal (cross-file) Ask, the MCP tools,
pictures, audio, documents and every profile that cannot see are unchanged.

## Terms

- **Frames path**: the SPEC-ADDON-114 / SPEC-ADDON-108 path a video question takes
  today when its profile can see: a text video with its passages and the frame set,
  or a text-less video with the frame set alone.
- **Initial frames**: the kept frames of the frame set (SPEC-ADDON-114 Terms),
  numbered `[P+1]` to `[P+F]` as today.
- **Contents**: the navigation list of `select_scenes` over `[0, duration)` for the
  file (`load_selection_inputs`), at most 40 sections, each written as one line
  `<start>–<end> <excerpt>` with times as `m:ss` or `h:mm:ss`. The excerpt is the
  text of the file's `transcript_chunks` and `video_frame_texts` rows whose span
  overlaps the section, in time order, whitespace collapsed to single spaces, cut
  at 120 characters; a section with no such text has no excerpt. The lines carry
  no bracketed number. A file whose selection is empty or fails has no contents.
- **Frame request**: one `get_frames` tool call. Its one argument, `times`, is a
  list of times, each a number of seconds or a string `m:ss` / `h:mm:ss`
  (fractional seconds allowed).
- **Requested frame**: a frame cut at a time of a frame request and sent back.

## Required items

### 1. Normal flow

1. The viewer asks a question about a video in the file Ask tab. The route takes
   the frames path exactly as today: passages selected before the slot, one Ask
   slot, the frame set prepared under it.
2. The first model request is today's request with the initial frames
   (SPEC-ADDON-114 I11 layout), plus: the contents, the video's duration when it
   is known, and the `get_frames` tool. It goes, as today, to the profile's
   `vision_model`. For an ollama profile it is sent with thinking on.
3. The reply is streamed. Text deltas are written as `answer_chunk` events as they
   arrive, as today. If the reply ends without a tool call, its text is the answer
   and the stream ends as today (`citations`, `meta`, `done`).
4. If the reply ends with frame requests, each is handled in order, while fewer
   than 3 have been handled for this question:
   1. Its times are read, in the order given. A time that cannot be read, that is
      negative, or that is past the known duration is reported as not usable. A
      time within 1 s of a frame already sent for this question is reported as
      already sent, with that frame's number. Only the first 4 remaining times are
      used; the rest are reported as over the limit.
   2. The frames at those times are cut as the frame set's are (the `large` frame,
      from the cache or ffmpeg / the YouTube frame route, at most 4 at once, 15 s
      each). One that fails is reported as not available and is not replaced.
   3. The tool result, a text, lists the frames that follow as `[n] <time>` and the
      times reported in 4.1 and 4.2 with their reason. Then come the cut frames in
      time order, numbered on from the last number sent for this question, each
      with its label right before its image, in the SPEC-ADDON-114 I11 layout
      (OpenAI-compatible: one user message of alternating label and image parts
      after the tool message; ollama: one user message per label and image).
   A frame request after the third gets a tool result saying the limit is reached,
   and no frame.
5. The next request carries the whole exchange so far. It offers the tool while
   fewer than 3 frame requests have been handled and less than 120 s have passed
   since the slot was taken; otherwise it offers none (OpenAI-compatible:
   `tool_choice` `"none"`; ollama: no `tools`), and its reply is the answer.
   Steps 3 to 5 repeat.
6. `citations` maps each number to what it was sent with: a passage to its
   position, an initial or requested frame to `{"seconds": <its time>}`.
   `meta.image` is `"attached"` whenever at least one frame was sent.

### 2. Failure cases

- **The first request is refused** (`ImageRejected`, which a provider that does
  not take tools or thinking also produces): the same request is sent once more
  without the tool, without the contents and without thinking, which is exactly
  today's request; from there SPEC-ADDON-114 / SPEC-ADDON-108 handle it, including
  their own refusal handling. No vision-unsupported verdict is written. Log
  `frame_tool_refused`.
- **A later request is refused or fails** after frames were requested: the stream
  ends as a failed generation (`done` with `"Answer generation failed"`), with
  `meta.image` `"attached"`; text already streamed stays.
- **A tool call that is not `get_frames`, or whose arguments are not an object
  with a `times` list**: the tool result says so; it counts as a frame request.
- **No time of a frame request gives a frame**: the tool result lists why; it
  counts.
- **The final request (no tool) replies with a tool call and no text**, or any
  reply leaves the answer empty: `done` with `"Answer generation failed"`, as for
  an empty answer today.
- **The viewer closes the tab**: as today, the model stream and any frame
  preparation stop; no further request is sent.
- **No initial frame was sent** (none chosen or none prepared): the question goes
  as today (text-only request, or `frames_unusable` for a text-less video) and
  no tool is offered.
- **No contents** (no selection yet, selection failed): the request has no
  contents; the tool is still offered.
- **Duration unknown** (a YouTube `.loft` with no duration): no time is reported
  past the duration; a time with no frame is reported as not available.

### 3. States

None kept: each question starts with no requested frame. A follow-up question
(history) starts again from the initial frames; frames requested for an earlier
turn are not sent again.

### 4. Data read and written

- Read: `transcript_chunks` and `video_frame_texts` for the contents excerpts; the
  rows `load_selection_inputs` reads; the video file or its YouTube source for the
  cut frames.
- Written: the `large` frame cache entries, which `get_video_frame` also writes.
  Nothing else; questions, answers, tool calls and frame bytes are neither stored
  nor logged.

### 5. External services

The routed profile's model (OpenAI-compatible or ollama), up to 4 requests per
question (1 + 3 frame requests; the forced final answer is one of them or one
more). Each request has the client's own timeout. The 120 s limit stops further
frame requests, not a request in flight. A YouTube frame goes through the existing
frame route.

### 6. Authorization

Unchanged: the file Ask route's (`X-Lit-Drive`, drive access, `rag` feature,
`llm_cloud` through `resolve(drive, "rag")`). A requested frame is a frame of the
requested file only.

### 7. Effect on existing features

- File Ask on a video with a profile that can see: the tool, the contents and
  thinking (ollama) are added; the initial frames and passages are as today.
- The normal Ask, including its agentic loop (`app/rag/agentic.py`), the MCP `ask`,
  `list_video_scenes` and `get_video_frame`: unchanged.
- Every request whose profile cannot see, pictures, audio, documents, a `.loft` that
  is not a text video: unchanged.
- The frame cache gains entries at the requested times.

### 8. Error behavior

As in SPEC-ADDON-114 for the viewer. Logged: `frame_tool_refused (file <id>)` on a
refused first request; one line per question that handled a frame request,
`frame requests: <count> calls, <count> frames (file <id>)`. No question, answer,
time list or frame bytes are logged.

### 9. User-visible behavior

- An answer may cite frames beyond the first 8; their pills seek to their times as
  frame pills do today.
- An answer that needs more frames takes longer: on the measured models, 1–7 s per
  frame request with DeepSeek V4.1 Flash, 5–12 s with gemma4:e4b with thinking.
  Until the first `answer_chunk`, `: keepalive` is written so that no 10 s pass
  without a byte.
- Text the model writes before calling the tool is part of the answer, streamed as
  it arrives (see the question for the human).
- The docs say the model may look at up to 12 more frames of the video.

### 10. Non-functional

- At most 12 requested frames, 4 per request, 3 requests; at most 4 model requests
  carrying the tool, plus the one refusal retry.
- No frame request is offered after 120 s from the slot.
- Cost (measured, OpenRouter): $0.001–0.004 per question with DeepSeek V4.1 Flash.
- Contents: at most 40 lines of at most 120 characters of excerpt; outside the
  passage budget.
- Privacy: as SPEC-ADDON-114; frames go only to the resolved profile.

## Touch points

- `addons/intelligence/app/routers/rag.py`: `_frames_question_stream` (the loop,
  refusal retry, keep-alive, citations, meta), `_text_only_answer` unchanged.
- `addons/intelligence/app/rag/file_question.py`: contents builder, time parsing,
  cutting requested frames (reusing `_frame_image` and the preparation limits).
- `addons/intelligence/app/llm.py`: `LLMClient` and `OllamaLLMClient` gain a
  streamed request over a message list with images and an optional tool, which
  reports tool calls at the end of the stream; ollama with `think` on and its
  thinking text never yielded.
- `addons/intelligence/app/rag/prompt.py`,
  `addons/intelligence/app/prompts/rag/file_question_system.jinja2`,
  `addons/intelligence/app/prompts/rag/file_question_user.jinja2`: contents,
  duration, tool instructions.
- Tests whose single-request expectation changes: the SPEC-ADDON-108 and
  SPEC-ADDON-114 frames-path tests that assert the request's arguments or count
  (`tests/test_spec_addon_108_*`, `tests/test_spec_addon_114_*`, the 071 / 072 /
  077 frames-path tests); they are rewritten to this spec where the tool changes
  what they assert.
- `tests/test_llm_caller_inventory.py` if the new client method is a new caller.
- `docs/addons/intelligence.md`, `docs/user-guide/search.md`,
  `docs/reference/api.md` (the file Ask row).
- Rules passed through: `.claude/rules/design-decisions.md` (LLM features: one
  routed client, citations only to what was sent, `llm_cloud`),
  `.claude/rules/backend-conventions.md` (no language-dependent rules).
- No protected path.

## Invariants

I1. For a video question with a profile that can see, every image sent is either an initial frame or a requested frame of the requested file, each the frame at the time in its own label, sent only to the `vision_model` of the profile resolved by `resolve(drive, "rag")`; no more than 12 requested frames are sent per question, no more than 4 per frame request, and none within 1 s of a frame already sent for the question.

I2. At most 3 frame requests are answered with frames per question; a request is sent without the tool once 3 have been handled or 120 s have passed since the slot was taken, and the reply to a request without the tool is the answer.

I3. Numbers run without a gap: passages `[1]`–`[P]`, initial frames `[P+1]`–`[P+F]`, then requested frames in the order sent; every `citations` entry names a number that was sent, with the passage's position or the frame's time as `position.seconds`, and no other number appears.

I4. A refusal of the first request is followed by exactly one request identical to the SPEC-ADDON-114 / SPEC-ADDON-108 request for the same question (no tool, no contents, no thinking), and never writes the vision-unsupported verdict.

I5. An ollama profile's requests on this path are sent with thinking on, and no thinking text appears in any `answer_chunk`; an OpenAI-compatible profile's requests carry no thinking option they did not carry before.

I6. Each requested frame is introduced by its own label `[n] <time>` immediately before its image, in the SPEC-ADDON-114 I11 layout, and the tool result that precedes them lists the same labels.

I7. The contents list no more than 40 sections in time order with no bracketed number, each excerpt no longer than 120 characters and drawn only from the requested file's transcript and frame text in that section's span.

I8. The question holds exactly one Ask slot until its stream ends, fails or is cancelled; after a disconnect no further model request is sent and no further frame is cut; until the first `answer_chunk` no 10 s pass without a byte written to the stream.

I9. Questions, answers, tool calls and frame bytes are neither stored nor logged; the only write is the `large` frame cache entry `get_video_frame` also writes.

I10. Requests whose profile cannot see, pictures, audio, documents, a `.loft` that is not a text video, the availability route, the normal Ask with its agentic loop and the MCP tools behave as they did before this change.

## Revises

SPEC-ADDON-114 I1. For a text video and a profile that can see, the images sent are the kept frames of the frame set and the requested frames of SPEC-ADDON-116, each the frame at the time in its own label, sent in the order of their numbers, only to the `vision_model` of the profile resolved by `resolve(drive, "rag")`; for a profile that cannot see, no image is sent.
SPEC-ADDON-114 I3. The prompt numbers the passages `[1]` to `[P]`, then the kept frames `[P+1]` to `[P+F]` in time order, then the requested frames of SPEC-ADDON-116 in the order sent; every `citations` entry names a number that was sent, with the passage's position for a passage and the frame's time as `position.seconds` for a frame, and no other number appears.
SPEC-ADDON-114 I6. A text-video question with a profile that can see holds exactly one Ask slot from after the material is read until its stream ends, fails or is cancelled; it has at most 4 frame preparations running at once, starts none of the frame set after 45 s from the slot or any after a disconnect, has sent the first model request or ended the stream no later than 45 s after the slot was taken, and until the first `answer_chunk`, including during a text-only retry and frame requests, no 10 s pass without a byte written to the stream.
SPEC-ADDON-114 I8. Pictures, audio, documents, a `.loft` that is not a text video, every request whose profile cannot see, the availability route and the normal Ask answer as they did before this change; text-less videos differ only by the request layout of I11 and by SPEC-ADDON-116.
SPEC-ADDON-114 I11. For every video question that sends frames (a text video or a text-less one), each image, initial or requested, is preceded, with nothing else between them, by a text whose whole content is that frame's label `[n] <time>`, the labels run in the order the images are sent, and the prompt text before the first label has no list or line pairing a frame number with a time (the position sentence and the contents, which carry no number, are not one); with an OpenAI-compatible profile the labels and images are alternating parts of one user message after the prompt text or the tool message, and with an ollama profile each label and its one image are a user message of their own.
SPEC-ADDON-108 I4. The kept frames are numbered from 1 in time order and the requested frames of SPEC-ADDON-116 on from there in the order sent, each image right after its own label as SPEC-ADDON-114 I11 states; every `citations` entry for a text-less video names a frame number that was sent with that frame's time as `position.seconds`, and no other number appears.
SPEC-ADDON-071 I1. A question's passages, picture and frames come only from the requested file, an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on, and the only other text sent is the history the request carried and, for a video, its contents; a picture gets at most one image of at most 1024 px on its long edge, and a video gets at most 8 initial frames and 12 requested frames of at most 1280 px when its profile can see.
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
  this path streams, sends images, serves ollama and cites numbers.
- **Thinking on an OpenAI-compatible profile**: DeepSeek V4.1 Flash called the
  tool without it; adding a provider option risks the 400 that
  `_without_rejected_extras` exists for.
- **Showing the requested times in the UI beyond the citation pills**: no frontend
  change; the pills already seek.
- **Separating what was read from what was inferred in the answer**: a later
  prompt change, not this one.
- **Pictures**: a picture is one image; there is nothing more to request.
- **Questions that need very many frames** (a full recipe from a long silent
  cooking video): 12 extra frames may not reach them; the human said such uses are
  not a goal when they cannot be done.
