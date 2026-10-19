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

Note: llm.py: the JSON-mode latch is per client and permanent once set. A transient 400 on a json_object request whose resend succeeds disables JSON mode and the empty-body retry for every later call on that client.; llm.py: the json_mode equality check means a json_object dict with extra keys is not treated as JSON mode.
- claude-read: llm.py: the JSON-mode latch is per client and permanent once set. A transient 400 on a json_object request whose resend succeeds disables JSON mode and the empty-body retry for every later call on that client.
- claude-read: llm.py: the json_mode equality check means a json_object dict with extra keys is not treated as JSON mode.
- claude-verify: The JSON-mode latch in llm.py (cited as SPEC-ADDON-008) has no spec document under docs/.
- claude-verify: The 1 s VAD speech gate in _detect_language is not among the declared invariants for this review.

### unspecified_behavior

Note: The JSON-mode latch in llm.py (cited as SPEC-ADDON-008) has no spec document under docs/.; The 1 s VAD speech gate in _detect_language is not among the declared invariants for this review.
- claude-read: llm.py: the JSON-mode latch is per client and permanent once set. A transient 400 on a json_object request whose resend succeeds disables JSON mode and the empty-body retry for every later call on that client.
- claude-read: llm.py: the json_mode equality check means a json_object dict with extra keys is not treated as JSON mode.
- claude-verify: The JSON-mode latch in llm.py (cited as SPEC-ADDON-008) has no spec document under docs/.
- claude-verify: The 1 s VAD speech gate in _detect_language is not among the declared invariants for this review.

## Findings

A: 0
B: 5
C: 0

### claude-read:unplanned-llm-json-mode-fallback — bucket B, MEDIUM, open

Claim: The submodule bump changes `addons/intelligence/app/llm.py` (a client-wide latch `_json_mode_rejected`, a resend without `response_format` after a 400, and the empty-body retry gated on the latch). The touch-point list does not name this file, and no spec in `docs/specs/` covers it: the tests cite SPEC-ADDON-008, but that id appears nowhere under `docs/`.
Impact: Every JSON LLM call on the `_generate_result` path changes behaviour, including refine, summaries and tags. After one 400 to a json_object request whose resend succeeds, the client stops sending JSON mode for the rest of its life and skips the empty-body retry. This change has no spec and no declared invariant, so nothing approved it and no reviewer is pointed at it.
Evidence: addons/intelligence/app/llm.py:577-582 (the JSON-mode flag and the latch read), :608-614 (the latch is set after a successful resend), :650-668 (the 400 resend), :1242 (the empty-body retry is skipped once latched). A Grep for `SPEC-ADDON-008`, `json_object` and `_json_mode_rejected` under docs/ returns no files. docs/specs/INDEX.md lists no SPEC-ADDON-008 row.
Repro: Read-only: diff the submodule c614a26..d9f5b23 for app/llm.py and tests/test_llm.py (+516 lines, class TestJsonModeFallback). Compare with the touch points of whisper-langdetect-refine-digits.md and whisper-langdetect-vad-aligner-sentences.md: neither names llm.py.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either drop the llm.py and test_llm.py changes from this submodule bump, or give SPEC-ADDON-008 its own approved spec and INDEX row and review it under that spec.

</details>

### claude-read:unplanned-llm-comment-detached — bucket B, LOW, open

Claim: The new `_JSON_OBJECT_FORMAT` constant was inserted between the comment that explains `_RESPONSE_FORMAT_SUSPECT_FAILURES` and that set. The comment ('Failures that came from a 400 ...') now sits above the wrong constant.
Impact: A reader could take the failure-set rationale as describing `_JSON_OBJECT_FORMAT`, and misjudge it when editing either constant. Prose only; runtime behaviour is unaffected.
Evidence: addons/intelligence/app/llm.py:349-358: the comment block at 349-355 is followed by `_JSON_OBJECT_FORMAT = {"type": "json_object"}` at 356, then a blank line, then `_RESPONSE_FORMAT_SUSPECT_FAILURES` at 358.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Move `_JSON_OBJECT_FORMAT` above the comment block (or below the frozenset) so the comment sits directly on the set it describes.

</details>

### claude-read:unplanned-aligner-segments — bucket B, INFO, open

Claim: `addons/intelligence/app/workers/aligner.py` (`align_segment` now concatenates the rows of every WhisperX segment) and `tests/test_refine_aligner_sentences.py` are changed. Neither is in the touch-point list of the declared invariants (009/010/011); only the later spec SPEC-ADDON-013 names them.
Impact: Refine's word rows change for every multi-sentence chunk in a language that Punkt splits. The declared invariants I1–I9 do not check this behaviour; it rests only on the 012–014 invariants, which the declared set carries over only for I2.
Evidence: aligner.py hunk at about line 159: `items = [item for seg in segments if isinstance(seg, dict) for item in (seg.get(key) or [])]`. The touch points in docs/specs/whisper-langdetect-refine-digits.md list no aligner.py.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Review it against SPEC-ADDON-013 I5/I6, or add those invariants to this topic's invariants.md revisions.

</details>

### claude-read:unplanned-balance-two-lines-and-digit-module — bucket B, INFO, open

Claim: The diff adds a new module `addons/intelligence/app/digit_separator.py` (`is_digit_separator`, `splits_number`) and changes `subtitle_builder._balance_two_lines` plus a new `_number_edge`. Neither is in the declared touch-point list: 010 names only `_build_chunks_from_words` and the punctuation-end and safe-break tests in `build_cues`.
Impact: The in-cue line layout of every two-line subtitle now depends on `splits_number`, and declared I9 does not cover that layout. The shared helper module is also outside the list, so a change to it reaches both chunking (I8) and cues (I9).
Evidence: subtitle_builder.py `_balance_two_lines` hunks (the space path merges words joined by a digit separator; the CJK path calls `splits_number` and `_number_edge`). The new file is app/digit_separator.py. The touch points in whisper-langdetect-refine-digits.md do not mention either.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:unplanned-whisper-vad-helpers — bucket B, INFO, open

Claim: `whisper.py` gains `_decode_detection_sample`, `_speech_seconds` and the constants `_LANG_DETECT_SECONDS=120` and `_LANG_DETECT_MIN_SPEECH_S`. These go beyond the 009 touch point (`_detect_language`) and belong to SPEC-ADDON-012. Of 012, only revised I2 is carried into the declared invariants; the 1 s speech gate is not.
Impact: A file with less than 1 s of VAD speech in its first 120 s now gets no prompt, and no declared invariant here checks that gate. Declared I1 still describes detection without it.
Evidence: whisper.py hunk at about lines 284-343: `_speech_seconds` imports faster_whisper.vad, and `_detect_language` returns None when `speech < _LANG_DETECT_MIN_SPEECH_S`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I could not run git, so I did not check whether the llm.py change is already on origin/develop through another submodule commit; I relied on the diff as given.
- claude-read: I did not check whether SPEC-ADDON-008 exists in another branch or in the addon repository's own docs.
- claude-read: I did not run any tests.
- claude-read: I did not check the invariants I1–I9 in depth for correctness; the question asked only about places outside the touch points.
- claude-verify: Did not run git diff against origin/develop to confirm that each hunk falls inside the reviewed commit range; I verified only the working-tree state at HEAD.
- claude-verify: Did not run any tests.
- claude-verify: Did not check whether a SPEC-ADDON-008 spec exists in the addon submodule's own history or on another branch.

TOTAL: 5 findings
