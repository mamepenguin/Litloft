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
deadline of SPEC-ADDON-116. A transcript result is at most 3,000 characters. The 3-call
limit keeps the largest question within the 32,768-token context of the production ollama
model (section 10).

It is for the viewer asking about a long video, whose question today is answered from the
chunks that ranked highest and cannot reach the rest.

## Terms

The terms of SPEC-ADDON-116 apply (frames path, today's request, tool request, final
request, contents, readable time, total deadline). In addition:

- **Cut material**: the question's material has `partial` true. All of the file's rows
  (SPEC-ADDON-053 step 3, frame-text rows filtered by SPEC-ADDON-171) were read, and only
  some were sent as passages. The material also keeps each frame-text row's stored text,
  before SPEC-ADDON-171's filter, including rows the filter removed whole.
- **First segment of a range**: of the frame-text rows whose span overlaps the range, rows
  the filter removed whole included, those of every segment with the smallest
  `start_time`. The result gives them with their stored text, so it shows everything on
  screen at the range's first segment. Every later frame-text row of the range keeps its
  SPEC-ADDON-171 text, and one the filter removed whole is skipped: it takes no number and
  no room.
- **Removed parts** of a frame-text row: the `\n`-parts of its stored text that the
  SPEC-ADDON-171 filter removed, in their order. A part cut off by fitting is not a removed
  part.
- **Row span**: a transcript chunk's is `[timestamp_start, timestamp_end)`. A frame-text
  row's is its segment's `[start_time, end_time)`. A row with no end has its start alone.
  A row of any other kind has no span and is never returned by the tool.
- **Overlaps `[a, b)`**: a span overlaps when it starts before `b` and ends after `a`. A
  start alone overlaps when it is in `[a, b)`. This is the rule the contents already use.
- **Time order**: by span start; at an equal start, a transcript chunk before a frame-text
  row; then file order.
- **Sent row**: a row sent as a passage, or as a requested passage, for the question. A row
  that fitting (SPEC-ADDON-053 step 4) sent cut short is a sent row; its remainder is not
  available. The tool never cuts a row.
- **Transcript request**: one tool call named `get_transcript`.
- **Tool call**: a frame request (SPEC-ADDON-116) or a transcript request.
- **Requested passage**: a row sent in reply to a transcript request. Requested passages
  are not passages in the sense of SPEC-ADDON-053: they are not chosen by the budget or the
  ranking, and the `Revises` lines below say where they are counted.
- **Transcript result**: the tool result text of a transcript request, all of it: rows,
  number lines, notes and line breaks.
- **Clock time**: a time written as the contents write it (`format_position`: `m:ss` under
  an hour, `h:mm:ss` from an hour on).

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
     - The opening sentence names "the numbered passages below, the numbered passages
       get_transcript returns, and the numbered frames that follow the question" as what
       the answer uses; with history, the sentence on what may be cited names the same
       three.
     - The passages rule reads "The passages below are part of the file's text, the parts
       closest to the question; the frames that follow the question are moments of the
       video, in time order after the passages."
     - A rule is added after the get_frames rule: "If the answer may be in a part of the
       video the passages do not include, you must call get_transcript for that part
       before answering, using the times the contents give. Never say that something is
       not said in the video unless you have called get_transcript for the part where it
       would be."
     - The tool section is titled "More frames and text:" and reads, line for line:
       "- The frames you are given are a sample of the video, not all of it, and the
       passages are part of its text, not all of it."; "- The tool get_frames returns
       frames of this video at the times you give it: up to 4 times per call."; "- The tool
       get_transcript returns what is said and shown in this video between two times, up
       to 3,000 characters per call; a part you already have is named by its number
       instead."; "- You may make at most 3 calls of get_frames and get_transcript
       together for this question."; "- Call get_frames when the answer depends on what
       is shown at moments the frames you have do not show, and get_transcript when it
       may be said or shown in a part the passages do not include."; "- Never ask the
       viewer for times; choose them yourself from the times the prompt gives you.";
       "- The frames and passages these tools return are numbered and cited exactly as
       the ones you already have: [n], right after the sentence they support."
   - When the material is not cut, every request is exactly SPEC-ADDON-116's.
