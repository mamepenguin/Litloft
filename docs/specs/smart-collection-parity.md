# Play and Ask for Smart Collections

SPEC-ID: SPEC-CORE-109
SPEC-ID: SPEC-ADDON-110

Approval: sha256:f3789757ab846c452eeb935684b69af043377ebf08e73e5be809e58607ff7c57 Yuichi Senga 2026-11-15

## Summary

A Smart Collection (a saved search; table `smart_folders`) now sits with collections in
the sidebar, but two things a collection can do are missing for it: playing it as a
queue, and asking a question about only its files. This spec adds those two. A Smart
Collection's **members** are defined as what its search page lists in the Files view: the
core listing of its query over every page, merged with the intelligence addon's meaning
search when the page would run it, in the page's order. Only the browser computes that
today, so the computation becomes one shared function, used by Play and by Ask.

- **SPEC-CORE-109**: the shared evaluation, and Play on a Smart Collection's search page
  with a queue fixed when Play is pressed.
- **SPEC-ADDON-110**: "Ask here" from a Smart Collection, and Smart Collections in Ask's
  scope (a new core slot and a new `AskScope` field).

Not in this spec (later specs): MCP reading Smart Collections (it needs the evaluation
shared with the MCP server); Smart Collections in the search operator `in:` and the search
page's 「＋ 条件」 collection list; collections in apps' Target menus.

## Agreed design

Artifact: https://claude.ai/artifact/RkwrJX7t4uKCuYNbLrNx1b (version 6). Saved in
`docs/process/reviews/feature-smart-collection-parity/design/` (`canvas.json`,
`Main.dc.html`, `Phone.dc.html`, `Queue.dc.html`, `Ask.dc.html`). The artboards load
`./support.js`, the canvas runtime, which is not saved. The artboards use an
operator-only query, so the Files/Passages switch and the scene-search toggle, which the
bar shows for free-text queries, are not drawn; they stay as they are today.

Visible decisions:

- D1. `Main.dc.html` (1440px): on a Smart Collection's search page in the Files view,
  while Play's condition holds, 再生 (the folder page's Play button, Play icon) sits in
  the results bar after the count and before view, sort and `…`.
- D2. `Main.dc.html`: the `…` menu keeps today's saved block (保存済み: name, 上書き保存,
  名前変更, ホームに置く, 削除); below it, after a separator, **ここに質問**
  (MessageCircleQuestion icon), then 選択モード.
- D3. `Phone.dc.html` (375px): 再生 is the first row of the `…` sheet with a separator
  under it, as the folder page does today; ここに質問 sits after the saved block, before
  選択モード.
- D4. `Queue.dc.html`: the queue beside the player is today's collection queue panel with
  the Smart Collection's name as its title and today's 「n/N トラック」 count; no reorder
  or remove controls.
- D5. `Ask.dc.html`: from ここに質問 the Ask scope shows the chip 「コレクション <name>」;
  ＋ 範囲 → コレクション lists collections and Smart Collections together in name order,
  each with its sidebar icon (`Library`, `ListFilter`).

## Required items

### 1. Normal flow

**SPEC-CORE-109 (evaluation and Play).**

