# Decisions

decision: ship (the human, 2026-11-14: "ship"; r1 HUMAN_REVIEW_REQUIRED, the ToolbarMenu trigger focus on click kept for every shape)

ran_in_app: yes
at: dcb4fc8f4ec5be9aeb3a8ec8a3d26bd0b46a557e
by: agent
evidence: |
  Fourth R-5 run, after the fix to the scope line below 640px: the Target is no longer held at two
  fifths of the line, so a name that fits once the drive name is cut is no longer cut. Scratch stack
  only, compose project litloft-r5-apphdr (not the :3000 stack), LITLOFT_PORT=3994, `docker compose
  -p litloft-r5-apphdr -f docker-compose.yml -f .r5/override.yml up -d --build backend frontend`,
  down afterwards. .r5/override.yml mounts scratch `drives.json`, `passwords.json` (`[]`), `.r5/data`
  and two scratch drives; `drives.json` held `{}` again after the run. Drives: `main` and
  `family-archive-2019-2026-shared`, 13 files each (9 three-second mp4s and 4 three-page PDFs; 8
  videos + 4 PDFs in Trips, plus one root video on `main`). The scratch DB still held the earlier
  runs' smart folders ("Trips" and "2025 summer trip, camera footage only", both `path:Trips`, in
  each drive); "Holiday 25" (`path:Trips`) was added in each drive through the UI (global search ->
  More actions -> Save as Smart Folder). The run's first smart-folders request answered 500 (SQLite
  "disk I/O error" on the bind-mounted scratch DB); after `docker compose ... restart backend` it
  answered 200 for both drives, and every state that chose a target was measured after a Target menu
  that listed all four rows. Browser: headless Chromium through Playwright 1.58.2 (the frontend's
  copy); phone 375x812 with hasTouch+isMobile, desktop 640x800 and 1280x800, locale en-US (Japanese
  via the NEXT_LOCALE=ja cookie). Screenshots:
  docs/process/reviews/feature-addon-app-header/shots/r4-*.png (104). Unit tests and the diff were
  not read, per the task.

  Item 1 (375; Video and Reading, app page and shelf page, both drives, default / "Trips" / "Holiday
  25" / long folder = 32 English states, plus the 8 Japanese default states). The scope line's
  content edge is x 68..359 (291 px) in all 40 and the Target's right edge is 359 in all 40; there is
  one Target per header, on the scope row (y 120..164 on the app pages, 144..188 on the shelf pages,
  44 px tall). The count is whole in all 40 and the title is whole and one line in all 40
  (291/291). Icon 14x14 and chevron 14x14 in all 40, in every cut state too. No state overflows
  (`document.documentElement.scrollWidth` = 375 in all 40). Each shelf page measured the same as its
  app page in every state except y +24. `main` is 31/31 in all 20 of its states: the short drive name
  is never cut.

  | 375, `main` | drive vis/full | count | Target w | name vis/full | count→Target gap |
  |---|---|---|---|---|---|
  | video default | 31/31 | `· 9 videos` | 114.2 | 62/62 | 79.2 |
  | video `Trips` | 31/31 | `· 8 videos` | 87 | 35/35 | 106.3 |
  | video `Holiday 25` | 31/31 | `· 8 videos` | 120.9 | 69/69 | 72.4 |
  | video long folder | 31/31 | `· 8 videos` | 185.3 | 133/255 | 8 |
  | reading default | 31/31 | `· 4 books` | 110.9 | 59/59 | 85.7 |
  | reading `Trips` | 31/31 | `· 4 books` | 87 | 35/35 | 109.6 |
  | reading `Holiday 25` | 31/31 | `· 4 books` | 120.9 | 69/69 | 75.7 |
  | reading long folder | 31/31 | `· 4 books` | 188.6 | 137/255 | 8 |

  | 375, `family-archive-2019-2026-shared` | drive vis/full | count | Target w | name vis/full | count→Target gap |
  |---|---|---|---|---|---|
  | video default | 102/221 | `· 9 videos` | 114.2 | 62/62 | 8 |
  | video `Trips` | 129/221 | `· 8 videos` | 87 | 35/35 | 8 |
  | video `Holiday 25` | 95/221 | `· 8 videos` | 120.9 | 69/69 | 8 |
  | video long folder | 56/221 | `· 8 videos` | 160.3 | 108/255 | 8 |
  | reading default | 109/221 | `· 4 books` | 110.9 | 59/59 | 8 |
  | reading `Trips` | 133/221 | `· 4 books` | 87 | 35/35 | 8 |
  | reading `Holiday 25` | 99/221 | `· 4 books` | 120.9 | 69/69 | 8 |
  | reading long folder | 56/221 | `· 4 books` | 163.5 | 112/255 | 8 |

  | 375, Japanese default | drive vis/full | count | Target w | name vis/full | count→Target gap |
  |---|---|---|---|---|---|
  | video `main` | 31/31 | `· 9 本の動画` | 134.6 | 83/83 | 45.1 |
  | reading `main` | 31/31 | `· 4 冊` | 120.6 | 69/69 | 101 |
  | video long drive | 68/221 | `· 9 本の動画` | 134.6 | 83/83 | 8 |
  | reading long drive | 124/221 | `· 4 冊` | 120.6 | 69/69 | 8 |

  "Trips" is whole at 35/35: its name span now has a 35 px minimum (`min-w-[2.5em]`) and the text
  draws 32.5 px in it.

  Which is cut first: the drive name. Every short line cuts the drive name while the Target's name
  stays whole — on the long drive the default is 102/221 with a 62/62 Target, `Trips` 129/221 with
  35/35, `Holiday 25` 95/221 with 69/69, and Japanese 68/221 (video) and 124/221 (reading) with 83/83
  and 69/69. The Target's name is cut only with the long folder, which needs 255 px: the drive then
  holds 56 px and the Target takes 160.3 / 163.5 px with the name at 108/255 and 112/255 (the 56 px
  drive draws `family-…`, the 102 px one `family-archiv…`). Nothing is
  cut while the line has room: with `Holiday 25` beside the long drive the Target is whole at 120.9
  px, more than two fifths of the 291 px line (116.4), and the Japanese default is whole at 134.6
  (46 %); on `main` with the long folder the Target takes 185.3 px (63.7 %) and the count and
  `main` stay whole. The previous cut of the Target beside a long drive name is gone: the Japanese
  default on the long drive reads `family-a… · 9 本の動画 ⊙ すべての動画` with the Target 83/83
  (second and third runs: 64/83), and the long folder beside it is 108/255 (second run: 64/255,
  video; 112/255 against 64/255, reading). Screens: r4-375-{video,reading}-{main,longdrive}-
  {default,trips,holiday25,longfolder}.png, the same with `-shelf-`, and r4-375-ja-{video,reading}-
  {main,longdrive}-default.png plus the shelf twins.

  Item 2 (640 and 1280, brief; Video and Reading, app and shelf, both drives, the same four targets =
  64 states). At 640 (header 640, content 608) the Target is at the title row's right end (right edge
  624); at 1280 (header 1040, the 240 px sidebar outside it, content 1008) at 1264; in the h1's band,
  28 px tall. Widths are 114.2 (video default) / 110.9 (reading default) / 87 (`Trips`) / 120.9
  (`Holiday 25`) / 243.2 (long folder at 640, name 191/255) / 307.2 (long folder at 1280, name
  255/255). Title boxes at 640: video 418 / 445 / 411 / 289, reading 421 / 445 / 411 / 289; at 1280:
  video 818 / 845 / 811 / 625, reading 821 / 845 / 811 / 625. Shelf pages: the sort menu is
  immediately left of the Target, 183.5 wide with a 12 px gap, at 640 x 314.3..497.8 (video) and
  317.6..501.1 (reading) and at 1280 954.3..1137.8; shelf title boxes at 640 234 / 261 / 228 / 120
  (video) and 238 / 261 / 228 / 120 (reading), at 1280 634 / 661 / 628 / 441 and 638 / 661 / 628 /
  441. Tabs at y 144 on the app pages, none on the shelf pages. The drive name is whole on both
  drives' app pages and on the 1280 shelf pages (`main` 31/31, long drive 221/221); on the 640 shelf
  pages the long drive's name is cut (video 168, 195, 161, 53 of 221; reading 174, 198, 164, 57), as
  in the third run. No overflow at either width. These are the third run's numbers for default and
  long folder, except that `Trips` is 87 px with a 35 px name and the title box 3 px narrower (third
  run: 83.8 and 32); `Holiday 25` did not exist then. At 640 with the long folder the Target is
  exactly two fifths of the 608 px content width (243.2) and its name is cut to 191/255 while the
  title column keeps 289 px on the app pages (120 on the shelf pages) and the title is whole: the
  640-and-wider cap from the second run is unchanged, as in the third run. Screens: r4-640-* and
  r4-1280-* (app pages) and r4-640|1280-shelf-*.

  Agreed design: read docs/process/reviews/feature-addon-app-header/design/Main.dc.html,
  Phone.dc.html, Phone-Long.dc.html and Shelf-B.dc.html and compared the app with
  artboard-Main-1280.png, artboard-Phone-375.png, artboard-Phone-Long-375.png and
  artboard-Shelf-B-375.png. Matches: at 1280 the icon tile, the title over the scope line, the quiet
  Target whole at the title row's right end and the tabs row under it; at 375 the title alone on its
  row, the scope text at the start and the quiet Target at the end of the same line with the count
  whole; the long name ending in an ellipsis inside the Target with its icon and chevron whole; the
  shelf page's breadcrumb, title, scope line with Target, then the quiet sort menu on its own
  right-aligned row above the list; no 対象 / Target word, no fill, no border, muted 14 px. Visible
  differences: (a) the artboards draw a 48 px top bar with only a menu button, the app draws its own
  bar (search, quick note, profile), so the header sits lower; (b) at 1280 the artboard Target is 36
  px tall and the app's is 28 px (44 px on the coarse pointer), with the same 14 px text and no fill;
  (c) the artboards' tabs are the addon's own (カレンダー/地図), Video and Reading keep theirs, as the
  spec says; (d) the artboards' sidebar, calendar, map and pins are declared differences; (e) no
  artboard draws a long drive name or any 640px state: the app cuts the long drive's name (down to
  68/221 in Japanese, the Target whole there; 56/221 with the long folder, where the Target is cut
  too at 108/255) and cuts the long folder's Target at 640 (24 characters on the app pages, 23 on the
  shelf pages); (f) content, not layout: Shelf-B's
  title is the selected folder's name ("2025 夏の旅行") and the app's shelf page title is the shelf's
  own ("New"); (g) spacing, unchanged from the earlier runs: at 375 the app's Target keeps its 8 px
  padding inside the content edge, so its chevron ends at 351 while the phone artboards' button pulls
  to the edge (`margin-right:-8px`) and draws it at 359. D-1, D-2, D-3, D-7, D-8, D-9 and D-10 are
  visible in these screens as the design check described them and are unchanged (tile level with the
  title, scope line lower, list gap, tab indent, cards, top bar, 28 px Target).
