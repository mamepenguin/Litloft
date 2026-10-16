# Triage: r2

## Trajectory

This run:
- claude-read: Only one fix round (4042e2344) exists since r1. It adds no production branch, state or prediction: the addon code under app/ is unchanged between 15de2e8 and dc0134b. It only adds tests: an I3 read-ordering test, a pause-during-retry test, a cancel-mid-pass test, a loop-goes-idle test, a lifespan ordering/shutdown test, and a second fault case for the rule-version check. Nothing was removed. The design is not being patched. The round responds to coverage gaps rather than to the r1 touch-point findings, which remain open as they were.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R2-1 is bucket A or BLOCKER

## Findings

A: 1
B: 0
C: 0

### claude-read:R2-1 — bucket A, LOW, open

Claim: A tokenizer child that the pass spawns after the loop has been cancelled is never terminated. `stop` is not checked between the pre-batch pause check and the spawn, and `_set_child` runs only after the child has started, so `_terminate_current_child` sees no child in that window.
Impact: The window covers the first batch of a pass and each fresh child after a failure. If shutdown lands in it, the lifespan returns after its 5 s wait while the child keeps tokenizing a batch of up to 200 files for up to 300 s. Process exit is held back by the to_thread worker until the batch finishes, and a container stop can end in SIGKILL. Nothing is written, because `_write_all` checks `stop`, so no data is wrong.
Evidence: addons/intelligence/app/idf_backfill.py:213-221: `_Tokenizer.term_sets` constructs `tfidf.TokenizerChild()` (which starts the process), calls `_set_child` and then `self._child.term_sets(..., 300)`. None of these steps checks `stop`. :200-204: `_terminate_current_child` reads `_current_child` once under the lock and does nothing when it is None. :258 and the per-batch loop in `run_idf_backfill_pass` check `stop` only before `_read_docs`, which runs a DB read of up to 200 transcripts first (:278). The loop's cancel handler (idf_backfill.py ~:403-407) sets `stop`, terminates and waits 5 s, and does not re-check for a child that appears later.
Repro: not_reproduced. Thought experiment: cancel the loop task while the pass thread is inside `_read_docs` of the first batch. `_current_child` is None, so nothing is terminated. The thread then spawns a child and blocks in `poll(300)`. The lifespan returns with `multiprocessing.active_children()` non-empty. The r2 tests cancel only after the GATEWORD child has signalled `entered`, which is after `_set_child`, so they do not cover this window.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> In `_Tokenizer.term_sets`, register the child under `_state_lock` and, under the same lock, refuse to start (or stop at once) when `stop` is set. Alternatively, check `stop` right after `_set_child` and terminate the child if it is set.

</details>

## Not verified

- claude-read: Did not run any test. Whether the four new r2 tests are green or flaky on this machine is unverified.
- claude-read: Did not confirm the SQLite isolation behavior of `get_search_db_read` (whether pysqlite autocommits each SELECT), on which the I3 test's power to detect a mutant depends.
- claude-read: Did not read the full `idf_backfill_loop` cancel handler at its exact line numbers, nor main.py's lifespan shutdown ordering beyond the diff.
- claude-read: Did not re-read .claude/rules documents in full for this round.
- claude-verify: I did not run any tests or reproduce the race dynamically; the argument rests on reading the code only.
- claude-verify: I did not confirm how uvicorn/asyncio.run handle the default executor at shutdown in this deployment (container stop timeout, SIGKILL behavior).
- claude-verify: I did not check the other touch points (whisper.py, refine.py, purge.py, database.py migration) against invariants I1-I10.

TOTAL: 1 findings
