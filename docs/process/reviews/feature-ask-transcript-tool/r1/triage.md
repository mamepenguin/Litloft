# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R3 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/intelligence/app/prompts/rag/file_question_system.jinja2 — full: Read the whole file.
- addons/intelligence/app/rag/file_question.py — full: Read every changed hunk with its enclosing code: dataclasses (85-190), load_material (380-565), citations/citations_from, _fit/_rank/_selected and _filter_frame_text (1000-1169).
- addons/intelligence/app/rag/prompt.py — full: Read every changed hunk with its enclosing function: build_file_question_system_prompt, GET_TRANSCRIPT_TOOL and format_position (120-274).
- addons/intelligence/app/routers/rag.py — full: Read every changed hunk with its enclosing function: imports, constants and _CallPlan (50-64, 710-775), _frame_tool_answer (1103-1521), _call_times/_tool_plan through _serve_transcript (1593-1931), plus the call site (440-529, 1000-1100).

Test files:
- addons/intelligence/tests/frame_request_doubles.py — partial: Only the changed hunks, as diff text; the file was not opened.
- addons/intelligence/tests/test_spec_addon_174_transcript_limits.py — full: New file, read whole as diff text.
- addons/intelligence/tests/test_spec_addon_174_transcript_offer.py — full: New file, read whole as diff text.
- addons/intelligence/tests/test_spec_addon_174_transcript_results.py — full: New file, read whole as diff text.

## Unspecified behavior, recorded

- claude-read: A single row longer than about 2,930 characters can never be sent; every transcript call whose range includes it returns only the stop note, and rows after it in time order are unreachable unless the range starts after that row ends.
  - F1 × I3 = 3, claude-read: Triggered only by an unusually long transcript window; the model then sees 'Text from X on was not sent' on every attempt and answers without that part.
  - F1 × I4 = 4, claude-verify: Only a single stored row of about 2,930 characters or more triggers it (chunking defaults such as max_chunk_size=400 make that rare); a call over that range returns only the stop note, and the model sees nothing for that range.
- claude-read: Removed parts already sent are tracked by their stripped text across all rows, not per row, so a sent first-segment row whose removed line was given in another row's supplement gets no supplement of its own.
  - F3 × I1 = 3, claude-read: Several first-segment rows share a heading line; the model still received that line once, so the answer is unaffected.
  - F2 × I2 = 4, claude-verify: Videos with a repeated on-screen line and several overlapping transcript calls trigger it; a sent first-segment row is named without its own copy of a removed line the model already received under another number, so it can cite that number instead, a minor citation-precision difference.
- claude-read: Lines written as part of a first-segment row's stored text are not recorded in sent_parts, so a later supplement for another row can repeat a line the model already received in stored text.
  - F2 × I1 = 2, claude-read: Repeated slide headings appear twice in the tool result, costing a few characters of the 3,000.
  - F2 × I2 = 4, claude-verify: A repeated frame-text line first sent inside a row's stored text and later due as another row's supplement triggers it; the model receives the same line twice under a new number, which costs a few characters of the call's budget and does no harm.
- claude-read: Cut material with no row that has a span (partial true but rows empty) is not offered get_transcript and keeps the uncut prompt and texts.
  - F0 × I1 = 0, claude-read: A video whose text has no timed rows is not an ordinary case; the user would see no difference from today.
  - F1 × I3 = 3, claude-verify: Cut material with no timed row (partial true but no row has a span, rag.py:1128) triggers it; the user gets the SPEC-ADDON-116 frame-only behaviour, which is reasonable because no transcript span could be served anyway.
- claude-verify: For a stop row starting at 100 h or later, format_position gives a 9-character time, so the stop note is longer than the 'longest' reserved by _TRANSCRIPT_STOP_CHARS and the result can exceed 3,000 by two characters.
  - F0 × I1 = 0, claude-verify: Only videos over 100 hours trigger it, which personal use does not produce; the model would get a result two characters over the limit.
  - single-scored

## Findings

A: 1
B: 4
C: 0

### claude-read:R3 — bucket A, LOW, open

