# Decisions

decision:
ran_in_app: yes
at: f11bfeab7c18d8f5f9c6ab1d3b57f19cee7f48d6
by: agent
evidence: |
  Addon half (SPEC-ADDON-053, SPEC-ADDON-056) of `docs/specs/ask-about-this-file.md`.
  `addons/intelligence` ran at b91346b8a84b29805a5996dfecf8072e9e3342ec, the commit the core HEAD pins
  (Core SPEC-CORE-036 had already had its own R-5). Started with
  `LITLOFT_PORT=3993 docker compose -p litloft-r5-d1 -f docker-compose.yml -f .r5/override.yml up -d --build backend frontend intelligence`.
  Backend and intelligence came up healthy and indexed the drive (`/api/addons/intelligence/status`:
  4 files, text 3, whisper 1), and the app was driven at http://localhost:3993 with Chromium via
  Playwright scripts in `.r5/addon-*.mjs`. Drive `scratch` held `Litloft User Guide.pdf`
  (`oM2PzgubAzbI`), `サッカーの神様をさがして.pdf` (`YSADIknHew2g`), `サッカーの神様をさがして.epub`
  (`w97skyzApJYy`) and `clip.mp4` (`khxFH7CZ_oTj`). Viewports 1440x900 and 390x844 (isMobile,
  hasTouch, deviceScaleFactor 2), `NEXT_LOCALE=ja` cookie, Japanese UI. Screenshots:
  `docs/process/reviews/feature-ask-about-this-file/shots/addon-*.png`.

  1. PDF `Litloft User Guide.pdf`, 1440x900: the inspector's tab strip (`aria-label` インスペクタの
    セクション, `data-testid=inspector-tabs`) listed 情報, ページ, 関連, 質問 — the Ask tab last, after
     the core tabs. The availability request `GET /api/addons/intelligence/files/oM2PzgubAzbI/ask`
     (X-Lit-Drive: scratch) answered 200 `{"available": true}`. The video `clip.mp4`, which has no
     transcript, drew 情報, 関連 only — no 質問 — and its availability route answered
     `{"available": false}`. The tab is driven by that answer: after an in-place file switch
     (check 5) the new file's strip had no 質問 80 ms after the click and gained it at 200 ms, after
     the GET for the new file. Shots: addon-desktop-pdf-tabs.png, addon-desktop-pdf-ask-tab.png,
     addon-desktop-video-tabs.png.
  2. PDF, 1440x900: asked 「メニューを閉じるにはどうすればいいですか？」 in the 質問 tab. The answer
     streamed in (a 60 ms sampler recorded text growing 12, 29, 38, 54 … chars, with `[31]`/`[33]`
     shown as typed: addon-2b-stream.mjs), then the citations arrived and each `[n]` became a
     `p.2` pill (also `p.32` pills on a tags question). Final text held no `[n]` marker at all
     (`match(/\[\d+\]/g)` empty). Clicking the first `p.2` pill moved the open PDF from page 1 to
     page 2 (page box 1→2, the page rendered "Overview of features"), the URL stayed
     `/drive/scratch?file=oM2PzgubAzbI`, and `framenavigated` did not fire (no reload). The
     「ファイルの一部を読んで答えました」 line showed under the answer (partial). At 1440x900 the
     question box stayed at y=354 while the answer pane scrolled (scrollTop 0→700 of 1707/381),
     so the box is pinned and the answer scrolls. Shots: addon-desktop-pdf-answered.png,
     addon-desktop-pdf-after-pill.png, addon-desktop-pdf-stream-evidence.png,
     addon-desktop-pdf-answer-long.png, addon-desktop-pdf-answer-scrolled.png.
  3. EPUB `サッカーの神様をさがして.epub`, 1440x900: tab strip 情報, 関連, 質問. Asked 「この本の主人公は
     何をさがしていますか？」; the answer streamed in with `[2]`, `[9]`, `[4]` shown as typed and then
     replaced by 本文 pills (the stored `document_sections` title). Clicking a 本文 pill moved the
     reader from the cover (reader `lastLocation.section.current` 0, fraction 0.0007) to section
     index 2 of 3, fraction 0.0049, the position line reading 「本文 この章あと 292 ページ 0%」. The
     URL stayed `/drive/scratch?file=w97skyzApJYy` and no document navigation was recorded. Shots:
     addon-desktop-epub-ask-tab.png, addon-desktop-epub-answered.png,
     addon-desktop-epub-after-pill.png.
  4. Video, skipped: `clip.mp4` never got a transcript. `.r5` indexing logged
     `app.workers.whisper: Transcription failed for /drives/scratch/clip.mp4: tuple index out of
     range` (after an ffmpeg language-detection exit 234), the job was recorded succeeded with
     `segments_count: 0`, `transcript_chunks` stayed empty, the file has no `indexed_files` row and
     the availability route keeps answering `false`; the restart did not retry it. So no time pill
     or seek could be produced.
  5. While an answer streamed the 質問する button was disabled (`disabled: true` at the first
     sampled text). A second submit through `form.requestSubmit()` produced no second POST
     (POST count 1→1). Leaving the page mid-stream (back to the drive, then another file) and
     switching file in place (the 関連 tab's similar-file link, no remount) both showed the POST to
     `/api/addons/intelligence/files/<id>/ask` failing with `net::ERR_ABORTED` and no
     `requestfinished`. The new file (EPUB) then showed only its own state: no question, no answer,
     and its own 質問 tab; returning to the PDF showed an empty 質問 tab (question and answer gone,
     not mixed with the other file). The in-place switch also showed the Ask tab appearing only
     after that file's availability answered (check 1). Shots: addon-desktop-leaving-midstream.png,
     addon-desktop-epub-own-state.png, addon-desktop-pdf-after-return.png,
     addon-desktop-related-switch-epub.png, addon-desktop-return-after-related.png.
  6. 390x844 (isMobile, hasTouch): the peek bar had no tabs; シートを開く opened the sheet at half
     (top 506) with 情報, ページ, 関連, 質問. Asked 「メニューを閉じるにはどうすればいいですか？」 and waited
     for the answer (162 chars, two p.2 pills). シートを下げる closed the sheet to the bar; reopening
     it showed 情報 selected with the question and the answer still in the store, and selecting 質問
     showed both unchanged (already-asked question, answer, partial line). No horizontal overflow
     (`documentElement.scrollWidth` 390 = `innerWidth` 390) and no overlap: at half the sheet's
     content scrolled (`scrollTop` 161→289 of 609/320) so the answer was fully inside the viewport
     (y 712–788), the sticky tab strip staying at the sheet's top; expanded to full (top 169) the
     box, button, question and answer were all visible at once. Shots:
     addon-phone-pdf-peek.png, addon-phone-pdf-ask-tab.png, addon-phone-pdf-answered.png,
     addon-phone-pdf-answer-belowfold.png, addon-phone-pdf-answer-scrolled.png,
     addon-phone-pdf-full.png, addon-phone-pdf-reopened.png, addon-phone-pdf-sheet-closed.png.
  7. `docker compose ... stop intelligence` during a stream did not cut it: the service drained the
     in-flight answer (2643 chars, no failure line) before the container stopped, so the tab showed
     a normal answered state. To produce the mid-stream disconnect the service was killed
     (`docker kill litloft-r5-d1-intelligence-1`) at the first received text: the text received so
     far stayed (44 chars) and 「答えを作れませんでした」 appeared in place of the rest; the Ask button
     became enabled again. Started intelligence again with `docker compose ... start intelligence`;
     it came back up. Shots: addon-desktop-stopped-midstream.png,
     addon-desktop-intelligence-killed-midstream.png.
  8. The Ask page `/drive/scratch/addons/intelligence` (h1 質問, Ask/Find mode tabs) still answers:
     asked the same question, got the answer with three page citations (`page 2`, `page 29`,
     `page 42`, linking to `/files/oM2PzgubAzbI?page=…`), a Markdown-save action and the Sources
     list, as before. Shot: addon-desktop-ask-page.png.

  Seen outside the checks: the knowledge addon's routes answered 502 (not part of this stack), the
  phone load logged minified React #418, and the Ask page issued two POSTs to `/ask` for one
  rendered answer (that page is not part of this change). No attempt was made to attribute them.
pending: The video checks (a time pill, its `M:SS`/`H:MM:SS` label, and `seek` on the open player)
  could not run because `clip.mp4` has no transcript in this environment (whisper failure, 0
  segments). The null-position/uncited-`[n]` case was not reachable: the prepared drive holds only
  PDFs and an EPUB, whose citations all carried a page or section position. Audio and video as
  heard and seen, the iOS app on a real device, real home-LAN playback and third-party addon
  services are `PROJECT.md` agent_cannot_verify items left to a human.