3. Tool calls of a reply are handled in the order given. The first 3 tool calls of the
   question, of either name, are served. Each call after them gets the limit result: "No
   frame or text follows: this question has already been served its 3 tool calls."
4. A transcript request is served as follows:
   1. Its arguments must be an object with `start` and `end`, both readable times, and
      `start` below `end`. Otherwise the result is "No text follows: get_transcript takes
      a JSON object with start and end, two times with start before end.", and the call
      counts as served.
   2. Otherwise the rows whose span overlaps `[start, end)` are walked in time order,
      the first segment's rows with their stored text:
      - A sent row is written as the line "already sent as [n]". When it is a row of the
        first segment that has removed parts which have not been sent for the question,
        the line is followed by `[m]`, those removed parts, and an empty line, with `m` the
        next number; this supplement is a requested passage at the row's position, and its
        parts count as sent from then on.
      - Any other row is written as the line `[n]`, then its text, then an empty line,
        with `n` the next number (step 5).
      - Before a row is written, the result so far, that row's lines and the longest
        possible stop note (the note below with a clock time of 8 characters) must fit in
        3,000 characters. When they do not, the walk stops: the row is not written, the
        result ends with "Text from <the row's start as a clock time> on was not sent: the
        limit of one call was reached.", and rows after it are not looked at. A row is
        never cut.
      - The result does not end with an empty line: the empty line after the last row is
        dropped before the result is counted.
   3. When no row overlaps, the result is "Nothing is said or shown between <start> and
      <end>.", with both times as clock times.
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
  4) and get_transcript (start and end) are available.", with "this call" in place of
  `<name>` when the name is empty, and it counts as served.
- **A `get_frames` call with bad arguments when the material is cut**: the same text as the
  previous case.
- **A range past the end of the video**: no row overlaps (normal flow 4.3).
- **A tool request, or a final request before its first `answer_chunk`, is refused or
  fails**: the SPEC-ADDON-116 fallback sends today's request once: its passages and its
  initial frames, with no requested passage.
- **A final request fails after its first `answer_chunk`, or the total deadline passes**:
  as SPEC-ADDON-116, `meta` then `done` with "Answer generation failed".
- **The viewer closes the tab**: as SPEC-ADDON-116.

### 3. States

The states of SPEC-ADDON-116, with `cutting` read as `serving`, "serving the tool calls of
a reply": `tool` → `serving` when the reply holds tool calls of any name, a reply of
transcript calls only included; `serving` is not entered once 3 tool calls have been
served; an unexpected error while building a transcript result goes to `fallback`, as an
unexpected error while cutting does.
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
  count the served calls named `get_frames` and `get_transcript`, those with bad arguments
  included. A served call of any other name, and a call over the limit, is counted in
  neither. `b` and `d` count the frames and requested passages sent.

No question, answer, tool argument or text is logged.

### 9. User-visible behavior

- On a long video, an answer may cite passages beyond those first sent. Their pills seek
  to the row's start, as passage pills do.
- The "read part of the file" notice stays as today: `partial` is the material's, not
  what the model later read.
- The docs say that on a long video the model may read more of its text, up to 3,000
  characters per call, in ranges it chooses, within the same 3 calls as frames.

### 10. Non-functional

- At most 3 tool calls per question, of either kind. A transcript result is at most 3,000
  characters. Nothing after 300 s from the slot.
