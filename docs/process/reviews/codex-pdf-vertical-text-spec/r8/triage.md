# Triage: r8

## Warnings

- core.hooksPath is 'unset', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- claude-read: Since r7, the commits that touch this feature are 2da65334 (a snapshot of the vertical-PDF integration rebased onto current develop), 9089edf8 (tests renamed to cite the approved spec id SPEC-ADDON-122 instead of 115, whose id is now taken by the Smart Collection spec) and dbb0060a (a docs record of R-5). Almost all of the other listed commits are unrelated develop work merged in: the Smart Collection id filter, SPEC-ADDON-116 frame requests and the workbench layout. In the product files, this round adds no branch, state or prediction that an earlier round also added, and removes none. As far as I can tell from earlier rounds' line references, `recover_vertical_texts`, the fallback wiring and the metadata error path read as they did in r6 and r7. The earlier history still stands: r3 and r4 added defensive branches; 70aa2785, 9ffc0839 and 271e78b4 replaced silent skips with raises; r6 added the figure recursion. Since then the design has not been patched further. The two open items, the untested containment rule and the scanned-classification difference between indexing and the reader, are test and consistency gaps, not a new accumulation of branches.

Earlier runs:
- r4 / claude-read: Each round adds a defensive branch at one more call site. r2 noted the status readers without a code change. r3 found the bottom-to-top gap and the silent fitz.open skip. Commit 70aa2785 removes one branch, the silent document=None skip in the pymupdf4llm path, replacing it with a raise and a warning, and adds a reopen test. It leaves the identical silent skip in _fitz_chunks (pdf.py:608-609) and the warn-and-continue orientation fallback (pdf.py:97-102) in place. It does not touch the orientation classification that r3 flagged, and the r2 status-reader note is still unaddressed. So this round removed one branch and added a state, but the design is still being patched one failure branch at a time.
- r5 / claude-read: Read in order. r2 and r3 each left a silent-skip or warn-and-continue branch at a different call site: the status readers (r2), the fitz.open skip and bottom-to-top gap (r3), and in r4 the orientation warn-and-continue (pdf.py:97-102 at that commit) plus the nameless-document guard (pdf.py:608-609). 9ffc0839 removes the orientation try/except so the exception reaches VerticalTextError, and adds a test; 271e78b4 removes the doc.name guard by passing the path into _fitz_chunks, and adds a test. Both fixes remove a branch rather than add one, and they answer r4's F2 and F3. The bottom-to-top gap (r3 V1, r4 F1) is not patched: the I2 revision explicitly excludes (0,-1), so it is a declared exclusion and not a branch the design keeps adding. The r2 status-reader note is still open and unaddressed. Overall the last two rounds reduce branches, but the r2 note has not moved."]
- r6 / claude-read: The last two fix commits (169a52c1 and e0a716a5, which carries only the approved I10 invariant into the docs) add no new state or failure branch. The code change is one recursive generator, text_boxes, plus the all_texts=True parameter, and it replaces the single list comprehension. Earlier rounds added or removed failure branches: r4's orientation warn-and-continue and nameless-document guard were removed in 9ffc0839 and 271e78b4. This round closes the open question from r5 about LTFigure text by extending extraction. It adds no defensive branch or retry state. The new test does not reach the predominantly vertical branch. So the design is not being patched by accumulating branches. Each round fixes a distinct case that the earlier review found, and the r2 status-reader note is still unaddressed.
- r7 / claude-read: The fix commits since r6 add no branch, state or prediction to production code. 306876dc adds a test for the vertical-dominant form page, which answers the r6 finding that the nested-form test reached only the mixed branch. b7820fde adds one exact-order assertion that pins I11. Nothing was added that an earlier round also added, and nothing was removed. The design is not being patched here: the round only closes a test gap.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Read coverage

Product files:
- addons/intelligence/app/document_text.py — partial: Read lines 120-239: `_checked_path`, `_pdf_units`, `_pdf_range` and `_pdf_page`, which include every changed hunk and its enclosing functions. Also grepped the router's exception handling.
- addons/intelligence/app/extractors/pdf.py — full: Read the whole file (633 lines).
- addons/intelligence/app/workers/metadata.py — partial: Read lines 115-174 (`_extract_file_content`) and 370-489 (`index_text_content`), which cover both changed hunks and their enclosing functions. The import change at line 32 was seen through grep.
- addons/intelligence/requirements-test.txt — partial: Read only the one-line diff hunk that adds pdfminer.six==20260107; did not open the file.
- addons/intelligence/requirements.txt — partial: Read only the one-line diff hunk that adds pdfminer.six==20260107; did not open the file.

Test files:
- addons/intelligence/tests/test_pdf_edge_lines_failures.py — partial: Read lines 60-139, which include the changed test and its neighbours.
- addons/intelligence/tests/test_pdf_extractor.py — partial: Read lines 36-235, which include the changed fixture and `_install_fitz` and the tests that use them.
- addons/intelligence/tests/test_pdf_indexing_e2e.py — partial: Read only the two diff hunks (the fake_pdf fixture and `_stub_fitz`).
- addons/intelligence/tests/test_pdf_vertical_acceptance.py — full: New file; read in full from the diff (393 lines).

