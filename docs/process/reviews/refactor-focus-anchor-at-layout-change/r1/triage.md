# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- frontend/src/components/AppShell.tsx — full: Read the whole file (1-425).
- frontend/src/components/FocusModeShortcuts.tsx — full: Read the whole file (1-32).
- frontend/src/hooks/useFocusMode.ts — full: Read the whole file (1-105).
- frontend/src/lib/readingAnchor.ts — full: Read the whole file (1-184).

Test files:
- none

## Findings

A: 0
B: 2
C: 0

### claude-read:F1 — bucket B, INFO, open

Claim: The diff edits frontend/src/lib/readingAnchor.ts, which is not in the touch-point list. It adds the exported forgetReadingAnchor(), which clears the module-level pending anchor.
Impact: None for a user. The scroll-restoring module that changes scrollTop or calls window.scrollBy for up to 20 frames after a focus-layout change now has a new entry point, and the plan does not name it. A reader who checks the plan would not expect this file to change.
Evidence: readingAnchor.ts:125-127 adds forgetReadingAnchor (pending = null). It is called from AppShell.tsx:339. The touch-point list names useFocusMode.ts and AppShell.tsx but not lib/readingAnchor.ts. The same file was already reported as an unplanned place in docs/process/reviews/feature-focus-mode/r6/claude-read.json:58.
Repro: not_reproduced: this is a planning-scope observation and needs no runtime reproduction.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add frontend/src/lib/readingAnchor.ts to the touch-point list in invariants.md, or record in decisions.md why it was left out.

</details>

### claude-read:F2 — bucket B, INFO, open

Claim: The diff edits frontend/src/components/FocusModeShortcuts.tsx, which is not in the touch-point list. The `T` handler no longer reads useIsWideViewport and now calls toggleFocusMode() with no argument.
Impact: None for a user. This is the only component that registers the `focus-mode` shortcut context (I6). The touch-point list puts that context in useFocusMode.ts, so the plan points at a different file from the one this change edits.
Evidence: FocusModeShortcuts.tsx:7, 17-29 drop the wide argument and the `wide` memo dependency. The touch-point list says that useFocusMode.ts holds the `focus-mode` shortcut context and does not name FocusModeShortcuts.tsx. The same file was already reported as an unplanned place in docs/process/reviews/feature-focus-mode/r6/claude-read.json:88.
Repro: not_reproduced: this is a planning-scope observation and needs no runtime reproduction.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add frontend/src/components/FocusModeShortcuts.tsx to the touch-point list in invariants.md.

</details>

## Not verified

- claude-read: I did not open or run the e2e tests that decisions.md cites (focus-mode-desktop.spec.ts:834 and :890), so I did not check that they kill the mutants it describes.
- claude-read: I did not check behaviour under React StrictMode double-invoked effects in development.
- claude-read: I did not check whether the full invariants.md file lists touch points beyond the text quoted in the prompt.
- claude-verify: The base (origin/develop) text of readingAnchor.ts and FocusModeShortcuts.tsx. I could not run git diff, so the 'removed' parts of each claim are inferred from product-files.txt and decisions.md.
- claude-verify: The e2e tests named in decisions.md were not read or run.
- claude-verify: Other callers that set focusModeStore directly (for example the tree button's exit path), to see how they interact with the anchor.

TOTAL: 2 findings
