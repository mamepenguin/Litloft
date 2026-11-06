# Triage: r2

## Trajectory

This run:
- claude-read: The fix rounds were mostly corrections. The submodule was repointed twice: the first time for the renumbering of SPEC-ADDON-065 to 070 (identifiers and test names only), the second for review fixes. The review fixes removed things: the duplicate discard in Refine's finally block, and the inline confirmation panels that were replaced by ConfirmDialog. They also added missing behaviour that a spec rule required: _park for inactive files, persisting the attempt counter before the retry raise, the 'ended' events, and the 409 busy and corrected handling in the frontend. The frontend rounds did add state: forceCorrected, editDraftsRef, loadedFileRef, refreshTick and actionError. Each of these has a reset path that the next round may need to patch (F1 and F2 are examples), so the frontend is where patching shows. The backend fixes were local and did not add a new branch on top of an earlier one."

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:F1 is bucket A or BLOCKER

## Needs a human

### unspecified_behavior

Note: Per-line edit drafts kept across line switches (TranscriptSection) are not in the spec.; A cancelled corrected-confirmation leaves forceCorrected set in IndexDetailsDialog.; Rows other than the edited one are dimmed and their seek buttons are disabled while a line is edited. The spec says only that the edited row does not seek.
- claude-read: Per-line edit drafts kept across line switches (TranscriptSection) are not in the spec.
- claude-read: A cancelled corrected-confirmation leaves forceCorrected set in IndexDetailsDialog.
- claude-read: Rows other than the edited one are dimmed and their seek buttons are disabled while a line is edited. The spec says only that the edited row does not seek.

## Findings

A: 1
B: 2
C: 0

### claude-read:F1 — bucket A, LOW, open

Claim: IndexDetailsDialog's handleCancel clears pendingTask but not forceCorrected, so a cancelled 409-corrected confirmation leaves forceCorrected true for the next regenerate request.
Impact: After the viewer cancels the stale-details corrected dialog, the next regenerate of any task on that dialog (for example clip, or a task whose kind is not corrected) shows the corrected-file warning text and sends overwrite_corrections true without a matching dialog. The server ignores the flag on a kind that is not corrected, so the effect is a wrong message and a flag sent on a path the viewer never confirmed for that task.
Evidence: addons/intelligence/frontend/IndexDetailsDialog.tsx:232-234 (handleCancel only calls setPendingTask(null)); :239-240 (overwrite = forceCorrected || ...); :274 setForceCorrected(true); only handleConfirm (:247) resets it. handleRequestRegenerate (:228-230) does not reset it either.
Repro: Open Index details on a file whose details say not corrected but whose server state is corrected. Regenerate ocr, confirm, receive 409 corrected, then click キャンセル. Click regenerate on another task: the corrected warning is shown and, on confirm, the body carries overwrite_corrections true.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Reset forceCorrected in handleCancel and in handleRequestRegenerate.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: TranscriptSection keeps per-line edit drafts in editDraftsRef keyed by chunk index and clears them only when fileId changes, not when the transcript is refetched after a Refine, restore or other renumbering.
Impact: After a refetch that renumbers or replaces utterances, opening line N can fill the field with a draft typed for a different utterance. Saving then writes that text over the new utterance, with expected_text taken from the new row, so the server accepts it. The owner sees the field, so the result is not silent, but the stale draft is misleading.
Evidence: TranscriptSection.tsx beginEdit: setEditText(editDraftsRef.current[cue.index] ?? cue.text); editDraftsRef reset only in the [fileId] effect. rechunk_from_words renumbers indexes 0..n-1 per the spec C10.
Repro: Start editing line 0, type a draft, open line 1 (the draft for 0 is kept). Refine finishes and the transcript is refetched with different utterances. Open line 0: the old draft appears.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Drop the drafts whenever the chunk list is replaced by a refetch, or key them by start plus original text.

</details>

### claude-read:F3 — bucket B, LOW, open

Claim: A follow-up item whose realignment raises for a retry (load_failed or unreachable) fails before the keyword-vector recompute and the corrected event, so those steps wait for the 10-minute retry or the third attempt.
Impact: For up to about 20 minutes, with the model unavailable, tfidf_keywords_indexed stays false and an open panel is not told that the text changed. Semantic search for the file has no keyword vector in that time. The spec accepts a retry, but it does not say the keyword vector is held back.
Evidence: workers/followup.py _process_utterance: _embed_utterance, then _realign_utterance (raises RuntimeError on retry), then _recompute_keywords and post_addon_event_sync are skipped; process_item catches and calls _record_failure.
Repro: Stub align_span to return load_failed. After one process_item call the item remains, the keyword embedding is absent and no event was sent.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: whisper.py, workers/refine.py in full, the rest of ocr.py, manifest.json and addon_events.py. The diff was truncated, so they were not read.
- claude-read: Backend behaviour at run time. I could not run any test.
- claude-read: Whether TranscriptSection's doRestore resets confirmRestore on every path.
- claude-read: Whether the invariants hold beyond the files I read.
- claude-verify: I did not run any code or test, because I only have read tools.
- claude-verify: I did not check the other invariants or touch points beyond the three findings.
- claude-verify: I did not check whether a refetch path elsewhere in TranscriptSection resets the drafts.

TOTAL: 3 findings
