# Search by modification time: the `modified:` operator

SPEC-ID: SPEC-CORE-137
SPEC-ID: SPEC-CORE-138
SPEC-ID: SPEC-ADDON-143

Approval:

## Summary

There is no way to find files that have not changed for a long time, for example to clean
up old downloads in a few folders. `File.created_at` cannot serve: it is the file's mtime
at the moment Litloft first saw it (or the upload time), and it never changes afterwards,
so a note imported two years ago and edited yesterday reads as two years old. The
filesystem's access time cannot serve either: Litloft itself reads every file (hashing,
thumbnails, transcription), and mounts are often `relatime` or `noatime`.

This change keeps the file's real modification time in a new column and adds a range
operator over it, written like `size:`: `modified:<2024-01-01`, `modified:<=2023`,
`modified:>=2024-06`, and relative to now, `modified:<1y`, `modified:>=30d`. Combined with
`path:` (any of the folders), `path:Downloads path:Work/old modified:<1y` lists what has
not changed for a year, and saved as a Smart Collection it keeps meaning "a year before
today". Deleting stays a separate, manual step (the trash, or `trash_files` over MCP).

- **SPEC-CORE-137**: the `files.modified_at` column and when it is written.
- **SPEC-CORE-138**: parsing `modified:`, chips and chip removal, the 「＋ 条件」 entry with
  presets, the listing's `modified` parameter, `POST /files/matching`'s `modified`, and
  the Smart Collection evaluation's time zone.
- **SPEC-ADDON-143**: intelligence's `filter` accepts `modified` with the same validation
  as the core and passes it through.

Decided by the user on 2026-11-18 and not reopened here: the value is the filesystem mtime
kept in a new column, not `created_at`; a "last opened" condition (from `WatchHistory`)
is not part of this change; both absolute and relative values are accepted; a comparison
is required, as for `size:`. `added:` / `date:` stay rejected (SPEC-CORE-043): the name
says modification time because that is what the column holds.

## Required items

### 1. Normal flow

Terms. *Comparison*, *wire form*, *impossible range* and the four operators are those of
SPEC-CORE-047. *Modified comparison*: the number is a whole number of seconds since
1970-01-01T00:00:00Z (epoch seconds). *Evaluation zone*: the IANA time zone in which
absolute dates are read (sending step 4).

SPEC-CORE-137, the column:

1. `files` gains `modified_at DATETIME NULL` (UTC, naive as the other `files` timestamps),
   always holding whole seconds: every write stores `st_mtime` truncated toward zero to
   the second, and every comparison of a stored value with a stat compares those whole
   seconds. The migration only adds the column; no backfill runs in the migration.
