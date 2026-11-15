# Smart Collections in `in:`, 「＋ 条件」 and the apps' Target

SPEC-ID: SPEC-CORE-115
SPEC-ID: SPEC-CORE-116
SPEC-ID: SPEC-CORE-117
SPEC-ID: SPEC-ADDON-115

Approval:

## Summary

A Smart Collection's **members** are what its search page lists in the Files view, meaning
search included (SPEC-CORE-109; computed by `evaluateSmartCollection`). Three places still
treat a Smart Collection as something else: the operator `in:` resolves only collections,
so `in:"<smart name>"` matches nothing; the search page's 「＋ 条件」 → コレクション lists
only collections; and the Video and Reading apps turn a Smart Collection target into listing
parameters, so a target with free text sees only name and path matches. This spec gives the
core listing, the shelves and the intelligence addon's meaning search a filter by file id,
sent in a POST body because a member set can hold thousands of ids, and uses it in those
three places. The user of all of it is the one person who runs Litloft.

- **SPEC-CORE-115**: the id filter in the core: `POST /api/drives/{drive}/files/query` and
  `POST /api/drives/{drive}/shelves/query`.
- **SPEC-ADDON-115**: the id filter in the intelligence addon's meaning search: `POST` on
  `/search` and `/search/images`.
- **SPEC-CORE-116**: `in:` naming a Smart Collection on the search page and in the search
  window, 「＋ 条件」 on the search page listing both kinds, and refusing to save a search
  whose `in:` names a Smart Collection.
- **SPEC-CORE-117**: Video and Reading resolve a Smart Collection target with free text to
  its members.

Not in this spec: Photo Diary's Target (its own repository and spec; it keeps using
`resolveAppTarget` unchanged); manual collections in the apps' Target menus (a separate
spec); the image-query page (`?img=`) resolving `in:` Smart Collection names; MCP
`search_files` / `semantic_search` resolving a Smart Collection name.

## Agreed design

No new artboard (agreed). The visible pieces reuse what exists:

- 「＋ 条件」 → コレクション on the search page takes the form the Ask page's ＋ 範囲 already
  has: SPEC-ADDON-110 D5,
  `docs/process/reviews/feature-smart-collection-parity/design/Ask.dc.html` (both kinds in
  one list, collator name order, `Library` / `ListFilter` icons).
- While an `in:` name is being resolved, the search page shows the loading state it shows
  before its first listing page arrives.
- A resolution that fails shows the block the Passages view shows when its load fails
  (`PassageList` state `failed`: one muted line and 再試行, `role="alert"`), in the Files
  view and the Passages view alike.
- In the apps, a failed member evaluation shows the existing `RetryButton` where the content
  goes, as a failed shelves load does today; a target too large shows today's
  `targetUnusable` text.
- The save refusal uses the existing error toast of the Smart Collection actions.

## Definitions

- **Resolving `in:` names** (search page and search window only). For one drive: a name
  names a collection when a collection's name equals it after `toLowerCase()`; otherwise it
  names a Smart Collection when one's name equals it the same way; otherwise it is sent as a
  collection name, as today (it matches nothing). This is SPEC-ADDON-110 step 3's rule.
  The collection list is needed whenever the query has an `in:` name; the Smart Collection
  list only when some name equals no collection.
- **Evaluating a Smart Collection** is `evaluateSmartCollection` with its saved query and
  type, relevance, scene search off, unchanged by this spec. Inside it `in:` names resolve
  to collections only, whatever the entry point (`in:`, Play, the player, Ask, MCP, the
  apps), so nothing is expanded more than one level and a cycle cannot form.
- **The member set** of a query on the search page or in the search window is the union of
  the members of every Smart Collection its `in:` names resolve to, in the order first
  seen. It holds at most 10,000 ids; more is the "too large" outcome.
- **`file_ids` semantics** (the same as `AskScope.file_ids`, SPEC-ADDON-110 step 6): a file
  passes the `in:` condition when it is in one of the named collections or its id is in
  `file_ids`. With no collection named, it passes when its id is in `file_ids`. Every other
  condition still applies to it. `file_ids: []` passes nothing through the `in:` condition;
  it is not an absent list.

