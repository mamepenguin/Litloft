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

## Needs a human

### unspecified_behavior

Note: PDF indexing waits on PYMUPDF_LOCK with no timeout while reads hold it; nothing specifies indexing's behavior there.; read_document applies the search tools' `withoutAvailable` post-processing to the endpoint body.
- claude-read: PDF indexing waits on PYMUPDF_LOCK with no timeout while reads hold it; nothing specifies indexing's behavior there.
- claude-read: read_document applies the search tools' `withoutAvailable` post-processing to the endpoint body.

## Findings

A: 0
B: 4
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The diff changes `mcp-server/src/tools/search.ts`, a file that is not in the touch-point list: it exports `withoutAvailable` and `intelligenceGet`, which were private to the search tools, so `read_document` can reuse them.
Impact: Today the change has no behavioral effect. It does make `read_document`'s request path (URL prefix, the X-Lit-Drive encoding) and its response post-processing (dropping a top-level `available` key) depend on helpers owned by the search tools. A later edit to those helpers for search reasons would silently change `read_document`, and no invariant at this touch point names that coupling. I10 requires the body to be returned 'unchanged in content', and `withoutAvailable` deletes a key.
Evidence: mcp-server/src/tools/search.ts:7 `export function withoutAvailable`, :15 `export function intelligenceGet`; mcp-server/src/tools/documents.ts:2 imports both and wraps the endpoint body in `withoutAvailable(...)`.
Repro: not_reproduced. In a read of the code, the document-text response has no `available` field (addons/intelligence/app/schemas.py DocumentTextResponse), so stripping it is a no-op today.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `mcp-server/src/tools/search.ts` (the shared intelligence request helpers) to the touch points, or call the client directly in documents.ts without `withoutAvailable`.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: The diff adds a new module, `addons/intelligence/app/document_text.py`, which is not in the touch-point list. It holds the reader slots, the PyMuPDF lock acquisition for reads, the per-format unit extraction and the cursor arithmetic (`page_units`).
Impact: Almost all of the logic behind I2, I5 and I8 lives in a module that the touch points do not name. The list names only `app/routers/` (a new module), the extractors and schemas. Invariants were scoped against those places, not against a separate module-level semaphore and lock-acquisition path.
Evidence: addons/intelligence/app/document_text.py:43-45 `_slots = threading.BoundedSemaphore(SLOTS)`; :82-89 `extract_units`; :92-112 `page_units`; :130-137 `_pdf_units` takes `pdf.PYMUPDF_LOCK`; it also reaches the private EPUB internals `epub._ByteBudget`, `epub._read_book` and `epub._encrypted_paths` (:207-213).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `addons/intelligence/app/document_text.py` to the touch points.

</details>

### claude-read:TP-3 — bucket B, LOW, open

Claim: The diff changes `addons/intelligence/Dockerfile.test`, which is not in the touch-point list: it installs PyMuPDF, pymupdf4llm, python-docx, openpyxl and python-pptx into the test image.
Impact: The test image's dependency set changes. The other office libraries are pinned with `>=` rather than to the requirements.txt versions, so the image used to check I9 (extract output unchanged) can drift from production, and the check could pass on library versions that production does not run.
Evidence: addons/intelligence/Dockerfile.test:45-49 `PyMuPDF==1.25.5 pymupdf4llm==0.0.17 "python-docx>=1.1.0" "openpyxl>=3.1.0" "python-pptx>=1.0.0"`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `addons/intelligence/Dockerfile.test` to the touch points; install the readers from requirements.txt so the versions match.

</details>

### claude-read:TP-4 — bucket B, INFO, open

Claim: Through `PYMUPDF_LOCK` in `PdfExtractor.extract`, the diff reaches the indexing worker's text-content path (`app/workers/metadata.py` `index_text_content`, run by `app/indexer.py` in `asyncio.to_thread`). The touch-point list names `pdf.py` only for per-unit text functions shared with `extract()`, not for indexing concurrency.
Impact: PDF indexing now serializes with every PDF read and with other PDF indexing, and it waits on the lock with no timeout. A text-content worker therefore blocks for as long as a read holds the lock (up to 10 page conversions). The human-decided revision covers this intent, but no invariant covers what happens to indexing at that point (for example, that indexing still makes progress, or does not wait without bound).
Evidence: addons/intelligence/app/extractors/pdf.py:64-69 `with PYMUPDF_LOCK:` wraps both the primary and the fallback extraction; app/workers/metadata.py:344 calls `_extract_file_content` → `extractor.extract`; app/indexer.py:1421 `await asyncio.to_thread(index_text_content, ...)`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the indexing text-content worker (PDF extraction under the shared PyMuPDF lock) to the touch points.

</details>

## Not verified

- claude-read: I did not run any tests or builds.
- claude-read: I did not inspect the submodule commit history to confirm the diff shown equals commit 0da36fcf4's tree.
- claude-read: I did not check whether Dockerfile.test's unpinned versions differ from requirements.txt in practice.
- claude-read: I did not deeply verify the correctness of the cursor or EPUB budget logic against I2 and I5; the question was scoped to touch points.
- claude-verify: Could not run git, so whether each change was introduced by the diff (rather than pre-existing) relies on the working tree at HEAD 0da36fcf4, not on a diff against origin/develop.
- claude-verify: Did not check that the addons/intelligence submodule checkout matches the bumped pointer.
- claude-verify: Did not check the invariants I1-I10 themselves.

TOTAL: 4 findings
