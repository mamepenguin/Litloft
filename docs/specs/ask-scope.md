# Ask within a folder, a collection, or tags and kinds

SPEC-ID: SPEC-ADDON-054
SPEC-ID: SPEC-ADDON-064
SPEC-ID: SPEC-CORE-044
SPEC-ID: SPEC-CORE-045

Approval: sha256:e2fb3ae737126e011eefd9a1c71b9bcf60839c4137a7a7f043d935caede49458 Yuichi Senga 2026-11-05

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
  page, and the search page's 「＋ 条件」 menu exported as a component the Ask page can
  draw.
- **SPEC-CORE-045** (core, `mcp-server/`): the MCP `ask` tool gains the same `scope`.

The scope has the shape of the search `filter` (SPEC-CORE-039 / SPEC-ADDON-047) as
SPEC-CORE-043 / SPEC-ADDON-063 extend it: `folders`, `collections` (by name), `tags`,
`kinds`. It is resolved by the one Internal API call that already resolves that filter,
`POST /api/internal/files/matching`, so a scope and a search filter with the same values
name the same files.

Delivery, in this order:

1. **SPEC-CORE-043 and SPEC-ADDON-063 merged first** (approved, not yet merged when this
   spec was written). They provide the `folders` and `collections` keys on
   `/files/matching` and in intelligence's `SearchFilter`, the `path:` / `in:` tokens,
   the quoting writer, and the folder and collection value lists this change reuses.
2. **Core PR, SPEC-CORE-044**: `ConditionMenu`, the `collection-actions` slot, its
   `docs/ADDON-DEVELOPMENT.md` row and the `frontend/e2e-layout/` fixtures.
3. **Addon PR, SPEC-ADDON-054 and SPEC-ADDON-064**, in `addons/intelligence`.
4. **Core PR**: the `addons/intelligence` pointer bump to the merged addon commit,
   SPEC-CORE-045 (MCP `ask`), the notes of Internal API rows 14 and 15, and the docs
   under `docs/addons/`, `docs/user-guide/` and `mcp-server/README.md`.

The human decided on 2026-11-05: the three scope kinds (folder subtree, collection, tags
and kinds as in the A2 filter), AND between kinds; the entry points 「ここに質問」 on
folder and collection pages, chips on the Ask page with the ability to add scope there,
and the same parameter on the MCP `ask` tool.

Decisions recommended here that are the human's to confirm before approval. Each is
written into the spec as recommended (pending human confirmation); the alternative is in
Checked, no action:

- **H1.** A collection is named by its name (the `in:` semantics of SPEC-CORE-043), not
  by id through `GET /api/internal/collections/{id}/file-ids`.
- **H2.** That id endpoint (Internal API row 14, SPEC-ADDON-058) is left in place with no
  caller, and its removal is a separate change.
- **H3.** On the collection page 「ここに質問」 is a button beside 再生, through a new
  `collection-actions` slot, not a row in the `…` menu.
- **H4.** A personal-history question inside a scope narrows to history ∩ scope; when that
  is empty and `fallback_when_empty` is `graceful`, it falls back to the scope, never to
  the drive.
- **H5.** The scope applies to Ask only; the Find page is not scoped and shows no chips.
- **H6.** A folder or collection whose name contains `"` or `＂` (which the quoting
  writer cannot express) gets no 「ここに質問」 entry. A collection with no items still
  gets the button, and Ask shows the empty-scope state.
- **H7.** A note saved from a scoped answer records the scope in its frontmatter.
- **H8.** The scope survives Ask → Find → Ask: `ModeTabs` carries `?scope=` on both
  links, and the Find page passes it through without applying it.
- **H9.** The Find page's header shows the drive's count, as today, even when its URL
  carries `?scope=`.

## Required items

### 1. Normal flow

Terms. *Scope*: an object with any of `folders`, `collections`, `tags`, `kinds`, each a
list. *Resolved set* S: the ids `POST /api/internal/files/matching` returns for the
request drive and the scope. *History set* H: the ids personal history yields for the
question, when it yields any. *Effective set* E: S, or S ∩ H as the personal-history
steps below state. *Scoped request*: an `/ask` request whose body has `scope`.
*Scope string*: the Ask page's form of a scope, operator tokens only (`path:`, `in:`,
`tag:`, `type:`, in the syntax of `frontend/src/lib/searchQuery.ts` after SPEC-CORE-043).

