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
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: Drift is no longer reported when the core-side path does not exist on disk, for all files.; Ambiguous folder names now abort loft creation in media_import.; The intelligence resolver walks ancestors from '/'.
- claude-read: Drift is no longer reported when the core-side path does not exist on disk, for all files.
- claude-read: Ambiguous folder names now abort loft creation in media_import.
- claude-read: The intelligence resolver walks ancestors from '/'.
- claude-verify: Reconcile drift now requires that the target path exists on disk, for all files and not only NFD ones.
- claude-verify: cloud-sync runs path resolution in a thread inside the sync run.
- claude-verify: media_import refuses loft creation when the folder is ambiguous.

### unspecified_behavior

Note: Reconcile drift now requires that the target path exists on disk, for all files and not only NFD ones.; cloud-sync runs path resolution in a thread inside the sync run.; media_import refuses loft creation when the folder is ambiguous.
- claude-read: Drift is no longer reported when the core-side path does not exist on disk, for all files.
- claude-read: Ambiguous folder names now abort loft creation in media_import.
- claude-read: The intelligence resolver walks ancestors from '/'.
- claude-verify: Reconcile drift now requires that the target path exists on disk, for all files and not only NFD ones.
- claude-verify: cloud-sync runs path resolution in a thread inside the sync run.
- claude-verify: media_import refuses loft creation when the folder is ambiguous.

## Findings

A: 0
B: 5
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: The intelligence reconcile drift check changes semantics for every file, not only NFD files: a stored-path difference now counts as drift only when the path core points at exists on disk, and the check runs in asyncio.to_thread via the new helper `_drifted_file_ids`. Neither the existence condition nor the thread offload is a touch point.
Impact: A file whose core path moved to a location that does not exist yet (offline drive, a file not yet on disk) no longer gets its indexed path repaired on that pass. Non-NFD rows are affected too. Reconcile now does one lexists/scandir walk per active row on a worker thread.
Evidence: addons/intelligence/app/indexer.py `_drifted_file_ids` (path_drift = snap[file_path] != expected_path and os.path.exists(expected_path)) and the `await asyncio.to_thread(_drifted_file_ids, to_compare)` call in reconcile. The existing test tests/test_reconcile_drift.py had to be edited to create a real file so the old drift assertion still passes.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name the drift existence condition and the thread offload in the touch-point list, or restrict the existence condition to rows whose unresolved path differs from the resolved one only by normalization.

</details>

### claude-read:F4 — bucket B, LOW, open

Claim: media_import and core now share API beyond `resolve_on_disk` (`name_taken`, `AmbiguousPath`), and media_import gained new refusals: loft creation (`create_loft_sync`) and `_allocate_loft_path` raise ValueError for an ambiguous folder. The touch points do not list these behaviors, and I7/I12 declare ambiguity handling only for core mutating sites.
Impact: A subscription sync whose folder has two non-byte-equal NFD-variant matches now fails in `_allocate_loft_path` with a ValueError instead of creating a loft. How the subscription manager reports this to the user was not checked.
Evidence: addons/media_import/backend/subscription/manager.py `_allocate_loft_path`; addons/media_import/backend/service.py create_loft_sync; the corresponding tests are in test_nfd_failure_states.py.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F2 — bucket B, INFO, open

Claim: Existing tests outside the listed test set are edited: addons/intelligence/tests/test_listing_call_inventory.py (new INVENTORY entry for app/diskpath.py os.scandir) and tests/test_reconcile_drift.py (expectation rewritten with monkeypatched resolve_file_path and a real file).
Impact: The listing-call inventory now permanently allows a scandir with 'stored-name' use in diskpath.py. The rewritten drift test no longer checks the original behavior of the unrelated-path drift case.
Evidence: addons/intelligence/tests/test_listing_call_inventory.py:22; addons/intelligence/tests/test_reconcile_drift.py test_drift_in_file_path_triggers_repair.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F3 — bucket B, INFO, open

Claim: cloud-sync changes the sync run path itself (the code that computes `source` before calling `_source_usable`, now `await asyncio.to_thread(self._on_disk, ...)` inside the try block) and adds a new helper `_on_disk`. The touch points name only `_source_usable` and `_folder_inside_drive`.
Impact: Resolution errors now fall into the existing exception handling of the sync run. The path handed to rclone changes for every mapping. The addon also imports core `app.services.diskpath` directly.
Evidence: addons/cloud-sync/backend/service.py around lines 183-190 and 260-266 in the diff.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F5 — bucket B, INFO, open

Claim: The intelligence `resolve_stored_path` resolves from filesystem root '/' over arbitrary absolute paths, and `document_text._checked_path` and the frame endpoint call it before `validate_file_path`, so the listing walks ancestors outside any drive mount.
Impact: Extra scandir calls on non-drive ancestors, and path validation sees the resolved spelling instead of the stored one. Benign in a single-user model.
Evidence: addons/intelligence/app/config.py resolve_stored_path (`resolve_on_disk('/', path.lstrip('/'))`); app/document_text.py `_checked_path`; routers/files.py get_frame.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not read the core backend/app/services/diskpath.py or the core tests; I judged only from the diff text.
- claude-read: I did not check whether cloud-sync has other joins of the drive path, or whether the intelligence listed modules (frame_cache, providers, workers) still open unresolved paths.
- claude-read: I did not check how SubscriptionManager reports the new ValueError.
- claude-read: I did not run any tests.
- claude-verify: Parity table contents and the copies of the resolver.
- claude-verify: Core backend changes (files.py, fileops.py, main.py).
- claude-verify: Inventory test seeding behavior.
- claude-verify: How the old drift assertion was rewritten in test_reconcile_drift.py.
- claude-verify: Whether the media_import handlers raise ValueError on AmbiguousPath.

TOTAL: 5 findings
