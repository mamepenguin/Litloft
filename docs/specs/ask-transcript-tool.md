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
deadline of SPEC-ADDON-116. Transcript results are capped at 3,000 characters per call and
6,000 per question. The cap is sized so that the largest question still fits the 32,768-token
context of the production ollama model (section 10).

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
- **Time order**: by span start; at an equal start, a transcript chunk before a frame-text
  row; then file order.
- **Sent row**: a row sent as a passage, or as a requested passage, for the question. A row
  that fitting sent cut short is a sent row; its remainder is not available.
- **Transcript request**: one tool call named `get_transcript`.
- **Tool call**: a frame request (SPEC-ADDON-116) or a transcript request.
- **Requested passage**: a row sent in reply to a transcript request. Requested passages
  are not passages in the sense of SPEC-ADDON-053: they are not chosen by the budget or the
  ranking, and the `Revises` lines below say where they are counted.
- **Transcript result**: the tool result text of a transcript request, all of it: rows,
  number lines, notes and line breaks.

## Required items

### 1. Normal flow

1. The viewer asks about a video. The route takes the frames path as today. When the
   material is cut, the material keeps every row that has a span, with its span, and for
   each sent row its number.
2. When at least one initial frame was prepared and the material is cut:
   - Every tool request offers `get_frames` and `get_transcript`, in that order. The final
     request lists the same two tools with `tool_choice` `"none"` (OpenAI-compatible), or
     no tools (ollama), as SPEC-ADDON-116 does with one.
   - `GET_TRANSCRIPT_TOOL`: name `get_transcript`; parameters an object with `start` and
     `end`, both required strings, "Times in the video, as seconds (83.5) or m:ss
     ("1:23")"; description "Return what is said and shown in this video between two
     times, apart from what you already have."
   - The system prompt changes as follows, only for cut material:
     - The passages rule reads "The passages below are part of the file's text, the parts
       closest to the question; the frames that follow the question are moments of the
       video, in time order after the passages."
     - A rule is added after the get_frames rule: "If the answer may be in a part of the
       video the passages do not include, you must call get_transcript for that part
       before answering, using the times the contents give. Never say that something is
       not said in the video unless you have called get_transcript for the part where it
       would be."
     - The tool section is titled "More frames and text". It states the frame lines of
       SPEC-ADDON-116 I8, with the call limit read as "at most 3 calls of get_frames and
       get_transcript together for this question". It adds that get_transcript returns
       what is said and shown between two times, up to 3,000 characters per call and
       6,000 for the question, that a part already sent is named by its number, and that
       the passages it returns are numbered and cited exactly as the other passages.
   - When the material is not cut, every request is exactly SPEC-ADDON-116's.
3. Tool calls of a reply are handled in the order given. The first 3 tool calls of the
   question, of either name, are served. Each call after them gets the limit result: "No
   frame or text follows: this question has already been served its 3 tool calls."
4. A transcript request is served as follows:
   1. Its arguments must be an object with `start` and `end`, both readable times, and
      `start` below `end`. Otherwise the result is "No text follows: get_transcript takes
      a JSON object with start and end, two times with start before end.", and the call
      counts as served.
   2. When the question's transcript results already total 6,000 characters, the result is
      "No text follows: the 6,000 characters of text for this question are used."
   3. Otherwise the rows whose span overlaps `[start, end)` are walked in time order:
      - A sent row is written as the line "already sent as [n]".
      - Any other row is written as the line `[n]`, then its text, then an empty line,
        with `n` the next number (step 5).
      - The walk stops before the first row whose writing would take the call's result
        past 3,000 characters, or the question's results past 6,000. The result then ends
        with "Text from <the row's start as m:ss> on was not sent: the limit was reached."
        Rows after that point are not looked at.
      - If that first row is the first new row of the call, it is written cut to the room
        left, and the note follows it.
   4. When no row overlaps, the result is "Nothing is said or shown between <start> and
      <end>.", with both times as m:ss.