## Required items

### 1. Normal flow

**SPEC-CORE-115 (core id filter).**

1. `POST /api/drives/{drive}/files/query` takes every query parameter `GET
   /api/drives/{drive}/files` takes, with the same validation and defaults, and a JSON body
   `{"file_ids": [string, ...]}`. It answers exactly what the GET answers for the same
   parameters with the `file_ids` semantics added.
2. `POST /api/drives/{drive}/shelves/query` does the same for `GET
   /api/drives/{drive}/shelves`, for every grouping, keyed or not. The GET's own `ids`
   parameter (at most 60) keeps its meaning and still narrows on top.
3. `file_ids`: required, at most 10,000 entries, no empty string. Duplicates are allowed and
   change nothing.
4. The GET endpoints, `POST /api/internal/files/matching` and every other caller of
   `filtered_drive_files` / `apply_file_filters` are unchanged: the new argument is optional
   and absent means today's query. Photo Diary calls `filtered_drive_files` and keeps
   working without change.

**SPEC-ADDON-115 (meaning search id filter).**

1. The intelligence `/search` and `/search/images` routes also accept `POST` with every query
   parameter their `GET` takes and a JSON body `{"file_ids": [string, ...]}` (required, at
   most 10,000, no empty string). `manifest.json` lists `POST` for both routes with the same
   `pre_check` (`addon_feature: search`), `response_filter` and timeout as the `GET`.
2. A `POST` requires `filter` (an `in:` name is an operator, so the frontend always has
   one); without it the answer is 422. The scope is S = `B ∪ (A ∩ file_ids)` when the
   filter names collections and `A ∩ file_ids` when it does not, where A is
   `files/matching` for the filter without collections and B is the same call with them.
   `scope_member_ids` in `app/file_matching.py` computes it, as Ask does.
3. An empty S answers the empty search response, as an empty filter scope does today. A
   `files/matching` failure answers 503 `Filter unavailable`, as today.
4. The `GET` routes are unchanged.

**SPEC-CORE-116 (`in:` and 「＋ 条件」).**

