# Decisions

decision:
ran_in_app: yes
at: 8547a14b0af6221ecb268034c086ce489b6213c0
by: agent
evidence: |
  SPEC-ADDON-060 (PDF page edges). Core HEAD 8547a14b0af6221ecb268034c086ce489b6213c0 pins
  `addons/intelligence` at 9e8a7e54e4da0de7c08f7c595bb8c49fdc1ee2cf (clean tree), so the built code is
  the reviewed change. Started with
  `LITLOFT_PORT=3995 docker compose -p litloft-r5-fn -f docker-compose.yml -f .r5/override.yml up -d --build backend frontend intelligence`;
  backend and intelligence came up healthy. Drove http://localhost:3995 in Chromium (Playwright,
  1440x900, `NEXT_LOCALE=ja`) with scripts `.r5/fn-*.mjs`; screenshots in
  `docs/process/reviews/feature-pdf-footnotes/shots/fn-*.png`. Band lines were listed first with
  PyMuPDF 1.25.5 in `.trial-out/venv-fn` (`.trial-out/fn_bands.py`), page by page, top/bottom 50 pt.

  Expected band content per file, from that pass (before upload):
  - `jp_whitepaper_r06_ch1-1-2.pdf` (10 pages): every page has a top running header
    「第2 節」/「通信、放送、郵便等の状況」and a bottom running footer 「令和6年版　情報通信白書　第Ⅰ部」
    plus a bare page number (4–13). No other band text.
  - `gen_slides.pdf` (2 pages): top titles, and footers 「Source: generated trial data. Slide 1 of 2.」
    (p1) and 「Image: NASA. Slide 2 of 2.」 (p2). The two footers share a key but sit on 2 pages, below
    the 3-page threshold, so both are expected to be kept.
  - `gen_footnotes.pdf` (1 page): only the title at y=41; its twelve notes are above the bottom band.
  - `en_grouplasso_2611.04939.pdf` (10 pages): nothing but page numbers. Used as the control.

  1. Upload. Four PDFs uploaded through the inbox 「追加 → ファイル」 chooser (fn-upload.mjs,
     shots/fn-upload.png); all four appeared as 保存済み. All four reached `text_indexed=1`
     (`gen_footnotes` first, the other three after the restart described below).
     Exact search (`GET /api/addons/intelligence/search/exact`, the mode behind the MCP
     `search_exact` tool; this build has no exact toggle in the UI) found every band-only word on the
     right page:
       generated trial data → gen_slides.pdf, page 1, chunk 0, 1 match
       Image: NASA          → gen_slides.pdf, page 2, chunk 1, 1 match
       Slide 2 of 2         → gen_slides.pdf, page 2, chunk 1, 1 match
       情報通信白書          → whitepaper, page 1, chunk 3, 1 match (the running footer)
       通信、放送、郵便等の状況 → whitepaper, page 1, chunk 0, 1 match (the running header)
       第2 節               → whitepaper, page 1, chunk 0, 1 match
       Footnote-heavy       → gen_footnotes.pdf, page 1, chunk 0, 1 match (library already kept it;
                              containment dropped the duplicate, so exactly one)
     grouplasso has no band-only word to search for (page numbers only).
     Semantic search in the UI found band-only text: 「generated trial data」 listed Gen slides with
     p.1 (fn-search-probe.mjs gen-trial, shots/fn-search-gen-trial.png), and 「情報通信白書」 listed
     the whitepaper with p.1 and an excerpt ending 「令和6年版 情報通信白書 第Ⅰ部」
     (shots/fn-search-情報通信白書.png).
     Stored text confirms placement: whitepaper chunk 0 (page 1) begins
     「第2 節 / 通信、放送、郵便等の状況」 before the Markdown; chunk 3 (page 1) ends with the footer
     after the Markdown's `-----`, separated by blank lines. gen_slides chunk 0 ends with
     「Source: generated trial data. Slide 1 of 2.」, chunk 1 (page 2) ends with 「Image: NASA. Slide 2 of 2.」.
     `GET /files/wmW2kQxify96/pdf-markdown` contains both footers.

  2. Running header and bare page numbers. The whitepaper header repeats on all 10 pages and the footer
     on all 10; exact search for 「通信、放送、郵便等の状況」 returned total 1 on page 1, and
     「情報通信白書」 total 1 on page 1. Reading `fts_text_content` per page, pages 2–10 hold neither
     header, footer nor a bare number; the only bare-number lines in the file are chart axis labels
     (page 1 axis 10,000…0, page 3 axis 900…0). grouplasso's page numbers produced no bare-number
     lines either; its page 7 starts with the figure's axis labels (4, 3, 2, 1), which are body text.
     The UI semantic search for the header phrase lists p.1–p.7 because it scores the individual words
     of the phrase, which also occur in the body; it is not a second copy of the header line.

  3. File page and the 質問 tab. `gen_slides.pdf` (wmW2kQxify96) at 1440x900: tabs 情報, ページ, 関連, 質問.
     Asked 「このスライドの下部に書かれている出典の文は何ですか？」; answer:
     The source written at the bottom of this slide is "generated trial data. Slide 1 of 2" p.1.
     (shots/fn-slides-tab.png, fn-slides-answer.png). Whitepaper (1KR_dGpuwbM_): asked
     「1ページ目の下端に書かれている文をそのまま引用してください。」; answer quoted
     「令和6年版　情報通信白書　第Ⅰ部」, the band footer (shots/fn-whitepaper-answer.png).
     Observation, not a claim about extraction: its SSE `citations` event said
     `[{"n": 5, "position": {"page": 2}}]`, so the UI showed p.2 for a line that only exists on page 1
     (page 1's chunk 3). A control question about a page-1 body fact («固定電話は最大何回線…») answered
     7,860回線 and cited page 1. The wrong marker is the model's pick among 1-based passages, not a
     chunk bound to page 2.
     `read_document` (the same surface behind the MCP tool; the MCP server in this session points at
     another instance, so I called `GET /files/{id}/document-text` through the app):
     gen_slides p1 ends with the band footer, p2 with the NASA footer; whitepaper p1 starts with
     「第2 節 / 通信、放送、郵便等の状況」 and ends with the footer, p2/p10 have neither;
     grouplasso p1/p7 show no band line. Same lines, same pages, as indexing.

  4. Restart. `docker compose ... restart intelligence`, twice. Startup from
     「Semantic search service starting」 to 「ready on port 8100」: 102 ms (12:09:06.401→.503) and
     53 ms (12:09:36.476→.529), with no long block; each time
     「Reconciliation complete: ... resumed=0」 and no reset of any PDF. Admin dashboard before and
     after both restarts: 21/21 files indexed, 画像分析完了 16/16, テキスト解析完了 5/5, OCR 16/16,
     処理キュー 0件処理中 / 0件待機 (shots/fn-admin-before-restart.png, fn-admin-after-restart-1.png,
     fn-admin-after-restart-2.png).
     The one-time re-extraction on a new `PDF_TEXT_RULES_VERSION` was not observable in this
     environment: the scratch `data/` had no PDFs when the container first started, so the first start
     logged 「PDF text rules are now 1; 0 PDFs will be re-extracted」 (11:56:21) and nothing was reset
     afterwards. What was seen is that a restart with the version already recorded re-queues nothing.

  Environment incidents seen while indexing (reported, not fixed):
  - The four simultaneous scan-complete webhooks of the upload produced
    「Reconciliation failed: UNIQUE constraint failed: indexed_files.file_id」 once (11:58:24); the
    later reconciles added the remaining rows and all four files ended indexed.
  - Three text tasks failed at 11:58:35 with `sqlite3.OperationalError: disk I/O error` /
    「vtable constructor failed: fts_text_content」 while I was reading the same WAL database from the
    host with the `sqlite3` CLI against the bind mount. A restart resumed them (resumed=3) and all
    three completed; no error appeared once host-side reads stopped. This is the spec's
    "later `_resume_incomplete` queues it again" failure path, and it recovered.
  - Two 502s on `/api/addons/knowledge/...` (knowledge addon not part of this stack) appeared on the
    file page; unrelated to this change.
pending: |
  - The first start with a new `PDF_TEXT_RULES_VERSION` (I6's reset of every PDF, active or not)
    could not be exercised: the version was already recorded before any PDF existed. A human would
    need a copy of the index that predates this change to see the one-time backlog.
  - `read_document` through the addon's MCP server was not used: the MCP connection in this session
    targets a different Litloft instance. The same endpoint was called through the app instead.
