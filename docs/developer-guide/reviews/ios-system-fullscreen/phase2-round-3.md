# Phase 2, round 3 review — iOS system fullscreen for shell native video

- Tree: `88dfaf07`. The fix under review is `343f5b4c`, on top of `cead9693` and `6fc6e6a9`. The two other
  commits add only review files. This review looks at that fix, not at `develop...HEAD`.
- Invariants: R-0 in `docs/superpowers/specs/2026-09-19-ios-system-fullscreen.md`. Invariants 2, 4, 5, 6 and 7
  are in scope. They have not been revised.
- The Swift tests ran on simulator `BE039A5E-…` (iPhone 17 Pro Max), addressed by its id, with a scratch
  derived-data path. I did not touch the booted simulator `4AB8B4E9-…` and ran no docker command.
- Baseline: the four suites passed, 44 test cases in all.
- Before each run I confirmed the mutation applied with `git diff -U0`. After each run I restored it with
  `git checkout`.
- Everything `343f5b4c` changes is on a branch that is itself new, so every finding about it is `[introduced]`
  without a parent reproduction.

## Did each claim hold?

| claim | verdict | evidence |
|---|---|---|
| 1a. `enteredBackground` lets go of both holders unless a PiP is on or starting, the surface's (`isPictureInPictureActive`, `pipStarting`) or the system player's (`isInPictureInPicture`) | **yes, as written** | N1, N2 and N3 killed. N4 (each holder keeps the player only for its *own* PiP) **survives**: no test fixes which holder keeps the player during the *other* holder's PiP. Findings 1 and 2 |
| 1b. `becameActive` gives the player back to both (`takeBack`) | **yes** | N5 killed. N7 survives: taking the player back only while the controller is on screen breaks no test. Finding 2 |
| 1c. a system player that becomes inactive while the app is away runs `letGoIfStillAway` | **yes, for the path where `isActive` falls** | N8 killed. The path is keyed on the `isActive` edge, not on the system PiP changing. A PiP that fails or stops while the controller is still presented does not reach it (finding 4) |
| 1d. `letGo` and `takeBack` have no guards of their own | **`letGo` yes; `takeBack` keeps `controller.player == nil`** | N9 (restore `guard !isActive` in `letGo`) killed. N6 (drop `takeBack`'s guard) survives: the guard does nothing. It is harmless. Recorded here, not as a finding |
| 2. round-2 findings 1 and 2 fixed | **1 yes; 2 only for the off-screen case** | `backgroundWhileOnScreen` holds round-2 finding 1 (N2, N5, N9 killed). Round-2 R5, a PiP that stops after the controller has left, is held by `pictureInPictureAway` (N8, N17 killed). The case where the system player's PiP fails while the controller is still presented remains open (finding 4). I did not repeat the author's 0:03 to 0:24 simulator measurement. R4 below saw no reset in the nearby case where the app leaves during the close animation |
| 3. round-2 findings 3 and 4 fixed in the tests | **yes** | M12, M13, M14, M15 and M7 are all killed now. M7 is also killed with `pictureInPictureAway()` and `pictureInPictureKeepsItActive(stops:)` each run alone, so the test-order dependence round 2 found is gone. The tests wait for `presentedViewController == nil` before the PiP stops, which is the real order |

The author's Q2–Q7 are not named in the record I was given. Every behaviour `343f5b4c` adds is covered by the
N-series below.

## Reproductions

I added the scratch tests below to `MediaPlayerFullscreenTests.swift` and removed them afterwards. I ran each one
on this tree (`88dfaf07`) and on the parent fix `cead9693`, in a throwaway worktree that I have since removed. All
of them use the real `SystemFullscreenPlayer`, and the AVKit delegate callbacks are driven by hand. The simulator
has no PiP.

| id | scenario | `88dfaf07` | `cead9693` |
|---|---|---|---|
| R1 | Present, system PiP `WillStart`, dismiss and wait until it is gone, then `didEnterBackground`. Is the surface's layer detached? | **kept** (`playerLayer.player` is the `AVPlayer`) | detached |
| R2 | Present, then `didEnterBackground`, then `WillStartPictureInPicture`. Does the controller hold a player as its PiP starts? | **no** (`system.player == nil`) | yes |
| R3 | Present, `WillStart`, then `didEnterBackground`, then `failedToStartPictureInPicture`, with the controller still presented. Is the player let go? | **neither holder lets go** | controller keeps it, surface lets go |
| R4 | Present, seek to 2 s, dismiss with animation through the delegate's coordinator, and `didEnterBackground` during the animation. Where is the position after it is gone and after coming back? | 2.0 s both times, and the page is told 2.0 | same |
| R5 | Present, dismiss and wait until it is gone, then `didEnterBackground` and `didBecomeActive`. Does the off-screen controller hold the player? | **yes** | no |
| R6 | After a close, the surface's PiP starts automatically, then `didEnterBackground`. Does the off-screen controller let go? After `failToStart`? | **keeps it**, then lets go | lets go, then lets go |

## Findings

### 1. While the system player's PiP runs with the app away, the page's own layer keeps the player

- Label: `[introduced]`. R1 is detached on `cead9693` and kept on `88dfaf07`.
- Severity: medium. Device only, unmeasured.
- Where: `ios/Litloft/Media/VideoSurface.swift:283`. `!fullscreen.isInPictureInPicture` in the guard stops
  `view.playerLayer.player = nil` from running.
- The system player's PiP draws from the `AVPlayerViewController`'s own layer, not from the surface's
  `AVPlayerLayer`. So the new condition keeps the surface's layer attached for a PiP that does not use it.
- On a device, this adds a second, off-screen layer attached to the same player during the system PiP. The rule
  the surface is built on is that a player still attached to a layer is paused by the system when the app leaves
  the screen. Round 2 measured the same thing for a kept controller: 1:57 to 2:01 over about 13 s. If that rule
  also applies while another layer's PiP is running, playback in the system PiP stops (invariant 6). Whether it
  applies was not measured, before or after this change.
- N4 moves to a rule where each holder lets go unless its own PiP is on. It **survives**, so no test fixes either
  choice.
- Measure on a device: open the system player, go home so its PiP starts, and watch whether the PiP keeps
  advancing. Then compare with N4 applied.
- Invariant: 6.

### 2. The kept controller takes the player back off screen, and keeps it while the page's own PiP starts or runs

- Label: `[introduced]`. R5 and R6 hold the player on `88dfaf07` and not on `cead9693`.
- Severity: low. Device only.
- Where:
  - `ios/Litloft/Media/SystemFullscreen.swift:63-66`: `takeBack` gives the player to a controller whether or not
    it is on screen.
  - `ios/Litloft/Media/VideoSurface.swift:297` calls it on every `didBecomeActive`.
  - `ios/Litloft/Media/VideoSurface.swift:283` then skips `fullscreen.letGo()` while the *surface's* PiP is on
    or starting.
- Result: after the system player has been used once, every return to the app re-attaches the player to an
  off-screen `AVPlayerViewController` (R5). When the page's own automatic PiP starts on the next trip away, that
  controller keeps the player for as long as the PiP runs (R6). It lets go only when that PiP stops or fails,
  through `letGoIfStillAway`.
- `cead9693` let the off-screen controller go in both cases. What an off-screen controller holding the player does
  to the page's PiP was not measured.
- Mutation N7 limits `takeBack` to a controller still presented. It **survives**: nothing needs the player on an
  off-screen controller, because `present` hands the player over again anyway (`SystemFullscreen.swift:47`).
- Invariant: 6.

### 3. Letting go while on screen now depends on AVKit's automatic PiP announcing itself before `didEnterBackground`

- Label: `[introduced]`. R2: on `cead9693` the presented controller never let go, so the order did not matter.
- Severity: medium if the order is the other way on a device, none otherwise. Unmeasured.
- Where:
  - `ios/Litloft/Media/VideoSurface.swift:283-285`.
  - `ios/Litloft/Media/SystemFullscreen.swift:59-61` (unguarded) and `:102-104`.
- `isInPictureInPicture` becomes true only in `playerViewControllerWillStartPictureInPicture`.
  - If AVKit sends that callback after `didEnterBackgroundNotification`, then `enteredBackground` has already set
    `controller.player = nil` on the presented controller.
  - Its automatic PiP then starts with no player. R2: `system.player == nil` inside `WillStart`.
  - Nothing later gives the player back while the app is away: `takeBack` runs only on `didBecomeActive`.
- Against invariant 6 in that order:
  - Both holders have let go, so audio carries on and playback is not stopped in that sense.
  - But the viewer gets no picture in picture from the system player (a PiP with no player, or a failed start).
- The surface's own PiP already relies on the same order: `pipStarting` comes from the same AVKit
  `willStart`/`didEnterBackground` sequence, and `failedStartLetsGo` encodes it. So if that order was measured on
  a device for `AVPictureInPictureController`, it probably holds for `AVPlayerViewController` too. It has not been
  measured for the latter.
- Measure on a device, with the system player on screen:
  - log `WillStartPictureInPicture` and `didEnterBackgroundNotification` with timestamps;
  - go home and check that the PiP shows the video.
- Invariant: 6.

### 4. A system PiP that fails or stops while its controller is still presented, with the app away, lets go of neither holder

- Label: `[introduced]`. R3 on `cead9693`: the controller kept the player and the surface let go. On `88dfaf07`
  both keep it, because the surface's layer is now also held by the either-PiP guard.
- Severity: medium. Device only. Reachable when the system player's automatic PiP starts as the app leaves and then
  fails. Also reachable when the PiP stops while AVKit still has the controller presented. Whether AVKit dismisses
  the fullscreen controller when its PiP starts decides how often this happens; that was not measured.
- Where:
  - `ios/Litloft/Media/SystemFullscreen.swift:126-129`: `setPictureInPicture` only calls `settle()`.
  - `ios/Litloft/Media/VideoSurface.swift:345-350`: `letGoIfStillAway` runs only when `fullscreenChanged(false)`
    fires.
  - `isActive` (`SystemFullscreen.swift:37-39`) stays true while the controller is presented. So when the PiP
    falls, `isActive` does not change, `onChange` does not fire, and nothing re-runs the background rule.
- R3: after `failedToStartPictureInPicture`, `system.player` and `surface.view.playerLayer.player` are both still
  the `AVPlayer`, with the app away. By the surface's own rule, and round 2's measurement, the system pauses it.
- The surface's own PiP re-enters the rule on every PiP change (`pip.onChange` → `letGoIfStillAway`,
  `VideoSurface.swift:324-329`). The system player re-enters it only on the `isActive` edge. That is the asymmetry.
