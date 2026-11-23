# Ask about a video lets the model read a time range the passages left out

SPEC-ID: SPEC-ADDON-174

Approval:

## Summary

A question about one video in the file Ask tab sends the file's text (transcript chunks
and frame text) whole when it fits `rag.file_question_max_chars`. Otherwise only the chunks
closest to the question are sent, and the answer says it read part of the file
(`partial`). After SPEC-ADDON-171, 464 production videos still exceed the budget
(2026-11-23). Only 77 of them have chapters, so a chapter overview would not reach most.

A question on that path, answered by a profile that can see, already offers the model
`get_frames` (SPEC-ADDON-116), with a table of contents of the video's sections. This change
offers a second tool beside it, `get_transcript`, but only when the passages were cut by the
budget. The model names a time range, typically a section from the contents, and gets the
file's text in that range that was not already sent, numbered and citable like the other
passages. Calls of both tools share the 3-call limit, the 120 s window and the 300 s
deadline of SPEC-ADDON-116. The text is capped at 4,000 characters per call and 8,000 per
question.

It is for the viewer asking about a long video, whose question today is answered from the
chunks that ranked highest and cannot reach the rest.

## Terms

The terms of SPEC-ADDON-116 apply (frames path, today's request, tool request, final
request, contents, readable time, total deadline). In addition:

- **Cut material**: the question's material has `partial` true. All of the file's rows
  (SPEC-ADDON-053 step 3, frame-text rows filtered by SPEC-ADDON-171) were read, and only
  some were sent as passages.
- **Row span**: a transcript chunk's is `[timestamp_start, timestamp_end)`. A frame-text
  row's is its segment's `[start_time, end_time)`. A row with no end has its start alone.
  A row of any other kind has no span and is never returned by the tool.
- **Overlaps `[a, b)`**: a span overlaps when it starts before `b` and ends after `a`. A
  start alone overlaps when it is in `[a, b)`. This is the rule the contents already use.
- **Transcript request**: one tool call named `get_transcript`.
- **Tool call**: a frame request (SPEC-ADDON-116) or a transcript request.
- **Requested passage**: a row sent in reply to a transcript request.

## Required items

### 1. Normal flow

1. The viewer asks about a video. The route takes the frames path as today. When the
   material is cut, the material also keeps every row with a span that was not sent, in
   file order.
2. When at least one initial frame was prepared and the material is cut, the first tool
   request offers both `get_frames` and `get_transcript`. The system prompt says this:
   - The passages are only part of the file's text.
   - `get_transcript` returns what is said and shown in a time range: up to 4,000
     characters per call, 8,000 per question, within the same 3 calls as `get_frames`.
   - It is to be called when the answer may lie in a part of the video the passages do
     not cover, and the user is never asked for times.
   - Requested passages are numbered and cited as the other passages are.

   When the material is not cut, the request is exactly SPEC-ADDON-116's.
3. Tool calls of a reply are handled in the order given. The first 3 tool calls of the
   question, of either name, are served. Each call after them gets a tool result saying
   the limit is reached.
4. A transcript request is served as follows:
   1. Its arguments must be an object with `start` and `end`, both readable times, and
      `start` below `end`. Otherwise the tool result says so, and the call counts as
      served.
   2. The rows whose span overlaps `[start, end)` are taken in file order.
   3. A row already sent for the question, as a passage or a requested passage, is not
      sent again. The tool result names it: "already sent as [n]".
   4. The other rows are added in file order while the call's total stays within 4,000
      characters and the question's total within 8,000. The first row that does not fit
      stops the call. The tool result says text from `<its start as m:ss>` on was not sent
      because of the limit.
   5. The tool result holds each added row as `[n]` on its own line, followed by the
      row's text, as passages are written in the prompt. `n` runs on from the last number
      sent for the question. When no row overlaps, the result says nothing is said or
      shown in that range.
5. A frame request is served as SPEC-ADDON-116 serves it. Numbers are taken in call order:
   - a transcript request's passages take the next numbers when its tool result is built;
   - a frame request's frames take the next numbers in time order.

   The frames of all calls of a reply then follow the tool messages, each after its own
   label, as today.
6. The next request is a tool request while fewer than 3 tool calls have been served and
   less than 120 s have passed since the slot; otherwise it is the final request, as in
   SPEC-ADDON-116.
7. `citations` maps each number to what it was sent with. A requested passage maps to its
   row's position (`{"seconds": <row start>}`), as a passage does.

### 2. Failure cases

- **The material is not cut**: `get_transcript` is not offered. Every request is as in
  SPEC-ADDON-116.
- **No initial frame prepared, or a profile that cannot see**: there is no tool path. The
  question is answered as today from the passages.
- **A call named neither `get_frames` nor `get_transcript`**: its tool result says so,
  and it counts as served.
- **A `get_transcript` call when the tool was not offered**: treated as a call of an
  unknown name.
- **Unreadable times, or `start` not below `end`**: the tool result says so, and the call
  counts as served.
- **A range past the end of the video**: no row overlaps, and the tool result says
  nothing is in that range.
- **Any refusal or failure of a tool or final request**: the SPEC-ADDON-116 fallback, which
  sends today's request once.
- **The viewer closes the tab, or the total deadline passes**: as SPEC-ADDON-116.

### 3. States

The states of SPEC-ADDON-116, with `cutting` read as "serving the tool calls of a reply".
Nothing is kept between questions. A follow-up question starts again from its own
material.

### 4. Data read and written

- Read: the rows `load_material` already reads, plus `timestamp_end` of transcript chunks
  and `end_time` of frame-text rows for the spans. No other store.
- Written: nothing beyond SPEC-ADDON-116's frame cache entries.

### 5. External services

