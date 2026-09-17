# iOS shell Phase 2a — round 2

- Reviewed SHA: `19fa6f76d1b60504e25608e2ae1ca03c76cd708a`. The fix commits since round 1 (`ae3619da`) are
  `9d5d9d74`, `b856281b`, `d6c2d4cb`, `eb606d4b` and `bab34373`.
- Record read: `round-1.md` (15 findings), the invariants file (1–13, with the round-1 meaning of
  `appliedSeq`), spec §4, and `CLAUDE.md` with `review-workflow.md`, `comments.md`,
  `frontend-conventions.md` and `design-decisions.md`.
- Baseline before mutating: `xcodebuild test` → **TEST SUCCEEDED** (~30 s). `swiftlint lint --quiet` → no output.
  `vitest run src/lib/__tests__ src/components/__tests__/AudioPlayer.test.tsx src/components/player/__tests__` →
  949 passed / 69 files. `vitest run src/__tests__` → 616 passed / 45 files. `tsc --noEmit` → clean.
- Probes were temporary files (`ios/LitloftTests/ZZProbeR2.swift`,
  `frontend/src/components/__tests__/AudioPlayer.zzprobe.test.tsx`), plus a local Python HTTP server in the
  scratchpad. All were deleted afterwards. Nothing was fixed.
- `[introduced]` means introduced by the five fix commits.

Findings are ordered by what a user can hit.

---

## 1. In the shell, autoplay never starts: the only trigger is a length that a paused player never reports

`[introduced]` by `bab34373`. `frontend/src/hooks/useShellAudio.ts:61-65`,
`frontend/src/lib/nativeMedia.ts:153-156`. The shell side is unchanged at `ios/Litloft/Media/MediaPlayer.swift:257-265,273-292`.

**Invariant broken:** none of 1–13 names autoplay. It breaks the feature the fix was for: finding 8 asked for
autoplay to start *at the resume point*, and now it does not start at all.

