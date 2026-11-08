# Decisions

decision:
ran_in_app: yes
at: f5fe3dfcafb97ca1258acd898f6fed743ecf58f5
by: agent
evidence: |
  R-5 of `docs/process/reviews/fix-reading-app-design/behavior.md` (the `## Fixed` table) against
  the agreed design in `docs/process/reviews/fix-reading-app-design/design/`. Driven in a real
  browser at 1280, 1440 and 390 px on a mouse environment, Japanese UI (`NEXT_LOCALE=ja`).

  Stack. `LITLOFT_PORT=3995 docker compose -p litloft-r5-reading-design -f docker-compose.yml
  -f .r5/override.yml up -d --build backend frontend`, from this checkout, with a fresh `data/`
  (`data/setup_completed` created to skip the first-run wizard), `drives.json` with one drive
  `main` mounted from `.r5/drive`, and `passwords.json` as `[]`. The `video_share` stack on port
  3000 and the other running stacks were left untouched; only `litloft-r5-reading-design` was
  started and later stopped with `down`.

  Data (scripts `.r5/gen-drive.py`, `.r5/gen-videos.sh`, `.r5/seed.py`). 38 books (8 PDFs + 4
  two-page ZIPs in `Books/Manga`; 8 EPUBs + 8 PDFs in `Books/Tech`; 4 EPUBs in
  `Books/Tech/Swift`; 6 loose books in `Books`) and 6 two-second clips in `Videos`, 44 files
  after the scan. Real PDFs and EPUBs, every file tiny; mtimes spread from minutes to 3 years
  ago. Tags on 14 books through `PUT /api/files/{id}/tags` (4 books with two tags, the rest with
  one, most books untagged). Profile `Haru` created in `/settings` through the app. 4 books left
  in progress and 2 finished with `POST /api/files/{id}/progress` as `X-Lit-Viewer: Haru`. Two
  smart folders created through `POST /api/drives/main/smart-folders`: 技術書 (`folder:Books/Tech`)
  and Swift (`folder:Books/Tech/Swift`).

  Browser. Chromium via `@playwright/test` (`playwright` is not a direct dependency), scripts
  `.r5/shots.mjs`, `.r5/check-reading.mjs`, `.r5/check-video.mjs`, `.r5/check-shelf.mjs`,
  `.r5/check-loading.mjs`, `.r5/check-touch.mjs`; measurements in `.r5/measure.json`. Raw values
  below are computed styles and `getBoundingClientRect` in CSS pixels. Screenshots in
  `docs/process/reviews/fix-reading-app-design/shots/`.

  1. Columns, card size, no sideways scroll.
     - 1280x1040, Discover (`1280-reading-discover.png`): 続きを読む, まだ読んでいない本 and 新着
       each had 6 equal columns, 20px gap; every card 151.3px wide, cover aspect 0.667 (2:3);
       shelves drew 4, 6 and 6 cards (続きを読む holds only the 4 in-progress books).
       `documentElement.scrollWidth` 1280 = `innerWidth` 1280.
     - 1440x1040 (`1440-reading-discover.png`): 7 equal columns, 20px gap, card 142.86px,
       aspect 0.667; shelves 4, 7, 7 cards; scrollWidth 1440 = innerWidth 1440.
     - 390x1040 (`390-reading-discover.png`): 2 equal columns, 20px gap, card 169px, aspect
       0.667; each shelf drew 4 cards = two rows; scrollWidth 390 = innerWidth 390.
     - The cards in every shelf were equal in width (`sameWidth` true at all three widths).
     - Library Group None, chip Tech (`1280/1440/390-reading-library-none-tech.png`): 6, 7 and 2
       columns, 20px gap, cards 151.3 / 142.86 / 169px, 20 cards, no overflow.
     - Library By tag (`*-reading-library-group-tag.png`): 技術書 7, Swift 4, データベース 2,
       タグなし 11; the same column counts (6 / 7 / 2) and card widths; a shelf drew 6, 7 or 4
       cards (columns x rows), no overflow.
     - The Reading shelf page opened from 新着 (`1280-reading-shelf-new.png`,
       `/drive/main/apps/reading/shelf?by=all&key=all&from=discover`): 6 columns, 20px gap,
       151.3px 2:3 cards.
     - Loading placeholders (`1280-reading-discover-loading.png`, shelves delayed 4s): each
       placeholder box was 151.3 x 227px, aspect 0.667.

  2. Target button (`header button[aria-haspopup=menu]`; Reading and Video measured separately).
     Background `rgb(229, 229, 224)` (`bg-sand`), border 0px, radius 16px (`rounded-2xl`),
     padding 8px 16px, font-size 14px, height 36px on the mouse environment and 44px with
     `hasTouch`/`pointer: coarse`. Children in order: span 対象 in `rgb(98, 98, 91)`
     (`text-text-muted`), span すべての本 / すべての動画 in `rgb(33, 25, 34)`
     (`text-text-primary`), one 16px chevron-down (`path m6 9 6 6 6-6`). The first child is a
     span, no leading icon (one svg in the button, the chevron).

  3. Library control row (1280, `1280-reading-library-none-tech.png`: `gapChipToControls` 12px,
     `gapControlsToGrid` 24px). At 1280: タグ 指定なし x 256–400 and 状態 すべて x 408–537 at the
     start; まとめ方 なし x 884–1028 and 並び順 追加日（新しい順） x 1036–1264 at the end, the last
     button's right edge equal to the grid's right edge. All four: background
     `rgb(229, 229, 224)`, border 0px, radius 16px, padding 8px 16px, font-size 14px, a muted
     label, a primary value and a 16px chevron; Sort draws the label 並び順. At 1440 the same pair
     of groups at 280 and 1400. At 390 the row wraps into three lines (タグ, 状態 / まとめ方 /
     並び順) rather than scrolling; the chip row is still 12px above it and the grid 24px below
     its last line; no sideways scroll. Sort's value reads 並び順 追加日（新しい順）; the en UI
     reads "Sort Added (newest first)".

  4. Chips (`[data-testid=reading-chips]`). Unselected すべて and Manga: background
     `rgb(246, 246, 243)` (`bg-bg-elevated`), border `rgba(0, 0, 0, 0)` 1px, muted text.
     Selected Tech: the same fill, border `rgb(214, 48, 49)` (accent), `font-weight` 600,
     primary text. Identical at 1280, 1440 and 390.

  5. Progress bar on the four Continue reading cards: fill `rgb(214, 48, 49)` (`bg-accent`),
     track `black/50` (`oklab(0 0 0 / 0.5)`), 4px tall; widths 80%, 21%, 38% and 62%, matching
     the seeded positions.

  6. Line under a Reading card's title: always `<folder> · <relative time>` (e.g.
     "Manga · 3時間前", "Tech · 1か月前", "Books · 35分前"). Distinct times seen across Discover,
     Library and By tag: 8分前, 21分前, 22分前, 35分前, 36分前, 37分前, 3時間前, 4時間前, 昨日,
     2日前, 3日前, 4日前, 5日前, 6日前, 1週間前, 2週間前, 3週間前, 1か月前, 3か月前, 8か月前,
     1年前, 2年前, 3年前. No date-form text (`/^\d{1,2}\/\d{1,2}$/` and `YYYY/MM/DD` matched
     nothing), so 08/11 never appears.

  7. すべて見る is followed by a 16px chevron-right (path `m9 18 6-6-6-6`) as the last child, in
     all three Reading Discover shelves, all four By tag shelves, and both Video shelves at 1280
     and 1440; its right edge stayed at 1264 / 1400 on the 1280 / 1440 runs.

  8. Video (`1280-video-discover.png`, `1280-video-library.png`). Discover おすすめ and 新着 and
     Library's Videos shelf: 16:9 covers (aspect 1.778) at 328px with a 12px gap and 3 columns at
     1280; at 1440 the same 16:9 covers at 271px with 4 columns. No horizontal overflow on
     either face.

  Target menu (`1280-reading-target-menu.png`): heading 対象; rows すべての本 (38, checked),
  Swift, 技術書; separator; 管理…. The menu is 200px wide, white, 16px radius. Manage dialog
  (`1280-reading-target-manage.png`): heading 管理…, search field 「スマートフォルダを検索」, the
  two smart folders checked, 完了; 448px wide. The design artboard titles this dialog 表示する対象,
  so its heading is left to the design check.

  Seen outside the checks: PDF covers render as a page thumbnail whose text is cropped and hard
  to read at card size (the EPUBs and ZIPs show the file-type placeholder); this is the existing
  thumbnail path, not one of the changed files, and no attempt was made to attribute it. The
  capture-to-capture difference in the relative times (21 → 22分前) is the clock moving.

pending: none. Audio/video as heard and seen, the iOS app on a real device, real home-LAN
  playback and third-party addon services are `PROJECT.md` agent_cannot_verify items, and none
  is touched by this change.
