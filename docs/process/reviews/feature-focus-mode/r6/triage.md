# Triage: r6

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:F1 is bucket A or BLOCKER
- open finding claude-read:F2 is bucket A or BLOCKER

## Read coverage

Product files:
- frontend/e2e-components/file-header-row-desktop.spec.ts — partial: Diff hunks plus lines 125-140 and 690-710 via grep context.
- frontend/e2e-components/file-header-row.spec.ts — partial: Diff hunk around lines 77-95 only.
- frontend/e2e-components/fixtures/app.tsx — partial: Diff hunks (import ~114, ARRANGEMENTS ~2790-2805) only.
- frontend/e2e-components/fixtures/focusMode.tsx — full: New file, entirely present in the diff.
- frontend/e2e-components/fixtures/inspectorResponsive.tsx — partial: Diff hunks (export changes at ~26, ~184, ~376) only.
- frontend/e2e-components/focus-mode-desktop.spec.ts — full: New file, entirely present in the diff.
- frontend/e2e-components/focus-mode-touch-desktop.spec.ts — full: New file, entirely present in the diff.
- frontend/e2e-components/projects.ts — partial: Diff hunk around line 41 only.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Diff hunk around line 122 only.
- frontend/e2e-components/stubs/next-navigation.ts — full: Read the whole file.
- frontend/src/app/globals.css — partial: Lines 660-730 (all focus-mode rules); line 1431-1438 via grep.
- frontend/src/components/AppShell.tsx — full: Read the whole file.
- frontend/src/components/ChromeButtons.tsx — full: Read the whole file.
- frontend/src/components/ConfirmDialog.tsx — partial: Diff hunk around lines 60-75 only.
- frontend/src/components/DriveUnavailable.tsx — full: Read the whole file.
- frontend/src/components/FileDetail/FileDetailChrome.tsx — partial: Lines 100-180 plus grep of hosted/trailing usage (55, 206-222).
- frontend/src/components/FileDetail/FocusModeButton.tsx — full: New file, entirely present in the diff.
- frontend/src/components/FileDetailShell.tsx — partial: Lines 150-230 and 365-395.
- frontend/src/components/FocusModeShortcuts.tsx — full: New file, entirely present in the diff.
- frontend/src/components/GlobalSearch.tsx — partial: Lines 795-835 and the matchMedia lines 162-170.
- frontend/src/components/Header.tsx — full: Read the whole file.
- frontend/src/components/RenameDialog.tsx — partial: Diff hunk around lines 55-70 only.
- frontend/src/components/Sidebar.tsx — partial: Lines 286-337 (SidebarShortcuts and Sidebar).
- frontend/src/components/SidebarProvider.tsx — full: Read the whole file.
- frontend/src/components/TreeToggle.tsx — full: Read the whole file.
- frontend/src/components/folder/TwoPaneLayout.tsx — partial: Lines 95-175 (all changed hunks and their enclosing body).
- frontend/src/components/markdown/SaveDot.tsx — full: Read the whole file.
- frontend/src/hooks/useFocusMode.ts — full: Read the whole file.
- frontend/src/lib/findShortcut.ts — full: Read the whole file.
- frontend/src/lib/focusModeStore.ts — full: New file, entirely present in the diff.
- frontend/src/lib/readingAnchor.ts — full: Read the whole file.
- frontend/src/lib/safeArea.ts — full: New file, entirely present in the diff.
- frontend/src/messages-core/en.json — partial: Diff hunk (focusMode keys at ~1554) only.
- frontend/src/messages-core/ja.json — partial: Diff hunk (focusMode keys at ~1554) only.

Test files:
- frontend/src/components/FileDetail/__tests__/FileDetailHeaderRow.test.tsx — partial: Diff hunks around lines 280-315 only.
- frontend/src/components/__tests__/AppShell.quickNote.test.tsx — partial: Diff hunk (next/navigation mock) only.
- frontend/src/components/__tests__/MenuButton.test.tsx — full: Read the whole file.

## Needs a human

### unspecified_behavior

