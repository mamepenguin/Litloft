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
  - Clips: すべて / 未確認 / 確認済み (the words Clips already uses).

Video's 分類 loses 視聴状態, now a filter. Filters are not remembered across page loads.
They last while the page is open: across the Discover/Library tab switch and a round trip
through See all. They reset on a full page load, a drive change and a Target choice.

This spec is approved after SPEC-CORE-145, and its revisions of SPEC-CORE-145 depend on
that order.

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
- Both also accept `watch` (`in_progress` | `unwatched` | `finished`), with the boundary
  and the viewer requirement of the shelves route. `watch` without a viewer identity
  answers 400 `viewer_required`. The watch join and bucket move from `shelves.py` to a
  new `backend/app/services/watch_state.py`, used by both routes; `drives.py` does not
  import `shelves.py`. No other viewer filter is accepted.
- Both answer `[{ "name": str, "count": int }]`. The rows are the matching files' tags,
  grouped by name folded the way the listing's `tag` filter folds it (Python
  `str.lower`). The grouping takes every Tag row linked to those files, including a row of
  another drive that a moved file still links to.
  - `count` is the number of distinct matching files carrying any row of that group.
  - `name` is the spelling of this drive's row in the group (the alphabetically first one
    when this drive holds two spellings). If the group has none, it is
    the alphabetically first spelling.
- Groups with count 0 are not listed. The order is count descending, then `name`. Paging
  and sort parameters are ignored.
- `count` equals the `count` of the shelves route's `by=all&key=all` answer for the same
  conditions with `tag=<name>` added. Without `watch`, that is also the files listing's
  `total`.
- It is built on `filtered_drive_files`, as `folder-counts` is. The folding is done in
  Python, because SQLite's `lower()` leaves non-ASCII capitals alone.

**The core filter part (SPEC-CORE-147).** `frontend/src/components/appshell/FilterMenus.tsx`
holds two menus, drawn as today's outlined `ToolbarMenu` with the label shown:

- **Tag menu** (`Tag` icon, label タグ / Tag, value 指定なし / None specified when none is
  chosen, else the chosen names joined by ", ", cut with an ellipsis).
  - Its body is a search field (タグを検索 / Search tags), a 指定なし / Any row that clears
    the choice, a separator, and the candidate list.
  - The candidates come from the caller's tag-counts request under every condition in
    force: the Target, the chip, the state and the tags already chosen. For a member
    Target it is the POST form with the member ids, through `AppRequests`.
  - The list is the chosen tags first, each once, even at count 0. The rest of the answer
    follows in the endpoint's order, leaving out the chosen tags and the Target's own
    `tag` conditions (choosing one would change nothing). Each row shows the name and the
    count, and toggling it adds or removes the tag.
  - The request is made when the menu opens and again after each toggle. The menu stays
    open, the rows already drawn stay until the new answer arrives, and an answer for
    conditions no longer in force is dropped.
  - The search trims the text and narrows the list client-side by case-insensitive
    substring. When nothing matches, the list shows 一致するタグはありません / No matching
    tags. When the answer is empty and nothing is chosen, it shows タグはありません / No
    tags.
  - While the first request is out, the list shows a skeleton. On failure it shows Try
    again.
  - The menu's size is `ToolbarMenu`'s, and the artboard's pixel sizes are not binding.
- **State menu** (`CircleCheck` icon, label 状態 / State). It is a radio list of the
  options the caller passes.

The caller owns the values and the requests. All three apps put the filters and the
view menus in `LibraryControlRow` (SPEC-CORE-146), which owns the layout:

- Below 640px it is a 2×2 grid at equal widths. Row 1 holds the filters; when an app
  shows only one filter (no profile in Video or Reading), it takes the left half. Row 2
  holds the view menus.
- From 640px up it is one row: the filter group, a 20px gap, then the view group. When
  the row is too narrow, the view group wraps to the next line as a unit.

**Where filter state lives (Video, Reading).** A module-level in-memory store holds one
entry per app: its drive and its filters.

- Client-side navigation keeps it. That includes tab switches, See all and back, a
  file page and back, and another app or page and back.
- A full page load empties it.
- Opening the app on a drive other than the entry's drive replaces the entry with empty
  filters, so A→B→A does not bring A's filters back.
- A Target choice, as SPEC-CORE-145 defines it, empties it. Choosing the Target already in
  force does not. Neither does a fallback to `default` or a member re-evaluation.

**`FilterMenus` contract.** The caller passes:

