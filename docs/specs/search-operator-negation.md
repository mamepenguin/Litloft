# Excluding with search operators: `-` and `has:`

SPEC-ID: SPEC-CORE-172
SPEC-ID: SPEC-ADDON-177

Approval: sha256:ae9e50f452b046ed38351cc54a9a51499021fde39e2240f001b141861d92e3b1 Yuichi Senga 2026-11-23

## Summary

Search operators can only narrow towards something: `tag:trip` keeps files tagged `trip`,
but nothing keeps files *not* tagged `trip`, and nothing finds files with no tag at all,
which is how one finds what still needs tagging. This change adds two things.

1. A `-` before an operator excludes what it names: `-tag:trip`, `-type:video`,
   `-path:Work/old`, `-in:読了`, `-is:favorite`, `-is:liked`.
2. A new operator `has:` with two values: `has:tag` keeps files with at least one tag,
   `has:collection` keeps files in at least one collection. With `-` they find files
   with no tag (`-has:tag`) and files in no collection (`-has:collection`).

As with every operator, a query of operators alone lists every file that passes them:
`-path:Work` alone lists every file of the drive outside `Work`, and a Smart Collection
saved with it holds every such file each time it is evaluated.

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
expanded; negation is typed, the chips show it (design variant A), and 「＋ 条件」 gains
only 「タグなし」 and 「コレクション未登録」. `has:` was rejected on 2026-11-05 for subtitles
and transcripts because there was no data to ask about; tags and collections have that
data.

## Required items

### 1. Normal flow

Terms. *Positive operator*: `tag:`, `type:`, `path:`, `in:`, `is:` and `has:` as written
without `-`. *Negated operator*: the same with `-` before the name. *Polarity*: positive
or negated. *New token*: an accepted negated operator or an accepted `has:` token. The
tokenizer, quoting, NFKC handling of names and the value rules of each operator are those
of SPEC-CORE-043 and SPEC-CORE-047 and are unchanged.

SPEC-CORE-172, parsing (`searchQuery.ts`):

1. A token's name is read as today (NFKC, lower case). When it starts with exactly one
   `-` (after NFKC, so the full-width `－` counts) and the rest is `tag`, `type`, `path`,
   `in`, `is` or `has`, the token is that operator, negated, and its value is read by the
   positive operator's rules; a value those rules turn into text makes the whole token
   text, `-` included. Any other name starting with `-` (`-size:`, `-duration:`,
   `-modified:`, `--tag:`, `-:x`), and `!` in place of `-`, leave the token text, as
   today. A word with no `:` (`-京都`) is text, as today.
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
   for the positive operators. `excludedTypes` holds at most 8 distinct kinds; a ninth
   distinct negated kind is text. Excluded
   tags have no parser cap, as `tag:` has none.
5. Any new token sets `hasOperators`. The text that remains is the tokens left as text,
   as today.

SPEC-CORE-172, the impossible combination. When the parsed query can match no file,
nothing is requested and the results area shows what it shows for an impossible range
(SPEC-CORE-047); the chips stay so one can be removed. A query is impossible when any of
these holds:

- a name is in both `tags` and `excludedTags` (case-insensitive), or `noTag` is set with
  any `tags` or with `hasTag`;
- `favorite` and `notFavorite`, or `liked` and `notLiked`, are both set;
- `hasCollection` and `noCollection` are both set;
- the kinds that `resolveKinds` gives for the page's fixed kind and `types` are
  non-empty, and each of them is held (`kindHolds`) by some excluded kind;
- `folders` is non-empty and each of them is equal to, or inside, some excluded folder;
- `collections` is non-empty and each of them is in `excludedCollections`
  (case-insensitive).

Nothing else is impossible at parse time. In particular `in:x -has:collection` is sent,
because `x` may be a Smart Collection whose members are in no collection, and
`type:document -type:pdf` is sent and keeps the documents that are not PDFs.

SPEC-CORE-172, chips:

1. One chip per distinct operator, value and polarity, in order of first appearance. A
   negated chip is drawn as the Design section says; its accessible name, and the ✕'s,
   contain 「除外」 / "Exclude". The `has:` chips are label-only positive chips:
   「タグあり」 / "Tagged", 「タグなし」 / "Untagged", 「コレクションあり」 / "In a
   collection", 「コレクション未登録」 / "In no collection".
