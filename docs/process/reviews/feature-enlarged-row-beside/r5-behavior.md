# R-5 part 2 (behaviour): SPEC-CORE-105

at: 821ec3f139667cb1d69275b335eb8c988282af87 (worktree `video_share-row-beside`, branch `feature/enlarged-row-beside`)
by: agent
stack: http://video-share-row-beside.localhost:3101 (already running; not started or stopped by this run)
threshold checked against: 17rem (I5 and I9 as revised in `invariants.md`)

## How it was run

Playwright 1.58.2 scripts (not the e2e suite) against the running stack, viewport 1376x878,
`locale en-US`. Google Chrome (`channel: "chrome"`, headless) for everything except system
full screen; bundled Chromium (headless) for system full screen, because headless Chrome
did not enter system full screen at all (no `document.fullscreenElement`, nothing moved),
while bundled Chromium did. Native H.264 playback worked in both browsers.

Every page was opened with `localStorage` set before load: `sidebar-open=false` (the tree
sidebar closed, inspector beside, canvas 960px), `workbench-panels` as noted, and
`workbench-player-focus` `"false"` or `"true"`. The tree sidebar open is noted separately.

"Frame" is `[data-testid='player-frame']` (for a `.loft` without one, `.media-detail-player`).
No remount was checked by tagging the `<video>` / `.loft` `<iframe>` element object before
the first step and checking after each step that the element in the DOM is the same object
(`===`) and still connected. Playback was checked by `currentTime` advancing and `paused`
staying `false`; for YouTube, by reading the `<video>` inside the cross-origin embed frame.

Files: native video `wJnOX7w4b-Or` (Transcript and Scenes toggles), `.loft` (YouTube)
`K6MydOKHZRon` (Transcript toggle), video with scene data `XN1lPMKvrM7S`.

Screenshots: `docs/process/reviews/feature-enlarged-row-beside/r5/behavior/`.

## Results

### 1. Native video, playing: enter / leave the beside state

Transcript shown, value off, playback started (muted), element tagged.

| Step | Expected (spec) | Observed |
|---|---|---|
| Value off | Row under a centred frame | Frame 730.7x411 at x 130.7 (gaps 114.7 / 114.7), row top 499 = frame bottom 483 + 16. `01-video-value-off.png` |
| Press Enlarge panels | Beside: frame at the canvas left, same cap size; row from frame right + 1rem to canvas right, bottom = frame bottom; panels 0.75rem under the frame | `data-row-beside="on"`. Frame 480x270 at x 16 (canvas left 16). Row 512..976 (496 + 16 .. root right 976), bottom 342 = frame bottom 342. Toggles left 512, trailing right 976. Panel top 354 = 342 + 12, width 960. `02-video-beside-after-press.png` |
| Press again (off), press again (on) | Leaves, re-enters | Off: identical to the value-off geometry. On: identical to the first press |
| Close the last panel (Transcript) | Leaves the beside state (no button) | Attribute absent, frame 960x540 (no cap without a panel), row under it. `03-video-last-panel-closed.png` |
| Reopen Transcript | Back to beside | Attribute `on`, same geometry as the press |
| Width-only resize 1376 → 1360/1340/1330/1320/1300 → 1376, then 1200, 1190, 1185, 1184, 1183, 1182, 1184, 1183, 1170, 1376 (height 878) | Beside exactly while side space >= 17rem (272px) | Side space = root width - 480 - 16. 1184 (root 768, side 272): `on`, frame at x 16, row 512..784 bottom 342. 1183 (root 767, side 271): attribute absent, frame centred (gaps 143.5 / 143.5), row top 358 = 342 + 16. Flipped in both directions between 1184 and 1183, every time. `06-video-width-1184.png`, `06-video-width-1183.png` |
| `storage` event: a second page in the same context sets `workbench-player-focus` to `"false"`, then `"true"` | Leaves, then enters | `"false"`: attribute absent, value-off geometry (frame 730.7x411 centred). `"true"`: `on`, beside geometry as above. `04-video-after-storage-false.png`, `05-video-after-storage-true.png` |

The `<video>` element was the same object and connected after every step above, and
`currentTime` advanced monotonically through all of them (1.7 s → 25.0 s in the first run,
2.5 s → 12.7 s in the resize run) with `paused: false` throughout.

### 2. `.loft` (YouTube), playing

Started with the frame's own Play button; Transcript shown.

