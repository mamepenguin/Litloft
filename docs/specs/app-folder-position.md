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

The change is frontend only. The shelves endpoint already narrows by `folder` and reports
`base`, the deepest folder every matching file lies under
(`backend/app/routers/shelves.py`, `_folder_base`).

Code is quoted as it stood at `48479c94b`. Implementation is expected to queue behind
other app changes already in flight on the same files (the Library name filter,
SPEC-CORE-156, and the app card menu); touch points are named by component, not line.

## Design

Agreed design: https://claude.ai/artifact/B7hzPJLCEniU6A5AHojoSV, saved in
`docs/process/reviews/feature-app-folder-position/design/` (artboards `Main` — Video at
`動画/学問`, `Reading` — Reading at `本/技術書` grouped by None, `States` — top, no child
folder, empty, and `Phone` — Video at 390 px).

Checkable decisions:

- D1. Order on the Library tab, top to bottom: the tabs, the crumbs, the chips, the
  existing control row (tag, state | group, sort), then the shelves or grid.
- D2. The crumbs: a home icon (accessible name, no visible text), then one link per
  ancestor folder segment, then the current folder as plain text in the primary colour,
  medium weight. Separators are `ChevronRight` 14 px. Ancestors are muted and turn
  primary on hover, as in `components/Breadcrumb.tsx`.
- D3. The chips: one per child folder, the folder's last segment followed by its file
  count in the muted colour. Rounded-full on `--bg-elevated`, no border, no selected
  state. A chip is a link.
- D4. On a computer the chips wrap; on a coarse pointer the crumbs and the chips are each
  one line that scrolls sideways, and every crumb and chip is at least 44 px tall.
- D5. At the top of the target with nothing to descend through (`base` empty), the crumbs
  are not drawn; the chips are.
- D6. With no child folder, the chips are not drawn; the crumbs are.
- D7. A position with no files keeps the crumbs and shows the Library's empty state below
  them.
- D8. Video draws the crumbs and chips under every grouping, Folder included.

## Required items

### 1. Normal flow

1. The viewer opens the Library tab. With no `folder` in the URL the position is the top
   of the target.
2. The page asks for the chips: the shelves endpoint with the target's own conditions,
   the position narrowed into them as the `folder` condition, and `by=folder`, 24 shelves
   per request up to 120, as Reading's chip loader does today (`useFolderChips`). The
   response's `base` and its shelves other than the one holding files directly in `base`
   are the crumbs' end and the chips. The tag, state and name filters are not sent.
3. The viewer chooses the chip `学問`. The app pushes the URL with `folder=動画/学問`
   (one history entry).
4. Every Library request (grouped shelves, the None grid, the tag candidates) and every
   See all link carries the position as a `folder` condition narrowed into the target's
   own folders, with Reading's existing narrowing (`narrowFolders` in
   `readingapp/folders.ts`). The chips are asked for again under the new position.
5. The crumbs are drawn from `base` when `base` is the position or lies under it, and from
   the position otherwise (`base` can only be deeper). Each ancestor crumb pushes the URL
   with that folder; the home crumb pushes the URL without `folder`.
6. Back and Forward move between positions, because the position is read from the URL.
   Reloading keeps it.
7. Choosing another target in the target menu removes `folder` from the URL with replace,
   in the same step that changes the target. Choosing the target already in force does
   nothing to the position. A Home shortcut's `?target=` is a target choice and does the
   same.

### 2. Failure cases

- The chip request fails: the chips show Retry, as Reading's do today, and the crumbs are
  drawn from the position. The shelves still load.
- The shelves or grid request fails: the existing Retry.
- The position narrows the target to no folder (a folder-limited Smart Collection that
  does not contain it): the Library shows its empty state with the crumbs, and no
  Library request is sent without a folder condition. This is Reading's existing
  `blocked` path, extended to Video.
- The position names a folder with nothing in it under the target (renamed or emptied):
  the requests are sent, return nothing, and the Library shows its empty state with the
  crumbs.
- The `folder` value is not a folder path the backend accepts (an empty, `.` or `..`
  segment, or a NUL): the app treats it as no position and removes it with replace.
  Only a hand-edited URL produces it.

### 3. States

Position: `top` (no `folder` parameter) or `at(folder)`.

| From | Event | To |
|---|---|---|
| any | chip `c` | `at(c)`, pushed |
| `at(f)` | ancestor crumb `a` | `at(a)`, pushed |
| `at(f)` | home crumb | `top`, pushed |
| any | Back / Forward | the entry's position |
| any | another target chosen | `top`, replaced |
| any | same target chosen | unchanged |
| any | reload | unchanged |
| any | Discover ↔ Library tab | unchanged; Discover ignores it |
| `at(f)` | invalid `f` in the URL | `top`, replaced |

