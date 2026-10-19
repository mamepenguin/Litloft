# iOS shell Phase 2b — round 1

- Reviewed SHA: `b18b6b1377f676a83da1c72a24a3c162bd86ec55`, in a detached worktree that did not move during the
  review. The change is `develop..b18b6b13`: `c5682441` (the wire: `kind`, `media.surface`, `media.pip`,
  `page.background`, `pip`/`pipPossible`) and `b18b6b13` (the shell: `SurfacePlacement`, `VideoSurface`, background
  detach, PiP, and the wiring in `MediaPlayer` and `WebView`). The web side that sends `media.surface` (Phase 3) is not
  in this SHA and was not reviewed.
- Record read: the spec `2026-09-17-ios-native-video.md` (§2 measurements, §3.2–§3.5, §6, "Checked, no action"); the
  invariants `2026-09-17-ios-native-video-invariants.md` (1–10) and `2026-09-16-ios-native-audio-invariants.md` (1–17
  and the revision record); the plan and its handoff notes (known survivors V4 and V5); `round-5.md` of Phase 2a for
  style; `CLAUDE.md`, `review-workflow.md`, `comments.md`, `frontend-conventions.md`, `design-decisions.md` (watch
  history); hako `NxZ6EllvfImX4J428b0z_`, `wtomi6iPEEEFvM8SZNEz3`, `5d5y85GwzX9Csk_TakU8I`, and a search for any
  decision about contract versioning (none found).
- Baseline before mutating:
  - `xcodebuild test` (full scheme) → **TEST SUCCEEDED**, 180 test cases passed, 0 failed, about 120 s. The
    Litloft server on `:3000` was only read.
  - `vitest run src/lib` → 934 passed. `tsc --noEmit` → clean. `eslint src/lib` → clean. `swiftlint lint --quiet`
    → clean.
- Mutations ran one at a time, each against the full Swift scheme (or `vitest run src/lib
  src/components/__tests__/AudioPlayer.test.tsx`, 958 tests, for the web ones). Each replacement was checked to
  match exactly once and to change the file, and the file was restored with `git checkout` after each run.
- Probes used a temporary test file, removed before the end. Nothing was fixed. The worktree finished clean.
- Every finding below is in a file or function these two commits create or change, so each is `[introduced]` unless
  it says otherwise.

### Probe results used below

These ran in a temporary suite, `ios/LitloftTests/ZZProbe2b.swift`, with
`-only-testing:LitloftTests/SharedMediaState/ZZProbe2b`. Results were read from the result bundle.

| probe | setup | observed |
|---|---|---|
| p1 | `VideoSurface` on a real web view, `showsVideo(true)`. The delegate's `willStart` is called (with a stand-in controller, since the simulator has none), then `didEnterBackground` is posted, then `failedToStart` is called | `playerLayer.player` still attached after the background notification, **and still attached after the failure**. `pipStarting == false` |
| p2 | a 400 pt `overflow:auto` element at y 80, inside a document 3,480 pt tall. `place(.scroller(box), top: 200)`, then the **document** is scrolled by 100 | before: frame y 280 (correct). After: the element's box is at y −20, so the page's frame is at 180. **The video stays at 280, shown** |
| p3 | `setPageColor`, then `underPageBackgroundColor = nil` (the state mutation V29 leaves), then a page loads with body `""`, `background:#00ff00` or `background:transparent` | `underPageBackgroundColor` equals the page colour before and after the load in all three cases, because its default follows `backgroundColor` |
| p4 | `SurfacePlacement.frame` for `anchor: .fixed, top: 0, stick: (0, 100)`, height 219 | `y = −119` (the bridge accepts this shape) |

---

## 1. Neither side of the wire can tell which version the other side is, and requiring `kind` makes a mismatch fail silently

`[introduced]` (`ios/Litloft/Bridge/ShellBridge.swift:202`, and `c5682441` as a whole).

**Invariant:** 2a-15 ("a failed load is reported to the web and shown; nothing waits for good on a failed item").
2b-1 and 2b-2 are also at stake in the other direction.

The app is built from this repository (`docs/user-guide/ios-app.md`), and the server is updated with `git pull`.
The two are updated separately, so a shell and a page from different commits is a normal state. The contract has no
version: `ping`/`pong` carries only `seq`.