1. *Shared evaluation.* `evaluateSmartCollection(input, io)` in a new
   `frontend/src/lib/smartCollectionEval.ts`. `input`: drive, query, type (the URL
   `type`, or null), sort, order, `includeSceneClip`. `io` (injected for tests; the app
   passes the real functions): one listing page (`getDriveFiles`), the addon availability
   check, and meaning search (`fetchSemanticHits`). It returns `{ files, complete }` and
   throws on a listing failure.
   - It parses the query with `parseSearchQuery`, resolves kinds with `resolveKinds`, and
     builds the listing parameters exactly as `useFolderFiles.fetchPage` does (relevance
     sent as `created_at desc`). When the page would request nothing (impossible kinds or
     an impossible size/duration range), it returns `{ files: [], complete: true }`
     without any request.
   - It reads **every** listing page with `limit` 500 until a short page.
   - Meaning search runs when the page would run it (`meaningEligible`: non-empty free
     text, kinds and ranges possible) and the addon is available for the drive: one
     request with limit 1000, `passages: true`, and the query's `filter` when it has
     operators or `type` and `includeSceneClip` when it has none, exactly as
     `useFolderFiles.runMeaningSearch` sends it.
   - The availability check is a new function in `frontend/src/lib/addons.ts`,
     `getSemanticAvailability(drive)`, answering `available`, `off` (the status endpoint
     answered and does not list the addon for the drive) or `unknown` (the status request
     failed). It reuses a cached successful status answer but never a cached failure; it
     fetches again instead. `getAddonsStatus` and its other callers are unchanged.
     `unknown` gives `complete: false`; `off` means no meaning search and a complete
     result.
   - Meaning search answering 404 (the addon's `search` feature is off for the drive by
     policy) counts as `off`. Any other `ok: false` gives `complete: false`.
     `fetchSemanticHits` exposes the HTTP status for this; its other callers are
     unchanged.
   - It merges with `mergeResults` and orders with `sortMerged`, as the page does. Rows the
     page draws from unhydrated meaning-search hits are members too.
   - Not members: the image continuation rows that 「もっと見る」 reveals.
   - Under `sort = random` the listing is read with `created_at desc` and the merged list
     is shuffled once (Fisher–Yates) after merging.
   - The search page's own loading does not change; it may call shared parts.
2. *Play's condition.* On `/drive/{d}/search` with `smart_folder_id` naming a Smart
   Collection of the drive, while the page actually shows the Files view (`passagesView`
   false, whatever `show` says), while the trimmed `q` and the URL `type` equal the saved
   query and type (the comparison the overwrite button uses), and while the loaded results
   include a video or audio file, the bar shows 再生 at `md` and up (D1) and the `…` sheet
   shows it as its first row below `md` (D3), the folder page's arrangement.
3. *Pressing Play.* It evaluates with the page's current sort, order and scene-search
   value. While it evaluates the control is disabled, further presses do nothing, and a
   toast says 再生を準備しています… / Preparing playback… (it closes when the evaluation
   ends). If `q`, `type`, sort, order, the scene-search value, the view, the drive,
   `smart_folder_id`, or the Smart Collection's saved name, query or type changes before
   it finishes, or the page unmounts, the result is discarded and nothing opens. There is
   no limit on pages or time: the drive is the user's own, and 500 rows a page keeps even
   ten thousand files to twenty requests.
   - `complete` false: nothing opens; a toast says
     結果をすべて読み込めなかったため、再生できません。もう一度お試しください。 /
     Could not load all results, so playback did not start. Try again.
   - A listing failure: a toast says 再生を始められませんでした / Could not start
     playback.
   - No video or audio among the files: a toast says 再生できる動画や音声がありません /
     There is no video or audio to play.
   - Otherwise it keeps the video and audio files in order and stores the queue
     `{ name, files: [{ id, title, file_type, duration }] }` (`name` the Smart
     Collection's name) in the tab's memory and in `sessionStorage` under
     `smart-queue:<drive>:<smart_folder_id>`. If the storage write fails, the stale entry
     under that key is removed. Then it opens the first file at
     `/files/{id}?smart_collection=<smart_folder_id>`.
4. *The player.* `smart_collection` is a queue mode beside `collection` (with its alias
   `playlist`) and `folder_play`. Precedence when several are present: `collection` /
   `playlist`, then `smart_collection`, then `folder_play`; a navigation keeps only the
   winning mode's parameter. In this mode the canonical
   redirect is skipped, the full-screen player renders, `useFileNav` is off, every
   navigation (next, a click in the queue, gallery close) keeps the parameter, and the
   queue panel (D4) shows the queue titled with its stored `name`. No reorder or remove
   control is drawn. The player reads the in-memory queue first, then `sessionStorage`.
5. With a queue found, autoplay is on; ending a file opens the next entry; the loop toggle
   works as for a collection. The queue is fixed: nothing changes it until the next Play
   replaces it, whatever happens to the Smart Collection's members.
6. *No queue found* (a new tab, a link, storage cleared): the player looks the Smart
   Collection up by id in `GET /api/drives/{d}/smart-folders`, evaluates it once with its
   saved query and type, relevance, and scene search off, applies step 3's media filter,
   and stores the queue as in step 3. Meanwhile the file is shown without autoplay and the
   panel shows its frame with キューを読み込み中… / Loading the queue…. If the Smart
   Collection is gone, the evaluation fails or is incomplete, or it holds no video or
   audio, the panel shows キューを読み込めませんでした / Could not load the queue, and the
   file stays without autoplay. On success the panel shows the queue; the current file
   does not start by itself, and ending it opens the next entry with autoplay. The
   loading and failure texts are one line inside the queue panel's frame (D4's frame with
   no rows). A failure is kept in the tab's memory for that Smart Collection: later
   navigations in the player do not evaluate again; a reload or a new Play does.
