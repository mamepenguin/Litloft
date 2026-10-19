# Review: search operators PR 1, round 1

Commit reviewed: `0bebbdfb84589db86ae411ccf30934f4661bcb8b` (range `de3b9b940..0bebbdfb8`), worktree `/Users/libre/Sources/video_share-ops`.
Tests run in image `litloft-test-ops-review` built from this tree, with `backend/app` and `backend/tests` bind-mounted.

## Findings

### F1 [introduced] low — ~1000 or more repeated `tag` or `type` values return a 500
- Invariant: none broken as written (3 is about which rows come back; this gives no answer at all). Bucket suggestion: B, or A if the supervisor reads "repeated tag returns only files carrying every tag" as needing an answer.
- Reproduction (probe test against the `client` fixture, same request against HEAD and against `de3b9b940`):
  - `?tag=Trip` x1100 or x3000 → HEAD: `sqlite3.OperationalError: Expression tree is too large (maximum depth 1000)` (a 500 in the running app). Parent: 200 (it kept only the last value).
  - `?type=video` x1100 → same at HEAD, 200 at parent.
  - x900 → 200 on both.
- Observation: each `tag` adds one `EXISTS` term to a chained AND, and each `type` one term to an `or_`; SQLite parses both as a left-deep tree and has a depth cap of 1000. Nothing dedupes or caps the lists. 1100 x `tag=a` is about 6.6 KB of query string, inside the default header limits, so a hand-made URL, an MCP/HTTP client, or a script reaches it. The PR 2 parser collapses duplicates, so the UI will not send this in practice. No data exposure; the drive filter is still applied. A cap (e.g. `max_length` on the list, or dedupe + a small bound) would close it.

### F2 [introduced] info — the diff reaches three endpoints that are not in the touch-point list (answer to question 1)
- Invariant: 2 (its wording covers only the listing and the tree).
- The refactor moves the body of `_apply_kind_filter` into `_kind_predicate`. `_apply_kind_filter` has more callers than the tree's `type_filter`:
  - `GET /api/drives/{drive}/tags?type=` (`list_drive_tags`)
  - `GET /api/drives/{drive}/folder-counts?type=` (`list_folder_counts`)
  - `GET /api/drives/{drive}/watch-history?type=` (`get_watch_history`)
  - plus both tree paths (non-flat direct files and subfolder counts, and flat), which the list names only as "the folder tree's `type_filter`".
- Observation: behaviour on these is unchanged (the predicate is byte-identical, and M11/M13/M18 each fail tests on the tree, the Recent view and the vocabulary parity). The touch points are missing, not an invariant break. If the supervisor revises invariant 2, the wording would be "every single-kind `type` / `type_filter` caller".

### F3 [pre-existing] low — `meta.total` under a `type` filter is not held by any test
- Invariant: 3 (the count of the result set is part of "returns files of any of the kinds" for a paginated caller).
- Surviving mutation M17c: move `total = query.count()` above `_apply_kinds_filter(...)`. HEAD: 171 passed. Same move at `de3b9b940` (above `_apply_kind_filter`): 162 passed. So the gap predates the change.
- Observation: the new `test_repeated_types_select_any_of_them` asserts only the filenames, while the new `TestRepeatedTags` test asserts `meta.total` too (which is why M17b, the same move above the tag loop, is killed). One `assert body["meta"]["total"] == len(expected)` in the repeated-types test would kill M17c.

### F4 [pre-existing] — tag case folding
- SQLite `lower()` folds ASCII only; the repeated-tag loop uses the same comparison as before. Already filed; not re-derived.

## Other checks (no finding)

