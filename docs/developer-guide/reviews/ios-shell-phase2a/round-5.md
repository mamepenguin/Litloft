# iOS shell Phase 2a — round 5

- Reviewed SHA: `5f11735e1cd76869376e4dadaa576b7893951347`. The only fix commit since round 4 (`f6eee8c7`) is
  `5f11735e` (the shell reports `waiting`, read from `timeControlStatus`, in place of a latched `stalled`).
  `3373d92c` only records round 4.
- Record read: `round-1.md` to `round-4.md`; the invariants file (1–17 and the revision record, 15 revised in rounds 3
  and 4); the contract spec `2026-09-16-ios-shell-contract-v2.md` (§2 including the round-3 rows, §3.2 with the
  round-4 `waiting` row, §3.3, "Checked, no action"); `known-issues.md` "iOS shell"; `CLAUDE.md`,
  `review-workflow.md`, `comments.md`, `frontend-conventions.md`, `design-decisions.md` (watch history). The diffs of
  `5f11735e` and `2e330992` were read in full with `git show`; the earlier fix commits through their round-2 to round-4
  trajectory tables.
- Baseline before mutating:
  - `xcodebuild test` (full scheme) → **TEST SUCCEEDED**, 131 test cases passed, 0 failed, 98 s. The Litloft stream
    on `:3000` answered `206` and was only read.
  - `vitest run src/lib/__tests__ src/components/__tests__/AudioPlayer.test.tsx src/components/player/__tests__
    src/hooks/__tests__` → 1323 passed / 103 files.
  - `tsc --noEmit` → clean. `eslint` on the five web source files → clean.
- `[introduced]` means introduced by `5f11735e`.
- Probes were a temporary Swift file (`ios/LitloftTests/ZZProbeR5.swift`) using `BreakingStream`, a variant that
  keeps connections open and silent after the cut (`HangingStream`), and a raw `AVPlayer`. They ran with
  `-only-testing:LitloftTests/SharedMediaState/ZZProbeR5` and were read back from the result bundle. The rig was
  sampled every 100 ms. The file was removed before the mutation runs. Against the running Litloft the probes made GET
  requests only. Nothing was fixed.

### Probe results used below

| probe | setup | observed |
|---|---|---|
| p1 | **healthy** stream (`cutAfter: 1_000`). Load, ready, 2 s, `seek(100)`, `play` | `waiting: true`, lock rate `0.0` at +0.00 s; `waiting: false`, lock rate `1.0` at +0.54 s; plays on (time 104.25 at +6 s). A later `seek(30)` while playing showed no `waiting` at 100 ms sampling |
| p1b | the exact steps of `playIntoAGoneStreamIsWaiting`, on a **healthy** stream | `waitFor(waiting == true)` → **true**, then lock rate → **`0.0`**. Both assertions of that test hold |
| p2 | Litloft 404 (`LocalLitloft.missing`): `load`, then `play` at once | `loading, waiting: true, paused: false` → +0.11 s `failed, waiting: true, paused: true`, unchanged for 6 s. Lock rate `0.0` |
| p2raw | the same on a raw `AVPlayer` | `timeControlStatus` 1 (`WaitingWhileEvaluatingBufferingRate`), `rate` 1 → after 0.05 s item `failed`, **`rate` 0, `timeControlStatus` still 1**, for 6 s |
| p3 | round-4 p6: cut at 0.3 s, ready with 0.6 s buffered, `play` from 0 | `waiting: true`, lock rate `0.0`, for all 20 s. Round-4 finding 1's case is now reported |
| p4 | `HangingStream`: cut at 3 s, connections kept open and silent | start wait 0.7 s, plays to 10.94 s, `waiting: true`, lock rate `0.0` from +12 s to +130 s. No failure, no error, `status: ready` |
| p5 | cut at 3 s, outage 8 s | `waiting: true` at +7.5 s (time 5.90). `waiting: false` at +33.1 s, lock rate `1.0` at the first `waiting: false` report. Report sequence `ppWWWW…(32 ticks)…W…(47 ticks)` |
| p7 | wait on A, `unload A`, `load B` (local tone), no play | B's reports: `waiting: false` throughout |
| p7b | wait on C, then `load D` **without** `unload` | D: `loading, waiting: true, paused: false`, then `ready` and D plays on its own |

