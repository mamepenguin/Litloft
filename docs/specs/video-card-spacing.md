# Video cards and shelves spaced like YouTube

SPEC-ID: SPEC-CORE-080

Approval: sha256:08c61928e4b2265f43399452e0c1fe9a26882aff2c98a5f68dc5b4bf1ea63f6d Yuichi Senga 2026-11-11

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
that drew them; its see-all grid is measured with the video metric (20rem, 16px gap), and
its Discover shelves are forced to that metric's 3 columns in CSS at the 1280px width, so
both 1280px images show the 3 columns this spec requires. The human chose this design (plan B) over a spacing-only variant, and then a 20rem card
minimum over 16rem ("today it is packed too tight"; YouTube's measured cards are
347–397px wide).

There is no artifact URL: the design was drawn only in the harness and shown to the human
as images. It covers two screens in the loaded state, Discover (Continue, a subscription
shelf with bylines, Recently added) and the see-all page with bylines, each at 1280px and
375px. The Library, the reading app and every skeleton state have no drawing; they are
governed by the visible decisions below alone.

Visible decisions, each checkable at 1280px and 375px:

- Video card: title 12px under the thumbnail, 16px with a 22px line height, weight 500,
  clamped to two lines; byline 4px under the title, 14px with a 20px line height, muted,
  one truncated line. Tailwind: title `mt-3 line-clamp-2 text-base/[1.375rem]
  font-medium text-text-primary`, byline `mt-1 block truncate text-sm text-text-muted`.
- Video grid (Discover and Library shelves, see-all page): 16px between columns, 32px
  between rows; at least 20rem (320px) per card and at least two columns.
- Shelves (video and reading apps, Discover and Library): 40px between consecutive shelves;
  16px between a shelf's header row and its grid. In both apps' Library, the "load more"
  skeleton shelf or its Retry also starts 40px below the last shelf.
- See-all page: at 1280px viewport the grid has the same column count as a Discover shelf
  in the same frame (3 at the 1120px frame, where today it has 5).
- Column counts on Discover and Library shelves also move where the 16px gap changes the
  `columnsFor` thresholds. Within the 1120px frame: a grid 1060px or wider goes from 4 to
  3 columns (4 cards to 3); one 792–991px wide goes from 3 to 2 columns (3 cards in one row
  to 4 in two rows); 992–1059px keeps 3, and under 792px keeps 2.

## Required items

### 1. Normal flow

1. The viewer opens the video app. Discover and Library draw shelves through `ShelfBlock`;
   each non-book shelf grid is a `VideoGrid` (a new component in `components/appshell/`),
   which measures its own width, takes as many 20rem columns as fit with a 16px gap (at
   least two), and lays its cards out with a 32px row gap. `VideoGrid` is the only element
   that draws a video card grid. It hands its measured column count to its children as a
   render prop (`children: (columns) => ReactNode`), measured in the callback ref during
   commit as `useCardColumns` does today, so the first painted frame already holds the
   measured count and capacity, with no later re-render that changes it. Callers use
   `MIN_CARD_COLUMNS` (2) for counting cards while the count is still 0 (jsdom, or a
   server render), as `ShelfBlock` does today.
2. Each `VideoCard` draws its thumbnail, the title 12px below it, and the byline (when
   there is one) 4px below the title.
3. The viewer clicks See all. The see-all page (`VideoShelfPage`, both the grouped Library
   mode and `entry` mode) draws its cards in one `VideoGrid` and appends pages to that same
   element as the viewer scrolls. Before the first page it draws a skeleton `VideoGrid` of
   two rows (2 × columns cards); while the next page loads it draws a skeleton `VideoGrid`
   of one row (columns cards) below the 1px sentinel. Each skeleton grid measures its own
   width; at the page's width it gets the same count as the loaded grid. With columns 0
   the counts use 2 columns (4 and 2 cards).
4. In the reading app, shelves are 40px apart and their headers 16px above their grids;
   book cards and the book grid are unchanged.

### 2. Failure cases

None new: this changes layout only. A failed shelf still shows its Retry in place of the
grid, and a failed later page on the see-all page still shows Retry under the grid, now
32px to 33px below the grid's bottom edge (where the appended skeleton would start).

### 3. States

