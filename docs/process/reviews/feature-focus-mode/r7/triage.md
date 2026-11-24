# Triage: r7

## Trajectory

This run:
- claude-read: Each fix round since r6 adds a new branch, state or prediction instead of removing one. e3d04c7c2 adds a second close path in SidebarProvider: a layout effect keyed on focusLent, alongside the existing one keyed on isOverlay. Two effects now both write isOpen in one layout phase, and they depend on declaration order so that the restore wins. f128dae1a adds new state, a module-level driveUnavailableStore counter that useIsFilePageUrl reads. It also removes one thing, DriveUnavailable's one-shot focusModeStore reset, so this round replaces a mechanism rather than only adding one. c8c7c5f7b adds a prediction: a `layoutChanges` parameter on toggleFocusMode, computed by each caller (`wide` from FocusModeShortcuts, an implicit true elsewhere). It duplicates the state × file page × wide derivation that useFocusLayout already does, because the anchor is captured at the press but spent by a layout effect. That is the same class of fix r6 F3 asked for, and it patches the symptom rather than tying capture to the actual layout change. Overall the design is being patched: the focus-layout lifetime is now spread over the URL, a mounted-screen flag, a lent-sidebar flag and a caller-side prediction.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- frontend/e2e-components/file-header-row-desktop.spec.ts — partial: The diff hunks given in the review input only.
- frontend/e2e-components/file-header-row.spec.ts — partial: The diff hunk around lines 77-95 only.
- frontend/e2e-components/fixtures/app.tsx — partial: The diff hunks (the import near 114 and the ARRANGEMENTS spread near 2802) only.
- frontend/e2e-components/fixtures/focusMode.tsx — full: New file, entirely present in the diff, including the focus-unavailable arrangement added in f128dae1a.
- frontend/e2e-components/fixtures/inspectorResponsive.tsx — partial: The diff hunks (export changes) only.
- frontend/e2e-components/focus-mode-desktop.spec.ts — full: New file, entirely present in the diff, including the tests added by the three fix commits.
- frontend/e2e-components/focus-mode-touch-desktop.spec.ts — full: New file, entirely present in the diff.
- frontend/e2e-components/projects.ts — partial: The diff hunk near line 41 only.
- frontend/e2e-components/spec-viewport.spec.ts — partial: The diff hunk near line 122 only.
- frontend/e2e-components/stubs/next-navigation.ts — partial: The diff hunk (lines 1-57) only; the rest of the file (useParams and below) was not read.
- frontend/src/app/globals.css — partial: The diff hunk near lines 680-720 only.
- frontend/src/components/AppShell.tsx — full: Read the whole file (1-394).
- frontend/src/components/ChromeButtons.tsx — partial: The diff hunks near lines 39-65 only.
- frontend/src/components/ConfirmDialog.tsx — partial: The diff hunk near lines 68-75 only.
- frontend/src/components/DriveUnavailable.tsx — partial: The diff hunks (imports and the layout effect, lines 1-35) only.
- frontend/src/components/FileDetail/FileDetailChrome.tsx — full: Read lines 40-228, the whole component that encloses the changed hunk; the import hunk is in the diff.
- frontend/src/components/FileDetail/FocusModeButton.tsx — full: New file, entirely present in the diff.
- frontend/src/components/FileDetailShell.tsx — partial: The diff hunks (the import and the layout effect near line 208) only.
- frontend/src/components/FocusModeShortcuts.tsx — full: New file, entirely present in the diff.
- frontend/src/components/GlobalSearch.tsx — partial: The diff hunk near line 818 only.
- frontend/src/components/Header.tsx — partial: The diff hunks (props, the --app-header-h layout effect, the row-inset effect, the header element) only.
- frontend/src/components/RenameDialog.tsx — partial: The diff hunk near lines 61-67 only.
- frontend/src/components/Sidebar.tsx — partial: The diff hunk (data-app-sidebar near line 325) only.
- frontend/src/components/SidebarProvider.tsx — full: Read the whole file (1-203).
- frontend/src/components/TreeToggle.tsx — partial: The diff hunks covering the whole component body (lines 5-60) only.
- frontend/src/components/folder/TwoPaneLayout.tsx — partial: The diff hunks near lines 19, 104-170 only.
- frontend/src/components/markdown/SaveDot.tsx — partial: The diff hunk near lines 25-40 only.
- frontend/src/hooks/useFocusMode.ts — full: New file, entirely present in the diff, including the f128dae1a and c8c7c5f7b changes.
- frontend/src/lib/driveUnavailableStore.ts — full: New file, entirely present in the diff.
- frontend/src/lib/findShortcut.ts — partial: The diff hunk (lines 12-36) only.
- frontend/src/lib/focusModeStore.ts — full: New file, entirely present in the diff.
- frontend/src/lib/readingAnchor.ts — full: New file, entirely present in the diff.
- frontend/src/lib/safeArea.ts — full: New file, entirely present in the diff.
- frontend/src/messages-core/en.json — partial: The diff hunk (focusMode keys near line 1554) only.
- frontend/src/messages-core/ja.json — partial: The diff hunk (focusMode keys near line 1554) only.

