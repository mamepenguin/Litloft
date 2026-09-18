# Phase 2, round 1 review — iOS system fullscreen for shell native video

- Tree: `6fc6e6a9` on `feat/ios-system-fullscreen`, reviewed as that one commit (not `develop...HEAD`).
- Spec: `docs/superpowers/specs/2026-09-19-ios-system-fullscreen.md`. R-0 invariants 2, 4, 5, 6 and 7 are in scope.
- Swift tests ran on simulator `BE039A5E-…` (iPhone 17 Pro Max) with a scratch derived-data path. The booted
  simulator `4AB8B4E9-…` was not touched, and no docker command was run.
- Baseline: the four Swift suites passed (80 test cases, all 11 `MediaPlayerFullscreenTests` cases included). The
  frontend `nativeMedia.test.ts` and `VideoPlayerShell.test.tsx` passed (56 tests).
- Before each run the mutation was confirmed applied (`git diff -U0` printed); the file was restored with
  `git checkout` after each run.
- Everything in `SystemFullscreen.swift`, and every line the commit adds elsewhere, is new, so findings on them are
  `[introduced]` without a parent reproduction.

## Findings

### 1. A video that ended in the system player and was scrubbed back there rewinds to 0 on the page's next play

- Label: `[introduced]` (the system player is the first thing that moves this `AVPlayer` without going through
  `MediaPlayer.seek`, which is the only place outside a new item and `play()` that clears `ended`).
- Severity: high. A user reaches it by letting a video run out in the system player, scrubbing back, closing it and
  pressing play on the page.
- Where: `ios/Litloft/Media/MediaPlayer.swift:190-193` (`play()` seeks to zero while `ended` is set) together with
  `ios/Litloft/Media/MediaPlayer.swift:238` / `:283` (the only resets of `ended`), reached from
  `ios/Litloft/Media/SystemFullscreen.swift:28-35` (the system player drives the shared `AVPlayer` directly).
