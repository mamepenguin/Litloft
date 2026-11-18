# Triage: r2

## Trajectory

This run:
- claude-read: The design is not being patched. No fix round since r1 adds a product branch, state or prediction. a6e38c9e0 adds one test assertion: the TranscriptSection reveal exemption must match exactly one reveal, which narrows r1 TP-4's whole-file exemption. 3cedce4f9 is documentation only (the r1 record). c79ab7bd2 bumps the addon submodule to add a single test for B1 (the dialog suspends following and close does not resume it). No round repeats what the round before it added, and none removes a branch or state. TranscriptSection.tsx and TranscriptEditDialog.tsx are unchanged across the fix commits. r1 TP-1 (the pdfminer log level) is still unaddressed in the diff.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Read coverage

Product files:
- addons/intelligence/app/main.py — full: The only hunk is the 3-line pdfminer logger change shown in the diff. I did not reopen the file this round.
- addons/intelligence/frontend/ExtractionEditsReview.test.tsx — partial: Read only the changed hunk at @@ -424 in the diff.
- addons/intelligence/frontend/TranscriptEditDialog.tsx — full: New file; read the whole file in the diff.
- addons/intelligence/frontend/TranscriptSection.test.tsx — partial: Read both changed hunks with their enclosing it() blocks in the diff, not the rest of the file.
- addons/intelligence/frontend/TranscriptSection.tsx — partial: Read lines 150-709, 810-1049 and 1100-1366 from the file, which cover every changed hunk and the state, effects and callbacks they use. Lines 1-149, 710-809 and 1050-1099 were not read.
- addons/intelligence/frontend/TranscriptSectionTouch.test.tsx — full: New file; read the whole file in the diff, including the B1 test added in c79ab7bd2.
- addons/intelligence/frontend/messages/en.json — full: Read the one-line hunk.
- addons/intelligence/frontend/messages/ja.json — full: Read the one-line hunk.
- frontend/e2e-components/fixtures/app.tsx — full: Read both changed hunks (the import and the arrangement spread).
- frontend/e2e-components/fixtures/transcriptTouch.tsx — full: New file; read the whole file in the diff.
- frontend/e2e-components/spec-viewport.spec.ts — full: Read the one-line hunk.
- frontend/e2e-components/transcript-touch.spec.ts — full: New file; read the whole file in the diff.

Test files:
- frontend/src/__tests__/ime-enter-guard.test.ts — partial: Read only the diff hunks.
- frontend/src/__tests__/row-action-reveal.test.ts — full: Read the whole file (lines 1-212).

## Needs a human

### unspecified_behavior

Note: addons/intelligence/app/main.py:61-63 still sets the pdfminer logger to ERROR service-wide. This is unchanged since r1 TP-1, and no spec in this review covers it.; On a coarse pointer, revealCue can scroll the list while following is suspended (R2-1). The spec does not describe this.
- claude-read: addons/intelligence/app/main.py:61-63 still sets the pdfminer logger to ERROR service-wide. This is unchanged since r1 TP-1, and no spec in this review covers it.
- claude-read: On a coarse pointer, revealCue can scroll the list while following is suspended (R2-1). The spec does not describe this.
- claude-verify: The spec does not say whether the strip-reveal scroll should respect a suspended following state when the playback highlight comes back to the selected row through a seek made outside the transcript.

### unspecified_behavior

Note: The spec does not say whether the strip-reveal scroll should respect a suspended following state when the playback highlight comes back to the selected row through a seek made outside the transcript.
- claude-read: addons/intelligence/app/main.py:61-63 still sets the pdfminer logger to ERROR service-wide. This is unchanged since r1 TP-1, and no spec in this review covers it.
- claude-read: On a coarse pointer, revealCue can scroll the list while following is suspended (R2-1). The spec does not describe this.
- claude-verify: The spec does not say whether the strip-reveal scroll should respect a suspended following state when the playback highlight comes back to the selected row through a seek made outside the transcript.

## Findings

A: 0
B: 2
C: 0

### claude-read:R2-1 — bucket B, LOW, open

Claim: On a coarse pointer, the reveal effect scrolls the list to the selected row whenever the playback highlight lands on it again, without checking `following`, so it moves the list even after the reader has suspended following by scrolling away.
Impact: On a phone: tap row A, scroll down to read ahead (following is now off and the 再生位置に戻る chip shows), then use the player's skip-back or scrubber to return into A's time range. The list jumps back to A even though following is suspended. That breaks the panel's own rule that reading ahead wins over following. The fine path is unaffected.
Evidence: addons/intelligence/frontend/TranscriptSection.tsx:605-608 runs `useEffect(() => { if (!coarse || !selected || selectedPosition !== activeIndex) return; revealCue(selected.index); }, [activeIndex, ...])`, and the guard never reads `following`. revealCue (lines 569-589) writes `scroller.scrollTop` directly. Compare the follow effect at lines 557-560, which returns early when `!following`, and the suspension listeners at lines 623-652.
Repro: Mutation in thought: add `|| !following` to the guard at line 606. No test in TranscriptSectionTouch.test.tsx or transcript-touch.spec.ts would fail, because none sets following to false and then moves activeIndex back onto the selected row. Steps on a device: select a row, scroll the list by touch, seek the media back into that row, and the list scrolls.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Run the activeIndex-driven reveal only while `following` is true (the tap path through revealPendingRef already covers the tap itself).

</details>

### claude-read:R2-2 — bucket B, INFO, open

Claim: No test checks that the dialog field's Enter handler calls preventDefault outside IME composition. The jsdom test for I6 passes whether or not the call is there.
Impact: If the `event.preventDefault()` on Enter were deleted, a real browser would insert a line break, and onChange would then strip it. The caret would jump and an extra change event would fire, and no test would notice. The saved text stays free of line breaks because of the onChange stripping, so a user does not see wrong data.
Evidence: addons/intelligence/frontend/TranscriptEditDialog.tsx:173-181 is the Enter handler. TranscriptSectionTouch.test.tsx 'does not save or break the line on Return outside composition' fires keyDown and checks the value and that no PUT was sent. It never checks fireEvent's return value. The composition cases do check `notPrevented`, but only that it is true.
Repro: Mutation in thought: remove `event.preventDefault()` at TranscriptEditDialog.tsx:178. fireEvent.keyDown in jsdom inserts no text, so the I6 test still passes. The mutant survives.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In the Return-outside-composition test, assert `expect(fireEvent.keyDown(field, { key: 'Enter' })).toBe(false)`.

</details>

## Not verified

- claude-read: I did not run any unit or e2e test.
- claude-read: I did not read TranscriptSectionCorrections.test.tsx or the helpers in testI18nJa.
- claude-read: I did not confirm in a real browser whether revealCue's direct scrollTop write cancels the follow effect's in-flight smooth scroll.
- claude-read: I did not check how parseVttCues assigns `index` for the words and external sources.
- claude-read: I did not verify the pdfminer logging change against pdf extraction behaviour.
- claude-verify: I did not run any test or browser session. Both findings were checked by reading the code only.
- claude-verify: I did not check that the addons/intelligence submodule checked out in this worktree matches the pointer recorded at commit c79ab7bd2. I assumed the files I read are the ones at that commit, because their line numbers match the findings' evidence.
- claude-verify: I did not check how a real browser behaves with smooth scrolling from the follow effect running at the same time as the reveal effect's scrollTop writes.

TOTAL: 2 findings