| Step | Expected | Observed |
|---|---|---|
| Value off | Row under centred frame | Frame 730.7x411 centred, row top 499 |
| Press Enlarge panels | Beside; row bottom = frame bottom | `on`, frame 480x270 at x 16, the iframe 480x270 at the same box, row 512..976, row bottom 342 - frame bottom 342 = 0, panel top 354. `11-loft-beside.png` |
| Press off / on, close last panel, reopen, width 1183 / 1184 / 1376, storage `"false"` / `"true"` | Leaves / enters as for the native video | off / on / off / on / off (1183, frame centred, row top 358) / on (1184) / on / off / on |

After every step the `<iframe>` was the same element object, connected, with an unchanged
`src`, and the embed's `currentTime` advanced (2.4 s → 24.8 s) with `paused: false`.

### 3. `.loft` whose content is not 16:9

The data has no reachable non-16:9 `.loft`: every `.loft` on both drives points at YouTube.
The two non-16:9 contents were produced by intercepting the file's `/api/files/K6MydOKHZRon/stream`
response in the browser (Playwright `route`), so the real `LoftPlayer` drew them:
`{"provider":"generic","url":...}` gives the generic link card, and a body that is not JSON
gives the "Failed to read .loft file" error box.

| Content | Expected | Observed (value on) | Observed (value off) |
|---|---|---|---|
| Link card | Row bottom = frame's actual bottom | `on`; frame 480x212 at x 16; row 252..284, bottom 284 = frame bottom 284; panel top 296 (= 284 + 12). `12-loft-linkcard-focus-true.png` | Frame 730.7x212 centred, row top 300 = 284 + 16 |
| Error box | Same | `on`; frame 480x148; row bottom 220 = frame bottom 220; panel top 232. `12-loft-error-focus-true.png` | Frame 730.7x148 centred, row top 236 = 220 + 16 |
| YouTube (control) | Same | Frame 480x270, row bottom 342 = frame bottom | Frame 730.7x411, row top 499 |

### 4. Pseudo full screen and system full screen from the beside state

Native video, Transcript shown, playing; a MutationObserver recorded every change to
`data-row-beside` from just before entering to after exit. Full screen was pressed with the
frame's "Full screen" button.

**Pseudo full screen**: touch context (`hasTouch`, so the coarse 44px toggles), with
`requestFullscreen` made to reject, as the e2e does to get the fallback.

| | Value on (beside) | Value off |
|---|---|---|
| Before | `on`; frame 480x270 at x 16; row 512..976, 298..342 (44px, coarse) bottom = frame bottom; panel top 354 | frame 730.7x411 centred; row 499..543 |
| During | frame 1376x878 (the viewport); attribute stayed `on` | frame 1376x878; attribute absent |
| After exit | no edge of frame, row, toggles, trailing group, root or panel moved by more than 1px; attribute `on` | no edge moved by more than 1px |
| Attribute changes recorded | none | none |
| `<video>` | same element, playing | same element, playing |

Screenshots `20-fs-pseudo-focus-{true,false}-during.png`, `21-fs-pseudo-focus-{true,false}-after.png`.

**System full screen**: fine pointer, bundled Chromium, a real click on the frame's
"Full screen" button; `document.fullscreenElement` was the frame's element while it was up.
In headless Chromium the viewport stayed 1376x878 while in system full screen, so the case
where the viewport resizes during full screen (and the state may flip while it is up) did
not occur here.

| | Value on (beside) | Value off |
|---|---|---|
| Before | `on`; frame 480x270 at x 16; row bottom 342; panel top 354 | frame 730.7x411 centred; row top 499 |
| During | frame 1376x878; attribute `on`; the row is drawn at 512..976, 40..72 under the full-screen frame (spec §2: not promised) | frame 1376x878; row at 88..120 under it |
| After `document.exitFullscreen()` | no edge moved by more than 1px; attribute `on` | no edge moved by more than 1px |
| Attribute changes recorded | none | none |
| `<video>` | same element, playing | same element, playing |

Screenshots `22-fs-system-focus-{true,false}-during.png`, `23-fs-system-focus-{true,false}-after.png`.

The full-screen frame was 1376x878 with the value on and off, in both full-screen kinds.

### 5. Menus and popovers inside panels