Test files:
- frontend/src/components/FileDetail/__tests__/FileDetailHeaderRow.test.tsx — partial: The diff hunks near lines 280-315 only.
- frontend/src/components/__tests__/AppShell.quickNote.test.tsx — partial: The diff hunk (the next/navigation mock) only.
- frontend/src/components/__tests__/MenuButton.test.tsx — partial: The diff hunks (mocks near lines 12-39) only.

## Findings

A: 0
B: 1
C: 0

### claude-read:F1 — bucket B, INFO, open

Claim: The c8c7c5f7b fix decides whether to take a reading anchor from a caller-side guess (`toggleFocusMode(layoutChanges)`, with `wide` passed from FocusModeShortcuts and an implicit `true` from FocusModeButton and TreeToggle). The anchor is spent only by AppShell's layout effect keyed on the real `useFocusLayout`, so this guess is a second derivation of state × file page URL × wide that has to stay in step with the real one.
Impact: Today every caller's guess matches the real layout change, so a user cannot hit this. If a new caller is added, or a page passes `true` while the layout does not change, the anchor stays pending and the next layout change scrolls the reader back to an old place. That is the failure r6 F3 described.
Evidence: useFocusMode.ts:105-108 `if (layoutChanges) rememberReadingAnchor()`; FocusModeShortcuts.tsx:17,23 `toggleFocusMode(wide)` (the shortcut is active only on file page URLs, AppShell.tsx:334); FocusModeButton.tsx:17 `toggleFocusMode()` (drawn only when !isMobile, FileDetailChrome.tsx:146, and only in the hosted trailing slot); TreeToggle handleToggle calls `toggleFocusMode()` only while focusLayout is true. restoreReadingAnchor is called only from AppShell.tsx:311-313, keyed on [focusLayout]. useIsWideViewport and useIsMobile both test innerWidth against 768, so they agree.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Take the anchor where the layout actually changes, for example capture it in a render-phase or pre-commit step when the derived focusLayout differs from the previous one, or drop any pending anchor when a focus-state change does not change useFocusLayout. Then remove the `layoutChanges` parameter.

</details>

## Not verified

- claude-read: Nothing was executed: no unit, component or e2e test was run, and the fixes were traced statically.
- claude-read: Whether React flushes the useSyncExternalStore update triggered from DriveUnavailable's layout effect before paint in every mount order. I assumed the documented sync-lane behaviour.
- claude-read: Whether any hosted file page (FileHeaderRowPortal) can appear on a URL that is not a file page URL, which would let FocusModeButton toggle the state and take an anchor that is never spent.
- claude-read: Real touch and iPad behaviour.
- claude-read: Earlier review rounds before r6. The trajectory is judged from r6 onward only.
- claude-verify: I did not run any test or browser reproduction; this verification is static reading only.
- claude-verify: I did not trace whether FileHeaderRowPortal drops `trailing` when the page is not hosted, or whether FileDetailChrome can render while driveUnavailableStore is true.
- claude-verify: I did not check whether the first render of useIsWideViewport (from the initial state) and of useIsMobile can differ during hydration.

TOTAL: 1 findings