2. These paths insert a `files` row for a file on disk and set `modified_at` from the
   file's `st_mtime` read after the file is in place: the scanner's two insert paths
   (after the `.md` id stamp, see 3a), `register_single_file`, the upload finaliser, the
   create-file endpoint, and the copy in `fileops` (`shutil.copy2` keeps the source's
   mtime, so the copy keeps the source's time). When that stat fails the row is inserted
   with `modified_at` NULL, as `register_single_file` already inserts with a fallback
   size; the next scan fills it.
3. These paths rewrite a file's bytes on a user's or client's request and set
   `modified_at` from the new `st_mtime`: `write_text_content` (content PUT, MCP edits,
   tag edits on `.md`, Markdown image import), the upload that revives a missing row, and
   the create-file endpoint when it revives a missing row.
3a. Writes Litloft makes on its own, without a request to change that file — the `.md` id
   stamp (`_ensure_md_id_for_new_file`) and the `[[link]]` rewrite on rename
   (`markdown_relations`) — are not modifications (user choice, 2026-11-18). Each reads
   the file's `st_atime` / `st_mtime` before it writes and puts them back with
   `os.utime` after, so the file on disk keeps the time of its last edit and the scan
   leaves `modified_at` as it was. When the times cannot be put back, the write stands
   and the next scan records the new mtime.
4. Each scan stats every row it walks that has a file on disk — active, trashed, a
   missing row that reappears, and a row matched as a move — including those it skips for
   hashing today, and sets `modified_at` when the stat's whole seconds differ from the
   stored value or the stored value is NULL. A failed stat leaves the stored value. So
   after an upgrade the startup scan fills the column (a trashed file restored later
   already has it), and a file edited outside Litloft is reflected at the next scan
   (startup or the manual rescan).
5. A write of `modified_at` alone does not change `updated_at`, does not count in the
   scan result's `updated`, and logs nothing. A write that also changes another column
   behaves as it does today.
6. Rename, move, trash, restore, missing and recover leave `modified_at` as it is (the
   filesystem keeps the mtime; the scan corrects it if not).

SPEC-CORE-138, parsing (`searchQuery.ts`):

1. A `modified:` token is read through the existing tokenizer and normalised as a `size:`
   value (NFKC, whitespace removed). It must start with `>=`, `<=`, `>` or `<`; otherwise,
   or when the amount does not parse, it is text.
2. Absolute amounts: `YYYY`, `YYYY-MM`, `YYYY-MM-DD`, with `/` accepted for `-`; years
   1970 to 9999; a month or day that does not exist (`2023-02-30`) is text. Each names a
   period, the year, month or day, starting at local midnight of its first day in the
   evaluation zone and ending at local midnight of the next period. The comparison maps
   to a boundary: `<P` is `lt:<start>`, `>=P` is `gte:<start>`, `<=P` is `lt:<end>`,
   `>P` is `gte:<end>`. So `<=2023` and `<2024` are the same comparison.
3. Relative amounts: a positive whole number followed by `d` (1 day = 86,400 s), `w`
   (7 days), `m` (30 days) or `y` (365 days), case-insensitive; at most 36,500 days. The
   amount names the instant that many seconds before the moment the query is evaluated,
   and the operator is kept: `<1y` is `lt:<now − 365 d>`, "changed more than a year ago";
   `>=30d` is `gte:<now − 30 d>`, "changed within the last 30 days". Units are fixed
   lengths, not calendar months, so the result does not depend on the zone.
4. `ParsedQuery` gains `modified`, a list of the parsed tokens (operator plus amount, not
   yet resolved to seconds), in order of first appearance. A token's identity is its
   canonical form: the operator, then the amount with `/` written `-` and the unit in
   lower case (`<2024/01` and `<2024-01` are one token, `>=30D` and `>=30d` are one).
   Tokens are deduplicated by identity; at most 4 distinct, the fifth and later are text.
   `<2024` and `<=2023` stay two tokens; they resolve to the same wire form, which is
   sent once. A `modified:` token sets `hasOperators`.
5. Resolution to epoch seconds takes an instant `now` and a zone, and is clamped to the
   wire range (0 to 253402300799): `modified:>=1970` in Asia/Tokyo sends `gte:0`,
   `modified:<=9999` sends `lt:253402300799`, and `modified:<100y` sends `lt:0` (which
   keeps nothing). One `now` is taken per search run: when the query text or type is
   submitted, or the page is loaded with it. Every listing page, the meaning filter and
   the continuation of that run use it. An open results page does not re-resolve until
   a new search run. The impossible-range check of SPEC-CORE-047 applies to the resolved
   comparisons of the run (`modified:>2024 modified:<2023` requests nothing). A Smart
   Collection evaluation (`smartCollectionEval`) takes one `now` per evaluation.

SPEC-CORE-138, chips: one chip per distinct token identity, 「更新日 <value>」 / "Modified
<value>", the value as first written after NFKC and whitespace removal; ✕ removes every
`modified:` token with that identity, keeping every other token's raw string
(SPEC-CORE-047 chips, rule 2).

SPEC-CORE-138, sending:

1. `SearchFilter` gains `modified: string[]`, the wire forms (`lt:1704034800`) of the
   run's resolved comparisons. `filterQueryParam` writes it last and only when non-empty.
   Everything SPEC-CORE-047 sending says about `sizes` applies, including "Show more by
   similarity" and the continuation.
2. The results page and the modal send each wire form as a repeated `modified` parameter
   on the listing, through `listingRequest.ts`, on both the GET path and the
   `getDriveFilesWithFileIds` POST path.
3. `FileFiltersQuery` gains `modified: list[str]`, so every route that takes it accepts
   it: `GET /files`, `POST /files/query`, `GET /folder-counts`, `POST
   /folder-counts/query`, and `ShelfQuery` (`/shelves`, `/shelves/query`). `POST
   /api/internal/files/matching` gains `modified: [str]`, default `[]`. All go through
   `apply_file_filters`: every comparison must hold (AND) against `files.modified_at`;
   a row whose `modified_at` is NULL never passes. Validation is the same on those routes
   (400), `/files/matching` (422) and the addon (422): the wire form, one of the four
   operators, a whole number from 0 to 253402300799 (9999-12-31T23:59:59Z), duplicates
   counted once, at most 4 distinct.
4. Evaluation zone. On a page it is the browser's zone. The frontend server's Smart
   Collection evaluation (`GET /app-api/smart-collection-members`) accepts an optional
   `tz` parameter naming an IANA zone and uses it; an unknown zone is 400. Without `tz`,
   a Smart Collection whose query holds an absolute `modified:` amount answers 400
   ("tz is required for an absolute modified: date"), so no answer is silently read in
   the server's zone; one with only relative amounts, or none, answers as today (user
   choice, 2026-11-18). The MCP server sends its host's zone as `tz` on every call to
   that route (`tools/collections.ts` and `tools/ask.ts`), so a Smart Collection listed
   through MCP on the machine where the viewer reads it holds the same files as on the
   page.
