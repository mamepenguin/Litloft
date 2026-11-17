# Triage: r2

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- artifact of claude-read has confidence 60, below 70

## Findings

A: 0
B: 1
C: 0

### claude-read:F1-unlisted-text_indexed-readers — bucket B, INFO, open

Claim: The diff leaves indexed_files.text_indexed at 0 after a failed vertical extraction, and four status readers outside the touch-point list read that flag: routers/files.py, routers/admin.py, file_find.py and main.py.
Impact: A PDF whose vertical extraction fails keeps reporting a pending text state in file listings, admin status and file-search stage output. This is the unindexed state the spec describes, so the reach is unlisted but not a defect.
Evidence: addons/intelligence/app/workers/metadata.py:400-401 returns False on VerticalTextError without setting text_indexed. Readers: addons/intelligence/app/routers/files.py:83 and :118 (state done if row.text_indexed else pending); addons/intelligence/app/routers/admin.py:1001-1002; addons/intelligence/app/file_find.py:50 and :327; addons/intelligence/app/main.py:617. None of these files is in the diff or in the touch-point list.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run the test suite or any extraction; all conclusions come from reading the diff and the repository at its current state.
- claude-read: I did not trace the reconciliation path that is supposed to re-enqueue failed PDFs, so the spec's retry claim is unverified.
- claude-read: I did not read tests/document_text_api.py or tests/test_scanned_pdf_text.py, which the new test imports.
- claude-verify: Whether indexer.py lines 420 and 860 cause repeated re-enqueueing of a file that fails vertical extraction.
- claude-verify: Whether the diff at 282ae06b touches any of the four reader files; I only checked the current working tree against the touch-point list.
- claude-verify: Whether tests cover the VerticalTextError return path.
- claude-verify: Runtime behaviour; I used read-only inspection only.

TOTAL: 1 findings
