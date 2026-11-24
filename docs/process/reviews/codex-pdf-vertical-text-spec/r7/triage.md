# Triage: r7

## Trajectory

This run:
- claude-read: The fix commits since r6 add no branch, state or prediction to production code. 306876dc adds a test for the vertical-dominant form page, which answers the r6 finding that the nested-form test reached only the mixed branch. b7820fde adds one exact-order assertion that pins I11. Nothing was added that an earlier round also added, and nothing was removed. The design is not being patched here: the round only closes a test gap.

Earlier runs:
- r4 / claude-read: Each round adds a defensive branch at one more call site. r2 noted the status readers without a code change. r3 found the bottom-to-top gap and the silent fitz.open skip. Commit 70aa2785 removes one branch, the silent document=None skip in the pymupdf4llm path, replacing it with a raise and a warning, and adds a reopen test. It leaves the identical silent skip in _fitz_chunks (pdf.py:608-609) and the warn-and-continue orientation fallback (pdf.py:97-102) in place. It does not touch the orientation classification that r3 flagged, and the r2 status-reader note is still unaddressed. So this round removed one branch and added a state, but the design is still being patched one failure branch at a time.
- r5 / claude-read: Read in order. r2 and r3 each left a silent-skip or warn-and-continue branch at a different call site: the status readers (r2), the fitz.open skip and bottom-to-top gap (r3), and in r4 the orientation warn-and-continue (pdf.py:97-102 at that commit) plus the nameless-document guard (pdf.py:608-609). 9ffc0839 removes the orientation try/except so the exception reaches VerticalTextError, and adds a test; 271e78b4 removes the doc.name guard by passing the path into _fitz_chunks, and adds a test. Both fixes remove a branch rather than add one, and they answer r4's F2 and F3. The bottom-to-top gap (r3 V1, r4 F1) is not patched: the I2 revision explicitly excludes (0,-1), so it is a declared exclusion and not a branch the design keeps adding. The r2 status-reader note is still open and unaddressed. Overall the last two rounds reduce branches, but the r2 note has not moved."]
- r6 / claude-read: The last two fix commits (169a52c1 and e0a716a5, which carries only the approved I10 invariant into the docs) add no new state or failure branch. The code change is one recursive generator, text_boxes, plus the all_texts=True parameter, and it replaces the single list comprehension. Earlier rounds added or removed failure branches: r4's orientation warn-and-continue and nameless-document guard were removed in 9ffc0839 and 271e78b4. This round closes the open question from r5 about LTFigure text by extending extraction. It adds no defensive branch or retry state. The new test does not reach the predominantly vertical branch. So the design is not being patched by accumulating branches. Each round fixes a distinct case that the earlier review found, and the r2 status-reader note is still unaddressed.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: I did not run the tests, so the expected line list ['NESTEDVERTICALWORD','CHARTLABEL','H'] was not confirmed against real pdfminer output.
- claude-read: I did not re-read pdf.py or the test file in this round; conclusions rest on the diffs given in the prompt.
- claude-read: I did not re-check the r2 status-reader note or the reconciliation retry path.
- claude-read: I did not measure pdfminer cost on long PDFs under PYMUPDF_LOCK.
- claude-verify: I did not read the code at commit facb9a0a. I did not independently check invariants I1-I11 or the tests, because the findings list was empty.

TOTAL: 0 findings
