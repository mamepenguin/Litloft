# Triage: r5

## Trajectory

This run:
- claude-read: Read in order. r2 and r3 each left a silent-skip or warn-and-continue branch at a different call site: the status readers (r2), the fitz.open skip and bottom-to-top gap (r3), and in r4 the orientation warn-and-continue (pdf.py:97-102 at that commit) plus the nameless-document guard (pdf.py:608-609). 9ffc0839 removes the orientation try/except so the exception reaches VerticalTextError, and adds a test; 271e78b4 removes the doc.name guard by passing the path into _fitz_chunks, and adds a test. Both fixes remove a branch rather than add one, and they answer r4's F2 and F3. The bottom-to-top gap (r3 V1, r4 F1) is not patched: the I2 revision explicitly excludes (0,-1), so it is a declared exclusion and not a branch the design keeps adding. The r2 status-reader note is still open and unaddressed. Overall the last two rounds reduce branches, but the r2 note has not moved."]

Earlier runs:
- r4 / claude-read: Each round adds a defensive branch at one more call site. r2 noted the status readers without a code change. r3 found the bottom-to-top gap and the silent fitz.open skip. Commit 70aa2785 removes one branch, the silent document=None skip in the pymupdf4llm path, replacing it with a raise and a warning, and adds a reopen test. It leaves the identical silent skip in _fitz_chunks (pdf.py:608-609) and the warn-and-continue orientation fallback (pdf.py:97-102) in place. It does not touch the orientation classification that r3 flagged, and the r2 status-reader note is still unaddressed. So this round removed one branch and added a state, but the design is still being patched one failure branch at a time.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: Text placed inside pdfminer LTFigure containers is not iterated: boxes are the top-level LTTextContainer children of the layout (pdf.py:107, 110, 117). On a predominantly vertical page this would drop such text from the 'complete pdfminer page text'. The spec does not say what to do here, and the pdfminer 20260107 source is not available in this review environment, so this is unverified.; A page whose vertical lines run bottom-to-top (0,-1) has an outcome the spec fixes only by exclusion (see F1); the spec does not say whether a human should revisit it.
- claude-read: Text placed inside pdfminer LTFigure containers is not iterated: boxes are the top-level LTTextContainer children of the layout (pdf.py:107, 110, 117). On a predominantly vertical page this would drop such text from the 'complete pdfminer page text'. The spec does not say what to do here, and the pdfminer 20260107 source is not available in this review environment, so this is unverified.
- claude-read: A page whose vertical lines run bottom-to-top (0,-1) has an outcome the spec fixes only by exclusion (see F1); the spec does not say whether a human should revisit it.

## Findings

A: 0
B: 1
C: 0

### claude-read:F1-bottom-to-top-vertical-not-counted — bucket B, LOW, rejected

Claim: recover_vertical_texts counts a PyMuPDF line as vertical only when its direction is (0, 1); a line with direction (0, -1) (bottom-to-top text) is counted in neither bucket, so a page whose vertical text runs bottom-to-top is never classified as predominantly vertical.
Impact: On such a page the complete pdfminer page text is not used; the page keeps its Markdown and edge lines and only pdfminer LTTextBoxVertical boxes not already present are appended. Text is usually still searchable, but the predominance rule is not applied to these pages.
Evidence: addons/intelligence/app/extractors/pdf.py:103-106 tests abs(x)<=0.01 and abs(y-1)<=0.01 for the vertical count and abs(x-1)<=0.01 and abs(y)<=0.01 for the horizontal count; a line with y=-1 matches neither. The branch choice is at pdf.py:108. The acceptance tests use rotate=270 (test_pdf_vertical_acceptance.py), so no test produces (0,-1).
Repro: not_reproduced: traced by reading only; no PDF with bottom-to-top text was run. Expected: a page whose vertical lines are all (0,-1) yields counts [0, n] and takes the mixed branch.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Decide in the spec whether (0,-1) counts as vertical. If it does, count abs(abs(y)-1)<=0.01 for the vertical bucket and add a bottom-to-top fixture.

</details>

## Not verified

- claude-read: I did not run any tests or extract any PDF. All conclusions come from reading the repository at the review commit.
- claude-read: The pdfminer 20260107 source is not in this environment (Glob for pdfminer/converter.py returned nothing), so the LTFigure behaviour, the box order and the LAParams detect_vertical output were not checked against the library.
- claude-read: The PyMuPDF sign convention for dir (0,-1) versus (0,1) was taken from library knowledge, not from a repository source.
- claude-read: I did not read the diff of a2e1e745 by itself; I used the cumulative diff against origin/develop given in the prompt, plus the two fix commits 9ffc0839 and 271e78b4 as listed.
- claude-read: The reconciliation path that re-enqueues text_indexed=0 files (indexer.py) and the status readers (routers/files.py, admin.py, file_find.py, main.py) were not re-read. The r2 finding on them is carried over and still unaddressed by this change.
- claude-read: The benchmark requirement and the lock hold time for long PDFs were not measured.
- claude-read: _normalise (pdf.py:462-466) was read but its markup set _MARKDOWN_MARKUP was not checked against the spec's character list.
- claude-read: Other stub-based regression tests (test_pdf_edge_lines*.py, test_document_text_pymupdf_lock.py, test_extract_unchanged.py) were not read.
- claude-verify: I did not open docs/specs/pdf-vertical-text.md or invariants.md directly. I relied on the r4 revision text quoted in the review request.
- claude-verify: I did not run the code or the tests; the verification is by reading pdf.py only.
- claude-verify: I did not read test_pdf_vertical_acceptance.py, so the claim about rotate=270 was not checked.
- claude-verify: I did not confirm that PyMuPDF reports bottom-to-top lines with direction (0, -1) in practice; this only matters for the spec question, not for the code-reading verdict.

TOTAL: 1 findings
