# Hold back the justified grid's last line until the next page fills it

SPEC-ID: SPEC-CORE-001
SPEC-ID: SPEC-CORE-002

Approval: sha256:9dbf1b7e1bc182e39da30e263df5d53c91e72ac5435d98bd71be31180790c8c7 Yuichi Senga 2026-10-05

## Summary

In a folder of photographs laid out as a justified grid, every infinite-scroll
append changes the shape of cells the viewer is already looking at: the line
that was last stops being last, `.justified-grid-tail` moves off it, and its one
to four cells grow to fill the row. `useJustifiedFlip` plays that growth as a
200ms zoom, which reads as pictures stretching late to their proportions.

Measured on 2026-10-05 against the running app (`テスト画像/test_images`, 995
photographs, viewport 1280x900 and 390x900, five appends each): the growing
cells were on screen at every append, their top edge 636 to 769px down a 900px
viewport. There are two causes:

- **SPEC-CORE-001** The prefetch does not prefetch. `useInfiniteScroll` observes
  the sentinel with the implicit root and `rootMargin: "0px 0px 400px 0px"`. That
  margin extends the top-level viewport only; the sentinel is clipped by the
  scrolling `<section>` first, so it intersects only once it is visible inside
  that section. The next page is requested after the last line is on screen. This
  spec makes the observer's root the scroll container that `TwoPaneLayout`
  already publishes through `ScrollContainerContext`, so the 400px margin is
  measured where the scrolling happens. Routes outside `TwoPaneLayout` (Trash,
  Missing, the cross-folder views, search) have no provider; there the document
  scrolls, the implicit root already works, and nothing changes.
- **SPEC-CORE-002** Even with a working prefetch, a fast scroll can reach the end
  before the page arrives. While more pages remain, the folder's justified grid
  does not paint its last line; it keeps the line's space and shows it once an
  append has made it a full line, or once there is nothing more to load.

Together: in a listing of two or more justified lines, with no in-folder
filter active, a picture the viewer can see does not change size or position
because the next page arrived. It is for the person browsing a large photo
folder.

Terms used below:

- **Line**: the cells of the justified grid whose layout boxes share one top edge.
- **Last line**: the line holding the grid's last cell.
- **Listing**: any `FolderBrowser` listing that renders the justified grid: a
  folder, the drive root, `?tag=`, and the cross-folder views (favorites, all,
  recent-added, liked). Search results never take the justified branch (every
  merged row carries `match_meta`), so they are not affected.
- **More may follow**: the value `FileGrid` receives from its caller. A listing
  passes `hasMore && !filterActive`; every other caller passes nothing, which
  means false.
- **Held**: a cell that keeps its layout box but is not painted, is not focusable,
  and does not act on pointer or keyboard input.
- **Hold condition**: more may follow, and the grid has at least two lines. When it
  holds, exactly the cells of the last line are held; otherwise no cell is held.

## Required items

### 1. Normal flow

SPEC-CORE-001:

1. A list that uses `useInfiniteScroll` (`useFolderFiles`, `TrashView`,
   `MissingView`) mounts its sentinel below the list. Folder and drive-root
   listings render inside `TwoPaneLayout`'s `ScrollContainerContext` provider;
   Trash, Missing, the cross-folder views and search do not
   (`app/drive/[name]/layout.tsx` returns them bare) and scroll the document.
2. The hook reads the scroll container from `useScrollContainer()` and observes
   the sentinel with that element as the `IntersectionObserver` root and
   `rootMargin: "0px 0px 400px 0px"`. Outside a provider, or while the ref is
   null, the root is null (the viewport), as today.
3. When the sentinel comes within 400px of the bottom edge of the root, the next
   page is requested. Everything after the request (append, `hasMore`,
   `loadingMore`, empty-append end detection, stale-response drop, re-observe
   after `loadingMore` clears) is unchanged.

SPEC-CORE-002:

1. `FolderBrowser` passes `hasMore` (already returned by `useFolderFiles`) to
   `FolderContent`, which passes `hasMore && !filter.isActive` to `FileGrid` as
   more may follow. `FileGrid` uses it only in its justified branch.
2. Before paint, on the first layout of the justified grid and again whenever the
   ordered list of (cell key, ratio) pairs, the grid's width, or more may follow
   changes, the grid reads its cells' layout boxes (not boxes under a FLIP
   transform still in flight) and finds the last line. The ratio is in the list
   because a revalidation can replace rows with the same ids and new dimensions.
