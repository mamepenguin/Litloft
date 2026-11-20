# Triage: r1

## Trajectory

This run:
- none

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
- frontend/package.json — full: The changed hunk in the diff (two dependency lines).
- frontend/pnpm-lock.yaml — full: All changed hunks in the diff.
- frontend/src/components/FilePreview.tsx — partial: The diff hunks, and lines 230-297 of the file (the new branch and the fallback).
- frontend/src/components/office/OfficePreview.tsx — full: A new file, read whole in the diff.
- frontend/src/components/office/excelAdapter.ts — full: A new file, read whole in the diff.
- frontend/src/components/office/excelContainment.css — full: A new file, read whole in the diff. Checked against the label/select rules in globals.css.
- frontend/src/components/office/officeGridActive.ts — full: A new file, read whole in the diff.
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

Note: excelAdapter replaces the library's own MutationObserver (`spreadsheet.observer.disconnect()`) with one that makes inputs read-only and blurs only elements inside the grid. This depends on a private field of @js-preview/excel. If the field is missing, the library's observer, which blurs whatever element has focus, keeps running.; officeGridActive.ts holds module-global state that the hook layer (useFileNav) reads. A second Excel viewer mounted at the same time, or a later one, overwrites the focus probe, and the first one's dispose resets it to null.
- claude-read: excelAdapter replaces the library's own MutationObserver (`spreadsheet.observer.disconnect()`) with one that makes inputs read-only and blurs only elements inside the grid. This depends on a private field of @js-preview/excel. If the field is missing, the library's observer, which blurs whatever element has focus, keeps running.
- claude-read: officeGridActive.ts holds module-global state that the hook layer (useFileNav) reads. A second Excel viewer mounted at the same time, or a later one, overwrites the focus probe, and the first one's dispose resets it to null.
- claude-verify: The synthetic click that releaseGridFocus sends to document.body can be consumed by an armed DismissScrim swallow (DismissScrim.tsx:41-45, 59) in place of the real click it was armed for. The real click could then reach the element under a dismissed popup. This was not reproduced and needs an active grid with a popup open at the same time.

### unspecified_behavior

Note: The synthetic click that releaseGridFocus sends to document.body can be consumed by an armed DismissScrim swallow (DismissScrim.tsx:41-45, 59) in place of the real click it was armed for. The real click could then reach the element under a dismissed popup. This was not reproduced and needs an active grid with a popup open at the same time.
- claude-read: excelAdapter replaces the library's own MutationObserver (`spreadsheet.observer.disconnect()`) with one that makes inputs read-only and blurs only elements inside the grid. This depends on a private field of @js-preview/excel. If the field is missing, the library's observer, which blurs whatever element has focus, keeps running.
- claude-read: officeGridActive.ts holds module-global state that the hook layer (useFileNav) reads. A second Excel viewer mounted at the same time, or a later one, overwrites the focus probe, and the first one's dispose resets it to null.
- claude-verify: The synthetic click that releaseGridFocus sends to document.body can be consumed by an armed DismissScrim swallow (DismissScrim.tsx:41-45, 59) in place of the real click it was armed for. The real click could then reach the element under a dismissed popup. This was not reproduced and needs an active grid with a popup open at the same time.

## Findings

A: 0
B: 1
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: The Excel adapter sends a synthetic `click` event to `document.body`, which reaches every document- and window-level click listener in the app; no touch point names this app-wide reach.
Impact: Every capture- or bubble-phase click listener on document or window receives an extra click that the user never made. This happens in two cases: focus leaves the frame while the grid is active, and the viewer unmounts with the grid active. The listeners include DismissScrim's armed `swallow` (DismissScrim.tsx:59) and the `window` click handlers that earlier workbooks left behind. In this codebase I found no listener whose visible behaviour changes. A future outside-click handler would see the phantom click, though, and nothing tests for it.
Evidence: frontend/src/components/office/excelAdapter.ts:17-19 `releaseGridFocus` dispatches `new MouseEvent('click', {bubbles:true})` on document.body. It is called from `onFocusIn` (lines 63-68) and from `dispose` (lines 92-95). The spec's Touch points list the containment of the library's window listeners in `components/office/`. They do not name events that Litloft itself sends to app-wide listeners. A grep for document/window `click` listeners in frontend/src found only DismissScrim.tsx:59 (a capture-phase swallow that only disarms itself).
Repro: not_reproduced. By reading: click the grid, then press Ctrl/Cmd+F so focus moves to the find field. `onFocusIn` then dispatches a body click, which runs through every document/window click listener before the next real click.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name in the touch points, or in a comment beside `releaseGridFocus`, that the containment sends a synthetic body click to app-wide listeners. Another option is to dispatch the click on a dedicated detached target that only x-spreadsheet's window handler sees (it checks only that the target is outside the grid). With that option, the synthetic click no longer reaches app-wide listeners.

</details>

## Not verified

- claude-read: The behaviour of the real libraries (x-data-spreadsheet window handlers, the `focusing` flag, the `observer` field) in a browser
- claude-read: Whether any addon frontend code outside frontend/src adds document/window click listeners
- claude-read: The production CSS chunk order and whether revert-layer resolves as intended against the library's stylesheet in the built app
- claude-read: Whether all tests pass (I could not run commands)
- claude-verify: Runtime behavior in a browser: the interaction of the synthetic click with DismissScrim, and whether x-data-spreadsheet's window handler actually clears `focusing`
- claude-verify: Click listeners added in third-party dependencies other than x-data-spreadsheet
- claude-verify: Click listeners attached via React props on body or html elements

TOTAL: 1 findings
