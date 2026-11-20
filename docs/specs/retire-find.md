# Retire Find

SPEC-ID: SPEC-ADDON-158

Approval: sha256:6d573d784d76bfa7dcbb50a78ce6a40c8b29f71b05bf7563b0bca5c4d10d6fb0 Yuichi Senga 2026-11-20

## Summary

The intelligence addon's **Find** mode is removed: the **Find** tab on the Ask page, the
`/drive/{drive}/addons/intelligence/find` page, the **Findページを開く** row in the
search page's `…` menu, and `POST /api/addons/intelligence/find`. Find took a question,
had the language model split it into a file kind, a viewing time, a viewed / not viewed
scope and a residual meaning query, and listed files. The search page already lists files
by name and by meaning, and narrows them by kind with `type:` and **＋ 条件**, so Find was
a second entrance to the same thing. What only Find offered is lost as a feature of its
own: narrowing by the viewer's history (reached instead through the Video app's status
filter, Home's Continue and Recently Viewed shelves, and Ask, which keeps applying the
viewing time and viewed scope), and turning a kind named in prose ("videos I…") into a
kind filter (reached instead through `type:` and **＋ 条件**; Ask only echoes that hint
and never applied it). The owner does not use Find and wants one way to search. Ask is
unchanged and stays in the sidebar. For the owner of the server, the one person who uses
it.

## Required items

### 1. Normal flow

There is no new flow. After the change:

1. The viewer opens Ask from the sidebar. The page header shows the title, icon and scope
   line as today, with no tab row under it. Asking works as today.
2. The viewer searches from `Cmd/Ctrl+K` or the search page. The results bar's `…` menu
   holds the Smart Folder actions, the `smart-collection-actions` entries (「ここに質問」)
   and **選択モード** as today, and no Find row.
3. A request for `/drive/{drive}/addons/intelligence/find` (an old bookmark) shows the
   app's not-found page, the same as any other unknown addon subpage.

### 2. Failure cases

- An old Find link: the core's addon subpage route
  (`frontend/src/app/drive/[name]/addons/[addon]/[slug]/page.tsx`) fails to import
  `pages/find` and renders not-found. Nothing else happens.
- A client that still posts to `/api/addons/intelligence/find`: the manifest no longer
  declares the route, so the core's `addon_proxy` answers 404 itself before reaching the
  addon. No client in the core, the addons, `mcp-server/` or `ios/` posts there after the
  change.

### 3. States

The Ask page loses one state: "Find tab selected". The Ask page itself has the states it
has today (idle, streaming, answered, error, scoped). The search page's `…` menu has the
states it has today minus the Find row's (probing, shown, absent).

Transitions removed:

- Ask → Find through the tab (carrying `?q=` and `?scope=`), and Find → Ask through the
  tab.
- Search page `…` → Find page (carrying `?q=`).

Transitions kept, unchanged:

- Sidebar → Ask.
- 「ここに質問」 on a folder, a collection or a Smart Collection → Ask with `?scope=`.
- Any link into Ask with `?q=` and / or `?scope=`: the page reads both on mount as today.

### 4. Data read and written

None. Find wrote nothing (it was stateless) and read through the same retriever Ask uses,
which stays. No table, file or cache changes.

### 5. External services

None added. Removing Find removes one caller of the language model (the decompose and
category-expand stages run from `POST /find`). Ask's calls to the same stages are
unchanged.

### 6. Authorization

None changes. Ask keeps `_require_rag_enabled(drive)`, the drive header requirement and
the shared Ask semaphore.

### 7. Effect on existing features

- **Ask**: `query_decomposer.py`, the retriever and `rag/service.py`'s Ask path are kept
  and behave as today. Ask applies the decomposition's time range and viewed scope to
  personal-history questions, and sends the whole decomposition (file-kind hint included)
  in its `query_decomposed` event; it never filtered by the file-kind hint and still does
  not.
- **Removed from `rag/service.py`**, exactly: `_FIND_DEFAULT_LIMIT`,
  `_FIND_NO_FILE_TYPE`, `_FIND_HINT_TO_KIND`, `_find_kind_for_hint`,
  `_build_decomposed_from_overrides`, `_decomposed_to_dict`, `_segment_to_hit`,
  `_build_result_item`, `_empty_find_response`, `_find_files`, `find_files`. Each is
  reached only from Find. **Kept**, because Ask calls them: `_rrf_merge_candidates`,
  `_category_expansion_weights`, `_resolve_category_expansion`, the retriever's
  `trust_tier=None` option, and `query_decomposer.py` with its `_FILE_TYPE_LABELS`.
  Docstrings that mention Find on kept code may lose the mention; no kept function's body
  changes.
