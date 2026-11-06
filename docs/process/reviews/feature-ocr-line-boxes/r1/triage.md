# Triage: r1

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

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

Note: Global CSS classes `.find-box` and `.find-box-current` now exist in the app-wide stylesheet.; `readAnswer` now passes every row through `readRow`, which also normalises rows of other kinds when they carry a `boxes` key. Non-object rows are passed through unchanged.; The e2e viewport spec now includes the new fixture in its fixture count.
- claude-read: Global CSS classes `.find-box` and `.find-box-current` now exist in the app-wide stylesheet.
- claude-read: `readAnswer` now passes every row through `readRow`, which also normalises rows of other kinds when they carry a `boxes` key. Non-object rows are passed through unchanged.
- claude-read: The e2e viewport spec now includes the new fixture in its fixture count.
- claude-verify: globals.css, spec-viewport.spec.ts and the shared test helper ocr_fixtures.py are edited but not named in the touch points.

### unspecified_behavior

Note: globals.css, spec-viewport.spec.ts and the shared test helper ocr_fixtures.py are edited but not named in the touch points.
- claude-read: Global CSS classes `.find-box` and `.find-box-current` now exist in the app-wide stylesheet.
- claude-read: `readAnswer` now passes every row through `readRow`, which also normalises rows of other kinds when they carry a `boxes` key. Non-object rows are passed through unchanged.
- claude-read: The e2e viewport spec now includes the new fixture in its fixture count.
- claude-verify: globals.css, spec-viewport.spec.ts and the shared test helper ocr_fixtures.py are edited but not named in the touch points.

## Findings

A: 0
B: 3
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: The diff edits frontend/src/app/globals.css to add the global `.find-box` and `.find-box-current` rules, and that file is not in the touch-point list.
Impact: The stylesheet is shared by the whole frontend. The new selectors apply to any SVG element with those classes. A later edit to the find-mark colours would change the outline style without a reviewer expecting it. The spec only names DESIGN.md and 'no new token' for the outline.
Evidence: frontend/src/app/globals.css (hunk at line ~729): `.find-box { fill: color-mix(...) }`, `.find-box-current { stroke: var(--accent); stroke-width: 2; vector-effect: non-scaling-stroke }`. The Touch points list ImageCanvas.tsx, fileFind.ts and e2e-layout, not globals.css.
Repro: not_reproduced. Compare the diff's file list with the Touch points section.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F2 — bucket B, INFO, open

Claim: The diff edits the existing frontend/e2e-layout/spec-viewport.spec.ts, adding the new fixture to FIXTURES and raising FIXTURE_COUNT from 20 to 21. That file is not in the touch-point list, which names only a 'new case' in e2e-layout.
Impact: The new fixture is now also run through the viewport-wide checks of that spec at the sizes it covers. A failure of the fixture there, or a miscounted FIXTURE_COUNT, would show up in an unrelated test.
Evidence: frontend/e2e-layout/spec-viewport.spec.ts: `"ocr-line-boxes.html"` added to FIXTURES, and `FIXTURE_COUNT = 21`.
Repro: not_reproduced. Read the hunks of spec-viewport.spec.ts.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F3 — bucket B, INFO, open

Claim: The diff changes the shared test helper addons/intelligence/tests/ocr_fixtures.py. FakeOcrResult no longer defaults `scores` to 0.99 and `boxes` to an empty tuple, and install() and FakeEngine gain new parameters. Every existing test that uses this helper is reached, and that reach is not named.
Impact: Older OCR tests now run against a result with no `boxes` or `scores`, so they exercise the no-lines path. Their expectations were not stated to change, and the frame and page readers may share this result shape. The helper change can hide or alter coverage that those tests used to give.
Evidence: addons/intelligence/tests/ocr_fixtures.py: `self.scores = tuple(0.99 ...)` and `self.boxes = ()` are replaced by conditional attributes using the ABSENT sentinel.
Repro: not_reproduced. I cannot run the tests. I did not list the other users of ocr_fixtures.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run any test or any build.
- claude-read: I did not read the files outside the diff, including the other users of ocr_fixtures.py and the generated globals.built.css.
- claude-read: I did not check the invariants I1 to I11 beyond locating unplanned reach.
- claude-read: I did not confirm that routers/files.py needs no edit for the response schema to carry `boxes`.
- claude-verify: Diff against origin/develop, since I could not run git and saw only the final file contents
- claude-verify: Which existing tests use ocr_fixtures.py and whether they still pass
- claude-verify: Invariants I1-I11 and the backend and frontend behaviour

TOTAL: 3 findings
