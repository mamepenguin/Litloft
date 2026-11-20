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
- D2. The crumbs: a home icon (accessible name, no visible text), then one segment per
  folder level, the last in the primary colour, medium weight. Separators are
  `ChevronRight` 14 px. Link segments are muted and turn primary on hover, as in
  `components/Breadcrumb.tsx`; plain segments other than the last are muted with no
  hover and no pointer cursor. On a fine pointer the crumbs wrap and sit in no box.
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
- D9. On a fine pointer the chip row keeps Reading's current cap: it wraps inside a box
  8 rem tall that scrolls vertically.
- D10. The header's count stays the target's total under any position.

## Required items

### 1. Normal flow

1. The viewer opens the Library tab. With no `folder` in the URL the position is the top
   of the target.
2. The page asks for the chips: the shelves endpoint with the target's own conditions,
   the position narrowed into them as the `folder` condition, and `by=folder`, 24 shelves
   per request up to 120, as Reading's chip loader does today (`useFolderChips`): one
   paging sequence per position. When the position changes, the answers still arriving
   for the old one are dropped (the requests are not aborted). The response's `base` and
   its shelves other than the one holding files directly in `base` are the crumbs' end
   and the chips. The tag, state and name filters are not sent. While the first page is
   in flight the crumbs are drawn from the position (none at the top) and no chips are
   drawn.
3. The viewer chooses the chip `学問`. The app pushes the URL with `folder=動画/学問`
   (one history entry).
4. Every Library request (grouped shelves, the None grid, the tag candidates) and every
   See all link carries the position as a `folder` condition narrowed into the target's
   own folders, with Reading's existing narrowing (`narrowFolders` in
   `readingapp/folders.ts`). The chips are asked for again under the new position. The
   narrowed folder is added inside the Library face; the app's target params, which
   Discover also reads, never carry it. A See all link carries the narrowed folders, not
   the raw position, because the shelf page uses the URL's folders in place of the
   target's.
5. The crumbs are drawn from `base` when `base` is the position or lies under it, and from
   the position otherwise (`base` can only be deeper). Once the first chip page has
   arrived, its `base` is kept even if a later page fails. A segment is a link only when
   choosing it changes the view: it is a strict ancestor of the position, and
   `narrowFolders(target folders, segment)` differs from the target's own folders (a
   segment above a folder-limited target's folder shows the same as the top). A link
   pushes the URL with that folder. Every other segment, including the position's own
   when `base` is deeper and every segment between the position and `base`, is plain
   text. The home crumb pushes the URL without `folder`, and is plain when there is no
   `folder` already.
6. Back and Forward move between positions, because the position is read from the URL.
   A position reached by Back is applied to the target in force, even if it was set
   under another target: the target is not in the URL, so the app cannot tell, and a
   position the target does not contain shows the empty state with the crumbs (I2).
   Reloading keeps the position.
7. Choosing another target in the target menu removes `folder` from the URL with replace,
   in the same step that changes the target. Choosing the target already in force does
   nothing to the position. A Home shortcut's `?target=` is a target choice and does the
   same.

### 2. Failure cases

- The chip request fails: the chips show Retry, as Reading's do today, and the crumbs are
  drawn from the position. The shelves still load.
- The shelves or grid request fails: the existing Retry.
- The position narrows the target to no folder (a folder-limited Smart Collection that
  does not contain it): the Library shows its empty state with the crumbs drawn from the
  position, and no chips. No shelves, grid, tag-candidate or chip request is sent. This
  extends Reading's existing `blocked` path, which today still asks for tag candidates
  with no folder, and applies it to Video.
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
| any | target changes without a menu choice (saved one deleted or unusable → default, member re-evaluated) | unchanged; the URL is not touched and the position applies to the target now in force |
| any | reload | unchanged |
| any | Discover ↔ Library tab | unchanged; Discover ignores it |
| `at(f)` | invalid `f` in the URL | `top`, replaced |

Chips: loading (nothing drawn, the space is not reserved), ready, failed (Retry), none
(D6).

Target conditions around the Library face keep today's behaviour, and the URL's
`folder` is kept through all of them:
- Target loading, member evaluation failed, or target unusable: the face is not drawn,
  so neither are the crumbs and chips.
- Target that intersects no kind (`empty`): Reading shows its unusable-target state as
  today; Video shows its no-files state with no crumbs or chips. No chip request is sent.

### 4. Data read and written

- Read: `GET /api/drives/{drive}/shelves` and `POST /api/drives/{drive}/shelves/query`
  (member targets), with `folder`; `GET /api/drives/{drive}/tag-counts` and
  `POST /api/drives/{drive}/tag-counts/query` (member targets) with `folder`. All exist
  and already accept `folder`.
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
  or chips. Their in-page link back to the Library carries the position the See all page
  was opened from (a `folder` the Library link passes along as `from_folder`), and opens
  at the top when there is none or a target was chosen on the See all page.
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
  (ja `一番上`, en `Top`). Reading's `readingApp.all` key is deleted from both files.
