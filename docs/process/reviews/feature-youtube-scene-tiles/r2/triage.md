# Triage: r2

## Warnings

- R-5 ran at 620fd87fbd8900f383adf98782c0f5924f726790, and these files changed since: .claude/agents/design-checker.md, DESIGN.md, backend/app/main.py, backend/app/routers/drives.py, backend/app/routers/shelves.py and 7 more; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: The fix commits since r1 are almost entirely develop work merged into this branch (the Video app, then the Reading app with shelves `by=all`, `watch`, folder `base`, and the shared app shell). None of them touches the scene-tile code (clip.py, the scene-tile route, ClipFramesSection's `.loft` branch, SceneCandidatesSection). r1's bucket-A F1 was resolved by the merged `@custom-variant mouse` in globals.css, not by a change in this feature. Within the merged Reading and Video work, later rounds did add state on top of earlier rounds. ab24d3c added the shown-target set and hid unusable folders; f9477ac reversed that to list them disabled. ab24d3c removed the stale-target repair effect in useVideoApp; that round removed a branch. 30144db added a `from` URL marker to disambiguate `by=all` titles, which is a new carried state predicting which face a shelf came from. ef424b5 added a second kind table (`_FILTER_ONLY_KINDS`) beside `_KIND_MIMES`/`_KIND_SUFFIXES` instead of extending them. Those rounds look like patching in the Reading/Video design. For the scene-tile design under review there was no fix round, so there is no patching trajectory.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: Stale one-commit render of the previous `.loft`'s rows under the new fileId when the panel was expanded (F1).; On a mouse the strip scrolls vertically, but the IntersectionObserver rootMargin pads only the right edge (`0px Npx 0px 0px`). The next 20 therefore load only when the sentinel becomes visible at the bottom, not near it. This is pre-existing in shape and was not introduced by the `.loft` branch.; `_prepare_tiles_dir` runs outside the try. If `mkdir` of the frames or new directory fails with OSError, the job raises without the `tile_write_failed` class and without joining `_storyboard_failed`.
- claude-read: Stale one-commit render of the previous `.loft`'s rows under the new fileId when the panel was expanded (F1).
- claude-read: On a mouse the strip scrolls vertically, but the IntersectionObserver rootMargin pads only the right edge (`0px Npx 0px 0px`). The next 20 therefore load only when the sentinel becomes visible at the bottom, not near it. This is pre-existing in shape and was not introduced by the `.loft` branch.
- claude-read: `_prepare_tiles_dir` runs outside the try. If `mkdir` of the frames or new directory fails with OSError, the job raises without the `tile_write_failed` class and without joining `_storyboard_failed`.

## Findings

A: 0
B: 1
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: When the `.loft` CLIP frames panel is expanded and its `fileId` changes to another `.loft`, the first render after the change still holds the previous file's `timestamps` and `expanded=true`. `pictureUrls` is rebuilt for that render with the new `fileId` and the old file's start times, so `<img>` elements for `/files/<new>/scene-tile?t=<old times>` are committed. The reset effect clears them only after that commit.
Impact: For one commit, navigating between two YouTube references in a mounted panel shows the previous reference's row count and time labels. It can request scene tiles of the new file at times that are not its rows, which gives 404s and a brief blank flash, or, by coincidence, the new file's picture under the old label. The flicker is cosmetic and nothing is persisted.
Evidence: addons/intelligence/frontend/ClipFramesSection.tsx: the reset effect has deps `[fileId, isLoft]` and calls setTimestamps(null) and setExpanded(false) post-commit. The `pictureUrls` useMemo depends on `[isLoft, fileId, timestamps]`, so the render that follows a prop change maps the old `timestamps` to the new `fileId`. The test 'refetches when fileId changes...' clicks the header only after the new response arrives, so it never observes the panel while it was expanded at the moment of the switch.
Repro: not_reproduced. Reasoned from render and effect ordering: render with fileId f1 and the panel expanded, then rerender with fileId f2 and inspect the img srcs synchronously before effects flush.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Key the held timestamps by fileId (store `{fileId, rows}` and treat a mismatch as null), or remount the section with `key={fileId}`.

</details>

## Not verified

- claude-read: Did not run any test, build, or the e2e-layout suite.
- claude-read: Did not confirm that the built stylesheet emits `max-h-[17.5rem]` under the `mouse` variant for the addon's ClipFramesSection, which depends on Tailwind's content scanning including addons/intelligence/frontend.
- claude-read: Did not check whether the file page remounts ClipFramesSection on fileId change (a `key` prop), which would make F1 moot.
- claude-read: Did not read the full fix diffs beyond the truncation point at 600000 bytes.
- claude-verify: I did not run the frontend tests or reproduce the render in a browser. The verification is by code reading only.
- claude-verify: I did not check whether the browser actually starts loading lazy <img> elements committed for a single frame before the reset effect runs.
- claude-verify: I did not verify how AddonSlot builds addonSlotProps.fileId beyond confirming that the container is keyed by fileId.
- claude-verify: I did not review the backend, route, manifest, docs or other invariants beyond F1.

TOTAL: 1 findings