SPEC-ADDON-054, request and resolution:

1. `AskRequest` gains `scope: AskScope | None = None` and forbids unknown keys (422).
   `AskScope` has `folders`, `collections`, `tags`, `kinds`, each defaulting to `[]`,
   forbids unknown keys (`favorite` and `liked` included), and normalises, deduplicates
   and caps each list exactly as SPEC-ADDON-063 step 2 and SPEC-ADDON-047 state for the
   search `filter`, by the same validator code (`markdown` is accepted as `text`). A
   scope with all four lists empty after normalisation is rejected by an `AskScope`
   model validator, so the answer is FastAPI's standard validation body: 422
   `{"detail": [{"type": "value_error", "loc": ["body", "scope"],
   "msg": "Value error, scope has no condition", ...}]}`. Every other scope or body
   defect, an unknown top-level key included, is also FastAPI's list-shaped 422.
2. After the existing checks (`rag` enabled, query length, drive mismatch) and before the
   concurrency slot is taken, the route resolves the scope with
   `fetch_matching_file_ids(drive, filter)` where `filter` holds the scope's four lists
   and no `favorite` / `liked`. The drive is `X-Lit-Drive`, as for every Ask request.
3. A resolution failure (`FilterUnavailable`) answers HTTP 503 with
   `{"detail": {"code": "scope_unavailable", "message": "Scope unavailable"}}` and opens
   no stream. The concurrency 503 keeps its string `detail`, so a client tells them
   apart by `detail.code`, not by text.
4. A scoped request's stream begins with exactly one `scope` event, before
   `query_decomposed`, `keywords` and any agentic event:
   `{"scope": {"folders": [...], "collections": [...], "tags": [...], "kinds": [...]},
   "matched_file_count": len(S)}`. All four keys are always present, holding the
   normalised values (kinds after the `markdown` alias). An unscoped request emits no
   `scope` event, and its event sequence is unchanged.
5. When S is empty, the stream after `scope` is `citations` with `[]` and `done` with
   `{"retrieved_count": 0, "scope_empty": true, "took_ms": n}`. No LLM is called (no
   keyword transform, no decomposition, no answer).
6. `file_type`, when sent with a scope, applies as today on top of E (AND). In-scope files
   of another type are not retrieved; when none is left the existing empty-retrieval
   answer follows. It is not `scope_empty`, because S is not empty.

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
     `min_drive_files_for_shortlist`, also when E came from personal history (today a
     history pre-scope skips that guard), and the `shortlist` event's
     `drive_file_count` carries that number;
   - the exact-match addition counts, for each token, the files *in E* that hold it,
     against `exact_match_max_files`, and adds only files in E.
3. For a scoped request, `pre_scope_file_ids` and every `file_id_scope` argument are
   `None`: E travels only as `file_id_constraint` (which `search()` also applies as its
   post-filter), and H is used only to compute E. The coarse shortlist is ranked within
   E (step 2) instead of being projected onto a pre-scope.
4. Sources, the access filter (`filter-file-ids` and the drive check), the
   anti-hallucination citation filter and the answer prompt are unchanged; because every
   candidate is in E, every source and citation is.
5. `answer_question` (the non-streaming path the evals use) takes no scope and is
   unchanged.

SPEC-ADDON-054, personal history (H4):

1. Stage A (`decompose_query`) and Stage B (`fetch_viewer_history`) run as today. When
   they yield H and the request is scoped, E = S ∩ H, and the `history_filter` event's
   `matched_file_count` is `len(E)`.
2. When S ∩ H is empty: with `fallback_when_empty: "strict"` the stream emits
   `history_filter` with `matched_file_count: 0`, then short-circuits as today's strict
   path (`citations: []`, `done` without `scope_empty`, no answer); with `"graceful"`
   E = S and no `history_filter` event is emitted, as for today's graceful empty
   history. A scoped request never falls back to the drive.
3. Without a personal signal, E = S.

SPEC-ADDON-054, agentic branch:

1. The agentic loop runs no personal history, so its E is S. `_stream_agentic` and
   `_run_agentic` receive it, and `ToolContext` gains
   `file_id_constraint: frozenset[str] | None`.
