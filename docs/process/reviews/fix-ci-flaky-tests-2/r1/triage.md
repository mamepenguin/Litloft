# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- frontend/e2e-components/justified-hold-desktop.spec.ts — full: Read lines 1-300: the changed hunk at 273-280, its enclosing test (247-280) and the helpers it uses.
- frontend/e2e-epub/typography.spec.ts — full: Read the whole file (1-353), including the changed turnTimes at 94-102 and its callers.

Test files:
- frontend/src/__tests__/inboxActions.test.tsx — partial: Read lines 290-339, which hold the changed hunk at 326 and its enclosing test.
- frontend/src/components/__tests__/FileActions.test.tsx — partial: Read lines 880-919, which hold the changed hunk at 910-913 and its enclosing test.
- frontend/src/components/__tests__/FileDetailFullScreen.inboxNav.test.tsx — full: Read the whole file (1-239).
- frontend/src/components/__tests__/FileDetailFullScreen.smartCollection.test.tsx — partial: Read lines 90-239 (the import, endCurrentFile and setup) plus every endCurrentFile call site via grep (lines 244-259, 295-330, 354-382, 447-459).
- frontend/src/components/__tests__/GlobalSearch.inSmartCollection.test.tsx — partial: Read lines 60-259 (the windowRequests filter and setup) plus both windowRequests() call sites via grep (lines 262-283).
- frontend/src/components/sidebar/__tests__/sidebarNameInUse.test.tsx — full: Read the whole file (1-445).

## Findings

A: 0
B: 1
C: 0

### claude-read:CR-1 — bucket B, INFO, open

Claim: The change declares no touch-point list (no spec under docs/specs/ and no invariants.md for topic fix-ci-flaky-tests-2), so all eight paths the diff reaches lie outside any declared touch-point list, and so does the one reach beyond them: a new test import of getCollectionOnEnded from the product module CollectionPanel, which reads window.__collectionOnEnded.
Impact: A user cannot hit this. All eight edited files are test files: two Playwright specs and six Vitest files. No product file is edited. Without a list, this first-review question has nothing to compare against, and no invariant can be cited for these test changes.
Evidence: A grep for 'flaky' in docs/specs finds nothing. docs/process/reviews/fix-ci-flaky-tests-2/ contains only decisions.md and r1/ (classification.json, head.txt, expected.txt, fixes.txt, product-files.txt, test-files.txt), with no invariants.md. The diff edits frontend/e2e-components/justified-hold-desktop.spec.ts:276-278, frontend/e2e-epub/typography.spec.ts:94-101, frontend/src/__tests__/inboxActions.test.tsx:326, frontend/src/components/__tests__/FileActions.test.tsx:910-913, FileDetailFullScreen.inboxNav.test.tsx:162-166, FileDetailFullScreen.smartCollection.test.tsx:96 and 162-164, GlobalSearch.inSmartCollection.test.tsx:120-132, and frontend/src/components/sidebar/__tests__/sidebarNameInUse.test.tsx:266, 356-362 and 430-432. The new import at FileDetailFullScreen.smartCollection.test.tsx:96 reads CollectionPanel.tsx:428-430 (window.__collectionOnEnded, set and deleted by the effect at CollectionPanel.tsx:292-298). It does not edit that file. docs/process/workflow.md:69 lets a bug fix skip the spec design review and the approval, but it still requires a SPEC or UNSPEC statement. A precedent is feature-design-conformance-check r1 CR-1, which was LOW, bucket B.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record in decisions.md that this test-only flaky fix ships without a spec or touch-point list, or add a short invariants.md that names the eight test files and the read-only use of CollectionPanel's getCollectionOnEnded.

</details>

## Not verified

- claude-read: I ran no test (Vitest or Playwright), so I did not check whether the eight files are now green or still flaky.
- claude-read: I did not check the order in which the EPUB reader host posts the 'turned' message relative to lastLocation and renderer.page being final.
- claude-read: I did not check that the justified-grid painted cell s.cells[0] always contains a [role="button"] element in the harness.
- claude-read: I did not read the parts of inboxActions.test.tsx, FileActions.test.tsx, FileDetailFullScreen.smartCollection.test.tsx and GlobalSearch.inSmartCollection.test.tsx outside the ranges listed in coverage.
- claude-read: I did not check the commit boundary: I reviewed the diff given in the brief, not git show of 3474e9570 on its own.
- claude-verify: I did not run the Vitest or Playwright suites, so I did not confirm that the flakiness is fixed.
- claude-verify: I did not check every diff line range cited in the finding (for example sidebarNameInUse.test.tsx:356-362) against the commit.
- claude-verify: I did not read the feature-design-conformance-check r1 CR-1 precedent.

TOTAL: 1 findings