`bab34373` removed the unconditional `channel.play()` after `load`. Autoplay now runs only from
`channel.onReady`, which fires on the first tick with `duration > 0`. The shell emits ticks in only three cases:
after a command is applied, from the periodic observer, and on `didBecomeActive`. The periodic observer fires only
while the timebase runs (the code's own comment at `MediaPlayer.swift:254-256` says so). After `load` the shell
emits one tick, and at that moment the asset has no duration yet. Nothing is playing, and the web sends nothing
more, so no later tick arrives. `onReady` never fires, so `play` is never sent.

**Probes, measured.**

| probe | result |
|---|---|
| Swift: `load` a 3 s local tone, no `play`, wait 2 s | ticks: `[(seq 1, duration 0.0, paused)]`, and nothing more |
| Swift: `load` a 60 s WAV over HTTP (local server), no `play`, wait 3 s | ticks: `[(seq 1, duration 0.0)]`. After `play`, ticks carry `duration 60.0` within 250 ms |
| vitest: `AudioPlayer autoPlay` against a fake shell that answers every command with a tick at its seq, with `duration` 0 until `play` is applied (the behaviour measured above), 5 s of fake time | messages posted: `["media.load"]` |
| same vitest probe with `AudioPlayer.tsx`, `useShellAudio.ts` and `nativeMedia.ts` taken from the parent `eb606d4b` | `["media.load","media.play"]` |

**Failure scenario.** Autoplay is on (the toggle under the player, or `autoPlay` from a playlist or folder
advance). The viewer opens an audio file in the app. Nothing plays. The seek bar is disabled, because the
duration is 0. When a track ends on the lock screen, `onEnded` advances the page to the next file. That file loads
and stays silent. Continuous listening with the screen off, which this phase exists for, stops after the first
track. It starts only if the viewer presses Play, or if leaving and returning to the app happens to produce a
`didBecomeActive` tick.

The new test `"starts an autoplay only after the resume point is applied"` passes because it has the fake shell
report `duration: 180` while `paused: true`. That reading is one the real shell never produces. The test builds its
expectation from a reading that the other side does not send.

**Mutation:** none needed. The probe above is the reproduction, and the parent-commit run is the `[introduced]`
evidence.

---

## 2. A seek on an item that failed to load never finishes, and every later command waits behind it forever

`[introduced]` by `9d5d9d74`. `ios/Litloft/Media/MediaPlayer.swift:108-116,129-130,245-252`.

**Invariants broken:** 11 (Lock's `stopForNavigation` is queued behind the seek and never runs), 7 (the session
and the lock-screen entry are never given back), and every command after it.

`perform(.seek)` now awaits `player.seek`, and every command goes through one serial chain. When the item has
failed (a 404 or 410 from the stream, an expired session, a server that stopped answering), AVPlayer never
finishes the seek. The chain stops there, and nothing on the shell side bounds it. `eb606d4b` bounded the cookie
read for exactly this reason ("every later command — a pause pressed on the lock screen included — waits behind a
load"). The awaited seek is a second unbounded wait in the same chain.

**Probe (temporary Swift test plus a local HTTP server that answers 404), measured:**

| build | `load` a 404 URL, wait 1 s, then `seek(5)`#2, `pause`#3, `unload`#4 | ticks' `appliedSeq` |
|---|---|---|
| HEAD | `unload` had **not run after 40 s** | `[1]` |
| HEAD with only the seek made non-awaited again (the S4 mutation) | `unload` ran after 0.7 ms | `[1, 2, 3, 4]` |
| HEAD, a server that never answers (the item is still loading, not failed) | the stop ran after 1.6 ms | the seek finished without data |

So the blocking case is a failed item, not a slow one.

**Failure scenario.** A viewer listens to a file on the home server. The Mac serving it goes to sleep, or the file is
moved, and the next Range request fails, so the item fails. The seek bar is still enabled, because the shadow keeps
the last `duration` (by reading: a failed item stops the timebase, so no later tick replaces it). The viewer drags it
to retry. From then on the shell ignores everything: pause (in the app, on
the lock screen, on AirPods), opening another file (its `load` is queued behind), and Lock. The lock screen keeps
the file's title, and the app holds the playback audio session, until the app is killed. A protected file whose cookie read hit the 2 s
limit fails the same way, and any seek sent to it afterwards has the same effect. No path that sends one there
was traced, because the slider is disabled while `duration` is 0.

`seekIsAcknowledgedAfterItLands` covers only a local file that loads. No test seeks an item that failed.

**Mutation:** S4 (seek not awaited) is **killed** by `seekIsAcknowledgedAfterItLands`. The two findings pull
against each other: the round-1 fix is held, and the wedge it creates is not.

---

## 3. While playing, the speed label drops back to the old rate, and a second press sends the same rate again

`[introduced]` by `bab34373`. File created by the fixes: `frontend/src/components/player/AudioTransport.tsx:25-28,41-47`.

`cycleRate` sets `shownRate` optimistically. The effect then overwrites it with `mc.getPlaybackRate()`
**whenever the clock snapshot changes**. While playing, the snapshot changes on every poll. The shadow's `rate`
still holds the old value until the shell's `setRate` tick arrives, so the next poll puts the old rate back.
`cycleRate` computes the next rate from `shownRate`, so a press in that window repeats the previous choice. The
commit says it fixed "pressing speed twice quickly could stay on one rate". That is true only while paused.

**Probe (temporary vitest file, since deleted), measured:** a controller that is playing and reports rate 1. Press
speed, then move `time` and advance the clock 300 ms, then press again.
Label after the press: `1.25x`. Label after the clock moves: **`1x`**. `setPlaybackRate` calls: **`[[1.25],[1.25]]`**.

**Failure scenario.** Playing, the viewer taps speed twice to get 1.5x. If a clock poll (every 250 ms while playing)
lands before the shell's reply, the label flickers 1.25x → 1x → 1.25x, and the second tap sends 1.25 again. The
viewer ends up at 1.25x and has to tap again. The window is the round trip to the shell, so this is intermittent.
No invariant is broken.

**Mutation:** W16 (drop `onBlur`) is **live**. The other half of the same fix has no test (see the table).

---

## 4. `loadSeq` assumes that the shell's `appliedSeq` and the page's sequence come from the same document

`[introduced]` by `b856281b` (the gate). The reset it relies on is `[pre-existing]`: `nextSeq` in
`frontend/src/lib/nativeBridge.ts` starts again at every document, while `MediaPlayer.appliedSeq`
(`ios/Litloft/Media/MediaPlayer.swift:24`) lives as long as the web view.
Gate at `frontend/src/lib/nativeMedia.ts:132`.

**Invariants touched:** 4 (across a document boundary the shell's number goes from, say, 50 back to 2), and the
second half of 13.

The gate's premise is "a reading at or above my load's seq was taken after my load". After a full navigation
(Lock, a reload, Retry), the shell still carries the previous document's number, for example 50. The new page loads
with seq 2 (seq 1 is the ping). Every tick emitted before that load is applied carries 50 ≥ 2, so the gate accepts it
as a reading of the new file. The load itself can wait up to 2 s on the cookie read (`eb606d4b`). Ticks the shell can
emit in that window: a `didBecomeActive` tick, and the tick of a previous document's command that was still in the
chain when the navigation started (`stopForNavigation` is queued behind it).

By reading. Not measured end to end. What such a tick carries today is mostly harmless: after
`stopForNavigation`, `ended` is false and `duration` is 0, so neither `onEnded` nor `onReady` fires. It overwrites
the shadow with zeros, and it releases a pending seek. The case that is not harmless is a tick of the *previous
document's* file emitted while a seek of that document was still being awaited (`9d5d9d74` made seeks take as
long as the seek does). It carries a real `duration`, so it fires the new file's `onReady` with the old file's
length, and `resumeOnce` then checks the resume window against the wrong length, once.

**Failure scenario (by reading).** Playing a 3-minute file, the viewer seeks and immediately presses Lock. The page is
replaced. `/` does not render an `AudioPlayer`, so nothing reads the tick. The case needs the new document to load a
player at once (a reload of a file page), which makes it narrow. Filed because the brief asks what the gate lets
through, and the answer is "anything from a previous document".

**Mutation:** none. No test reaches a second document.

---

## 5. A full navigation now stops playback, including any reload WebKit starts on its own

`[introduced]` by `d6c2d4cb`. `ios/Litloft/Web/WebView.swift:74-77`.

**Invariant touched:** 11 is what the change holds. This finding is about which other navigations reach the same
line.

Traced in the web code: the only `window.location` assignment is Lock (`Sidebar.tsx:232`). Downloads go through
`window.open(..., "_blank")`, which the shell already drops (`known-issues.md`). Archive download anchors are not on
the audio page. A back swipe inside the app is a same-document history entry and does not start a provisional
navigation. So none of the app's own navigations stops audio that the viewer expects to continue.

What was **not** measured is the case where the web content process is terminated while the app plays in the
background. `Coordinator` does not implement `webViewWebContentProcessDidTerminate(_:)`. If WebKit then reloads
the page itself (whether it does, and when, was not measured), that reload is a main-frame provisional navigation.
It reaches `stopForNavigation` and **stops the audio that the whole phase exists to keep playing**, typically when
the viewer brings the app back or, if the reload is not deferred, with the phone locked. Before `d6c2d4cb` the shell
kept playing through such a reload.

A navigation that starts provisionally and then fails leaves the page on screen with a channel that still believes
it has a file. The shell has unloaded, and the next tick (`appliedSeq` ≥ `loadSeq`) zeroes the shadow, so the
transport goes disabled. Every such failure other than `NSURLErrorCancelled` also raises `ConnectionErrorView`,
whose Retry reloads the page. No path to the silent case was found in the app's own links.

**Mutation:** S25 (drop the call) → see the table (`CoordinatorTests`). The termination case needs a device or a
simulator with a server and was not driven. Filed so the triage can decide whether it needs driving.

---

## 6. Round 1's Swift test gaps are still open, including one that would skip the next track

`[pre-existing]` relative to the fixes. Round 1 filed these under finding 15, and the brief says the test gaps were
fixed. `ios/LitloftTests/MediaPlayerTests.swift`.

The fixes added tests for the end of an item, for seeking and for remote presses. These round-1 survivors are still
**live** at HEAD (IDs from this round's table, with round 1's in brackets):

| this round | round 1 | mutation | what a viewer would get |
|---|---|---|---|
| S27 | S16 | `load` does not clear `ended` | autoplay advances past A. B's first tick still says `ended: true`, so B's channel fires `onEnded` at once and the page skips B (no write, since `duration` is 0) |
| S30 | S11 | tick reports `player.rate`, not `defaultRate` | a paused player reports rate 0, and the speed label reads `0x` |
| S31 | S12 | `setRate` always sets `player.rate` | changing speed while paused starts playback |
| S32 | S7 | `load` does not take the remote commands | lock-screen buttons do nothing |
| S33 | S19 | lock-screen `isPlaying` inverted | the toggle pauses when paused, which does nothing |
| S17 | S18 | every cookie in the jar goes with the stream | now bounded by the origin check at the bridge (S18–S22 killed), so lower than in round 1 |

S27 is the one a user reaches. `playsToTheEnd` and `playAfterTheEndRestarts` both start from a fresh player, so
neither loads a second file after an end.

Test-shape notes in the new tests:
- `"starts an autoplay only after the resume point is applied"` feeds a reading the shell never sends (finding 1).
- `stalledCookieReadDoesNotHoldEverything`'s `paused == true` already held before the press, because the remote
  URL never plays. The time bound is what holds the fix (S15 killed).
- `MessageOrigin.isSameOrigin` has no case for a default port or a mixed-case host. S23 (no port folding for the
  URL) and S24 (URL host not lowercased) are live. Both are reachable only if a URL differs from
  `window.location.origin` in form, which `useShellAudio` never does. Low.
- W16 (`onBlur` dropped) is live (finding 3).

---

## Trajectory

> Does each fix add a branch, a state or a prediction for the case it was given? Is the design being patched case by
> case, or does the round remove branches and converge?

**What was removed:** the completion-handler tick for a seek (`9d5d9d74`), the read of `appliedSeq` when a remote
press is queued (`9d5d9d74`), the shadow reset in `unload` (`b856281b`), and `title`/`artist` as effect
dependencies (`bab34373`).

**What was added, fix by fix:**

| commit | added | for round-1 finding | kind |
|---|---|---|---|
| `9d5d9d74` | optional `seq` and the `if let seq` branch. The seek becomes an `await` inside the chain | 1, 5 | patch on the `appliedSeq` mechanism, at the place the user chose |
| `b856281b` | `loadSeq` state, and the gate branch with its prediction ("a reading ≥ my load describes my file") | 3 | a second meaning given to the same number |
| `b856281b` | `unload` stops accepting ticks | 4 | patch, needed because the reset was removed |
| `b856281b` | `owned.fileId` keyed state, and the branch in the return | none. The commit says the previous change "exposed one more path" | patch on the patch, same commit |
| `d6c2d4cb` | same-origin check on both URLs | 2 | new behaviour (invariant 12) |
| `d6c2d4cb` | `stopForNavigation` | 7 | new behaviour (invariant 11) |
| `d6c2d4cb` | `guard source != nil` in `unload` | none. It exists because the previous line makes every page load unload | patch on the patch, same commit |
| `eb606d4b` | restart at the end | 6 | new behaviour |
| `eb606d4b` | `publishedDuration` state and a branch in `emitTick` | 9 | new behaviour, one case of it (interruptions and stalls are still not republished) |
| `eb606d4b` | cookie-read timer, `FirstAnswer`, and a two-task race | 13 | new state |
| `eb606d4b` | cleanup branch in `deinit` | 14 | new behaviour |
| `bab34373` | `onReady` event, `readySent` state, and a prediction ("a usable length arrives before anything plays") | 8 | new state and a prediction about the shell |
| `bab34373` | `current` flag and branch | none. It exists because the previous line put a round trip before `play` | patch on the patch, same commit |
| `bab34373` | `shownRate`, a second copy of the rate, re-synced by an effect | 11 | new state that duplicates the shadow |

**What I see.**

1. Every fix commit adds state. None of the round removes one. The removals are dependencies, a reset and a
   callback.
2. Three commits (`b856281b`, `d6c2d4cb`, `bab34373`) each contain an addition whose only purpose is to repair the
   addition just before it in the same commit (`owned.fileId`, `guard source != nil`, `current`). The trajectory
   question asks about rounds. This is the same shape inside a round.
3. The web side's model of the shell has grown from one prediction (`pendingSeek`: "a reading ≥ my seek's seq
   has the seek's position") to three (`loadSeq`: "… describes my file"; `readySent`: "a length will arrive").
   The two new ones are both wrong in this round. `onReady`'s prediction never holds for a paused player
   (finding 1), and `loadSeq`'s does not hold across documents (finding 4). Neither was measured against the shell
   before it was written. Finding 1 is the round's most serious defect, and it comes from a prediction.
4. The `appliedSeq` fixes did what they claimed: S1, S2 and S4 are killed, and the seek probe from round 1 now
   acknowledges at the new position. But moving where N is raised to "after the effect is observable" turned an
   asynchronous effect into an `await` on a serial chain. That made the chain wait on AVPlayer's completion, which
   does not come for a failed item (finding 2). The same commit series bounded the other unbounded wait
   (`eb606d4b`) and said why. So the round opened the same class of defect that it closed elsewhere.
5. New behaviour, as opposed to patches: the origin check, the stop on navigation, the restart at the end, the
   length republish, the cookie bound, the `deinit` cleanup, and the rename fix (a removal). These are what round 1
   asked for and read as additions of behaviour, not as case handling. The patches on an existing mechanism are
   `loadSeq`, `unload`'s "stop accepting", `owned.fileId`, `current`, `readySent`/`onReady` and `shownRate`.

In short: the `appliedSeq` mechanism itself was corrected in place. Around it, the web channel is taking on one
state or prediction per reported case, and two of this round's new predictions already fail.

---

## Mutation table

Swift: full `xcodebuild test` per mutation. Web: `vitest run src/lib/__tests__
src/components/__tests__/AudioPlayer.test.tsx src/components/player/__tests__`. Each edit was checked to have
applied exactly once before running, and the file was restored with `git checkout` after each.

| id | file | mutation | want | result |
|---|---|---|---|---|
| S1 | MediaPlayer | remote/navigation commands advance `appliedSeq` (`seq ?? appliedSeq + 1`) | kill | killed (`remoteDoesNotAdvanceTheSequence`, `remoteQueuedBehindWebCommand`, `navigationStopsPlayback`) |
| S2 | MediaPlayer | `applyFromRemote` stamps the current `appliedSeq` (round-1 code) | kill | killed (`remoteQueuedBehindWebCommand`) |
| S3 | MediaPlayer | drop `await previous?.value` | kill | killed (the run failed without naming a test, so treat it as a crash) |
| S4 | MediaPlayer | seek not awaited | kill | killed (`seekIsAcknowledgedAfterItLands`) |
| S5 | MediaPlayer | no restart at the end | kill | killed (`playAfterTheEndRestarts`) |
| S6 | MediaPlayer | restart seek after `player.play()` | kill | killed (`playAfterTheEndRestarts`) |
| S7 | MediaPlayer | no republish on a length change | kill | killed (`lengthReachesTheLockScreen`) |
| S8 | MediaPlayer | `publishNowPlaying` does not record `publishedDuration` | live | live |
| S9 | MediaPlayer | `unload` does not reset `publishedDuration` | live | live |
| S10 | MediaPlayer | `unload` without `guard source != nil` | kill | killed (`navigationWithNothingLoaded`) |
| S11 | MediaPlayer | `deinit` cleanup removed | kill | killed (`droppedPlayerCleansUp`) |
| S12 | MediaPlayer | `deinit` without `nowPlaying.clear()` | kill | killed (`droppedPlayerCleansUp`) |
| S13 | MediaPlayer | `deinit` without `player.pause()` | live | live |
| S14 | MediaPlayer | `deinit` without `removeTimeObserver` | live | live |
| S15 | MediaPlayer | no cookie-read timeout task | kill | killed (`stalledCookieReadDoesNotHoldEverything`) |
| S16 | MediaPlayer | `FirstAnswer` does not clear its continuation | kill | killed (double resume, which surfaced in `playAfterTheEndRestarts`) |
| S17 | MediaPlayer | all cookies sent with the stream | kill | **live** (6) |
| S18 | ShellBridge | stream URL not origin-checked | kill | killed (`foreignFileIsRefused`) |
| S19 | ShellBridge | artwork URL not origin-checked | kill | killed (`foreignArtworkIsDropped`) |
| S20 | MessageOrigin | `isSameOrigin` ignores scheme | kill | killed |
| S21 | MessageOrigin | `isSameOrigin` ignores port | kill | killed |
| S22 | MessageOrigin | `isSameOrigin` ignores host | kill | killed |
| S23 | MessageOrigin | URL port not folded | kill | **live** (6, low) |
| S24 | MessageOrigin | URL host not lowercased | kill | **live** (6, low) |
| S25 | WebView | navigation does not stop the player | kill | killed (`CoordinatorTests.navigationStopsThePlayer`) |
| S26 | MediaPlayer | `stopForNavigation` pauses instead of unloading | kill | killed (`navigationStopsThePlayer`, `navigationStopsPlayback`) |
| S27 | MediaPlayer | `load` does not clear `ended` | kill | **live** (6) |
| S28 | MediaPlayer | `seek` does not clear `ended` | kill | killed (`playAfterTheEndRestarts`) |
| S29 | MediaPlayer | `finish` does not set `ended` | kill | killed (`playsToTheEnd`, `playAfterTheEndRestarts`) |
| S30 | MediaPlayer | tick reports `rate`, not `defaultRate` | kill | **live** (6) |
| S31 | MediaPlayer | `setRate` always sets `player.rate` | kill | **live** (6) |
| S32 | MediaPlayer | `load` does not take the remote commands | kill | **live** (6) |
| S33 | MediaPlayer | lock-screen `isPlaying` inverted | kill | **live** (6) |
| W1 | nativeMedia | `loadSeq` gate removed | kill | killed |
| W2 | nativeMedia | gate `<` → `<=` | kill | killed |
| W3 | nativeMedia | `unload` keeps `loadSeq` | kill | killed |
| W4 | nativeMedia | `unload` resets the shadow (round-1 code) | kill | killed (including the `AudioPlayer` teardown save) |
| W5 | nativeMedia | `load` keeps `readySent` | kill | killed |
| W6 | nativeMedia | ready on `duration >= 0` | kill | killed |
| W7 | nativeMedia | `readySent` never set | kill | killed |
| W8 | nativeMedia | `onEnded` before `onReady` | live | live |
| W9 | useShellAudio | controller returned without the file key | kill | killed (`does not mark the next file finished…`) |
| W10 | useShellAudio | autoplay without the `current` check | kill | killed |
| W11 | useShellAudio | `play` right after `load` as well | kill | killed |
| W12 | useShellAudio | `file.title` back in the deps | kill | killed |
| W13 | useShellAudio | cleanup leaves `onReady` set | live | live |
| W14 | useShellAudio | autoplay does not wait for the resume read | kill | killed |
| W15 | AudioPlayer | `readyRef` not assigned | kill | killed |
| W16 | AudioTransport | no `onBlur` reset | kill | **live** (3, 6) |
| W17 | AudioTransport | no `onPointerCancel` reset | kill | killed |
| W18 | AudioTransport | no optimistic `setShownRate` | kill | killed |
| W19 | AudioTransport | `currentTime` dropped from the effect deps | kill | killed |
| W20 | AudioTransport | next rate computed from `mc.getPlaybackRate()` | kill | killed |
| W21 | AudioTransport | effect never syncs the rate | kill | killed |
| W22 | AudioPlayer | `handleEnded` skips `notifyEnded` | kill | killed |
| W23 | useShellAudio | empty title/artist sent | kill | killed |
| W24 | useShellAudio | `channel.onEnded` not wired | kill | killed |
| W25 | useShellAudio | cleanup never clears `current` | kill | killed |
| W26 | AudioTransport | initial `shownRate` 2 | live | live |
| W27 | nativeMedia | `load` keeps `pendingSeek` | live | live |

Spot checks of round-1 fixes end to end: finding 1 (S1/S2), finding 4 (W4 kills the teardown save test) and
finding 5 (S4) are held by tests. Finding 8's fix is the subject of finding 1 above.

## Survivors that were meant to survive (`want=live`)

| id | why it is fine |
|---|---|
| S8 | without the record, the length is republished on every tick. That is redundant, not wrong |
| S9 | the next `load` publishes with an indefinite duration and resets the value to 0 |
| S13 | the `AVPlayer` is released with the `MediaPlayer`, so its output stops anyway |
| S14 | the observer is owned by the `AVPlayer` being released |
| W8 | the two callbacks are independent. The order matters only for a single tick that both ends and first reports a length, which has no consumer that depends on it |
| W13 | the channel is disposed in the same cleanup, and `current` guards the pending `.then` |
| W26 | the effect overwrites it on mount whenever there is a controller. With no controller the button is disabled |
| W27 | `useShellAudio` never reuses a channel (round 1, F5) |

## Checked, not a finding

- **Probes that did not reproduce:** a seek on an item whose server stalls (never answers, or stops after 20 s of
  data) finishes at once, so the chain does not wedge there. Only a *failed* item wedges it (finding 2). With the
  cookie read racing the timer, a remote pause arrives in about 2 ms (`stalledCookieReadDoesNotHoldEverything`).
- **Swift 6 concurrency.** `FirstAnswer` is `@MainActor`, and both racing tasks hop to the main actor before
  `give`, so the continuation is resumed at most once (S16 shows the guard is what prevents a double resume). The
  losing task is not cancelled. The sleep task holds `answer` for up to 2 s. A cookie read that never returns keeps
  its task, `jar` and `answer` alive for good, which is one small leak per stalled load. `isolated deinit` runs on
  the main actor. A load in flight keeps `self` alive through `self?.perform`, so `deinit` runs after the load has
  set `source` and taken the session, and the `source != nil` branch then gives both back. `nowPlaying.clear()` in
  `deinit` removes *all* remote-command targets process-wide (`removeTarget(nil)`). A second `MediaPlayer` alive at
  the same time would lose its targets. Only one exists per web view, and a new one is created only through
  "Change server", which goes through the setup screen first.
- **Controller reads after unload.** The kept reading is read by `usePlaybackProgress`'s cleanup, which is the
  intent, and by nothing else. `onMediaController` hands the page `null` in the render where the file changes,
  because `useShellAudio` returns `null` there. A disposed channel still posts commands if called (`send` does not
  check), which is `[pre-existing]`. The only new late caller is the autoplay `.then`, and `current` guards it.
- **File change ordering.** A → B: `useShellAudio`'s cleanup unloads A and keeps its reading. Then
  `usePlaybackProgress`'s cleanup (A's closure, A's `write`) saves A. Then B's effects run. In the one render in
  between, `mc` is `null`. W4 and W9 are killed on this path.
- **The origin check.** `window.location.origin` is what both URLs are built from, so the check passes for the
  app's own loads. The port folding matches `isTrusted`.
- **Rename.** The lock screen keeps the old title until the next load. That is the trade the fix chose.
- **Accepted items** (video not native, `_blank` links, long-press selection, no iOS CI): not re-derived.
- `swiftlint lint --quiet`: no output. `tsc --noEmit`: clean. `vitest run src/__tests__`: 616 passed.
- Working tree at the end: only `addons/knowledge` modified (pre-existing). All probe files and the local server
  were removed or stopped.

TOTAL: 6 findings
