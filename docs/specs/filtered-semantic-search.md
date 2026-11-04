# Search by meaning within tag, type and favourite filters

SPEC-ID: SPEC-CORE-039
SPEC-ID: SPEC-ADDON-047

Approval:

## Summary

Today a query that contains an operator (`tag:`, `type:`, `is:`, parsed by
`frontend/src/lib/searchQuery.ts`) switches searching by meaning off, so
`tag:会議 type:pdf 予算の見直し` finds only files whose name or folder contains
「予算の見直し」. This change keeps searching by meaning on and makes the operators hard
filters on its hits as well. The core resolves the operators to the request drive's
active file ids, and the intelligence addon ranks only within those ids (pre-filter, then
rank). The search results page also gets an editable query field with chips for the
parsed operators, and the search modal shows the same chips.

- **SPEC-CORE-039**: a generic, read-only Internal API endpoint that returns a drive's
  active file ids for tag, kind, favourite and liked conditions; the frontend sends the
  parsed operators with the meaning search in the modal and on the results page, and on
  "Show more by similarity"; the results page's heading becomes an editable query field
  with operator chips and a 「＋ 条件」 menu; the modal shows the chips under its input.
- **SPEC-ADDON-047**: intelligence's `GET /search` and `GET /search/images` accept a
  `filter`, resolve it through the core, and rank only within the returned ids: every
  retrieval channel is constrained to them, and every relative cutoff is measured among
  them.