7. A file opened with `smart_collection` that is not in the queue plays; the panel shows
   the queue with no current row, and nothing follows when it ends, as a collection does
   today.

**SPEC-ADDON-110 (Ask).**

1. A new core slot `smart-collection-actions` inside the search page's `…` menu, drawn
   while the page is a Smart Collection's and its query and type equal the saved ones, in
   both the Files and Passages views. Props:
   `{ drive, smartCollectionId, smartCollectionName, closeMenu }`.
   - Files: the saved block keeps its trailing separator; the slot's entries follow it
     directly, then 選択モード (D2). The slot adds no separator.
   - Passages: the saved block has no trailing separator today; when an addon registers
     an entry for the slot (`hasSlot`), a separator follows the saved block, then the
     slot's entries, then the `search-modes` entries. With no registered entry nothing is
     added.
2. The intelligence addon registers **ここに質問** there. It is not drawn for a name
   holding `"` or `＂`. It calls `closeMenu`, then opens
   `/drive/{d}/addons/intelligence?scope=` with `in:"<name>"`, the form a collection uses.
3. *Name resolution on the Ask page.* An `in:"<name>"` chip names a collection when the
   drive has a collection whose name equals it after `toLowerCase()`; otherwise it names a
   Smart Collection when the drive has one whose name equals it the same way; otherwise
   it is sent as a collection name, as today. Only a scope holding an `in:` chip needs
   resolution, and it needs both lists; for such a scope, while either list is loading,
   sending is disabled and the URL read on mount or `popstate` with `?q=` waits; if
   either fails to load, nothing is sent and the `scopeUnavailable` text
   (範囲を読み込めませんでした) shows. A scope with no `in:` chip, and no scope, behave as
   today without waiting.
4. Before every request that carries the scope (the Ask button, Enter, the retry, and the
   URL read on mount or `popstate` with `?q=`), the page evaluates each Smart Collection
   chip with `evaluateSmartCollection` (its saved query and type, relevance, scene search
   off) and sends the union of their file ids as `AskScope.file_ids`, in the order first
   seen. The Smart Collection's name is not sent in `collections`.
   - An evaluation that throws or is not `complete`: nothing is sent, the question stays
     in the field, and the `scopeUnavailable` text shows where a `scope_unavailable`
     answer shows it today.
   - More than 10,000 ids: nothing is sent, the question stays, and the place that shows
     Ask's errors today shows
     範囲が大きすぎます（1万件まで）。範囲を絞ってください。 / The scope is too large (up to
     10,000 files). Narrow it down.
   - While evaluating, the Ask button and Enter do nothing. A chip change during the
     evaluation discards it, as a chip change discards an open stream today.
   - Zero members: `file_ids: []` is sent.
5. Answers to a scope holding a Smart Collection chip are never read from or written to the
   Ask answer cache. They are kept for the tab in `sessionStorage`, keyed like the cache
   (question and scope string): the URL read on mount or `popstate` (returning from a
   citation, Back, Forward) restores such an answer without evaluating or asking again;
   the Ask button, Enter and the retry always evaluate and ask again. Scopes without a
   Smart Collection chip keep today's cache and keys.
6. *Server.* `AskScope.file_ids: list[str] | None`, absent by default; at most 10,000
   entries (more is 422). A scope is valid when any of the four lists is non-empty or
   `file_ids` is present (an empty list counts). The scope set S:
   - `A` = `POST /api/internal/files/matching` with the drive and the folder, tag and kind
     conditions (no collections);
   - when `collections` is non-empty, `B` = the same call with `collections` added;
   - S = `B ∪ (A ∩ file_ids)` when both are present, `B` without `file_ids`, and
     `A ∩ file_ids` without collections.
   - Any of these calls failing answers 503 `scope_unavailable`, as today.
   - The `scope` event is emitted first, exactly once, as today: its four keys hold the
     normalised lists as sent (no Smart Collection names), `matched_file_count` = len(S),
     and `done` carries `scope_empty: true` exactly when S is empty.
   - `file_ids` therefore counts only active files of the request's drive; the proxy's
     drive check is the access check, as for the other scope kinds.
