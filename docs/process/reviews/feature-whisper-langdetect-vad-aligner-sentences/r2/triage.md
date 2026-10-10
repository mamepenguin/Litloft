# Triage: r2

## Warnings

- R-5 ran at bcb8231f50e0079ce8585eafb337e487efd500dc, and these files changed since: docs/addons/intelligence.md; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: Reading the record in order: 79189595 removed r1's C finding by moving the llm.py JSON-mode fallback into its own approved spec (SPEC-ADDON-008) and merging it to develop. That shrank the diff and added no new branch. On language detection, each round has added another gate to the same path. 009 added the decode and the 'no samples' INFO skip. The 012 draft added a VAD 'no speech' skip. The spec review then turned that into a threshold (`_LANG_DETECT_MIN_SPEECH_S` = 1.0 s), and 052191802 implemented it with the window raised from 30 s to 120 s and `vad_filter=True`. That is a second prediction (speech below 1 s gives an unreliable answer) stacked on the first (the opening 30 s is speech). So the detection design is being patched round by round. For number splitting, 010 added the `is_digit_separator` rule for cue ends; 014 added a second rule (`splits_number`) and a fallback chain in `_number_edge` (start, then end, then one line) for line splits, again a patch on the same idea. The reviewed commit 9db9b28d8 adds no branch or state: it only adds a direct `splits_number` test and removes the stale duplicate INDEX rows.

Earlier runs:
- none

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: Times written in digits with a colon (12:30, 12：30) can be split across lines or across cues, because ':' and '：' are soft punctuation and are not treated as part of a number.
- claude-verify: Times written in digits with a colon (12:30, 12：30) can be split across lines or across cues, because ':' and '：' are soft punctuation and are not treated as part of a number.

## Findings

A: 0
B: 1
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: A time written in digits with a colon (`12:30`) is still split by the CJK line splitter and by cue boundaries, because `:`/`：` are in `_PUNCT_SOFT` and neither `splits_number` nor `is_digit_separator` treats a colon between digits as part of a number.
Impact: A Japanese cue such as `午後12:30に集合しましょう…` that crosses half the soft width at the colon is rendered `午後12:` / `30に集合…` on two lines, and in character-row transcripts `build_cues` can end a cue at `12:`. This is the same visual defect R-5 reported for `3.3`. It becomes more frequent now that SPEC-ADDON-010's prompt asks the LLM to write times in Arabic digits.
Evidence: addons/intelligence/app/subtitle_builder.py:47 `_PUNCT_SOFT = frozenset(",、;:：；")`. In subtitle_builder.py:498-504 the soft-punctuation scan skips a position only when `splits_number(text, i + 1)` is true, and addons/intelligence/app/digit_separator.py:5 limits `_SEPARATORS` to `.,`, so a `:` at i with digits on both sides is accepted as the split.
Repro: not_reproduced. Traced by hand: `_balance_two_lines({'text': 'あいうえお12:30かきくけこさしすせ', ...}, 14)`. The scan reaches ':' at index 7, where `_display_width(text[:8]) >= 7`; `splits_number(text, 8)` returns False because text[8]='3' and before[-1]=':' is not in `_SEPARATORS`. The result is `あいうえお12:` / `30かきくけこさしすせ`.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> If a person decides it is in scope, treat a `:` between two digits as inside a number in both `splits_number` and `is_digit_separator`, or leave it to a separate spec.

</details>

## Not verified

- claude-read: Did not run any test; read-only review.
- claude-read: Could not confirm that faster-whisper 1.1.0's `get_speech_timestamps` accepts `sampling_rate` as a keyword; the package is not installed in the repository tree.
- claude-read: Did not check how real janome tokenizes `3.3` or `1,500`; the post-move check is position-based, so I assumed the tokenization does not matter.
- claude-read: Did not read refine.py to confirm that no other caller still assumes a single WhisperX segment.
- claude-verify: I did not execute any code or tests; the reproduction is a manual trace only.
- claude-verify: I did not confirm through git history whether ':' in _PUNCT_SOFT predates this branch.
- claude-verify: I did not verify invariants I1-I6 (whisper.py, aligner.py).
- claude-verify: I did not check the janome boundary path with colon times.

TOTAL: 1 findings