- **New shell, older page** (a server at `develop`, which sends no `kind`). `route` returns `nil` for every
  `media.load`, which `loadNeedsAKind` asserts on purpose (`ShellBridgeVideoTests.swift:31`). The load is only
  logged as "dropped an unroutable message". No `media.state` follows, so the channel stays `loading`.
  `useShellAudio` and `MediaChannel` have no timeout (grep for `setTimeout`/`timeout` in `nativeMedia.ts` and
  `useShellAudio.ts` finds none). Audio in the shell then shows loading for good, with no failure display. Before
  this change, the same page played.
- **Older shell (2a), newer page** (Phase 3). The 2a shell ignores `kind` and accepts a video load. The page draws
  only a frame and no `<video>`, and the 2a shell has no surface. The result is sound with no picture. Nothing in the
  wire lets the page notice this and fall back to its own element.

Only the first case can be reproduced at this SHA, and it is reproduced by the existing test above. The second is
read from the 2a code (`develop:ios/Litloft/Bridge/ShellBridge.swift`, `source(_:server:)`, which reads no `kind`) and
from spec §3.1/§3.7.

---

## 2. A `scroller` frame goes wrong once the document scrolls, because the scroller's box is not scroll-invariant

`[introduced]` (`ios/Litloft/Media/SurfacePlacement.swift:28`, `ios/Litloft/Media/VideoSurface.swift:89-93`).

