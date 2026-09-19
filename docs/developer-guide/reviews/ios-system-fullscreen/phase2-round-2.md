# Phase 2, round 2 review — iOS system fullscreen for shell native video

- Tree: `e9fcd6d8` (fix `cead9693` on top of `6fc6e6a9`), reviewed as the fix commit, not `develop...HEAD`.
- Invariants: R-0 in `docs/superpowers/specs/2026-09-19-ios-system-fullscreen.md`, 2, 4, 5, 6 and 7 in scope,
  unrevised. Round 1's two proposed additions (background after use, the ended state) are treated as proposals.
- Swift tests ran on simulator `BE039A5E-…` (iPhone 17 Pro Max, addressed by id) with a scratch derived-data path.
  The booted simulator `4AB8B4E9-…` was not touched; no docker command was run.
- Baseline: the three suites passed (41 test cases, 20 of them `MediaPlayerFullscreenTests`).
- Every mutation was confirmed applied with `git diff -U0` before its run and restored with `git checkout` after.
  Scratch reproductions (R1–R6, P) were added to `MediaPlayerFullscreenTests.swift` and removed the same way.
- Everything `cead9693` adds is new code on a branch that is itself new, so findings on it are `[introduced]`
  without a parent reproduction.

## Did each fix do what it claims?

| claim | verdict | evidence |
|---|---|---|
| 1. derived `isActive`, one `onChange` via `settle()` (round-1 3, 4, 6) | **yes in behaviour; not held by the tests for the off-screen PiP case** | R3: a viewer-style close (animated `dismiss` + the delegate's coordinator) reports inactive and re-arms the page's PiP. R6: another file during the present animation settles once it finishes. P: `presentingViewController` is set synchronously by `present`. Refused present: `refusedPresentChangesNothing`. Gaps: findings 3, 4 |
| 2. `letGo()` on background (round-1 2) | **partial** | fixes the after-close case (M1, M2 killed). Does not cover the fullscreen on screen (finding 1) or becoming inactive while away (finding 2) |
| 3. `timeJumped` clears `ended` (round-1 1) | **yes, no regression found** | `movedBackFromTheEnd` kills M4/M5/M6. R1: a file that plays to its end stays `ended` for 1.5 s and `play` restarts it. R2: the page seeking to exactly `duration` while playing ends it and `play` restarts. The shell's own `seek` clears `ended` synchronously before its jump arrives, so the observer is a no-op there |
| 4. real-class tests (round-1 5) | **partly** | S20/S11 equivalents are now killed (M16, M28). But M12, M13, M14, M15 survive, and M7 is killed only by test order (findings 3, 4) |

Author's P1–P11 claim: every one I could map was killed in the full-suite run (letGo call M1, guard M2, jump
clearing M4/M5, derived state M7/M8, settle on present M9, settle on dismissal completion M10, shown player M16,
`onChange` M28, surface reaction M18, dismiss on file change M29). M7's kill is order-dependent (finding 3).

## Findings

### 1. The system player keeps the `AVPlayer` when the app leaves while it is on screen

- Label: `[introduced]` (from `6fc6e6a9`, round-1 finding 2's first bullet; `cead9693` claims finding 2 fixed and
  does not reach this case).
- Severity: high on a device whenever its automatic PiP does not start (the user turned "Start PiP Automatically"
  off, or PiP is not possible at that moment). The simulator has no PiP, so it is exactly this case there.
- Where: `ios/Litloft/Media/SystemFullscreen.swift:55-58` (`letGo` returns while `isActive`, and a presented
  controller is active) called from `ios/Litloft/Media/VideoSurface.swift:282`.
- Reproduction R4 (scratch): real `SystemFullscreenPlayer`, load `"a"`, `apply(.fullscreen)`, wait for
  `isActive`, post `didEnterBackgroundNotification`. Result: `Expectation failed: (system.player → <AVPlayer>) ==
  nil`. The controller still holds the player in the background. By the author's own simulator measurement a
  controller that holds the player stalls background playback (1:57 → 2:01 over about 13 s).
- The guard cannot simply be widened: while PiP is starting the controller needs the player. The rule the surface
  already uses (let go unless PiP is on or starting) is the one that fits.
- Invariant: 6.

### 2. A system player that becomes inactive while the app is away keeps the player

- Label: `[introduced]`.
- Severity: low (device only). It is reachable when the system player's PiP stops, or fails to start, after
  `didEnterBackground`. Closing a PiP window with its X usually pauses anyway. A failed start does not.
- Where: `letGo` runs only on `didEnterBackground` (`ios/Litloft/Media/VideoSurface.swift:280-285`).
  `fullscreenChanged(false)` (`:343-346`) does not let go. The surface's own PiP has `letGoIfStillAway`
  (`:289-292`, `:322-327`) for exactly this path; the system player has no counterpart.
