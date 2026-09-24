# R-0 invariants — feat/search-page-pills (bdfc0e45e)

1. In the search dropdown (MergedResultItem), activating page pill N (click, Enter or Space) calls onSelect exactly once, with `/files/{id}?page=N`; the row's own onSelect does not also fire.
2. On a result card/row (MatchOverlay), page pill N is a link to `/files/{id}?page=N`, and clicking it does not also trigger the card's or row's own navigation/selection.
3. Every page in `matched_pages` gets exactly one pill, in the order given; no page is dropped or folded into a count.
4. Clicking the dropdown row (outside any pill) still selects `/files/{id}` with no `page` parameter.
5. A hit with no `matched_pages` renders no page pills, and MatchOverlay still renders nothing for a hit with no badge, timestamp, page or snippet.
6. Opening `/files/{id}?page=N` lands in the PDF viewer at page N (the `page` key survives the canonical redirect).
