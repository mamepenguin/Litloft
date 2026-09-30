# Round 1 — markdown table scroll

Reviewed: `879ad24a11f836d3f08d9b2c5f2138ee5b89fb89` (worktree `/Users/libre/Sources/video_share-review-879ad24`), parent `develop`.

## Mutation table

| # | Mutation | want | result |
|---|---|---|---|
| M1 | `table_open` rule removed (stray `</div>` from close remains) | kill | killed (`scrollerWidth` 393 != 345) |
| M1c | both `table_open` / `table_close` rules removed | kill | killed (`scrollerWidth` 393 != 345) |
| M2 | `table_close` no longer emits `</div>` | kill | **survived** |
| M3 | `.markdown-table-scroll { overflow-x: visible }` | kill | killed (`scrolledTo` 0 != 50) |
| M4 | `.markdown-table-scroll { overflow-x: hidden }` | kill | **survived** |
| M5 | `.markdown-table-scroll { overflow-x: scroll }` | live | survived (as intended) |
| M6 | `.markdown-table-scroll > table { margin: 0 }` removed | kill | **survived** |
| M7 | wrapper `margin: 1em 0` removed | kill | **survived** |
| M8 | `width: 100%` removed from `.markdown-body table` | kill | killed (`narrowWidth` 116.8 != 345) |
| M9 | fixture: only the long body row of the wide table shortened | kill | survived — header row alone is still wider than 345px, so the mutation did not make the table narrow; not a gap |
| M9b | fixture: wide table replaced by a 2x2 table | kill | killed (`scrollerScrollWidth` 345 not > 345) |
| M10 | fixture: narrow table removed | kill | killed (`toHaveCount(2)` got 1) |
| M11 | `markdown-table-scroll.spec.ts` removed from `AT_THE_PHONE_WIDTH` in `spec-viewport.spec.ts` | kill | killed (spec-viewport: 1 failed) |

All vitest runs (`MarkdownPreview*`, `componentFixtureParity`) stayed green (50 passed / 2 skipped) under every mutation: no unit test observes the table wrapper. The fixture parity test holds the `markdown-tables` arrangement name only.

Rhythm measurement (temporary spec, removed; 393px Pixel 5 project, `#markdown-tables`), gaps in px:

| variant | p -> table 1 | table 1 -> table 2 | table 2 -> p | "After the tables." parent |
|---|---|---|---|---|
| parent (`HEAD~1`) | 16 | 14.875 | 14.875 | `.markdown-body` |
| HEAD | 16 | 16 | 16 | `.markdown-body` |
| M6 | 30.875 | 45.75 | 30.875 | `.markdown-body` |
| M2 | 16 | 16 | 0 | `.markdown-table-scroll` |

## Touch points the diff reaches that are not in the list

- `frontend/e2e-components/stubs/buffer-global.ts`, imported at the top of `fixtures/app.tsx`: a fake global `Buffer` now exists for **every** arrangement in the component fixture bundle, not only `markdown-tables`. No other arrangement was observed to depend on `Buffer` being absent (spec-viewport passed); noted, no finding.
- `.markdown-body > :first-child` / `> :last-child` (globals.css:538-539) now match the wrapper instead of the table when a note starts or ends with a table. Equal specificity (0,2,0) to the wrapper rule and declared later, so the wrapper's edge margin is zeroed and the inner table's margin is 0 — the behaviour is preserved. No finding.
- The mobile `@media (max-width: 767px) { .markdown-body table { font-size: 0.93em } }` rule: the table's vertical margin used to be in the table's em; it is now in the body's em (see F4).
- `useHighlightPassage` (TreeWalker over text nodes) sees one extra `"\n"` text node inside each wrapper; whitespace is collapsed by its normaliser, so matching is unchanged. `scrollIntoView` on a `<mark>` in a far column now also scrolls the nested scroller (an improvement). `useDocumentCapturePublisher` has no table/structure dependency. No addon CSS or code in `addons/*/frontend` selects `.markdown-body > table` or relies on `table.parentElement`; the intelligence `DetailedSummarySection` test uses `container.querySelector("table")`, which is unaffected. No finding.
- `DetailedSummarySection` (intelligence addon), listed as a MarkdownPreview caller in the touch points, renders its tables itself (`TableGroup`, `<div className="markdown-body markdown-segment"><table>`), not through MarkdownPreview — see F5.

