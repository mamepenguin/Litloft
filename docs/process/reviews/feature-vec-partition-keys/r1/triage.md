# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: The migration transaction uses a raw DBAPI connection with isolation_level=None and BEGIN IMMEDIATE, not the begin_nested() SAVEPOINT on its own connection that the touch-point text describes. The code is authoritative, so this is noted only to say where to review I2.; repair_unkeyed_rows reads the NULL id list on one connection and repairs on later transactions. A row re-keyed concurrently in between is not expected at startup.
- claude-read: The migration transaction uses a raw DBAPI connection with isolation_level=None and BEGIN IMMEDIATE, not the begin_nested() SAVEPOINT on its own connection that the touch-point text describes. The code is authoritative, so this is noted only to say where to review I2.
- claude-read: repair_unkeyed_rows reads the NULL id list on one connection and repairs on later transactions. A row re-keyed concurrently in between is not expected at startup.

## Findings

A: 0
B: 3
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The diff adds a new production module, addons/intelligence/app/vec_partition.py, which the touch-point list does not name. It holds the vec DDL, the shared INSERT SQL, the row re-key, the whole partition migration and the NULL-partition repair.
Impact: The touch points place the migration in database.py (`_migrate_vec_partition_if_needed`) and the repair in indexer.py (`repair_unkeyed_vec_rows`). In the code, both are one-line wrappers. A reader who checks the listed places for I1, I2, I8 or I9 finds no logic there. The real transaction handling is in an unlisted file: a raw DBAPI connection in autocommit with `BEGIN IMMEDIATE` and `ROLLBACK`, not the `begin_nested()` SAVEPOINT the touch-point text implies. The free-disk check, the checkpoints and the repair batching are there too. All eight insert sites also depend on this file through `insert_vector_sql`.
Evidence: addons/intelligence/app/vec_partition.py:1-248 (new file). It is imported by app/database.py:24-29, app/indexer.py:34, app/workers/{metadata,whisper,refine,vision,video_visual,clip}.py. The wrappers are app/database.py:807-815 (`_migrate_vec_partition_if_needed` → `_vec_partition_migrate`) and app/indexer.py `repair_unkeyed_vec_rows` → `repair_unkeyed_rows`. The migration transaction is vec_partition.py `_migrate`: `conn.execute("BEGIN IMMEDIATE")` / `ROLLBACK`.
Repro: not_reproduced (I compared the diff's file list with the touch-point list)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `addons/intelligence/app/vec_partition.py` (DDL, insert SQL, rekey, migrate_if_needed, repair_unkeyed_rows) to the touch points, and review I1/I2/I8/I9 against it.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: search.py gains a new module-level helper, `_visible_neighbours`. The touch points name only `_find_similar_by_embedding` in search.py.
Impact: This helper now decides I4/I5/I6/I11 for both the widening stop check and the quality-filter input: the type filter, the source exclusion, `active` and drive. It is a separate unlisted function, so a later edit to it, or another caller reusing it, falls outside what the plan says this change touches.
Evidence: addons/intelligence/app/search.py:1928-1952 (new `_visible_neighbours`). Its callers are search.py:2079 (widening check) and search.py:2089 (neighbour lookup before the quality filters).
Repro: not_reproduced (I compared the diff with the touch-point list)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name `_visible_neighbours` in the search.py touch point.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: The diff adds a shared test support module, addons/intelligence/tests/vec_partition_db.py, which is not named in the touch points. It holds the `search_index` and `authorizer` fixtures, the `Authorizer` kill/deny hook, `downgrade`, and the KNN and keyed-row readers. Every new SPEC-ADDON-022/023 test depends on it.
Impact: Whether the new tests pin I1-I11 depends on this module. Examples: `downgrade` rebuilds the pre-change schema, `keyed` asserts no duplicate ids, `put_vector(partition="omit")` simulates old writers, and the fixture snapshots and restores `app.database` module globals. It is not a test that cites the spec ids, and the list names `idf_term_db.py` as a helper but not this one, so it is outside the listed scope.
Evidence: addons/intelligence/tests/vec_partition_db.py:1-318 (new). It is imported by tests/test_vec_partition_{migration,repair,similar,startup,writers}.py.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List `tests/vec_partition_db.py` among the test touch points.

</details>

## Not verified

- claude-read: I did not run any test. I cannot tell whether the unchanged listed tests with old stand-ins pass or fail under the new INSERT SQL.
- claude-read: I did not read the full bodies of test_z_auto_tag_drive_scope.py, test_z_pickup_retrieval.py or test_z_image_clip_migration.py to confirm they need no change.
- claude-read: I did not check the core repository side beyond the diff shown, or the addon's Dockerfile sqlite-vec version.
- claude-read: I did not check the semantic correctness of the migration and repair beyond the touch-point scope question.
- claude-verify: I could not run git diff, so I did not prove that the files are new in this commit relative to origin/develop. I inferred it from their absence in the docs and their role in the change.
- claude-verify: I did not check the exact line counts the reviewer cited for vec_partition_db.py (1-318), or that its downgrade and KNN reader helpers exist.
- claude-verify: I did not check the correctness of the migration and repair logic against invariants I1-I11.
- claude-verify: I did not run the tests.

TOTAL: 3 findings
