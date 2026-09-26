# R-0: EPUB reader table of contents (PR-3, feat/epub-reader-toc)

Declared with the spec `2026-09-27-epub-reader-toc.md`, revised after its spec
review (13 findings). Approved by the user 2026-09-27.

## Touch points

- `frontend/public/epub-reader/reader.js`: a `goToToc` message using
  `state.tocHrefs` and `turn()`.
- `frontend/public/epub-reader/core.js`: `flattenToc` (no href without a
  target), validation of a TOC index.
- `frontend/src/lib/epubReaderChannel.ts`: the `goToToc` command.
- `frontend/src/lib/epubToc.ts`: the index of the entry for a place, and
  whether any entry can be selected.
- `useEpubReader`: `goToToc(index)`.
- `EpubPositionBar`: the contents button beside Aa; its `typographyOpen` /
  `onToggleTypography` props.
- `EpubPreview`: `typographyOpen` replaced by `openPanel`; the TOC panel under
  the same DismissScrim, chrome hold, Escape shortcut, full-screen close and
  focus rules.
- A new `EpubTocPanel` (presenter), carrying `data-swipe-exempt`.
- Tests: `EpubPreview.test.tsx` (the PR-2 tests keyed on `typographyOpen`),
  `epubReaderCore`, `epubReaderChannel`, `epubToc`,
  `src/__tests__/popup-dismissal.test.ts` (the new popup), `e2e-epub`.
- `design-decisions.md` › Watch history (a TOC move is a reader action).
- `messages-core` (`file.epub*` keys), `docs/user-guide/viewers-and-players.md`,
  `docs/user-guide/keyboard-shortcuts.md`.
- A real-browser measurement: the bar with two 44 px buttons at 320 and 375 px
  (inline and full screen, ja/en); opening the list with the current entry near
  the end of a long TOC.
- Not touched: sanitizer, `epubReaderCsp.ts`, backend, endpoints, WS events,
  the typography path.

## Invariants

1. Selecting an entry shows that entry's target (its section, at its fragment
   when it has one); when the page changes it posts exactly one `turned` and
   WatchHistory is written once, and when it does not, nothing is written.
2. No href or markup from the book reaches the page: labels are rendered as
   text nodes, and the page sends the reader only an index.
3. An entry with no target cannot be selected. A `goToToc` whose index is not
   an integer, is out of range, or names an entry with no target does nothing:
   no turn, no console error, the book stays where it is.
4. Opening, scrolling and closing the panel never re-lay out the book, move the
   page or the frame box, or write anything.
5. At most one panel is open. Opening a panel keeps it open (it never closes
   itself as it opens). From the keyboard, the other panel's button switches to
   it.
6. The panel closes on a press over the book (which turns no page), its button,
   Escape (without leaving pseudo full screen) and any change of full screen;
   after any close, selection included, focus is on the book and keys turn
   pages. While it is open the full-screen chrome stays up, and a swipe on it
   never enters or leaves full screen. The text-settings panel keeps every
   property PR-2 declared.
7. In the list, ↑ / ↓ / Home / End move focus between entries that can be
   pressed and do not scroll the page; Enter and Space select.
8. On open, the entry for the current place is marked and visible in the list;
   focus is on it when it can be pressed, otherwise on the first entry that can.
9. When no entry can be selected (an empty TOC, or no entry with a target) the
   contents button is disabled.

## Real-browser measurement (author, before round 1)

Running app, the VS Code guide (102 TOC entries) near its end; Chromium at 320
and 375 px and WebKit at 375 px, inline and full screen, ja and en. Opening the
contents left `window.scrollY`, the frame box's `scrollTop` and `main`'s
`scrollTop` unchanged (4); the current entry was inside the list's box with
focus on it (8). The bar with the contents button and Aa fits at 320 px; a long
chapter label is cut with an ellipsis, as designed.
