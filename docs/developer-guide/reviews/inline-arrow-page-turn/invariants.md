# R-0 invariants: inline arrow keys turn pages in PDF and EPUB

1. Inline PDF: `→` shows the next page and `←` the previous, clamped to 1..numPages, never following reading direction; the move is saved as a reader turn exactly as PageDown / PageUp are.
2. Inline EPUB, focus on the page (body or inside the viewer): `←` / `→` send turn("left") / turn("right"); a turn is saved like any reader turn.
3. Inline EPUB, focus inside the reader iframe: `←` / `→` turn the book left / right and nothing is handed to the page; `f` is still handed to the page and opens full screen.
4. With focus on a focusable outside the viewer (e.g. the inspector tab strip, which owns ←/→), the arrows turn no page in either viewer.
5. With focus in an editing element (the PDF page-number box), the arrows turn no page.
6. Arrows never change file on PDF / EPUB pages; other non-media files keep arrow file navigation; video / audio / .loft keep seek.
7. Full-screen PDF and EPUB key behaviour is unchanged (arrows follow reading direction; `f` / `Esc` close).
8. PageUp / PageDown / Space / `f` scoping in both inline viewers is unchanged.

## Revised after r1 (by the user, prompted by F4)

9. An arrow pressed with Shift, Alt, or the platform's primary modifier (Meta on macOS, Ctrl elsewhere) turns no page, on the page or inside the EPUB reader, inline or full screen.
7 (amended). Full-screen PDF and EPUB key behaviour is unchanged, except that invariant 9 now also holds in the full-screen EPUB reader, where Shift+arrow used to turn the page.