3. If the hold condition is met, the cells of the last line are marked held and
   every other cell is unmarked. Otherwise every cell is unmarked.
4. The viewer scrolls; the sentinel enters the 400px band; the next page is
   requested and appended.
5. On the commit that appends, the line that was held is followed by more cells
   and so is a full justified line. Its cells are released: they become painted at
   their final size and position, with the existing 200ms opacity fade (none under
   `prefers-reduced-motion`), and never translate or scale into place. The new
   last line is held in turn. A release for any other reason (`hasMore` turning
   false, a filter typed, a width change, a removal or reorder, the grid falling
   to one line) is painted at full opacity at once, with no fade.
6. When `hasMore` becomes false, nothing is held and the last line is painted
   unstretched, as today.

### 2. Failure cases

- **Next-page fetch fails.** `useInfiniteScroll` keeps `hasMore` true, so the held
  line stays held. The existing re-observe after `loadingMore` clears retries while
  the sentinel is in the band; the line appears when a fetch succeeds. No new
  retry logic.
- **Empty append** (the hydration page-size gap). `hasMore` becomes false; the held
  line is released and painted unstretched.
- **No scroll container in context**, or its ref still null when the observer is
  created. The root is the viewport, as today. The observer is re-created when the
  existing effect re-runs (`hasMore`, `loadingMore`, `loading` change).
- **One line only while more may follow** (very wide window). The hold condition
  fails, nothing is held, and when the next page arrives that line grows with the
  existing FLIP zoom. Accepted by the user on 2026-10-05.
- **In-folder filter active.** More may follow is false, so nothing is held; when
  a page arrives while filtering, the filtered last line grows with the existing
  FLIP zoom. Accepted by the user on 2026-10-05: every match stays visible.

### 3. States

Per justified cell:

| State | Painted | Focusable | Acts on click / Enter / Space | Layout box |
|---|---|---|---|---|
| Shown | yes | yes | yes | yes |
| Held | no | no | no | yes, unchanged |

Allowed transitions, each decided before paint:

- **Shown → Held**: the cell is on the last line after any of: first layout; an
  append that leaves it on the last line (cannot happen for a cell that was not
  already last); a width change; a removal from the listing (trash, move); a
  reorder of loaded rows; more may follow turning true (filter cleared). A
  removal can therefore make a cell the viewer was looking at disappear until the
  next page arrives; accepted by the user on 2026-10-05.
- **Held → Shown**: an append moves the cell off the last line; a width change,
  removal or reorder moves it off; more may follow turns false (`hasMore` false
  or a filter typed); the grid falls to one line.

Forbidden:

- A Held → Shown cell painted at any rect other than its final one.
- A held cell that becomes painted on a commit that does not change the ordered
  (key, ratio) list, the width, or more may follow (selection, cut, drag, context
  menu, a favorite toggle that keeps the row).
- A cell held while the hold condition fails.

When the focused cell becomes held, focus moves to the nearest painted cell before
it in file order (the grid has two or more lines, so one exists). CSS alone does
not do this: `visibility: hidden` stops an element taking focus but does not move
focus off it, so the hold marking moves it.

A grid whose caller does not pass more may follow (`CollectionDetail`,
`RightPaneFolder`) has only the Shown state.

### 4. Data read and written

None stored. Read: `hasMore` from `useInfiniteScroll`, `filter.isActive` in
`FolderContent`, the scroll container ref from `ScrollContainerContext`, the
justified cells' layout boxes and the grid's width. Written: a DOM attribute on
held cells that React does not render (so a React re-render of the cell does not
remove it), and the IntersectionObserver's options. No DB, API, cookie or
localStorage change.

### 5. External services

none — the change is client-side layout and an observer option. The only network
call involved is the existing page fetch, whose failure handling is item 2.

### 6. Authorization

none — no data or endpoint is added; the listing is already scoped by the existing
drive access checks.

### 7. Effect on existing features

- **`useInfiniteScroll` inside `TwoPaneLayout`** (folder and drive-root
  listings): the next page is requested up to 400px before the sentinel is
  visible in the scroll container. When the first page ends within 400px below
  the visible bottom, page 2 is now requested on mount without any scroll. A visit
  that never scrolls can therefore make one more request. Expected.
- **`useInfiniteScroll` outside it** (Trash, Missing, cross-folder views, search):
  no provider, so the root stays the viewport; unchanged.
