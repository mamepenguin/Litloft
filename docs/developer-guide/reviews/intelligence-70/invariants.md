# intelligence IME Enter guard invariants (R-0, approved by the supervisor 2026-09-14)

1. In the Ask field, an Enter pressed within the grace window after `compositionend` does not start an Ask (0 requests; the text stays).
2. In the Ask field, an Enter with `isComposing: true` or `keyCode 229` does not start an Ask.
3. In the Ask field, an Enter after the grace window starts exactly one Ask. Shift+Enter still does not send.
4. In the search-compare field, a confirming Enter (within the grace window) does not search, nor does an `isComposing` / 229 Enter.
5. In the search-compare field, an Enter after the grace window searches exactly once.
6. The Ask button, the `?q=` auto-run, and the search-compare Search button are unchanged.
7. `pages/find.tsx` is not touched.
