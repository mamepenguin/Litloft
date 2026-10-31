# Triage: r1

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

Note: whisper_local now records a failed job with error_class FatalError, keeps whisper_indexed false and re-queues on each scan with no attempt cap when faster-whisper raises TypeError, AttributeError or ImportError. No spec states this.; IndexError, RuntimeError, ValueError and every other exception stay zero-segment successes, and the new test pins that for RuntimeError and ValueError. No spec states which failures count as undecodable input (see CR-2).; For Media Import temp audio, a dependency contract error now ends as a failed job with the audio deleted and whisper_indexed true (see CR-4).
- claude-read: whisper_local now records a failed job with error_class FatalError, keeps whisper_indexed false and re-queues on each scan with no attempt cap when faster-whisper raises TypeError, AttributeError or ImportError. No spec states this.
- claude-read: IndexError, RuntimeError, ValueError and every other exception stay zero-segment successes, and the new test pins that for RuntimeError and ValueError. No spec states which failures count as undecodable input (see CR-2).
- claude-read: For Media Import temp audio, a dependency contract error now ends as a failed job with the audio deleted and whisper_indexed true (see CR-4).
- claude-verify: The split between FatalError (TypeError, AttributeError, ImportError) and an empty success (all other exceptions) at app/workers/whisper.py:546-563 is stated by no spec.
- claude-verify: A failed job on an already-indexed file keeps the old transcript but sets Transcription to Pending, and each scan re-queues it (decisions.md R-5 step 5). No spec states this.

### unspecified_behavior

Note: The split between FatalError (TypeError, AttributeError, ImportError) and an empty success (all other exceptions) at app/workers/whisper.py:546-563 is stated by no spec.; A failed job on an already-indexed file keeps the old transcript but sets Transcription to Pending, and each scan re-queues it (decisions.md R-5 step 5). No spec states this.
- claude-read: whisper_local now records a failed job with error_class FatalError, keeps whisper_indexed false and re-queues on each scan with no attempt cap when faster-whisper raises TypeError, AttributeError or ImportError. No spec states this.
- claude-read: IndexError, RuntimeError, ValueError and every other exception stay zero-segment successes, and the new test pins that for RuntimeError and ValueError. No spec states which failures count as undecodable input (see CR-2).
- claude-read: For Media Import temp audio, a dependency contract error now ends as a failed job with the audio deleted and whisper_indexed true (see CR-4).
- claude-verify: The split between FatalError (TypeError, AttributeError, ImportError) and an empty success (all other exceptions) at app/workers/whisper.py:546-563 is stated by no spec.
- claude-verify: A failed job on an already-indexed file keeps the old transcript but sets Transcription to Pending, and each scan re-queues it (decisions.md R-5 step 5). No spec states this.

## Findings

A: 0
B: 5
C: 0

### claude-read:CR-2 — bucket B, MEDIUM, open

Claim: Failures other than TypeError, AttributeError and ImportError still close as a zero-segment succeeded job with whisper_indexed set to true, including environmental and dependency failures that are not about the input.
Impact: If a future dependency break, an inference runtime error, a MemoryError or a transient read error from a drive surfaces as any other exception type, every affected file silently shows a succeeded transcription with no text, and it is not re-queued. On Regenerate the old transcript stays while the job reports success. For a file over the 50 MB cap, one failed chunk becomes a silent gap in an otherwise normal transcript. This is the same silent wrong result the fix targets, narrowed to one exception family.
Evidence: app/workers/whisper.py:552-563 returns [] for IndexError, RuntimeError and any other Exception. app/workers/whisper.py:1394-1400 (_persist_transcript) then sets whisper_indexed=True and finishes the job as succeeded. app/workers/transcription/splitting_transcriber.py:179-190 accepts an empty chunk result and continues. tests/test_whisper_local_provider.py test_undecodable_input_stays_an_empty_result pins RuntimeError('decode failed') and ValueError to [] under the name 'undecodable input'; the code does not distinguish undecodable input from these other causes.
Repro: not_reproduced as a running job. By reading: make model.transcribe raise RuntimeError or OSError twice, and _transcribe_sequential returns [] (the RuntimeError half is asserted by the new test); _persist_transcript with [] then records success.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Decide whether only exceptions positively identified as bad input (no audio stream, invalid data) should produce an empty result, with everything else failing the job.

</details>

### claude-read:CR-3 — bucket B, LOW, open

Claim: No test or gate fails if the av pin is removed or changed, because the test image does not install faster-whisper or av and the test suite stubs faster_whisper.
Impact: Deleting or bumping av==18.1.0 passes CI, and the regression returns at the next image rebuild. The new FatalError then makes it visible as failed jobs, but only after the rebuild and only once transcription runs. Any other unpinned transitive dependency of faster-whisper has the same exposure.
Evidence: addons/intelligence/Dockerfile.test:23-28 copies requirements.txt but installs a fixed lightweight list without it. tests/conftest.py:23 lists faster_whisper among the stubbed modules. A search of tests/ for requirements.txt, importlib.metadata and av stubs finds only an unrelated comment in test_gemini_provider.py:45. The new tests raise the TypeError from a MagicMock, so they exercise the classification and not the real av.open contract. The real contract was exercised only by hand (decisions.md, R-5 step 5).
Repro: not_reproduced; mutation by reading: remove av==18.1.0 from requirements.txt. No test reads that file or imports av, so the suite would stay green.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a check in a built production image (the existing build or a smoke step) that calls faster_whisper.audio.decode_audio on a short generated file.

