# Triage: r2

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- claude-read: Only accf5dfe4 changes code; a418cf15a and 23030903d record reviews and R-5 runs, and there is one fix round so far, so no earlier round added the same kind of thing. That round does not add a new state or stacked special-case branch to `_save_loft_thumbnail`: it replaces the bare `unlink` and its `old_rel and` guard with core's `remove_thumbnail_quietly`, deletes a false comment, and removes the in-place truncated-slot state on a raised error by using core's atomic writer. I do not read this as the design being patched. It did remove one safeguard by accident: replacing `urlretrieve` dropped its Content-Length check, so a short body moved from reported failure to reported success (F1). Status of r1's findings: F1 and F4 are fixed. F2 is half fixed, with the commit-failure test still missing (F3). V1 is fixed for raised errors only (F1). The comment half of r1's F3 is fixed, but the unused `drive`, `folder_path` and `filename` parameters remain at service.py:582-584 and both callers; this has no user-visible effect, so it is not reported again as a finding.

Earlier runs:
- none

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: The spec does not state that a thumbnail download is atomic; it says the download's failure handling is unchanged. The code now publishes through `generating_file`, and test_loft_thumbnail.py attributes 'a slot is replaced whole or not at all' to SPEC-ADDON-040. The spec's approval hash is unchanged.; The spec does not state what a Media Import save does when removing the old picture fails, or that it prunes emptied directories. The code logs a warning and prunes through `remove_thumbnail_quietly`, and the tests cite SPEC-ADDON-040 for both.; A body shorter than Content-Length changed from a reported failure to a reported success (F1); the spec does not describe this case.
- claude-read: The spec does not state that a thumbnail download is atomic; it says the download's failure handling is unchanged. The code now publishes through `generating_file`, and test_loft_thumbnail.py attributes 'a slot is replaced whole or not at all' to SPEC-ADDON-040. The spec's approval hash is unchanged.
- claude-read: The spec does not state what a Media Import save does when removing the old picture fails, or that it prunes emptied directories. The code logs a warning and prunes through `remove_thumbnail_quietly`, and the tests cite SPEC-ADDON-040 for both.
- claude-read: A body shorter than Content-Length changed from a reported failure to a reported success (F1); the spec does not describe this case.

## Findings

A: 0
B: 3
C: 0

### claude-read:F1-short-body-now-reported-as-success — bucket B, MEDIUM, open

Claim: Replacing `urlretrieve` with `urlopen` plus `shutil.copyfileobj` removed the only check for a body shorter than Content-Length, so a connection that ends early without a socket error is published as a complete thumbnail and reported as a successful download.
Impact: When a thumbnail transfer ends early with a clean close or an unterminated TLS EOF, during an import, Refresh metadata or the startup caption retry, the card can silently show a truncated picture. The atomic rename replaces a good `.by-id` slot with the partial file. The fallback chain stops at that URL, the pointer commits, and an old path-form picture is deleted. Before this change, the same short body raised `ContentTooShortError`, so the function returned False, the next candidate URL was tried, and the pointer and old file stayed. The same happens to subscription avatars through `_save_subscription_avatar`. The next complete download repairs the picture, but nothing reports the damage or triggers a repair.
Evidence: addons/media_import/backend/service.py:546-550 copies with `shutil.copyfileobj(response, out)` and returns True when the copy ends. `copyfileobj` stops at the first empty read. In the Python 3.14.8 stdlib on this machine, `http/client.py:490-498` shows `HTTPResponse.read(amt)` returning an empty read on early EOF, with the comment `Ideally, we would raise IncompleteRead if the content-length wasn't satisfied, but it might break compatibility.` `urllib/request.py:247-250` shows `urlretrieve` raising `ContentTooShortError` when `read < size`. service.py:612-616 stops the candidate loop on the first True, and service.py:624-629 then commits the pointer and removes the old picture. The new test's `_DroppingResponse` (above test_loft_thumbnail.py:495) raises `ConnectionResetError` on its second read, so it covers a reset but not a clean early EOF.
Repro: not_reproduced; this reviewer cannot run commands. Steps: seed a row with a good `.by-id/<id>.jpg` or a path-form pointer and old file. Serve the thumbnail from a local HTTP server that sends `Content-Length: 1000`, writes 100 bytes and closes the socket. Call `_save_loft_thumbnail` with that URL and a second, complete fallback URL. Prediction from the stdlib source: it returns `.by-id/<id>.jpg`, the slot holds 100 bytes, the fallback is never requested, and an old path-form file is gone. The same scenario at the previous pin returns None from `ContentTooShortError` handling once all candidates fail, or uses the fallback.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Inside the `generating_file` block, use `out.write(response.read())`, because `read()` with no size raises `IncompleteRead` on a short body. Alternatively, compare the copied byte count with the Content-Length header and raise on a mismatch. Add a test whose response ends early with an empty read and a larger advertised length, asserting that the slot is unchanged, the fallback is tried and the old file is kept.