5. App targets (`appTarget.ts`, `videoAppTarget.ts`), which build listing and shelf
   parameters from a Smart Collection's query, treat a `modified:` token as an
   `unsupported_part`, as `appTarget` treats `duration:` today: the Smart Collection is
   shown as unusable as an app target rather than listed without the condition (user
   choice, 2026-11-18).
6. Deployment: the addon PR merges first and the core PR carries the pointer bump, as for
   SPEC-ADDON-065, so no commit of `develop` pairs a core that sends `modified` with an
   addon that rejects it.

SPEC-CORE-138, 「＋ 条件」 menu: 「更新日」 / "Modified" sits between 「長さ」 and 「お気に入り」.
It opens three fixed presets: 「30 日以内」 / "Last 30 days" (`modified:>=30d`), 「1 年以上前」
/ "Over a year ago" (`modified:<1y`), 「3 年以上前」 / "Over 3 years ago" (`modified:<3y`).
Offering, the empty row, the disabled entry at 4 comparisons, and choosing behave as for
「サイズ」 (SPEC-CORE-047 menu, rules 3 and 4); "already in the query" compares the typed
token, and "would make the range impossible" compares the resolved comparisons.

SPEC-CORE-138, list rows: `FileResponse` gains `modified_at` (nullable). The list view's row
date (`FileListRow`) shows `modified_at`, and `updated_at` when it is NULL.

SPEC-ADDON-143:

1. `SearchFilter` gains `modified: list[str]`, default `[]`, validated as SPEC-CORE-138
   sending step 3 and passed to `/files/matching` unchanged after normalisation.
2. Everything else of SPEC-ADDON-065 applies unchanged.

### 2. Failure cases

- A value that does not parse (`modified:2024`, `modified:<yesterday`,
  `modified:<2023-02-30`, `modified:<1h`): the token is text.
- An impossible range: nothing is requested; the chips stay so one can be removed.
- `modified_at` still NULL (before the first scan after the upgrade, or a file whose stat
  failed): the file passes no `modified:` comparison. The startup scan fills it.
- A file edited outside Litloft after the last scan: the old `modified_at` answers until
  the next scan; the user guide says so.
- A file's mtime set in the future or in the distant past (a camera with a wrong clock, an
  archive extracted with its original times): the operator answers on that mtime, which
  is what the filesystem says.
- An unknown `tz` on the Smart Collection route: 400, as for a bad `offset`. No `tz` with
  an absolute `modified:`: 400 (sending step 4); MCP shows the error text.
- A malformed `modified` on the listing: 400; in `filter` or `/files/matching`: 422. The
  frontend never sends either.

### 3. States

Per file, `modified_at`: NULL (never stamped) → set (on insert, write or scan) → set to a
new value (write or scan). It never returns to NULL. The search states of SPEC-CORE-039
are unchanged; a change of `modified` is a change of the filter. The 「＋ 条件」 menu gains
one value list (first level → modified presets → back), as SPEC-CORE-047's table.

### 4. Data read and written

- Core: writes `files.modified_at` (insert, content write, revive, scan). Reads it in
  `apply_file_filters` and `FileResponse`. Migration adds the column.
- Intelligence: reads what SPEC-ADDON-065 reads. Writes nothing.
- Browser and frontend server: nothing stored; the search cache keys by the query text.

### 5. External services

None. The scan's extra `stat` is local filesystem I/O.

### 6. Authorization

Unchanged from SPEC-CORE-047. Internal API policy, endpoint 15: R1, the modification time
is core-owned file metadata, now shown in the core UI (the list row); R2, the field names
a time, no addon; R3, row 15's exception stands; R4, read-only. The `tz` parameter is read
only by the frontend server's own route and reaches no backend.

### 7. Effect on existing features

