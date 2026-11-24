# A grouping that yields one shelf shows the grid instead

SPEC-ID: SPEC-CORE-175
SPEC-ID: SPEC-CORE-176

Approval:

## Summary

In the video and reading apps' Library, a grouping (Folder, Tag, Date Added, Length) that
puts every matching file on a single shelf groups nothing: the viewer sees one heading, the
first few cards and **See all**. For example, `main/動画/学問/中国語` has no child folder, so
grouping by Folder there gives one shelf titled 中国語 holding all 24 videos. That reads as
a 中国語 folder inside 中国語. This change does two things for the viewer:

- SPEC-CORE-175: when the grouping yields exactly one shelf, the Library draws the same
  grid it draws for **なし** / **None** instead of the shelf.
- SPEC-CORE-176: under the Folder grouping, the shelf holding the files that sit directly
  in the shelves' common folder is titled **このフォルダ** / **This folder**, not with that
  folder's own name or the drive name.

## Required items

### 1. Normal flow

1. The viewer opens the Library with a grouping other than None, at some target, position,
   filters and sort.
2. The Library asks `GET /api/drives/{drive}/shelves` (or its `POST …/shelves/query` form)
   for the first page of shelves, as today.
3. If the answer's `total_shelves` is 1, the Library does not draw the shelf. It asks for
   the grid of every matching file (`by=all`, `key=all`, 60 a page) with the same target,
   position, filters and sort, and draws it exactly as the None grouping does, loading more
   as the viewer scrolls.
4. If `total_shelves` is 2 or more, the shelves are drawn as today. Under the Folder
   grouping, the shelf of files directly in the shelves' common folder (its key ends in
   `/`, or is the empty key at the drive root) is titled **このフォルダ** / **This folder**
   when that folder is the breadcrumb's last folder (the chips answer's `base`, the
   folder the page shows as current). Otherwise it keeps the folder's name, as today: a
   tag, state or name filter can narrow the shelves' common folder below the breadcrumb's,
   and This folder would then name a folder the page does not show. Before the chips
   answer arrives, the shelf keeps the folder's name.
5. If `total_shelves` is 0, the empty states are unchanged.

The **分類** / **Group By** menu keeps showing the chosen grouping in step 3; nothing is
saved or changed. Moving to a position, target or filter that yields two shelves draws
shelves again.

### 2. Failure cases

- The first shelves request fails: the retry button, as today. No grid request is sent.
- The shelves answer arrives with one shelf and the grid request then fails: the grid's
  own retry, as for None.
- A shelves answer for conditions the viewer has already left arrives late: ignored, as the
  paging hook already does for any stale answer.

### 3. States

Per Library render, for a grouping other than None:

- loading shelves → the shelf skeleton, as today;
- shelves failed → retry;
- 0 shelves → empty state (filtered or not), as today;
- 1 shelf → grid (loading, ready, failed, loading more), the None grid's own states;
- 2+ shelves → shelves, as today.

The choice between grid and shelves is made only from a shelves answer for the current
conditions. A card removal or move from a card menu does not re-ask for the shelves today
(it hides the card on the client, SPEC-CORE-157 I3), and this change keeps that: removing
every card of one of two shelves leaves one shelf drawn, and the grid appears on the next
shelves answer (another position, filter, grouping or a reload).

### 4. Data read and written

Reads the shelves endpoint only. Writes nothing: not the grouping remembered for the
target, not the URL, not the database.

### 5. External services

None. The shelves endpoint is the app's own backend.

### 6. Authorization

Unchanged. The shelves endpoint applies drive access as today; this change only decides
how the frontend draws its answer.

### 7. Effect on existing features

- The None grouping, **See all** shelf pages, the Discover face, the folder breadcrumb and
  child-folder chips are unchanged.
- The shelf pages keep their titles: **See all** on the **This folder** shelf opens a page
  titled with the folder's name, as today. `shelfTitle` in both apps and `folderLabel` are
  shared with `frontend/src/components/videoapp/VideoShelfPage.tsx`,
  `frontend/src/components/readingapp/ReadingShelfPage.tsx` and the Reading card's folder
  line (`frontend/src/components/readingapp/ReadingCard.tsx`); what those draw must not
  change.
- The clips app (knowledge addon) has its own Library and is not changed here.
- The backend is not changed; the shelves response keeps its `label`.

### 8. Error behavior

As in item 2. Nothing new is logged.

### 9. User-visible behavior

- One shelf → the None grid: no shelf heading, no count beside a heading, no **See all**;
  cards 60 at a time with infinite scroll, in the chosen sort.
- Under Length, the grid includes videos whose length is unknown, as None does, although
  the single shelf would not have held them.