5. Numbers of a reply are given as its calls are served: the requested passages of its
   transcript requests take the next numbers, in call order and time order. The frames of
   its frame requests take the numbers after those, once they are cut, in call order and
   time order; a frame that fails takes no number. So the tool messages, which come first,
   hold lower numbers than the frame labels that follow them.
6. The next request is a tool request while fewer than 3 tool calls have been served and
   less than 120 s have passed since the slot; otherwise it is the final request.
7. `citations` maps each number to what it was sent with. A requested passage maps to its
   row's position (`{"seconds": <row start>}`), as a passage does.

### 2. Failure cases

- **The material is not cut**: `get_transcript` is not offered. Every request, tool result
  and log line is as in SPEC-ADDON-116.
- **No initial frame prepared, or a profile that cannot see**: there is no tool path. The
  question is answered as today from the passages.
- **A call named neither tool**: when the material is cut, its result is "No frame or text
  follows: <name> cannot be served. Only get_frames (a list of times named times, at most
  4) and get_transcript (start and end) are available.", and it counts as served.
- **A `get_frames` call with bad arguments when the material is cut**: the same text as the
  previous case.
- **A range past the end of the video**: no row overlaps (normal flow 4.4).
- **A tool request, or a final request before its first `answer_chunk`, is refused or
  fails**: the SPEC-ADDON-116 fallback sends today's request once, with the passages only.
- **A final request fails after its first `answer_chunk`, or the total deadline passes**:
  as SPEC-ADDON-116, `meta` then `done` with "Answer generation failed".
- **The viewer closes the tab**: as SPEC-ADDON-116.

### 3. States

The states of SPEC-ADDON-116, with `cutting` read as "serving the tool calls of a reply".
Nothing is kept between questions. A follow-up question starts again from its own
material, and its history carries only earlier answers with their markers removed.

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
  - the second tool, its prompt rules, and the shared limit;
  - `get_frames` calls now share the 3-call limit with `get_transcript` calls.
- Every other file question, the normal Ask, the MCP tools and profiles that cannot see:
  unchanged.
- The Ask slot is held no longer than SPEC-ADDON-116 allows (300 s).

### 8. Error behavior

As SPEC-ADDON-116 for the viewer. Logging:

- Material not cut: the SPEC-ADDON-116 line, unchanged.
- Material cut: once per question that served a tool call, `tool requests: <a> frame
  calls, <b> frames, <c> transcript calls, <d> passages (file <id>)`. Here `a` and `c`
  count served calls by name, an unknown name or bad arguments included under the name
  given (`get_frames` or `get_transcript`). A call of any other name, and a call over the
  limit, is counted in neither. `b` and `d` count the frames and requested passages sent.

No question, answer, tool argument or text is logged.

### 9. User-visible behavior

- On a long video, an answer may cite passages beyond those first sent. Their pills seek
  to the row's start, as passage pills do.
- The "read part of the file" notice stays as today: `partial` is the material's, not
  what the model later read.
- The docs say that on a long video the model may read up to 6,000 more characters of its
  text in ranges it chooses, within the same 3 calls as frames.

### 10. Non-functional

- At most 3 tool calls per question, of either kind. Transcript results at most 3,000
  characters per call and 6,000 per question. Nothing after 300 s from the slot.
- Context, measured on the production gemma4:e4b (2026-11-23): Japanese transcript 1.74
  characters per token, frame text 2.15, English 4.34; a 1280 px frame about 450 tokens
  (SPEC-ADDON-116).
  - Today's largest question: 20 frames (9,000), 16,000 characters of Japanese passages
    (9,200), contents (about 3,000), system prompt and tool definition (about 1,000), plus
    `num_predict` 8,192 for output: about 30,400 of 32,768.
  - With this change, 6,000 characters need at least 2 transcript calls, leaving at most 1
    frame call. Frames are then at most 12 (5,400), transcript results add 6,000
    characters (3,500), and the second tool definition and rules about 300: about 30,600.
    The cap of 6,000 is the largest round figure that keeps 2,000 tokens of margin over
    every mix of calls.
  - The docs keep the 32,768 requirement and say that the extra text counts toward it.
