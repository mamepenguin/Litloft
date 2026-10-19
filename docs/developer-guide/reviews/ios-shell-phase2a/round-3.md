# iOS shell Phase 2a — round 3

- Reviewed SHA: `7dcb2eccd98b8d4b74bf4c0d3812c13f90e4da3a`. The fix commits since round 2 (`19fa6f76`) are
  `be4b4c24` (contract v2), `639cdeb0` (web: failure display, speed label, autoplay guard removed) and
  `7dcb2ecc` (WebContent process termination). `2447fd4f` only records round 2.
- Record read: `round-1.md` and `round-2.md`; the invariants file (1–17 with the revision record: 4 abolished and
  5 revised in round 2, 14–16 added in round 2, 17 added on round-2 #5); the contract spec
  `2026-09-16-ios-shell-contract-v2.md` (§2 measurements, §3 contract, "Checked, no action"); the original shell
  spec; `known-issues.md` "iOS shell"; `CLAUDE.md`, `review-workflow.md`, `comments.md`,
  `frontend-conventions.md`, `design-decisions.md` (watch history). The diffs of all eight fix commits
  (`9d5d9d74`, `b856281b`, `d6c2d4cb`, `eb606d4b`, `bab34373`, `be4b4c24`, `639cdeb0`, `7dcb2ecc`) were read with
  `git show`.
- Baseline before mutating:
  - `xcodebuild test` (full scheme) → **TEST SUCCEEDED**, 120 test cases passed, 0 failed, 38 s. The Litloft stack on
    `:3000` was up and only read.
  - `vitest run src/lib/__tests__ src/components/__tests__/AudioPlayer.test.tsx src/components/player/__tests__
    src/hooks/__tests__` → 1314 passed / 103 files.
  - `tsc --noEmit` → clean. `eslint` on the six web source files → clean.
- Probes were temporary files (`frontend/src/components/__tests__/AudioPlayer.zzprobe.test.tsx`,
  `frontend/src/lib/__tests__/zzprobe.test.ts`, `ios/LitloftTests/ZZProbeR3.swift`, `ZZProbeR3b.swift`,
  `ZZProbeR3c.swift`), plus a local Python HTTP server on `127.0.0.1:8765` in the scratchpad. All were deleted or
  stopped afterwards. Against the running Litloft the probes made GET requests only. Nothing was fixed.
- `[introduced]` means introduced by `be4b4c24`, `639cdeb0` or `7dcb2ecc`.

Findings 1, 2 and 5 are behaviour a user can hit at HEAD (5 is the most likely to be met, 2 the least). 4 is
pre-existing behaviour, now measured. 3 and 6–9 are tests that let a mutation through.

---

## 1. A file that failed once stays "could not load" when the viewer comes back to it, even after it loads

`[introduced]` by `639cdeb0` (the `failedFileId` state is new in that commit).
`frontend/src/hooks/useShellAudio.ts:38,71,93`, consumed at `frontend/src/components/player/AudioTransport.tsx:44`.

**Invariant touched:** 15 is about showing a failure. This is the opposite case: a failure is shown, and the controls
are disabled, for a load that did not fail. No invariant in 1–17 says a file that loads must be operable, so by the
letter this breaks none of them. It is what a viewer hits.

`failedFileId` is set on `onFailed` and never cleared. The file detail is not keyed by file id (files are selected
through `?file=` with `router.replace`, `useSelectedFile.ts:42`), so `AudioPlayer` and this hook live across file
changes. That is the case the hook's own `owned.fileId` exists for. When the viewer leaves file A after it failed
and later selects A again, `failedFileId === file.id` is true again from the first render. A new channel loads A,
and nothing resets the flag when that load reports `ready`.

**Probe (temporary vitest file, deleted), measured:**

| step | observed |
|---|---|
| render A, shell reports A `failed`; rerender B, shell reports B `ready`; rerender A | 3 `media.load` sent. Alert "could not load" shown **before any report about the new load** |
| shell then reports the new A load `ready`, `duration: 180` | alert still shown, Play **disabled** |
| same sequence with `autoPlay` | after `ready`, `media.play` **is sent**. The alert is shown and the play/pause button is disabled |

The existing test `"does not carry a failure over to the next file"` stops at A → B, so it cannot see this.

**Failure scenario.** The Mac serving the library sleeps for a moment while the viewer opens a recording, so it
fails. The viewer moves on and later comes back to it: selects it again in the folder (`?file=` switch), or a
playlist or folder play reaches it again. None of these remounts the player (by reading of the routing). The file
now loads, but the transport says it could not be loaded and nothing can be pressed. With autoplay on, the file
plays while the page offers no way to pause it. Only the lock screen or leaving the page stops it.

**Mutation:** none needed. The probe is the reproduction. The function is new in `639cdeb0`.

---

## 2. A lock-screen seek that lands while an app seek is still out freezes the page's position for the rest of the file

`[introduced]` by `be4b4c24`. `ios/Litloft/Media/MediaPlayer.swift:63-65,200-217` (the shell),
`frontend/src/lib/nativeMedia.ts:136-145` (the web).

**Invariant touched:** 5. The invariant is kept to the letter: the position is held until that `seekId` is reported
or the file fails. What breaks is its premise that the `seekId` will be reported. Nothing in 1–17 bounds the hold for
a file that did not fail. 15's "nothing waits forever" is worded for failed items only.

A lock-screen or Control Center scrub goes through `applyFromRemote(.seek(time:, seekId: UUID()))`. The shell's
`seek` sets `latestSeekId` to that new id. When the app's own seek then completes, `reached` drops it
(`seekId == latestSeekId` is false). From then on every report carries the remote id. The page's `pendingSeek` holds
the app's id, so `holding` stays true for every later report. Only another app seek, a failure, or a file change
ends it.

**Probes, measured.**

| probe | result |
|---|---|
| Swift: local 30 s tone, ready. `apply(.seek(20, "web"))`, then `nowPlaying.onSeek?(5)` at once, wait 2 s | reported seek ids: `{<remote UUID>}` only. `"web"` **never reported**. Shell time 5.0 |
| same, the HTTP stream from the running Litloft | same: `"web"` never reported, time 5.0 |
| control: the same rig, one app seek alone afterwards | reported (both sources) |
| vitest: channel reading `time 10`, `seek(90)`, then four reports with a foreign `seekId` and time 5 → 30 | `read().time` = `[90, 90, 90, 90]` |

Before `be4b4c24`, a remote seek did not raise `appliedSeq`, and the app seek raised it on completion, whether or not it
finished, so the hold ended (round 2, S1/S4 killed).

**Failure scenario.** The viewer drags the app's seek bar on a streamed file, and then scrubs on the lock screen or in
Control Center before that seek has completed. On a ready local item the window is about 21 ms (spec §2). It is longer
for a stream seeking into a range not yet loaded. That duration was not measured. From then on the page shows
the position of the app seek, frozen. `usePlaybackProgress` sees no movement, so the periodic save stops. When the
viewer leaves, the teardown save writes the frozen position as the watch-history position. The shell keeps playing
correctly. The window is narrow. The consequence lasts until the file changes.

**Mutation:** W5 (the channel never clears a released `pendingSeek`) is **live**. It is the same shape from the
other side: after a released app seek, a remote seek puts the old position back (vitest: time `5` at HEAD; by reading,
`40` under W5). No test has a report whose `seekId` the page did not issue.

---

## 3. No test holds invariant 10: the web Media Session can be set up inside the shell and every test passes

`[pre-existing]`. The guard was written in `8e8f9ce5` (before round 1), and rounds 1–2 did not mutate it.
`frontend/src/components/AudioPlayer.tsx:81`.

**Invariant broken by the mutation:** 10 ("inside the shell the web Media Session is not set; the lock screen has one
owner").

**Mutation W33:** `if (!mc || native) return;` → `if (!mc) return;`. In the shell, `setupMediaSession` then runs on the
shell's controller, and two owners compete for the lock screen. `vitest` (lib, `AudioPlayer`, player, hooks):
**all 1314 pass**. `mediaSession.test.ts` tests `setupMediaSession` itself. No `AudioPlayer` test asserts that the shell
branch leaves `navigator.mediaSession` alone.

---

## 4. After Lock, a back swipe brings the file page back from WebKit's page cache with a player the shell has already dropped

`[pre-existing]`: the stop on navigation is `d6c2d4cb` (round 1 → 2). At `19fa6f76` the restored page's `play` also did
nothing (no item loaded). `be4b4c24` keeps the behaviour and now drops the command by `loadId`.
`ios/Litloft/Web/WebView.swift:19,125-128`, `frontend/src/lib/nativeMedia.ts:88-92`.

**Invariants touched:** 11 and 14 are held. 15 is the nearest by spirit: the page shows a usable player for a load the
shell no longer has, and nothing tells it.

Lock is `window.location.href = "/"` (`Sidebar.tsx:232`), which adds a history entry, and the web view allows the
back-swipe gesture.

**Probe (temporary Swift test against the running Litloft, read-only GETs), measured:** a `Coordinator` and
`WKWebView` open `/`. Set `window.__probeMarker = 42`, then `location.href = '/unlock'`, then load a tone into the
shell's player, then `goBack()`. Result: URL `/`, `window.__probeMarker` = **42** (the same document came back from
the page cache, JS state intact), and the now-playing entry went from `"Tone"` to `nil` (the back navigation is a
provisional navigation, so `stopForNavigation` ran again).

The measured page is `/`, not a file page. Whether a file page, with whatever it holds open, also qualifies for the
page cache was not measured.

**What follows, by reading, if it does.** The restored file page's `MediaChannel` still holds its `loadId`, and its shadow still
says `ready` with the last position. The shell unloaded that `loadId` on Lock, and its `nothingLoaded` report
carries `loadId: null`, which the channel ignores. Play, seek and speed are enabled. Play and seek are sent and
dropped by the shell (invariant 14 working as written). The page shows no failure. No effect re-runs on a page-cache
restore, so nothing reloads the file. The page itself belongs to a drive that is now locked. That part is the web
app's behaviour in any browser with a page cache and is not this change's.

The end-to-end press on a real file page was not driven, because opening a file page posts to `/progress` on the
running stack.

---

## 5. A stream that breaks during playback is never reported: the page shows it playing, frozen, with no failure

`[introduced]`: the failure report is `be4b4c24` (`status` and `report` in `MediaPlayer.swift:277-289`), and its
display is `639cdeb0`. Both only cover the case spec §2 measured, a failure while loading. Before these commits
nothing reported any failure.
`ios/Litloft/Media/MediaPlayer.swift:263-265,277-283,300`.

**Invariant broken:** 15 ("a load failure is reported to the web and shown; nothing waits forever on a failed
item"). A stream reads the file while it plays, so a read that fails after `ready` is a load failure the viewer
experiences the same way.

`status` comes only from `AVPlayerItem.status`, and the only report while playing is the periodic observer, which
fires only while the timebase runs. When the server stops answering mid-file, the item stays `readyToPlay`, the
timebase stops once the buffer runs out, and the shell falls silent.

**Probe (temporary Swift test and a local Python server in the scratchpad, 120 s WAV, served at 2× real time,
cut 6 s after the first request), measured:**

| server behaviour after the cut | observed through the shell's reports |
|---|---|
| connection shut on every request | status `ready` throughout. Reports stop at time 11.65. Last report `paused: false`. **No report in the next 4 s** |
| `404` on every request (a file moved or a drive unmounted) | the same. A second run watched for 90 s after the stop: **0 reports**, status still `ready`, `paused: false` |

At load time the report is right (`missingFileFails`). One detail from the first, unthrottled run: an item that
failed after `play` had been sent reports `status: failed` together with `paused: false`, because `paused` is
`player.rate == 0` and the rate stays 1.

**Failure scenario.** The viewer is listening to a long recording over the LAN, and the Mac serving it sleeps or
the drive is unmounted. The audio stops once the buffer runs out. The page keeps showing the Pause button and a
position that no longer moves. It shows no failure, and pressing pause and play does nothing audible. The lock
screen still shows the file as playing (`isPlaying` is only republished on a report). The periodic save stops
(the position does not move), so the saved position is the last one before the stall.

**Mutation:** none. The probe is the reproduction. No test serves a stream that fails after it is ready.

---

## 6. Seeking back after a file ended and pressing play starts it from zero under a one-line change that no test sees

`[introduced]` by `be4b4c24`. `ios/Litloft/Media/MediaPlayer.swift:203`.

**Invariant touched:** none of 1–17 names this. It is the behaviour round 1 #6 asked for ("restart at the end").

`be4b4c24` moved the restart into `play()` (`if ended { ended = false; player.seek(to: .zero) }`). At `19fa6f76`,
`play()` restarted through `seek(to:)`, so `playAfterTheEndRestarts` also held `seek`'s `ended = false` (round 2, S28
killed). At HEAD nothing holds it.

**Mutation S14** (delete `ended = false` in `seek`): the full suite passes. **Probe, measured** (2 s tone, played to
the end, `seek(0.6)` acknowledged, then `play`):

| build | position reported 300 ms after `play` |
|---|---|
| HEAD | 0.6 |
| S14 | **0.0** (started over, and the viewer's seek was dropped) |

---

## 7. The tests for invariant 17 and for putting the page back would pass if the shell paused the audio, or reloaded the page on every return

`[introduced]` by `7dcb2ecc` (tests and code created there). `ios/LitloftTests/CoordinatorTests.swift` (the "a dead
page" tests), `ios/Litloft/Web/WebView.swift:110-123`.

**Invariant broken by the mutations:** 17.

| id | mutation | result | what a viewer would get |
|---|---|---|---|
| S33 | on termination while off screen, also `player?.applyFromRemote(.pause)` | **live** | the background audio stops when the page's process ends, which 17 forbids. `deadPageOffScreenWaits` checks `playing` as "the now-playing title is still `Background`", and a paused item keeps its title |
| S28 | `restorePage` does not clear `pageToRestore` | **live** | after one termination, every later activation reloads the page, and every reload stops the shell's player (`stopForNavigation`). Pulling down Control Center while listening in the app would stop the audio each time. The tests post `didBecomeActive` only once |

---

## 8. `foregroundReports` is satisfied by the readiness report, so removing the report on return goes unseen

`[introduced]` by `be4b4c24` (the test moved into a file created there, and the status report it now leans on was
added there). `ios/LitloftTests/MediaPlayerLifecycleTests.swift:203-214`, the code at
`ios/Litloft/Media/MediaPlayer.swift:88-96`.

The test loads a tone and posts `didBecomeActive` at once. It then waits for `states.count` to grow. The status
observer's `ready` report arrives within the same wait, so the count grows whether or not the shell reports on
return.

**Mutation S37** (the foreground observer reports nothing): the full suite passes (`foregroundReports` passed in
0.057 s). **Probe, measured:** load, wait for `ready`, wait 300 ms, post `didBecomeActive`, count reports for 1 s:
HEAD **1**, S37 **0**.

What that report is for: a file that ended or stopped while the app was off screen reports nothing else, and without
it the page never learns (the `watchForForeground` comment names this case). Autoplay advancing after an end
reached with the screen off is the case that depends on it.

---

## 9. Two test doubles send readings the shell never sends

`[introduced]` (lines written by `639cdeb0` and `be4b4c24`).

- `frontend/src/components/player/__tests__/AudioTransport.test.tsx:184-189`, `"follows the player again once it
  reports the chosen speed"`: the rate drops back to 1 after the chosen 1.25 has been reported, with the comment
  "Changed elsewhere, such as from the lock screen". The shell registers no rate command
  (`NowPlaying.takeCommands`: play, pause, toggle, position only), and `setRate` comes only from this button. The
  behaviour being held ("follow any reading that is not a replaced rate") has no real source today. The comment
  would lead a reader to believe the lock screen changes the speed. Delete it.
- `frontend/src/components/__tests__/AudioPlayer.test.tsx:164-181`, `report()`: the default reading is
  `status: "ready", paused: false` for a file the page never asked to play. The shell reports `paused: false` only
  after `play` (or after a failed item was played, finding 5). The watch-history tests that use it do not read
  `paused`, so nothing is held wrongly today.

Both were checked against spec §2 and `NowPlaying.swift`. The other doubles (`nativeMedia.test.ts`,
`MediaPlayer*Tests`, `ContractTests`) match what the shell sends: readiness while paused, a failure with
`duration: 0`, and an older `seekId` reported before the newer one is issued.

---

## Trajectory

> Read the fix diffs in order. Does each round add a branch, a state or a prediction that the round before it also
> added? If so, say so: the design is being patched.

Round 1 → 2 (`9d5d9d74` … `bab34373`) is tabulated in `round-2.md`. In short, every commit added state, three commits
each patched their own addition, and the web gained two predictions (`loadSeq`, `readySent` on a length). Both
failed in round 2.

### `be4b4c24` (contract v2)

**Removed:** `seq` and `appliedSeq` with their raising rules, `loadSeq` and its order comparison, readiness inferred
from `duration > 0`, the awaited seek and the awaited `play` on the chain, `enqueue(seq: Int?)` and its branch,
`emitTick`, and the web's `send` helper.

**Added:**

| where | added | kind |
|---|---|---|
| shell | `loadId`, and the "drop a command for another file" branch in `perform` | state and branch, replacing `appliedSeq` |
| shell | `.load` handled before that check, and only when it carries an id | branch |
| shell | `latestSeekId`, `reachedSeekId`, `reached(_:)` and its guard | two states and a branch, replacing the awaited seek |
| shell | `status` from a KVO observation, reported on every change | state read from AVPlayer, not predicted |
| shell | "do not seek a failed item" guard | branch (S2 shows it changes nothing observable) |
| shell | the three observers changed from `MainActor.assumeIsolated` to `Task { @MainActor … }` | a hop (see "Checked") |
| bridge | settings split from file commands, `loadId` and `seekId` required | validation |
| web | `loadId` (replaces `loadSeq`), `status` in the shadow, null-id guards in `play`/`pause`/`seek`/`unload` | a swap, one field, four guards |
| web | `holding` gains a `failed` exemption | branch |

**Predictions left on the web side:** one. `pendingSeek` predicts that "the shell will report my `seekId`". That
is the round-2 prediction ("a reading ≥ my seek's seq has my position") restated as equality. The length-based
readiness and the `loadSeq` predictions are gone, and status replaces them. The design did what spec §1 said it
would.

**Where it did not close the class:** commands the shell issues itself. Round 1 #1 was "a remote command reads the
number at enqueue". Round 2 kept remote commands from advancing `appliedSeq` (S1/S2). In this round the shell's own
seek takes `latestSeekId` from the page's seek (finding 2). `applyFromRemote` and `stopForNavigation` again read the
current `loadId` when they are *queued*, not when they run (a constructed probe in "Checked" shows the stop then
missing a file loaded after it was queued). Spec §3.1 lists only the commands the web sends, so the contract has
no place for the shell's own commands. Each round has handled that case differently, and each time it came back.

### `639cdeb0` (web)

**Removed:** the `current` flag (round 2's patch in `bab34373`). The channel's null-id guard added in `be4b4c24`
covers it (W11/W12 kill the test that held `current`). This is a removal made possible by the contract.

**Added:**

| added | kind |
|---|---|
| `failedSent` and `onFailed` | state and event, copying `readySent`/`onReady` |
| `failedFileId` in `useShellAudio` | state, keyed by file id like `owned.fileId`. It is never cleared (finding 1) |
| `failed` prop, `usable` in `AudioTransport` | branch |
| `choice = { rate, replaced[] }` and `reportedRate`, replacing `shownRate` | two states and a **prediction** |

The speed label is the same thing two rounds in a row. Round 2 (`bab34373`) added `shownRate`, a second copy of the
rate re-synced by an effect, for round-1 #11. It failed as round-2 #3. Round 3 replaces it with a held choice plus a
list of replaced rates, and the prediction that "a reading whose rate is in `replaced` is older than my choice".
This is the web inferring the shell's state from the report stream, which is the thing spec §1 set out to
stop. The spec's "Checked, no action" chose it deliberately ("the display problem is handled in
`AudioTransport`"). The prediction holds today (W26–W28 are killed) only because this button is the only source of
rates. The test that exercises "another source" invents one (finding 9). So `639cdeb0`'s rate fix adds a state and a
prediction where the round before added a state, for the same control. That is the shape `review-workflow.md` asks
me to name.

### `7dcb2ecc` (termination)

**Removed:** nothing.

**Added:** the injectable `isActive`, a weak `webView`, the `url` KVO and `lastPage`, `pageToRestore`, the activation
observer, the `deinit` cleanup, and the termination handler with its active/inactive branch. The additions carry two
predictions: "the last URL observed is where the viewer was" and "becoming active is the moment to put the page
back".

The case exists because of `d6c2d4cb` (round 1 → 2), which made *every* main-frame provisional navigation stop the
player. In that same commit, `guard source != nil` in `unload` was added because every ordinary page load reached the
stop. This round adds a second exception for WebKit's own reload, deferring it until the app is active. The residual
case, where the deferred reload itself stops the audio, is filed in `known-issues.md` rather than handled. So
`7dcb2ecc` is new behaviour that invariant 17 asked for. It is also the second round in a row that adds a branch or
a state to work around "every navigation stops playback". Finding 4 (a page-cache restore) is a third navigation that
reaches the same rule with a result nobody chose.

### Summary

- `be4b4c24` is a replacement that converges. It removes one mechanism and its predictions, and it reads the
  state the shell owns instead of guessing. Round 2's #1 (autoplay), #2 (wedge) and #4 (`loadSeq`) go with it. #6's
  Swift test gaps now have tests (S20–S22 killed here). Its new failures are about cases outside the contract: the
  shell's own commands (finding 2) and failures after `ready` (finding 5).
- Two sub-mechanisms add state for the second round running: the speed label (`shownRate` → `choice`/`replaced`,
  a prediction) and the stop on navigation (`guard source != nil` → the termination deferral, plus its filed
  residue).
- The fix commits added no case handling for a case the same commit created, which round 2 saw three times.

---

## Mutation table

Swift: a full `xcodebuild test` per mutation (34–123 s). Web: `vitest run src/lib/__tests__
src/components/__tests__/AudioPlayer.test.tsx src/components/player/__tests__ src/hooks/__tests__`. Each edit was
checked with `cmp` against a copy before running, and the file was restored with `git checkout` after each run. The
Litloft stream answered `206` before and after every Swift run. An earlier probe run made while the stack was down
for its rebuild was discarded and repeated. No mutation result comes from that window.

| id | file | mutation | want | result (killing tests) |
|---|---|---|---|---|
| S1 | MediaPlayer | drop the "command for another file" check | kill | killed (`staleCommandsAreDropped`) |
| S2 | MediaPlayer | seek a failed item anyway | live | live |
| S3 | MediaPlayer | `reached` reports any seek, not only the latest | kill | killed (`onlyTheLatestSeekIsReported`) |
| S4 | MediaPlayer | `replaceItem` keeps `latestSeekId` | live | live |
| S5 | MediaPlayer | `replaceItem` keeps `reachedSeekId` | kill | killed (`reachedSeekBelongsToItsFile`) |
| S6 | MediaPlayer | no status observation | kill | killed (10 tests, `readyWhilePaused` among them) |
| S7 | MediaPlayer | `failed` reported as `loading` | kill | killed (`missingFileFails`, `seekOnFailedFileDoesNotBlock`) |
| S8 | MediaPlayer | `readyToPlay` reported as `loading` | kill | killed (7 tests) |
| S9 | MediaPlayer | `load` does not record `loadId` | kill | killed (17 tests) |
| S10 | MediaPlayer | `unload` keeps `loadId` | kill | killed (`navigationStopsPlayback`, `seekOnFailedFileDoesNotBlock`) |
| S11 | MediaPlayer | `applyFromRemote` passes `nil`, not the current id | live | live |
| S12 | MediaPlayer | `stopForNavigation` passes `nil` | live | live |
| S13 | MediaPlayer | no report after `load` | kill | killed (`navigationStopsThePlayer`, `loadPublishesTheFile`, `nextFileIsNotEnded`, `reachedSeekBelongsToItsFile`) |
| S14 | MediaPlayer | `seek` does not clear `ended` | kill | **live** (6) |
| S15 | MediaPlayer | `play` at the end does not clear `ended` | kill | killed (`playAfterTheEndRestarts`) |
| S16 | MediaPlayer | `play` at the end does not seek to zero | kill | killed (`playAfterTheEndRestarts`) |
| S17 | MediaPlayer | `finish` does not set `ended` | kill | killed (`playsToTheEnd`, `playAfterTheEndRestarts`, `nextFileIsNotEnded`) |
| S18 | MediaPlayer | the periodic tick never republishes the length | live | live |
| S19 | MediaPlayer | `report` does not call `onState` | kill | killed (20 tests) |
| S20 | MediaPlayer | report `player.rate`, not `defaultRate` | kill | killed (`pausedReportsChosenRate`) |
| S21 | MediaPlayer | `setRate` always sets `player.rate` | kill | killed (`pausedReportsChosenRate`, `rateWhilePausedStaysPaused`) |
| S22 | MediaPlayer | `load` does not take the remote commands | kill | killed (`loadTakesTheTransport`) |
| S23 | MediaPlayer | `unload` does not release the session | kill | killed (`sessionFollowsTheFile`, `navigationStopsPlayback`, `seekOnFailedFileDoesNotBlock`) |
| S24 | MediaPlayer | `unload` without `guard source != nil` | kill | killed (`navigationWithNothingLoaded`) |
| S25 | MediaPlayer | no cleanup in `deinit` | kill | killed (`droppedPlayerCleansUp`) |
| S26 | WebView | termination always reloads at once | kill | killed (`deadPageOffScreenWaits`, `deadPageKeepsItsAddress`) |
| S27 | WebView | termination never reloads at once | kill | killed (`deadPageOnScreenIsReloaded`) |
| S28 | WebView | `restorePage` keeps `pageToRestore` | kill | **live** (7) |
| S29 | WebView | restore to the server root, not `lastPage` | kill | killed (`deadPageKeepsItsAddress`) |
| S30 | WebView | the URL observer also records `nil` | kill | **live** (see survivors) |
| S31 | WebView | the activation observer does nothing | kill | killed (`deadPageOffScreenWaits`, `deadPageKeepsItsAddress`) |
| S32 | WebView | no stop on a provisional navigation | kill | killed (`navigationStopsThePlayer`, both dead-page reload tests) |
| S33 | WebView | off-screen termination also pauses the player | kill | **live** (7) |
| S34 | ShellBridge | a file command without `loadId` is accepted | kill | killed (`fileCommandsNeedALoadId`) |
| S35 | ShellBridge | a seek without `seekId` is accepted | kill | killed (`seekNeedsASeekId`) |
| S36 | ShellMessage | a nil `seekId` is left out rather than sent as null | kill | killed (`ContractTests.states`) |
| S37 | MediaPlayer | the foreground observer reports nothing | kill | **live** (8) |
| S38 | MediaPlayer | the end observer does nothing | kill | killed (`playsToTheEnd`, `playAfterTheEndRestarts`, `nextFileIsNotEnded`) |
| S39 | MediaPlayer | `unload` does not pause first | live | live |
| S40 | MediaPlayer | a `load` without an id is performed with a made-up id | live | live |
| W1 | nativeMedia | accept a report for any `loadId` | kill | killed (3 channel tests, `does not mark the next file finished…`) |
| W2 | nativeMedia | accept reports while nothing is loaded | kill | killed (`is not undone by the shell's own answer to it`) |
| W3 | nativeMedia | a `failed` report does not release the seek | kill | killed (`lets go when the file fails`) |
| W4 | nativeMedia | never hold a seek | kill | killed (3 seek tests) |
| W5 | nativeMedia | a released seek is never cleared | kill | **live** (2) |
| W6 | nativeMedia | `readySent` never set | kill | killed |
| W7 | nativeMedia | ready on any status but `failed` | kill | killed |
| W8 | nativeMedia | `load` keeps `readySent` | kill | killed |
| W9 | nativeMedia | `load` keeps `failedSent` | kill | killed |
| W10 | nativeMedia | `onFailed` on any status | kill | killed |
| W11 | nativeMedia | `play` without the null-id guard | kill | killed (incl. `does not start the next file with the previous file's autoplay`) |
| W12 | nativeMedia | `unload` keeps `loadId` | kill | killed (same, plus `is not undone…`) |
| W13 | nativeMedia | `unload` keeps `pendingSeek` | live | live |
| W14 | nativeMedia | `seek` does not clear the shadow's `ended` | kill | **live** (see survivors) |
| W15 | nativeMedia | `load` keeps the previous shadow | kill | killed |
| W16 | nativeMedia | `onEnded` on every report with `ended` | kill | killed |
| W17 | useShellAudio | `onFailed` not wired | kill | killed (`says when the shell cannot load the file`) |
| W18 | useShellAudio | cleanup leaves `onFailed` set | live | live |
| W19 | useShellAudio | autoplay without waiting for the resume read | kill | killed |
| W20 | useShellAudio | play on ready whatever `autoPlay` says | kill | killed |
| W21 | useShellAudio | `failed` true for any failed file | kill | killed (`does not carry a failure over to the next file`) |
| W22 | useShellAudio | controller returned without the file key | kill | killed |
| W23 | useShellAudio | cleanup leaves `onReady` set | live | live |
| W24 | AudioTransport | `usable` ignores `failed` | kill | killed |
| W25 | AudioTransport | `seekable` ignores `usable` | kill | killed |
| W26 | AudioTransport | hold without `held.rate !== reported` | kill | killed |
| W27 | AudioTransport | hold without `replaced.includes` | kill | killed |
| W28 | AudioTransport | `replaced` keeps only the last rate | kill | killed |
| W29 | AudioTransport | no failure alert | kill | killed |
| W30 | AudioTransport | `currentTime` dropped from the effect deps | kill | killed |
| W31 | AudioTransport | no held choice at all | kill | killed |
| W32 | AudioPlayer | `failed` not passed to the transport | kill | killed |
| W33 | AudioPlayer | web Media Session set up in the shell too | kill | **live** (3) |
| W34 | AudioPlayer | render the `<audio>` element in the shell | kill | killed |
| W35 | AudioPlayer | `mc = elementMc ?? shell.mc` | live | live |

## Survivors that were meant to survive (`want=live`), and two declared `kill` that are benign

| id | why it is fine |
|---|---|
| S2 | a failed item is released by its `failed` report, so a seek that never completes is waited on by nobody |
| S4 | a completion from the previous file carries an id that no page seek of the new file has |
| S11 | with nothing queued, the current id and `nil` both pass the check. The two differ only while a load is queued (see "Checked") |
| S12 | same as S11. Passing `nil` would also stop a file whose load was queued behind the stop |
| S18 | the status observer publishes the length when the item becomes ready, so the tick's republish only matters for a length that changes later |
| S39 | `replaceCurrentItem(with: nil)` stops output anyway |
| S40 | the bridge never passes a `load` without an id (S34 holds that) |
| W13 | after `unload` the channel accepts no report, so the pending seek is never read |
| W18, W23 | the channel is unloaded and disposed in the same cleanup, so no report reaches the handlers |
| W35 | in the shell no element renders, so `elementMc` is null. In a browser `shell.mc` is null |
| W14 (declared kill) | the shadow's `ended` is read only to detect the edge. The shell's own reply to the seek carries `ended: false` and resets it. The mutation differs only when a stale `ended: true` report arrives between the seek and that reply. HEAD then fires `onEnded` a second time and W14 does not |
| S30 (declared kill) | the termination handler reads `lastPage` before WebKit publishes the `nil` URL, so recording `nil` changes nothing in the measured order. It would matter for a second termination before the page is back, when the restore would fall back to the server root |

---

## Checked, not a finding

- **A stop or a lock-screen press queued behind a load for another file.** `stopForNavigation` and `applyFromRemote`
  capture `loadId` when queued. Constructed probe (slow cookie jar, `load a`, then `load b` with no unload between,
  then `stopForNavigation`): afterwards `loadId` is `b`, the session is held, and the lock screen shows the file.
  The stop was dropped. It is not reachable from the web app today: a page has one `AudioPlayer`
  (`FilePreview` renders the second `FilePreview` only for HTML), the hook unloads before it loads, and a navigation's
  stop is queued before the next document can load anything. Listed because it is the round-1 #1 shape (a value read
  at enqueue), in the trajectory above.
- **The three observers now hop through `Task { @MainActor }`.** For the end notification this opens a window of
  one main-actor hop in which `replaceItem` for another file could run first, and `finish()` would then mark the new
  file ended (13). The only load that could run in that window is one not caused by this end, since the page loads
  the next file only after hearing `ended`. Not driven.
- **The URL the shell restores after a termination is not origin-checked** (12). It is a URL the main frame was
  already showing, and cookies still follow WebKit's own domain rules. No path in the web app navigates the main frame
  to another origin (`target="_blank"` links are dropped, `known-issues.md`).
- **The speed label before the first `ready` of a new file** shows the channel's initial rate `1` even when the
  shell's `defaultRate` is not 1, until the `ready` report changes the clock's duration and the effect re-reads it.
  A press in that window steps from 1. Measured windows are 0.15–0.37 s (spec §2).
- **`status` and the pending seek on the page's side:** the page releases a held seek on `failed` (W3 killed), and
  shows the failure (W17, W24, W29, W32 killed). Readiness while paused is reported by the shell (S6, S8 killed) and
  announced once per load on the web (W6–W8 killed). The round-2 wedge is held (`seekOnFailedFileDoesNotBlock`,
  S7/S23 killed).
- **Invariants 1, 2, 3, 6, 8, 9, 11, 12, 14, 16:** no path found that breaks them. 1/2: W34 killed. 3: getters read
  a frozen initial shadow. 8: `grep -rn progress ios/Litloft` → nothing. 9: `seconds()` maps non-finite to 0.
  11: S10, S23, S32 killed. 14: S1, S34 killed. 16: S6, S8 killed.
- **Filed items (`known-issues.md`, "iOS shell"), one line each:**
  - `[pre-existing]` The reload after an off-screen termination stops playback when the app comes back. Finding 7's S28
    would turn it into a reload on every return.
  - `[pre-existing]` External links do nothing.
  - `[pre-existing]` Video stops off screen.
  - `[pre-existing]` Long press selects text.
- **Tooling:** `swiftlint lint --quiet` → no output. `tsc --noEmit` → clean. `eslint` on the six web sources → clean.
- **Working tree at the end:** only `addons/knowledge` modified (pre-existing), plus this file. The probe files
  (`ios/LitloftTests/ZZProbeR3.swift`, `ZZProbeR3b.swift`, `ZZProbeR3c.swift`,
  `frontend/src/lib/__tests__/zzprobe.test.ts`, `frontend/src/components/__tests__/AudioPlayer.zzprobe.test.tsx`)
  were deleted after use, and the local Python server was stopped.

TOTAL: 9 findings
