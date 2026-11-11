# Triage: r3

## Trajectory

This run:
- claude-read: The r2 fix round is small and removes stale state more than it adds: forceCorrected is now reset on cancel and on a new request, and the edit drafts are dropped on refetch. No new state or branch was added for those two. The followup.py change is a reorder, not a new branch, but it moved the event ahead of the realignment it announces and so introduced the exactly-once breach in F1. Across r1 to r3 the pattern is not stacked patches on patches; each round is a local change. The frontend reset paths are where the earlier round needed patching, and this round patched them directly.

Earlier runs:
- r2 / claude-read: The fix rounds were mostly corrections. The submodule was repointed twice: the first time for the renumbering of SPEC-ADDON-065 to 070 (identifiers and test names only), the second for review fixes. The review fixes removed things: the duplicate discard in Refine's finally block, and the inline confirmation panels that were replaced by ConfirmDialog. They also added missing behaviour that a spec rule required: _park for inactive files, persisting the attempt counter before the retry raise, the 'ended' events, and the 409 busy and corrected handling in the frontend. The frontend rounds did add state: forceCorrected, editDraftsRef, loadedFileRef, refreshTick and actionError. Each of these has a reset path that the next round may need to patch (F1 and F2 are examples), so the frontend is where patching shows. The backend fixes were local and did not add a new branch on top of an earlier one."

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:F1 is bucket A or BLOCKER

## Findings

A: 1
B: 0
C: 0

### claude-read:F1 — bucket A, MEDIUM, open

Claim: After the r2 reorder, _process_utterance emits intelligence.transcript.updated (reason corrected) before the realignment runs, so the event fires before the item finishes. It fires once more on every retry of a load_failed or unreachable realignment.
Impact: An open transcript panel refetches the transcript and subtitles at the event, while words are still pending, and shows the one-cue fallback. No event follows when alignment later writes the words, so the panel and subtitles stay on the fallback until something else triggers a refetch. When the model is unavailable, the same file's corrected event is emitted up to three times (once per attempt) rather than once.
Evidence: addons/intelligence/app/workers/followup.py _process_utterance: _recompute_keywords and post_addon_event_sync("...transcript.updated", reason "corrected") now come before _realign_utterance. _realign_utterance raises RuntimeError on a retry, process_item records the failure, and the whole _process_utterance runs again at the next due time, emitting again. The new test test_a_retry_still_rebuilds_the_keywords_and_announces asserts the event is emitted on the attempt that leaves the item queued.
Repro: Stub align_span to return load_failed, call process_item twice with last_attempt_at reset: two corrected events are recorded and the item is still pending. With align_span returning aligned, one event is recorded before the words are inserted, and none after.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Emit the corrected event once, after the realignment has ended (aligned, no words, or third failed attempt). Recompute the keyword vector before the realignment if it should not wait, but do not emit the event on a path that raises for a retry.

</details>

## Not verified

- claude-read: I could not run any test or code.
- claude-read: I did not read the full followup.py after the commit beyond the diff, or whisper.py, ocr.py and workers/refine.py.
- claude-read: I did not verify whether another path (for example a Refine or a restore) triggers a refetch after the words are written.
- claude-read: I did not check whether the editDraftsRef reset interacts with the open field's own draft.
- claude-verify: Whether the tests actually assert the event on a retry attempt.
- claude-verify: The due-time and backoff logic that re-runs a failed item.
- claude-verify: Every other invariant, and the rest of the diff.

TOTAL: 1 findings
