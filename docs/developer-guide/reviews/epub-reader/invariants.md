# PR-2 invariants (R-0, approved by the user 2026-09-26)

1. No script inside an EPUB runs (inline, `<script src>`, `on*`, `javascript:` links, SVG, `srcdoc`, meta refresh) — with both the sanitizer and the CSP, and with either one alone.
2. The reader parses no book unless its CSP is proven active (header missing → `error isolation`).
3. Every response under `/epub-reader/` carries the CSP; its `script-src` does not match `/api/`; a raw path under `/epub-reader/` that is not a reader file is 404 (including `..%2F`).
4. Only a reader action (key, swipe, edge tap, `turn` message, in-book link) writes progress; opening, restoring, resizing, theme change and entering / leaving full screen leave the stored value unchanged.
5. A turn across a chapter boundary writes progress.
6. After a write, reopening at the same size lands on the same page, in horizontal and vertical-rl books.
7. Entering and leaving full screen neither refetches `/stream` nor reloads the reader iframe.
8. Only a book left on its last page reopens at the start, and its record survives.
9. Opening an EPUB never changes the shared `image-viewer:reading-direction` preference.
10. The parent acts only on messages from its own reader iframe, and only on allowlisted keys and `http(s)` links.
11. A fixed-layout book shows "unsupported" with a download, not a blank reader.

## Revision after round 1 (approved by the user 2026-09-26)

12. Every reader action that moves the page writes progress (the converse of 4). (P3)
13. Full screen can be entered and left with the keyboard and with touch on a phone. (P2, own R-5)
14. Reopening at any window size never lands on a blank padding page. (P1)
15. Moving to another EPUB while the preview stays mounted opens the new book. (P6)
16. No request from a book reaches anything but `blob:`, `data:` or the reader's own files. (S4; wording fixed after round 2, sec-F10: a request the proxy answers with 404 does not reach anything)

## Revision after round 3 (approved by the user 2026-09-26)

2. (revised) The reader parses no book unless the page's CSP is active: with the header missing, or with `'unsafe-eval'` or `'unsafe-inline'` allowed, it reports `error isolation`. That the header carries the reader's exact policy is held by the unit tests on `epubReaderCsp` and the proxy, not by a runtime probe. (Round-3 trajectory C, supervisor-assigned: the outside-directory probe added a prediction in two rounds in a row and is removed.)
