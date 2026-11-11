# Design check

at: bebea962c39340e89d63794595e1e0e469193978
design: docs/process/reviews/feature-video-card-spacing/design/

## Decisions read from the design
The design is four PNGs (agreed-home-1280/375, agreed-page-1280/375) plus the fixture, not .dc.html artboards. Values come from the spec's visible decisions and the fixture CSS.
- Discover: 3 shelves (Continue, subscription with bylines, Recently added), no page chrome; 3 cols at 1280, 2 at 375 (agreed-home-*.png)
- Discover: 40px between shelves, 16px header to grid (mock-fixture.tsx.txt:75-76)
- Grid: column gap 16, row gap 32 (mock-fixture.tsx.txt:77)
- Card: title mt 12, 16/22 weight 500; byline mt 4, 14/20 muted (mock-fixture.tsx.txt:78-84)
- Continue shelf: 3 cards with progress bar, no See all (agreed-home-1280.png)
- See-all page: heading only ("購読の新着", text-xl bold), 3 cols at 1280, 2 at 375, appended in one grid (mock-fixture.tsx.txt:110, 120)
- Library, reading app, skeletons: no drawing (spec lines 29-33)

## Findings
### D-1 See-all page: header block that the design does not draw
- design: a single h1 "購読の新着" above the grid (mock-fixture.tsx.txt:110; agreed-page-1280.png)
- implementation: "‹ Video" back link, icon tile, title, "r5a · 85 videos" line, Target control above the grid (shots/seeall-subscription-1280-view.jpg). The grid starts about 188px down.
- visible: at a glance

### D-2 See-all page at 375: title truncated
- design: full title "購読の新着" on one line (agreed-page-375.png)
- implementation: title shown as "New fro…", because the Target pill takes the row (shots/seeall-subscription-375-view.jpg)
- visible: at a glance

### D-3 Discover: tab bar and page header above the shelves
- design: shelves start at the top of the frame (agreed-home-1280/375.png)
- implementation: sidebar, "Video / r5a · 85 videos" header, Target pill, and Discover/Library tabs come first, so the first shelf starts about 200px down (shots/discover-1280.jpg, discover-375.jpg). Only the first shelf and part of the second fit above the fold at 375.
- visible: at a glance

### D-4 Discover at 1280: card size smaller than drawn
- design: 3 cards about 405px wide, full width (agreed-home-1280.png)
- implementation: 3 cards 325px wide in a 1008px grid, because the 240px sidebar is present (shots/discover-1280.jpg; decisions.md)
- visible: side by side

### D-5 Discover: first shelf is 2 cards plus See all, not 3 cards without See all
- design: Continue shelf has 3 cards with a progress bar and no See all (agreed-home-1280.png)
- implementation: first shelf "Regular sources" has 2 cards in a 3-column row, leaving an empty third slot, and a See all link; no progress bar anywhere (shots/discover-1280.jpg). The Continue state is not shown.
- visible: at a glance

### D-6 Not shown in R-5, cannot be checked
- design: the reading app shelves, the Library "load more" skeleton and the Retry states are governed by spec decisions only (no drawing)
- implementation: the reading app has no books, so only the empty state was shot (shots/reading-1280.jpg, reading-375.jpg). Shelf spacing, the 16px header margin and the 40px stack there are not shown. The Library load-more skeleton and both Retry states were not exercised (decisions.md). Only the 1280 first-load skeleton exists (shots/seeall-skeleton-1280.jpg); there is no 375 skeleton shot.
- visible: not shown

TOTAL: 6 findings