Note: The reading-anchor restore scrolls after any focus-layout change, including resizes across 768px, with an anchor captured possibly long before (F3).; isHeaderMenuOpen matches any header element in the document. A PageHeader <header> with an expanded control would also suppress T and hold the reveal.; The mutation observer over the whole documentElement re-checks the cover on every subtree childList change while in the focus layout.
- claude-read: The reading-anchor restore scrolls after any focus-layout change, including resizes across 768px, with an anchor captured possibly long before (F3).
- claude-read: isHeaderMenuOpen matches any header element in the document. A PageHeader <header> with an expanded control would also suppress T and hold the reveal.
- claude-read: The mutation observer over the whole documentElement re-checks the cover on every subtree childList change while in the focus layout.
- claude-verify: The reading-anchor restore scrolls the page for up to 20 frames after a focus-layout change, and a stale anchor can be applied on a later widening (F3/F4).
- claude-verify: A global one-frame suppression of all CSS transitions on every app load and every focus-layout change (F10).
- claude-verify: safeArea's body probe triggers AppShell's covered-state MutationObserver on every header resize in the focus layout.

### unspecified_behavior

Note: The reading-anchor restore scrolls the page for up to 20 frames after a focus-layout change, and a stale anchor can be applied on a later widening (F3/F4).; A global one-frame suppression of all CSS transitions on every app load and every focus-layout change (F10).; safeArea's body probe triggers AppShell's covered-state MutationObserver on every header resize in the focus layout.
- claude-read: The reading-anchor restore scrolls after any focus-layout change, including resizes across 768px, with an anchor captured possibly long before (F3).
- claude-read: isHeaderMenuOpen matches any header element in the document. A PageHeader <header> with an expanded control would also suppress T and hold the reveal.
- claude-read: The mutation observer over the whole documentElement re-checks the cover on every subtree childList change while in the focus layout.
- claude-verify: The reading-anchor restore scrolls the page for up to 20 frames after a focus-layout change, and a stale anchor can be applied on a later widening (F3/F4).
- claude-verify: A global one-frame suppression of all CSS transitions on every app load and every focus-layout change (F10).
- claude-verify: safeArea's body probe triggers AppShell's covered-state MutationObserver on every header resize in the focus layout.

## Findings

A: 2
B: 8
C: 0

### claude-read:F1 — bucket A, MEDIUM, open

Claim: An overlay sidebar opened in focus mode stays open after leaving (by T or the tree button) whenever the sidebar is in overlay form for another reason (viewport below 1200px, or the tree beside/yielded), because SidebarProvider only closes it when isOverlay flips and focusLent does not flip isOverlay there.
Impact: At 1024px (or at 1440 with the tree shown) a viewer who opens the menu in the revealed header and then presses T, or presses the tree button (z-50, above the z-30 backdrop), leaves focus mode with the overlay sidebar still open over the ordinary page. The same gap means an overlay sidebar that is open when T enters focus mode at <1200px is not closed on entering (spec §1.3).
Evidence: SidebarProvider.tsx:60 isOverlay = routeOverlay || focusLent || narrow; SidebarProvider.tsx:76-83 setIsOpen(false) runs only in a layout effect keyed on isOverlay; useFocusSidebarWhen (SidebarProvider.tsx:190-195) only toggles focusLent. With narrow=true (NARROW_QUERY max-width 1199px) or routeOverlay=true (TwoPaneLayout.tsx:135 useOverlaySidebarWhen(treeBeside || yielded)) isOverlay stays true across entering/leaving, so isOpen is never reset. The overlay sidebar's shortcut context (Sidebar.tsx:290-295) has no blocksLower, and canTakeFocusModeShortcut excludes data-app-sidebar, so T fires with it open. The only test (focus-mode-desktop.spec.ts 'T with the overlay sidebar open leaves focus mode') runs at 1280 with the tree hidden, where isOverlay does flip.
Repro: Traced statically, not run: open focus-drive at 1024×900, file=video; press the Focus mode button; reveal with the pointer at the top; click Menu (overlay opens, aria-pressed=true); press T. Expected per I4: overlay closed. Traced: focusLent false, narrow still true, isOverlay unchanged, layout effect does not run, isOpen remains true, so the menu button stays aria-pressed=true and the overlay stays drawn.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> In the focus-layout transition (useFocusSidebarWhen or SidebarProvider), call setIsOpen(false) when focusLent changes in either direction while isOverlay stays true. Then add the 1024px and tree-shown rows to the overlay-close test.

