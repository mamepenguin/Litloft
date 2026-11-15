# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-verify:row-never-observed-by-resize-observer is bucket A or BLOCKER

## Needs a human

### unspecified_behavior

Note: The beside exception in rowBlockPx returns 0 when data-row-beside is on. The spec's rowBlock formula has no such case. It is invisible today, because beside requires a panel shown and the cap is then half of H.; The MutationObserver watches childList only. A change to data-row-beside alone does not trigger measure(); it relies on the ResizeObserver on the row. If the row keeps the same height across a beside toggle, rowBlock can be stale. Not verified.; With no miniPlayerRoot the scope is document, so the observer runs on every DOM insertion or removal in the page.
- claude-read: The beside exception in rowBlockPx returns 0 when data-row-beside is on. The spec's rowBlock formula has no such case. It is invisible today, because beside requires a panel shown and the cap is then half of H.
- claude-read: The MutationObserver watches childList only. A change to data-row-beside alone does not trigger measure(); it relies on the ResizeObserver on the row. If the row keeps the same height across a beside toggle, rowBlock can be stale. Not verified.
- claude-read: With no miniPlayerRoot the scope is document, so the observer runs on every DOM insertion or removal in the page.
- claude-verify: The row's beside state (data-row-beside=on) yields rowBlock 0, which the spec's formula does not state.
- claude-verify: The MutationObserver with subtree over the whole document runs a querySelector on every DOM mutation, outside the spec's description.
- claude-verify: When the row's height changes without its element changing and without an observed element resizing, --player-avail stays stale until a window resize.

### unspecified_behavior

Note: The row's beside state (data-row-beside=on) yields rowBlock 0, which the spec's formula does not state.; The MutationObserver with subtree over the whole document runs a querySelector on every DOM mutation, outside the spec's description.; When the row's height changes without its element changing and without an observed element resizing, --player-avail stays stale until a window resize.
- claude-read: The beside exception in rowBlockPx returns 0 when data-row-beside is on. The spec's rowBlock formula has no such case. It is invisible today, because beside requires a panel shown and the cap is then half of H.
- claude-read: The MutationObserver watches childList only. A change to data-row-beside alone does not trigger measure(); it relies on the ResizeObserver on the row. If the row keeps the same height across a beside toggle, rowBlock can be stale. Not verified.
- claude-read: With no miniPlayerRoot the scope is document, so the observer runs on every DOM insertion or removal in the page.
- claude-verify: The row's beside state (data-row-beside=on) yields rowBlock 0, which the spec's formula does not state.
- claude-verify: The MutationObserver with subtree over the whole document runs a querySelector on every DOM mutation, outside the spec's description.
- claude-verify: When the row's height changes without its element changing and without an observed element resizing, --player-avail stays stale until a window resize.

## Findings

A: 1
B: 6
C: 0

### claude-verify:row-never-observed-by-resize-observer — bucket A, MEDIUM, open

Claim: useCompanionMetrics never attaches the ResizeObserver to the workbench row when the row already exists at effect start, so a change of the row's own height does not recompute --player-avail.
Impact: rowBlock is computed from row.offsetHeight, but only the document element, the pane and the player wrapper are observed. When the row grows without any of those changing size (for example the enlarge button appearing on the first shown panel, or an addon action added, causing the toggle row to wrap), --player-avail stays at the old value. The frame can then be taller than the visible area after a settled frame, which violates I7 and the 'row height changes' transition in the spec's section 3, and can leave a shown panel's bottom edge below the visible area (I1).
Evidence: frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts:117 calls measure() before the observer exists (line 67 leaves observer null). followRow() at line 72-77 therefore sets observedRow to the row without calling observe, because observer is null at that point. Lines 118-122 then create the ResizeObserver and observe only documentElement/pane and the player wrapper, and the second followRow() at line 122 returns early because row === observedRow, so the row is never observed. The MutationObserver callback at lines 130-133 calls measure() only when the row element changes identity, so a child change inside the same row (the enlarge button added by Workbench.tsx:117-128 when shown.length > 0) does not re-measure. The effect deps (line 143) do not include the row. The row element persists across panel toggles because Workbench.tsx:94-95 renders it whenever toggles exist.
Repro: not_reproduced. Static trace only: the commands could not be run here. Reproduction would be a canonical file with a player and at least one panel, a viewport narrow enough that the toggle row wraps once the enlarge button appears, then a check that --player-avail equals H - playerOffset - (row offsetHeight + 2rem) after the panel is opened. Expected to show a stale value (the old, shorter rowBlock). The existing jsdom tests cannot show it because ResizeObserver is mocked with a no-op observe().
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Observe the row whenever it is current, including the first time: in followRow(), observe the row when observer exists, and call followRow() again after the observer is created. Alternatively, pass the row element into the hook as the spec's touch point describes, so the effect re-runs and re-observes it.