## Needs a human

### unspecified_behavior

Note: Indexing and reading classify a page differently when PyMuPDF raises get_text('text') on it: indexing treats it as non-scanned and fails the whole file, while reading treats it as scanned and skips recovery (F2).
- claude-verify: Indexing and reading classify a page differently when PyMuPDF raises get_text('text') on it: indexing treats it as non-scanned and fails the whole file, while reading treats it as scanned and skips recovery (F2).

## Findings

A: 0
B: 2
C: 0

### claude-read:F1-containment-rule-untested — bucket B, LOW, open

Claim: No test exercises the mixed-page rule that drops a vertical box whose normalized text is already in the assembled page text, so removing the `_is_contained` check leaves every test green.
Impact: If the de-duplication regressed, a vertical line already present in the page text would be indexed twice. One example is a vertical label that crosses the top or bottom 50 pt band: `_page_band_lines` recovers lines in any direction, so the edge recovery already holds it. The duplicate would reach chunks, `pdf_markdown` and `read_document`, and no test would catch it.
Evidence: addons/intelligence/app/extractors/pdf.py:130-133 is the only place the I2 'not already present' rule is applied. In tests/test_pdf_vertical_acceptance.py, the mixed-page fixtures put MIXEDLABEL (vertical_pdf page 2) and NESTEDVERTICALWORD (nested.pdf page 2) on pages whose Markdown does not contain them, and both tests assert only `word in text`. pdf.py:380-396 shows that `_page_band_lines` does not filter by line direction, so a vertical band line can already be in the edge text.
Repro: Mutation, traced by reading and not run: replace `if _normalise(part) and not _is_contained(part, _normalise(text)):` with `if _normalise(part):`. Every assertion in test_pdf_vertical_acceptance.py stays true because each one checks presence, not single occurrence. The one exact-text assertion, `splitlines() == [...]`, is on the dominant branch, which this mutation does not touch.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a mixed page whose vertical label lies in the top band, or is otherwise already in the Markdown, and assert that the label appears exactly once in that page's indexed and on-demand text.

</details>

### claude-read:F2-unreadable-page-diverges-between-index-and-reader — bucket B, LOW, open

Claim: When PyMuPDF raises on one page's `get_text`, indexing classifies the page as non-scanned and runs vertical recovery on it, while the document reader classifies the same page as scanned and skips recovery. The two paths therefore diverge, and the whole PDF's text task now fails on that one page.
Impact: In a PDF where one page's text layer cannot be read by PyMuPDF, recovery's `get_text("dict")` on that page is likely to raise as well. That raises VerticalTextError for the whole file. Before this change such a file was indexed from the PyMuPDF4LLM text. Now a new file of this kind is never indexed and an existing one keeps its old index forever with `text_indexed` = 0, while `read_document` on the same page succeeds. Spec item 4 requires the indexed and on-demand text of an unchanged page to agree.
Evidence: addons/intelligence/app/extractors/pdf.py:316-320: `_empty_text_pages` hits `continue` on an exception, so the page is not added to `scanned`. pdf.py:102-104 then calls `get_text("dict")` on it, and any exception becomes VerticalTextError at pdf.py:135-140. metadata.py:400-401 returns False for the whole file. In app/document_text.py:196-200 the same exception gives `layer = ""` and `scanned = True`, and lines 219-226 then pass `{number}` as a scanned page, so recovery is skipped.
Repro: not_reproduced: requires a PDF page on which PyMuPDF `get_text` raises. Traced by reading only.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Classify a page whose text-layer read raises the same way in `_empty_text_pages` and in `_pdf_page`.

</details>

## Not verified

- claude-read: I did not run any test, mutation or extraction. All conclusions come from reading the code in the working tree, with the submodule at the reviewed commit.
- claude-read: I did not check that the product code is byte-identical to the code reviewed in r7. I inferred that it is unchanged from the earlier rounds' line references and from the diff.
- claude-read: I did not trace whether the indexer's reconciliation (indexer.py:878-905) re-enqueues a permanently failing PDF in a tight loop.
- claude-read: I did not check PyMuPDF's direction convention for rotated pages or for invisible (render mode 3) text against library source.
- claude-read: I did not read pdfminer 20260107 source for page enumeration, LTFigure handling or `detect_vertical` heuristics.
- claude-read: I did not read test_pdf_indexing_e2e.py beyond the diff hunks, nor test_extract_unchanged.py or tests/document_text_api.py.
- claude-read: I did not measure lock hold time or pdfminer cost on long PDFs.
- claude-verify: I did not run the test suite or the remove-_is_contained mutant; F1 is confirmed by reading the code only.
- claude-verify: I did not check whether pdfminer's detect_vertical grouping produces LTTextBoxVertical for any of the horizontal-only fixtures in test_pdf_edge_lines.py.
- claude-verify: I did not check whether pymupdf4llm's Markdown output contains rotated text such as MIXEDLABEL.
- claude-verify: I did not check whether get_text('dict') really raises on a page where get_text('text') raised.

TOTAL: 2 findings