- Context, measured on the production gemma4:e4b (2026-11-23): Japanese transcript 1.74
  characters per token, frame text 2.15, English 4.34; a 1280 px frame about 450 tokens
  (SPEC-ADDON-116).
  - A frame call adds at most 4 frames (1,800 tokens); a transcript call at most 3,000
    characters (1,724 tokens of Japanese). So the 3-call limit bounds the context, and the
    worst mix is today's: 3 frame calls.
  - That question: 20 frames (9,000), 16,000 characters of Japanese passages and history
    (9,200), contents (about 3,000), system prompt and tool definitions (about 1,300, of
    which about 300 is this change), the question, `[n]` and frame labels, and the earlier
    replies (about 1,300), plus `num_predict` 8,192 for output: about 32,000 of 32,768.
    Three transcript calls instead (8 initial frames, 3 × 1,724 tokens of text) come to
    about 31,800: lighter than three frame calls by about 230 tokens. The margin of the
    worst case is about 770 tokens.
  - This change adds about 300 tokens to today's worst case and no new worst case. The docs
    keep the 32,768 requirement.
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
  `tests/frame_request_doubles.py` for a scripted `get_transcript` call and a check of
  both tool names. `tests/test_spec_addon_116_frame_requests.py` is not edited: its videos
  fit the budget. `tests/test_spec_addon_114_text_video_frames.py` sends cut material down
  the frames path; an assertion there that pins the tool list or the system prompt of a
  cut-material request changes only to the two tools and rules of this spec.
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

I1. With cut material, every tool request offers exactly `get_frames` then `get_transcript`, and the final request lists the same two with `tool_choice` `"none"` (OpenAI-compatible) or no tools (ollama); with material that is not cut, every request, tool result and log line on the path is byte for byte SPEC-ADDON-116's.
I2. At most 3 tool calls per question are served, counting `get_frames` and `get_transcript` together; a request is a final request once 3 have been served or 120 s have passed since the slot was taken, and no request after a final request offers a tool.
I3. A transcript request sends only whole rows of the requested file's material whose span overlaps its range, in time order, and never sends a sent row again (it names it as "already sent as [n]", followed only by the removed parts of I10); its result, stop note included, is at most 3,000 characters, and it sends no row after the first one that does not fit.
I4. Numbers run without a gap: passages `[1]`–`[P]`, initial frames `[P+1]`–`[P+F]`, then for each reply its requested passages followed by its cut frames; every `citations` entry names a number that was sent, with a passage's or requested passage's row position, or a frame's time as `position.seconds`, and no other number appears. `meta.partial` is the material's `partial`, whatever the model requested afterwards.
I5. In the lines a transcript result writes itself (number lines, "already sent as [n]" lines, the stop note and the nothing-in-range text) a clock time appears only in the stop note and the nothing-in-range text, and none of those holds both a clock time and a bracketed number; row text is sent as it is.
I6. A refusal or failure of a tool request, or of a final request before its first `answer_chunk`, is followed by exactly one request identical to today's request (its passages and initial frames), which carries no requested passage.
I7. Nothing is written by a transcript request, and no question, answer, tool argument or requested text is logged.
I8. With cut material, the system prompt of every tool request names the passages get_transcript returns as citable in its opening and, with history, in its sentence on what may be cited; carries the rule that get_transcript must be called before saying something is not said; and states the limit as 3 calls of the two tools together.
I9. With cut material, the log line is written once per question that served a tool call, `a` and `c` count served calls named `get_frames` and `get_transcript` (bad arguments included), no call of another name or over the limit is counted, and `b` and `d` count frames and requested passages sent.
I10. Every first-segment row a transcript result writes is either written with its stored text, or, when it was sent with its SPEC-ADDON-171 text, named as already sent and followed by a passage of its removed parts not yet sent; a later frame-text row is written with its SPEC-ADDON-171 text, and one the filter removed whole is not written.

## Revises