2. ✕ removes every token with that chip's operator, value and polarity, and keeps every
   other token's raw string, including the same value with the other polarity.

SPEC-CORE-172, value suggestions (SPEC-CORE-039, `useLauncherRows.ts`): typing `-tag:`,
`-type:` or `-is:` suggests what `tag:`, `type:` or `is:` suggests, and completing keeps
the `-`. A tag already in the query in either polarity is not suggested. `has:` and
`-has:` suggest `tag` and `collection`, leaving out a value the query already holds in
either polarity.

SPEC-CORE-172, 「＋ 条件」 (`ConditionMenu.tsx`, entries from `SearchQueryHeader.tsx`, so
the search page and the image-query page; the Ask page's menu is unchanged):

1. The first level gains 「タグなし」 / "Untagged" and 「コレクション未登録」 / "In no
   collection" after 「お気に入り」. Each appends its token (`-has:tag`,
   `-has:collection`) and submits once, as 「お気に入り」 does.
2. 「タグなし」 is disabled while the query holds `-has:tag`, `has:tag` or any positive
   `tag:`. 「コレクション未登録」 is disabled while it holds `-has:collection` or
   `has:collection`.
3. The existing entries treat negated tokens so that no choice repeats a token or makes
   the query impossible: the タグ list leaves out a tag the query holds in either
   polarity, and 「タグ」 is disabled while the query holds `-has:tag`; the 種類 list
   leaves out a kind the query holds in either polarity and a kind an excluded kind
   holds; the フォルダ list leaves out a folder held in either polarity and a folder equal
   to or inside an excluded folder; the コレクション list leaves out a name held in either
   polarity; 「お気に入り」 is disabled while the query holds `is:favorite` or
   `-is:favorite`. The folder and collection caps count positive values only, as today.

SPEC-CORE-172, sending:

1. `-in:` names are classified with the `in:` names, in the same request to the drive's
   collections and Smart Collections (`inNameResolution.ts`), on the search page, the
   image-query page and in the search window. A name that a regular collection carries,
   or that nothing carries, is sent as an excluded collection. One that only a Smart
   Collection carries puts the search in the *refused* state: nothing is requested; the
   results, the count and the empty state are hidden; 「スマートコレクションは除外に使えま
   せん」 / "A Smart Collection cannot be excluded" shows where `inNameTooLarge` shows
   today, on the page and in the window, with no 再試行. The refused state is left as the
   failed and too-large states are: by a change of the query's `in:` / `-in:` names, or a
   reload, which classify again. A failed classification shows `inNameFailed` as today.
   Everything SPEC-CORE-116 says of an `in:` name about waiting for the lists,
   discarding a running resolution and the search cache applies to a `-in:` name too; a
   query with neither loads no list, as today. The query's *`in:` key* is its `in:` and
   `-in:` names together with their polarity, so adding, removing or changing either
   kind classifies again and re-evaluates the `in:` Smart Collections with a new `now`.
   Precedence: an impossible combination is checked first and loads no list; then a
   failed list load (`inNameFailed`); then the refused state, in which no `in:` Smart
   Collection is evaluated; then the evaluation of `in:` Smart Collections, which may end
   failed or too large as today.
2. Saving or overwriting a Smart Collection (`SmartFolderSaveButton.tsx`) whose query
   has a `-in:` name that only a Smart Collection carries writes nothing and shows the
   refusal toast that an `in:` naming a Smart Collection shows, after loading the lists
   as for an `in:` name.
3. The listing (`FileFiltersQuery`, so `GET /files`, `POST /files/query`,
   `GET /folder-counts`, `POST /folder-counts/query`, `/shelves`, `/shelves/query`,
   `/tag-counts`, `/tag-counts/query`) gains repeated `exclude_tag`, `exclude_type`,
   `exclude_folder`, `exclude_collection`, and `has_tag`, `has_collection` (booleans).
   `-is:favorite` is `favorite=false` and `-is:liked` is `liked=false`, which the listing
   already accepts. The frontend writes each only when set, on both the GET path and the
   `getDriveFilesWithFileIds` POST path (`listingRequest.ts`), and every route above
   forwards them to `apply_file_filters`.