Findings 1 and 2 are tests that let a mutation through. Each mutation puts back a wait that the shell does not
report: a player that sits still, with the Pause button showing, no "Loading…" and the lock screen counting on. The
code at HEAD reports both waits (p3, p4, and the silent-server probe in finding 2). No behaviour that a user can hit at
HEAD was found to break an invariant.

---

## 1. `playIntoAGoneStreamIsWaiting` passes on a healthy stream, so round-4 finding 1 can come back unseen

`[introduced]`. The test is new in `5f11735e` (`ios/LitloftTests/MediaPlayerWaitingTests.swift:39-54`), and so is the
`waiting` read it checks (`ios/Litloft/Media/MediaPlayer.swift:293-295`).

**Invariant:** 15 as revised in round 4 ("a state in which the player was asked to play and is waiting for data is
reported to the web and shown"). The case at stake is round-4 finding 1: a play from a position that was never
loaded, against a server that has gone.

**Why the test cannot tell.** A start from any position waits briefly first. A raw `AVPlayer` reports
`waitingToPlay` / `EvaluatingBufferingRate` at once. On a healthy stream this becomes `playing` 0.02 s later. On a gone
stream it becomes `waitingToPlay` / `ToMinimizeStalls` and stays there (probe `reasons`, raw player). The `play`
command's own report (`MediaPlayer.swift:162`) is taken during the brief wait, so it already says `waiting: true` and
sets the lock-screen rate to 0. The test's `waitFor { waiting == true }` is met by that report on its first check, and
`lockScreenRate == 0` is read straight after. Neither assertion depends on the stream being gone:

- **p1b:** the test's exact steps on a healthy stream (`cutAfter: 1_000`) give `waitedTrue=true`, `lockRate=0.0`.
- **Mutation V17** (the test's own stream becomes `cutAfter: 1_000`): the full suite **passes**.

**Mutation V19** puts round 4's blind spot back into the shell. A `ToMinimizeStalls` wait is reported only once
playback has moved since the last load or seek. This takes a `played` flag, set on `.playing` in the
`timeControlStatus` observer and cleared in `replaceItem` and `seek`, and
`waiting = … && (played || reasonForWaitingToPlay != .toMinimizeStalls)`.

- `want=kill`. The full suite **passes** (131 passed).
- Under V19, the probe measured the test's scenario (cut at 1 s, ready, 2 s, `seek(100)`, `play`) for 10 s. The
  reports said `waiting: false, paused: false`, time `100.00`, and the lock-screen rate was **`1.0`** throughout.
- The round-4 p6 scenario (p3: cut at 0.3 s, play from 0) went `waiting: false` 0.11 s after `play`, with lock rate
  `1.0`.

That is round-4 finding 1's failure scenario unchanged. The page shows Pause at a frozen position with no message,
and the lock screen counts on.

The mid-play tests do not cover it. V19 keeps reporting a wait once playback has moved, which is all
`stoppedStreamIsWaiting` and `waitEndsWhenTheStreamReturns` check (both wait for `time > 1` first). V11 shows the
same split from the other side. V11 drops every `ToMinimizeStalls` wait, and only those two mid-play tests failed.
`playIntoAGoneStreamIsWaiting` passed under V11 too.

`pauseEndsTheWait` (`MediaPlayerWaitingTests.swift:56-70`) has the same shape. It pauses as soon as `waiting == true`
is seen, without first waiting for playback to move. p5 shows that `waiting: true` is already in the reports from the
load onwards (`ppWWWW…`), so this test pauses during the start wait and never during an outage. It does still hold
what it states (V2 killed it alone). But the pause-during-an-outage case, which is round-4 finding 2, is not the one
it drives.

---

## 2. Nothing holds the wait that `AVPlayer` reports as `EvaluatingBufferingRate`, which is how a play into a silent server waits

`[introduced]` (`MediaPlayer.swift:293-295`, and the new test file).

**Invariant:** 15, as above.

**Mutation V18:** `waiting = … && reasonForWaitingToPlay != .evaluatingBufferingRate`. `want=kill`. The full suite
**passes**.

Every waiting test reaches a `ToMinimizeStalls` wait, either mid-play or after the brief start. None depends on the
other reason. The other reason is not only the half-second at a start.

**Probe `silentFromStart`** (a server that accepts connections and never answers):

- `load`, then `play` straight away.
- The shell reported `status: loading, waiting: true, paused: false` with lock rate `0.0`, unchanged for 20 s.
- A raw `AVPlayer` on the same server stayed `waitingToPlay` / **`EvaluatingBufferingRate`**, item status `unknown`,
  for all 10 s.
- p2raw shows the same reason for a failed item. That case is covered by the failure display.

This is the "server asleep before the viewer presses play" case. `AudioTransport` enables Play while the file is
still loading (`usable = mc !== null && !failed`, `AudioTransport.tsx:46`), and a lock-screen play reaches the shell
the same way.

Under V18 the shell reports `waiting: false` for that whole time, because the only wait is an
`EvaluatingBufferingRate` one. The lock-screen rate is then `Double(player.rate)`, which is 1 (`MediaPlayer.swift:342`,
read from the code, not driven under V18). The page shows the Pause button and no "Loading…". V18 also removes the
brief "Loading…" at every start, which the user saw on the device. No test sees either.

---

## Trajectory

> Read the fix diffs in order. Does each round add a branch, a state or a prediction that the round before it also
> added? If so, say so: the design is being patched.

Rounds 1 → 2 through 3 → 4 are tabulated in `round-2.md` to `round-4.md`. Round 4 named three mechanisms that had
gained state for a second or third round: the settling of the shell's own seeks, the failure display (a twin state
keyed by file id, plus resets), and waiting/failure reporting (one detector per round, each covering the case the
previous one missed).

### `5f11735e`, compared with `2e330992`

**Removed:**

| where | removed | kind |
|---|---|---|
| shell | `stalled` (a stored flag) | state |
| shell | `stallObserver` on `playbackStalledNotification`, its registration in `replaceItem`, and its removal there and in `deinit` | observer |
| shell | `watchForResumption`'s `guard … == .playing` and `guard self.stalled` | branches, and the prediction "a stall ends when `timeControlStatus` becomes `.playing`" |
| shell | `stalled = false` in `replaceItem` | reset |

**Added:**

| where | added | kind |
|---|---|---|
| shell | `waiting`, computed from `timeControlStatus` at report time | a read, not stored |
| shell | `watchForWaiting`: a report on every `timeControlStatus` change, with no condition | a send trigger (spec §3.2 "on every change"), in place of the guarded observer |

**Unchanged in shape (renamed only):**

- the lock-screen branch `waiting ? 0 : rate`;
- the wire field;
- the web shadow field, its edge detection and `onWaitingChange`;
- `waitingFileId` with its reset, which is the twin of `failedFileId`;
- `waiting && !failed` in `AudioTransport`;
- the message key, whose text is now "Loading…".

**Is anything added for the second round running?**

- **Waiting and failure reporting: no.** This round removes a state and a prediction and adds neither. The chain
  was `be4b4c24` (`status`), then `2e330992` (a stall flag latched from a notification), then `5f11735e`. That last
  commit replaces the detector with a direct read of the player's state. That is the shape spec §1 chose for the web
  ("do not infer state from the stream"), now applied inside the shell. p3, p4 and the silent-server probe show that
  the read covers the cases the notification missed, and `pauseEndsTheWait` covers the one it did not end. The code
  treats every wait reason alike and so makes no prediction about them. **The new tests do make one:** a
  `waiting: true` seen right after `play` is taken as the wait under test. Findings 1 and 2 are the two halves of
  that assumption.
- **The failure display: no code change.** `waitingFileId` is `stalledFileId` renamed. X5 (the file-id key) still
  survives, as W14 did in round 4.
- **The shell's own commands, and the settling of seeks: not touched.**

### Summary

`5f11735e` converges for the mechanism it replaces. It removes one state, two observers' worth of registration and
one prediction, and it adds one unconditional report trigger. Round-4 findings 1–3 are resolved in behaviour (see
"Checked"). What remains is in the tests: they cannot tell one wait from another, so a mutation that restores round
4's shape passes (finding 1), and so does one that drops the other wait reason (finding 2).

---

## Mutation table

- **Swift:** a full `xcodebuild test` per mutation (87–162 s), under `perl -e 'alarm shift; exec @ARGV' 900`. None
  timed out.
- **Web:** `vitest run src/lib/__tests__ src/components/__tests__/AudioPlayer.test.tsx src/components/player/__tests__
  src/hooks/__tests__`. For X12 and X13, `scripts/merge-addon-messages.mjs` ran first, as CI does, because vitest reads
  the generated `src/messages/`. It ran again after the restore, and the generated directory was compared with a copy
  taken before: identical. X14 was also run through `tsc --noEmit`.
- **Before each run,** the edit was checked to change the file: the pattern count was exactly 1, and `git diff --stat`
  was non-empty.
- **After each run,** the file was restored with `git checkout`. The Litloft stream answered `206` after every Swift
  run.

| id | file | mutation | want | result (killing tests) |
|---|---|---|---|---|
| V1 | MediaPlayer | `waiting` always false | kill | killed (all 4 waiting tests that expect `true`) |
| V2 | MediaPlayer | `waiting` = `timeControlStatus != .playing` | kill | killed (`pauseEndsTheWait`) |
| V3 | MediaPlayer | the `timeControlStatus` observer reports nothing | kill | killed (`stoppedStreamIsWaiting`, `waitEndsWhenTheStreamReturns`) |
| V4 | MediaPlayer | the observer reports only on entering a wait (round-4 T4) | kill | killed (`waitEndsWhenTheStreamReturns`: lock-screen rate) |
| V5 | MediaPlayer | the observer reports only on leaving a wait | kill | killed (2, as V3) |
| V6 | MediaPlayer | `watchForWaiting()` not called | kill | killed (2, as V3) |
| V7 | MediaPlayer | lock-screen rate ignores `waiting` | kill | killed (`playIntoAGoneStreamIsWaiting`, `stoppedStreamIsWaiting`) |
| V8 | MediaPlayer | lock-screen rate always 0 | kill | killed (`waitEndsWhenTheStreamReturns`) |
| V9 | ShellMessage | `waiting` encoded under the key `stalled` | kill | killed (`ContractTests.states`) |
| V10 | ShellMessage | `waiting` not encoded | kill | killed (`ContractTests.states`) |
| V11 | MediaPlayer | `waiting` excludes `ToMinimizeStalls` | kill | killed, only by the two mid-play tests (finding 1) |
| V12 | MediaPlayer | observe `\.rate` instead of `\.timeControlStatus` | kill | killed (2, as V3) |
| V13 | MediaPlayer | `replaceItem` invalidates the waiting observation | kill | killed (2, as V3) |
| V14 | MediaPlayer | `deinit` does not invalidate the waiting observation | live | live |
| V15 | MediaPlayer | the observer calls `tick()` instead of `report()` | kill | killed (`waitEndsWhenTheStreamReturns`) |
| V16 | MediaPlayer | `waiting` also requires `player.rate != 0` | live | live |
| V17 | WaitingTests | `playIntoAGoneStreamIsWaiting` on a healthy stream | kill | **live** (finding 1) |
| V18 | MediaPlayer | `waiting` excludes `EvaluatingBufferingRate` | kill | **live** (finding 2) |
| V19 | MediaPlayer | round 4's blind spot: a `ToMinimizeStalls` wait counts only after playback moved since the last load/seek | kill | **live** (finding 1) |
| X1 | nativeMedia | `waitingChanged` always false | kill | killed (`says it is loading…`, `is announced when it starts and when it ends, once each`) |
| X2 | nativeMedia | the shadow keeps its old `waiting` | kill | killed (2, as X1) |
| X3 | nativeMedia | `onWaitingChange` given the negation | kill | killed (2, as X1) |
| X4 | nativeMedia | `load` does not reset the shadow | live | killed (`is said again for the next file that runs out`); see below |
| X5 | useShellAudio | `waiting` true for any waiting file id | live | live |
| X6 | useShellAudio | `onWaitingChange` records the file whatever the value | kill | killed (`says it is loading…, until it plays`) |
| X7 | useShellAudio | cleanup does not reset `waitingFileId` | kill | killed (`does not carry a wait over to the next file, or back to the same one`) |
| X8 | AudioTransport | "Loading…" shown over a failure | kill | killed (`says so rather than that it is waiting`) |
| X9 | AudioTransport | controls disabled while waiting | kill | killed (2) |
| X10 | AudioPlayer | `waiting` wired to `failed` | kill | killed |
| X11 | AudioPlayer | `waiting` not passed | kill | killed |
| X12 | en.json | `buffering` text back to "Waiting for the server" | kill | killed (2) |
| X13 | ja.json | `buffering` text changed | live | live |
| X14 | nativeBridge | the `MediaState` field typed as `stalled` | kill | killed by `tsc` (3 errors); vitest passes |
| X15 | fixture | `waitingWhilePlaying` says `waiting: false` | kill | killed (`is announced when it starts…`). Swift contract not run for this one |
| X16 | AudioTransport | the old key `waitingForServer` | kill | killed (2) |
| X17 | useShellAudio | cleanup leaves `onWaitingChange` set | live | live |

## Survivors that were meant to survive (`want=live`), and one declared `live` that was killed

| id | why it is fine |
|---|---|
| V14 | the block holds `self` weakly, and an `NSKeyValueObservation` invalidates itself when it is released with the player |
| V16 | the one measured case of `waitingToPlay` with `rate` 0 is a failed item (p2raw). There the page shows the failure, which hides "Loading…", and the lock-screen rate is 0 either way |
| X5 | the cleanup resets `waitingFileId`, so the file-id key differs only for the one render before the cleanup runs (round-4 W14) |
| X13 | the tests render English. The Japanese text is a translation, not behaviour |
| X17 | the channel is unloaded and disposed in the same cleanup (round-4 W18) |
| X4 (killed) | `useShellAudio` makes one channel per file, so a waiting value carried across a `load` never reaches the page. The test that killed it is about `ended`, not `waiting` |

---

## Checked, not a finding

- **Round-4 findings, as claimed.**
  - **#1** is resolved in behaviour. A play into a gone stream is reported and held: p3 (from 0, 20 s) and p4 (a
    silent server, 118 s), with lock rate 0. The far-seek case is reported at HEAD, but the test does not hold it
    (finding 1).
  - **#2** is resolved by construction. A pause makes `timeControlStatus` `.paused`, so the next report says
    `waiting: false` (`pauseEndsTheWait`, V2). "The server is back while paused" and "seek back while paused" have no
    waiting state left to clear.
  - **#3** is resolved and held. V4 (round-4 T4) and V15 are killed by `lockScreenRate == 1`. p5 measured lock rate
    `1.0` on the first `waiting: false` report.
