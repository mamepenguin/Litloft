# Triage: r2

## Trajectory

This run:
- claude-read: The design is being patched. Round 1 added a rowBlock subtraction, a document-wide MutationObserver, and a beside exception. Round 2 added a second tracking variable (knownRow and watchedRow) to fix the observation of a row that exists at mount, a third min() term on the framed cap, a fourth term on the enlarged floor, a switch of the floor's share to --workbench-player-share, and several spec edits. Those edits describe the code's mechanism instead of the approved rowRef design. Each round adds a branch or a clamp term that the previous round did not predict, and the spec's approval hash changed in four commits. Round 2 removed one thing: the single observedRow variable, which was replaced by two variables. It did not remove a design element. The approved rowRef design was already gone in round 1.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: The beside toggle is not observed as an attribute change (see finding beside-toggle-no-observed-size-change).; The MutationObserver runs a querySelector on every childList mutation under the document when there is no mini player; this cost is outside the spec, as the r1 review noted.
- claude-read: The beside toggle is not observed as an attribute change (see finding beside-toggle-no-observed-size-change).
- claude-read: The MutationObserver runs a querySelector on every childList mutation under the document when there is no mini player; this cost is outside the spec, as the r1 review noted.

## Findings

A: 0
B: 2
C: 0

### claude-read:stacked-find-test-removal-reason-mismatch — bucket B, MEDIUM, open

Claim: The stated reason for deleting the stacked find/canvas-scroll e2e test describes the inspector-open configuration, but the deleted test sets the inspector closed and asserts a positive canvas scroll range.
Impact: The stacked-inspector find-close scroll restore, which the spec declares unchanged, has no test. The recorded justification does not match the test it removes, so a reader cannot rely on it to conclude that the coverage was redundant.
Evidence: Deleted test in frontend/e2e-components/inspector-responsive-layout-desktop.spec.ts (hunk @@ -611,48 +611,6 @@): it sets localStorage inspector-open:fixture to false, then asserts target > 0 (the canvas scrolls) before find is opened and that scrollTop is restored after close. The spec's Touch points paragraph says the premise was that with the inspector open in a stacked layout the canvas holds only the player (scrollHeight equals clientHeight at 900x700 and 900x520). That measures a different configuration (inspector open) and contradicts the deleted test's own target > 0 assertion for the closed configuration.
Repro: not_reproduced: static reading only; no test was run and no browser measurement was made. The mismatch is visible by comparing the deleted body with the spec text.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Restore the test, or measure the closed-inspector stacked case the test names and record that measurement as the reason for removal.

</details>

### claude-read:beside-toggle-no-observed-size-change — bucket B, LOW, rejected

Claim: A change of data-row-beside on the row's ancestor is not observed by the MutationObserver (attributes are not watched), so rowBlock can stay stale if the frame and row sizes do not change in an observed element.
Impact: If the row moves beside the frame and back without any observed element changing size, --player-avail keeps a rowBlock that is 0 or the full block, so a shown panel or a frame could sit past the visible area until the next resize. Not seen in any reviewed state, because the beside state needs a panel shown and the cap is then half of H.
Evidence: frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts:28-31 returns 0 when row.closest('[data-row-beside="on"]'); lines 135-139 observe the scope with childList and subtree only, with no attributes option; the ResizeObserver observes the row, the pane or documentElement, and the player wrapper (lines 124-127). Whether the wrapper size changes on a beside toggle is not checked.
Repro: not_reproduced: static reading. Mutation to try in a browser: toggle data-row-beside between on and off at a fixed width and compare --player-avail with H - offset - rowBlock after each toggle.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Observe the attribute change (attributes: true with attributeFilter data-row-beside) or measure from the beside state change, and record the beside case in the spec's transitions.

</details>

## Not verified

- claude-read: No tests were run and no browser measurement was made; only Read, Glob and Grep were available.
- claude-read: I did not check the stacked inspector's behaviour on the base commit, so the claim that the deleted test's premise was not true on the baseline is unverified.
- claude-read: I did not check whether the player wrapper's size changes on a beside toggle, which decides whether the beside case is observed indirectly.
- claude-read: I did not read the e2e-layout static fixtures or the full Workbench row render conditions (when the row is drawn).
- claude-read: I did not check the full ShellLayout.tsx render order, so whether the row exists at the first effect run is inferred from the code.
- claude-verify: The deleted e2e test body (git history at 835e86fd6 and its parent) was not readable: no git access and the worktree lacks the removed text. The claim that it sets inspector-open:fixture to false and asserts target > 0 is unverified.
- claude-verify: No test was run; the e2e and jsdom suites were not executed, so the live rowBlock and ResizeObserver behaviour is verified by reading only.
- claude-verify: Browser layout behaviour of the absolute-positioned row on toggle (width change under the given CSS) was inferred from the stylesheet, not measured.

TOTAL: 2 findings
