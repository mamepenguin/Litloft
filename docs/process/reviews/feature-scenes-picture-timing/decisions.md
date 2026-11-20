# Decisions

decision:
ran_in_app: yes
at: 75bc701c6667726e5affb718a7292609f4aa18b8
by: agent
evidence: |
  Rerun after addons/intelligence 0068a3e ("place and open the list again on every showing").
  Core 75bc701c6, which pins addons/intelligence at 0068a3e. Stack started with `r5_stack.py
  clone --port 3101` and `up` (http://video-share-scenes-pictures.localhost:3101), then `down`
  and `destroy`. Scope was narrowed to the re-show path; the rest is summarised from the
  earlier run below.
  - Files: native video KtVKUiry6S_d (143 tiles) and YouTube .loft opuf2121Nfxq (235 tiles).
  - Workbench: Playwright Chromium at 1184x825, panel under the player, "Enlarge panels" on.
    Hide = "Close Scenes", show = the "Scenes" button.
  - Phone sheet: Playwright Chromium at 390x844 with touch and mobile emulation. Hide = the
    sheet's "Info" tab, show = its "Scenes" tab.
  - Method as before: a MutationObserver timed each tile `<img>` insert, a resource
    PerformanceObserver timed `/frame?` and `scene-tile` requests, and scroll events of the
    scroller were logged. The log was cleared just before the show click or tap; times are ms
    from it. "Near (superset)" means rows touching the scroller box plus one row each side.

  Sequence per cell: open the panel; for the native video, click the player's seek bar at 50%
  (paused, 6:40); scroll the list with the wheel (workbench) or a touch scroll gesture (phone),
  which ends opening; hide; show again; scroll 400 px again.

  Step 1, show again (expected: placed again, the playing row with a player and the top
  otherwise; near pictures asked for at once; for the native video, no request for rows 0-2):
  - Workbench, native: the user scroll had left scrollTop at 473. On re-show the tiles were
    drawn at 402 ms, the list scrolled to 973 (the same place the seek placement had used, row
    with 6:39 highlighted) in the same ms, and all 30 near tiles got `<img>` 4 ms later. Rows
    0-2 (0:00-1:10): no `<img>`. Screenshot: reshow-workbench-native.jpg.
  - Phone, native: user scroll left 1618. On re-show tiles at 258 ms, scroll to 2116 at 260 ms
    (the seek placement's position), 21 pictures at 260 ms. Rows 0-2 (0:00-0:34): none. My
    superset counted 27 near; the other 6 are rows 5:18 and 5:34, above the top edge (5:34 has
    20 of 83 px showing), so they are not near by the spec. reshow-phone-native.jpg.
  - Workbench, .loft (not played, so no position): user scroll left 500. On re-show the list
    was at the top, tiles at 32 ms, 24 pictures at 47 ms (rows 0:00-2:59; row 3:58 starts below
    the box and is outside the spec's near set). reshow-workbench-loft.jpg.
  - Phone, .loft: user scroll left 528. On re-show the list was placed at the top (scrollTop 30,
    as on the first opening), tiles at 32 ms, 18 pictures at 36 ms. reshow-phone-loft.jpg.
  - An earlier pass of the workbench native cell gave the same result (tiles 86 ms, 30
    pictures 97 ms, scroll to 973, rows 0-2 not requested).

  Step 2, scroll after the re-show (expected: newly near tiles wait about D = 200 ms). Latency
  is from the scroll event at which the tile first entered my superset to its `<img>`:
  - Workbench, native (wheel, 100 px steps): 24 newly near, all asked for, 203-204 ms.
  - Phone, native (touch gesture): 12 newly near, all asked for, 235-238 ms.
  - Workbench, .loft: 18 asked for at 237 ms. 6 more (row 7:57) entered my superset at the last
    scroll event and were not asked for. At the stop the row before it (6:58) had 19 of 85 px
    inside the box, so 6:58 is not visible and 7:57 is not near by the spec.
  - Phone, .loft: 12 newly near, all asked for, 238-245 ms.
  - The phone and .loft numbers are about 35-45 ms above 200. My superset admits a row when it
    first touches the box edge, which is before the spec's half-height visibility, so this
    latency is an upper bound; at the gesture's 1200 px/s half a row (about 42 px) is about
    35 ms. No tile was asked for before about 200 ms.
  Screenshots: reshow-*-after-scroll.jpg.

  Step 3, spot checks:
  - First opening still at once: workbench native 12 pictures 4 ms after the tiles; phone
    native 18 at 4 ms; workbench .loft 24 at 41 ms; phone .loft 18 at 5 ms. (Tap-to-tiles on the
    phone includes Playwright's wait for the tab, 1.4 s and 12.4 s here, as in the earlier run.)
  - Slow scroll (4 px a frame for 2 s, 240 events) on the phone, native, after the re-show:
    26/26 tiles near for 300 ms or more were asked for before the stop.

  Earlier run (core 4352a8da9, addon 4d07264), summarised. Same files, workbench at 1184x825
  (desktop Chrome and Playwright) and phone sheet at 390x844:
  - Opening asked for near tiles at once (5-13 ms after the tiles on every cell), including a
    re-placement for size ("Enlarge panels"), close and reopen, and the resume placement after
    reload (its new near tiles in the same update, before the scroll event).
  - The list's own placements during opening (seek bar, following playback, hover on the
    ruler) asked for new rows at once.
  - Ruler press, ruler `End` key, ruler click/tap, the "Back to current position" chip and
    following during playback after opening waited 193-217 ms.
  - Slow scroll: every tile near for 300 ms or more asked for before the stop (48/48, 54/54,
    27/27, 27/27). Fast scroll: no crossing tile under 150 ms was asked for; stop tiles at
    104-162 ms after the stop; superset-only rows were not near by the spec.
  - No `loading` attribute on any tile `<img>`.
  - Not exercised: a failing picture load and a browser-cancelled ruler touch drag.
  Earlier screenshots are the non-reshow files in r5/.

  Not exercised in this rerun: re-show with a playing .loft (YouTube embed playback needs the
  Chrome channel; the .loft cells used the top placement only).
  Screenshots, in docs/process/reviews/feature-scenes-picture-timing/r5/:
  reshow-workbench-native.jpg, reshow-workbench-native-after-scroll.jpg,
  reshow-workbench-loft.jpg, reshow-workbench-loft-after-scroll.jpg, reshow-phone-native.jpg,
  reshow-phone-native-after-scroll.jpg, reshow-phone-loft.jpg, reshow-phone-loft-after-scroll.jpg.
pending: Real touch momentum on the iOS app after deploy (PROJECT.md agent_cannot_verify). On the phone sheet, a fling's tiles fill in while it slows down, before the list stops, opening the panel shows pictures without a visible pause, and showing the panel again after switching tabs places it and shows pictures without a pause.
