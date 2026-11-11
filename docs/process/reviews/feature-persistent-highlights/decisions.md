# Decisions

decision: ship (human, 2026-11-07: "ship"), on review r1 HUMAN_REVIEW_REQUIRED (unspecified_behavior: HighlightControls.tsx, types/raw.d.ts, the TextLines key change and the DEFERRED_ARRANGEMENTS bootstrap are outside the touch points). The R-5 re-run for the drag-select fix 1bcae5b29 and a mutation review of the write paths were offered and not requested.
ran_in_app: yes
at: c4bbea5abe227695096d33f020ae0b576b142b11
by: agent
evidence: Scratch stack (core + knowledge addon, project hlscratch, port 3101, scratch data and drive; torn down afterwards). Chrome, 1400x900. Profile session via http://localhost:3101 (cookie lit_viewer set), no-profile session via http://127.0.0.1:3101.
  Markdown (Knowledge editor reading view): select, Highlight button appears left of the quote button, mark drawn, persists after reload; overlapping marks; click in overlap removes the newest first; split view re-matches (mark disappears after typing inside the quote, returns after undo). Selection ending inside a mark makes a new highlight. A drag that STARTS inside an existing mark produced no selection (repeated twice, getSelection empty).
  Plain text: multi-line selection saved, reloads in place. PDF inline: save on page 1, mark kept at 100% -> 150% zoom, not drawn on page 2; full screen on page 2: save, closing full screen shows the same mark inline (shared state); Remove inline deletes exactly that record.
  No profile: record in localStorage highlights:<id>, no server call, survives reload, Remove empties the array; server GET answers [] and POST 401 without viewer; another viewer header sees [].
  API: dup POST 200, 501st POST 409, page on md 422, pdf without page 422, blank quote 422, DELETE unknown id 204, unknown file 404; trash then GET 404, restore then the highlight is back.
  Speed: 976 KB text, 500 highlights: all 500 marks present 615 ms after navigation start, no long task during later interaction; limit message shown on the 501st save and selection kept. Rendered as plain text (too large for line numbers).
  No screenshot files saved; observations are from live screenshots and DOM/API reads.
pending: In-file find marks over highlights (find bar needs the intelligence addon, not run). AI-summary MarkdownPreview showing no controls (intelligence addon not run). Failed save/remove/load with the server down (not produced). Touch and iOS. Another nickname in a second browser profile (only the no-viewer and header cases were run).
