# Decisions

decision:
ran_in_app: yes
at: 2d7882d05f3f6d6da1b7a9106513d6e4d53576ba
by: agent
evidence: Ran on the e2e-components fixture app, not the Docker stack. The fixture is the real core FileDetailContent with its Workbench, InspectorShell and MobileInspectorSheet, and the real intelligence Scenes section (addons/intelligence at 9f1b430). Data is stubbed: 300 frames, one every 12 s, a 3 s WebM in the player. It was not the Docker stack because another session's stack runs on the shared data/ directory, and this worktree has no data/. The bundle was built with frontend/e2e-components/build-bundle.ts, opened over file:// with the `scenes=1`, `frames`, `ratio`, `vi` and `vi-delay` queries, and driven with Playwright Chromium: Desktop Chrome with a mouse, and Pixel 5 with touch for the sheet. Readings are rows x columns, slack, row step, and scroller client and scroll height, using readRows from scenes-section-rows.cases.ts. Screenshots are in docs/process/reviews/feature-scene-rows-fill-height/r5/.
  1. One panel at 1024x1400 with a Visual Index card (D1): 8 columns x 4 rows. Slack 9 px against a 95.8 px step. The scroller does not scroll, and nothing inside the section scrolls. The order is ruler, grid, card 14 px below the grid, action row 18 px below the card, then the leftover under the action row (D4, I3). See main-1024x1400-one-panel-card.png.
  2. Play: the Play button started the clip (currentTime 0 -> 2.6 s). The rows stayed 8x4 over 60 frames. See main-1024x1400-one-panel-after-play.png.
  3. Browsing the ruler with the mouse at 0.02, 0.25, 0.5, 0.75 and 0.999 of its width: the rows stayed 8x4. The window started at frame 0, 64, 136, 216, 268, a multiple of c each time, and ended on frame 299. At every position the band's edges matched the drawn tiles' times to within 0.0002 of the ruler width. See main-1024x1400-one-panel-browse-mid.png and -browse-end.png.
  4. Clicking the tiles 0:00, 1:00 and 2:24: the player seeked (clamped to the 3 s clip). The rows stayed 8x4, and the gaps between grid, card and action row did not change. See main-1024x1400-one-panel-after-tile-click.png.
  5. Turning Transcript on beside Scenes gave 3x3 (slack 45.5, step 115.6), stable over 30 frames. Turning it off returned 8x4. See main-1024x1400-two-panels-toggled-on.png and -off.png.
  6. Resizing the window to 1024x1600, 900, 1200 and 1400 gave 8x6, 8x3 (scrolls), 8x3 (scrolls) and 8x4. Each held over 30 frames. See main-resize-1024x*.png.
  7. Two panels opened at 1024x1400 (D2): 3x3, the same as step 5. See two-1024x1400-two-panels.png.
  8. 1440x900 (D3): 11x3. The panel body scrolls (client 294 px, scroll height 555 px) and holds over 60 frames. See short-1440x900-one-panel.png and -scrolled.png.
  9. Classic 14 px scrollbar, with Chromium launched without --hide-scrollbars:
     - 1440x900: 11x3 beside the scrollbar, held over 60 frames.
     - 1024 wide at 1400, 1600, 900, 1400, 1100 and 1000 high: 8x4 (no scrollbar), 8x6 (no scrollbar), then 7x3 with the scrollbar at 900, 1100 and 1000, and 8x4 again at 1400.
     - In each state, browsing the ruler left the rows unchanged and 60 frames showed a single value.
     - See short-1440x900-classic-scrollbar.png and main-1024x1400/1100-classic-scrollbar.png.
  10. Tablet 768x1024, inspector Scenes tab (D5): 6x3, and the tab panel scrolls (494/559 px). See tablet-768x1024-scenes-tab.png.
  11. Visual Index states at 1024x1400:
     - stale: 8x3. The stale note puts the action row 44 px below the card, slack 70.1 against a 95.8 step.
     - none: 8x5. The grid is the last part, slack 94.8 against 95.8.
     - 4:3 frames: 8x3, step 117.1, slack 41.
     - See main-1024x1400-vi-stale.png, -vi-none.png and -vi-4x3.png.
  12. First paint, recorded every animation frame from load at 1024x1600:
     - On load, every frame drew 6/48. No frame drew 3 rows.
     - Closing the Scenes panel and opening it again: also 6/48 from the first frame.
     - With the Visual Index answer delayed 1500 ms and a card: the placeholder showed at 8x4 and the card replaced it at 8x4, with no change.
     - With a delayed answer of none: one step, 4/32 -> 5/40, as spec section 1.9 allows.
     - See main-1024x1400-vi-pending-placeholder.png and -vi-delay-settled.png.
  13. Other tall hosts: the collection surface panel at 1280x1400 gave 10x5 (slack 47.5 against a 96.6 step). The inspector tab at 900x1400 gave 7x5 (slack 27 against 97.9). See collection-1280x1400-scenes-panel.png and inspector-900x1400-scenes-tab.png.
  14. Phone sheet at 390x844 (D6):
     - Half snap: 3x3, and the sheet content scrolls (559/633 px).
     - Full snap, after dragging the grabber: 3x3, slack 28 against a 96.1 step, no scroll.
     - Tapping tiles and dragging back to half: 3x3, and it scrolls again.
     - See phone-390x844-sheet-*.png.
  15. Phone sheet at 390x1000:
     - Half snap: 3x3 (slack 86).
     - Full snap: 3x4 (slack 56.9), held over 30 frames, unchanged by taps.
     - Back to half: 3x3.
     - Full snap by Visual Index state: card 3x4, stale 3x4, none 3x6, 4:3 frames 3x3 (step 117.5, slack 88.9).
     - The band matched the tiles in every case.
     - See phone-390x1000-sheet-*.png.
  Across all hosts, the tiles, ruler, card and action row draw as before. The pictures are blank in the fixture, so picture appearance was not seen.
  Differences from the spec:
  (a) D2 says two panels side by side at 1024x1400 give 4 columns x 4 rows. Observed: 3 columns x 3 rows, from opening and from toggling, with slack 45.5 against a 115.6 step, so the I1 rule holds for that box. The design canvas title for Two.dc.html ("3 x 3") and the acceptance test (AT_THREE, which expects 3 rows) agree with what was observed.
  (b) D6 says the phone sheet at its full snap gives 4 rows of 3 columns. Observed at 390x844: 3 rows of 3, slack 28 against a 96.1 step. 4 rows appear at 390x1000. The Phone.dc.html canvas title ("3 rows at full; 4 rows from a 1000px screen height") agrees with what was observed.
