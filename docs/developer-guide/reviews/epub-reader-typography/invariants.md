# R-0: EPUB reader typography (PR-2, feat/epub-reader-typography)

Declared with the spec `2026-09-27-epub-reader-typography.md`, revised after
its spec review (16 findings). Approved by the user 2026-09-27.

## Touch points

- `frontend/public/epub-reader/reader.js`: `openBook` (typography before
  `restore()`), the string passed to `renderer.setStyles`, the renderer `gap`
  attribute, the section `load` handler (the book's own root size, kept per
  section document), a `typography` message queued behind `state.turning`, the
  reading-place range kept apart from reflow relocates.
- `frontend/public/epub-reader/core.js`: `isValidOpen` (typography optional,
  defaults on anything invalid), typography validation, CSS building, the step
  table.
- `frontend/src/lib/epubReaderChannel.ts`: `open.typography`; the `typography`
  command.
- A new typography preference module over `safeStorage` (localStorage), with
  the parent's copy of the step table.
- `useEpubReader`, `EpubPositionBar`, `EpubPreview`: the Aa button outside the
  scrub row, the panel and the cover inside the frame box, panel state and its
  closing on any full-screen change, focus in and out, the chrome hold, the
  panel's Escape shortcut.
- `frontend/src/components/player/hooks/useFullscreen.ts`: the swipe
  exemption widened to the panel.
- `design-decisions.md` › Watch history (typography must not write it).
- `messages-core` (`file.epub*` keys), `docs/user-guide/viewers-and-players.md`.
- Not touched: backend, endpoints, WS events, sanitizer, `epubReaderCsp.ts`,
  the reader's key forwarding (`core.js` `keyAction`).

## Invariants

1. With no setting stored, every section renders exactly as before this
   change: no typography CSS is emitted and `gap` stays `6%`.
2. A typography change writes no WatchHistory and posts no `turned` — including
   one made while a seek, a TOC or link move, or a page turn is under way.
3. After a typography change the text that began the page is still on screen —
   straight after opening, straight after a seek, and when the change arrives
   during a move. Applying a setting and then its previous value shows the page
   shown before (a section with no images).
4. Opening a book with a stored setting: the first `location` after `ready` is
   the page `restoreAnchor` picks for the saved fraction in the layout under
   that setting.
5. At every font-size step, in every section and after any sequence of steps,
   the root size is the step times the book's own root size (a book with
   `html { font-size: 62.5% }` at 130 % renders its root at 1.3 × its own size in
   its third chapter as in its first).
6. The setting survives a reload and applies to every book on the device.
   Blocked or corrupt storage, and an `open` with a missing or invalid
   `typography`, give the defaults and the book still opens.
7. The sanitizer and the CSP policy are unchanged.
8. Opening or closing the panel never re-lays out the book. While it is open:
   the full-screen chrome stays up; a press on the book closes the panel and
   turns no page; a swipe on the panel never enters or leaves full screen;
   Escape closes the panel and not pseudo full screen. Entering or leaving full
   screen closes the panel. After it closes, focus is on the book and keys turn
   pages.
9. A theme change keeps the typography, and a typography change keeps the
   theme. The font of `code`, `pre` and what is inside them is never changed.
