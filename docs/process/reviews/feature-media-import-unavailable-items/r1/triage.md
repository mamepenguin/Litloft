# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- open_c claude-verify:V1

## Needs a human

### open_c (claude-verify:V1)

Question: The user docs say an item appears under Needs attention only after three unclassified failures in a row. The spec's state table also puts `path_conflict` rows (and legacy `rate_limited` / NULL rows) in Needs attention, and those get there without three failures.
Impact: The user docs describe Needs attention wrongly for a filename-conflict item. That item shows up in Needs attention, and marks the subscription, the first time it happens, which contradicts the sentence. The defect is in the docs only; behaviour is not affected.
Evidence: docs/addons/media-import.md:136 says: "An item appears under **Needs attention**, and marks the subscription, only after it fails three times in a row for a reason Litloft cannot classify." docs/specs/media-import-unavailable-items.md:168 says: needs attention = failed with `fetch_failed`, `rate_limited`, `path_conflict`, NULL, any other value. Spec line 94 also mentions a needs-attention row with `fail_count` below 2, such as a legacy `path_conflict` or `rate_limited` row. docs/addons/media-import.md:133 lists **Resolve…** for a taken filename as a separate thing but does not exempt it from the 'only after three' claim.
Recommendation: Reword docs/addons/media-import.md:136 so that it covers filename conflicts. For example: "An item appears under Needs attention when its filename is already taken, or after it fails three times in a row for a reason Litloft cannot classify."
Note: The user docs say an item appears under Needs attention only after three unclassified failures in a row. The spec's state table also puts `path_conflict` rows (and legacy `rate_limited` / NULL rows) in Needs attention, and those get there without three failures.

## Findings

A: 0
B: 0
C: 1

### claude-verify:V1 — bucket C, LOW, open

Claim: The user docs say an item appears under Needs attention only after three unclassified failures in a row. The spec's state table also puts `path_conflict` rows (and legacy `rate_limited` / NULL rows) in Needs attention, and those get there without three failures.
Impact: The user docs describe Needs attention wrongly for a filename-conflict item. That item shows up in Needs attention, and marks the subscription, the first time it happens, which contradicts the sentence. The defect is in the docs only; behaviour is not affected.
Evidence: docs/addons/media-import.md:136 says: "An item appears under **Needs attention**, and marks the subscription, only after it fails three times in a row for a reason Litloft cannot classify." docs/specs/media-import-unavailable-items.md:168 says: needs attention = failed with `fetch_failed`, `rate_limited`, `path_conflict`, NULL, any other value. Spec line 94 also mentions a needs-attention row with `fail_count` below 2, such as a legacy `path_conflict` or `rate_limited` row. docs/addons/media-import.md:133 lists **Resolve…** for a taken filename as a separate thing but does not exempt it from the 'only after three' claim.
Repro: I compared the docs and the spec text directly. Normal use: a sync imports an item whose target filename already exists. Its row is `failed` / `path_conflict` and goes into Needs attention after one attempt.
Introduced: introduced
Reviewer bucket: C | Author bucket: 

<details><summary>Proposed fix</summary>

> Reword docs/addons/media-import.md:136 so that it covers filename conflicts. For example: "An item appears under Needs attention when its filename is already taken, or after it fails three times in a row for a reason Litloft cannot classify."

</details>

## Not verified

- claude-read: I did not run any test. I cannot run commands.
- claude-read: I did not check whether the core WebSocket broadcast layer filters or reshapes the event payload before it reaches useWebSocket.
- claude-read: I did not read test_drive_scope.py to see which provider it registers for the /videos route.
- claude-read: I did not confirm that the checked-out submodule HEAD equals d50ae8998 rather than another commit.
- claude-verify: I did not check whether the addons/media_import submodule pointer changed in this commit range, and I did not inspect any addon code.
- claude-verify: I did not read the R-5 run record under docs/process/reviews/ or invariants.md for internal consistency.
- claude-verify: I did not run any tests, because I had no command execution.

TOTAL: 1 findings
