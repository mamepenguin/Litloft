# Decisions

decision: continue — the human, 2026-11-16, on r6 HUMAN_REVIEW_REQUIRED: 「続ける」, to add an independent review limited to the fetch (loft_media.py, youtube_source.py download, indexer.py queueing) before shipping
ran_in_app: yes
at: 0888520fcc2f25e3a201de3b99187f2b1659cb61
by: agent
evidence: |
  R-5 re-run after fixes, 2026-11-16 15:03 – 15:45 JST. Core worktree video_share-youtube-pipeline at
  0888520f with `addons/intelligence` checked out at 0eacc238 (pointer not bumped in the index). The
  container's app/youtube_source.py, app/workers/loft_media.py, app/routers/files.py and app/indexer.py
  hash equal to 0eacc23's; container yt-dlp 2026.10.26. Setup as the first run: gitignored links to
  the main checkout, `r5_stack.py clone --with-drives --port 3117`, `up`
  (http://video-share-youtube-pipeline.localhost:3117), OpenRouter key only through `with_secrets` as
  LLM_API_KEY_OPENROUTER; headless Chromium (Playwright) with every /api request and the Visual Index
  WebSocket frames logged (r5/rerun-network.txt). Afterwards: poller and browser stopped, `destroy`,
  links removed; the :3000 stack was not touched and its SQLite was never opened from the host (DB rows
  read with `docker exec` inside the clone's intelligence container). Real YouTube fetches and
  OpenRouter calls were made because the caller directed them. Records: r5/rerun-status-poll.txt
  (/status every 2 s), rerun-fetch-dir-watch.txt (loft_media/ every 2 s), rerun-ytdlp-args.txt,
  rerun-long-video-rows.txt, rerun-cooking-frame-texts.txt, rerun-ask-answer.txt,
  rerun-intelligence-log.txt, rerun-log-grep.txt, rerun-network.txt, rerun-NN-*.png.

  1. Long download (EKCONLkv6vZZ, the 87-min .loft of the first run; started from the backlog).
     - yt-dlp started 15:04:32 with `-f bv*[height<=720][protocol=https] --http-chunk-size 10M
       --no-playlist --ignore-config -o /intelligence-data/loft_media/EKCONLkv6vZZ.part.%(ext)s
       <stored youtube.com/watch URL>`; no cookie, credential or account option (rerun-ytdlp-args.txt).
     - .part size over time: 10.2 MB 15:04:34, 14.4 MB :36, 24.8 MB :51, 31.4 MB 15:05:09, 45.3 MB :11,
       65.4 MB :13, 86.0 MB :15, finished EKCONLkv6vZZ.mp4 98.2 MB at 15:05:17. Total ~45 s (first run:
       ~15 KB/s). Uneven: ~14 MB in the first 4 s, ~17 MB over the next 33 s, then 45 -> 98 MB in ~6 s.
       File: AV1 1280x720, 5220.26 s. Time limit for it is 1.5 x 5220 = 7830 s.
     - Queue paused at 15:05:29 (admin widget, rerun-02), 12 s after the scan's ffmpeg had started. While
       paused the scan stayed open on the file with intelligence at ~7% CPU and idx_scan unchanged for
       17 min (the fetch's stages wait on the pause, as in the first run). Resumed 15:22:56 (rerun-11).
       Scan written 15:23:17 (video_frame_scans: seconds 5220), OCR 15:23:53 (one video_frame_texts row,
       10.0-5215.0 s, the show's title card), file gone from loft_media/ at 15:23:53. Row: loft_source
       youtube, failures 0, frame_scan_indexed 1, frame_ocr_read 1, frame_ocr_indexed 1, duration 5220.
       Small pictures 0/10000/5215000.webp under frames/EKCONLkv6vZZ/.
     - Further backlog fetches after it each downloaded in 4-11 s (43-183 MB) and the fetch dir emptied
       after each. Logs: 0 lines with googlevideo, youtube.com, youtu.be, watch?v=, sk-or, Bearer, either
       video id (rerun-log-grep.txt). Successful fetches log nothing.
  2. Cooking video (jtAY-uo_NR0) imported again through YouTube & Feeds > ソースを追加 (rerun-03) and
     registered by intelligence after a library 再スキャン (rerun-04, pre-existing): file 0IRePg1aFJhi.
     Fetched 15:23:53-15:24:00 (5.7 MB). Row: youtube, failures 0, three flags 1, 1 scan row, 7 frame
     text rows identical to the first run (no row for 30-40 s; rerun-cooking-frame-texts.txt).
     File Ask with gpt-6-luna: POST 06:27:00Z, OpenRouter calls 06:27:04/07/14, "frame requests: 3
     calls, 8 frames" 06:27:21 (~21 s) (rerun-12, rerun-ask-answer.txt). Answer lists 豆腐150g,
     めんつゆ(3倍濃縮)小さじ2, 600W 1分30秒 / 500W 1分50秒, ラップ, 天かす, かつお節, 小ネギ, 白いりごま.
     ごま油 小さじ1 is missing (known, deferred). It also lists "水 5ml" as an ingredient: the frame text at
     0:20 is "5ml / めんつゆ(3倍濃縮)小さじ2" (the 5 ml measuring spoon); the first run's answers had no water.
  3. R5-3 (queue paused; 0IRePg1aFJhi with its CLIP task queued (clip waiting 1) and its fetch queued at
     -10 (loft_media waiting 502 -> 503 at registration)): インデックス詳細 > 画像分析（CLIP）再生成 >
     confirm (rerun-06/07). POST /reindex {"tasks":["clip"]} -> 200 {"status":"already_queued",
     "tasks_reset":[]}; loft_media waiting stayed 503.
     R5-2 (9ftP9exex9UF: CLIP インデックス済, fetch queued at -10): same action (rerun-08) -> 200
     {"status":"already_queued","tasks_reset":[]}; loft_media waiting stayed 503; clip waiting went 1 -> 2.
     After resume the order of fetches was EKCONLkv6vZZ (already running) -> 0IRePg1aFJhi (15:23:53) ->
     9ftP9exex9UF (15:24:02), ahead of the 501 waiting backlog .lofts, then backlog items. Each of the two
     appears in loft_media/ and as processing once only (no second fetch). 9ftP9exex9UF afterwards:
     youtube, failures 0, flags 1/1/1, 117 frame text rows.
  4. R5-1. Cooking .loft page opened 06:29:33Z: one clip-timestamps and one visual-index request on mount.
     シーンを作る 06:29:38 -> generate POST, one visual-index GET after it, then exactly one visual-index GET
     after each of 9 Visual Index WebSocket events (started is not followed by one; 8 progress + succeeded
     at 06:29:51.6). 8/8 scenes succeeded in 14 s. Page left open until 06:44:50: 30 addon-policies
     refetches (every ~31 s) and zero visual-index requests after 06:29:51.632 (rerun-network.txt).
     Pictures only from scene-tile (18 requests), no frame route (rerun-13, rerun-14).
  5. Native spot check (vb74YwPHV6jx): plays from /api/files/.../stream, index-details loft_source null,
     visual-index eligible, Scenes section draws from the frame route (18 requests), 2 visual-index and
     2 clip-timestamps requests over two loads (rerun-09, rerun-10). One tile (5:14) is drawn as a plain
     dark block in the screenshot.

  Differences from the spec: none observed in the checked paths. Observed and recorded, not judged:
  the Ask answer adds "水 5ml" (item 2); ごま油 still missing (known limit).
pending: |
  Not produced: the cap at 3 failures, a no-rendition video, the disk guard, the 120 s stall and the time
  limit actually tripping (the long download finished in ~45 s), a kept small picture drawn on screen by
  the scene-tile route. A whole backlog run was not observed (~500 .lofts). OpenRouter / YouTube are
  external services (agent_cannot_verify); used here only because the caller directed it.

## First R-5 run (history; superseded by the fields above)

    ran_in_app: yes
    at: 79a6169c8dd6e73e384bf6ddcbfba73a3d5561ac
    by: agent
    evidence: |
      R-5 run 2026-11-16 13:12 – 14:04 JST. Core worktree video_share-youtube-pipeline at 79a6169c with
      `addons/intelligence` checked out at a5702c1 (feature/youtube-full-pipeline; the core pointer is not
      bumped). The container's app/workers/loft_media.py and app/indexer.py hash equal to a5702c1's;
      container yt-dlp 2026.10.26. Setup: gitignored links to the main checkout (drives.json,
      passwords.json, event-hooks.json, rclone.conf, docker-compose.override.yml, test_images, private,
      data, addons/intelligence/search-config.yml), `r5_stack.py clone --with-drives --port 3117`, `up`
      (http://video-share-youtube-pipeline.localhost:3117); OpenRouter key passed only through
      `with_secrets` as LLM_API_KEY_OPENROUTER. Driven with headless Chromium (Playwright) because the
      Chrome extension was not connected. Afterwards: `destroy`, links removed; the :3000 stack was not
      touched. Real YouTube fetches and OpenRouter calls (external services, agent_cannot_verify) were made
      because the caller directed them. Records under r5/: fetch-dir-watch.txt (loft_media/ listed every
      0.5 s), status-poll.txt (/status every 2 s), intelligence-log-full.txt and intelligence-log-loft.txt,
      watched-rows*.txt (DB rows read inside the container), ask-answers.txt, numbered screenshots.
    
      1. Normal flow, the cooking video (YouTube jtAY-uo_NR0, found with ytsearch1:, title matches, 77 s).
         - Start: log "Reopened 504 unclassified loft(s) for fetching"; the widget shows 「YouTube の取得」 with
           the Download icon (01). A backlog fetch (Rick Astley, kLe852pwBh6B) started at once (native frame
           queues were empty). Queue paused at 13:13:27: the running download finished (.part -> .mkv
           13:15:16) and the .mkv waited; no new fetch started while paused.
         - Imported through YouTube & Feeds > ソースを追加 (02). The .loft reached intelligence only after a
           drive rescan (core registers it without scan.complete; pre-existing). Row _3_ovFrTI-yg:
           duration 77 (already filled by Media Import, so the NULL->lookup fill was checked on other files),
           loft_source NULL, flags 0.
         - After resume a 87-min backlog .loft (EKCONLkv6vZZ) downloaded at about 15 KB/s; the cooking fetch
           waited behind it (one at a time). Restart of intelligence: log "Removed 1 leftover loft
           download(s)" and loft_media/ emptied before any fetch; queue paused again; CLIP 再生成 in the
           Index details dialog (07); resume 13:21:17.
         - Fetch: 13:21:18 start, .mkv 10.8 MB at 13:21:26, scan flag 13:21:31, OCR 13:21:37, file deleted
           13:21:36. Row: loft_source youtube, failures 0, all three flags 1, one video_frame_scans row,
           7 video_frame_texts rows, small pictures 0.webp…70000.webp written 13:21:29-30.
         - Search めんつゆ: the cooking .loft ranks first with 内容一致 (09). Find (箇所): かつお節 -> 0:50
           「画面内の文字」; めんつゆ -> 0:20 "5ml めんつゆ(3倍濃縮)小さじ2"; 天かす -> 1:00 (10-12).
         - Logs: 0 occurrences of the video id, googlevideo, youtube.com, youtu.be, sk-or, Bearer.
           Successful fetches log nothing; failures name only the file id.
      2. File Ask (gpt-6-luna), 2 runs, ~19 s each, "frame requests: 2 calls, 8 frames". Ground truth read
         from the frames first: 豆腐150g, めんつゆ(3倍濃縮)小さじ2, ごま油小さじ1, ラップ/600W 1分30秒(500W 1分50秒),
         天かす, かつお節, 小ネギ, 白いりごま. Both answers list every ingredient and step except ごま油 小さじ1
         (13, 14, ask-answers.txt). ごま油 is not in the stored frame OCR either; the stored text has one
         caption per 10 s window and none for 30-40 s (missing ごま油, ラップ/レンジ, トッピング, 天かす, 小ネギ,
         白いりごま as captions). Drive-wide Ask: めんつゆ question answered 3倍濃縮 小さじ2 from the .loft (29).
      3. Backlog order. With a native frame_ocr reindex (vb74YwPHV6jx) pending across a restart:
         13:43:57-13:44:45 native frame_ocr processing, loft_media 503 waiting / 0 processing; the backlog
         fetch started 13:44:45 right after. A native frame_scan queued during a fetch ran beside it
         (13:59:15). Non-YouTube: Media Import refused a Vimeo URL (yt-dlp login, pre-existing); a generic
         URL gave "HTML5 Video (1).loft" (OesNlQ_bOTvE) -> loft_source other, three flags 1, no lookup log,
         nothing in loft_media/; index-details loft_source "other", dialog without the frame OCR row (33),
         visual-index eligible false, generate 404, frame_ocr reindex 422 (its detail text "…unavailable
         while features.video_frame_ocr is false" is the existing wrong-type message shared with native
         files). /status: between 13:56:09 and 13:56:31 pending_scan fell 501 -> 500 while idx_scan stayed
         161 as the generic .loft was classified other (no longer counted, not counted as indexed).
         Duration NULL -> lookup: KvqnWhr0kXaH 150, x3Z5F-1zGklE 460. Widget order with three active rows:
         画像分析（CLIP）, 場面の切り替わり, then 「YouTube の取得」 with the Download icon (43).
      4. Scenes of the cooking .loft: visual-index eligible; シーンを作る -> generate accepted, 8/8 scenes
         succeeded in 14 s (gemma4:e4b local). Scene at 30 s used the kept 30000.webp (unchanged); the other
         7 wrote new small entries 13:35:58-13:36:11 (from YouTube). visual-index requested on mount
         (04:35:47), after generate (04:35:58), once per Visual Index WebSocket event during the run (each
         in-run request follows one addon-events POST in the log, 04:36:02-04:36:12), and also at 04:36:17
         and 04:36:48 with no addon event before them (see R5-1). Pictures only from scene-tile, no frame
         route (15, 16, 20). Marks and tile dots sit at section_start, the same as a new native run (22).
         The scene card draws no picture, as on a native video. A kept small picture was not seen drawn on
         screen: the cooking .loft has 77 storyboard tiles covering every second, so every tile is a
         storyboard tile; a .loft without storyboard (Rick Astley) answers generate 409 waiting_clip and
         its section only says it is waiting (18). Through the API, Rick's scene-tile t=10 returns bytes
         equal to the kept 10000.webp and t=5 answers 404. Index details of the YouTube .loft offers
         動画内の文字 (34): accepted, a second click already_queued.
      5. Failure path: a .loft pointing at a nonexistent id, written into the clone drive (Media Import
         refuses such URLs). First fetch after a restart: "loft_media lookup failed (file ceyaHesF7dwz)",
         count 0, no download. After a successful lookup in the same process: same log line, count 1,
         duration stays NULL. Native: scene-tile without tile 404; a native rescan wrote no small picture;
         index-details loft_source null.
    
      Differences from the spec:
      - R5-1 (revised SPEC-ADDON-089 I7, "at no other time"). After the cooking run succeeded (two
        addon-events at 04:36:12, two visual-index requests at 04:36:12), the open page requested
        visual-index again at 04:36:17 and 04:36:48 with no addon event before either; the 04:36:48 one
        follows a drive-policy lookup at 04:36:48.628. Trigger not identified from the page; the
        WebSocket-event effect in ScenesSectionContainer.tsx lists policy.isLoading / policy.enabled among
        its dependencies, so a policy reload re-running it with the last event is a possible cause.
      - R5-2 (I13). CLIP 再生成 of the unclassified cooking .loft while its fetch was queued at -10 answered
        `accepted` with tasks_reset [clip], not `already_queued`, and the loft_media waiting count rose
        504 -> 505: a second entry at 100 was added and the -10 entry stayed (07, status-poll 13:20:44).
      - R5-3 (I13). CLIP 再生成 of a .loft whose CLIP task was itself queued answered `already_queued`, and
        its queued fetch stayed at -10 (37: ceyaHesF7dwz after a restart; the next fetch to run was another
        backlog item).
      - R5-4 (summary / I4, the motivating case). The ingredient missed before the change (ごま油 小さじ1)
        is still missing from both Ask answers and from the stored frame OCR.
    pending: |
      Not produced: the cap at 3 failures, a no-rendition video, the disk guard, the stall and time
      limits, a kept small picture drawn on screen by the scene-tile route. A whole backlog run was not
      observed (504 .lofts).