</details>

### claude-read:unplanned-e2e-deletion-stacked-find — bucket B, MEDIUM, open

Claim: The commit deletes the e2e test 'find with the inspector closed in a stacked row restores the canvas scroll' from inspector-responsive-layout-desktop.spec.ts, a file that is not in the touch-point list and covers the stacked inspector, which the spec declares unchanged.
Impact: The regression check that find-close restores canvas scroll in the stacked inspector form is gone. A later break of that behaviour passes the suite silently. The commit gives no reason for the removal in the spec or the review record.
Evidence: Diff hunk 'diff --git a/frontend/e2e-components/inspector-responsive-layout-desktop.spec.ts' '@@ -611,48 +611,6 @@' removes the whole test. Grep for 'restores the canvas scroll' in frontend/ now returns no match. The spec's '## Checked, no action' lists the stacked inspector as 'Not this change' and no invariant I-line covers it.
Repro: not_reproduced: static reading only; no test run was possible. The removal is visible in the diff.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Restore the test, or record in the spec why it is removed and which test replaces its coverage.

</details>

### claude-read:test-coverage-row-block-not-exercised — bucket B, LOW, open

Claim: The updated jsdom expectations in FileDetailCanvas.test.tsx change only by the removed 48px peek (508→556, 632→680, 402→450), so no jsdom test exercises the rowBlock subtraction.
Impact: A regression that drops or doubles rowBlock would pass the unit suite. Only the e2e file, which cannot run here, measures the row subtraction in a real browser.
Evidence: frontend/src/components/FileDetail/__tests__/FileDetailCanvas.test.tsx lines 213, 219, 278, 288: the new values equal the old values plus 48 exactly. The test stubs getBoundingClientRect and offsetHeight is 0 in jsdom, so a row present in this test would give rowBlock 32px and a different value. The +48 result shows no row was rendered.
Repro: not_reproduced: static reading. Mutation to try: set rowBlockPx to return 0 always; the jsdom suite should still pass.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a jsdom case that renders the workbench row with a stubbed offsetHeight and asserts the player budget is reduced by offsetHeight plus 2rem.

</details>

### claude-read:unplanned-e2e-rewrite-085-floor-test — bucket B, LOW, open

Claim: player-workbench-desktop.spec.ts has an existing SPEC-CORE-085 I5 test rewritten from 'keeps 18rem and the page scrolls' to 'shrinks below 18rem and does not scroll'. The file is not in the touch-point list; the list only anticipates tests found by grepping WORKBENCH_MIN_REM.
Impact: The old floor assertion, which encoded the behaviour being removed, is replaced in place under a new SPEC-CORE-106 name. A reader of the 085 test history cannot tell that the 085 floor was dropped by an edit to that test.
Evidence: Diff hunk 'frontend/e2e-components/player-workbench-desktop.spec.ts' '@@ -195,7 +195,7 @@' changes the test title to 'SPEC-CORE-106 I1 ...' and replaces the PANEL_FLOOR and scrolls==true expectations with toBeLessThan(PANEL_FLOOR) and scrolls==false. Spec Revises section: SPEC-CORE-085 I5 is revised, so the edit matches the revision.
Repro: not_reproduced: static reading only.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record this file in the touch-point list, or keep the 085 test name and add the 106 test beside it.

</details>

### claude-read:unplanned-mutation-observer-subtree — bucket B, LOW, open

