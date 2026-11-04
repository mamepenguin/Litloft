# Decisions

decision:
ran_in_app: yes
at: 28d2e1c70281dd4a8719ea497ac5fed34e69187d
by: agent
evidence: |
  Addon half (SPEC-ADDON-053, SPEC-ADDON-056) of `docs/specs/ask-about-this-file.md`.
  The first pass ran at f11bfeab7c18d8f5f9c6ab1d3b57f19cee7f48d6 with `addons/intelligence` at
  b91346b8a84b29805a5996dfecf8072e9e3342ec, the commit that core HEAD pinned; the video check 1
  re-run in item 13 ran at 28d2e1c70281dd4a8719ea497ac5fed34e69187d with the addon at
  61f3f8dfa4c595e15898571358c57c71dc8f4def. (Core SPEC-CORE-036 had already had its own R-5). Started with
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
   9. Video supplement. `lecture.mp4` (`tvT_hDTCFJ9f`, 39.48 s, AAC audio) was placed in the drive
      with new content under the name of the 14 s file the drive had already indexed, so the startup
      scan, the scan it was given and the addon's reconciliation all left its whisper row marked
      indexed (`added=0`, `updated: 0`). Its transcript was produced the way a user produces one:
      ファイル操作 → インデックス詳細 → 文字起こし（Whisper） → 再生成 → 再生成
      (`POST /api/addons/intelligence/files/tvT_hDTCFJ9f/reindex` 200, task moved to 未処理). Whisper
      then logged `Detected language 'ja'`, `duration: 37.4s`, `segments_count: 2, words_count: 146`
      and stored 3 `transcript_chunks` (0–13.58, 13.96–25.3, 25.3–37.24 s). Check 1, 1440x900: before
      the transcript the file page drew 情報, 関連 only and `GET …/files/tvT_hDTCFJ9f/ask` answered
      `{"available": false}`; it stayed that way for 15 minutes of polling. A page open on the file
      when the transcript finished did not gain the tab either: the addon posted
      `intelligence.transcription.completed` to the core's `addon-events` and the core answered
      `403 Forbidden`, and 15 minutes of polling left the strip at 情報, 関連. A fresh load a minute
      later had `/ask` answer `{"available": true}` and listed 情報, 関連, 文字起こし, 質問
      (`addon-video-desktop-tabs-with-transcript.png`); at 390x844 the peek bar has no tabs and the
      sheet lists the same four (`addon-video-phone-tabs-with-transcript.png`). Shots
      addon-video-desktop-tabs-before.png and addon-video-desktop-tabs-after.png are identical.
      **Check 1 of this item is superseded by item 13, the re-run after the event-delivery fix: the
      tab then appeared on the open page without a reload.**
   10. Check 2, 1440x900: in the 質問 tab asked 「日本で最初の様式灯台は何年に点灯しましたか？」. The
      answer streamed into the pane with `[n]` shown as typed and ended as 「日本で最初の様式灯台は、
      観音先灯台というもので、1869年に点灯しました 0:13。」: one pill labelled `0:13` (`M:SS`), no
      `[n]` left in the text, one POST to `/api/addons/intelligence/files/tvT_hDTCFJ9f/ask` (200).
      Clicking the pill moved the open player from `currentTime` 0 to 13.96, the URL stayed
      `/drive/scratch?file=tvT_hDTCFJ9f`, `framenavigated` did not fire and the `<video>` element
      was the same object before and after; the player read 0:13 / 0:14 (its total comes from the
      core's stale 14.58 s duration for this path, not from the 39.48 s file). Clicking the pill
      again while the video played moved 16.43 → 14.30. Shots addon-video-desktop-answered.png,
      addon-video-desktop-after-pill.png, addon-video-desktop-after-pill-playing.png. A pill past an
      hour could not be produced: the video is 39 s, so the `H:MM:SS` label was not exercised.
   11. Check 3, 390x844 (isMobile, hasTouch): the sheet opened at half (top 323) with 情報, 関連,
      文字起こし, 質問; asked the same question in the 質問 tab and got the same shape of answer
      (「…1869年に点灯しました 0:13。」). Clicking the `0:13` pill inside the sheet moved
      `currentTime` 0 → 13.96, left the URL unchanged, kept the same `<video>` element and lowered
      the sheet to its bar, so the player reading 0:13 / 0:14 was visible. Closing the sheet to the
      bar and reopening it showed 情報 selected with the question and the answer still in the store;
      selecting 質問 showed the question, the answer and its `0:13` pill unchanged, `currentTime`
      still 13.96. No horizontal overflow (`documentElement.scrollWidth` 390 = `innerWidth` 390)
      at any point. Shots addon-video-phone-peek.png, addon-video-phone-ask-tab.png,
      addon-video-phone-answered.png, addon-video-phone-after-pill.png,
      addon-video-phone-sheet-closed.png, addon-video-phone-reopened.png.
   12. The 403 above is the reason the tab does not appear live when a media transcript finishes: the
      whisper worker posts `/api/internal/addon-events` with no `X-Internal-Secret` while
      `CORE_INTERNAL_SECRET` is set, and `configure.py` generates that secret for the intelligence
      addon on a normal install.
  13. Re-run of video check 1 (1440x900) after the event-delivery fix. `lecture-again.mp4`
      (`vZ9j88Rfpt3S`, 39.48 s, the same 40 s Japanese lecture) was placed in drive `scratch` with no
      transcript; the startup indexing transcribed it during the stack build, before a page could be
      opened on it, so its index state was reset through the addon's own purge (`_purge_file`; its
      `indexed_files` and `transcript_chunks` rows then counted 0) and the re-run made from there. No
      code, config or model was changed. Script `.r5/addon-video3-1-appear.mjs`, shots
      addon-video3-desktop-tabs-before.png, -after.png, -reload.png.
      - 03:48:59.9Z page opened on `/drive/scratch?file=vZ9j88Rfpt3S` and never reloaded or navigated
        after that (`framenavigated` stayed at 2 for the whole wait). The strip read 情報, 関連 — no
        質問 — and `GET /api/addons/intelligence/files/vZ9j88Rfpt3S/ask` answered
        `{"available": false}` at 03:49:02; the video player itself was up (0:00 / 0:39).
      - 03:49:19.3Z transcription finished: the addon logged `transcription-event
        intelligence.transcription.completed {'file_id': 'vZ9j88Rfpt3S', 'drive': 'scratch',
        'provider': 'whisper_local', 'segments_count': 2, 'words_count': 146}`, the core answered its
        `POST /api/internal/addon-events` **204** (the earlier pass got 403), and the open page's
        WebSocket received
        `{"event":"intelligence.transcription.completed","data":{"file_id":"vZ9j88Rfpt3S",
        "drive":"scratch","provider":"whisper_local","segments_count":2,"words_count":146,
        "has_diarization":false}}` — so the message arrives, and its `drive` is `scratch`.
      - 03:49:19.3–03:49:20.3Z the same page called the availability route again (two
        `GET …/files/vZ9j88Rfpt3S/ask` 200s within a second of the event, the 質問 tab's refetch among
        them). At 03:49:20.0Z the strip on that page read 情報, 関連, 質問, with no reload. The core
        文字起こし tab was not listed at that moment and appeared only after the reload.
      - One reload, at the end of the run (03:49:23Z): the strip read 情報, 関連, 文字起こし, 質問.
      Check 1 passes: absent first, listed without a reload once the transcript existed.

  Seen outside the checks: the knowledge addon's routes answered 502 (not part of this stack), the
  phone load logged minified React #418, and the Ask page issued two POSTs to `/ask` for one
  rendered answer (that page is not part of this change). No attempt was made to attribute them.
pending: The null-position/uncited-`[n]` case was not reachable: the drive holds PDFs, an EPUB and
  two videos, whose citations all carried a page, section or time position, and the `H:MM:SS` pill
  label was not exercised because the video is 39 s. Audio and video as heard and seen, the iOS app
  on a real device, real home-LAN playback and third-party addon services are `PROJECT.md`
  agent_cannot_verify items left to a human.
