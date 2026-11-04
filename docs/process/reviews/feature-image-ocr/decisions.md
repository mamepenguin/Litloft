# Decisions

decision:

ran_in_app: yes
at: b480c193688f32879ffe6b5f956988800cbdc6fc
by: agent
evidence: |
  Environment: compose project litloft-r5-b1 (LITLOFT_PORT=3995), drive `scratch`,
  `.r5/override.yml` + `.r5/search-config.yml`, LLM profile default = gemma4:e4b on the
  host's ollama. First launch opened on the drive home directly; `/setup` did not appear
  (data/setup_completed present). UI language ja via NEXT_LOCALE=ja. Screenshots under
  docs/process/reviews/feature-image-ocr/shots/.

  1. Search (1440x900). Uploaded slide-budget.png, sign-ferry.jpg, receipt.png,
  whiteboard.heic, plain-field.png to scratch/inbox (05-uploaded.png). All five were
  indexed and OCR-read within ~30 s.
  - 倉庫: 15 results, all with only the サムネイル badge; slide-budget.png present (10th)
    but no 内容一致 badge. The search response for 倉庫 had
    match_types ["clip_thumbnail"] only, i.e. it was not found by its text. Its stored
    text is "2027年度予算会議 / 議題: 倉庫の移転費用 / 締切は12月15日" (seen in the
    response for 倉庫の移転費用 and in the Find page). Control: 納期 (2 characters, in
    notes-winter.md) also failed to match the document, so the 2-character keyword
    behaviour is not OCR-specific. 38-query-倉庫.png, 38-query-納期.png.
  - Kirishima: 1 result, sign-ferry.jpg, badges サムネイル + 内容一致,
    match_types clip_thumbnail+text_content_keyword. Quote returned by the app:
    "Ferry to Kirishima / Departs 08:40 daily / Platform 3". 38-query-Kirishima.png.
  - 那須高原: 14 results, whiteboard.heic first with サムネイル + 内容一致,
    match_types clip_thumbnail+text_content_keyword. Quote: "ホワイトボード /
    次回の合宿は那須高原 / 持ち物: 雨具と懐中電灯". 38-query-那須高原.png.
  - チーズケーキ: 1 result, receipt.png, サムネイル + 内容一致,
    match_types clip_thumbnail+text_content_keyword. Quote: "喫茶ペンギン /
    ブレンドコーヒー480円 / チーズケーキ520円 / 合計1,000円". 38-query-チーズケーキ.png.
  - No recognised-text excerpt is rendered in the search results: grid and list cards
    (DOM inspected for Whiteboard) contain only the badge row; the OCR quote exists in
    the response payload only. The Find page shows a one-line snippet, but for these
    results it was the title ("sign ferry Sign-ferry", "whiteboard Whiteboard",
    "receipt Receipt"), not the OCR text. 07/08/09-search-*.png, 34-find-*.png.
    Superseded for the three queries that matched a picture by its text by the re-run of
    checks 1 and 2 at the end of this file.
  - Exact search: the search UI offers no exact-match mode (filters: file type; more:
    選択モード only). The normal search found 1,000円 on receipt.png with
    match_types clip_thumbnail+text_content+text_content_keyword and badge 内容一致.
    38-query-1,000円.png.

  2. Ask 「合宿の持ち物は？」 (1440x900). Answer: 「提供されたファイル情報の中には、
  合宿の持ち物に関する具体的な記載は見当たりませんでした。」 Sources: whiteboard.heic,
  sign-ferry.jpg, notes-winter.md; citations: []. Reproduced twice. The whiteboard source
  was retrieved (match_types clip_thumbnail+text_content) but its recognised text was not
  used. Control: 「冬の備品発注の納期は？」 answered 「1月10日です」 with a citation
  quoting notes-winter.md, so retrieval+LLM work for documents. A third question,
  「請求書の合計金額は？」, answered 「金額を特定することはできません。」 with no
  citations although batch-c.png reads 「請求書 合計 38,500円 支払期限 12月5日」.
  24-ask-answer.png. The 「合宿の持ち物は？」 finding is superseded by the re-run of
  checks 1 and 2 at the end of this file; the other questions were not re-run.

  3. Index details (1440x900), opened from the inspector's ファイル操作 → インデックス詳細:
  - receipt.png: メタデータ抽出 / 画像分析（CLIP） / 画像の文字, each インデックス済 with
    再生成. 16-index-details-receipt.png.
  - whiteboard.heic and plain-field.png: same three rows, 画像の文字 インデックス済.
    25-index-details-whiteboard.png, 25-index-details-plain-field.png.
  - notes-winter.md: メタデータ抽出 and テキスト抽出 only; no 画像の文字 row.
    25-index-details-notes-md.png.

  4. Admin dashboard (1440x900). 画像の文字 5 / 5 件 100% after the first five pictures
  (22-admin-dashboard.png), then 11 / 11 and 16 / 16 件 100% after the later uploads
  (32-admin-status-after-batch.png). plain-field.png, which has no text, is counted done
  and its row reads インデックス済. The queue section lists an 画像の文字 queue with
  "0件処理中 / 0件待機" (31-admin-queues.png). Queue reached processing=3/waiting=3 while
  a batch was read and 0/0 after.

  5. Admin settings → Intelligence: a 画像の文字 row with the three choices
  オフ / 手動 / インデックス時 (26c-settings-intel.png), default インデックス時. Saving
  手動 raised 「保留中の変更があります。反映には再起動が必要です」 (the banner lists
  drives.json / passwords.json / docker compose restart backend) and wrote
  "image_ocr": "manual" to data/addons/intelligence/features-overrides.json
  (27-settings-mode-manual.png, 28-restart-banner.png). After `restart intelligence`, a
  new picture with text (trip-notice.png, Pillow + ヒラギノ角ゴシック W6) was uploaded and
  NOT read: its 画像の文字 row was 未処理, and みなと水族館 matched only clip_thumbnail
  (25-index-details-trip-notice-manual.png). Its 画像の文字 再生成 (confirm dialog
  「画像の文字 を再生成しますか？…」) was accepted (tasks_reset ["ocr"]); afterwards a
  fresh index-details open showed インデックス済 and みなと水族館 matched
  clip_thumbnail+text_content+text_content_keyword. The open dialog itself still showed
  未処理 20 s after the accepted reindex; reopening refreshed it.
  29c/29d, 25-index-details-trip-notice-reindexed.png.
  Setting オフ (written as "image_ocr": "false"), restarting: the 画像の文字 row is gone
  from receipt.png's index details (メタデータ抽出 / 画像分析（CLIP） only), and
  チーズケーキ still returned receipt.png with 内容一致 + text_content_keyword and the
  same OCR quote (27-settings-mode-false.png, 25-index-details-receipt-off.png).
  Restored インデックス時 and restarted; features-overrides.json has
  "image_ocr": "on_index" and the select reads インデックス.

  6. 390x844. Index details dialog box x=16 width=358 inside a 390 viewport; document
  scrollWidth 390 = clientWidth 390; each row sw == cw; no overlap. Labels and the
  再生成 button wrap onto two lines at this width (36-mobile-index-details.png).
  Settings: page scrollWidth 390 = clientWidth 390, the features table scroller 324 wide
  with sw == cw, the 画像の文字 select inside its row; the closed select shows
  「インデックス」 with the trailing 時 clipped (37-mobile-settings.png).

  7. Responsiveness and memory. While a batch of five pictures was read (CPU ~430-530%),
  navigation in the same browser stayed usable: library 40-85 ms, opening a file page
  ~440-455 ms, no freeze (33-responsiveness-end.png). `docker stats --no-stream`
  (intelligence container): 100 MiB before any upload (fresh start); 1.203-1.256 GiB
  while the first batch was read at t+0-6 s; 1.79-1.96 GiB while the second batch was
  read; 2.17 GiB ~6 min after reading; 1.21 GiB after the idle release (log
  "app.workers.ocr: Releasing OCR engine (idle timeout)" at 16:58:25), which is the
  resident set with the other models loaded. No pending parts from agent_cannot_verify
  were exercised by these checks.

  Re-run of checks 1 and 2 only, after the approved I11/I12 revision (a picture's
  recognised text in Ask and single-file context, and as a picture's search excerpt).
  This run is at b480c193688f32879ffe6b5f956988800cbdc6fc; the run above was at
  2e3829d078d1ae56d1d6573efc01370c248ee88e. Same compose project (litloft-r5-b1),
  LITLOFT_PORT=3995, drive `scratch`, 1440x900, UI ja, LLM default gemma4:e4b on the
  host's ollama. The five pictures were already in scratch/inbox and OCR-read, so
  nothing was uploaded; reconciliation reported added=0, resumed=0.

  1. Search (results page, grid view, excerpts under the badge row).
  - 倉庫 (15 results): slide-budget.png is in the list but matched clip_thumbnail only,
    no 内容一致 badge and no excerpt; its row reads "PNG / Slide-budget / 1200 × 700 /
    12 時間前 / サムネイル". 納期 and 雨具 (each 2 characters) still match no text for
    notes-winter.md and whiteboard.heic either, so this is unchanged, not OCR-specific.
    r1-query-倉庫.png. The earlier 倉庫 finding is not superseded. A longer query,
    倉庫の移転費用 (4 results), finds the same picture with text_content +
    text_content_keyword and the excerpt "2027年度予算会議 議題: 倉庫の移転費用
    締切は12月15日" (r1-query-倉庫の移転費用.png).
  - Kirishima (1 result): sign-ferry.jpg, サムネイル + 内容一致, excerpt
    "Ferry to Kirishima Departs 08:40 daily Platform 3". r1-query-Kirishima.png.
  - 那須高原 (14 results): whiteboard.heic first, サムネイル + 内容一致, excerpt
    "ホワイトボード 次回の合宿は那須高原 持ち物: 雨具と懐中電灯".
    r1-query-那須高原.png.
  - チーズケーキ (1 result): receipt.png, サムネイル + 内容一致, excerpt
    "喫茶ペンギン ブレンドコーヒー480円 チーズケーキ520円 合計1,000円".
    r1-query-チーズケーキ.png.
  - Control, the .md already in the drive (notes-winter.md, query 冬の備品発注,
    14 results): badge 内容一致 and the excerpt "# 冬の備品発注メモ 会議メモ:
    冬の備品発注について。納期は1月10日。担当は佐藤。" — the same plain-text shape as
    before, and the card still shows the markdown body preview where a picture shows
    its thumbnail. r1-query-冬の備品発注.png.
  - Excerpts render as a two-line clamped paragraph below the badge row, with no page
    locator, the same element a plain-text hit uses. The earlier "no recognised-text
    excerpt is rendered" failure is superseded for the three pictures matched by text.
    (Exact wording of each excerpt is in shots/r1-query-<query>.txt.)

  2. Ask 「合宿の持ち物は？」 on the Ask page (質問 → Ask). Answer:
  「次回の合宿に持っていくものは雨具と懐中電灯です。」 (6987 ms), one citation:
  whiteboard.heic, "chunk 0", quote "ホワイトボード 次回の合宿は那須高原 持ち物:
  雨具と懐中電灯". Source chips: batch-b.png, whiteboard.heic, batch-d.png,
  load-b.png, trip-notice.png; the /ask stream reported 5 sources, all
  clip_thumbnail + text_content. r1-ask-kishuku.png. The earlier Ask failure is
  superseded.
  receipt.png's file page (inspector): the tabs offered are 情報 and 関連 only; no
  質問 tab, and the AI button opens 説明を作成 / AIタグ候補を作成 with no question box, so
  「合計はいくら？」 was not asked. Recorded as instructed, not a failure of this check.
  r1-receipt-filepage.png, r1-receipt-ai.png.

  Verdict: check 1 fails on 倉庫 (the picture is listed by thumbnail similarity only,
  with no excerpt); Kirishima, 那須高原, チーズケーキ and the .md control pass. Check 2
  passes. Nothing else was re-walked.
pending: none
