# Ask within a folder, a collection, or tags and kinds

SPEC-ID: SPEC-ADDON-054
SPEC-ID: SPEC-ADDON-064
SPEC-ID: SPEC-CORE-044
SPEC-ID: SPEC-CORE-045

Approval:

## Summary

Ask answers from the whole drive. A viewer who has gathered the material for a question,
in a folder, in a collection, or under a tag, cannot ask that material alone: the drive's
other files compete for the five sources an answer reads, and the retriever's only
allow-list (`file_id_scope`) is a post-filter, so a small set in a large drive is often
answered with nothing. This change lets an Ask question carry a *scope*: a folder and
everything under it, a collection, tags and kinds, combined with AND. A scoped Ask
behaves as Ask over a drive that holds only the in-scope files.

- **SPEC-ADDON-054** (intelligence, backend): `POST /ask` accepts `scope`, resolves it
  through the core into file ids, and makes every retrieval stage, the agentic loop
  included, rank and cite only within them. A `scope` event reports what was resolved;
  an empty scope answers "no files" and never an unscoped answer.
- **SPEC-ADDON-064** (intelligence, frontend): the Ask page shows the scope as removable
  chips and a 「＋ 範囲」 menu; a 「ここに質問」 row in the folder `…` menu and a
  「ここに質問」 button on the collection page open Ask with that scope.
- **SPEC-CORE-044** (core, frontend): a `collection-actions` slot on the collection
  page, and the search page's chip row and 「＋ 条件」 value lists exported as components
  the Ask page can draw.
- **SPEC-CORE-045** (core, `mcp-server/`): the MCP `ask` tool gains the same `scope`.

The scope has the shape of the search `filter` (SPEC-CORE-039 / SPEC-ADDON-047) as
SPEC-CORE-043 / SPEC-ADDON-063 extend it: `folders`, `collections` (by name), `tags`,
`kinds`. It is resolved by the one Internal API call that already resolves that filter,
`POST /api/internal/files/matching`, so a scope and a search filter with the same values
name the same files. **This change depends on SPEC-CORE-043 and SPEC-ADDON-063 being
merged first** (the `folders` and `collections` keys, `path:` / `in:` tokens, the
quoting writer and the folder and collection value lists).

The human decided on 2026-11-05: the three scope kinds (folder subtree, collection, tags
and kinds as in the A2 filter), AND between kinds; the entry points 「ここに質問」 on
folder and collection pages, chips on the Ask page with the ability to add scope there,
and the same parameter on the MCP `ask` tool.

Decisions recommended here that are the human's to confirm before approval (each is
written into the spec as recommended; the alternative is in Checked, no action):

- **H1.** A collection is named by its name (the `in:` semantics of SPEC-CORE-043), not
  by id through `GET /api/internal/collections/{id}/file-ids`.
- **H2.** That id endpoint (Internal API row 14, SPEC-ADDON-058) is left in place with no
  caller, and its removal is a separate change.
- **H3.** On the collection page 「ここに質問」 is an inline button beside 再生, through a
  new `collection-actions` slot, not a row in the `…` menu.
- **H4.** A personal-history question inside a scope narrows to history ∩ scope; when that
  is empty and `fallback_when_empty` is `graceful`, it falls back to the scope, never to
  the drive.
- **H5.** The scope applies to Ask only; the Find tab is not scoped and shows no chips.

## Required items

### 1. Normal flow

Terms. *Scope*: an object with any of `folders`, `collections`, `tags`, `kinds`, each a
list. *Resolved set* S: the ids `POST /api/internal/files/matching` returns for the
request drive and the scope. *Effective set* E: S, or S ∩ H when personal history
applies (see personal history below). *Scoped request*: an `/ask` request whose body has `scope`.

SPEC-ADDON-054, request and resolution:

1. `AskRequest` gains `scope: AskScope | None = None` and forbids unknown keys (422).
   `AskScope` has `folders`, `collections`, `tags`, `kinds`, each defaulting to `[]`,
   forbids unknown keys (`favorite` and `liked` included), and normalises, deduplicates
   and caps each list exactly as SPEC-ADDON-063 step 2 and SPEC-ADDON-047 state for the
   search `filter` (the same validator code, not a copy). A scope with all four lists
   empty after normalisation is rejected (422 `"scope has no condition"`).