**Invariant:** 7 (the video matches the page's frame every frame, `scroller` included).

The contract (spec §3.4) says the web sends only values that do not change with scrolling, and sends nothing on
scroll. `scroller` is "the scrolling element's box in the viewport", and the shell adds `box.minY` to every frame.
That box moves whenever the document itself scrolls. The shell only re-reads it when the page re-sends the geometry.

**p2:** with a scrolling element inside a scrolling document, a 100 pt document scroll leaves the video 100 pt below
the page's frame, visible (`frameAfter=280`, page frame at 180). No test holds this: every scroller test uses a
document that cannot scroll, or does not scroll it.

Whether a Litloft page reaches this depends on the Phase 3 layouts that choose `scroller`, which are not in this SHA.
The shell does already find the child scroll view whose live frame it matches against (`findScroller`), and it
reads that view's offset each frame. It does not read that view's position.

---

## 3. A picture-in-picture start that fails while the app is off screen leaves the layer attached, so the sound stops

`[introduced]` (`ios/Litloft/Media/VideoSurface.swift:256-259`, `308-316`).

**Invariant:** 5 (off screen and not in PiP, the sound goes on).

`enteredBackground` skips the detach while `pipStarting` is true. The guard exists because the automatic start's
`willStart` arrives before `didEnterBackground`. If that start then fails (`failedToStartPictureInPictureWithError`),
the delegate clears `pipStarting` and reports, but it detaches nothing. The app is now off screen, not in PiP, and
the player is still on a layer. Spec §2.2 measured that the system pauses a player in exactly this state.

**p1** shows the state: attached after the background notification, and still attached after the failure. Whether
the pause follows can only be checked on a device (R-5). The ordering of `willStart` before `didEnterBackground` is
the premise of the existing guard, not something measured here. The same gap applies to a PiP that starts and then
stops while the app is still off screen. Nothing re-detaches there either (`pictureInPictureControllerDidStopPictureInPicture`,
line 318).

V31 and V41 (the `pipStarting` guard and its setter) survive, as expected on the simulator. So nothing here is held
by a test.

---

## 4. A shown video whose frame becomes unplaceable is left at its old position, and no test notices

`[introduced]` (`ios/Litloft/Media/VideoSurface.swift:149-151`).

**Invariant:** 7.

**Mutation V37:** remove `view.isHidden = true` from `follow()`'s `frame == nil` branch. `want=kill`. The full
suite **passes**.

`unknownScrollerHides` places an unfindable scroller on a surface that was never shown, so the view is hidden
regardless. The case the branch exists for is a video already on screen whose page then moves the frame into a
scroller the shell has not found yet, or whose scroll view has been released (the reference is weak). Under V37 the
video stays where the previous frame was, over unrelated page content, until the scroller turns up.

---

## 5. The back-swipe hookup is untested, so the named WebKit dependency can break unseen

`[introduced]` (`ios/Litloft/Media/VideoSurface.swift:98`, `213-225`).

**Invariant:** 7 ("back swipe").

- **V21:** remove the `followSwipe()` call from `place`. `want=live` (declared as a known gap). The suite **passes**.
- **V22:** match `"NoSuchRecognizer"` instead of `"ParallaxTransition"`, which is what an iOS update renaming
  `_UIParallaxTransitionPanGestureRecognizer` would do. `want=live`. The suite **passes**.

Only `SurfacePlacement`'s arithmetic for a given `swipe` is tested (`SurfacePlacementTests.swift:70-74`). Nothing
checks that a recognizer is found on a web view with `allowsBackForwardNavigationGestures`. The failure is silent: the
page snapshot slides and the video stays put.

The other two WebKit dependencies are held. V23 (`WKContentView` by name) is killed by `backgroundsStayClear` and
`repaintingIsUndone` through their `#require`. Child scroll views being missing or unmatched is killed through V25 and
V26 by `followsAScrollingElement` and `lateScrollerIsFound`, and in that case the design falls back to silence (no
video, sound continues).

---

## 6. What the shell reports as `pipPossible`, and what the page assumes before any report, are not held

`[introduced]` (`ios/Litloft/Media/MediaPlayer.swift:344`, `frontend/src/lib/nativeMedia.ts:44`).

**Invariant:** none declared. Spec §3.5 says the PiP row is shown only when `pipPossible` is true, so a wrong
`true` offers PiP for audio or for nothing.

- **M7:** `pipPossible: true` in `MediaPlayer.state()`. `want=kill`. The Swift suite **passes**. The only
  "never offered for audio" test reads `VideoSurface.isPictureInPicturePossible`, not the report.
- **F3:** `INITIAL.pipPossible = true`. `want=kill`. `vitest` (958) **passes**.

On the simulator `pip` is nil, so `pipPossible` is false in every report. A test that reads the report for an audio
load would hold M7 there too.

---

## 7. Picture in picture is not tied to the file: unloading, Lock, or an audio load leave it running, and the page can no longer close it

`[introduced]` (`ios/Litloft/Media/VideoSurface.swift:78-85`, `270-281`). This was read from the code and **not
reproduced**. The simulator has no PiP.

**Invariants:** 10 (commands for another file do nothing) and 2a-11 (Lock stops playback). Both are about this
boundary, but neither states it.

`showsVideo(false)`, which `unload()` and every audio load call, hides the inline view and does not stop PiP. After
that:

- `setPictureInPicture` returns early on `!showsVideo`, so a `media.pip {active: false}` from the page does nothing.
- `pipPossible` reports false, so a page following spec §3.5 hides the row that would close it.
- `pip` is still reported true.

What AVKit shows in the PiP window after `replaceCurrentItem(with: nil)` (unload, Lock) or with an audio item is not
known from the spike. R-5 would need to try: PiP, then Lock. And: PiP, then open an audio file.

---

## 8. A picture in picture started from the page in the foreground is closed by any return to active, such as Control Center

`[introduced]` (`ios/Litloft/Media/VideoSurface.swift:261-266`). Read from the code and **not reproduced**.

**Invariant:** 6 says returning to the app closes PiP. The spike measured that path from the home screen (§2.2).
`didBecomeActive` also fires after transient interruptions that never left the app: Control Center, Notification
Center, a system alert. Under the code, a PiP the viewer started from the settings row (§3.5, a foreground start)
closes the first time any of these is dismissed. Whether that is intended is a design question. It is listed here
because invariant 6 does not separate "came back from the background" from "became active again".

---

## 9. Three of the background-colour lines survive because the test environment cannot tell them apart

`[introduced]` (`ios/Litloft/Media/VideoSurface.swift:110-112`, `148`, `170`).

**Invariant:** 8.

- **V42** (the per-frame `clearBackgrounds()` in `follow()`) is the known V4. It survives, as declared.
- **V39:** `pageDidLoad()` does nothing. `want=kill`. The suite **passes**. The harness does not reproduce the
  repaint on load that §2.2 measured, the same limit as V4. `backgroundsStayClear`'s check of
  `webView.backgroundColor` after the load passes without the call.
- **V29:** the `underPageBackgroundColor` line is removed. `want=kill`. The suite **passes**. p3 shows why: with
  the property unset, its default follows `backgroundColor`, which the neighbouring line already sets. So
  `backgroundsStayClear`'s `underPageBackgroundColor` assertions (lines 112 and 120) pass without the line under
  test. Whether a real Litloft page, whose `html`/`body` Phase 3 makes transparent, changes that default was not
  measured.

These belong with V4's "measure in the running app" item.

---

## 10. A `stickTop`/`stickLimit` pair of wrong types is read as "not sticky"

`[introduced]` (`ios/Litloft/Bridge/ShellBridge.swift:164-167`).

**Invariant:** none declared. This is wire validation of the kind `unplaceableSurfaceIsRejected` holds.

**Mutation B4:** remove the `(nil, nil)` guard. `want=kill`. The suite **passes**. With the guard removed,
`stickTop: "56", stickLimit: "900"` (or any other non-number, non-null pair) is accepted as a frame with no stick.
The test list has only one-sided and number/string mixes, and those land in `default`.

---

## 11. The TypeScript comment on `media.surface` describes a message the shell drops

`[introduced]` (`frontend/src/lib/nativeBridge.ts:62`). This is prose, and it is reported only because it would lead
to a wrong code change.

`/** No \`geometry\` means the page shows no frame for the video. */` The shell treats a missing `geometry` as
malformed and drops it (`ShellBridge.swift:115-116`, held by `missingGeometryIsNotNull`). Only `geometry: null`
means "no frame". A reader following the comment and omitting the field to clear the frame would leave the video
showing. The type already says `SurfaceGeometry | null`. The remedy is to delete the comment.

## Is anything missing from the 2b invariant list?

Asked once, in this round, as `review-workflow.md` R-0 prescribes. These are candidates for the supervisor or the
user. None was added here.

1. **A shell and a page from different commits.** Nothing states what happens then (finding 1). A candidate: *"A
   shell and a page that do not share the contract version fall back to the page's own media element, or report
   a failure. Neither waits for good."*
2. **PiP belongs to the file.** *"Unloading, Lock, or loading another file ends PiP, and while PiP is on the page
   can always end it"* (finding 7). Invariant 10 covers only stale ids.
3. **Lock while in PiP.** Invariant 5 excludes PiP, and invariant 4 covers only going home. Whether the sound goes
   on when the phone is locked with PiP already showing is not stated. It can only be checked on a device.
4. **A transient loss of active that is not a trip to the background** (Control Center and the like). Invariant 6
   applies to both as written (finding 8).
5. **A frame that cannot be placed is not shown.** This is implied by 7, but a separate sentence would make V37's
   survival (finding 4) an obvious A.

---

## Mutation table

Swift mutations ran against the full scheme (180 cases). Web mutations ran with `vitest run src/lib
src/components/__tests__/AudioPlayer.test.tsx` (958). "Killed by" lists the failing test functions.

| id | file | mutation | want | result | killed by |
|---|---|---|---|---|---|
| S1 | SurfacePlacement | document: `top + scrolled` | kill | kill | documentScroll, followsTheDocument, stickyInDocument |
| S2 | SurfacePlacement | scroller: drop `box.minY` | kill | kill | followsAScrollingElement, lateScrollerIsFound, scrollerScroll, stickyInScroller |
| S3 | SurfacePlacement | scroller: unknown offset → 0 instead of nil | kill | kill | lateScrollerIsFound, unknownScrollerHides, unknownScrollerIsNotPlaced |
| S4 | SurfacePlacement | fixed: subtract the document offset | kill | kill | fixedFrame |
| S5 | SurfacePlacement | stick: drop `max(top, stick.top)` | kill | kill | stickyInDocument, stickyInScroller |
| S6 | SurfacePlacement | stick: drop the `min(…limit…)` | kill | kill | stickyInDocument, stickyInScroller |
| S7 | SurfacePlacement | stick base `{ _ = box; 0 }` | kill | build failure (not counted) | — |
| S7b | SurfacePlacement | stick base `box.minY * 0` | kill | kill | stickyInScroller |
| S8 | SurfacePlacement | ignore `swipe` | kill | kill | swipe |
| V20 | VideoSurface | `showsVideo` keeps the old geometry | kill | kill | nextFileStartsHidden, showsOnlyAPlacedVideo |
| V21 | VideoSurface | `place` does not call `followSwipe()` | live | live | — (finding 5) |
| V22 | VideoSurface | recognizer name `"NoSuchRecognizer"` | live | live | — (finding 5) |
| V23 | VideoSurface | `isContentView` matches `"WKContentViewRenamed"` | kill | kill | backgroundsStayClear, repaintingIsUndone |
| V24 | VideoSurface | `findScroller` does not exclude the main scroll view | live | live | — |
| V25 | VideoSurface | match tolerance 0 | kill | kill | followsAScrollingElement, lateScrollerIsFound |
| V26 | VideoSurface | `follow` never searches again | kill | kill | lateScrollerIsFound |
| V27 | VideoSurface | `place` re-searches only on a new box | live | live | — |
| V28 | VideoSurface | clear WebKit's layers with no video | kill | kill | backgroundsStayClear |
| V29 | VideoSurface | drop the `underPageBackgroundColor` line | kill | **live** | — (finding 9) |
| V30 | VideoSurface | background does not detach | kill | kill | backgroundDetaches |
| V31 | VideoSurface | background guard ignores `pipStarting` | live | live | — (simulator has no PiP) |
| V32 | VideoSurface | `becameActive` does not reattach | kill | kill | backgroundDetaches |
| V33 | VideoSurface | `becameActive` does not stop PiP | live | live | — (simulator) |
| V34 | VideoSurface | `isPictureInPicturePossible` ignores `showsVideo` | live | live | — (simulator) |
| V35 | VideoSurface | `setPictureInPicture` ignores `showsVideo` | live | live | — (simulator) |
| V36 | VideoSurface | `refresh` does not hide when not visible | kill | kill | nextFileStartsHidden, showsOnlyAPlacedVideo, videoIsShown |
| V37 | VideoSurface | `follow` does not hide an unplaceable frame | kill | **live** | — (finding 4) |
| V38 | VideoSurface | `visible` ignores geometry | kill | kill | nextFileStartsHidden, showsOnlyAPlacedVideo |
| V39 | VideoSurface | `pageDidLoad` does nothing | kill | **live** | — (finding 9) |
| V40 | VideoSurface | display link never runs | kill | kill | followsAScrollingElement, followsTheDocument, lateScrollerIsFound |
| V41 | VideoSurface | `willStart` does not set `pipStarting` | live | live | — (simulator) |
| V42 | VideoSurface | no per-frame `clearBackgrounds()` (= V4) | live | live | — (known) |
| M1 | MediaPlayer | every load shows video | kill | kill | audioIsNotShown |
| M2 | MediaPlayer | unload does not hide | kill | kill | videoIsShown |
| M3 | MediaPlayer | `.surface` also reports | kill | kill | surfaceDoesNotReport |
| M4 | MediaPlayer | `.surface` handled before the `loadId` check | kill | kill | nextFileStartsHidden |
| M5 | MediaPlayer | `.pip` does nothing | live | live | — (simulator) |
| M6 | MediaPlayer | report `pip: true` | kill | kill | surfaceDoesNotReport |
| M7 | MediaPlayer | report `pipPossible: true` | kill | **live** | — (finding 6) |
| M8 | MediaPlayer | PiP changes not reported | live | live | — (simulator) |
| B1 | ShellBridge | missing `kind` defaults to audio | kill | kill | loadNeedsAKind |
| B2 | ShellBridge | `number` accepts booleans | kill | kill | unplaceableSurfaceIsRejected |
| B3 | ShellBridge | `width > 0` removed | kill | kill | unplaceableSurfaceIsRejected |
| B4 | ShellBridge | `(nil, nil)` stick guard removed | kill | **live** | — (finding 10) |
| B5 | ShellBridge | missing `geometry` = no frame | kill | kill | missingGeometryIsNotNull |
| B6 | ShellBridge | missing `active` = false | kill | kill | pipNeedsABoolean |
| B7 | ShellBridge | no `#rgb` expansion | kill | kill | pageColourIsRead |
| B8 | ShellBridge | `#` optional | kill | kill | unreadablePageColourIsRejected |
| B9 | ShellBridge | `media.pip` as a player-wide setting (no `loadId`) | kill | kill | commands, fileCommandsNeedALoadId, pipNeedsABoolean |
| B10 | ShellBridge | no hex-digit check | kill | kill | unreadablePageColourIsRejected |
| F1 | nativeMedia.ts | `setSurface` sends with no load | kill | kill | 1 test |
| F2 | nativeMedia.ts | `pipPossible` read from `pip` | kill | kill | 2 tests |
| F3 | nativeMedia.ts | `INITIAL.pipPossible = true` | kill | **live** | — (finding 6) |
| F4 | nativeMedia.ts | `load` omits `kind` | kill | kill | 2 tests |
| F5 | nativeMedia.ts | `setPip` sends with no load | kill | kill | 1 test |
| F6 | nativeMedia.ts | `pip` always false | kill | kill | 1 test |

## Survivors that were meant to survive

- **V5 (from the plan).** Dropping `adjustedContentInset.top` is equivalent under `viewport-fit=cover`. Not re-run.
- **V42 (= V4).** The per-frame background clearing. The harness does not reproduce WebKit's repaint.
- **V31, V33, V34, V35, V41, M5, M8.** Each matters only with PiP present, and the simulator has none. Each belongs
  to R-5.
- **V21, V22.** The back-swipe hookup has no test (declared `live`, reported as finding 5).
- **V24.** The main scroll view's frame is the web view's bounds, which no reported scroller box equals.
- **V27.** `follow()` searches again every 10 frames while the scroller is out of the window, so the `place`-time
  re-search only saves up to 10 frames.

## Checked, not a finding

- **Stale ids (invariant 10).** `.surface` and `.pip` go through the same `commandLoadId != loadId` check as 2a's
  commands (M4 killed). The bridge requires a `loadId` for both (`fileCommandsNeedALoadId` has both; B9 killed).
  After `unload`, `loadId` is nil, so any id is stale.
- **Ordering of load and surface.** `apply` chains every command behind the previous one. A `media.surface` that
  follows its `media.load` therefore always sees the new `loadId` and the reset geometry. A page cannot send a
  surface for a load id before it has sent the load, because `MediaChannel.load` makes the id and posts it first.
- **Watch history (2a-8, 2b-3).** Nothing in these commits touches `/progress` or the web's saving. `ended` and
  `duration` go through `finiteSeconds` exactly as before (a straight extraction of `seconds(_:)`).
- **Invariant 1 (outside the shell).** The web changes are type-level and a new `kind` argument. `postToShell` and
  `subscribeToShell` are still no-ops without the handler, and `useShellAudio` still returns early without a
  channel.
- **Page colour from a stranger.** `page.background` goes through `route`'s origin check first
  (`pageColourNeedsTheServer`). `--bg-primary` is written as `#rrggbb` in both themes (`globals.css:29`, `:63`),
  which the parser accepts.
- **`isOpaque = false` with no video.** The web view's own background stays `.systemBackground` until a page colour
  arrives, and `WKContentView` is left opaque while no video shows (V28 killed). A page without video looks the same
  as before.
- **Retain cycles.** The display link retains `DisplayLinkTarget`, which holds the surface weakly. Gesture
  recognizers do not retain targets. The PiP delegate is weak. `onPictureInPictureChange` captures the player
  weakly. `isolated deinit` invalidates the link and removes the view.
- **Test doubles against §2.** The surface tests use a real `WKWebView` in the app's window with
  `viewport-fit=cover`, a real `AVPlayer`, and real scrolling. The lifecycle test posts the same two notifications
  the system sends. No fake emits something WebKit or AVKit does not. The two limits are PiP (none on the simulator)
  and WebKit's repaint (not reproduced; finding 9).
- **`fixed` with a stick (p4).** The bridge accepts it, and placement then puts the frame at `limit − height`
  (−119 in p4). The contract gives `stickTop`/`stickLimit` only for a sticky ancestor against a scrolling element,
  so a page following §3.4 does not send this shape.
- **`media.pip {active: 1}`.** `NSNumber(1) as? Bool` bridges, so a numeric 1 or 0 is taken as a boolean. The web
  sends a JSON boolean.
- **Prose.** The doc comment above `MediaCommand` in `nativeBridge.ts` (lines 20–26) now sits above `MediaKind`.
  That misplaces it but would not lead to a wrong change. Not reported beyond this line.
- **Worktree.** Clean at the end (`git status --short` empty, HEAD `b18b6b13`). The probe file was removed.

TOTAL: 11 findings
