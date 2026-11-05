# Search within a folder or a collection: `path:` and `in:` operators

SPEC-ID: SPEC-CORE-043
SPEC-ID: SPEC-ADDON-063

Approval: sha256:d8241feb82371ba3f7cd552cdaa3efb30009fcb1e1bf5677781257c47320341d Yuichi Senga 2026-11-05

## Summary

Search operators today are `tag:`, `type:` and `is:` (`frontend/src/lib/searchQuery.ts`),
and since SPEC-CORE-039 / SPEC-ADDON-047 they filter both the name listing and the hits by
meaning. There is no way to search *inside a folder* or *inside a collection*: the search
page and the modal never send a folder, and neither the listing nor
`POST /api/internal/files/matching` knows collections. This change adds two scope
operators, `path:` (a folder and everything under it) and `in:` (a collection, by name),
lets any operator value be quoted so values with spaces can be written
(`path:"My Photos/2024"`, `in:"読書 メモ"`, `tag:"two words"`), and adds 「フォルダ」 and
「コレクション」 to the results page's 「＋ 条件」 menu.

- **SPEC-CORE-043**: the tokenizer with quoted values; `path:` and `in:` in the parsed
  query, the chips and chip removal; the two new menu entries; the listing
  `GET /api/drives/{name}/files` gains `folder` and `collection` parameters; the Internal
  API `POST /files/matching` gains `folders` and `collections` and rejects unknown keys.
- **SPEC-ADDON-063**: intelligence's `filter` accepts `folders` and `collections` with the
  same validation as the core, passes them through, and rejects unknown keys.

Decided by the user on 2026-11-05 and not reopened here: `path:` is case-sensitive and
matches whole path segments (`path:Photos/2024` keeps `Photos/2024` and below, never
`Photos/2024x`), after NFC and trimming of `/`; `in:` matches a collection name
case-insensitively, as `tag:` matches a tag; the menu is the only new entry point (no
"search in this folder" action in the library view); `added:`, `is:unwatched`, `name:`,
`ext:`, `orientation:`, `has:` and `drive:` are not added (see Checked, no action);
`size:` / `duration:` follow in a separate spec.

## Required items

### 1. Normal flow

Terms. *Value*: what follows `name:` in an operator token. *Folder*: a drive-relative
`folder_path` as stored (NFC, no leading or trailing `/`, `/` separated; `""` is the
drive root). *Subtree of F*: the active files whose `folder_path` equals F or starts with
F followed by `/`, compared code point by code point (case-sensitive).

SPEC-CORE-043, tokenizer (`searchQuery.ts`):

1. A query is split into tokens at runs of whitespace (`\s`, which includes U+3000), as
   today, except inside a quoted value. A token has the *name form* when it starts with
   a name (no whitespace or colon), a half- or full-width colon, then at least one
   character, as today's `OPERATOR` regex. When the first character after the colon is
   `"` or `＂`, the value is quoted: it runs to the next `"` or `＂`, and whitespace
   inside it does not split. The quotes are not part of the value. The characters after
   the closing quote up to the next whitespace start a new token. A quoted value with no
   closing quote runs to the end of the query. This applies to every token of the name
   form, whatever the name, so the token boundaries never depend on which names are
   operators.
2. Each token keeps its *raw* string: the exact characters of the query it spans, quotes
   and inner whitespace included. A token that is not a recognised operator with a usable
   value (unknown name, unknown kind, a `path:` value that normalises to nothing, a value
   over the caps in 8) is text, and contributes its raw string. When the query has
   operators, `parsed.text` is the raw strings of the text tokens joined with single
   spaces; when it has none, `parsed.text` is `q.trim()`, exactly as today.
3. Quotes are special only right after the colon of a name-form token. A `"` anywhere else
   is an ordinary character, so free text such as `"meeting notes"` is searched as today.
4. Every operator (`tag:`, `type:`, `is:`, `path:`, `in:`) reads its value through this
   tokenizer, so `tag:"two words"` filters by the tag 「two words」. `operatorChips`,
   `removeOperatorChip` and `parseSearchQuery` share it. `removeOperatorChip` drops the
   tokens that produced the chip and joins the raw strings of the remaining tokens with
   single spaces, so the remaining query parses to the same conditions minus the chip
   (`path:"My Photos" tag:x` without the tag chip is `path:"My Photos"`).
