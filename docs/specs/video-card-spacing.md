# Video cards and shelves spaced like YouTube

SPEC-ID: SPEC-CORE-080

Approval:

## Summary

The video app's cards sit 12px apart in both directions, with a 14px title 8px under the
thumbnail and a 12px byline under it, so a shelf with channel names reads as one dense
block. This change spaces video cards and grids by values measured on youtube.com
(2026-11-11, desktop, channel videos tab: column gap 16px, row gap 32px, thumbnail to title
12px, title 16px / 22px weight 500, metadata 14px / 20px directly under the title). It also
widens the gap between shelves and under a shelf header in both the video and the reading
apps, and makes the video see-all page take its column count from its own width, as the
Discover shelves already do. It is for the household viewer browsing Discover, the Library
and the see-all page.

The agreed design is the set of screenshots in
`docs/process/reviews/feature-video-card-spacing/design/` (`agreed-*.png`; `current-*.png`
is the state before this change), drawn from the real `ShelfBlock` and `VideoCard` in the
e2e-components harness with the values below applied. `mock-fixture.tsx.txt` is the fixture
that drew them; its see-all grid is measured with the video metric (16rem, 16px gap), so
`agreed-page-1280.png` shows the 4 columns this spec requires. The Discover mock applied
the 16px gap in CSS over a grid measured with 12px; at the mock's width both give 4
columns. The human chose this design (plan B) over a spacing-only variant.

Visible decisions, each checkable at 1280px and 375px:

- Video card: title 12px under the thumbnail, 16px with a 22px line height, weight 500,
  clamped to two lines; byline 4px under the title, 14px with a 20px line height, muted,
  one truncated line. Tailwind: title `mt-3 line-clamp-2 text-base/[1.375rem]
  font-medium`, byline `mt-1 block truncate text-sm text-text-muted`.
- Video grid (Discover and Library shelves, see-all page): 16px between columns, 32px
  between rows; at least 16rem per card and at least two columns.
- Shelves (video and reading apps, Discover and Library): 40px between consecutive shelves;
  16px between a shelf's header row and its grid.
- See-all page: at 1280px viewport the grid has the same column count as a Discover shelf
  in the same frame (4 at the measured width, where today it has 5).
- Column counts on Discover and Library shelves also move where the 16px gap changes the
  `columnsFor` threshold: a grid 1060–1071px wide goes from 4 to 3 columns, and one
  792–799px wide from 3 to 2 (so that shelf shows 4 cards in two rows instead of 3 in
  one). Elsewhere the count is unchanged.

## Required items

### 1. Normal flow

1. The viewer opens the video app. Discover and Library draw shelves through `ShelfBlock`;
   each non-book shelf grid measures its width, takes as many 16rem columns as fit with a
   16px gap (at least two), and lays its cards out with a 32px row gap.
2. Each `VideoCard` draws its thumbnail, the title 12px below it, and the byline (when
   there is one) 4px below the title.
3. The viewer clicks See all. The see-all page (`VideoShelfPage`, both the grouped Library
   mode and `entry` mode) measures its own grid the same way and appends pages to that
   grid as the viewer scrolls. Before the first page it draws a skeleton grid of two rows
   (2 × columns cards); while the next page loads it draws one skeleton row (columns
   cards) below the 1px sentinel. Each skeleton grid measures its own width with its own
   ref; at the page's width it gets the same count as the loaded grid.
4. In the reading app, shelves are 40px apart and their headers 16px above their grids;
   book cards and the book grid are unchanged.

### 2. Failure cases

None new: this changes layout only. A failed shelf still shows its Retry in place of the
grid, and a failed page on the see-all page still shows Retry under the grid.

### 3. States

Unchanged: loading (skeleton grid), loaded, failed, empty. The skeleton grid of a video
shelf and of the see-all page use the loaded grid's column count, column gap and row gap,
and a skeleton card's title bar sits 12px under its thumbnail and is 22px tall (one title
line).

### 4. Data read and written

None. No store, cache, API or local storage is read or written differently.

### 5. External services

None.

### 6. Authorization

None: no access path changes.

### 7. Effect on existing features