</details>

### claude-read:CR-4 — bucket B, LOW, open

Claim: A dependency contract error during Media Import temp-audio transcription now takes the one-shot failure path, which deletes the temp audio and sets whisper_indexed to true, so restoring the dependency does not retry that file.
Impact: During a dependency break, each Media Import speech-to-text attempt ends as a failed job and its audio is gone; the file is not re-queued by a later scan, unlike normal media. The user must request the temp audio again after fixing the image. The audio was deleted before this change too, and the failure is now visible, so this is a narrow residual. The new comment's premise that the error is global and not about the file is not applied on this path.
Evidence: app/workers/whisper.py:989-995: on success=False with a loft temp path, _mark_loft_stt_temp_consumed runs, and the finally block deletes the temp file. app/workers/whisper.py:150-166 sets whisper_indexed=True. tests/test_whisper_skip_jobrecord.py:259-294 pins this for a provider FatalError in general. decisions.md R-5 steps do not exercise a .loft file under the av break.
Repro: not_reproduced as a running job; by reading: a .loft with an adjacent .stt_temp.m4a and model.transcribe raising TypeError leads to FatalError, a False return from _do_transcribe_and_index, then consumption and deletion.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:CR-5 — bucket B, LOW, open

Claim: The new except clause classifies by exception type across the whole attempt body, so any file-specific TypeError or AttributeError, including one from the project's own loop or from faster-whisper's lazy segment generator, is reported as a permanent failure and fails the entire file.
Impact: If such an error is specific to one file or chunk, it no longer closes as empty. Earlier chunks of a split file are discarded, the message blames faster-whisper even if the cause is local code, and because whisper_indexed stays false the file is re-transcribed on every scan with no attempt cap, while summaries and auto-tags wait. I found no concrete input that does this; the R-5 corrupt, no-audio and silent files did not hit it.
Evidence: app/workers/whisper.py:489-551: the try covers kwargs construction, model.transcribe, info access and segment iteration; the handler at :546 raises FatalError with a fixed 'faster-whisper could not run' prefix. splitting_transcriber.py:179 lets FatalError discard segments_all. decisions.md R-5 step 5 records the re-queue after a scan (attempts 2).
Repro: not_reproduced; no real input was found that raises these types per file. Mutation by reading: a segments_iter that yields normally and then raises AttributeError on chunk N of a split file loses chunks 0..N-1 and fails the job.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:CR-1 — bucket B, INFO, open

Claim: No touch-point list or stated correct behavior exists for this bug fix, so every place the diff reaches is undeclared and the first-review question cannot resolve to 'the list was complete'.
Impact: The change turns a zero-segment success into a failed job for all whisper_local files, in addition to the dependency pin, and no document states which paths were meant to change. A later reader cannot tell intended reach from accidental reach. No runtime defect follows from this by itself.
Evidence: docs/process/reviews/fix-whisper-av-pin/ holds decisions.md and r1/ only, with no invariants.md. A search of docs/ for metadata_errors, av== and whisper-av-pin matches only that decisions.md. docs/specs/INDEX.md has no row for this fix. docs/process/workflow.md:69 says a bug fix states the correct behavior as a SPEC or UNSPEC. Reached and undeclared: addons/intelligence/requirements.txt:26 (production image dependency set); app/workers/whisper.py:546 and its fallback caller at :473; retry.py:209; splitting_transcriber.py:179; whisper.py:1099 (failed JobRecord and WS event); whisper.py:991-992 (loft temp consumption); evals_transcription/runner.py:309.
Repro: not_reproduced; established by reading the review directory, the specs ledger and the call chain.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> State the correct behavior as a SPEC or UNSPEC with the touch points listed above.

</details>

## Not verified

- claude-read: No tests were run and no code was executed; this reviewer has Read, Glob and Grep only.
- claude-read: The source of faster-whisper 1.1.0, 1.2.1 and av 18 and 19 is not available in the repository, so the claim about the metadata_errors argument and the requirements.txt comment about 1.2.1 were not checked.
- claude-read: Whether any real input raises TypeError or AttributeError per file in faster-whisper (CR-5).
- claude-read: Compatibility of av==18.1.0 with the rest of the dependency set; only the R-5 record's pip check result was read.
- claude-read: The splitter path over 50 MB under the pin, which decisions.md records as skipped, and the frontend rendering of failed jobs beyond what decisions.md describes.
- claude-read: The R-5 evidence files under the scratch directory and whether decisions.md describes them accurately.
- claude-read: The .claude/rules/ files were not read, since this change touches no drive boundary, Internal API or visual code.
- claude-verify: No command was run: tests, the build and pip resolution were not executed. Code was read in the working tree, and the submodule HEAD c5b864d3981b82a365dd7d07da81c66a3ccc8675 was matched only against the build recorded in decisions.md, not against the tree of 917da44d6.
- claude-verify: The source of faster-whisper and av was not available, so the claim in the requirements.txt comment about av 19 and faster-whisper 1.2.1 is unchecked, as is whether faster-whisper raises TypeError or AttributeError on specific files.
- claude-verify: The R-5 results in decisions.md were read as recorded and not reproduced, including the screenshots and logs under the scratchpad path.
- claude-verify: Gates outside .github/, addons/intelligence/.github/ and scripts/ were not searched for a pin check.

TOTAL: 5 findings
