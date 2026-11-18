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
- frontend/e2e-components/pdf-toolbar-row-desktop.spec.ts — full: New file; read in full from the diff.
- frontend/e2e-components/projects.ts — full: Read the whole file.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Read lines 90-179: the changed list and the test that consumes it.
- frontend/src/components/PdfPreview.tsx — partial: Read lines 540-679: the render function's frame and toolbar, which contain both changed hunks, plus a grep of the whole file for container utilities.
- frontend/src/components/ToolbarMenu.tsx — full: Read the whole file.

Test files:
- none

## Findings

A: 0
B: 3
C: 0

### claude-read:F3 — bucket B, LOW, open

Claim: No test pins the `@max-[38rem]:-ml-1.5` compensation that keeps the icon-only zoom button's icon centred. Removing it or changing its sign leaves every new assertion passing.
Impact: A regression that leaves the icon-only zoom button lopsided by about 6px at viewer widths below 608px would ship silently. The defect is cosmetic.
Evidence: PdfPreview.tsx:611 holds `-ml-1.5`. pdf-toolbar-row-desktop.spec.ts measures only the row count, whether the value has width (>1px), the bar height and the aria-label. It never checks the icon's position inside the button. decisions.md records the 13px/13px inset from a manual R-5 run only.
Repro: Mutation in thought: delete `@max-[38rem]:-ml-1.5`. The value span collapses to w-0 but keeps the button's gap-1.5, so the icon sits 6px left of centre. rows stays 1, valueShown stays false, the height set is unchanged, and the aria-label is unchanged, so every test in the new spec still passes (the mutant survives).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In the 1280×800 wide-tab test, assert that the icon's left and right insets inside the zoom button are equal within 1px.

</details>

### claude-read:F1 — bucket B, INFO, open

Claim: The change reaches the shared ToolbarMenu component's public props and its value span's class composition, a place outside the PDF viewer, and no invariants file declares a touch-point list that names it.
Impact: Every ToolbarMenu caller now renders its value span through the new join/filter expression. Callers that do not pass valueClassName get the same class string as before (or undefined), so no user-visible change is expected today. The new prop is an unreviewed extension point for later callers.
Evidence: frontend/src/components/ToolbarMenu.tsx:149 adds `valueClassName?: string`; ToolbarMenu.tsx:241-253 replaces the ternary with `[...].filter(Boolean).join(" ") || undefined`. Grep finds only one caller that passes it, frontend/src/components/PdfPreview.tsx:611. No docs/process/reviews/fix-pdf-toolbar-narrow/invariants.md exists, so there is no touch-point list to check against.
Repro: not_reproduced. Read only: with valueClassName undefined, the array becomes [old value or undefined]; filter(Boolean) and join produce the old string, or an empty string that `|| undefined` maps back to undefined, which is identical to the previous className.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F2 — bucket B, INFO, open

Claim: The PDF viewer frame now has `container-type: inline-size` (Tailwind `@container`), which gives the whole viewer, including the page canvas, inline-size containment and a new query container. No invariants file declares this reach.
Impact: The frame's inline size no longer depends on its content. At the current call site the frame is `w-full`, so its width comes from its parent and nothing changes. A future host that sizes the viewer to its content (shrink-to-fit or inline-flex) would see it collapse to its padding width. Any descendant `@`-container utility would now resolve against this frame instead of an outer container. Grep found no such utility inside PdfPreview other than the new one.
Evidence: frontend/src/components/PdfPreview.tsx:564 `@container w-full overflow-hidden ...`. The only `@` utilities in the file are at :564 and :611. The frame is rendered from frontend/src/components/FilePreview.tsx:214. globals.css:1519 also styles `[data-viewer-frame]`, but only its border-radius.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run any test or build. Tailwind's generation of `@max-[38rem]:` utilities and of `@container` was assumed, not observed.
- claude-read: I did not check whether the fullscreen PDF dialog reuses this toolbar or renders inside the new container.
- claude-read: I did not check the e2e fixture (fixtureOrigin, app.tsx) to confirm that `docside=1` and the seeded localStorage give the stated frame widths.
- claude-read: Phone layouts were not checked beyond reading that portalOnPhone is unchanged.
- claude-verify: Did not run the Playwright or unit suites. I cannot execute commands.
- claude-verify: Did not check in a browser whether removing or flipping -ml-1.5 changes any row-count assertion.
- claude-verify: Did not open the R-5 screenshots.
- claude-verify: Did not confirm that the working tree matches commit 3b7cf6c0e beyond r1/head.txt naming that SHA.

TOTAL: 3 findings
