# Triage: r3

## Trajectory

This run:
- claude-read: The only round since r2 (28cfd1a68) is test-only. It adds no product branch, state or prediction. It gives the Excel mock an `xs.sheet.focusing` flag and pins the release of that flag on focus leaving the grid and on unmount, which answers part of r2's R1. Earlier rounds: r1→r2 removed one mechanism (the synthetic body click) and added one ownership guard. The `isolate` prediction was added and then reverted. No round adds a branch or state that the round before it also added, so the design is not being patched repeatedly. Still open: the probe path and the ownership guard have no test (R1 here), and r2's R2 (pressing the grid to dismiss a menu) is not addressed.

Earlier runs:
- r2 / claude-read: Round 1 (e0a561429) replaced the synthetic body click with a direct write to the library's private `focusing` flag. That removed a mechanism, the page-wide event. The same round added a new ownership-aware release (`releaseOfficeGrid`, with conditions on probe identity and wasActive), which is one new piece of state logic. Round 2 (caf19847a) added a prediction, `isolate`, on the theory that stacking order caused a menu-dismiss click to select a cell. Round 3 (beae9a97a) removed that prediction because the theory was wrong (the scrim has pointer-events: none and selection starts on mousedown). No round adds a branch or state that the round before it also added. The net change since r1 is one mechanism removed (the synthetic click) and one ownership guard added. The menu-dismiss defect that round 2 targeted is still open (R2). The flip-flop in rounds 2 and 3 shows patching by guesswork on that one issue, not a design that keeps being patched.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- frontend/package.json — full: The changed hunk in the diff.
- frontend/pnpm-lock.yaml — full: All changed hunks in the diff.
- frontend/src/components/FilePreview.tsx — partial: The diff hunks, and lines 225-297 of the current file (the new branch and the fallback).
- frontend/src/components/office/OfficePreview.tsx — full: A new file, read whole in the diff.
- frontend/src/components/office/excelAdapter.ts — full: The whole current file, read with the Read tool.
- frontend/src/components/office/excelContainment.css — full: A new file, read whole in the diff.
- frontend/src/components/office/officeGridActive.ts — full: A new file, read whole in the diff.
- frontend/src/components/office/wordAdapter.ts — full: A new file, read whole in the diff.
- frontend/src/hooks/useFileNav.ts — full: The changed hunk with its enclosing useShortcuts call, in the diff.
- frontend/src/lib/officeFiles.ts — full: All changed hunks and the new function in the diff.
- frontend/src/messages-core/en.json — full: The changed hunk in the diff.
- frontend/src/messages-core/ja.json — full: The changed hunk in the diff.

Test files:
- frontend/src/__tests__/helpers/officeLazyLoadCases.ts — full: A new file in the diff.
- frontend/src/__tests__/helpers/officeViewer.ts — full: A new file in the diff.
- frontend/src/__tests__/officeMimes.test.ts — partial: Only the changed hunk around lines 88-96.
- frontend/src/components/__tests__/FilePreview.office.test.tsx — full: A new file in the diff.
- frontend/src/components/__tests__/FilePreview.officeArrowKeys.test.tsx — full: The whole current file, read with the Read tool, plus the fix diff.
- frontend/src/components/__tests__/FilePreview.officeLazyLoad.word.test.tsx — full: A new file in the diff.
- frontend/src/components/__tests__/FilePreview.test.tsx — partial: Only the changed hunk around lines 425-440.

## Findings

A: 0
B: 1
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: The new test pins `releaseGridFocus` in `onFocusIn` and in `dispose`, but two other parts of the arrow gate still have no test: the focus-probe path in `officeGridOwnsArrows`, and the ownership guard in `releaseOfficeGrid`.
Impact: Two regressions would pass CI. (1) Make `officeGridOwnsArrows` ignore the probe (`return active`). Then a click on a non-focusable spot outside the grid, such as header text or empty canvas margin, no longer releases the arrows, and ← / → stop changing file even though the grid is not active (an I8 failure). (2) Make `releaseOfficeGrid` clear the probe and the active flag unconditionally. Then a stale Excel viewer that is disposed after a newer one has been clicked resets the newer viewer's gate, and ← / → change file while that grid is active (an I8 failure).
Evidence: frontend/src/components/__tests__/FilePreview.officeArrowKeys.test.tsx:164-175: the only 'click outside' test clicks a focusable `<button>`. `clickOn` (:136-143) focuses that button, so `onFocusIn` (excelAdapter.ts:64-70) clears `active`. The mock's window click listener (:38-40) also sets `focusing=false`. Each path alone is enough to make the test pass, so neither path is isolated. No test clicks a non-focusable element outside the grid. No test mounts two Excel viewers. A grep finds `releaseOfficeGrid` only in excelAdapter.ts:91 and officeGridActive.ts. The new test (:188-205) asserts only on `sheet.focusing`. It does not check the module's `active` flag or the probe.
Repro: Mutations, by reading. (a) officeGridActive.ts `officeGridOwnsArrows` → `return active;`: every test in the listed files still passes, because the outside click goes through focusin. (b) `releaseOfficeGrid` → `focusProbe = null; active = false;` unconditionally: no listed test mounts a second Excel viewer, so it survives. Killed by the new test: deleting `releaseGridFocus()` at excelAdapter.ts:69 (fails at :199) and at :93 (fails at :204).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In FilePreview.officeArrowKeys.test.tsx, add a click on a non-focusable outside element (for example a `<p>` in `Page`), then → should call onNavigate. Also add a case where a held Excel load for file A is replaced by file B: B is clicked, then A's late dispose runs, and → should not navigate.

</details>

## Not verified

- claude-read: Whether the tests pass (I could not run commands)
- claude-read: Whether the real x-data-spreadsheet behaves like the mock (focusing is set only by a window click, and is not changed by overlayer mousedown)
- claude-read: Browser behaviour of the DismissScrim interaction (r2 R2)
- claude-read: Addon frontend code outside frontend/src
- claude-verify: I did not run the test suite or any mutation, since I had no shell. The claim that each path alone keeps the test green comes from reading the code only.
- claude-verify: I did not check whether the real x-data-spreadsheet sets `focusing` the way the mock does (a window click handler that tests container.contains).

TOTAL: 1 findings