| Item | Result |
|---|---|
| Transcript view selector | Not a menu in this build: `TranscriptSection.tsx` draws the source choice (Text chunks / Words / External) as inline buttons in the panel's header line, and only when at least two sources are available (`showToggle = visibleOptions.length >= 2`). On `wJnOX7w4b-Or` it was not drawn (one source), so it was not exercised. Nothing in the panel has `aria-haspopup` or `role="menu"`. Its confirm dialogs are portaled out of the panel and need a corrected transcript; not opened. |
| Transcript "Back to current position" chip (sticky, positioned inside the list) | Seeked to 3:20, played, scrolled the list with the wheel. Value on: chip at x 414.8, y 434 (80px under the panel top 354), centred over the list. Value off: x 414.8, y 623 (80px under panel top 543). Same place relative to the panel in both states. `32-transcript-resume-chip-focus-{true,false}.png` |
| Transcript inline Edit | Opened in place on its row in both states, inside the panel. Cancelled; nothing saved. `33-transcript-edit-focus-{true,false}.png` |
| Detailed summary actions (`RegenerateWithMenu`) | Not checked: no video or `.loft` in the data has a generated detailed summary (only one PDF does), and no player file offered a Detailed summary toggle. |
| Scenes | On `XN1lPMKvrM7S` (24 scenes in the index), value on: the "Frame timeline" ruler drew at the panel's top (y 402..446). Clicking it at 40% seeked the player to 1:39:47 and opened the frame grid under the ruler, inside the panel (cells from x 30, y 480, 126x91), with the picked cell outlined. `31-scenes-pick-focus-true.png`. Value off: the scene data did not arrive in three attempts, so only the empty ruler drew (`30-scenes-focus-false.png`, `31-scenes-pick-focus-false.png`). The two states could not be compared side by side. The intelligence addon was saturated through this run: 100-180% CPU, SQLAlchemy `QueuePool limit ... reached`, and the backend logged `Addon service unavailable` / 15 s `SLOW REQUEST` for intelligence routes. |
| Positioned content against the new `position: relative` root | Value off and value on, on `wJnOX7w4b-Or` (Transcript + Scenes), `K6MydOKHZRon` (Transcript) and `XN1lPMKvrM7S` (Transcript + Scenes). Listed every descendant of `.media-detail-workbench` whose computed `position` is `absolute`, `fixed` or `sticky`, with its `offsetParent`. With the value on, the only element whose `offsetParent` is the workbench root is the row itself (`.media-detail-workbench-row`, absolute). No element's `offsetParent` is outside the root in either state. The Scenes ruler's absolute marks resolve against their own `relative` wrapper inside the panel. |

### 6. Find bar opened in the beside state

"Find in this file" pressed in the header, then "けいち" typed, then Escape.

| | Value on (beside) | Value off |
|---|---|---|
| Find open | Find bar 75px tall at the top of the content column (y 56..131). The scroll container moved down to y 131 and kept its height 822, so its bottom is at 953, 75px below the 878 viewport. Attribute stayed `on`; frame 480x270 at x 16, top 147; row 385..417, bottom = frame bottom 417; panel 429..937, so its bottom 59px is below the window edge. The container does not scroll (scrollHeight = clientHeight = 822). | Same shift: frame 147..558, row top 574, panel 618..937, also ending below the window. |
| After typing | Nothing moved | Nothing moved |
| After Escape | Back to the exact pre-Find geometry; same `<video>` | Same |

So with Find open the row and the panels keep their beside placement relative to the frame,
and the whole column is pushed down by the bar's height. The bottom of the panels goes
below the visible area. This happens the same way with the value off, so the beside state
did not introduce it. I4 covers only Find closed. `40-find-open-focus-{true,false}.png`,
`41-find-typed-focus-{true,false}.png`.

### 7. Other observation

With the tree sidebar open at 1376x878 the canvas is 720px, so side space = 720 - 480 - 16 =
224px, under 17rem. Pressing Enlarge panels then gives the capped 480x270 frame centred
(x 376, gaps 120 / 120) with the row at y 358 = frame bottom 342 + 16 and no
`data-row-beside`, as I5 requires.

## Differences from the spec

None found in what was checked.

## Not checked

- System full screen where entering it resizes the viewport (headless Chromium kept the
  viewport at 1376x878), so a state change while it is up and the restore after it were
  not observed.
- Detailed summary actions: no player file with a generated detailed summary.
- Scenes with the value off, for comparison: the saturated intelligence addon did not
  return the scene data on that page. With the value on it was checked (section 5).
- Transcript view selector: it is inline buttons, not a menu, and is drawn only when at
  least two transcript sources exist. The file used had one source.
- Non-16:9 `.loft`: produced by intercepting the `.loft` read in the browser, because no
  such file exists in the data.
- Mini player and height-only resizes: not in this part's brief.
- `agent_cannot_verify` items: none of them is touched by this change.
