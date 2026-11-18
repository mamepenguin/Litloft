# R1 review: core folder counts (SPEC-CORE-130)

Commit reviewed: `ca3587e91` in `video_share-folder-counts` (single commit, not a range).
Threat model: personal tool, owner only, no adversary. Bucket A = silently wrong in normal use.

## What was checked

- `_folder_counts` (`backend/app/routers/drives.py:1254-1286`) calls `filtered_drive_files` with
  exactly the arguments `_list_drive_files` passes, minus `path`/`recursive`, and runs
  `_validate_drive` first on both the GET and POST forms. So the per-path count is the listing's
  set restricted to `folder_path == path`, which is what the listing's `path=` (exact, non-recursive,
  `_validate_folder_path` is identity on valid input) selects. I14 holds by construction.
- I14 "answers as before" for `type` / `origin` / `exclude_origin` / none: old code was
  `_apply_kind_filter(_normalize_kind(type))` + the same two origin predicates; the new path goes
  through `apply_file_filters` → `_apply_kinds_filter([_normalize_kind(k)])`, same predicate,
  `markdown` alias kept. Existing callers (`frontend/src/lib/api.ts:267`, Knowledge) send only those
  parameters. `FileFiltersQuery` does not forbid extra keys, so no new 422 for old callers.
- I15: `File.drive == drive_name` in `filtered_drive_files` bounds every row, so body ids and
  collection members of another drive cannot be counted; `_validate_drive` gives 404 for locked /
  unknown drives on both forms (the POST still validates its body first, so a malformed body on a
  locked drive is 422, as `files/query` does — bucket B, not reported).
- `count(distinct(File.id))` vs the listing's `query.count()`: the shared query adds no joins
  (tags use `.any()` = EXISTS, collections and ids use `IN`), so the two agree today.
- Spec "Checked, no action" (subtree counts not offered) respected: exact `folder_path` only.

## Mutation results

Run: image `litloft-test-review-fc` built from the commit, `backend/app` mounted read-only, one
mutant at a time, `tests/test_drive_folder_counts.py` (baseline 39 passed), restored with
`git checkout -- backend/app/routers/drives.py` after each (tree clean at the end).

| Mutant | Result |
|---|---|
| Remove `_validate_drive` from `_folder_counts` | killed (3 tests) |
| `count(distinct(File.id))` → `count(File.id)` | **survived** (F1) |
| POST route stops passing `body.file_ids` | killed (4) |
| `_folder_counts` stops passing `file_ids` | killed (4) |
| `_folder_counts` stops passing `collection` | killed (5) |
| Remove `File.drive == drive_name` in `filtered_drive_files` | killed (2) |
| Remove `Collection.drive == drive` in `apply_file_filters` collection resolution | **survived** (F2) |
| `or_(collection_condition, listed)` → `listed` | killed (2) |
| `or_(collection_condition, listed)` → `collection_condition & listed` | killed (2) |

## Findings

### F1. `distinct` in the count is not protected by any test (surviving mutant)

- Where: `backend/app/routers/drives.py:1282` (`func.count(distinct(File.id))`).
- Rule: SPEC-CORE-130 I14 (count equals the listing's `total`); spec touch point "counting distinct files".
- How: today it is an equivalent mutant: no filter in `filtered_drive_files` joins a one-to-many
  table, so `count(File.id)` gives the same numbers. It only matters if a later change adds a join
  (for example tags via `join` instead of `.any()`); then the listing's `query.count()` (subquery
  count over entity rows, deduplicated by identity only at the ORM level, not in SQL) and this
  count could diverge, and no test here would notice because the seed data never produces a
  duplicate row.
- Frequency 0 (no condition in the current code). Impact 3.
- Suggested: none required; if kept, accept as equivalent mutant.

### F2. "collections of another drive count nothing" is only tested where `File.drive` already decides (surviving mutant)

- Where: `backend/tests/test_drive_folder_counts.py` `test_spec_core_130_another_drives_ids_and_collections_count_nothing`;
  guard under test is `backend/app/routers/drives.py` `apply_file_filters` (`Collection.drive == drive`), unchanged by this commit.
- Rule: SPEC-CORE-130 I15 / step 3 ("collections of another drive count nothing"); design-decisions "A drive is a security boundary".
- How: the test names a collection that exists only on the locked drive and whose member is a
  locked-drive file, so the `File.drive` filter alone already yields `{}`. Removing the
  collection's own drive check passes every test. The case it would miss: both drives have a
  collection of the same name and the other drive's one holds a row whose file is now in this
  drive; this drive's rail would then count files that this drive's own collection does not hold.
  No other-drive file is ever counted, so it is not a boundary leak, and the listing shares the
  same function so list and rail stay consistent with each other.
- Frequency 0 (guard present; needs a regression in shared code). Impact 3.
- Suggested: add a same-name collection on both drives with different members to the boundary
  test so the collection's drive check is what decides.

No bucket A defects found in the changed code.

TOTAL: 2 findings