- Privacy and cost: the requested text is the file's own indexed text, sent to the same
  resolved profile under `llm_cloud`, as the passages are.

## Touch points

- `addons/intelligence/app/routers/rag.py`: `_frame_tool_answer`, `_frame_plan` and the
  result texts (`_limit_text`, `_bad_call_text` for cut material), serving
  `get_transcript`, numbering, citations, the log line.
- `addons/intelligence/app/rag/file_question.py`: `load_material` and `Material` keep the
  rows with spans and the sent rows' numbers, when cut.
- `addons/intelligence/app/rag/prompt.py`: `GET_TRANSCRIPT_TOOL`, the system prompt flag
  for cut material.
- `addons/intelligence/app/prompts/rag/file_question_system.jinja2`
- `addons/intelligence/tests/` (acceptance tests for this spec);
  `tests/file_question_vision_doubles.py` if a double must return a `get_transcript` call.
  `tests/test_spec_addon_116_frame_requests.py` is not edited: its videos fit the budget,
  so its log line and requests are unchanged.
- The addon files above are committed in the intelligence addon repository. In the core
  repository, the `addons/intelligence` gitlink moves to the merged addon commit.
- `docs/addons/intelligence.md`, `docs/reference/api.md`, `docs/user-guide/search.md` (the
  sentence on the model looking at up to 12 more moments)
- `docs/specs/INDEX.md`
- Rules passed through:
  - `.claude/rules/design-decisions.md` (LLM features: every call through
    `resolve(drive, feature)`; nothing sent off-host unless `llm_cloud` allows it).
  - `.claude/rules/backend-conventions.md` (no language-dependent rules).

## Invariants

I1. With cut material, every tool request offers exactly `get_frames` and `get_transcript` and its system prompt carries the cut-material rules of normal flow step 2; with material that is not cut, every request, tool result and log line on the path is byte for byte SPEC-ADDON-116's.
I2. At most 3 tool calls per question are served, counting `get_frames` and `get_transcript` together; a request is a final request once 3 have been served or 120 s have passed since the slot was taken, and no request after a final request offers a tool.
I3. A transcript request sends only rows of the requested file's material whose span overlaps its range, in time order, never a sent row (which it names as "already sent as [n]"); its result is at most 3,000 characters and the question's transcript results at most 6,000, and it sends no row after the first one that does not fit.
I4. Numbers run without a gap: passages `[1]`–`[P]`, initial frames `[P+1]`–`[P+F]`, then for each reply its requested passages followed by its cut frames; every `citations` entry names a number that was sent, with a passage's or requested passage's row position, or a frame's time as `position.seconds`, and no other number appears.
I5. A transcript result pairs no number with a time.
I6. `meta.partial` is the material's `partial`, whatever the model requested afterwards.
I7. A refusal or failure of a tool request, or of a final request before its first `answer_chunk`, is followed by exactly one request identical to today's request, with the passages only; a failure after the first `answer_chunk`, or the total deadline, ends the question as failed, and no request is started after the total deadline.
I8. Nothing is written by a transcript request, and no question, answer, tool argument or requested text is logged.

## Revises

