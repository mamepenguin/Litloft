# Decisions

decision:
ran_in_app: yes
at: d3216f508af71544c4968552e83450c4d1f2838c
by: agent
evidence: |
  Three R-5 runs against the running stack at http://video-share-row-beside.localhost:3101,
  Playwright 1.58.2 (bundled Chromium; Google Chrome headless for part of the behaviour run),
  fine pointer and coarse pointer (hasTouch), with workbench-player-focus and workbench-panels set
  before load. Files: video wJnOX7w4b-Or (Transcript, Scenes), .loft K6MydOKHZRon (YouTube,
  Transcript), audio 0LyQRbfZiDyW, video with scene data XN1lPMKvrM7S. No difference from the spec
  was found in any run.

  The layout run and the behaviour run were at 821ec3f139667cb1d69275b335eb8c988282af87 with the
  threshold at 17rem. The only product change since then is the threshold constant
  (WORKBENCH_ROW_BESIDE_REM 17 -> 13 in frontend/src/lib/layoutSizes.ts); the rest of the
  difference is DESIGN.md and test files. The third run was at d3216f508 against the stack rebuilt
  at that commit.

  Run 3 (layout at 13rem, d3216f508; r5-layout.md "second run", screenshots r5/layout-13rem/):
  1376x878 with the left sidebar open (default; canvas 720, side space 224): beside at both pointers
  with one and two panels; frame 480x270 at the canvas left, row 752..976 with its bottom on the
  frame's bottom (342), Transcript at the row's left, Enlarge panels at its right end, panels from
  354 (frame bottom + 0.75rem) across the canvas, ending in the visible area without scrolling
  (I1, I2, I3, I4). Width-only resize: beside at side space 208px (window 1360), not beside at 207px
  (1359; frame centred, row 1rem under it), flipping both ways every time at both pointers, same
  <video> node throughout (I9, I5, I6). At 208px the two toggles wrap upward: the first in priority
  order (Transcript) on the bottom line with Enlarge panels at its right end, bottom on the frame's
  bottom, nothing over the frame or past the canvas's right edge (I1 wrapped case, I2). Regression
  at floor 1376x878, share 1590x1122, half 1440x560 (sidebar closed) and value off at 1376x878 gave
  the same geometry as run 1.

  Run 1 (layout at 17rem, 821ec3f13; r5-layout.md first part, screenshots r5/layout/): floor,
  share and half cases, both pointers, one and two panels (24 combinations), sidebar closed: every
  I1/I2/I3 check within 1px, I4 in floor and share (half: room below the 18rem floor, so not
  applicable). Panels 48px (fine) / 60px (coarse) taller than with the row under the same frame.
  Threshold by width-only resize between side space 272 and 271px, both directions. Outside the
  beside state (value off and "false", side space under the threshold, audio, stacked with the
  inspector open, phone 390x844): no attribute, frame centred, row 1rem under it, unchanged from
  value off (I5). stacked with the inspector closed (900x878) is beside. .loft beside with the row
  bottom on the slot's bottom. Compared with BottomRow.dc.html (A2) at 1376x878 sidebar closed:
  every checkable layout decision matches; the visible differences are the toggle set and locale
  of the file used and the 44px coarse controls.

  Run 2 (behaviour at 17rem, 821ec3f13; r5-behavior.md, screenshots r5/behavior/): entering and
  leaving the beside state by the button, closing and reopening the last panel, width-only resize
  across the threshold and storage events from a second page, for a playing native video and a
  playing YouTube .loft: the <video> / <iframe> stayed the same element and playback continued
  (I6). Non-16:9 .loft (link card, error box, produced by intercepting the .loft read): row bottom
  on the frame's actual bottom. Pseudo full screen (coarse) and system full screen (fine) from the
  beside state and value off: no attribute change during, every edge back within 1px after, full-
  screen frame the same size in both (I7). Panel content: Transcript resume chip and inline Edit
  inside the panel in both states, Scenes ruler and frame grid inside the panel; no positioned
  element in the workbench resolves against an ancestor outside the root. Find open pushes the
  column down by the bar's height in both states, the beside geometry is kept, and Escape restores
  it.

  The intelligence addon was saturated during runs 1 and 2 (QueuePool exhausted, 502 on /status);
  page loads where the panel toggles had not appeared were retried and only complete loads are
  recorded.
pending: |
  Four toggles at the threshold (no player file in the data offers Detailed summary or Note);
  a file-preview-actions entry in the trailing group (no addon publishes one); Detailed summary
  panel actions; system full screen with a viewport resize (headless kept the viewport size);
  height-only resize across the threshold and the mini player; Scenes with the value off side by
  side with value on (scene data did not load); a real touch device (iPad Safari).