- `ShelfBlock` / `ShelfGrid` are shared by the video and reading apps. The header margin
  (16px) changes for every `ShelfBlock`, which the human chose for the reading app. That
  includes the untitled loading `ShelfBlock`s: `VideoApp` and `ReadingApp` before the app
  is ready, `ReadingShelfPage`'s loading state, reading `LibraryFace` flat mode, and the
  Library "load more" skeletons in both apps. The grid change applies only when `book` is
  false; every non-book `ShelfBlock` is a video shelf today (`videoapp/DiscoverFace`,
  `videoapp/LibraryFace`, `videoapp/VideoApp`). Book grids keep their 20px gap, 140px
  minimum and capacity.
- Space between shelves (40px) applies to the shelf stacks: video and reading
  `DiscoverFace` (`space-y-8` → `space-y-10`, including SPEC-CORE-076's trailing skeleton)
  and the grouped shelves of video and reading `LibraryFace`. The Library's "load more"
  skeleton keeps today's place relative to its sentinel; the video Library's toolbar
  keeps its 24px (`space-y-6`) above the first shelf.
- `lib/cardGrid.ts`: `CARD_GAP_PX` (12) and `HOME_GRID` stay as they are, so the drive's
  file grids (`FileGrid`, `FolderContent`, `RightPaneFolder`, `SectionRow`, trash,
  missing, and the intelligence addon's `SceneCandidatesSection`) keep their columns and
  `gap-3`. Video grids pass their own metric (`VIDEO_GRID`: 16rem, 16px), as book grids
  pass `BOOK_GRID`, including for the unmeasured first frame (`cardGridTemplate(0,
  VIDEO_GRID)`).
- The see-all page's column count changes from viewport breakpoints (2/3/4/5) to its
  measured width; at some widths it shows one column fewer or more than today.
- SPEC-CORE-076 (Discover shelves never shift): positions, the single trailing skeleton
  and the deadline are untouched. Spacing is applied the same way to the trailing skeleton
  shelf as to the drawn shelves.
- SPEC-CORE-079's byline invariant (I7 of `provider-shelf-page.md`: one truncated line,
  card at most one line taller) still holds with the larger byline. SPEC-CORE-078's paging
  invariants (I3, I4 of the same file) are untouched; the sentinel stays below the grid.
- `DESIGN.md` "Card grids" states `gap-3` everywhere; it gains the video-grid values and
  the reason (YouTube-measured density for titled media cards; file grids keep `gap-3` so a
  folder row and the file grid line up). §6 "Cards" gains the video card's title and
  byline roles (16/22 medium, 14/20 muted), so the sizes are recorded in the design
  system rather than left as one-off values.

### 8. Error behavior

Unchanged.

### 9. User-visible behavior

Everything in the Summary's visible decisions. Text, order, links and paging are
unchanged. At 375px a byline that no longer fits is truncated with an ellipsis, as today.

### 10. Non-functional

No new requests. The see-all page adds one width measurement (`useCardColumns`, measured
in a callback ref) like the Discover shelves; nothing heavier.

## Touch points

- `frontend/src/components/videoapp/VideoCard.tsx` — title and byline classes.
- `frontend/src/components/appshell/ShelfBlock.tsx` — header margin; non-book grid metrics,
  gaps and skeleton card.
- `frontend/src/lib/cardGrid.ts` — `VIDEO_GRID` (min 16rem, gap 16px) next to
  `BOOK_GRID`.
- `frontend/src/__tests__/card-grid.test.ts` — the guard over every card grid. The
  see-all page's grids join its scanned sites, so the expected site set and call counts
  grow by exactly those sites. The gap rule gains a video set: the non-book `ShelfBlock`
  grid and the see-all page's grids must use exactly 16px (`gap-x-4`), book sites 20px,
  every other site 12px. Each new grid element gets its own measuring ref. Nothing is
  removed from the guard.
- `frontend/src/components/videoapp/VideoShelfPage.tsx` — measured grid instead of
  breakpoint columns, gaps, skeleton grid.
- `frontend/src/components/videoapp/DiscoverFace.tsx`, `videoapp/LibraryFace.tsx`,
  `readingapp/DiscoverFace.tsx`, `readingapp/LibraryFace.tsx` — space between shelves.
- Reached through `ShelfBlock` without an edit: `videoapp/VideoApp.tsx`,
  `readingapp/ReadingApp.tsx`, `readingapp/ReadingShelfPage.tsx`.
- `frontend/e2e-components/` — a spec drawing the real components to measure gaps,
  columns and type (jsdom lays nothing out); the byline spec (`video-card-byline*`,
  SPEC-CORE-079 I7) keeps passing unchanged.
- `frontend/e2e-layout/fixtures/reading-video-faces.html` and
  `src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx` — the fixture
  mirrors the new classes (`mb-4`, `space-y-10`, the video grid gaps); the parity test
  stays as strict.
- `frontend/e2e-layout/reading-video-faces.spec.ts` — video shelves are checked with
  `columnsFor(width, VIDEO_GRID)`, book shelves as today.
- `frontend/e2e-layout/fixtures/video-app.html` and `e2e-layout/video-app.spec.ts` — the
  fixture copies the new header margin, shelf stack and card title classes.
- `videoapp/__tests__/VideoShelfPage.provider.test.tsx` and
  `videoapp/__tests__/VideoApp.discoverPageProviders.test.tsx` — the byline class
  assertions name the new classes (`mt-1 … text-sm`); what they check (a byline is drawn,
  as text, truncated) is unchanged.
- Other unit tests that pin the old classes or the breakpoint columns, updated to the new
  ones without weakening what they assert.
- `DESIGN.md` — "Card grids" rule.
- `docs/process/reviews/feature-video-card-spacing/design/` — the agreed design.

No protected path is edited.

## Invariants

I1. On Discover, the Library and the see-all page, adjacent video cards in one grid are
16px apart horizontally and 32px apart vertically (card box to card box).

I2. A video grid's column count is `max(2, floor((W + 16) / (256 + 16)))` for its own
width W in px, on Discover, the Library and the see-all page alike; the see-all page never
derives it from the viewport width.

I3. The drive's file grids keep a 12px gap and the column count they have today for the
same width; the reading app's book grids keep their 20px gap and columns.

I4. In a video card, the title's top is 12px below the thumbnail's bottom and the title is
16px with a 22px line height and weight 500, clamped to two lines; a byline's top is 4px
below the title's bottom and it is 14px with a 20px line height.

I5. In the video and reading apps, consecutive shelves in Discover's stack and in the
Library's grouped stack are 40px apart (shelf box to shelf box), including Discover's
trailing skeleton shelf of SPEC-CORE-076; and in every `ShelfBlock` the grid (or Retry)
starts 16px below the header row.

I6. A video shelf's or see-all page's skeleton grid has the same column count, column gap
and row gap as the loaded grid at the same width. On the see-all page the first-load
skeleton is two rows of cards and the appended one is one row, and the appended one's top
is 32px to 33px below the bottom of the last row of cards (the 1px sentinel lies between
them).

I7. On the see-all page, scrolling to the end still loads the next page and appends its
cards to the same grid element, with no repeated or missing card at the page boundary
(SPEC-CORE-078's paging, I3 and I4 of `provider-shelf-page.md`, unchanged by the measured
grid).

## Checked, no action

- **Channel and date on two lines, as YouTube does.** The byline is one string from the
  provider; splitting it in core would parse provider text, and changing the contract is a
  separate SPEC-CORE-078 change. Kept on one line.
- **An avatar beside the title.** Litloft has no channel avatars.
- **`provider-shelf-page.md` prose naming `mt-0.5 … text-xs` for the byline
  (SPEC-CORE-079).** That is prose, not an invariant; the byline invariant (I7 of that
  file: one truncated line, at most one line taller) still holds, so there is no
  `## Revises`.
- **The Library's "load more" skeleton shelf.** It stays where it is relative to its
  sentinel (video: inside the shelf stack; reading: after it). It shows for the moment a
  page loads; aligning the two is not part of this change.
- **Phone-width title size.** At 375px a card is about 165px wide; a 16px title wraps
  earlier and a byline truncates sooner. The human saw this in the 375px screenshots and
  chose plan B anyway.
- **Book cards, book grids and the drive's file grids.** Out of scope; only the shelf
  spacing and the shelf header margin reach the reading app.
- **`docs/user-guide/`.** Spacing changes need no user-guide edit (CLAUDE.md).
