# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- open_c claude-read:F1
- unspecified_behavior
- unspecified_behavior

## Needs a human

### open_c (claude-read:F1)

Question: The diff changes `addons/intelligence/app/llm.py` (a JSON-mode fallback that latches per client and drops `response_format` after a 400) and adds about 520 lines to `tests/test_llm.py`, but neither file is a touch point of SPEC-ADDON-012/013/014 or 009/010/011, and the SPEC-ADDON-008 that the tests cite has no spec anywhere under docs/.
Impact: Every JSON caller of LLMClient (refine, summaries, keywords, Ask, anything that uses generate_json / generate_json_result / generate(response_format=json_object)) now behaves differently against providers that answer 400. Once one 400 is followed by an answer without the field, `_json_mode_rejected` latches for the life of the client. From then on, JSON mode is never sent to that provider again, and the empty-body retry in the JSON path is skipped. This behavior was reviewed against no declared invariant, so a regression in it would not be traced to any approved spec.
Evidence: addons/intelligence/app/llm.py:356 (`_JSON_OBJECT_FORMAT`), :468 (latch), :577-582, :608-614 (latching), :650-668 (400 resend without response_format, not charged to retry_attempts), :1242 (empty-body retry suppressed once latched). Grep for `SPEC-ADDON-008` under docs/ returns no files; the only matches are app/llm.py and tests/test_llm.py, where test comments cite 'SPEC-ADDON-008 (I1..I10)', which no document defines. docs/specs/INDEX.md in the diff lists 009-014 but not 008. The touch points of both specs in the diff name neither llm.py nor test_llm.py.
Recommendation: Either write and approve the SPEC-ADDON-008 spec (with llm.py and tests/test_llm.py as its touch points) and add it to INDEX.md, or move the llm.py and test_llm.py changes to their own branch. Separately, the comment block at llm.py:349-355 describes `_RESPONSE_FORMAT_SUSPECT_FAILURES` but now sits above `_JSON_OBJECT_FORMAT`; move the constant above the comment.
Note: The diff changes `addons/intelligence/app/llm.py` (a JSON-mode fallback that latches per client and drops `response_format` after a 400) and adds about 520 lines to `tests/test_llm.py`, but neither file is a touch point of SPEC-ADDON-012/013/014 or 009/010/011, and the SPEC-ADDON-008 that the tests cite has no spec anywhere under docs/.

### unspecified_behavior

Note: LLMClient latches `_json_mode_rejected` after one 400 followed by a successful resend without response_format, and never sends json_object mode on that client again (llm.py:608-614).; Once latched, the empty-body retry in the JSON path is skipped (llm.py:1242).; A 400 to a json_object request is resent once without the field and not counted against retry_attempts (llm.py:650-668).
- claude-read: LLMClient latches `_json_mode_rejected` after one 400 followed by a successful resend without response_format, and never sends json_object mode on that client again (llm.py:608-614).
- claude-read: Once latched, the empty-body retry in the JSON path is skipped (llm.py:1242).
- claude-read: A 400 to a json_object request is resent once without the field and not counted against retry_attempts (llm.py:650-668).
- claude-verify: app/llm.py JSON-mode fallback (latch, resend without response_format, not charged to retry_attempts) cites SPEC-ADDON-008, which has no spec under docs/specs.
- claude-verify: digit_separator.splits_number is a new public helper that neither spec's touch points name.

### unspecified_behavior

Note: app/llm.py JSON-mode fallback (latch, resend without response_format, not charged to retry_attempts) cites SPEC-ADDON-008, which has no spec under docs/specs.; digit_separator.splits_number is a new public helper that neither spec's touch points name.
- claude-read: LLMClient latches `_json_mode_rejected` after one 400 followed by a successful resend without response_format, and never sends json_object mode on that client again (llm.py:608-614).
- claude-read: Once latched, the empty-body retry in the JSON path is skipped (llm.py:1242).
- claude-read: A 400 to a json_object request is resent once without the field and not counted against retry_attempts (llm.py:650-668).
- claude-verify: app/llm.py JSON-mode fallback (latch, resend without response_format, not charged to retry_attempts) cites SPEC-ADDON-008, which has no spec under docs/specs.
- claude-verify: digit_separator.splits_number is a new public helper that neither spec's touch points name.

## Findings

A: 0
B: 4
C: 1

### claude-read:F2 — bucket B, INFO, rejected

Claim: The diff reaches whisper.py outside 012's touch points: `_ensure_loaded`, `_transcribe_file` and `_index_loft_vtt` now read `settings.transcription.whisper_local` (011), and `_build_chunks_from_words._is_break` now ignores digit separators (010).
Impact: Batch size, thresholds, initial_prompt and the `.loft` caption segment durations now come from the merged tree. Chunk boundaries at a `.` or `,` between digits change for every provider and language. Neither is covered by the 012-014 invariants. Both are covered by SPEC-ADDON-011 I5 and SPEC-ADDON-010 I8 in the other spec in the same diff.
Evidence: addons/intelligence/app/workers/whisper.py hunks at _ensure_loaded (batch_size), _transcribe_file (whisper_config), _index_loft_vtt (whisper_config), and _build_chunks_from_words (`_is_break(i, gap)` using is_digit_separator). The 012 touch point lists only `_detect_language`, `_decode_detection_sample` and the detection constants.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F3 — bucket B, INFO, rejected

