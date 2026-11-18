# Triage: r3

## Trajectory

This run:
- claude-read: The design is not being patched. 3da286167 adds one condition (`!following`) to an effect that already existed in the change, with a matching dependency, plus one e2e test and one jsdom assertion that answer r2's R2-1 and R2-2. The rounds before it added no product condition: a6e38c9e0 added a test assertion, c79ab7bd2 added one jsdom test, and 3cedce4f9 was documentation. So no round adds a branch, a state or a prediction that the previous round also added. No round removed a branch or a state. 1e08ae53 is documentation only. r1 TP-1 (the pdfminer log level in main.py) is still unaddressed.

Earlier runs:
- r2 / claude-read: The design is not being patched. No fix round since r1 adds a product branch, state or prediction. a6e38c9e0 adds one test assertion: the TranscriptSection reveal exemption must match exactly one reveal, which narrows r1 TP-4's whole-file exemption. 3cedce4f9 is documentation only (the r1 record). c79ab7bd2 bumps the addon submodule to add a single test for B1 (the dialog suspends following and close does not resume it). No round repeats what the round before it added, and none removes a branch or state. TranscriptSection.tsx and TranscriptEditDialog.tsx are unchanged across the fix commits. r1 TP-1 (the pdfminer log level) is still unaddressed in the diff.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Read coverage

Product files:
- addons/intelligence/app/main.py — full: The only hunk is the 3-line pdfminer logger change shown in the diff, with its module-level context.
- addons/intelligence/frontend/ExtractionEditsReview.test.tsx — partial: Read only the changed hunk at @@ -424 in the diff.
- addons/intelligence/frontend/TranscriptEditDialog.tsx — full: Read the whole file (lines 1-207).
- addons/intelligence/frontend/TranscriptSection.test.tsx — partial: Read the two changed hunks with their enclosing it() blocks in the diff, and nothing else.
- addons/intelligence/frontend/TranscriptSection.tsx — partial: Read lines 225-864 from the file, which hold the state, the selection, reveal and follow effects, and the callbacks. Read the render hunks at 1160-1366 in the diff, and grepped for editTarget and the early return. Lines 1-224 and 864-1159 were not read.
- addons/intelligence/frontend/TranscriptSectionTouch.test.tsx — full: New file. Read the whole file in the diff, including the assertion added in 3da286167.
- addons/intelligence/frontend/messages/en.json — full: Read the one-line hunk.
- addons/intelligence/frontend/messages/ja.json — full: Read the one-line hunk.
- frontend/e2e-components/fixtures/app.tsx — full: Read both changed hunks (the import and the arrangement spread).
- frontend/e2e-components/fixtures/transcriptTouch.tsx — full: New file. Read the whole file in the diff.
- frontend/e2e-components/spec-viewport.spec.ts — full: Read the one-line hunk.
- frontend/e2e-components/transcript-touch.spec.ts — full: New file. Read the whole file in the diff, including the suspended-following test added in 3da286167.

Test files:
- frontend/src/__tests__/ime-enter-guard.test.ts — partial: Read only the diff hunks.
- frontend/src/__tests__/row-action-reveal.test.ts — partial: Read only the diff hunks this round.

## Needs a human

### unspecified_behavior

Note: addons/intelligence/app/main.py:61-63 still sets the service-wide `pdfminer` logger to ERROR. This is r1 TP-1, it is still in the diff, and no spec in this review covers it.
- claude-read: addons/intelligence/app/main.py:61-63 still sets the service-wide `pdfminer` logger to ERROR. This is r1 TP-1, it is still in the diff, and no spec in this review covers it.

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: I did not run any unit or e2e test; every conclusion comes from reading the code.
- claude-read: I did not confirm in a real browser whether a direct scrollTop write cancels an in-flight smooth scrollTo.
- claude-read: I did not confirm that Playwright's dispatchEvent('wheel') reaches the scroller's wheel listener in the fillHeight fixture (scrollingBoxOf(list) versus the list itself). The test's own check that the resume chip appears would catch it if it did not.
- claude-read: I did not read TranscriptSection.tsx lines 1-224, 864-1037 and 1039-1159, apart from what the diff shows.
- claude-read: I did not read ime-enter-guard.test.ts or row-action-reveal.test.ts beyond their diff hunks this round.
- claude-verify: I did not read the test files (TranscriptSectionTouch.test.tsx, TranscriptSection.test.tsx, TranscriptSectionCorrections.test.tsx) or the e2e-components scene and spec.
- claude-verify: I did not check the useShortcuts handler refresh semantics, or whether Escape during IME composition is filtered before the provider (frontend/src/hooks/useShortcuts.ts).
- claude-verify: I did not check the Button component's minimum hit size for the dialog's キャンセル and 保存 (frontend/src/components/Button.tsx).
- claude-verify: I did not trace I11's saved-scroll-place restoration (readPlace/putBack) with a strip present.
- claude-verify: I did not check the ja.json/en.json transcriptQuote strings or the docs updates.
- claude-verify: I ran nothing; every observation comes from reading the code statically.

TOTAL: 0 findings