Decided by the user on 2026-11-04 and not reopened here: operators become hard filters on
hits by meaning; pre-filter rather than post-filter (each channel stops at about 50
candidates, `rrf_candidates`, and `file_id_scope` is applied in `_build_results` after the
channels took their top N, so a narrow filter would mostly come back empty); a new generic
read-only Internal API; operators with no free text run no meaning search; "Show more by
similarity" keeps working with the same filter; Scene search with operators stays off;
both the modal and the results page; Ask is out of scope; results page design option A
(artifact https://claude.ai/artifact/C3BwytszC3sbN7iXn2x8CQ); the cutoff is measured
within the filtered set.

## Required items

### 1. Normal flow

Terms. *Filter*: the parsed operators of a query, `{tags, kinds, favorite, liked}`, where
`kinds` is `resolveKinds(fixed, parsed.types).kinds` (`fixed` is the results page
toolbar's type, or null in the modal). *Filtered query*: a query whose
`parseSearchQuery(q).hasOperators` is true. *Text*: `parsed.text`.

SPEC-CORE-039, Internal API:

1. `POST /api/internal/files/matching`, body
   `{ "drive": str, "tags": [str], "kinds": [FileKind], "favorite": bool | null,
   "liked": bool | null }`. `tags` and `kinds` default to `[]`, the flags to `null`.
2. It answers `{ "file_ids": [str] }`: the ids of the drive's active files
   (`active_file_filter()`) that carry every tag (case folded the way
   `list_drive_files` folds it, across all `Tag` rows), are of any of the kinds (through
   `_apply_kinds_filter`, with `markdown` read as `text`), and match each flag that is not
   null (`is_favorite == favorite`; `liked_at` set for `liked: true`, unset for `false`).
   Ids are sorted ascending. The predicates are the ones `GET /api/drives/{name}/files`
   applies for `tag`, `type`, `favorite` and `liked`, moved into one helper in
   `routers/drives.py` that both routes call, so for the same conditions the endpoint's
   ids are exactly the ids that listing returns with no `search`, `path` or `trust`.
3. It needs no secret (a read of ids, like `POST /files/bulk`), and checks no caller
   credential: the drive is the one the addon proxy already validated as `X-Lit-Drive`.

SPEC-CORE-039, frontend (modal and results page):

1. A filtered query with non-blank text, when the drive has intelligence enabled
   (`isSemanticSearchAvailable`), runs both stages as an unfiltered query does today: the
   listing with the operators (unchanged) and the meaning search with `q` = the text (not
   the whole query) and `filter` = the filter as one JSON query parameter,
   `{"tags":[…],"kinds":[…],"favorite":true,"liked":true}`, with empty lists and false
   flags left out. `type` and `include_scene_clip` are not sent with `filter`; the kinds
   travel inside it.
2. The hits are merged into the list as today (`mergeResults`, `sortMerged`); trust
   filtering stays on the client as today.
3. A filtered query with blank text runs no meaning search and shows the listing only,
   as today. A filter whose kinds are impossible (`resolveKinds(...).impossible`)
   requests nothing, as today.
4. In the modal, a scoped search (a scope's `type` is set) keeps today's behaviour: no
   meaning search, with or without operators.
5. Results page: "Show more by similarity" is offered under the same conditions as today
   except that a filtered query no longer rules it out, and its request
   (`/search/images`) carries the same `filter` and `q` = the text. The continuation's key
   includes the filter, so a changed filter never shows the previous filter's
   continuation.
6. Results page: Scene search stays off for a filtered query: the Scene search toggle and
   the `search-results-top` slot stay hidden as today, and `include_scene_clip=true` in
   the URL is not sent with `filter`. The `search-modes` slot stays hidden for a filtered
   query, as today.

SPEC-CORE-039, results page header:

1. The static heading 「検索: "…"」 is replaced by a text field holding the URL's `q`,
   spanning the header's subject row. The heading text stays as a visually hidden `<h1>`
   so the page keeps its heading. The scope line (the count) and the actions (Smart
   Folder button, and the `search-modes` slot when shown) keep their places in the
   subject row on `sm` and wider; below `sm` the field takes the full content width and
   the count and actions sit in one row under the chips, so the phone header no longer
   loses the query or stacks the count.
2. Under the field, one chip per parsed operator, in the order the operators first
   appear in the field text: 「タグ 会議」 per tag, 「種類 PDF」 per kind (labels from
   `filter.type.*`), 「お気に入り」 for `is:favorite`, 「Liked」 for `is:liked` (labels
   from `sidebar.favorites` / `sidebar.liked`). Chips are derived from the field's
   current text, so typing an operator shows its chip at once.
3. ✕ on a chip removes from the field text every token that produced it (each `tag:` token
   whose value equals the chip's case-insensitively; each `type:` token whose value
   resolves to the chip's kind, `markdown` included for `text`; each `is:` token for that
   flag), joins the remaining tokens with single spaces, and submits.
4. After the chips, a 「＋ 条件」 button (「＋」 alone below `sm`) opens a menu of 「タグ」,
   「種類」 and 「お気に入り」. 「タグ」 and 「種類」 replace the menu's content with a value
   list in the same popup: tags come from `getDriveTags(drive)` ranked by
   `suggestValues` (drive's tags with a count, not already in the query, at most 8, with
   a filter input at the top); kinds are the eight kinds not already chosen. 「お気に入り」
   is disabled when `is:favorite` is already present. Choosing a value appends
   `tag:<value>`, `type:<kind>` or `is:favorite` to the field text and submits.
5. Submitting (Enter in the field, ✕, or a menu choice) navigates with `router.push` to
   `/drive/<drive>/search?q=<text>`, keeping `type`, `smart_folder_id` and
   `include_scene_clip` as they are, so each submission is one history entry and Back
   returns to the previous query. Submitting text that equals the current `q` (after
   trimming) does not navigate. Blank text does not navigate: the field stays empty and
   focused and the list keeps the current query.
6. Whenever the URL's `q` changes (submission, Back, Forward), the field's text becomes
   the new `q`, discarding unsubmitted edits. Escape in the field restores the URL's `q`.

SPEC-CORE-039, modal chips:

1. Under the modal's input (desktop and mobile), the same chips show the operators of
   the current input text. ✕ edits the input text as in header step 3 and returns focus
   to the input; nothing navigates (the modal searches as the text changes, as today).
   The modal has no 「＋ 条件」 button.

SPEC-ADDON-047:

1. `GET /search` and `GET /search/images` accept an optional `filter` query parameter: a
   JSON object with optional `tags` (list of strings), `kinds` (list of the eight kinds,
   `markdown` accepted as `text`), `favorite` and `liked` (bools). Without `filter` both
   routes behave exactly as today.
2. With `filter`, the route calls `POST /api/internal/files/matching` with the request
   drive (from `X-Lit-Drive`) and the filter, once per request, uncached. An empty
   `file_ids` answers `results: []` (`total: 0`) without embedding the query or running
   any channel.
3. `/search` runs every channel constrained to the ids (the *scope*):
   - The four FTS channels (`fts_files`, `fts_transcripts`, `fts_text_content`,
     `fts_retrieval_keywords`) add `file_id IN (SELECT value FROM json_each(:scope))` to
     their `MATCH` query, so their `LIMIT` and their score normalisation see in-scope
     rows only.
   - Each vector channel (text; CLIP with Scene search off, which is the
     `clip_thumbnail` partition) first counts the scope's embedding rows of the types it
     reads (`embeddings` by `file_id`, `vector_table` and `embedding_type`). At most
     20,000 rows: exact ranking — read those rows' vectors by `embedding_id` in batches
     of 500, convert each L2 distance with `_l2_to_cosine_similarity`, and take the
     nearest rows up to the channel's candidate count. Over 20,000 rows: KNN without the
     id constraint, widened as `_drive_thumbnail_neighbours` widens (k =
     min(candidates × f, 4096) for f in 4, 16, 64, then 4096), keeping in-scope rows,
     until the candidate count is reached or a fetch returns fewer rows than asked.
   - The channel's existing stages (absolute floors `min_score_text` /
     `min_score_clip_thumbnail`, the text channel's gap and CV checks, the margin cutoff)
     then run on the in-scope candidates only, so "the top score" each relative cutoff
     is measured from is the best in-scope one. `_build_results` gets the scope as
     `file_id_scope`, so its ratio cutoff is also measured within the scope.
4. `/search/images` reads only the scope's `clip_thumbnail` rows of the drive (the scope
   joins the query it already runs) and is otherwise unchanged (no cutoff, at most 2000).
5. `filter` with `include_scene_clip=true` is answered with 422.

### 2. Failure cases

- The Internal API call fails (connection error, timeout of 5 s, any non-200, or a body
  without a `file_ids` list of strings): the addon answers 503 `Filter unavailable` and
  never runs the unfiltered search. The proxy turns the 5xx into 502; the frontend's
  `fetchSemanticHits` / `fetchSemanticImages` treat it as no hits, so the list shows the
  listing's name matches only, and "Show more by similarity" returns to offered.
- A malformed `filter` (not JSON, not an object, wrong types, unknown kind, over the caps
  in 10): 422 from the addon, forwarded by the proxy as 422; the frontend shows no hits
  from meaning. The core endpoint applies the same caps and answers 422 itself.
- A drive the core does not know: 404 from the core endpoint; the addon answers 503 as
  above (the proxy has already rejected inaccessible drives).
- Conditions that match nothing: `file_ids: []`, `results: []`.
- A tag value that names no tag: matches nothing, as in the listing.
- The query or the filter changes while a request is in flight: the request is aborted
  (modal) or its answer ignored (results page), as today; see 9.
- A file tagged or untagged between the listing and the meaning request: the two stages
  may disagree until the next search; no cache makes it longer than one request.

### 3. States

Meaning search of a search view:

| From | To | When |
|---|---|---|
| off | pending | a query with non-blank text, intelligence enabled, not scoped (modal), kinds possible |
| pending | answered | the addon answers 200 |
| pending | failed | the addon answers non-200 or the request fails (shown as no hits) |
| any | off | the text becomes blank, the query becomes scoped, or the kinds impossible |
| any | pending | the query text or the filter changes (previous hits dropped first) |

Field of the results page: *in sync* (text equals the URL's `q`) and *edited*. Typing moves
to edited; submission, Escape, or any change of the URL's `q` returns to in sync.

Continuation ("Show more by similarity"): `hidden`, `offered`, `loading`, `open`, `done`
as today; a change of the filter is a change of its key.

### 4. Data read and written

- Core: reads `files`, `tags`, `file_tags`. Writes nothing.
- Intelligence: reads `indexed_files`, `embeddings`, `vec_text`, `vec_clip` and the four
  FTS tables. Writes nothing.
- Browser: the search cache (`searchCache.ts`) keys by the whole query text, which
  includes the operators, so a filtered query's cached hits are its own. URL history gets
  one entry per submission.

### 5. External services

None outside the Docker network. The addon-to-core call is bounded to 5 s, like
`hydrate_files`; see 2 for when it is slow, down or wrong.

### 6. Authorization

The addon proxy validates `X-Lit-Drive` against the viewer's accessible drives and applies
the `search` feature policy (`pre_check`), as today. The addon passes exactly that drive
to the core endpoint, so the ids never come from another drive; the proxy's
`current_drive_only` response filter stays. The core endpoint is reachable only on the
Docker-internal network (`/api/internal`), needs no secret (read-only ids, as
`/files/bulk`), and returns 404 for an unknown drive. A locked drive never reaches it,
because the proxy rejects the request first.

Internal API policy (`.claude/rules/internal-api-policy.md`): R1, tags, kinds, favourite
and liked are core-owned and shown in the core UI. R2, the path, body and response name
no addon or feature. R3, the second user is Ask or MCP scoping a question to a tagged set
(later). R4, read-only. R5, does not apply (nothing is promoted).

### 7. Effect on existing features

- `GET /api/drives/{name}/files`: its tag, kind, favourite and liked predicates move into
  a shared helper; its answers do not change.
- Unfiltered queries: unchanged on both surfaces and in the addon (no `filter`).
- Scene search, the `search-results-top` and `search-modes` slots: unchanged for
  filtered queries (still hidden).
- Smart Folders: keep saving the query text, which now may have been edited in the
  field; `smart_folder_id` is kept on submission so the existing update action applies.
- The modal's value suggestions for `tag:` / `type:` / `is:`, its keyboard handling and
  its scope behaviour: unchanged.
- MCP `semantic_search`: unchanged (no `filter`; see Checked, no action).
- Ask, Find and `/search/compare`: unchanged.

### 8. Error behavior

As in 2: a failure of the meaning stage shows the listing alone with no message, as when
the addon is unreachable today. The addon logs a failed Internal API call at WARNING with
the exception class and the drive, and a 422 `filter` at no level above INFO. The core
logs nothing new.

### 9. User-visible behavior

- `tag:会議 type:pdf 予算の見直し` lists name matches and hits by meaning, all tagged
  「会議」 and of kind PDF, with match badges, timestamp pills and snippets as for an
  unfiltered query. A weak but in-scope hit can appear where an unfiltered query would
  have dropped it below a better match outside the filter.
- Modal: the footer's 「意味でも探しています…」 shows while a filtered meaning search is
  pending, as for an unfiltered one.
- Loading and refetch: chips are computed from text and never wait. When the query or
  filter changes, the previous meaning hits are dropped before the new request, so no row
  from a previous filter is shown with the new query; the results page's count stays
  hidden until the listing settles (the existing `settledTotal` rule), and the modal keeps
  its stale-while-revalidate snapshot of the same query text only.
- Chip style: `rounded-full bg-sand text-xs`, the label `font-semibold` then the value,
  the ✕ a small round button `hover:bg-bg-elevated` (DESIGN.md §Editable Tag Chips:
  removal is undone by re-adding, so no danger hover). 「＋ 条件」 is muted and unfilled
  with a dashed `border-warm-silver`. No accent fill anywhere in the header (§2.2). The
  field follows §Inputs (`rounded-2xl`, `border-warm-silver/40`, `var(--focus-ring)`).
  The menu follows §Context Menus / Dropdowns: anchored with direction from the room it
  has, a bottom sheet below `sm`, dismissed by an outside press that is swallowed.
- Keyboard: Tab order is field, each chip's ✕ in chip order, 「＋ 条件」. Enter or Space on
  ✕ removes; focus then moves to the next chip's ✕, else the previous, else the field.
  「＋ 条件」 is a button with `aria-haspopup="menu"` and `aria-expanded`; the menu is
  `role="menu"` with `menuitem`s; arrows move, Enter chooses, Escape closes the menu (or
  leaves a value list back to the first level) and returns focus to the button; Tab
  closes it. The tag value list's filter input takes focus when it opens; arrows move
  through its options and Enter chooses.
- Screen reader: the field's accessible name is 「検索語」 / "Search query"; the chip row is
  a group named 「条件」 / "Filters"; each chip's text is read as its label and value; each
  ✕ is named 「{label} {value} を外す」 / "Remove {label} {value}"; 「＋」 below `sm` is
  named 「条件を追加」 / "Add filter". The hidden `<h1>` reads 「検索: "…"」 with the URL's
  `q`.
- New strings in `messages-core/ja.json` and `en.json`: the field name, the chip group
  name, the remove label, 「＋ 条件」 / "+ Filter", 「条件を追加」 / "Add filter", menu items
  タグ / Tag, 種類 / Type, お気に入り / Favorites. Existing labels are reused for kinds
  and flags.
- `docs/user-guide/search.md`: the sentence "While an operator is in the query,
  searching by meaning is off" is replaced by: operators also filter results found by
  meaning; operators alone list files only; Scene search is off while an operator is in
  the query; the results page's field, chips and 「＋ 条件」. `docs/addons/intelligence.md`
  documents `filter` on `/search` and `/search/images`. `docs/ADDON-DEVELOPMENT.md`
  documents `POST /files/matching`.

### 10. Non-functional

- Caps (core and addon, same values): at most 20 tags, each at most 200 characters;
  kinds deduplicated, at most 8. The listing adds one `File.tags.any(...)` clause per
  tag, and 1000 or more repeated tag or type parameters already fail on SQLite's
  expression-depth limit (hako: search operators stage 1); the cap keeps the endpoint far
  below it.
- The core endpoint has no cap on the number of ids: a drive of 50,000 active files
  answers within 1 s on the test data.
- `/search` with a filter answers within twice the unfiltered time for the same query on
  the same drive; in particular the exact path of a 20,000-row scope reads 40 batches.
- Why 20,000 rows: the exact path costs one read per row, and 20,000 is the size
  `/search/images` already reads in one request (it reads every one of the drive's
  `clip_thumbnail` vectors; production held about 19,000 such rows across all drives on
  2026-10-21). Above it, the scope is at least 20,000 of `vec_text`'s about 632,000 rows
  (3.2 %), so the 4096 nearest rows are expected to hold about 130 in-scope rows, over
  the 50 the channel keeps; the widened KNN then gives the same candidates the exact path
  would, unless the scope's rows sit further from the query than the rest of the table.
  The CLIP thumbnail partition has one row per file, so its exact path holds for any
  filter of up to 20,000 files.
- Privacy: no new data leaves the Docker network; ids cross only the internal network.

## Touch points

Core:
- `backend/app/routers/internal.py` (HIGH zone): `POST /api/internal/files/matching`
  with its request model and caps.
- `backend/app/routers/drives.py`: the tag / kind / favourite / liked predicates move
  into one helper used by `list_drive_files` and the new endpoint.
- `backend/tests/`: endpoint tests (conditions, AND/OR, case folding, active only, drive
  boundary, unknown drive, caps) and the listing-parity test.
- `frontend/src/lib/semanticSearch.ts`: `filter` on `fetchSemanticHits` and
  `fetchSemanticImages`.
- `frontend/src/lib/searchQuery.ts`: the filter from a parsed query; operator chips with
  their token positions; removal of a chip's tokens.
- `frontend/src/components/search/useFileSearch.ts`,
  `frontend/src/components/folder/useFolderFiles.ts`: run the meaning stage for filtered
  queries, send `q` = text and `filter`, drop previous hits on change, continuation key.
- `frontend/src/components/FolderBrowser.tsx`, `frontend/src/components/PageHeader.tsx`:
  the field in the title's place with a visually hidden `<h1>`, the phone layout.
- New components for the chip row and the 「＋ 条件」 menu (under
  `frontend/src/components/search/`), used by the results page and
  `frontend/src/components/GlobalSearch.tsx`.
- `frontend/src/app/drive/[name]/search/page.tsx`: submission and URL handling.
- `frontend/src/messages-core/ja.json`, `en.json`.
- Frontend tests next to the existing search tests; a `frontend/e2e-layout/` case for
  the header at 390 px and at desktop width.
- `docs/user-guide/search.md`, `docs/ADDON-DEVELOPMENT.md`, `docs/addons/intelligence.md`.

Addon (intelligence):
- `addons/intelligence/app/routers/search.py`: `filter` on `/search` and
  `/search/images`, 422 and 503 paths.
- `addons/intelligence/app/search.py`: scope-constrained FTS channels, the exact and
  widened vector paths, `search_images` scope, `file_id_scope` into `_build_results`.
- A new Internal API client module beside `app/file_hydrate.py` for
  `POST /files/matching`.
- `addons/intelligence/tests/`: channel constraint, threshold, cutoff-within-scope,
  failure (no unfiltered fallback), Layer 1 wire test (URL, method, JSON body, response
  parse, 404 / 422 / 5xx propagation via `httpx.MockTransport`) and Layer 2 parity table
  (addon `filter` validator against the core request model: caps, kind vocabulary,
  `markdown` alias).
- The gitlink bump of `addons/intelligence` in the core repository.

Rules passed through: `.claude/rules/internal-api-policy.md` (R1-R5, two-layer contract
tests, read endpoints need no write secret), `.claude/rules/design-decisions.md` (drive
boundary; `active_file_filter()`; the addon reads `X-Lit-Drive` and does not validate it;
no core-to-addon dependency), `.claude/rules/frontend-conventions.md`, `DESIGN.md` §2.2,
§Inputs, §Context Menus / Dropdowns, §Editable Tag Chips, §Page Header. `internal.py` is a
HIGH zone and is named; no protected path is edited.

## Invariants

I1. For any conditions, `POST /api/internal/files/matching` returns exactly the ids of the drive's active files that `GET /api/drives/{drive}/files` lists for the same `tag`, `type`, `favorite` and `liked` with no `search`, `path` or `trust`; it never returns a missing, trashed or other-drive file.
I2. With `filter`, every result of `/search` and `/search/images` is a file id the core endpoint returned for the request drive; no result outside it is ever returned, including when the core call fails, in which case the route answers 503 and runs no channel.
I3. With `filter`, a file in the scope that clears a channel's absolute floor is not dropped because files outside the scope score higher: every candidate limit and relative cutoff (text gap and CV checks, margin, `_build_results` ratio) is computed over in-scope candidates only.
I4. A vector channel whose scope holds at most 20,000 rows of its types ranks them exactly, and above that uses the widened KNN; both paths give the same candidates on a scope where the widened KNN reaches the candidate count.
I5. Without `filter`, `/search` and `/search/images` return the same results as before this change.
I6. A filtered query with non-blank text sends the meaning search `q` equal to the text without operator tokens and a `filter` equal to the parsed operators (kinds resolved with the toolbar type), never `include_scene_clip` or `type`; a filtered query with blank text, impossible kinds, or a scoped modal search sends no meaning search.
I7. No row from a meaning answer of a previous query or filter is shown once the query or filter has changed, on either surface, and "Show more by similarity" never shows a continuation fetched for a different filter.
I8. ✕ on a chip removes every token that produced that chip and no other token; on the results page it pushes exactly one history entry with the new `q` and keeps `type`, `smart_folder_id` and `include_scene_clip`; in the modal it navigates nowhere.
I9. The results page field shows the URL's `q` after every change of `q`, including Back and Forward, and a blank or unchanged submission navigates nowhere.
I10. More than 20 tags, a tag over 200 characters, or an unknown kind is answered 422 by both the addon and the core endpoint, and their validators accept and reject the same inputs.

## Checked, no action

- **MCP `semantic_search` gains no operator support.** Its `q` is passed to `/search`
  verbatim, so `tag:x` there stays text, as today. An agent that needs tag scoping can
  list ids first; adding `filter` to the tool is a separate change once Ask/MCP scoping
  (the endpoint's second user) is specified. Recommended: not in this spec.
- **Repeated query parameters (`tag=a&tag=b`) for the filter.** The addon proxy forwards
  `dict(request.query_params)`, which keeps one value per key, so a repeated parameter
  would silently lose all tags but one. A single JSON `filter` parameter avoids changing
  the proxy (a HIGH zone) for every route.
- **Post-filtering.** Rejected by the user; see Summary.
- **Caching the id list in the addon.** A 30 s cache like `hydrate_files` would hide a
  just-tagged file from meaning hits while the listing shows it. One indexed query per
  request is cheap enough.
- **A notice when the filter cannot be resolved.** The meaning stage failing shows the
  listing alone, as when the addon is down today; the addon logs it.
- **Scene search with operators.** Later, by the user's decision.
- **Scoped modal searches.** They keep today's behaviour (no meaning search). Folding the
  scope's kind into the filter would also switch meaning search on for scoped queries
  without operators, which nobody decided.
- **Value suggestions while typing `tag:` in the results page field.** The 「＋ 条件」
  menu covers picking a value; the modal keeps its suggestions.
- **「Liked」 in the 「＋ 条件」 menu.** The decision lists tag, type and favourite;
  `is:liked` still gets a chip when typed.
- **Absolute floors inside the scope.** `min_score_text` and `min_score_clip_thumbnail`
  stay: they are not relative to other files, and without them every in-scope file would
  match any text.
- **Ask, Find, `/search/compare`.** Out of scope.
- **A secret on the new endpoint.** Normal read endpoints need none
  (`.claude/rules/design-decisions.md`, Internal API); only integrity-changing writes use
  the strict gate.