1. *Shared resolution.* A new function in `frontend/src/lib/` takes the drive, the parsed
   query, an abort signal and injected io (`getCollections`, `getSmartFolders`, and the io
   `evaluateSmartCollection` takes). It returns one of:
   - `{ collections, fileIds: null }` when no name resolves to a Smart Collection (no
     evaluation runs; `collections` are the query's names as today);
   - `{ collections, fileIds }`, `collections` the names that did not resolve to a Smart
     Collection in their order, `fileIds` the member set;
   - `failed`: a needed list did not load, or an evaluation threw or answered
     `complete: false`;
   - `tooLarge`: more than 10,000 ids.
   A query with no `in:` name returns at once without loading anything.
2. *Requests.* With `fileIds` null every request is what it is today. With `fileIds` set,
   the listing goes through `POST .../files/query` and meaning search (Files, Passages, and
   the image rows 「もっと見る」 reveals) through the intelligence `POST` routes, each with
   `collection` / the filter's `collections` set to `collections` and the body `file_ids`
   set to `fileIds`. Every listing page of one resolution sends the same set. A failure of
   these requests behaves as the same failure of today's request does.
3. *Search page* (`/drive/{d}/search`). The resolution runs when the drive, `q` or `type`
   changes, on 再試行, and on load; a sort, order, view or scene-search change reuses the
   result it has.
   - Resolving: no listing or meaning-search request goes out; the page shows the loading
     state it shows before its first listing page, and the results bar shows no count.
   - `failed`: no request goes out; the Files view and the Passages view show the failed
     block with コレクションを読み込めませんでした / Could not load the collection and
     再試行, which runs the resolution again (lists included).
   - `tooLarge`: the same block with 範囲が大きすぎます（1万件まで）。条件を絞ってください。 /
     The scope is too large (up to 10,000 files). Narrow it down. and no 再試行.
   - In `failed` and `tooLarge` the results bar shows no count; sort, view, the
     Files/Passages switch and `…` stay as they are; 再生 is not shown (no results are
     loaded).
   - A change of drive, `q` or `type` while resolving discards that resolution.
4. *Search window* (the search modal's results). It resolves the same way before its
   requests, and a change of its query discards a running resolution. Resolving shows its
   loading state; `failed` and `tooLarge` show the same text where it shows "no results"
   today, with no retry control.
5. *Search cache.* A query with an `in:` name is neither written to nor read from the
   search cache (by the window or the page); queries without one use it as today.
6. *「＋ 条件」.* On the search page, 「＋ 条件」 → コレクション sets the `ConditionMenu`
   option SPEC-ADDON-110 added: both kinds in one list with their icons, today's rules
   applied to the whole list (D5). Choosing a Smart Collection adds `in:"<name>"`, exactly
   as choosing a collection does. `SearchQueryHeader` receives this as a prop; the
   image-query page does not set it and is unchanged.
7. *Saving.* 保存 (create) and 上書き保存 (overwrite) of a Smart Collection, when the query
   to be saved has an `in:` name, first resolve the names against freshly loaded lists
   (no evaluation). While they load, the control is disabled and a second press does
   nothing. If a name resolves to a Smart Collection, nothing is written, the save dialog
   does not open (create) or no `PATCH` is sent (overwrite), and the error toast shows
   スマートコレクションを含む検索は保存できません / A search that includes a Smart Collection
   cannot be saved. If a needed list fails to load, nothing is written and today's
   `saveFailed` / `updateFailed` toast shows. A query with no `in:` name saves exactly as
   today. Renaming is unaffected.

**SPEC-CORE-117 (apps).**

1. A Smart Collection target of Video or Reading is a **member target** when its saved
   query has free text (`parseSearchQuery(query).text` non-empty). A negated token such as
   `-tag:x` is free text to `parseSearchQuery`, so such a Smart Collection is a member
   target, as its search page treats it. Any other Smart Collection target is resolved to
   listing parameters exactly as today (`resolveVideoTarget` / `resolveReadingTarget`,
   including their rules for unsupported parts).
2. For a member target, the kinds are `resolveKinds(saved type, parsed.types)` met with the
   app's base kinds, computed apart from the unsupported-part rules: kinds that do not meet
   the base kinds give today's empty target with no request and no evaluation.
3. Otherwise the app evaluates the Smart Collection when an app page mounts and when the
   target changes, and holds the member ids for that page's life. No list is needed: the
   evaluation resolves `in:` to collections only.
4. While it evaluates, the app is not ready: no request carrying the target goes out and
   the page shows what it shows today while a saved target is looked up.
5. Then every request the app makes under the target (the header count, Discover, Library,
   the shelf pages, the provider shelf page and the restriction of suggested videos) goes
   through the `POST` routes with `type` = the kinds of step 2 and `file_ids` = the member
   ids, and with no other target condition (`search`, `tag`, `folder`, `collection`,
   `size`, `duration`, `favorite`, `liked` are not sent).
6. The Discover cache is neither read nor written under a member target.
7. A member target is usable whatever else its query holds: the Target menu and Manage…
   never list it disabled. This is decided from the saved query alone, without a request.
8. The Target control keeps the Smart Collection's name in every state below; the app never
   falls back to its default target because an evaluation failed.

### 2. Failure cases

- Core POST: an invalid parameter answers as the GET does; a missing, non-list or empty-string
  `file_ids`, or more than 10,000, answers 422; a locked or unknown drive answers 404.
- Intelligence POST: as above, plus 422 without `filter`; `files/matching` failing answers
  503 `Filter unavailable`.
- Resolution (SPEC-CORE-116): a needed list failing, an evaluation throwing or incomplete
  (including the addon status lookup failing) is `failed`; more than 10,000 ids is
  `tooLarge`. Neither ever shows fewer files without saying so.
- The addon off for the drive, or its search answering 404, is not a failure: members are
  the listing alone, as SPEC-CORE-109 defines.
- Apps: an evaluation that throws or is incomplete leaves the app not ready with the
  `RetryButton` where its content goes; 再試行 evaluates again. More than 10,000 members
  shows `targetUnusable` (この対象は使えません) and sends nothing. The header count is not
  shown in either case.
- Save: covered in SPEC-CORE-116 step 7.

### 3. States

**Search page / window, query with an `in:` name**: lists loading → evaluating (only when a
name resolves to a Smart Collection) → resolved (requests go out) | failed | too large.
failed → resolving again on 再試行 (page only). A change of drive, `q` or `type` restarts
from the start and discards the running resolution. Not allowed: a listing or
meaning-search request before resolved; a request carrying a Smart Collection's name in
`collection` / `collections`; a search-cache read or write.

**App with a member target**: evaluating → ready (requests carry `file_ids`) | failed (retry
→ evaluating) | too large. A target change or page mount restarts at evaluating. Not
allowed: a request under the target before ready; a fall back to the default target from
failed or too large; a Discover cache read or write.

**Saving with an `in:` name**: loading lists (control disabled) → written | refused (toast)
| failed (toast).

### 4. Data read and written

- Read: `files`, `collections`, `collection_items`, `smart_folders` through the existing
  list endpoints and the new POST routes; the intelligence index through its search
  routes; `files/matching`.
- Written: `smart_folders` only through the existing create and update, now refused for a
  query naming a Smart Collection. No table, column or migration. No browser storage is
  added; resolutions and app member ids live in the page's memory.

### 5. External services

None outside Litloft. The intelligence routes are called through the addon proxy as today.

### 6. Authorization

Unchanged. The core POST routes run `_validate_drive` as the GET routes do and query only
`File.drive == drive`, so ids of another drive or a locked drive select nothing. The
intelligence POST routes keep `require_drive`, the proxy's drive check, `pre_check`
`addon_feature: search` and `current_drive_only`; S is a subset of `files/matching` for the
request's drive.

### 7. Effect on existing features

- `GET /files`, `GET /shelves`, intelligence `GET /search` and `/search/images`: unchanged.
- Queries with no `in:` name: unchanged everywhere (no list load, no wait, search cache as
  today).
- `in:` naming only collections: the same results, but the page and window now load the
  collection list first, and a failure to load it shows the failed block where today's
  query needed no list. Accepted: the list endpoint is the same drive's, on the LAN. These
  queries also stop using the search cache.
- `evaluateSmartCollection`, Play, the player's fallback, Ask (its own `in:` resolution,
  SPEC-ADDON-110 step 3, included), `/app-api/smart-collection-members` and MCP:
  unchanged. A saved query that names a Smart Collection in `in:` (saved before this change,
  or produced by a rename) evaluates as today, the name matching no collection, while its
  search page expands it; this is the one place the page and the members differ.
- Video / Reading with the default target or a target without free text: unchanged
  requests and usability.
- Reading and Video Smart Collections with free text that are refused today (a negated
  operator, a duration in Reading) become usable member targets.
- The image-query page's header: unchanged.
- Photo Diary: unchanged (`resolveAppTarget`, `filtered_drive_files`).
- The Internal API: no endpoint added or changed (`internal-api-policy.md` R1–R5 not
  engaged).

### 8. Error behavior

Covered in 1 and 2. Nothing new is logged in the core. The intelligence POST logs as its GET
does; no log line this change adds contains a query, a scope value or a file id.

### 9. User-visible behavior

- `in:"<smart name>"` on the search page and in the search window lists that Smart
  Collection's members under the other conditions.
- 「＋ 条件」 → コレクション on the search page lists Smart Collections with collections (D5).
- The messages in 1 (ja / en).
- Video and Reading show, for a Smart Collection with free text, the members its search page
  shows; such a Smart Collection is never disabled in the Target menu.
- Docs: `docs/user-guide/search.md` (`in:` names a Smart Collection; saving refused),
  `docs/user-guide/reading.md` and `docs/user-guide/video.md` (which Smart Collections can
  be targets), `docs/reference/api.md` (the two POST routes),
  `docs/addons/intelligence.md` (the POST search routes).

### 10. Non-functional

- `file_ids` at most 10,000 per request, client and server. 10,000 ids are about 150 KB of
  JSON; every listing page, shelf request and meaning-search request under the set re-sends
  them. The home LAN carries this.
- A resolution evaluates each named Smart Collection once (every listing page at 500 per
  page, and at most one meaning-search request each); `in:` holds at most 10 names, so at
  most 10 evaluations. No limit on time, as SPEC-CORE-109 step 3.
- Apps evaluate once per page mount and target change, not per request.
- 10,000 ids in one SQL `IN (...)` alongside `ids` and the collection subquery stays under
  SQLite's bound-parameter limit; tested at 10,000 against the Docker test image's SQLite.
- The Next rewrite and the addon proxy must pass a 150 KB request body; measured, not
  assumed, in the R-5 run.

## Touch points

- `backend/app/routers/drives.py` (`filtered_drive_files`, `apply_file_filters`, the
  `POST /files/query` route), `backend/app/routers/shelves.py` (`POST /shelves/query`),
  `backend/app/schemas.py` (the body model), `backend/tests/`
- `addons/intelligence/app/routers/search.py`, `addons/intelligence/app/file_matching.py`
  (`scope_member_ids` reused), `addons/intelligence/manifest.json`,
  `addons/intelligence/tests/`
- `frontend/src/lib/` (the new resolution module), `api.ts` (POST variants of
  `getDriveFiles` / `getShelves`), `listingRequest.ts`, `semanticSearch.ts`,
  `semanticSearchRequest.ts`, `searchCache.ts` callers, `videoAppTarget.ts`,
  `readingAppTarget.ts` (`appTarget.ts`, `smartCollectionEval.ts`,
  `smartCollectionServerIo.ts` unchanged)
- `frontend/src/components/folder/useFolderFiles.ts`, `frontend/src/components/FolderBrowser.tsx`,
  `frontend/src/components/search/PassageList.tsx`, `frontend/src/components/search/useFileSearch.ts`,
  `frontend/src/components/GlobalSearch.tsx`, `frontend/src/components/search/SearchQueryHeader.tsx`,
  `frontend/src/components/search/ConditionMenu.tsx` (option already present),
  `frontend/src/components/SmartFolderSaveButton.tsx`
- `frontend/src/components/videoapp/` (`useVideoApp.ts`, `useDiscover.ts`,
  `discoverCache.ts`, `restrict.ts`, `useProviderShelfPage.ts`, `LibraryFace.tsx`,
  `VideoShelfPage.tsx`, `VideoAppHeader.tsx`), `frontend/src/components/readingapp/`
  (`useReadingApp.ts`, `useDiscover.ts`, `LibraryFace.tsx`, `ReadingShelfPage.tsx`,
  `ReadingAppHeader.tsx`, `useFolderChips.ts`), `frontend/src/components/appshell/TargetMenu.tsx`,
  `ManageTargetsDialog.tsx`
- `frontend/src/messages-core/ja.json`, `en.json`
- `docs/user-guide/search.md`, `docs/user-guide/reading.md`, `docs/user-guide/video.md`,
  `docs/reference/api.md`, `docs/addons/intelligence.md`
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary, no
  core-to-addon dependency), `.claude/rules/internal-api-policy.md` (no Internal API
  change), `.claude/rules/backend-conventions.md`, `.claude/rules/frontend-conventions.md`
