# Excluding with search operators: `-` and `has:`

SPEC-ID: SPEC-CORE-172
SPEC-ID: SPEC-ADDON-177

Approval:

## Summary

Search operators can only narrow towards something: `tag:trip` keeps files tagged `trip`,
but nothing keeps files *not* tagged `trip`, and nothing finds files with no tag at all,
which is how one finds what still needs tagging. This change adds two things.

1. A `-` before an operator excludes what it names: `-tag:trip`, `-type:video`,
   `-path:Work/old`, `-in:読了`, `-is:favorite`, `-is:liked`.
2. A new operator `has:` with two values: `has:tag` keeps files with at least one tag,
   `has:collection` keeps files in at least one collection. With `-` they find files
   with no tag (`-has:tag`) and files in no collection (`-has:collection`).

- **SPEC-CORE-172**: parsing, chips and chip removal, value suggestions, the two new
  「＋ 条件」 entries, the impossible-combination check, the listing parameters,
  `POST /api/internal/files/matching`, Smart Collection evaluation and app targets.
- **SPEC-ADDON-177**: intelligence's `filter` accepts the new keys with the same
  validation as the core and passes them through.

Decided by the user on 2026-11-23 and not reopened here: `size:`, `duration:` and
`modified:` are not negated (the opposite comparison says the same thing); free text is
not negated (`-京都` stays text: a meaning search cannot "exclude a meaning", so the name
search and the meaning search would disagree); `-in:` excludes regular collections only,
and a name that only a Smart Collection carries is refused with a notice rather than
expanded; negation is typed, the chips show it, and 「＋ 条件」 gains only 「タグなし」 and
「コレクション未登録」. `has:` was rejected on 2026-11-05 for subtitles and transcripts
because there was no data to ask about; tags and collections have that data.

## Required items

### 1. Normal flow

Terms. *Positive operator*: `tag:`, `type:`, `path:`, `in:`, `is:` and `has:` as written
without `-`. *Negated operator*: the same with `-` before the name. *Polarity*: positive
or negated. The tokenizer, quoting, NFKC handling of names and the value rules of each
operator are those of SPEC-CORE-043 and SPEC-CORE-047 and are unchanged.

SPEC-CORE-172, parsing (`searchQuery.ts`):

1. A token's name is read as today (NFKC, lower case). When it starts with exactly one
   `-` (after NFKC, so the full-width `－` counts) and the rest is `tag`, `type`, `path`,
   `in`, `is` or `has`, the token is that operator, negated, and its value is read by the
   positive operator's rules; a value those rules turn into text makes the whole token
   text, `-` included. Any other name starting with `-` (`-size:`, `-duration:`,
   `-modified:`, `--tag:`, `-:x`) leaves the token text, as today. A word with no `:`
   (`-京都`) is text, as today.
2. `has:` takes `tag` or `collection`, NFKC and case-insensitive; any other value is text.
3. `ParsedQuery` gains, in order of first appearance and deduplicated by the positive
   operator's rule (tags and collection names case-insensitively, folders after
   normalisation, kinds exactly): `excludedTags`, `excludedTypes`, `excludedFolders`,
   `excludedCollections`; and the flags `notFavorite`, `notLiked`, `hasTag`, `noTag`,
   `hasCollection`, `noCollection`, all false by default. `has:tag` sets `hasTag`,
   `-has:tag` sets `noTag`, and likewise for `collection`; `-is:favorite` sets
   `notFavorite`, `-is:liked` sets `notLiked`.
4. Caps: `excludedFolders` holds at most 10 and `excludedCollections` at most 10, counted
   apart from `folders` and `collections`; a further distinct negated value is text, as
   for the positive operators. Excluded kinds are bounded by the eight kinds.
5. Any accepted negated or `has:` token sets `hasOperators`. The text that remains is the
   tokens left as text, as today.

SPEC-CORE-172, the impossible combination. When the parsed query can match no file,
nothing is requested and the results area shows the empty state it shows for an
impossible range (SPEC-CORE-047); the chips stay so one can be removed. A query is
impossible when any of these holds:

- a name is in both `tags` and `excludedTags` (case-insensitive), or `noTag` is set with
  any `tags` or with `hasTag`;
