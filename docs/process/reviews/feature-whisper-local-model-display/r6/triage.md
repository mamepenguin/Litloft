# Triage: r6

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: ':' and '：' between digits are now number separators for chunking, cue breaking and two-line splitting (SPEC-ADDON-015, not specified in the core repo).
- claude-read: ':' and '：' between digits are now number separators for chunking, cue breaking and two-line splitting (SPEC-ADDON-015, not specified in the core repo).
- claude-verify: Digit separators now include ':' and '：', which changes chunk, cue and subtitle-line breaks for time-like text such as 12:30. No approved spec in the core INDEX covers this (SPEC-ADDON-015 is missing).

### unspecified_behavior

Note: Digit separators now include ':' and '：', which changes chunk, cue and subtitle-line breaks for time-like text such as 12:30. No approved spec in the core INDEX covers this (SPEC-ADDON-015 is missing).
- claude-read: ':' and '：' between digits are now number separators for chunking, cue breaking and two-line splitting (SPEC-ADDON-015, not specified in the core repo).
- claude-verify: Digit separators now include ':' and '：', which changes chunk, cue and subtitle-line breaks for time-like text such as 12:30. No approved spec in the core INDEX covers this (SPEC-ADDON-015 is missing).

## Findings

A: 0
B: 2
C: 0

### claude-read:R1 — bucket B, MEDIUM, open

Claim: The addons/intelligence submodule bump (ba49803..fe978f8) ships a SPEC-ADDON-015 behavior change outside the SPEC-ADDON-016 touch points: app/digit_separator.py now treats ':' and '：' between digits as part of a number, which changes how transcripts are split into chunks, cue breaks and two-line subtitle splits. No SPEC-ADDON-015 spec or INDEX.md row exists in this tree.
Impact: After this pointer bump, the operator gets different Whisper chunk boundaries and subtitle cue and line breaks for every transcript with a digit:digit sequence (e.g. '12:30', 'Chapter 1: 2 items', '1：0'). Neither the spec under review nor the ledger declares or reviews this. A reviewer checking only SPEC-ADDON-016's invariants would let it through.
Evidence: addons/intelligence/app/digit_separator.py:5 `_SEPARATORS = frozenset(".,:：")` (was ".,"). It is used by is_digit_separator (line 19) and splits_number (lines 37, 45). New tests cite SPEC-ADDON-015 in addons/intelligence/tests/test_digit_separator_breaks.py (class TestColonSeparator) and tests/test_subtitle_line_split_numbers.py (test_spec_addon_015_*). A grep for SPEC-ADDON-015 outside addons/ and outside addons/intelligence/tests finds no match. docs/specs/INDEX.md jumps from SPEC-ADDON-014 to SPEC-ADDON-016. The touch-point list names only admin.py, AdminTranscriptionSettingsSection.tsx/.test.tsx and the new SPEC-ADDON-016 tests.
Repro: Compare the touch-point list with the submodule diff ba498037..fe978f81: app/digit_separator.py, tests/test_digit_separator_breaks.py and tests/test_subtitle_line_split_numbers.py change and none of them is listed. For behavior: is_digit_separator(None, "12:", "30") now returns True (it was False), so _build_chunks_from_words no longer ends a chunk at '12:'.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Pin the submodule to an addon commit that contains only the SPEC-ADDON-016 change. Alternatively, add SPEC-ADDON-015's spec and INDEX row and name the digit_separator change as a touch point before this bump lands.

</details>

### claude-read:R2 — bucket B, INFO, open

Claim: The diff edits addons/intelligence/search-config.yml.example (it removes the comment '# Default: openai/whisper-small'), but the touch-point list says 'Docs: none' and does not name the example config.
Impact: Minor. The removed comment was wrong: the ModelConfig default is openai/whisper-large-v3-turbo (app/config.py:34). The edit is correct, but it is undeclared.
Evidence: search-config.yml.example around line 385, where the hunk drops '# Default: openai/whisper-small (244M, ~500MB int8 RAM)'. app/config.py:34 `whisper: str = "openai/whisper-large-v3-turbo"`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add search-config.yml.example to the touch-point list, or move the edit into its own commit.

</details>

## Not verified

- claude-read: I did not run any test.
- claude-read: I did not inspect the addon repository history between ba49803 and fe978f8 to see whether SPEC-ADDON-015 was reviewed elsewhere.
- claude-read: I did not check whether a SPEC-ADDON-015 spec exists on another core branch.
- claude-verify: I could not run git, so I did not read the actual diff or verify commit ancestry (1f33822 containing e102ecb). Ancestry was inferred from the reflogs.
- claude-verify: That the core develop's addon pointer is exactly ba49803 is taken from the reflog's timing and the reviewer's claim, not from reading the develop tree.
- claude-verify: I did not run any tests.
- claude-verify: I did not check invariants I1-I6 beyond what these findings needed.

TOTAL: 2 findings