Claim: The fit check reserves the longest stop note but not the newline that joins it to the result, so a stop result can be 3,001 characters when its clock time has 8 characters (a row starting at 10 h or later).
Impact: On a video of 10 hours or more, a transcript result that stops at a row whose start is at or after 10:00:00, with the earlier text exactly at the boundary, is one character over the 3,000-character cap. This is practically unreachable in normal use.
Evidence: rag.py:1912-1914: an accepted row satisfies len(join(lines+group)) + _TRANSCRIPT_STOP_CHARS <= 3000, where _TRANSCRIPT_STOP_CHARS uses an 8-character time (rag.py:733). On stop the result is join(lines) + '\n' + stop note (rag.py:1914, 1930). With format_position giving 'HH:MM:SS' (8 characters) at 10 h or later (prompt.py:266-273), the total is the accepted length + 1 + _TRANSCRIPT_STOP_CHARS, which can be 3,001. For 7-character clocks or shorter, the slack absorbs the newline.
Repro: not_reproduced. Construct rows starting at 36000 s so that the previous accepted candidate is exactly 3000 - _TRANSCRIPT_STOP_CHARS characters long, then request a range whose next row does not fit; len(result) == 3001.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Reserve _TRANSCRIPT_STOP_CHARS + 1 (the joining newline) in the fit check.

</details>

### claude-read:R2 — bucket B, LOW, open

Claim: rag.py now defines _call_times twice, and the later definition silently replaces the first, so the first is dead code outside the planned edits.
Impact: No runtime effect. A reader who edits the first definition (rag.py:1593) changes nothing, which could lead to a wrong fix of frame-call parsing.
Evidence: addons/intelligence/app/routers/rag.py:1593-1606 is the old _call_times; rag.py:1620-1628 is the new one built on _call_arguments. Python binds the name to the later def.
Repro: Read the module: _tool_plan at rag.py:1681 resolves _call_times to the second definition.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the first _call_times definition (rag.py:1593-1606).

</details>

### claude-read:R5 — bucket B, LOW, open

Claim: No test kills dropping the `sent_as == "filtered"` condition: a first-segment row that an earlier call already sent with its stored text would get a supplement again, and the tests do not notice.
Impact: A regression that re-sends removed parts under a new number for a row already sent with stored text would pass the suite.
Evidence: rag.py:1900. In test_a_later_call_does_not_send_the_removed_parts_again, the only removed part (HEADER) is already in sent_parts from the first call's [12] supplement, so the mutant's supplement for [13]/[14] is empty and the asserted lines are unchanged.
Repro: Mental mutation: replace `if first and sent_as == "filtered":` with `if first:`. In the test above the second call still yields exactly the four 'already sent' lines and no HEADER, so the mutant survives.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R1 — bucket B, INFO, open

Claim: The change reaches file_question.citations, which is not among the declared touch points (load_material and Material): it now delegates to a new citations_from used by every file question, not only the cut-material video path.
Impact: Every file question's citations event (text path rag.py:695, 862, 982 and the frames path) now runs through new code. As read, the result is the same: a number is kept when it is in 1..len(chunks), and the position is the chunk's position. No user-visible change was found.
Evidence: addons/intelligence/app/rag/file_question.py:1012-1041: citations() builds {index: chunk.position} and calls citations_from, which tests `number not in positions` where the old code tested `1 <= number <= len(chunks)`. Callers outside the touch points are at rag.py:695, rag.py:862 and rag.py:982.
Repro: not_reproduced; equivalence was reasoned from the code.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R4 — bucket B, INFO, open

Claim: An unexpected exception while a transcript result is built is not routed to the fallback; _serve_transcript runs outside any try in the serving loop.
Impact: No ordinary trigger was found (the function is pure over in-memory rows). If one existed, the stream would end abnormally instead of sending today's request.
Evidence: rag.py:1410-1427 calls _serve_transcript after the cut_task try block has closed; only the outer try/finally (rag.py:1229/1502) surrounds it, and that block only logs.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Tests were not run; mutant outcomes are reasoned only.
- claude-read: The llm client's serialization of two tools, and of the ollama final request with no tools.
- claude-read: Whether tests/test_spec_addon_114_text_video_frames.py is still green with cut material now offering two tools (a grep found no tool-list or prompt assertions in it).
- claude-read: Whether addons/intelligence/.flash/spec.md is part of the addon commit.
- claude-read: Whether frame_segments can mark a blank line as repeated, which would affect the removed tuple.
- claude-verify: The pre-change citations() code; only the new code was read, with no git history.
- claude-verify: Nothing was executed: the mutant survival and the 3,001-character result are reasoned from the code, not run.
- claude-verify: Whether the addons/intelligence working tree matches the gitlink commit recorded at 3518f8c28.
- claude-verify: Whether a caller above the frames-path generator catches an exception from _serve_transcript.
- claude-verify: file_question_system.jinja2, the GET_TRANSCRIPT_TOOL description text in prompt.py, and the docs files were not opened.
- claude-verify: Whether video transcript/frame-text rows are capped by max_chunk_size.

TOTAL: 5 findings