Claim: The diff changes subtitle_builder.py outside `_balance_two_lines`: `_safe_break_between` gains a `before` parameter, and `build_cues` stops treating a digit separator as hard or soft punctuation or as a safe break (010).
Impact: Cue boundaries (not only line layout) change for every language at a `.` or `,` between digits. 014 item 7 says 'cue boundaries and timing are unchanged', which holds only relative to 010. The 012-014 invariants do not cover this; SPEC-ADDON-010 I9 does.
Evidence: addons/intelligence/app/subtitle_builder.py: `_safe_break_between(prev, nxt, before=None)` with the is_digit_separator check; build_cues `punctuation = ... not is_digit_separator(...)` and the two rewind loops passing `current[cand - 2]`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F4 — bucket B, INFO, rejected

Claim: The diff edits `app/prompts/refine/system.jinja2`, `search-config.yml.example` and `docs/addons/intelligence.md`, none of which is in the 012-014 touch-point list.
Impact: Every refine request now carries the Numbers line (010). The example config and the docs no longer show `transcription.whisper_local.model` (011). These are 010/011 changes covered by that spec's invariants I6 and I5, not by 012-014.
Evidence: diff hunks for addons/intelligence/app/prompts/refine/system.jinja2, addons/intelligence/search-config.yml.example (removed `model:` line), and docs/addons/intelligence.md (refine digits sentence, removed `model:` line).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F5 — bucket B, INFO, open

Claim: The 014 touch point says `_balance_two_lines` 'may reuse `app/digit_separator.py`', but the diff creates that module (for 010's `is_digit_separator`) and adds a new public function to it, `splits_number`, which is 014 step 3's 'inside a number' rule.
Impact: `splits_number` is new shared logic in a module, not reuse, and the tests in test_subtitle_line_split_numbers.py reach it only through `_balance_two_lines`. No direct test pins `splits_number` itself. A later caller of the helper would rely on behavior checked only indirectly.
Evidence: addons/intelligence/app/digit_separator.py (new file; `splits_number` at the bottom). It is used by subtitle_builder.py `_balance_two_lines` and `_number_edge`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F1 — bucket C, HIGH, open

Claim: The diff changes `addons/intelligence/app/llm.py` (a JSON-mode fallback that latches per client and drops `response_format` after a 400) and adds about 520 lines to `tests/test_llm.py`, but neither file is a touch point of SPEC-ADDON-012/013/014 or 009/010/011, and the SPEC-ADDON-008 that the tests cite has no spec anywhere under docs/.
Impact: Every JSON caller of LLMClient (refine, summaries, keywords, Ask, anything that uses generate_json / generate_json_result / generate(response_format=json_object)) now behaves differently against providers that answer 400. Once one 400 is followed by an answer without the field, `_json_mode_rejected` latches for the life of the client. From then on, JSON mode is never sent to that provider again, and the empty-body retry in the JSON path is skipped. This behavior was reviewed against no declared invariant, so a regression in it would not be traced to any approved spec.
Evidence: addons/intelligence/app/llm.py:356 (`_JSON_OBJECT_FORMAT`), :468 (latch), :577-582, :608-614 (latching), :650-668 (400 resend without response_format, not charged to retry_attempts), :1242 (empty-body retry suppressed once latched). Grep for `SPEC-ADDON-008` under docs/ returns no files; the only matches are app/llm.py and tests/test_llm.py, where test comments cite 'SPEC-ADDON-008 (I1..I10)', which no document defines. docs/specs/INDEX.md in the diff lists 009-014 but not 008. The touch points of both specs in the diff name neither llm.py nor test_llm.py.
Repro: Read the touch-point list of docs/specs/whisper-langdetect-vad-aligner-sentences.md and of docs/specs/whisper-langdetect-refine-digits.md, then the diff: the llm.py hunk and the test_llm.py hunk appear in neither. Running Grep with the pattern `SPEC-ADDON-008` on the docs/ path returns no matches.
Introduced: introduced
Reviewer bucket: C | Author bucket: 

<details><summary>Proposed fix</summary>

> Either write and approve the SPEC-ADDON-008 spec (with llm.py and tests/test_llm.py as its touch points) and add it to INDEX.md, or move the llm.py and test_llm.py changes to their own branch. Separately, the comment block at llm.py:349-355 describes `_RESPONSE_FORMAT_SUSPECT_FAILURES` but now sits above `_JSON_OBJECT_FORMAT`; move the constant above the comment.

</details>

## Not verified

- claude-read: Did not run any test or mutation; read-only review.
- claude-read: Did not check whether the llm.py change is planned in some other branch's spec or decisions file outside docs/specs and docs/process/reviews.
- claude-read: Did not read `generate_json_result` around llm.py:1230-1260 in full to see how the latch interacts with the json parse path.
- claude-read: Did not inspect the addon repository's own history to confirm which commits in c614a26..d9f5b23 belong to which spec.
- claude-verify: Whether app/llm.py and tests/test_llm.py are actually in the origin/develop..a4d2aecb2 diff range; I could not run git and relied on the code being present.
- claude-verify: Whether whisper.py:1396 (_persist_transcript reading settings.transcription.whisper_local) is pre-existing or new in this diff.
- claude-verify: Whether digit_separator.py exists on origin/develop.
- claude-verify: No tests were run; behavior was traced by reading only.
- claude-verify: aligner.align_segment (013) and _detect_language/_speech_seconds (012) were not reviewed in depth, since no finding concerned them.

TOTAL: 5 findings
