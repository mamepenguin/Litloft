# iOS shell Phase 2b — round 2

- Reviewed SHA: `3e9b3745ae35ec4449a14e540a1dbe04de4b90a4`, in a detached worktree that did not move during the
  review. Round 1 saw `develop..b18b6b13`; this round adds `03d43d84` (the web side, Phase 3, previously
  unreviewed), `f173a95c` (two tests), `f9c45d1e` (the round-1 fixes) and `3e9b3745` (the web view's colours
  set once).
- Record read: round 1's findings file `docs/developer-guide/reviews/ios-shell-phase2b/round-1.md` (all 11,
  with the user's triage); the invariants `2026-09-17-ios-native-video-invariants.md` — **1–10 plus 11–15 added
  after round 1**, with the revision record naming which finding prompted each — and 2a's
  `2026-09-16-ios-native-audio-invariants.md` (1–17 and its four revisions); the spec
  `2026-09-17-ios-native-video.md` (§2 measurements, §3, "Checked, no action"); the plan and its handoff notes
  (known survivors V4 and V5, and "Phase 3 のシミュレータ確認で実アプリを使って測る"); `CLAUDE.md`,
  `.claude/rules/review-workflow.md`, `comments.md`, `frontend-conventions.md`, and the watch-history part of
  `design-decisions.md`.
- Fix SHAs read with `git show`, in order: `c5682441`, `b18b6b13`, `03d43d84`, `f173a95c`, `f9c45d1e`,
  `3e9b3745`.
- Baseline before mutating, at `3e9b3745`:
  - `xcodebuild test` (full scheme) → **TEST SUCCEEDED**, 193 test cases passed, 0 failed (180 in round 1).
    The Litloft server on `:3000` was only read.
  - `vitest run` over the eight suites this change touches → 125 passed, 8 files. The wider
    `vitest run src/lib src/hooks src/components/__tests__` → 3108 passed, **5 failed**, all of them the
    addon-checkout detectors (`toolbarMenuHome`, `AddButton.bundledRows`, `FileActions.bundledRows`,
    `FileActions.dialogRow`) that need submodules this worktree does not have. Unrelated, and the same five
    fail on a clean checkout of this worktree.
  - `tsc --noEmit` → clean. `eslint` over the nine changed/added source files → clean.
- Mutations ran one at a time. Each replacement was checked to occur exactly once and to change the file, and
  the file was restored with `git checkout --` after every run. Swift mutations ran against the full scheme;
  web mutations against the eight suites above. Nothing was fixed. The worktree finished clean.
- Every finding is in a file or a function these commits create or change, so each is `[introduced]` unless it
  says otherwise.

## 1. In the shell, nothing holds the video's watch history: neither the resume point nor the record at the end

`[introduced]` (`frontend/src/components/player/ShellVideoPlayer.tsx:196-201`).

**Invariants:** 2b-3 ("動画の視聴位置の保存は web の 1 実装だけが行い、完了時に行を消さず"), 2a-8, and the
`design-decisions.md` rule *"Reaching the end of a media file records the final position; it never deletes the
record."*

Spec §3.1 says the saving, the autoplay and the resume point stay the page's one implementation. In the shell
player that is three lines:

```tsx
const { notifyEnded, notifyReady } = usePlaybackProgress({ mc, fileId: videoId, initialTime });
endedRef.current = () => { notifyEnded(); onEnded?.(); };
readyRef.current = notifyReady;
```

- **P5:** `readyRef.current = notifyReady` → `readyRef.current = async () => {}`. `want=kill`. The suites
  **pass**. A video in the shell would then start from zero instead of the stored position, and — because
  `useShellMedia` chains `channel.play()` behind the ready promise — the autoplay would start at zero with
  nothing to correct it.
- **P6:** drop `notifyEnded()` from the ended handler. `want=kill`. The suites **pass**. Watching a video to
  the end would then write nothing, which is the distinction the design rule exists to keep.

`AudioPlayer.test.tsx` holds both for audio — a `watch history` suite and *"starts an autoplay only after the
resume point is applied"*. `VideoPlayerShell.test.tsx` has neither; its three autoplay tests all assert only
that `media.play` is or is not posted, which P5 leaves true.

---

## 2. The test that decides whether a sticky ancestor really sticks cannot fail in jsdom

`[introduced]` (`frontend/src/lib/shellSurface.ts:99`).

**Invariant:** 7 ("sticky は実際に効くときだけ固定として扱う"). Spec §2.2 measured that getting this wrong
costs 88 pt on Litloft's own file detail.

```ts
const clips = (value: string) => value !== "" && value !== "visible";
```

**Mutation G9:** drop the `&& value !== "visible"` half. `want=kill`. The suites **pass**.

The two halves are for two different environments. In a real browser `getComputedStyle(node).overflow` is
`"visible"` for an ordinary element and never `""`, so `value !== "visible"` is the half that does the work and
`value !== ""` never fires. In jsdom it is the other way round — probed in a temporary suite:
`getComputedStyle(div)` returns `overflow=""`, `overflowY=""`, `overflowX=""`. So every existing test exercises
only the half that a browser never reaches.