- **Waiting together with failure.** An item that fails after `play` was sent is reported as
  `status: failed, waiting: true, paused: true`, and stays that way (p2, 6 s). The raw player keeps `waitingToPlay`
  after the failure while its `rate` drops to 0 (p2raw).
  - The web shows only the failure: `waiting && !failed` (X8 killed) and the disabled controls.
  - The lock-screen rate is 0, and `nowPlaying.isPlaying` is false.
  - No web code reads `waiting` beyond the display. The contract's `failed` sample (`waiting: false`) is also a real
    shape: a failure without a play, which is the common case because autoplay waits for `ready`.
  - No double sends the `failed` + `waiting: true` shape. With the precedence above, nothing depends on it.
- **Waiting for a file that is not the current one.**
  - `report()` reads `loadId` and `timeControlStatus` together on the main actor, so the observer's hop cannot pair
    one file's id with another's state. The latched flag and the hop that round 4 noted are gone.
  - After a wait on A, `unload A` then `load B` gives B `waiting: false` throughout (p7).
  - A load straight over a waiting item with no unload (p7b) reports the new file as waiting and then plays it on its
    own, because the player keeps its rate. The web always unloads first, in `useShellAudio`'s cleanup, and the lock
    screen cannot load. So p7b is not reachable, and the `waiting: true` it reports is true of the new file.
  - On the web the state is keyed by file id and reset in the cleanup (X7 killed).