Unchanged: loading (skeleton grid), loaded, failed, empty. The skeleton grid of a video
shelf and of the see-all page use the loaded grid's column count, column gap and row gap,
and a video skeleton card's title bar sits 12px under its thumbnail and is 22px tall (one
title line). The book skeleton card keeps its `mt-2 h-4` bar.

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
  and the grouped shelves of video and reading `LibraryFace`. In both Libraries the
  sentinel, the "load more" skeleton shelf and its Retry sit after the shelf stack, not in
  it (the video Library moves them out, as the reading Library already has them). The
  sentinel stays flush under the stack, so nothing adds space after the last shelf when
  nothing is loading; the skeleton shelf or Retry, only while shown, starts 40px below the
  sentinel (`mt-10`). The video Library's trailing space after its last shelf shrinks from
  about 33px to the sentinel's 1px; the page's own bottom padding remains. The video Library's toolbar keeps
  its 24px (`space-y-6`) above the first shelf.
- `lib/cardGrid.ts`: `CARD_GAP_PX` (12) and `HOME_GRID` stay as they are, so the drive's
  file grids (`FileGrid`, `FolderContent`, `RightPaneFolder`, `SectionRow`, trash,
  missing, and the intelligence addon's `SceneCandidatesSection`) keep their columns and
  `gap-3`. Video grids pass their own metric (`VIDEO_GRID`: 20rem, 16px), as book grids
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
- `frontend/src/components/appshell/ShelfBlock.tsx` — header margin; the non-book branch
  draws `VideoGrid` (and the video skeleton card); the book branch keeps its own `grid
  gap-5` element and skeleton card.
- `frontend/src/components/appshell/VideoGrid.tsx` (new) — the measured video grid:
  `useCardColumns(VIDEO_GRID)`, `cardGridTemplate(columns, VIDEO_GRID)`, `gap-x-4 gap-y-8`,
  its own measuring ref.
- `frontend/src/lib/cardGrid.ts` — `VIDEO_GRID` (min 20rem / 320px, gap 16px) next to
  `BOOK_GRID`.
- `frontend/src/__tests__/card-grid.test.ts` — the guard over every card grid.
  `VideoGrid.tsx` becomes one new site; `ShelfBlock.tsx` keeps one site (now book only);
  `VideoShelfPage.tsx` draws no grid element of its own. So the expected sites go from 8
  to 9 and the `useCardColumns` call sites from 8 to 9, and the expected file set gains
  `VideoGrid.tsx`. The gap rule is per file: `VideoGrid.tsx` must have exactly a 16px
  column gap (`gap-x-4`) and a 32px row gap (`gap-y-8`); `ShelfBlock.tsx` and
  `ReadingGrid.tsx` exactly 20px; every other site 12px. Nothing is removed from the guard.
- `frontend/src/components/videoapp/VideoShelfPage.tsx` — `VideoGrid` for the cards and
  both skeletons instead of breakpoint columns.
- `frontend/src/components/videoapp/DiscoverFace.tsx`, `videoapp/LibraryFace.tsx`,
  `readingapp/DiscoverFace.tsx`, `readingapp/LibraryFace.tsx` — space between shelves.
- Reached through `ShelfBlock` without an edit: `videoapp/VideoApp.tsx`,
  `readingapp/ReadingApp.tsx`, `readingapp/ReadingShelfPage.tsx`.
- `frontend/e2e-components/` — a new fixture and spec pair (phone and desktop, registered
  in `projects.ts` and `spec-viewport.spec.ts` like `video-card-byline`). It draws the real
  `ShelfBlock` + `VideoCard` shelves and the real `VideoGrid` as the see-all page lays it
  out (cards, sentinel, appended skeleton), inside a container narrower than the viewport,
  and measures gaps, column counts against the container width, card type and offsets,
  and skeleton rows. jsdom lays nothing out. The byline spec (`video-card-byline*`,
  SPEC-CORE-079 I7) keeps passing unchanged.
- `frontend/src/components/__tests__/componentFixtureParity.test.tsx` — the new fixture id
  joins its expected set.
- `frontend/e2e-layout/fixtures/reading-video-faces.html` and
  `src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx` — the fixture
  mirrors the new classes (`mb-4`, `space-y-10`, the video grid gaps); the parity test
  stays as strict.
- `frontend/e2e-layout/reading-video-faces.spec.ts` — video shelves are checked with
  `columnsFor(width, VIDEO_GRID)`, book shelves as today.
- `videoapp/__tests__/VideoShelfPage.test.tsx` — its skeleton assertions still find
  skeleton cards (at least 4 before the first page, from the 2-column floor).
- `videoapp/__tests__/VideoShelfPage.provider.test.tsx` and
  `videoapp/__tests__/VideoApp.discoverPageProviders.test.tsx` — the `BYLINE` selector
  constant in each (today `".mt-0\\.5.block.truncate.text-xs.text-text-muted"`, used both
  to find a byline and in `toBeNull()` checks that none is drawn) is changed to match the
  new byline classes exactly, so the negative checks still fail when a byline is drawn;
  the byline class
  assertions name the new classes (`mt-1 … text-sm`); what they check (a byline is drawn,
  as text, truncated) is unchanged.
- Other unit tests that pin the old classes or the breakpoint columns, updated to the new
  ones without weakening what they assert.
- `DESIGN.md` — "Card grids" rule (§8.5) and §6 "Cards" (the video card's title and byline
  roles).
- `docs/process/reviews/feature-video-card-spacing/design/` — the agreed design.

No protected path is edited.

## Invariants

I1. On Discover, the Library and the see-all page, adjacent grid cells (`li`) in one video
grid are 16px apart horizontally and 32px apart vertically (cell box to cell box).

I2. A video grid's column count is `max(2, floor((W + 16) / (320 + 16)))` for its own
width W in px, on Discover, the Library and the see-all page alike; the see-all page never
derives it from the viewport width.

I3. The drive's file grids keep a 12px gap and the column count they have today for the
same width; the reading app's book grids keep their 20px gap and columns.

I4. In a video card, the title's top is 12px below the thumbnail's bottom and the title is
16px with a 22px line height and weight 500, clamped to two lines; a byline's top is 4px
below the title's bottom and it is 14px with a 20px line height.

I5. In the video and reading apps, consecutive shelves in Discover's stack and in the
Library's grouped stack are 40px apart (shelf box to shelf box), including Discover's
trailing skeleton shelf of SPEC-CORE-076; a Library's "load more" skeleton shelf or Retry
starts 40px to 41px below the last shelf (the 1px sentinel lies between), and when
neither is shown nothing but the 1px sentinel follows the last shelf; and in every
`ShelfBlock` the grid (or Retry) starts 16px below the header row.

I6. A video shelf's or see-all page's skeleton grid has the same column count, column gap
and row gap as the loaded grid at the same width, and a video skeleton card's title bar
starts 12px below its thumbnail and is 22px tall. On the see-all page the first-load
skeleton is two rows of cards and the appended one is one row (with columns not yet
measured, 4 and 2 cards), and the appended skeleton's top, or the later-page Retry's top,
is 32px to 33px below the loaded grid's bottom edge (the 1px sentinel lies between them).

I7. On the see-all page, scrolling to the end still loads the next page and appends its
cards to the same grid element, with no repeated or missing card at the page boundary
(SPEC-CORE-078's paging, I3 and I4 of `provider-shelf-page.md`, unchanged by the measured
grid).

I8. A video shelf draws exactly `c × rowsFor(c)` cards (or skeleton cards), where c is
its I2 column count once measured and 2 before; so a shelf grid 792–991px wide draws 4
cards in two rows and one 992–1120px wide draws 3 in one row.

## Checked, no action

- **SPEC-CORE-078 I1 ("a card given no byline renders the same markup as before").** It
  states what that change left alone, relative to the code before it; this change is the
  one that restyles every card, deliberately, so I1 is not revised.
- **`e2e-layout/fixtures/video-app.html` and `video-app.spec.ts`.** That fixture still
  draws horizontal scroll rows, a shape `ShelfBlock` no longer has, and no parity test
  reads it; copying a few classes into it would verify nothing. Left out of this change.
- **Channel and date on two lines, as YouTube does.** The byline is one string from the
  provider; splitting it in core would parse provider text, and changing the contract is a
  separate SPEC-CORE-078 change. Kept on one line.
- **An avatar beside the title.** Litloft has no channel avatars.
- **`provider-shelf-page.md` prose naming `mt-0.5 … text-xs` for the byline
  (SPEC-CORE-079).** That is prose, not an invariant; the byline invariant (I7 of that
  file: one truncated line, at most one line taller) still holds, so there is no
  `## Revises`.
- **Phone-width title size.** At 375px a card is about 165px wide; a 16px title wraps
  earlier and a byline truncates sooner. The human saw this in the 375px screenshots and
  chose plan B anyway.
- **Book cards, book grids and the drive's file grids.** Out of scope; only the shelf
  spacing and the shelf header margin reach the reading app.
- **`docs/user-guide/`.** Spacing changes need no user-guide edit (CLAUDE.md).
