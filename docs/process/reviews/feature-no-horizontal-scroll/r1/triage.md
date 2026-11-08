# Triage: r1

## Warnings

- R-5 ran at 2773048452d56db31138963b1ad14ebb7df825f6, and these files changed since: DESIGN.md; run R-5 again if any of them changes what a user sees

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

Note: The ShelfBlock layout effect marks cards from the third row on as `inert`. No invariant states this, and the browser fixture does not reproduce it.; Because VideoCard now carries `mouse:h-full`, the card links on the see-all page (VideoShelfPage) stretch to their grid row height.; The mouse-only arrow scroll buttons in ClipFramesSection were removed.
- claude-read: The ShelfBlock layout effect marks cards from the third row on as `inert`. No invariant states this, and the browser fixture does not reproduce it.
- claude-read: Because VideoCard now carries `mouse:h-full`, the card links on the see-all page (VideoShelfPage) stretch to their grid row height.
- claude-read: The mouse-only arrow scroll buttons in ClipFramesSection were removed.
- claude-verify: Removing the mouse-only press-and-hold scroll arrows from ClipFramesSection is a UI removal that no touch point declares.
- claude-verify: The `inert` hiding of rows past the shelf cap in ShelfBlock is a focus/accessibility behaviour the spec does not cover. The static fixture does not reproduce it.

### unspecified_behavior

Note: Removing the mouse-only press-and-hold scroll arrows from ClipFramesSection is a UI removal that no touch point declares.; The `inert` hiding of rows past the shelf cap in ShelfBlock is a focus/accessibility behaviour the spec does not cover. The static fixture does not reproduce it.
- claude-read: The ShelfBlock layout effect marks cards from the third row on as `inert`. No invariant states this, and the browser fixture does not reproduce it.
- claude-read: Because VideoCard now carries `mouse:h-full`, the card links on the see-all page (VideoShelfPage) stretch to their grid row height.
- claude-read: The mouse-only arrow scroll buttons in ClipFramesSection were removed.
- claude-verify: Removing the mouse-only press-and-hold scroll arrows from ClipFramesSection is a UI removal that no touch point declares.
- claude-verify: The `inert` hiding of rows past the shelf cap in ShelfBlock is a focus/accessibility behaviour the spec does not cover. The static fixture does not reproduce it.

## Findings

A: 0
B: 6
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The diff edits frontend/src/components/videoapp/VideoCard.tsx (adds `mouse:h-full` to the card link), and that file is not in the touch-point list.
Impact: VideoCard is also rendered by VideoShelfPage.tsx:105 (the see-all page) inside a CSS grid `li`. A stretched grid item has a definite height, so `h-full` makes every card link on that page as tall as its grid row when titles wrap to different line counts. The link's click area and focus ring then cover empty space below short titles. The see-all page is not one of the in-scope screens, so no layout spec measures it.
Evidence: frontend/src/components/videoapp/VideoCard.tsx:22 (diff hunk adds `mouse:h-full`); frontend/src/components/videoapp/VideoShelfPage.tsx:102-106 renders `<ul className="grid ..."><li className="min-w-0"><VideoCard/></li>`; grep shows only these two callers.
Repro: not_reproduced. Reasoning: in a grid with align-items stretch, the li gets the row height, and the a's height:100% resolves against it.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add VideoCard.tsx and VideoShelfPage.tsx to the touch points. Either confirm the see-all page's look on a mouse, or move the height onto the ShelfBlock slot (for example `[&>a]:mouse:h-full` on CARD_SLOT) so the shared card stays unchanged.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: The diff adds frontend/src/components/videoapp/shelfHiddenRows.ts and a measured `inert` mechanism in ShelfBlock, plus two new unit tests (ShelfBlock.hiddenRows.test.tsx, shelfHiddenRows.test.ts). None of these is in the touch-point list, which names only ShelfBlock.tsx and a source-scan vitest and an e2e-layout spec.
Impact: The new runtime logic is a useLayoutEffect with a ResizeObserver that makes cards inert. It is not listed, and no declared invariant covers it (I4 speaks only of drawn boxes). The e2e fixture builds the shelf by hand and never applies `inert`, so the layout spec cannot detect a regression in which cards get inert. One example is a card in the second row that is visible but unreachable by keyboard.
Evidence: frontend/src/components/videoapp/ShelfBlock.tsx:79-120 (measure/inert); frontend/src/components/videoapp/shelfHiddenRows.ts:1-14; frontend/e2e-layout/fixtures/no-horizontal-scroll.html buildShelf sets no `inert`.
Repro: Mutation: in shelfHiddenRows.ts, change `top >= secondRowBottom` to `top >= secondRowTop`. The e2e spec would not catch it because the fixture has no inert logic. Only the jsdom stub tests would fail, and they assume uniform slot heights.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List shelfHiddenRows.ts and its tests as touch points, and state the inert behavior as an invariant so that a browser test measures it.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: The diff edits frontend/src/__tests__/anchoredDropdowns.test.ts by adding the ShelfBlock cap string to OVERFLOW_CLIP_OCCURRENCES, and that test is not in the list of existing tests that change.
Impact: The new allowlist entry rests on a claim that no anchored dropdown starts inside a shelf card. If that ever stops holding, a dropdown would be clipped by `overflow: clip` on a mouse and no test would flag it.
Evidence: frontend/src/__tests__/anchoredDropdowns.test.ts:196-199 (new entry pinning the exact SHELF_CAP_CLASSES line).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add anchoredDropdowns.test.ts to the touch points' list of existing tests that change.

