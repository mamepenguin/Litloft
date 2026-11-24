# R-5 part 1: layout (SPEC-CORE-105)

- Ran against: `821ec3f139667cb1d69275b335eb8c988282af87` (worktree `video_share-row-beside`, branch `feature/enlarged-row-beside`, clean tree)
- App: the running stack at `http://video-share-row-beside.localhost:3101` (not started or stopped by this run)
- Browser: Playwright 1.58.2 Chromium, headless, exact viewports. Fine pointer = default context; coarse pointer = `hasTouch: true` (confirmed by `matchMedia('(pointer: coarse)')` = true in every coarse case).
- Files: video `wJnOX7w4b-Or` (drive 動画; toggles available: Transcript, Scenes), `.loft` `K6MydOKHZRon` (drive テスト画像; toggle: Transcript), audio `0LyQRbfZiDyW`.
- Set before load in localStorage: `workbench-player-focus` = `"true"` (or removed / `"false"` for the value-off cases), `workbench-panels` = `["transcript"]` (one panel) or `["transcript","scenes"]` (two panels), `sidebar-open` = `"false"` unless noted. The inspector was beside (`data-inspector-fit="beside"`, open) unless noted.
- Measured with `getBoundingClientRect()`: workbench root `.media-detail-workbench` (= canvas content), frame `[data-testid=player-frame]` (the `.media-detail-host > .media-detail-player` slot gave the same box in every case), row `.media-detail-workbench-row`, toggles (buttons in the `Panels` group), trailing group (other buttons in the row), shown panels `.media-detail-workbench-panel:not([hidden])`, H from the host's `--rail-avail`, and the scroll container (nearest `overflow-y: auto` ancestor holding the player).
- Expected W = max(min(C, H·0.3·16/9), min(C, 480, H·0.5·16/9)); side space = C − W − 16.
- Scripts and raw logs (not part of the record): scratchpad `r5/run1..6.cjs`, `run*.log`.

## 1. Beside state, each case of W, both pointers, one and two panels (sidebar closed)

All 24 combinations (3 sizes × 2 pointers × 1/2 panels) had `data-row-beside="on"` and passed every check below within 1px.

| Case | Window | C | H | Expected W×H | Frame drawn | Row (left..right, top..bottom) | Panel top |
|---|---|---|---|---|---|---|---|
| floor | 1376×878 | 960 | 822 | 480×270 | 16..496, 72..342 (480×270) | 512..976, fine 310..342 / coarse 298..342 | 354 |
| share | 1590×1122 | 1174 | 1066 | 568.53×319.80 | 16..584.53, 72..391.8 | 600.53..1190, bottom 391.8 | 403.8 |
| half | 1440×560 | 1024 | 504 | 448×252 | 16..464, 72..324 | 480..1040, bottom 324 | 336 |

Checks, each OK in all 24 runs:
- frame left = canvas content left (16 = 16)
- row left = frame right + 1rem; row right = canvas content right
- toggles' bottom = trailing group's bottom = frame bottom
- first toggle (Transcript) left = row left; trailing group (Enlarge panels button) right = row right
- toggles on one line; no row content intersects the frame or passes the canvas's right edge
- first panel top = frame bottom + 0.75rem; panels span the canvas content (one panel 16..976; two panels 16..490 and 502..976 at the floor size)
- frame size equals SPEC-CORE-104's value-on cap at the same window (I3): 480×270, 568.53×319.8, 448×252
- I4: floor and share, Find closed: the panels end 16px above the visible bottom (862 of 878, 1106 of 1122) and the scroll container does not scroll. Half (1440×560): the room under the frame (236px) is under 0.75rem + 18rem + 1rem, so I4 does not apply; the panels are at the 18rem floor (288px) and the container scrolls, as expected.

Extra beside case observed: 1590×1122 with the sidebar open (C=934, side space 349.5) is also beside, row 840.53..1190, bottom 391.8 = frame bottom.

