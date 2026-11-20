# A folder position in the Video and Reading Libraries

SPEC-ID: SPEC-CORE-165
SPEC-ID: SPEC-CORE-166

Approval:

<!--
SPEC-CORE-165: the folder position (URL, breadcrumb, child-folder chips) in the Video Library.
SPEC-CORE-166: the same position in the Reading Library, replacing its one-level folder chips.
-->

## Summary

The Video and Reading Libraries group and narrow a drive's files, but they use only one
level of the viewer's folders. Video's Folder grouping shows the child folders of the
deepest folder every video lies under; Reading's chip row narrows to one of those children
and stops there. A drive organised as `動画/学問/数学` cannot be walked down inside the app:
the viewer sees `学問` as one shelf and has to leave for the folder browser to reach
`数学`.

This change gives both Libraries a **position**: a folder inside the current target that
the Library is looking at. The position is held in the URL, shown as a breadcrumb, and
changed by choosing one of the child-folder chips under it (one level down) or a crumb
(any level up). The target stays what it is today, a remembered scope; the position is
transient navigation inside it and is never saved. Discover is not affected.

Code is quoted as it stood at `48479c94b`. Implementation is expected to queue behind
other app changes already in flight (the Library name filter, SPEC-CORE-156, and the app
card menu); touch points are named by component, not line.

## Required items

### 1. Normal flow

1. The viewer opens the Library tab. With no `folder` in the URL the position is the top
   of the target. The page asks for the chips with the target's own conditions and
   `by=folder`; the response's `base` and shelves give the crumbs and the chips.
2. The viewer chooses the chip `学問`. The app pushes `?folder=動画/学問` onto the URL.
3. Every Library request (shelves, None grid, tag candidates) and every See all link now
   carries the position as a folder condition narrowed into the target's own folders. The
   chips are asked for again under the new position: they are `数学`, `物理`, ….
4. The crumbs read `<target name> › 動画 › 学問`. Choosing `<target name>` or `動画` pushes
   that position; the browser's Back returns to the previous one.
5. Reloading keeps the position. Choosing another target removes it.

### 2. Failure cases

- The chip request fails: the chips show Retry, as Reading's do today; the crumbs fall back
  to the position's own segments; the shelves still load.
- The shelves request fails: the existing Retry.
- The position names a folder with nothing in it under the target (renamed, emptied, or
  outside a folder-limited target): the Library shows its empty state with the crumbs, so
  the viewer can go up. No request is sent without the folder condition.
- The position is not a valid folder (hand-edited `..` or an empty segment): treated as no
  position, and the URL parameter is removed with replace.

### 3. States

Position: `top` (no `folder` parameter) or `at(folder)`.
- `top → at(child)` by a chip; `at(a) → at(ancestor or top)` by a crumb; any → previous by
  Back; any → `top` by choosing another target; reload keeps the state.
- The tab switch (Discover/Library) keeps the state; Discover ignores it.

### 4. Data read and written

- Read: `GET /api/drives/{drive}/shelves` (and `POST …/shelves/query` for member targets)
  with `folder` and `by=folder`; `tag-counts`. Both exist; no backend change.
- Written: the URL only. No localStorage key, no table.

### 5. External services

None; the change is frontend navigation over existing core endpoints.

### 6. Authorization

Unchanged. The drive's access check in the shelves endpoint applies; a position cannot
reach outside the drive because every request is drive-scoped.

### 7. Effect on existing features

- Reading's chip row (`すべて` + one-level chips in memory) is replaced by the crumbs and
  chips of this spec.
- Video gains the same row above its Library controls.
- See all pages receive the position in the URL (Reading's shelf page already accepts
  `folder`; Video's gains it). They show no crumbs.
- Saved grouping and sort per target (SPEC-CORE-145/146), tag and state filters
  (SPEC-CORE-147/148) and the name filter (SPEC-CORE-156, in flight) keep their own rules.
  The filters survive a position change.
- Home's app+target shortcuts open at the top.

### 8. Error behavior

As in 2: Retry for failed requests, the empty state for an empty position. Nothing new is
logged.

### 9. User-visible behavior

To be fixed by the agreed design: the row's place, the crumb and chip styling, the counts
on chips, the phone layout.

### 10. Non-functional

The chips keep Reading's limit of 120 per level (24 per request).

## Touch points

- `frontend/src/components/readingapp/LibraryFace.tsx`, `folders.ts`, `useFolderChips.ts`
- `frontend/src/components/videoapp/LibraryFace.tsx`, `VideoShelfPage.tsx`, `shelfLinks.ts`
- `frontend/src/components/appshell/` (a shared position row)
- `frontend/src/messages-core/{ja,en}.json`
- `docs/user-guide/video.md`, `docs/user-guide/reading.md`

## Invariants

I1. Under a position, every Library request and every See all link is limited to files
under the position and inside the target; a position never adds a file the target
excludes.
I2. A position that leaves no folder inside the target shows the empty state and sends no
request without a folder condition.
I3. Discover's shelves are the same with or without a position.
I4. Choosing a chip or a crumb adds one history entry, and Back returns to the previous
position.
I5. Reloading keeps the position; choosing another target removes it; choosing the same
target again keeps it.
I6. The chips and crumbs depend on the target and the position alone; choosing a tag,
state or name filter does not change them.
I7. Moving the position does not change the grouping and sort saved for the target.

## Checked, no action

- Notes and Clips (knowledge addon) have their own folder views; out of scope.
- Making folder shelf headings descend: the chips already do it in every grouping.
- Saving the position per target: the user chose a transient position over a target.
