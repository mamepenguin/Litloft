# Triage: r9

## Trajectory

This run:
- claude-read: Read in order. 5b348d9b and b4c88ded only record docs and the R-5 check. ac74bba0 is the only code fix. It changes three handlers that silently skipped an unreadable page text layer into raises of VerticalTextError: the `continue` in _empty_text_pages, the `continue` in _fitz_chunks, and `layer = ""` in _pdf_page. It also adds the dedupe test and the I12 test. This removes branches rather than adding any. Still, it is the same kind of fix that 70aa2785, 9ffc0839 and 271e78b4 made in earlier rounds: each turned a silent skip into a raise, one call site at a time, and this round adds a spec revision (I12) to approve the change. So the failure policy was patched one call site per round. As of this round, every new text-layer and vertical read on the indexing and reader paths fails loudly. The silent skips left are the per-page and whole-document edge-line handling in _page_band_lines and _safe_edge_lines, which SPEC-ADDON-060 declares, and the fitz.open failure in _empty_text_pages, which a later open covers. The round adds no new state or prediction. It closes r8 F1 (dedupe test) and r8 F2 (inconsistent classification).

Earlier runs:
- r4 / claude-read: Each round adds a defensive branch at one more call site. r2 noted the status readers without a code change. r3 found the bottom-to-top gap and the silent fitz.open skip. Commit 70aa2785 removes one branch, the silent document=None skip in the pymupdf4llm path, replacing it with a raise and a warning, and adds a reopen test. It leaves the identical silent skip in _fitz_chunks (pdf.py:608-609) and the warn-and-continue orientation fallback (pdf.py:97-102) in place. It does not touch the orientation classification that r3 flagged, and the r2 status-reader note is still unaddressed. So this round removed one branch and added a state, but the design is still being patched one failure branch at a time.
- r5 / claude-read: Read in order. r2 and r3 each left a silent-skip or warn-and-continue branch at a different call site: the status readers (r2), the fitz.open skip and bottom-to-top gap (r3), and in r4 the orientation warn-and-continue (pdf.py:97-102 at that commit) plus the nameless-document guard (pdf.py:608-609). 9ffc0839 removes the orientation try/except so the exception reaches VerticalTextError, and adds a test; 271e78b4 removes the doc.name guard by passing the path into _fitz_chunks, and adds a test. Both fixes remove a branch rather than add one, and they answer r4's F2 and F3. The bottom-to-top gap (r3 V1, r4 F1) is not patched: the I2 revision explicitly excludes (0,-1), so it is a declared exclusion and not a branch the design keeps adding. The r2 status-reader note is still open and unaddressed. Overall the last two rounds reduce branches, but the r2 note has not moved."]
- r6 / claude-read: The last two fix commits (169a52c1 and e0a716a5, which carries only the approved I10 invariant into the docs) add no new state or failure branch. The code change is one recursive generator, text_boxes, plus the all_texts=True parameter, and it replaces the single list comprehension. Earlier rounds added or removed failure branches: r4's orientation warn-and-continue and nameless-document guard were removed in 9ffc0839 and 271e78b4. This round closes the open question from r5 about LTFigure text by extending extraction. It adds no defensive branch or retry state. The new test does not reach the predominantly vertical branch. So the design is not being patched by accumulating branches. Each round fixes a distinct case that the earlier review found, and the r2 status-reader note is still unaddressed.
- r7 / claude-read: The fix commits since r6 add no branch, state or prediction to production code. 306876dc adds a test for the vertical-dominant form page, which answers the r6 finding that the nested-form test reached only the mixed branch. b7820fde adds one exact-order assertion that pins I11. Nothing was added that an earlier round also added, and nothing was removed. The design is not being patched here: the round only closes a test gap.
- r8 / claude-read: Since r7, the commits that touch this feature are 2da65334 (a snapshot of the vertical-PDF integration rebased onto current develop), 9089edf8 (tests renamed to cite the approved spec id SPEC-ADDON-122 instead of 115, whose id is now taken by the Smart Collection spec) and dbb0060a (a docs record of R-5). Almost all of the other listed commits are unrelated develop work merged in: the Smart Collection id filter, SPEC-ADDON-116 frame requests and the workbench layout. In the product files, this round adds no branch, state or prediction that an earlier round also added, and removes none. As far as I can tell from earlier rounds' line references, `recover_vertical_texts`, the fallback wiring and the metadata error path read as they did in r6 and r7. The earlier history still stands: r3 and r4 added defensive branches; 70aa2785, 9ffc0839 and 271e78b4 replaced silent skips with raises; r6 added the figure recursion. Since then the design has not been patched further. The two open items, the untested containment rule and the scanned-classification difference between indexing and the reader, are test and consistency gaps, not a new accumulation of branches.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/intelligence/app/document_text.py — full: Read lines 120-249: _checked_path, _pdf_units, _pdf_range and _pdf_page. This includes every changed hunk and the functions that enclose it. I also grepped the router's exception handling.
- addons/intelligence/app/extractors/pdf.py — full: Read the whole file (643 lines).
- addons/intelligence/app/workers/metadata.py — full: Read lines 115-174 (_extract_file_content) and 370-489 (index_text_content), which are both changed hunks with the functions that enclose them. I saw the import change at line 32 in the diff.
- addons/intelligence/requirements-test.txt — partial: Read only the one-line diff hunk that adds pdfminer.six==20260107.
- addons/intelligence/requirements.txt — partial: Read only the one-line diff hunk that adds pdfminer.six==20260107.

Test files:
- addons/intelligence/tests/test_pdf_dedupe_122.py — full: New 28-line file, read in full from the diff.
- addons/intelligence/tests/test_pdf_edge_lines_failures.py — partial: Read lines 60-139, which include the changed test.
- addons/intelligence/tests/test_pdf_edge_lines_read_document.py — partial: Read lines 160-204, which include the changed test.
- addons/intelligence/tests/test_pdf_extractor.py — partial: Read only the diff hunks (fake_pdf fixture and _install_fitz).
- addons/intelligence/tests/test_pdf_indexing_e2e.py — partial: Read only the diff hunks (fake_pdf fixture and _stub_fitz).
- addons/intelligence/tests/test_pdf_vertical_acceptance.py — full: New file, read in full from the diff (432 lines).

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: I did not run any test or mutant. Every kill or survive claim above comes from tracing the code by reading.
- claude-read: I did not check that pymupdf4llm 0.0.17 leaves MIXEDLABEL out of its own Markdown for the dedupe fixture. If it included the label, the count()==1 assertion would rely on the stub differently.
- claude-read: I did not trace whether the indexer's reconciliation re-enqueues a PDF that fails permanently in a tight loop.
- claude-read: I read test_pdf_extractor.py and test_pdf_indexing_e2e.py only in their diff hunks.
- claude-read: I did not read the pdfminer 20260107 or PyMuPDF 1.25.5 source.
- claude-verify: I did not run the tests: I have no command execution.
- claude-verify: I did not inspect the git diff between cfa1199c and b4c88ded directly; I reviewed the code state at HEAD only.
- claude-verify: I did not read the database.py rules-version reset logic (I6) or the citation recomputation path (I9).
- claude-verify: I did not review the test files or the documentation changes in docs/process/reviews.

TOTAL: 0 findings
