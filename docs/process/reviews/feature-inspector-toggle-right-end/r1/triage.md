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

Note: The test fixture's fetch stub now answers 404 for one id and holds another until window.__releaseLate() runs. Neither behaviour is declared.; FileHeaderRowPortal returns null for the whole row when trailing is set but the trailing container has not mounted yet (FileHeaderRowProvider.tsx, the end of FileHeaderRowPortal). This matches spec item 2's 'not drawn yet' for the toggle. It also holds back the row itself, which the spec does not state.
- claude-read: The test fixture's fetch stub now answers 404 for one id and holds another until window.__releaseLate() runs. Neither behaviour is declared.
- claude-read: FileHeaderRowPortal returns null for the whole row when trailing is set but the trailing container has not mounted yet (FileHeaderRowProvider.tsx, the end of FileHeaderRowPortal). This matches spec item 2's 'not drawn yet' for the toggle. It also holds back the row itself, which the spec does not state.

## Findings

A: 0
B: 3
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The diff edits the component fixtures frontend/e2e-components/fixtures/fileHeaderRow.tsx and frontend/e2e-components/fixtures/app.tsx, and neither is named in the touch points.
Impact: No user can hit this, because these files are test-only. The fixture's fetch stub gains two new behaviours: HEADER_ROW_MISSING_ID answers 404, and HEADER_ROW_LATE_ID waits until window.__releaseLate() runs. It also gains six arrangements. The I3, I5 and I8 e2e cases rest on these, so a reader who checks the tests against the touch points would not know the fixture shapes the evidence for those invariants.
Evidence: fileHeaderRow.tsx in the diff adds HEADER_ROW_LATE_ID and HEADER_ROW_MISSING_ID, the lateWaiters/__releaseLate global, the 404 and deferred branches in installFetch, and HeaderRowSwapArrangement, HeaderRowCollectionNoteArrangement, HeaderRowCollectionSwapArrangement, HeaderRowLateArrangement, HeaderRowMissingArrangement and HeaderRowTwoPaneLongArrangement. fixtures/app.tsx registers six new ARRANGEMENTS keys. The spec's Tests touch point lists only the spec files, FileDetailHeaderRow.test.tsx and headerRowHarness.ts.
Repro: Compare the diff's file list with the Touch points section of docs/specs/inspector-toggle-right-end.md. Neither fixture path appears there.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add frontend/e2e-components/fixtures/fileHeaderRow.tsx and fixtures/app.tsx (the new arrangements and fetch stubs) to the Tests touch point in invariants.md under Revisions.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The diff edits the guard test frontend/src/components/__tests__/componentFixtureParity.test.tsx, which is not named in the touch points.
Impact: No user can hit this. A shared guard's expected arrangement list grows by six entries, and a reader of the touch points would not expect a repository-wide parity guard to change.
Evidence: componentFixtureParity.test.tsx around line 337 adds header-row-collection-note, header-row-collection-swap, header-row-late, header-row-missing, header-row-swap and header-row-two-pane-long to the expected list. The spec's Touch points do not mention this file.
Repro: Compare the diff's file list with the spec's Touch points. The path is absent.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name componentFixtureParity.test.tsx in the Tests touch point, or record fixture-parity registration as an implicit touch point of any new arrangement.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: The DESIGN.md edits reach beyond the two places the touch point names. They add a new §Header bullet ('The outermost control on each side opens the pane on that side') and rewrite the §Header 'The trailing end is …' bullet.
Impact: No user can hit this. The new bullet sets a design rule for every future pane toggle, which is wider than this change's placement decision, and the touch point does not declare it.
Evidence: In the DESIGN.md hunk at line 732, the outermost-control bullet is added and the 'trailing end' bullet gains 'where the page has an inspector, a vertical divider and the inspector toggle follow them'. The touch point names only the §Header 'Wide, left to right' order and the §Page Header sentence.
Repro: Read the DESIGN.md hunks against the touch point line for DESIGN.md.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Extend the DESIGN.md touch point to cover the §Header 'trailing end' bullet and the new outermost-control rule.

</details>

## Not verified

- claude-read: I did not run any test, so the e2e and vitest suites were not executed.
- claude-read: I did not check whether commit 5d687511d on its own contains only review documents. I reviewed the supplied diff against origin/develop.
- claude-read: I did not read headerRowHarness.ts to confirm that no edit was needed there.
- claude-read: I did not read the full fixture files outside the diff hunks.
- claude-verify: I could not run git diff against origin/develop, so I could not confirm line by line that the DESIGN.md bullets at 735-741 were added or rewritten in this diff rather than already present.
- claude-verify: I did not run any tests or e2e specs.
- claude-verify: I did not review the behavior of Header.tsx, FileHeaderRowProvider.tsx or FileDetailChrome.tsx against I1-I10.

TOTAL: 3 findings