7. ＋ 範囲 → コレクション on the Ask page lists collections and Smart Collections with
   their icons (D5). `ConditionMenu` gets this as an option; the search page's
   「＋ 条件」 does not set it and is unchanged. With the option, the list applies today's
   rules to both kinds as one list: names already chosen and names holding `"` or `＂`
   are left out, typed filter text keeps today's prefix-then-substring grouping, rows
   within a group are in `Intl.Collator(locale, { numeric: true })` order, and today's
   option limit applies to the whole list. A loading row shows while either list loads;
   if one list fails, the other's rows show with today's failure row under them. The
   10-chip cap on `in:` counts chips of both kinds, as it counts `in:` chips today.
8. *Scope line.* Before an answer, a scope whose collection chips are all Smart
   Collections and which has no other chip shows the size of the union of their members,
   from its own evaluation, started when the chip set changes and discarded when it
   changes again (the send evaluates anew); any other scope holding a Smart Collection
   chip shows the drive alone; scopes without one are unchanged. After an answer it shows
   the `scope` event's `matched_file_count`, as today.
9. Find keeps today's behavior: chips travel to Find and back; Find is not narrowed.

### 2. Failure cases

Covered per step above. In short: an incomplete or failed evaluation never opens a queue
and never sends an Ask question; the addon being off for the drive is not a failure (the
evaluation is complete with the listing only, as the page shows it); a failed availability
lookup is a failure. A queued file that is trashed or missing when its turn comes shows
today's player error.

### 3. States

**Play control**: hidden → shown → evaluating (disabled; presses ignored) → navigates, or
shown again with a toast; any change listed in step 3, or unmounting, discards the result.

**Queue**: absent → stored (Play, or step 6) → replaced (next Play). Never edited. When the
storage write fails it lives in the tab's memory and the stale stored entry is removed.

**Player in `smart_collection` mode**: queue found (autoplay) | loading (no autoplay,
loading line) → loaded (the current file not started; the next ones autoplay) or failed
(no autoplay, failure line). Any of these can show a file not in the queue (no current
row, nothing follows). Not allowed: found or loaded back to loading; failed to loaded
without a reload or a new Play; a second evaluation for the same Smart Collection while
one runs.

**Ask scope with an `in:` chip**: lists loading (send disabled, URL read waiting) →
idle → evaluating, only with a Smart Collection chip (send disabled) → sent, or blocked
with a message (lists failed, evaluation failed or incomplete, too large). A chip change
while evaluating discards that evaluation. Not allowed: a send, or a URL-read send, while
the lists load or an evaluation runs; a send of a Smart Collection's name in
`collections`.

### 4. Data read and written

- Read: `smart_folders` and `collections` through the existing list endpoints, the core
  listing, the addon status and search endpoints, `files/matching`.
- Written: the tab's memory and `sessionStorage` `smart-queue:<drive>:<id>`. No table,
  migration, endpoint or server-side state is added in the core.
- `AskScope` gains `file_ids`; the `scope` event payload keeps its four keys.

### 5. External services

None outside Litloft. The addon's search endpoint is called as the search page calls it
today.

### 6. Authorization

Unchanged. Reads go through the existing endpoints with the browser's cookies; a locked
drive answers 404 there. The Ask server keeps only `file_ids` that `files/matching`
returns for the request's drive (step 6), so ids of another drive read nothing.

### 7. Effect on existing features

- Collection Play, folder Play all, the collection queue: unchanged.
- Ask with folder / collection / tag / kind scope and no `file_ids`: unchanged, including
  validation, the cache and the `scope` event.
- `ConditionMenu` on the search page: unchanged.
- The search page's `…` menu gains the slot (see Revises for the Passages menu).
- New extension point `smart-collection-actions` (ADDON-DEVELOPMENT.md slot table).
- `fileDetailShell.ts`: the `collection` surface also covers `?smart_collection=`.
- The MCP `ask` tool forwards `scope.collections` unchanged, so a Smart Collection's name
  sent through MCP still matches no collection (Checked, no action).