- **Ask scope**: the scope chips stay on the Ask page. They no longer travel to Find,
  because there is no Find.
- **The core `search-modes` slot** stays as a generic extension point
  (`docs/ADDON-DEVELOPMENT.md`); with intelligence no longer registering anything in it,
  no installed addon fills it, and the `…` menu draws nothing for it (the slot draws no
  separator of its own). The core's `showFind` prop keeps its name.
- **In-file find** (`Cmd/Ctrl+F`, the inspector's 「検索」 tab, `GET /files/{id}/find`,
  `?find=`, and the core `messages-core` `find` namespace that labels it) is a different
  feature and is untouched.
- **MCP**: `mcp-server/` has no tool that calls Find; nothing changes there.
- **Tests**: tests that exercise only Find are deleted with it, because the behavior they
  check no longer exists. Tests that check Find alongside something that stays lose only
  the Find part. Each is listed under Touch points. This is the removal of a behavior the
  approved spec retires, not the loosening of a check on a behavior that remains.

### 8. Error behavior

None new. The not-found page and a 404 are the only things a stale Find link or request
can produce. Nothing is logged beyond the server's usual access log.

### 9. User-visible behavior

- The Ask page has no **Ask / Find** tab row. Title, icon, scope line, input, answer and
  scope chips are where they are today, moved up by the height of the removed row.
- The search page's `…` menu has no **Findページを開く** row, in Files and Passages, at
  every width.
- `/drive/{drive}/addons/intelligence/find` is not found.
- Documentation:
  - `docs/user-guide/search.md`: the section "Ask and Find (intelligence addon)" becomes
    "Ask (intelligence addon)" (anchor `#ask-intelligence-addon`) and loses its Find
    paragraph; the `…` bullet loses **Open Find page**; line 84's "See **Ask and Find**
    below" points to the renamed section; line 160 loses "The chips travel with you to
    **Find** and back, though Find itself is not narrowed."
  - `docs/addons/intelligence.md`: the feature table's `rag` row reads "No Ask"; the two
    `rag` comments read "Ask"; the Ask description at line 274 loses the Find sentence and
    links the renamed anchor; the UI surface line at 805 reads "**Ask** in the sidebar".
  - `docs/ADDON-DEVELOPMENT.md`: the `intelligence | search-modes | find-mode` row leaves
    "UI slots provided". The slot's own row in the slot table stays.

### 10. Non-functional

One less language-model caller. No size, time, concurrency or privacy limit changes.

## Touch points

Intelligence addon (`addons/intelligence`, its own repository):

- `manifest.json`: the `slots` key `search-modes` is removed entirely (not left as `[]`),
  and the `proxy.routes` entry for `POST /find` is removed. Every other slot and route is
  unchanged.
- `frontend/slots.ts`: the `find-mode` registration is removed.
- `frontend/FindModeSlot.tsx`, `frontend/FindChip.tsx`, `frontend/ModeTabs.tsx`,
  `frontend/pages/find.tsx`: deleted.
- `frontend/AskFindHeader.tsx`: draws the Ask header without `ModeTabs`. The `current`
  prop and its Find branches go; the scope, Smart Collection scope and member count are
  passed to `useScopeFileCount` exactly as the `current === "ask"` branch passes them
  today. The component may be renamed.
- `frontend/Page.tsx`: the call site of the header.
- `frontend/api.ts`: `findFiles` and the Find types are removed.
- `frontend/messages/en.json`, `frontend/messages/ja.json`: the top-level `modeTabs` and
  `find` blocks are removed (the addon's `find` holds only Find page keys: `pageHeading`
  … `chipPersonalNotViewed`). The core's `frontend/src/messages-core/*.json` `find`
  namespace is not touched.
- `app/routers/rag.py`: `POST /find` (`find_endpoint`) is removed.
- `app/rag/service.py`: the functions and constants item 7 lists, and only those.
- `app/schemas.py`: `FindRequest`, `FindResponse` and their helpers are removed.
- Tests deleted with the feature: `frontend/FindModeSlot.test.tsx`,
  `frontend/FindModeSlot.menuRow.test.tsx`, `frontend/findFiles.api.test.ts`,
  `frontend/FindChip.test.tsx`, `frontend/ModeTabs.test.tsx`,
  `frontend/ModeTabs.scope.test.tsx`, `frontend/pages/find.test.tsx`,
  `tests/test_find_router.py`, `tests/test_find_service.py`.
