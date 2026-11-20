# Decisions

decision:
ran_in_app: yes
at: 4352a8da9f0d21ef75900d49cbd7140e8803f699
by: agent
evidence: |
  Core 4352a8da9, which pins addons/intelligence at 4d07264. Stack started with `r5_stack.py
  clone` and `up` (http://video-share-scenes-pictures.localhost:3101), then `down` and `destroy`.
  This was done twice because the clone was rebuilt for a second pass.
  - Files: native video KtVKUiry6S_d (143 tiles; the frame cache was empty for it in the clone)
    and YouTube .loft opuf2121Nfxq (235 tiles, stored tiles).
  - Workbench (bounded form): desktop Chrome at 1184x825 for the first pass, Playwright Chromium
    at 1184x825 for the second, and Playwright with the Chrome channel for .loft playback. The
    panel was under the player with "Enlarge panels".
  - Phone sheet (flow form): Playwright Chromium at 390x844 with touch and mobile emulation, on
    the Scenes tab of the bottom sheet.
  - Method: the page recorded when each tile `<img>` was inserted (a MutationObserver), when
    each `/frame?` and `scene-tile` request started and ended (a resource PerformanceObserver),
    and each scroll event of the scroller. Times are in ms.
  - Near set used for the scroll checks: the rows touching the scroller box, plus one row on
    each side. This is a superset of the spec's near set (scenes-scroll-list.md Terms: a visible
    row has at least half its tile height inside the visible area, and in flow form the visible
    area starts below the pinned ruler). So "requested" checks are stricter than the spec, and
    rows outside the spec's near set can show up as near-but-not-requested; those are named
    below.

  Opening (expected: the near tiles are asked for at once, with no 150 ms wait):
  - Workbench, native, cold cache: 12 tiles (rows 0-1) got `<img>` 12 ms after the tiles were
    drawn. Requests started at 12-13 ms and finished at 319-827 ms (the server cut the frames).
    "Enlarge panels" during opening (a re-placement for size): all 24 near tiles had pictures.
    Closing and reopening the panel: 24 tiles at 5 ms.
  - Workbench, .loft: 24 tiles at 0-1 ms. My superset counted 30 near; the other 6 are a row
    with less than half its height inside the list, so they are not near by the spec.
  - Phone, native: 18 tiles at 8 ms (requests finished 53-147 ms). Phone, .loft: 18 tiles at
    5 ms (finished 58-153 ms).
  - The first phone run measured 9424 ms from the tab tap to the first tile; the rerun measured
    63 ms. The first number is unattributed: the timer includes Playwright waiting for the tab,
    on a cold page.
  - Reload with a resume position (workbench, native): the top rows 0:00-1:46 (24 tiles) were
    asked for at once. 473 ms later the resume placement scrolled to 10:12, and its 29 new near
    tiles were asked for in the same update, before the scroll event fired.

  Own scrolls during opening (expected: the new near tiles at once, opening keeps going):
  - Workbench, native, while the mouse moved across the ruler the whole time (hover): after a
    seek with the player's seek bar, three following placements. Each new row was asked for
    1-2 ms before its scroll event.
  - Phone, native: a seek-bar tap placed 21 tiles at once (the tiles and the scroll event in the
    same ms). During playback, a following placement put 9 tiles 2 ms after its scroll event.
  - Workbench, .loft (Chrome channel): a seek-bar click placed 30 tiles 3-7 ms before the scroll
    event. The 40 s of playback after it did not reach the next row (10 s per frame, 6 per row).

  What ends opening (expected: after it, newly near tiles wait the dwell D = 200 ms):
  - Ruler press as the first action on a fresh load (workbench, native): 24 tiles at 208 ms. Six
    more came at 566 ms; they first came near when the row step changed, after the first
    pictures arrived.
  - `End` key on the focused ruler as the first action (workbench, native): 22 tiles at 209 ms.
  - Ruler click as the first action (workbench, .loft): 30 tiles at 214 ms.
  - A wheel or touch scroll of the list: see the following items.

  After opening (expected: about D after the tile comes near):
  - Ruler click, workbench native (first pass): 18 new tiles at 217 ms after pointerdown.
  - Ruler tap, phone: 213 ms (native) and 215 ms (.loft).
  - Chip "Back to current position", workbench native: 210 ms after the click. Workbench .loft:
    the placement scrolled at 40 ms and the tiles came at 233 ms (193 ms after it). Phone native,
    after a touch scroll gesture: the placement scrolled at 31 ms and the tiles came at 228 ms
    (197 ms after it).
  - Following during playback: workbench native, 202 ms after the placement's scroll event.
    Phone native, 203 ms after it.

  Slow scroll (4 px a frame for 2 s, 240 scroll events). Expected: every tile near for D + 100 ms
  is asked for before the scroll stops. Result: every tile near for 300 ms or more was asked for
  before the stop: workbench native 48/48, workbench .loft 54/54, phone native 27/27, phone
  .loft 27/27.

  Fast scroll (one visible-area height every 50 ms to the end). Expected: tiles that only cross
  are not asked for, and the tiles where it stops are asked for within D + 300 ms.
  - No tile near for under 150 ms while crossing was asked for: workbench native 36, workbench
    .loft 126, phone native 77, phone .loft 168.
  - Tiles near at the stop were asked for 104-162 ms after the stop. Their dwell began one or
    two 50 ms steps before the stop, at the step that first brought them near.
  - Tiles near only in my superset were not asked for, and none of them is near by the spec:
    - workbench .loft: row 35:50 had 6 of 85 px inside the list, so it is not visible, and its
      neighbour row 34:51 is not near;
    - phone .loft: rows 35:50 and 36:20 were under or above the pinned ruler, and row 36:50 had
      about 10 of 83 px below the ruler, so 37:20 is the first visible row and 36:50 is the row
      before it (asked for);
    - phone native: row 11:16 in the same position.
    Row boxes at the stop: r5/phone-loft-fast-stop-rows.jpg.

  `loading` attribute (expected: none on any tile `<img>`): 0 of 71 (workbench native), 0 of 77
  (phone native), 0 of 82 (phone .loft), and 0 on workbench .loft.

  Not exercised:
  - A picture that fails to load (§2): no failing frame in ordinary use.
  - A browser-cancelled ruler touch drag (§2): needs a real touch cancel.

  Screenshots, in docs/process/reviews/feature-scenes-picture-timing/r5/:
  - workbench-native-opening.jpg, workbench-loft-after-fast.jpg, workbench-loft-play.jpg;
  - phone-native-opening.jpg, phone-native-after-fast.jpg, phone-native-after-ruler.jpg,
    phone-native-follow-chip.jpg;
  - phone-loft-opening.jpg, phone-loft-after-fast.jpg, phone-loft-fast-stop-rows.jpg.
pending: Real touch momentum on the iOS app after deploy (PROJECT.md agent_cannot_verify). On the phone sheet, a fling's tiles fill in while it slows down, before the list stops, and opening the panel shows pictures without a visible pause.