- **Test doubles against spec §2.**
  - `BreakingStream` closes connections after the cut. The measurements the round-4 review lacked, for a server that
    stays connected and silent, give the same result through the shell: a wait with no failure, for over two minutes
    (p4, and the silent-server probe).
  - The fixture `waitingWhilePlaying` (`paused: false`, `ready`, time 11.5 = buffered 11.5) has the shape of p4
    (10.94 / 10.93) and p5 (5.90 / 6.00).
  - The web doubles send `waiting: true` only with `paused: false`. The shell sends it with `paused: true` only
    together with `failed` (above).
  - The row "starting to play waits about 0.7 s, without `playbackStalled`" matches p1, p4 and p5 (0.5–0.8 s).
  - No double sends a shape the shell was not measured to send.
- **"Loading…" at every start and after a far seek** (p1: 0.54 s) is what the spec's `waiting` row says. A seek while
  playing into data that was not loaded showed no wait at 100 ms sampling.
- **A server that stays silent is reported as waiting for as long as it is silent** (p4: 118 s; no error, no
  `failed`). That is the designed state under invariant 15, not a failure. The user has not yet checked a network cut
  on the device.
- **`[pre-existing]` A file whose server does not answer at load, with autoplay on, shows no message.**
  - Autoplay waits for `ready`, which never comes, so no `play` is sent.
  - With the rate at 0 the player is not waiting (p7: a loading file that has not been played reports
    `waiting: false`).
  - The page shows Play and an unknown length indefinitely, and pressing Play then shows "Loading…".
  - This comes from readiness-gated autoplay (`be4b4c24`) and is unchanged by this commit. It is not filed.