SPEC-ADDON-116 I2. At most 3 tool calls per question are served, counting frame requests and SPEC-ADDON-174 transcript requests together; a request is a final request once 3 have been served or 120 s have passed since the slot was taken, and no request after a final request offers the tool.
SPEC-ADDON-116 I3. Numbers run without a gap: passages `[1]`–`[P]`, initial frames `[P+1]`–`[P+F]`, then for each reply its SPEC-ADDON-174 requested passages followed by its requested frames; every `citations` entry names a number that was sent, with a passage's or requested passage's row position, or a frame's time as `position.seconds`, and no other number appears.
SPEC-ADDON-114 I3. The prompt numbers the passages `[1]` to `[P]`, then the kept frames `[P+1]` to `[P+F]` in time order, then the requested passages and requested frames of SPEC-ADDON-116 and SPEC-ADDON-174 in the order SPEC-ADDON-174 I4 states; every `citations` entry names a number that was sent, with the passage's or requested passage's position, or the frame's time as `position.seconds` for a frame, and no other number appears.
SPEC-ADDON-171 I3. Ask numbers the passages it sends consecutively in file order, frames follow from that count, SPEC-ADDON-174 requested passages and requested frames follow as SPEC-ADDON-174 I4 states, and every `citations` entry names a number that was sent, with that passage's position.
SPEC-ADDON-053 I3. Every entry of the `citations` event names a number that was sent: a chunk number with that chunk's position, a frame number (after the chunk numbers for a video with a text chunk, from 1 for a video with none) with that frame's time, or a SPEC-ADDON-174 requested passage's number with its row's position; a number that was not sent never appears.
SPEC-ADDON-053 I2. When the file's chunk text, after a video's repeated frame-text lines are removed as SPEC-ADDON-171 states, totals at most the passage budget (`rag.file_question_max_chars` minus the characters of the history turns sent), all chunks are sent in file order and `partial` is false; otherwise the passages total at most the passage budget, chosen by the ranking and fitting rule of 053 step 4 with the ranking text of SPEC-ADDON-081 step 5, sent in file order, and `partial` is true; SPEC-ADDON-174 requested passages are not counted in that budget and are bounded by their own caps.
SPEC-ADDON-081 I2. For one question, the kept turns' sizes (question plus answer after marker removal and cutting) total at most half of `rag.file_question_max_chars` rounded down, turns and passages together at most `rag.file_question_max_chars` (SPEC-ADDON-174 requested passages are bounded by their own caps), a kept turn is never older than a dropped one, and no `\[\d{1,3}\]` marker from an earlier answer reaches the model.
SPEC-ADDON-114 I2. The passages sent for a text video are the same, by budget and ranking, whether frames are attached, none could be prepared, or the request is retried after a refusal; SPEC-ADDON-174 requested passages are sent only on the tool path and never in a retry.
SPEC-ADDON-114 I10. The system prompt sent with passages and frames tells the model that both numbered passages and numbered frames may be cited and nothing else, SPEC-ADDON-174 requested passages counting as passages, to take exact characters from a passage where it and a frame differ and from a frame when no passage has them, and to say so instead of guessing when neither contains the answer.
SPEC-ADDON-081 I1. A file question with no `history` or an empty one sends the model the same system prompt, user prompt and chunks, ranked by the new question alone, as before SPEC-ADDON-081, with a video's repeated frame-text lines removed as SPEC-ADDON-171 states, and, for cut material on the tool path, the system prompt and tools of SPEC-ADDON-174; with history and a file over budget, ranking embeds the last `history` entry's question as sent, a newline, and the new question.
SPEC-ADDON-171 I2. Ask sends no `\n`-part of a frame-text row whose stripped form is a repeated line, and sends every other part of every frame-text row it sends, as stored and in its order within its row; a frame-text row in which nothing was removed is sent with its stored text unchanged, and a row whose remaining parts are all blank takes no `[n]`. The rows of the first segment of a SPEC-ADDON-174 transcript request's range are the exception: they are sent with their stored text, or with their removed parts when the row was already sent, and take a number although the filter removed them whole.
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
- **A per-question cap on transcript text.** The 3-call limit already bounds the context,
  and three transcript calls weigh less than three frame calls. The human chose the
  per-call cap alone.
- **Requested frame text with SPEC-ADDON-171's filter everywhere.** A line on screen since
  before the range (a slide heading) would be missing from the range's result although the
  model never received it. The human chose to send the range's first segment as stored and
  keep the filter after it, so what is on screen at the start is complete and the result
  stays small.
- **Cutting a row that does not fit.** Rows are whole chunks (a frame-text chunk is at most
  1,000 characters, a transcript chunk one transcript window), and a cut row would leave
  part of a row unreachable while marking it sent.
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
