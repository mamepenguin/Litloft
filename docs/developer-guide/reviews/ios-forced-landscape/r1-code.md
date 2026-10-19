# Code review R1 — 498139b17 (iOS forced landscape), addon d80dc2a

## 1. First-round question: places the diff reaches that are not in the touch-point list

- `LitloftApp` installs an `AppDelegate` whose `supportedInterfaceOrientationsFor` answers for every window of the app, not only the web view's. That includes the system player presented by `embed.fullscreen` (EmbedFrames / AVPlayerViewController). The delegate returns the same iPhone set as the build settings (`INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone` = portrait + both landscapes), so iPhone is unchanged. On iPad it returns `.all`; no iPad orientation key is set in the pbxproj, so whether this widens the iPad set was not measured (unverified).
- Candidate missing invariant: "the embed system player and every other presented controller keep the orientations they had before when no lock is held". No test covers it.
- `ShellVideoPlayer` is in the list; `frontend/src/test/shellStub.ts` and `shell-contract.json` (fixture) are test-only. Everything else the diff touches is listed.

## 2. Mutation table

Frontend: `pnpm vitest run src/components/player src/components/__tests__/VideoPlayerShell.test.tsx src/lib/__tests__/shellImmersive.test.ts src/lib/__tests__/nativeMedia.test.ts`. Addon: `YouTubeEmbedPlayer.test.tsx` with the submodule detached at d80dc2a (restored to main afterwards). iOS: LandscapeLockTests, OrientationControllerTests, OrientationPolicyTests, ImmersiveTests, ShellBridgeTests, WebViewModelTests, ContractTests, MediaPlayerVideoTests in the simulator; test names confirmed in the run list on the baseline.

| id | target | want | observed | verdict |
|---|---|---|---|---|
| M1 | useFullscreen: drop `reason === "manual"` | kill | 1 failed (useFullscreenImmersive) | ok |
| M2 | useFullscreen: drop the `isLandscapeRef.current()` read | kill | 14 failed | ok |
| M3 | `isLandscape` default `() => true` | kill | 12 failed | ok |
| M4 | ShellVideoPlayer `>` to `>=` | kill | 1 failed (VideoPlayerShell) | ok |
| M5 | holdImmersive always sends `landscape` (false key) | kill | 22 failed | ok |
| M6 | ShellVideoPlayer: drop `size !== undefined &&` (channel is null on first render) | live | 442 pass | survivor, F4 |
| M7 | ref no longer refreshed | kill | killed only by VideoPlayerShell, not by the hook's "reads at the press" test | ok overall, see F4 |
| M8 | holdImmersive `landscape ? ` to `true ?` | kill | 22 failed | ok |
| M9 | width/height swapped | kill | 2 failed | ok |
| Y1 | YouTubeEmbed: shorts check dropped | kill | 1 failed | ok |
| Y2 | `startsWith("/shorts/")` to `includes("shorts")` | live | pass | as wanted |
| Y3 | `isShortsUrl` catch returns true | live | pass | as wanted (unparseable URL cannot reach it) |
| Y4 | YouTube never asks | kill | 1 failed | ok |
| I1 | WebViewModel: drop `idiom == .phone` | kill | padNeverLocks | ok |
| I2 | drop `immersive &&` in the lock condition | live | pass | as wanted (the page never sends `{active:false, landscape:true}`) |
| I3 | drop lock dedupe guard | kill | lockIsReportedOnce | ok |
| I4 | drop `scene.isPortrait` guard | kill | alreadyLandscape | ok |
| I5 | drop `!holding` guard | kill | idempotent | ok |
| I6 | `else if holding` to `else` | kill | 3 failed | ok |
| I7 | drop `guard holding` in `refused()` | live | pass | survivor, F3 |
| I8 | `refused()` leaves `OrientationPolicy.isLocked` set | kill | refusal | ok |
| I9 | request landscape before setting the policy flag | live | pass | as wanted (a fake scene cannot read the policy) |
| I10 | WebContent termination no longer clears immersive/lock | kill | pageEndsLandscapeLock, terminationEndsImmersive | ok |
| I10b | didCommit no longer clears | kill | commitEndsImmersive, pageEndsLandscapeLock | ok |
| I11 | `rotationSettled` always true | kill | landscapeRequest, rotationSettled | ok |
| I11b | `rotationSettled` `>` to `>=` | live | pass | square bounds never occur; fine |
| I11c | drop `rotationSettled` from the `webViewDidLayout` guard | author said live | landscapeRequest FAILED here, and the unit test passes (it tests the static function only) | ok; the integration test did kill it in this run |
| I12 | locked mask to `.landscapeLeft` | kill | supported | ok |
| I12b | unlocked set drops landscapeRight | kill | 3 failed | ok |
| I12c | drop the iPad guard in `supported` | kill | supported | ok |
| I13 | ShellBridge `landscape` default true | kill | 4 failed | ok |
| I14 | `refuseLandscape` no longer asks for a layout | kill | refusalClearsTheLock | ok |
| I15 | `refuseLandscape` no longer clears the lock | kill | refusalClearsTheLock | ok |
| I16 | `videoHeight` read from width | kill | readyVideoReportsItsSize | ok |
| I17 | remove `isolated deinit` unlock | kill | 3 failed | ok |
| I18 | unlock asks `.portraitUpsideDown` | kill | 3 failed | ok |
| I19 | WebShell: remove `onLandscapeLockChange` wiring | kill | landscapeRequest | ok |
| I20 | WebShell: remove `orientation.onRefused` wiring | kill | pass | survivor, F2 |
| I21 | LitloftApp: remove `@UIApplicationDelegateAdaptor` | kill | pass (all 8 suites) | survivor, F1 |
| I22 | drop `setNeedsUpdateOfSupportedInterfaceOrientations()` | unknown | landscapeRequest failed | ok |
| I23 | `SceneOrientation.request`: no `onRefused` when there is no scene | live | pass | as wanted |
| I24 | set `immersive` before the lock in `setImmersive` | live | pass | as wanted (order not observable here) |