- No protected path is edited. The intelligence submodule pointer moves (two-step merge);
  the addon's frontend is not touched.

## Invariants

I1. `POST /files/query` and `POST /shelves/query` (every grouping, keyed or not, with `ids`
narrowing on top) answer, for any parameters and `file_ids`, exactly the GET's answer for
those parameters restricted by the `file_ids` semantics: with `collection` a file passes
`in:` when it is in a named collection or listed in `file_ids`, without it only when
listed, `file_ids: []` passes nothing through `in:`, and every other condition still
applies; a file of another drive, an inactive file and a locked drive's file are never
returned whatever `file_ids` holds; 10,000 ids are accepted, more or an empty string is 422.

I2. The GET listing, the GET shelves, `files/matching`, `filtered_drive_files` without
`file_ids`, and intelligence `GET /search` and `GET /search/images` answer exactly as
before for every request.

I3. Intelligence `POST /search` and `POST /search/images` return only files in S =
`B ∪ (A ∩ file_ids)` (`A ∩ file_ids` without collections); an empty S answers the empty
response; a POST without `filter` is 422 and a `files/matching` failure is 503; the
manifest gives both POST routes the GET's `pre_check` and `response_filter`, so a drive
with the search feature off answers 404 and no other drive's file is returned; no log line
the change adds contains a query, a scope value or a file id.