- `tags` (the chosen names, in choice order), `onToggle(name)` and `onClear()`;
- `loadCandidates(signal) => Promise<{name, count}[]>`, the caller's own tag-counts request
  under its conditions. Video and Reading use `AppRequests.tagCounts`; Clips uses its
  `requests.ts` with `ReadyNotesTarget.fileIds`;
- `conditionsKey`, a string that changes whenever the conditions change. A load started
  under another key is dropped;
- `excludeTags`, the Target's own `tag` conditions;
- `state`: `{ options, value, onChange }`, or `null` for no state menu;
- `onViewerRejected`, called when tag-counts answers `viewer_required`. The caller handles
  it as its Library requests do.

Tag names are compared folded with `toLowerCase()`, matching the backend's grouping, for
de-duplication, for the chosen-first list, and for `excludeTags`. The chosen tags are
listed in choice order.

**Tag menu details.**

- On a failed reload, the rows already drawn stay and Try again is shown under them.
- The search text is kept across toggles and cleared when the menu closes.
- The 指定なし row shows a check when no tag is chosen.

Checkable lines from the design:

- TagMenu: the filter button, then the menu. In the menu, top to bottom: the search field,
  指定なし (checked when none is chosen), a separator, then the rows. Each row has a
  check, the name, and the count at the right end. The chosen rows come first.
- Main: in Video, Reading and Clips, タグ then 状態, a gap, then 分類 and 並び順. All four
  are outlined buttons with icon, label and value.
- Phone, row 1: タグ and 状態, equal widths, 44px tall, a long value cut with an ellipsis.

**Reading.** `TagMenu` and `StateMenu` are replaced by `FilterMenus`:

- Their values and the requests they drive are unchanged.
- The tag candidates change from every tag of the drive to the tag-counts answer under
  the conditions in force.
- Their look changes from filled to outlined. The state icon changes from `BookMarked` to
  `CircleCheck`. The tag menu's タグ heading becomes the search field and the 指定なし row.
- They now survive a tab switch and a See all round trip, and reset on a Target choice.
  Today it is the other way round.

**Video.**

- The Library gains the tag menu and, with a profile, the state menu: すべて / All,
  未視聴 / Unwatched, 視聴中 / In Progress, 視聴済み / Watched.
- Every Library request (shelves of every grouping, the なし grid) and every See all link
  carries `tag` (repeated) and `watch=<state>` when set. These are the same parameters
  and the same boundary Reading uses.
- The See all page (`app/drive/[name]/apps/video/shelf/page.tsx`, `VideoShelfPage.tsx`)
  reads them from its URL and requests with them, as Reading's does. Without a profile, or
  with an unknown value, `watch` is left out of the request, and the URL is left as it
  is. Its title and back link are unchanged.
  Discover's See all links carry no filter.
- 分類 no longer offers 視聴状態. A stored `watch` view is not offered, so it falls through
  as SPEC-CORE-145's order says. The "watch without a profile shows Folder" exception
  goes with it.
- Discover's shelves are unchanged.
- **Progress bars.** Today the shelves route attaches `watch_progress` only for
  `by=watch`. It now attaches it for every `by` whenever the request has a viewer, so
  Video Library cards show their progress bar under any grouping and filter. This is in
  `shelves.py`, through the shared `watch_state.py`.
- Choosing a state without a profile is not possible. Clearing the profile clears the
  state, as in Reading.

**Clips (SPEC-ADDON-151).**

- The Library gains the tag menu and the state menu, drawn with or without a profile:
  すべて / All, 未確認 / Unverified (`trust=unverified`), 確認済み / Verified
  (`trust=verified`).
- Both live in the URL as `tag` (repeated) and `trust` (`unverified` | `verified`). A
  filter change replaces the URL and adds no history entry. Another `trust` value
  (`unreviewed` included) is removed by replace, on the Library and on shelf pages.
- Every Library request (Tag, Folder, Date Added, None) carries them. So does every
  `tag:`, `untagged`, `folder:` and `month:` shelf page, and the back link of such a page.
- Home's shelf kinds (`unread`, `recent`, `new`, `unverified`) ignore them. Links to them
  carry none, and their back link to Home drops them. Clips Home ignores them.
- A Target choice (as SPEC-CORE-145 defines it) drops them in the same single replace
  that carries the new Target's `group` and `sort`.
- These keep `tag` and `trust`:
  - the 分類 / 並び順 choice (a push);
  - the `group` / `sort` fill-in;
  - the rewrite of an unknown value, which drops only the unreadable parameter;
  - a shelf page's `sort` fill-in.
