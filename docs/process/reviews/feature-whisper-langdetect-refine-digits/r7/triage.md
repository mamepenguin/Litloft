# Triage: r7

## Warnings

- R-5 ran at 6a6e24382ac6a5b6c9c6ab22461921bc7bd9652b, and these files changed since: docs/addons/intelligence.md; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: The design is being patched. Round 27fce07 added the first code: a decode branch and a 'no samples' skip branch in `_detect_language` (30 s), and the `is_digit_separator` prediction in the chunker and the cue builder. Round 0521918 added a second skip branch on top of round 1's in the same function: the VAD speech gate with a new threshold state, `_LANG_DETECT_MIN_SPEECH_S`. It also widened the decode window. It extended round 1's 'a ./, between digits is not a break' prediction to a second predicate (`splits_number`) and a new fallback function, `_number_edge`, with its own branches in `_balance_two_lines`. That round also fixed an unrelated, pre-existing aligner bug. Round 9db9b28 added no code branch or state; it adds only a unit test for `splits_number` and drops stale draft rows from INDEX.md. No round removed a branch. The llm.py JSON-mode change that r6 flagged has left this diff because it landed on the base (7918959), not because it was removed.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 1
C: 0

### claude-read:admin-shows-unused-whisper-local-model — bucket B, LOW, open

Claim: The admin GUI's read-only sub-config summary reports `transcription.whisper_local.model` as the whisper_local model. The whisper worker never reads that field; it loads `models.whisper`. This change removes the key from the docs and the example config, so an operator can no longer see where the displayed value comes from.
Impact: An operator who sets `models.whisper` to a different model still sees `openai/whisper-large-v3-turbo` (the dataclass default) in the admin GUI as the local Whisper model, and could think the setting did not take effect. Display only; transcription is unaffected.
Evidence: addons/intelligence/app/routers/admin.py:268 returns `base.whisper_local.model`. addons/intelligence/app/config.py:130 gives `WhisperLocalConfig.model` the default "openai/whisper-large-v3-turbo". config.py:34 holds `models.whisper`, which is what `_ensure_loaded` uses (spec 011 step 3). The diff removes the `model:` line from search-config.yml.example and docs/addons/intelligence.md but leaves the field and the admin read in place.
Repro: not_reproduced
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Have the admin summary show `settings.models.whisper` for whisper_local, or drop the entry.

</details>

## Not verified

- claude-read: I did not run any test or mutation. The kill and survive reasoning above is from reading only.
- claude-read: I did not check that faster-whisper 1.1.0's `get_speech_timestamps` accepts `sampling_rate=` as a keyword, or that its chunks are in samples. I relied on the spec's R-5 measurements.
- claude-read: I did not read `_regroup_ja_with_janome` to see how real janome groups `3` `.` `3` before the digit-separator test.
- claude-read: I did not check whether removing the `punctuation` guard from `ends_soft` in build_cues alone would be caught, because I did not check CueConfig's default min_duration.
- claude-read: I did not check the git history to confirm that 7918959 is reachable from origin/develop; I inferred it from the diff base 6bc45be.
- claude-verify: Whether the admin frontend actually renders the whisper_local.model field.
- claude-verify: docs/addons/intelligence.md contents after the change.
- claude-verify: Any tests that assert the admin summary payload.

TOTAL: 1 findings