- Apps' Target menus (Reading, Video, Photo Diary) keep resolving a Smart Collection to
  listing parameters only, so for a Smart Collection with free text the apps see fewer
  files than Play and Ask (name and path matches only, no meaning search). Accepted by
  the human for now; the later `in:` spec, which adds an id filter, aligns them.
- Folder Play all, which SPEC-ADDON-046 I12 covers, is unchanged; the Smart Collection
  再生 is a different control and plays members, which exclude continuation rows.
- A scope with an `in:` chip now waits for the collection and Smart Collection lists
  before it can be sent or restored.

### 8. Error behavior

Covered in 1 and 2. Nothing new is logged in the core.

### 9. User-visible behavior

D1-D5, the toasts and messages in 1, and docs: `docs/user-guide/search.md` (Play and
Ask here on a Smart Collection), `docs/addons/intelligence.md` (Ask scope),
`docs/ADDON-DEVELOPMENT.md` (the slot).

### 10. Non-functional

- An evaluation reads every listing page (500 per page) and at most one meaning-search
  request (1000 hits).
- `sessionStorage`: one queue per Smart Collection, about 100 bytes per entry.
- `file_ids` capped at 10,000 per Ask request, client and server.
- No limit on an evaluation's pages or time (see SPEC-CORE-109 step 3).
- Layout, measured in a real browser (`frontend/e2e-components/`, the search results bar
  cases) for an operator-only Smart Collection and a free-text one (with the Files /
  Passages switch and the scene-search label), each at 1440px, 768px and 375px: at 1440px
  and 768px the bar with 再生 added stays on one row within the content width; at 375px
  再生 is not in the bar and the bar holds the same controls as today; no horizontal
  scroll at any of them. The existing SPEC-CORE-066 layout cases are plain searches, show
  no 再生, and stay as they are.

## Touch points

- `frontend/src/lib/smartCollectionEval.ts` (new); `frontend/src/lib/searchQuery.ts`,
  `searchMerge.ts`, `semanticSearch.ts`, `addons.ts` (availability without the cached
  failure)
- `frontend/src/components/folder/useFolderFiles.ts` (behavior unchanged)
- `frontend/src/components/folder/FolderToolbar.tsx`, `frontend/src/components/FolderBrowser.tsx`,
  `frontend/src/components/SmartFolderSaveButton.tsx` (Play, the slot, the saved check)
- `frontend/src/app/files/[id]/page.tsx`, `frontend/src/components/FileDetailFullScreen.tsx`,
  `frontend/src/components/CollectionPanel.tsx`, `frontend/src/lib/fileDetailShell.ts`
- `frontend/src/components/search/ConditionMenu.tsx` (Smart Collection option)
- `frontend/src/messages-core/ja.json`, `en.json`
- `frontend/e2e-components/` (search results bar cases and their fixture)
- `addons/intelligence/manifest.json`, `addons/intelligence/frontend/` (the slot entry,
  `Page.tsx` name resolution, evaluation and cache, `AskFindHeader.tsx` scope line,
  `api.ts` `AskScopePayload`, messages), `addons/intelligence/app/schemas.py`
  (`AskScope.file_ids`), `addons/intelligence/app/routers/rag.py`,
  `addons/intelligence/app/file_matching.py`, tests in both
- `docs/user-guide/search.md`, `docs/addons/intelligence.md`, `docs/ADDON-DEVELOPMENT.md`
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary, no
  core-to-addon dependency, addon UI through slots), `.claude/rules/internal-api-policy.md`
  (no new Internal API endpoint; `files/matching` used as today),
  `.claude/rules/frontend-conventions.md`
- No protected path is edited. The intelligence submodule pointer moves (two-step merge).

## Invariants

I1. For the same drive, query, type, sort (other than random), order and scene-search
value, `evaluateSmartCollection` returns the same files in the same order as the search
page's Files view after every page has loaded (both with a successful addon status),
image continuation rows excluded, and for a fixed fixture equals that fixture's expected
list; meaning search failing (other than 404) or the availability lookup failing gives
`complete: false`, and a cached failed lookup is fetched again; the addon off for the
drive, or meaning search answering 404, gives a complete listing-only result; an
impossible query sends no request.

