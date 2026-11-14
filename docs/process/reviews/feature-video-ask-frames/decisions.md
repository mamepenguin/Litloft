# Decisions

decision:
ran_in_app: yes
at: b5ba79c44954f33dc0feba5922920adbf720dbed
by: agent
evidence: |
  SPEC-ADDON-108/109 of `docs/specs/video-ask-frames.md`, first R-5. Core tree
  b5ba79c44954f33dc0feba5922920adbf720dbed (branch `feature/video-ask-frames`) with
  `addons/intelligence` at 9d47ffe729ce64f2ffdede19541176bd637f9e92, a clean worktree; the
  gitlink this tree records is c03844e080b6187278c7ff5125456ceb3ee6c022, so the running
  addon code is the commit above the pointer, not the pointer. Stack:
  `LITLOFT_PORT=3994 docker compose -p litloft-r5-vaf -f docker-compose.yml
  -f .r5/override.yml up -d --build` (backend, frontend, intelligence, and the knowledge
  addon for the Markdown save). The drive is `.r5/drive` mounted at `/app/drives/scratch`;
  the backend writes `.r5/data` and the addon `.r5/data/addons/intelligence` (docker
  inspect shows no mount of the checkout's `data/`). The knowledge addon is in this stack
  only because "Save as Markdown" posts to it; without it the button answers 502. Other
  stacks (`video_share-*` on :3000, `novel-generator-adminer`, `determined_mayer`) were
  left alone; only project `litloft-r5-vaf` was started and stopped.

  The LLM was a local OpenAI-compatible stub I wrote under `.r5/llm-stub/` on host port
  3999, configured as the profile's `openai_compatible` base_url with `model: r5-text` and
  `vision_model: r5-vision`. It streams a short canned answer that cites `[2]`, `[5]` and
  `[12]`, and appends every request to `.r5/llm-stub/requests.jsonl` with the model name,
  the number of `image_url` blocks, and the system and user prompt. Two files switch it per
  request: `refuse_images` answers 400 "image input is not supported" to a request with an
  image, and `slow_first_token` waits 40 s before the first token. **The stub is not a
  model, so nothing below is evidence about a real model's answer quality or vision.** The
  raw per-run JSON is in `.r5/results/check*.json`.

  Fixtures, made with ffmpeg in `.r5/drive`: `textless.mp4` (60.0 s, one video stream and
  no audio, three hue-shifting rectangles on black; no text or digits are drawn), confirmed
  in the app as having no text — the transcript answers "No transcript available",
  `picture-text` is 404, and `index-details` reports `whisper: {count: 0}` and
  `text_content: {count: 0}` with `frame_ocr: true`; `talking.mp4` (6.44 s, Kyoko speech)
  whose local whisper-small transcript is one Japanese chunk ("これは、テスト用の短い動画
  です。赤い箱と青い箱が、画面の上を動いています。"); `notes.txt`. The scene-CLIP pool was
  real: `clip-timestamps` lists 0.0 s and 30.0 s and `GET /files/{id}/scenes` reports
  `candidate_count: 2` with one selected scene (0.0–60.0 s), so the first frame of every
  question below is a real candidate and the rest is the evenly spaced fill. The Visual
  Index's AI descriptions (`video_visual_index`) were off, as shipped; that worker is not
  on this path.

  Screenshots are in `docs/process/reviews/feature-video-ask-frames/shots/`.

  1. Text-less video, never played. Opening the file page (player 0:00, paused) lists
     Info, Related, Ask (`01-textless-tabs.png`). Asked "What happens in this video?" from
     the Ask tab: exactly one stub request, `model: r5-vision`, `image_blocks: 8`, and the
     user prompt reads "Frames from the video:" followed by `[1] 0:00`, `[2] 0:03`,
     `[3] 0:11`, `[4] 0:18`, `[5] 0:26`, `[6] 0:33`, `[7] 0:41`, `[8] 0:48`; it has no
     "Passages from the file:" section and no position line. The answer is drawn as
     "…two moving shapes 0:03. …a little later 0:26. A moment outside the frames would
     be ." (`01-textless-answer.png`): `[2]` and `[5]` are `rounded-full` buttons labelled
     0:03 and 0:26, and `[12]` is not a pill — the renderer drops a marker with no
     citation, so it leaves the empty space before the full stop rather than a literal
     "[12]". Clicking the pills moved the player to `currentTime` 3.75 and 26.25
     (`01-textless-pill-1.png`, `01-textless-pill-2.png`), the exact frame times the prompt
     lists truncated to 0:03 and 0:26.

  2. Position while playing and paused. Seeked by the scrubber and played: the player read
     0:41 / 1:00 (`02-playing-around-40s.png`), the request carried 8 image blocks and the
     prompt "The viewer is now at 0:41 in this file", with frames `[1] 0:00`, `[2] 0:04`,
     `[3] 0:12`, `[4] 0:21`, `[5] 0:30`, `[6] 0:38`, `[7] 0:41`, `[8] 0:47` and no passages
     section; the answer arrived with pills 0:04 and 0:30 (`02-answer-while-playing.png`;
     at submit `currentTime` was 41.3977). Paused at 10.77 s (player 0:10,
     `02-paused-around-12s.png`): 8 image blocks again, prompt "The viewer is now at 0:10
     in this file", frames `[1] 0:00`, `[2] 0:04`, `[3] 0:10`, `[4] 0:12`, `[5] 0:21`,
     `[6] 0:30`, `[7] 0:38`, `[8] 0:47`; answer arrived (`02-answer-while-paused.png`).

  3. Follow-up and the saved note. In one thread, a second question sent two requests, the
     second with "Earlier in this conversation: The viewer asked: … You answered: …" and
     the 8 frames again (`03-turn2-answer.png`). The earlier turn's pills still seeked
     after the second answer: 3.75 and 26.25. The history's answer text reaches the model
     with `[2]`, `[5]` and `[12]` removed ("…two moving shapes . The larger shape … later
     ."), which is `trim_history`'s marker stripping, unchanged. **Save as Markdown**
     (English label; the Japanese one is Markdownで保存) opened a dialog with folder /Ask
     and filename `what-happens-in-this-video.md`, saved note `U_QfyOmvsq93`
     (`03-save-dialog.png`, `03-saved-link.png`). The note holds, in each section,
     `[0:03](loft://cu6sNQxBEL6G?t=3)` and `[0:26](loft://cu6sNQxBEL6G?t=26)`; `[12]` is
     gone for the same reason as on the page. Opened in the app
     (`03-saved-note-page.png`), those render as black clickable 0:03 / 0:26 time links,
     and clicking 0:03 opened `/drive/scratch?file=cu6sNQxBEL6G&t=3` with the player at
     3.0 s (`03-note-link-opens-video.png`), i.e. the label's second, not the frame's
     3.75 s. The save needed a profile nickname ("R5 Viewer", set in Settings → Profile):
     the knowledge addon answers 401 without `X-Lit-Viewer-Id`, which core only derives
     from that cookie.

  4. Refusal. With `refuse_images` on, the question showed exactly "The selected model did
     not accept this video's frames. Try another model." under it (`04-frames-rejected.png`)
     — not the generic line — and the stub log held exactly one request for it (`r5-vision`,
     8 image blocks, refused), with no retry and no text-only request. `GET …/ask` still
     answered `{"available":true}` after the refusal, so the verdict was not written. With
     the switch off, the same page sent one request with 8 image blocks and answered
     (`04-after-switch-off-same-page.png`), and after a reload one more with 8 image blocks
     (`04-after-reload.png`).

  5. No vision. With `vision_model` present, the page listed Ask
     (`05-tab-with-vision.png`). I set it to `""` in `.r5/search-config.yml` and restarted
     the intelligence container with the page still open: the question then showed "This
     video has no text, and the selected model cannot read images."
     (`05-video-needs-vision.png`) with no stub request, and `GET …/ask` answered
     `available: false`. After a reload the strip listed only Info and Related
     (`05-no-tab-without-vision.png`). Restoring `vision_model: "r5-vision"` and
     restarting brought Ask back (`05-tab-restored.png`).

  6. Frames that cannot be read. I removed the file's frame-cache directory, because the
     8 frames of the earlier questions were cached and a cache hit would not have exercised
     extraction, then overwrote `.r5/drive/textless.mp4` with 21 bytes of text and did not
     rescan. The Ask tab was still listed (availability is index-based); the question
     showed "This video has no text and its frames could not be read."
     (`06-frames-unusable.png`) after 1.7 s and the stub received no request. The original
     bytes were put back afterwards (same md5, 60.0 s, one video stream).

  7. Slow first token. With `slow_first_token` on, asked through the port-3994 frontend:
     the first answer text appeared 40.5 s after submit and the answer was complete at
     42.0 s, with one request and no error line; at 20–25 s the tab showed the question
     with no answer and no failure (`07-waiting-for-first-token.png`,
     `07-answer-after-40s.png`). The 30 s Next.js proxy timeout did not cut it.

  8. Text video. Asked while playing at 3.47 s (player 0:03): one request with exactly one
     image block and a passages section ("[1] これは、テスト用の短い動画です。…"),
     position "0:03" (`08-text-video-playing-answer.png`). Asked while **not** playing:
     paused at 1.92 s the request still carried one image block at 0:01
     (`08-text-video-paused-answer.png`), and a freshly opened, never-played page (0:00,
     paused) also carried one image block at 0:00
     (`08-text-video-never-played-answer.png`). This contradicts the check's "asked while
     not playing, no image block": the tab sends `position_seconds` from a mounted player
     whether or not it is playing, and SPEC-ADDON-071 attaches the frame at any sent
     position. The earlier R-5 of 071 recorded the same ("paused at 3.4 s … an image was
     still attached"), and SPEC-ADDON-108 I1 requires this path unchanged, so I take this
     as a conflict between the check's wording (and the spec Summary's "one frame only
     while playing") and 071's rule, not as a regression of this change. A video page with
     no player, the only way the tab omits a position, was not found in the web UI; the
     earlier R-5 recorded that too.

  9. 390 px. At 390x844 (isMobile, hasTouch, 2x) the sheet's tab strip read Info, Scenes,
     Related, Ask and the answer and its two pills were readable
     (`09-phone-answer.png`, `09-phone-answer-bottom.png`); `window.innerWidth`,
     `document.documentElement.scrollWidth` and `body.scrollWidth` were all 390, and the
     pills' right edges were 293.8 and 135.1 px, inside the viewport. No horizontal
     scrolling.

  Seen outside the checks: every file page loads four 404s for a text-less video —
  `subtitles.vtt`, `transcript` and `picture-text` — which are the expected "this file has
  none" answers. The intelligence log shows `frames_dropped: chosen=8 dropped=0` and no
  `scene_candidates_failed`, `frames_unusable` or `frames_rejected` after the checks that
  passed.

pending: |
  - The quality and correctness of a real vision model's answers about frames (the LLM
    was a canned local stub; no image understanding was observed), and a real provider's
    refusal of 8 large frames (the refusal was a stub 400).
  - A real off-host provider, and `llm_cloud` denying or permitting a drive on a real
    install (the profile was local and the policy was the default).
  - Ollama's native multi-image request against a real Ollama (only the
    OpenAI-compatible client was exercised), and a text-less YouTube `.loft` (the
    yt-dlp frame path was not reached).
  - A long real video, a real camera clip, and a real transcript's frame times.
  - Anything on an iPhone (a 390 px Chromium viewport was used, not a device), and audio
    and video as heard and seen, playback over the home LAN, and real third-party addon
    services (`PROJECT.md` agent_cannot_verify).
  - The check 8 mismatch above needs a decision by the author (and the human if it is a
    spec-prose change): either 071's "an image applies to a video when the request
    carries a position" is the intended behavior and the check's wording is wrong, or the
    check's "no image block when not playing" is intended and the tab must stop sending a
    position while paused.