With the surviving mutation, `clipperOf` returns the frame's immediate parent for every sticky candidate,
`sticksAgainstScroller` is false, `stickyOf` returns null, and the page reports a plain `document` anchor with
no stick. The video then scrolls away while the page's frame stays stuck — the 88 pt class of error, at full
scroll distance. `measureSurface`'s two sticky tests
(`shellSurface.test.ts`, *"measures a sticky ancestor that sticks against the document"* and *"ignores a sticky
ancestor that sticks against something that does not scroll"*) both pass under it.

The same limit applies to nothing else here: `scrollerOf` uses `/(auto|scroll)/`, which is a positive match and
is held (G7 killed).

---

## 3. The version gate only guards one of the two directions its own comment claims

`[introduced]` (`frontend/src/lib/nativeBridge.ts:120-140`, `ios/Litloft/Bridge/ShellBridge.swift:10-13`).

**Invariant:** 11 (added after round 1).

The shell announces a number and the page refuses anything below its own:

```ts
const REQUIRED_SHELL_VERSION = 2;
export function isNativeShell(): boolean {
  return handler() !== null && shellVersion() >= REQUIRED_SHELL_VERSION;
}
```

That covers *page ahead of shell*, which is what invariant 11 states, and B1/B2/B3 all kill. It does not cover
*shell ahead of page*, and the comment on `ShellBridge.contractVersion` says it does:

> Raised whenever the shell stops understanding what an older page sends, **or starts sending what an older page
> cannot read.**

Neither of those is reachable through `>=`. Setting `window.__litloftShell = { version: 3 }` against this page
gives `isNativeShell() === true`: a shell that had dropped v2 would be treated as current and the page would go
on sending it commands. There is no channel in the other direction either — the page never tells the shell which
version it speaks, so the shell cannot refuse or down-convert. The only thing that catches a v2 page on a
v3 shell is `.unreadable`, and that fires per unrecognised `media.load` rather than at the handshake.

This is reported because the comment is an instruction: a later change that bumps `contractVersion` for the
reason it names would leave every older page still talking. The remedy for the prose half is to delete the
clause that does not hold.

---

## 4. Clearing the frame's ancestors is right only while the frame sits in normal flow

`[introduced]` (`frontend/src/hooks/useShellSurface.ts:28-41`).

**Invariants:** 7 (the video matches the page's frame, for every display mode) and 8 (the page outside the frame
is drawn in the same colours as outside the shell). Spec §3.3 says to clear the frame's ancestors; §3.8 lists
inline, pseudo-fullscreen (`fixed`), theatre, the iPad mini player (`fixed`) and the back swipe as the modes the
geometry has to express.

```ts
for (let node = frame.parentElement; node; node = node.parentElement) {
  …
  node.style.setProperty("background-color", "transparent", "important");
}
```

The video is `webView.insertSubview(view, at: 0)` — beneath everything the page paints — so the video shows
exactly where the page is transparent, and nowhere else. While the frame is in flow, its ancestors are the only
things painting in its rectangle, so clearing them is precisely right. **The moment the frame is taken out of
flow, that stops being true in both directions**, and `ShellVideoPlayer` takes it out of flow in two of the five
modes §3.8 names.

**Too much — an ancestor larger than the frame loses its colour everywhere.** `MiniPlayerContainer`'s anchor is
the frame's ancestor in both modes, and in mini mode it is the placeholder that marks where the player was:

```tsx
className={isMini ? "aspect-video w-full rounded-xl bg-bg-card" : "w-full"}
```

In the dark theme `--bg-primary` is `#1a0e10` and `--bg-card` is `#231216` (`globals.css:63-64`), so the
placeholder should come out as a `--bg-primary` rectangle. The mini player is CSS and not a portal, so the
anchor stays an ancestor and the effect never restores it.

**Not enough — content that is not an ancestor paints over the video.** In pseudo-fullscreen the frame is
`fixed inset-0 z-50` and `useFullscreen` pins the page with `body { position: fixed; overflow: hidden; top:
-scrollY }` — it stops the page scrolling, it does not stop it painting, and nothing keys off
`root.dataset.playerFullscreen` (grepped: only `useFullscreen` writes it, only `useMiniPlayer` reads it). The
file-detail content behind the frame keeps its own backgrounds and is composited above the native video. The
mini player is the same shape at a smaller size: its `bg-black` wrapper *is* an ancestor, so it is cleared, and
whatever the page draws underneath the corner then shows through onto the video.

`useShellSurface.test.tsx` asserts the property that makes this wrong — *"makes only the frame's ancestors
see-through"*, checking that a `header` sibling keeps `rgb(4, 5, 6)`. That is the correct rule for an inline
frame and the wrong one for a frame that covers the viewport.

Not reproduced: jsdom lays nothing out and paints nothing. Confirming it needs the running app (R-5), which the
plan still lists as outstanding — *"シミュレータでの通し（表示、追従、全画面、iPad のミニプレイヤー）"*. Open a
video in the shell, press fullscreen, and scroll far enough to raise the mini player.

---

## 5. The scrolling element is still identified by a box that is only valid at one document scroll position

`[introduced]` (`ios/Litloft/Media/VideoSurface.swift:96-104, 131-135, 192-213`;
`frontend/src/lib/shellSurface.ts:57`).

**Invariant:** 7, the `scroller` anchor.

Round 1's finding 2 was that the shell added the page's reported `scroller` box to every frame, so a document
scroll carried the video away from the page's frame. `f9c45d1e` fixed the **placement**: the shell now reads the
scroll view's live position. It did not follow through to how the shell **finds** that scroll view, which is
still a match against the reported box:

```swift
private func findScroller(matching box: CGRect) -> UIScrollView? { … Self.matches(frame, box) … }
nonisolated static func matches(_ frame: CGRect, _ box: CGRect) -> Bool { let tolerance: CGFloat = 2 … }
```

`scroller.box` is the element's rectangle **in the viewport** at the moment the page measured it. It is the one
field of `SurfaceGeometry` that moves when the document scrolls — the contract (spec §3.4) says everything sent
is scroll-invariant, and `top` is, but the box is not.

**Probed** in a temporary suite, `ios/LitloftTests/ZZProbe2bR2.swift`, on a real web view with a 400 pt
`overflow:auto` element at document y 80 inside a 3,480 pt document, read from the result bundle:

| probe | setup | observed |
|---|---|---|
| r1 | place with the box measured at document scroll 0 | `box=(0, 80, 390, 400)`, **shown**, frame y 280 |
| r2 | the page measures at scroll 60 (`box.y = 20`); the document moves to 120 before the shell places it | **`hidden = true`** — `findScroller` looks for a scroll view at y 20, the live one is at −40, and 60 pt is past the 2 pt tolerance |
| r3 | place again with the box measured at 120 (`box.y = −40`) | **shown**, frame y 160 — the live-position placement from the fix is correct |
| r4 | what the page would report before and after a 137 pt document scroll | `box.y` 80 → −57 |

Once the search misses, `scroller` is nil and `follow()` returns no frame, so the video is hidden. `follow()`
re-searches every 10 frames, but with the same stale box, so it recovers only if the document returns to where
the page measured — or when the page sends a fresh box.

**And it does send one, contrary to the contract.** `computeSurfaceGeometry` copies `m.scroller.box` into the
geometry, so `sameGeometry` sees a difference after any document scroll even though `top` has not moved
(probed in a temporary vitest: `top` 120 both times, `scroller.y` 80 → −40, `sameGeometry === false`).
`layoutKey` hides that — its origin term cancels the document scroll — but `useShellSurface` re-measures every
30 frames regardless, and then posts. So a `scroller`-anchored video posts a `media.surface` about twice a
second while the document scrolls, each post runs a full view-tree walk in `searchForScroller()`, and each one
carries a box that is already one or more frames old.

The two halves hold each other up: the re-send is what keeps the box roughly fresh, and the staleness window is
what the re-send has to keep closing. How much of it a viewer sees depends on whether a Litloft layout has both
a scrolling document and a `scroller`-anchored frame — the file-detail shell layout owns the scrolling itself,
in which case the document does not move and none of this fires. R-5 is where that is settled.

---

## 6. What the shell reports as `pipPossible` is still held by nothing, because the new seam stops short of the player

`[introduced]` (`ios/Litloft/Media/MediaPlayer.swift:62`, `:344`).

**Invariant:** none declared; spec §3.5 says the row is shown only when `pipPossible` is true, so a wrong `true`
offers picture in picture for audio or for nothing.

Round 1's finding 6 had two halves. The page's half is fixed: N2 (`INITIAL.pipPossible = true`, round 1's F3)
is killed by three tests including a new one. The shell's half is not.

**Mutation M20** (round 1's M7): `pipPossible: true` in `MediaPlayer.currentState()`. `want=kill`. The full
Swift scheme **passes**.

`f9c45d1e` introduced `PictureInPicture` precisely so these rules could be held without a system picture in
picture — and it works: V61, V62 and the whole `VideoSurfacePictureInPictureTests` suite depend on it. But the
seam is an argument to `VideoSurface.init`, and `MediaPlayer` builds its surface with the default:

```swift
surface = VideoSurface(player: player)
```

so no `MediaPlayer` test can put a stand-in behind it. On the simulator `pip` is nil, `isPictureInPicturePossible`
is false in every report, and the field the page keys its row on is never observed as anything else.

---

## 7. None of the Swift suite runs anywhere but the author's machine

`[pre-existing]` (`.github/workflows/ci.yml`).

`review-workflow.md`: *"A detector CI does not run is not a detector."*

`ci.yml` has eight jobs — `frontend`, `frontend-shuffled`, `frontend-layout`, `mcp-server`, `backend`,
`bootstrap`, `addon-backends`, `images` — all `runs-on: ubuntu-latest`, and no job invokes `xcodebuild`. The
193 Swift test cases, including the 13 this branch adds to hold the round-1 fixes, run only when someone runs
them by hand.

This is the shape of the iOS shell work from Phase 1 onward, not something these commits introduce, and it is
recorded here rather than acted on. `LocalLitloft.require()` at least fails rather than skips when the server on
`:3000` is absent, so the tests that need it do not quietly pass.

---

## Does each round-1 fix do what it claims?

Read from the fix diffs (`f9c45d1e`, `3e9b3745`) and from mutations against the fixed code, not from the commit
message.

| round 1 | claim | verdict |
|---|---|---|
| 1 (version) | the shell announces a version, the page refuses one behind it, an unreadable load is reported as failed | **Yes, for the direction invariant 11 states.** The user script is registered in `install(in:)`, `isNativeShell` gates on it (B1, B2, B3 killed), `route` returns `.unreadable` for a `media.load` with no or an unknown `kind` (B20 killed), and `MediaState.unreadable` carries `status: .failed` (B23). Both sides assert against `version: 2` in the shared sample. The other direction is **finding 3**. |
| 2 (scroller frames) | the shell places them from the live scroll view, and `stickTop`/`stickLimit` count from the scrolling element | **Yes for placement.** `Offsets.scroller` became `(top, scrolled)` read through `superview.convert(...)` each frame; P2, P4 and V56 hold it, and `scrollerScroll` gained a case where only the element moved. Both sides' sticky arithmetic moved to the scrolling element's frame together (P1, P3, G1, G3 killed; the shared sample's `stickTop` changed 56 → 8). **But the fix did not follow through to how the scroll view is identified** — see finding 5. |
| 3 (failed PiP start off screen) | the layer is given up when a start fails or a PiP ends while the app is away | **Yes.** `wasInBackground` plus `letGoIfStillAway` on every `onChange`; `failedStartLetsGo` and `stoppedOffScreenLetsGo` are new and kill V52, V53 and V54. The premise that `willStart` precedes `didEnterBackground` is still a premise (spec §2.1), not something measured here. |
| 7 (PiP tied to the file) | unloading, navigating or loading another file ends PiP | **Yes, at the one place they all pass through.** `showsVideo(_:)` stops an active PiP first; `unload()` and `stopForNavigation()` both reach it, so document navigation (Lock, 2a-11) does too. `endsWithTheFile` kills V50. What AVKit shows in the PiP window between `stop()` and the item being replaced is still a device question (R-5). |
| 8 (Control Center closes PiP) | only coming back from the background closes it | **Yes.** `becameActive` returns early unless `wasInBackground`; `inactivityKeepsIt` kills V51, `comingBackCloses` kills V52. Note the layer is still re-attached before that guard, which is what keeps a plain resign-active harmless. |
| 4, 5, 6, 10 (tests) | the unplaceable frame, the recognizer, `pipPossible`, stricter sticky validation | **Three of four.** `unplaceableFrameIsHidden` kills V57 (was V37); `picksTheRightRecognizer` kills V58 (was V22) by extracting the name test; `unplaceableSurfaceIsRejected` gained the two both-wrong-type rows that kill B24 (was B4). `pipPossible` is covered on the web side (N2 kills the `INITIAL` mutation, was F3) and on the surface (V61); what `MediaPlayer` **reports** is finding 6. V59 (was V21, `place` not hooking the recognizer up) is still not held: `swipeCarriesTheVideo` calls `swiped(_:)` directly. |
| 9 (background colours) | measured afterwards: WebKit leaves a non-opaque web view's layers alone; the white was the shell's own overscroll colours | **Yes, and the fix is a removal.** `pageDidLoad()` and the per-frame `clearBackgrounds()` are gone; `realPageStaysClear` loads `http://localhost:3000/` and checks the scroll view and `WKContentView` are still clear a second after the load, with nothing clearing them in between. That is the "measure it in the running app" item the plan carried from Phase 2. V29's `underPageBackgroundColor` line is V64, which still survives — round 1's p3 showed the property's default follows `backgroundColor`, which the line beside it sets, so it is most likely an equivalent mutant rather than an untested one. |
| 11 (prose) | the misleading `media.surface` comment is deleted | **Yes**, and the `stickTop`/`stickLimit` doc comment was rewritten to the new convention at the same time. |

---

## Trajectory

*Read the fix diffs in order. Does each round add a branch, a state or a prediction that the round before it
also added?*

**No. This loop is converging, not being patched.**

The branch has had one review round, so the first three commits are the implementation and not fixes:
`c5682441` adds the wire, `b18b6b13` the shell's surface, `03d43d84` the web side. `f173a95c` is tests only.

**`f9c45d1e` adds**

- one state, `wasInBackground`, and one path, `letGoIfStillAway()`, called from every `onChange`;
- one branch in `showsVideo(_:)` — stop picture in picture if it is running;
- one branch in routing — `ShellAction.unreadable` and `MediaState.unreadable`;
- one prediction about the other side — `contractVersion` / `REQUIRED_SHELL_VERSION`, announced through a user
  script and compared in `isNativeShell`.

**`f9c45d1e` removes**

- a branch: `SurfacePlacement.frame`'s three per-anchor `top` expressions collapse into one
  `base + top - scrolled`, with `base` and `scrolled` chosen per anchor. The anchors stop each carrying their
  own arithmetic, and the sticky clamp stops re-deriving the scroller's origin from the geometry;
- a dependency: `VideoSurface` stops being an `AVPictureInPictureControllerDelegate` and stops owning the KVO
  observation. `PictureInPicture` is an interface, so the behaviour moved rather than a flag being added to
  work around AVKit's absence on the simulator.

**`3e9b3745` adds** one test (`realPageStaysClear`) and **removes** a method (`pageDidLoad`), its call site in
`WebView`, and the per-frame `clearBackgrounds()` in `follow()` — that is, it removes the prediction *"WebKit
repaints its own layers on load and keeps doing it, so clear them on every display frame"* and replaces it with
a measurement against a real page of the app's. That is the plan's outstanding V4 item, and the diff is −12/+5.

**What to watch, if there is a third round.** `VideoSurface` now carries two booleans that model the system's
lifecycle rather than read it: `pipStarting` (from `b18b6b13`) and `wasInBackground` (from `f9c45d1e`). Two
consecutive commits each added one, in the same object, for the same reason — AVKit and `UIApplication` deliver
their callbacks in an order the code must anticipate, and on this machine neither can be exercised against the
real thing. The `PictureInPicture` stand-in holds the rules but not the ordering. A third flag in the same place
would be the pattern; two is not yet.

---

## Web mutation table

`vitest run` over `shellSurface`, `vtt`, `nativeBridge`, `nativeMedia`, `nativeMediaController`,
`useShellSurface`, `useShellCaptions`, `VideoPlayerShell` and `AudioPlayer` — 125 tests at the baseline.
"killed by" gives the count and, where it is short, the test.

| id | file | mutation | want | result | killed by |
|---|---|---|---|---|---|
| G1 | shellSurface | scroller `origin` drops `- box.y` | kill | kill | 2 `computeSurfaceGeometry` tests |
| G2 | shellSurface | `viewportTop` ignores `naturalTop` | kill | kill | 2 |
| G3 | shellSurface | `stickTop` drops `frameOffset` | kill | kill | sticky in a scroller |
| G4 | shellSurface | `stickLimit` drops `belowFrame` | kill | kill | stuck frame |
| G5 | shellSurface | anchor always `"document"` | kill | kill | 2 |
| G6 | shellSurface | `fixed` top adds `scrollY` | kill | kill | fixed frame |
| G7 | shellSurface | `scrollerOf` drops `scrollHeight > clientHeight` | kill | kill | measureSurface |
| G8 | shellSurface | `stickyOf` always sticks against the scroller | kill | kill | measureSurface |
| G9 | shellSurface | `clips` accepts `"visible"` | kill | **live** | — (finding 2) |
| G10 | shellSurface | `measureSticky` leaves `position: static` behind | kill | kill | measureSurface |
| G11 | shellSurface | `layoutKey` keys a stuck frame on `rect.y` | kill | **live** | — (equivalent) |
| G12 | shellSurface | `sameGeometry` stops rounding | kill | kill | half-pixel noise |
| G13 | shellSurface | `sameGeometry` always true | kill | kill | 3 |
| G14 | shellSurface | `layoutKey` drops the scroll origin | kill | kill | 2 |
| S1 | useShellSurface | the page colour is sent every frame | kill | kill | page colour |
| S3 | useShellSurface | ancestors that stop being ancestors are not restored | kill | **live** | — |
| S4 | useShellSurface | the frame itself is cleared too | live | live | — |
| S5 | useShellSurface | the first geometry is not forced out | kill | kill | tells the shell where the frame is |
| S6 | useShellSurface | a zero-size frame is sent as geometry | kill | **live** | — |
| S7 | useShellSurface | no periodic structure re-check | kill | **live** | — |
| S8 | useShellSurface | a frame that goes away does not restore its ancestors | kill | kill | see-through ancestors |
| S9 | useShellSurface | teardown does not restore | kill | kill | see-through ancestors |
| S10 | useShellSurface | `frame.isConnected` dropped | kill | **live** | — (equivalent) |
| S11 | useShellSurface | `"important"` dropped from the cleared background | kill | **live** | — |
| S12 | useShellSurface | every frame sends the geometry | kill | kill | 2 |
| V1 | vtt | `cuesAt` ignores the end | kill | kill | 2 |
| V2 | vtt | `seconds` adds instead of multiplying by 60 | kill | kill | parseVtt |
| V3 | vtt | empty and reversed cues kept | kill | kill | parseVtt |
| V4 | vtt | markup is not stripped | kill | kill | 2 |
| V5 | vtt | cues are not sorted | kill | **live** | — (equivalent) |
| V6 | vtt | comma decimals are not read | kill | kill | 2 |
| C1 | useShellCaptions | an unset preference means off | kill | kill | 3 |
| C2 | useShellCaptions | picking a track does not persist | kill | kill | picker |
| C3 | useShellCaptions | the chosen index is not per video | kill | **live** | — |
| C4 | useShellCaptions | the toggle is not per video | kill | kill | toggle |
| C5 | useShellCaptions | captions never report `unavailable` | kill | kill | 2 |
| C6 | useShellCaptions | cues returned while off | kill | kill | stays off |
| C7 | useShellCaptions | a failed fetch is parsed anyway | kill | **live** | — (equivalent) |
| C8 | useShellCaptions | always the first track's URL | kill | kill | picker |
| B1 | nativeBridge | no version check at all | kill | kill | 4 |
| B2 | nativeBridge | required version 1 | kill | kill | 2 |
| B3 | nativeBridge | an unannounced shell counts as current | kill | kill | 2 |
| N1 | nativeMedia | picture-in-picture changes are not announced | kill | kill | 2 |
| N2 | nativeMedia | `INITIAL.pipPossible = true` | kill | kill | 3 |
| M1 | useShellMedia | `file.kind` not a dependency | kill | live | — (equivalent) |
| M2 | useShellMedia | the controller is handed out before the file matches | kill | kill | watch history |
| M3 | useShellMedia | no `unload` on teardown | kill | kill | 3 |
| M4 | useShellMedia | ready always plays | kill | kill | 2 |
| M5 | useShellMedia | a failure is not raised | kill | kill | 2 |
| P1 | ShellVideoPlayer | the stored autoplay choice is ignored | kill | kill | autoplay from the setting |
| P2 | ShellVideoPlayer | the picture-in-picture row always shows | kill | kill | picture in picture |
| P3 | ShellVideoPlayer | the video is loaded as audio | kill | kill | loads the file as video |
| P4 | ShellVideoPlayer | the frame is never reported | kill | kill | where the frame is |
| P5 | ShellVideoPlayer | the resume point is not applied | kill | **live** | — (finding 1) |
| P6 | ShellVideoPlayer | the end is not recorded | kill | **live** | — (finding 1) |
| P7 | ShellVideoPlayer | `getCaptions` always `unavailable` | kill | **live** | — |
| P8 | ShellVideoPlayer | no keyboard shortcuts | kill | **live** | — |
| P9 | ShellVideoPlayer | the picker shows for one track | kill | **live** | — (parity) |
| P10 | ShellVideoPlayer | captions read time 0 | kill | kill | caption for the moment |
| P11 | ShellVideoPlayer | the controller is not handed up | kill | kill | hands its controller |
| P12 | ShellVideoPlayer | failure and waiting are not shown | kill | kill | cannot be loaded |
| P13 | ShellVideoPlayer | `setCaptions` does nothing | kill | **live** | — |
| P14 | ShellVideoPlayer | the pseudo-fullscreen class is dropped | live | live | — (jsdom) |
| VP1 | VideoPlayer | the shell branch is never taken | kill | kill | 11 |

## Swift mutation table

Each ran against the full scheme (193 cases at the baseline). "Killed by" lists the failing test functions.

| id | file | mutation | want | result | killed by |
|---|---|---|---|---|---|
| P1 | SurfacePlacement | stick top ignores the anchor's base | kill | kill | stickyInScroller |
| P2 | SurfacePlacement | `base = 0` for a scroller | kill | kill | followsAScrollingElement, lateScrollerIsFound, scrollerScroll, stickyInScroller |
| P3 | SurfacePlacement | stick limit ignores the anchor's base | kill | kill | stickyInScroller |
| P4 | SurfacePlacement | a scroller scrolls with the document | kill | kill | followsAScrollingElement, scrollerScroll, stickyInScroller |
| V50 | VideoSurface | `showsVideo` does not stop picture in picture | kill | kill | endsWithTheFile |
| V51 | VideoSurface | `becameActive` closes it without a background trip | kill | kill | inactivityKeepsIt |
| V52 | VideoSurface | `enteredBackground` does not record the trip | kill | kill | comingBackCloses, failedStartLetsGo, stoppedOffScreenLetsGo |
| V53 | VideoSurface | `letGoIfStillAway` does nothing | kill | kill | failedStartLetsGo, stoppedOffScreenLetsGo |
| V54 | VideoSurface | `onChange` does not call `letGoIfStillAway` | kill | kill | failedStartLetsGo, stoppedOffScreenLetsGo |
| V55 | VideoSurface | `letGoIfStillAway` drops its `wasInBackground` guard | live? | kill | inactivityKeepsIt |
| V56 | VideoSurface | the scroll view's live position is read as 0 | kill | kill | followsAScrollingElement, lateScrollerIsFound |
| V57 | VideoSurface | an unplaceable frame is not hidden (was V37) | kill | kill | unplaceableFrameIsHidden |
| V58 | VideoSurface | recognizer name `"NoSuchRecognizer"` (was V22) | kill | kill | picksTheRightRecognizer |
| V59 | VideoSurface | `place` does not call `followSwipe()` (was V21) | kill | **live** | — |
| V60 | VideoSurface | `refresh` does not clear the backgrounds | kill | kill | backgroundsStayClear, realPageStaysClear, repaintingIsUndone |
| V61 | VideoSurface | `isPictureInPicturePossible` ignores `showsVideo` (was V34) | kill | kill | startsAndStops |
| V62 | VideoSurface | the background guard ignores `pipStarting` (was V31) | live? | kill | failedStartLetsGo |
| V63 | VideoSurface | `setPictureInPicture` ignores `showsVideo` (was V35) | kill | **live** | — |
| V64 | VideoSurface | drop the `underPageBackgroundColor` line (was V29) | kill | **live** | — (equivalent; round 1's p3) |
| B20 | ShellBridge | an unreadable load is dropped, not reported | kill | kill | loadNeedsAKind, unreadableLoadIsReported |
| B21 | ShellBridge | `contractVersion = 3` | kill | kill | versionIsTheSharedOne |
| B22 | ShellBridge | the announcing user script is not installed | kill | kill | versionIsTheSharedOne |
| B23 | ShellMessage | `unreadable` reports `loading`, not `failed` | kill | kill | unreadableLoadIsReported |
| B24 | ShellBridge | the `(nil, nil)` stick guard removed (was B4) | kill | kill | unplaceableSurfaceIsRejected |
| M20 | MediaPlayer | report `pipPossible: true` (was M7) | kill | **live** | — (finding 6) |
| M21 | MediaPlayer | every load shows video (was M1) | kill | kill | audioIsNotShown |

## Survivors that were meant to survive

- **G11** (`layoutKey` keying a stuck frame on its viewport y). The mutation makes the structure re-measure on
  every scroll while the frame is stuck, but what that produces is scroll-invariant, so `sameGeometry`
  suppresses the send. It costs two forced layouts a frame and changes nothing observable.
- **S4** (clearing the frame itself as well as its ancestors). The frame has to be see-through anyway.
- **S10** (`frame.isConnected`). React nulls the ref on unmount, so the extra test is belt and braces.
- **S11** (dropping `"important"` from the cleared background). An inline style already beats a Tailwind
  utility, and the priority is round-tripped through `restore`.
- **V5** (`parseVtt` not sorting). Equivalent for a VTT whose cues are already in order, which is what both
  producers emit.
- **C7** (parsing a failed fetch's body). A 404 page has no line matching the timing regex, so it yields no
  cues either way.
- **M1** (`file.kind` as an effect dependency). A file's id and kind change together.
- **P9** (the picker's `tracks.length > 1`). It matches the browser's `if (tracks.length <= 1) return null`;
  changing it would break that parity.
- **P14** (the pseudo-fullscreen class). jsdom lays nothing out — `review-workflow.md` "What a test here cannot
  hold".
- **V5 (Swift, from the plan)** — dropping `adjustedContentInset.top`. Equivalent under `viewport-fit=cover`.
  Not re-run.
- **V64** (the `underPageBackgroundColor` line). Round 1's p3 measured that the property's default follows
  `backgroundColor`, which the line beside it sets, so this is most likely an equivalent mutant. `3e9b3745`
  measured the neighbouring question — whether WebKit repaints — and not this one.
- **V62 and V55 were declared `live?` and both died.** The `PictureInPicture` stand-in reaches further than
  round 1's simulator could: the `pipStarting` guard (round 1's V31) and `letGoIfStillAway`'s own guard are now
  held. Round 1's V33 has no counterpart here, since `becameActive`'s stop is what `comingBackCloses` asserts.

### Survivors that were not meant to survive, and are not findings on their own

These are holes, not defects. Each is listed here rather than as a finding because no path in the app was found
that reaches it.

- **S3.** Ancestors that stop being ancestors while the frame stays connected are never restored. Nothing in the
  app moves the frame between ancestors without remounting the effect, whose cleanup covers it; the mini player
  is CSS and not a portal, so the chain does not change there either.
- **S6.** A frame that collapses to zero size while still connected is reported as a zero-size geometry, which
  the bridge rejects whole (round 1's B3) rather than clearing — leaving the video where it last was instead of
  hidden. The guard is what turns that into `setSurface(null)`.
- **S7.** Without the 30-frame structure re-check, a change of structure that does not move the frame — an
  ancestor becoming or ceasing to be a scrolling element as content loads — is never noticed. It is also what
  keeps a `scroller` box fresh (finding 5).
- **C3.** The chosen track index is not tied to the video in the mutation, so a track picked on one file would
  carry to the next.
- **P7 and P13.** Neither direction of the controller's captions wiring (`getCaptions` / `setCaptions`) is held
  in the shell player. The preference path (`enabled ?? preferred`) is, and it is what both caption tests go
  through, so turning captions off still works; the per-video toggle does not reach a test.
- **P8.** `useVideoShortcuts` in the shell player is held by nothing.
- **V59** (round 1's V21). `place()` hooking the surface onto the back-swipe recognizer is still untested;
  `swipeCarriesTheVideo` calls `swiped(_:)` directly, and `picksTheRightRecognizer` tests the name predicate.
  The hookup between them — that a recognizer is found on a web view with `allowsBackForwardNavigationGestures`
  — has no test, and its failure is silent. Round 1 reported this as finding 5 and the fix covered the other
  half.
- **V63** (round 1's V35). `setPictureInPicture` ignoring `showsVideo` survives although a stand-in is now
  available. A `media.pip {active: true}` about a loaded audio file would start picture in picture on it. The
  page does not send one — the row needs `pipPossible`, which needs `showsVideo` — and after an unload the
  `loadId` check drops it first.
## Checked, not a finding

- **Server rendering and invariant 2.** `VideoPlayer` picks its implementation during render from
  `isNativeShell()`, which is false on the server, so a naive reading says the shell's first paint would carry a
  `<video src>` that loads alongside the shell's own load. It does not: `FileDetailContainer` returns early
  while `file` is null and fetches the file on the client, so no player is in the server HTML at all. There is
  no double load and no hydration mismatch. `AudioPlayer` has branched on `isNativeShell()` the same way since
  2a.
- **A 2b shell against a 2a server plays nothing, by design.** Every `media.load` from a 2a page lacks `kind`,
  so every file comes back `failed` and is shown as failed instead of hanging. That is invariant 11's second
  clause and round 1's finding 1; B1 in round 1 made "missing `kind` defaults to audio" a kill on purpose.
- **The contract version is held three ways.** `versionIsTheSharedOne` compares the shared sample's `version`
  to `ShellBridge.contractVersion` and to the string the injected user script carries; the TS test asserts that
  `contract.version` is accepted and `contract.version - 1` is refused, which ties it to
  `REQUIRED_SHELL_VERSION`. Bumping any one of the three alone fails.
- **Detector rules.** `everyCommandIsCovered` and `everyStateIsCovered` compare against a declared set rather
  than one derived from the file (rule 5), and `popup-dismissal`'s source count moved 437 → 443 — exactly the
  six files these commits add (rule 1). Neither reads source as text.
- **Watch history at the wire (2a-8, 2b-3).** Nothing here touches `/progress`, and 2a-9 is untouched:
  `duration` still goes through `finiteSeconds`. The web side is finding 1.
- **Caption timing.** The shell's tick is `CMTime(1, 4)` and `mediaClock` polls at 250 ms while playing, so a
  caption can be up to about half a second out. No invariant sets a bound; this is an R-5 judgement.
- **The captions preference stays three-valued (invariant 9).** `useShellCaptions` reads
  `useCaptionsPreference` (null / true / false) and writes only when the viewer picks a track — the same place
  the browser's `SubtitleTrackPicker` writes. `on = (enabled ?? preferred) !== false`, so an unset preference
  shows the default track, which is what `<track default>` does (C1 kills the alternative). The controls'
  toggle persists through `MediaControlsContainer` in both players.
- **The subtitle picker's threshold.** `captions.tracks.length > 1` matches the browser's
  `if (tracks.length <= 1) return null`. P9 survives; changing it would break that parity rather than fix
  anything.
- **The shell frame has no `bg-black`** where the browser's frame does. Deliberate — the frame must be
  see-through — and `VideoSurface.view.backgroundColor = .black` supplies the letterbox behind it.
- **The page colour is never given back.** Once `page.background` arrives the web view keeps it, and the scroll
  view and `WKContentView` stay `.clear` after `showsVideo(false)`; nothing restores `.systemBackground`.
  Invariant 8's "枠が無くなったら透明化を戻す" is satisfied on the page's side (`useShellSurface`'s `restore`,
  S8 and S9 killed), and spec §4 already carries the stale-colour-after-a-theme-change case as out of scope.
- **Stale ids (invariant 10).** Unchanged from round 1: `.surface` and `.pip` pass the same
  `commandLoadId != loadId` check, and the bridge requires a `loadId` for both.
- **`x` is never corrected for horizontal scrolling.** The contract carries no horizontal offset, so a
  scrolling element that scrolls sideways would drift in x. `alwaysBounceHorizontal = false` on the main scroll
  view, and the spec does not cover it.
- **The back swipe snaps back.** `swiped(_:)` sets `swipe = 0` for every state but `.began`/`.changed`, so on a
  completed back gesture the video returns to its place at once while the page snapshot is still animating out,
  and the navigation then unloads it. Not measurable here.
- **Test doubles against §2.** `FakePictureInPicture` matches `SystemPictureInPicture`'s callback order on
  every path it models: `start()` = `willStart`, `didStart`, `onChange`; `failToStart()` = `failedToStart`;
  `stop()` = `didStop`; `startAutomatically()` = `willStart` alone, which is what an inline automatic start
  sends (spec §2.1, §2.2). Its `isPossible` is fixed true, which only makes the `showsVideo` gate load-bearing
  (V61). One divergence, harmless to what it asserts: `comingBackCloses` sets `pip.isActive = true` by hand
  without the matching `onStarting(false)`, so `pipStarting` stays true there where the real controller would
  have cleared it. `ParallaxTransitionPanGestureStub` is named for the string the surface matches and overrides
  only `state` and `translation(in:)`, which is all `swiped(_:)` reads. No double emits anything neither AVKit
  nor UIKit would.
- **The shared sample's geometry is not cross-checked against its producer.** The TS test round-trips the
  sample's `geometry` objects through `setSurface` and asserts the posted bodies equal them; the Swift test
  parses the same bytes. So both sides agree on the wire, but neither asserts that `computeSurfaceGeometry`
  would emit those numbers. Every field is one the producer sets, the sample includes the explicit
  `scroller: null` / `stickTop: null` / `stickLimit: null` the producer always writes, and `surfaceSticky`'s
  `stickTop` was moved to the new convention in the fix — so this is not a shape neither side produces.
- **`fixed` with a stick.** Still accepted by the bridge and still never sent: `computeSurfaceGeometry` returns
  `stickTop: null` on the `fixed` branch before any sticky measurement.
- **The iOS suite never runs in CI.** Recorded as finding 7 rather than here, because it is the only reason
  every Swift result above is a statement about one machine. `LocalLitloft.require()` uses `try #require`, which
  fails rather than skips, so `realPageStaysClear` and the `MediaPlayerTests` that stream do not quietly pass
  with the server down.
- **Prose.** `nativeBridge.ts:19-25`'s doc comment about `loadId`/`seekId` still sits above `MediaKind` rather
  than above `MediaCommand`, as round 1 noted. It misplaces the explanation but would not lead to a wrong code
  change. Not reported beyond this line. Finding 3 is the one comment that would.
- **Worktree.** Clean at the end (`git status --short` empty, HEAD `3e9b3745`). The probe file was removed,
  `swiftlint lint --quiet` is clean, and the full Swift scheme and the eight web suites are back at their
  baselines.

TOTAL: 7 findings
