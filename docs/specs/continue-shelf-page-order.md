# Continue shelf page opens in last-opened order

SPEC-ID: SPEC-CORE-072

Approval: sha256:b5886fc8c28ba025737cfa7e448842e75bf443aa602ad4d7bb0c23727ec81d2c Yuichi Senga 2026-11-10

## Summary

In the Video and Reading apps, Discover's Continue shelf lists the desk by last played,
newest first (it sends `sort=last_played`; the endpoint's default `order` is `desc`). Its See all opens the shelf page for
`by=watch&key=continue`, which uses the page's default sort, added-date newest first, so
the same files change order on the way in. The Continue shelf page now opens ordered by
last opened, newest first, and its sort menu gains **最後に開いた順** / **Last opened**.
The choice is offered only on that page.

## Required items

### 1. Normal flow

1. On Discover in the Video or Reading app, the viewer chooses See all on the Continue
   shelf. The link is `.../apps/{video|reading}/shelf?by=watch&key=continue&from=discover`
   with no `sort`, as today.
2. The shelf page sees `by=watch` and `key=continue` with no recognised `sort`, selects the
   choice `played`, and requests the shelf with `sort=last_played&order=desc`.
3. The page lists the files in that order, 60 at a time, as today. The sort menu shows
   最後に開いた順 / Last opened as the current value.
4. The viewer may pick another choice; the page re-requests with that choice's pair.
   Picking 最後に開いた順 again restores step 2's order. The pairs:

   | Choice id | Label | `sort` | `order` | Offered on |
   |---|---|---|---|---|
   | `played` | 最後に開いた順 / Last opened | `last_played` | `desc` | Continue shelf page only |
   | `newest` | 追加日（新しい順） | `created_at` | `desc` | every page, as today |
   | `oldest` | 追加日（古い順） | `created_at` | `asc` | every page, as today |
   | `title` | タイトル | `title` | `asc` | every page, as today |
   | `size` | サイズ | `file_size` | `desc` | every page, as today |

`played` is not added to the shared `SortChoice` type, `SORT_CHOICES` or `parseSortId`
that Library, `LibraryFace`, `VideoApp` / `ReadingApp` and `shelfLinks` use. The Continue
shelf page gets its own list (`played` followed by `SORT_CHOICES`) and its own parse of the
URL's `sort` against that list; the shared sort menus take the list to show as a prop,
defaulting to `SORT_CHOICES`, so Library passes nothing new.

### 2. Failure cases

- The shelf request fails: unchanged; the page shows its existing retry state.
- `sort=played` in the URL of any other shelf page (another key, another grouping): not a
  recognised choice there, so that page opens on its default (added newest), as any unknown
  value does today.
- No profile: unchanged; `by=watch` is blocked and the page shows its existing state.

### 3. States

The shelf page's selected sort: one of the offered choices. On the Continue shelf page the
offered choices are `played`, `newest`, `oldest`, `title`, `size`, and the initial one is
the URL's `sort` when it is one of them, else `played`. On every other shelf page and in
Library the offered choices and the default are unchanged (`newest`, `oldest`, `title`,
`size`; default `newest`). The selection is not stored, as today.

When `by` or `key` changes while the page stays mounted (for example browser back or
forward between two shelf URLs), the selection is recomputed for the new page: the URL's
`sort` when that page offers it, else that page's default. A `played` selection therefore
never reaches a page that does not offer it.

### 4. Data read and written

Read: the shelves endpoint, as today, with `sort=last_played` (already supported by the
backend for `by=watch`). Nothing is written. No new storage.

### 5. External services

None.

### 6. Authorization

Unchanged: the shelves endpoint's drive check and `400 viewer_required` for `by=watch`
without a viewer.

### 7. Effect on existing features

- Library's sort menu and every other shelf page keep their four choices and default.
- Discover's shelves and their links are unchanged.
- The sort menu components (`SortChoiceMenu`, `ReadingSortMenu`) are shared with Library;
  they gain a way to be given the extra choice, and Library does not pass it.
- Backend: no change.

### 8. Error behavior

Unchanged. No new error.

### 9. User-visible behavior

- Opening See all from Discover's Continue (Video) or Continue reading (Reading) lists the
  files in the same order as the Discover shelf.
- That page's sort menu lists 最後に開いた順 / Last opened first, then the four existing
  choices, with 最後に開いた順 selected.
- No other sort menu changes.

### 10. Non-functional

The same paged request, with a different `sort` value. `last_played_at` changes when a
file is opened, so if a file on the desk is opened elsewhere while this page is loading a
later page of 60, that file can appear twice or be skipped across the page boundary. This
needs a desk of more than 60 files (at most 14 days of history; 21 on production) and is
accepted.

## Touch points

- `frontend/src/components/videoapp/labels.ts`, `LibraryControls.tsx` (`SortChoiceMenu`),
  `VideoShelfPage.tsx`.
- `frontend/src/components/readingapp/labels.ts`, `LibraryControls.tsx`
  (`ReadingSortMenu`), `ReadingShelfPage.tsx`.
- `frontend/src/lib/api.ts`, only if the shelf request's `sort` type needs `last_played`
  in the page's path (the type already includes it).
- `frontend/src/messages-core/ja.json`, `en.json`: `videoApp.sort.lastOpened`,
  `readingApp.sort.lastOpened` (or the existing namespaces' equivalent).
- Tests under `frontend/src/components/{videoapp,readingapp}/__tests__/`.
- Untouched on purpose: `VideoApp.tsx`, `ReadingApp.tsx`, both `LibraryFace.tsx`, both
  `shelfLinks.ts`, both `useDiscover.ts`, `backend/`.
- Docs: `docs/user-guide/video.md`, `docs/user-guide/reading.md` (the See all ordering).

## Invariants

I1. In both apps, the shelf page for `by=watch&key=continue` opened without a recognised `sort` in the URL requests the shelf with `sort=last_played&order=desc` and shows 最後に開いた順 / Last opened as the selected sort.
I2. On that page the sort menu offers 最後に開いた順 / Last opened followed by the four existing choices, and choosing any of them re-requests the shelf with that choice's `sort` and `order`.
I3. On that page a URL `sort` naming one of the four existing choices opens on that choice with its pair from the table in item 1; `sort=played` or an unknown value opens on Last opened.
I4. Every other shelf page (any other `by`, or `by=watch` with another key) and Library offer exactly the four existing choices, default to added newest, and never request `sort=last_played`; a URL `sort=played` there opens on added newest, and Library's See all links never carry `sort=played`.
I5. Discover's Continue shelf link carries no `sort`, and Discover's Continue request is unchanged (`sort=last_played`, no `order`).
I6. When `by` or `key` changes while the shelf page stays mounted, the selected sort and the request follow the new page's offered choices and default, so a page other than the Continue shelf page never requests `sort=last_played` and never shows Last opened.

## Checked, no action

- **Offering Last opened elsewhere.** Decided with the user: only on the Continue shelf
  page. On other shelves many files were never opened, so the order says little there.
- **Changing the default by carrying `sort=played` in Discover's link.** The page decides
  its own default instead, so the link stays as it is and a hand-typed URL behaves the same.
- **Remembering the chosen sort.** The shelf page does not store its sort today.
- **Home's `?view=continue`.** It already lists newest-played first; not a shelf page.
- **Backend.** `sort=last_played` is already accepted for `by=watch` and orders by
  `last_played_at` with a tiebreak on id. Duplicates across a page boundary are covered in
  item 10.