## 3. Findings

### F1 — [A, introduced, test gap] Nothing holds that the app delegate is installed
`ios/Litloft/LitloftApp.swift`: removing `@UIApplicationDelegateAdaptor(AppDelegate.self)` leaves all 8 suites green (I21). `OrientationPolicy.supported` is table-tested, but nothing ties the policy to what UIKit asks. Without the delegate, `OrientationPolicy.isLocked` is inert. The geometry request still rotates the app (landscapeRequest passes), but invariant 5 ("while landscapeLocked a request for portrait fails") is not enforced: the viewer can turn the phone back to portrait mid-full-screen. A test would assert `UIApplication.shared.delegate` (or the adaptor's delegate) answers `supportedInterfaceOrientationsFor` with the locked set while `OrientationPolicy.isLocked` is true, or `landscapeRequest` would also check `UIApplication.shared.supportedInterfaceOrientations(for: window)` mid-lock. Not reproducible on the parent: the code is new.

### F2 — [A, introduced, test gap] Invariant 8 is held in pieces; the joint is untested
`ios/Litloft/Web/WebShell.swift`: removing `orientation.onRefused = { ... model?.refuseLandscape() }` leaves everything green (I20). `refuseLandscape` and the controller's refusal are each unit-tested, but the line that connects them is not. Without it a refused rotation leaves `landscapeLocked` true, `rotationSettled` false, and `page.immersive.applied` is never sent. The page recovers only through its 1000 ms deadline, and the model stays locked until full screen closes. A hosted-WebShell test (like landscapeRequest, with a `SceneOrientation` that refuses) would hold it.

### F3 — [B, introduced] A late refusal cannot be told from the current request
`OrientationController.refused()` is guarded only by `holding`. Sequence: lock (request 1), unlock, lock again (`holding` true for request 2), then request 1's error handler fires. It clears request 2's hold and policy and reports a refusal. Removing the guard (I7) survives, so even the one-generation case is untested. Reachability needs the system to report an error for a request after the viewer has already left and re-entered full screen: very narrow. Unverified, no repro; offered as B.

### F4 — [B, introduced] `ShellVideoPlayer.isLandscape` null-channel guard is unheld; one hook test is weaker than its name
- M6: `channel` is `null` until the first effect (`useShellMedia`), and `channel?.read()` is `undefined` there. Dropping the guard still passes 442 tests. A press before the channel exists would throw inside the fullscreen entry. Practically unreachable, but the guard is untested.
- The hook test "reads whether the video is landscape at the press, not when it last rendered" does not kill M7 (the ref never refreshed): its `isLandscape` closure reads a mutable variable, so a stale ref still sees the new value. The behaviour is held by VideoPlayerShell (M7 killed there), so the property is covered. The test name overstates it.

### Observations, not findings
- presentationSize for a rotated video (`preferredTransform`, portrait phone clips) is not covered by the fixture (`tiny.mp4`, 64x36). The doc comment says "with its transform applied"; unverified on the platform. A portrait clip reported unrotated would be forced landscape.
- Invariants 1, 2, 3, 6, 7, 9 were each attacked by at least one killed mutation (M1-M5, M8, M9, I1, I13, Y1, Y4). The shorts check (Y1/Y4) is held; Y2/Y3 survive as equivalents.
- Not re-reported: the author's `rotationSettled` survivor. In this run I11c (clause dropped from the layout guard) was killed by `ImmersiveTests/landscapeRequest`, and I11 (predicate always true) was killed by both the integration test and the unit test.

Tree restored after every mutation; submodule restored to `main`; `git status --short` shows only `ios/Design/` and `scratchpad/`.

TOTAL: 4 findings
