# A Clips grouping that yields one shelf shows the grid instead

SPEC-ID: SPEC-ADDON-184

Approval:

## Summary

SPEC-CORE-175 made the video and reading apps' Library draw the None grid when a grouping
yields a single shelf. The Clips Library (knowledge addon) has the same problem: grouping by
Tag when every clip is untagged, by Folder when every clip sits in one folder, or by Date
Added when every clip was added in one month gives one heading, the first cards and
**See all**. This change applies the same rule to the Clips Library: when the grouping
yields exactly one shelf, it draws the same grid it draws for **なし** / **None**.

## Required items

### 1. Normal flow

1. The viewer opens the Clips Library (`?view=all`) with a grouping other than None
   (`group=tags`, `folder` or `month`), at some Target, tag, trust and name filters and
   sort.
2. The Library asks the core `shelves` route for the first page of shelves, as today
   (`loadGroupShelves`).
3. If the answer's `total_shelves` is 1, the Library does not draw the shelf. It asks for
   the grid of every matching clip (`by=all`, `key=all`, 60 a page, `loadGridPage`) with
   the same Target, filters and sort, and draws it exactly as the None grouping does
   (same card list key `grid`, same paging, card menu and retry), loading more as the
   viewer scrolls.
4. If `total_shelves` is 2 or more, the shelves are drawn as today, with today's titles.
5. If `total_shelves` is 0, the empty states are unchanged.

The **分類** / **Group By** menu keeps showing the chosen grouping in step 3; the URL's
`group` and the grouping stored for the Target are unchanged.

The conditions are the Target, the tag, trust and name filters, the grouping and the sort.
A change to any of them asks for the shelves again first, drawing the shelf skeleton as
today, and the grid is asked for only when that new answer reports one shelf.

