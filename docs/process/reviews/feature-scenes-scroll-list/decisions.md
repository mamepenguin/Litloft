# Decisions

decision:
ran_in_app: yes
at: 47e75aefa8c346a818aff73db69581218ca82458
by: agent
evidence: |
  Stack: `scripts/dev/r5_stack.py clone` + `up` on this worktree (core 47e75aefa, addons/intelligence
  working tree at f309f05), opened at http://video-share-scenes-scroll.localhost:3102. Video
  XN1lPMKvrM7S (9:46:36, 958 `clip-timestamps` rows, active Visual Index with 24 succeeded scenes,
  stale). Driven two ways: the desktop Chrome window (real mouse, wheel and keys; the display caps
  the viewport at 1184x999) and Playwright Chromium from frontend/node_modules (1400x1400, 1400x900,
  768x1024, and 390x844 with touch and CDP touch swipes). Screenshots in
  docs/process/reviews/feature-scenes-scroll-list/r5/.
  The intelligence container was busy with startup indexing (up to 800% CPU), so the proxied
  `visual-index` call often timed out at 15 s with 502. With the first request failing, the
  section correctly drew no Visual Index part; to get a card, the page was reloaded until the call
  answered.

  1. One scrolling list in each host:
     - Workbench at 1400x1400, one panel (r5/wb-1400-one-open.jpg): 958 tiles, 5 columns (the panel
       is 716 px wide beside the Info inspector, not the board's 1024 px), list overflow-y auto
       477 px high, body scrollHeight = clientHeight 794 (no body scroll), section scrollWidth =
       clientWidth. Two panels (r5/wb-1400-two.jpg): 3 columns, body still not scrolling. Transcript
       turned off again: back to 5 columns. PASS.
     - 1400x900 (r5/wb-900-one.jpg): one-line card, list = one row step (108 px), body
       scrollHeight 333 > clientHeight 294. This is the spec's too-short-host case. PASS.
     - Stacked inspector at 768x1024, Scenes tab (r5/insp-768-scenes.jpg, insp-768-scrolled.jpg):
       full card, tab panel 486/486 (no scroll), list scrolls 0→900 under a wheel. PASS.
     - Phone sheet at 390x844 (r5/phone-half-open.jpg, phone-half-scrolled.jpg, phone-full.jpg,
       phone-full-scrolled.jpg): flow form, list not a scroller (overflow visible),
       `mobile-inspector-content` scrolls (30→416 at half, 416→828 at full), ruler pinned
       (top 342 at half and 236 at full, unchanged across scrolls), one-line card pinned (762–828).
       PASS, except FAIL-3 below.
  2. Following and the chip. Playing, seek to 10:00 (Chrome) or 25:00 (1400): the playing row is
     placed second. Playback crossing 10:59→11:00 scrolled the list by one row on its own. A wheel
     on the list (and a touch swipe in the sheet) stopped following and drew "Back to current
     position" centred at the top of the list over the tiles (r5/chrome-wheel-chip.jpg,
     wb-1400-one-chip.jpg). Playback continued and the list stayed. The chip put the playing row
     back (scrollTop 795→295) and went away; in the sheet the chip tap returned to row 0. PASS. The
     ja string was not viewed (locale en).
     Observation: in the 1184x999 workbench (list 140 px, under two row steps), the placed playing
     tile is the second row and its bottom 42 px are below the list's edge. It stays like that
     while it plays, so the playing tile is never wholly visible in a host this short (I2 says it
     is).
  3. Ruler as a map. Hover drew a line at the pointer; list scrollTop and playback unchanged
     (r5/chrome-ruler-hover-line.jpg). A click at ~6:12:00 moved the list to that row with the white
     outline on 6:11:57, playback kept going at 11:14 (no seek), and the chip appeared
     (r5/chrome-ruler-click-no-seek.jpg). A drag moved the point to 8:10:30 with no seek. With the
     ruler focused: → 8:11:40, ←← 8:09:20, End 9:45:24 (last frame, scrolled to the end),
     Home 0:00 (top), → → 1:00, then Enter played from 1:00 (60.8 s), removed the point and the chip.
     Phone: tapping the ruler at 60% moved the list to 5:51:56, the video stayed paused at 0
     (r5/phone-full-ruler-tap.jpg). The band matched the visible rows after every scroll
     (e.g. 3.012%–3.808% for rows 17:40–22:00). PASS, except FAIL-1 below.
  4. A tile (1:30) played from 1:30 without scrolling (wholly visible). The one-line card
     "15:30 車内の運転手と助手席の男性" played from 15:30 (930 s), set following and placed the row.
     PASS.
  5. Pictures. After a wheel stop, the 12 visible tiles were all loaded within about 3 s
     (r5/chrome-after-sweep-pictures.jpg). A 40-step scripted sweep plus two 10-tick wheels: no
     longtask entries, worst frame 57 ms in 135 frames. Pictures were requested in steps after the
     scroll stopped (166→208→226). PASS, except FAIL-1 below.
  6. Card under the list: full (122 px) at 1400x1400 and at 768x1024, one line (44 px) at
     1400x900 and 1184x999, one line (66 px box) in the sheet. It stayed in place while the list
     scrolled. PASS, except FAIL-2 and FAIL-3.

  FAIL-1 (I8, §1.10, I6/§1.14; placement events in Terms). When the visible area grows without a
  scroll, the band and the picture requests keep the old visible area until the reader scrolls.
    - Resize 1400x900 → 1400x1400 with no scroll: list 108→477 px; band stays 0%–0.341% (the one
      row seen at 900); after 3 s, tiles 4:00 to 9:00 are visible without a picture
      (r5/wb-900-to-1400-resize.jpg).
    - `visual-index` answering 502 after 6 s (what the busy addon did): the placeholder goes, list
      520→680 px, band stays 0%–1.602%, and tiles 11:00–12:30 stay without a picture
      (r5/wb-1400-vi502-late.jpg). The same happened in Chrome on the live 15 s timeout: band 0.398%
      (row 0 only) while three rows showed, and row 4:40 had no pictures until a scroll.
    - Phone half snap after the card arrived: band 0–0.597%, while the visible rows give 0–0.796%.
      After the swipe to the full snap: band 0.796–1.535%, against 0.796–1.705%.
    - 1400x1400 after the placeholder gave way to the card (list 520→477): band 0–1.602% against
      0–1.279%.
  FAIL-2 (§3 "the choice does not flip", I5). While the Visual Index is loading, the placeholder
  switches between full (160 px) and one line (80 px) every 100–700 ms, and the list switches
  height with it (105↔185 px at 1184x999, 120↔200 at 1400x1000, 170↔250 at 1400x1050), until the
  answer arrives. Seen live in Chrome for about 12 s, then reproduced with the `visual-index`
  answer delayed 6 s. At 1400x1050, 37 flips in 6.8 s.
  FAIL-3 (§1.2 "the pinned card's box reaches the scrollport's bottom edge"). In the phone sheet
  the card box ends at y=828 while `mobile-inspector-content` ends at y=844. In that 16 px strip
  the time labels of the tiles that scroll under the card show below it
  (r5/phone-card-bottom-gap.jpg, phone-full-scrolled.jpg).

  Other: `clip-timestamps` answered 958 rows for this video, and all 958 tiles are mounted. §10
  states at most `max_frames` (500). The answer comes from the server, which this change does not
  touch. Not exercised: the collection surface's panel, the `.loft` / no-frames case, classic
  scrollbars, 4:3 pictures, a mouse middle-button or scrollbar press, and the ja locale.
pending: iOS on a real device (touch scrolling in the sheet, the pinned ruler and card, the card above the home indicator, the sheet's pull-to-collapse) is agent_cannot_verify and out of scope for this run. The human checks it on the phone after deploy.
