# Decisions

decision:
ran_in_app: yes
at: ae69b1f3d5c65c37a0fc21feb2004b52bcc4122d
by: agent
evidence: Playwright (headless Chromium) against a scratch stack of this tree at
  http://localhost:3996, NEXT_LOCALE=ja, drive Home Media (one drive, 43 files:
  4 videos 35-55 s, 2 PDF, 2 EPUB, 9 Markdown notes, 24 JPEG with EXIF dates),
  Photo Diary cloned at addons/photo_diary (main, aae9b99, declares icon "images").
  Stack: `LITLOFT_PORT=3996 docker compose -p litloft-r5-home -f docker-compose.yml
  -f .r5/override.yml` (backend, frontend). Ask (intelligence) and Notes (knowledge)
  did NOT appear with only backend+frontend: /api/addons/status drops an
  external_service addon when its proxy target_env is unset, so both services were
  started from their example overrides and INTELLIGENCE_SERVICE_URL /
  KNOWLEDGE_SERVICE_URL were set on the backend; after that Ask (priority 10),
  Notes (20) and Photo Diary (30) were the three primary addon entries. Profile
  "R5 Tester" set through /settings (UI), then history written through the public
  API with the same lit_viewer cookie: continue desk 京都旅行 2026-10 vlog (28/45 s),
  データ指向アプリケーション設計 PDF (2/3), Swift Concurrency 講義 3 (12/35);
  finished 夏の北海道 ハイライト (54/55 s) and 確定申告の手引き 2026 (2/2); opened
  only 週次ふりかえり 2026-11-09, 買い物リスト, P100323; 2 favourites; 1 like;
  Inbox 3 (three POST /api/drives/{drive}/files with arrival.source=r5).
  Screenshots in docs/process/reviews/feature-home-app-entries/shots/.
  D1 PASS (10, 11, 12, 13): the entry <nav> (aria-label アプリ) is at y=164
  (y=156 at 390) with the header ending at 148 and the first row at y=241 (350 at
  390), first child of the rows container under the page header at 1440 with the
  sidebar inline, at 1440 with it collapsed (メニュー), at 1024 (sidebar is an
  overlay, not drawn) and at 390 (isMobile, hasTouch). Present in the no-profile
  screenshots too (40, 41).
  D2 PASS (10, 13): order ライブラリ, 動画, 読む, 質問, ノート, フォトダイアリー,
  受信箱 3; lucide icons folder-tree, film, book-open, message-circle-question-mark,
  notebook-pen, images, inbox. Photo Diary draws lucide-images (a photo icon), not
  Package. The six app links' hrefs equal the sidebar's for the same labels
  (/drive/Home%20Media, /apps/video, /apps/reading, /addons/intelligence,
  /addons/knowledge, /addons/photo_diary); 受信箱 3 -> ?view=inbox. Full body text
  gives the Inbox link the accessible name 「受信箱 3」.
  D3 PASS (10, 11, 12): at 1440 (nav 1168 px wide) and 1024 (992 px) display:flex
  with flex-wrap, all seven tiles on one line, icon 18 px left of the label,
  padding 12px 16px, border-radius 12px, bg rgb(246,246,243); Inbox pill
  rounded-full bg-warm-light 20x20 after the label. No horizontal scroll anywhere:
  documentElement.scrollWidth == innerWidth (1440/1440, 1440/1440, 1024/1024,
  390/390) and the nav's scrollWidth == clientWidth.
  D4 PASS (13): at 390 the nav is display:grid with four 83.5 px columns, gap 8px;
  seven entries make two rows of 4 + 3; tile 72 px tall (82 px where
  フォトダイアリー wraps to two lines), icon 22 px above the 12 px label, padding
  12px 4px; Inbox pill at the tile's top-right (x 255-275, y 242 in a tile at
  x 199, y 236).
  D5 PASS (10, 14, 11): rows top to bottom 続きから, 最近見た, お気に入り, 最近追加,
  with the drive-home-sections (Pickup) slot between お気に入り and 最近追加; no
  Liked row (main h2 headings are only those four) and no request with liked=true
  (page requests: files?favorite=true, files?sort=created_at, watch-history
  filter=continue and filter=not_continue). Pickup did not draw a row in this
  stack: /api/addons/intelligence/pickup answered {"file_ids":[],"total":0} and the
  slot renders nothing when empty. 続きから: 京都旅行 2026-10 vlog, データ指向
  アプリケーション設計, Swift Concurrency 講義 3. 最近見た: 確定申告の手引き 2026,
  夏の北海道 ハイライト, P100323, 買い物リスト (and 週次ふりかえり 2026-11-09 with
  the sidebar collapsed, where the grid fits five); no file appears in both rows.
  The 4-vs-5 difference is the row's own width-based card capacity (SectionRow
  slices to columns x rows), not a missing response.
  D6 PASS (40, 41): profile cleared through /settings (プロフィールをクリア +
  confirm) and Inbox emptied through ?view=inbox (すべて済みにする, count 0): at 1440
  one row of six tiles (ライブラリ, 動画, 読む, 質問, ノート, フォトダイアリー) and at
  390 the same six as 4 + 2, no Inbox tile; then お気に入り, 最近追加 (Pickup empty
  again, so it draws nothing), no 続きから and no 最近見た and no watch-history
  request.
  D7 PASS (10, 11, 12, 13, 40, 41): header text 「ホーム Home Media 追加」 with the
  house icon tile (lucide-house) at 40 px, h1 ホーム, the drive name under it and
  追加 at the right (accent rgb(214,48,49), the only accent fill on the drive root).
  Check 1 also asked about sideways scrolling: none at any of the four widths.
  Check 2: no Liked row although 会議メモ was liked (sidebar's Liked view remains).
  Check 3: no profile + empty Inbox as above, at 390 and 1440.
  Check 4 (20, 21, 22, 23): on the 続きから card of データ指向アプリケーション設計,
  right-click -> card menu (コレクション, ダウンロード, コレクションに追加, コピー,
  カット, IDをコピー, 名前を変更, 移動, 続きから外す, 履歴から削除, ゴミ箱に移動) ->
  続きから外す. The card left 続きから immediately (one card left) and appeared in
  最近見た at position 2 (京都旅行 2026-10 vlog is newer) within 144 ms, without a
  reload. 40 DOM samples every ~50 ms over 2 s saw 0 skeletons in the 最近見た row
  (22 is the sample at ~91 ms, after the card left 続きから and before the response
  landed; 21 is the frame taken first after the click). Exactly one
  watch-history?filter=not_continue request followed the POST
  /api/files/V6FQ2J0Ff6FT/progress/dismiss; no toast. An earlier identical
  set-aside of 京都旅行 2026-10 vlog persisted across a later page load (it then
  sat first in 最近見た and out of 続きから).
  Check 5 (50-nav-*): clicking each entry from Home, with window.__r5marker set
  before the click, landed on ライブラリ -> /drive/Home%20Media (folder listing),
  動画 -> /drive/Home%20Media/apps/video, 読む -> /apps/reading, 質問 ->
  /addons/intelligence (Ask), ノート -> /addons/knowledge (12 notes),
  フォトダイアリー -> /addons/photo_diary (24 photos, calendar) and 受信箱 ->
  ?view=inbox (1 件); the marker was still "alive" after every click, so no full
  document reload.
  Check 6: see D7. Entry tiles carry no aria-current and no selected fill.
pending: Real iOS Safari layout of the entry row (the 36rem container query and
  44 px targets on a touch device), which agent_cannot_verify leaves to a human;
  the Pickup row with real indexed data (this stack's intelligence addon had no
  index, so the slot answered empty and drew nothing); audio/video playback was
  not part of this path. The design check against the four artboards is the
  design-checker's step, not recorded here.
