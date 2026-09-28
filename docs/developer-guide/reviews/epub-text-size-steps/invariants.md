## R-0

### Touch points

- `localStorage["epub-reader:typography"]` — read (legacy + new) and write
- `frontend/src/lib/epubTypography.ts` — parse/write/defaults/isDefault
- `frontend/public/epub-reader/core.js` — `readTypography`, `typographyCss`
- reader ↔ page messages `open.typography`, `typography`
- `EpubTypographyPanel.tsx` — size row
- tests that inject or assert size: `epubTypography.test.ts`,
  `epubTypographyCss.test.ts`, `EpubPreview.test.tsx`,
  `e2e-epub/typography.spec.ts`, `e2e-components/segmented-control.cases.ts`,
  `e2e-components/fixtures/app.tsx`

### Invariants

1. A stored legacy `{fontSize: i}` for i in 0–6 opens the book at
   `[80,90,100,115,130,160,200][i]` percent; a present `fontPercent` always
   wins over a legacy `fontSize`.
2. After any panel action that sends a `typography` message, storage holds
   `fontPercent` and no `fontSize`. (Reset at defaults sends nothing and
   writes nothing.)
3. One press of − or + changes the applied root font size by exactly 5% of
   the book's own root size; it never compounds on the previous step.
4. At 100% no size rule is emitted (the book's `html{font-size:…}` survives).
5. − is disabled at 80 and + at 200; the value never leaves 80–200.
6. An invalid `fontPercent` (out of range, off-grid, non-number) resets only
   the size to 100; the other fields keep their stored values.
7. Page and reader accept and reject exactly the same `fontPercent` values.
8. A size change never saves the reading position (typography is not a turn).
9. N presses of + followed by N presses of − show the page that was shown
   before them, and a burst of presses applies only its last value.

### Revisions

- r1: touch points gain `frontend/public/epub-reader/reader.js`
  (`applyTypography`, `drainPending`, the `typography` case) — unchanged by
  the diff, but invariants 8 and 9 depend on it.