- Reproduction (scratch test added to `MediaPlayerFullscreenTests`, then removed): load `tiny.mp4`, wait for
  `.ready`, `apply(.fullscreen)`, `apply(.seek(9.5))`, `apply(.play)`, wait for a state with `ended == true`,
  then `player.seek(to: 3 s)` directly (what the system player's scrubber does), `fullscreen.end()`, then
  `apply(.play)`. Result: `Expectation failed: (player.currentTime().seconds → 0.303621125) > 2.9: play rewound to
  the start`. The report sent at the end also still says `ended: true` with `time ≈ 3`, so the page's controls show
  an ended file at 3 s.
- Same cause, second symptom: when the viewer presses play in the system player after the end, AVKit starts again
  from 0 while `ended` stays `true`, so every tick reports `ended: true, paused: false`. `MediaChannel.apply` only
  fires `onEnded` on the `false → true` edge (`frontend/src/lib/nativeMedia.ts:180`), so the second end in that
  session never reaches the page (no `onEnded`, so no end-of-file progress save).
- Invariant: 4 (position and play/pause shown on return match the playback; watch history does not rewind).
- No test in the commit plays a file to its end while the system player is up.

### 2. The kept controller keeps the `AVPlayer` attached to a player layer when the app leaves the screen

- Label: `[introduced]`.
- Severity: high if it holds on a device; it cannot be measured in the simulator (no background, no PiP there).
- Where: `ios/Litloft/Media/SystemFullscreen.swift:19-21, 30-31` (the controller and its `player` are kept for
  the surface's lifetime), against `ios/Litloft/Media/VideoSurface.swift:277-284` (`enteredBackground` detaches
  only the surface's own layer, because a player that still has a layer is paused by the system when the app leaves
  the screen).
- What the code does: after the first `presentFullscreen`, an `AVPlayerViewController` whose `player` is the shared
  `AVPlayer` lives on, on screen or not, and nothing takes the player from it on `didEnterBackground`. The
  surface's detach rule exists because an attached layer gets the player paused; the controller's own player layer
  is exactly such a layer (Apple's background-playback guidance says to take the player from an
  `AVPlayerViewController` as well as from an `AVPlayerLayer`).
- Where it would bite:
  - During the system fullscreen, when its automatic PiP does not start (the user turned "Start PiP Automatically"
    off, or PiP is not possible at that moment): the surface lets go of its layer, the controller does not, and the
    player would be paused. This works against invariant 6.
  - After the system player was closed, for the rest of the session: every later background of a video without the
    surface's own PiP (the path `enteredBackground` was written for, and which works on `develop`) would pause too,
    because the controller still holds the player.
- Mutation evidence that the tests cannot see this: no test puts the controller's player and the app background
  together; `backgroundDetaches` / `failedStartLetsGo` check only `surface.view.playerLayer.player`.
- This pulls against the stated reason for keeping the controller (taking its player moved the position to 0), so
  the fix is not a one-liner; it is a question about the design of the kept controller. Needs a device check first:
  open the system player once, close it, turn PiP off (or play audio-less background), leave the app, and see
  whether playback continues.
- Invariant: 6 (and the pre-existing background playback of shell video, which R-0 does not list — see the last
  section).

### 3. `SystemFullscreenPlayer`'s state depends on an unmeasured order of AVKit callbacks, and no test drives any of them

- Label: `[introduced]`.
- Severity: medium (device-only; the outcome when the order differs is a dead button and a surface whose own
  automatic PiP stays off).
- Where: `ios/Litloft/Media/SystemFullscreen.swift:70-110`.
- What the code assumes, for PiP started from fullscreen: `playerViewControllerWillStartPictureInPicture` arrives
  first, then `willEndFullScreenPresentationWithAnimationCoordinator` (its completion sees `inPictureInPicture ==
  true` and leaves `isActive` up), then `DidStopPictureInPicture` ends it because `onScreen` is false.
  - If AVKit takes the modal controller away for PiP **without** calling `willEndFullScreenPresentation…`,
    `onScreen` stays `true`, so `leftPictureInPicture` never calls `end()`. `isActive` stays `true`:
    `presentFullscreen` returns at its guard for every later press (the button does nothing), the surface's
    `startsAutomatically` stays `false`, and the page gets no report. Only the next load or unload clears it.
  - If it calls it **before** `WillStartPictureInPicture`, `end()` runs as PiP starts: the surface's automatic PiP
    is switched back on while the controller's PiP is up, and `isActive` is `false`, so the button presents a
    controller that is in PiP.
- Mutations S13, S14, S15 and S19 (table) remove or invert each branch of this state machine and all survive: the
  only test on the real class (`closingKeepsThePosition`) closes it with `dismiss()`, which bypasses every delegate
  method. The delegate methods can be called directly on a `SystemFullscreenPlayer` in a unit test (with a
  presented controller and a stub coordinator, or by factoring the transitions out), which would hold the order the
  author measured.
- Invariant: 5 (the viewer gets back to the page's frame), 7 (the UI does not break).

### 4. Loading another file or unloading while the system player's PiP is up clears the state but leaves the PiP running

- Label: `[introduced]`.
- Severity: low to medium (reachable: start PiP from the system player, come back to the app — the spec keeps that
  PiP running — and open another file or navigate away).
- Where: `ios/Litloft/Media/SystemFullscreen.swift:37-41` with `ios/Litloft/Media/VideoSurface.swift:89-100`.
- What happens: `showsVideo` → `fullscreen.dismiss()`; `onScreen` is `false`, so nothing is dismissed, and `end()`
  sets `isActive = false`, `inPictureInPicture = false` and turns the surface's automatic PiP back on. The
  controller's PiP window is still up and still shows the shared `AVPlayer`, which now plays the next file (or
  nothing after an unload). From then on:
  - the button is live again (`isActive == false`), so pressing it presents the controller that is at that moment
    in PiP;
  - both the controller's PiP and the surface's automatic PiP are armed at once;
  - `currentState().pip` is the surface's only, so the page's PiP row says "off" while a PiP window is on screen.
- The spec's `## Checked, no action` covers not stopping this PiP on return to the app (no public API). It does not
  cover the shell forgetting that the PiP exists. Either the state should survive the file change (keep
  `inPictureInPicture` and do not arm the surface's PiP until `DidStop`), or the design should say what the page
  and button do while an orphaned PiP is up.
- Invariant: 7 (the video has changed; nothing should happen and the UI should not break).

### 5. Nothing holds that the real `SystemFullscreenPlayer` shows the shared player or reports its end

- Label: `[introduced]`.
- Severity: medium (a test that lets an invariant-4/5 break through).
- Where: `ios/Litloft/Media/SystemFullscreen.swift:30` and `:53-59`; tests
  `ios/LitloftTests/MediaPlayerFullscreenTests.swift:126-162`.
- Mutations:
  - S20 `controller.player = AVPlayer()` (the system player shows a different, empty player): **live**.
    `presentsThePlayersVideo` checks the fake's argument; `closingKeepsThePosition` never looks at
    `controller.player`.
  - S11 remove `onEnd?()` from `SystemFullscreenPlayer.end()`: **live**. `endReportsThePosition` holds the report
    only through `FakeSystemFullscreen`; `closingKeepsThePosition`'s `rig.rig.last?.time ≈ 2` is satisfied by a
    report that some other path sends during its 600 ms sleeps, not by the end.
  - S12 `controller?.player = nil` in `end()`: **live**, as the brief states. Confirmed; not re-derived.
- A reader of the suite would believe the real class is covered end to end by `closingKeepsThePosition`; it covers
  only `dismiss()` → `controller.dismiss` (S10 killed).
- Invariant: 4, 5.

### 6. A present that does not happen leaves the surface's automatic PiP off for good

- Label: `[introduced]`.
- Severity: low (needs the web view out of a window, or no root view controller, when the page sends the request).
- Where: `ios/Litloft/Media/VideoSurface.swift:336-341` (turns `startsAutomatically` off before `present`) with
  `ios/Litloft/Media/SystemFullscreen.swift:28-29` (returns without becoming active) and `:53-54` (only an active
  player ever calls `onEnd`, the only path that turns it back on).
- Reproduction (scratch test, removed): real `SystemFullscreenPlayer`, load `"a"`, `webView.removeFromSuperview()`,
  `apply(.fullscreen)`, then load `"b"`. Result: `startsAutomatically → false: after a refused present` and
  `startsAutomatically → false: after the next file`. The page's own PiP no longer starts when the app is left, for
  the rest of the web view's life.
- The same holds if UIKit refuses `presenter.present` (the presenter is mid-dismissal): `isActive` and `onScreen`
  are set before the present and no delegate call ever clears them (see finding 3).
- Invariant: 7.

### 7. `CoordinatorTests/downloadFromALivePage` is flaky

- Label: `[pre-existing]` (fails on `develop` too, already known). Not in this review's test selection; not re-run.

## Is anything missing from the R-0 list for this phase?

- **Background playback of shell video after the system player has been used.** Invariant 6 covers only "during
  the system fullscreen". Phase 2 keeps an `AVPlayerViewController` holding the shared `AVPlayer` for the rest of
  the session (finding 2), so the pre-existing rule "a video left without PiP keeps its sound in the background"
  can now break *after* the fullscreen is closed. Suggested wording: *"After the system fullscreen has been opened
  and closed, leaving the app while a shell video plays keeps it playing, exactly as before it was opened."*
- **The end-of-file state.** Invariant 4 names position and play/pause; `ended` is the third field the page
  acts on (`play()` restarts from 0, `onEnded` fires once). Suggested addition to 4: *"…and a file that ended
  inside the system player and was moved back there is not treated as ended on return."* (finding 1)
- Nothing else. 2 and 7 cover the page-side gate and the stale/changed-file paths; 5 covers the return path.

## Invariant 6 on a device: does the code work against it?

Yes, in one configuration: when the system player's own automatic PiP does not start, the kept controller still
holds the player while the surface lets go of its layer (finding 2). With automatic PiP on (the iOS default), the
code hands PiP to the controller (`startsAutomatically = false` on the surface, S1 killed) and does nothing else
that would stop playback. The controller's `canStartPictureInPictureAutomaticallyFromInline = true` (S16) is
irrelevant to a full-screen presentation and cannot be checked here.

## Checked, no action

- Invariant 2: the button is gated on `shellHasSystemFullscreen()` (F2 killed); a v2 shell never sees it.
- Invariant 3 is unchanged by this commit: `media.fullscreen` goes through the same `route` origin check as every
  other media command, and a missing `loadId` is refused (`fileCommandsNeedALoadId` includes it).
- Stale `loadId`, audio, a second request while up, the page's PiP closing, unload and next file: all killed
  (S4–S8).
- `bufferedSeconds` move: behaviour-identical.
- `closeAllMediaPresentations()` in the phase-1 page test's teardown: test-only.

## Mutation table

| id | mutation | want | result |
|---|---|---|---|
| S1 | drop `pip?.startsAutomatically = false` in `presentFullscreen` | kill | killed (`pictureInPictureIsHandedOver`) |
| S2 | drop `pip?.startsAutomatically = true` in `fullscreenEnded` | kill | killed |
| S3 | drop `onFullscreenEnd?()` | kill | killed (`endReportsThePosition`) |
| S4 | drop `fullscreen.dismiss()` in `showsVideo` | kill | killed |
| S5 | drop stopping the page's PiP before presenting | kill | killed |
| S6 | drop `showsVideo` guard | kill | killed (`audioIsNotPresented`) |
| S7 | drop `!fullscreen.isActive` guard | kill | killed (`presentedOnce`) |
| S8 | `.fullscreen` → no-op in `MediaPlayer.run` | kill | killed |
| S9 | drop `!isActive` guard in `SystemFullscreenPlayer.present` | live | live (guarded by the surface) |
| S10 | drop `controller?.dismiss` in `dismiss()` | kill | killed (`closingKeepsThePosition`) |
| S11 | drop `onEnd?()` in `SystemFullscreenPlayer.end()` | kill | **live** (finding 5) |
| S12 | `controller?.player = nil` in `end()` | kill | **live** (known; finding 5) |
| S13 | fullscreen-end completion never calls `end()` | kill | **live** (finding 3) |
| S14 | `leftPictureInPicture` always calls `end()` | kill | **live** (finding 3) |
| S15 | `WillStartPictureInPicture` sets `false` | kill | **live** (finding 3) |
| S16 | controller `canStartPictureInPictureAutomaticallyFromInline = false` | live | live (device only) |
| S17 | `SystemPictureInPicture.startsAutomatically` setter no-op | live | live (no PiP in the simulator; the fake holds the surface side) |
| S18 | drop `media.fullscreen` in `ShellBridge` | kill | killed (`ContractTests.commands`) |
| S19 | drop `isCancelled` guard (a cancelled swipe-down ends it) | kill | **live** (finding 3) |
| S20 | controller shows a new `AVPlayer()` | kill | **live** (finding 5) |
| F1 | drop `loadId === null` guard in `enterFullscreen` | kill | killed |
| F2 | drop `shellHasSystemFullscreen()` gate | kill | killed |
| F3 | send a wrong `loadId` | kill | killed |
| F4 | button's `onOpen` → no-op | kill | killed |
| R1 | scratch: end in system player, scrub back, play on page | — | fails on `6fc6e6a9` (finding 1) |
| R2 | scratch: present with no window | — | fails on `6fc6e6a9` (finding 6) |

TOTAL: 7 findings