- **Invariants 1–14, 16, 17:** no path found that breaks them.
  - 1/2/10: `AudioPlayer.tsx` changed only the prop name.
  - 5: seek handling is unchanged. A wait carries no `seekId`, and the seek reports itself (p1: `seek=far` reported
    while waiting).
  - 7/11: `unload` is unchanged, with the pause before `replaceItem(nil)`. p7 shows `loadId: nil, waiting: false`
    after unload.
  - 8: `grep -rn progress ios/Litloft` → nothing.
  - 9: `seconds()` is unchanged.
  - 13: see "Waiting for a file that is not the current one".
  - 14: the `loadId` check is unchanged.
  - 16: the `status` observer is unchanged.
  - 17: untouched.
- **No stale references.** `stalled` and `waitingForServer` appear nowhere in `frontend/src` or `ios/Litloft`, apart
  from the unrelated test name `stalledCookieReadDoesNotHoldEverything`. The generated `src/messages/*.json` carry
  `buffering`.
- **Filed and decided items.** None is touched by `5f11735e`.
  - `[pre-existing]` Round-3 #3 (B): the web Media Session guard in the shell has no test. Not re-run.
  - `[pre-existing]` Back-forward cache after Lock.
  - `[pre-existing]` The reload after an off-screen termination stops playback when the app comes back.
  - `[pre-existing]` External links do nothing.
  - `[pre-existing]` Video stops off screen.
  - `[pre-existing]` Long press selects text.
- **Tooling:** `tsc --noEmit` → clean. `eslint` on `nativeBridge.ts`, `nativeMedia.ts`, `useShellAudio.ts`,
  `AudioPlayer.tsx` and `AudioTransport.tsx` → clean.
- **Working tree at the end:** only `addons/knowledge` is modified (pre-existing), plus this file. `ios/` was compared
  with a copy taken before the first probe, and `diff -r` shows no difference. `git diff --stat -- frontend ios` is
  empty. The probe files `ZZProbeR5.swift`, `ZZProbeR5b.swift`, `ZZProbeR5c.swift` and `ZZProbeR5d.swift` were
  removed after use.

TOTAL: 2 findings