</details>

### claude-read:F2 — bucket A, LOW, open

Claim: On a /drive/{drive}?file=… URL whose drive layout draws DriveUnavailable, T still toggles focus mode on, because FocusModeShortcuts is active on isFilePageUrl (pure URL test) and DriveUnavailable only clears the store once on mount.
Impact: On the 'Can't open the drive' screen, T hides the header and sidebar, and the screen has no Focus mode button. The cheat sheet also lists T there. The viewer has to press T again or reveal the header to recover.
Evidence: AppShell.tsx:334 <FocusModeShortcuts active={filePageUrl} />; useFocusMode.ts:15-22 isFilePageUrl is true for any /drive/… with a file param; DriveUnavailable.tsx:29-31 useLayoutEffect(() => focusModeStore.set(false), []) runs only on mount; AppShell.tsx:288-290 resets the store only when filePageUrl changes. The spec's Terms say such a URL is not a file page URL. No test covers DriveUnavailable at all, so deleting DriveUnavailable.tsx:29-31 survives every spec in the diff.
Repro: Traced statically, not run: open /drive/x?file=y where drive x is unavailable; press T with nothing focused. Traced: toggleFocusMode → store true → useFocusLayout true (file page URL and wide) → the header becomes data-focus-header=hidden and html gets data-focus-layout over DriveUnavailable.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Make the 'not a file page' fact available to useIsFilePageUrl and FocusModeShortcuts, for example through a flag that DriveUnavailable sets while mounted, instead of a one-shot store reset. Add a test that presses T on DriveUnavailable.

</details>

### claude-read:F3 — bucket B, LOW, open

Claim: toggleFocusMode always captures a reading anchor, but restoreReadingAnchor runs only when focusLayout changes, so an anchor captured by T below 768px stays pending and is applied later when the viewport widens.
Impact: On a phone-width window or an iPad in portrait: the viewer presses T, scrolls elsewhere, then widens or rotates to landscape. The content jumps back to where it was when T was pressed.
Evidence: useFocusMode.ts:92-95 rememberReadingAnchor() on every toggle; readingAnchor.ts:120-123 sets module-level pending; AppShell.tsx:311-313 restoreReadingAnchor only in an effect keyed on focusLayout, which does not change when T is pressed below 768px (useFocusLayout requires wide); readingAnchor.ts:131-180 then scrolls the remembered element back over up to 20 frames.
Repro: Traced statically, not run: at 700px on a scrolled PDF file page, press T (state on, layout unchanged, pending captured). Scroll the pane by several pages, then widen to 1280. focusLayout becomes true and restoreReadingAnchor scrolls back to the T-time element.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Capture the anchor only when the toggle will change focusLayout, or drop a pending anchor on the next user scroll.

</details>

### claude-read:F10 — bucket B, INFO, open

Claim: Reach beyond the planned scope of globals.css: html[data-focus-settling] * { transition: none !important } cancels every transition in the document for one frame. AppShell sets it on mount (every app load) and on every focus-layout change, not only for the sidebar, tree and header named in the plan.
Impact: Any unrelated transition in flight at that frame (inspector, toasts, sheets) snaps. Low visible effect.
Evidence: globals.css:717-720; AppShell.tsx:292-307 (the effect also runs on mount with focusLayout=false).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F4 — bucket B, INFO, open

Claim: Unplanned place: frontend/src/lib/readingAnchor.ts is a new module that is not in the touch-point list. It writes scrollTop on any detected scroller, or calls window.scrollBy, for up to 20 frames after every focus-layout change.
Impact: Every focus-layout change, including resizes across 768px and leaving by navigation, now scrolls the page programmatically. No invariant covers its side effects beyond I2's reading-position clause; F3 is one consequence.
Evidence: readingAnchor.ts:131-180; called from useFocusMode.ts:93 and AppShell.tsx:311-313. The touch points list neither file nor a scroll-restoring mechanism.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F5 — bucket B, INFO, open