- A chip's count is the number of files under that folder that the target contains,
  before the tag, state and name filters.
- Chips are ordered as the folder shelves are today: most files first, then name.
- Choosing a chip or crumb scrolls the window to the top (scrollY 0), explicitly, since a
  query-only router push does not. Back and Forward leave scrolling to the browser.

### 10. Non-functional

- Chips: at most 120 per level, 24 per request (Reading's current limits).
- One chip paging sequence per position; a stale sequence's answers are dropped.
- No new endpoint, no new query parameter on the backend.

## Touch points

- `frontend/src/components/readingapp/LibraryFace.tsx`, `folders.ts`,
  `useFolderChips.ts`, `ReadingShelfPage.tsx`, `shelfLinks.ts`
- `frontend/src/components/videoapp/LibraryFace.tsx`, `VideoShelfPage.tsx`,
  `shelfLinks.ts`, `useVideoApp.ts` (target change clears the position)
- `frontend/src/components/readingapp/useReadingApp.ts` (the same)
- `frontend/src/components/videoapp/VideoApp.tsx`, `readingapp/ReadingApp.tsx` (passing
  the position to the Library face, and the page's callback that replaces the URL
  without `folder` when the target changes, alongside the existing `onTargetHandled`)
- `frontend/src/app/drive/[name]/apps/{video,reading}/page.tsx` and `…/shelf/page.tsx`
  (reading `folder` and `from_folder` from the URL, owning the router)
- `frontend/e2e-layout/reading-video-faces.spec.ts` and
  `frontend/e2e-layout/fixtures/reading-video-faces.html`: the Video Library's
  `chipRow` is null today and is asserted present after this change, on purpose. The
  same case measures D2, D4 and D9 in both apps: on a coarse pointer the crumbs and the
  chips are one line each with sideways scroll and every item at least 44 px tall; on a
  fine pointer the chips wrap inside the 8 rem box and the crumbs wrap outside any box;
  no horizontal page scroll at 390 px. Discover still has neither row.
- `frontend/src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx`: the
  parity shapes of the old toggle chip row are replaced by the crumbs and link chips.
- The existing Reading tests built on the `すべて` chip and `aria-pressed` are replaced
  by position tests covering the same conditions, not deleted. Position tests drive the
  app through the page's URL wiring, not a component rendered with no URL.
- `frontend/src/components/readingapp/__tests__/folders.test.ts` moves with
  `folders.ts`.
- `frontend/src/components/appshell/` (a shared crumbs-and-chips row, moving
  `folders.ts` and `useFolderChips.ts` there)
- `frontend/src/messages-core/{ja,en}.json`
- `docs/user-guide/video.md`, `docs/user-guide/reading.md`
- Rules passed through: `.claude/rules/frontend-conventions.md` (DESIGN.md, i18n),
  `DESIGN.md` §6 Tabs and Selected-state controls, the SPA navigation rule (router
  navigation only).

Implementation notes the reviewers raised:
- The page removes `target` (a Home shortcut) and `folder` in one URL replace built from
  one snapshot of the search params, so neither removal undoes the other.
- Both shelf routes' handling of a target chosen on the See all page drops `folder` and
  `from_folder` with the other URL conditions.
- At the top, Video's See all links carry no `folder`; only a position adds one.

## Invariants

I1. Under a position, every Library request and every See all link is limited to files
under the position and inside the target; a position never adds a file the target
excludes.
I2. A position that leaves no folder inside the target shows the empty state and sends no
shelves, grid, tag-candidate or chip request.
I3. Discover's requests are the same with or without a position.
I4. Choosing a chip or a link crumb adds exactly one history entry, and Back restores the
previous position with its shelves.
I5. Reloading keeps the position; choosing another target removes it without adding a
history entry; choosing the target already in force keeps it.
I6. The chips and the crumbs are the same whatever tag, state or name filter is chosen.
I7. Moving the position changes neither the grouping and sort saved for the target nor
the chosen tag, state and name filters.
I8. A chip's link goes to a folder one level below the crumbs' last folder, and every
crumb link goes to a strict ancestor of the position whose view differs from the
current one.
I9. The position is stored nowhere but the URL: opening the Library without `folder`
always shows the top of the target.
I10. A `folder` value the backend would reject is removed from the URL with replace, and
no request carries it.
I11. A failed chip request leaves the shelves or grid requested and drawn.
I12. Video's See all page applies the `folder` in its URL to every request, and drops it
when a target is chosen there.
I13. A See all page's link back to the Library opens at the position it was opened from,
and at the top when there was none or a target was chosen on the See all page.
I14. Chips and a `base` answered for an earlier position are never drawn under a later
one.
I15. The header's count is the same at every position of a target.

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
- An invariant for the scroll to the top on a chip or crumb: missing it is seen at once
  and costs a scroll; §9 states it and an acceptance test may check it.
- A backend `has_subfolders` flag so that a leaf chip is not offered: every chip leads
  somewhere, and a leaf shows its own files (D6).
