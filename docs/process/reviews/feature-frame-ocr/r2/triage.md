# Triage: r2

## Trajectory

This run:
- claude-read: The fixes since r1 are mostly branches for failure handling. The key-frame and rotation fixes add a _ProbeError class, a times_failed state and an _Unreadable branch, and the page reader gains unreachable checks. Each follows a spec failure case rather than a new design. One round removed state: the lru_cache on _is_video. So there is some patching of the failure branches, but I see no repeated pattern of a round adding a prediction that the round before it already added.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 2
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: frame_ocr._read_video starts ffmpeg with stderr=PIPE and never reads stderr, so a stream that writes more than the pipe buffer of error text blocks ffmpeg.
Impact: A damaged video that makes ffmpeg log many decode errors can stop producing frames. The reader then waits the full 120-second stall limit, kills ffmpeg and stores a partial read. Per the spec that partial read is not retried until a manual reindex, so the video's frame text is silently incomplete.
Evidence: addons/intelligence/app/workers/frame_ocr.py, _read_video: subprocess.Popen(command, stdout=PIPE, stderr=PIPE), and the loop only reads process.stdout.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Send stderr to DEVNULL, or to a temporary file, instead of an unread pipe.

</details>

### claude-read:R2 — bucket B, LOW, open

Claim: page_ocr.index_page_ocr calls document.close() and reads document.page_count outside PYMUPDF_LOCK, although every other PyMuPDF call in that reader runs under it.
Impact: Closing a fitz document in the OCR thread while the text task or document-text uses PyMuPDF under the lock is a possible race in a library that is not thread safe. It is rare, but it can crash a worker thread.
Evidence: addons/intelligence/app/workers/page_ocr.py: the finally block calls document.close(), and range(min(document.page_count, MAX_PAGES)) runs outside any 'with PYMUPDF_LOCK'.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Take PYMUPDF_LOCK around page_count and close().

</details>

## Not verified

- claude-read: I did not run any code or tests.
- claude-read: The diff was truncated at 200000 bytes, so I did not read the remaining tests or fixtures.
- claude-read: I did not check requeue_after_whisper's gates against I6.
- claude-read: I did not check the real rotation metadata that ffprobe reports for phone videos.
- claude-read: I did not check the interplay of the forced TEXT_CONTENT enqueue with a text task that is running.
- claude-verify: I did not run anything, so neither the stderr flood nor the PyMuPDF thread behaviour was reproduced.
- claude-verify: I did not check the other invariants (I1-I10) or the rest of the diff.
- claude-verify: I did not read the tests.

TOTAL: 2 findings