Panel gain from the move (same window, threshold run below): the first panel's top is 354 beside and 402 (fine) / 414 (coarse) with the row under the frame at the same frame size, i.e. 48px / 60px taller, as §9 says.

## 2. Threshold (17rem, width-only resize, floor case, sidebar closed, 1376×878 start)

Side space at C = 768 is exactly 272px (17rem); at C = 767 it is 271px. Sequence C = 960 → 768 → 767 → 768 → 767 → 960 at height 878 (window widths 1376/1184/1183), both pointers:

| C | side space | `data-row-beside` | layout |
|---|---|---|---|
| 768 | 272 | `on` | beside checks all OK (row 512..784, bottom 342) |
| 767 | 271 | absent | frame centred (143.5 / 143.5), row top 358 = frame bottom 342 + 16, frame still 480×270 |
| 768 | 272 | `on` | beside checks all OK |
| 767 | 271 | absent | as above |
| 960 | 464 | `on` | beside checks all OK |

The inspector stayed `beside` throughout. The `<video>` element was the same node after all five resizes (a marker property set on it before the resizes was still there), in both pointer runs.

Height-only resize across the threshold: not done in this run.

## 3. Outside the beside state

| Case | Observed | Matches "as before" |
|---|---|---|
| Value off (key removed), 1376×878 | no `data-row-beside`, no `data-player-focus` on host; frame 730.66×410.98 centred (114.67 each side), row top = frame bottom + 16; Enlarge button `aria-pressed=false` | yes |
| Value `"false"`, 1376×878 | identical boxes to value off | yes |
| Value on, side space under 17rem: 1376×878 with the sidebar open (C=720, side 224) | no `data-row-beside`; frame 480×270 centred (120 / 120); row 256..976, top 358 = 342 + 16; panel top 402 | yes |
| Value on, side space under 17rem: 1000×878 (C=584) | no attribute; frame 480×270 centred (52 / 52); row top 358 = frame bottom + 16 | yes |
| Value on, side space 271px (C=767) | see §2 | yes |
| Audio, value on vs off, 1376×878 | no attribute, no Enlarge button, no `data-player-focus`; the boxes with the value on and off are identical (audio box 960×311.59, row top = its bottom + 16) | yes |
| `stacked` with the inspector open, 900×878, value on vs off | no workbench rendered, no row; frame 673.77×378.98 at 113.11, identical with the value on and off | yes |
| Phone 390×844, coarse, value on | inspector `overlay`, no workbench, no row; frame 390×219.38 | yes |

Extra: `stacked` with the inspector closed at 900×878 (C=868) is a form that draws the row; with the value on it is beside and every check in §1 passed (row 512..884, bottom 342, panel top 354). Reopening the inspector there removed the workbench and returned the 673.77-wide frame, as with the value off. With the value off and the inspector closed the frame is centred and the row is 1rem under it.

`.loft` (`K6MydOKHZRon`, framed iframe, 1376×878, one panel): value on → `data-row-beside="on"`, slot 16..496 × 72..342 (480×270), row 512..976 with bottom 342 = the slot's bottom, Transcript toggle at the row's left, Enlarge panels at its right, panel top 354. Value off → slot 730.66 wide and centred, row top = slot bottom + 16. This `.loft` is 16:9, so the non-16:9 failure case (error box, link card) was not produced.

## 4. Comparison with the agreed design (BottomRow.dc.html, "A2") and the old layout (Current.dc.html)

