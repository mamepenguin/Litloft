# Decisions

decision:
ran_in_app: yes
at: eb8423fd3a806ab82782a16158ca1c5b6f4d2063
by: agent
evidence: |
  Small R-5 (two checks), 2026-11-17 01:32-01:40 UTC. Core worktree video_share-loft-storyboard at eb8423fd3
  with addons/intelligence checked out at 535679c (pointer not bumped in the index). Container clip.py and
  loft_media.py hash equal to 535679c's. Setup: nine gitignored links to the main checkout (drives.json,
  passwords.json, event-hooks.json, rclone.conf, docker-compose.override.yml, test_images, private, data,
  addons/intelligence/search-config.yml; .env not linked), `r5_stack.py clone --with-drives --port 3121`,
  `up`. Lookups were counted with a logging wrapper around /usr/local/bin/yt-dlp inside the clone's
  intelligence container only (installed 01:34:13, restored before teardown). Afterwards: poller stopped,
  `destroy`, all nine links removed. The :3000 stack was not touched; DBs were read only inside the clone's
  intelligence container. Real YouTube fetches were made. Before the run: 506 .lofts, 489 with no `clip`
  rows, all 506 already `clip_indexed` 1. Evidence files (scratchpad, not in the repo):
  /private/tmp/claude-502/-Users-libre-Sources-video-share/723a696c-2f95-489c-91d7-a12a7d1ffec0/scratchpad/r5/
  (ytdlp-calls.log, intelligence-log.txt, status-poll.txt, db-after.txt, scenes-7Th.jpg, scenes-7Th-zoom.png).

  1. Reference with no candidates: 7Th_4e1vliHX (16:41, YouTube hfAG0N9hns0; 0 clip rows, no frames dir).
     POST /api/addons/intelligence/files/7Th_4e1vliHX/reindex {"tasks":["frame_ocr"]} (X-Lit-Drive 動画)
     01:34:31 -> 200 already_queued (the backlog fetch was raised). Fetch processing 01:34:50-01:36:2x.
     - yt-dlp calls for that URL during the fetch: one `-J` at 01:34:50.124, one download (`-f ...`) at
       01:35:13.531. No other lookup.
     - Tile files written 01:34:56.237-01:35:13.485 (101 files under frames/7Th_4e1vliHX/tiles), `clip` rows
       created 01:35:13.486-01:35:13.522 (101 rows), log `youtube storyboard indexed: file=7Th_4e1vliHX
       class=rows sheets=12 tiles=101` at 01:35:13.530 — all before the download started (01:35:13.531).
     - After the fetch: clip_indexed 1 (was already 1 before), frame_scan_indexed 1, frame_ocr_read 1,
       frame_ocr_indexed 1, loft_fetch_failures 0.
     - Browser (http://video-share-loft-storyboard.localhost:3121/files/7Th_4e1vliHX, Scenes): timeline with
       tick marks across 0:00-16:41 and a grid of storyboard tiles at 0:00, 0:10, 0:20, ... with captions
       (scenes-7Th.jpg, scenes-7Th-zoom.png).
     - Also seen: the startup backlog fetch of kLe852pwBh6B (0 rows before) logged `youtube storyboard
       indexed: ... sheets=12 tiles=107` at 01:34:26.600, rows 01:34:26.538-.560, download 01:34:26.602.
       Its lookup ran before the wrapper was installed, so its lookup count was not observed.
  2. Reference with candidates: Y6pdy3NoVs9j (YouTube _O35QQJaU6Q, 134 clip rows from 2026-11-12).
     Same reindex 01:35:55 -> already_queued (raised). Fetch began 01:36:24: one `-J` at 01:36:24.577, the
     download at 01:36:26.098 (1.5 s later). No storyboard log line for the file; its 134 rows keep
     created_at 2026-11-12 15:01:16 and its 134 tile files keep mtimes 2026-11-12 15:00:52-15:01:16.

  Differences from the spec: none observed in the checked paths.
pending: |
  Not produced: storyboard-step failures (no storyboard / no duration in the answer, sheet download or
  embedding failure, CLIP model unavailable when only OCR is wanted), concurrency with a running CLIP
  regenerate leg (I5), and the Visual Index hook after the scan. That a fetch with candidates fetched no
  sheet from i.ytimg.com was inferred from the absent log line, unchanged rows/tiles and the 1.5 s
  lookup-to-download gap, not from network capture. YouTube is an external service (agent_cannot_verify);
  used here because the caller directed it.
