# Decisions

decision:
ran_in_app: yes
at: 66ca318279e7e3f3e8a455e4d3f7c7a146481085
by: agent
evidence: |
  Small R-5 (two checks), 2026-11-16 10:43-11:04 UTC. Core worktree video_share-loft-pacing at 66ca318
  with addons/intelligence checked out at e74d60a (pointer not bumped in the index). Container
  loft_media.py, indexer.py and youtube_source.py hash equal to e74d60a's. Setup: gitignored links to the
  main checkout (drives.json, passwords.json, event-hooks.json, rclone.conf, docker-compose.override.yml,
  test_images, private, data, addons/intelligence/search-config.yml; .env not linked), `r5_stack.py
  clone --with-drives --port 3119`, `up`. Afterwards: pollers stopped, `destroy`, all nine links removed.
  The :3000 stack was not touched; DBs were read only inside the clone's intelligence container. Real
  YouTube fetches were made. Fetch start/end times come from the intelligence /status
  (loft_media.processing), polled inside the container every 0.5 s (r5/status-poll.txt) and then every
  0.05 s (r5/status-poll-fast.txt); successful fetches log nothing. Log lines: r5/intelligence-loft-log.txt.

  1. Pacing (backlog of 504 YouTube .lofts, all loft_fetch_failures 0 at start). Each row is end of one
     backlog fetch -> start of the next:
       0.5 s poll:  10:44:07.3 -> 10:44:37.2 (29.9 s), 10:45:47.2 -> 10:46:17.3 (30.1 s),
                    10:47:41.5 -> 10:48:11.2 (29.8 s)   (each +-0.5 s from the poll interval)
       0.05 s poll: 10:53:43.679 -> 10:54:13.707 (30.03 s), 10:55:09.209 -> 10:55:39.282 (30.07 s),
                    and across the failures below 10:57:05.385 -> 10:57:35.421 (30.04 s),
                    10:57:35.607 -> 10:58:05.676 (30.07 s).
     The first fetch after startup began at once (no previous result). No start within 30 s of an end.
  2. Refusal backoff. Right after a success (IfIhGdZOIDcT ended 10:56:35), YouTube hosts were pointed at
     127.0.0.1 in the intelligence container's /etc/hosts (10:56:42; backed up and restored by content).
     - Three backlog fetches failed: `lookup failed` for yk2uJxD6ocrn 10:57:05.3, Wq-vf_K4WSfj 10:57:35.6,
       yFpvytc5zGpM 10:58:05.8, then at 10:58:05.827 `[INFO] app.workers.loft_media: loft_media backing
       off 30 min after 3 failures in a row` (no file id, URL or video id).
     - Failure counts afterwards: yk2uJxD6ocrn 1, Wq-vf_K4WSfj 0, yFpvytc5zGpM 0; whole table 503 x 0,
       1 x 1 (total 1). Waiting count: the first failure was not requeued (497 stays 497), the second and
       third went back to the queue (496 -> 497 each).
     - No loft_media fetch started from 10:58:05.9 to 11:03:37 (5.5 min of the backoff observed).
     - /etc/hosts restored 11:03:3x (www.youtube.com resolves again). 11:03:37.52 POST
       /api/addons/intelligence/files/kLe852pwBh6B/reindex {"tasks":["frame_ocr"]} through the stack URL
       -> 200 {"status":"accepted","tasks_reset":["frame_ocr"]}. The fetch was processing at 11:03:38.2
       (0.6 s later, during the backoff) and ended 11:03:48.5 with no warning; row afterwards failures 0,
       frame_scan_indexed 1, frame_ocr_read 1, frame_ocr_indexed 1.
     - The next backlog fetch (XomHWUIREQP6) started 11:04:18.52, 30.03 s after that success, about
       25 min before the 30-min backoff would have ended.

  Differences from the spec: none observed in the checked paths.
pending: |
  Not produced: the doubling of later backoffs (1 h, 2 h ...) and the 6 h cap, a backoff restarted by a
  failing priority 0/100 fetch, a held backlog task giving way to a priority-0 task, download-side
  refusals (only lookup refusals were produced), removed-video clusters, and restart clearing the state.
  YouTube is an external service (agent_cannot_verify); used here because the caller directed it.
