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

Note: citations.py adds an lru_cache(maxsize=1024) on _is_video(file_id). A file that changes type is never refreshed, and the cache is not cleared on purge. This is inside a listed file but it is new behavior.; The routers/document_text.py change adds a DB read to every PDF document-text request.
- claude-read: citations.py adds an lru_cache(maxsize=1024) on _is_video(file_id). A file that changes type is never refreshed, and the cache is not cleared on purge. This is inside a listed file but it is new behavior.
- claude-read: The routers/document_text.py change adds a DB read to every PDF document-text request.
- claude-verify: The routers/document_text.py edit and the updated test counts are not in the touch-point list.

### unspecified_behavior

Note: The routers/document_text.py edit and the updated test counts are not in the touch-point list.
- claude-read: citations.py adds an lru_cache(maxsize=1024) on _is_video(file_id). A file that changes type is never refreshed, and the cache is not cleared on purge. This is inside a listed file but it is new behavior.
- claude-read: The routers/document_text.py change adds a DB read to every PDF document-text request.
- claude-verify: The routers/document_text.py edit and the updated test counts are not in the touch-point list.

## Findings

A: 0
B: 2
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: The diff edits addons/intelligence/app/routers/document_text.py (a new _page_ocr_texts helper and a changed extract_units call), a file that is not in the touch-point list; only app/document_text.py is listed.
Impact: The GET /files/{id}/document-text route now does an extra search.db read for every PDF and passes the stored page texts to the extractor. Reviewers who rely on the touch-point list would not look at this route. If the helper fails or is slow, read_document for PDFs is affected.
Evidence: addons/intelligence/app/routers/document_text.py: new _page_ocr_texts(file_id) querying PdfPageOcrText, and get_document_text calling asyncio.to_thread(_page_ocr_texts, file_id) when mime == document_text.PDF, then passing page_ocr_texts to document_text.extract_units. The touch points name only `app/document_text.py` for stored page texts.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add addons/intelligence/app/routers/document_text.py to the touch points.

</details>

### claude-read:R2 — bucket B, INFO, open

Claim: The diff changes frontend/src/__tests__/core-search-vocabulary.test.ts (a PassageList.tsx caller count and a key-population count) and the addon frontend tests AdminFeaturesSettingsSection.test.tsx and AdminFeaturesSettingsSectionOcr.test.tsx (combobox counts 12 to 14), none of which are in the touch-point list.
Impact: These are count-pinned tests that break whenever a message key or a setting is added. They are not listed, so the list gives no warning that adding a key or setting needs these updates.
Evidence: core-search-vocabulary.test.ts: PassageList.tsx 12 to 13 and used.length 105 to 106; the two admin tests: toHaveLength(12) to toHaveLength(14).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name these count-pinned tests among the touch points.

</details>

## Not verified

- claude-read: The diff was truncated at 200000 bytes, so any file touched after test_frame_page_ocr_queue.py (the rest of the addon tests, other fixtures) was not seen and may include more unlisted places.
- claude-read: I did not open the repository to confirm that the files named in the list exist, or that no other callers of extract_units or PdfExtractor.extract were left unchanged.
- claude-read: I did not assess the correctness of the code against the invariants beyond the scope question.
- claude-verify: The git diff itself, because I have only Read, Glob and Grep and could not see the old values.
- claude-verify: Behaviour of all invariants I1 to I10.
- claude-verify: Test execution.

TOTAL: 2 findings