- The Home and Library tab links carry none, so going through a tab clears them. Reloading
  a filtered URL keeps them, because the URL carries them.

**Reset.** In all three apps, filters are not written to storage. Video and Reading
reset as the store above says. Clips' filters are the URL's: they last as long as
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
- **`watch` without a viewer at tag-counts** answers 400 `viewer_required`. The UI never
  sends it without a profile.
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

Not allowed:

- a state other than すべて without a profile (Video, Reading);
- a Clips `trust` outside `unverified` | `verified`;
- any filter surviving a Target choice or a drive change;
- choosing, from the menu, a tag that is not a candidate. A URL may still name one.

The tag menu itself is in one of these states:

- closed;
- loading, with a skeleton on the first load or the previous rows on a reload;
- loaded, with rows, with the search matching nothing, or with no tags;
- failed, with Try again.

Opening the menu, or a toggle inside it, enters loading. An answer moves it to loaded or
failed. Try again re-enters loading. Closing the menu drops any answer still out.

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
- a Library with no result while a tag is chosen or the state is not すべて shows an
  `EmptyState` with the `Search` icon, the title 条件に合う項目はありません / Nothing matches
  these filters, and no description. It replaces the app's usual empty state, Video's
  `no-files` variant included. A Target that is empty or unusable, and an empty drive,
  keep their own states, which take precedence. Clips' copy is in the knowledge addon's
  messages.

Nothing is logged beyond the existing request logging.

### 9. User-visible behavior

- Video and Clips Libraries show タグ and 状態 before 分類 and 並び順.
- Video's 分類 no longer lists 視聴状態.
- The tag menu lists only usable tags with counts and can be searched.
- Filters reset when the Target changes or the app is reopened.
- At 390px the four menus form a 2×2 grid.

### 10. Non-functional

- One tag-counts request per menu open and one per toggle while it is open. It reads the
  filtered files' tag links in one query and groups them in Python by folded name,
  counting distinct files. It is bounded by the drive's files.
- Search is client-side. Tens to low thousands of tags fit in the menu with its scroll.
- No change to request counts for the Library itself.

## Touch points

- `backend/app/routers/drives.py`: `tag-counts` GET and POST, beside `folder-counts`.
- `backend/tests/`: a tag-counts test against the files listing.
- `frontend/src/lib/api.ts`: `getTagCounts` (GET and POST).
- `frontend/src/components/appshell/FilterMenus.tsx` (new); `ViewMenus.tsx`'s
  `LibraryControlRow` for the grid layout; a filter store module beside them.
- `backend/app/services/watch_state.py` (new): the watch join and bucket, moved from
  `shelves.py`.
- `addons/knowledge/frontend/clipsapp/useTagShelves.ts`, `useShelfData.ts` and the
  folder/month shelves hook of SPEC-ADDON-147: their load scopes include `tag` and
  `trust`.
- `frontend/src/components/__tests__/toolbarMenuHome.test.ts`: updated in each PR for the
  files whose `ToolbarMenu` import it changes.
- Landing order, as in SPEC-CORE-145: a core PR, then the knowledge PR, then the core
  pointer bump with the core Clips e2e fixtures.
- `frontend/src/lib/memberTarget.ts`: `AppRequests` gains `tagCounts` (GET, or POST with
  member ids).
- `backend/app/routers/shelves.py`: the watch join, shared with tag-counts.
- `frontend/src/components/videoapp/VideoApp.tsx`, `readingapp/ReadingApp.tsx`.
- `frontend/src/app/drive/[name]/apps/video/shelf/page.tsx`,
  `videoapp/VideoShelfPage.tsx`.
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
    at 390, 1024, 1280 and 1440px.
- Docs: `docs/reference/api.md`, `docs/user-guide/{video,reading,notes}.md`,
  `docs/addons/knowledge.md`, `docs/ADDON-DEVELOPMENT.md` (the `FilterMenus` part for
  addon pages).
- No protected path. `drives.py` is not in a risk zone, and this change is read-only.

## Invariants

