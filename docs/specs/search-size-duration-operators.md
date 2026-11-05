# Search by file size and by length: `size:` and `duration:` operators

SPEC-ID: SPEC-CORE-044
SPEC-ID: SPEC-ADDON-064

Approval: sha256:31f668629c7feb47137a54c771328031082784cb708c206929c7d6e3ca49d3fd Yuichi Senga 2026-11-05

## Summary

Search operators today are `tag:`, `type:`, `is:`, `path:` and `in:`
(`frontend/src/lib/searchQuery.ts`). Since SPEC-CORE-039 / SPEC-ADDON-047 they filter both
the name listing and the hits by meaning, and since SPEC-CORE-043 any value can be quoted.
There is no way to find large files to clean up, or short and long videos. This change adds
two range operators, `size:` (file size) and `duration:` (length of a video or audio
file), written with a comparison: `size:>1GB`, `size:<=500MB`, `duration:>=30m`,
`duration:<1:30`. A range is two comparisons side by side (`size:>100MB size:<1GB`). The
frontend turns each comparison into a number (bytes, seconds), so the core and the addon
compare numbers and never parse units. The results page's 「＋ 条件」 menu gains 「サイズ」
and 「長さ」 with fixed presets.

- **SPEC-CORE-044**: parsing `size:` / `duration:` with their units, chips and chip
  removal, the two menu entries with presets; the listing `GET /api/drives/{name}/files`
  gains repeated `size` and `duration` parameters; the Internal API
  `POST /files/matching` gains `sizes` and `durations`.
- **SPEC-ADDON-064**: intelligence's `filter` accepts `sizes` and `durations` with the
  same validation as the core and passes them through.

Decided by the user on 2026-11-05 and not reopened here: a comparison is required (`>`,
`>=`, `<`, `<=`); a value with no comparison (`size:1GB`) is text; no `a..b` range syntax;
sizes are binary multiples (1 KB = 1024 bytes), as `formatFileSize` displays them; size
units `B`, `KB`, `MB`, `GB`, `TB` and the short forms `K`, `M`, `G`, `T`, case-insensitive,
decimals allowed, no unit meaning bytes; length units `s`, `m`, `h` and their
combinations (`1h30m`), the displayed forms `m:ss` / `h:mm:ss`, no unit meaning seconds;
files without a duration (everything but video and audio) never pass a `duration:`
comparison; a duration is compared in the whole seconds the UI shows (the fraction
dropped), a size in exact bytes; the menu offers presets. `added:` and the other candidates stay rejected
(SPEC-CORE-043, Checked, no action).

## Required items

### 1. Normal flow

Terms. *Comparison*: a pair (operator, number) with operator one of `gt`, `gte`, `lt`,
`lte` for `>`, `>=`, `<`, `<=`. *Size comparison*: the number is a whole number of bytes.
*Duration comparison*: the number is seconds, a finite number with at most three decimals.
*Wire form*: the string `<operator>:<number>`, for example `gte:1073741824` or `lt:90`;
the number is written in plain decimal without exponent, with no trailing `.0`.

SPEC-CORE-044, parsing (`searchQuery.ts`):

1. A `size:` or `duration:` token is read through the existing tokenizer (SPEC-CORE-043
   rules 1–4); its value, quoted or bare, is first NFKC-normalised, so full-width digits,
   `＞`, `＜`, `＝` and `：` read as their ASCII forms, and whitespace inside the value is
   removed.
2. The value must start with `>=`, `<=`, `>` or `<` (longest first). What follows is the
   amount. A value with no comparison, an empty amount, or an amount that does not parse
   is text, contributing its raw string as SPEC-CORE-043 rule 2 states.
3. Size amount: a non-negative decimal number (`1` and `1.5` parse; `.5` and `1.` are text)
   followed by an optional unit, case-insensitive: none or `B` (×1), `K` or `KB` (×1024),
   `M` or `MB` (×1024²), `G` or `GB` (×1024³), `T` or `TB` (×1024⁴). The bytes are the
   product rounded to the nearest whole number (halves away from zero). A result above
   2⁵³ − 1 is text.
4. Duration amount, one of:
   - a non-negative decimal number with no unit: seconds;
   - one or more `<number><unit>` parts with units `h`, `m`, `s` (case-insensitive), each
     unit at most once and in the order h, m, s (`1h30m`, `90s`, `1.5h`, `2m30s`); the
     seconds are the sum;
   - `m:ss` or `h:mm:ss`, where `ss` and `mm` are two digits below 60 and the first field
     is any number of digits (`1:30` is 90, `1:05:00` is 3900).
   The seconds are rounded to three decimals. A result above 10,000,000 seconds is text.