2. After the existing checks (`rag` enabled, query length, drive mismatch) and before the
   concurrency slot is taken, the route resolves the scope with
   `fetch_matching_file_ids(drive, filter)` where `filter` holds the scope's four lists
   and no `favorite` / `liked`. The drive is `X-Lit-Drive`, as for every Ask request.
3. A resolution failure (`FilterUnavailable`) answers HTTP 503
   `{"detail": "Scope unavailable"}` and opens no stream.
4. A scoped request's stream begins with one `scope` event:
   `{"scope": {<the normalised four lists>}, "matched_file_count": len(S)}`. It is the
   first event, before `query_decomposed`, `keywords` and any agentic event. An
   unscoped request emits no `scope` event, and its event sequence is unchanged.
5. When S is empty, the stream after `scope` is `citations` with `[]` and `done` with
   `{"retrieved_count": 0, "scope_empty": true, "took_ms": n}`. No LLM is called (no
   keyword transform, no decomposition, no answer).

SPEC-ADDON-054, retrieval (legacy and hierarchical paths):

1. Every call into `app.search.search()` for a scoped request passes E as
   `file_id_constraint`, so each channel ranks only within E (SPEC-ADDON-047 I3), with
   `mode="recall"` and every other argument as for an unscoped request. This covers the
   plain retrieval, each clue retrieval, each category-expansion term, the bypass
   retrievals and the required-term fallback ladder. `retrieve_with_keywords` gains a
   keyword-only `file_id_constraint`; it passes it to `search()` only when it is not
   `None`, so an unscoped call sends exactly the keyword set it sends today.
2. The hierarchical shortlist treats E as the corpus:
   - `coarse_retrieve` ranks summary embeddings of files in E only (the scoped KNN of
     SPEC-ADDON-047, `_scoped_vector_rows`), not the drive's top `coarse_top_k` projected
     onto E;
   - the small-corpus bypass compares the number of indexed active files in E with
     `min_drive_files_for_shortlist`, and the `shortlist` event's `drive_file_count`
     carries that number;
   - the exact-match addition counts, for each token, the files *in E* that hold it,
     against `exact_match_max_files`, and adds only files in E.
3. Sources, the access filter (`filter-file-ids` and the drive check), the
   anti-hallucination citation filter and the answer prompt are unchanged; because every
   candidate is in E, every source and citation is.

SPEC-ADDON-054, personal history:

1. Stage A (`decompose_query`) and Stage B (`fetch_viewer_history`) run as today. When
   they yield history ids H and the request is scoped, E = S ∩ H, and the
   `history_filter` event's `matched_file_count` is `len(E)`.
2. When S ∩ H is empty: with `fallback_when_empty: "strict"` the stream short-circuits
   as today's strict path (no answer); with `"graceful"` E = S and no `history_filter`
   event is emitted, as for today's graceful empty history. A scoped request never
   falls back to the drive.
3. Without a personal signal, E = S.

SPEC-ADDON-054, agentic branch:

1. The agentic loop runs no personal history today, so its E is S. `_stream_agentic`
   and `_maybe_run_agentic` receive it, and `ToolContext` gains
   `file_id_constraint: frozenset[str] | None`.
2. `search_files` passes it to `retrieve_with_keywords` as `file_id_constraint`.
3. `get_file_chunks`, `get_file_detail` and `get_related_files` treat a `file_id` outside
   E as they treat an inaccessible one (the same envelope, no Internal API call for it).
   `get_related_files` drops related files outside E from its payload.
4. `register_file_ids` drops ids outside E, so `is_allowed_citation` is false for every
   file outside E and the citation-strict verifier rejects such a citation.
5. The `scope` event precedes the agentic `keywords` event; an empty S answers as in
   resolution step 5 without entering the loop.

SPEC-ADDON-064, the Ask page:

1. The page keeps its scope as a *scope string*: operator tokens only, in the syntax of
   `frontend/src/lib/searchQuery.ts` after SPEC-CORE-043 (`path:`, `in:`, `tag:`,
   `type:`). The URL carries it as `?scope=<string>` beside `?q=`. On load, tokens that
   parse as text, and `is:` tokens, are dropped; what remains is the scope.
2. The request body's `scope` is `filterFromParsed(parseSearchQuery(scopeString))`
   restricted to the four keys; a scope string with no operator sends no `scope`.