- Invariant: 6.

### 5. `CoordinatorTests/downloadFromALivePage` is flaky

- Label: `[pre-existing]`. Known, outside this selection, and not re-run.

## Checked, no action

- **The app leaves during the close animation** (R4). `letGo` is now unguarded, so it runs on a controller that is
  mid-dismissal. The position stays at 2.0 s through the close and the return, and the page is told 2.0. The class
  comment says taking the player from the controller "as it closes" resets it. That was not observed here with the
  player paused.
- **`letGoIfStillAway` from `fullscreenChanged` against the surface's own PiP change.** Both enter
  `enteredBackground`, which is idempotent. While the system PiP is up, the surface's `pip.onChange` (for example
  its `isPictureInPicturePossible` KVO) re-enters and returns at the guard. `wasInBackground` is only ever set
  there, and N17 (setting it after the guard) is killed.
- **`fullscreenChanged(true)` while away.** N10 moves `letGoIfStillAway` ahead of the `active` guard. It survives,
  as expected: nothing becomes active while the app is away except a PiP start, and that holds the guard anyway.
- **Pulling Control Center down.** `becameActive` without `didEnterBackground` makes `takeBack` a no-op, because
  the player was never let go. N18 (take back only after a real background) survives, as expected.
- **Round-2 finding 5** (the page shows its PiP as off while a system PiP outlives its file). `343f5b4c` does not
  change it. Not re-derived.