- **Removal in place**: in a plain folder, trash and move go through `refresh` →
  `reset()` and reload the list. In the favorites view, un-favoriting removes the
  row in place; that is the removal path item 3 describes.
- **Select all** (`selection.selectAll(files.map(...))`) includes held files, as
  it already includes loaded files that are off screen; the selection count and
  bulk actions are unchanged. The user's decision of 2026-10-05.
- **`useJustifiedFlip`**: still carries every change where some key survives and
  the width is unchanged (filter narrowing, removal, reorder, and appends that the
  hold does not cover). For an append under the hold condition, the cells that
  would have been inverted were held; they are released and treated as entering
  (fade), not as moved cells. `useJustifiedFlip.test.tsx` keeps passing unchanged.
  Hold detection must read layout boxes, not boxes under a FLIP transform still
  in flight.
- **In-folder filter**: nothing is held while it is active (item 2).
- **Card grid and list modes**: untouched; only the justified branch holds.
- **Snapshot restore and `revalidateInitial`**: restored rows render with the
  restored `hasMore`, and the last line is held if more pages remain. A
  revalidation that replaces the rows changes the ordered (key, ratio) list when
  any id, order or dimension differs, and re-evaluates the hold. Held cells keep their box, so the restored scroll height
  is unchanged.
- **Selection by Shift-range** is computed over the file order, not the DOM, and is
  unchanged; a held cell cannot be clicked to start or end a range.

### 8. Error behavior

Nothing new is shown or logged. While a page loads, the existing spinner in the
sentinel shows; if the viewer has reached the end, the blank space of the held
line sits above it.

### 9. User-visible behavior

- In a justified photo folder with more pages to load and no filter active, the
  loaded list ends one line early, with blank space of that line's height above
  the spinner area. At normal scroll speed this is below the visible area when the
  next page arrives.
- When the first page fits within the visible area plus 400px (a large window),
  the blank line can be visible on first render; page 2 is requested on mount and
  the line fades in when it arrives. Accepted.
- A picture that is visible does not grow, shrink or move because the next page
  arrived, except in the two cases in item 2 (one line, filter active), where the
  existing zoom stays.
- Released pictures appear in place at their final size, fading in over 200ms
  (instantly under `prefers-reduced-motion`).
- At the end of the folder, the last line appears unstretched, as today.
- Folder and drive-root listings in card or list mode start loading their next
  page earlier; nothing else changes there. Trash, Missing, the cross-folder
  views and search are unchanged in this respect.
- No text, label or setting is added.

### 10. Non-functional

- The held marking is applied before paint (layout effect, or a ResizeObserver
  callback for width), so no frame paints a cell that is to be held, or leaves
  blank a cell that is to be shown.
- No horizontal overflow, and no change to the boxes of cells outside the last
  line.
- jsdom lays nothing out, so the acceptance tests for SPEC-CORE-002 run in a real
  browser (`frontend/e2e-components/` mounts real components). SPEC-CORE-001 is
  tested in jsdom from the observer's constructor options (root and margin); that
  a margin on the right root prefetches is the IntersectionObserver contract and
  is not re-tested in a browser.

## Touch points

- `frontend/src/hooks/useInfiniteScroll.ts` — observer root from
  `useScrollContainer()`.
- `frontend/src/lib/scrollContainer.ts` — read, not changed.
- `frontend/src/components/FolderBrowser.tsx` — passes `hasMore` to
  `FolderContent`.
- `frontend/src/components/folder/FolderContent.tsx` — passes
  `hasMore && !filter.isActive` to `FileGrid`.
- `frontend/src/components/FileGrid.tsx` — new optional more-may-follow prop,
  used by the justified branch.
- A new hook beside `frontend/src/hooks/useJustifiedFlip.ts` that computes and
  marks the held line, and `useJustifiedFlip.ts` itself so a released cell is
  treated as entering.
- `frontend/src/app/globals.css` — the held rule on `.justified-grid-cell`
  (`visibility: hidden`, which keeps the box and removes focusability).
- `frontend/src/components/trash/TrashView.tsx`,
  `frontend/src/components/missing/MissingView.tsx` — use `useInfiniteScroll`
  outside any provider; not edited and not changed in behaviour.
- `frontend/src/components/__tests__/FolderBrowser.snapshotScroll.test.tsx` and
  other suites that mock `useScrollContainer` — their IntersectionObserver mocks
  may need to accept a non-null root.
