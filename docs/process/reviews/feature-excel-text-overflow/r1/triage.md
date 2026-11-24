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
- frontend/src/components/office/excelAdapter.ts — full: Read the whole file, lines 1-372.
- frontend/src/components/office/excelRunOn.ts — full: Read the whole file, lines 1-294.

Test files:
- frontend/src/components/__tests__/FilePreview.excelActualSize.test.tsx — partial: Read only the changed beforeEach hunk (around line 668) in the supplied diff; the rest of the file was not opened.
- frontend/src/components/__tests__/FilePreview.excelTextOverflow.test.tsx — full: New file; read its entire content as given in the supplied diff.

## Needs a human

### unspecified_behavior

Note: Appending and removing the measuring canvas triggers drawExcel's inputLock MutationObserver once more (R2). The spec does not describe this; it is harmless.
- claude-read: Appending and removing the measuring canvas triggers drawExcel's inputLock MutationObserver once more (R2). The spec does not describe this; it is harmless.
- claude-verify: Appending and removing the measuring canvas triggers the adapter's inputLock MutationObserver once per drawing that measures something. The spec does not mention this, and it appears harmless.

### unspecified_behavior

Note: Appending and removing the measuring canvas triggers the adapter's inputLock MutationObserver once per drawing that measures something. The spec does not mention this, and it appears harmless.
- claude-read: Appending and removing the measuring canvas triggers drawExcel's inputLock MutationObserver once more (R2). The spec does not describe this; it is harmless.
- claude-verify: Appending and removing the measuring canvas triggers the adapter's inputLock MutationObserver once per drawing that measures something. The spec does not mention this, and it appears harmless.

## Findings

A: 0
B: 2
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: The diff adds a new product module, frontend/src/components/office/excelRunOn.ts (294 lines, holding the whole run-on step), but the touch-point list names only excelAdapter.ts for product code and ends with 'No other file'.
Impact: No user-visible effect. The module runs only through excelAdapter.ts:261-263, which is a listed touch point. The planned file list is incomplete, so a reviewer who checks code against the touch points would not expect to find the run-on logic in a separate file.
Evidence: frontend/src/components/office/excelAdapter.ts:3 imports runOnTextOverflow from './excelRunOn'. frontend/src/components/office/excelRunOn.ts:266-294 exports runOnTextOverflow, and lines 1-264 hold candidate selection, measurement, range parsing and merge writing. The spec's Touch points list excelAdapter.ts, the two test files, INDEX.md and the user guide, followed by 'No other file. No protected path.' Grep finds no importer other than excelAdapter.ts.
Repro: Compare the files in the diff with the Touch points section of docs/specs/excel-text-overflow.md. excelRunOn.ts is in the diff and not in the list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add frontend/src/components/office/excelRunOn.ts to the touch points in docs/process/reviews/feature-excel-text-overflow/invariants.md, as the module that holds the run-on step called from transformData.

</details>

### claude-read:R2 — bucket B, INFO, open

Claim: The measuring canvas is appended to and removed from the library's container during preview, which also reaches drawExcel's own inputLock MutationObserver (excelAdapter.ts:310-315, childList and subtree on the same container). That observer is not named in the touch points.
Impact: Nothing a user would notice. The mutations queue one extra lockInputs on the next animation frame. lockInputs makes inputs read-only and blurs only a focused element inside the container, and it runs after drawing anyway.
Evidence: excelAdapter.ts:315 observes `container` with { childList: true, subtree: true }. excelAdapter.ts:277 passes the same `container` as `host`. excelRunOn.ts:278 calls host.appendChild(canvas) and excelRunOn.ts:292 calls made.canvas?.remove(), both inside instance.preview (excelAdapter.ts:364), after the observer is installed.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Did not run the tests or any mutation; only Read, Glob and Grep were available.
- claude-read: Did not check R-5's real-browser observations (screenshots, fillText fonts, timing).
- claude-read: Did not check whether files outside the diff (OfficePreview.tsx, the library's own DOM handling) react to the temporary canvas beyond the inputLock observer.
- claude-verify: I did not confirm with git diff that excelRunOn.ts is absent on origin/develop. I relied on the review classification.json.
- claude-verify: I did not run any tests or the R-5 in-app checks.
- claude-verify: I did not verify the run-on algorithm against invariants I1-I7 beyond what R1 and R2 need.

TOTAL: 2 findings