3. Under the header, the page draws the scope string's chips with the core
   `SearchFilterChips` (CORE-044) and, after them, a 「＋ 範囲」 / "+ Scope" button that
   opens the core condition menu with the entries 「フォルダ」, 「コレクション」, 「タグ」,
   「種類」 in that order (no 「お気に入り」). A choice appends one token to the scope
   string through the quoting writer; a ✕ removes the chip's tokens. Neither submits a
   question.
4. Any change of the scope string, by a chip, the menu or navigation, aborts a streaming
   answer, clears the shown answer and its sources, keeps the question in the input,
   and rewrites `?scope=` with `history.replaceState`.
5. The header's scope line is the drive and the scope's file count:
   `GET /api/drives/{drive}/files` with the scope's `folder`, `collection`, `tag` and
   `type` parameters (SPEC-CORE-043) and `limit=1`, read from `meta.total`. Unscoped,
   the line is today's drive count. A count that is loading or failed shows the drive
   alone. After a scoped answer, the `scope` event's `matched_file_count` replaces it.
6. The session cache key is `drive:question` for an unscoped question, as today, and
   `drive:` + the JSON of the normalised scope (keys in the fixed order folders,
   collections, tags, kinds) + `:` + question for a scoped one.
7. `?q=` with `?scope=` auto-fires a scoped question, as `?q=` alone does today.
8. The Find tab link (`ModeTabs`) carries `q` only; the Find page draws no chips.

SPEC-ADDON-064, entry points:

1. **Folder.** The intelligence entry in `folder-bulk-actions-menu` draws a first row
   「ここに質問」 / "Ask here" (lucide `MessageCircleQuestion`) when `path` is not empty.
   Pressing it closes the menu and navigates (`router.push`) to
   `/drive/{drive}/addons/intelligence?scope=<path:token>`, the token written by the
   quoting writer. At the drive root (`path` empty) the row is not drawn.
2. **Collection.** A new intelligence entry in `collection-actions` (CORE-044) draws a
   secondary button 「ここに質問」 / "Ask here" with the same icon, navigating to
   `?scope=<in:token>` for the collection's name.
3. Neither entry sends a question; the Ask page opens with the chip shown and the input
   focused.

SPEC-CORE-044:

1. `CollectionDetail`'s header `actions` draws `<AddonSlot id="collection-actions"
   layout="inline">` between 再生 and `…`, with props
   `{ drive, collectionId, collectionName }`. With no entry it draws nothing.
2. `SearchFilterChips` already takes a query string and an `onRemove`; it is used as is.
   The 「＋ 条件」 menu of `SearchQueryHeader`, with its value lists as SPEC-CORE-043
   leaves them, is moved into an exported `ConditionMenu` component taking
   `{ drive, query, entries, onAppend, label }`, where `entries` is an ordered subset of
   `tag`, `kind`, `folder`, `collection`, `favorite`. `SearchQueryHeader` draws it with
   today's entries, order and label, and behaves exactly as before.

SPEC-CORE-045:

1. The MCP `ask` tool's input schema gains an optional
   `scope: { folders?: string[], collections?: string[], tags?: string[],
   kinds?: (enum of the core kinds)[] }`, forwarded in the body unchanged.
2. When `scope` was sent, the tool requires a `scope` event in the stream. Without one
   it returns `isError` with "This Litloft server does not support Ask scope". With one,
   the result gains `scope` (the event's data). When `done` has `scope_empty: true`, the
   result's `answer` is empty and `scope.matched_file_count` is 0; it is not an error.
3. The tool description gains: "Pass scope to answer only from files in those folders
   (and below), collections (by name), tags and kinds of the drive; conditions combine
   with AND. An empty scope answers with no answer and matched_file_count 0."

### 2. Failure cases

- Invalid scope (unknown key, over a cap, malformed folder, unknown kind, no condition):
  422 before the stream. The Ask page never sends one: its scope comes from the parser,
  which turns such values into text (SPEC-CORE-043 step 8) and drops them (page step 1).
- The core does not answer `/files/matching`: 503 `Scope unavailable`, no stream, no
  fallback to an unscoped answer.
- A folder, collection name or tag that matches nothing, a collection renamed after the
  link was made, or a scope whose files are all trashed: S is empty, the "no files"
  answer.
- S is not empty but none of its files is indexed, or none passes the access filter:
  retrieval returns nothing, and the existing empty-retrieval answer follows the
  `scope` event.
- The scope count request on the Ask page fails: the scope line shows the drive alone.
- Version skew. An intelligence without this change ignores `scope` (its `AskRequest`
  does not forbid unknown keys) and would answer from the whole drive. The core PR pins
  the addon commit carrying SPEC-ADDON-054, so a normal update never pairs them. The
  MCP server is installed separately and can face an older server: SPEC-CORE-045 step 2
  turns the missing `scope` event into an error rather than an unscoped answer. From
  this change on, `AskRequest` forbids unknown keys, so a later field fails closed.
- A file moves out of the scope (or is trashed) between resolution and the answer: the
  answer may cite it. Resolution is per request and not cached.

### 3. States

The Ask page's question states (idle, streaming, answered, error) are unchanged. The
scope is a separate value, the scope string:

| From | To | When |
|---|---|---|
| any scope | another scope | a chip ✕, a menu choice, an entry point, Back/Forward |
| streaming | idle (question kept) | the scope changes |
| answered | idle (question kept) | the scope changes |
| scoped | unscoped | the last chip is removed |

Forbidden: an answer on screen under chips other than those it was asked with; a cached
answer restored for a different scope. The 「＋ 範囲」 menu has the states of the core
condition menu (SPEC-CORE-039 / SPEC-CORE-043).

### 4. Data read and written

- Core: `POST /files/matching` and the listing read `files`, `tags`, `file_tags`,
  `collections`, `collection_items`. Nothing is written.
- Intelligence: reads `search.db` as today. Nothing is written; Ask stays stateless.
- Browser: `sessionStorage` Ask cache (key gains the scope for scoped questions); the URL.

### 5. External services

The LLM provider, as today, through `resolve(drive, "rag")`; a scoped request with an
empty S calls none. The core call is inside the Docker network (5 s timeout, as
`fetch_matching_file_ids`). The MCP server calls Litloft's public proxy as today.

### 6. Authorization

Unchanged. The addon proxy validates `X-Lit-Drive` against the viewer's accessible
drives and the `rag` feature; the scope is resolved within that drive only.
`/files/matching` does not check viewer access, but every candidate still passes
`filter-file-ids` and the drive check before it reaches the LLM (`design-decisions.md`,
Ask applies access control twice). Collections are drive-scoped; a name never reaches
another drive's collection (SPEC-CORE-043 I3). The scope can only narrow what an
unscoped Ask could read.

Internal API policy, re-evaluation the rows ask for:

- Row 15 (`POST /files/matching`): D4 is its second consumer, still intelligence (search
  `filter`, Ask `scope`); no second addon. Stays KEEP (watch closely); the note records
  that Ask scope and MCP Ask now depend on it. No change to the endpoint in this spec.
- Row 14 (`GET /collections/{id}/file-ids`): D4 resolves collections by name through
  row 15, so the endpoint's only planned consumer does not use it. Stays in place with
  the note "no caller; remove in a separate change" (H2).

### 7. Effect on existing features

- Unscoped Ask (`/ask` without `scope`): same events, order, retrieval and answers as
  before. `retrieve_with_keywords` sends `search()` the same keyword set;
  `tests/test_filtered_search_unchanged.py` passes unchanged.
- Ask about one file (`/files/{id}/ask`), Find (`/find`), Pickup, `/search`: unchanged.
- The search results page: `SearchQueryHeader` draws `ConditionMenu` with today's
  entries; behaviour and DOM unchanged.
- The folder `…` menu: one more row from intelligence above the batch AI rows.
- The collection page: one more button when intelligence is installed.
- MCP `ask` without `scope`: unchanged.
- Clients that send unknown body keys to `/ask` now get 422 (see Checked, no action).

### 8. Error behavior

- 422 and 503 before the stream: the Ask page shows its existing error box, with the
  503 text 「範囲を読み込めませんでした」 / "Could not load the scope" and a retry.
- Empty S: the answer area shows 「この範囲にはファイルがありません」 /
  "No files in this scope"; the chips stay so the viewer can remove one.
- Logs: the addon logs a resolution failure at WARNING with the drive (as
  `fetch_matching_file_ids` does today) and never the question, the scope values or file
  ids. The scope's size goes into the existing retrieval INFO lines as a count.

### 9. User-visible behavior

- Folder `…` menu: 「ここに質問」 above the AI batch rows, not at the drive root.
- Collection page: 「ここに質問」 secondary button between 再生 and `…`.
- Ask page: under the title, the chips (「フォルダ Work/2024」, 「コレクション 読書メモ」,
  「タグ 会議」, 「種類 PDF」, the labels of SPEC-CORE-043 / SPEC-CORE-039) and
  「＋ 範囲」; the scope line 「家族 · 34 件」 counts the scope's files.
- A scoped answer's sources and citations are all in the scope.
- New strings: intelligence `messages/{ja,en}.json` (「ここに質問」, 「＋ 範囲」, the empty
  and 503 lines). Core strings are unchanged (CORE-044 moves code, not text).
- Docs: `docs/addons/intelligence.md` (Ask: scope, the `scope` event, `scope_empty`,
  unknown keys 422); `docs/user-guide/search.md` (Ask and Find: asking within a folder
  or collection, adding scope); `docs/ADDON-DEVELOPMENT.md` (the `collection-actions`
  slot row); `mcp-server/README.md` (`ask`).

### 10. Non-functional

- Caps: those of the search `filter` (10 folders, 10 collections, 20 tags, 8 kinds).
  The resolved set has no cap of its own; it can be a whole drive. It stays in-process
  in intelligence, and the scoped vector path already handles a 50,000-file scope
  (SPEC-ADDON-047 I4).
- Time: one `/files/matching` call (bound 1 s for 50,000 files, SPEC-CORE-039) before
  the stream opens; an empty S answers without an LLM call.
- Concurrency: the Ask semaphore is taken after resolution, so a slow resolution does
  not hold a slot.
- Privacy: the scope never leaves the Docker network; folder and collection names are
  not added to any LLM prompt.

## Touch points

Intelligence (`addons/intelligence`, its own PR, then the pointer bump):
- `app/schemas.py`: `AskRequest.scope`, `AskScope`, unknown keys forbidden.
- `app/file_matching.py`: the shared validator used by `AskScope`.
- `app/routers/rag.py`: resolution before the slot, 503, passing E.
- `app/rag/service.py`: `scope` event, empty-scope answer, E through every retrieval path,
  personal-history intersection, agentic arguments.
- `app/rag/retriever.py`: `file_id_constraint` on `retrieve_with_keywords`.
- `app/rag/coarse_retriever.py`, `app/rag/exact_match.py`: counting and ranking within E.
- `app/rag/agentic.py`, `app/rag/tools/context.py`, `search_files.py`,
  `get_file_chunks.py`, `get_file_detail.py`, `get_related_files.py`, `_access.py`.
- `frontend/Page.tsx`, `frontend/AskFindHeader.tsx`, `frontend/api.ts`
  (`askQuestionStream` body and the `scope` event), `frontend/ModeTabs.tsx`.
- `frontend/FolderAIActionsMenuItems.tsx` (or a new entry beside it), a new collection
  entry component, `manifest.json` (`collection-actions` entry).
- `frontend/messages/{ja,en}.json`.
- Tests under `tests/` and `frontend/`.

Core:
- `frontend/src/components/CollectionDetail.tsx`: the slot.
- `frontend/src/components/search/SearchQueryHeader.tsx`, a new
  `frontend/src/components/search/ConditionMenu.tsx`.
- `mcp-server/src/tools/ask.ts` and its tests.
- `.claude/rules/internal-api-policy.md`: notes of rows 14 and 15.
- Docs: `docs/addons/intelligence.md`, `docs/user-guide/search.md`,
  `docs/ADDON-DEVELOPMENT.md`, `mcp-server/README.md`.
- The `addons/intelligence` gitlink (pointer bump to the merged addon commit).

No protected path and no HIGH zone (`internal.py`, `addon_proxy.py`) is edited.

## Invariants

I1. For a scoped request, every `search()` call made while answering it, in the legacy, hierarchical, personal-history, category-expansion and agentic paths, receives `file_id_constraint` equal to E.
I2. For a scoped request, every file in `sources`, `citations`, the `shortlist` event and every agentic tool payload is in E; a citation of a file outside E is never emitted.
I3. A file in E that clears a channel's absolute floor is not lost because files outside E score higher: with 60 out-of-scope files scoring 0.99 and one in-scope file at 0.50, a scoped request retrieves the in-scope file.
I4. An `/ask` request without `scope` produces the same event kinds in the same order, and calls `search()` with the same keyword arguments, as before this change; `tests/test_filtered_search_unchanged.py` passes unmodified.
I5. A scoped request whose S is empty emits `scope` with `matched_file_count: 0`, then `citations: []` and `done` with `scope_empty: true`, and makes no LLM call; no scoped request ever retrieves from files outside S.
I6. A failed scope resolution answers 503 before any stream byte and before the Ask semaphore is taken; the semaphore's free count is the same after the request as before it.
I7. With personal history yielding H, a scoped request uses S ∩ H; when S ∩ H is empty it uses S under `graceful` and short-circuits under `strict`, and never uses the drive.
I8. `AskRequest` and `AskScope` answer 422 for an unknown key, a scope with no condition, and every value the search `filter` validator rejects, and accept every value it accepts with the same normalisation.
I9. On the Ask page, a change of the scope string aborts any open `/ask` stream, leaves no answer, source or citation on screen, keeps the question text, and writes the new `?scope=` without adding a history entry.
I10. The Ask session cache never restores an answer for a (drive, question) pair asked under a different scope, and unscoped questions keep their current key.
I11. 「ここに質問」 from a folder at path P opens the Ask page whose only chip is the folder P, and from a collection named N opens it with the only chip the collection N, including for values with spaces; neither sends a question.
I12. The MCP `ask` tool called with `scope` against a server that emits no `scope` event returns `isError`, never an answer.
I13. `SearchQueryHeader` offers the same entries in the same order with the same behaviour as before `ConditionMenu` was extracted, and the Ask page's menu offers 「フォルダ」, 「コレクション」, 「タグ」, 「種類」 and never 「お気に入り」.
I14. The collection page with no `collection-actions` entry renders the same DOM as before this change.

## Revises

SPEC-ADDON-047 I11. Ask and Find retrieval (`rag/retriever.py`, `rag/service.py`, through `file_id_scope`) returns the same results as before SPEC-ADDON-047 for every request without an Ask `scope`; a scoped Ask request uses `file_id_constraint` (SPEC-ADDON-054).

## Checked, no action

- **Collections by id (H1 alternative).** Row 14 and `collection_client.py` resolve by id,
  stable under rename and unambiguous between names that differ by case. Rejected as the
  default because it adds a second resolver with its own failure mapping, the chips and
  the URL would carry an opaque id the viewer cannot read or type, and the search
  `in:` operator already names collections; a rename leaves a stale link that answers
  "no files", which the viewer sees.
- **Removing row 14 in this change (H2 alternative).** It would revise SPEC-ADDON-058 I4–I6
  and I11 and widen this change; left for its own spec.
- **The collection entry in the `…` menu (H3 alternative).** That menu holds only
  削除; a material set is made to be asked, so the action sits beside 再生.
- **Find with the scope (H5 alternative).** `_find_files` takes `file_id_scope` and could
  take the constraint, but the human scoped D4 to Ask; Find drops the scope rather than
  showing chips it does not apply.
- **`favorite` / `liked` in the scope.** Not among the decided kinds; rejected with 422.
- **Carrying the folder page's type filter or tag filter into 「ここに質問」.** The entry
  takes the folder only; the viewer adds kinds on the Ask page.
- **「ここに質問」 at the drive root.** The sidebar's Ask entry is the whole drive.
- **Hiding the entries when the drive's `rag` policy is off.** The addon's slot entries
  are already filtered per drive by addon policy; a feature-level off answers the
  existing Ask page error.
- **Scoping Ask about one file.** It is already one file.
- **Clients sending unknown keys to `/ask`.** The web UI, MCP and the tests send only
  known keys; a hand-written client that sends extra keys now gets 422. Accepted under
  the personal-tool premise.
- **Caching the resolved set.** Per-request, uncached, as the search filter: a file
  tagged a moment ago must be in scope.
- **Sending the scope's folder or collection names to the LLM** so the answer can refer
  to them: not done; the prompt is unchanged.
- **A scope chip count per chip.** One count for the whole scope only.