I2. Play shows only on a Smart Collection's search page whose shown view is Files, while
query and type equal the saved ones and the loaded results include video or audio; while
it evaluates further presses start nothing and the preparing toast shows, and any change
listed in SPEC-CORE-109 step 3 or unmounting discards the result.

I3. While a queue exists for a Smart Collection, it holds exactly the video and audio
files of the evaluation made when it was stored, in that evaluation's order (shuffled
once under random), and nothing changes it until the next Play; the player reads the
tab's memory before `sessionStorage`, and a failed storage write leaves no older entry
under the key.

I4. An incomplete or failed evaluation never opens a queue and never sends an Ask
request, and shows its message; an evaluation with no video or audio opens nothing and
shows its toast.

I5. `/files/{id}?smart_collection=<id>` renders the full-screen player without the
canonical redirect; ending a file opens the next entry, the parameter survives next, a
queue click and gallery close, and no reorder or remove control is drawn; `collection` /
`playlist` take precedence over it and it over `folder_play`, and a navigation keeps only
the winner's parameter; with no queue the file does not autoplay, the player evaluates
the saved query once with relevance, and a failure shows the failure line and is not
retried by later navigations; a file not in the queue shows no current row and nothing
follows it.

I6. The `smart-collection-actions` slot shows only while query and type equal the saved
ones, in Files and Passages, draws nothing and no separator without an entry; its
ここに質問 is absent for a name holding `"` or `＂` and opens the Ask page with the only
chip `in:"<name>"`.

I7. On the Ask page a chip name that matches a collection (case-insensitively) is sent in
`collections`; one that matches only a Smart Collection is sent as its evaluated
`file_ids` and never in `collections`; while either list loads nothing can be sent, and a
list failure blocks sending with the `scopeUnavailable` text.

I8. An Ask request carrying `file_ids` reads only files in S as defined in SPEC-ADDON-110
step 6, emits one `scope` event first with `matched_file_count` = len(S); `file_ids: []`
is an empty scope, not an absent one; more than 10,000 ids is refused by the client and
answered 422 by the server.

I9. Ask with no `file_ids` validates, resolves, caches and emits its `scope` event exactly
as before, a scope with an `in:` chip only waiting for the two lists; a scope holding a
Smart Collection chip is never served from or stored in the answer cache, is restored
from the tab's `sessionStorage` only by a URL read, and is asked again by the Ask button,
Enter and the retry.

I10. The search page's 「＋ 条件」 → コレクション lists collections only, in today's order;
the Ask page's lists both kinds in collator name order with their icons.

I11. In a real browser, for an operator-only and a free-text Smart Collection: at 1440px
and 768px the results bar with 再生 stays on one row within the content width; at 375px
再生 is not in the bar and is the first row of the `…` sheet; no horizontal scroll at
any of them.

I12. The search page's own loading is unchanged: the same requests, page size, merge and
continuation offer as before for every query, Smart Collection or not.

## Revises

