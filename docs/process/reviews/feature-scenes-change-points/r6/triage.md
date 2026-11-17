# Triage: r6

## Warnings

- R-5 ran at ccad64c8d1ffc5a3dbf08ef19dff9143ed1e977f, and these files changed since: docs/addons/intelligence.md, docs/user-guide/video.md; run R-5 again if any of them changes what a user sees

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

## Read coverage

Product files:
- addons/intelligence/app/routers/files.py — full: Read the whole get_clip_timestamps handler (1335-1384), which contains the changed hunk.
- addons/intelligence/app/schemas.py — partial: Read only the diff hunk (ClipTimestampsResponse); the one-line additive field is fully visible in the diff.
- addons/intelligence/frontend/ScenesSection/ScenesSectionContainer.tsx — full: Read the whole file, lines 1-836.
- addons/intelligence/frontend/ScenesSection/ScenesSectionPresenter.tsx — partial: Read lines 90-350, covering the chip helper, header and switch row and every changed hunk. The Ruler body at 488 onward is unchanged and was not read.
- addons/intelligence/frontend/ScenesSection/scenesModel.ts — partial: Read lines 1-140, which include frameListFor, rulerLength, trackLength, frameIndexAt and dotTileStarts and so every changed hunk.
- addons/intelligence/frontend/api.ts — partial: Read the diff hunk only (optional `changes` field on ClipTimestampsResponse).
- addons/intelligence/frontend/messages/en.json — partial: Read the diff hunk only (three new file-namespace keys).
- addons/intelligence/frontend/messages/ja.json — partial: Read the diff hunk only (three new file-namespace keys).
- frontend/e2e-components/fixtures/app.tsx — partial: Read the diff hunk only (two arrangement registrations).
- frontend/e2e-components/fixtures/scenesSection.tsx — full: Read the whole file.
- frontend/e2e-components/fixtures/scenesSectionData.ts — partial: Read the diff hunk only (SCENES_CHANGE_SECONDS / SCENES_CHANGES).
- frontend/e2e-components/scenes-section-desktop.spec.ts — partial: Read the diff hunk only (import and the one scenesChangesCases call).
- frontend/e2e-components/scenes-section.cases.ts — partial: Read lines 1-140 (helpers, open/openArrangement) plus the full new block from the diff (switchReading, selectedLook, press, scenesChangesCases).
- frontend/e2e-components/scenes-section.spec.ts — partial: Read the diff hunk only (import and the one scenesChangesCases call).

Test files:
- addons/intelligence/frontend/ScenesSection/__tests__/ScenesSectionChangePoints.test.tsx — full: New file; read in full from the diff.
- addons/intelligence/tests/test_spec_addon_124_clip_change_list.py — full: New file; read in full from the diff.

## Needs a human

### unspecified_behavior

Note: The header's accessible name gains spaces between title, count and scene count on every video (Presenter.tsx:228-231). The spec does not describe this.; The `.loft` mount path (Container.tsx:242) sets `changes` but never resets `frameMode` when the answer has no changes. Mode is reset on file change, and a `.loft` never re-fetches on expand, so this is not reachable today.
- claude-read: The header's accessible name gains spaces between title, count and scene count on every video (Presenter.tsx:228-231). The spec does not describe this.
- claude-read: The `.loft` mount path (Container.tsx:242) sets `changes` but never resets `frameMode` when the answer has no changes. Mode is reset on file change, and a `.loft` never re-fetches on expand, so this is not reachable today.
- claude-verify: The header button's accessible name and textContent now have spaces between the title, the bare count and the visual count. No spec requires this. Only the new test relies on it.

### unspecified_behavior

Note: The header button's accessible name and textContent now have spaces between the title, the bare count and the visual count. No spec requires this. Only the new test relies on it.
- claude-read: The header's accessible name gains spaces between title, count and scene count on every video (Presenter.tsx:228-231). The spec does not describe this.
- claude-read: The `.loft` mount path (Container.tsx:242) sets `changes` but never resets `frameMode` when the answer has no changes. Mode is reset on file change, and a `.loft` never re-fetches on expand, so this is not reachable today.
- claude-verify: The header button's accessible name and textContent now have spaces between the title, the bare count and the visual count. No spec requires this. Only the new test relies on it.

## Findings

A: 0
B: 1
C: 0

### claude-read:R1 — bucket B, INFO, open

Claim: ScenesSectionPresenter.tsx adds `{" "}` text nodes around the header's bare-count span. This edit falls outside both the Presenter touch point ("the switch row, and the track length taken from the candidate list") and the switch feature itself.
Impact: The header button's accessible name changes for every video, whether or not it has change frames. Before the change it read e.g. "Scenes15"; now it reads "Scenes 15". Nothing changes visually, because whitespace-only flex items are not rendered. Existing selectors match `/^Scenes/` or use Playwright's substring match on "Scenes", so no current test breaks. Still, a section without the switch also changes, which the spec's claim that the default mode is identical to today does not record.
Evidence: addons/intelligence/frontend/ScenesSection/ScenesSectionPresenter.tsx:228-231 adds `{" "}` after the title span and after the count span. The only reader that depends on it is the new test ScenesSectionChangePoints.test.tsx:237/242-243. That test matches `/\b15\b/` against header().textContent, and without the space there is no word boundary between "Scenes" and "15". The touch-point list in docs/specs/scenes-change-points.md names the Presenter only for the switch row and the track length.
Repro: Mutation: remove the two `{" "}` nodes. Then ScenesSectionChangePoints I5 fails, because textContent "Scenes15…" has no \b before 15. Every other selector found (`/^Scenes/`, Playwright `name: "Scenes"` substring) still matches. Not run; the result comes from reading the code.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name the header's accessible-name spacing in the Presenter touch point. Alternatively, make the I5 test read the count span directly so the header text does not need to change.

</details>

## Not verified

- claude-read: I did not run any test suite (vitest, pytest, Playwright). Mutation results come from reading the code only.
- claude-read: I did not open docs/process/* beyond the file list, nor the design artifact directory.
- claude-read: I did not inspect the Ruler component's tick drawing (Presenter.tsx:488 onward) or the gitlink's other submodule commits.
- claude-read: I did not check addons/intelligence/manifest.json for a route/schema declaration that might need the new field.
- claude-verify: I compared against the local develop checkout, not origin/develop, because I could not run git. The two may differ.
- claude-verify: I did not run the test suite to confirm that the test fails without the whitespace.
- claude-verify: I did not search the other test files for exact matches on the header's accessible name.

TOTAL: 1 findings
