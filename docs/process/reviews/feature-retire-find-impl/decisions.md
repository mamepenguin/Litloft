# Decisions

decision:
ran_in_app: yes
at: 0e156cf5620cf5ae0ac133828e1e172f0e9f80c8
by: agent
evidence: Stack from this worktree (r5_stack clone/up, frontend image built here), opened at video-share-retire-find.localhost:3101, driven with headless Chromium (Playwright; the Chrome extension was not connected) at 1280px and 390px. (1) /drive/動画/addons/intelligence: no tab row, no link to /find; title, icon, "動画 · 864 items", + Scope and the question field shown; a question ("test question") was asked and an LLM answer with sources was returned (at 1280 it was still "Creating answer..." after 6 s, the answer was seen at 390). From docs folder "More actions" > "Ask here": URL ?scope=path:Knowledge/docs, "Folder Knowledge/docs" chip and "74 items" shown at both widths. (2) /search?q= with docs, "docs tag:foo", "docs -test", "\"docs\" OR deploy": the "..." menu in Files lists Save as Smart Collection and Selection mode; in Passages lists Save as Smart Collection; no "Find" row in any case, at both widths. (3) /drive/動画/addons/intelligence/find shows the 404 "This page could not be found." page (HTTP status reported 200 by the app shell). Screenshots (scratchpad): /private/tmp/claude-502/-Users-libre-Sources-video-share/a9c188d0-f38b-41fb-a2bd-e24625e9da13/scratchpad/{1280,390}-{ask,find,ask-scope,ask-submitted}.png and *-search-*.png. Stack taken down and destroyed, links removed.
pending: none