I1. For any parameters, every `tag-counts` entry's `count` equals the `count` of the shelves route's `by=all&key=all` answer for the same conditions plus `tag=<name>`, every tag group with such a count above 0 is listed once, no group with 0 is listed, and the list is ordered by count descending then name; `tag-counts/query` with ids X answers the same as `tag-counts` with a collection holding exactly X.
I2. `tag-counts` and `tag-counts/query` answer 404 for a locked or unknown drive and never count a file of another drive, whatever ids or collections the request names; `watch` without a viewer answers 400 `viewer_required`.
I3. Once the latest answer has arrived, the tag menu lists each chosen tag once and first, then exactly the answer's other tags minus the Target's own `tag` conditions, in its order; a search shows exactly the rows whose name contains the trimmed text, ignoring case; an answer for conditions no longer in force is never drawn.
I4. With tags T and state S chosen, every Library request, every See all / Library-origin shelf link, and the Video See all page's request in Video, Reading and Clips carries all of T and S, and every item shown carries every tag in T and matches S; Clips Home and its Home-origin shelf pages carry and apply neither.
I5. No filter value is written to localStorage or sessionStorage; in Video and Reading a full page load, opening the app on another drive, and a Target choice show no tag and state すべて, while a tab switch, a See all round trip, a file page round trip, re-choosing the Target in force, a fallback to `default` and a member re-evaluation keep them; in Clips the filters are exactly the URL's `tag` / `trust`, a filter change and a Target choice add no history entry, a Target choice and the tab links remove them, and the 分類 / 並び順 choice and every fill-in or rewrite keep them.
I6. Without a profile, Video draws no state menu and sends no `watch`, its See all page drops a `watch` in its URL, and clearing the profile sets the state to すべて.
I7. Video's 分類 never offers 視聴状態, and a stored `watch` view shows the next value in SPEC-CORE-145's order without sending `by=watch` from the Library; Discover's Continue shelf and its See all still use `by=watch`.
I8. In Video, Reading and Clips the Library control row is `LibraryControlRow` with the filter group, a 20px gap, then the view group from 640px up; below 640px two rows of two equal-width buttons, filters on row 1, a lone filter in the left half; at 1440, 1280, 1024 and 390px in ja and en nothing scrolls horizontally, measured in a real browser.
I9. A failing tag-counts request leaves the chosen tags and the Library's results unchanged.
I10. A Library with no result while a tag is chosen or the state is not すべて shows 条件に合う項目はありません / Nothing matches these filters as its empty-state title; with no filter set, each app's existing empty title is shown.
I12. Every tag-counts request the menu sends carries every condition in force: the Target's conditions (member ids through POST), Reading's chip, the state and the chosen tags; after a toggle the menu stays open and requests again.
I13. Whenever the request has a viewer, the shelves route attaches `watch_progress` for every `by`, so Video Library cards draw their progress under any grouping and filter.
I11. Clips' state menu offers すべて, 未確認 and 確認済み (en All, Unverified, Verified) and sends `trust=unverified` / `trust=verified`; a Clips URL with any other `trust` is replaced without it.

## Revises

SPEC-CORE-057 I10. The face and target are remembered per drive under separate keys, and the classification per Target under `litloft.videoApp.view.<drive>` (the old per-drive classification key read only for the default Target); a stored value that is unknown, stale, not offered (a stored `watch` included), or a smart folder id that is not in this drive's list falls back to the next value in SPEC-CORE-145's order without an error screen and is never sent to the backend.
SPEC-CORE-063 I16b. The folder chip is never stored; it resets to All on a fresh open and on a target change. The Library sort is stored per Target. The tag and state filters are never stored; they last while the page is open and reset on a full page load, a drive change and a Target choice.

SPEC-CORE-145 I15. Video offers フォルダ, タグ, 追加日, 長さ and なし, and Reading and Clips offer タグ, フォルダ, 追加日 and なし; at 390px, in Video, Reading and Clips, the two view menus are on one row and equal in width (within 1px), measured in a real browser by `e2e-layout` / `e2e-components`.
SPEC-CORE-145 I11. Once the Library body is drawn, the Clips URL names the `group` and `sort` shown and the Notes URL names the `sort` shown, so Back after a Clips menu choice or a Notes sort choice shows the previous value; a Clips `tag:`/`untagged`/`folder:`/`month:` shelf page's back link is `?view=all&group=<tags|folder|month>&sort=<the page's sort>` plus the page's `tag` and `trust`.
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
- **A single "表示" sheet on phones.** Rejected by the user in favour of the 2×2 grid. The
  artboard was dropped from the saved design.
- **A tag name spelled by another drive.** When none of the matching files' rows for a
  name belongs to this drive (a file moved before its tags followed it), the menu shows
  the other drive's spelling. This is rare, shows only a tag the file already carries, and
  matches what the listing's `tag` filter already does.
- **Renaming Clips' 未確認 / 確認済みにする.** Not done. The state menu uses those words.
- **A design for the tag menu at phone width.** None separate. `ToolbarMenu` already
  becomes a bottom sheet below `sm`, and the search field sits at its top.
