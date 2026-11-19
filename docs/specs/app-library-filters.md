# Tag and state filters in the app Libraries

SPEC-ID: SPEC-CORE-147
SPEC-ID: SPEC-CORE-148
SPEC-ID: SPEC-ADDON-151

Approval:

## Summary

Reading's Library can narrow by tag and by reading state while it groups and sorts. Video
and Clips cannot. Video narrows by watch state only by grouping on it, which yields three
large shelves the viewer then leaves through See all. With many tags, grouping by tag is
the only way to find a tag's items, and it is slow to scan.

This change gives Video and Clips the same two filters Reading has, in the same place,
through one core part:

- **タグ / Tag**: multi-select, AND. The menu lists only tags present under the current
  conditions, with counts, and has a search field.
- **状態 / State**:
  - Video: すべて / 未視聴 / 視聴中 / 視聴済み. Only with a profile, as in Reading.
  - Reading: unchanged.
  - Clips: すべて / 未検証 / 検証済み.

Video's 分類 loses 視聴状態, now a filter. Filters are not remembered: they reset on a
fresh open, a drive change and a Target change.

It builds on `docs/specs/app-view-per-target.md` (SPEC-CORE-145/146, SPEC-ADDON-147/148),
which lands first. The agreed design is the same artifact,
https://claude.ai/artifact/B2vcc6DPrGHjDkDhjPzrxe, saved in
`docs/process/reviews/feature-app-view-per-target/design/`. The relevant artboards are
Main, TagMenu and Phone.

What each SPEC-ID promises:

- **SPEC-CORE-147**: the core filter part (`FilterMenus`), Reading moving onto it, and
  Video's tag and state filters with 視聴状態 leaving 分類.
- **SPEC-CORE-148**: the tag-counts endpoint.
- **SPEC-ADDON-151**: Clips' tag and state filters.

## Required items

### 1. Normal flow

**The tag-counts endpoint (SPEC-CORE-148).**

- `GET /api/drives/{drive}/tag-counts` takes the same query parameters as
  `GET /api/drives/{drive}/files` (`FileFiltersQuery`). `POST
  /api/drives/{drive}/tag-counts/query` takes the same parameters plus a body
  `{ "file_ids": [...] }` that joins `collection` in the `in:` condition, as
  `folder-counts/query` does.
- Both answer `[{ "name": str, "count": int }]`. That is every tag of this drive carried
  by at least one active file that the files listing returns for the same parameters,
  with the number of such files. Tag names are folded the way the listing's `tag` filter
  folds them. The list is ordered by count descending, then name. Paging and sort
  parameters are ignored.
- `count` equals the `total` the files listing returns for the same parameters with
  `tag=<name>` added.
- It is built on `filtered_drive_files`, as `folder-counts` is.

**The core filter part (SPEC-CORE-147).** `frontend/src/components/appshell/FilterMenus.tsx`
holds two menus, drawn as today's outlined `ToolbarMenu` with the label shown:

- **Tag menu** (`Tag` icon, label タグ / Tag, value 指定なし / Any when none is chosen,
  else the chosen names joined by ", ", cut with an ellipsis).
  - Its body is a search field (タグを検索 / Search tags), a 指定なし / Any row that clears
    the choice, a separator, and the candidate list.
  - The candidates come from the caller's tag-counts request under every condition in
    force (Target, chip, state and the tags already chosen). The request is made each
    time the menu opens.
  - Chosen tags are listed first, even at count 0, then the others in the endpoint's
    order. Each row shows the name and the count, and toggling it adds or removes the tag.
  - The search narrows the list client-side by case-insensitive substring. When nothing
    matches, the list shows 一致するタグはありません / No matching tags.
  - While the request is out, the list shows a skeleton. On failure it shows Try again.
- **State menu** (`CircleCheck` icon, label 状態 / State). It is a radio list of the
  options the caller passes.

The caller owns the values and the requests. Below 640px, the filters fill row 1 of a
2×2 grid, at equal widths. When an app shows only one filter (no profile in Video or
Reading), it takes the left half. The view menus fill row 2 (SPEC-CORE-145 I15). From
640px up, the row is the filters, a 20px gap, then the view menus, wrapping as a whole
when narrow.

**Reading.** `TagMenu` and `StateMenu` are replaced by `FilterMenus`:

- Their values, the requests they drive, and their not being stored are unchanged.
- The tag candidates change from every tag of the drive to the tag-counts answer under
  the conditions in force.
- Their look changes from filled to outlined.

**Video.**

- The Library gains the tag menu and, with a profile, the state menu: すべて / All,
  未視聴 / Unwatched, 視聴中 / In Progress, 視聴済み / Watched.
- Every Library request (shelves of every grouping, the なし grid) and every See all link
  carries `tag` (repeated) and `watch=<state>` when set. These are the same parameters
  and the same boundary Reading uses.