I4. On the search page and in the search window, an `in:` name that equals a collection
(case-insensitively) is sent in `collection` / `collections` and never evaluated; one that
equals only a Smart Collection is never sent as a name and contributes that Smart
Collection's members (evaluated with its own `in:` names as collections only) to
`file_ids`; every listing page and meaning-search request of one resolution carries the
same `file_ids`, and a sort, order, view or scene-search change does not resolve again.

I5. On the search page and in the search window, while an `in:` resolution runs, has failed
or is too large, no listing or meaning-search request goes out; failed and too large show
their message (the page with 再試行 only for failed), never a result list, an empty result
or a count; a change of drive, `q` or `type` discards a running resolution; a query with an
`in:` name is never read from or written to the search cache.

I6. A query with no `in:` name loads no list, waits for nothing and sends exactly today's
requests on the search page and in the search window, and `evaluateSmartCollection`
sends exactly today's requests for every query.

I7. Creating or overwriting a Smart Collection whose query has an `in:` name resolving to a
Smart Collection writes nothing and shows the refusal toast; a needed list that fails to
load writes nothing and shows today's failure toast; while the lists load a second press
sends nothing; a query without an `in:` name saves exactly as today.

I8. In Video and Reading, a member target sends no request under the target before its
evaluation succeeds; every request after it carries `file_ids` = the evaluated members and
`type` within the app's base kinds and no other target condition, and no Discover cache
entry is read or written; a failed evaluation shows the retry control and a set over
10,000 shows `targetUnusable`, and neither falls back to the default target; a Smart
Collection without free text produces exactly today's requests and usability.

