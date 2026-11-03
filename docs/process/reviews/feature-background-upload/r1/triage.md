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

Note: `disarmLeaveConfirmation()` runs before `lockApi()` resolves. If the lock request fails, the leave-page confirmation stays disarmed for the rest of the page session.; `bottomChromeOffset` adds `env(safe-area-inset-bottom)` to the peek offset. The e2e fixture ignores safe-area, so behaviour on notched devices is unmeasured.; The `beforeunload` guard is registered by the drawer component rather than by the store, so I5 depends on UploadProgress staying mounted.
- claude-read: `disarmLeaveConfirmation()` runs before `lockApi()` resolves. If the lock request fails, the leave-page confirmation stays disarmed for the rest of the page session.
- claude-read: `bottomChromeOffset` adds `env(safe-area-inset-bottom)` to the peek offset. The e2e fixture ignores safe-area, so behaviour on notched devices is unmeasured.
- claude-read: The `beforeunload` guard is registered by the drawer component rather than by the store, so I5 depends on UploadProgress staying mounted.

## Findings

A: 0
B: 4
C: 0

### claude-read:F2 — bucket B, MEDIUM, open

Claim: The diff adds `frontend/e2e-layout/fixtures/upload-drawer.html` and `frontend/e2e-layout/upload-drawer.spec.ts` and edits `frontend/e2e-layout/spec-viewport.spec.ts`, none of which the touch-point list names. The I13 measurement in those files checks the fixture's own offset arithmetic, not the component's.
Impact: A change in `bottomChromeOffset` or in UploadProgress's `style.bottom` that puts the drawer over the mini-player or the peek bar would still pass the automated I13 check. Only the one-time manual run recorded in decisions.md covered the real component.
Evidence: `upload-drawer.html` `window.arrange` computes `drawer.style.bottom = Math.max(abovePlayer, aboveStrip)` itself and hides the drawer for half or full. `upload-drawer.spec.ts:183-196` checks only that the fixture's positioning classes include the component's root `className` tokens and that `peekHeightPx === SHEET_PEEK_PX`. It never reads `bottomChromeOffset`, `MINI_PLAYER_HEIGHT_PX`, or UploadProgress's half/full early return (`UploadProgress.tsx`, `if (chrome.sheet === "half" || ...) return null`). The touch-point line about R-5 names a real-browser measurement but no file.
Repro: Mutation: remove `style={{ bottom: bottomChromeOffset(chrome) }}` from UploadProgress, or remove its half/full early return. By reading, neither the e2e-layout spec nor any vitest test would fail. Not executed.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the e2e-layout files as touch points. Either build the fixture's offset from `bottomChromeOffset` and the exported constants, or add a vitest test that renders UploadProgress after `setMiniPlayerShown` and `setInspectorSheetState`, and checks the bottom style and the half/full null render.

</details>

### claude-read:F1 — bucket B, LOW, open

Claim: The diff adds a new module, `frontend/src/lib/bottomChrome.ts`, which the touch-point list does not name. It is a second app-wide store, and it hard-codes the mini-player's 180 px height and 16 px gap separately from `MiniPlayerContainer`.
Impact: If the mini-player's `h-[180px]` class or its bottom gap changes, the drawer's offset in `bottomChromeOffset` stays at 196 px and the drawer can overlap the mini-player again (I13). No test ties the constants to the component's classes.
Evidence: `frontend/src/lib/bottomChrome.ts:17-20` declares `MINI_PLAYER_HEIGHT_PX = 180` and `MINI_PLAYER_GAP_PX = 16`, with only the comment "Must stay in step" to link them. A grep for `bottomChrome`, `setMiniPlayerShown` and `setInspectorSheetState` under `frontend/` finds only the module and its three callers (UploadProgress, MiniPlayerContainer, MobileInspectorSheet), and no test file. The touch points only say that MiniPlayerContainer and MobileInspectorSheet "expose their shown state or height".
Repro: Mutation: change `MINI_PLAYER_HEIGHT_PX` to 100, or delete the `if (chrome.miniPlayer)` branch of `bottomChromeOffset`. Reading the tests, no unit or e2e-layout test imports this module, so the mutant would survive. Not executed.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `frontend/src/lib/bottomChrome.ts` to the touch points. Add a unit test for `bottomChromeOffset`, and have the e2e-layout spec check `MINI_PLAYER_HEIGHT_PX` and `MINI_PLAYER_GAP_PX` against MiniPlayerContainer's class and style.

</details>

### claude-read:F4 — bucket B, LOW, open

Claim: `UploadProgress.tsx` now owns the window `beforeunload` handler that implements I5. The touch-point entry for that file describes only rendering once and the bottom offset, and no touch point says where the leave-page handler lives.
Impact: The leave-page guard lives in the drawer component, so it exists only while `UploadProgress` is mounted. It is mounted in the root layout today, but a later change that conditionally mounts or moves the drawer would silently drop I5. Also, if `lockApi()` rejects, `performLock` has already called `disarmLeaveConfirmation()` and nothing re-arms it, so later unfinished uploads get no leave-page prompt for the rest of the session.
Evidence: `UploadProgress.tsx` adds a `useEffect` that registers `beforeunload` and calls `leaveConfirmationArmed()`. In `Sidebar.tsx` `performLock`, `disarmLeaveConfirmation()` runs before `await lockApi()`. `useUpload.ts` sets `leaveSuppressed = true` and resets it only in `resetUploadStore`.
Repro: not_reproduced. By reading: make `lockApi` reject after confirming. `window.location` does not change, `leaveSuppressed` stays true, and `leavePage().defaultPrevented` is false while an upload is still uploading.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name the `beforeunload` handler's home in the touch points. Disarm only after `lockApi()` resolves, or re-arm when it fails.

</details>

### claude-read:F3 — bucket B, INFO, open

Claim: The diff adds new test files and helpers that the touch-point list does not name: `frontend/src/__tests__/helpers/uploadApiMock.ts`, `frontend/src/__tests__/helpers/uploadQueue.ts`, `frontend/src/__tests__/uploadLock.test.tsx`, `frontend/src/__tests__/uploadMessages.test.ts`, `frontend/src/__tests__/uploadQueueRefresh.test.tsx` and `frontend/src/hooks/__tests__/uploadQueue.test.tsx`. It also adds a new case to `uploadZoneHosts.test.tsx`, where the touch points said existing tests are adapted with their assertions unchanged.
Impact: None for a user. The planned surface of the change is understated: a reader of the touch points would not expect new acceptance suites or shared test helpers.
Evidence: The diff headers for the six new files. `uploadZoneHosts.test.tsx` gains `it.each(SCREENS)("%s hands its destination and the folder check past the view's unmount")`. The only test touch points are the four adapted files and `backend/tests/test_upload.py`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the acceptance test files and helpers to the touch-point list.

</details>

## Not verified

- claude-read: I did not run any test, and no mutation was executed; each mutant's outcome is my prediction from reading the tests.
- claude-read: I did not check whether commit 9285b20 alone contains only docs changes. I reviewed the supplied diff as the change.
- claude-read: I did not read the .claude/rules frontend or backend convention files in full.
- claude-read: I did not check whether MiniPlayerContainer's `isMini` exactly matches the mini-player being visible on screen.
- claude-verify: I could not run git diff, so I did not confirm that the files named in F2/F3 were added or edited in this commit range, or that spec-viewport.spec.ts was modified.
- claude-verify: MobileInspectorSheet.tsx's calls to setInspectorSheetState: I did not read them.
- claude-verify: Backend require_folder behaviour (I10).
- claude-verify: I did not run any test.

TOTAL: 4 findings
