# Decisions

decision: 出荷（ユーザーの発言）
ran_in_app: yes
at: 77d07ef6d836642ea9797b489d7115e3f59cda10
by: agent
evidence: R-5 re-run on 77d07ef6d (branch feature/workbench-no-page-scroll; floor uses --workbench-player-share, 0.3 when enlarged). Previous run: 68a765c41. Stack: this worktree's clone (.r5-stack, with drives; port changed to 3112 in .r5-stack/env.json because 3101 was taken by another stack), `COMPOSE_PROJECT_NAME=workbench-scroll-r5 python3 scripts/dev/r5_stack.py up`, built from 77d07ef6d, http://video-share-workbench-scroll.localhost:3112/drive/動画?file=Alx1ShvKJ5ny. Stack stopped with the same project name (`down`); clone kept. Headless Chromium via @playwright/test from frontend/node_modules; scratch scripts in the agent scratchpad (r5b/measure77.cjs, r5b/settle77.cjs, r5b/play77.cjs, r5b/probe77.cjs). Values from getBoundingClientRect on `video` (the frame), innerHeight, `--player-avail` on the nearest ancestor, `--rail-avail`, `document.scrollingElement` and `main`. Bounds: cap = min(share x H, avail), floor = min(270, 0.3 x H, avail) for enlarge on; cap = min(0.5 x H, avail) for enlarge off. Each state after a 1000-1200 ms settle; enlarge-on values were re-sampled at 0, 0.3, 1, 2.5 and 5 s and did not change.

  1. Natural layout, enlarge on, panel shown (frame h, bounds). H is `--rail-avail` (the visible height, SPEC-CORE-113 §1). Corrected in this record: the first pass took H as innerHeight, which is 56px more, so these bounds were computed from the wrong H.
     - 2400x392: H 336, avail 320, frame h100.8 (w179); bounds [100.8, 100.8]. Within.
     - 1024x392: H 336, avail 320, frame h100.8 (w179); bounds [100.8, 100.8]. Within.
     - 2400x320: H 264, avail 248, frame h79.2 (w141); bounds [79.2, 79.2]. Within.
     - 1024x320: H 264, avail 248, frame h79.2 (w141); bounds [79.2, 79.2]. Within.
     - 2400x592: H 536, avail 520, frame h161 (w286); bounds [160.8, 160.8]. Within (0.2 px rounding).
     Enlarge off, panel shown (frame h, cap):
     - 2400x392 and 1024x392: avail 256, frame h168 (w299), cap 196.
     - 2400x320 and 1024x320: avail 184, frame h132 (w235), cap 160.
     - 2400x592: avail 456, frame h268 (w476), cap 296.
     Enlarge-off values match the 68a765c41 run (1024x392 h168, 2400x592 h268).
     Page scroll: document and main scrollHeight - clientHeight are 0 in every state above, with and without the panel, enlarge on and off.
     Probe at 2400x392, enlarge on: `--rail-avail` is 336 px, `--workbench-player-share` is 0.3, `--player-avail` is 320 px. The frame is 0.3 x H = 100.8 px, at both bounds. The enlarged frame is at the cap and the floor, not below the floor.
     Compared with 68a765c41: at 2400x392 and 1024x392 the enlarged frame was h168 (above the cap) and is now h100.8 (at the bounds). The 0.5 term is gone, as the commit intends.

  2. Wrapped row (injected `.media-detail-workbench-row{max-width:140px !important}`), width 1024:
     - Enlarge off, panel shown, H=320: avail 104, frame h104 (w185), cap 104, row 192..304, panel bottom 316, grid h0. No page scroll. Row bottom and panel bottom within the visible area.
     - Enlarge off, panel shown, H=312: avail 96, frame h96 (w171), cap 96, row 184..296, panel bottom 308, grid h0. No page scroll.
     - Enlarge on, panel shown, H=320 (rail-avail 264): avail 248, frame h79.2 (w141), bounds [79.2, 79.2]. Within. Row 79..151 (beside the frame), grid h141, panel bottom 304. No page scroll.
     - Enlarge on, panel shown, H=312 (rail-avail 256): avail 240, frame h77 (w137, rounded from 76.8), bounds [76.8, 76.8]. Within (0.2 px rounding). Row 77..149, grid h135, panel bottom 296. No page scroll.
     With enlarge on the grid is not 0 px in the wrapped case (141 and 135 px), so the accepted 0 px grid applies only to enlarge off.

  3. Enlarge off, panel shown (regression): see item 1. Frame at most min(50% of H, avail) in all cases: 168 <= 196, 268 <= 296, 132 <= 160, 104 <= 104, 96 <= 96. No page scroll at H=312, 320, 392, 592.

  4. Enlarge toggling. A marker property was set on the `<video>` element before any toggle, and the video was playing (muted autoplay, `--autoplay-policy=no-user-gesture-required`, 1024x392). Sequence: panel on, enlarge on, enlarge off.
     - Same element at every step (marker kept: `marked`).
     - paused false at every step. currentTime 2.26 -> 3.35 -> 4.86 -> 6.38 s, advancing with no reset.
     - No pageerror in any case.

  Not measured in this pass: the stored-value toggles (the enlarge button only); Find open, full screen, mini player, the collection surface; iPad and other browsers. The design-checker was not run.
  Known and not re-reported: the transcript list inside the panel body at H=312 is clipped (user decision pending). The 0 px grid in the wrapped case at H=320 and H=312 with enlarge off is accepted by the user.
  Screenshots: docs/process/reviews/feature-workbench-no-page-scroll/r5-screens-77d07ef6d/ (panel-off-w{2400x392,1024x392,2400x320,1024x320,2400x592}.png, panel-off-w1024-h{320,312}-wrap140.png, the matching panel-on-*.png files; 14 files in total).
pending: Not run in this pass: Find open, full screen and mini player, the collection surface, the stored enlarge toggle, iPad and other browsers, the design comparison (design-checker) and a human look at the screenshots. The iOS device and the iPhone 17 simulator (A71C6EF0-B427-4A8F-869B-1352C0523A16) were not touched. Findings: none in this pass. The first-pass claim that the enlarged frame was below the floor is withdrawn: it used innerHeight instead of the visible height H (--rail-avail). The 0 px grid in the wrapped enlarge-off state at H=320 and H=312 is accepted by the user and is not a finding.