The routed profile's model, as SPEC-ADDON-116. The request count is unchanged: at most 3
tool requests, 1 final request and the fallback. A transcript request reads only the
question's own material and calls nothing.

### 6. Authorization

Unchanged. A requested passage is a row of the requested file only, from the material that
the file Ask route's checks already admitted.

### 7. Effect on existing features

- File Ask on a video with cut material and a profile that can see:
  - the second tool and its system prompt sentences are added;
  - `get_frames` calls now share the 3-call limit with `get_transcript` calls.
- Every other file question, the normal Ask, the MCP tools and profiles that cannot see:
  unchanged.
- The Ask slot is held no longer than SPEC-ADDON-116 allows (300 s).

### 8. Error behavior

As SPEC-ADDON-116. The per-question log line also counts transcript requests:
`tool requests: <frame calls> frame calls, <frames> frames, <transcript calls> transcript
calls, <passages> passages (file <id>)`. No question, answer, tool argument or text is
logged.

### 9. User-visible behavior

- On a long video, an answer may cite passages beyond those first sent. Their pills seek
  to the row's start, as passage pills do.
- The "read part of the file" notice stays as today: `partial` is the material's, not
  what the model later read.
- The docs say the model may read up to 8,000 more characters of a long video's text, in
  ranges it chooses.

### 10. Non-functional

- At most 3 tool calls per question, of either kind. At most 4,000 characters of requested
  passages per call and 8,000 per question. Nothing after 300 s from the slot.
- Context: SPEC-ADDON-116 already asks an ollama server for a context length of at least
  32768. The 8,000 characters are on top of the passages (at most
  `rag.file_question_max_chars`, 16,000 by default), so the docs keep that requirement and
  say the additional text counts toward it.
- Privacy and cost: the requested text is the file's own indexed text, sent to the same
  resolved profile under `llm_cloud`, as the passages are.

## Touch points

- `addons/intelligence/app/routers/rag.py`: `_frame_tool_answer` and its helpers (the call
  limit, serving `get_transcript`, numbering, tool results, citations, the log line).
- `addons/intelligence/app/rag/file_question.py`: `Material` keeps the rows not sent and
  their spans, when cut.
- `addons/intelligence/app/rag/prompt.py`: `GET_TRANSCRIPT_TOOL`, the system prompt flag
  for it.
- `addons/intelligence/app/prompts/rag/file_question_system.jinja2`
- `addons/intelligence/tests/` (acceptance tests for this spec)
- The addon files above are committed in the intelligence addon repository. In the core
  repository, the `addons/intelligence` gitlink moves to the merged addon commit.
- `docs/addons/intelligence.md`, `docs/reference/api.md`
- `docs/specs/INDEX.md`
- Rules passed through:
  - `.claude/rules/design-decisions.md` (LLM features: every call through
    `resolve(drive, feature)`; nothing sent off-host unless `llm_cloud` allows it).
  - `.claude/rules/backend-conventions.md` (no language-dependent rules).

## Invariants

I1. `get_transcript` is offered exactly on tool requests of a question whose material is cut; with material that is not cut, every request on the path is byte for byte SPEC-ADDON-116's.
I2. At most 3 tool calls per question are served, counting `get_frames` and `get_transcript` together; a request is a final request once 3 have been served or 120 s have passed since the slot was taken, and no request after a final request offers a tool.
I3. A transcript request sends only rows of the requested file's material whose span overlaps its range, never a row already sent for the question, in file order, at most 4,000 characters for the call and 8,000 for the question, and stops at the first row that does not fit.
I4. Numbers run without a gap: passages `[1]`–`[P]`, initial frames, then requested passages and requested frames in the order their calls were served; every `citations` entry names a number that was sent, with a passage's or requested passage's row position, or a frame's time as `position.seconds`, and no other number appears.
I5. A tool result names a number only as a row it sends or a row already sent; it pairs no number with a time.
I6. `meta.partial` is the material's `partial`, whatever the model requested afterwards.
I7. Any refusal or failure on the path is followed by the SPEC-ADDON-116 fallback, exactly one request identical to today's request; no request is started after the total deadline.
I8. Nothing is written by a transcript request, and no question, answer, tool argument or requested text is logged.

## Revises

SPEC-ADDON-116 I2. At most 3 tool calls per question are served, counting frame requests and SPEC-ADDON-174 transcript requests together; a request is a final request once 3 have been served or 120 s have passed since the slot was taken, and no request after a final request offers the tool.
SPEC-ADDON-116 I3. Numbers run without a gap: passages `[1]`–`[P]`, initial frames `[P+1]`–`[P+F]`, then requested frames and SPEC-ADDON-174 requested passages in the order their calls were served; every `citations` entry names a number that was sent, with the passage's or requested passage's position or the frame's time as `position.seconds`, and no other number appears.

## Checked, no action

- **Approved chapters as an overview.** Only 77 of the 464 over-budget videos have chapters
  (76 extracted from the file, 1 curated), and the contents list already gives every video
  a section overview.
- **Hybrid (vector plus keyword) ranking of the passages.** It is a separate change, to be
  decided once this one's effect is seen.
- **Offering `get_transcript` when the material is not cut.** The whole text is already
  sent, so the tool can return nothing new; offering it would only add a choice the model
  can misuse.
- **A separate 3-call limit for transcript requests.** Each round is a model call, which
  takes 5–50 s with the production model; a shared limit keeps the question within the 120 s
  window it already has.
- **Writing each passage's time in the prompt**, so the model sees which ranges it has.
  SPEC-ADDON-114 I11 keeps number–time pairs out of the prompt because gemma confuses them;
  the tool result's "already sent as [n]" tells the model what it has instead.
- **Profiles that cannot see.** They have no tool path today. Giving them one is a separate
  change.
- **The normal (cross-file) Ask.** It is not built from one file's material.