Claim: useCompanionMetrics adds a MutationObserver with childList and subtree over the whole document (scope = document when no mini player), and a beside-form exception in rowBlockPx, neither of which the spec's rowBlock formula or touch-point description includes.
Impact: Every DOM insertion or removal anywhere on the canonical page runs a querySelector on the workbench row, which costs time on busy pages. The beside exception returns rowBlock 0 when data-row-beside is on. That is not visible today, because the beside state needs a panel shown and the cap is then half of H, but it is a silent divergence from the spec's formula in §3.
Evidence: frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts: rowBlockPx() returns 0 when row.closest('[data-row-beside="on"]'); the new mutationObserver.observe(scope, { childList: true, subtree: true }) in the effect. Spec §3 defines rowBlock = offsetHeight + 2rem, with 0 only when no row is drawn. The MutationObserver is not mentioned in the spec's touch point for this file.
Repro: not_reproduced. The MutationObserver is not covered by any jsdom test. The beside case is not reached with a panel shown and the cap at half H.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either document the beside exception and the document-wide observer in the spec, or narrow the observer to the row's parent and use the same check for beside as the spec's formula.

</details>

### claude-read:spec-touch-point-not-implemented — bucket B, INFO, open

Claim: The spec's planned touch points ShellLayout.tsx (row element held in state) and Workbench.tsx (rowRef callback ref) are absent from the diff; the implementation finds the row with querySelector('.media-detail-workbench-row') on every measure.
Impact: Not a user-visible defect on its own, because the MutationObserver covers mount and unmount. But the declared touch-point list does not match the code, so a reviewer checking the diff against the spec's touch points finds a missing planned change and an unplanned mechanism.
Evidence: frontend/src/components/FileDetail/ShellLayout.tsx is unchanged in the diff (no useState for the row element, no rowRef prop passed to the hook). frontend/src/components/FileDetail/workbench/Workbench.tsx has no rowRef; the row is at line 95 as '<div className="media-detail-workbench-row">' with no ref. The spec's 'Touch points' lists both files.
Repro: not_reproduced: static reading only.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Update the spec's touch-point list and §3 to describe the querySelector and MutationObserver approach, or switch to the rowRef design as written.

</details>

### claude-read:unplanned-theater-css-test-edit — bucket B, INFO, open

Claim: mediaDetailTheaterCss.test.ts is edited (the canonical host min-height assertion becomes a height assertion plus a not-min-height check). The touch-point list keeps this file only for the collection test and does not list the canonical assertion as an expected change.
Impact: The regex '[^-]height:' also matches any non-min height rule in the stylesheet, so the check is looser than its name. A future change to a different height rule could satisfy it without the host being fixed.
Evidence: Diff hunk 'frontend/src/app/__tests__/mediaDetailTheaterCss.test.ts' '@@ -48,9 +48,8 @@': the expectation becomes /[^-]height:\s*var\(--rail-avail,\s*100dvh\);/ with a separate not.toMatch(/min-height/). The host block is extracted from globals.css, so the match is on the extracted block only.
Repro: not_reproduced: static reading only.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Anchor the regex to the host block's own selector, or assert the exact declaration and drop the loose match.

</details>

## Not verified

- claude-read: No test was run and no browser measurement was made; I had only Read, Glob and Grep.
- claude-read: I did not read the full e2e-components fixtures or the e2e-layout static CSS fixtures, so I did not check whether they reference the removed min-height rule.
- claude-read: I did not check the complete diff for ShellLayout.tsx (unchanged in the diff) against any other consumer of the metrics hook beyond the grep for the row class.
- claude-read: I did not verify whether the stacked find test's removal hides a real regression, because the test could not be run.
- claude-verify: The commit diff itself: no git command was available, so the hunks were judged from the worktree and from the other reviewer's claims. The worktree is assumed to match 30316eeb9.
- claude-verify: The deleted e2e test body in inspector-responsive-layout-desktop.spec.ts (only its absence was checked).
- claude-verify: The live e2e suite (frontend/e2e-components/) was not run, so the row-observation finding is a static trace and not a measured reproduction.
- claude-verify: Whether the row exists at the effect's first run in the real canonical page render order (inferred from the code, not traced through the React commit order).
- claude-verify: Browser behaviour of documentElement and the player wrapper under a row-only height change (assumed not to resize).

TOTAL: 7 findings