SPEC-ADDON-116 I2. At most 3 tool calls per question are served, counting frame requests and SPEC-ADDON-174 transcript requests together; a request is a final request once 3 have been served or 120 s have passed since the slot was taken, and no request after a final request offers the tool.
SPEC-ADDON-116 I3. Numbers run without a gap: passages `[1]`–`[P]`, initial frames `[P+1]`–`[P+F]`, then for each reply its SPEC-ADDON-174 requested passages followed by its requested frames; every `citations` entry names a number that was sent, with a passage's or requested passage's row position, or a frame's time as `position.seconds`, and no other number appears.
SPEC-ADDON-114 I3. The prompt numbers the passages `[1]` to `[P]`, then the kept frames `[P+1]` to `[P+F]` in time order, then the requested passages and requested frames of SPEC-ADDON-116 and SPEC-ADDON-174 in the order SPEC-ADDON-174 I4 states; every `citations` entry names a number that was sent, with the passage's or requested passage's position, or the frame's time as `position.seconds` for a frame, and no other number appears.
SPEC-ADDON-171 I3. Ask numbers the passages it sends consecutively in file order, frames follow from that count, SPEC-ADDON-174 requested passages and requested frames follow as SPEC-ADDON-174 I4 states, and every `citations` entry names a number that was sent, with that passage's position.
SPEC-ADDON-053 I3. Every entry of the `citations` event names a number that was sent: a chunk number with that chunk's position, a frame number (after the chunk numbers for a video with a text chunk, from 1 for a video with none) with that frame's time, or a SPEC-ADDON-174 requested passage's number with its row's position; a number that was not sent never appears.
SPEC-ADDON-053 I2. When the file's chunk text, after a video's repeated frame-text lines are removed as SPEC-ADDON-171 states, totals at most the passage budget (`rag.file_question_max_chars` minus the characters of the history turns sent), all chunks are sent in file order and `partial` is false; otherwise the passages total at most the passage budget, chosen by the ranking and fitting rule of 053 step 4 with the ranking text of SPEC-ADDON-081 step 5, sent in file order, and `partial` is true; SPEC-ADDON-174 requested passages are not counted in that budget and are bounded by their own caps.
SPEC-ADDON-081 I2. For one question, the kept turns' sizes (question plus answer after marker removal and cutting) total at most half of `rag.file_question_max_chars` rounded down, turns and passages together at most `rag.file_question_max_chars` (SPEC-ADDON-174 requested passages are bounded by their own caps), a kept turn is never older than a dropped one, and no `\[\d{1,3}\]` marker from an earlier answer reaches the model.
SPEC-ADDON-114 I2. The passages sent for a text video are the same, by budget and ranking, whether frames are attached, none could be prepared, or the request is retried after a refusal; SPEC-ADDON-174 requested passages are sent only on the tool path and never in a retry.
SPEC-ADDON-071 I4. The passages sent for a question are the same, by the budget and ranking of SPEC-ADDON-053, whether or not an image is attached, and the text-only retry sends those same passages and no SPEC-ADDON-174 requested passage.
SPEC-ADDON-071 I1. A question's passages, picture and frames come only from the requested file, an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on, and the only other text sent is the history the request carried and, for a video on the path of SPEC-ADDON-116, its duration, contents, the definitions of its tools (`get_frames`, and `get_transcript` under SPEC-ADDON-174) and the tool results, whose requested passages are rows of the same file; a picture gets at most one image of at most 1024 px on its long edge, and a video gets at most 8 initial frames and 12 requested frames of at most 1280 px when its profile can see.

## Checked, no action

- **Approved chapters as an overview.** Only 77 of the 464 over-budget videos have chapters
  (76 extracted from the file, 1 curated), and the contents list already gives every video
  a section overview.
- **Hybrid (vector plus keyword) ranking of the passages.** It is a separate change, to be
  decided once this one's effect is seen.
- **Offering `get_transcript` when the material is not cut.** The whole text is already
  sent, so the tool can return nothing new.
- **A separate 3-call limit for transcript requests.** Each round is a model call, 5–50 s
  with the production model; a shared limit keeps the question within its 120 s window,
  and it is what keeps the context within section 10's figures.
- **Writing each passage's time in the prompt**, so the model sees which ranges it has.
  SPEC-ADDON-114 I11 keeps number–time pairs out of the prompt because gemma confuses them;
  "already sent as [n]" tells the model what it has instead.
- **SPEC-ADDON-116 I8 (the frame lines of the system prompt).** Those lines are kept; with
  cut material only the call-limit wording is widened to both tools, and the frame-only
  wording is unchanged when the material is not cut. SPEC-ADDON-116 I7 (a tool result names
  no frame number except an unused time's duplicate) concerns frame request results, which
  are unchanged.
- **Profiles that cannot see.** They have no tool path today. Giving them one is a separate
  change.
- **The normal (cross-file) Ask.** It is not built from one file's material.