- `favorite` and `notFavorite`, or `liked` and `notLiked`, are both set;
- `hasCollection` and `noCollection` are both set;
- the kinds that `resolveKinds` gives for the page's fixed kind and `types` are
  non-empty, and each of them is held (`kindHolds`) by some excluded kind; also when the
  fixed kind alone is held by an excluded kind and `types` is empty;
- `folders` is non-empty and each of them is equal to, or inside, some excluded folder;
- `collections` is non-empty and each of them is in `excludedCollections`
  (case-insensitive).

Nothing else is impossible at parse time. In particular `in:x -has:collection` is sent,
because `x` may be a Smart Collection whose members are in no collection, and
`type:document -type:pdf` is sent and keeps the documents that are not PDFs.

SPEC-CORE-172, chips:

1. One chip per distinct operator, value and polarity, in order of first appearance. A
   negated chip shows the positive chip's label and value and is marked as an exclusion
   as the agreed design draws it (`docs/process/reviews/feature-search-operator-negation/design/`);
   its accessible name contains 「除外」 / "Exclude". The `has:` chips are label-only:
   「タグあり」 / "Tagged", 「タグなし」 / "Untagged", 「コレクションあり」 / "In a
   collection", 「コレクション未登録」 / "In no collection".
2. ✕ removes every token with that chip's operator, value and polarity, and keeps every
   other token's raw string, including the same value with the other polarity.

SPEC-CORE-172, value suggestions (SPEC-CORE-039): typing `-tag:`, `-type:` or `-is:`
suggests what `tag:`, `type:` or `is:` suggests, and completing keeps the `-`. Tags
already in the query in either polarity are not suggested. `has:` and `-has:` suggest
`tag` and `collection`.

SPEC-CORE-172, 「＋ 条件」: the first level gains 「タグなし」 / "Untagged" and 「コレクション
未登録」 / "In no collection" after 「お気に入り」. Each appends its token (`-has:tag`,
`-has:collection`) and submits once, as 「お気に入り」 does. 「タグなし」 is disabled while the
query holds `-has:tag`, `has:tag` or any `tag:`; 「コレクション未登録」 is disabled while it
holds `-has:collection` or `has:collection`.

SPEC-CORE-172, sending:

1. `-in:` names are classified with the `in:` names, in the same request to the drive's
   collections and Smart Collections (`inNameResolution.ts`). A name that a regular
   collection carries, or that nothing carries, is sent as an excluded collection; one
   that only a Smart Collection carries refuses the search: nothing is requested and the
   notice 「スマートコレクションは除外に使えません」 / "A Smart Collection cannot be excluded"
   shows where `inNameFailed` shows today. A failed classification shows `inNameFailed`
   as today. Saving such a query as a Smart Collection is refused as for `in:` naming a
   Smart Collection. Everything SPEC-CORE-116 says of an `in:` name about waiting for the
   lists, discarding a running resolution, 再試行 and the search cache applies to a `-in:`
   name too; a query with neither loads no list, as today.
2. The listing (`FileFiltersQuery`, so `GET /files`, `POST /files/query`,
   `GET /folder-counts`, `POST /folder-counts/query`, `/shelves`, `/shelves/query` and
   the tag counts) gains repeated `exclude_tag`, `exclude_type`, `exclude_folder`,
   `exclude_collection`, and `has_tag`, `has_collection` (booleans). `-is:favorite` is
   `favorite=false` and `-is:liked` is `liked=false`, which the listing already accepts.
   The frontend writes each only when set, on both the GET path and the
   `getDriveFilesWithFileIds` POST path (`listingRequest.ts`).
3. The meaning `filter` (`SearchFilter`, `filterQueryParam`) gains `exclude_tags`,
   `exclude_kinds`, `exclude_folders`, `exclude_collections`, `has_tag`,
   `has_collection`, and carries `favorite: false` / `liked: false` for the negated
   flags. Each is written only when set; a query with none of them writes the same
   `filter` as today. "Show more by similarity" and the continuation carry it as they
   carry the other keys.
4. `POST /api/internal/files/matching` (`FileMatchingRequest`) gains the same six keys,
   default empty / null.
