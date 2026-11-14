# Triage: r6

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

## Needs a human

### unspecified_behavior

Note: The in-player preview-actions div loses its data-preview-actions attribute whenever the actions are in the row (MediaPlayerBlock.tsx:124). Nothing in the spec mentions this.; The workbench row always renders a .media-detail-workbench-trailing div, even when it has neither a button nor actions. With margin-left:auto and nothing inside, it has no visible effect.
- claude-read: The in-player preview-actions div loses its data-preview-actions attribute whenever the actions are in the row (MediaPlayerBlock.tsx:124). Nothing in the spec mentions this.
- claude-read: The workbench row always renders a .media-detail-workbench-trailing div, even when it has neither a button nor actions. With margin-left:auto and nothing inside, it has no visible effect.

## Findings

A: 0
B: 3
C: 0

### claude-read:R1-unlisted-MediaPlayerBlock — bucket B, LOW, open

Claim: The diff edits frontend/src/components/FileDetail/MediaPlayerBlock.tsx, which is not in the touch-point list: its in-player preview-actions div now carries data-preview-actions only when showPreviewActions is true, where before it always did.
Impact: No user-visible effect in the paths I traced. FileDetailShell.tsx:245 measures the first [data-preview-actions] only while stackedLayout (stacked with the inspector open) is true. In that form actionsInRow is false and showPreviewActions is true, so the attribute is still present. The collection surface (FileDetailPresenter.tsx:178, showPreviewActions={false}) publishes no form. The risk is that the touch points say this measurement 'is therefore unchanged' because nothing outside Workbench moves, yet the attribute FileDetailShell's selector depends on was edited in an unlisted file. A later change to when stackedLayout and actionsInRow overlap would let the selector pick up the row's actions element instead of the empty in-player one, and no test pins that selector.
Evidence: MediaPlayerBlock.tsx:124 `data-preview-actions={showPreviewActions ? "true" : undefined}` (before: always "true"). FileDetailShell.tsx:245 `canvas.querySelector("[data-preview-actions]")` and :253 subtracts its offsetHeight. inspectorFormStore.ts:47 stacked = form==='stacked' && open. ShellLayout.tsx:455 showPreviewActions={!actionsInRow}. The edit appears to exist so that WorkbenchPlayerFocus.test.tsx:284's document.querySelector('[data-preview-actions]') finds the row element rather than the empty in-player div.
Repro: not_reproduced (read-only). Mutation in my head: revert line 124 to always "true". The I1 position test at WorkbenchPlayerFocus.test.tsx:284 would then select the in-player div, which comes before the button in the DOM, and the DOCUMENT_POSITION_FOLLOWING assertion would fail. The production change therefore serves a test selector.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add MediaPlayerBlock.tsx to the touch points with the reason, or revert it and scope the vitest selector to the workbench row (e.g. row.querySelector('[data-preview-actions]')).

</details>

### claude-read:R1-unlisted-floor-rule — bucket B, LOW, open

Claim: The r5 floor (revised I2) reaches places the touch-point list does not describe: a new globals.css rule `.media-detail-host[data-workbench=on][data-player-focus=on] .media-detail-player[data-framed=true] { min-width: min(100%, 480px, rail*0.5*16/9) }`, and a new MediaCanvas prop `playerFocused` that drives a new `data-player-focus` host attribute. The touch points describe globals.css only as the trailing element and icon variant, and MediaCanvas only as taking the share.
Impact: The floor hard-codes 480 (COMPACT_MAX_WIDTH in MediaControls/layout.ts:22) and 0.5 (WORKBENCH_PLAYER_SHARE in layoutSizes.ts) in CSS. Neither constant is tied to the rule, and no vitest checks the rule. If COMPACT_MAX_WIDTH or WORKBENCH_PLAYER_SHARE changes, the floor silently drifts from I2. Only the e2e regime tests (player-workbench-desktop.spec.ts CAP_WINDOWS) would notice, and they hard-code FOCUSED_FLOOR=270 and DEFAULT_SHARE=0.5 as well, so a change to the constants alone would not fail them.
Evidence: globals.css:926-936 (new rule). MediaCanvas.tsx:59 `data-player-focus={playerFocused ? "on" : undefined}`. ShellLayout.tsx passes playerFocused={playerFocusApplies}. COMPACT_MAX_WIDTH is referenced only in a CSS comment (grep).
Repro: not_reproduced. Mutation in my head: change COMPACT_MAX_WIDTH to 520. The controls go compact below 520px, but the CSS floor stays at 480px, so a frame between 480px and 520px wide shows compact controls under value on. No test fails.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Revise the touch points for the r5 floor: name the globals.css floor rule and MediaCanvas's playerFocused/data-player-focus. Optionally set the floor through a custom property from mediaHostStyle using COMPACT_MAX_WIDTH and WORKBENCH_PLAYER_SHARE.

</details>

### claude-read:R1-unlisted-e2e-stubs — bucket B, INFO, open

Claim: The diff adds frontend/e2e-components/stubs/previewActionSlot.tsx and edits frontend/e2e-components/stubs/addons.ts. The touch points name only fixtures/inspectorResponsive.tsx for the preview-action stub.
Impact: Test-only. The stub renders a `.workbench-toggle` button with the label 'Quote', so the I8 gap measurement depends on that stub's box rather than a real addon action. No user impact.
Evidence: stubs/addons.ts adds `"fixture-action": PreviewActionSlot`. stubs/previewActionSlot.tsx is a new file with data-testid="fixture-preview-action".
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List e2e-components/stubs/{addons.ts,previewActionSlot.tsx} in the touch points.

</details>

## Not verified

- claude-read: The commit 21e3d453f itself is a docs-only review-record commit. I reviewed the branch diff given in the prompt, not that commit's file list.
- claude-read: I ran no tests or e2e.
- claude-read: I did not read docs/process/reviews/.../invariants.md or the design directory for any touch-point revision beyond the text quoted in the prompt.
- claude-verify: I could not run git diff, so I compared against the main checkout at /Users/libre/Sources/video_share and assumed it reflects origin/develop for these files.
- claude-verify: I did not run the e2e or vitest suites, and I did not measure the floor rule in a browser.
- claude-verify: I did not check that FileDetailShell's stackedLayout comes from the same source as ShellLayout's stackedLayout, beyond the code paths read.

TOTAL: 3 findings
