# Decisions

decision:
ran_in_app: yes
at: 0104ab9074c8033fbdc546996096b407c9b814ed
by: agent
evidence: |
  Environment: compose project `litloft-r5-b2b` on port 3997, built from this worktree
  (backend/frontend and `intelligence` from `./addons/intelligence` at b40c49a). Scratch
  `drives.json` `[]`, `passwords.json` `[]`, `data/setup_completed`, and a `.r5/drive`
  mounted at `/app/drives/scratch`. The scratch override also set
  `CORE_INTERNAL_SECRET` on backend and intelligence so the addon could touch the core's
  restart-pending flag; without it the save reported `core_notified` failure. UI driven
  in ja-JP with headless Chromium at 1440x900. Screenshots under
  `docs/process/reviews/feature-frame-ocr/shots/`.

  Scratch drive:
  - `slides.mp4`, the first 90 s of the trial's `eyHnGEqVij8.mp4` (300–390 s), stream
    copied; Japanese handwriting on slides.
  - `jis-z-2801-scan.pdf`, the trial's image-only JIS Z 2801 (28 pages, text layer 0
    characters).
  The addon indexed both: 9 `video_frame_texts` rows (read frames at 0,10,…,80 s), 28
  `pdf_page_ocr_texts` rows (all pages) and 9 + 28 `text_content` rows/`fts_text_content`
  rows.

  1. Settings (r5-01-settings.png, r5-09-settings-saved.png, r5-10-restart-banner.png).
  `/admin/settings` → Intelligence: the feature table lists 「動画内の文字」 and
  「スキャンしたページの文字」, each with オフ / 手動 / インデックス時 and default
  インデックス時. Selecting 「動画内の文字」 = オフ and 保存 saved
  `video_frame_ocr: "false"` (the section showed 「この画面の設定がsearch-config.ymlより
  優先されています」). After adding `CORE_INTERNAL_SECRET` to the scratch override and
  saving again, the core dashboard showed 「保留中の変更があります。反映には再起動が
  必要です」 with the restart command. Saving 「動画内の文字」 back to インデックス時
  returned `core_notified: "ok"`, and `data/restart_pending` existed. The dashboard's
  Index Status showed 「動画内の文字 1 / 1 件」 and 「スキャンしたページの文字 1 / 1 件」.

  2. Index details (r5-02-index-details-video.png, r5-02-index-details-pdf.png). On the
  video, ファイル操作 → インデックス詳細 lists メタデータ抽出 / 画像分析（CLIP） /
  文字起こし（Whisper） / テキスト抽出 / 「動画内の文字」 (インデックス済, 再生成). On
  the scanned PDF it lists メタデータ抽出 / テキスト抽出 / 「スキャンしたページの文字」
  (インデックス済, 再生成); no picture-OCR row.

  3. Find in file (r5-03-find-video.png, r5-04-find-video-time.png,
  r5-05-find-pdf.png, r5-13-pdf-page-open.png). On `slides.mp4`, find 「最小解」 returned
  「6 件」, all rows 「00:00 / 00:10 / 00:20 / 00:30 / 00:50 / 01:10」 over
  「画面内の文字」 with the recognised excerpt. Choosing the 00:10 row set the player's
  `currentTime` from 0 to 10 s (still paused). On the scanned PDF, find 「抗菌」 returned
  rows 「p. 5」, 「p. 6」, 「p. 7」, … with OCR excerpts. Choosing a search passage
  「p.8」 opened `/drive/scratch?file=vl-QfIGd8sfA&page=8`, the page-number input read 8,
  and no mark was drawn (0 find marks; the page is shown). `document-text?start=5`
  returned page 5's OCR text (「Z 2801:2010 / 目 次 / … / 5.8 試験結果 / …」,
  extractor `pymupdf4llm`).

  4. Search passages (r5-06-search-files.png, r5-07-search-passages.png,
  r5-08-passage-opened.png). Searching 「最小解」 found 2 files and, in 箇所, 10 passages;
  the video's three passages read 「0:50 / 1:10 / 0:10」 over 「画面内の文字」 with the
  excerpt and a frame image (`/api/addons/intelligence/files/s10SNS-isncF/frame?t=50`,
  200 `image/webp`). Clicking one opened
  `/drive/scratch?file=s10SNS-isncF&t=50` with the player at 50 s. The scanned PDF's
  passages read 「p.1 / p.4 / p.27 / p.28」 over its OCR excerpt.

  5. Scanned-page text is searchable (r5-13-pdf-page-open.png). Searching 「抗菌」 returned
  `jis-z-2801-scan.pdf` with OCR text and page links; choosing a passage opened page 8.
  `document-text` returned the stored OCR text for page 5.

  6. Turning 「動画内の文字」 off (r5-11-mode-off-search.png,
  r5-12-mode-off-index-details.png). After saving オフ and restarting the intelligence
  container, the status read `video_frame_ocr: "false"`; searching 「最小解」 still found
  both files, the video still had 6 「画面内の文字」 find rows, and the video's Index
  details no longer offered 「動画内の文字」. Turning it back to インデックス時 and
  restarting restored the row; the stored text was never removed.

  7. Ask / single-file question: no LLM profile is configured (`llm.provider: disabled`),
  so this was not exercised; see pending.

  No difference from the spec was seen in these paths. The locators shown are 「mm:ss」
  in the find list (zero-padded minutes, e.g. 「00:10」) and 「m:ss」 in the passage view
  (e.g. 「0:10」 and 「1:10」), both time locators over 「画面内の文字」.
pending: Ask and the single-file question over frame text and scanned pages (no LLM profile configured); video/audio as heard and seen, and subtitle timing; playback over the real home LAN and on other household devices; addon calls to real third-party services; the production Mac mini (measurements were made on this development Mac).