5. `ParsedQuery` gains `sizes: Comparison[]` and `durations: Comparison[]`, in order of
   first appearance, deduplicated by (operator, number). A `size:` or `duration:` token
   sets `hasOperators`. Counting after deduplication, the fifth and later distinct
   comparisons of one operator are text.
6. *Impossible range*: the comparisons of one operator admit no value (for sizes, no whole
   number of bytes ≥ 0; for durations, no number ≥ 0). Examples: `size:>1GB size:<500MB`,
   `size:<0`, `duration:>10m duration:<=10m`. A query with an impossible range requests
   nothing, as a query whose kinds are impossible does today (`resolveKinds(...).
   impossible`), on both the results page and in the modal.

SPEC-CORE-044, chips:

1. One chip per distinct comparison, in the order of first appearance: 「サイズ <value>」 /
   "Size <value>" and 「長さ <value>」 / "Length <value>". The value is the token's value
   after rule 1 (NFKC, whitespace removed), as first written; the chip's `title` and the ✕'s
   accessible name carry it too.
2. ✕ removes every `size:` (or `duration:`) token whose comparison equals the chip's
   (same operator and same number), keeping every other token's raw string
   (SPEC-CORE-043 rule 4): `size:>1GB size:>1024MB` give one chip, and its ✕ removes both.

SPEC-CORE-044, sending:

1. `SearchFilter` gains `sizes: string[]` and `durations: string[]`, the wire forms of the
   parsed comparisons. `filterQueryParam` writes them only when non-empty, after the
   existing keys (`…,"folders":…,"collections":…,"sizes":[…],"durations":[…]`).
   Everything SPEC-CORE-039 and SPEC-CORE-043 say about a filtered query applies
   unchanged, including "Show more by similarity" (`/search/images`), which carries the
   same `filter`. The impossible-range check applies wherever the impossible-kinds check
   applies today: the listing request, the meaning search's eligibility, and the
   continuation.
2. The results page (`useFolderFiles`, search branch) and the modal (`useFileSearch`) send
   each size wire form as a repeated `size` parameter and each duration wire form as a
   repeated `duration` parameter of `getDriveFiles`.
3. `GET /api/drives/{name}/files` accepts `size: list[str]` and `duration: list[str]` in
   the wire form. Both go through `apply_file_filters`: every comparison must hold
   (AND); `size` compares `File.file_size` in bytes as stored; `duration` compares the
   whole seconds the UI shows, that is `File.duration` with its fraction dropped (90.4
   seconds is compared as 90, as `formatDuration` shows it as 「1:30」); a row whose
   `duration` is NULL never passes a duration comparison. The existing parameters are
   unchanged and combine as AND.
4. `POST /api/internal/files/matching` gains `sizes: [str]` and `durations: [str]`,
   default `[]`, resolved by `apply_file_filters` as in the listing.
5. Validation, identical on the listing (400), on `/files/matching` (422) and in the addon
   (422): each item matches the wire form; the operator is one of the four; a size number
   is a whole number from 0 to 2⁵³ − 1; a duration number is finite, from 0 to 10,000,000,
   with at most three decimals; items equal after parsing count once; at most 4 distinct
   items per list. An impossible range is not an error: it answers no ids.

SPEC-CORE-044, 「＋ 条件」 menu (results page):

1. The first level becomes 「タグ」, 「種類」, 「フォルダ」, 「コレクション」, 「サイズ」, 「長さ」,
   「お気に入り」, in that order.
2. 「サイズ」 opens a value list in the same popup with three presets:
   「10 MB 未満」 / "Under 10 MB" (`size:<10MB`), 「100 MB 以上」 / "100 MB or more"
   (`size:>=100MB`), 「1 GB 以上」 / "1 GB or more" (`size:>=1GB`). 「長さ」 has
   「5 分未満」 / "Under 5 min" (`duration:<5m`), 「30 分以上」 / "30 min or more"
   (`duration:>=30m`), 「1 時間以上」 / "1 hour or more" (`duration:>=1h`). There is no
   filter input, no loading state and no request: the lists are fixed.
