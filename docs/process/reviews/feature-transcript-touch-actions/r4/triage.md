# Triage: r4

## Trajectory

This run:
- claude-read: Since r3, the only product change on this branch is 884a57bb3, an addon bump. The rest of the listed commits come from develop (the workbench split, the Scenes cuts switch, the refine realignment fix), arriving through the b8d54da84 merge, plus documentation (93aee8906, a6b9548b2). 884a57bb3 adds a prediction to revealCue's upward branch: it limits the upward scroll to `scrollerRect.bottom - rect.bottom` so a block taller than the list never scrolls its strip out. It also adds a settle poll to the tall-row e2e test. The round before (r3's 3da286167) added the `!following` condition to the same strip-reveal scrolling. So two consecutive rounds have each added a condition to the reveal scroll logic. The reveal is being patched incrementally, though each patch covers a different case (suspended following, then a tall block). No round removed a branch or a state. r1 TP-1 (the pdfminer log level in main.py) is no longer in the product file list, apparently because the base moved rather than because a fix removed it.

Earlier runs:
- r2 / claude-read: The design is not being patched. No fix round since r1 adds a product branch, state or prediction. a6e38c9e0 adds one test assertion: the TranscriptSection reveal exemption must match exactly one reveal, which narrows r1 TP-4's whole-file exemption. 3cedce4f9 is documentation only (the r1 record). c79ab7bd2 bumps the addon submodule to add a single test for B1 (the dialog suspends following and close does not resume it). No round repeats what the round before it added, and none removes a branch or state. TranscriptSection.tsx and TranscriptEditDialog.tsx are unchanged across the fix commits. r1 TP-1 (the pdfminer log level) is still unaddressed in the diff.
- r3 / claude-read: The design is not being patched. 3da286167 adds one condition (`!following`) to an effect that already existed in the change, with a matching dependency, plus one e2e test and one jsdom assertion that answer r2's R2-1 and R2-2. The rounds before it added no product condition: a6e38c9e0 added a test assertion, c79ab7bd2 added one jsdom test, and 3cedce4f9 was documentation. So no round adds a branch, a state or a prediction that the previous round also added. No round removed a branch or a state. 1e08ae53 is documentation only. r1 TP-1 (the pdfminer log level in main.py) is still unaddressed.

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R4-1 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/intelligence/frontend/DetailedSummaryPanel.test.tsx — partial: Read only the one changed hunk (@@ -145) in the diff, which holds most of its it() block.
- addons/intelligence/frontend/ExtractionEditsReview.test.tsx — partial: Read only the changed hunk (@@ -424) in the diff.
- addons/intelligence/frontend/TranscriptEditDialog.tsx — full: New file; read all 207 lines in the diff.
- addons/intelligence/frontend/TranscriptSection.test.tsx — partial: Read the two changed hunks and their enclosing it() blocks in the diff.
- addons/intelligence/frontend/TranscriptSection.tsx — partial: Read lines 225-904 and 1100-1372 from the file, which cover every changed hunk and the state, effects and callbacks they use. Also grepped the index assignments. Lines 1-224 and 905-1099 were read only as far as the diff shows them.
- addons/intelligence/frontend/TranscriptSectionTouch.test.tsx — full: New file; read all of it in the diff.
- addons/intelligence/frontend/messages/en.json — full: Read the one-line hunk.
- addons/intelligence/frontend/messages/ja.json — full: Read the one-line hunk.
- frontend/e2e-components/fixtures/app.tsx — full: Read both changed hunks (the import and the arrangement spread).
- frontend/e2e-components/fixtures/transcriptTouch.tsx — full: New file; read all of it in the diff.
- frontend/e2e-components/spec-viewport.spec.ts — full: Read the one-line hunk.
- frontend/e2e-components/transcript-touch.spec.ts — full: New file; read all of it in the diff, including the tall-row settle poll.

Test files:
- frontend/src/__tests__/ime-enter-guard.test.ts — partial: Read only the diff hunks.
- frontend/src/__tests__/row-action-reveal.test.ts — partial: Read only the diff hunks.

## Findings

A: 1
B: 0
C: 0

### claude-read:R4-1 — bucket A, LOW, open

Claim: The dialog's onSaved/onChanged callbacks capture the panel's state setters, not the dialog they belong to. A save still in flight when the file changes therefore, on return, closes whatever dialog is open at that moment, and onChanged also writes the old file's `changed` message into the new file's error line.
Impact: On a phone the panel is reused across files. Suppose a save is slow, the owner moves to another video, taps a row, presses 修正 and starts typing. When the old response arrives, setEditTarget(null) closes the new dialog and its typed draft is lost. On `changed`, the new file's panel also shows 「内容が更新されました…」, which is about the previous file. None of the routes I8 allows for losing a draft covers this.
Evidence: addons/intelligence/frontend/TranscriptSection.tsx:1351-1366: onSaved/onChanged call closeEditDialog(editTarget), and closeEditDialog (857-863) calls setEditTarget(null), which clears whatever editTarget is current. The fileId effect (332-343) clears editTarget, so the old dialog unmounts. TranscriptEditDialog.tsx `save` has no cancelled/unmounted guard: after the await it calls onSaved()/onChanged() unconditionally. Neither closure checks that the target or file is still the current one.
Repro: not_reproduced. By reading the code: open the dialog on file A and press 保存 with a deferred PUT. Rerender with fileId B, tap a row, open the dialog and change the text. Then resolve A's PUT. setEditTarget(null) runs, and B's dialog closes with its draft discarded. With a 409 `changed` body, B's panel also shows CHANGED_MESSAGE.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Have the dialog ignore its result after unmount (a mounted/cancelled ref in `save`), or have the panel's callbacks compare the target against the current editTarget/fileId before closing it or setting actionError.

</details>

## Not verified

- claude-read: I did not run any unit or e2e test; every conclusion comes from reading the code.
- claude-read: I did not confirm in a real browser, or in iOS Safari, that an instant scrollTop write cancels an in-flight smooth scrollTo.
- claude-read: I did not check whether iOS Safari supports `field-sizing: content`.
- claude-read: I did not read TranscriptSection.tsx lines 1-224 or 905-1099, apart from what the diff shows.
- claude-read: I did not see the addon-level diff of 884a57bb3 on its own. I inferred that the round added the revealCue clamp by comparing line ranges with r3's record.
- claude-read: I did not read the full bodies of ime-enter-guard.test.ts and row-action-reveal.test.ts this round.
- claude-verify: Did not run any test or reproduce at runtime; the claim was confirmed by reading the code paths only.
- claude-verify: Did not check whether the host (player/page) can change fileId while the modal dialog is open, for example by auto-advance or route change, so how reachable the bug is remains an inference.
- claude-verify: Did not inspect the test files for coverage of a file change during a dialog save.

TOTAL: 1 findings
