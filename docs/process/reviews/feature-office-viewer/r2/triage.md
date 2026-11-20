# Triage: r2

## Trajectory

This run:
- claude-read: Round 1 (e0a561429) replaced the synthetic body click with a direct write to the library's private `focusing` flag. That removed a mechanism, the page-wide event. The same round added a new ownership-aware release (`releaseOfficeGrid`, with conditions on probe identity and wasActive), which is one new piece of state logic. Round 2 (caf19847a) added a prediction, `isolate`, on the theory that stacking order caused a menu-dismiss click to select a cell. Round 3 (beae9a97a) removed that prediction because the theory was wrong (the scrim has pointer-events: none and selection starts on mousedown). No round adds a branch or state that the round before it also added. The net change since r1 is one mechanism removed (the synthetic click) and one ownership guard added. The menu-dismiss defect that round 2 targeted is still open (R2). The flip-flop in rounds 2 and 3 shows patching by guesswork on that one issue, not a design that keeps being patched.

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
- frontend/package.json — full: The changed hunk in the diff.
- frontend/pnpm-lock.yaml — full: All changed hunks in the diff.
- frontend/src/components/FilePreview.tsx — partial: The diff hunks, and lines 225-297 of the current file (the new branch and the fallback).
- frontend/src/components/office/OfficePreview.tsx — full: A new file, read whole in the diff. I also read the isolate and revert diffs.
- frontend/src/components/office/excelAdapter.ts — full: The whole current file, read with the Read tool, plus the fix diff. Checked against the library source.
- frontend/src/components/office/excelContainment.css — full: A new file, read whole in the diff.
- frontend/src/components/office/officeGridActive.ts — full: The whole current file, read with the Read tool.
- frontend/src/components/office/wordAdapter.ts — full: A new file, read whole in the diff.
- frontend/src/hooks/useFileNav.ts — full: The whole file, read with the Read tool.
- frontend/src/lib/officeFiles.ts — full: All changed hunks and the new function in the diff.
- frontend/src/messages-core/en.json — full: The changed hunk in the diff.
- frontend/src/messages-core/ja.json — full: The changed hunk in the diff.

Test files:
- frontend/src/__tests__/helpers/officeLazyLoadCases.ts — full: A new file in the diff.
- frontend/src/__tests__/helpers/officeViewer.ts — full: A new file in the diff.
- frontend/src/__tests__/officeMimes.test.ts — partial: Only the changed hunk around lines 88-96.
- frontend/src/components/__tests__/FilePreview.office.test.tsx — full: A new file in the diff.
- frontend/src/components/__tests__/FilePreview.officeArrowKeys.test.tsx — full: A new file in the diff.
- frontend/src/components/__tests__/FilePreview.officeLazyLoad.word.test.tsx — full: A new file in the diff.
- frontend/src/components/__tests__/FilePreview.test.tsx — partial: Only the changed hunk around lines 425-440.

## Needs a human

### unspecified_behavior

Note: Closing a DismissScrim menu by pressing on the Excel grid selects a cell (the library acts on mousedown) but does not activate the grid (the click is swallowed). The spec does not describe this case (R2).; The adapter now writes a private library field (`xs.sheet.focusing`) as well as reading it. If a library upgrade renamed it, both writes would silently do nothing, and the window paste, copy and key handlers would stay live after focus leaves the grid or after unmount.
- claude-read: Closing a DismissScrim menu by pressing on the Excel grid selects a cell (the library acts on mousedown) but does not activate the grid (the click is swallowed). The spec does not describe this case (R2).
- claude-read: The adapter now writes a private library field (`xs.sheet.focusing`) as well as reading it. If a library upgrade renamed it, both writes would silently do nothing, and the window paste, copy and key handlers would stay live after focus leaves the grid or after unmount.
- claude-verify: The spec does not say what a press that closes a menu does to the Excel grid's active state, even when the press visibly selects a cell.

### unspecified_behavior

Note: The spec does not say what a press that closes a menu does to the Excel grid's active state, even when the press visibly selects a cell.
- claude-read: Closing a DismissScrim menu by pressing on the Excel grid selects a cell (the library acts on mousedown) but does not activate the grid (the click is swallowed). The spec does not describe this case (R2).
- claude-read: The adapter now writes a private library field (`xs.sheet.focusing`) as well as reading it. If a library upgrade renamed it, both writes would silently do nothing, and the window paste, copy and key handlers would stay live after focus leaves the grid or after unmount.
- claude-verify: The spec does not say what a press that closes a menu does to the Excel grid's active state, even when the press visibly selects a cell.