A refresh (a clip added through the page's form, or a `knowledge.clip.ready` event) does
not change the conditions and never blanks what is drawn (SPEC-ADDON-100 I25):

- Grid drawn: the shelves are asked again while the grid stays drawn. If that answer
  reports one shelf, the grid then re-asks its pages and merges them into the cards it
  already draws, as None's grid does on a refresh. If it reports two or more, the shelves
  replace the grid (their cards are already in the answer, so nothing blanks).
- Shelves drawn: the shelves refresh as today. If the answer reports one shelf, the
  shelves stay drawn; the grid appears on the next answer for changed conditions or a
  reload, as after a card-menu removal. A refresh only adds clips, so this case needs a
  clip moved or removed elsewhere in the meantime.

### 2. Failure cases

- The first shelves request fails: the retry, as today. No grid request is sent.
- The shelves answer reports one shelf and the grid request then fails: the grid's own
  retry, as for None.
- A shelves answer for conditions the viewer has already left arrives late: ignored, as
  `useGroupShelves` already does (scope check and abort).

### 3. States

Per Library render, for a grouping other than None:

- loading shelves → the shelf skeleton, as today;
- shelves failed → retry;
- 0 shelves → empty state (filtered or not), as today;
- 1 shelf → grid (loading, ready, failed, loading more), the None grid's own states;
- 2+ shelves → shelves, as today.

On a refresh: grid → grid (pages re-asked after the shelves answer, merged), grid →
shelves (answer with 2+), shelves → shelves (answer with any count). Nothing goes back to
a skeleton.

The choice is made only from a shelves answer for the current conditions. A card removal
from a card menu does not re-ask for the shelves today, and this change keeps that: the
grid appears on the next shelves answer.

### 4. Data read and written

Reads the core `shelves` route only. Writes nothing: not the stored grouping, not the URL.

### 5. External services

None. The `shelves` route is the core backend.

### 6. Authorization

Unchanged. The core applies drive access and the Target's conditions as today.

### 7. Effect on existing features

- None grouping, Clips Home, shelf pages (`?view=shelf`) and their titles are unchanged.
- The core is not changed. The video and reading apps keep SPEC-CORE-175 / 176.

### 8. Error behavior

As in item 2. Nothing new is logged.

### 9. User-visible behavior

- One shelf → the None grid: no shelf heading, no count, no **See all**; cards 60 at a
  time with infinite scroll, in the chosen sort.
- `docs/addons/knowledge.md` and the Clips section of `docs/user-guide/notes.md` say so,
  so that choosing **タグ** and seeing no headings does not look broken.

### 10. Non-functional

One extra request per change of conditions when the grouping yields one shelf (shelves,
then the grid, one after the other). No new limits.

## Touch points

- `addons/knowledge/frontend/clipsapp/Library.tsx`
- `addons/knowledge/frontend/clipsapp/useGroupedShelves.ts` (expose `total_shelves`)
- `addons/knowledge/frontend/clipsapp/requests.ts` (`loadGroupShelves`, `loadGridPage`, read only)
- `addons/knowledge/frontend/clipsapp/usePagedClips.ts` (reused, unchanged)
- `GET /api/drives/{drive}/shelves` and `POST /api/drives/{drive}/shelves/query`, read
  only, unchanged (`backend/app/routers/shelves.py`)
- `docs/addons/knowledge.md`, `docs/user-guide/notes.md` (Clips section)
- `addons/knowledge/frontend/pages/clips.tsx` (raises `refresh`, read only)
- The `addons/knowledge` submodule pointer in the core repository

## Invariants

I1. When a Clips Library shelves answer under Tag, Folder or Date Added reports
`total_shelves` = 1, the Library draws no shelf heading, no count and no **See all**
link, and draws the cards of every clip the None grouping would draw for the same Target,
filters and sort, in the same order.
I2. When `total_shelves` is 2 or more, the Clips Library draws one shelf per answered
shelf, with the titles and counts it drew before this change.
I3. When `total_shelves` is 0, the Clips Library draws the same empty state it drew before
this change.
I4. Drawing the grid for a single shelf does not change the grouping shown in the
**分類** menu, the URL's `group`, or the grouping stored for the Target.
I5. Under a grouping other than None, the grid page request (`by=all&key=all` with
`per_shelf=60` and `page`, without `ids`) is sent only after a shelves answer for the
current conditions reports `total_shelves` = 1; a failed, 0-shelf or 2+-shelf answer sends
none.
I6. A shelves answer for conditions the viewer has left never switches the Library between
the grid and shelves for the current conditions.
I7. The retry shown for a failed shelves request re-sends the shelves request; the retry
shown for a failed grid request re-sends only the grid request.
I8. A refresh never draws the shelf skeleton or the grid's loading cards in place of drawn
cards: with the grid drawn, the grid page request of that refresh is sent only after its
shelves answer reports `total_shelves` = 1, and an answer with 2 or more draws the shelves;
with shelves drawn, an answer with 1 keeps the shelves drawn.

## Revises

SPEC-CORE-145 I8. On first load and after a drive or Target change, no Library body request (the grouped shelves or the flat grid in Video, Reading and Clips; the rail and list requests in Notes) is sent with a grouping or sort other than the one finally shown for that Target, except the flat grid page (`by=all&key=all`) that Video, Reading and Clips request under the shown grouping once its shelves answer reports a single shelf.

SPEC-ADDON-139 I3. Every clip in the Target is reachable from the Library: None reaches it over its pages; Tag, through the shelf page of one of its tags or of "Untagged"; Folder and Date Added, through the shelf page of the one shelf it is in; a grouping whose shelves answer reports a single shelf, over the grid's pages as None does. The Unverified shelf page reaches every clip still unverified over its pages, however many were marked verified on the way.

SPEC-ADDON-100 I29. Clips `?view=all` is the Library: grouped by tag, folder, month added or ungrouped, sorted by the URL's `sort`, else the Target's stored sort, else newest added first, 60 cards per page when ungrouped or when the grouping's shelves answer reports a single shelf, as cover cards without age groups.

## Checked, no action

- Titling the common-folder shelf **This folder** (SPEC-CORE-176): the Clips Library has
  no folder breadcrumb or position, so there is no current folder for the title to name.
  Its folder shelves keep their last-segment titles (SPEC-CORE-145 I14).
- Choosing another grouping automatically when one shelf results: rejected for Video and
  Reading (SPEC-CORE-175) for the same reason; a setting that changes itself is harder to
  read.
- Switching to the grid after card-menu removals leave one shelf: it would need a shelves
  re-fetch after each removal; the switch waits for the next shelves answer, as in Video
  and Reading.
- The Notes app: its Library is a folder/tag rail and list, not shelves.
- A design artifact: the change draws only existing parts (the None grid).
