# Triage: r1

## Trajectory

This run:
- none

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

### claude-read:R1-TP-1 — bucket B, INFO, open

Claim: The change in chunk boundaries also reaches the refine re-chunk path in addons/intelligence/app/workers/refine.py (which calls _build_chunks_from_words and then deletes and rewrites transcript_chunks and their embeddings) and _persist_transcript in workers/whisper.py, but the touch-point list names only _build_chunks_from_words and not these transitive callers or refine.py.
Impact: None at runtime: these callers pass words through unchanged and store whatever chunks come back. A reader working from the list alone could miss that a refine run on an existing transcript rewrites its chunk rows, so boundaries around colon times change for old files when they are refined again, not only for new transcriptions. Spec section 4 covers this as 'written by a transcription or refine run'.
Evidence: addons/intelligence/app/workers/refine.py:318 imports _build_chunks_from_words, :353 calls it, and :380 deletes and re-inserts TranscriptChunk rows. addons/intelligence/app/workers/whisper.py:1398 (_persist_transcript) calls it. addons/intelligence/app/subtitle_builder.py:577 renders WebVTT through build_cues. Every direct caller of is_digit_separator/splits_number (subtitle_builder.py:247,355,480,502,510,526,531 and whisper.py:634) sits inside a listed function. flush_with_rewind is nested in build_cues.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Optionally add refine.py (re-chunk on refine) and whisper._persist_transcript to the touch-point list as transitive callers. No code change.

</details>

## Not verified

- claude-read: I did not run the test suite, so I cannot say whether the new tests pass.
- claude-read: I did not check whether the submodule commit e102ecb contains changes beyond those shown in the diff.
- claude-read: I did not check whether janome's tokenization of colon times changes any expected layout when janome is installed.
- claude-verify: Did not check whether the test oracles in test_digit_separator_breaks.py and test_subtitle_line_split_numbers.py learn ':' and '：'.
- claude-verify: Did not check whether the addon submodule pointer at commit 936030940 matches the working tree I read.
- claude-verify: Did not run any tests; only Read/Grep/Glob were available.

TOTAL: 1 findings