SPEC-ADDON-054 I3. `/ask` answers FastAPI's list-shaped 422 for an unknown key at the top level or inside `scope` (`file_ids` is a known key), for a scope with no condition (`msg` "Value error, scope has no condition"; a present `file_ids`, even empty, is a condition), for more than 10,000 `file_ids`, and for every value the search `filter` validator rejects, and accepts every value it accepts with the same normalisation; a failed resolution answers 503 with `detail.code` `scope_unavailable` before any stream byte and before the Ask semaphore is taken, leaving its free count unchanged, while the concurrency 503 keeps its string `detail`.
SPEC-ADDON-054 I5. A scoped request emits exactly one `scope` event, first, carrying all four normalised keys and `matched_file_count` = len(S), with S including `file_ids` as SPEC-ADDON-110 step 6 defines; `done` carries `scope_empty: true` exactly when S is empty, and then only `citations: []` precedes it and no LLM is called, while a non-empty S that retrieves nothing (a `file_type` matching no in-scope file included) gives the existing empty-retrieval answer; no log line this change adds contains the question, a scope value or a file id.
SPEC-ADDON-054 I6. On the Ask page, the URL is read only on mount and on `popstate`, and a question is fired only by the Ask button, Enter, the retry, or such a read with `?q=` that misses the cache (for a scope holding a Smart Collection chip, the tab's `sessionStorage` stands in for the cache, and the read waits for the collection and Smart Collection lists); a chip or menu change aborts any open stream or scope evaluation, leaves no answer, source, citation, empty-scope message or error on screen, keeps the question text, and replaces the URL with the new `?scope=` and no `?q=`; the cache never restores an answer for a different scope, keeps the unscoped key unchanged, restores a scoped answer with its `matched_file_count` only for scopes without a Smart Collection chip, never stores an answer to a scope with one, and never stores a `scope_empty` outcome.
SPEC-ADDON-054 I7. The Ask page's scope line shows the listing's `meta.total` for a scope without a Smart Collection chip, the union of the members for a scope of Smart Collection chips only, and the drive alone for any other scope with a Smart Collection chip (and the drive alone while it loads or after it fails), and the `scope` event's count after a scoped answer; a `scope_unavailable` 503 or a Smart Collection scope that cannot be loaded shows 「範囲を読み込めませんでした」 and any other failure today's text; a note saved from a scoped answer has a `scope:` frontmatter line with the scope string and one from an unscoped answer has none; both `ModeTabs` links carry `?scope=` when the scope is non-empty, and the Find page sends no scope, draws no chips and shows the drive's count.
SPEC-CORE-040 I17. In Passages, sort, view mode, select, Play all, the Smart Collection 再生 and the Filter menu are hidden, while `sort` and `order` survive in the URL and apply again after switching back to Files; the `…` menu stays and offers only the Smart Folder entries, the `smart-collection-actions` entries and the Find entries; `search-results-top` and Show more by similarity are not rendered.
SPEC-CORE-066 I8. The `search-modes` slot renders only inside the open `…` menu, as its last row, and never for a query with operators (asserted with the menu open); the Find entry navigates to `/drive/{drive}/addons/intelligence/find?q=<trimmed q>` and closes the menu; a rejected probe leaves no Find entry and no pending state; in Passages the `…` menu holds only the Smart Folder entries, the `smart-collection-actions` entries and the Find entries at every width.

## Checked, no action

- MCP reading Smart Collections, and the MCP `ask` tool resolving a Smart Collection name:
  a later spec (agreed). It needs the evaluation shared with the separately built MCP
  server without loosening its coverage floors.
- `in:` and 「＋ 条件」 for Smart Collections: a later spec (agreed). It needs an id
  filter in the core listing and in meaning search; `evaluateSmartCollection` is its base.
- Evaluating on the server: the core cannot compute meaning search (no core-to-addon
  dependency), and leaving it out would make a Smart Collection's members silently fewer
  than its page shows.
- The Smart Collection's stored `sort_by` / `sort_order`: the frontend has never written or
  read them; the page's current sort decides, as agreed.
- Play on an edited query, on a plain search, or in the Passages view: agreed not to (the
  folder page hides Play in Passages too).
- Queue for images and documents: agreed video and audio only, as folder Play all.
- The trust filter as an evaluation input: the search page never applies one
  (`trustFilterAvailable` is false there).
- A get-by-id endpoint for Smart Collections: the list endpoint is enough at tens of rows;
  no backend change.
- A new Internal API endpoint: not needed; the Ask server intersects ids with
  `files/matching`, which already scopes to the drive (internal-api-policy R1-R5 not
  engaged).
- The image rows 「もっと見る」 reveals: a page affordance, not part of the saved search's
  answer.
- Caching Ask answers for Smart Collection scopes beyond the tab: members change, and a
  stale cached answer would silently cover a different set; the tab keeps them only for
  Back and returning from a citation (agreed).
- A new design for the evaluating toast and the queue panel's loading and failure lines:
  they reuse the existing toast and the panel's frame (agreed).
- The listing's tie order under `created_at desc` at page size 30 (the page) and 500 (the
  evaluator): both read the same ORDER BY; I1's test uses distinct `created_at` values,
  and a tie between equal timestamps is accepted as the page's own order.
- A pre-answer count for a Smart Collection chip mixed with other chips: it needs the
  other chips' ids, not their totals; the drive alone shows until the answer's count.
- iOS: it wraps the web UI and needs nothing.
- Meaning search's 1000-hit cap: the page has the same cap, so members match the page.
