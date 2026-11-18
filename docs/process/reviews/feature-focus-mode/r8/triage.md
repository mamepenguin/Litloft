# Triage: r8

## Trajectory

This run:
- claude-read: The rounds since r7 do not repeat the earlier pattern. 994ae8439 and f8ef0433a are documentation only (INDEX status and the R-5 record). 1a9a6c1b8 removes something: the 56×22 pill, its ChevronDown icon and the lucide import give way to a single span bar, with no new branch or state. c3aa19f2e adds a new state (the pullFrom ref), pointer capture and a second reveal path (a downward pull of 12px or more). That is a new branch, but not one a previous round also added: it answers a human decision made on the device (decisions.md:41), not a review finding, and it feeds the existing onReveal and 'tap' hide rule rather than adding another hide rule. The r7 caller-side `layoutChanges` prediction is left untouched, neither removed nor extended. These rounds do not show the design being patched. The new pull path is not in the approved spec's text, though (F2).

Earlier runs:
- r7 / claude-read: Each fix round since r6 adds a new branch, state or prediction instead of removing one. e3d04c7c2 adds a second close path in SidebarProvider: a layout effect keyed on focusLent, alongside the existing one keyed on isOverlay. Two effects now both write isOpen in one layout phase, and they depend on declaration order so that the restore wins. f128dae1a adds new state, a module-level driveUnavailableStore counter that useIsFilePageUrl reads. It also removes one thing, DriveUnavailable's one-shot focusModeStore reset, so this round replaces a mechanism rather than only adding one. c8c7c5f7b adds a prediction: a `layoutChanges` parameter on toggleFocusMode, computed by each caller (`wide` from FocusModeShortcuts, an implicit true elsewhere). It duplicates the state × file page × wide derivation that useFocusLayout already does, because the anchor is captured at the press but spent by a layout effect. That is the same class of fix r6 F3 asked for, and it patches the symptom rather than tying capture to the actual layout change. Overall the design is being patched: the focus-layout lifetime is now spread over the URL, a mounted-screen flag, a lent-sidebar flag and a caller-side prediction.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Read coverage

Product files:
- frontend/e2e-components/file-header-row-desktop.spec.ts — partial: The diff hunks in the review input only.
- frontend/e2e-components/file-header-row.spec.ts — partial: The diff hunk near lines 77-95 only.
- frontend/e2e-components/fixtures/app.tsx — partial: The diff hunks (import and ARRANGEMENTS spread) only.
- frontend/e2e-components/fixtures/focusMode.tsx — full: New file, entirely present in the diff.
- frontend/e2e-components/fixtures/inspectorResponsive.tsx — partial: The diff hunks (export changes) only.
- frontend/e2e-components/focus-mode-desktop.spec.ts — full: New file, entirely present in the diff.
- frontend/e2e-components/focus-mode-touch-desktop.spec.ts — full: New file, entirely present in the diff, including the bar-geometry and swipe tests from the fix commits.
- frontend/e2e-components/projects.ts — partial: The diff hunk near line 41 only.
- frontend/e2e-components/spec-viewport.spec.ts — partial: The diff hunk near line 122 only.
- frontend/e2e-components/stubs/next-navigation.ts — partial: The diff hunk (lines 1-57) only.
- frontend/src/app/globals.css — partial: The diff hunk near lines 680-720 only.
- frontend/src/components/AppShell.tsx — full: The whole file as given in the diff (a new body), and lines 40-119 reread from disk for the handle.
- frontend/src/components/ChromeButtons.tsx — partial: The diff hunks near lines 39-65 only.
- frontend/src/components/ConfirmDialog.tsx — partial: The diff hunk near lines 68-75 only.
- frontend/src/components/DriveUnavailable.tsx — partial: The diff hunks (imports and the layout effect) only.
- frontend/src/components/FileDetail/FileDetailChrome.tsx — partial: The diff hunks (import and trailing unit near line 141) only.
- frontend/src/components/FileDetail/FocusModeButton.tsx — full: New file, entirely present in the diff.
- frontend/src/components/FileDetailShell.tsx — partial: The diff hunks (import and the layout effect near line 208) only.
- frontend/src/components/FocusModeShortcuts.tsx — full: New file, entirely present in the diff.
- frontend/src/components/GlobalSearch.tsx — partial: The diff hunk near line 818 only.
- frontend/src/components/Header.tsx — partial: The diff hunks (props, the --app-header-h effect, the row-inset effect, the header element) only.
- frontend/src/components/RenameDialog.tsx — partial: The diff hunk near lines 61-67 only.
- frontend/src/components/Sidebar.tsx — partial: The diff hunk (data-app-sidebar) only.
- frontend/src/components/SidebarProvider.tsx — partial: The diff hunks in the review input only.
- frontend/src/components/TreeToggle.tsx — partial: The diff hunks covering the component body only.
- frontend/src/components/folder/TwoPaneLayout.tsx — partial: The diff hunks near lines 19 and 104-170 only.
- frontend/src/components/markdown/SaveDot.tsx — partial: The diff hunk near lines 25-40 only.
- frontend/src/hooks/useFocusMode.ts — full: New file, entirely present in the diff.
- frontend/src/lib/driveUnavailableStore.ts — full: New file, entirely present in the diff.
- frontend/src/lib/findShortcut.ts — partial: The diff hunk (lines 12-36) only.
- frontend/src/lib/focusModeStore.ts — full: New file, entirely present in the diff.
- frontend/src/lib/readingAnchor.ts — full: New file, entirely present in the diff.
- frontend/src/lib/safeArea.ts — full: New file, entirely present in the diff.
- frontend/src/messages-core/en.json — partial: The diff hunk (focusMode keys) only.
- frontend/src/messages-core/ja.json — partial: The diff hunk (focusMode keys) only.

