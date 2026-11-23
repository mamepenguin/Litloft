# Triage: r2

## Trajectory

This run:
- claude-read: There was one fix round, 0ad7f63 (929ab2a only records the review). It added one branch: an exception while a transcript result is built now goes to the fallback, the same path a cut_task failure already takes, so no new state was introduced. It corrected one arithmetic prediction: the stop-note reserve now includes the joining newline. It removed one element, the dead duplicate _call_times. No branch, state or prediction added in this round repeats one added in an earlier round, so there is no sign of the design being patched. Each fix is a single local change, and each comes with a test that kills the pre-fix code.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/intelligence/app/prompts/rag/file_question_system.jinja2 — full: Read the whole file.
- addons/intelligence/app/rag/file_question.py — full: Read every changed hunk with its enclosing code: load_material (420-565), _material_rows, _fit and _selected (1044-1103); the dataclasses and citations_from as diff hunks.
- addons/intelligence/app/rag/prompt.py — partial: Read only the diff hunks (the cut flag, GET_TRANSCRIPT_TOOL); the fix commits did not touch the file, and the file was not reopened.
- addons/intelligence/app/routers/rag.py — full: Read _frame_tool_answer whole (1103-1534) and the call site (1020-1101), plus _call_arguments through _serve_transcript (1600-1928).

Test files:
- addons/intelligence/tests/frame_request_doubles.py — partial: Only the changed hunks, as diff text.
- addons/intelligence/tests/test_spec_addon_174_transcript_edge_cases.py — full: New file, read whole as diff text and traced against _fit and _serve_transcript.
- addons/intelligence/tests/test_spec_addon_174_transcript_limits.py — full: New file, read whole as diff text.
- addons/intelligence/tests/test_spec_addon_174_transcript_offer.py — full: New file, read whole as diff text.
- addons/intelligence/tests/test_spec_addon_174_transcript_results.py — full: New file, read whole as diff text.

## Unspecified behavior, recorded

- claude-read: The stop-note reserve assumes a clock of at most 8 characters. A stop row starting at 100 h or later gets a 9-character format_position clock, so the result can be one character over 3,000 even with the new newline reserve.
  - F0 × I1 = 0, claude-read: Only a video of more than 100 hours triggers it, and personal use does not produce one; the model would receive a result one character over the cap.
  - F0 × I1 = 0, claude-verify: Only a stop row starting at 100 h or later (a 9-character clock against the 8-character reserve at rag.py:733) can push a result one character over 3,000; a personal video library has no such videos, and one extra character is harmless.
- claude-read: A first-segment row written with its stored text does not add its repeated lines to sent_parts, so a later supplement for another sent row can repeat a line the model already received.
  - F2 × I1 = 2, claude-read: A slide heading repeated across overlapping transcript calls appears twice in a tool result, costing a few characters of the 3,000.
  - F2 × I1 = 2, claude-verify: When a first-segment row is written with its stored text, its removed parts are not added to sent_parts (rag.py:1913-1918); a later supplement for another already-sent row can repeat a line such as a recurring caption, and the user sees nothing beyond a slightly redundant prompt.
- claude-read: A single row whose numbered group exceeds about 2,929 characters is never sent: every range that reaches it returns only the stop note at that row, and the walk does not continue to later rows.
  - F1 × I3 = 3, claude-read: Only an unusually long transcript window or frame-text chunk triggers it; the model sees 'Text from X on was not sent' and must request a range that starts after that row.
  - F1 × I4 = 4, claude-verify: A single transcript or OCR row whose group exceeds about 2,929 characters always hits the stop check at rag.py:1910 before anything is written, so any range that reaches it returns only the stop note; the model gets no text from that point and may answer that it cannot find the content.
- claude-read: When an exception aborts a round's transcript building after an earlier round served calls, the cut log line is still written with the earlier rounds' counts and the fallback answer follows.
  - F0 × I1 = 0, claude-read: _serve_transcript has no ordinary failure (it is pure over in-memory rows); the operator would see a warning plus a count line for the earlier rounds.
  - F0 × I1 = 0, claude-verify: Only a programming error inside the pure in-memory _serve_transcript (rag.py:1410-1439) can trigger this; the user still gets the fallback answer, and the only side effect is a log line counting earlier rounds.

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: Tests were not run; mutant kills are reasoned from the code and the test data.
- claude-read: The new tests' assumption that _rank with equal vectors keeps file order (a stable sort) was not read in _rank's body.
- claude-read: The llm client's serialization of two tools and of the ollama final request with no tools.
- claude-read: The full contents of frame_request_doubles.py beyond the diff hunks (answer_text, offers_tool, is_final helpers).
- claude-verify: Did not read the tests or run any code.
- claude-verify: Did not check the I1–I10 invariants in full beyond the code paths tied to the four unspecified behaviors.
- claude-verify: Did not check file_question.load_material, the prompt template, or the docs.

TOTAL: 0 findings
