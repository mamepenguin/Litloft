# Decisions

decision:
ran_in_app: yes
at: a4c55ea2502a204c95b4ac7ffd73a296c5af1991
by: agent
evidence: |
  Stack: `scripts/dev/r5_stack.py clone` + `up` in the worktree (port 3101), driven with
  Playwright on Google Chrome (the Chrome extension was not connected). Screenshots are in
  docs/process/reviews/feature-frame-ocr-hit-place/r5/. The stack was torn down and the
  clone destroyed afterwards.

  Data prep: the clone had 0 `video_frame_lines` rows; the migration had added
  `frame_width`/`frame_height`. Re-read W1pzrj4hOJxM (Chrome vertical tabs, native) via
  インデックス詳細 > 動画内の文字 > 再生成 (01-, 02-). It got 94 segments with 1920x1080. The
  YouTube .loft kLe852pwBh6B (Rick Astley) was read by the loft backlog: 15 segments,
  1280x720. Other YouTube .lofts had no 動画内の文字 row in the dialog (loft_source unset),
  so they were not used.

  1. Search, native video with boxes (`Conductor Studio`, 箇所 view):
     - Desktop: three screen_text rows, slot 88x50 each, ending in the crop state. The large
       frame is `frame?t=<start>&size=large` (1280x720, loading=lazy). There is no outline in
       the crop, and the time label stays (20-*).
     - Phone 390 wide: slot 64x36, crop state (21-*).
     - The crop region was recomputed by hand from line_box/line_match for 5:09 and 5:37.
       It matches the img left/top/width/height (5:37: left 103.2 px, top 14.1 px, width
       320 = frame/4).
     - Links: `/files/W1pzrj4hOJxM?t=309.743&find=Conductor` (link term is the first
       highlight term).
  2. Opening that link (30-): the find bar shows 97 / 210 and the 05:09 画面内の文字 row is
     current. The player shows 5:09, and the only `seeking` event is the initialTime landing
     (309.743).
     - Outlines: `.find-box-current` on "Conductor Studio 2.0", and `.find-box` on 3 other
       matched lines of the same segment. The current box's fractions of the painted rect
       equal the quad (0.0437, 0.0519, 0.1625, 0.0759).
     - While playing it stays (31-). Window checks, paused:
       - 330: gone (32-)
       - 309.4 (start-0.34): shown
       - 309.1 (start-0.64): gone
       - 316.2 (end-0.1): shown
       - 313: shown
     - Enter / Enter / Shift+Enter inside the same segment: 98/210, 99/210, 98/210. The
       current style moves between lines, and each step seeks to the same start (34-).
     - Stepping from a 画面内の文字 row to the 発話 row (1/140), then putting the playhead
       back inside the frame segment: no outline.
     - Typing a new query: gone. Returning to the same query: no current row, no outline.
       Closing find: gone.
     - Layer: pointer-events none, aria-hidden=true. The layer precedes the
       `[data-player-chrome]` gesture/controls node in the same frame, and the full-screen
       button is topmost at its point.
  3. Litloft full screen, native: Chrome under Playwright refuses `requestFullscreen` ("not
     granted"), also on a file without find. So the touch path was used: 844x390 landscape,
     touch, requestFullscreen rejected, which is the iPhone pseudo full screen.
     - The layer follows the 844x390 frame. The painted rect is 693x390 (pillarboxed).
     - Current-box fractions equal the quad. The outline stays while playing (33-, 33b-).
  4. YouTube .loft (kLe852pwBh6B):
     - Search row for `737173`: no crop and no frame; the thumbnail is as before. Link
       `?t=54.000&find=737173` (40-).
     - File page: 1 / 1 with the 00:54 row current (41-).
     - Litloft-UI mode: after clicking the row, the outline is drawn in the embed at quad
       fractions (0.1867, 0.1652, 0.4212, 0.2470) (42-). Sampled every 0.5 s while playing,
       it is shown for about 3 s (segment 54–57), then gone.
     - YouTube-UI mode (player settings > プレイヤー switch): the outline is drawn over the
       iframe and YouTube's own controls (44-). The layer wrapper follows the iframe host,
       and MediaControls are absent.
     - Embed pseudo full screen (touch landscape): the layer is the 693x390 iframe box, and
       the fractions equal the quad (45-).
  5. Video without boxes (adLI1-JrAw3a, not re-read; `格安SIM`):
     - The search row shows only the small frame (`frame?t=1023`, 320x180, 88x50) as before.
       The link is `?t=1023.000&find=格安SIM` (10-).
     - The file page lands at 17:03. The find bar shows 「32 件」 with no current place and
       no outline. The find rows have no boxes or frame_size (11-).
     - Vector-only passages link `?t=<floor>` without find (40-).
  6. t=0.000 (`monograph`, 0:00 segment): the bar shows 1 / 67, the outline is on the
     bottom caption, and no seek fired (51-).

  Design comparison (design/ rendered locally):
  - Main/Phone: slot, time label, row text order match.
  - Player: current line in red with the find list row highlighted, and the counter in
    the bar. The implementation also draws the other matched lines of the segment in the
    yellow mark style, as spec step 17 says; the Player artboard shows only one outlined
    line.
  - Loft: 16:9 outline drawn. The vertical-video and advertisement states were not
    reproduced.
pending: |
  - Mini player box: on the file page the player never scrolled out of view (column scroll
    76 px; transcript panel scrolls internally), so the mini state was not reached by
    ordinary use (36-, 36b-). Not verified.
  - Native element full screen and the `<video>` element's own full screen: refused by
    Chrome under automation; only the pseudo (touch) Litloft full screen was checked.
  - YouTube advertisement (isInterrupted) and a pillarboxed vertical YouTube video: no such
    data reached.
  - Large-frame failure / zero-size fallback (failure case 4) and the small-frame-fails
    path: not producible by ordinary use here.
  - Browser-controls mode (`playerUi === "browser"`) for the native player: not exercised.
  - iOS native full screen and Picture in Picture (agent_cannot_verify).

## Design check (accepted by the human, 2026-11-19)

- D-1 accepted: the other matched lines of the segment are drawn in the mark style, as spec step 17 says; the same as find on a picture.
- D-2 accepted: the find list row layout is the existing one, not changed by this work.
- D-3 accepted: the current mark in the find list is the existing style, not changed by this work.
- D-4 accepted: find list excerpts are the existing length, not changed by this work.
- D-5 accepted: the outline reuses `.find-box` / `.find-box-current` unchanged; the pale fill is the slide's light background.
- D-6 accepted: not shot in R-5 (phone first row under the toolbar); left for the human's check.
- D-7 accepted: no vertical YouTube video or advertisement in the data; left for the human's check.
- D-8 accepted: the mixed list was shot in two screenshots (r5/10, r5/20), not one; left for the human's check.