- The See all page reads them from its URL and requests with them. Its title and back
  link are unchanged.
- 分類 no longer offers 視聴状態. A stored `watch` view is not offered, so it falls through
  as SPEC-CORE-145's order says. The "watch without a profile shows Folder" exception
  goes with it.
- Discover's shelves are unchanged.
- Choosing a state without a profile is not possible. Clearing the profile clears the
  state, as in Reading.

**Clips (SPEC-ADDON-151).**

- The Library gains the tag menu and the state menu, drawn with or without a profile:
  すべて / All, 未検証 / Unverified (`trust=unverified`), 検証済み / Verified
  (`trust=verified`).
- Both live in the Library URL as `tag` (repeated) and `trust`. A filter choice pushes the
  URL.
- Every Library request (By tag, Folder, Date Added, None) and every shelf page reached
  from the Library carries them. The back link carries them back.
- A Target change drops them (with `group` and `sort`, by replace).
- The fill-in of SPEC-ADDON-147 never adds them.
- Clips Home and its shelves ignore them.

**Reset.** In all three apps, filters are not written to storage. They reset to none on
a fresh open, a drive change and a Target change. In Clips they persist only as long as
the URL carries them.

### 2. Failure cases

- **Tag-counts fails or is slow.** The menu shows a skeleton, then Try again. The chosen
  tags stay chosen and in force. The Library's own requests are unaffected.
- **A chosen tag disappears from every file in force.** It stays listed first with
  count 0. The Library shows the empty result.
- **A filtered Library request fails.** The Library shows its existing failed state with
  Try again.
- **Clips URL with an unreadable `trust`.** It is rewritten away by replace, with no
  history entry. An unknown `tag` simply matches nothing.
- **Tag-counts for a locked or unknown drive** answers 404, like `folder-counts`.

### 3. States

Per app and mount:

- the chosen tags (empty or a set);
- the state (`all` or one option).

Transitions:

- a menu choice;
- 指定なし, which empties the tags; すべて, which sets `all`;
- reset on a fresh open, a drive change and a Target change;
- clearing the profile, which sets the state to `all` (Video, Reading).

Clips also reads them from the URL on navigation.

### 4. Data read and written

- **Backend:** reads `files`, `file_tags`, `tags` and `watch_history` (through `watch`);
  writes nothing. No table, column or migration.
- **Browser:** no storage. Clips' URL holds `tag` and `trust`.

### 5. External services

None.

### 6. Authorization

`tag-counts` validates the drive like `folder-counts` (`_validate_drive` with the
unlocked groups), so a locked drive answers 404. It counts only that drive's files,
whatever ids or collections the request names. `watch` needs the viewer identity as the
listing does. Without it the listing's existing `viewer_required` behaviour applies, and
the UI never sends `watch` without a profile.

### 7. Effect on existing features

- Reading's tag menu candidates change. Before, they were every drive tag, including tags
  outside the Target. After, only tags reachable under the conditions in force.
- Video loses grouping by watch state. Its "watch without profile shows Folder"
  exception goes away. Video See all links gain `tag` / `watch`.
- `GET /api/drives/{drive}/tags` is unchanged and still used by other callers (tag
  editors, sidebar).
- The `by=watch` shelves stay in the backend for Discover's Continue.
- Clips shelf-page links and back links gain `tag` / `trust`.
- The scope line's count stays the Target's total and ignores filters, as in Reading.
- Docs:
  - `docs/reference/api.md` (new endpoint);
  - `docs/user-guide/video.md`, `reading.md` and `notes.md` (Clips section);
  - `docs/addons/knowledge.md` (Clips URL `tag`, `trust`).

### 8. Error behavior

As in 2:

- the menu shows Try again;
- the Library shows its failed state;
- a Library with no result under filters shows 条件に合う項目はありません / Nothing matches
  these filters, in the empty state the app already draws.

Nothing is logged beyond the existing request logging.

### 9. User-visible behavior

- Video and Clips Libraries show タグ and 状態 before 分類 and 並び順.
- Video's 分類 no longer lists 視聴状態.
- The tag menu lists only usable tags with counts and can be searched.
- Filters reset when the Target changes or the app is reopened.
- At 390px the four menus form a 2×2 grid.

### 10. Non-functional

- One tag-counts request per menu open. It is a single grouped query over the filtered
  listing (one `GROUP BY` over `file_tags`), bounded by the drive's files.
- Search is client-side. Tens to low thousands of tags fit in the menu with its scroll.
- No change to request counts for the Library itself.

## Touch points

- `backend/app/routers/drives.py`: `tag-counts` GET and POST, beside `folder-counts`.
- `backend/tests/`: a tag-counts test against the files listing.
- `frontend/src/lib/api.ts`: `getTagCounts` (GET and POST).
- `frontend/src/components/appshell/FilterMenus.tsx` (new); `ViewMenus.tsx` for the grid
  layout.
