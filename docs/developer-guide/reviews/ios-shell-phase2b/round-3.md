# iOS shell Phase 2b — round 3

- Reviewed SHA: `b4f920189b2bc79c3bfe60145e2b2e798eac4b15`, in a detached worktree that did not move during
  the review. Round 2 saw `3e9b3745`; this round adds `89ec754e` (the round-2 record, prose only) and
  `b4f92018` (the round-2 fixes), which is the only change to code.
- Record read: round 1's findings file and round 2's, both under
  `docs/developer-guide/reviews/ios-shell-phase2b/`, with the user's triage of round 2 (1–6 are A, 7 is B);
  the invariants `2026-09-17-ios-native-video-invariants.md` (2b 1–10 plus 11–15 added after round 1, with
  the revision record) and `2026-09-16-ios-native-audio-invariants.md` (2a 1–17 with its four revisions);
  the spec `2026-09-17-ios-native-video.md` (§2 measurements, §3, "Checked, no action") and the plan;
  `CLAUDE.md`, `.claude/rules/review-workflow.md`, `comments.md`, `frontend-conventions.md`, and the
  watch-history part of `design-decisions.md`.
- Fix SHAs read with `git show`, in order: `c5682441`, `b18b6b13`, `03d43d84`, `f173a95c`, `f9c45d1e`,
  `3e9b3745`, `b4f92018`.
- Baseline before mutating, at `b4f92018`:
  - `xcodebuild test` (full scheme) → **TEST SUCCEEDED**, 196 test cases passed, 0 failed (193 at round 2).
    The three added are `scrollerFoundAfterTheDocumentScrolled`, `reportsWhatPictureInPictureSays` and
    `audioIsNeverOffered`. The Litloft server on `:3000` was only read.
  - `vitest run` over the nine suites this change touches (`shellSurface`, `vtt`, `nativeBridge`,
    `nativeMedia`, `useShellSurface`, `useShellCaptions`, `useMiniPlayer`, `VideoPlayerShell`,
    `AudioPlayer`) → **147 passed, 9 files** (125 over eight suites at round 2).
  - `tsc --noEmit` → clean. `eslint` over the four changed source files → clean.
    `swiftlint lint --quiet` → clean.
- Mutations ran one at a time. Each replacement was confirmed to have changed the file before the run, and
  the file was restored with `git checkout --` after it. Swift mutations ran against
  `-only-testing:LitloftTests/SharedMediaState` (152 cases at the baseline); web mutations against the
  suites named per row. Nothing was fixed. The worktree finished clean (`git status --short` empty at
  `b4f92018`).
- Every finding is in a file or a function these commits create or change, so each is `[introduced]` unless
  it says otherwise.

---

## 1. The new end-of-file test passes with `notifyEnded()` deleted, so round 2's finding 1 is still half open

`[introduced]` (`frontend/src/components/player/ShellVideoPlayer.tsx:197-200`;
`frontend/src/components/__tests__/VideoPlayerShell.test.tsx:237-248`).

**Invariants:** 2b-3 (*"動画の視聴位置の保存は web の 1 実装だけが行い、完了時に行を消さず"*), 2a-8, and
`design-decisions.md` — *"Reaching the end of a media file records the final position; it never deletes the
record."*

`b4f92018` claims the shell video player's watch history is now held by tests. The **resume** half is:
round 2's P5 (`readyRef.current = async () => {}`) is now killed by *"starts where the viewer left off,
before it plays"* (mutation W16 below). The **end** half is not.

