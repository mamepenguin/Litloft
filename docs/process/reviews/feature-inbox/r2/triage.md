# Triage: r2

## Warnings

- R-5 ran at cc526349741e9afb5ffc67fe59dfe237e4f61a35, and these files changed since: .claude/rules/internal-api-policy.md, backend/app/database.py, backend/app/routers/internal.py, backend/app/routers/uploads.py, backend/app/services/fileops.py and 6 more; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-deep: One fix round (95d10b9c2). It removes a branch: the `_has_trashed_ghost` exemption in `init_upload`, the optional `db` parameter, and the router's `db` dependency for init. It adds no new production branch, state or prediction. The test layer gains one parametrized refusal test and corrects the ghost test to delete the on-disk file, which matches a real ghost. The design is not being patched; the round reverts unplanned scope back to develop's behavior.
- claude-read: One fix round (95d10b9c2). It removes a branch rather than adding one: the _has_trashed_ghost check, its db parameter on init_upload and the db dependency on the init route are all deleted, and init returns to an unconditional 409 when the target exists on disk. The ghost test gains a setup step (unlink) so it models a real ghost, and the new parametrized test pins the restored refusal. It adds no new state or prediction, so this is not a sign of the design being patched. The api.md sentence describing the removed behavior was left behind.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 1
C: 0

### claude-read:R2-F1 — bucket B, LOW, open

Claim: The API reference still says that a re-upload over a trashed file at the same path replaces the ghost and gets a new record. After this fix, init answers 409 whenever the trashed file is still on disk, so that sentence describes the behavior the fix removed.
Impact: A reader who takes api.md as the contract would believe a same-name upload over a trashed file succeeds, and could re-add the init bypass the fix just removed. Doing so would destroy the trashed copy again. Users are not affected directly.
Evidence: docs/reference/api.md:188 (the upload complete row): "a re-upload over a trashed file at that path replaces the ghost and gets a new record." backend/app/services/upload.py:151-152 now raises 409 unconditionally when target_full exists. The only way to reach the ghost purge at upload.py:317-326 is when the trashed row's file is gone from disk, which backend/tests/test_inbox_arrival.py::test_trashed_ghost_is_replaced_and_gets_a_new_row now sets up with an explicit unlink.
Repro: Read api.md:188, then upload.py:151-152 and the new test test_upload_over_a_trashed_file_still_on_disk_is_refused, which asserts 409 for this exact case.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the clause "and a re-upload over a trashed file at that path replaces the ghost and gets a new record" from docs/reference/api.md:188.

</details>

## Not verified

- claude-deep: I ran no tests and no commands.
- claude-deep: I did not grep the MCP server or the knowledge submodule for direct Python callers of `init_upload(..., db=...)`. They talk over HTTP, so I expect none.
- claude-deep: I did not re-review the truncated frontend part of the full diff; this round's commit touches only backend upload code and one test file.
- claude-deep: I did not compare upload.py byte for byte with origin/develop. I relied on the full-change diff, which shows only the `inbox_source` additions in upload.py.
- claude-read: I ran no tests. In particular I did not confirm that the trash endpoint's response shape (`data`) matches what the new test reads, beyond seeing the same key used in test_missing.py:225.
- claude-read: I did not re-read the truncated frontend and MCP portion of the full change. My review covered the fix commit and the backend files it touches.
- claude-read: I did not check the frontend upload store's handling of a 409 at init for inbox uploads.
- claude-read: I did not inspect the knowledge submodule.
- claude-verify: I did not run the tests; I verified by reading the code only.
- claude-verify: I did not check whether the api.md:188 sentence predates this branch or was added by it.
- claude-verify: I did not check other docs (the spec in docs/specs/inbox.md, the user guides) for the same stale statement.

TOTAL: 1 findings