- **The four suites after all mutations were restored:** 44 of 44 passed, and `git status --short` shows only
  this file.

## Mutation table

Every mutation compiled.

| id | mutation | want | result |
|---|---|---|---|
| N1 | drop `!fullscreen.isInPictureInPicture` from the `enteredBackground` guard | kill | killed (`pictureInPictureAway`) |
| N2 | drop `fullscreen.letGo()` from `enteredBackground` | kill | killed (`backgroundWhileOnScreen`, `backgroundAfterClosing`, `pictureInPictureAway`) |
| N3 | call `fullscreen.letGo()` before the guard, as in `cead9693` | kill | killed (`pictureInPictureAway`) |
| N4 | each holder keeps the player only for its own PiP (`if !fullscreen.isInPictureInPicture { letGo() }` before a surface-only guard) | live | **live** (findings 1, 2) |
| N5 | drop `fullscreen.takeBack(player)` in `becameActive` | kill | killed (`backgroundWhileOnScreen`) |
| N6 | drop `controller.player == nil` from `takeBack`'s guard | live | live |
| N7 | `takeBack` only while the controller is presented | live | **live** (finding 2) |
| N8 | drop `letGoIfStillAway()` from `fullscreenChanged` | kill | killed (`pictureInPictureAway`) |
| N9 | restore `guard !isActive` in `letGo` | kill | killed (`backgroundWhileOnScreen`) |
| N10 | `letGoIfStillAway()` ahead of the `active` guard | live | live |
| N11 | `WillStartPictureInPicture` sets `false` | kill | killed (4 tests) |
| N17 | set `wasInBackground` after the guard | kill | killed (`pictureInPictureAway`, `failedStartLetsGo`, `stoppedOffScreenLetsGo`, `comingBackCloses`) |
| N18 | `takeBack` only after a real background | live | live |
| M7 | `isActive` without `isInPictureInPicture`, full selection | kill | killed (4 tests) |
| M7a | M7, `pictureInPictureKeepsItActive(stops:)` alone | kill | killed (both arguments) |
| M7b | M7, `pictureInPictureAway()` alone | kill | killed |
| M12 | the coordinator completion does not settle | kill | killed (`viewerCloseTellsThePage`) |
| M13 | `setPictureInPicture` does not settle | kill | killed (4 tests) |
| M14 | a failed PiP start sets `true` | kill | killed (`pictureInPictureKeepsItActive(stops: false)`) |
| M15 | a PiP stop sets `true` | kill | killed (3 tests) |
| R1–R6 | scratch reproductions, see above | — | R1, R2, R3, R5 and R6 differ from `cead9693`; R4 does not |