**Mutation W17** (round 2's P6): delete `notifyEnded();` from the ended handler, leaving `onEnded?.()`.
`want=kill`. The nine suites **pass**, including the new *"records where the file ended rather than
forgetting it"*.

The reason is that the new test asserts an outcome another path already produces. It reports `time: 5`, then
`time: 120, duration: 120, ended: true`, and asserts `saveWatchProgress("vid-1", 120, 120)`. The clock tick
in `usePlaybackProgress.onTick` (`frontend/src/lib/playbackProgress.ts:192-206`) writes exactly that on its
own, because `|120 − 5| ≥ SAVE_INTERVAL`. `notifyEnded` never has to run for the assertion to hold.

What `notifyEnded` uniquely covers is the case the periodic save cannot reach — the end arriving less than
`SAVE_INTERVAL` after the last periodic write, and the `usable(currentTime) ? currentTime : duration` branch
at `playbackProgress.ts:123`. **Reproduced** with a probe test (written, run, deleted):

```tsx
await act(async () => report({ time: 118, duration: 120, paused: false }));
await waitFor(() => expect(mockSaveWatchProgress).toHaveBeenCalledWith("vid-1", 118, 120));
await act(async () => report({ time: 120, duration: 120, ended: true, paused: false }));
await waitFor(() => expect(mockSaveWatchProgress).toHaveBeenCalledWith("vid-1", 120, 120));
```

| tree | result |
|---|---|
| `b4f92018` unmodified | **passes** |
| with `notifyEnded()` deleted | **fails** — `saveWatchProgress` called once, with `(vid-1, 118, 120)` |

So the behaviour is present and correct in the code; it is the test that does not hold it. The user-visible
consequence of a regression here is the one `design-decisions.md` names: a file watched to the end is
recorded at 118/120, which is under the 90% gate in `drives.py`, so it comes back in continue-watching
instead of reading as finished.

---

## 2. Nothing holds that the mini player is off inside the shell — only that `shouldShowMini` would say so

`[introduced]` (`frontend/src/hooks/useMiniPlayer.ts:129`).

**Invariant:** 2b-1 for the outside-the-shell half (unaffected); inside the shell this is the user's own
decision from the round-2 triage, and the claim under review is that `b4f92018` implements it.

The new unit test covers the pure function:

```ts
it("returns false inside the iOS shell", () => {
  expect(shouldShowMini({ ...base, shell: true })).toBe(false);
});
```

**Mutation W14** — delete `if (inputs.shell) return false;` from `shouldShowMini`. `want=kill`. **Killed** by
that test.

**Mutation W15** — leave `shouldShowMini` alone and change the one caller from
`shell: isNativeShell()` to `shell: false`. `want=kill`. **Live.** Re-run against
`useMiniPlayer.test.ts` *and* `mediaClock.consumers.test.ts` (the only two suites that touch the mini
player): 20 passed, 0 failed.

This is the same shape as round 2's finding 6 one level out: the rule is held, the wire that carries it is
not. `useMiniPlayer.test.ts` already has a hook-level suite with an `IntersectionObserver` double, so the
seam a test would need is there.

---

## 3. A picture-in-picture change the page did not ask for is reported by nothing a test holds

`[introduced]` (`ios/Litloft/Media/MediaPlayer.swift:66`).

**Invariants:** 2b-4 (*"インライン再生中にホームへ戻ると PiP に入り、再生が続く"*) and 2b-12; spec §3.5
(*"行は `pipPossible` のときだけ出す"*).

`b4f92018`'s sixth claim is that the `PictureInPicture` seam now reaches `MediaPlayer`. It does — mutations
S3 and S4 both die (below), so `MediaPlayer` really reports what the stand-in says. But the two new tests
observe that value only on the back of a **command**: `reportsWhatPictureInPictureSays` reads `pip == true`
right after `apply(.pip(active: true))`, and reads `pipPossible == false` after an unrelated
`apply(.setVolume(1))`. `perform` calls `report()` at the end of every command
(`MediaPlayer.swift:154-155`), so both assertions hold without the notification path existing at all.

**Mutation S6:** `surface.onPictureInPictureChange = { [weak self] in self?.report() }` →
`surface.onPictureInPictureChange = nil`. `want=kill`. The Swift suite **passes** — 152 cases, 0 failed.

That callback is the only route from a spontaneous change to the page. Three reachable cases go through it
and nothing else:

- **The system starts picture in picture by itself.** `canStartPictureInPictureAutomaticallyFromInline =
  true` (`PictureInPicture.swift:34`), so leaving the app while playing inline starts it without the page
  sending `media.pip` — that is invariant 4. The `pip: true` the page's toggle reads comes from here.
- **`isPictureInPicturePossible` flips.** `SystemPictureInPicture` observes it with KVO
  (`PictureInPicture.swift:36-38`) and calls `onChange`. While the video is loaded but **paused** — autoplay
  off, which is the default — `addPeriodicTimeObserver` is not firing, so the tick at
  `MediaPlayer.swift:380` never runs and the settings row that §3.5 gates on `pipPossible` would not appear
  until the viewer pressed play.
- **The viewer closes the picture-in-picture window while paused.** `didStopPictureInPicture` → `onChange`;
  with no tick running, the page would keep showing the toggle on.

While playback is running the 4 Hz tick carries the same fields, which is why this is a hole rather than a
break of the running app. `FakePictureInPicture` already has `startAutomatically()`, unused by any test,
which is the input a test for this would use.

---

## 4. The branch ships native video and the user guide still says it does not

`[introduced]` (`docs/user-guide/ios-app.md:63`).

`CLAUDE.md`, "Shipped behaviour is documented under `docs/`": *"Every change that alters what a user, an
operator, or an addon developer can observe must update the matching page under `docs/` in the same PR"*,
with "Something a viewer sees or presses" → `docs/user-guide/`.

`git log --name-only develop..HEAD -- docs/` returns only the two review records. `docs/user-guide/ios-app.md`
is untouched and its Limitations section reads:

> - **Video** still plays in the page, so it stops when the app leaves the screen.

That is the opposite of what `03d43d84` onwards ships, and it is a reader-facing instruction rather than a
comment: someone reading it would conclude the shell has no video path and that picture in picture is not
available. `b4f92018` adds a second item to the same page's debt — inside the app the mini player no longer
appears, which `docs/user-guide/viewers-and-players.md:95` still describes unconditionally for desktop
widths (an iPad in the shell is ≥ 768 px, so it is a desktop width).

Reported here rather than left as prose because the rule that requires the page is a convention of this
repository, not a matter of wording.

---

## 5. Turning the mini player off inside the shell also turns it off for `.loft` embeds, which have no picture in picture

`[introduced]` (`frontend/src/hooks/useMiniPlayer.ts:14-19, 28`).

**Invariant:** none declared. Spec §3.8 names the iPad mini player as one of the five display modes the
geometry has to express; this removes it, which is the user's decision, but its reach is wider than the
reason recorded beside it.

The gate is on `useMiniPlayer`, which is global, and the justification in the doc comment is specific:

```ts
/**
 * The iOS shell plays the video behind the page and offers picture in
 * picture, which is the same thing done better: …
 */
shell: boolean;
```

`MiniPlayerContainer` has exactly two callers, both in `FilePreview.tsx`: `kind === "loft"` (line 105) and
`kind === "video"` (line 126). Only the second reaches `ShellVideoPlayer` — `VideoPlayer.tsx:295` is the sole
`isNativeShell()` branch on the player side, and `LoftPlayer` has none (grep: `isNativeShell` appears in
`AudioPlayer.tsx`, `VideoPlayer.tsx`, `useMiniPlayer.ts`, `nativeMedia.ts`, `nativeBridge.ts` only). So a
`.loft` file opened in the shell on an iPad now loses its mini player and gains nothing: the shell does not
play it, and there is no picture in picture for an iframe embed.

Not reproduced in a browser — it needs an iPad-width shell and a `.loft` file (R-5).

---

## 6. `visibility` is left on the page if the frame goes away while it is out of flow — and nothing would notice

`[introduced]` (`frontend/src/hooks/useShellSurface.ts:72-75, 126, 140`).

**Invariant:** 8, second clause — *"枠が無くなったら透明化を戻す"*.

**Mutation W13:** delete `for (const node of [...hidden.keys()]) unmark(node, "visibility", hidden);` from
`closeHole`, leaving the background half. `want=kill`. The suites **pass**.

The code is correct; the test is not there. `closeHole` is the path taken when the frame disconnects
(`useShellSurface.ts:126`) and on effect teardown (`:140`), and the new fullscreen test never goes through
it — it rerenders back to inline, which restores through `openHole`'s own unmark loop instead. The
background half of `closeHole` **is** held (round 2's S8 and S9 still die), so the asymmetry is invisible
from the suite.

What it would cost if it regressed is the whole app: the elements `openHole` hides in fullscreen are the
page's own layout — the header, the canvas siblings, everything under `<body>` that is not on the frame's
path — and they carry `visibility: hidden !important` inline. A player that unmounts while pseudo-fullscreen
is active (a navigation that is not a back press, so `exit()` never runs) would leave a blank app with a
correct background colour.

---

## 7. Two guards inside `openHole` decide whether the page or the video disappears, and one of them is unheld

`[introduced]` (`frontend/src/hooks/useShellSurface.ts:61`).

**Invariants:** 7 and 8.

```ts
if (!(child instanceof HTMLElement) || child === frame || path.has(child)) continue;
```

| mutation | what it drops | want | result |
|---|---|---|---|
| W12 | `child === frame` | kill | **killed** — the new test asserts `frame.style.visibility === ""` |
| W11 | `path.has(child)` | kill | **live** |

`path` is the frame's ancestor chain, and a child of an ancestor that is itself on the chain *is* the next
ancestor down. Without that clause, every ancestor of the frame gets `visibility: hidden`, and `visibility`
inherits: the frame, its controls (`Controls`/`MediaControls` render inside the frame,
`ShellVideoPlayer.tsx:218-236`) and its captions all vanish. The native video would still be visible,
because it sits behind the web view — so the failure mode is a fullscreen video with no controls and no way
back except the hardware back gesture.

The test does not catch it because it asserts on `frame.style.visibility`, which stays `""` while an
ancestor carries the inherited value, and jsdom resolves no inheritance. The assertion that would catch it
is on the ancestors (`column`, `page`) rather than on the frame.

---

## Does each round-2 fix do what it claims?

Read from the `b4f92018` diff and from mutations against the fixed code, not from the commit message.

| round 2 | claim | verdict |
|---|---|---|
| 1 (watch history in the shell) | the resume point is applied before play, and the end of a file is recorded | **Half.** The resume point is held — W16 (round 2's P5) is killed by *"starts where the viewer left off, before it plays"*, which asserts both that a `media.seek` to 75 is posted and that `media.play` comes after it. The end is **not** held: W17 (round 2's P6) survives. **Finding 1.** |
| 2 (`clipsOverflow`) | it is a function a test can call, because jsdom answers `""` where a browser answers `"visible"` | **Yes.** Round 2's G9 (W4 here) is dead, and so are both neighbours: W5 (dropping the `""` half) and W6 (checking only the `overflow` shorthand). The double is faithful to the browser — the table includes `("visible auto", "visible", "auto")`, which is how a real `getComputedStyle` serialises an element with `overflow-y: auto`. Nothing was weakened at the call site: `clipperOf` now reads `clipsOverflow(getComputedStyle(node))` and the sticky tests still die under W5. |
| 3 (`contractVersion` comment) | it describes what the code does rather than instructing a bump in both directions | **Yes.** The clause round 2 objected to (*"or starts sending what an older page cannot read"*) is gone, and what replaces it is checkable: *"The page refuses a shell below the version it needs"* is `isNativeShell`'s `>=` (B1–B3 still die), and *"says so when a command is one it cannot read"* is `ShellAction.unreadable` → `MediaState.unreadable` with `status: .failed` (B20, B23 still die). The gate is still one-directional, which is what invariant 11 states. |
| 4a (mini player off in the shell) | `shouldShowMini` gained a `shell` input | **The rule, not the wire.** W14 dies, W15 lives. **Finding 2**, and the reach of the decision is **finding 5**. It does remove round 2's "too much" half by removing the mode: with `isMini` false the anchor is `w-full`, so there is no `bg-bg-card` placeholder for `openHole` to clear. It also removes the only non-fullscreen way for `isFixed(frame)` to be true — see "Checked, not a finding". |
| 4b (only the frame paints while it is out of flow) | everything off the frame's path is hidden in fullscreen, and `position` joined the layout key | **Yes for the behaviour, with two unheld guards.** W7 (never hides), W10 (hides in flow too), W12 (hides the frame) and W3 (drop `position` from `layoutKey`) all die on the new test; W9 (never unhides) dies too. W11 and W13 live — **findings 7 and 6**. W8 (dropping `if (outOfFlow)` from the mark) is an equivalent mutant: the unmark loop's own `!outOfFlow` clause undoes the mark within the same call. |
| 5 (identify the scroller by the document) | the page reports the box with its top in document coordinates and the shell subtracts its own document offset | **Yes, both halves.** Placement: W1 (drop the `documentTop` override) kills four tests, W2 (drop `+ window.scrollY` from `documentBox`) kills two, and on the Swift side S1 (drop `− documentOffset` from `expected`) kills the new `scrollerFoundAfterTheDocumentScrolled`, which drives a real web view to a 100 pt document scroll before placing. The re-send round 2 measured is gone too: **probed** in a temporary vitest — the same scroller-anchored layout measured at `scrollY` 0 and at 137 now yields an identical `scroller` box and `sameGeometry === true`, where round 2 measured `y` 80 → −40 and `sameGeometry === false`. |
| 6 (the `PictureInPicture` seam reaches `MediaPlayer`) | what the player reports about picture in picture is held by tests | **The value, not the notification.** Round 2's M20 (S3 here, `pipPossible: true`) now dies on both new tests, and S4 (`MediaPlayer` ignoring the injected factory) dies on `reportsWhatPictureInPictureSays`, so the seam really is wired through. S5 (`isPictureInPicturePossible` dropping `showsVideo &&`) dies on `audioIsNeverOffered` and `startsAndStops`. S6 — the callback that carries an unasked-for change to the page — lives. **Finding 3.** |
| 7 (no CI runs `xcodebuild`) | left as B | Unchanged. `.github/workflows/ci.yml` still has eight `ubuntu-latest` jobs and no `xcodebuild`; the 196 Swift cases run only by hand. |

---

## Trajectory

*Read the fix diffs in order (`c5682441`, `b18b6b13`, `03d43d84`, `f9c45d1e`, `3e9b3745`, `b4f92018`). Does
each round add a branch, a state or a prediction that the round before it also added?*

**No, and round 2's watch item did not come true.**

Round 2 flagged that `VideoSurface` had gained two lifecycle booleans in consecutive commits — `pipStarting`
(`b18b6b13`) and `wasInBackground` (`f9c45d1e`) — and said a third would be the pattern.
**`b4f92018` adds no third flag.** Its whole change to `VideoSurface.swift` is nine lines inside
`findScroller`, converting one coordinate; the stored properties at `VideoSurface.swift:24-38` are exactly
those of `f9c45d1e`. The two-in-a-row is now two-in-three, which is not a trend.

**What `b4f92018` adds**

- One input, `MiniPlayerInputs.shell`, and one early return in `shouldShowMini`. That is a branch, but it is
  a *subtractive* one: it removes a display mode from the shell rather than teaching the geometry to express
  it. Spec §3.8 lists five modes and the shell now has to express four.
- One state, the `hidden` map in `useShellSurface`, and the `openHole` / `closeHole` pair around it. This is
  the round's one genuine addition of state, and it came from a defect the invariants predicted
  (8) rather than from a case the previous round had not anticipated.
- One term in `layoutKey` (`getComputedStyle(frame).position`), which the `hidden` map needs to be refreshed
  on time.

**What `b4f92018` removes**

- A *prediction*, and the important one: round 1's fix made the shell place a `scroller` frame from the live
  scroll view while still **finding** it by a viewport box, so the shell had to guess that the document had
  not moved since the page measured. The page now sends a scroll-invariant coordinate and the shell converts
  it with an offset it reads itself. The contract stops carrying a value whose meaning depends on when it
  was read — the same correction `f9c45d1e` made for placement, now applied to identification.
- A second prediction, by removing a mode: nothing has to predict where the iPad mini player's frame is in
  the shell any more.
- Duplication, in `clipsOverflow` — one rule now has one definition and one test, instead of being reachable
  only through the DOM in an environment that cannot express half of it.
- A false instruction: the `contractVersion` comment that told a later author to bump for a case the code
  does not handle.

Three of the last four commits (`f9c45d1e` partially, `3e9b3745`, `b4f92018`) each replace a prediction about
another component with a measurement or a direct read. `3e9b3745` replaced "WebKit repaints, so clear every
frame" with a measurement; `b4f92018` replaces "the document has not scrolled since the page measured" with
the shell reading its own offset. That is the shape of a loop converging, not one being patched.

The findings this round are, with one exception, about tests that do not hold code that is right — which is
what "the fixes are correct and the loop has run out of behaviour to change" looks like. The exception is
finding 4, which is a page under `docs/` that has been wrong since `03d43d84` and that no round has raised.

---

## Web mutation table

`vitest run` over the suites named per row; the nine-suite baseline is 147 tests.

| id | file | mutation | want | result | killed by |
|---|---|---|---|---|---|
| W1 | shellSurface | `scroller` keeps the viewport box (no `documentTop`) | kill | kill | 4 (`computeSurfaceGeometry` scroller, 3 × `measureSurface`) |
| W2 | shellSurface | `documentBox` drops `+ window.scrollX/Y` | kill | kill | 2 (`reports the scrolling element where it is in the document`, `layout key`) |
| W3 | shellSurface | `layoutKey` drops `getComputedStyle(frame).position` | kill | kill | `leaves only the frame painting while it is out of flow` |
| W4 | shellSurface | `clipsOverflow` accepts `"visible"` (round 2's G9) | kill | kill | `is false only where nothing is clipped` |
| W5 | shellSurface | `clipsOverflow` treats `""` as clipping | kill | kill | 2 (incl. the sticky-against-document case) |
| W6 | shellSurface | `clipsOverflow` reads only the `overflow` shorthand | kill | kill | `is true for every way of clipping, on either axis` |
| W7 | useShellSurface | nothing is ever hidden | kill | kill | `leaves only the frame painting…` |
| W8 | useShellSurface | `mark` is called whether or not the frame is out of flow | kill | live | — (equivalent: the unmark loop's `!outOfFlow` undoes it in the same call) |
| W9 | useShellSurface | the `hidden` unmark loop is deleted | kill | kill | `leaves only the frame painting…` |
| W10 | useShellSurface | `openHole(frame, true, …)` — hide while in flow | kill | kill | `leaves only the frame painting…` |
| W11 | useShellSurface | the `path.has(child)` guard is dropped | kill | **live** | — (finding 7) |
| W12 | useShellSurface | the `child === frame` guard is dropped | kill | kill | `leaves only the frame painting…` |
| W13 | useShellSurface | `closeHole` does not restore `visibility` | kill | **live** | — (finding 6) |
| W14 | useMiniPlayer | `shouldShowMini` ignores `shell` | kill | kill | `returns false inside the iOS shell` |
| W15 | useMiniPlayer | the hook passes `shell: false` | kill | **live** | — (finding 2; also live against `mediaClock.consumers`) |
| W16 | ShellVideoPlayer | the resume point is not applied (round 2's P5) | kill | kill | `starts where the viewer left off, before it plays` |
| W17 | ShellVideoPlayer | the end is not recorded (round 2's P6) | kill | **live** | — (finding 1) |
| W18 | useShellSurface | `mark` re-saves the value every frame | kill | kill | `makes only the frame's ancestors see-through` |
| W19 | useShellSurface | `unmark` always sets rather than removing an empty value | kill | live | — (equivalent: `setProperty(p, "")` removes the declaration) |

## Swift mutation table

Each ran against `-only-testing:LitloftTests/SharedMediaState`, 152 cases at the baseline.

| id | file | mutation | want | result | killed by |
|---|---|---|---|---|---|
| S1 | VideoSurface | `findScroller`'s `expected` drops `− documentOffset` | kill | kill | `scrollerFoundAfterTheDocumentScrolled` |
| S2 | VideoSurface | `documentOffset` drops `adjustedContentInset.top` | live | live | — (equivalent under `viewport-fit=cover`) |
| S3 | MediaPlayer | report `pipPossible: true` (round 2's M20) | kill | kill | `reportsWhatPictureInPictureSays`, `audioIsNeverOffered` |
| S4 | MediaPlayer | build the surface with the default factory, ignoring the injected one | kill | kill | `reportsWhatPictureInPictureSays` |
| S5 | VideoSurface | `isPictureInPicturePossible` drops `showsVideo &&` | kill | kill | `audioIsNeverOffered`, `startsAndStops` |
| S6 | MediaPlayer | `surface.onPictureInPictureChange = nil` | kill | **live** | — (finding 3) |

## Survivors that were meant to survive

- **W8** (`mark` called regardless of `outOfFlow`). The guard is duplicated: the unmark loop at
  `useShellSurface.ts:65-69` restores every marked node while `!outOfFlow`, in the same call, so the mark
  and its removal cancel. Behaviour is identical; only the work differs.
- **W19** (`unmark` calling `setProperty(property, "")` instead of `removeProperty`). CSSOM treats setting
  an empty value as removing the declaration, so the inline style ends in the same state.
- **S2** (dropping `adjustedContentInset.top` from `findScroller`'s document offset). `viewport-fit=cover`
  makes it zero, which the plan already records; the same expression is used in `follow()`
  (`VideoSurface.swift:145`) so the two stay in step by being written the same way.
- The round-2 survivors that this commit does not touch are unchanged and were not re-run: S3, S6, S7, C3,
  C7, M1, P7, P9, P13, P14, V5, V59, V63, V64, G11, S4, S10, S11.

### Survivors that were not meant to survive

- **W11, W13, W15, W17, S6** — each is a finding above.

---

## Checked, not a finding

- **Is `outOfFlow` really "fullscreen", or does it fire during ordinary playback?** It is
  `structure.measurement.fixed` = `isFixed(frame)`, which walks the frame **and its ancestors** for
  `position: fixed`. Checked every wrapper between the frame and `<body>`: `.media-detail-player` is
  `position: sticky` (`globals.css:985-990`), `globals.css` contains no `position: fixed` rule at all, and
  no component under `src/components/FileDetail/` carries a `fixed` class. The one non-fullscreen way it
  could have been true was `MiniPlayerContainer`'s inner wrapper (`fixed right-4 z-40 …`,
  `MiniPlayerContainer.tsx:54`), which is an ancestor of the frame in mini mode — and the same commit turns
  mini mode off in the shell. Worth knowing that the two halves of fix 4 are load-bearing for each other: if
  the mini player is ever re-enabled inside the shell, `isFixed` becomes true in mini mode and `openHole`
  will hide the whole page behind a 320 px corner window.
- **Does native (`requestFullscreen`) fullscreen bypass the hiding?** It would — the frame would keep
  `position: relative` and the browser's opaque `::backdrop` would cover the video. It is not reachable:
  `WKPreferences.isElementFullscreenEnabled` is never set (grep over `ios/` finds only
  `allowsInlineMediaPlayback` in `WebView.swift:9`), so it defaults to off and
  `requestNativeFullscreen` rejects, which is what puts `useFullscreen` on the pseudo path.
- **Does anything the page needs get hidden in fullscreen?** No. The controls, the captions and the
  failure/waiting line are all children of the frame (`ShellVideoPlayer.tsx:218-237`), and `MediaControls`
  uses no portal — `createPortal` appears in `FileActions`, `GlobalSearch`, `MiniPlayerContainer`,
  `SlideshowIntervalMenu` and `QuickNotePresenter`, none of which the player renders.
- **Does the hiding reach everything?** Yes. `path` walks to `<html>` (`parentElement` of `<html>` is
  null), so every element in the document is a descendant of some path member and inherits `hidden` from
  the highest non-path ancestor on its way down.
- **`scroller.x` is still a viewport coordinate.** `documentBox` computes `x + window.scrollX` but
  `computeSurfaceGeometry` takes only `y` from it (`shellSurface.ts:60`), and the shell matches `box.minX`
  against the live frame's `minX`. A horizontally scrolled document would therefore fail to match. Litloft
  has no horizontal document scrolling, and the vertical case is the one spec §2.2 measured; recorded rather
  than raised.
- **`FakePictureInPicture` against the real delegate.** Faithful for the start path: `SystemPictureInPicture`
  fires `onStarting(true)` from `willStart`, then `onStarting(false)` + `onChange()` from `didStart`
  (`PictureInPicture.swift:56-65`), and the fake's `start()` does exactly that in order. `failToStart()`
  matches the `failedToStart` delegate. The one divergence is `stop()`: the fake flips `isActive` and calls
  `onChange` synchronously, where AVKit only calls back from `didStopPictureInPicture`, so `isActive` stays
  true for a while after `stop()` returns. That matters for `showsVideo(_:)`'s `if isPictureInPictureActive
  { pip?.stop() }` and is exactly what the known fact says only a device can settle (R-5). It comes from
  `f9c45d1e`, not from this commit.
- **`PlayerRig`'s default `pictureInPicture: { _ in nil }`** matches the simulator, where
  `SystemPictureInPicture.init?` returns nil because `isPictureInPictureSupported()` is false. Every
  pre-existing `PlayerRig` test therefore runs with `pip == nil` exactly as it did before the parameter was
  added, which is why the 193 → 196 delta is only the three new cases.
- **The spec's §3.4 table now says `scroller` is "スクロール要素のビューポート上の矩形"**, which the code no
  longer does. Deliberate — it is the round-2 finding 5 fix the user triaged as A — and `CLAUDE.md` says a
  spec is not updated after the fact. Not reported as prose.
- **The per-frame cost of the new `layoutKey` term.** `getComputedStyle(frame).position` is read on every
  display frame alongside the existing `getBoundingClientRect()`, so the tick now forces a style resolve as
  well as a layout. Not measured here — `review-workflow.md` says a browser measurement needs a named
  instruction — and it is bounded by one element, but it is the kind of thing §2.2 measured before
  committing to.
- **`openHole` marks a node once and never re-applies.** If React re-renders a hidden sibling and writes its
  own inline `visibility`, `marks.has(node)` is already true so the `!important` is not restored, and the
  element would come back while fullscreen is still on. No path in the app re-renders a sibling of the
  player's ancestors with an inline `visibility`, so this is recorded rather than raised.
- **A node that is hidden and then becomes an ancestor of the frame** stays hidden: the mark loop skips
  `path.has(child)` so it is not re-marked, and the unmark loop keeps it because its parent is on the path.
  Requires the frame to be re-parented while connected and fullscreen, which `useFullscreen`'s doc comment
  says is deliberately never done.
- **Round 2 finding 7 (no `xcodebuild` in CI)** was triaged B and is unchanged; re-derived only far enough
  to confirm `ci.yml` still has no such job.

TOTAL: 7 findings
