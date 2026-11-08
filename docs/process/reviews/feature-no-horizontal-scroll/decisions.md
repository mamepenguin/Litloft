# Decisions

ran_in_app: yes
at: 2773048452d56db31138963b1ad14ebb7df825f6
by: agent
evidence: |
  Environment: scratch stack in this directory, compose project litloft-r5-hscroll, port 3995,
  `docker compose -p litloft-r5-hscroll -f docker-compose.yml -f .r5/override.yml`. Fresh
  `.r5/data`, `.r5/drive`, `drives.json` = one drive `Scratch` at `/app/drives/scratch`,
  `passwords.json` = `[]`. Intelligence and knowledge ran in the same stack (intelligence
  models mounted read-only from the main checkout). Browser: Playwright Chromium at
  1440x900, then 1000 and 700 wide.

  Mouse environment: `matchMedia('(hover: hover) and (pointer: fine)')` was true at every
  width. Screenshots are in `docs/process/reviews/feature-no-horizontal-scroll/shots/`.

  1. Video app at /drive/Scratch/apps/video. Discover: Recommended and New each rendered
  12 cards in 3 rows at 1440/1000 and 6 rows at 700, all cards inside their box, no sideways
  overflow (`scrollWidth == clientWidth` on the shelf and on the page; `scrollable` list
  empty). Library: the `videos` shelf (has "See all") rendered 5 cards - 1 row at 1440,
  2 rows (4+1) at 1000, 3 layout rows (2+2+1) at 700. At 700 the ul was 668x360,
  scrollHeight 546, overflow hidden; 4 cards were drawn and the 5th lay entirely below the
  box (not partially clipped). The `deep` shelf drew its single card. No element on any of
  the three pages had an overflowing `overflow-x: auto|scroll` box; document scrollWidth
  equalled clientWidth at 1440/1000/700. "See all" opened
  /drive/Scratch/apps/video/shelf?by=folder&key=videos with 22 video links and no sideways
  scroll. Shots: 01-discover-mouse-*, 01-library-mouse-*, 01-seeall-mouse-*.

  2. Keyboard from the Library tab at 1440/1000/700: focus order was filters, the shelf's
  "See all", then cards. At 1440 (1 row) and 1000 (4+1 rows) every focused card was inside
  the box. At 700 the fifth card (xmO0S43yqoHP) was entirely outside the 228-668 box; when
  it received focus the browser scrolled the overflow:hidden ul by 186px (scrollTop 0->186),
  pulling the first row out of view. The 2px focus ring is clipped by the ul at the container
  edge: 2px off the top of every first-row card, 2px off the left of the first column and
  2px off the bottom of second-row cards at 1000. Shots: 02-focus-1000-tab4 (first row),
  02-focus-1000-tab8 (second row), 02-focus-700-tab8 (after the box scrolled),
  02-focus-ring-first-row-cut-1000.png, 02-focus-ring-second-row-cut-1000.png.

  3. Zoom. 150% equivalent (viewport 960 at 1440): 3 columns x 2 rows, no clipping or
  overlap. 200% equivalent (viewport 720): 2 columns, 3 rows; the fifth card is entirely
  below the two-row box, the second row itself is not clipped and no cards overlap. CSS
  `zoom` 1.5/2 and root font 24px/32px at 1440 kept 5 columns and produced no clipping or
  overlap (CSS zoom does not change media queries; a real 200% browser zoom at 1440 gives
  the 720-CSS viewport result). Shots: 03-zoom-*, 03-csszoom-*, 03-rootfont-*.

  4. Collection with 18 tracks opened from the collection page Play button
  (/files/RS28S1HLNpbo?collection=...). Track panel at 1440: 1086x326, 5 layout rows,
  scrollHeight 901 / clientHeight 326, overflowY auto, scrollWidth == clientWidth (1086).
  Wheel over it reached scrollTop 575 (its maximum) and the last track became fully visible.
  The current track had the accent ring on item 0; clicking the last track moved the URL to
  that file, ring to index 17, header to "18/18 tracks". At 700: 634x326, 9 rows,
  scrollTop 1299 = maximum, last track visible, no sideways scroll. Shots:
  04-collection-top-*, 04-collection-bottom-*, 04-collection-last-clicked-*.

  5. File detail inspector strip on a video with Info, Find, Chapters, Related, Transcript
  and Ask. At 1440 the 383px pane wrapped the strip to 2 rows (73px); at 700 in the sheet it
  was 1 row; at 400 in the sheet it wrapped to 2 rows (Ask alone on row 2). Every tab's box
  was inside the strip. ArrowRight/ArrowLeft moved selection/focus Chapters -> Related ->
  Chapters; Tab from the selected tab went to the tabpanel (one tab stop). The panel top
  equalled the strip bottom (no overlap) and the chrome header was static at the top (no
  overlap). The video app page-tab strip (Discover/Library) had flex-wrap and
  scrollWidth == clientWidth at 1440/700/400. Shots: 05-inspector-tabs-1440,
  05-inspector-sheet-400-tabs, 05-inspector-sheet-700-tabs, 05-inspector-tabs-1440-arrow.

  6. Breadcrumb at the 8-level folder at 1440/1000/700 rendered Home > Scratch > … >
  level-07 > level-08. Scratch and level-07 truncated with `title` at 1000/700. The middle
  segments deep, level-01..level-05 are not separate links in the DOM: a single "…" link
  carries their names in `title` and navigates to level-06 when clicked. The last segment is
  a `<span>` (not clickable). Its width: 377 == 377 at 1440 and 1000, but 377 natural vs
  376 available at 700, where it showed an ellipsis ("level-08-a-rather-long-folder-name-for-
  the-breadcru…") although its natural width fits the 616px nav. Shots: 06-breadcrumb-1440/
  1000/700, 06-breadcrumb-700-ellipsis-click, 06-breadcrumb-700-hover-ellipsis.

  7. Admin settings add-on policy table at 1440/1000/700: 5 columns (drive + Cloud Sync,
  Media Import, Intelligence, Knowledge), region/table scrollWidth == clientWidth (686 at
  1440/1000, 618 at 700), no sideways scroll, document width clean. `<th>` computed
  position sticky/top 0; with the region capped to 100px in devtools and scrolled to the
  end, every heading stayed at the region top. Headings wrap (at 700 "Intelligence" breaks
  as "Intelligenc/e"). ToolbarMenu (sort menu) measured 198x182 at 1440/700 and 382x182 at
  400, scrollWidth == clientWidth, no overflowing descendant. Setup wizard: in the normal
  one-drive step there is no `pre`; with no drive detected (drives.json `[]`) the DriveStep
  shows `pre` "docker compose up -d --build", class overflow-x-auto, data-hscroll-exempt,
  scrollWidth == clientWidth (524 at 700, 284 at 400) and the page did not scroll sideways.
  Shots: 07-addon-policy-*, 07-addon-policy-700-sticky-scrolled, 07-toolbar-menu-*,
  07-setup-no-drive-700/400, 07-setup-step3-700.

  8. Markdown note at 1440: table 752 wide with scrollWidth == clientWidth; code block
  scrollWidth 1575 / clientWidth 750 with overflowX auto. At 700: table 725 vs 636, a
  horizontal wheel scrolled it to scrollLeft 89 (its maximum); code 1575 vs 634; document
  scrollWidth == clientWidth 700. No other sideways scroller on the page. Shots:
  08-markdown-1440, 08-markdown-700, 08-markdown-700-table-scrolled.

  Add-on rows. CLIP Frames on a 30s clip: strip flex-wrap, mouse max-height 280px,
  overflow-y auto, one card (the indexer produced 1/1 CLIP frames), scrollWidth ==
  clientWidth (351 at 1440, 668 at 700), card inside the box. Visual Index button was
  absent, so its rows were not exercised. Shots: 07-clip-frames-1440/700.

  Touch. Playwright iPhone 13 descriptor: mouse variant false, pointer coarse true, 390 CSS
  px wide. Shelf ul nowrap/overflow-x auto 928 vs 358 (scrollLeft 188 after setting 120);
  collection track panel nowrap/overflow-x auto 3660 vs 324 (scrollLeft 120, max 3336);
  inspector tab strip nowrap/overflow-x auto 404 vs 390 (scrollLeft 14, its maximum); the
  Discover/Library page tabs fit. The breadcrumb nav has pointer-coarse:overflow-x-auto but
  its content shrank to 305 == 305, so setting scrollLeft left it at 0 (max 0); its last
  segment showed as "level-08-a-rat…". Document width 390. Shots: 09-touch-library,
  09-touch-collection, 09-touch-inspector-tabs, 09-touch-breadcrumb.

  Failures: (a) at 700 (and at the 200%-zoom-equivalent 720 viewport) the shelf lays out a
  third row and clips its single card, so more than two rows are drawn and a drawn card's
  box is outside the container; (b) that hidden fifth card is still focusable and focusing
  it scrolls the overflow:hidden shelf by 186px, hiding the first row; (c) focus rings are
  cut by the shelf box at its edges; (d) the breadcrumb collapses ancestors into one "…" link
  instead of keeping every segment, the last segment is not a link, and at 700 it truncates
  although its natural width fits; (e) on touch the breadcrumb does not scroll sideways
  (max scroll 0) and truncates its last segment.
pending: |
  - Visual Index add-on rows: not exercised. The vision LLM is disabled in this install
    (`llm.provider: disabled`), so the section never appears and scenes cannot be generated
    through the UI.
  - CLIP Frames with many cards: not observable. The addon indexed 1/1 frame for every test
    video, including a 30s scene clip, so only the single-card wrapped strip and its 280px
    cap could be measured; the multi-row wrap was not seen.
  - Real iOS device behavior (PROJECT.md `agent_cannot_verify`): orientation, touch
    scrolling feel and the breadcrumb on a real phone are for a human.

## R-5 re-run after d36be64e6

ran_in_app: yes
at: d36be64e6b4a02f02ba7ad3b253e276ce878258b
by: agent
evidence: |
  Scope of this run: items 1-3 of the earlier record (video shelf only), after the fix commit
  d36be64e6. Environment: the same scratch stack, compose project litloft-r5-hscroll, port
  3995, backend and frontend rebuilt from d36be64e6 with
  `docker compose -p litloft-r5-hscroll -f docker-compose.yml -f .r5/override.yml up -d --build
  backend frontend` (LITLOFT_PORT=3995). The earlier `.r5/` drive was reused: 22 videos in
  `videos`, 1 in `deep`, `drives.json` = one drive Scratch, `passwords.json` = `[]`. Browser:
  Playwright Chromium at 1440x900, 1000x900 and 700x900; touch under the Playwright iPhone 13
  descriptor. `matchMedia('(hover: hover) and (pointer: fine)')` was true on every mouse page.
  Build check: at 700 the Library `videos` shelf laid out 5 cards in 3 rows (2+2+1); the fifth
  `li` carried `inert`, the `ul` was 676x368 with `overflow: clip`, 4px padding,
  scrollHeight 550 / clientHeight 368. Screenshots `docs/process/reviews/
  feature-no-horizontal-scroll/shots/r5b-*.png`.

  1. At 700, Tab from the Library tab stopped at Classification, the sort button ("Added
  (newest first)"), the shelf's "See all", cards 0, 1, 2 and 3 (first and second row), then
  the `deep` shelf's "See all". Focus never reached card 4, the only card in the third row.
  `li[inert]` was exactly [4], i.e. the third row. `ul.scrollTop` and `ul.scrollLeft` read 0
  at every stop and after the whole pass. After the pass, assigning `ul.scrollTop = 500` and
  `ul.scrollLeft = 100` read back 0 and 0 (overflow clip; scrollHeight 550 > clientHeight
  368). Calling `.focus()` on the inert card's link left focus on the shelf's "See all".
  Shots: r5b-pagecheck-library-700, r5b-1-tab700-card0, r5b-1-tab700-card2,
  r5b-1-library-700-after-tab.

  2. Card geometry of the `videos` shelf against the earlier run's log:
  - 1440: 5 columns x 1 row; cards 214x169 at x 280/506/733/959/1186, y 308; `ul` 1128x177.
    Earlier run: same columns and card boxes, `ul` 1120x169.
  - 1000: 4 columns x 2 rows (4+1); cards 224x174 at x 16/252/488/724, y 308/494; `ul`
    976x368. Earlier run: same columns and card boxes, `ul` 968x360.
  - 700: 2 columns x 3 layout rows (2+2+1); cards 224x174 at x 16/252, y 308/494/680; `ul`
    676x368, 4 cards drawn. Earlier run: same columns and card boxes, `ul` 668x360.
  Column count, row count and every card box are unchanged; the list box itself is 8px wider
  and taller (4px padding on each side) than in the earlier run. Shots:
  r5b-2-library-1440, r5b-2-library-1000, r5b-2-library-700.

  3. Focus ring at 700 and 1000, reached by Tab (keyboard). The ring is a 2px box-shadow
  (`0 0 0 2px rgb(67, 94, 229)`) on the card link, so it extends 2px beyond the card box.
  - First-row first-column card: box 16,308-240,482 at both widths; the card edge is the
    content-box edge, and the `ul` clip box starts at 12,304 (4px padding). Ring outer
    14,306-242,484, inside the clip box by 2px on every side.
  - Second-row card (index 2 at 700, index 4 at 1000): box 16,494-240,668; ring outer bottom
    670 against the `ul` bottom 672. Fully visible.
  3x crops show the ring unbroken at the top-left corner and along the bottom edge:
  r5b-3-zoom-w700-card0-topleft, r5b-3-zoom-w700-card0-bottom,
  r5b-3-zoom-w700-card2-topleft, r5b-3-zoom-w700-card2-bottom,
  r5b-3-zoom-w1000-card0-topleft, r5b-3-zoom-w1000-card0-bottom,
  r5b-3-zoom-w1000-card4-topleft, r5b-3-zoom-w1000-card4-bottom. Shots of the focused pages:
  r5b-3-library-1000-card4-focus, r5b-3-library-700-card2-focus. Screenshots from an earlier
  attempt of this run that focused a card with `.focus()` (which does not set
  `:focus-visible`) are not evidence and were deleted; the `r5b-3-zoom-*` crops and the two
  page shots above come from the keyboard pass.

  4. Resizing the same page without reload 700 -> 1000 -> 700 -> 1440 -> 700: `li[inert]` was
  [4] at 700 (3 rows), [] at 1000 (2 rows), [] at 1440 (1 row), [4] again at 700, each time
  exactly the cards in layout row 3 and below. Changing sort to Title at 700 reordered the
  cards and kept inert [4]; changing classification to Tag replaced the shelves with one
  "No tag" shelf of 5 cards in 3 rows, inert [4]. Shots: r5b-4-sort-menu-700,
  r5b-4-sort-title-700, r5b-4-class-menu-700, r5b-4-class-changed-700.

  5. Discover (shelves without "See all"): Recommended and New each drew 12 cards, 3 rows at
  1440 and 6 rows at 700, `li[inert]` count 0 at both widths, overflow-x visible. Tabbing
  from the Discover tab reached every card: 12/12 in Recommended then 12/12 in New, no
  missing and no duplicate index, at both widths. Shots: r5b-5-discover-1440,
  r5b-5-discover-700.

  6. Touch, Playwright iPhone 13 descriptor (viewport 390, pointer coarse, hover none): the
  Library `videos` shelf was `flex-wrap: nowrap`, `overflow-x: auto`, `max-height: none`, 5
  cards in 1 row, `li[inert]` count 0; scrollWidth 928 / clientWidth 358, and setting
  scrollLeft 120 moved it (read back 188, a snap point). The `deep` shelf fit. Shot:
  r5b-6-touch-library.

  7. Zoom-equivalent widths of the 1440 view: 150% (viewport 960) gave 3 columns x 2 rows,
  card tops 308/494, second-row bottom 668 against the `ul` bottom 672; not clipped, no
  hidden row, inert []. 200% (viewport 720) gave 2 columns x 3 rows (2+2+1); second-row
  bottom 668 against the `ul` bottom 672, not clipped; the third-row card sat at y 680,
  entirely below the box, and was inert [4]. Shots: r5b-7-zoom150pct-equivalent,
  r5b-7-zoom200pct-equivalent.

  No mismatch in items 1-3.
pending: |
  - The rest of the earlier record is untouched by this re-run; its pending items (Visual
    Index rows, CLIP Frames with many cards, real iOS device) still apply.