pending: |
  The Photo Diary addon page itself was not opened (out of scope for this run), so SPEC-ADDON-106's
  addon page is not covered here; the addon's own R-5 covers it. Not observed in ordinary use: the
  transient `<label>: …` accessible name while the saved folder is looked up. No item of PROJECT.md's
  agent_cannot_verify is touched by this change.

## History: third R-5 run (fix that put the 640px shelf page's long folder row back in order)

ran_in_app: yes
at: 5c5455c2a643cdc6ea9241f2f0d8a57c163c7555
by: agent
evidence: |
  Third R-5 run, after the fix that caps the Target at 640px and wider (for the second run's 640px
  shelf page). Scratch stack only, compose project litloft-r5-apphdr (not the :3000 stack),
  LITLOFT_PORT=3994, `docker compose -p litloft-r5-apphdr -f docker-compose.yml -f .r5/override.yml
  up -d --build backend frontend`, down afterwards. .r5/override.yml mounts scratch `drives.json`,
  `passwords.json` (`[]`), `.r5/data` and two scratch drives; `drives.json` held `{}` again after the
  run. Drives: `main` and `family-archive-2019-2026-shared`, 13 files each (9 three-second mp4s and 4
  three-page PDFs; 8 videos + 4 PDFs in Trips, plus one root video on `main`). The scratch DB still
  held both earlier runs' smart folders, so none was recreated: "Trips" and "2025 summer trip, camera
  footage only" in each drive, both `path:Trips`. Browser: headless Chromium through Playwright
  1.58.2 (the frontend's copy); desktop 640x800, 800x800 and 1280x800, phone 375x812 with
  hasTouch+isMobile, locale en-US. Screenshots: docs/process/reviews/feature-addon-app-header/shots/
  r3-*.png (96). Unit tests and the diff were not read, per the task.

  Item 1 (640, 800 and 1280; Video and Reading, app page and shelf page, both drives, target default,
  "Trips" and the long folder = 72 states). Each page was loaded once with that drive's saved target
  removed (so the first state is the default target), then "Trips" and the long folder were chosen in
  the Target menu in the same session; the shelf page was reached from the app page. The title is not
  cut in any of the 72 (clientWidth = scrollWidth), and it is one line (`white-space: nowrap`)
  everywhere. With the long folder its box narrows to 289 px on the 640 app pages and 120 px on the
  640 shelf pages and the
  title stays whole, where the second run's 640 shelf state had a 41 px box and "N…". The Target's
  name is whole in 64 of the 72; the eight exceptions are the long folder at 640 (app 191/255, shelf
  176/255, both apps and both drives), cut with an ellipsis after 26 characters on the app pages
  (`2025 summer trip, camera f…`) and 23 on the shelf pages (`2025 summer trip, camer…`)
  (r3-640-*-longfolder.png). Icon 14x14 and chevron 14x14 in all 72, in every state including the
  cut ones. The Target's right edge is 624 / 784 / 1264 = the header's content edge, in the h1's
  vertical band, and there is one Target button per header in all 72. 640 (header 640, content 608):

  | 640 state | title box | Target w (share of 640) | Target name | sort |
  |---|---|---|---|---|
  | app video default | 418 | 114.2 (0.178) | 62/62 | – |
  | app video Trips | 448 | 83.8 (0.131) | 32/32 | – |
  | app video long folder | 289 | 243.2 (0.380) | 191/255 | – |
  | shelf video default | 234 | 114.2 (0.178) | 62/62 | 183.5, gap 12 |
  | shelf video Trips | 265 | 83.8 (0.131) | 32/32 | 183.5, gap 12 |
  | shelf video long folder | 120 | 228.5 (0.357) | 176/255 | 183.5, gap 12 |
  | app reading default | 421 | 110.9 (0.173) | 59/59 | – |
  | app reading Trips | 448 | 83.8 (0.131) | 32/32 | – |
  | app reading long folder | 289 | 243.2 (0.380) | 191/255 | – |
  | shelf reading default | 238 | 110.9 (0.173) | 59/59 | 183.5, gap 12 |
  | shelf reading Trips | 265 | 83.8 (0.131) | 32/32 | 183.5, gap 12 |
  | shelf reading long folder | 120 | 228.5 (0.357) | 176/255 | 183.5, gap 12 |

  800 (header 800, content 768): Target 114.2 / 83.8 / 307.2 (0.143 / 0.105 / 0.384 of the header),
  name whole (62/62, 32/32, 255/255); title boxes app video 578 / 608 / 385, shelf video 394 / 425 /
  201, app reading 581 / 608 / 385, shelf reading 398 / 425 / 201. 1280 (header 1040, the 240 px
  sidebar outside it, content 1008): Target 114.2 / 83.8 / 307.2 (0.110 / 0.081 / 0.295), name whole;
  title boxes app video 818 / 848 / 625, shelf video 634 / 665 / 441, app reading 821 / 848 / 625,
  shelf reading 638 / 665 / 441. Both drives gave the same widths at every state.

  Sort menu (shelf pages, 12 states per width): whole (`Added (newest first)` 132/132 plus its 14 px
  icon and chevron), on the title row and directly left of the Target with a 12 px gap at all three
  widths. Default: 640 314.3..497.8 against Target 509.8, 800 474.3..657.8 against 669.8, 1280
  954.3..1137.8 against 1149.8. Trips: 344.7..528.2, 504.7..688.2, 984.7..1168.2. Long folder:
  200..383.5 against 395.5, 281.3..464.8 against 476.8, 761.3..944.8 against 956.8. Scope
  line: the count (`· 9 videos`, `· 8 videos`, `· 4 books`) is whole in all 72 and the drive name
  is drawn in all 72. The drive name is whole on `main` (31/31) and on the long drive's app pages at
  every width, and it is cut on the long drive's 640 shelf pages (video default 168/221, Trips
  198/221, long folder 53/221 — "family…"; reading 174/221, 201/221, 57/221) and on its 800 shelf
  page with the long folder (135/221, 138/221). No state overflows horizontally
  (`document.documentElement.scrollWidth` = the viewport width in all 72). Tabs on the app pages sit
  under the header's lines at every width (y 144, Discover / Library); the shelf pages have none.
  The second run's 640 shelf state is gone: with the long folder the title column is 120 px and the
  title whole, the drive name drawn (main "main" 31/31; long drive "family…" 53/221), the count whole,
  the Target 228.5 px with its name cut to 176/255, no overflow (r3-640-shelf-video|reading-
  main|longdrive-longfolder.png). At 640 the long folder's Target is cut while the title column is
  289 px on the app pages and 120 px on the shelf pages and the title ("Video", "New") is whole in
  both, so the row has room the Target does not use; at 800 and 1280 the Target's name is whole in
  every state.

  Item 2 (375, Video and Reading, app page and shelf page, both drives, default / "Trips" / long
  folder = 24 states). Unchanged from the second run, to the measured number. Target on the scope
  line's row at its end in all 24 (y 144..188, 44 px tall; it does not share the title row), count
  whole in all 24, icon 14x14 and chevron 14x14 in all 24, no horizontal overflow in any of them
  (`scrollWidth` 375), title whole and one line. Target names: default 62/62 video and 59/59 reading
  with 79.2 / 85.7 px of `space-between` free space after the count; "Trips" 32/32 with 109.5 /
  112.8; the long folder on `main` 133/255 video and 137/255 reading with the row's own 8 px gap; on
  the long drive the drive name is cut (102/221 video, 109/221 reading at the default; 133/221,
  136/221 with "Trips"; 100/221, 103/221 with the long folder) and the Target is 62/62, 32/32 and
  64/255. Shelf pages: the sort menu is whole on its own last row at the right end (x 175.5..359,
  y 196..240, 44 px, below the Target row and above the list), as in the second run. Screens:
  r3-375-video|reading-{main,longdrive}-{default,trips,longfolder}.png and the r3-375-shelf-* set.

  Agreed design: read docs/process/reviews/feature-addon-app-header/design/Main.dc.html, Phone.dc.html,
  Phone-Long.dc.html and Shelf-B.dc.html and compared the app with artboard-Main-1280.png,
  artboard-Phone-375.png, artboard-Phone-Long-375.png and artboard-Shelf-B-375.png. Matches: at 1280
  the icon tile, the title over the scope line, the quiet Target whole at the title row's right end
  and the tabs row under it; at 375 the title alone on its row, the scope text at the start and the
  quiet Target at the end of the same line with the count whole, the long name ending in an ellipsis
  inside the Target with its icon and chevron whole; the shelf page's breadcrumb, title, scope line
  with Target, then the quiet sort menu on its own right-aligned row above the list; no 対象 / Target
  word, no fill, no border, muted 14 px. Visible differences: (a) the artboards draw a 48 px top bar
  with only a menu button, the app draws its own bar (search, quick note, profile), so the header sits
  lower; (b) at 1280 the artboard Target is 36 px tall and the app's is 28 px (44 px on the coarse
  pointer), with the same 14 px text and no fill; (c) the artboards' tabs are the addon's own
  (カレンダー/地図), Video and Reading keep theirs, as the spec says; (d) the artboards' sidebar,
  calendar, map and pins are declared differences; (e) no artboard draws a long drive name or any
  640px state: the app cuts the long folder's Target at 640 (24 characters on the app pages, 23 on the
  shelf pages) and the long drive's name on 640 shelf pages ("family…", 53/221) and on the 800 shelf
  page with the long folder (135/221); (f) content, not layout: Shelf-B's title is the selected
  folder's name ("2025 夏の旅行") and the app's shelf page title is the shelf's own ("New").
