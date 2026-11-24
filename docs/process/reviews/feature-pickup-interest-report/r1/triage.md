# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/intelligence/app/pickup/evaluate.py — partial: Read lines 1-240 (imports, helpers), 806-1050 (all of the interests code) and 1053-1169 (parser and main). Did not read replay and online internals (240-806), which this change leaves unchanged.
- addons/intelligence/app/pickup/profile.py — full: Read the changed hunk with its enclosing functions, cluster_lanes and build_lanes (lines 980-1145), plus the helpers the report uses (_known_duration, live_videos, watched_file_ids).

Test files:
- addons/intelligence/tests/test_z_pickup_interests.py — full: Read the whole new file in the provided diff.

## Findings

A: 0
B: 1
C: 0

### claude-read:R1 — bucket B, INFO, open

Claim: evaluate.py now imports and calls `_not_interested_ids`, a private helper of `app/workers/pickup.py`. The touch-point list does not name this dependency: it says only that the worker is not edited and that the command calls 'the same profile and retrieval functions the worker calls'.
Impact: No user-visible defect today. The command now depends on a private worker symbol, so if that helper is renamed or changes semantics (for example, starts filtering marks), `interests` breaks or changes silently. A reader of the touch-point list would not know the worker module is part of what this change relies on.
Evidence: addons/intelligence/app/pickup/evaluate.py:59-63 adds `_not_interested_ids` to the `from app.workers.pickup import` list. evaluate.py:907 calls it and evaluate.py:948 uses its result in the exclusion set. app/workers/pickup.py:82-96 defines it with get_search_db_read (read-only, so I1 holds under init_readonly_databases at database.py:2394-2427). The worker builds its exclusions the same way at workers/pickup.py:305-306. app/workers/pickup.py itself is not in the diff.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name `app/workers/pickup.py` (`_not_interested_ids`, `_CANDIDATES_PER_LANE`) in the touch points as read-only dependencies, or move the marks read into profile.py.

</details>

## Not verified

- claude-read: I did not run any tests. I could not execute anything.
- claude-read: I did not check that the existing replay and online tests still pass after the `main` dispatch change.
- claude-read: I did not read tests/pickup_accuracy_rig.py or test_z_pickup_evaluate._fingerprint to confirm the fixtures behave as the new tests assume.
- claude-read: I did not check whether commit 7c3499304 on its own touches only docs. I reviewed the diff as provided.
- claude-verify: I did not diff against origin/develop (no shell), so I did not confirm that the `_not_interested_ids` import is new in this commit.
- claude-verify: I did not check whether the tests for the interests subcommand exercise marked files.
- claude-verify: I did not check invariants I1-I10 beyond what R1 touches.

TOTAL: 1 findings