5. A token whose value is empty after removing the quotes (`in:""`) is text. `path:` and
   `in:` alone are text, as `tag:` alone is today.
6. Every place the frontend writes a token (the menu's tag, kind, folder and collection
   choices, and the modal's `completeOperator`) goes through one writer that quotes the
   value with `"` when it contains whitespace and writes it bare otherwise. A value
   containing `"` or `＂` is not offered by the menu (it cannot be written).
7. When the query ends inside an unterminated quoted value, a menu choice first appends
   the closing `"`, then a space and the new token, so the new token is never absorbed
   into the open value. `activeOperatorValue` uses the same tokenizer: while the caret
   position at the end of the query is inside a quoted value, it returns null (no value
   suggestions), and otherwise it behaves as today.
8. Caps, applied by the parser the same way the core and the addon apply them, so the
   frontend never sends a value either rejects. Lengths are counted in Unicode code
   points on every side (`[...value].length` in the frontend, `len()` in Python). An
   `in:` value is trimmed of whitespace; one that is then empty is text. A `path:` value
   longer than 1024 code points after normalisation, or an `in:` value longer than 100
   after trimming, is text. Counting after deduplication, the eleventh and later
   distinct folders (and collections) are text. Existing caps on `tag:` are unchanged.

SPEC-CORE-043, `path:`:

1. `path:<value>`: the value is NFC-normalised, then leading and trailing `/` are
   removed. The result is a folder. When the result is empty (`path:/`), or has a segment
   `..` or `.`, or an empty segment (`a//b`), or contains NUL, the token is text.
2. Several `path:` tokens are OR: a file is kept when it is in the subtree of any of
   them. Duplicates (equal after normalisation) count once.
3. `ParsedQuery` gains `folders: string[]` (normalised, in order of first appearance).
   A `path:` token sets `hasOperators`.
4. The chip reads 「フォルダ <folder>」 / "Folder <folder>". ✕ removes every `path:` token
   whose normalised value equals the chip's folder.

SPEC-CORE-043, `in:`:

1. `in:<value>`: the value is a collection name. Several `in:` tokens are OR: a file is
   kept when it is an item of any of the named collections. Names are compared after
   Python `str.lower()` on the core side and `toLowerCase()` on the frontend side for
   deduplication, matching how `tag:` values are deduplicated and resolved; two
   collections of the drive whose names differ only by case are both matched.
2. A name that matches no collection of the request drive keeps nothing by itself; with
   other `in:` names it adds nothing to their union. Only collections of the request
   drive are considered (`Collection.drive`).
3. `ParsedQuery` gains `collections: string[]` (as typed, deduplicated case-insensitively,
   in order of first appearance). An `in:` token sets `hasOperators`.
4. The chip reads 「コレクション <name>」 / "Collection <name>". ✕ removes every `in:` token
   whose value equals the chip's case-insensitively.

SPEC-CORE-043, combining:

1. Different operators are AND, as today: `path:Work in:資料 tag:会議 type:pdf 予算`
   keeps files in the subtree of `Work`, in the collection 資料, tagged 会議, of kind PDF,
   and ranks/matches 「予算」 among them.
2. `SearchFilter` gains `folders` and `collections`. `filterFromParsed` copies them;
   `filterQueryParam` writes them only when non-empty, after the existing keys
   (`{"tags":…,"kinds":…,"favorite":…,"liked":…,"folders":[…],"collections":[…]}`).
   Everything SPEC-CORE-039 says about a filtered query (the meaning search with `q` = the
   text, Scene search off, "Show more by similarity" with the same filter, the
   continuation key, a failed stage not cached) applies unchanged, because the new fields
   travel inside the same `filter`.

SPEC-CORE-043, listing (results page and modal):

1. `useFolderFiles` (search branch) and `useFileSearch` (`listingParams`) send each folder
   as a repeated `folder` parameter and each collection as a repeated `collection`
   parameter of `getDriveFiles`, beside `tag`, `type`, `favorite`, `liked`. They still
   send no `path` or `recursive`.
2. `GET /api/drives/{name}/files` accepts `folder: list[str]` and `collection: list[str]`.
   Both go through `apply_file_filters`, the helper the listing and `/files/matching`
   share, so for the same conditions the listing with no `search`, `path` or `trust`
   returns exactly the ids the endpoint returns. `folder` keeps the union of the subtrees
   (the core applies the same normalisation as the frontend and answers 400 for a value
   the frontend would have turned into text). `collection` keeps the union of the named
   collections' items of the request drive. Both parameters are normalised, deduplicated
   and capped exactly as SPEC-ADDON-063 step 2 states for `filter` (blank collection
   names dropped, names deduplicated case-insensitively, the caps counted after
   deduplication), with 400 where `/files/matching` answers 422. The existing `path` and
   `recursive` parameters are unchanged and combine with them as AND.

SPEC-CORE-043, Internal API:

1. `POST /api/internal/files/matching` body gains `folders: [str]` and
   `collections: [str]`, default `[]`, resolved by `apply_file_filters` as in the listing.
2. The request model forbids unknown keys (422), so an addon that sends a field this core
   does not know fails instead of being answered as if the field were absent.

SPEC-CORE-043, 「＋ 条件」 menu (results page):

1. The first level becomes 「タグ」, 「種類」, 「フォルダ」, 「コレクション」, 「お気に入り」,
   in that order.
2. 「フォルダ」 replaces the menu's content with a value list in the same popup, built like
   the tag list: a filter input at the top, then at most 8 folders. Folders come from
   `getFolderTree(drive, { flat: true })` (the whole drive's folders), excluding the root
   and the folders already in the query. Ranking: folders whose last segment starts with
   the filter text, then those whose path contains it (NFKC and case folded for the
   comparison only), shallower first within each group, then by path. Each row shows the
   last segment and, muted, the full path. Choosing appends `path:<folder>` (quoted when
   needed) and submits.
3. 「コレクション」 does the same with `getCollections(drive)`: at most 8, excluding names
   already in the query (case-insensitive), ranked by prefix then substring match on the
   name, then by `updated_at` as the API orders them. Choosing appends `in:<name>` and
   submits.
4. Both lists have the tag list's states, with their own wording: *loading*, *failed*,
   *none* (the drive has no folders / no collections), *no match*. The keyboard and
   focus behaviour of SPEC-CORE-039's tag list applies.
5. When the query already holds 10 distinct folders, 「フォルダ」 is disabled on the first
   level, as 「お気に入り」 is when `is:favorite` is present; likewise 「コレクション」 at 10
   distinct collections. So no menu choice can produce a token the parser reads as text.

SPEC-ADDON-063:

1. `SearchFilter` gains `folders: list[str]` and `collections: list[str]`, default `[]`,
   and forbids unknown keys, so `parse_search_filter` answers `InvalidFilter` (422) for a
   key it does not know.
2. Validation, identical in the addon and the core request model: folders are
   NFC-normalised and trimmed of `/`; a folder that is then empty, has a `.`, `..` or
   empty segment, or contains NUL is rejected (422); folders are deduplicated after
   normalisation. Collection names are trimmed; blank names are dropped; names are
   deduplicated case-insensitively. Caps: at most 10 folders of at most 1024 characters,
   at most 10 collections of at most 100 characters (the collection name limit).
3. The addon passes both lists to `/files/matching` unchanged (`model_dump`), and
   everything else of SPEC-ADDON-047 (one uncached call, 503 on failure, empty scope
   answers no results) applies unchanged.

### 2. Failure cases

- A folder that does not exist, or a collection name that names no collection of the
  drive: keeps nothing (0 results), as an unknown tag does.
- A folder or collection renamed after a query was saved as a Smart Folder: the saved
  query keeps the old value and keeps nothing until it is edited; same as a renamed tag.
- A malformed `folder` on the listing: 400. A malformed `folders` / `collections` in
  `filter` or on `/files/matching`: 422. The frontend never sends either, because the
  tokenizer turns such a value into text.
- Version skew between the core and intelligence. An intelligence from before this change
  ignores unknown `filter` keys, so it would drop `folders` / `collections` silently and
  rank across the whole drive while the listing is narrowed. This change does not guard
  against that pairing: the core PR pins the addon commit that carries SPEC-ADDON-063
  (the pointer bump is part of the same PR, per `CLAUDE.md` § Git), and both images are
  built from the same checkout, so a normal update never runs the new frontend with the
  old addon. From this change on, both models forbid unknown keys, so any later field
  fails closed: an addon that does not know a key answers 422 (no hits from meaning, the
  listing alone), and a core that does not know a key answers 422, which the addon turns
  into 503.
- The folder list or the collection list fails to load in the menu: the *failed* state;
  nothing is appended.
- An unterminated quote (`path:"My Ph`): the value runs to the end of the query, so
  typing the closing quote later does not change which folder is meant.

### 3. States

The meaning-search states of SPEC-CORE-039 are unchanged; a change of `folders` or
`collections` is a change of the filter. The 「＋ 条件」 menu gains two value lists:

| From | To | When |
|---|---|---|
| first level | folder list (loading) | 「フォルダ」 |
| first level | collection list (loading) | 「コレクション」 |
| loading | options, none, or failed | the request settles |
| any value list | first level | back item or Escape |
| any open state | closed | Escape on the first level, Tab, outside press, a choice |

Forbidden: a choice from a loading or failed list; the menu staying open after a choice
submits; offering a folder or collection already in the query.

### 4. Data read and written

- Core: reads `files`, `tags`, `file_tags`, `collections`, `collection_items`. Writes
  nothing.
- Intelligence: reads what SPEC-ADDON-047 reads. Writes nothing.
- Browser: the search cache keys by the whole query text, which includes the new
  operators; nothing new is stored.

### 5. External services

None outside the Docker network. The addon-to-core call is the existing one.

### 6. Authorization

Unchanged from SPEC-CORE-039 / SPEC-ADDON-047: the listing checks the viewer's access to
the drive (`_validate_drive`); the addon proxy validates `X-Lit-Drive` and the addon
passes that drive to `/files/matching`. Collections are drive-scoped and not owned by a
viewer, and only the request drive's collections are resolved, so `in:` never reaches
another drive's collection even when two drives have a collection of the same name.

Internal API policy (`.claude/rules/internal-api-policy.md`): this changes endpoint 15's
body. R1: folders (`folder_path`) and collections are core-owned and shown in the core
UI. R2: the new fields name a folder and a collection, no addon or feature. R3: the
existing exception of row 15 stands. R4: read-only.

### 7. Effect on existing features

- `GET /api/drives/{name}/files`: new optional parameters only; with neither, every
  answer is unchanged. `path` + `recursive` keep their current matching, which is not
  case-sensitive for descendants (`LIKE`); `folder` is case-sensitive by decision.
- Existing operator queries: unchanged, except that a value starting with a quote is now
  parsed as quoted (`tag:"x"` filters by the tag 「x」, not 「"x"」). A tag whose name
  starts with `"` can no longer be written with `tag:` (see Checked, no action).
- The modal: parses and filters `path:` / `in:`, shows their chips, and its value
  suggestions (`activeOperatorValue`) stay for `tag:`, `type:`, `is:` only. The modal's
  scope (a kind) is unchanged and combines with the new operators as AND.
- `GlobalSearch` `scopedSeeAll`, `SearchResultsList` highlight, the `search-modes` and
  `search-results-top` slots: they read `hasOperators` / `parsed.text`, which now also
  reflect `path:` and `in:`.
- Smart Folders: save the query text, quotes included; re-running parses it again.
- `POST /files/matching` callers: only intelligence's `fetch_matching_file_ids`. Its
  current body keys are all known to the core, so forbidding unknown keys does not break
  it.
- MCP `search_files` / `semantic_search`: unchanged.
- `frontend/src/__tests__/core-search-vocabulary.test.ts` pins the count of `search`
  translation calls per file; the new keys change those counts.

### 8. Error behavior

As in 2: a failed meaning stage shows the listing alone with no message, as today. A
failed menu list shows its muted *failed* row. The core logs nothing new; the addon logs
a 422 `filter` at no level above INFO, as today.

### 9. User-visible behavior

- `path:Work 予算` lists the name matches and the hits by meaning under `Work/` only;
  `path:"My Photos" in:旅行 京都` keeps files under `My Photos/` that are in the
  collection 旅行.
- Chips: 「フォルダ Work/2024」 and 「コレクション 旅行」, same style and keyboard
  behaviour as the existing chips; ✕ names 「フォルダ Work/2024 を外す」 /
  "Remove Folder Work/2024". A chip's value that does not fit is truncated at the end
  with an ellipsis, so a chip is never wider than the chip row (which wraps as today);
  the full value is the chip's `title`, and the ✕'s accessible name carries the full
  value.
- Menu: 「フォルダ」 / "Folder" and 「コレクション」 / "Collection" between 「種類」 and
  「お気に入り」.
- New strings in `messages-core/ja.json` and `en.json`: the two chip labels / menu items,
  the two filter input names (「フォルダを絞り込む」 / "Filter folders",
  「コレクションを絞り込む」 / "Filter collections"), and the loading, failed, none and
  no-match rows for each list.
- `docs/user-guide/search.md`: the operators table gains `path:` and `in:`, a sentence on
  quoting values with spaces, and the menu's new entries. `docs/reference/api.md`: the
  listing's `folder` and `collection`. `docs/ADDON-DEVELOPMENT.md`: the `/files/matching`
  body. `docs/addons/intelligence.md`: the `filter` keys and the unknown-key 422.

### 10. Non-functional

- Caps as in SPEC-ADDON-063 step 2, on the listing too (at most 10 `folder` and 10
  `collection` parameters, 400 beyond). Each folder adds two comparisons and each
  collection a membership test, far below SQLite's expression-depth limit.
- The menu's folder list loads the flat tree once per opening (capped at 50,000 nodes by
  the existing endpoint); filtering happens in the browser.
- `/files/matching` with a folder or collection answers within the bound SPEC-CORE-039
  set (1 s for a 50,000-file drive).
- Privacy: nothing new leaves the Docker network.

## Touch points

Core:
- `backend/app/routers/drives.py`: `apply_file_filters` gains `folders` and
  `collections`; `list_drive_files` gains `folder` and `collection` with validation and
  caps; one folder normaliser shared with the Internal API model.
- `backend/app/routers/internal.py` (HIGH zone): `FileMatchingRequest` gains `folders`
  and `collections` with validation, forbids unknown keys.
- `.claude/rules/internal-api-policy.md`: row 15's note lists the new fields.
- `backend/tests/`: listing and matching tests for folders, collections, parity, caps,
  unknown keys.
- `frontend/src/lib/searchQuery.ts`: the tokenizer, `ParsedQuery`, `SearchFilter`,
  `filterFromParsed`, `filterQueryParam`, `OperatorChip`, `operatorChips`,
  `removeOperatorChip`, and the quoting writer.
- `frontend/src/lib/api.ts`: `getDriveFiles` sends `folder` and `collection`.
- `frontend/src/components/folder/useFolderFiles.ts`,
  `frontend/src/components/search/useFileSearch.ts`: the listing parameters.
- `frontend/src/components/search/SearchQueryHeader.tsx`: the two value lists.
- `frontend/src/components/search/SearchFilterChips.tsx`: the two chip kinds.
- `frontend/e2e-layout/`: a fixture with a long folder chip at phone and desktop widths.
- `frontend/src/messages-core/ja.json`, `en.json`; the counts in
  `frontend/src/__tests__/core-search-vocabulary.test.ts`.
- Docs: `docs/user-guide/search.md`, `docs/reference/api.md`, `docs/ADDON-DEVELOPMENT.md`,
  `docs/addons/intelligence.md`.

Addon (`addons/intelligence`, its own PR, then the pointer bump):
- `app/file_matching.py`: `SearchFilter` fields, validation, unknown keys.
- `tests/test_filtered_search_contract.py`, `tests/matching_core_double.py`: the parity
  tables.

## Invariants

I1. For any combination of `tags`, `kinds`, `favorite`, `liked`, `folders` and `collections`, `POST /files/matching` returns exactly the ids that `GET /api/drives/{name}/files` returns for the same conditions with no `search`, `path` or `trust`.
I2. `folder=F` keeps a file exactly when its `folder_path` equals F or starts with F followed by `/`, comparing case-sensitively: `Photos/2024` never keeps a file in `Photos/2024x` or `photos/2024`.
I3. `collection=N` keeps exactly the active files of the request drive that are items of a collection of the request drive whose name equals N after `lower()`; a collection of another drive with the same name contributes nothing.
I4. Several `folder` values keep the union of their subtrees, and several `collection` values the union of their collections; different operators combine as AND.
I5. `parseSearchQuery`, `operatorChips` and `removeOperatorChip` tokenize identically: removing a chip removes exactly the tokens that produced it, and a query with `path:"My Photos"` yields one folder `My Photos` and no text word `Photos"`.
I6. A query whose operators include `path:` or `in:` sends the same folders and collections to the listing and, inside `filter`, to the meaning search; neither stage is filtered by a folder or collection the other was not.
I7. `FileMatchingRequest` and the addon's `SearchFilter` answer 422 for an unknown key, and accept and reject the same `folders` / `collections` values with the same normalisation.
I8. A query with none of the new operators and no quoted value sends the same listing parameters and the same `filter` as before this change.
I9. Choosing a folder or collection in the 「＋ 条件」 menu appends exactly one token that `parseSearchQuery` reads back as that folder or collection, quoting it when it contains whitespace, and submits once.
I10. The listing's `folder` / `collection` and `/files/matching`'s `folders` / `collections` normalise, deduplicate and cap identically (400 on the listing where the endpoint answers 422), and the frontend parser turns into text every value either would reject, so a typed query never makes the listing fail.
I11. The menu's folder and collection lists never offer a value already in the query, and nothing can be chosen while a list is loading or has failed.
I12. Removing a chip leaves every other token's raw string unchanged, so the result parses to the same conditions and text minus that chip.
I13. A menu choice made while the query ends inside an unterminated quoted value adds a token that parses as its own operator, and leaves the open value's folder or collection unchanged.
I14. In a real browser at 390 px and 1280 px wide, a chip whose value is a 200-character folder path is no wider than the chip row, and its ✕ stays visible.

## Checked, no action

- `added:`, `is:unwatched`, `name:`, `ext:`, `orientation:`, `has:`, `drive:` were
  considered and rejected by the user on 2026-11-05: `created_at` is a file's mtime for
  scanned files, not when it was added; `is:unwatched` needs the viewer carried from the
  addon to the core, a viewer in the search cache key and a rule for shared Smart
  Folders; free text already matches titles; the rest are covered by `type:` or are
  rarely needed; `drive:` would cross the drive boundary.
- A "search in this folder" action in the library view: not added (user choice); the menu
  and typing are the entry points.
- Value suggestions for `path:` / `in:` while typing in the modal: not added. The
  results page's menu covers choosing a folder or collection; the modal's suggestion
  rows stay for `tag:`, `type:`, `is:`.
- Collections by id instead of name: the query is text the user reads, edits and saves in
  Smart Folders, and `tag:` already behaves the same way under a rename.
- Making the listing's `path` + `recursive` case-sensitive to match `folder`: left alone.
  It is used by the sidebar tag filter, whose counts come from other `LIKE` queries; a
  case-variant folder pair cannot exist on the case-insensitive file systems Litloft runs
  on, so the difference is not reachable in normal use.
- Values containing a quote character: cannot be written. Folder, collection and tag
  names starting with or containing `"` are not offered by the menu.
- Curly quotes (`“”`): not treated as quotes. Browsers do not substitute them in a text
  field, and accepting them would make `“` inside a value ambiguous.
- Scene search with operators: stays off (SPEC-CORE-039).
- MCP `semantic_search` / `search_files` and Ask: they send no `filter`; scoping them is
  a separate change.
- Folder renames updating saved queries: Smart Folders keep their text; see 2.
