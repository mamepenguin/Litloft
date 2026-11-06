# Decisions

decision: ship (user, 2026-11-07, after r1 HUMAN_REVIEW_REQUIRED). The user chose the recommendation for each of three questions: the app-wide RequestValidationError handler in `addons/intelligence/app/main.py` stays and is recorded as a missing touch point (revision I11); `meta.image` stays omitted when no image applies and no profile can see, and I3 is revised to read an absent key as `"none"` (revision I3); the `has_vision_profile` extraction in `llm_routing.py` and the optional parameters added to `tests/file_question_doubles.py` are accepted as in scope and listed in the PR body (revision I12).
ran_in_app: yes
at: 6239362050c6e37bdbab564ccdf891ff3aac4849
by: agent
evidence: |
  SPEC-ADDON-071..074 of `docs/specs/file-ask-vision.md`, first R-5. Core tree
  6239362050c6e37bdbab564ccdf891ff3aac4849 with `addons/intelligence` at
  1f862db2415fc00e4089494e9a0dca4425e3155a (the working-tree gitlink is dirty, so the
  running addon code is that commit, not the pointer HEAD records). Stack:
  `LITLOFT_PORT=3995 docker compose -p litloft-r5-fav -f docker-compose.yml
  -f .r5/override.yml up -d --build backend frontend intelligence`; backend,
  frontend and intelligence came up, indexed the scratch drive (7 files: 2 documents,
  2 pictures, 1 video, 1 audio, 1 text-only picture). The drive is `.r5/drive`; the
  data is `.r5/data`, a scratch directory. The worktree's `data/` symlink was never
  mounted (docker inspect shows only `.r5/data` on `/app/data`, `/data` and
  `/intelligence-data`). Other stacks (`video_share-*` on :3000, `determined_mayer`,
  `novel-generator-adminer`) were left alone; only project `litloft-r5-fav` was
  started and stopped.
  The LLM was a local OpenAI-compatible stub I wrote under `.r5/llm-stub/` on host
  port 3999 (`model: r5-text`, `vision_model: r5-vision` in the profile). It streams a
  canned Markdown answer and logs every request to `.r5/llm-stub/requests.jsonl`
  (model, has_image, prompt). Two switches re-read per request: `refuse_images`
  makes an image request answer 400 "image input is not supported", and
  `close_stream` cuts the response after two chunks. The stub is not a model: nothing
  below is evidence about a real model's answer quality or vision ability. For the
  drive-wide Ask only (whose prompt demands JSON), the stub answers its JSON contract
  with one citation to report.pdf page 1, because a Markdown answer is not a valid
  answer for that page.
  Fixtures: receipt.png (printed "TOTAL ¥1,280", indexed by RapidOCR as
  "CORNER SHOP / COFFEE BEANS / TOTAL ¥1,280 / THANK YOU"); photo.png (800x500 soft
  gradient, `GET .../picture-text` answered "No picture text available"); counter.mp4
  (5.06 s colour card counting up, Japanese speech transcribed by whisper-small into
  one chunk); voice.m4a (3.97 s speech, one whisper chunk); notes.txt; report.pdf
  (one page of text, added with `cupsfilter` to get a page-position citation). The
  first gradient fixture was replaced by photo.png because RapidOCR read "8 O O O"
  from its circles, which would have made it a text picture rather than a text-less
  one.
  Screenshots are in `docs/process/reviews/feature-file-ask-vision/shots/`; the raw
  request logs and per-run JSON are in `.r5/results/` and `.r5/llm-stub/requests.jsonl`.

  1. Picture with text. `AAeNwdfMc-nl` (receipt.png) listed Info, Related, Ask
     (`c1-receipt-tabs.png`); `GET .../files/AAeNwdfMc-nl/ask` answered
     `{"available":true}`. Asked "What is the number printed on this receipt?" in the
     tab; the answer arrived (`c1-receipt-answer.png`). The stub log shows exactly one
     request, `model: r5-vision`, `has_image: true`, and the prompt contains
     "Passages from the file: [1] CORNER SHOP / COFFEE BEANS / TOTAL ¥1,280 / THANK
     YOU" (`.r5/results/evidence.json`, `c1_rows`); the stream's `meta` was
     `{"partial":false,"image":"attached"}`. The answer shows ¥1,280, which is the
     stub's canned text; it is not a measurement of a vision model.

  2. Text-less picture. `or73kZlpd32D` (photo.png) has no text chunk and the profile
     had `vision_model`; the page listed Info, Related, Ask (`c2-photo-tab-open.png`)
     and availability was true. With the tab already open I removed the
     `vision_model` line from `.r5/search-config.yml` and restarted intelligence (the
     earlier R-5 way). The open tab's question returned 409 and the tab showed the
     exact line "This picture has no text, and the selected model cannot read
     images." (`c2-picture-needs-vision.png`); the stub log has no request for that
     question. After a reload the strip read only Info, Related
     (`c2-photo-no-tab.png`), and availability answered false.

  3. Video. `3qC8SnYDwF9h` (counter.mp4) has a transcript chunk, so Ask was listed.
     Playing at the submit: player `currentTime` 1.941859 s, the player read
     "0:01 / 0:05", the prompt carried "The viewer is now at 0:01 in this file", the
     stub log shows `model: r5-vision`, `has_image: true`, and the answer arrived
     (`c3-video-playing-answer.png`). The on-screen label caught up to 0:02 300 ms
     later. Paused at 3.4 s: the player read "0:03 / 0:05", the prompt carried 0:03,
     an image was still attached (`has_image: true`) and the answer arrived
     (`c3-video-paused-answer.png`). A context without a player was not found: the
     single-file Ask tab on a video is only offered on the canonical file page, where
     the player is always mounted; the collection full-screen surface has no
     inspector/Ask tab at all. So the no-player omission of `position_seconds` was not
     produced.

  4. Audio. `9RL36QpTvxos` (voice.m4a), playing at 2.124336 s at submit. The prompt
     carried "The viewer is now at 0:02 in this file"; the stub log shows
     `model: r5-text`, `has_image: false`; the answer arrived with no notice line
     (`c4-audio-answer.png`).

  5. Image refusal. With `refuse_images` on, the receipt asked about the total: the
     stream was `answer_chunk` … `meta {"image":"unavailable"}` `done {}`, the answer
     was shown from the text and one line under it read "The image could not be used,
     so this answer is from the text only." (`c5-refused-image-notice.png`,
     `c5-refused-image-notice-bottom.png`). The stub log has exactly two requests for
     that question: first `model: r5-vision`, `has_image: true` (400), then
     `model: r5-text`, `has_image: false`. After the switch was turned off and a
     restart cleared the recorded verdict, I removed `vision_model`, restarted, and
     asked the same picture again: the answer was shown and there was no notice line
     (`c5b-no-vision-no-notice.png`); the log has one `r5-text` request, no image.

  6. Markdown. On the video answer (`c6-video-answer-top.png`,
     `c6-video-answer-bottom.png`): `<h1>`, `<ul>/<li>`, `<table>` with `<th>/<td>`
     and `<strong>` are drawn as such; the code span is `<code>[1]</code>` and has no
     pill; the Markdown image produced `<p>receipt crop</p>`, no `<img>` in the panel
     and no request to `example.invalid` (network log for the single-file answer was
     empty); `[ok]` is `<a href="https://example.com" target="_blank"
     rel="noopener noreferrer">` and clicking it opened a second page at
     https://example.com/; `[bad]` is plain text "bad."; `<b>raw</b>` is shown as the
     text `&lt;b&gt;raw&lt;/b&gt;`; the sentence's `[1]` became two `0:00` pill
     buttons on the video answer once citations arrived. The picture answer's
     `citations` event is `[{"n":1,"position":null}]`, so by the retained SPEC-053 I8
     rule it leaves no pill (the `[1]` is removed and only a space remains); the pill
     is visible on the video (`0:00`) and PDF (`p.1`) answers. This is the one place
     the wording of the check ("[1] in the sentence is a pill") does not match what a
     picture answer does, and it matches the spec's "null-position [n] leaves no
     pill" instead.

  7. Failure mid-stream. Two runs, because the two client paths behave differently.
     - Picture (image path), `close_stream` on: two `answer_chunk` events, then
       `meta {"image":"attached"}` and `done {"error":"Answer generation failed"}`.
       The tab kept the two-chunk text, drawn as Markdown, above the line
       "Could not answer", and showed no image notice (`c7-image-stream-cut.png`).
     - Text file notes.txt, same switch: two `answer_chunk` events, then `citations
       []`, `meta {"partial":false,"image":"none"}` and `done {}` — no error. The
       tab kept the text ("Receipt summary / The item is coffee beans…" with an empty
       list item) but showed no failure line (`c7-text-path-no-failure.png`). The
       intelligence log says `LLM stream interrupted (APIConnectionError);
       terminating`: `generate_stream` swallows the cut, so the route treats the short
       stream as a completed answer. The spec's failure row for a failure after the
       first token says the text is kept and `done` carries `error`; this text path
       does not.

  8. PDF and text unchanged. report.pdf (`cPf0qKzCAaXF`) listed Info, Related, Ask;
     the answer carried two `p.1` pills from the page position and no notice line
     (`c8-pdf-answer.png`). The text file answer showed the same shape with no pills
     (its chunks have no position). The stub log for the PDF has no image; `meta` was
     `{"image":"none"}`. The "receipt crop" line in both answers is the stub's own
     Markdown image alt text, not a notice from Litloft about an image.

  9. 390 px. At 390x844 (isMobile, hasTouch, 2x) the picture's sheet opened with
     Info, Related, Ask; with `refuse_images` on, the answer and the notice were
     readable in the sheet, `documentElement.scrollWidth` was 390 and `innerWidth`
     390, with no horizontal scrolling (`c9-phone-picture-notice.png`,
     `c9-phone-picture-notice-bottom.png`). The picture answer has no pill (its
     citation is null-position); the pill part was checked at the same width on the
     PDF answer, where two `p.1` pills were readable and `scrollWidth` was 390
     (`c9-phone-pdf-pill.png`, `c9-phone-pdf-pill-bottom.png`).

  10. Drive-wide Ask. `/ask` is a 404 in this build; the sidebar's Ask opens
     `/drive/scratch/addons/intelligence`. There the answer arrived and was rendered
     by that page's own renderer, not the new file-answer renderer: with the stub's
     Markdown reply the page drew the image as an `<img src="https://example.invalid/
     x.png">` (five requests to that URL in the combined run), left `[1]` literal and
     listed five Sources. With the JSON answer the page showed its normal answer and
     its Citations card "1 / report.pdf / page 1" (`c10-drive-ask.png`), so the
     drive-wide page's own citation display still works. The file-answer Markdown
     renderer is not involved on that page.

  Seen outside the checks: the console logs minified React #418 on page loads, the
  knowledge addon's requests answer 502 (it is not in this stack), and the drive-wide
  Ask page fetches a Markdown image (the five `example.invalid` requests above) while
  the single-file answers make none. None of these is attributed to this change.

pending: |
  - The quality and correctness of a real vision model's answers (the LLM was a
    canned local stub; no real image understanding was observed).
  - A real off-host provider, and `llm_cloud` denying/permitting a drive on a real
    install (the profile was `offhost: false` and the policy was the default).
  - Ollama's native image request against a real Ollama (only the
    OpenAI-compatible client was exercised).
  - Real photographs (the pictures are generated).
  - Anything on an iPhone (a 390 px Chromium viewport was used, not a device).
  - Audio and video as heard and seen, playback over the home LAN, and real
    third-party addon services (`PROJECT.md` agent_cannot_verify).
  - A context without a player for a video question was not found in the web UI, so
    the "omit position_seconds when no player" branch was not exercised.