- Under Folder with two or more shelves, the shelf of files directly in the folder the
  breadcrumb ends at is titled **このフォルダ** / **This folder** in both apps' Library,
  including at the drive root, where it was the drive's name. Its position among the
  shelves (by count) is unchanged.
- The user guide pages for the video and reading apps say both.

### 10. Non-functional

One extra request when the grouping yields one shelf (the shelves request, then the grid
request). No new limits.

## Touch points

- `frontend/src/components/videoapp/LibraryFace.tsx`
- `frontend/src/components/videoapp/labels.ts`
- `frontend/src/components/readingapp/LibraryFace.tsx`
- `frontend/src/components/readingapp/labels.ts`
- `frontend/src/messages-core/ja.json`, `frontend/src/messages-core/en.json` (the new title)
- `GET /api/drives/{drive}/shelves` and `POST /api/drives/{drive}/shelves/query`, read only,
  unchanged (`backend/app/routers/shelves.py`)
- `docs/user-guide/video.md`, `docs/user-guide/reading.md`
- Must not change what they draw (shared helpers' other callers):
  `frontend/src/components/videoapp/VideoShelfPage.tsx`,
  `frontend/src/components/readingapp/ReadingShelfPage.tsx`,
  `frontend/src/components/readingapp/ReadingCard.tsx`
- `.claude/rules/frontend-conventions.md` (i18n keys in `messages-core/` only)

## Invariants

I1. When a grouping's shelves answer reports `total_shelves` = 1, the Library draws no
shelf heading and no **See all** link, and draws the cards of every file the None grouping
would draw for the same target, position, filters and sort, in the same order.
I2. When `total_shelves` is 2 or more, the Library draws one shelf per answered shelf, as
before this change.
I3. When `total_shelves` is 0, the Library draws the same empty state it drew before this
change.
I4. Drawing the grid for a single shelf does not change the grouping shown in the
**分類** menu, the grouping remembered for the target, or the URL.
I5. In the Library under the Folder grouping, a shelf whose key is `<f>/` (or the empty key,
with `<f>` the root) is titled **このフォルダ** / **This folder** exactly when `<f>` is the
chips answer's `base` for the current conditions; every other folder shelf, and that
shelf before the chips answer, keeps the title it had before this change.
I6. A shelves answer for conditions the viewer has left never switches the Library between
the grid and shelves for the current conditions.
I7. The grid request (`by=all`) for a grouping other than None is sent only after a shelves
answer for the current conditions reports `total_shelves` = 1; a failed or 0- or 2+-shelf
answer sends none.
I8. The retry shown for a failed shelves request re-sends the shelves request; the retry
shown for a failed grid request re-sends only the grid request.
I9. The See all page titles in both apps, for every key including `<f>/` and `""`, and the
Reading card's folder line are the same as before this change.

## Revises

SPEC-CORE-145 I8. On first load and after a drive or Target change, no Library body request (the grouped shelves or the flat grid in Video, Reading and Clips; the rail and list requests in Notes) is sent with a grouping or sort other than the one finally shown for that Target, except the flat grid (`by=all`) that Video and Reading request under the shown grouping once its shelves answer reports a single shelf.

SPEC-CORE-063 I19. Group None lists books by `all`, Tag by `tag` with `no_tag` last, Folder by `folder` and Date Added by `month` in the server's order, except that a Tag, Folder or Date Added answer reporting a single shelf lists the books by `all` as None does; and Sort orders the books inside every shelf and the flat grid.

## Checked, no action

- Zero shelves under Length while None has videos (every video's length unknown): the
  Library keeps today's empty state. the scanner reads each video's length with ffprobe
  (`get_video_duration`), so an unknown length means the probe failed; drawing the grid here would be a
  separate change to the 0-shelf rule.
- Switching to the grid after card-menu removals leave one shelf: it would need a shelves
  re-fetch after each removal, against SPEC-CORE-157 I3 (no skeleton after a removal). The
  switch waits for the next shelves answer.

- Choosing another grouping automatically when one shelf results: rejected by the user. The
  grouping can yield one shelf again, and a setting that changes itself is harder to read.
- Drawing the single shelf's own files instead of every matching file: under Length that
  would drop the heading while showing only one bucket's videos, which the viewer could not
  tell from "all videos". The None grid is what "grouping means nothing here" asks for.
- Changing the backend `label` for the common-folder shelf: the video Library is its only
  reader, and the title is a presentation choice made in the Library alongside the reading
  app, which derives its title from the key.
- Retitling the **See all** page of the This folder shelf: on its own page the folder's name
  is the right title.
- The clips app in the knowledge addon: a separate repository and spec, to follow if the
  owner wants it.
- Applying the rule to the Discover face: Discover's shelves are fixed recommendations,
  not a grouping the viewer chose.
- A design artifact: the change draws only existing parts (the None grid, an existing shelf
  heading with new text), so there is no new layout to agree on.
