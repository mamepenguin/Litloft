# Decisions

decision:
ran_in_app: yes
at: 1c0e7778b38d1791fdbf223f0ef323a30ce60ae0
by: agent
evidence: |
  R-5 run 2 of `docs/process/reviews/fix-reading-app-design/behavior.md` (the `## Fixed` table and
  `## Round 2`) against HEAD 1c0e7778b. Scratch stack `litloft-r5-reading-design` on
  http://localhost:3995, frontend image built 01:21 after the 01:18 commit; seeded data as in run 1
  (profile Haru, tags, progress, two smart folders). Chromium via Playwright, scripts
  `.r5/round2.mjs`, `.r5/round2-analysis.cjs`, `.r5/shots.mjs`, `.r5/check-*.mjs`; measurements in
  `.r5/round2.json` and `.r5/measure.json`. Screenshots in
  `docs/process/reviews/fix-reading-app-design/shots/`.

  Round 2.
  - D-1 badge: at 1280, 1440 and 390, every cover (PDF and EPUB, 16/18/12 covers) has the badge 8px
    from the cover's left and 10px from its bottom, 20px tall, whether or not a progress bar is
    shown. The bar is 4px tall and its top is 4px above the cover bottom, so the badge sits above
    the bar (badge bottom edge 10px, bar top edge 4px).
  - D-2: a no-thumbnail cover (EPUB) has children div(title), span(badge), div(bar); no svg and no
    img. Title at left 0 / top 0 in the cover, padding 14px 12px 0 12px, 13px, weight 700,
    line-height 18.2px, colour text-primary at 0.78 alpha, `white-space: pre-line`, wrapping
    ("一冊でマスター! Swift Concurrency入門" is 4 lines, 68.6px at 1280). Cover fill `rgb(246, 246, 243)`,
    no background image, overflow hidden, radius 12px, aspect 0.667. A thumbnail cover has children
    img, span, div and no title element: unchanged.
  - D-5 (menu "管理…"/"Manage…" unchanged): the Manage dialog heading is 表示する対象 (ja) and
    "Shown targets" (en), in Reading and in Video.
  - D-6: the search field (400px wide) has a 16x16 lucide search svg at x 452, 12px inside the input
    (input left 440), placeholder unchanged, in ja/en, Reading and Video.
  - D-7: Done / 完了 radius 16px, padding 8px 20px, 14px weight 600, 36px tall, accent fill; in ja/en,
    Reading and Video. Not a pill.
  Shots: `1280-reading-card-no-thumb-progress.png`, `1280-reading-card-no-thumb.png`,
  `1280-reading-card-thumb-progress.png`, `1280-{reading,video}-target-manage{,-en}.png`.

  Fixed table at 1280 (re-measured on this build). Reading Discover and Reading shelf page: 6 columns,
  20px gap, 151.3px 2:3 cards. Target button (Reading and Video): `rgb(229, 229, 224)`, border 0,
  radius 16px, padding 8px 16px, 14px, muted label, primary value, 16px chevron-down, no leading icon.
  Library control row: Tag, State at start (x 256-537), Group, Sort at end (884-1264), same look, 12px
  below the chip row, grid 24px below. Chips: fill `rgb(246, 246, 243)`, transparent border; selected
  border `rgb(214, 48, 49)`. Progress fill `rgb(214, 48, 49)` on `black/50` 4px track. Meta line
  "<folder> · <relative time>" (1時間前, 1か月前, 10か月前, 1年前 ...), no date form. See all ends
  in a 16px chevron-right (`m9 18 6-6-6-6`) in Reading (3 shelves) and Video (2 shelves).

  No sideways scroll (documentElement.scrollWidth = innerWidth) at 1280 and 1440 on Reading Discover,
  Library (none, by tag), Reading shelf page, Video Discover, Video Library, and with the Manage
  dialog and the Target menu open. At 390 the same holds EXCEPT the Reading shelf page
  (`/drive/main/apps/reading/shelf?by=...&key=...&from=discover`, all three shelves): scrollWidth 419
  against 390. The header's `flex-shrink-0 flex-wrap` control group holds the sort button
  (追加日（新しい順）, x 80-254) and the Target button (対象すべての本, x 262-418.6) on one line
  that does not wrap and ends 29px past the viewport. Shot:
  `shots/390-reading-shelf-overflow.png`. Discover, Library, Video and the dialogs at 390 do not
  scroll.

pending: none. Audio/video as heard and seen, the iOS app on a real device, real home-LAN playback and
  third-party addon services are `PROJECT.md` agent_cannot_verify items, and none is touched by this
  change.
