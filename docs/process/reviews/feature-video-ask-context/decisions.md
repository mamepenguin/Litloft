# Decisions

decision:
ran_in_app: yes
at: 6dc4699debee22a05be9e0540b701f37f79c6397
by: agent
evidence: |
  Second R-5 run (2026-11-15, gemma4:e4b). Core worktree at 6dc4699d with
  `addons/intelligence` checked out at bf242a7b (branch feature/video-ask-context, gitlink
  modified in the working tree). Own stack: `python3 scripts/dev/r5_stack.py clone` then `up`
  (http://video-share-video-ask.localhost:3101); `rag.py`, `file_question.py` and
  `file_question_user.jinja2` in the intelligence container are identical to the worktree.
  The clone's `llm-overrides.json` only gained a profile `gemma4` (provider ollama, base_url
  of `local`, `model` and `vision_model` `gemma4:e4b`, `offhost: false`, default timeout)
  and `routing.features.rag: gemma4`; every request below used the routed profile
  (`profile: null`, tab menu "Auto"). All LLM features are `manual`, the stack was idle
  before the first question. ollama had qwen3.5:35b-a3b resident (another session) next to
  gemma4:e4b during most runs; each log records `ollama ps` before and after.
  SSE timed with `r5/ask_harness-gemma.py.txt` (the first run's harness with one argv fix)
  through `r5/run-gemma.sh.txt`, which also lists the frame cache before and after.
  Frames the answers cite were compared with the cached `{ms}.large.webp` files
  (contact sheets 16-21). Browser: Chrome 1372x895. Intelligence log lines:
  `r5/intelligence-ask-gemma.log`.

  Timings (first `answer_chunk` / total; largest silence before the first chunk):
  1. Sparse text video 第17話 (nzM31CiFQFiK, 4 transcript + 6 on-screen rows, P = 10),
     no position, cold gemma load (sse-11): 42.6 s / 44.6 s; silence 8.41 s (first byte
     is the first keepalive). `chosen=8 dropped=0`; 8 new `.large.webp`; citation [14] ->
     27.861 s; `meta {"partial": false, "image": "attached"}`. The answer describes
     constellations joined by lines, which frames [15] 36.37 s and [17] 58.43 s show, but
     cites [14], a daytime sky with no lines; text has a typo (目上げている).
  2. Sparse text video 第35話 (puqsf46R2vWh, P = 13), no position, warm (sse-12):
     22.5 s / 25.4 s; silence 6.85 s. Citations [14] 10.219 s, [15] 27.444 s (frames),
     [1] (passage). The answer says the shark ordered black coffee and reads a book: in
     [14] it is the man who drinks and reads, [15] is an all-black frame; the shark's cup
     at 58.3 s reads ホットチョコレート. Same file with `position_seconds` 58.3 (sse-21):
     13.95 s / 14.47 s; new `58300.large.webp`, 58.308 s not sent; answer
     「ホットチョコレート」 [19] -> 58.3 s, correct.
  3. Browser, 第17話 paused at 0:36.4, Ask tab (11, 12): waiting state is the question with
     a disabled Ask button; answer complete about 25 s after sending (screenshot 11 at
     08:52:41 UTC, `frames_dropped` at 08:52:43.9, screenshot 12 at 08:53:06; the ollama
     request took 15.7 s; no first-chunk time), with 0:36 pills; new `36400.large.webp`.
     The answer calls the dipper-shaped constellation "オリオン座のような形". Harness on the
     same position asking for each frame (sse-20): citations [11]..[18] -> 5.005, 14.514,
     22.397, 27.861, 36.4, 50.008, 58.433, 67.067 s, so the position frame replaced the
     36.370 s scene frame and the numbering is in time order (first chunk 2.66 s with all
     frames cached). The per-frame descriptions do not match the frames: [12] is described
     with the キッズコーナー sign of [11], [13] and [15] as the 星座コーナー shelf of [12],
     [15] (constellation) not as a sky.
  4. Follow-up in the same thread with the player at 0:58.4 (13, 14): `frames_dropped` at
     08:54:01.8 UTC, still no answer text in screenshot 13 at 08:54:13, answer complete in
     screenshot 14 at 08:54:26 (ollama request 15.7 s), pills 0:58 (new
     `58400.large.webp`); the answer says only that a different
     constellation figure is drawn, not that it is a shark. Clicking the 0:36 pill moved
     the player to 36.4 s, paused (15).
  5. Dense talking video (7yaTstDyaD--, 13.5 min, 11,535 transcript + 9,749 on-screen
     characters), `position_seconds` 0 (sse-13): 27.8 s / 34.1 s; silence 6.73 s;
     `meta {"partial": true, "image": "attached"}`; frames 120.6 .. 801.4 s, none at 0;
     P = 110. The three topics are cited to passages [3] [19] [30], and the black gown to
     frame [111] 120.633 s, which shows it: useful and grounded.
  6. Video with on-screen text rows (tQvV-ffti8AR, price tables; 91 rows, 50,589 chars),
     `position_seconds` 300 (sse-14): 44.8 s / 49.9 s; silence 7.18 s; log
     `scene_candidates_failed` then `chosen=8 dropped=0`; frames 300.0 s plus seven evenly
     spaced (76.8 .. 998.7 s); `partial true`, `image "attached"`. Not useful: the answer
     says it cannot tell which table is meant, although the 300 s frame shows one table with
     UQ mobile トクトクプラン2 (1,628 / 2,728) boxed, and it calls passages [2] [3] [26]
     "frames" (citations map them to passage times 98, 127, 896 s).
  7. YouTube `.loft` with a transcript and no stored duration (dUNQA5DXMBLO, P = 68):
     no position (sse-15): 6.93 s / 15.1 s, one keepalive at 5.25 s, no frame log line,
     no frame written, `meta {"partial": false, "image": "none"}`, passages only, useful.
     `position_seconds` 420 (sse-16): 12.25 s / 16.8 s; silence 9.17 s; `chosen=1`,
     `420000.large.webp`; [69] -> 420.0 s; "a man standing and talking", correct (21).
  8. YouTube `.loft` with a known duration (yFpvytc5zGpM, 23 min recipe, P = 123), no
     position (sse-17): frames read through `/frame` in about 11 s, keepalives at 5.17 and
     10.17 s during preparation, first chunk 35.3 s, total 39.9 s, largest silence 5.29 s;
     8 frames evenly spaced 86.5 .. 1297.5 s; `image "attached"`. Names 塩もみキャベツ from
     passages; the container description is cited to [125] 259.5 s (cabbage in a bag; the
     glass container is in [124] and [126]); the other dishes named on the frames are not
     mentioned.
  9. Unchanged paths: text-less sample2.mp4 (sse-18): 14.2 s / 19.7 s, frames [1]..[8],
     `image "attached"`, grounded (waterfall); picture 04TzLUC7rnlY (sse-19): 1.83 s /
     6.64 s, no keepalive, `image "attached"`, grounded.
  10. Keep-alive: in every run the first byte is the first `: keepalive` (the response
     headers arrive with it). When frame preparation ends before 5 s, the next keepalive
     comes 5 s after preparation ended, not 5 s after the stream started, so the silence
     before the first byte was preparation time plus 5 s: 6.7 to 9.17 s in these runs
     (largest 9.17 s on the `.loft` at 420 s, preparation about 4.4 s).
  Load on ollama: the host ollama server log has 15 `/api/chat` lines between 17:44 and
  17:55 local time; 13 match these questions one to one. The other two came from
  outside this stack (17:44:32-17:45:16 and 17:45:17-17:47:19, presumably the session that
  had qwen3.5:35b-a3b loaded) and overlap runs 1 (sse-11, partly) and 2 (sse-12) and the
  start of 5 (sse-13); those three timings may be slower than gemma alone.

  Frame selection (SPEC-ADDON-112, reused here; not a mechanism of this change): 第17話's
  22.397 s and 第35話's 27.444 s frames are all black, and 第35話's 27.653 s frame,
  0.2 s after the black one, is a second frame of the same moment; the 27.444 s one was
  cited in run 2. The first run's dense video gjNMe4L5ONhG (9,900 + 4,632 characters)
  fits the 16,000-character passages budget, so it does not cut passages; run 5 uses
  7yaTstDyaD-- instead.

  11. Nothing stored or logged: the only new files under /intelligence-data were
     `frames/<id>/<ms>.large.webp`; no question text appears in the intelligence log.

  Refusal and the profile that cannot see were not re-run here (no such profile was added
  to this clone); they are the first run's sse-05, sse-06 and 06, below.

  First R-5 run (same commits, routed `local` = Qwen3.5 27B): every frames question timed
  out at the 90 s request timeout ("Could not answer", sse-02, sse-03), because the model
  needed about 103 s to read 8 frames; with a 400 s test profile the frames path worked
  (first chunk 115-274 s, sse-04, sse-07) and the browser walk, pill seek, refusal notice,
  text-only profile, `.loft` and disconnect checks are recorded in screenshots 01-07,
  sse-01..sse-09 and `r5/intelligence-ask.log`.
pending: |
  Off-host profiles (the `claude` profile, an external LLM API) were not used: external
  services are under agent_cannot_verify. The "no frame could be prepared" case
  (`"unavailable"` after every frame preparation failed) was not produced by ordinary use.
  The wording of the prompts (position stated or not, system-prompt rules) is not visible
  in the app and was not checked.
