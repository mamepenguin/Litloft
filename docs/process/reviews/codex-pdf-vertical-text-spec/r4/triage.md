# Triage: r4

## Trajectory

This run:
- claude-read: Each round adds a defensive branch at one more call site. r2 noted the status readers without a code change. r3 found the bottom-to-top gap and the silent fitz.open skip. Commit 70aa2785 removes one branch, the silent document=None skip in the pymupdf4llm path, replacing it with a raise and a warning, and adds a reopen test. It leaves the identical silent skip in _fitz_chunks (pdf.py:608-609) and the warn-and-continue orientation fallback (pdf.py:97-102) in place. It does not touch the orientation classification that r3 flagged, and the r2 status-reader note is still unaddressed. So this round removed one branch and added a state, but the design is still being patched one failure branch at a time.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:F1-bottom-to-top-vertical-not-counted is bucket A or BLOCKER
- open finding claude-read:F2-orientation-read-failure-silently-picks-branch is bucket A or BLOCKER

## Needs a human

### unspecified_behavior

Note: A PyMuPDF orientation read that raises during recovery is handled as an all-horizontal page with only a warning (pdf.py:97-102), and the spec is silent on this case.; Bottom-to-top vertical text (direction (0,-1)) has no defined classification in the spec or the code (pdf.py:110-113).; _fitz_chunks skips vertical recovery silently when doc.name is not a non-empty string (pdf.py:608-609).
- claude-read: A PyMuPDF orientation read that raises during recovery is handled as an all-horizontal page with only a warning (pdf.py:97-102), and the spec is silent on this case.
- claude-read: Bottom-to-top vertical text (direction (0,-1)) has no defined classification in the spec or the code (pdf.py:110-113).
- claude-read: _fitz_chunks skips vertical recovery silently when doc.name is not a non-empty string (pdf.py:608-609).

## Findings

A: 2
B: 1
C: 0

### claude-read:F1-bottom-to-top-vertical-not-counted — bucket A, LOW, open

Claim: recover_vertical_texts counts a PyMuPDF line as vertical only when its direction is (0, 1); a line with direction (0, -1) (bottom-to-top vertical text) is counted in neither bucket.
Impact: On a page whose vertical text runs bottom-to-top, the vertical count stays at zero, so the page is not treated as predominantly vertical and keeps its Markdown and edge lines instead of the complete pdfminer page text required by I2. Vertical boxes are still appended on the mixed path, so the text is usually recovered, but the predominance rule is not applied.
Evidence: addons/intelligence/app/extractors/pdf.py:110-113 tests abs(x)<=0.01 and abs(y-1)<=0.01 for the vertical count and abs(x-1)<=0.01 and abs(y)<=0.01 for the horizontal count; y=-1 matches neither. The branch choice is at pdf.py:115 (counts[0] > counts[1]). The test fixture in test_pdf_vertical_acceptance.py uses rotate=270, which PyMuPDF reports as (0, 1), so no test exercises (0, -1).
Repro: not_reproduced: traced by reading only. A page whose vertical lines have dir (0,-1) and whose horizontal count is larger than its vertical count yields counts [0, n], so the mixed branch is taken; no PDF with bottom-to-top text was run.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Count both vertical directions, for example abs(x) <= 0.01 and abs(abs(y) - 1) <= 0.01, and add a fixture with bottom-to-top vertical text.

</details>

### claude-read:F2-orientation-read-failure-silently-picks-branch — bucket A, LOW, open

Claim: When the PyMuPDF orientation read raises, the code logs a warning, sets blocks to empty and continues, so both counts stay zero and the page takes the mixed path. The page then reports success even though its vertical classification failed.
Impact: A transient or per-page PyMuPDF failure during the vertical step turns a predominantly vertical page into Markdown plus appended boxes, which can silently miss or change text, and the text task is marked successful. I5 requires a vertical extraction exception not to mark the task successful.
Evidence: addons/intelligence/app/extractors/pdf.py:97-102 catches the exception from doc[number-1].get_text('dict') and sets blocks = []; counts remain [0, 0] (lines 90, 110-113); pdf.py:115 then takes the else branch and returns normally; addons/intelligence/app/workers/metadata.py:400-401 only handles VerticalTextError, so index_text_content proceeds to success.
Repro: not_reproduced: traced by reading. Making Page.get_text raise for the 'dict' call with flags on a predominantly vertical page should leave the index successful with only the mixed-path text; not run.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

### claude-read:F3-fitz-fallback-silent-skip — bucket B, INFO, rejected

Claim: The fitz fallback skips vertical recovery without a log or error when the document has no string name, which is the same silent-skip pattern that 70aa2785 removed from the pymupdf4llm path.
Impact: Unreachable in practice: _extract_with_fitz_fallback opens the file with fitz.open(str(path)), so doc.name is the path. Listed only as a remaining inconsistency.
Evidence: addons/intelligence/app/extractors/pdf.py:608-609 guards recover_vertical_texts with hasattr(doc, 'name') and isinstance(doc.name, str) and doc.name, with no else branch. Compare pdf.py:285-292, which now raises VerticalTextError.
Repro: not_reproduced: requires a fitz document without a name, which the code path does not create.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run any tests or extract any PDF; every conclusion comes from reading the code at commit 70aa2785.
- claude-read: The PyMuPDF sign convention for dir (0,-1) versus (0,1) was taken from library knowledge, not from a repository source.
- claude-read: Whether pdfminer's LTTextContainer filter drops any text that the spec requires (for example lone characters in LTFigure or outside containers) was not checked against the pdfminer 20260107 source.
- claude-read: The reconciliation path that re-enqueues text_indexed=0 files (indexer.py) was not traced, so the retry claim is unverified.
- claude-read: The status readers that treat text_indexed=0 as pending (routers/files.py, admin.py, file_find.py, main.py) are unchanged by this commit and were not re-read.
- claude-read: The benchmark requirement and the time cost of pdfminer on long PDFs were not assessed.
- claude-read: _normalise and _is_contained were read but not tested, and the test files other than test_pdf_edge_lines_failures.py were not read.
- claude-verify: Did not execute code or tests; all confirmations rest on reading pdf.py and metadata.py at the given commit.
- claude-verify: Did not verify PyMuPDF's and pdfminer's actual behaviour for rotated-90 text (whether dir is reported as (0,-1) for the relevant fixtures).
- claude-verify: Did not inspect the test files (test_pdf_vertical_acceptance.py and the PDF indexing regression tests) to confirm coverage claims.
- claude-verify: Did not check other callers of recover_vertical_texts or the document-text endpoint in app/document_text.py for the orientation exception behaviour.
- claude-verify: Did not verify the PYMUPDF_LOCK wrapping of each new PyMuPDF call (I8).

TOTAL: 3 findings
