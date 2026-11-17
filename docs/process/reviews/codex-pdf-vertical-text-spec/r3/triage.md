# Triage: r3

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- artifact of claude-verify has confidence 68, below 70

## Findings

A: 2
B: 0
C: 0

### claude-verify:V1 — bucket A, LOW, open

Claim: Page orientation counting in recover_vertical_texts only treats line direction (0,1) as vertical; a line with direction (0,-1) (bottom-to-top vertical text) is counted as neither vertical nor horizontal.
Impact: On a page whose vertical text runs bottom-to-top, the vertical count can stay at zero, so the page is never treated as predominantly vertical and the edge-line/Markdown assembly is kept (I2 branch choice may be wrong). The mixed-page path still appends LTTextBoxVertical boxes, so text is usually recovered, but the predominance rule is not applied as specified.
Evidence: addons/intelligence/app/extractors/pdf.py:110-113 tests abs(x)<=0.01 and abs(y-1)<=0.01 for the vertical count and abs(x-1)<=0.01 and abs(y)<=0.01 for the horizontal count; a y of -1 matches neither branch. Direction sign convention taken from PyMuPDF knowledge, not from the repository's tests.
Repro: not_reproduced: static reading only; no PDF with bottom-to-top vertical text was available to run.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Count both (0,1) and (0,-1) as vertical, e.g. abs(x) <= 0.01 and abs(abs(y) - 1) <= 0.01, and add a fixture with bottom-to-top vertical text.

</details>

### claude-verify:V2 — bucket A, LOW, open

Claim: In _extract_with_pymupdf4llm, if fitz.open(path) fails, the vertical recovery step is silently skipped and the page texts from pymupdf4llm/pdfminer-less edge assembly are returned as a successful result.
Impact: Vertical boxes are silently absent from indexed text for that document, with no warning and no failure, which can break I1 for such files. Probability is low because pymupdf4llm opens the same file.
Evidence: addons/intelligence/app/extractors/pdf.py:283-291: except Exception sets document = None, and the recover_vertical_texts call runs only if document is not None; no logger call on this branch.
Repro: not_reproduced: requires a PDF that pymupdf4llm reads but fitz.open rejects; not constructed.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Log a warning and raise VerticalTextError when fitz.open fails on a page that needs recovery, or treat it the same as a recovery exception.

</details>

## Not verified

- claude-read: I did not run tests or git commands; the diff was taken as given in the prompt.
- claude-read: I did not confirm that tests/document_text_api.py, tests/test_scanned_pdf_text.py and the .claude rule files exist or are unchanged.
- claude-read: I did not check whether the submodule bump is considered in scope by the process documents.
- claude-verify: No tests were run, and no PDF fixtures were executed.
- claude-verify: _normalise and _is_contained helper bodies were not read, so the containment rule for mixed pages (I2) was not verified.
- claude-verify: The document-text endpoint's handling of VerticalTextError (I5 read failure) was not traced beyond the raise sites.
- claude-verify: PyMuPDF line direction sign convention for (0,-1) was taken from library knowledge, not from a repository source.
- claude-verify: The 500-page cap, the PYMUPDF_LOCK timeout path (I8) and the citation recomputation (I9) were only partly read.

TOTAL: 2 findings