- `GET /api/drives/{name}/files` and `/files/matching`: a new optional input only.
- `FileResponse` gains a field; MCP `get_file` and the iOS app ignore unknown fields.
- The scanner does one more `stat` per walked file per scan.
- `updated_at`: unchanged by a `modified_at`-only write, so the upgrade's backfill does
  not move every file in an `updated_at` sort.
- The list view's row date changes source; the card's date (`created_at`) and the
  「新しい順」 / 「古い順」 sorts are unchanged.
- Smart Collections save the query text; re-running resolves relative values again.
- `core-search-vocabulary.test.ts` counts change with the new keys.
- The other range operators, `size:` / `duration:`, are unchanged.

### 8. Error behavior

As in 2. The scanner logs nothing for a failed stat beyond what it logs today for the same
file; the core logs nothing new; the addon logs a 422 `filter` at no level above INFO.

### 9. User-visible behavior

- `path:Downloads modified:<1y` lists files in Downloads unchanged for a year, newest
  first; `modified:>=2024-06 modified:<2024-07` lists June 2024.
- Chip 「更新日 <1y」; menu entry 「更新日」 with three presets.
- The list view's row date is the modification time.
- New strings in `messages-core/ja.json` and `en.json`: the chip label / menu item, the
  three presets, the "no preset left" row.
- `docs/user-guide/search.md`: the operators table gains `modified:` with the absolute and
  relative forms, that `<` means "before", the boundary rule for `<=2023`, and that a
  change made outside Litloft shows after the next scan. `docs/reference/api.md`: the
  listing's `modified`, `FileResponse.modified_at`. `docs/ADDON-DEVELOPMENT.md`: the
  `/files/matching` body. `docs/addons/intelligence.md`: the `filter` key.

### 10. Non-functional

- Caps as in sending step 3; each comparison adds one predicate; no index (the drive
  predicate narrows the scan, as for `file_size`).
- The scan: one `stat` per walked file; on a 50,000-file drive this stays within the
  scan's current time plus the cost of 50,000 stats.
- Privacy: nothing new leaves the Docker network; `tz` is the host's zone name only.

## Touch points

Core:
- `backend/app/models.py`: `File.modified_at`.
- `backend/app/database.py` (HIGH): migration adding the column.
- `backend/app/services/scanner.py` (HIGH): both inserts, `register_single_file`, the
  per-file stat of walked files.
- `backend/app/services/content_write.py`: `write_text_content`.
- `backend/app/services/upload.py`, `backend/app/services/fileops.py` (HIGH),
  `backend/app/routers/drives.py` (create file, missing revive, listing, filters,
  wire-form parser).
- `backend/app/routers/internal.py` (HIGH): `FileMatchingRequest.modified`.
- `backend/app/schemas.py`: `FileResponse.modified_at`.
- `.claude/rules/internal-api-policy.md`: row 15's note names `modified`.
- `backend/tests/`: column writes per path, scan backfill, `updated_at` unchanged, listing
  and matching parity, NULL, caps.
- `frontend/src/lib/searchQuery.ts`: parsing, resolution, `ParsedQuery`, `SearchFilter`,
  chips, impossible range.
- `frontend/src/lib/api.ts`, `frontend/src/lib/listingRequest.ts`,
  `frontend/src/components/folder/useFolderFiles.ts`,
  `frontend/src/components/search/useFileSearch.ts`.
- `backend/app/routers/shelves.py` (`ShelfQuery`) and the folder-counts routes, through
  `FileFiltersQuery`.
- `frontend/src/lib/appTarget.ts`, `frontend/src/lib/videoAppTarget.ts`:
  `unsupported_part`.
- `frontend/src/lib/searchMerge.ts`, `frontend/src/components/folder/FolderTreePane.tsx`:
  `FileItem` literals gain `modified_at`.
- `backend/app/services/markdown_relations.py` and the scanner's id stamp: keep the
  file's times.
- `frontend/src/components/search/ConditionMenu.tsx`, `SearchFilterChips.tsx`.
- `frontend/src/lib/smartCollectionEval.ts`,
  `frontend/src/app/app-api/smart-collection-members/route.ts`: the evaluation zone and
  `tz`.
