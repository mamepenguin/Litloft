# Triage: r7

## Trajectory

This run:
- claude-read: Commit 4855de8 adds no production code: the submodule pointer moves 0eacc23 to e4f2f89 and the diff is test-only. It adds branches to the test suite for the download stop rules (stall, free space, time limit, the 600 s floor, the unknown-duration 7200 s cap), a leftover-output check, a temp-file check, a zero-byte and non-zero-exit check, and a FreeSpace helper, plus a yt-dlp double that writes partial outputs. Each of these predicts a product behaviour that the production download_rendition already implements, so the round tests rather than patches the product. Nothing from the previous round (r6) is removed; the r6 findings TP-1 to TP-3 are about the base diff and are not touched by this commit.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 2
C: 0

### claude-read:R4855-1 — bucket B, LOW, open

Claim: The new download stop-rule tests start their action (clock advance or free-space drop) after a fixed 0.3 s sleep that follows only the appearance of download.log, and several then assert that a partial was written, so their outcome depends on wall-clock timing.
Impact: Under a loaded machine the action can land before the fake yt-dlp writes its partial, so the partials() assertion fails intermittently. The suite then reports a red test for a correct product, or hides a regression behind a race. No user-visible product path is affected.
Evidence: addons/intelligence/tests/test_spec_addon_117_loft_media_fetch.py: _after_download_starts (waits for youtube.download_commands(), then time.sleep(0.3), then action()); the stall test (set_download(hold=30, stall_bytes=8192)), the free-space test (set_download(hold=5, stall_bytes=4096)) and the time-limit test each assert youtube.partials() != [].
Repro: not_reproduced. Reasoning from the code: the fake yt-dlp opens the output and writes stall_bytes only after urlopen returns, so there is no synchronisation with the action thread.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Make the action wait for a partial note (poll youtube.partials() until non-empty, with a bounded wait) instead of sleeping 0.3 s after the command appears.

</details>

### claude-read:R4855-2 — bucket B, INFO, open

Claim: The time-limit test's name and docstring say the download is stopped by the time limit, but the assertions check only that a partial exists, the failure is counted, and the process stopped; they do not check which stop rule fired.
Impact: A regression that changes the time limit (for example the 1.5x factor or the 600 s floor) is caught only by the separate floor and unknown-duration tests. A regression that removes the deadline check would not be caught by this test unless the stream stops growing, so the test name overstates what it proves.
Evidence: addons/intelligence/tests/test_spec_addon_117_loft_media_fetch.py: test_spec_addon_117_i2_a_download_is_stopped_at_the_time_limit (set_download(grow=[64, 3.0]), clock.advance(601)); addons/intelligence/app/youtube_source.py download_rendition loop checks deadline, stall and free space and does not report which one fired.
Repro: not_reproduced. The mutation 'delete the deadline check in download_rendition' would make the grow download finish in about 3 s and exit 0, which is then scanned, so the test would fail; so the test does catch that mutation. The residual gap is only the naming and the isolation of the cause.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Keep the test; if the name is meant to isolate the time limit, state in the docstring that the stall and free-space rules are kept clear by the growing stream.

</details>

## Not verified

- claude-read: Did not run the test suite, so the pass/fail status and the flakiness of the timing-based tests were not observed.
- claude-read: Did not check the test double's ffmpeg and frame paths or the frontend tests in this commit.
- claude-read: Did not open the product code in addons/intelligence/app/youtube_source.py beyond what the diff shows, so the claims about download_rendition's loop are read from the diff text, not from the file at the commit.
- claude-read: Did not re-verify the r6 findings TP-1 to TP-3 against the commit; they concern the base diff and the touch-point list, which this commit does not change.
- claude-verify: I did not run the test suite, so the flakiness of R4855-1 is inferred from the code and not observed.
- claude-verify: I did not confirm where the fake yt-dlp writes its download.log start entry, so I did not measure how long a partial takes to appear after that entry.
- claude-verify: I did not read the value of MIN_TIME_LIMIT in app/workers/loft_media.py, so the 600 s floor the time-limit test relies on is assumed.
- claude-verify: I did not check the other tests in the commit beyond the one file and its doubles, or the other touch points listed in the review.

TOTAL: 2 findings