3. A preset is not offered when its comparison is already in the query, or when adding it
   would make the range impossible. When no preset is left, the list shows one muted row
   (wording is the implementer's) and the back item. When the query already holds 4
   distinct comparisons of that operator, the first-level entry is disabled.
4. Choosing a preset appends its token through the shared writer (closing an open quote
   first, SPEC-CORE-043 rule 7) and submits once, as the other lists do.

SPEC-ADDON-064:

1. `SearchFilter` gains `sizes: list[str]` and `durations: list[str]`, default `[]`,
   validated as SPEC-CORE-044 sending step 5, and passed to `/files/matching` unchanged
   after normalisation (each item rewritten in the wire form, duplicates removed).
2. Everything else of SPEC-ADDON-047 and SPEC-ADDON-063 applies unchanged; unknown keys
   are already rejected.

### 2. Failure cases

- A value that does not parse (`size:big`, `size:1GB`, `duration:>1x`, `duration:>1:75`):
  the token is text and is searched as a word, as an unknown kind is today.
- An impossible range: nothing is requested and the list is empty, as for impossible
  kinds; the chips still show, so the user can remove one.
- `duration:` on a drive of documents: no file has a duration, so nothing matches.
- A malformed `size` / `duration` on the listing: 400; in `filter` or on `/files/matching`:
  422. The frontend never sends either, because the parser turns such a value into text
  and applies the same caps.
- A file whose size or duration changes between the listing and the meaning request: the
  two stages may disagree until the next search, as for tags today.

### 3. States

The meaning-search states of SPEC-CORE-039 are unchanged; a change of `sizes` or
`durations` is a change of the filter, and an impossible range moves the search to *off*
like impossible kinds. The 「＋ 条件」 menu gains two value lists:

| From | To | When |
|---|---|---|
| first level | size presets | 「サイズ」 |
| first level | length presets | 「長さ」 |
| a preset list | first level | back item or Escape |
| any open state | closed | Escape on the first level, Tab, outside press, a choice |

Forbidden: offering a preset already in the query or one that makes the range impossible;
the menu staying open after a choice submits.

### 4. Data read and written

- Core: reads `files` (`file_size`, `duration`) in addition to what SPEC-CORE-043 reads.
  Writes nothing.
- Intelligence: reads what SPEC-ADDON-047 reads. Writes nothing.
- Browser: the search cache keys by the whole query text; nothing new is stored.

### 5. External services

None outside the Docker network. The addon-to-core call is the existing one.

### 6. Authorization

Unchanged from SPEC-CORE-043: the listing checks the viewer's access to the drive, the
addon proxy validates `X-Lit-Drive`, and `/files/matching` resolves within the request
drive. Internal API policy: this changes endpoint 15's body. R1: size and duration are
core-owned file metadata shown in the core UI. R2: the new fields name a size and a
duration, no addon or feature. R3: row 15's exception stands. R4: read-only.

### 7. Effect on existing features

- `GET /api/drives/{name}/files`: new optional parameters only; with neither, every answer
  is unchanged.
- Existing operator queries: unchanged. A word that starts with `size:` or `duration:` and
  used to be searched as text is now an operator when its value parses (`size:>1GB`).
- The modal: parses and filters `size:` / `duration:` and shows their chips; its value
  suggestions stay for `tag:`, `type:`, `is:`.
- The `type:` operator and the toolbar's type: unaffected; `duration:` already excludes
  non-media files by itself.
- Smart Folders save the query text; re-running parses it again.
- `frontend/src/__tests__/core-search-vocabulary.test.ts` pins the count of `search`
  translation calls per file; the new keys change those counts.
- MCP `search_files` / `semantic_search`: unchanged.

### 8. Error behavior

As in 2: a failed meaning stage shows the listing alone with no message, as today. The
core logs nothing new; the addon logs a 422 `filter` at no level above INFO, as today.

### 9. User-visible behavior

- `size:>=1GB` lists files of 1 GiB or more, newest first; `type:video duration:<5m 旅行`
  finds short videos about 旅行 by name and by meaning.
- Chips 「サイズ >=1GB」 and 「長さ <5m」, styled and removed like the other chips.
- Menu: 「サイズ」 / "Size" and 「長さ」 / "Length" between 「コレクション」 and 「お気に入り」,
  each with three presets.
- New strings in `messages-core/ja.json` and `en.json`: the two chip labels / menu items,
  the six preset labels, and the "no preset left" row.
- `docs/user-guide/search.md`: the operators table gains `size:` and `duration:` with
  their units and an example of a range; the menu's new entries. `docs/reference/api.md`:
  the listing's `size` and `duration`. `docs/ADDON-DEVELOPMENT.md`: the `/files/matching`
  body. `docs/addons/intelligence.md`: the `filter` keys.

### 10. Non-functional

- Caps as in sending step 5. Each comparison adds one predicate.
- `/files/matching` with size or duration comparisons answers within the bound
  SPEC-CORE-039 set (1 s for a 50,000-file drive); no index is added (the drive predicate
  already narrows the scan).
- Privacy: nothing new leaves the Docker network.

## Touch points

Core:
- `backend/app/routers/drives.py`: `apply_file_filters` gains `sizes` and `durations`;
  `list_drive_files` gains `size` and `duration`; one wire-form parser and validator
  shared with the Internal API model.
- `backend/app/routers/internal.py` (HIGH zone): `FileMatchingRequest` gains `sizes` and
  `durations`.
- `.claude/rules/internal-api-policy.md`: row 15's note lists the new fields.
- `backend/tests/`: listing and matching tests for sizes, durations, parity, NULL
  durations, caps, impossible ranges.
- `frontend/src/lib/searchQuery.ts`: amount parsing, `ParsedQuery`, `SearchFilter`,
  `filterFromParsed`, `filterQueryParam`, `OperatorChip`, `operatorChips`,
  `removeOperatorChip`, the impossible-range check.
- `frontend/src/lib/api.ts`: `getDriveFiles` sends `size` and `duration`.
- `frontend/src/components/folder/useFolderFiles.ts`,
  `frontend/src/components/search/useFileSearch.ts`: the listing parameters and the
  impossible-range check.
- `frontend/src/components/search/SearchQueryHeader.tsx`: the two preset lists.
- `frontend/src/components/search/SearchFilterChips.tsx`: the two chip kinds.
- `frontend/src/messages-core/ja.json`, `en.json`; the counts in
  `frontend/src/__tests__/core-search-vocabulary.test.ts`.
- Existing tests that build a `SearchFilter` or `ParsedQuery` literal
  (`frontend/src/lib/__tests__/searchQuery.test.ts`,
  `frontend/src/lib/__tests__/semanticSearch.passages.test.ts` and any other the type
  change reaches).
- Docs: `docs/user-guide/search.md`, `docs/reference/api.md`, `docs/ADDON-DEVELOPMENT.md`,
  `docs/addons/intelligence.md`.

Addon (`addons/intelligence`, its own PR, then the pointer bump):
- `app/file_matching.py`: `SearchFilter` fields and validation.
- `tests/`: the acceptance tests for the new fields.

## Invariants

I1. For any combination of the existing conditions with `sizes` and `durations`, `POST /files/matching` returns exactly the ids that `GET /api/drives/{name}/files` returns for the same conditions with no `search`, `path` or `trust`.
I2. A size comparison keeps a file exactly when `file_size` satisfies it with the stated operator: `size:>1KB` keeps 1025 bytes and not 1024, `size:>=1KB` keeps 1024, `size:<1KB` keeps 1023 and not 1024.
I3. A file whose `duration` is NULL is never kept by a query with any `duration:` comparison, on the listing and on `/files/matching`.
I4. Size amounts use binary multiples and round to the nearest byte: `1.5GB` is 1610612736 bytes, `1K` equals `1KB` equals 1024, and an amount with no unit is bytes.
I5. Duration amounts read `90`, `90s`, `1m30s`, `1:30` and `0:01:30` as the same 90 seconds, and `1h30m` as 5400.
I6. A query with a size or duration comparison sends the same wire forms to the listing and, inside `filter`, to the meaning search.
I7. A query whose comparisons of one operator admit no value requests neither the listing nor the meaning search.
I8. The parser turns into text every value the core or the addon would reject (no comparison, an unparseable amount, a number out of range, the fifth distinct comparison), and the listing (400), `/files/matching` (422) and the addon's `SearchFilter` (422) accept and reject the same wire forms.
I9. Removing a size or length chip removes exactly the tokens whose comparison equals the chip's and leaves every other token's raw string unchanged.
I10. The menu's size and length lists never offer a preset already in the query or one that would make the range impossible, and a choice appends exactly one token that parses back as that comparison and submits once.
I11. A query with no `size:` or `duration:` token sends the same listing parameters and the same `filter` as before this change.
I12. A duration comparison uses the stored duration with its fraction dropped: a 90.4-second file is kept by `duration:<=1:30` and `duration:>=90`, and not by `duration:>1:30` or `duration:<90`, on the listing and on `/files/matching`.

## Checked, no action

- `a..b` range syntax, a value without a comparison meaning "about", decimal (1000-based)
  sizes, and `=` as a comparison: not added (user choice). `=` on a size or a float
  duration would almost never match.
- An index on `file_size` or `duration`: not added; every query is already narrowed to one
  drive, and the existing `file_size` sort scans the same rows.
- Value suggestions for `size:` / `duration:` while typing in the modal: not added, as for
  `path:` / `in:`.
- Showing chips in a normalised form (「1 GB 以上」) instead of the typed value: the typed
  value is what the user wrote and edits; the presets read naturally in the menu.
- Collapsing redundant comparisons (`size:>1GB size:>2GB`) before sending: both are sent
  and the AND gives the same result.
- Duration of images (animated GIFs) and documents: they have no `duration`, so they are
  excluded, as decided.
- `added:` / `date:`: rejected on 2026-11-05 (SPEC-CORE-043).
- MCP and Ask: they send no `filter`; out of scope as in SPEC-CORE-043.