pending: Pictures, video and playback as seen and heard (agent_cannot_verify). The real stack: real ffmpeg frames and their ratio arriving over the network, and the first-load volume of R x c picture requests (spec section 10). These cannot be exercised on the fixture with stubbed blank pictures. The sheet drag on a real touch device and iOS Safari. Mobile was checked only as Chromium Pixel 5 emulation with CDP touch events.

## Spec design statements that differ from the rule, decided by the human 2026-11-12

- D2 (two panels at 1024x1400, "4x4") and D6 (phone full snap at 390x844, "4 rows"): accepted. The I1 rule is the standard; the design numbers were estimated before the real hosts were measured. The artboards Two.dc.html (3x3) and Phone.dc.html (3 rows at 844, 4 from 1000) were redrawn to the measured values.

## Design differences (design-check.md, first check), decided by the human 2026-11-12

- D-1: accepted. The play/time button in the design's action row is a mock control for trying playback inside the mock, carried over from the earlier Wide.dc.html. The product never had it, and the spec keeps the action row as it is.
- D-2: accepted. The scene card's background matching the workbench panel predates this change (the workbench); not touched here.
- D-3: accepted. Screenshots are light theme only; this change touches no colour.
- D-4: accepted. The action row was not in frame in the scrolled 900px and tablet shots; its look is unchanged by this change and its order was measured in the other states.

## Addon reviews (addon-review.md, addon-fix-review.md), decided by the human 2026-11-13

- addon-review F1, F2: fixed in addons/intelligence 7b0f4db (core b1e269b5a); the fix was reviewed on its own in addon-fix-review.md.
- addon-review F3, F4: not fixed (below the threshold), listed in the PR.
- addon-fix-review F1 (3 rows stuck at 7 columns beside a classic scrollbar in a ~15px height band, existing before this change and allowed by spec §10): the human said "出荷" (ship) without fixing it.