4. The meaning `filter` (`SearchFilter`, `filterFromParsed`, `filterQueryParam`) gains
   `exclude_tags`, `exclude_kinds`, `exclude_folders`, `exclude_collections`, `has_tag`,
   `has_collection`, and carries `favorite: false` / `liked: false` for the negated
   flags. Each is written only when set; a query with no new token writes the same
   `filter` as today. The text search, the image search, "Show more by similarity" and
   the continuation carry it as they carry the other keys.
5. `POST /api/internal/files/matching` (`FileMatchingRequest`) gains the same six keys,
   default empty / null.
6. In `apply_file_filters`, every new condition is ANDed with the existing ones and with
   each other:
   - `exclude_tags`: the file carries none of the named tags, case-insensitive, matched
     against every Tag row the file links to, as `tags` matches today.
   - `exclude_kinds`: the file matches none of the kinds' predicates (`_kind_predicate`),
     so `-type:document` also excludes text, PDF and EPUB files.
   - `exclude_folders`: the file is in none of the folders or their subfolders, compared
     as `path:` compares (case-sensitive, whole segments).
   - `exclude_collections`: the file is in none of the request drive's collections whose
     names match (case-insensitive). A name with no collection excludes nothing.
   - `has_tag=true`: the file links to at least one Tag row; `false`: to none.
   - `has_collection=true`: in at least one collection; `false`: in none. Smart
     Collections are not collections here.
   - With `file_ids` (an `in:` naming a Smart Collection), the exclusions narrow the
     widened set too: a member of that Smart Collection that an exclusion names is not
     listed.
7. Validation. On the listing each new key answers what its positive counterpart answers
   for a bad value: `exclude_type` and the two `has_` keys 422 (request validation, as
   `type` and `favorite`), `exclude_folder` and `exclude_collection` 400 (as `folder` and
   `collection`), with the same normalisation and the caps of 10. On `/files/matching`
   and in the addon a bad value is 422: `exclude_tags` follows `tags` (200 characters, 20
   distinct, counted apart from `tags`), `exclude_kinds` follows `kinds` (the `markdown`
   alias, at most 8 distinct), `exclude_folders` and `exclude_collections` follow `folders` and
   `collections`, and the `has_` keys are strict booleans.
8. Smart Collection evaluation (`smartCollectionEval.ts`) passes the new conditions on
   its listing requests and in its `filter`, and treats an impossible combination as it
   treats an impossible kind or range today. It sends `-in:` names as
   `exclude_collection` without classifying them, as it sends `in:` names as
   `collection`.