## Findings

A: 0
B: 2
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: No test exercises the code that the r1 fix changed: the release of the library's `focusing` flag and the ownership check in `releaseOfficeGrid`. Every Excel mock in the tests lacks an `xs.sheet`, so `releaseGridFocus` and `focusProbe` do nothing there.
Impact: Suppose `releaseGridFocus()` were dropped from `onFocusIn`, or `releaseOfficeGrid` cleared the probe and the active flag without checking ownership. CI would still pass. A user would hit the first mutation as I10 breaking: they click the grid, press Ctrl/Cmd+F, then paste into the find field, and x-data-spreadsheet's window `paste` handler calls preventDefault on it. They would hit the second as I8 breaking: a cancelled earlier Excel load resets a later viewer's state, and ← / → then change file while the grid is active. The spec assigns I9 and I10 to R-5 (manual), so this is a gap in the safety net, not a spec violation.
Evidence: frontend/src/components/office/excelAdapter.ts:27-30 writes `spreadsheet.xs.sheet.focusing`, and :73-74 installs the probe only when `spreadsheet.xs` exists. frontend/src/components/__tests__/FilePreview.officeArrowKeys.test.tsx:29-47 and FilePreview.office.test.tsx:80-93 return `{preview, destroy}` with no `xs`. The test "change file again after a click outside the grid" passes only through the `focusin` path, because the outside button takes focus in `clickOn`. A grep of frontend/src for `releaseOfficeGrid` and `focusing` finds no test. I read the library source (node_modules @js-preview/excel/lib/index.js) and confirmed that `focusing` lives on `xs.sheet` (`this.sheet=new hn(...)`) and that it gates the window paste, copy and keydown handlers.
Repro: Mutation by reading: delete line 69 `releaseGridFocus();` in excelAdapter.ts. Nothing in the listed tests fails, because no mock exposes `xs.sheet.focusing`. Mutation: change `releaseOfficeGrid` to set `focusProbe = null; active = false` unconditionally. No listed test fails either.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Give the Excel mock in FilePreview.officeArrowKeys.test.tsx an `xs.sheet` with a `focusing` flag. Set the flag on a grid click and clear it on a window click outside, as the library does. Then assert: (a) after focus moves to the comment input, `focusing` is false; (b) after unmount, `focusing` is false; (c) when a stale viewer is disposed after a newer one has drawn, the newer viewer's arrow gate stays in force.

</details>

### claude-read:R2 — bucket B, LOW, open

Claim: When a menu is open, a press on the Excel grid closes the menu and the library selects a cell on mousedown. DismissScrim then swallows the click in the document capture phase, so neither `onClickInside` nor the library's window click handler sees it. The grid shows a selected cell, but ← / → change file instead of moving that cell.
Impact: The user opens the ⋮ menu (or any DismissScrim popup) and closes it by clicking a cell. The cell looks selected, and the next → goes to another file. Commit caf19847 tried to fix this defect and commit beae9a97 reverted that attempt, which leaves the defect open with no test. The behaviour does match the stated definition of an 'active' grid, because no click reached it.
Evidence: frontend/src/components/DismissScrim.tsx:41-45 and :59: a capture-phase `swallow` on document calls stopPropagation on the click. frontend/src/components/office/excelAdapter.ts:60-63, 71: `onClickInside` is a bubble listener on the container. In the library, `W(window,"click",…focusing=t.contains(e.target))` is a window bubble listener. The revert message for beae9a97 says selection starts on mousedown.
Repro: not_reproduced. By reading: open the file's ⋮ menu, click a grid cell, then press →. Expected from the code: the menu closes, the cell is highlighted, and the file changes.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Decide whether a dismissing press on the grid should select a cell. If not, stop the grid's mousedown while a DismissScrim swallow is armed. If so, accept the behaviour and record it.

</details>

## Not verified

- claude-read: Runtime behaviour in a browser: whether writing `focusing = false` fully stops the library's window handlers, and the DismissScrim scenario in R2
- claude-read: Whether x-data-spreadsheet's overlayer mousedown changes `focusing` or selection on its own (inferred from the revert message, not read in the minified source)
- claude-read: Whether the tests pass (I could not run commands)
- claude-read: Addon frontend code outside frontend/src
- claude-verify: I did not run the tests or a browser; R2 is confirmed by static trace only.
- claude-verify: I did not check the timing of the real library's mousedown versus pointerdown in actual browsers (touch versus mouse).
- claude-verify: I did not review OfficePreview.tsx, wordAdapter.ts or excelContainment.css beyond a grep.

TOTAL: 2 findings