- Test functions deleted with the feature: `tests/test_rag_trust_filter.py`
  `test_find_keeps_unverified_files_visible`.
- Tests edited:
  - `tests/test_search_file_kind_filter.py`: `test_every_find_hint_names_a_kind_that_can_match`
    loses its `_find_kind_for_hint` assertions; its assertion on what `document` holds
    beyond `TEXT` stays, as a test of its own.
  - `frontend/Page.test.tsx`: "marks the current mode the way a set of links does" is
    replaced by a test that the page renders no mode row and no link to
    `/addons/intelligence/find` (I1); the describe block's mode-row wording goes.
  - `frontend/AskFindHeader.test.tsx`: loses its Find cases, keeps its Ask cases.
  - `frontend/Page.scope.test.tsx`: "reads ?scope= on mount, draws its chips and menu, and
    counts the scope" loses its loop over the mode-row links (they no longer exist); its
    chip, menu, count and listing-request assertions stay.
  - `tests/test_llm_routing_callers.py`, `tests/test_read_paths_skip_write_lock.py`,
    `tests/test_spec_addon_071_validation_body.py`: lose their `/find` rows or cases,
    keep their `/ask` ones.

Core (this repository):

- `addons/intelligence` gitlink: bumped to the merged addon commit.
- `frontend/src/__tests__/search-modes-entries.test.ts`: pins that the intelligence
  manifest registers `search-modes` with exactly `["find-mode"]`. Its subject is gone, so
  it is deleted (decision D1 below).
- `docs/user-guide/search.md`, `docs/addons/intelligence.md`, `docs/ADDON-DEVELOPMENT.md`:
  as item 9 states.
- `docs/specs/INDEX.md`: the SPEC-ADDON-158 row, and SPEC-ADDON-086 moved to `superseded`
  at approval (its whole behavior was the Find row this spec removes, and its only citing
  test, `FindModeSlot.menuRow.test.tsx`, is deleted here).
- No core frontend or backend production code changes. No protected path is edited.

## Invariants

