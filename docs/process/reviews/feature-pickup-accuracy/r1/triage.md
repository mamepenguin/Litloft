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

## Findings

A: 0
B: 4
C: 0

### claude-read:TP-1 — bucket B, INFO, open

Claim: The diff edits the 'Operational notes' section of docs/addons/intelligence.md, but the touch-point list names only that file's feature table and Pickup section.
Impact: None at runtime. The touch-point list understates where the docs change reaches. The operator documentation of `pickup_feed_log` and the two evaluate commands sits in a section the list does not name, so a check scoped to the listed sections would not cover it.
Evidence: docs/addons/intelligence.md:822 starts '## Operational notes'. Lines 829-831 are new: the 180-day `pickup_feed_log` retention and the `replay`/`online` commands. The touch points say 'docs/addons/intelligence.md (feature table and Pickup section)'. Spec item 9 does ask for an 'operator part', so the edit is planned in the spec body but missing from the touch-point list.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add 'Operational notes' to the docs/addons/intelligence.md touch point.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The diff adds a new shared test helper, addons/intelligence/tests/pickup_accuracy_rig.py, and four new test modules. The touch-point list names only 'the existing pickup tests (tests/test_z_pickup_*.py and the worker tests)'.
Impact: None at runtime. The rig defines its own core DDL for `files`, `watch_history` and `played_segments`, and its own `pickup_feed_log` DDL (create_feed_log). Those can drift from the real core schema and from `PickupFeedLog` without any listed touch point flagging them. For example, create_feed_log omits the `idx_pickup_feed_log_computed_at` index that the model declares.
Evidence: tests/pickup_accuracy_rig.py: new file, does not match `test_z_pickup_*.py`. New tests: test_z_pickup_accuracy_worker.py, test_z_pickup_engagement.py, test_z_pickup_evaluate.py and test_z_pickup_evaluate_after.py. These match the glob but are not 'existing' tests. SearchDB.create_feed_log builds `pickup_feed_log` from hand-written SQL rather than from `Base.metadata`, although SearchDB already calls create_all when create_models=True.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the new test modules and tests/pickup_accuracy_rig.py as touch points.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: The per-drive live-video read is a new public function, `profile.live_video_ids`, in app/pickup/profile.py. The touch-point list places 'the per-drive video set' under workers/pickup.py and does not list it among profile.py's functions.
Impact: None at runtime. The `files` predicate behind I3 (`file_type = 'video'`, live) lives in a profile.py function that the profile.py touch-point entry does not name. The same is true of the new helpers `_is_dismissed`, `_finite` and `_weighted_mean` and the constants LOFT_MIME, F_MIN, F_FULL and E_UNKNOWN. A reviewer who scopes I3 checks to the worker would miss the SQL that decides it.
Evidence: addons/intelligence/app/pickup/profile.py: new `live_video_ids(drive)` with SQL `file_type = 'video' AND deleted_at IS NULL AND missing_since IS NULL`. The worker calls it at app/workers/pickup.py:~205 via `profile_mod.live_video_ids`. test_z_pickup_worker.py monkeypatches it.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `live_video_ids` and the engagement helpers to the profile.py touch-point entry.

</details>

### claude-read:TP-4 — bucket B, INFO, open

Claim: The new evaluate.py imports the worker's private constants `_CANDIDATES_PER_LANE` and `_FEED_DEPTH` from app/workers/pickup.py. That coupling is not among the worker's listed touch points.
Impact: None today. Editing either worker constant now also changes the replay's rankings, and so the shipping-bar numbers I9 relies on. Importing the evaluate command also loads the worker module. Neither effect is named where the list describes workers/pickup.py.
Evidence: app/pickup/evaluate.py: `from app.workers.pickup import _CANDIDATES_PER_LANE, _FEED_DEPTH`. Both are used in `_rank`. The workers/pickup.py touch points list the video set, _stale_work/_checkpoint, _compute_for_viewer, _store and the log only.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name the shared feed constants (`_FEED_DEPTH`, `_CANDIDATES_PER_LANE`) under the workers/pickup.py touch point.

</details>

## Not verified

- claude-read: Whether commit 42f2a5696 on its own differs from the branch-against-base diff given in the prompt. I could not run git, and the commit message suggests it may touch only docs/process/reviews.
- claude-read: The addons/intelligence/.flash/pickup-accuracy.md file appears in the worktree but not in the diff; I did not check whether it is committed.
- claude-read: I checked no runtime behaviour: no tests run.
- claude-verify: I could not confirm with git diff that pickup_accuracy_rig.py, the four new test modules, live_video_ids and the Operational notes lines are new relative to origin/develop, because I cannot run git. My judgement rests on the file contents and the spec's wording.
- claude-verify: I did not check invariants I1-I10 against the implementation beyond what the four scope findings required.
- claude-verify: I did not run any tests.

TOTAL: 4 findings