</details>

### claude-read:TP-4 — bucket B, INFO, open

Claim: The diff edits frontend/e2e-layout/spec-viewport.spec.ts (FIXTURES list and FIXTURE_COUNT 22→23), and that file is not in the touch-point list.
Impact: No user-facing impact. It is an unplanned test edit needed to register the new fixture.
Evidence: frontend/e2e-layout/spec-viewport.spec.ts:33,48
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add it to the touch points.

</details>

### claude-read:TP-5 — bucket B, INFO, open

Claim: The diff adds a second new e2e spec, frontend/e2e-layout/no-horizontal-scroll-states.spec.ts, and edits three existing fixtures (addon-policy.html, mobile-inspector-sheet.html, video-app.html). The touch points name one new spec and do not list these fixtures.
Impact: There is no user impact. One consequence: I1 says 'the list lives in that spec', but the in-scope screens are now spread across two spec files.
Evidence: frontend/e2e-layout/no-horizontal-scroll-states.spec.ts (new); frontend/e2e-layout/fixtures/{addon-policy,mobile-inspector-sheet,video-app}.html hunks.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the states spec and the three edited fixtures as touch points.

</details>

### claude-read:TP-6 — bucket B, INFO, open

Claim: The addon submodule bumps change test files that are not in the touch-point list: AdminFeaturesSettingsSection.test.tsx, ClipFramesSection.test.tsx and VisualIndexSection.test.tsx in intelligence, and __tests__/VersionHistoryPanel.test.tsx in knowledge. ClipFramesSection.tsx also deletes the mouse-only press-and-hold arrow buttons and their matchMedia hook. The touch points do not mention that removal.
Impact: Before this change, mouse users had 'Scroll left' and 'Scroll right' arrow controls on the clip-frames strip. They are gone, and the replacement is wrapped rows. This is an unplanned removal of a control.
Evidence: addons/intelligence/frontend/ClipFramesSection.tsx diff hunks removing hasFinePointer, startArrowScroll and the two aria-label 'Scroll left'/'Scroll right' buttons.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record the removal of the arrow controls and the addon test files in the touch points or in the addon PR description.

</details>

## Not verified

- claude-read: I could not check which files commit cdf7858c1 itself touches, as opposed to the whole branch diff, because I had no git access.
- claude-read: The VideoShelfPage card stretching was not rendered or measured.
- claude-read: Touch-point items the diff does not reach, such as cloud-sync SyncDriveCard and knowledge Editor/WikiLinkAutocomplete, were not audited.
- claude-read: No tests were run.
- claude-verify: I could not run git diff against origin/develop, so whether each hunk is new was inferred from the HEAD file contents.
- claude-verify: The addon-policy.html and mobile-inspector-sheet.html fixture edits were not compared with develop.
- claude-verify: No tests or e2e specs were run.

TOTAL: 6 findings
