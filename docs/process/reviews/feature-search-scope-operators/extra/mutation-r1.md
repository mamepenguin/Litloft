# Mutation review r1 — semantic half (feature/search-scope-operators)

- Core commit: `2053fe73c99d76d33cba5a971249a4feea885a95`, intelligence `18b0378`, merge base `11a00735d`.
- Reviewer: fresh subagent, not the author. Threat model: owner only; bucket A = silently wrong (or broken) in normal use, bucket B = odd input / misuse / unreachable without crafted data.
- Throwaway worktree: `$TMPDIR/opencode/mut-sem` (submodule cloned locally from the main checkout's `addons/intelligence` and checked out at `18b0378`, because origin does not have that commit).
- Backend runs: image `litloft-test-sem` built from the worktree, `backend/app` and `backend/tests` bind-mounted read-only, `pytest -q -p no:cacheprovider --no-cov tests/test_search_scope_operators.py tests/test_internal_files_matching.py` (baseline 119 passed).
- Addon runs: `litloft-intel-acc`, `tests/test_search_scope_filter.py tests/test_filtered_search_contract.py` (baseline 104 passed).
- Frontend runs: `pnpm vitest run src/lib/__tests__ src/components/search/__tests__ src/components/folder/__tests__/useFolderFiles.scope.test.tsx src/components/__tests__/SearchPage.queryHeader.test.tsx src/components/__tests__/GlobalSearch*` (vitest treats these as filters; about 124 files ran). `src/lib/__tests__/shortcuts.test.ts > normalizeKey — every Shift chord…` **fails at baseline too** (it has nothing to do with this change), so it is ignored in every result below.

## Task 1 — tool survivors

### Stryker (frontend/src/lib/searchQuery.ts, 38 survivors)

| Group | Survivors | Verdict | Reason |
|---|---|---|---|
| T1 | #3 (L68 `<=`), #4, #5 (L74), #11 (L80), #12 (L94), #13 (L106) | equivalent | Reading `q[q.length]` gives `undefined`. `WHITESPACE.test(undefined)` tests the string "undefined", which is false, and `QUOTES.has(undefined)` / `=== ":"` are false too. So the loops step one past the end and `slice` clamps. `closed` is still `close < q.length`, and `nameEnd` past the end can never be `atColon`. Tokens are identical. |
| T2 | #14 (L107 value `""`→text), #17 (L163 `name === null`→false) | equivalent | A name-less token is caught by `token.name === null` before `value` is read. With #17, `value === ""` still catches it, because the tokenizer always gives a name-less token an empty value. `activeOperatorValue` / `closeOpenQuote` read only `openQuote`. |
| T3 | #23 (L228 initial `text`) | equivalent | `parsed.text` is always overwritten at L264. |
| T4 | #27 (L385 `true`), #30 (L388 left `true`), #32 / #33 (L391 `\|\|` / left `true`) | equivalent | Only the matching operator variant has a `kind` / `flag` / `folder` property. For any other variant that property is `undefined`, which never equals the chip's value. |
| T5 | #24 (L347), #26 (L371) `toLowerCase`→`toUpperCase` on the dedupe key | equivalent in normal use | The same function builds the key on both the add and the check side, so dedupe stays case-insensitive. It differs only for characters whose upper and lower folds disagree (`ß`/`SS`). That is odd input, bucket B, no finding. |
| T6 | #36, #37 (L420 `PARTIAL` anchors) | unreachable in normal use | The regex runs on `q.slice(replaceFrom)`, which begins after the last space, U+3000 or tab. Without `^`, a match differs only when the slice starts with a colon (`:tag:x`). Without `$`, it differs only for a NBSP or similar `\s` inside the last word. A single-line search field does not produce either. |
| T7 | #1, #2 (`FILE_KINDS` "archive"/"other") | outside the scope | These are pre-existing, unchanged lines (15–24). They are covered only by `uploadQueueRefresh`, so `type:archive` / `type:other` have no parser test. Noted for the owner; it is not counted here. |
| T8 | #28 (L388 → `true`), #29 (`&&`→`\|\|`), #31 (L388 right `true`) | **real gap** → finding 1 | |
| T9 | #34 (L391 right `true`) | **real gap** → finding 2 | |
| T10 | #35 (L394 `true`) | **real gap** → finding 3 | |
| T11 | #38 (L447 `?.`→`.`) | **real gap** → finding 4 | |
| T12 | #15, #16 (L121 regex `^\/+`→`^\/`, `\/+$`→`\/$`) | real gap, bucket B → finding 5 | |
| T13 | #18 (L196), #19–#22 (L210) | real gap, bucket B → finding 6 | |
| T14 | #25 (L360 `seenFlags.has`→false) | real gap, bucket B → finding 7 | |
| T15 | #6, #7, #8, #9, #10 (L76 `nameEnd > start`, `nameEnd + 1 < q.length`) | #8/#9/#10 equivalent; #6/#7 bucket B → finding 8 | With #8/#9/#10, a trailing `name:` gets value `""` and name `name`, and `interpret` turns that into text with the same raw string. With #6/#7, a token that begins with a colon (`:"a b"`) gains the quoted form. |

### mutmut core (drives.py / internal.py, 15 survivors)

| Group | Survivors | Verdict | Reason |
|---|---|---|---|
| M1 | #2, #3, #4, #5, #7, #8 (error message strings) | equivalent | The tests and callers read only the status code. `detail` is not shown in the UI. |
| M2 | #9 (`extra="XXforbidXX"`), #12, #14 (`@field_validator("XX…XX")`) | **killed when rerun**, so the tool result is wrong | Rerun in the worktree, #9 raises `SchemaError: Invalid extra_behavior` and #12 raises `PydanticUserError: Decorators defined with incorrect fields`, both at import, so the suite errors. mutmut 2.5 recorded an import-time collection error as a survivor. |
| M3 | #10, #11 (`= None` defaults) | equivalent | Defaults are not validated. `apply_file_filters` reads `folders or []`. An explicit `null` is still rejected by `list[str]`. |
| M4 | #13, #15 (drop `@classmethod`) | equivalent | Pydantic v2 `field_validator` wraps a plain function the same way. |
| M5 | #1 (`.strip("XX/XX")`), with addon #1 | real gap → finding 9 | |
| M6 | #6 (L153 `continue`→`break` on a duplicate collection name) | real gap, bucket B → finding 10 | |

### mutmut addon (file_matching.py, 6 survivors)

| Group | Survivors | Verdict |
|---|---|---|
| A-M1 | #2–#6 (message strings) | equivalent: `InvalidFilter` is mapped to 422 whatever the text says. |
| A-M2 | #1 (`.strip("XX/XX")`) | grouped into finding 9 |

### Findings from Task 1

### 1. I12: removing the お気に入り (`is:`) chip can remove other conditions
- Bucket: A
- Survivors #28, #29 and #31 live because the only tests that remove an `is:` chip (2 in `SearchPage.queryHeader.test.tsx`) use a query whose only operator is `is:favorite`. With #28, ✕ on 「お気に入り」 empties every operator. With #29/#31, it also removes `is:liked`. The user sees the other conditions disappear and the result set widen. Chip removal is one of the main interactions.
- Frequency × impact: 4 × 6
- Kill input: `removeOperatorChip("is:favorite is:liked tag:x 京都", { operator: "is", flag: "favorite" })` must equal `"is:liked tag:x 京都"`.

### 2. I12 / I5: removing one folder chip removes every `path:` token
- Bucket: A
- Survivor #34 lives because the test "removing a path chip drops every token that produced it" uses `path:Photos/ path:/Photos`, two spellings of the same folder. No test removes one of two *different* folders. Under the mutant, ✕ on 「フォルダ A」 also drops `path:B`, and the search silently widens to the whole drive.
- Frequency × impact: 3 × 6
- Kill input: `removeOperatorChip("path:A path:B", { operator: "path", folder: "A" })` must equal `"path:B"`.

### 3. I12: removing a collection chip next to another operator is untested (the mutant throws)
- Bucket: A
- Survivor #35 lives because the one test that removes a collection chip uses a query of `in:` tokens only. With the guard gone, `accepted.collection.toLowerCase()` runs on a `tag`/`path` token and throws a TypeError, so ✕ breaks the header.
- Frequency × impact: 3 × 7
- Kill input: `removeOperatorChip("in:Trip tag:x path:a", { operator: "collection", collection: "trip" })` must equal `"tag:x path:a"`.

### 4. Rule 7 / I13: a menu choice with an empty query field is untested (the mutant throws)
- Bucket: A
- Survivor #38 lives because `closeOpenQuote` is never called with an empty or whitespace-only string. `SearchQueryHeader.choose` calls it on the current field text, and the 「＋ 条件」 button stays usable after the user clears the field. Without `?.`, picking a tag, folder or collection from an empty field throws.
- Frequency × impact: 2 × 7
- Kill input: `closeOpenQuote("")` must be `""` and `closeOpenQuote("  ")` must be `"  "`. As a component test: clear the field, choose 「フォルダ」 → `Work`, and expect a submit with `path:Work`.

### 5. I10: repeated slashes at either end are not pinned on the frontend
- Bucket: B
- Survivors #15/#16 live. With them, `path://Work` or `path:Work//` becomes text on the frontend, while the core (`strip("/")`) accepts `Work`. Only typed doubled slashes reach this.
- Frequency × impact: 1 × 4
- Kill input: `parseSearchQuery("path://Work//").folders` must equal `["Work"]`.

### 6. Rule 8: the frontend cap-after-dedupe is untested when the duplicate comes before the tenth distinct value
- Bucket: B
- Survivors #18–#22 live because "the cap counts distinct values, not raw tokens" puts the duplicates *after* the ten distinct values, where `includes(...) ||` short-circuits anyway. Under the mutants, `path:a path:a path:b …` (ten distinct, one repeated early) turns the tenth distinct folder into text. That takes ten scope tokens in one query.
- Frequency × impact: 1 × 4
- Kill input: `parseSearchQuery(["path:f0", "path:f0", ...Array.from({length: 9}, (_, i) => `path:f${i+1}`)].join(" ")).folders.length === 10`. Same for `in:C0 in:c0 in:c1 … in:c9`, with `collections.length === 10`.

### 7. I5: a repeated `is:` value producing one chip is pinned only indirectly
- Bucket: B
- Survivor #25: `is:favorite is:favorite` gives two chips under the mutant. The library-level suite has no case for it. It is visible (not silent), and only a typed duplicate reaches it.
- Frequency × impact: 1 × 2
- Kill input: `operatorChips("is:favorite is:favorite")` must have length 1.

### 8. Item 1: a token that starts with a colon is not pinned
- Bucket: B
- Survivors #6/#7 let `:"a  b"` become a single quoted token. That changes `parsed.text` (inner double spaces kept) and makes `closeOpenQuote(':"abc')` append a quote. Odd input.
- Frequency × impact: 1 × 2
- Kill input: `parseSearchQuery(':"a  b" tag:x').text === ':"a b"'` and `closeOpenQuote(':"abc') === ':"abc'`.

### 9. I2 / I10: no folder name begins or ends with a letter, so strip-set mutations live on both sides
- Bucket: A
- Core mutmut #1 and addon mutmut #1 (`strip("XX/XX")`) live because every folder in the fixtures and parity tables ends with a digit, `x` (lower case), `é` or `s`. Any change that widens the strip set silently empties results for folders such as `Project X` or `X-Files`: the listing returns 0, and meaning search gets a different folder.
- Frequency × impact: 1 × 6
- Kill input: core `normalize_folder("/X/Box X/")` must equal `"X/Box X"`, plus a listing row `folder=Project X` that keeps its file. Addon `_parse(folders=["/X/Box X/"]).folders == ["X/Box X"]`.

### 10. I10: a duplicate collection name followed by a distinct one is untested
- Bucket: B
- Core mutmut #6 is the `continue` on line 153, the duplicate-key branch (`if key in seen: continue`), not the blank-name branch. Turned into `break`, every name after the first duplicate is dropped. It lives because every test that has a duplicate puts it last (`["Trip", c0…c7, "trip"]`, `["Trip"] + ["trip"]*9`). The frontend and the addon both send deduplicated lists, so only a direct caller reaches this.
- Frequency × impact: 0 × 5
- Kill input: listing `collection=Trip&collection=trip&collection=資料` must equal `{photo_a, budget, minutes}`, and `/files/matching {"collections":["Trip","trip","資料"]}` must give the same ids.

## Task 2 — semantic mutants

Each mutant was declared want=kill, applied alone, and the file was restored with `git checkout` after the run.

| ID | Invariant | Mutation | Want | Result |
|---|---|---|---|---|
| S1 | I1 | `/files/matching` stops passing `folders` | kill | killed: `TestParagraphParity[a folder]` and 6 more |
| S2 | I1 | `/files/matching` passes only `folders[:1]` | kill | killed: `TestParagraphParity[two folders]` |
| S3 | I1 / I4 | listing ignores `folder` whenever `path` is given | kill | **lived** → finding 11 |
| S11 | I1 / I3 | `/files/matching` resolves collections with `drive="elsewhere"` | kill | killed: `TestParagraphParity[a collection]` and 6 more |
| S4 | I2 | descendants matched by `LIKE folder || '/%'` (ASCII case folds) | kill | killed: `TestFolderScope[a parent folder holds its descendants]` and 4 more |
| S5 | I2 | prefix compared without the trailing `/` (`Photos/2024x` leaks) | kill | killed: `test_photos_2024_never_keeps_photos_2024x_or_lowercase` and 7 more |
| S6 | I2 | equality only, no descendants | kill | killed: `TestFolderScope[a parent folder…]` and 6 more |
| S7 | I2 | `lower()` on both sides of both comparisons | kill | killed: `TestFolderScope[a case-variant folder…]` and 13 more |
| S8 | I3 | collections resolved across all drives (drop `Collection.drive == drive`) | kill | **lived** → finding 12 |
| S9 | I3 / I7 | query names folded with `casefold()`, stored names with `lower()` | kill | **lived** → finding 13 |
| S10 | I3 | collection names compared case-sensitively | kill | killed: `test_a_collection_name_is_case_insensitive[lower/upper]`, `TestParagraphParity[a collection by another case]` |
| S12 | I4 | several folders ANDed (one chained filter per folder) | kill | killed: `test_several_folders_are_the_union_of_their_subtrees`, `TestParagraphParity[two folders]` and 3 more |
| S13 | I4 | several collections intersected | kill | killed: `test_several_collections_are_the_union_of_their_items`, `TestParagraphParity[two collections]` |
| S14 | I4 | folder and collection ORed instead of ANDed | kill | killed: `test_a_folder_and_a_collection_that_never_meet`, `TestParagraphParity[everything at once]` |
| F1 | I5 | a full-width opening quote is closed only by a full-width quote (and `"` only by `"`) | kill | **lived** → finding 16 |
| F3 | I5 (rule 3) | a quote at the start of a free-text word also groups to the next quote | kill | **lived** → finding 18 |
| F4 | I5 (rule 1) | characters after the closing quote stay in the same token | kill | killed: `item 1: characters after the closing quote start a new token` |
| F5 | I5 | `operatorChips` dedupes folders case-insensitively (parse does not) | kill | **lived** → finding 14 |
| F7 | I5 / I12 | `removeOperatorChip` splits on whitespace instead of using the shared tokenizer | kill | killed: `removing a path chip leaves the other tokens' raw strings`, `SearchFilterChips… removes only the folder chip's token` |
| F12 | I5 | an unterminated quote stops at the next whitespace | kill | killed: `item 1: an unterminated quote runs to the end of the query`, `SearchQueryHeader I13 closes the quote, then appends a token of its own` |
| F16 | I5 | only ASCII `"` opens a quoted value | kill | killed: `item 1: a full-width quote and colon read as a quote and colon` |
| F2 | I12 | `removeOperatorChip` re-serialises kept operator tokens with `formatOperatorToken` (lower-cased name, half-width colon, quotes only when needed) | kill | **lived** → finding 17 |
| F6 | I12 | chip removal compares folders case-insensitively | kill | **lived** → finding 14 |
| S18 | I7 | core model `extra="ignore"` | kill | killed: `TestUnknownKeys` ×3 |
| A5 | I7 | addon model `extra="ignore"` | kill | killed: `an_unknown_key_is_invalid`, `…beside_a_known_one…`, `…answers_422` |
| A1 | I7 / I10 | addon drops NFC | kill | killed: `normalises_before_the_core_call[folders-nfc-normalised]` |
| A3 | I7 | addon dedupes collections by `casefold()`, core by `lower()` | kill | **lived** → finding 13 |
| A4 | I7 | addon rejects a blank collection instead of dropping it | kill | killed: `accepts…[blank-collections-dropped]`, `normalises…[collections-trimmed-blank-dropped-case-deduped]` |
| A6 | I7 | addon dedupes folders case-insensitively | kill | killed: `normalises…[folders-stay-case-sensitive]` |
| A7 | I7 | addon strips only the leading `/` | kill | killed: `accepts…[folder-trimmed-of-slashes]` and 2 more |
| A2 | I7 / I10 | addon applies the folder cap before dedupe | kill | **lived** → finding 15 |
| S15 | I10 | core dedupes folders case-insensitively | kill | **lived** → finding 14 |
| S16 | I10 | core applies the collection cap before dedupe | kill | **lived** → finding 15 |
| S17 | I10 | core checks folder length before NFC | kill | lived. Unreachable: the frontend NFCs before it counts, so the core never receives an NFD value near the cap. No finding. |
| S19 | I10 | core uses `rstrip("/")` only | kill | killed: `test_a_folder_is_trimmed_of_slashes` and 2 more |
| S20 | I10 | core drops NFC | kill | killed: `test_a_folder_is_nfc_normalised` |
| F11 | I10 (rule 8) | frontend folder cap counts raw tokens | kill | killed: `the cap counts distinct values, not raw tokens` |

### Findings from Task 2

### 11. I4: the listing's `folder` combined with `path` / `recursive` is untested
- Bucket: B
- S3 lives. Spec listing item 2 says `path`/`recursive` "combine with them as AND", but no test sends both. The frontend sends no `path` with a scope (listing item 1), so only a direct API caller would see `folder` ignored.
- Frequency × impact: 0 × 5
- Kill input: listing `path=Work&recursive=true&folder=Work/2024` must equal `{budget}`.

### 12. I3: the "another drive's collection contributes nothing" test cannot fail
- Bucket: B
- S8 lives. The other drive's `Trip` holds only that drive's file, and both callers already filter `File.drive`. So the `Collection.drive == drive` clause is never what excludes it. Collection item writes and cross-drive moves (`fileops.py`, which deletes items of other-drive collections) keep items on the same drive, so this is reachable only with stale or legacy rows.
- Frequency × impact: 0 × 6
- Kill input: seed a `CollectionItem` that links `OTHER_DRIVE`'s `Trip` to the `TEST_DRIVE` file `root`. Listing `collection=Trip` and `/files/matching {"collections":["Trip"]}` must both still equal `{photo_a, budget}`.

### 13. I3 / I7: the case folding is pinned only with ASCII names
- Bucket: A
- S9 (core resolution: casefold on the query, lower on the stored name) and A3 (addon dedupe by casefold) live. Every collection name in the tests is ASCII or has no case (`Trip`, `資料`, `旅行 メモ`). A later "use casefold" tidy-up on one side would make `in:straße` match nothing for a collection named `Straße`. That gives 0 results with no error, and the addon and the core would also dedupe differently.
- Frequency × impact: 1 × 5
- Kill input: core, a collection `Straße` and listing `collection=straße` must keep its items. Addon, `_parse(collections=["Straße", "STRASSE"]).collections == ["Straße", "STRASSE"]` (two names under `lower()`).

### 14. I2 / I5 / I10: case-variant folders are pinned only on the listing, not in dedupe or chips
- Bucket: B
- S15 (core folder dedupe folds case), F5 (chips dedupe folders case-insensitively) and F6 (chip removal folds case) live. The addon has `folders-stay-case-sensitive`, but the core normaliser and the frontend chips do not. On the case-insensitive file systems Litloft runs on, a `Photos` / `photos` pair cannot exist (spec, Checked, no action), so this is not reached in normal use.
- Frequency × impact: 0 × 5
- Kill input: core listing `folder=Photos/2024&folder=photos/2024` must equal `{photo_a, photo_b, photo_lower}`. Frontend `operatorChips("path:Photos path:photos")` must have length 2, and `removeOperatorChip("path:Photos path:photos", { operator: "path", folder: "Photos" }) === "path:photos"`.

### 15. I10: the "deduplicated before the cap" rows send only ten raw values, so the cap order is untested on core and addon
- Bucket: B
- S16 (core collection cap before dedupe) and A2 (addon folder cap before dedupe) live. `TestCaps[folders-deduped-before-the-cap]` / `[collections-deduped-before-the-cap]` and `test_duplicate_collections_count_once_case_insensitively` all pass exactly 10 raw values, so a raw count never exceeds the cap either. The addon has no such row at all. The frontend sends deduplicated lists, so only a direct caller would get a spurious 400/422.
- Frequency × impact: 0 × 4
- Kill input: 11 raw values with one duplicate (`["Photos/2024", f0…f8, "/Photos/2024/"]`, `["Trip", c0…c8, "trip"]`) must give listing 200, matching 200, and addon accepted with `len(...) == 10`.

### 16. I5 (rule 1): mixed half- and full-width quotes are untested
- Bucket: A
- F1 lives. The tests use `"…"` and `＂…＂` but never mix them. With a Japanese IME the opening quote is easily typed full-width and the closing one half-width (or the other way round). Under the mutant, `path:＂My Photos" tag:x` reads the rest of the query as the folder name, so the tag disappears into the folder value and the scope matches nothing, silently.
- Frequency × impact: 2 × 5
- Kill input: `parseSearchQuery('path:＂My Photos" tag:x')` must give `{ folders: ["My Photos"], tags: ["x"], text: "" }`, and `parseSearchQuery('in:"読書 メモ＂ 京都')` must give `{ collections: ["読書 メモ"], text: "京都" }`.

### 17. I12: "every other token's raw string unchanged" is checked only on tokens whose re-serialised form is identical
- Bucket: B
- F2 lives. The remaining operators in the removal tests are `tag:x` and `path:"My Photos"`, which come out of `formatOperatorToken` byte-identical. A re-serialising removal would rewrite `TAG：x` as `tag:x` or `path:"a"` as `path:a` in the field and in a saved Smart Folder. The parse stays the same, so no result is wrong.
- Frequency × impact: 2 × 2
- Kill input: `removeOperatorChip('TAG：x path:"a" in:Trip', { operator: "collection", collection: "Trip" }) === 'TAG：x path:"a"'`.

### 18. I5 (rule 3): "a quote is special only after a colon" is tested only where both readings give the same string
- Bucket: B
- F3 lives. Both cases in the item-3 test (`"meeting notes"` alone, which hits `q.trim()`, and after a path chip with single spaces) produce the same text under either reading. A query such as `"budget tag:x"` (an operator inside free-text quotes) or `path:a "foo  bar"` would tell the two apart. That is unusual input.
- Frequency × impact: 1 × 3
- Kill input: `parseSearchQuery('"budget tag:x"')` must give `{ tags: ["x"], text: '"budget' }`. `parseSearchQuery('path:a "foo  bar"').text === '"foo bar"'`.

## Summary

| # | Invariant / rule | Source | Bucket | F × I |
|---|---|---|---|---|
| 1 | I12 `is:` chip removal | Stryker #28/#29/#31 | A | 4 × 6 |
| 2 | I12/I5 one folder chip removes all `path:` | Stryker #34 | A | 3 × 6 |
| 3 | I12 collection chip removal beside another operator | Stryker #35 | A | 3 × 7 |
| 4 | rule 7/I13 menu choice on an empty field | Stryker #38 | A | 2 × 7 |
| 5 | I10 `path://a//` | Stryker #15/#16 | B | 1 × 4 |
| 6 | rule 8 early duplicate before the tenth value | Stryker #18–#22 | B | 1 × 4 |
| 7 | I5 duplicate `is:` chip | Stryker #25 | B | 1 × 2 |
| 8 | item 1 token starting with a colon | Stryker #6/#7 | B | 1 × 2 |
| 9 | I2/I10 folder names ending in a letter | mutmut core #1, addon #1 | A | 1 × 6 |
| 10 | I10 duplicate collection before a distinct one | mutmut core #6 | B | 0 × 5 |
| 11 | I4 `folder` with `path`/`recursive` | S3 | B | 0 × 5 |
| 12 | I3 drive clause never decisive | S8 | B | 0 × 6 |
| 13 | I3/I7 non-ASCII case folding | S9, A3 | A | 1 × 5 |
| 14 | I2/I5/I10 case-variant folders in dedupe/chips | S15, F5, F6 | B | 0 × 5 |
| 15 | I10 cap order vs dedupe (core/addon) | S16, A2 | B | 0 × 4 |
| 16 | I5 mixed-width quotes | F1 | A | 2 × 5 |
| 17 | I12 raw strings preserved on removal | F2 | B | 2 × 2 |
| 18 | I5 rule 3 free-text quotes | F3 | B | 1 × 3 |

Tool survivors: 59 in total. 40 are equivalent, out of scope, unreachable, or wrongly reported (mutmut core #9/#12/#14 are killed when rerun). The other 19 fall into findings 1–10. Semantic mutants: 37 run, 24 killed, 13 lived. The 13 survivors map to findings 11–18; S17 is unreachable and has no finding. Bucket A: 7. Bucket B: 11.

TOTAL: 18 findings
