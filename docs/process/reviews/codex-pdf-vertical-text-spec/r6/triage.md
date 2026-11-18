# Triage: r6

## Trajectory

This run:
- claude-read: The last two fix commits (169a52c1 and e0a716a5, which carries only the approved I10 invariant into the docs) add no new state or failure branch. The code change is one recursive generator, text_boxes, plus the all_texts=True parameter, and it replaces the single list comprehension. Earlier rounds added or removed failure branches: r4's orientation warn-and-continue and nameless-document guard were removed in 9ffc0839 and 271e78b4. This round closes the open question from r5 about LTFigure text by extending extraction. It adds no defensive branch or retry state. The new test does not reach the predominantly vertical branch. So the design is not being patched by accumulating branches. Each round fixes a distinct case that the earlier review found, and the r2 status-reader note is still unaddressed.

Earlier runs:
- r4 / claude-read: Each round adds a defensive branch at one more call site. r2 noted the status readers without a code change. r3 found the bottom-to-top gap and the silent fitz.open skip. Commit 70aa2785 removes one branch, the silent document=None skip in the pymupdf4llm path, replacing it with a raise and a warning, and adds a reopen test. It leaves the identical silent skip in _fitz_chunks (pdf.py:608-609) and the warn-and-continue orientation fallback (pdf.py:97-102) in place. It does not touch the orientation classification that r3 flagged, and the r2 status-reader note is still unaddressed. So this round removed one branch and added a state, but the design is still being patched one failure branch at a time.
- r5 / claude-read: Read in order. r2 and r3 each left a silent-skip or warn-and-continue branch at a different call site: the status readers (r2), the fitz.open skip and bottom-to-top gap (r3), and in r4 the orientation warn-and-continue (pdf.py:97-102 at that commit) plus the nameless-document guard (pdf.py:608-609). 9ffc0839 removes the orientation try/except so the exception reaches VerticalTextError, and adds a test; 271e78b4 removes the doc.name guard by passing the path into _fitz_chunks, and adds a test. Both fixes remove a branch rather than add one, and they answer r4's F2 and F3. The bottom-to-top gap (r3 V1, r4 F1) is not patched: the I2 revision explicitly excludes (0,-1), so it is a declared exclusion and not a branch the design keeps adding. The r2 status-reader note is still open and unaddressed. Overall the last two rounds reduce branches, but the r2 note has not moved."]

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: all_texts=True applies to every PDF page, and pdfminer 'all_texts' also runs layout analysis on text inside figures. Horizontal figure text on a predominantly vertical page now enters the complete page text. The I10 revision allows this, but the effect on pages with chart or diagram labels was not measured.; On a predominantly vertical page, box.get_text() of figure text boxes is joined in layout order, so figure text order relative to body text is not specified.
- claude-read: all_texts=True applies to every PDF page, and pdfminer 'all_texts' also runs layout analysis on text inside figures. Horizontal figure text on a predominantly vertical page now enters the complete page text. The I10 revision allows this, but the effect on pages with chart or diagram labels was not measured.
- claude-read: On a predominantly vertical page, box.get_text() of figure text boxes is joined in layout order, so figure text order relative to body text is not specified.

## Findings

A: 0
B: 1
C: 0

### claude-read:F1-i10-test-covers-mixed-path-only — bucket B, LOW, open

Claim: The new nested-form test never takes the predominantly vertical branch, so recursion into LTFigure is untested for the whole-page replacement that I10 also requires.
Impact: If recursion into figures broke on the predominantly vertical path (for example a page whose vertical text sits only in a form XObject), no test would fail. Such a page could then hit the empty-page error or lose text.
Evidence: test_pdf_vertical_acceptance.py test_spec_addon_115_i10_recovers_nested_pdf_form_text: each page holds 18 vertical characters (NESTEDVERTICALWORD) against at least 20 horizontal (NESTEDHORIZONTALWORD, plus 'H' or two further lines), so counts[0] > counts[1] (pdf.py:117) is false on both pages and only the append branch (pdf.py:124-134) runs.
Repro: not_reproduced: traced by reading. Mutant: make the else-branch ignore figures while the dominant branch keeps text_boxes; the test still passes.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a case where the form text is vertical-dominant, for example a form with only the vertical label, and assert the complete page text contains it.

</details>

## Not verified

- claude-read: I did not run any test or extraction. The conclusions come from reading pdf.py at the review commit.
- claude-read: I did not check pdfminer 20260107 source for how LTFigure, all_texts and nesting behave, nor whether PyMuPDF reports form-XObject text in get_text('dict') as the test assumes.
- claude-read: I did not re-read the r2 status-reader note or the reconciliation path that re-enqueues text_indexed=0 files.
- claude-read: I did not measure pdfminer cost on long PDFs under PYMUPDF_LOCK.
- claude-verify: I did not run the tests.
- claude-verify: I did not verify that PyMuPDF counts form-XObject text in get_text('dict').
- claude-verify: I did not check the other invariants (I1 to I9) in depth.

TOTAL: 1 findings