- Single-value parity (invariant 2), HEAD vs `de3b9b940`, identical status, rows and `total`: `type=markdown` 200 [n.md]; `type=bogus` 422; `type=` 422; `tag=` 200 (no filter); `tag=Trip` 200; `tag=Secret` (a tag only another drive has) 200 []; `type=video&type=bogus` 422 on both.
- Repeated values change meaning, as intended: `type=video&type=markdown` parent → last value only [n.md]; HEAD → [a.mp4, n.md]. No existing caller sends repeated values: `frontend/src/lib/api.ts` uses `searchParams.set` for `tag`/`type`; the knowledge addon (`addons/knowledge/app/internal_client.py` `list_drive_files`, `addons/knowledge/frontend/api.ts` `listKnowledgeFiles`) sends only `path/limit/sort/order` (and `page`); the MCP `search_files` tool sends a single optional `tag` and `type`. An MCP `tag: ""` is still skipped by the guard, as before.
- Drive boundary (invariant 6): a Tag named `Trip` and one named `Secret` owned by drive `other`, on a file in drive `other`. `?tag=Trip&tag=Secret` on the test drive → []; `?tag=Trip` → only the test drive's file. `File.drive == drive_name` and `_validate_drive` run before any tag/kind predicate, and each predicate is a correlated `EXISTS` on the already drive-scoped `File`, so neither loop can widen the row set. A locked drive still 404s in `_validate_drive` before any filter is built.

## Mutation table

Suite: `test_api_drives.py test_file_kind_filter.py test_api_folder_tree.py test_api_tags.py test_drive_folder_counts.py test_text_kind.py` (171 tests, all green at HEAD).

| id | mutation | want | result | killed by |
|---|---|---|---|---|
| M1 | tag loop uses only the first tag | kill | killed | TestRepeatedTags (3) |
| M2 | skip-empty guard `if name:` → `if True:` | kill | killed | TestRepeatedTags `tag=Trip&tag=` |
| M3 | value side not lowercased | kill | killed | TestRepeatedTags (3) |
| M4 | column side `func.lower(Tag.name)` → `Tag.name` | kill | killed | TestRepeatedTags (4) |
| M5 | tag AND → OR (any tag) | kill | killed | TestRepeatedTags (3) |
| M6 | `or_` → `and_` in `_apply_kinds_filter` | kill | killed | test_repeated_types_select_any_of_them (3) |
| M7 | only the first kind used | kill | killed | test_repeated_types_select_any_of_them (3) |
| M8 | only the last kind used (parent's behaviour) | kill | killed | test_repeated_types_select_any_of_them (2) |
| M9 | `markdown` not normalised per value | kill | killed | repeated types `[markdown, image]`; test_text_kind `[markdown]` |
| M10 | remove `if not kinds: return query` | live | survived | equivalent: `or_()` with no clauses adds no predicate (SQLAlchemy deprecation warning only) |
| M11 | `_apply_kind_filter` returns `query` unfiltered | kill | killed | 25 tests (tree/listing parity, Recent view) |
| M12 | non-flat tree direct files via `_apply_kinds_filter(q, [type_filter])` | kill | killed | test_api_folder_tree (4): `[None]` filters to nothing |
| M13 | remove `_apply_kind_filter` None guard | kill | killed | 13 tests (tree, Recent view) |
| M14 | `type: list[str]` (no Literal validation) | kill | killed | unknown-kind 422 tests (2) |
| M15 | `tag` declared without `Query(...)` (becomes body) | kill | killed | 14 tests |
| M16 | nested kind drops the suffix fallback | kill | killed | 11 tests (parity, no-mime rows) |
| M17 | no-op (extra `count()` before the tag loop; invalid mutation, rerun as M17b) | — | survived | — |
| M17b | `total` counted before the tag loop | kill | killed | 12 tests incl. TestRepeatedTags total |
| M17c | `total` counted before the kinds filter | kill | survived | none — F3 (also survives at `de3b9b940`) |
| M18 | flat kind `==` → `!=` | kill | killed | 13 tests |

Survivors meant to survive: M10 (equivalent). Survivor not meant to: M17c (F3, pre-existing gap).

Tree restored after every mutation (write-back in `finally`); `git status --short` in the worktree is clean at the end. A bind-mount of a probe file left an empty `backend/tests/test_probe_review.py` in the worktree once; it was removed.

TOTAL: 4 findings