2. `search_files` passes it to `retrieve_with_keywords` as `file_id_constraint`.
3. `get_file_chunks`, `get_file_detail` and `get_related_files` answer a `file_id`
   outside E with the envelope they give an inaccessible id, and make no Internal API
   or database call for it. `get_related_files` drops related files outside E from its
   payload.
4. `register_file_ids` drops ids outside E, so `is_allowed_citation` is false for every
   file outside E and the citation-strict verifier rejects such a citation.
5. The `scope` event precedes the agentic `keywords` event; an empty S answers as in
   resolution step 5 without entering the loop.

SPEC-ADDON-054, logs: the log lines this change adds (resolution failure, scope sizes,
agentic out-of-scope refusals) carry at most the drive and counts (`len(S)`, `len(E)`),
never the question, a scope value (folder, collection name, tag) or a file id. Existing
lines are not changed; see Checked, no action.

SPEC-ADDON-064, the Ask page:

1. The URL carries the scope string as `?scope=` beside `?q=`. The page reads both from
   `window.location` at exactly two moments: on mount and on a `popstate` event (Back or
   Forward). It does not react to `useSearchParams` changes, so the page's own
   `history.replaceState` writes (step 4 and `runAsk`'s `?q=` write) never start a read.
   On a read, tokens that parse as text and `is:` tokens are dropped, and what remains
   is the scope.
2. The request body's `scope` is `filterFromParsed(parseSearchQuery(scopeString))`
   restricted to the four keys; a scope string with no operator sends no `scope`.
3. Under the header, the page draws the scope string's chips with the core
   `SearchFilterChips` and, after them, the core `ConditionMenu` (CORE-044) with
   `label` 「＋ 範囲」 / "+ Scope", `entries` `["folder", "collection", "tag", "kind"]`
   and `typeFilter` `null`. A choice sets the scope string to the menu's `next`; a ✕
   sets it to the chip row's `next`. Neither sends a question.
4. A change of the scope string by a chip or the menu aborts a streaming answer, clears
   the shown answer and its sources, keeps the question in the input, and writes the new
   `?scope=` and removes `?q=` with one `history.replaceState` (no history entry), so a
   reload never fires the kept question under a scope it was not asked with.
   Stop (the existing abort button) aborts the stream and returns to idle as today:
   the answer, sources and citations received so far are cleared, the question stays in
   the input, and the chips, the scope line and the URL are unchanged.
5. The header's scope line is the drive and the scope's file count:
   `GET /api/drives/{drive}/files` with the scope's `folder`, `collection`, `tag` and
   `type` parameters (SPEC-CORE-043) and `limit=1`, read from `meta.total`. Unscoped,
   the line is today's drive count. A count that is loading or failed shows the drive
   alone. After a scoped answer, the `scope` event's `matched_file_count` replaces it.
6. The session cache key is `drive:question` for an unscoped question, as today, and
   `drive:` + the JSON of the normalised scope (keys in the order folders, collections,
   tags, kinds) + `:` + question for a scoped one. A scoped entry also stores
   `matchedFileCount`; restoring it shows that count on the scope line. A scoped entry
   without a numeric `matchedFileCount` is treated as a miss. A `scope_empty` outcome is
   not cached: restoring it re-runs the request, which calls no LLM and shows the
   empty-scope state again (or an answer, if the scope has gained files).
7. On a read (step 1) whose URL has `?q=`, the page restores the cached answer for
   (drive, scope, q) or, on a miss, fires the question with that scope, as `?q=` alone
   does today; a read without `?q=` leaves the page idle with the read scope. So Back or
   Forward to an entry with another `?scope=` shows the state for that pair, never the
   previous pair's. Nothing else fires a question except the Ask button, Enter and the
   retry.
8. Error display: a 503 whose `detail.code` is `scope_unavailable` shows
   「範囲を読み込めませんでした」 / "Could not load the scope" with a retry; any other
   error keeps today's text. `askQuestionStream` exposes `detail.code` on the error it
   throws.
9. `scope_empty: true` shows 「この範囲にはファイルがありません」 /
   "No files in this scope" in the answer area; the chips stay.
10. Saving the answer as a note (H7): `buildAskNoteMarkdown` writes a `scope:` line, the
    JSON-quoted scope string, after `query:` when the answer was scoped, and no such line
    otherwise.
11. `ModeTabs` (H8) takes an optional `scope` and appends `&scope=` (or `?scope=`) to
    both links when it is non-empty. The Find page reads `?scope=` only to pass it to
    `ModeTabs`; it draws no chips, sends no scope, and its header shows the drive's
    count as today (H9).

SPEC-ADDON-064, entry points:

1. **Folder.** A new manifest entry `folder-ask` in `folder-bulk-actions-menu`, priority
   5 (before `folder-ai-actions` at 10), registered in `frontend/slots.ts`. It draws one
   `ActionMenuItem` 「ここに質問」 / "Ask here" (lucide `MessageCircleQuestion`)
   whenever `path` is not empty, whether or not the folder has files of its own
   (`fileIds` is not read). Pressing it calls `onRequestClose` and navigates
   (`router.push`) to `/drive/{drive}/addons/intelligence?scope=<token>`, the `path:`
   token written by the quoting writer. At the drive root (`path` empty) it draws
   nothing. A path containing `"` or `＂` draws nothing (H6).
2. **Collection.** A new manifest entry `collection-ask` in `collection-actions`,
   registered in `frontend/slots.ts`, draws a secondary `Button` 「ここに質問」 /
   "Ask here" with the same icon, navigating to `?scope=<in: token>` for
   `collectionName`. A name containing `"` or `＂` draws nothing; a collection with no
   items draws the button (H6).
3. Neither entry sends a question; the Ask page opens with the chip shown and the input
   focused.

SPEC-CORE-044:

1. `CollectionDetail`'s header `actions` draws `<AddonSlot id="collection-actions"
   layout="stack">` between 再生 and `…`, with props
   `{ drive, collectionId, collectionName }`. The stack layout renders the entries side
   by side in the actions row; with no entry it draws nothing.
2. The 「＋ 条件」 menu of `SearchQueryHeader`, with its value lists, caps and disabled
   states as SPEC-CORE-043 leaves them, moves into an exported `ConditionMenu`:
   - props `{ drive: string; query: string; typeFilter: FileKind | null;
     entries: ConditionEntry[]; label: string; onChoose: (next: string) => void }`,
     where `ConditionEntry` is `"tag" | "kind" | "folder" | "collection" | "favorite"`
     and `entries` gives which first-level items appear and in what order;
   - `next` is `query` with the chosen token appended, as the menu builds it today
     (closing an open quote first, SPEC-CORE-043 step 7);
   - the kind list's exclusions use `typeFilter` exactly as today;
   - the menu submits nothing itself: what a choice does is the caller's `onChoose`.
3. `SearchQueryHeader` draws `ConditionMenu` with entries
   `["tag", "kind", "folder", "collection", "favorite"]`, its label, its `typeFilter`,
   and an `onChoose` that submits as it does today, so the results page behaves
   exactly as before.
4. `SearchFilterChips` is used as it is.

SPEC-CORE-045:

1. The MCP `ask` tool's input schema gains an optional
   `scope: { folders?: string[], collections?: string[], tags?: string[],
   kinds?: ("video" | "image" | "audio" | "document" | "archive" | "other" | "text" |
   "pdf")[] }`. `markdown` is not in the enum. The tool forwards `scope` in the body
   unchanged; the server validates it.
2. When `scope` was sent, the tool requires a `scope` event in the stream. Without one
   it returns `isError` with "This Litloft server does not support Ask scope". With one,
   the result gains `scope` (the event's data).
3. When `done` has `scope_empty: true`, the result has an empty `answer`, `scope` with
   `matched_file_count: 0`, and is not an error.
4. The tool description gains: "Pass scope to answer only from files in those folders
   (and below), collections (by name), tags and kinds of the drive; conditions combine
   with AND. An empty scope answers with no answer and matched_file_count 0."

### 2. Failure cases

- Invalid scope (unknown key, over a cap, malformed folder, unknown kind, no condition):
  422 before the stream. The Ask page never sends one: its scope comes from the parser,
  which turns such values into text (SPEC-CORE-043 step 8) and drops them (page step 1).
- The core does not answer `/files/matching`: 503 `scope_unavailable`, no stream, no
  fallback to an unscoped answer.
- A folder, collection name or tag that matches nothing, a collection renamed after the
  link was made, an empty collection, or a scope whose files are all trashed: S is
  empty, the "no files" answer.
- S is not empty but none of its files is indexed, none passes the access filter, or
  none has the requested `file_type`: the existing empty-retrieval answer follows the
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

The Ask page holds two values: the scope string and the question state.

| From | To | When |
|---|---|---|
| idle | streaming | the viewer asks, or `?q=` misses the cache |
| idle | answered | `?q=` hits the cache for (drive, scope, q) |
| streaming | answered | `done` without error and `scope_empty` absent |
| streaming | scope-empty | `done` with `scope_empty: true` |
| idle or streaming | error (scope unavailable) | 503 with `detail.code` `scope_unavailable` |
| idle or streaming | error (other) | 422, the concurrency 503, any other failure, a broken stream |
| answered, scope-empty, error | streaming | the viewer asks again or retries |
| streaming | idle (question kept, chips and URL unchanged) | Stop |
| streaming, answered, scope-empty, error | idle (question kept, `?q=` removed) | the scope string changes by a chip or the menu |
| any | the state for the URL's (scope, q) | mount, or `popstate` (Back or Forward) |

The scope line has its own states: count loading (drive alone), count shown, count
failed (drive alone), and after a scoped answer the `matched_file_count`.

Forbidden: an answer, an empty-scope message or a scope error on screen under chips
other than those it was asked with; a cached answer restored for a different scope. The
「＋ 範囲」 menu has the states of the core condition menu (SPEC-CORE-039 /
SPEC-CORE-043).

### 4. Data read and written

- Core: `POST /files/matching` and the listing read `files`, `tags`, `file_tags`,
  `collections`, `collection_items`. Nothing is written.
- Intelligence: reads `search.db` as today. Nothing is written; Ask stays stateless.
- Browser: the `sessionStorage` Ask cache (key and entry gain the scope for scoped
  questions); the URL.
- A saved Ask note gains a `scope:` frontmatter line when scoped (written through the
  existing save path, H7).

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

Internal API policy, the re-evaluation rows 14 and 15 ask for:

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
  The Find page's only change is passing `?scope=` to `ModeTabs`.
- The search results page: `SearchQueryHeader` draws `ConditionMenu` with today's
  entries, label, exclusions and submit; behaviour and DOM unchanged.
- The folder `…` menu: one more row from intelligence, above the batch AI rows.
- The collection page: one more button when intelligence is installed.
- Saved Ask notes: unscoped notes are byte-for-byte as before (apart from `saved_at`).
- MCP `ask` without `scope`: unchanged.
- Clients that send unknown body keys to `/ask` now get 422 (see Checked, no action).

### 8. Error behavior

- 422 before the stream: the Ask page's existing error box and text.
- 503 `scope_unavailable`: 「範囲を読み込めませんでした」 / "Could not load the scope",
  with a retry. The concurrency 503 keeps today's text.
- Empty S: 「この範囲にはファイルがありません」 / "No files in this scope"; the chips stay.
- MCP: the missing-`scope`-event error of SPEC-CORE-045 step 2; otherwise the existing
  `Litloft API error (...)` results.
- Logs: the addon logs a resolution failure at WARNING with the drive (as
  `fetch_matching_file_ids` does today) and nothing listed in the logs rule above.

### 9. User-visible behavior

- Folder `…` menu: 「ここに質問」 above the AI batch rows, on any folder but not the
  drive root.
- Collection page: 「ここに質問」 secondary button between 再生 and `…`.
- Ask page: under the title, the chips (「フォルダ Work/2024」, 「コレクション 読書メモ」,
  「タグ 会議」, 「種類 PDF」, the labels of SPEC-CORE-043 / SPEC-CORE-039) and
  「＋ 範囲」; the scope line 「家族 · 34 件」 counts the scope's files.
- A scoped answer's sources and citations are all in the scope.
- New strings, in intelligence `messages/{ja,en}.json` only: 「ここに質問」, 「＋ 範囲」,
  the empty-scope and scope-unavailable lines. Core strings are unchanged (CORE-044
  moves code, not text).
- Docs: `docs/addons/intelligence.md` (Ask: scope, the `scope` event, `scope_empty`,
  `scope_unavailable`, unknown keys 422); `docs/user-guide/search.md` (Ask and Find:
  asking within a folder or collection, adding scope); `docs/ADDON-DEVELOPMENT.md` (the
  `collection-actions` slot row); `mcp-server/README.md` (`ask`).

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
- Layout: the collection header's actions row and the Ask page's chip row fit 390 px and
  desktop widths (I11).

## Touch points

Intelligence (`addons/intelligence`, its own PR, then the pointer bump):
- `app/schemas.py`: `AskRequest.scope`, `AskScope`, unknown keys forbidden.
- `app/file_matching.py`: the shared validator used by `AskScope`.
- `app/routers/rag.py`: resolution before the slot, the `scope_unavailable` 503,
  passing E.
- `app/rag/service.py`: `scope` event, empty-scope answer, E through every retrieval path,
  personal-history intersection, agentic arguments, log lines.
- `app/rag/retriever.py`: `file_id_constraint` on `retrieve_with_keywords`.
- `app/rag/coarse_retriever.py`, `app/rag/exact_match.py`: counting and ranking within E.
- `app/rag/agentic.py`, `app/rag/tools/context.py`, `search_files.py`,
  `get_file_chunks.py`, `get_file_detail.py`, `get_related_files.py`, `_access.py`.
- `frontend/Page.tsx`, `frontend/AskFindHeader.tsx`, `frontend/api.ts`
  (`askQuestionStream` body, error `code`, the `scope` event), `frontend/ModeTabs.tsx`,
  `frontend/pages/find.tsx`, `frontend/askNoteFormat.ts`.
- New `frontend/FolderAskMenuItem.tsx`, `frontend/CollectionAskButton.tsx`;
  `frontend/slots.ts` (both registered); `manifest.json` (`folder-ask`,
  `collection-ask`).
- `frontend/messages/{ja,en}.json`.
- Tests under `tests/` and `frontend/`.

Core:
- `frontend/src/components/CollectionDetail.tsx`: the slot.
- `frontend/src/components/search/SearchQueryHeader.tsx`, a new
  `frontend/src/components/search/ConditionMenu.tsx`.
- `frontend/e2e-layout/`: a fixture with the collection header carrying a stub
  `collection-actions` button and a long collection name, and one with the Ask chip row
  (`SearchFilterChips` with a 200-character folder chip, then the `ConditionMenu`
  trigger), each at 390 px and 1280 px.
- `mcp-server/src/tools/ask.ts` and its tests.
- `.claude/rules/internal-api-policy.md`: notes of rows 14 and 15.
- Docs: `docs/addons/intelligence.md`, `docs/user-guide/search.md`,
  `docs/ADDON-DEVELOPMENT.md`, `mcp-server/README.md`.
- The `addons/intelligence` gitlink (pointer bump to the merged addon commit).

No protected path and no HIGH zone (`internal.py`, `addon_proxy.py`) is edited.

## Invariants

I1. For a scoped request, every `search()` call made while answering it, in the legacy, hierarchical, personal-history, category-expansion and agentic paths, receives `file_id_constraint` equal to E and `file_id_scope` `None`, where E is S, or S ∩ H when history yields H and S ∩ H is non-empty, or S when S ∩ H is empty under `graceful` (under `strict` the stream emits `history_filter` with 0 and short-circuits); with 60 out-of-scope files scoring 0.99 and one in-scope file at 0.50, the in-scope file is retrieved.
I2. For a scoped request, every file in `sources`, `citations`, the `shortlist` event and every agentic tool payload is in E, no citation outside E is emitted, and no agentic tool makes an Internal API or database call for a `file_id` outside E.
I3. `/ask` answers FastAPI's list-shaped 422 for an unknown key at the top level or inside `scope`, for a scope with no condition (`msg` "Value error, scope has no condition"), and for every value the search `filter` validator rejects, and accepts every value it accepts with the same normalisation; a failed resolution answers 503 with `detail.code` `scope_unavailable` before any stream byte and before the Ask semaphore is taken, leaving its free count unchanged, while the concurrency 503 keeps its string `detail`.
I4. An `/ask` request without `scope` produces the same event kinds in the same order, and calls `search()` with the same keyword arguments, as before this change; `tests/test_filtered_search_unchanged.py` passes unmodified.
I5. A scoped request emits exactly one `scope` event, first, carrying all four normalised keys and `matched_file_count` = len(S); `done` carries `scope_empty: true` exactly when S is empty, and then only `citations: []` precedes it and no LLM is called, while a non-empty S that retrieves nothing (a `file_type` matching no in-scope file included) gives the existing empty-retrieval answer; no log line this change adds contains the question, a scope value or a file id.
I6. On the Ask page, the URL is read only on mount and on `popstate`, and a question is fired only by the Ask button, Enter, the retry, or such a read with `?q=` that misses the cache; a chip or menu change aborts any open stream, leaves no answer, source, citation, empty-scope message or error on screen, keeps the question text, and replaces the URL with the new `?scope=` and no `?q=`; the cache never restores an answer for a different scope, keeps the unscoped key unchanged, restores a scoped answer with its `matched_file_count`, and never stores a `scope_empty` outcome.
I7. The Ask page's scope line shows the listing's `meta.total` for the scope (the drive alone while it loads or after it fails) and the `scope` event's count after a scoped answer; a `scope_unavailable` 503 shows 「範囲を読み込めませんでした」 and any other failure today's text; a note saved from a scoped answer has a `scope:` frontmatter line with the scope string and one from an unscoped answer has none; both `ModeTabs` links carry `?scope=` when the scope is non-empty, and the Find page sends no scope, draws no chips and shows the drive's count.
I8. 「ここに質問」 from a folder at a non-root path P (with or without files of its own) opens the Ask page whose only chip is the folder P, and from a collection named N opens it with the only chip the collection N, including names with spaces; neither sends a question; no entry is drawn at the drive root or for a path or name containing `"` or `＂`.
I9. The MCP `ask` tool forwards `scope` in the body unchanged, returns `isError` when it sent `scope` and the stream has no `scope` event, and returns a non-error result with an empty `answer` and `matched_file_count: 0` when `done` has `scope_empty: true`.
I10. `SearchQueryHeader` offers the same entries in the same order, with the same exclusions and submit, as before `ConditionMenu` was extracted; the Ask page's menu offers 「フォルダ」, 「コレクション」, 「タグ」, 「種類」 and never 「お気に入り」, and a choice there sends no request to `/ask`; the collection page with no `collection-actions` entry renders the same DOM as before.
I11. In a real browser at 390 px and 1280 px (`frontend/e2e-layout/`), the collection header's actions (再生, 「ここに質問」, `…`) stay within the content width with no horizontal scroll, and on the Ask chip row a 200-character folder chip is no wider than the row with its ✕ visible.

## Revises

SPEC-ADDON-047 I11. Ask and Find retrieval (`rag/retriever.py`, `rag/service.py`, through `file_id_scope`) returns the same results as before SPEC-ADDON-047 for every request without an Ask `scope`; a scoped Ask request uses `file_id_constraint` (SPEC-ADDON-054).

## Checked, no action

- **Existing log lines on the Ask path.** Some already carry what the new rule keeps out
  of new lines: the agentic dispatch INFO line logs tool arguments (the model's search
  query and file ids), and the retriever and context WARNING lines log file ids. They
  predate this change and apply to unscoped Ask alike, so gating them only for scoped
  requests would protect nothing; changing them for every request is a separate change.
- **Scope on `answer_question`.** The non-streaming path serves the evals only; no
  eval needs a scope, so it stays unscoped and unchanged.
- **The scope count on the Find page (H9 alternative).** Find applies no scope, so a
  scope count there would describe a narrowing that does not happen.
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
  take the constraint, but the human scoped D4 to Ask; Find carries `?scope=` through
  for the way back (H8) and applies nothing.
- **Dropping the scope on Ask → Find (H8 alternative).** Simpler, but a viewer who looks
  at Find and returns loses the chips they built.
- **Names the quoting writer cannot express (H6 alternative: escaping).** SPEC-CORE-043
  has no escape for `"`; adding one changes the search syntax. Hiding the entry is
  rare in practice and never wrong.
- **Hiding the collection button for an empty collection (H6 alternative).** The page's
  item count includes trashed and missing items, so it cannot tell an askable
  collection from an empty one; the Ask page's empty state can.
- **Not recording the scope in a saved note (H7 alternative).** The note would present a
  scoped answer as the drive's answer.
- **AddonSlot `layout="inline"`.** There is no such layout; `stack` renders a fragment,
  which lays out in the header's flex row.
- **Putting the folder row inside `FolderAIActionsMenuItems`.** That component draws
  nothing when `fileIds` is empty, which would hide 「ここに質問」 on a folder holding
  only subfolders.
- **`markdown` in the MCP kinds enum.** The server accepts it as an alias of `text`; the
  tool lists canonical kinds only.
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
- **A file count per chip.** One count for the whole scope only.