Screenshots at 1376×878, sidebar closed (the design draws no sidebar and a 960px canvas, which is the app's sidebar-closed state):

- `r5/layout/beside-sbfalse-1376x878-fine-1panel.png`, `…-fine-2panel.png`, `…-coarse-1panel.png`, `…-coarse-2panel.png` (beside)
- `r5/layout/off-sbfalse-1376x878-{fine,coarse}-{1,2}panel.png` (value off, compare with Current.dc.html)
- `r5/layout/threshold-beside-C768-fine.png`, `r5/layout/threshold-under-C767-fine.png`
- `r5/layout/loft-1376x878-on.png`, `loft-1376x878-off.png`
- `r5/layout/stacked-closed-900x878-beside.png`, `outside-*.png`, `sidebar-open-*.png`, `beside-sbtrue-1590x1122-fine-1panel.png`

Against A2's checkable decisions:
- frame at the canvas's left edge, 480×270 at x=16, y=72: same as the design;
- one row beside it, left at 512, width 464, bottom on the frame's bottom (342): same;
- toggles at the row's left, Enlarge panels button at its right end, 32px tall (fine): same;
- the space above the row beside the frame is empty: same;
- panels 0.75rem under the frame (354), full canvas width (16..976): same as the design's panel at top 354, 960 wide.

Visible differences from the board, none in the layout decisions:
- the design shows four toggles (詳細要約, 文字起こし, シーン, ノート); the fixture video has two (Transcript, Scenes) in English, because those are the panels this file has and the browser locale is `en`;
- with a coarse pointer the toggles and button are 44px tall, so the row's top is 12px higher (298 instead of 310); the board shows the fine size only;
- the inspector's content differs (tabs, metadata), which the board only sketches.

## 5. Observations for the author

1. **§9's example window is beside only with the sidebar closed.** At 1376×878 with the left sidebar open (its default here: with no `sidebar-open` key the sidebar was open), the canvas is 720px, not 960px, the side space is 224px, and the page stays in the row-under layout (frame centred, row under it). This follows §3's rule exactly; it differs from §9's "480x270 frame at the left of the 960px canvas" only in the assumed sidebar state. The design board also assumes no sidebar. Screenshots: `sidebar-open-under-1376x878-*.png`.
2. With `stacked` and the inspector open at 900×878, the host carried `data-player-focus="on"` on the first load (no workbench rendered); after closing and reopening the inspector it was absent. The frame was the same 673.77×378.98 both times and with the value off, so nothing visible differed.

## 6. Not checked in this run

- Toggles wrapping (I1's wrapped case): no file in this data has more than two toggles, so the row never wrapped.
- Preview actions in the trailing group (the quote action): none of the files used draws a `file-preview-actions` entry, so the trailing group was the Enlarge panels button only.
- Opening menus and popovers inside panels in the beside state (§Touch points, `position: relative` on the root): not attempted here; "Clean up with AI" in the Transcript panel would start an LLM job. Left to the behaviour run or a human.
- Height-only resize across the threshold, pseudo / system full screen and the mini player, `storage` events, Find open: in the behaviour run's scope, not repeated here.
- A `.loft` whose content is not 16:9 (error box, link card): not available in the data.
- Real touch device (iPad Safari): only Chromium with `hasTouch` was used.

## 7. Environment notes

The intelligence addon container was overloaded during this run (`QueuePool limit of size 5 overflow 10 reached`, `/status` answering 502 after 15s, ~180% CPU). While it was, the panel toggles and the inspector's AI controls did not appear, so the workbench row was not drawn; those page loads were retried until the row appeared, and only complete loads are reported above. The Scenes panel body was empty in the two-panel screenshots. Neither is attributed to this change.

# R-5 part 1, second run: threshold 13rem

- Ran against: `d3216f508af71544c4968552e83450c4d1f2838c`. Since `821ec3f13` the only product change is `WORKBENCH_ROW_BESIDE_REM` 17 → 13 in `frontend/src/lib/layoutSizes.ts`; the rest is `DESIGN.md` and tests. The stack at `http://video-share-row-beside.localhost:3101` was rebuilt at this commit by the coordinator; not started or stopped here.
- Checked against the newest revisions of I2, I5 and I9 in `invariants.md` (13rem = 208px).
- Same method, browser and file as the first run (video `wJnOX7w4b-Or`, toggles Transcript and Scenes). The sidebar was left at its default (no `sidebar-open` key; the sidebar is open, canvas 720px at 1376 wide) except in the regression rows marked "sidebar closed".
- Screenshots: `r5/layout-13rem/`.

## A. 1376×878, left sidebar open (the default)

C = 720, H = 822, W = 480, side space 224px. Fine and coarse, one and two panels: all four had `data-row-beside="on"` and passed every check within 1px.

- frame 256..736 × 72..342 (480×270, the value-on cap), left edge = canvas left 256;
- row 752..976 (= frame right 736 + 16 .. canvas right 976), bottom 342 = frame bottom; fine 32px tall, coarse 44px;
- Transcript at the row's left (752), Scenes beside it on the same line, Enlarge panels at the right end (944..976 fine, 932..976 coarse);
- nothing in the row over the frame or past 976;
- first panel top 354 = 342 + 12; panels 256..976 (two panels 256..610 and 622..976);
- I4: panel bottom 862 in the 878 visible bottom, the scroll container does not scroll.

Screenshots: `beside-sidebar-open-1376x878-{fine,coarse}-{1,2}panel.png`.

## B. Threshold: width-only resize, sidebar open, two panels

Window 1376 → 1360 → 1359 → 1360 → 1359 → 1376 at height 878, both pointers.

| Window | C | Side space | `data-row-beside` | Layout |
|---|---|---|---|---|
| 1360 | 704 | 208 (13rem) | `on` | frame 256..736, row 752..960, bottom 342; panels at 354 |
| 1359 | 703 | 207 | absent | frame 480×270 centred (gaps 111.5 / 111.5), row top 358 = 342 + 16 |
| 1376 | 720 | 224 | `on` | as in A |

It flipped between 1360 and 1359 in both directions, every time, at both pointers. The `<video>` element stayed the same node through all the resizes.

At 208px the two available toggles do not fit on one line with the button, so they wrap upward. This is the wrapped case of I1, and it matched:

- fine: Transcript 752..842.5 on the bottom line (310..342), Scenes 752..825.1 on the line above (270..302); Enlarge panels 928..960 on the bottom line at the row's right end; row 270..342;
- coarse: Transcript bottom line 298..342, Scenes 246..290, Enlarge panels 916..960 at 298..342; row 246..342;
- the bottom line's bottom is the frame's bottom (342) in both; the row's top (270 / 246) stays below the frame's top (72); nothing is over the frame (all row content starts at 752 ≥ 736 + 16) or past the canvas right edge (960).

Four toggles (Detailed summary, Note): not reachable. No player file in the data offers a Detailed summary or Note toggle (the behaviour run found the same for Detailed summary), so the threshold was checked with the two toggles available.

Screenshots: `threshold-C704-side208-{fine,coarse}.png`, `threshold-C703-side207-{fine,coarse}.png`.

## C. Regression

| Case | Result |
|---|---|
| floor 1376×878, sidebar closed, fine | `on`; frame 16..496 (480×270); row 512..976 bottom 342; panel top 354; all checks OK; I4 OK |
| share 1590×1122, sidebar closed, fine | `on`; frame 568.53×319.8 at 16; row 600.53..1190 bottom 391.8; panel top 403.8; all checks OK; I4 OK |
| half 1440×560, sidebar closed, fine | `on`; frame 448×252 at 16; row 480..1040 bottom 324; panel top 336; all checks OK; I4 not applicable (room 236px), panels at the 18rem floor |
| value off, 1376×878, sidebar open | no attribute; frame 720×405 (the full canvas, gaps 0 / 0), row top 493 = 477 + 16, Enlarge panels `aria-pressed=false` |

These match the first run at the same sizes.

Screenshots: `regression-{floor-1376x878,share-1590x1122,half-1440x560}-fine.png`, `regression-value-off-1376x878-sidebar-open.png`.

## Differences from the spec

None found.

## Not checked in this run

Four toggles (no file has them), a preview action in the trailing group (none published), and a real touch device.