Claim: Unplanned place: frontend/src/lib/safeArea.ts is a new module that is not in the touch-point list. Header calls it on every ResizeObserver callback in the focus layout, and it appends and removes a probe div on document.body each time.
Impact: Each call is a body childList mutation, which AppShell's document-wide MutationObserver (AppShell.tsx:180-186) re-evaluates as a possible cover. It is harmless today but couples the two.
Evidence: safeArea.ts:6-15; Header.tsx:41-57; AppShell.tsx:180-186.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F6 — bucket B, INFO, open

Claim: Unplanned places: frontend/src/components/FocusModeShortcuts.tsx and frontend/src/components/FileDetail/FocusModeButton.tsx are new files that are not in the touch-point list. The plan put the focus-mode shortcut context in useFocusMode.ts and the button in FileDetailChrome.tsx.
Impact: None for a user. The behaviour lives where the plan did not say.
Evidence: FocusModeShortcuts.tsx:15-32 (mounted at AppShell.tsx:334); FocusModeButton.tsx:9-29 (used at FileDetailChrome.tsx:146).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F7 — bucket B, INFO, open

Claim: Unplanned behaviour at a listed place: DriveUnavailable.tsx is listed only as a user of h-below-header that keeps its height, but the diff makes it write the focus store.
Impact: It becomes part of focus mode's lifetime rule, and an incomplete one (see F2).
Evidence: DriveUnavailable.tsx:27-31.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F8 — bucket B, INFO, open

Claim: Unplanned places: shared component-test infrastructure that every fixture uses is changed, and none of it is in the touch-point list or §7: e2e-components/stubs/next-navigation.ts, fixtures/app.tsx, fixtures/inspectorResponsive.tsx (exports), projects.ts and spec-viewport.spec.ts.
Impact: The router stub now subscribes every usePathname/useSearchParams reader to a store. It also returns one shared EMPTY_QUERY instance instead of a fresh URLSearchParams per call, so effects keyed on searchParams in other fixtures now run less often. That can change what unrelated existing component specs observe.
Evidence: stubs/next-navigation.ts:22-56; inspectorResponsive.tsx installFetch/installMedia/VIDEO_ID/PDF_ID now exported; projects.ts and spec-viewport.spec.ts list the two new specs.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F9 — bucket B, INFO, open

Claim: Unplanned places: existing tests that §7 does not list are modified: e2e-components/file-header-row.spec.ts, src/components/__tests__/AppShell.quickNote.test.tsx and src/components/__tests__/MenuButton.test.tsx.
Impact: None found. The changes add one assertion (narrow: no Focus mode button) and mocks (useSearchParams, useFocusSidebarWhen, setFocusLent, useShortcutsContext). No assertion is weakened.
Evidence: Diff hunks of the three files; MenuButton.test.tsx:8-39.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Nothing was executed: no unit, component or e2e test was run; all repros were traced statically.
- claude-read: Real touch and iPad behaviour (handle, safe area, rotation) was not checked.
- claude-read: The full bodies of the modified test files (file-header-row-desktop.spec.ts, fixtures/app.tsx, inspectorResponsive.tsx) beyond the diff hunks.
- claude-read: Whether PageHeader's <header> appears on any file page alongside the app header.
- claude-read: EPUB full-screen viewer cover detection (no aria-modal found for it).
- claude-verify: I could not run git diff, the tests or the app; the changed-file sets come from the r6 product-files.txt and test-files.txt and from the current file content.
- claude-verify: Whether the tree-button path of F1 can be reached while the overlay sidebar's z-30 backdrop is up.
- claude-verify: The contents of focus-mode-desktop.spec.ts, including the overlay-sidebar test cited in F1.
- claude-verify: The invariants.md revision file, for any revised wording of I4.

TOTAL: 10 findings