</details>

### claude-read:F2-no-test-drives-a-successful-real-download — bucket B, LOW, open

Claim: The rewritten `_download_thumbnail_sync` has no automated test of a successful download: every success test replaces the function with a fake, and the only test that reaches its body expects failure.
Impact: An edit that breaks publishing, such as discarding the temporary file or returning False after a good copy, would leave every thumbnail on the placeholder with the suite green. The second R-5 run exercised this path by hand at accf5dfe4, but nothing protects it afterwards.
Evidence: The only `urlopen` patch in the addon's tests is test_loft_thumbnail.py:495, which uses `_DroppingResponse` and asserts `rel is None`. Every other test in test_loft_thumbnail.py and test_subscription_manager.py that gets a saved thumbnail patches `service._download_thumbnail_sync` (for example test_loft_thumbnail.py:87, 256, 296, 330, 410, 441 and test_subscription_manager.py:394, 435, 483). Grep across addons/media_import finds no other `urlopen` or `urlretrieve` test.
Repro: not_reproduced. Mutants predicted to survive from reading the tests: change `return True` to `return False` at service.py:550; raise `AbandonWrite` after the copy at service.py:549 so the temporary file is never published. In both, `test_dropped_connection_leaves_existing_slot_and_no_partial` still passes and the other tests never run this code.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a test that patches `urlopen` with a response yielding a full body and asserts the return value, the slot's bytes, and that no temporary file remains.

</details>

### claude-read:F3-removal-before-commit-still-untested — bucket B, LOW, open

Claim: The ordering of the old picture's removal after the pointer commit still has no test, so moving the removal before `db.commit()` keeps the suite green.
Impact: A later reorder would make a failed commit, for example a locked SQLite database during a scan, delete the old picture while the row still names it. The card would then show the placeholder until another refresh succeeds.
Evidence: service.py:625-629 commits and then removes, which is correct today. No test in test_loft_thumbnail.py makes the commit fail. Its path-form tests, the f7 test and `test_removal_prunes_the_emptied_old_directory`, have a successful commit, and k1 fails at the download. The r1 F2 fix proposal asked for a commit-failure test; only its failed-download half was added (`test_failed_download_keeps_pointer_and_path_form_file`).
Repro: not_reproduced. Mutant predicted to survive: call `remove_thumbnail_quietly(file_record.thumbnail_path)` just before `db.commit()` at service.py:625 and drop the call at service.py:628-629. The f7, k2 and k3 tests all still pass because the commit succeeds in each.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a test that makes the session commit raise after a successful download and asserts that the old file's bytes and the old pointer remain.

</details>

## Not verified

- claude-read: Nothing was executed: no tests, mutants or reproductions were run, because only Read, Glob and Grep are available. Every prediction comes from reading the code.
- claude-read: F1 rests on the stdlib source of Python 3.14.8 on this machine, while the backend image uses python:3.12-slim. The 3.12 source was not read; its `HTTPResponse.read(amt)` and `urlretrieve` behaviour are assumed to match.
- claude-read: Whether TLS connections to the real thumbnail hosts end with an empty read rather than an exception on a dropped transfer was not observed; it depends on `suppress_ragged_eofs` defaults, recalled from memory, and on how the connection ends.
- claude-read: Whether commit 9bab0d49 is reachable from the addon remote. This worktree's submodule git directory lists it only as a local branch head.
- claude-read: The working tree was read rather than the commit object, on the assumption that it matches 23030903d with the submodule at its pin. The only local head for the submodule branch is 9bab0d49, which supports that.
- claude-read: The R-5 evidence files named in decisions.md live outside the repository and were not read.
- claude-verify: Nothing was executed: the early-EOF behaviour and the F3 mutant were traced by reading code, not reproduced.
- claude-verify: The Python 3.12 stdlib used by the deployed image was not read; only the local 3.14.8 source was available.
- claude-verify: `_read_chunked` behaviour on an early EOF was not traced, so chunked responses are outside the F1 confirmation.
- claude-verify: That the addon checkout's HEAD matches the gitlink pinned at 23030903d was not checked; the addon code was read from the working tree.
- claude-verify: How often a CDN thumbnail transfer actually ends early in normal use was not measured.

TOTAL: 3 findings