pending: |
  The Photo Diary addon page itself was not opened (out of scope for this run), so SPEC-ADDON-106's
  addon page is not covered here; the addon's own R-5 covers it. Not observed in ordinary use: the
  transient `<label>: …` accessible name while the saved folder is looked up. No item of PROJECT.md's
  agent_cannot_verify is touched by this change.

## History: second R-5 run (noted the 640 shelf page state)

ran_in_app: yes
at: eb897b85c8bb9e20d11a25fd6b6ed13b275601c3
by: agent
evidence: |
  Second R-5 run, after the fix for the first run's F1 and F2. Scratch stack only, compose project
  litloft-r5-apphdr (not the :3000 stack), LITLOFT_PORT=3994, `docker compose -p litloft-r5-apphdr
  -f docker-compose.yml -f .r5/override.yml up -d --build backend frontend`, down afterwards.
  .r5/override.yml mounts scratch `drives.json`, `passwords.json` (`[]`), `.r5/data` and two scratch
  drives. Drives: `main` and `family-archive-2019-2026-shared`, 13 files each (9 three-second mp4s
  and 4 three-page PDFs; 8 videos + 4 PDFs in Trips, plus one root video on `main`). The scratch DB
  still held the first run's smart folders, so none had to be recreated: "Trips" and "2025 summer
  trip, camera footage only" in each drive, both `path:Trips`. Browser: headless Chromium through
  Playwright 1.58.2 (the frontend's copy); phone profile 375x812 with hasTouch+isMobile, desktop
  640x800 and 1280x800, locale en-US unless stated; Japanese via the NEXT_LOCALE=ja cookie.
  Screenshots: docs/process/reviews/feature-addon-app-header/shots/r2-*.png. Unit tests and the diff
  were not read, per the task.

  Item 1 (375, Video and Reading, app page and shelf page, both drives, target default / "Trips" /
  long folder; 24 English states, plus 4 Japanese defaults and 2 Japanese shelf states). F1 is fixed:
  on `main` the long folder now takes the whole free line instead of leaving it blank. Target name
  133/255 px for Video and 137/255 for Reading, gap 8 px (first run: 74/255 with a 77 px gap). The
  Japanese default at 375 is whole, `すべての動画` 83/83 and `すべての本` 69/69 (first run 67/83 and
  65/69). F2 is fixed: the leading target icon is 14x14 px in every state, including every state
  where the name is cut (first run 4.08x14 with the long folder, 11.36x14 in Japanese); its wrapper
  is flex-shrink 0 and only the name span truncates. The chevron is 14x14 everywhere. The count is
  whole in all 30 states, the title is one line and whole (clientWidth = scrollWidth) in all 30, and
  no state overflows horizontally (`document.documentElement.scrollWidth` = 375), also with the
  Target menu open (menu x 8..367). Rows:

  | 375 state | icon | chevron | name visible/full | count→Target gap | cut text | overflow |
  |---|---|---|---|---|---|---|
  | video main default | 14x14 | 14 | 62/62 | 79.2 | none | no |
  | video main Trips | 14x14 | 14 | 32/32 | 109.5 | none | no |
  | video main long folder | 14x14 | 14 | 133/255 | 8 | Target | no |
  | reading main default | 14x14 | 14 | 59/59 | 85.7 | none | no |
  | reading main Trips | 14x14 | 14 | 32/32 | 112.8 | none | no |
  | reading main long folder | 14x14 | 14 | 137/255 | 8 | Target | no |
  | video longdrive default | 14x14 | 14 | 62/62 | 8 | drive 102/221 | no |
  | video longdrive Trips | 14x14 | 14 | 32/32 | 8 | drive 133/221 | no |
  | video longdrive long folder | 14x14 | 14 | 64/255 | 8 | drive 100/221; Target 64/255 | no |
  | reading longdrive default | 14x14 | 14 | 59/59 | 8 | drive 109/221 | no |
  | reading longdrive Trips | 14x14 | 14 | 32/32 | 8 | drive 136/221 | no |
  | reading longdrive long folder | 14x14 | 14 | 64/255 | 8 | drive 103/221; Target 64/255 | no |
  | shelf video main default | 14x14 | 14 | 62/62 | 79.2 | none | no |
  | shelf video main Trips | 14x14 | 14 | 32/32 | 109.5 | none | no |
  | shelf video main long folder | 14x14 | 14 | 133/255 | 8 | Target | no |
  | shelf reading main default | 14x14 | 14 | 59/59 | 85.7 | none | no |
  | shelf reading main Trips | 14x14 | 14 | 32/32 | 112.8 | none | no |
  | shelf reading main long folder | 14x14 | 14 | 137/255 | 8 | Target | no |
  | shelf video longdrive default | 14x14 | 14 | 62/62 | 8 | drive 102/221 | no |
  | shelf video longdrive Trips | 14x14 | 14 | 32/32 | 8 | drive 133/221 | no |
  | shelf video longdrive long folder | 14x14 | 14 | 64/255 | 8 | drive 100/221; Target 64/255 | no |
  | shelf reading longdrive default | 14x14 | 14 | 59/59 | 8 | drive 109/221 | no |
  | shelf reading longdrive Trips | 14x14 | 14 | 32/32 | 8 | drive 136/221 | no |
  | shelf reading longdrive long folder | 14x14 | 14 | 64/255 | 8 | drive 103/221; Target 64/255 | no |
  | ja video main default | 14x14 | 14 | 83/83 | 45.1 | none | no |
  | ja reading main default | 14x14 | 14 | 69/69 | 101 | none | no |
  | ja video longdrive default | 14x14 | 14 | 64/83 | 8 | drive 86/221; Target | no |
  | ja reading longdrive default | 14x14 | 14 | 64/69 | 8 | drive 128/221; Target | no |
  | ja shelf video main default | 14x14 | 14 | 83/83 | 45.1 | none | no |
  | ja shelf video longdrive default | 14x14 | 14 | 64/83 | 8 | drive 86/221; Target | no |

  "cut" gives the rendered clientWidth/scrollWidth; the Target's cut name keeps 4-5 characters plus
  the ellipsis, so step 10's three-character minimum holds. On `main` with the long folder the row is
  genuinely full (gap 8 = the row's own gap) and the name is cut at 133/255; nothing is cut and no
  ellipsis is drawn where the line has room, where the 45-110 px gap is `space-between` free space
  with the Target at the line's end. On the long drive the line cannot hold either name in full, so
  both are cut, the drive heavily (102/221 default) and, with the long folder, the Target's name too
  (64/255). Screens: r2-375-video|reading-main-{default,target-trips,target-longfolder,
  target-menu-open}.png, the same four for the longdrive and for the shelf pages, and the r2-375-ja-*
  set.

  Item 5 (Japanese default target): 375, `main`, Video `対象: すべての動画` whole (83/83, gap 45.1,
  no ellipsis), Reading `対象: すべての本` whole (69/69); `getByRole("button", { name: "対象: …" })`
  finds exactly one, innerText is only the name (no 対象 word drawn), the menu heading is 対象 with
  rows `すべての動画 9`, the long folder, `Trips` and `管理…`, the control is rgb(246,246,243) while
  open and transparent when closed, and the page does not overflow with the menu open. On the long
  drive the default name is cut (`すべて…`, 64/83; Reading 64/69) while the drive name is cut too
  (86/221; Reading 128/221); the icon stays 14x14. At 640 and 1280 the default is whole (83/83,
  69/69), the Target's right edge is 624 / 1264 and the role query finds one button. Screens:
  r2-375-ja-video|reading-main-default.png, r2-375-ja-video|reading-longdrive-default.png,
  r2-375-ja-shelf-video-{main,longdrive}.png, r2-375-ja-video-main-target-menu-open.png,
  r2-640-ja-video|reading-main-default.png, r2-1280-ja-video|reading-main-default.png.

  Item 2 (brief, 375 shelf pages, both apps and drives): unchanged from the first run. The sort menu
  is on the header's own last row at the right end, x 175.5..359, y 196..240, 44 px tall, below the
  Target row (target y 144..188) and above the list (first card top 248); it shows
  `↕ Added (newest first) ▾` and measured the same as the first run in all four default states.
  Japanese: `並べ替え: 追加日（新しい順）` at x 181..359, y 196.4, 44 px (r2-375-ja-shelf-video-main.png).

  Item 3 (brief, 640 and 1280, app and shelf pages, both apps and drives, default and long folder):
  unchanged. Target at the title row's right end, right edge 624 at 640 and 1264 at 1280, in the same
  vertical band as the h1, 28 px tall: default Video 509.8..624 / 1149.8..1264, Reading
  513.1..624 / 1153.1..1264, long folder 316.8..624 / 956.8..1264. The shelf sort is immediately
  left of it with a 12 px gap: 640 default 314.3..497.8 vs Target 509.8, 1280 954.3..1137.8 vs
  1149.8, long folder 121.3..304.8 vs 316.8 and 761.3..944.8 vs 956.8. The long folder's name is
  whole at both widths (255/255). App-page numbers are identical to the first run: title 418/225 px
  at 640 and 818/625 at 1280, tabs y 144 with width 608 / 1008 and below the header, no tabs on the
  shelf pages, no horizontal overflow. One state the artboards do not draw: at 640 on a shelf page
  with the long folder the title column narrows to 41 px and the title is cut to "N…" (client 41,
  scroll 50) and the drive name is not drawn in the scope line; the title stays one line, which step
  7 and I14 allow. Screens: r2-640-*, r2-1280-*, r2-640-shelf-*, r2-1280-shelf-*.

  Agreed design: read docs/process/reviews/feature-addon-app-header/design/Phone.dc.html,
  Phone-Long.dc.html and Shelf-B.dc.html and compared the app with the artboard screenshots
  (artboard-Phone-375.png, artboard-Phone-Long-375.png, artboard-Shelf-B-375.png,
  artboard-Main-1280.png). Matches: at 375 the title alone on its row, the scope text at the start
  and the quiet Target at the end of the same line, tabs under; with the long folder the name ends in
  an ellipsis inside the Target while the title and the count are whole and the icon and chevron are
  whole; the shelf page's breadcrumb, title, scope line with Target, then the quiet sort menu on its
  own right-aligned row above the list; no 対象 / Target word, no fill, no border, muted 14 px.
  Visible differences: (a) the artboards draw a 48 px top bar with only a menu button, the app draws
  its own bar (search, quick note, profile), so the header sits lower; (b) at 1280 the artboard
  Target is 36 px tall and the app's is 28 px (44 px on the coarse pointer), with the same 14 px text
  and no fill; (c) the artboards' tabs are the addon's own (カレンダー/地図), Video and Reading keep
  theirs, as the spec says; (d) the artboards' sidebar, calendar, map and pins are declared
  differences; (e) no artboard draws a long drive name (the app cuts it, 102/221 default) or the 640
  shelf page above.
pending: |
  The Photo Diary addon page itself was not opened (out of scope for this run), so SPEC-ADDON-106's
  addon page is not covered here; the addon's own R-5 covers it. Not observed in ordinary use: the
  transient `<label>: …` accessible name while the saved folder is looked up. No item of PROJECT.md's
  agent_cannot_verify is touched by this change.

## History: first R-5 run (failed items 1 and 5)

ran_in_app: yes
at: bc1faa4af27010f9891ae9e113b7e5d9e53de0ca
by: agent
evidence: |
  Scratch stack only, compose project litloft-r5-apphdr (not the :3000 stack), LITLOFT_PORT=3994,
  `docker compose -p litloft-r5-apphdr -f docker-compose.yml -f .r5/override.yml up -d --build
  backend frontend`. `.r5/override.yml` mounts scratch `drives.json`, `passwords.json` (`[]`),
  `.r5/data` and two scratch drives. Drives: `main` and `family-archive-2019-2026-shared`; each holds a
  folder `Trips` with 8 three-second mp4s and 4 three-page PDFs, and `main` also has one mp4 at its root
  (so 9 videos / 4 books). Scan and thumbnails finished. Browser: headless Chromium through Playwright
  1.58.2 (the frontend's copy); phone profile 375x812 with hasTouch+isMobile, desktop 640x800 and
  1280x800, locale en-US unless stated. Screenshots in
  docs/process/reviews/feature-addon-app-header/shots/ (names below). Unit tests and the diff were not
  read, per the task.
  Two smart folders were created through the UI in each drive (global search -> … -> Save as Smart
  Folder): "Trips" and "2025 summer trip, camera footage only". Query note: `in:` is the collection
  operator (docs/user-guide/search.md), and no collection named Trips exists, so a literal `in:Trips`
  would have made the folder empty; both folders use `path:Trips`, which scopes to the folder as
  intended.
  (1) 375, Video and Reading, both drives, default / "Trips" / long folder, chosen in the Target menu.
  Title alone on its row and whole in all 12 states (h1 y 84..116, 24px/32px, nowrap+ellipsis,
  scrollWidth = clientWidth; no button in that band). Target on the scope line at its end
  (box y 120..164, left edge right of the scope text). Count whole in every state (`· 9 videos` right
  edge 165.6 with the target at 244.8; `· 8 videos` with the long folder; `· 4 books`). No horizontal
  overflow: `document.documentElement.scrollWidth` = 375 in all 12 states and with the menu open
  (menu x 8..367). Which is cut: with the long drive and a short target the drive name is cut
  (102/221 px, 109/221 for Reading) and the target whole; with the long folder the target's name is cut
  (74.3/255 px) and the drive name is also cut on the long drive (100/221) but whole on `main`. Short
  folder `Trips`: 8 videos / 4 books, nothing cut on `main`. Two visible failures here: the target's
  box is capped at 40% of the column, so on `main` with the long folder 77 px of the row is blank
  between `· 8 videos` and the Target while the name reads `2025 su…`
  (detail-375-scope-row-blank-space.png; the Phone-Long artboard draws more of the name, with no gap); and the
  target icon has `flex-shrink: 1`, so it is squeezed from 14x14 to 4.08x14 px and collapses to a blob
  when the name is truncated (detail-375-app-target-icon-squashed.png against
  detail-artboard-Phone-Long-target-icon.png, where it stays a bullseye).
  Screens: 375-video-main-default.png, -target-trips.png, -target-longfolder.png, -target-menu-open.png;
  375-reading-main-*.png; 375-video-longdrive-*.png; 375-reading-longdrive-*.png.
  (2) 375 shelf pages (See all on Discover; /apps/video|reading/shelf?by=all&key=all&from=discover), both
  drives: sort on its own row at the right end (x 175.5..359, y 196..240), below the Target row
  (bottom 188) and directly above the list (top 248). It shows its current order, `Added (newest first)`
  with the sort icon and chevron. Transparent background, 0 px border, 14 px, colour rgb(98,98,91),
  44 px tall: the same quiet look as the Target. Repeating it in Japanese: 並べ替え: 追加日（新しい順）,
  178x44, icon 14 px, no fill, no border (375-shelf-video-main-ja.png).
  Screens: 375-shelf-video-main.png, 375-shelf-reading-main.png, 375-shelf-video-longdrive.png,
  375-shelf-reading-longdrive.png, 375-shelf-video-main-ja.png.
  (3) 640 and 1280, Video and Reading, both drives, default and long folder: Target at the right end of
  the title row (right edge 624 / 1264 = the header's content edge, same vertical band as the h1,
  y 84..112). Shelf pages: sort immediately left of the Target (640 sort right 497.8, target left
  509.8; 1280 1137.8 / 1149.8). Main pages: tabs under the header's lines at both widths (tabs y 144 at
  640, 168 at 375; title row bottom 116), and no tabs on the shelf pages. The long folder's name is whole
  at both widths (Target 307 px wide, no ellipsis). No overflow at either width.
  Screens: 640-video-main-default.png, 1280-video-main-default.png and the longfolder/-longdrive
  variants; 640-shelf-*.png, 1280-shelf-*.png.
  (4) Target control at 1280: aria-label "Target: All videos" and `getByRole("button", {name that
  string})` finds exactly one; innerText is only `All videos`, the word Target is not drawn. At rest:
  background transparent, border 0 px, box-shadow none, font-size 14 px, weight 400, colour
  rgb(98,98,91); 28x114 px at 1280 and 44 px tall on the phone profile. Hover: background
  rgb(246,246,243); it returns to transparent when the pointer leaves. While open: rgb(246,246,243),
  aria-expanded true, menu heading "Target", rows `All videos 9`, `2025 summer trip, camera footage
  only`, `Trips`, then `Manage…`.
  Screens: 1280-video-main-target-hover.png, 1280-video-main-target-menu-open.png.
  (5) Japanese through /settings -> 日本語 (NEXT_LOCALE=ja cookie, page reloads in Japanese), 375 Video
  default target: aria-label `対象: すべての動画`, role query for that name finds one, no `Target:`
  name; menu heading 対象, rows すべての動画 9 / 2025 summer trip… / Trips, 管理… . FAILURE: the name is
  cut to `すべての…` (name span 67 of 83 px) with 63 px of the row blank between `· 9 本の動画` and the
  Target, and the icon is squeezed to 11.36x14 px; the same name is whole (83/83) at 640 and 1280. The
  Reading app is cut too (`すべての…`, 65 of 69 px). Screens: 375-video-main-ja-default.png,
  detail-375-ja-target-name-cut.png, 375-ja-reading-main-default.png, 640-video-main-ja-default.png,
  1280-video-main-ja-default.png, 375-video-main-ja-target-menu-open.png,
  375-ja-video-longdrive-default.png.
  (6) Library tab, Video and Reading, 375 and 1280: the sort menu there keeps its filled/bordered shape,
  unlike the shelf page's quiet one. Video 166.8x44 at 375 and 179.5x38 at 1280, white fill with a 1 px
  border; Reading 218.7x44 and 218.7x36, filled rgb(229,229,224) with no border.
  Screens: 375-library-video-main.png, 375-library-reading-main.png, 1280-library-video-main.png,
  1280-library-reading-main.png (and the longdrive twins).
  (7) Chose `Trips` in the Target menu on `main`: localStorage `litloft.videoApp.target.main` = the
  folder id; reload -> `Target: Trips` and `· 8 videos`. Chose `Trips` on the long drive:
  `litloft.videoApp.target.family-archive-2019-2026-shared` = its id; reload keeps it, and `main` still
  reads `Target: All videos`. Manage… opened "Shown targets" with both folders checked; unchecking and
  re-checking one worked, Done closed it, and the Target menu then still listed three rows and choosing
  `Trips` applied. Screens: 1280-video-main-manage-targets.png, 1280-video-main-target-persisted.png.
  (Supplementary) Step 13's shape: one h1 on each app page and shelf page, inside a `<header>`, with two
  header elements (the app bar and PageHeader). I15 spot check: /settings (a PageHeader caller that is
  not AppHeader) at 375 and 1280 has one title line, no Target, no actions row and no overflow
  (375-settings-page-other-header.png, 1280-settings-page-other-header.png); a folder page
  (/drive/main/Trips) draws its own toolbar and no h1, unchanged.
  Agreed design (artboard screenshots at their widths: artboard-Main-1280.png,
  artboard-Phone-375.png, artboard-Phone-Long-375.png, artboard-Shelf-B-375.png). Matches: wide and
  phone header structure and order (icon tile, title over scope, quiet Target at the title row's end at
  wide and at the scope line's end at 375, tabs under), the breadcrumb + title + scope + target +
  quiet sort row order on the shelf, the quiet control (no fill, no border, muted 14 px, no 対象 word),
  and the sort menu showing its order with the icon and chevron. Visible differences other than the two
  failures: (a) the artboards draw a 48 px top bar with only a menu button, the app draws its own bar
  with search, quick note and profile, so the header sits lower in the app; (b) at 1280 the artboard's
  Target is 36 px tall, the app's is 28 px (same 14 px text, no fill); (c) the artboards' tabs are the
  addon's own (カレンダー/地図 with a 24 px gap), Video and Reading keep their own tabs, as the spec
  says; (d) the artboards' sidebar, calendar, map and pins are declared differences.
pending: |
  The Photo Diary addon page itself was not opened (out of scope for this run, per the task), so
  SPEC-ADDON-106's addon page is not covered here; the addon's own R-5 covers it. Not observed in
  ordinary use: the transient `<label>: …` accessible name while the saved folder is looked up. No item
  of PROJECT.md's agent_cannot_verify is touched by this change.

## Design differences

Accepted by the human on 2026-11-14, by id, from design-check.md:
D-1, D-2, D-3, D-4, D-5, D-6, D-7, D-8, D-9, D-10, D-11.
D-11 lists the Photo Diary screens, which this branch does not draw; they are checked on the addon's own branch.
