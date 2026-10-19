# R-0: EPUB book surface takes the app's colours (PR-A, feat/epub-book-surface)

Declared with the spec `2026-09-27-epub-book-surface.md`, revised after its spec
review (10 findings). Approved by the user 2026-09-27.

## Touch points

- `frontend/public/epub-reader/reader.js`: `THEMES` removed; `themeCss` built
  from validated colours (or the system colours of the theme name), adding
  `--theme-bg-color`; `applyTheme` (also the reader document's `html`
  background); `openBook`; the `theme` message.
- `frontend/public/epub-reader/core.js`: validation of `colors` in `open` and
  `theme`.
- `frontend/src/lib/epubReaderChannel.ts`: `colors` on the `open` and `theme`
  commands.
- `useEpubReader`: reading the theme name and CSS variables together when
  `open` / `theme` is sent.
- `EpubPreview`: `bg-bg-card` → `bg-bg-primary` on the frame box, loading
  overlay and full-screen chrome bands.
- Tests: `epubReaderCore`, `epubReaderChannel`, `EpubPreview.test.tsx` (CSS
  variables set inline), `e2e-epub/fixtures/host.html`, `reader.spec.ts`,
  `typography.spec.ts`, `e2e-epub/preview` (theme switch plus a render).
- Not touched: sanitizer, `epubReaderCsp.ts`, typography values, progress
  saving, backend, endpoints, WS events, PDF.

## Invariants

1. With a book open under a dark or light app, after the theme changes and
   after any later render (resize, full screen, margin change), the reader
   area's page background and the margins around the page are the new
   `--bg-primary`.
2. The book's base text colour is `--text-primary` and its links are
   `--accent` of the current theme.
3. A `colors` value that is not an object of three 6-digit hex strings never
   reaches the book's CSS and never throws; the book is then shown in the
   system colours of the theme name.
4. A theme change does not move the reading position and writes no
   WatchHistory.
5. A theme change keeps the page shown (same section, same first text on the
   page).