5. In `apply_file_filters`, every new condition is ANDed with the existing ones and with
   each other:
   - `exclude_tags`: the file carries none of the named tags (case-insensitive, folded
     as for `tags`).
   - `exclude_kinds`: the file matches none of the kinds' predicates (`_kind_predicate`),
     so `-type:document` also excludes text, PDF and EPUB files.
   - `exclude_folders`: the file is in none of the folders or their subfolders, compared
     as `path:` compares (case-sensitive, whole segments).
   - `exclude_collections`: the file is in none of the request drive's collections whose
     names match (case-insensitive). A name with no collection excludes nothing.
   - `has_tag=true`: at least one tag; `false`: no tag.
   - `has_collection=true`: in at least one collection; `false`: in none. Smart
     Collections are not collections here.
   - With `file_ids` (an `in:` naming a Smart Collection), the exclusions narrow the
     widened set too: a member of that Smart Collection that an exclusion names is not
     listed.
6. Validation, the same on the listing (400), `/files/matching` (422) and the addon (422):
   each excluded list follows its positive counterpart (tag length and the 20-tag cap of
   `/files/matching`, the eight kinds and the `markdown` alias, folder normalisation and
   the cap of 10, collection name length and the cap of 10); the two `has_` keys are
   strict booleans on `/files/matching` and in the addon.
7. Smart Collection evaluation (`smartCollectionEval.ts`) and the direct app targets
   (`appTarget.ts`, `videoAppTarget.ts`) pass the new conditions on their listing
   requests and treat an impossible combination as they treat an impossible kind or range
   today. The member path (`memberTarget.ts`) sends the evaluated members, so the
   exclusions reach it through the evaluation. None of them lists a query's files without
   its exclusions. The evaluation sends `-in:` names as `exclude_collection` without
   classifying them, as it sends `in:` names as `collection`.
8. Deployment: the addon PR merges first and the core PR carries the pointer bump, as for
   SPEC-ADDON-143.

SPEC-ADDON-177:

1. `SearchFilter` gains `exclude_tags`, `exclude_kinds`, `exclude_folders`,
   `exclude_collections` (lists, default `[]`) and `has_tag`, `has_collection`
   (`StrictBool | None`, default `None`), normalised and capped as the core does (sending
   step 6), and sends them to `/files/matching` unchanged after normalisation.
2. Everything else of SPEC-ADDON-065 applies unchanged.

### 2. Failure cases

- A negated operator with an unusable value (`-type:movie`, `-has:comment`): the token,
  `-` included, is text.
- An impossible combination: nothing is requested; the chips stay.
- `-in:` naming only a Smart Collection: the notice; nothing is requested.
- Reading the collections for `-in:` fails: `inNameFailed`, as for `in:`.
- A malformed new parameter on the listing: 400; in `filter` or `/files/matching`: 422.
  The frontend never sends either.
- An addon from before this change behind a core after it: the addon rejects a `filter`
  with the new keys (422) and the meaning stage fails as for any 422. Not reachable on
  `develop` (sending step 8).

### 3. States

No new state. A change of any new condition is a change of the filter for the search
states of SPEC-CORE-039. The 「＋ 条件」 first level gains two entries that act at once, as
「お気に入り」 does, so no new level.

### 4. Data read and written

- Core: reads `file_tags`, `tags`, `collection_items`, `collections`, `files`. Writes
  nothing.
- Intelligence: reads what SPEC-ADDON-065 reads. Writes nothing.
- Browser: nothing new stored; the search cache keys by the query text.

### 5. External services

None.

### 6. Authorization

Unchanged. `exclude_collections` and `has_collection` resolve only the request drive's
collections, as `collections` does. Internal API policy, endpoint 15: R1, tags and
collections are core entities shown in the core UI; R2, the keys name tags, kinds,
folders and collections, no addon; R3, row 15's exception stands; R4, read-only.

### 7. Effect on existing features

- Every route taking `FileFiltersQuery`, and `/files/matching`: new optional inputs only.
- A query without `-` or `has:` parses, chips, sends and lists exactly as today.
- A query that today contains a word such as `-tag:x` searched it as text; it now
  excludes. Such a word in a filename is improbable, and `"-tag:x"` in quotes is text.
- Smart Collections store the query text; a saved one with `-` tokens is evaluated with
  the exclusions.
- `core-search-vocabulary.test.ts` counts change with the new keys.
- `in:` handling, `size:`, `duration:` and `modified:` are unchanged.

### 8. Error behavior

As in 2. The core logs nothing new; the addon logs a 422 `filter` at no level above INFO,
as today.