## Trajectory

I read the diffs in order: `6fc6e6a9`, `cead9693`, then `343f5b4c`.

**`cead9693` added one background prediction to the system player:** `letGo()`, with `guard !isActive`. It
predicts that the system pauses a player held by an off-screen, non-PiP controller.

**`343f5b4c` removed:**
- the `letGo` guard;
- the separate, unconditional `fullscreen.letGo()` call, which now goes through the surface's one rule.

**`343f5b4c` added:**
- a protocol state, `isInPictureInPicture`;
- a protocol method, `takeBack`;
- a condition in the shared guard: the other holder's PiP also keeps *this* holder attached;
- a new re-entry path, `letGoIfStillAway` on the `isActive` falling edge.

Taken on its own terms, the fix is the consolidating shape round 2 proposed. One function, `enteredBackground`,
now decides for both holders, and one re-entry, `letGoIfStillAway`, covers both. The two cases round 2 predicted
(on screen, and inactive while away) were not added as two separate branches.

But the trajectory test asks whether this round adds a branch, a state or a prediction of the same kind as the
round before. It does:
- `cead9693` added a background-detach prediction for the controller.
- `343f5b4c` adds another state (`isInPictureInPicture` exposed), another method (`takeBack`) and another
  prediction: that either holder's PiP needs both holders attached. The code does not measure that prediction,
  and for the system PiP the construction contradicts it (finding 1). It also changed two behaviours that were
  right on `cead9693` (R1, R6).
- It leaves the next case open: a PiP that falls while the controller is still presented (finding 4).
- The obvious fix for finding 4 is a third re-entry, "also re-run the rule when the system PiP changes". That
  would be the third round in a row adding a background case.

Plainly:
- The consolidation is real.
- The background handling is still being patched: two rounds in a row have each added background state or
  prediction.
- The one-owner idea was applied as "one guard for both holders". Round 2 proposed "one owner that detaches every
  holder". The first couples each holder to the other's PiP. The second would detach each holder unless its own
  PiP needs it, and re-run the rule on every PiP change from either source.
- That shape covers findings 1, 2 and 4 without a new case. N4 and N7 both survive, so the tests already allow it.
- I am not assigning a bucket.

TOTAL: 5 findings