## Findings

### F1 [introduced] Medium — the wrapper's close is not held by any test (M2 survives)
`frontend/src/components/MarkdownPreview.tsx:237-240`, `frontend/e2e-components/markdown-table-scroll.spec.ts`.
If `table_close` stops emitting `</div>`, the browser closes the wrapper at the end of `.markdown-body`, so every block after the first table (later tables, paragraphs, headings) lives inside the first table's horizontal scroller and scrolls sideways with it. Measured under M2: "After the tables." has parent `.markdown-table-scroll` and the table -> paragraph gap drops to 0. The spec stays green because it only looks at `wide.parentElement` and at the narrow table's width (the nested second wrapper is also column-wide). This breaks invariants 3 and 5 while the test passes. The implementation at HEAD is correct; the gap is in the test (e.g. assert the paragraph after the tables is a direct child of `.markdown-body`, or that each table's scroller contains exactly one table).

### F2 [introduced] Medium — the test cannot tell "the user can scroll" from "clipped" (M4 survives)
`frontend/e2e-components/markdown-table-scroll.spec.ts:20,37`.
`scroller.scrollLeft = 50` succeeds programmatically on an `overflow-x: hidden` element, so `scrolledTo === 50` holds even when the table is clipped and cannot be swiped — which is the original bug. Under M4 all assertions pass. Invariant 1 ("the table scrolls horizontally inside its own container") is therefore not held against a hidden/clip regression. A computed-style check (`overflow-x` in `auto|scroll`) or a real wheel/touch scroll (`page.mouse.wheel` over the scroller) would kill it.

### F3 [introduced] Low — invariant 3 (vertical rhythm, not doubled) is not held (M6, M7 survive)
`frontend/src/app/globals.css:410-413,425`.
The wrapper is `overflow-x: auto`, so it is a BFC and the table's own margin no longer collapses through it; `> table { margin: 0 }` is what prevents doubling. Removing it (M6) gives 30.9px / 45.8px gaps instead of 16px, and removing the wrapper margin (M7) removes the rhythm altogether; the spec passes both. The spec measures only horizontal quantities. A user would see doubled gaps around every table if that one rule were lost.

### F4 [introduced] Low (B) — table margins moved from the table's em to the body's em
`frontend/src/app/globals.css:410-413` vs `:417-423,669`.
Before, the table carried `margin: 1em 0` at its own font size (0.95em desktop, 0.93em mobile), i.e. 14.875px at 393px; now the wrapper carries `1em` of the body font, 16px. Measured: table -> table and table -> following paragraph gaps go 14.875 -> 16 at phone width (desktop 15.2 -> 16 by computation). Not doubled, ~1px, and arguably closer to "one 1em margin"; recorded because it is a change in non-horizontal layout the commit does not claim. No action proposed.

### F5 [pre-existing] Info — intelligence detailed-summary tables are not wrapped
`addons/intelligence/frontend/DetailedSummarySection.tsx:1779-1780` (main checkout; submodule is empty in the review worktree).
`TableGroup` renders `<div class="markdown-body markdown-segment"><table>` directly, bypassing markdown-it, so it gets neither the wrapper nor `overflow-x`. A wide detailed-summary table on a phone behaves as before this commit (clipped/overflowing per the parent's CSS). Not introduced — the diff does not touch that component — but the touch-point list names DetailedSummarySection as covered, and it is only covered for tables that reach it through MarkdownPreview paragraphs. By reading, not reproduced in a browser.

Invariant 4 (sanitizer): the wrapper is a static `<div class="markdown-table-scroll">` string with no interpolated input; `html: false` stays set and the DOMPurify config is unchanged. No finding. Invariant 5: only `table_open`/`table_close` rules were added; non-table tokens render through unchanged rules. No finding.

TOTAL: 5 findings