### 9. User-visible behavior

- `tag:trip -tag:2023` lists files tagged `trip` and not `2023`. `-has:tag` lists the
  drive's untagged files, newest first. `path:Photos -path:Photos/raw` lists Photos
  without its `raw` subtree.
- Negated chips drawn as the agreed design shows; `has:` chips labelled as in chips
  step 1.
- 「＋ 条件」 gains 「タグなし」 and 「コレクション未登録」.
- New strings in `messages-core/ja.json` and `en.json`: the exclusion mark's accessible
  word, the four `has:` labels, the two menu entries, the Smart Collection notice.
- `docs/user-guide/search.md`: the operators table gains `has:tag` and
  `has:collection`, and a paragraph on `-`: which operators take it, that `-in:` takes
  regular collections only, that size, duration, modification time and plain words do
  not take it. `docs/reference/api.md`: the listing's new parameters.
  `docs/ADDON-DEVELOPMENT.md`: the `/files/matching` body. `docs/addons/intelligence.md`:
  the `filter` keys.

### 10. Non-functional

- Each new condition is one predicate (`NOT EXISTS` / `EXISTS` / `NOT IN`) on the
  drive-bounded query; no index is added, as for `tags` and `collections` today.
- Caps as in sending step 6.
- Privacy: nothing new leaves the Docker network.

## Design

The exclusion chip and the two menu entries follow the design artifact agreed at spec
time, saved under `docs/process/reviews/feature-search-operator-negation/design/` with its
URL in that directory's `README.md`. Its visible decisions, to be checked against the
implementation:

The agreed variant is A of `Main.dc.html`.

- A negated chip has no fill: transparent, with a 1 px `warm-silver`-toned inner border,
  the same radius, height, padding and text size as a positive chip, so it is told apart
  by more than colour.
- Inside it, before the operator label, the word 「除外」 / "Exclude" in `text-muted`; then
  the label in semibold and the value, as in a positive chip; then ✕.
- A `has:` chip is a positive chip (sand fill) holding its label only (「タグなし」,
  「コレクション未登録」, …), with no 「除外」 word.
- A negated chip whose value is too long truncates the value with an ellipsis inside the
  row's width; the 「除外」 word, the label and ✕ stay visible (`Phone.dc.html`, 375 px).
- Chip order is the query's order; positive and negated chips are not grouped.
- 「＋ 条件」's first level lists, in order: タグ, 種類, フォルダ, コレクション, サイズ, 長さ,
  更新日, お気に入り, タグなし, コレクション未登録, all in the existing row style;
  「タグなし」 is drawn disabled while the query holds a `tag:` (`Menu.dc.html`).

## Touch points

Core:
- `frontend/src/lib/searchQuery.ts`: tokenizing `-`, `has:`, `ParsedQuery`,
  `SearchFilter`, `filterFromParsed`, `filterQueryParam`, `operatorChips`,
  `removeOperatorChip`, `activeOperatorValue`, `suggestValues`, the impossible check.
- `frontend/src/lib/inNameResolution.ts`: `-in:` classification and the save check.
- `frontend/src/lib/api.ts`, `frontend/src/lib/listingRequest.ts`,
  `frontend/src/components/folder/useFolderFiles.ts`,
  `frontend/src/components/search/useFileSearch.ts`.
- `frontend/src/lib/smartCollectionEval.ts`, `frontend/src/lib/appTarget.ts`,
  `frontend/src/lib/videoAppTarget.ts`, `frontend/src/lib/memberTarget.ts`,
  `frontend/src/app/app-api/smart-collection-members/route.ts`.
- `frontend/src/components/search/SearchFilterChips.tsx`,
  `frontend/src/components/search/ConditionMenu.tsx`,
  `frontend/src/components/search/InNameNotice.tsx`,
  `frontend/src/components/SmartFolderSaveButton.tsx`,
  `frontend/src/components/GlobalSearch.tsx`, `frontend/src/components/FolderBrowser.tsx`.
- `frontend/src/messages-core/ja.json`, `frontend/src/messages-core/en.json`;
  `core-search-vocabulary.test.ts`.
- `backend/app/routers/drives.py`: `FileFiltersQuery`, `apply_file_filters`, the
  normalisers.