- Reproduction R5 (scratch): present, `setPictureInPicture(true)`, wait until the controller is off screen, post
  `didEnterBackground` (player kept, correctly), then `setPictureInPicture(false)`. `isActive` is `false` and
  `system.player` is still the `AVPlayer`: `Expectation failed: (system.player → <AVPlayer>) == nil`.
- Invariant: 6 (and round-1's proposed background-after-use addition).

### 3. The PiP-keeps-it-active tests never reach the state they name, so dropping the settle on PiP stop survives

- Label: `[introduced]`.
- Severity: medium. A test lets through a break of invariants 4, 5 and 7.
- Where: `ios/LitloftTests/MediaPlayerFullscreenTests.swift:184-224` (`pictureInPictureKeepsItActive`,
  `anotherFileKeepsItsPictureInPicture`), and `ios/Litloft/Media/SystemFullscreen.swift:118-121`.
- Probe P (scratch, three runs): right after `apply(.fullscreen)` the controller is presented. `dismiss()` called
  then leaves it presented: still presented at +100 ms, gone by +1 s. The present animation is still running, and
  UIKit defers the dismissal until it finishes.
  - Both tests call `setPictureInPicture(true)`, `dismiss()` and `setPictureInPicture(false)` with no wait between
    them. So `#expect(system.isActive)` holds because the controller is still on screen, not because of the PiP.
  - The final "inactive" report comes from the deferred dismissal's completion, not from the PiP stopping.
  - The real order is the reverse: the controller leaves first, and the PiP stops much later. That order is never
    exercised.
- Mutation M13, which removes `settle()` from `setPictureInPicture`: **live**. On a device, a PiP started from
  the system player that ends later would never report inactive. The page's own automatic PiP would stay off, and
  the page would never be told where the video was left.
- Mutation M7, `isActive` without `inPictureInPicture`, is killed only by test order:
  - In the full run it is killed by `backgroundKeepsItsPictureInPicture` alone.
  - Run with only the three PiP tests, the result flips: `backgroundKeepsItsPictureInPicture` passes, and the
    other two fail.
  - The real-player tests close without waiting for the previous test's controller to leave the shared window. So
    whether a test's `present` actually happens depends on which test ran before it.
- A test that waits for `rootViewController.presentedViewController == nil` before stopping the PiP holds the real
  order. R5 does, and on this tree it reaches `!isActive`.
- Invariant: 4, 5, 7.

### 4. The viewer's own close and AVKit's delegate callbacks are still driven by no test

- Label: `[introduced]` (round-1 finding 3's test gap, unchanged by the fix).
- Severity: medium. Closing with Done or a swipe is the main path for invariants 4 and 5. The behaviour is correct
  today: R3 simulated it with an animated `dismiss` and the delegate's `willEndFullScreenPresentation…` coordinator,
  the coordinator completion found `presentingViewController == nil`, and the page's PiP was re-armed and the page
  told. But nothing keeps it that way.
- Where: `ios/Litloft/Media/SystemFullscreen.swift:85-107`.
- Mutations, all live:
  - M12: the coordinator completion no longer settles.
  - M14: a failed PiP start sets `true`.
  - M15: a PiP stop sets `true`.
- Every real-class test closes through `system.dismiss()` and sets the PiP through `setPictureInPicture` directly.
  R3's shape can drive the delegate from a test: find the controller as `rootViewController.presentedViewController`,
  call `dismiss(animated: true)`, and pass its `transitionCoordinator` to the delegate method.
- Invariant: 4, 5.

### 5. While a PiP left by the system player outlives its file, the page shows PiP off and its fullscreen button does nothing

- Label: `[introduced]` (the remainder of round-1 finding 4; the fix chose to keep the state until the PiP
  stops).
- Severity: low (bucket B unless the supervisor reads invariant 7 otherwise).
- Where: `ios/Litloft/Media/MediaPlayer.swift:351` (`pip:` reports the surface's PiP only) and
  `ios/Litloft/Media/VideoSurface.swift:336` (`presentFullscreen` returns while the system player is active).
- Behaviour, held by `anotherFileKeepsItsPictureInPicture`: after file `"b"` loads, the PiP window shows `"b"`.
  - The page's PiP state reads off.
  - Its fullscreen button is inert until that PiP stops.
  - Its own PiP button would try to start a second PiP (unmeasured; no PiP in the simulator).
- Invariant: 7.

### 6. `CoordinatorTests/downloadFromALivePage` is flaky

- Label: `[pre-existing]` (known; outside this review's test selection, not re-run).

## Checked, no action

- `timeJumped` at the end of the file (R1) and on the page's seek to exactly the duration (R2): `ended` holds, and
  play restarts from the start.
- `presentingViewController` during present: set synchronously (P), so `settle()` right after `present` is correct
  and a refused present reports nothing.
- `presentingViewController` during dismissal: the dismissal is deferred behind a running present. The completion
  handler settles (M10 killed; R6: another file mid-present ends inactive, the page's PiP re-armed, the controller
  gone).
- `letGo` against a present: `present` reassigns the player before presenting (M16 killed), and `letGo` is
  guarded while presented. No interleaving was found where `letGo` runs between the reassignment and the
  presentation (both are synchronous on the main actor).
- `letGo` against the surface's own background handling: independent. M21 (only let go when the surface's PiP is
  off) survives as intended; the two holders are unrelated.
- The `AVPlayerItem.observe` helper: M23 (`object: nil`) survives because there is one `MediaPlayer` per shell.
  Accepted.

## Mutation table

| id | mutation | want | result |
|---|---|---|---|
| M1 | drop `fullscreen.letGo()` in `enteredBackground` | kill | killed (`backgroundLetsGo`) |
| M2 | drop `guard !isActive` in `letGo` | kill | killed (`backgroundKeepsItsPictureInPicture`) |
| M4 | drop the `timeJumped` observer | kill | killed (`movedBackFromTheEnd`) |
| M5 | `jumped()` does not clear `ended` | kill | killed |
| M6 | `jumped()` does not report | kill | killed |
| M7 | `isActive` without `inPictureInPicture` | kill | killed, **order-dependent** (finding 3) |
| M8 | `isActive` = `inPictureInPicture` only | kill | killed |
| M9 | drop `settle()` after `present` | kill | killed (`realPlayerShowsAndReports`) |
| M10 | drop the dismissal completion's `settle()` | kill | killed |
| M11 | drop the synchronous `settle()` in `dismiss` | live | live |
| M12 | coordinator completion does not settle | kill | **live** (finding 4) |
| M13 | `setPictureInPicture` does not settle | kill | **live** (finding 3) |
| M14 | failed PiP start → `setPictureInPicture(true)` | kill | **live** (finding 4) |
| M15 | PiP stop → `setPictureInPicture(true)` | kill | **live** (finding 4) |
| M16 | `present` does not hand over the player | kill | killed |
| M17 | `settle` reports without the edge guard | live | live |
| M18 | surface sets `startsAutomatically = true` always | kill | killed |
| M19 | `onFullscreenEnd` on every change | live | live |
| M20 | drop `onFullscreenEnd` | kill | killed (`endReportsThePosition`, fake only) |
| M21 | `letGo` only when the surface's own PiP is off | live | live |
| M22 | `dismiss` guard without `presentingViewController` | live | live |
| M23 | item observer with `object: nil` | live | live |
| M25 | drop `!fullscreen.isActive` in `presentFullscreen` | kill | killed (`presentedOnce`) |
| M26 | drop `guard ended` in `jumped()` | live | live |
| M27 | keep the old item's observers on replace | live | live |
| M28 | drop `onChange?(active)` | kill | killed |
| M29 | drop `fullscreen.dismiss()` in `showsVideo` | kill | killed |
| R1 | scratch: play to end, wait, play | — | passes (no regression) |
| R2 | scratch: seek to the duration while playing, play | — | passes (no regression) |
| R3 | scratch: viewer-style close through the delegate | — | passes (behaviour correct) |
| R4 | scratch: background while on screen | — | fails (finding 1) |
| R5 | scratch: PiP stops while away | — | fails (finding 2) |
| R6 | scratch: another file mid-present | — | passes |
| P | scratch: presented state around an immediate dismiss | — | presented at +0 and +100 ms, gone by +1 s |

No mutation failed to compile.

## Trajectory

Diffs read in order: `6fc6e6a9`, then `cead9693`.

**Removed by `cead9693`:**
- two stored flags, `isActive` and `onScreen`;
- `end()` and its guard;
- the `isCancelled` branch;
- both conditionals that predicted AVKit's callback order: `if !inPictureInPicture { end() }` and
  `if !onScreen { end() }`.

The state is now read from UIKit instead of predicted. Of round 1's three flags, one survives (`inPictureInPicture`)
and one new one is added (`reported`, an edge detector with no behaviour of its own; M17 survives because it only
suppresses duplicate reports). For the fullscreen state machine this is the converging shape: a round that removes
predictions.

**Added by `cead9693`:**
- `letGo()`, a new protocol method with a guard;
- `jumped()`, with a guard.

`jumped()` is a single edge on existing state and has no follow-up case.

`letGo()` is of the same kind as the surface's background rules. It predicts when the system pauses a player that
still has a layer. The surface needed three pieces for that prediction: `enteredBackground`, the PiP-starting
exception, and `letGoIfStillAway`. The system player now has one. Findings 1 and 2 are the missing two, found one
round later. If round 3 adds them one at a time (let go while on screen unless PiP is starting; let go when it becomes
inactive while away), that is two rounds in a row adding background-detach cases, which is the patching shape.

Plainly:
- The fullscreen state is converging.
- The background handling is starting to be patched.
- Two independent holders of one `AVPlayer`, each with its own background-detach rules, are a design question for
  the supervisor. One option is a single owner that detaches every holder. I am not assigning a bucket.

TOTAL: 6 findings
