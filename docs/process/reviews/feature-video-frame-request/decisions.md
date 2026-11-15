# Decisions

decision:
ran_in_app: yes
at: 902981109bfb44589ceb1fc7d4f5f39c25356abc
by: agent
evidence: |
  R-5 targeted re-run after the token-limit fix, 2026-11-16 00:41 – 00:49 JST. Core worktree at
  90298110 with `addons/intelligence` checked out at 76cc410 (feature/video-frame-request; the core
  pointer is not bumped). The container's `/app/app/llm.py` hashes equal to 76cc410's
  (FRAME_TOOL_MAX_TOKENS 16384, OLLAMA_FRAME_TOOL_NUM_PREDICT 8192). Setup as in re-run 1: the same
  gitignored links to the main checkout, `r5_stack.py clone --port 3101` then `up`
  (http://video-share-frame-request.localhost:3101), OpenRouter key only via `with_secrets` as
  `LLM_API_KEY_OPENROUTER`; clone-only `llm-overrides.json` edits (deepseek ->
  `deepseek/deepseek-v4.1-flash`; local and deepseek through the taps `r5/tap.py.txt` on
  :11500 / :11501); host ollama gemma4:e4b. Questions by `r5/sse_timer.py.txt` through the
  frontend (no `position_seconds`) and one in the Ask tab in Chrome. The :3000 stack was not
  touched. Files: `r5/rerun2-answers.txt`, `r5/rerun2-tap-deepseek-requests.txt`,
  `r5/rerun2-tap-ollama-requests.txt`, `r5/rerun2-intelligence-log.txt`,
  `r5/rerun2-keepalive-timings.txt`, `r5/rerun2-01-deepseek-collection-browser.jpg`.

  1. DeepSeek V4.1 Flash, ht8Pv6R9TBmg, "ワイルドエリアコレクションチャレンジの画面には、どのポケモンが
     並んでいますか？全部挙げてください。", 3 runs; every run ended with an answer, none reached 300 s:
     - d1, 108.9 s: tool req [8:10, 8:40, 9:00, 9:15] 4.09 s / reasoning 432; [10:20, 10:35, 10:50,
       11:05] 26.6 s / 17,050; third tool request (tool_choice auto) 66.87 s / 46,520 reasoning,
       no content, finish_reason "length" -> log `frame_tool_fallback`, today's request (no tools,
       max_tokens 2048) 5.02 s, answer streamed. Log "frame requests: 2 calls, 8 frames". Answer
       says the challenge screen is in none of the frames it was given (it names the initial
       frames [165]-[167]), and lists only コイル / アローラディグダ (upper row, from speech) and
       "dragon types" (lower row).
     - d2, 114.0 s: [8:20, 8:35, 8:50, 9:10] 2.49 s / 567; [8:05, 9:25] 23.32 s / 13,388;
       [10:35, 10:50] 19.45 s / 10,012; then the final request (tool_choice "none") 52.15 s /
       50,392 reasoning, no content, finish_reason "length" -> `frame_tool_fallback`, today's
       request 12.27 s. Log "frame requests: 3 calls, 8 frames". Answer like d1: the screen is not
       among frames [160]-[167]; コイル / アローラディグダ from speech only.
     - d3, 15.8 s: [8:30, 9:00, 9:30, 10:00] 2.5 s / 520; second request 10.35 s / 7,239, finish
       "stop", answer from the requested frames [168]-[171]: 8 icons (4 upper / 4 lower), names
       readable only for コイル / アローラディグダ; challenge title quoted. No fallback.
     - Browser (Chrome, Ask tab, profile deepseek, player at 8:45 so a position was sent):
       1 call (tool req 10.6 s / 3,957), second 21.99 s / 1,793, finish "stop"; about 47 s from
       clicking Ask to "frame requests: 1 calls, 4 frames". Answer: 4+4 icons, コイル /
       アローラディグダ, citations as time pills 8:45 8:20 8:35 8:55 9:05
       (`r5/rerun2-01-deepseek-collection-browser.jpg`).
     - Compared with re-run 1 (no token limit: 2 of 3 ran to the 300 s deadline with ~290k reasoning
       characters), every cut came at 46-50k reasoning characters (16384 tokens) and fell back.
       When the fallback runs, the requested frames are not in today's request, so the answer
       says the screen is not shown (d1, d2), as in the first R-5 run.
     - Keep-alive: first byte 0.25-0.37 s, largest gap before the first answer_chunk 5.01 s in all
       three runs.
  2. Request bodies (`r5/rerun2-tap-*-requests.txt`):
     - DeepSeek: every tool request (tool_choice auto, 11 in total, #23-#25, #27-#29, #32-#36) and the final request
       (tool_choice none, d2 #30) carry max_tokens 16384; keys model, stream, temperature 0.1,
       max_tokens, tools, tool_choice; no `max_completion_tokens`, no reasoning field sent back.
       Both fallback requests after the natural length cut (#26, #31) carry max_tokens 2048
       (= rag.max_tokens), no tools.
     - ollama, one gemma question (promo code): the tool request carries options {temperature 0.1,
       num_predict 8192}, think true, tools [get_frames]; gemma called no tool (46.3 s, answer
       コミュニティマックス10 / COMMUNITYMAX10 [25][161]). Injected refusal (the tap answered 400 to
       a request carrying tools, one question, marker removed right after): log `ImageRejected` +
       `frame_tool_fallback`, next request think false, options {temperature 0.1, num_predict
       2048}, no tools; answer COMMUNITYMAX10 [161] at 17.3 s.
  3. Easy DeepSeek question, ht8 "画面に表示されるプロモーションコードは?": no frame request, one
     request (max_tokens 16384, 3.79 s, finish "stop"), answer COMMUNITYMAX10 citing frame [161]
     and passage [25]; 4.1 s total. Same answer as before.
  - Not produced in this run: the 120 s window, the 300 s deadline (no run came near it), a final
    request failing after its first chunk.
  - DeepSeek/OpenRouter is an external LLM API, listed under agent_cannot_verify in PROJECT.md;
    those runs were made because the caller directed them, with the key from the Keychain.
pending: |
  The 120 s window (no question reached it). OpenRouter cost per question was not read.

## R-5 re-run 1 (core 192b1e91, addon 17a04353)

rerun1_ran_in_app: yes
rerun1_at: 192b1e9154808560568ea4fabc679bbff35457f6
rerun1_by: agent
rerun1_evidence: |
  R-5 re-run after fixes, 2026-11-15 23:55 – 2026-11-16 00:21 JST. Core worktree at 192b1e91 with
  `addons/intelligence` checked out at 17a04353 (feature/video-frame-request; the core pointer is
  not bumped, as in the earlier run). The container's `app/routers/rag.py`, the system template
  and `app/llm.py` were confirmed to be 17a04353's. Own stack as before: the same gitignored links
  to the main checkout (drives.json, passwords.json, event-hooks.json, rclone.conf,
  docker-compose.override.yml, test_images, private, data, addons/intelligence/search-config.yml),
  `r5_stack.py clone` then `up` (http://video-share-frame-request.localhost:3101), the OpenRouter
  key only through `with_secrets` as `LLM_API_KEY_OPENROUTER`. Clone-only `llm-overrides.json`
  edits as before (deepseek -> `deepseek/deepseek-v4.1-flash`; local and deepseek through the
  recording taps `r5/tap.py.txt` on :11500 / :11501). Host ollama 0.40.5, gemma4:e4b
  (c6eb396dbd59), context 131072. Questions were sent through the frontend with `r5/sse_timer.py.txt`
  (same endpoint and headers as the Ask tab; no `position_seconds` unless noted) and one in the
  Ask tab in Chrome. `r5/reply.py.txt` produced the per-request lines of the tap files. Files:
  `r5/rerun-answers.txt`, `r5/rerun-tap-ollama-requests.txt`, `r5/rerun-tap-deepseek-requests.txt`,
  `r5/rerun-keepalive-timings.txt`, `r5/rerun-intelligence-log.txt`,
  `r5/rerun-01-deepseek-lucario-cp-browser.jpg`.

  1. gemma4:e4b requesting frames on its own (system message now carries "you must call
     get_frames before answering ... Never say that something is not shown unless you have
     called get_frames"; confirmed in the recorded request):
     - Frames do not show the answer, 7 runs, 1 frame request:
       g3, g4 ht8 "11:40頃の画面に映っているルカリオのCPは" -> no request either time; g3 says the CP is
         not in the material, g4 answers CP1274 citing [162] 11:00 (wrong; the true value at 11:40
         is CP1126, as DeepSeek reads it).
       g5, g6 ht8 "ルカリオのCPはいくつでしたか" -> no request; g5 "not in the material", g6 CP1274 [162]
         (wrong).
       g7 ht8 collection question -> no request (83 s); answer from the transcript only (コイル,
         アローラディグダ, "ドラゴンタイプのポケモン全般"), no frame cited.
       g8 vb74 "3:00から3:20の間に、鶏肉の横に" -> 1 request [3:00, 3:20] (50.2 s, thinking 2,532
         chars), frames [108] 3:00 / [109] 3:20 one user message each, no thinking sent back; second
         request (tools still offered) 24.6 s answered: headline "特定の食材は置かれていません", body
         names "鶏肉の塊が入った白い容器 ... 右奥" [108][109] (the tray of chicken is what the frames
         show). 76 s total.
       g9 same question again -> no request; answers ブロッコリー from passage [35] and the 8:20
         bento frame [106] (wrong for 3:00–3:20).
     - Frames or passages already answer, 3 runs, 0 requests: g1, g2 promo code -> COMMUNITYMAX10
       (right); g10 vb74 解凍時間 -> 5〜6分(500W) / 2〜3分 [94] (right).
     - Thinking per request 585–3,362 chars; first-request times 7–83 s (g1 includes the model
       load). No run got near the deadline.
  2. Keep-alive (the largest gap before the first answer_chunk, `r5/rerun-keepalive-timings.txt`):
     every run through the frontend, 20 runs on both profiles, had its first byte at 0.17–1.84 s
     and no gap over 5.02 s, including the DeepSeek multi-call runs (d1 82 s; d2, d3 300 s) and the
     1-call vb74 run (d4: first byte 0.19 s, largest gap 4.39 s; the earlier run had 7.8 s with no
     byte). In Chrome (DeepSeek, Lucario CP, player at 8:45 so `position_seconds` was sent) the
     response headers and first keepalive arrived at 5.03 s (Resource Timing requestStart 1 ms,
     responseStart 5028 ms), then 7.49 s, answer 11.49 s. The same question by sse_timer with a
     position (613 s) got its first byte at 1.84 s, without a position at 0.21 s; the delay before
     the first byte appears only with a position. No gap reached 10 s. With a player position the
     response does not start until something before the stream finishes: 5.03 s here, and the
     earlier run's 10.8 s first byte was also a browser run (so probably with a position); this run
     did not isolate whether that wait is covered by a keep-alive.
  3. DeepSeek V4.1 Flash on the collection question, 3 runs (no token limit sent):
     - d1: 3 tool requests (tool_choice auto): [8:10, 8:40, 9:20, 10:00] 4.24 s / reasoning 462;
       [8:05, 8:25, 9:45, 10:15] 17.81 s / 7,945; the third (2 served, under 120 s, tools offered)
       answered with text: 52.77 s / reasoning 34,584, finish "stop". 82.3 s total. Answer: 2 rows
       of 4 — コイル, アローラディグダ, ドーミラー, ナットレイ / タツベイ, キバゴ, モノズ, ミニリュウ, with
       a note that the 3rd/4th upper icons are small and guessed. Against the 8:10 frame
       (490000.large.webp): the lower row and the first two upper match what is visible; the upper
       3rd is a green spiky ball and the 4th a flat dark figure, which do not look like ドーミラー /
       ナットレイ.
     - d2: [8:10, 8:30, 8:50, 9:10] 3.78 s / 470; [9:30, 9:50, 10:10, 10:30] 15.73 s / 8,930; the
       third request (started 26 s into the question) streamed reasoning only for 274.8 s
       (297,507 reasoning chars, no content, no tool call) until the total deadline: log
       `frame_tool_deadline`, "frame requests: 2 calls, 8 frames", stream `meta` image "attached"
       then `done` {"error": "Answer generation failed"} at 300.14 s; keepalives every 5 s to the
       end; no fallback request.
     - d3: [8:10, 8:30, 9:00, 9:30] 2.47 s / 460; [8:00, 8:05, 9:35, 9:40] 26.79 s / 17,286; third
       request reasoning only for 265.2 s (289,522 chars) -> the same deadline failure at 300.17 s.
     - So no fallback from a token limit (no `finish_reason: length`, no `frame_tool_fallback`
       in these runs); 1 of 3 answered, 2 of 3 ended "Answer generation failed" after 300 s, the
       viewer seeing nothing but the wait. The earlier run's 2 runs fell back to today's request at
       ~42 s and ~16 s and were done at 46.6 s and 21.7 s, with an answer that said the screen was
       not shown.
     - Other DeepSeek questions: d4 vb74 3:00–3:20, 1 call [3:00, 3:05, 3:10, 3:20], 8.4 s, "white
       tray of chicken at the upper right" (right). d7 Lucario, 1 call [11:30, 11:40, 11:50, 12:00],
       11.7 s, CP1126 (right). Browser Lucario (player 8:45): no call, CP1126 citing the 11:40 pill
       (`r5/rerun-01-deepseek-lucario-cp-browser.jpg`). d8 vb74 "5:00頃 フライパンに何切れ": 3 calls
       ([4:55..5:25], [5:30..5:50], [5:00, 5:20, 5:35, 5:55]), then the final request
       (tool_choice "none") 6.47 s; 18.8 s total; answer: at 5:00 no pan yet, 5:25 2切れ, 5:30 3,
       5:35 4.
  4. Request options (`r5/rerun-tap-*-requests.txt`):
     - ollama tool requests (12, incl. g8's second): keys model, stream, think true, tools,
       options {temperature 0.1} only; no `num_predict`. No thinking in any later message.
     - DeepSeek tool requests (tool_choice "auto") and the final request (#22, tool_choice "none"):
       keys model, stream true, temperature 0.1, tools, tool_choice; no `max_tokens` /
       `max_completion_tokens`, no reasoning field sent back.
     - Fallback (injected: the tap answered 400 to any request carrying tools, one question per
       profile, then removed): ollama -> `ImageRejected` + `frame_tool_fallback`, next request
       think false, options {temperature 0.1, num_predict 2048}, no tools; answer streamed (14.2 s).
       DeepSeek -> the same log lines, next request no tools, max_tokens 2048 (= rag.max_tokens),
       answer right (5〜6分 [94]).
  - Not produced in this run: the 120 s window (no request was decided by it), a final request
    failing after its first chunk, the viewer closing the tab, unreadable or out-of-range times.
  - DeepSeek/OpenRouter is an external LLM API, listed under agent_cannot_verify in PROJECT.md;
    those runs were made because the caller directed them, with the key from the Keychain.
rerun1_pending: |
  The 120 s window (no question reached it). OpenRouter cost per question was not read (d2/d3
  each streamed ~290k reasoning characters).

## Earlier R-5 run (core 9a7c0eab, addon 0d546661)

earlier_ran_in_app: yes
earlier_at: 9a7c0eabc07ef33f6c987262c920993e16c29f57
earlier_by: agent
earlier_evidence: |
  R-5 run 2026-11-15 (14:55–23:24 JST), core worktree at 9a7c0eab with `addons/intelligence` checked
  out at 0d546661 (feature/video-frame-request; the core pointer is not bumped yet). Own stack:
  `scripts/dev/r5_stack.py clone` then `up` (http://video-share-frame-request.localhost:3101);
  the intelligence container's `rag.py` carries `_FRAME_TOOL_NAME`. The worktree had none of the
  gitignored links `.cmux/setup` makes, so drives.json, passwords.json, event-hooks.json,
  rclone.conf, docker-compose.override.yml, test_images, private, data and
  addons/intelligence/search-config.yml were linked to the main checkout before `clone` (no
  submodule update, no .env link). The OpenRouter key was passed only through `with_secrets` as
  `LLM_API_KEY_OPENROUTER` at `up`. Clone-only edits to `llm-overrides.json`: profile `deepseek`
  model and vision_model `deepseek/deepseek-v4.1-flash`; profile `local` (ollama gemma4:e4b) and
  `deepseek` pointed at pass-through taps on the host (`r5/tap.py.txt`: :11500 -> ollama :11434,
  :11501 -> openrouter.ai) that record each chat request's messages and options with images
  hashed, and a summary of the reply (text head, thinking/reasoning length, tool calls), never
  headers. Host ollama loads gemma4:e4b with a 131072 context (`ollama ps`), no truncation in its
  log. The profile was chosen per question in the Ask tab's model menu. Summaries:
  `r5/tap-deepseek-requests.txt`, `r5/tap-ollama-requests.txt`, `r5/intelligence-log.txt`,
  `r5/keepalive-timings.txt`.

  Files: ht8Pv6R9TBmg (YouTube .loft, 30:10, no `duration` in the DB, so the prompt carried no
  duration line; contents 26 lines, each excerpt exactly 120 characters) and vb74YwPHV6jx (local
  mp4 9:42, ffmpeg path; prompt says "Duration of the video: 9:42." and the contents include
  frame text such as 食材 / ブロッコリー). The zoo sample is not in the drive and was not added
  (that needs `--with-drives`); the local mp4 covers the ffmpeg path.

  gemma4:e4b (ollama), every request think=true, num_predict 4096 (= 2 x rag.max_tokens 2048),
  tools [get_frames], ten messages (system, prompt, eight label+image user messages):
  1. ht8 "画面に表示されるプロモーションコードは?" -> no frame request; answer COMMUNITYMAX10 (right;
     it also cites the 0:10 frame [160], which shows only the presenter, no code). Whole answer in one chunk at
     28.7 s, keepalives every 5 s before it. `r5/01-gemma-promo-code-no-request.jpg`.
  2. ht8 "コレクションチャレンジの画面に並ぶポケモンを全部" -> no request (34 s); answer from the
     transcript only (コイル, アローラディグダ "など").
  3. ht8 follow-up "ルカリオのCP" (history in the prompt as text, eight initial frames only) -> no
     request; says the CP is not in the material.
  4. ht8 "11:40頃の画面のルカリオのCP" twice -> no request either time (thinking 2,422 chars, no tool
     call in the reply); both answers say 11:40 is not among the frames and then give CP1274 from
     another frame as Lucario's (wrong: that is カイリキー; the true value is CP1126).
  5. vb74 "解凍時間" -> no request; 5〜6分(500W) / 2〜3分 from the frame-text passage [94] (right).
  6. vb74 "3:00〜3:20 鶏肉の横に何が" -> no request (34 s, thinking 4,088 chars); says the frames for
     that span are not provided and guesses.
  6b. vb74 "get_frames を使って 3:05 と 3:15 の画面を取得し…" (the tool named in the question) -> 1 call
     [3:05, 3:15] (first request 15.4 s, thinking 257 chars), tool message "2 frames follow.", then
     [108] 3:05 and [109] 3:15 as one user message each with one image, no thinking sent back;
     second request 9.1 s, answer: a tray of chicken at the upper right (right). This was the
     first `local` question after the injected refusal below, and it took the tool path.
  gemma4:e4b (ollama 0.40.5, digest c6eb396dbd5992bb) made no frame request in the 7 questions
  that did not name the tool, including ones where its own answer says the needed moment is not
  among the frames; it calls the tool when the question tells it to.

  DeepSeek V4.1 Flash (OpenRouter), tool requests tool_choice "auto", final "none", stream true,
  temperature 0.1, max_tokens 2048, no thinking/reasoning field sent back:
  7. ht8 "11:40頃のルカリオのCP" -> 1 call [11:30, 11:40, 11:50, 12:00], tool result "4 frames follow.",
     frames [168]-[171] each right after its label; the four images hash-equal the cached
     `{ms}.large.webp` at those times. Answer CP1126 [169], caught [170]: right
     (`r5/04-requested-frames-11-30-to-12-00.jpg`). Tool req 3.6 s, cut ~4.4 s (YouTube route),
     answer req 3.4 s; whole answer at once. `r5/02-deepseek-lucario-cp-requested-frames.jpg`.
  8. ht8 collection question (browser) -> 3 calls [8:10, 8:40, 9:20, 10:00], [8:02, 10:15, 10:30,
     10:45], [8:20, 9:45]; then the final request (tool_choice none) streamed. Log "frame requests:
     3 calls, 10 frames". Tool reqs 2.9 / 14.1 / 10.6 s, cuts ~3 s each, final 8.4 s; 45 s total.
     Answer: 8 icons in two rows of 4, names not readable except コイル/アローラディグダ from speech;
     on-screen text "終了まであと7時間と49分" quoted right. Pill 8:20 seeked the player to 8:20 and the
     challenge screen (`r5/03-deepseek-pill-8-20-seeked.jpg`).
  9. Same question again (sse_timer through the frontend, then straight to :8100): 2 calls each,
     and in both the next tool request ended finish_reason "length" with only reasoning (7,054
     and 6,230 chars) -> `frame_tool_fallback`, then today's request (2 messages, no tools) whose
     answer cites only passages and initial frames and says the challenge screen is not shown.
  10. vb74 "3:00〜3:20 鶏肉の横" -> 1 call [3:02, 3:08, 3:14, 3:20], cut <1.5 s (ffmpeg); answer: a
     white tray of chicken at the upper right: right (`r5/05-requested-frames-cooking-3-02-to-3-20.jpg`).
  11. vb74 "5:00頃 フライパンに何切れ" -> 3 calls of 4 ([4:55..5:20], [5:30..6:00], [5:33..5:42]), 12
     frames, final request tool_choice none; 26 s total. Answer "4切れ at 5:30-5:35" (5:30 shows 3,
     5:33/5:35 show 4: `r5/08-requested-frames-pan-5-20-to-5-35.jpg`).
     Follow-up in the same conversation: prompt holds the earlier answer text without numbers,
     the eight initial frames, numbering starts again at [108]; 1 call [5:40..5:55]; answer
     "25-28 pieces". Pill 5:45 seeked the local player to 345 s
     (`r5/07-deepseek-followup-pill-5-45-seeked.jpg`).
  12. vb74 with the player at 5:45 (prompt "The viewer is now at 5:45", position frame [104] 5:45):
     asked for 5:37/5:45/5:46/6:30/10:30/abc; the model sent [5:46, 6:30, 10:30]; tool result
     "2 frames follow.\n- 10:30: past the end of the video"; 5:46 (exactly 1.0 s from the
     position) and 6:30 were cut and sent as [108], [109].

  Failure cases:
  - Refusal: the ollama tap answered 400 to any request carrying tools (injected). Log
    "file question frames failed: ImageRejected" + "frame_tool_fallback"; the next request was
    today's (think false, num_predict 2048, no tools, prompt without duration/contents); its
    answer streamed token by token with meta image "attached" and no notice
    (`r5/06-gemma-refused-tool-request-fallback-answer.jpg`). The next questions still sent frames
    (no vision verdict written).
  - Empty reply: run 9 above (finish_reason length) fell back once.
  - Closing the tab: during the second tool request of an ht8 question (DeepSeek). The route ended
    at 14:20:24.75 ("frame requests: 1 calls, 4 frames"); no later model request. The reply of
    that second request had asked for [16:45, 16:55, 17:05, 17:15], and those four frames were
    written to the frame cache at 14:20:25.77, 28.03, 28.27 and 29.06, after the route had ended.
  - Keep-alive: with gemma every gap before the answer is 5.0 s. With DeepSeek on the tool path,
    gaps over 10 s before the first answer_chunk: in the browser run 8 the first byte came 10.8 s
    after the POST and a later gap was 12.0 s; 10.33 s and 10.44 s
    through the frontend, 9.02 s straight at the addon; a 1-call question (run 10) wrote no byte
    for 7.8 s (`r5/keepalive-timings.txt`). Each gap spans the end of one tool request, the frame
    cut and the start of the next request.
  - Request options (I5): every DeepSeek tool, final and fallback request carries the same
    non-message keys (model, stream true, max_tokens 2048, temperature 0.1); the tool and final
    requests add only `tools` and `tool_choice`. None carries a reasoning field, and DeepSeek
    returned 245-7,054 reasoning characters per reply.
  - Timings: DeepSeek tool requests took 2.4-6.5 s mostly, and 10.6, 12.0, 12.6, 14.1 and 16.0 s
    in the collection-question runs; YouTube frame cuts ~3-4.4 s per call, ffmpeg <1.5 s;
    gemma4:e4b with thinking 15-35 s per first request.
  - Not produced: the 120 s window, the 300 s total deadline, a final request failing after its
    first chunk, unreadable times, the tool-result reasons "already sent as [n]" and "at the
    position" (the model left such times out itself), and the unknown-duration "not available"
    reason (no YouTube frame failed).
  - DeepSeek/OpenRouter is an external LLM API, listed under agent_cannot_verify in PROJECT.md;
    those runs were made because the caller directed them, with the key from the Keychain.
earlier_pending: |
  The 120 s window and the 300 s total deadline (no question reached them; gemma never requested
  frames, DeepSeek finished in under 50 s). OpenRouter cost per question was not read.
