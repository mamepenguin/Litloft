# iOS shell Phase 2a — round 4

- Reviewed SHA: `f6eee8c7b71e6452a95e2e062b4d55be93cc8be6`. The fix commits since round 3 (`7dcb2ecc`) are
  `3f302c2a` (shell ids without `randomUUID`) and `2e330992` (seek settling, `stalled`, failure/stall reset, test
  fixes for round-3 #6–#9). `34810884` and `f6eee8c7` only record docs.
- Record read: `round-1.md`, `round-2.md`, `round-3.md`; the invariants file (1–17 and the revision record, 15 revised
  in round 3); the contract spec `2026-09-16-ios-shell-contract-v2.md` (§2 including the round-3 rows, §3.2 and §3.3
  round-3 revisions, "Checked, no action"); `known-issues.md` "iOS shell"; `CLAUDE.md`, `review-workflow.md`,
  `comments.md`, `frontend-conventions.md`, `design-decisions.md` (watch history). The diffs of every fix commit
  (`9d5d9d74`, `b856281b`, `d6c2d4cb`, `eb606d4b`, `bab34373`, `be4b4c24`, `639cdeb0`, `7dcb2ecc`, `3f302c2a`,
  `2e330992`) were read with `git show`.
- Baseline before mutating:
  - `xcodebuild test` (full scheme) → **TEST SUCCEEDED**, 130 test cases passed, 0 failed, 96 s. The Litloft stream
    on `:3000` answered `206` and was only read.
  - `vitest run src/lib/__tests__ src/components/__tests__/AudioPlayer.test.tsx src/components/player/__tests__
    src/hooks/__tests__` → 1323 passed / 103 files.
  - `tsc --noEmit` → clean. `eslint` on the six web source files → clean.
- `[introduced]` means introduced by `3f302c2a` or `2e330992`.

- Probes were a temporary Swift file (`ios/LitloftTests/ZZProbeR4.swift`) using `BreakingStream` and a copy of it,
  run with `-only-testing:LitloftTests/SharedMediaState/ZZProbeR4` and read back from the result bundle. The file was
  removed before the mutation runs. Against the running Litloft the probes made GET requests only. Nothing was fixed.

Finding 1 is behaviour a user can hit at HEAD: the viewer sees a frozen player and no message, and the lock screen
keeps counting. Finding 2 is a message shown when nothing is waiting. Finding 3 is a test that lets a mutation through.

---

## 1. A play that waits for a server that has gone is not reported unless playback had already been running

`[introduced]`: the stall report is new in `2e330992` (`MediaPlayer.swift:25-26,104-115,285-294,356`). Before that
commit nothing reported waiting at all (round-3 #5). This commit reports only the case its detector can see, and
this case is outside it.

**Invariant broken:** 15 as revised in round 3 ("a state where playback has run out of data and is waiting is also
reported to the web and shown"). Also the reason the lock-screen rate is forced to 0 while stalled
(`MediaPlayer.swift:355-356`): here the lock screen counts on.

`stalled` is set only by `AVPlayerItem.playbackStalledNotification`. The raw player (probe p7, `BreakingStream`)
posts that notification only when a timebase that was *running* runs dry. When the player has not started moving at
the position it is asked to play from, it goes to `waitingToPlay` with reason
`AVPlayerWaitingToMinimizeStallsReason` and stays there, with no notification, no error and `status` still
`readyToPlay`.

**Probes, measured** (`BreakingStream`, 120 s WAV, the connection is shut after the cut):

| probe | reports from the shell after `play` | lock screen |
|---|---|---|
| p10: cut at 2 s. Load, stay paused 5 s, `seek(100, "far")` (reported, time 100), then `play`, then wait 30 s | `status: ready`, `paused: false`, `stalled: false`, time `100.00`. `stalled` is **never** true. 6 reports in all | rate `1.0`, elapsed `100.0`: **counting on** |
| p6: cut at 0.3 s (ready with 0.8 s buffered), then `play`, then wait 40 s | `paused: false`, `stalled: false`, time `0.00`. `stalled` never true. 3 reports | rate `1.0` |
| p7 (raw `AVPlayer`, same as p6) | `tcs=1 WaitingToMinimizeStalls` from 1.06 s to 36 s, no `STALLED`, `error=nil` | — |
| control p5: cut at 2 s, **playing**, `seek(100)` | seek reported, then `STALLED` 0.55 s later → `stalled: true`, lock rate 0 | stops |
| control p8: cut at 3 s / 8 s while paused and ready, then `play` from 0 | plays the 5.4 s / 15.8 s buffered, then `stalled: true`, lock rate 0 | stops |

p8 and p9 show why the start from zero usually works. A paused, ready item keeps reading: 5.4 s and 15.8 s from
`BreakingStream`, and from the running Litloft 10.8 s at `ready` and the whole 427 s file 8 s later. So a play from
the start of the file finds data, runs, and then stalls in a way the detector sees. What misses the detector is a play
from a position that was never loaded: a seek past the buffer, or a resume point far into a long recording.

**Failure scenario.** The viewer pauses a two-hour recording near the start and puts the phone down. The Mac serving
it sleeps. Later the viewer drags the seek bar to 1:20:00, or picks the file up where it was saved, and presses play.
The seek is reported. The page then shows the Pause button at 1:20:00, frozen, with no "waiting for the server" and no
failure. On the lock screen the position counts up although no audio plays. The periodic save does not run because
the position does not move. This lasts until the server answers again or the viewer leaves.

**Mutation:** none needed. The probe is the reproduction. No test plays from an unloaded position against a server
that has gone. `startIsNotAStall` holds the other side, that the ~0.7 s wait at the start of a healthy stream is not
reported (spec §2). A detector reading `timeControlStatus` / `reasonForWaitingToPlay` would have to tell these two
apart, and no test holds that distinction either.

---

## 2. "Waiting for the server" stays on after the viewer pauses, and after the server is back, until play is pressed

`[introduced]` (`MediaPlayer.swift:104-115`, `stalled` is cleared only on `timeControlStatus == .playing` or a new
item). Shown by `AudioTransport.tsx:113-117`.

**Invariant touched:** none of 1–17 forbids showing a wait that is not happening. 15 asks only that a real wait is
shown. This is what a viewer sees.

**Probes, measured:**

| probe | observed |
|---|---|
| p1: cut at 3 s, play, stalled at 5.30. Then `pause` | `stalled: true, paused: true` |
| p1, continued: `seek(1.0, "back")`, inside the 5.4 s buffer, while paused | seek reported, time 1.00, **`stalled: true`** |
| p2: cut at 3 s, outage 4 s (the server answers again from 7 s). Stall, `pause`, wait 20 s | `stalled: true, paused: true`, 31 reports in all. The outage ended during this wait |
| p2, continued: `play` | `stalled: false` within the 30 s wait that followed |

So the page shows the Play button with "Waiting for the server" under it, indefinitely. It stays after a seek back
into audio that is already loaded, and after the server has come back. Nothing is waiting. The flag is latched from
the notification and not read from the player's state, so a pause leaves it standing. No test double sends
`stalled: true` with `paused: true`, which the shell does send.

---

## 3. After a stall ends, the lock screen stays stopped under a one-line change that no test sees

`[introduced]` (`MediaPlayer.swift:109-113`, the report in `watchForResumption`).

**Invariant touched:** 15 by its purpose (a wait is shown, and so is its end). The lock-screen rate is forced to 0
while stalled (`MediaPlayer.swift:356`), and only a `report()` publishes it again. `tick()` republishes the lock screen
only when the length changes (`MediaPlayer.swift:374-380`).

**Mutation T4** (the resumption observer clears `stalled` but does not call `report()`): the full suite passes. The
web side still learns that the stall ended, because the next periodic tick carries `stalled: false`.
`stallEndsWhenTheStreamReturns` reads only the web reports.

**Probe p11, measured** (cut at 3 s, outage 4 s, play, wait for the stall and its end, then 2 s):

| build | lock-screen rate | lock-screen elapsed | shell time |
|---|---|---|---|
| HEAD | `1.0` | 5.70 | 6.25 |
| T4 | **`0.0`** | 5.70 | 7.50 |

Under T4 the audio plays again while the lock screen and Control Center show a stopped position, until the next
command. Nothing holds the lock-screen side of the recovery.

---

## Trajectory

> Read the fix diffs in order. Does each round add a branch, a state or a prediction that the round before it also
> added? If so, say so: the design is being patched.

Rounds 1 → 2 and 2 → 3 are tabulated in `round-2.md` and `round-3.md`. Round 3's summary was that `be4b4c24` converged
(a replacement), while two sub-mechanisms each added state for the second round running: the speed label and the stop
on navigation. It named one class the contract has no place for: **commands the shell issues itself**.

### `3f302c2a` (ids)

**Removed:** the dependency on `crypto.randomUUID`.
**Added:** `randomId()` and an injectable `newId` constructor parameter, used only by tests.
No branch, no state, no prediction. The id is a value swap, and the shell reads it only as a non-empty string
(`ShellBridge.swift:77,109,118-121`), so the new format is accepted.

### `2e330992`

**Removed:**

| where | removed |
|---|---|
| shell | `latestSeekId` (a string). The fabricated `UUID()` for a lock-screen seek |
| web test | the invented "changed elsewhere" comment (round-3 #9) |

**Added:**

| where | added | kind |
|---|---|---|
| shell | `latestSeek` counter **and** `webSeekId`, replacing `latestSeekId` | one state becomes two |
| shell | `MediaCommand.seek.seekId` becomes optional, `if let seekId { webSeekId = seekId }` | branch |
| shell | `reached` now reports `webSeekId`, not the completing seek's own id | rule: "the latest landing settles the web's last seek" |
| shell | `stalled`, `stallObserver`, `playingObservation`, `watchForResumption` and its `.playing` guard | state, two observers, branch |
| shell | lock-screen rate `stalled ? 0 : rate` | branch |
| shell | `stalled = false` and the extra observer removal in `replaceItem` | reset |
| bridge | `stalled` on the wire | field |
| web | `stalled` in the shadow, `stalledChanged`, `onStalledChange` | field, edge detection, event |
| web | `stalledFileId` in `useShellAudio` | state keyed by file id, copying `failedFileId` |
| web | `setFailedFileId(null)` and `setStalledFileId(null)` in the cleanup | resets |
| web | `waiting` prop and the `waiting && !failed` branch in `AudioTransport` | branch |

**Predictions added:** one, in the shell: "a stall ends when `timeControlStatus` becomes `.playing`". With it goes a
latched flag. `stalled` is set from an event and cleared from another event, not read from the player's state. That is
the shape spec §1 moved the web away from ("do not infer state from the stream"), now inside the shell, with AVPlayer
as the stream. Finding 1 is the case where the first event never comes. Finding 2 is the case where the second one
does not come while the state has changed anyway.

**Is anything added for the second round running?**

- **The shell's own commands. Yes, for the third time, each time in a different form.** Round 1 → 2 kept remote
  commands from raising `appliedSeq` (`enqueue(seq: Int?)`, a branch). Round 2 → 3 gave a remote seek a made-up id.
  Round 3 → 4 gives it no id, and adds a counter and a second id slot so that its landing can settle the web's seek.
  Round 2 → 3 was a replacement, so strictly this is not two additions in a row. But it is the same case handled in
  every round, and each representation was needed because the one before failed on it (round-1 #1, round-3 #2).
  `applyFromRemote` and `stopForNavigation` still read `loadId` when queued (round-3 "Checked"); that is unchanged.
- **The failure display. Yes.** `639cdeb0` added `failedFileId`, keyed by file id. `2e330992` adds a reset for it
  in the cleanup, and a second state of the same shape, `stalledFileId`, with its own reset. After the reset, the
  file-id key and the reset guard the same thing: W14 and W15 below survive, differing only for one render. This is
  the pattern round 2 saw three times, a fix patching the state the previous fix added.
- **Waiting and failure reporting. Yes.** `be4b4c24` added `status` for a load failure. Round 3 found a failure after
  `ready` that `status` cannot see (#5). `2e330992` adds `stalled` for that, from a notification. This round finds a
  wait that the notification cannot see (finding 1) and a wait it does not end (finding 2). Each round adds a
  detector for the case the previous detector missed.
- **The seek hold on the web. No.** `nativeMedia.ts` is unchanged apart from `stalled`. W5 is now harmless.
- **The speed label and the stop on navigation. No code change** this round. Only tests (S28/S33 now killed, see the
  table) and one deleted comment.

### Summary

`3f302c2a` is a clean swap. `2e330992` closes round-3 #1, #2 and #6–#9 as claimed (see the table: all the
round-3 survivors that were meant to die are now killed). It also adds, in the same round, a second state to the
seek settling, a reset and a twin to the failure display, and a latched stall flag with one prediction. Three
mechanisms each gained state for the second or third round in which they were touched. The stall flag's first round
already has two cases it does not describe (findings 1 and 2).

---

## Mutation table

Swift: a full `xcodebuild test` per mutation (91–139 s), under `perl -e 'alarm shift; exec @ARGV' 900`. Web: `vitest run
src/lib/__tests__ src/components/__tests__/AudioPlayer.test.tsx src/components/player/__tests__ src/hooks/__tests__`.
Before each run the edit was checked to have changed the file (a pattern count of exactly 1 and a non-empty
`git diff`), and the file was restored with `git checkout` after the run. The Litloft stream answered `206` after every
Swift run.

| id | file | mutation | want | result (killing tests) |
|---|---|---|---|---|
| S1 | MediaPlayer | `reached` without the latest-seek guard | kill | killed (`onlyTheLatestSeekIsReported`) |
| S2 | MediaPlayer | a lock-screen seek clears `webSeekId` | kill | killed (`remoteSeekSettlesThePagesSeek`) |
| S3 | MediaPlayer | a lock-screen seek does not advance `latestSeek` | live | live |
| S4 | MediaPlayer | `replaceItem` does not advance `latestSeek` | live | live |
| S5 | MediaPlayer | `replaceItem` keeps `webSeekId` | live | live |
| S6 | MediaPlayer | `webSeekId` recorded before the failed-item guard | live | live |
| S7 | MediaPlayer | the lock-screen seek carries a made-up id again | kill | killed (`remoteSeekSettlesThePagesSeek` ×2, `remoteSeekAloneCarriesNoId`) |
| T1 | MediaPlayer | the stall notification does not set `stalled` | kill | killed (3 stall tests) |
| T2 | MediaPlayer | the stall notification sets `stalled` but does not report | kill | killed (3 stall tests). The first run also failed the three dead-page tests in under 0.31 s, which cannot reach this code; a second run failed only the stall tests |
| T3 | MediaPlayer | resumption does not clear `stalled` | kill | killed (`stallEndsWhenTheStreamReturns`) |
| T4 | MediaPlayer | resumption clears `stalled` without a report | kill | **live** (3) |
| T5 | MediaPlayer | resumption clears on any `timeControlStatus` change | kill | killed (3 stall tests) |
| T6 | MediaPlayer | `replaceItem` keeps `stalled` | kill | killed (`nextFileIsNotStalled`) |
| T7 | MediaPlayer | the lock-screen rate ignores `stalled` | kill | killed (`stoppedStreamIsStalled`) |
| T8 | ShellMessage | `stalled` not encoded | kill | killed (`ContractTests.states` ×6) |
| T9 | MediaPlayer | `currentState` always says `stalled: false` | kill | killed (3 stall tests) |
| T10 | MediaPlayer | `replaceItem` leaves the old stall observer registered | live | live |
| T11 | MediaPlayer | `deinit` does not remove the stall observer | live | live |
| T12 | MediaPlayer | `watchForResumption` never installed | kill | killed (`stallEndsWhenTheStreamReturns`) |
| R1 | MediaPlayer | round-3 S14: `seek` does not clear `ended` | kill | killed (`seekAfterTheEndIsKept`) |
| R2 | MediaPlayer | round-3 S37: the foreground observer reports nothing | kill | killed (`foregroundReports`) |
| R3 | WebView | round-3 S33: an off-screen termination also pauses the player | kill | killed (`deadPageOffScreenWaits`) |
| R4 | WebView | round-3 S28: `restorePage` keeps `pageToRestore` | kill | killed (`deadPageOffScreenWaits`) |
| W1 | nativeMedia | `randomId` returns `crypto.randomUUID()` | kill | killed (`makes its ids without randomUUID…`) |
| W2 | nativeMedia | bytes from `Math.random` instead of `getRandomValues` | live | live |
| W3 | nativeMedia | all-zero bytes (every id the same) | kill | killed (4 tests) |
| W4 | nativeMedia | `seekId` is the `loadId` | kill | killed (4 tests) |
| W5 | nativeMedia | a released seek is never cleared (round-3 W5) | live | live |
| W6 | nativeMedia | `stalledChanged` always true | kill | killed (`is announced when it starts and when it ends, once each`) |
| W7 | nativeMedia | the shadow's `stalled` never updated | kill | killed (2) |
| W8 | nativeMedia | `onStalledChange` never called | kill | killed (2) |
| W9 | nativeMedia | `onStalledChange` only on the rising edge | kill | killed (2) |
| W10 | nativeMedia | accept a report for any `loadId` | kill | killed (5, including `is not taken from another file's report` for the stall) |
| W11 | nativeMedia | a stalled report releases a held seek | live | live |
| W12 | useShellAudio | cleanup does not reset `failedFileId` | kill | killed (`does not carry a failure over to the same file opened again`) |
| W13 | useShellAudio | cleanup does not reset `stalledFileId` | kill | killed (`does not carry a wait over to the next file, or back to the same one`) |
| W14 | useShellAudio | `stalled` true for any stalled file id | live | live |
| W15 | useShellAudio | `failed` true for any failed file id | live | live |
| W16 | useShellAudio | the stall is never cleared on recovery | kill | killed (`says when playback is waiting…, until it moves again`) |
| W17 | useShellAudio | `onStalledChange` not wired | kill | killed (same) |
| W18 | useShellAudio | cleanup leaves `onStalledChange` set | live | live |
| W19 | AudioTransport | the waiting message shown over a failure | kill | killed (`says so rather than that it is waiting`) |
| W20 | AudioTransport | the waiting message never shown | kill | killed (2) |
| W21 | AudioTransport | controls disabled while waiting | kill | killed (2) |
| W22 | AudioPlayer | `waiting` not passed | kill | killed |
| W23 | AudioPlayer | `waiting` wired to `failed` | kill | killed |
| W24 | AudioPlayer | round-3 W33: web Media Session set up in the shell too | kill | **live** (round-3 #3, see "Checked") |

## Survivors that were meant to survive (`want=live`)

| id | why it is fine |
|---|---|
| S3 | the page's seek and the lock-screen seek then both settle, in order; the page releases at its own position and follows the later reports |
| S4 | a completion from the previous file then settles with `webSeekId`, which `replaceItem` has emptied; a new page seek advances the counter anyway |
| S5 | the kept id belongs to the previous file's `loadId`, and the new file's page never issued it |
| S6 | a failed item is released on the web by its `failed` report, whatever `seekId` says |
| T10 | the observer is filtered to its own item, which no longer plays |
| T11 | the block holds `self` weakly |
| W2 | the shell reads any non-empty string (`ShellBridge.swift:118-121`); the ids need not be unpredictable |
| W5 | the shell now reports only the web's latest `seekId` or `nil`, and `load` resets the pending seek, so a report with a foreign id after a release does not occur |
| W11 | a stall does not carry a seek id, and the seek it holds is released by that seek's own report (p1, p5: reported while stalled) |
| W14, W15 | the cleanup now resets both states, so the file-id key differs only for the one render before the cleanup runs |
| W18 | the channel is unloaded and disposed in the same cleanup |

---

## Checked, not a finding

- **Round-3 findings, as claimed.** #1: W12 killed. The probe from round 3 (A failed → B → A) is now the test `does not
  carry a failure over to the same file opened again`. #2: S1, S2 and S7 killed, and the web takes the lock-screen
  position (`takes the position the shell reports with it`). #5: stalls while playing are reported (T1–T12 killed,
  p5 and p8 measured), with the gaps in findings 1–3. #6: R1 killed. #7: R3 and R4 killed. #8: R2 killed. #9: the
  comment is deleted and the default reading is `paused: true`.
- **The seek settling, other orders, by reading.** A lock-screen seek performed before a page seek whose message is
  still in transit settles with the *previous* `webSeekId`, so the page keeps holding until its own seek lands. A page
  seek performed after a lock-screen seek is the latest and settles itself. A lock-screen seek alone reports the last
  settled id, which the page no longer holds. None of these leaves the page holding.
- **A seek while stalled.** It completes and is reported, both paused (p1: `seek(100)` reached, then play gives
  `stalled: true`) and playing (p5). The page's hold does not wait on the server.
- **The order of the stall notification and `timeControlStatus`.** Raw `AVPlayer` (p4): `STALLED` and
  `timeControlStatus → waitingToPlay` arrive together on the main thread (7.223 s). The return to `playing` came 26 s
  after the server answered again (33.0 s), which is AVPlayer's own retry and matches the 35 s run time of
  `stallEndsWhenTheStreamReturns`. No case was seen where `playing` arrives before the stall's main-actor hop.
- **The stall observer's hop after a file change.** `stalled = true` is set inside `Task { @MainActor }` without checking
  that the item is still the one that stalled. It has the same one-hop window as the end observer (round 3,
  "Checked"). A load not caused by the stall would have to run in that window. Not driven.
- **Test doubles against spec §2.** `BreakingStream` shuts connections after the cut, which is the "connection shut"
  row, and serves byte ranges at twice real time. Its measured behaviour through the shell (stall at 5.3 s with 5.4 s
  buffered, recovery on its own) matches the raw player. The web doubles send `stalled: true` only with
  `paused: false` (the shell also sends it with `paused: true`, finding 2), and the fixture `stalledWhilePlaying`
  (`time` 11.5, `buffered` 11.5) has the shape p1 measured (5.30 / 5.40). A server that stops answering *without* closing
  the connection, as a sleeping Mac would, was not measured. The one probe that tried (p3) kept connections open but
  read only one request per connection. It measured its own flaw, and its result is not used.
- **Ids.** The shell accepts any non-empty `loadId` / `seekId` (`ShellBridge.swift:77,109`), so 32 hex characters are
  accepted. No other `randomUUID` call remains in `frontend/src` outside tests. The plain-HTTP premise was measured by
  the user on the device and not re-driven here.
- **Invariants 1–14, 16, 17:** no path found that breaks them. 1/2: unchanged since round 3. 5: held to the letter; a
  report carrying the page's `seekId` may now carry a lock-screen position, which 5 allows. 8: `grep -rn progress
  ios/Litloft` → nothing. 9: `seconds()` unchanged. 11: `replaceItem` also resets `stalled` on unload. 13: see the hop
  above. 14: unchanged (the `loadId` check is before the seek). 17: R3 and R4 killed.
- **Filed and decided items, one line each:**
  - `[pre-existing]` Round-3 #3 (B): the web Media Session guard in the shell has no test (W24 live).
  - `[pre-existing]` Back-forward cache after Lock (known-issues): not touched by these commits.
  - `[pre-existing]` The reload after an off-screen termination stops playback when the app comes back: unchanged;
    R4 now kills the reload-on-every-return variant.
  - `[pre-existing]` External links do nothing.
  - `[pre-existing]` Video stops off screen.
  - `[pre-existing]` Long press selects text.
- **Tooling:** `tsc --noEmit` → clean. `eslint` on the six web sources → clean.
- **Working tree at the end:** only `addons/knowledge` modified (pre-existing), plus this file. `ios/` was compared
  with a copy taken before the first probe: `diff -r` differs only in `.DS_Store` and Xcode's `UserInterfaceState.xcuserstate`, both ignored by git. The probe files `ZZProbeR4.swift` and
  `ZZProbeR4b.swift` were removed after use.

TOTAL: 3 findings