Test files:
- frontend/src/components/FileDetail/__tests__/FileDetailHeaderRow.test.tsx — partial: The diff hunks near lines 280-315 only.
- frontend/src/components/__tests__/AppShell.quickNote.test.tsx — partial: The diff hunk (the next/navigation mock) only.
- frontend/src/components/__tests__/MenuButton.test.tsx — partial: The diff hunks (mocks) only.

## Needs a human

### unspecified_behavior

Note: A downward pull of 12px or more from the handle reveals the header. The approved spec names only a tap (129 step 4). decisions.md records the human's choice, but the spec and the invariants do not.; Because of pointer capture, a press on the handle that drifts sideways or upward and is then released can still produce a click on the handle and reveal the header with a mouse on a hybrid device. With touch, a move beyond the tap slop produces no click, so the drift does nothing.
- claude-read: A downward pull of 12px or more from the handle reveals the header. The approved spec names only a tap (129 step 4). decisions.md records the human's choice, but the spec and the invariants do not.
- claude-read: Because of pointer capture, a press on the handle that drifts sideways or upward and is then released can still produce a click on the handle and reveal the header with a mouse on a hybrid device. With touch, a move beyond the tap slop produces no click, so the drift does nothing.
- claude-verify: The downward pull reveal (AppShell.tsx:88-97, threshold 12px) is not in the spec text. Only decisions.md records it.

### unspecified_behavior

Note: The downward pull reveal (AppShell.tsx:88-97, threshold 12px) is not in the spec text. Only decisions.md records it.
- claude-read: A downward pull of 12px or more from the handle reveals the header. The approved spec names only a tap (129 step 4). decisions.md records the human's choice, but the spec and the invariants do not.
- claude-read: Because of pointer capture, a press on the handle that drifts sideways or upward and is then released can still produce a click on the handle and reveal the header with a mouse on a hybrid device. With touch, a move beyond the tap slop produces no click, so the drift does nothing.
- claude-verify: The downward pull reveal (AppShell.tsx:88-97, threshold 12px) is not in the spec text. Only decisions.md records it.

## Findings

A: 0
B: 2
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: The new swipe test's 'does not scroll the page' check reads window.scrollY. On the focus-drive fixture the document does not scroll (the h-below-header pane does), so the check passes whatever the gesture does.
Impact: If `touch-none` is removed from the handle, a pull on a real iPad can start a pan or a pointercancel before the 12px threshold. The pull would then stop revealing, or the page under it would scroll, and this test would still pass on the scroll check.
Evidence: focus-mode-touch-desktop.spec.ts (the swipe test): `scrollBefore = window.scrollY` and `expect(window.scrollY).toBe(scrollBefore)`. focusMode.tsx DriveRoute wraps the page in `h-below-header` with TwoPaneLayout `overflow-clip`, so window.scrollY stays 0. AppShell.tsx:105 adds `touch-none` to the handle, and that class is the only guard against the page scrolling during the pull.
Repro: Mutation traced statically, not run: delete `touch-none` from AppShell.tsx:105. The scroll assertion cannot fail, because window.scrollY is 0 before and after. The test would only go red if the emulated CDP touch also fired pointercancel before 12px, which is unverified.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Read the scrollTop of the element that scrolls (the pane under the handle), or record pointercancel and touch-driven scroll events on page-content during the swipe and assert that none arrive.

</details>

### claude-read:F2 — bucket B, INFO, open

Claim: The approved spec text in docs/specs/focus-mode.md (§1 129 step 4, D7, D11: a 56×22 pill with a down chevron) now disagrees with the code, which draws a 36×5 bar with no icon and also reveals on a downward pull. The human's decision exists only in decisions.md.
Impact: No user impact. A reader who treats the spec as the source could 'restore' the pill and chevron, which brings back the problem the human saw on the iPad, where the handle covered the top of the video.
Evidence: AppShell.tsx:104-107 (bar `h-[5px] w-9`, no svg); AppShell.tsx:88-97 (pull reveal); focus-mode.md 129 step 4 and D11 ('a visible 56×22px pill with a down chevron'); decisions.md:39-41 records the human's change on a real iPad.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the pill's dimensions and the chevron from 129 step 4 and D11 (or revise them through invariants.md), so that the spec no longer prescribes the rejected shape.

</details>

## Not verified

- claude-read: Nothing was executed. No test was run, and every trace was static.
- claude-read: Whether CDP Input.dispatchTouchEvent fires pointercancel when touch-action allows panning, which decides whether F1's mutation survives.
- claude-read: Behaviour on a real iPad (the human reports checking it on the device).
- claude-read: The full content of the R-5 re-run record added by f8ef0433a, beyond grep hits in decisions.md and design-check.md.
- claude-read: Files outside the fix diffs were not reread beyond their diff hunks in this round.
- claude-verify: Did not run the Playwright tests, so the claims rest only on reading the code and CSS.
- claude-verify: Did not check whether other fixture content mounted in the body (outside AppShell) could make the document scrollable; this rests on the fixture code and on decisions.md:17-18.
- claude-verify: Did not check real iPad Safari behaviour of touch-none and setPointerCapture during the pull.

TOTAL: 2 findings
