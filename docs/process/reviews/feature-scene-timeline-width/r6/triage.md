# Triage: r6

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
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: The SceneCard's total min-height of 7.6rem replaces per-line reservations, so a scene with a one-line label and no text now leaves its spare space at the card's foot rather than between the label and the text. This applies at every width, not only in wide hosts.
- claude-read: The SceneCard's total min-height of 7.6rem replaces per-line reservations, so a scene with a one-line label and no text now leaves its spare space at the card's foot rather than between the label and the text. This applies at every width, not only in wide hosts.
- claude-verify: The card's fixed min-height (7.6rem), with the spare space at its foot, is not stated in the spec. Only design-check D-1 and decisions.md record it.

### unspecified_behavior

Note: The card's fixed min-height (7.6rem), with the spare space at its foot, is not stated in the spec. Only design-check D-1 and decisions.md record it.
- claude-read: The SceneCard's total min-height of 7.6rem replaces per-line reservations, so a scene with a one-line label and no text now leaves its spare space at the card's foot rather than between the label and the text. This applies at every width, not only in wide hosts.
- claude-verify: The card's fixed min-height (7.6rem), with the spare space at its foot, is not stated in the spec. Only design-check D-1 and decisions.md record it.

## Findings

A: 0
B: 2
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The diff changes the SceneCard in ScenesSectionPresenter.tsx (a 7.6rem min-height on the whole card, justify-start, and the removal of the per-span min-h-[2.4rem] and min-h-[2.45rem]), and none of the four Presenter touch points (column count, removal of max-w-96, loading skeleton, window band) covers it.
Impact: The scene card's height and layout change at every width, including the 384px inspector. Before, a one-line label was followed by a blank reserved line. Now the text follows it directly and the spare space sits at the card's foot. My arithmetic puts the maximum content at about 7.59rem (1rem time line + 2 × 0.25rem gaps + 2 × 1.203rem label + 2 × 1.219rem text + 1.25rem padding), so 7.6rem still holds the section height steady (SPEC-ADDON-089 I5). This is a visible change outside the declared plan, made under the human decision D-1 in decisions.md:16.
Evidence: addons/intelligence/frontend/ScenesSection/ScenesSectionPresenter.tsx:526 (min-h-[7.6rem] ... justify-start), :535 and :538 (the line-clamp-2 spans no longer have min-h). The touch-point list in docs/specs/scene-timeline-width.md names only the grid column count, max-w-96, the skeleton and the band for the Presenter. The change is recorded in docs/process/reviews/feature-scene-timeline-width/design-check.md:18-20 (D-1) and decisions.md:16, but the spec's touch points were not updated.
Repro: not_reproduced. Comparing the diff hunk at SceneCard with the touch-point list shows the change is not in the list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the scene card's height reservation to the Presenter touch points (or the Revisions), citing D-1.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The diff edits frontend/e2e-components/fixtures/scenesSectionData.ts (SCENES_LONG_LABEL is made much longer), and that file is not in the touch-point list, which names only fixtures/scenesSection.tsx and fixtures/app.tsx.
Impact: Only test data is affected. The longer label makes the e2e assertion `labelClipped === true` hold at the new 688px and 900px widths, where the old label would fit in two lines. No user-facing behaviour changes.
Evidence: frontend/e2e-components/fixtures/scenesSectionData.ts:8-9 (diff hunk); used at frontend/e2e-components/scenes-section.cases.ts:248-251 and fixtures/scenesSectionData.ts:57. Touch points list `fixtures/scenesSection.tsx` and `fixtures/app.tsx` only. The r6 classification.json already records this path.
Repro: not_reproduced. Comparing the diff's file list with the touch-point list shows the file is missing.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add fixtures/scenesSectionData.ts to the Core touch points.

</details>

## Not verified

- claude-read: I did not run any test (read-only reviewer). The e2e results at 688px and 900px are unverified.
- claude-read: I did not open the design boards (Wide.dc.html, Main.dc.html) to compare the card's layout.
- claude-read: I did not check whether the commit bb762a04 itself contains only review records. I reviewed the full diff as given against origin/develop.
- claude-read: I did not verify that the card's computed line-heights in the real Tailwind config match my 7.59rem estimate.
- claude-verify: I did not read the actual diff against origin/develop, because I have no git access. I inferred the changes from the HEAD files, design-check.md, decisions.md and r6/classification.json.
- claude-verify: I did not check the card height in a browser at any width.

TOTAL: 2 findings