- `frontend/src/components/FileListRow.tsx`, `frontend/src/types/index.ts`.
- `frontend/src/messages-core/ja.json`, `en.json`; `core-search-vocabulary.test.ts`.
- `mcp-server/src/tools/collections.ts`, `mcp-server/src/tools/ask.ts`: send `tz`.
- Docs: `docs/user-guide/search.md`, `docs/reference/api.md` (the listing's `modified`,
  `FileResponse.modified_at`, the Smart Collection route's `tz`),
  `docs/ADDON-DEVELOPMENT.md`, `docs/addons/intelligence.md`.

Addon (`addons/intelligence`, its own PR, then the pointer bump):
- `app/file_matching.py`: `SearchFilter.modified`.
- `tests/`.

## Invariants

I1. After a scan, every row the scan walked whose file it could stat (active, trashed, recovered or matched as a move) has `modified_at` equal to the whole seconds of its `st_mtime`, including a file whose bytes changed outside Litloft while its size stayed the same.
I2. Each path listed in SPEC-CORE-137 steps 2 and 3, when its stat succeeds, leaves `modified_at` equal to the whole seconds of the file's `st_mtime` after the write; a copy keeps the source's value; rename and move leave it unchanged.
I3. Writing only `modified_at` leaves `updated_at` and the scan's `updated` count unchanged.
I4. A file whose `modified_at` is NULL is never kept by a query with any `modified:` comparison, on the listing and on `/files/matching`.
I5. For any combination of the existing conditions with `modified`, `POST /files/matching` returns exactly the ids that `GET /files` and `POST /files/query` return for the same conditions with no `search`, `path` or `trust`.
I6. In zone Asia/Tokyo, `modified:<2024`, `modified:<=2023` and `modified:<2024-01-01` all send `lt:1704034800`, and `modified:>2023-12-31` sends `gte:1704034800`.
I7. `modified:<1y` keeps a file changed 366 days before now and not one changed 364 days before now; `modified:>=30d` keeps one changed 29 days before now and not 31.
I8. The same Smart Collection with an absolute `modified:` evaluates to the same files on the page and through `/app-api/smart-collection-members` called with the page's zone as `tz`.
I9. The parser turns into text every value the core or the addon would reject, and the listing (400), `/files/matching` (422) and the addon's `SearchFilter` (422) accept and reject the same wire forms.
I10. A query with no `modified:` token sends the same listing parameters and the same `filter` as before this change.
I11. A saved Smart Collection with `modified:<1y`, evaluated with `now` a day later, keeps a file that crossed the one-year boundary in between and did not keep it before; every page of one search run sends the same wire form.
I12. Removing a 「更新日」 chip removes exactly the tokens with its identity and leaves every other token's raw string unchanged; the menu never offers a preset whose identity is already in the query or that would make the range impossible.
I13. The list view's row date shows `modified_at`, and `updated_at` only when `modified_at` is NULL.
I14. Importing a `.md` without an id and renaming a file that other notes link to leave every rewritten file's `st_mtime` and `modified_at` as they were before the write.
I15. `/app-api/smart-collection-members` without `tz` answers 400 for a Smart Collection holding an absolute `modified:` amount, and answers as before for one holding none; both MCP callers send `tz`.
I16. An app target built from a Smart Collection holding `modified:` reports `unsupported_part` and requests no listing without the condition.

## Checked, no action

- "Last opened" from `WatchHistory`: not added (user choice, 2026-11-18). It is per viewer,
  so it needs the viewer on the search path, in the cache key and a rule for shared Smart
  Collections (the `is:unwatched` reasons of SPEC-CORE-043), and history before Litloft
  does not exist.
- Filesystem atime: unusable, as the Summary says.
- Reusing `created_at` or `updated_at`: `created_at` never follows edits; `updated_at`
  moves on every metadata change (missing, title, thumbnail).
- A periodic rescan so outside edits show sooner: not added; scans run at startup and on
  the manual rescan, as for every other file attribute.
- A sort by `modified_at`: not added; the card date and the sorts keep `created_at`. For
  files edited after Litloft first saw them the two differ, and only there.
- Calendar months and years for relative values: fixed lengths keep the result
  independent of the zone and of the day of the month.
- Times of day (`modified:<2024-01-01T12:00`) and `=`: not added, as `=` for `size:`.
- Pagination through MCP: each call to the Smart Collection route is its own evaluation
  with its own `now`, so a relative boundary can move by the seconds between two pages.
  Accepted; the drift is seconds against a boundary of days.
- Text for out-of-range resolved values: clamping keeps the token an operator whose
  meaning holds for every file (no stored mtime is outside the wire range).
- MCP `semantic_search` / Ask: they send no `filter`, as in SPEC-CORE-047.
- A design artifact: no new screen; one menu entry and a chip in the existing pattern.