- `frontend/src/components/readingapp/{LibraryControls.tsx, LibraryFace.tsx}`
- `frontend/src/components/videoapp/{LibraryFace.tsx, LibraryControls.tsx, useVideoApp.ts, shelfLinks.ts}`
  and the Video See all page; `frontend/src/lib/appPrefs.ts` (`watch` leaves the Video
  classifications).
- `frontend/src/messages-core/{ja,en}.json`
- `addons/knowledge/frontend/pages/clips.tsx`,
  `clipsapp/{clipsUrl.ts, Library.tsx, ShelfPage.tsx, requests.ts}`,
  `messages/{ja,en}.json`
- Tests:
  - the Video, Reading and Clips Library tests;
  - `e2e-layout` / `e2e-components` fixtures for the Video, Reading and Clips control rows
    at 390, 1024 and 1280px.
- Docs: `docs/reference/api.md`, `docs/user-guide/{video,reading,notes}.md`,
  `docs/addons/knowledge.md`, `docs/ADDON-DEVELOPMENT.md` (the `FilterMenus` part for
  addon pages).
- No protected path. `drives.py` is not in a risk zone, and this change is read-only.

## Invariants

I1. For any parameters, every `tag-counts` entry's `count` equals the `total` of the files listing for the same parameters plus `tag=<name>`, every tag with such a total above 0 is listed, and no tag with total 0 is listed; GET and POST with the same ids agree.
I2. `tag-counts` and `tag-counts/query` answer 404 for a locked or unknown drive and never count a file of another drive, whatever ids or collections the request names.
I3. The tag menu lists the chosen tags first and then exactly the tag-counts answer for the conditions in force, and a search shows exactly the rows whose name contains the text, ignoring case.
I4. With tags T and state S chosen, every Library request and every See all / shelf link in Video, Reading and Clips carries all of T and S, and every item shown carries every tag in T and matches S.
I5. No filter value is written to localStorage; a fresh open, a drive change and a Target change show every app with no tag and state すべて; in Clips the Target change removes `tag` and `trust` from the URL without a history entry.
I6. Without a profile, Video and Reading draw no state menu and send no `watch`; clearing the profile sets the state to すべて.
I7. Video's 分類 never offers 視聴状態, and a stored `watch` view shows the next value in SPEC-CORE-145's order without sending `by=watch` from the Library.
I8. In Video, Reading and Clips the Library control row is the filter menus, then the view menus; below 640px they form two rows of two equal-width buttons with the filters on row 1; at 1440, 1280, 1024 and 390px in ja and en nothing scrolls horizontally, measured in a real browser.
I9. A failing tag-counts request leaves the chosen tags and the Library's results unchanged.

## Revises

SPEC-CORE-145 I15. Every 分類 and 並び順 menu in the four apps is drawn by `ViewMenus`; Video offers フォルダ, タグ, 追加日, 長さ and なし, and Reading and Clips offer タグ, フォルダ, 追加日 and なし; below 640px the two view menus are equal in width and on one row.
SPEC-CORE-145 I3. The view shown is: the URL parameter when present and readable (Clips `group`/`sort`, Notes `sort`, and Notes `folder`/`tag` implying the segment), else the Target's stored value when the app offers it in the current state, else, for the `default` Target only, the old per-drive value, else the app default; a value the app does not offer is never sent to the backend and never shown.

## Checked, no action

- **Saving filters per Target.** Not done, by the user's choice. A remembered filter hides
  items without the viewer noticing. A filter worth keeping is a Smart Collection.
- **A folder filter in Video and Clips** (Reading's chips). Not added. Grouping by Folder
  covers looking at one folder, and a third filter crowds the row.
- **Clips' unread as a state.** Not added. Clips Home already has the Unread shelf, and one
  menu with two axes (read and verified) would be ambiguous.
- **Notes.** Unchanged. The rail already selects a tag.
- **OR between tags.** Not offered. Reading is AND today, and drill-down counts only make
  sense for AND.
- **Filling the tag menu from `GET /tags`.** Rejected. It counts the whole drive and
  ignores the Target, which is the "too many tags" problem.
- **Using shelves `by=tag` for the candidates.** Rejected. `shelf_limit` caps it at 24.
- **Filled vs outlined to tell filters from view menus.** Not done. The user dislikes the
  filled style for select-like menus. The look of select-like menus is a separate,
  app-wide task. Here the two kinds differ by order and gap only, and each goes through
  its own core part so that task can restyle them in one place.
- **A single "表示" sheet on phones** (design artboard PhoneB). Rejected by the user in
  favour of the 2×2 grid.
- **A design for the tag menu at phone width.** None separate. `ToolbarMenu` already
  becomes a bottom sheet below `sm`, and the search field sits at its top.