I9. In the Target menu and Manage… of Video and Reading, a Smart Collection with free text
is never disabled, whatever else its query holds.

I10. 「＋ 条件」 → コレクション on the search page lists collections and Smart Collections in
one list in collator name order with their icons, and choosing either adds `in:"<name>"`;
on the image-query page it lists collections only, as today.

## Revises

SPEC-CORE-109 I1. For the same drive, query, type, sort (other than random), order and scene-search value, `evaluateSmartCollection` returns the same files in the same order as the search page's Files view after every page has loaded (both with a successful addon status), image continuation rows excluded, and for a fixed fixture equals that fixture's expected list, except for a query with an `in:` name that resolves only to a Smart Collection, which the page expands (SPEC-CORE-116) and the evaluation sends as a collection name; meaning search failing (other than 404) or the availability lookup failing gives `complete: false`, and a cached failed lookup is fetched again; the addon off for the drive, or meaning search answering 404, gives a complete listing-only result; an impossible query sends no request.
SPEC-CORE-109 I10. The search page's 「＋ 条件」 → コレクション and the Ask page's ＋ 範囲 → コレクション list collections and Smart Collections in one list in collator name order with their icons; the image-query page's lists collections only, in today's order.
SPEC-CORE-109 I12. The search page's own loading is unchanged for every query with no `in:` name: the same requests, page size, merge, search cache and continuation offer as before; a query with an `in:` name waits for its resolution, skips the search cache, and sends `file_ids` through the POST routes when a name resolves to a Smart Collection.
SPEC-CORE-103 I3. Pressing the button or the enabled menu row, for a query with no `in:` name, sends exactly one `PATCH /api/drives/{drive}/smart-folders/{id}` for the page's drive and that id, whose body is `{query: <trimmed URL q>, file_type: <URL type or null>}` as they were at the press and nothing else, without opening a dialog; for a query with an `in:` name it first loads the needed lists and sends that one `PATCH` only when no name resolves to a Smart Collection; while the lists load or the request is in flight the button and the row are disabled and a second press sends nothing.
SPEC-CORE-044 I10. `SearchQueryHeader` offers the same entries in the same order, with the same exclusions and submit, as before `ConditionMenu` was extracted, except that on the search page its 「コレクション」 lists collections and Smart Collections together (SPEC-CORE-116 step 6); the Ask page's menu offers 「フォルダ」, 「コレクション」, 「タグ」, 「種類」 and never 「お気に入り」, and a choice there sends no request to `/ask`; the collection page with no `collection-actions` entry renders the same DOM as before.
SPEC-CORE-054 I6. The `type` sent by the video app is always a subset of {video}; a target whose kinds do not intersect video produces no request and an empty state, so a smart folder can never make the app list a file that is not a video; a target with free text is a member target (SPEC-CORE-117) and is always usable, and any other target with a query part the app does not support cannot be chosen.
SPEC-CORE-099 I6. `resolveReadingTarget` returns the same result as before for every folder without free text, so the Reading app requests and lists the same books for those; a folder with free text is a member target that lists its evaluated members of the base kinds and is always usable.