I1. The Ask page, with a drive and without one, renders no mode row, no `role="tab"` and no
link to `/addons/intelligence/find`, and its header shows the same title and icon as
before; its scope line is held by SPEC-ADDON-054 I7 as revised below.
I2. With intelligence installed and enabled, the search page's `…` menu contains no Find
row, for a query with and without operators, in Files and in Passages; in Passages it
still holds the Smart Folder entries and the `smart-collection-actions` entries.
I3. `POST /api/addons/intelligence/find` through the core proxy answers 404, and no file
in `frontend/src`, `addons/*/frontend`, `mcp-server/src` or `ios/` other than tests'
mock hrefs refers to `/addons/intelligence/find` or `/api/addons/intelligence/find`.
I4. `/drive/{drive}/addons/intelligence/find` renders the not-found page.
I5. The intelligence manifest has no `search-modes` key and no `/find` proxy route, and
every other `slots` entry and `proxy.routes` entry is unchanged.
I6. In-file find (`GET /files/{id}/find`, the inspector's 「検索」 tab, `?find=`) returns
the same rows and shows the same labels as before this change.

`/ask`'s behavior is held by SPEC-ADDON-053 I12 as revised below, and is not restated
here.

Where the SPEC-ADDON-158 tests live: I1, I2's addon side, I3's grep, I5 and I6 in the
intelligence repository (I5 reads the addon's own `manifest.json`); I3's proxy 404 and I4
in core, because the proxy and the subpage route are core code. A core test reads the
addon's manifest through the checked-out submodule, as `search-modes-entries.test.ts`
does today.

## Decisions for the human

D1. **`frontend/src/__tests__/search-modes-entries.test.ts` is deleted.** Its subject,
intelligence's `find-mode` entry, no longer exists; I5's test in the addon checks the
manifest instead. Rewriting it to expect no entry would only confirm this change landed.

D2. **Merge order: a core PR that deletes that test merges first**, then the addon PR,
then the core PR with the pointer bump and the docs. The addon's CI runs core's whole
vitest suite against core `develop`, so with the test still on `develop` the addon PR is
red for a correct change. Deleting the test while `find-mode` still exists loses nothing
that matters, since nothing else reads it.

D3. **If a coverage floor fails only because tested code was removed**, it is lowered in
the same PR to the newly measured value, with the before and after measurements in the PR
body. The floors are the addon backend's `COV_FLOOR` (69.64) and core's
`frontend/vitest.config.ts` thresholds, which include the addon's link tree. Any drop that
is not explained by the deleted files is fixed, not absorbed.

## Revises

SPEC-CORE-066 I8. The `search-modes` slot renders only inside the open `…` menu, as its last row, and never for a query with operators (asserted with the menu open); an entry's `onSelect` navigates to the href it passes and closes the menu; a rejected probe leaves no entry and no pending state; in Passages the `…` menu holds only the Smart Folder entries, the `smart-collection-actions` entries and any `search-modes` entries at every width.
SPEC-CORE-040 I17. In Passages, sort, view mode, select, Play all, the Smart Collection 再生 and the Filter menu are hidden, while `sort` and `order` survive in the URL and apply again after switching back to Files; the `…` menu stays and offers only the Smart Folder entries, the `smart-collection-actions` entries and any `search-modes` entries; `search-results-top` and Show more by similarity are not rendered.
SPEC-ADDON-054 I7. The Ask page's scope line shows the listing's `meta.total` for a scope without a Smart Collection chip, the union of the members for a scope of Smart Collection chips only, and the drive alone for any other scope with a Smart Collection chip (and the drive alone while it loads or after it fails), and the `scope` event's count after a scoped answer; a `scope_unavailable` 503 or a Smart Collection scope that cannot be loaded shows 「範囲を読み込めませんでした」 and any other failure today's text; a note saved from a scoped answer has a `scope:` frontmatter line with the scope string and one from an unscoped answer has none.
SPEC-ADDON-053 I12. `/ask` returns the same responses for the same requests as before, except that a note saved through the Ask save is no longer cited while it is unverified; `player-side` tabs keep their order and their silence-means-available rule.
SPEC-ADDON-047 I11. Ask retrieval (`rag/retriever.py`, `rag/service.py`, through `file_id_scope`) returns the same results as before SPEC-ADDON-047 for every request without an Ask `scope`; a scoped Ask request uses `file_id_constraint` (SPEC-ADDON-054).
SPEC-ADDON-048 I25. Ask context (`rag/context.py`, `rag/retriever.py`) is the same as before SPEC-ADDON-048: `MatchInfo.chunk_index` never holds a transcript chunk index.
SPEC-CORE-096 I10. Transcript rows keep 14px, the core Find-in-file tab's match rows keep 13px, the Files view's match snippet keeps 11px, and the Ask page's citation excerpts keep 12px.

## Checked, no action

- **Rebuilding Find as "the model writes a search query"** (the model turns a question
  into `type:` / `tag:` / free text on the search page). Not now; the owner chose
  removal. It would also need viewing-history operators, which were rejected on
  2026-11-05 because a viewer-dependent result does not fit a shared Smart Collection or
  the listing cache; the owner confirmed that rejection stands and that the search
  operators are enough.
- **Losing natural-language kind narrowing.** Accepted with the above: `type:` and
  **＋ 条件** express it, and Ask never applied it.
- **Connecting Ask to the search box** (a "ask this" row in `Cmd/Ctrl+K`). Not now; how
  much Ask is used is not known yet. Ask stays reachable from the sidebar only.
- **Redirecting the old Find URL to Ask with `?q=`.** Not done. One user, no shared
  links; a not-found page is enough, and a redirect is a route kept for a removed
  feature.
- **Removing the core `search-modes` slot.** Kept: it is a documented generic extension
  point, the core never names the addon that fills it, and removing it would be an
  extension-point change under `docs/ADDON-DEVELOPMENT.md` for no gain. Renaming the
  core's `showFind` prop is left for a change that touches that code anyway.
- **Core tests with mock hrefs** that happen to read `/addons/intelligence/find`
  (`SearchPage.resultsBar.test.tsx`, `PageTabs.test.tsx`). They exercise generic contracts
  (SPEC-CORE-066 I8 as revised; `PageTabs`) with made-up data and are left as is.
- **`query_decomposer.py`** stays: Ask uses it (`rag/service.py`).
- **The retriever's `trust_tier=None` option** loses its only production caller. It stays,
  covered by `test_pool_widens_only_when_a_trust_filter_is_active`; removing it is not part
  of this change.
- **A design artifact.** None: nothing new is drawn; a tab row and a menu row disappear.
- **Review records under `docs/developer-guide/reviews/` and `docs/process/reviews/`**
  that mention Find are history and are not edited.