- Tests: `frontend/src/hooks/__tests__/useInfiniteScroll.test.ts`,
  `frontend/src/hooks/__tests__/useJustifiedFlip.test.tsx`, a new jsdom test for
  the hold hook's branching, and a browser test under `frontend/e2e-components/`.
- Rules passed through: `.claude/rules/frontend-conventions.md`, `DESIGN.md`
  (motion), `docs/process/testing-and-comments.md`.
- No protected path is edited.

## Invariants

I1. In a listing whose `useInfiniteScroll` reports more pages, with no in-folder filter and a justified grid of two or more lines, every cell on the last line is held and every other cell is painted.
I2. A held cell is not painted, is skipped by Tab, and a click, Enter or Space on it neither opens nor selects the file; when the focused cell becomes held, focus is on the nearest painted cell before it before the next paint.
I3. A held cell keeps its layout box: the grid-relative box of every cell outside the last line, and the grid's height, are identical to the same grid with nothing held.
I4. Under I1's conditions, at an unchanged grid width, a cell that was painted before an append has the same grid-relative box and no inline transform on every frame after the append.
I5. A cell released from held is never painted at a grid-relative box other than its final one; it fades in over 200ms when released by an append (no fade under `prefers-reduced-motion`) and is painted at full opacity at once for any other release.
I6. No cell is held when more may follow is false: `hasMore` false, an in-folder filter active, or a caller that does not pass it (`CollectionDetail`, `RightPaneFolder`); card-grid and list modes hold no cell.
I7. No cell is held in a justified grid of one line.
I8. When the hold condition is met, after a change of the grid's width, a removal, a reorder, or a replacement of rows that changes any cell's ratio, the held set is exactly the last line of the new layout before the next paint.
I9. A held cell stays unpainted across re-renders that change neither the ordered (key, ratio) list, the width, nor more may follow (selection, cut, drag, context menu, a favorite toggle that keeps the row).
I10. Inside a `ScrollContainerContext` provider, `useInfiniteScroll` observes the sentinel with the provider's element as `root` and `rootMargin: "0px 0px 400px 0px"`; outside a provider, `root` is null with the same margin.

## Checked, no action

- **Dropping the FLIP zoom instead (snap).** Offered to the user; rejected. A snap
  replaces a late stretch with a jump.
- **Prefetch fix alone.** Offered; rejected. A fast scroll still reaches the end
  before the page arrives.
- **One-line grid, filter active.** Hold disabled and the zoom kept; the user's
  decision of 2026-10-05 (item 2).
- **An append switching the listing between justified and card grid.**
  `deriveListMeta` decides from the loaded rows (90% threshold), so a page of
  non-images can switch the branch and move every cell. A different cause, seen
  only in mixed folders; out of scope by the user's decision of 2026-10-05.
- **A visible cell disappearing after a removal near the end.** Accepted by the
  user on 2026-10-05 (item 3).
- **No forced layout on commits that change no trigger.** Wanted, as in
  `useJustifiedFlip`'s ordered-key guard, but not an invariant: it is a cost, not
  something a viewer observes, and I9 already pins the visible result.
- **Holding in search results.** Search never takes the justified branch.
- **Walking the DOM for the nearest `overflow-y: auto` ancestor.** Rejected in
  favour of `ScrollContainerContext`: an ancestor with `overflow-x` set computes
  `overflow-y: auto` without scrolling, and the context is already the source of
  truth for the drive pages' scroll container.
- **Larger prefetch margin than 400px.** 400px is what the code already intends;
  with the hold, the margin decides how often the blank line is seen, not whether
  a picture changes.
- **Removing `useJustifiedFlip`.** It still carries filter narrowing, removals,
  reorders, and the one-line and filter-active appends.
- **`frontend/e2e-layout/fixtures/justified-grid.html` and
  `justifiedGridFixtureParity.test.tsx`.** Held is a DOM attribute written by a
  hook, not a state `JustifiedFileCell` renders, so the fixture's render states
  and the parity test do not change.
- **`docs/user-guide/`.** No entry: the blank line appears only while loading and
  does not stop the viewer doing anything (CLAUDE.md, the user guide is a manual).
- **Retry/backoff for a failed next-page fetch.** Existing behaviour; out of scope.
- **`ArchiveEntryGrid`.** Not paginated through `useInfiniteScroll`; no append.
- **`TextThumbnail` / `ArchiveEntryCard` observers with implicit roots.** The same
  clipping limits their `rootMargin`, but they only defer thumbnail work and do
  not change layout; out of scope.
