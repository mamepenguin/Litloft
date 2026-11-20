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
- frontend/e2e-components/fixtures/app.tsx — partial: Read both changed hunks (lines 95-109 import, 2825-2844 ARRANGEMENTS entry); the rest of the 2800+ line fixture file is unchanged.
- frontend/e2e-components/fixtures/peakJump.tsx — full: New file, read whole.
- frontend/e2e-components/peak-jump-desktop.spec.ts — full: New file, read whole.
- frontend/e2e-components/peak-jump.serve.ts — full: New file, read whole.
- frontend/e2e-components/peak-jump.spec.ts — full: New file, read whole.
- frontend/e2e-components/projects.ts — full: Read the changed hunk with its enclosing DESKTOP_ONLY array (lines 40-59).
- frontend/e2e-components/spec-viewport.spec.ts — full: Read both changed hunks with their enclosing arrays (lines 80-149).
- frontend/src/components/player/MediaControls/GestureOverlay.tsx — full: Read whole.
- frontend/src/components/player/MediaControls/MediaControlsContainer.tsx — full: Read whole.
- frontend/src/components/player/MediaControls/PointerControlsPresenter.tsx — full: Read whole.
- frontend/src/components/player/MediaControls/TouchControlsPresenter.tsx — full: Read whole.
- frontend/src/components/player/MediaControls/layout.ts — full: Read whole.
- frontend/src/components/player/MediaControls/parts/ControlButton.tsx — full: Read whole.
- frontend/src/components/player/MediaControls/types.ts — full: Read whole.
- frontend/src/components/player/hooks/useVideoShortcuts.ts — full: Read whole.
- frontend/src/lib/mostWatched.ts — full: New file, read whole.
- frontend/src/lib/watchedRangesStore.ts — full: Read whole.
- frontend/src/messages-core/en.json — full: Read both changed hunks with their enclosing objects (lines 560-584 player, 1175-1194 shortcuts).
- frontend/src/messages-core/ja.json — full: Read both changed hunks with their enclosing objects (lines 560-584 player, 1175-1194 shortcuts).

Test files:
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: Read lines 300-349 around the changed hunk only.
- frontend/src/components/__tests__/peakJump.shortcuts.test.tsx — full: New file, read whole as shown in the provided diff; not reopened from disk.
- frontend/src/components/player/MediaControls/__tests__/peakJump.controls.test.tsx — full: New file, read whole as shown in the provided diff; grepped on disk for interactive/boost.
- frontend/src/components/player/MediaControls/__tests__/peakJump.order.test.tsx — full: New file, read whole as shown in the provided diff; grepped on disk for controls: false.
- frontend/src/components/player/MediaControls/__tests__/peakJump.strings.test.ts — full: New file, read whole as shown in the provided diff.
- frontend/src/components/player/MediaControls/__tests__/peakJumpHarness.tsx — full: New file, read whole as shown in the provided diff.
- frontend/src/components/player/__tests__/peakJump.shell.test.tsx — full: New file, read whole as shown in the provided diff.

## Findings

A: 0
B: 3
C: 0

### claude-read:R2 — bucket B, LOW, open

Claim: No test exercises the `interactive` gate of jump availability or the unmount cleanup that publishes jumpAvailable=false, so removing either would pass the suite.
Impact: A regression would let P be consumed and do nothing in two cases: while an embed's ad or end screen owns the frame, and after MediaControls unmounts while the same file stays registered (browser controls). It would also let the button show over an embed's own UI. The current code is correct.
Evidence: MediaControlsContainer.tsx:96 (`interactive &&`) and :142 (cleanup `publishJumpAvailable(mc, false)`). A Grep of the peakJump tests for 'interactive' finds nothing. peakJump.order.test.tsx:324 unmounts the controls with `controls: false` but never presses P or checks that P falls through while they are unmounted. register/unregister reset the flag only on a change of file or nickname (watchedRangesStore.ts:173,188).
Repro: Mutation, by reading only: delete line 142's cleanup body. No test in peakJump.shortcuts/order/controls/shell presses P after `controls: false` with a lower shortcut, so the mutant survives. Delete `interactive &&` at line 96. No peak-jump test renders with interactive=false, so this mutant survives too.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add tests: (a) with interactive=false there is no button and P reaches a lower shortcut; (b) after `controls: false` on the same file, P is not consumed.

</details>

### claude-read:R3 — bucket B, LOW, open

Claim: No unit or e2e test shows the long-press speed pill and the jump label at once, so the I5 placement 'below the speed pill' is untested.
Impact: Swapping the two children in GestureOverlay, or splitting them into separately positioned elements that overlap, would pass the suite and draw the label on top of or above the speed pill.
Evidence: GestureOverlay.tsx:73-102 stacks boost-pill then the label in one flex-col. A Grep for 'boost' in the peakJump tests finds nothing. GestureOverlay.test.tsx covers boost-pill only on its own.
Repro: Mutation, by reading only: swap the {boosting && ...} and {mostWatched && ...} blocks. No test checks their relative order, so the mutant survives.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a GestureOverlay test that renders boosting and mostWatched together and checks that the label follows the boost pill in the same stacking container.

</details>

### claude-read:R1 — bucket B, INFO, open

Claim: The diff reaches three unit-test directories (frontend/src/components/__tests__/, frontend/src/components/player/__tests__/, frontend/src/components/player/MediaControls/__tests__/), including an edit to the pre-existing componentFixtureParity.test.tsx, none of which is named in the declared touch-point list, which names only frontend/e2e-components/ for tests.
Impact: None for a user. The planned-reach list is incomplete, so a reader of the spec does not learn that the shared fixture-parity test's arrangement list changed.
Evidence: componentFixtureParity.test.tsx:331 adds "peak-jump" to the arrangement list. New files: __tests__/peakJump.shortcuts.test.tsx, player/__tests__/peakJump.shell.test.tsx, MediaControls/__tests__/peakJump.{controls,order}.test.tsx, peakJump.strings.test.ts and peakJumpHarness.tsx. docs/process/spec-and-design.md:41 defines touch points as where the change is planned to reach and does not exempt tests. Every other reached path (watchedRangesStore.ts, mostWatched.ts as 'a small module beside it', the MediaControls files, layout.ts, ControlButton.tsx, useVideoShortcuts.ts, messages-core, e2e-components/, the docs) is covered by the list. layout.ts is edited itself, not only 'beside' it, and I count that as within the listed entry.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the unit-test directories, or a line saying unit tests beside the touch points are implied, to the touch-point list in docs/process/reviews/feature-peak-jump/invariants.md.

</details>

## Not verified

- claude-read: I did not run any test, e2e spec or type check. All mutation results come from reading only.
- claude-read: I did not read useMediaControlsState.noteSkip or usePlayerGestures.resetTapSequence in full. Their effects are taken from the tests' assertions.
- claude-read: I did not read ShortcutsProvider's key matcher for platform-specific Ctrl/Cmd handling beyond lines 84-112.
- claude-read: I did not read the docs/user-guide or DESIGN.md hunks against the files on disk.
- claude-read: I did not check React StrictMode double-effect behaviour for register/unregister and the remembered spot.
- claude-verify: Did not run the test suite or apply mutations; the claims that a mutation would survive are based on reading the code.
- claude-verify: Did not check the e2e .build bundle or the fixtures in detail for indirect coverage of interactive=false.

TOTAL: 3 findings
