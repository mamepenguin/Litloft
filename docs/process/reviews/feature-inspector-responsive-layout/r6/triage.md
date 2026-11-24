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

Note: The mini-player is suppressed while the inspector is stacked (useMiniPlayer.ts:34), but the declared touch points do not cover this.
- claude-verify: The mini-player is suppressed while the inspector is stacked (useMiniPlayer.ts:34), but the declared touch points do not cover this.

## Findings

A: 0
B: 7
C: 0

### claude-read:U1 — bucket B, LOW, open

Claim: The diff changes production file frontend/src/components/FileDetail/FileMetaBlock.tsx, which the touch-point list does not name.
Impact: FileMetaBlock now has a new `inspector` prop. That prop drops the block's `mt-4` and the tags' `mt-3`, adds the `data-inspector-header-*` hooks and draws a rule under the header. The stacked one-row CSS in globals.css only works through these hooks, so a reviewer who scopes to the list would miss the place that defines the header block's look on every surface.
Evidence: frontend/src/components/FileDetail/FileMetaBlock.tsx:66 (`data-inspector-header-block`) and the new rule div. FileDetailContainer.tsx passes `inspector={ridesShell}`. The touch-point list names FileDetailContainer only for `hoistDescription`.
Repro: Compare the diff's file list with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:U2 — bucket B, LOW, open

Claim: The mini-player suppression reaches four unlisted files: FilePreview.tsx, MiniPlayerContainer.tsx, hooks/useMiniPlayer.ts and its test useMiniPlayer.test.ts.
Impact: FilePreview now reads the form store through `useInspectorForm(file.id)` and passes `stacked` to MiniPlayerContainer and on to `shouldShowMini`. This changes when the floating mini player appears for every video or `.loft` FilePreview render. Spec item 082.3 asks for this, but the list leaves out every file that implements it.
Evidence: frontend/src/components/FilePreview.tsx:116,126,152; frontend/src/components/MiniPlayerContainer.tsx:19; frontend/src/hooks/useMiniPlayer.ts:56 and the `if (inputs.stacked) return false` in shouldShowMini.
Repro: Compare the diff's file list with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:U5 — bucket B, LOW, open

Claim: The global test setup frontend/src/test/setup.ts gains an afterEach that removes `data-media-layout` from <html> after every test, and setup.ts is not in the touch-point list.
Impact: The change reaches every vitest suite in the frontend. A test that leaked or relied on the attribute from an earlier test now passes or fails differently. Without the cleanup, the stores and attributes added by this change could make suites depend on run order.
Evidence: frontend/src/test/setup.ts:125. The production attribute is written by lib/mediaLayout.ts:17 and lib/preferenceInitScript.ts:35.
Repro: Compare the diff's file list with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:U6 — bucket B, LOW, open

Claim: The component fixture build gains a global `@/lib/addons` alias to the new stubs/addons.ts, and the shared stubs/next-navigation.ts changes behaviour. Neither change is the new bundle entry the touch-point list allows for.
Impact: The alias replaces `loadAddonSlotModule` and `getCachedSlotModule` for every component bundled into the fixture, not only the new inspector arrangements. Any existing arrangement whose components load addon slot modules through `@/lib/addons` now gets the fixture transcript or a rejection. `useSearchParams` in every arrangement now reads `window.__fixtureSearchParams`, but only the two-pane arrangement sets it.
Evidence: frontend/e2e-components/build-bundle.ts:34 (new alias); frontend/e2e-components/stubs/addons.ts (new); frontend/e2e-components/stubs/next-navigation.ts (useSearchParams); new stubs/transcriptSlot.tsx.
Repro: Compare the diff's file list with the touch-point list. I did not run the other arrangements.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:U3 — bucket B, INFO, open

Claim: Two new modules, hooks/useInspectorForm.ts and lib/leftPaneContext.ts, are not in the touch-point list.
Impact: These are the read paths of the form store and of the left-pane context. ShellLayout, FileDetailContainer, FilePreview and FileDetailShell all read the form through useInspectorForm, and FileDetailShell reads the left pane through leftPaneContext. The list names only inspectorFormStore.ts and treeYieldStore.ts as new files.
Evidence: frontend/src/hooks/useInspectorForm.ts:10; frontend/src/lib/leftPaneContext.ts (new); imported at FileDetailShell.tsx:18, ShellLayout.tsx:18, FileDetailContainer.tsx:17 and FilePreview.tsx:19.
Repro: Compare the diff's file list with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:U4 — bucket B, INFO, open

Claim: frontend/src/hooks/useIsMobile.ts is changed to export MOBILE_BREAKPOINT, and lib/inspectorOpenStore.ts now imports it from a hook module. useIsMobile.ts is not in the list.
Impact: After this change a lib module depends on a hooks module. The phone boundary used by the player default-open rule is now shared with useIsMobile, so if useIsMobile's threshold changes, the default-open threshold changes with it.
Evidence: frontend/src/hooks/useIsMobile.ts:5; frontend/src/lib/inspectorOpenStore.ts:10,48.
Repro: Compare the diff's file list with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:U7 — bucket B, INFO, open

Claim: The diff adds or changes unit tests, harness helpers and fixture registries that the touch-point list does not name.
Impact: The unlisted tests are new: FileDetailShellYield, InspectorForm, StackedInspector, InspectorShell.headerInInfo, folder/__tests__/TreeYield and TreeYieldRemount, the new harness.tsx measureRow, and useMiniPlayer.test.ts. The unlisted registries are e2e-components/fixtures/app.tsx, fixtures/inspectorResponsive.tsx, spec-viewport.spec.ts and componentFixtureParity.test.tsx. TreeYield.test.tsx and TreeYieldRemount.test.tsx duplicate about 250 lines of mocks, which is a maintenance cost. Meanwhile the listed TwoPaneLayout, TreeToggle and DriveTreeToggle tests are not changed.
Evidence: See the diff headers for each file named above.
Repro: Compare the diff's file list with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run any tests: vitest, Playwright e2e-components or e2e-layout.
- claude-read: I did not check whether the new `@/lib/addons` alias changes the behaviour of existing e2e-components arrangements.
- claude-read: I did not trace how collection playback reaches FilePreview, or whether it ever shares a fileId with a publishing shell.
- claude-read: I did not analyse invariant compliance beyond the scope question.
- claude-verify: I could not run git diff, so I relied on r6/classification.json for the list of changed files and on reading the files at HEAD. I did not confirm hunk-level diffs against origin/develop.
- claude-verify: I did not check whether the out-of-scope changes break any invariant from I1 to I10.
- claude-verify: I did not run the tests or the e2e suites.

TOTAL: 7 findings
