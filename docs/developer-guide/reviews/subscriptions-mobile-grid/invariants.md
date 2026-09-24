# R-0 invariants: subscription grid at phone width

1. At 320, 375 and 393 (Pixel 5) CSS px wide, with a subscription whose title is long (Japanese, or a single unbroken ASCII token of 80+ characters), `document.documentElement.scrollWidth === clientWidth` on the dashboard.
2. That long title stays on one line inside its card and is truncated (the title element's scrollWidth > clientWidth, its right edge within the card).
3. At 640 px the grid is 2 columns; at 1280 px, 3. Neither overflows.
4. The rest of the dashboard does not overflow at 320 px: the summary header, the filter chips + search input row, and the empty state.