## Checked, no action

- Server-side evaluation: the core cannot compute meaning search (no core-to-addon
  dependency); the browser and `/app-api` evaluate, as SPEC-CORE-109 and SPEC-CORE-111 do.
- A short-lived id set on the server referenced by a token (agreed not to): it needs a
  lifetime, recovery after a restart, and an Internal API endpoint for the addon to read it.
- Intersecting on the client: it cannot serve the shelves (grouped on the server), and
  meaning search's top 1000 taken before narrowing silently drops low-ranked members.
- GET with ids in the query string: Node's default header limit (16 KB) holds about 1,200
  ids.
- Adding `file_ids` to `POST /api/internal/files/matching`: not needed; intelligence
  intersects, as Ask does (`internal.py` is a HIGH zone and R1–R5 would apply).
- Expanding a Smart Collection named in another Smart Collection's saved query (agreed not
  to, at every entry point): saving such a query is refused, so it remains only from before
  this change or by a rename; legacy saved queries are not migrated.
- Ask's `in:` chips: Ask already resolves Smart Collection chips (SPEC-ADDON-110) and
  evaluates them as Smart Collections; nothing changes there.
- 「＋ 条件」 in the search window: the window has none, and adding one needs a design
  (agreed not to). `in:` typed in the window resolves.
- The image-query page (`?img=`): it does not resolve Smart Collection names, so its
  「＋ 条件」 keeps listing collections only (agreed).
- The search cache for `in:` queries: skipping it costs the window-to-page handoff for
  those queries only; caching a resolution would need the member set in the cache.
- Apps re-evaluate on each page mount (correctness over speed, agreed); no cache across
  mounts, the Discover cache included.
- Operator-only Smart Collection targets keep the listing parameters: they equal the
  members exactly (no meaning search runs), without the 10,000 cap. A saved `in:` name in
  them resolves to collections, as the evaluation does.
- Photo Diary's Target and manual collections in Target menus: separate specs (agreed).
- MCP `search_files` / `semantic_search` with an `in:` Smart Collection name: not in scope;
  `ask` already resolves Smart Collections (SPEC-CORE-112).
- The Find page: it does not narrow by `in:` today and keeps that.
- The scene shelf and scene search: hidden for queries with operators today, and `in:` is
  an operator.
- A new design: agreed to reuse D5 and the existing loading, failure, retry and toast parts.
- iOS: it wraps the web UI and needs nothing.
- `reading-app.md` I12b ("a smart folder with a query part the app does not support cannot
  be chosen") changes for member targets, which can always be chosen (SPEC-CORE-117 step
  7). Its id is not of the `I<N>` form `review.sh` reads under `## Revises`, so it is not
  listed there; the narrowed rule is SPEC-CORE-099 I6 as revised above, with I9.