Chips: loading (nothing drawn, the space is not reserved), ready, failed (Retry), none
(D6).

### 4. Data read and written

- Read: `GET /api/drives/{drive}/shelves` and `POST /api/drives/{drive}/shelves/query`
  (member targets), with `folder`; `tag-counts` with `folder`. All exist and already
  accept `folder`.
- Written: the URL only. No localStorage key, no sessionStorage, no table, no endpoint.

### 5. External services

None.

### 6. Authorization

Unchanged. The shelves and tag-count endpoints check drive access; every request is
drive-scoped, so a position cannot reach another drive.

### 7. Effect on existing features

- Reading's chip row (`すべて` plus one-level toggle chips held in component state) is
  replaced by the crumbs and chips of this spec. Its `blocked` handling and
  `narrowFolders` are reused.
- Video gains the same rows above its Library control row.
- See all pages: Reading's shelf page already takes `folder` from the URL; Video's shelf
  page gains the same `folder` parameter, with the same behaviour Reading's has when a
  target is chosen there (the URL conditions are dropped). See all pages draw no crumbs
  or chips.
- Saved grouping and sort per target (SPEC-CORE-145/146), the tag and state filters
  (SPEC-CORE-147/148) and the name filter (SPEC-CORE-156, in flight) keep their own
  rules. Changing the position does not reset them.
- Home's app+target shortcuts (SPEC-CORE-153/154) open at the top.
- Discover, its shelves and its provider shelves do not read the position.

### 8. Error behavior

As in 2. Nothing new is logged; the existing request failures are logged where they are
today.

### 9. User-visible behavior

- The rows of D1–D8.
- New strings in `messages-core/{ja,en}.json`: the crumbs' accessible name (ja
  `フォルダの位置`, en `Folder position`) and the home crumb's accessible name
  (ja `一番上`, en `Top`). Reading's `all` chip string is no longer used.
- A chip's count is the number of files under that folder that the target contains,
  before the tag, state and name filters.
- Chips are ordered as the folder shelves are today: most files first, then name.
- Choosing a chip or crumb scrolls the page to the top of the Library.

### 10. Non-functional

- Chips: at most 120 per level, 24 per request (Reading's current limits).
- One chip request per position change, cancelled when the position changes again.
- No new endpoint, no new query parameter on the backend.

## Touch points

- `frontend/src/components/readingapp/LibraryFace.tsx`, `folders.ts`,
  `useFolderChips.ts`, `ReadingShelfPage.tsx`, `shelfLinks.ts`
- `frontend/src/components/videoapp/LibraryFace.tsx`, `VideoShelfPage.tsx`,
  `shelfLinks.ts`, `useVideoApp.ts` (target change clears the position)
- `frontend/src/components/readingapp/useReadingApp.ts` (the same)
- `frontend/src/app/drive/[name]/apps/{video,reading}/page.tsx` and `…/shelf/page.tsx`
  (reading `folder` from the URL)
- `frontend/src/components/appshell/` (a shared crumbs-and-chips row, moving
  `folders.ts` and `useFolderChips.ts` there)
- `frontend/src/messages-core/{ja,en}.json`
- `docs/user-guide/video.md`, `docs/user-guide/reading.md`
- Rules passed through: `.claude/rules/frontend-conventions.md` (DESIGN.md, i18n),
  `DESIGN.md` §6 Tabs and Selected-state controls, the SPA navigation rule (router
  navigation only).

## Invariants

I1. Under a position, every Library request and every See all link is limited to files
under the position and inside the target; a position never adds a file the target
excludes.
I2. A position that leaves no folder inside the target shows the empty state and sends no
Library request without a folder condition.
I3. Discover's requests are the same with or without a position.
I4. Choosing a chip or a crumb adds exactly one history entry, and Back restores the
previous position with its shelves.
I5. Reloading keeps the position; choosing another target removes it without adding a
history entry; choosing the target already in force keeps it.
I6. The chips and the crumbs are the same whatever tag, state or name filter is chosen.
I7. Moving the position changes neither the grouping and sort saved for the target nor
the chosen tag, state and name filters.
I8. A chip's link goes to a folder one level below the crumbs' last folder, and every
crumb's link goes to an ancestor of it.

## Checked, no action

- Notes and Clips (knowledge addon) have their own folder views; out of scope.
- Making Video's folder shelf headings descend: the chips already do it in every
  grouping (D8).
- Saving the position per target or per drive: the position is navigation, the target is
  the saved scope.
- Crumbs or chips on See all pages: a See all page is one shelf, already narrowed.
- Showing the target's name as the root crumb: it is in the target control just above.
- Collapsing long crumb trails into `…`: folder depth in practice is a few levels, and
  the phone row scrolls sideways (D4).
- A backend `has_subfolders` flag so that a leaf chip is not offered: every chip leads
  somewhere, and a leaf shows its own files (D6).
