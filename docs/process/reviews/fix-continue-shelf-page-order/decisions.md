# Decisions

decision:
ran_in_app: yes
at: 95f332e390c7a04969211c17b08c6d07d3a3e430
by: agent
evidence: Own stack from this worktree (compose project `shelforder`, port 3100, fresh data/, test drive `r5` with clip1-5.mp4 and bookA-D.pdf added in that order). Profile `r5tester` set through the header Profile control; progress written with POST /api/files/{id}/progress so last played (video clip3, clip5, clip1, clip4, clip2; reading BookC, BookA, BookD, BookB) differs from added newest (clip5..clip1; BookD..BookA). Driven with Playwright Chromium (Claude in Chrome was not connected) in Video and Reading, en and ja (ja set through Settings > Language), at 1280x900 and 390x844: 8 runs, all steps passed with no difference from the spec.
  - Discover Continue See all link is `.../shelf?by=watch&key=continue&from=discover` (no sort); Discover's request stays `sort=last_played` with no order.
  - See all page requests `sort=last_played&order=desc&per_shelf=60&page=1`; its order equals the Discover shelf order (Discover shows a prefix: 3 cards desktop, 4 phone video, all 4 books); sort button reads Last opened / 最後に開いた順.
  - Its menu lists Last opened, Added (newest first), Added (oldest first), Title, Size (ja: 最後に開いた順, 追加日（新しい順）, 追加日（古い順）, タイトル, サイズ) with Last opened checked. Picking each sends created_at/desc, created_at/asc, title/asc, file_size/desc and reorders; picking Last opened again restores the first order. URL does not change.
  - New shelf (by=all&key=all), by=watch&key=unwatched, both with and without `?sort=played`: request created_at/desc, label Added (newest first), four choices only. Library tab (opened with `?sort=played` in the URL): four choices, Added (newest first); its See all link carries `sort=size` after picking Size, never `sort=played`. No non-Continue request carried last_played in any run.
  - Continue page with `?sort=newest|oldest|title|size` opens on that choice and pair; `?sort=played` and `?sort=bogus` open on Last opened.
  - Back/forward: Discover -> Continue page -> back -> New See all -> back -> forward follows each page. With adjacent shelf entries in one mounted page (created with history.pushState, since the UI offers no shelf-to-shelf link): Continue (Last opened, or with Title chosen) -> New shelf requests created_at/desc and shows Added newest with four choices; back returns to Last opened with last_played/desc; forward to Added newest again.
  - Failure: the Continue shelf request aborted shows Retry (再試行); Retry after unblocking loads in Last opened order. No profile: no Continue request is sent, page shows the empty state (No files / 本がありません) with the button reading Last opened.
  - Logs and screenshots (session scratchpad): /private/tmp/claude-502/-Users-libre-Sources-video-share/549179c9-0a7a-4d9d-820c-872f0e0af493/scratchpad/r5/log-{video,reading}-{en,ja}-{desktop,phone}.txt and *-{A-discover,B-continue-page,C-menu,C-back-to-last-opened,D-new-page-menu,D2-pushed-other,G-library-menu,H-failure,I-noprofile}.png
pending: none
