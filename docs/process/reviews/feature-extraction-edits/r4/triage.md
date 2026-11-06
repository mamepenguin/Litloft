# Triage: r4

## Trajectory

This run:
- claude-read: The fix rounds since r3 are small and local. The r3 event-ordering finding was fixed by moving the event after the realignment, without adding a new branch or state, and by changing the test that had locked in the old behaviour. The frontend round added portals and a few classes, plus one inline style that replaces a class (the previous class was swapped for the inline style after the test showed Tailwind classes were not readable). That is a replacement, not a stacked patch. A new state of the confirmation is closed through a keepOpen local in a finally block, which removes the earlier setConfirmRefine(true) branch. No round adds a branch, state or prediction that the round before it also added; the design is not being patched in layers. One remaining edge, a stale item emitting an event, is a leftover of the same reorder.

Earlier runs:
- r2 / claude-read: The fix rounds were mostly corrections. The submodule was repointed twice: the first time for the renumbering of SPEC-ADDON-065 to 070 (identifiers and test names only), the second for review fixes. The review fixes removed things: the duplicate discard in Refine's finally block, and the inline confirmation panels that were replaced by ConfirmDialog. They also added missing behaviour that a spec rule required: _park for inactive files, persisting the attempt counter before the retry raise, the 'ended' events, and the 409 busy and corrected handling in the frontend. The frontend rounds did add state: forceCorrected, editDraftsRef, loadedFileRef, refreshTick and actionError. Each of these has a reset path that the next round may need to patch (F1 and F2 are examples), so the frontend is where patching shows. The backend fixes were local and did not add a new branch on top of an earlier one."
- r3 / claude-read: The r2 fix round is small and removes stale state more than it adds: forceCorrected is now reset on cancel and on a new request, and the edit drafts are dropped on refetch. No new state or branch was added for those two. The followup.py change is a reorder, not a new branch, but it moved the event ahead of the realignment it announces and so introduced the exactly-once breach in F1. Across r1 to r3 the pattern is not stacked patches on patches; each round is a local change. The frontend reset paths are where the earlier round needed patching, and this round patched them directly.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 2
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: _process_utterance emits the 'corrected' event after _realign_utterance returns even when _realign_utterance returned early because the chunk was deleted or its text changed (a stale item), so a stale item still announces.
Impact: When an utterance is corrected twice before the worker runs, the older item can emit a 'corrected' event without having written anything, and the newer item emits another. The effect is an extra refetch of the transcript panel in a single-user tool; no data is wrong.
Evidence: addons/intelligence/app/workers/followup.py:272-273 call _realign_utterance and then post_addon_event_sync unconditionally. The early 'return' paths in _realign_utterance (chunk is None or chunk.text != text) do not signal the caller. The stale check in _stale runs only at the start of process_item.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Make _realign_utterance return whether it wrote or ended the pending mark, and emit the event only then.

</details>

### claude-read:F2 — bucket B, INFO, open

Claim: The hidden 修正 buttons of the other rows are hidden by inline opacity 0 and pointer-events none while one row is edited, but they remain keyboard-focusable and activatable.
Impact: A keyboard user can Tab to an invisible button and press Enter to start editing another row. The draft map keeps the earlier draft, so no text is lost; the cost is a confusing invisible focus stop.
Evidence: TranscriptSection.tsx near line 1116: the style prop sets only opacity and pointerEvents; the button is not disabled and has no tabIndex change.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run any test or code.
- claude-read: I did not read the whole of followup.py, only its call order around _process_utterance.
- claude-read: I did not check what useDialogPortalTarget returns when no host exists.
- claude-read: I did not re-trace the invariants outside the fix commits.
- claude-verify: Tests were not run or read.
- claude-verify: I did not check how process_item's _stale pre-check interacts with the event under concurrent saves.
- claude-verify: Everything outside the two cited code regions.

TOTAL: 2 findings