9. App targets. A query with a new token has no direct listing target:
   `resolveAppTarget` (Reading, and the knowledge addon's Notes and Clips) and
   `resolveVideoTarget` report `unsupported_part` for it, `has:` included, as
   `resolveAppTarget` already does for a negated operator. The member path
   (`resolveMemberTarget`) accepts a query that has free text or a new token, so such a
   Smart Collection is usable through its evaluated members, exclusions applied; a query
   with `modified:` stays refused, as today. A query with neither free text nor a new
   token resolves exactly as today. Every place that decides whether a Smart Collection
   can be chosen counts the member path: Video's header (`VideoAppHeader.tsx`) and its
   `?target=` handling (`useVideoApp.ts`) take `resolveVideoTarget(folder).usable ||
   resolveVideoMemberTarget(folder) !== null`, as Reading and Notes already do. The
   member path's limit of 10,000 members holds (user choice, 2026-11-23): a Smart
   Collection of exclusions alone (`-path:Work`) on a drive with more files than that
   shows この対象は使えません in Video and Reading, and in Notes and Clips is shown
   disabled while the default target stays in force, as any member target over the limit
   does today in each app. When the query has no free text, the member evaluation and
   the `in:` resolution stop after the first listing page whose `meta.total` exceeds
   10,000 and report too large without reading further pages; with free text they read
   every page, as today.
10. Deployment: the addon PR merges first and the core PR carries the pointer bump, as
    for SPEC-ADDON-143.

SPEC-ADDON-177:

1. `SearchFilter` gains `exclude_tags`, `exclude_kinds`, `exclude_folders`,
   `exclude_collections` (lists, default `[]`) and `has_tag`, `has_collection`
   (`StrictBool | None`, default `None`), normalised and capped as the core does (sending
   step 7). The addon's accepted kinds gain `epub`, for `kinds` and `exclude_kinds`
   alike, so `type:epub` and `-type:epub` pass the meaning stage as the parser and the
   core accept them.
2. The body sent to `/files/matching` carries each new key only when it is set (a
   non-empty list, a non-null boolean), after normalisation and unchanged, so a filter
   with none of them sends exactly today's body.
3. Everything else of SPEC-ADDON-065 applies unchanged.

### 2. Failure cases

- A negated operator with an unusable value (`-type:movie`, `-has:comment`): the token,
  `-` included, is text.
- An impossible combination: nothing is requested; the chips stay.
- `-in:` naming only a Smart Collection: the refused state; nothing is requested.
- Reading the collections for `-in:` fails: `inNameFailed`, as for `in:`.
- More than 20 distinct excluded tags: the listing answers, and the meaning stage fails
  with 422 as it does today for more than 20 `tag:`.
- A malformed new parameter on the listing: 400 or 422 (sending step 7); in `filter` or
  `/files/matching`: 422. The frontend never sends either.
- An addon from before this change behind a core after it: the addon rejects a `filter`
  with the new keys (422) and the meaning stage fails as for any 422. A core from before
  this change behind an addon after it: a filter with a new key is rejected by the core
  (`extra="forbid"`) and the addon answers 503; a filter without one is sent as today
  and answers as today. Neither is reachable on `develop` (sending step 10).

### 3. States

Per search, the states of SPEC-CORE-039 and SPEC-CORE-116 are unchanged, and a change of
any new condition is a change of the filter. One state is added to the `in:` resolution's
(resolving → resolved / failed / too large): *refused*, entered when a `-in:` name only a
Smart Collection carries is classified; it shows its notice without 再試行 and hides
results, count and empty state; it is left by a change of the `in:` / `-in:` names or a
reload. The 「＋ 条件」 first level gains two entries that act at once, as 「お気に入り」
does, so no new level.

### 4. Data read and written

- Core: reads `file_tags`, `tags`, `collection_items`, `collections`, `files`. Writes
  nothing.
- Intelligence: reads what SPEC-ADDON-065 reads. Writes nothing.
- Browser: nothing new stored; the search cache keys by the query text and is skipped for
  a query with a `-in:` name.

### 5. External services

None.

### 6. Authorization

Unchanged. `exclude_collections` and `has_collection` resolve only the request drive's
collections, as `collections` does. Internal API policy, endpoint 15: R1, tags and
collections are core entities shown in the core UI; R2, the keys name tags, kinds,
folders and collections, no addon; R3, row 15's exception stands; R4, read-only.

### 7. Effect on existing features

- Every route taking `FileFiltersQuery`, and `/files/matching`: new optional inputs only.
- A query without a new token parses, chips, sends and lists exactly as today.
- A query that today contains a word such as `-tag:x` or `has:tag` searched it as text;
  it now excludes or filters, and a query whose only words were such tokens has no free
  text any more. `"-tag:x"` in quotes stays text.
- Smart Collections store the query text; a saved one with new tokens is evaluated with
  them. In Video, Reading, Notes and Clips it is offered through the member path.
- The Ask page's scope keeps only positive `path:`, `in:`, `tag:` and `type:` tokens
  (`scopeStringFromRaw`), so it drops new tokens as it dropped them as text before; its
  menu is unchanged.
- `hasOperators` becomes true for a query whose only operators are new tokens, so that
  query hides scene search and the operator-free slots as any operator query does.
- `core-search-vocabulary.test.ts` counts change with the new keys.
- `in:` handling, `size:`, `duration:` and `modified:` are unchanged.
- The addon's `epub` kind also makes an Ask scope with `type:epub` work, which the addon
  answered 422 before (SPEC-ADDON-064 I3 parity).

### 8. Error behavior

As in 2. The core logs nothing new; the addon logs a 422 `filter` at no level above INFO,
as today.

### 9. User-visible behavior

- `tag:trip -tag:2023` lists files tagged `trip` and not `2023`. `-has:tag` alone lists
  the drive's untagged files, newest first. `-path:Work` alone lists every file outside
  `Work`; saved as a Smart Collection it keeps listing every such file, files added
  outside `Work` included. `path:Photos -path:Photos/raw` lists Photos without its `raw`
  subtree. As the target of Video, Reading, Notes or Clips, such a Smart Collection
  works up to 10,000 files and is unusable above that.
- Negated chips and `has:` chips as in chips step 1 and the Design section.
- 「＋ 条件」 gains 「タグなし」 and 「コレクション未登録」.
- New strings in `messages-core/ja.json` and `en.json`: the 「除外」 word, the four `has:`
  labels, the two menu entries, the refused notice.
- `docs/user-guide/search.md`: the operators table gains `has:tag` and `has:collection`,
  and a paragraph on `-`: which operators take it, that operators alone list everything
  they let through (`-path:Work`), that `-in:` takes regular collections only, that size,
  duration, modification time and plain words do not take it, and that a Smart
  Collection with `-` or `has:` serves as an app's target up to 10,000 files.
  `docs/reference/api.md`: the listing's new parameters. `docs/ADDON-DEVELOPMENT.md`: the
  `/files/matching` body, the `filtered_drive_files` parameters, and `unsupported_part`
  naming `has:`. `docs/addons/intelligence.md`: the `filter` keys.

### 10. Non-functional

- Each new condition is one predicate (`NOT EXISTS` / `EXISTS` / `NOT IN`) on the
  drive-bounded query; no index is added, as for `tags` and `collections` today.
- Caps as in sending step 7.
- Privacy: nothing new leaves the Docker network.

## Design

The agreed design is variant A of
`docs/process/reviews/feature-search-operator-negation/design/` (artifact URL in that
directory's `README.md`), chosen by the user on 2026-11-23. Its visible decisions:

- A negated chip has no fill: transparent, with a 1 px `warm-silver`-toned inner border,
  the same radius, height, padding and text size as a positive chip, so it is told apart
  by more than colour.
- Inside it, before the operator label, the word 「除外」 / "Exclude" in `text-muted`; then
  the label in semibold and the value, as in a positive chip; then ✕.
- A `has:` chip is a positive chip (sand fill) holding its label only, with no 「除外」.
- A negated chip whose value is too long truncates the value with an ellipsis inside the
  row's width; 「除外」, the label and ✕ stay visible (`Phone.dc.html`, 375 px).
- Chip order is the query's order; positive and negated chips are not grouped.
- 「＋ 条件」's first level lists, in order: タグ, 種類, フォルダ, コレクション, サイズ, 長さ,
  更新日, お気に入り, タグなし, コレクション未登録, all in the existing row style;
  「タグなし」 is drawn disabled while the query holds a `tag:` (`Menu.dc.html`).

## Touch points

Core:
- `frontend/src/lib/searchQuery.ts`: tokenizing `-`, `has:`, `ParsedQuery`,
  `SearchFilter`, `filterFromParsed`, `filterQueryParam`, `operatorChips`,
  `removeOperatorChip`, `activeOperatorValue`, `completeOperator`, `suggestValues`, the
  impossible check.
- `frontend/src/lib/inNameResolution.ts`: `-in:` classification, the refused outcome,
  the save check.
- `frontend/src/lib/api.ts`, `frontend/src/lib/listingRequest.ts`,
  `frontend/src/components/folder/useFolderFiles.ts`,
  `frontend/src/components/search/useFileSearch.ts`.
- `frontend/src/lib/smartCollectionEval.ts` (the early stop), `frontend/src/lib/appTarget.ts`,
  `frontend/src/lib/videoAppTarget.ts`, `frontend/src/lib/memberTarget.ts`,
  `frontend/src/lib/readingAppTarget.ts`,
  `frontend/src/components/videoapp/VideoAppHeader.tsx`,
  `frontend/src/components/videoapp/useVideoApp.ts`,
  `frontend/src/app/app-api/smart-collection-members/route.ts`.
- `frontend/src/components/search/SearchFilterChips.tsx`,
  `frontend/src/components/search/ConditionMenu.tsx`,
  `frontend/src/components/search/SearchQueryHeader.tsx`,
  `frontend/src/components/search/useLauncherRows.ts`,
  `frontend/src/components/search/InNameNotice.tsx`,
  `frontend/src/components/SmartFolderSaveButton.tsx`,
  `frontend/src/components/GlobalSearch.tsx`, `frontend/src/components/FolderBrowser.tsx`.
- `frontend/src/messages-core/ja.json`, `frontend/src/messages-core/en.json`;
  `core-search-vocabulary.test.ts`.
- `frontend/e2e-components/`: the negated chip with a 200-character folder at 375 px,
  measured in a real browser in CI.
- `backend/app/routers/drives.py`: `FileFiltersQuery`, `apply_file_filters`,
  `filtered_drive_files` and its callers (listing, folder-counts, tag-counts).
- `backend/app/routers/shelves.py` (`ShelfQuery` and its `filtered_drive_files` call).
- `backend/app/routers/internal.py` (HIGH): `FileMatchingRequest`.
- `.claude/rules/internal-api-policy.md`: row 15's note names the new keys.
- `backend/tests/`: each condition, its validation, parity across the listing routes and
  matching.
- `docs/process/reviews/feature-search-operator-negation/design/`: the agreed design.
- R-5: the 「＋ 条件」 first level (ten entries) and a negated chip with a long value at
  375 px in the running app, with no overflow; the refused notice on the page and in the
  window.
- Docs: `docs/user-guide/search.md`, `docs/reference/api.md`,
  `docs/ADDON-DEVELOPMENT.md`, `docs/addons/intelligence.md`.

Addon (`addons/intelligence`, its own PR, then the pointer bump):
- `app/file_matching.py`: `SearchFilter`, `KINDS` (`epub`) and the `/files/matching` body.
- `tests/`: the parity table against the core's validators, and the wire shape.

## Invariants

I1. A query with no new token produces the same `ParsedQuery` fields, chips, listing parameters and `filter` as before this change, and the addon sends the same `/files/matching` body for a filter with no new key.
I2. For any combination of conditions including the new ones, `POST /files/matching` returns exactly the ids `GET /files` and `POST /files/query` return for the same conditions with no `search`, `path` or `trust`, and `/folder-counts`, `/folder-counts/query`, `/shelves`, `/shelves/query`, `/tag-counts` and `/tag-counts/query` count or list only files that `GET /files` keeps.
I3. `-tag:a` keeps every file that carries no tag named `a` in any letter case, untagged files included, and drops every file that carries one.
I4. `-type:document` keeps no text, PDF or EPUB file; `type:document -type:pdf` keeps text files and drops PDFs.
I5. `-path:A` drops files in `A` and in every folder under `A`, and keeps files in a sibling folder whose name starts with `A` (such as `AB`) and in `a` when `A` is written.
I6. `-has:tag` keeps exactly the files with no tag; `has:collection` keeps exactly the files in at least one collection of the drive, and a file that is only in a Smart Collection's results counts as in no collection.
I7. Every impossible combination listed in this spec requests nothing, and `in:x -has:collection`, `type:document -type:pdf` and `path:A -path:A/b` are requested.
I8. Removing a chip removes exactly the tokens with its operator, value and polarity and leaves every other token's raw string, including the opposite polarity of the same value, unchanged.
I9. A `-in:` naming only a Smart Collection requests no listing and no meaning search, shows the refused notice without 再試行 on the page and in the window, and saving or overwriting a Smart Collection with it writes nothing; a `-in:` naming a regular collection excludes its members.
I10. The parser turns into text every negated folder, collection and kind and every `has:` value that the core or the addon would reject; for the folder, collection and kind values and the booleans `true` / `false` the frontend sends, the listing, `/files/matching` and the addon's `SearchFilter` accept and reject the same values.
I11. A query with new tokens sends equivalent conditions to the listing and inside `filter` on the search page, the image-query page and in the window, in the continuation and in "Show more by similarity", and the addon forwards them to `/files/matching` unchanged.
I12. A Smart Collection evaluation and a member target built from a query with new tokens never list a file the search page for the same query does not list, except for a `-in:` name that only a Smart Collection carries, which the page refuses; a direct app target with a new token is `unsupported_part` and sends no listing request.
I13. With `in:` naming a Smart Collection, a member of it that an exclusion names is not listed.
I14. 「タグなし」 and 「コレクション未登録」 each append exactly one token that parses back as `-has:tag` / `-has:collection` and submit once, and are disabled under the conditions stated; no 「＋ 条件」 choice adds a value the query already holds in either polarity or makes the query impossible.
I15. `-tag:`, `-type:` and `-is:` suggest the positive operator's values and completing keeps the `-`; a tag held in either polarity is not suggested.
I16. A negated chip's accessible name and its ✕'s contain 「除外」 / "Exclude"; the four `has:` chips carry their labels; at 375 px in a real browser a negated chip with a 200-character value is no wider than the chip row and 「除外」, its label and ✕ stay visible.

I17. A Smart Collection whose query holds a new token and whose evaluation has at most 10,000 members can be chosen as the target of Video, Reading, Notes and Clips, and Video accepts its `?target=` link; above 10,000 Video and Reading show この対象は使えません and Notes and Clips keep their current fallback; with no free text the evaluation reads no listing page after the first one whose `meta.total` exceeds 10,000.
I18. A query whose `-in:` name is refused evaluates no `in:` Smart Collection; an impossible query loads no list; adding or removing a `-in:` name classifies again.
I19. `has:` and `-has:` suggest only `tag` and `collection` not already held in either polarity; `type:epub` and `-type:epub` pass the addon's `filter` validation.

## Revises

SPEC-CORE-116 I6. A query with no `in:` name and no new token loads no list, waits for nothing and sends exactly today's requests on the search page and in the search window; a query with no `in:` or `-in:` name, whatever new tokens it holds, loads no list and waits for nothing; and `evaluateSmartCollection` sends exactly today's requests for every query with no new token.
SPEC-CORE-116 I7. Creating or overwriting a Smart Collection whose query has an `in:` or `-in:` name resolving only to a Smart Collection writes nothing and shows the refusal toast; a needed list that fails to load writes nothing and shows today's failure toast; while the lists load a second press sends nothing; a query with neither saves exactly as today.
SPEC-CORE-103 I3. Pressing the button or the enabled menu row, for a query with no `in:` and no `-in:` name, sends exactly one `PATCH /api/drives/{drive}/smart-folders/{id}` for the page's drive and that id, whose body is `{query: <trimmed URL q>, file_type: <URL type or null>}` as they were at the press and nothing else, without opening a dialog; for a query with such a name it first loads the needed lists and sends that one `PATCH` only when no name resolves only to a Smart Collection; while the lists load or the request is in flight the button and the row are disabled and a second press sends nothing.
SPEC-CORE-109 I12. The search page's own loading is unchanged for every query with no `in:` name and no new token: the same requests, page size, merge, search cache and continuation offer as before; a query with such a name waits for its resolution, skips the search cache, sends `file_ids` through the POST routes when an `in:` name resolves to a Smart Collection, and sends nothing when a `-in:` name resolves only to one.
SPEC-CORE-109 I1. For the same drive, query, type, sort (other than random), order and scene-search value, `evaluateSmartCollection` returns the same files in the same order as the search page's Files view after every page has loaded (both with a successful addon status), image continuation rows excluded, and for a fixed fixture equals that fixture's expected list, except for a query with an `in:` name that resolves only to a Smart Collection, which the page expands (SPEC-CORE-116) and the evaluation sends as a collection name, and a query with a `-in:` name that resolves only to one, which the page refuses and the evaluation sends as an excluded collection name; meaning search failing (other than 404) or the availability lookup failing gives `complete: false`, and a cached failed lookup is fetched again; the addon off for the drive, or meaning search answering 404, gives a complete listing-only result; an impossible query sends no request.
SPEC-CORE-044 I10. `SearchQueryHeader` offers the same entries in the same order, with the same exclusions and submit, as before `ConditionMenu` was extracted, except that on the search page its 「コレクション」 lists collections and Smart Collections together (SPEC-CORE-116 step 6) its first level ends with 「タグなし」 and 「コレクション未登録」 after 「お気に入り」, and its lists and 「お気に入り」 also leave out or disable what menu step 3 of SPEC-CORE-172 names; the Ask page's menu offers 「フォルダ」, 「コレクション」, 「タグ」, 「種類」 and never 「お気に入り」, 「タグなし」 or 「コレクション未登録」, and a choice there sends no request to `/ask`; the collection page with no `collection-actions` entry renders the same DOM as before.
SPEC-CORE-059 I12b. A smart folder with a query part the app does not support as a direct target (`duration`, and a negated or `has:` token among them) is chosen only through the member path, when its query has free text or a negated or `has:` token and no `modified:`; otherwise it cannot be chosen.
SPEC-CORE-117 I8. In Video and Reading, a member target sends no request under the target before its evaluation succeeds; every request after it carries `file_ids` = the evaluated members and `type` within the app's base kinds, and none of the target query's own conditions, while the face's and page's own conditions (folder chips, tag filter, watch state, URL folder and tag, `key`, `ids`) apply as today; no Discover cache entry is read or written; a failed evaluation replaces each face's or page's body with one retry control and a set over 10,000 with the この対象は使えません line, the header count is hidden, the Target control shows the Smart Collection's name, and neither falls back to the default target; a Smart Collection with neither free text nor a negated or `has:` token produces exactly today's requests carrying the target and today's usability (the apps also request the collection list on mount, SPEC-CORE-118).
SPEC-CORE-116 I4. On the search page and in the search window, an `in:` name that equals a collection (case-insensitively) is sent in `collection` / `collections` and never evaluated; one that equals only a Smart Collection is never sent as a name and contributes that Smart Collection's members (evaluated with its own `in:` names as collections only) to `file_ids`; a name equal to neither kind is sent in `collection` / `collections` without evaluation; the Smart Collection list is requested only when some `in:` or `-in:` name equals no collection; every listing page and meaning-search request of one resolution carries the same `file_ids`, and only a change of the `in:` key (the query's `in:` and `-in:` names with their polarity), 再試行 or a reload resolves again (a `q`, `type`, sort, order, view, scene-search or `trust` change and a listing reset do not).
SPEC-CORE-138 I18. Within one search run, every listing request, the meaning `filter`, the continuation and "Show more by similarity" carry identical `modified` wire forms. A Smart Collection named by `in:` keeps the `now` of the run that resolved its names and is not evaluated again until the `in:` key changes (the `in:` and `-in:` names, SPEC-CORE-116 I4 as revised by SPEC-CORE-172).
SPEC-CORE-099 I6. `resolveReadingTarget` returns the same result as before for every folder with neither free text nor a negated or `has:` token, so the Reading app requests and lists the same books for those; a folder with free text or such a token is a member target that lists its evaluated members of the base kinds and is always usable unless it holds `modified:`.

## Checked, no action

- A Smart Collection saved before this change whose query holds the words `-in:x`, where
  `x` is now only a Smart Collection's name: its evaluation excludes nothing for `x`
  (sending step 8), while the search page refuses it. Saving such a query now is refused,
  and a saved query held that word only as text before; not handled.
- `has_tag` and `exclude_tags` count every Tag row a file links to, as `tags` does; the
  shelves' `no_tag` group counts only this drive's rows. They differ only for a file
  moved across drives before its tags followed it; not aligned here.
- SPEC-CORE-115 I2 ("answer exactly as before for every request") and SPEC-CORE-093 I8
  are scoped to their own changes: a request that carries one of this change's new keys
  is a new request, as the `size` and `modified` keys were for them; requests without
  the new keys are unchanged (I1).
- Negating `size:`, `duration:`, `modified:`: the opposite comparison says the same.
- Negating free text: not added (Summary).
- `-in:` of a Smart Collection: refused (Summary). Expanding it would add an excluded-id
  list to the listing, the meaning request and the addon; it can be added later without
  changing what is written here.
- Direct app targets for new tokens: not added (user choice, 2026-11-23). The member path
  lists the evaluated members with the exclusions applied; a direct target would lift
  the 10,000 limit but add six keys to every app's See-all URL and request, where a
  missed key silently drops an exclusion.
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
- A parser cap on tags: `tag:` has none today and `-tag:` follows it (Failure cases).
- An index for the new predicates: none, as for `tags` and `collections`.