- `backend/app/routers/shelves.py` (`ShelfQuery`) and the folder-counts and tag-counts
  routes, through `FileFiltersQuery`.
- `backend/app/routers/internal.py` (HIGH): `FileMatchingRequest`.
- `.claude/rules/internal-api-policy.md`: row 15's note names the new keys.
- `backend/tests/`: each condition, its validation, listing and matching parity.
- `docs/process/reviews/feature-search-operator-negation/design/`: the agreed design.
- R-5: the 「＋ 条件」 first level (ten entries) and a negated chip with a long value
  measured at 375 px in a real browser, with no overflow.
- Docs: `docs/user-guide/search.md`, `docs/reference/api.md`,
  `docs/ADDON-DEVELOPMENT.md`, `docs/addons/intelligence.md`.

Addon (`addons/intelligence`, its own PR, then the pointer bump):
- `app/file_matching.py`: `SearchFilter`.
- `tests/`: the parity table against the core's validators, and the wire shape.

## Invariants

I1. A query with no negated and no `has:` token produces the same `ParsedQuery` fields, chips, listing parameters and `filter` as before this change.
I2. For any combination of conditions including the new ones, `POST /files/matching` returns exactly the ids `GET /files` and `POST /files/query` return for the same conditions with no `search`, `path` or `trust`.
I3. `-tag:a` keeps every file that carries no tag named `a` in any letter case, untagged files included, and drops every file that carries one.
I4. `-type:document` keeps no text, PDF or EPUB file; `type:document -type:pdf` keeps text files and drops PDFs.
I5. `-path:A` drops files in `A` and in every folder under `A`, and keeps files in a sibling folder whose name starts with `A` (such as `AB`) and in `a` when `A` is written.
I6. `-has:tag` keeps exactly the files with no tag; `has:collection` keeps exactly the files in at least one collection of the drive, and a file that is only in a Smart Collection's results counts as in no collection.
I7. Every impossible combination listed in this spec requests nothing, and `in:x -has:collection`, `type:document -type:pdf` and `path:A -path:A/b` are requested.
I8. Removing a chip removes exactly the tokens with its operator, value and polarity and leaves every other token's raw string, including the opposite polarity of the same value, unchanged.
I9. A `-in:` naming only a Smart Collection requests no listing and no meaning search and shows the notice; one naming a regular collection excludes its members.
I10. The parser turns into text every negated value the core or the addon would reject, and the listing (400), `/files/matching` (422) and the addon's `SearchFilter` (422) accept and reject the same new values.
I11. A Smart Collection, an app target and a member target built from a query with exclusions never list a file that the search page for the same query does not list, except for a `-in:` name that only a Smart Collection carries, which the page refuses.
I12. With `in:` naming a Smart Collection, a member of it that an exclusion names is not listed.

## Revises

SPEC-CORE-116 I6. A query with no `in:` and no `-in:` name loads no list, waits for nothing and sends exactly today's requests on the search page and in the search window, and `evaluateSmartCollection` sends exactly today's requests for every query without a negated or `has:` token.

## Checked, no action

- A Smart Collection saved before this change whose query holds the words `-in:x`, where
  `x` is now only a Smart Collection's name: its evaluation excludes nothing for `x`
  (sending step 7), while the search page refuses it. Saving such a query now is refused,
  and a saved query held that word only as text before; not handled.

- Negating `size:`, `duration:`, `modified:`: the opposite comparison says the same.
- Negating free text: not added (Summary).
- `-in:` of a Smart Collection: refused (Summary). Expanding it would add an excluded-id
  list to the listing, the meaning request and the addon; it can be added later without
  changing what is written here.
- OR between operators (`tag:a OR tag:b`): not part of this change.
- A chip action that switches polarity: not added (user choice, 2026-11-23); `-` is
  typed and 「＋ 条件」 offers only the two `has:` entries.
- `has:` for comments, transcripts, subtitles: not added; only tags and collections were
  asked for.
- `is:unwatched` and other per-viewer conditions: still rejected (2026-11-05,
  2026-11-20).
- MCP `search_files`, `semantic_search`, `ask`: they do not parse operators and send no
  `filter`, as in SPEC-CORE-047.
- iOS: it does not parse operators.
- A tag cap on the listing: the listing has none for `tag` today; `exclude_tag` follows
  it.
- An index for the new predicates: none, as for `tags` and `collections`.
