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
- open finding claude-read:F8 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/intelligence/frontend/CitationInlinePanel.tsx — partial: Diff hunks only.
- addons/intelligence/frontend/DetailedSummaryDocumentSide.test.tsx — full: New file, whole diff.
- addons/intelligence/frontend/DetailedSummarySection.tsx — partial: Lines 110-590 and 875-934, plus the diff hunks.
- addons/intelligence/manifest.json — partial: Diff hunk.
- frontend/e2e-components/document-summary-inspector-desktop.spec.ts — full: New file in diff.
- frontend/e2e-components/document-summary-inspector.spec.ts — full: New file in diff.
- frontend/e2e-components/fixtures/app.tsx — partial: Diff hunks.
- frontend/e2e-components/fixtures/focusMode.tsx — partial: Diff hunks.
- frontend/e2e-components/fixtures/inspectorResponsive.tsx — partial: Diff hunks.
- frontend/e2e-components/projects.ts — partial: Diff hunk.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Diff hunks.
- frontend/e2e-components/stubs/addons.ts — partial: Diff hunks.
- frontend/e2e-components/stubs/documentSideSlot.tsx — full: New file in diff.
- frontend/e2e-components/stubs/next-navigation.ts — partial: Diff hunks.
- frontend/src/app/globals.css — partial: Diff hunks.
- frontend/src/components/ArchivePreview.tsx — partial: Diff hunks.
- frontend/src/components/FileDetail/FileDetailContainer.tsx — partial: Diff hunk.
- frontend/src/components/FileDetail/FileDetailPresenter.tsx — partial: Diff hunks.
- frontend/src/components/FileDetail/MediaCanvas.tsx — partial: Diff hunks.
- frontend/src/components/FileDetail/MediaPlayerBlock.tsx — partial: Diff hunks.
- frontend/src/components/FileDetail/ShellLayout.tsx — partial: Lines 180-739 (all changed hunks except the import and props header, which were seen in the diff).
- frontend/src/components/FileDetail/hooks/useCanvasFloor.ts — full: Deleted; the whole file is in the diff.
- frontend/src/components/FileDetail/inspector/InspectorShell.tsx — full: Read the whole file.
- frontend/src/components/FileDetail/inspector/tabs.ts — partial: Diff hunks.
- frontend/src/components/FileDetail/lowerInspector.tsx — partial: Diff hunk.
- frontend/src/components/FileDetailShell.tsx — partial: Diff hunks.
- frontend/src/components/FilePreview.tsx — partial: Diff hunks.
- frontend/src/components/InspectorPane.tsx — full: The diff shows nearly the whole file.
- frontend/src/components/PdfPreview.tsx — partial: Diff hunks, plus a grep for early returns.
- frontend/src/components/epub/EpubPreview.tsx — partial: Import hunk.
- frontend/src/components/epub/useFillHeight.ts — full: Deleted; the whole file is in the diff.
- frontend/src/hooks/useFillHeight.ts — full: New file in diff.
- frontend/src/lib/addons.ts — partial: Diff hunk.
- frontend/src/lib/fileDetailShell.ts — partial: Diff hunks.
- frontend/src/lib/layoutSizes.ts — partial: Diff hunk.

Test files:
- addons/intelligence/frontend/ScenesSection/__tests__/WorkbenchManifest.test.ts — partial: Diff hunk.
- frontend/src/__tests__/i18n-keys.test.ts — partial: Diff hunks.
- frontend/src/components/FileDetail/__tests__/DocumentSideJump.test.tsx — full: New file in diff.
- frontend/src/components/FileDetail/__tests__/DocumentSideSlot.test.tsx — full: New file in diff.
- frontend/src/components/FileDetail/__tests__/FileDetailContent.test.tsx — partial: Diff hunks.
- frontend/src/components/FileDetail/__tests__/MediaShell.test.tsx — partial: Diff hunk.
- frontend/src/components/FileDetail/__tests__/ViewerShell.test.tsx — partial: Diff hunks.
- frontend/src/components/FileDetail/hooks/__tests__/useCanvasFloor.test.tsx — full: Deleted; the whole file is in the diff.
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: Diff hunk.
- frontend/src/components/archive/__tests__/archiveJustifiedCells.test.tsx — partial: Diff hunks.
- frontend/src/lib/__tests__/fileDetailShell.test.ts — partial: Diff hunks.

## Needs a human

### needs_human_record (claude-read:F10)

Question: docs/ADDON-DEVELOPMENT.md adds an `intelligence | inspector-tabs | ask` row to the per-add-on slot table. That row has nothing to do with `document-side`.
Impact: Documentation only. It does not mislead a code change.
Evidence: The diff of docs/ADDON-DEVELOPMENT.md near line 1790 adds `| intelligence | inspector-tabs | ask |` next to the planned document-side row.
Note: At the commit, docs/ADDON-DEVELOPMENT.md:1790 has `| intelligence | inspector-tabs | ask |` next to the document-side row at 1789. The row matches addons/intelligence/manifest.json:106-110, which declares inspector-tabs 'ask', so its content is accurate and unrelated to document-side. With only Read/Grep and no base diff, I could not confirm that this commit added the row. Docs are not in r6/product-files.txt.

### unspecified_behavior

Note: tabRequest in ShellLayout is never cleared. When the desktop InspectorShell remounts (the inspector reopens), its selectRequest effect replays the last request after the resetKey effect. The result is Info only because the detailed summary reports false in a layout effect on mount; an entry that does not report false on mount would be reselected on reopen (§3 'open again → Info').; On a player file, Info's exclusion of detailed-summary now depends on the player-side registration.
- claude-read: tabRequest in ShellLayout is never cleared. When the desktop InspectorShell remounts (the inspector reopens), its selectRequest effect replays the last request after the resetKey effect. The result is Info only because the detailed summary reports false in a layout effect on mount; an entry that does not report false on mount would be reselected on reopen (§3 'open again → Info').
- claude-read: On a player file, Info's exclusion of detailed-summary now depends on the player-side registration.
- claude-verify: Player-file Info excludes detailed-summary only through the player-side registration, no longer through a core hard-code (F5).
- claude-verify: DetailedSummarySection availability changed in player-side too (F6).
- claude-verify: Every regenerate path selects the tab (F7).

### unspecified_behavior

Note: Player-file Info excludes detailed-summary only through the player-side registration, no longer through a core hard-code (F5).; DetailedSummarySection availability changed in player-side too (F6).; Every regenerate path selects the tab (F7).
- claude-read: tabRequest in ShellLayout is never cleared. When the desktop InspectorShell remounts (the inspector reopens), its selectRequest effect replays the last request after the resetKey effect. The result is Info only because the detailed summary reports false in a layout effect on mount; an entry that does not report false on mount would be reselected on reopen (§3 'open again → Info').
- claude-read: On a player file, Info's exclusion of detailed-summary now depends on the player-side registration.
- claude-verify: Player-file Info excludes detailed-summary only through the player-side registration, no longer through a core hard-code (F5).
- claude-verify: DetailedSummarySection availability changed in player-side too (F6).
- claude-verify: Every regenerate path selects the tab (F7).

## Findings

A: 1
B: 9
C: 0

### claude-read:F8 — bucket A, MEDIUM, open

Claim: I11 fails when an active summary note exists: 'Create detailed summary' from the AI menu opens a confirm dialog that is never rendered. Nothing is generated and no tab is listed or selected.
Impact: A reader on a PDF with a summary note clicks AI → Create detailed summary and nothing happens. The action fails silently.
Evidence: DetailedSummarySection.tsx:494-501 offers the AI action whenever `!data.available` and the status is neither generating nor failed. `startGenerate` (344-348) sets `confirmRegenerateOpen` when `hasActiveSummary`. The ConfirmDialog renders only inside DetailedSummaryBody (925-926), which is reached only when `data.available` (575 returns null otherwise). `doRegenerate`, and with it `select()`, is never called.
Repro: not_reproduced (traced in code: an active note plus reason 'not_generated' leads to setConfirmRegenerateOpen(true) and the component returning null)
Introduced: pre-existing
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Render the confirm dialog outside the available-only body, or skip the confirmation when no detailed summary exists yet.

</details>

### claude-read:F3 — bucket B, MEDIUM, open

Claim: FileDetailShell gains a `raiseSheetRequest` prop and an effect that moves the phone sheet to half. The touch-point list names FileDetailShell only for removing `data-canvas-floor` and adding `data-inspector-wide`.
Impact: The sheet's snap state machine has a new writer. A regression in sheet raising would be outside what the plan says was touched.
Evidence: frontend/src/components/FileDetailShell.tsx:73-82 adds the props. Lines 457-470 add the effect `setSheetState(prev => isSheetExpanded(prev) ? prev : SHEET_STATE_HALF)`. ShellLayout.tsx:402,431-433,686 feed it.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the sheet-raise request to the FileDetailShell touch point.

</details>

### claude-read:F4 — bucket B, MEDIUM, open

Claim: ShellLayout now routes find's tab requests through a new `tabRequest` state, and makes the desktop InspectorShell controlled (`activeId`/`onActiveIdChange`) on every page. That includes player files and the MarkdownDocumentLayout, which the touch points say stay unchanged.
Impact: Tab selection on player files, Markdown and HTML pages now goes through new lifted state: a reset key built from fileId, phone/desktop and open/closed, and a request counter. A selection regression on those pages would fall outside the planned scope.
Evidence: ShellLayout.tsx:366-377 replaces `selectRequest={find.selectRequest}` with `tabRequest`. Lines 597-642 add `desktopShellKey`, `desktopWanted` and `activeId={desktopActiveId ?? 'info'}`, built unconditionally. Line 732 passes the same `inspector` to MarkdownDocumentLayout. The phone sheet's InspectorShell at line 654 also takes `tabRequest`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either scope the controlled selection to files without a player, or state in the touch points that every file page's inspector selection is now lifted into ShellLayout.

</details>

### claude-read:F5 — bucket B, MEDIUM, open

Claim: On a player file, Info's exclusion of `detailed-summary` changed. It used to be a hard-coded core exclusion. Now it holds only when a `player-side` entry has the same id. The touch-point list does not name this player-file change.
Impact: With the real intelligence manifest, `detailed-summary` stays out of Info on a player file because it is also in `player-side`, so I9 holds. If an add-on registers `detailed-summary` only in `file-detail-sections`, Info on a player file now draws it. Three existing tests had to claim `player-side` to keep passing.
Evidence: ShellLayout.tsx:457-465: for `usesCanvasViewer` (player files included), `canvasSlotIds` is `documentSideEntries.map(...)`, which is `[]` when `hasPlayer`. The base used `['detailed-summary']`. MediaShell.test.tsx:1316-1318 and FileDetailContent.test.tsx:572-579 add a `player-side` claim. FileDetailContent.test.tsx:221-223 changes a slot count from 4 to 3.
Repro: Mutation: drop the `player-side` claim added at MediaShell.test.tsx:1316. Read from the code: the 'keeps an addon section the canvas does not draw' expectation of an exclude list containing detailed-summary would no longer hold. Not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the player-file exclusion change to the ShellLayout touch point and to the ADDON-DEVELOPMENT `file-detail-sections` row, or keep `detailed-summary` excluded on player files.

</details>

### claude-read:F1 — bucket B, LOW, open

Claim: The change threads a new `documentController` prop through FileDetailContainer and FileDetailPresenter into ShellLayout. The touch-point list names neither file.
Impact: No user-visible defect. Two unlisted core components now carry the document controller, so the plan understates what the change reaches.
Evidence: frontend/src/components/FileDetail/FileDetailContainer.tsx:346 passes `documentController={documentController}`. frontend/src/components/FileDetail/FileDetailPresenter.tsx:55,226,272 adds the prop and forwards it. ShellLayout.tsx:380-396 reads it in `openInViewer`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add both files to the touch-point list, as the route by which `openInViewer` reaches `goTo`.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: frontend/src/components/FileDetail/lowerInspector.tsx gains a new exported hook, `useLowerInspector`. The touch-point list does not name this file.
Impact: No user-visible defect. The lowering registry gets a second consumer, which the plan does not mention.
Evidence: lowerInspector.tsx:52-56 adds `useLowerInspector`. ShellLayout.tsx:379,392 calls it from `openInViewer` on a phone.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List lowerInspector.tsx under the I8 phone-lowering touch point.

</details>

### claude-read:F6 — bucket B, LOW, open

Claim: DetailedSummarySection's `canShow` no longer counts an active summary note. This changes the availability the same component reports in `player-side` on player files. The touch point names only `openInViewer`, `select()` and `active`.
Impact: On a video with an active summary note and no generated detailed summary, the Detailed summary panel and narrow-form tab used to be listed, though the body drew nothing. They are now unlisted. Arguably a fix, but it reaches player files, which the touch points say stay unchanged.
Evidence: addons/intelligence/frontend/DetailedSummarySection.tsx:190-194 removes `hasActiveSummary ||` from `canShow`. Lines 247-250 report `canShow` through `onAvailability` in every slot. The same component is registered in `player-side` (WorkbenchManifest.test.ts asserts `ids('player-side')` contains detailed-summary).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the `canShow` change in the add-on touch point, including its effect on the player-side panel.

</details>

### claude-read:F7 — bucket B, LOW, open

Claim: `doRegenerate` now sets the status to generating early, reports available and calls `select()` on every regenerate path: Retry, regenerate from the body, the confirmed regenerate, and player-side mounts. The touch point says only 'call select() when its AI-menu action starts generation'.
Impact: A Retry or regenerate pressed inside the tab also re-requests the tab. On a phone it raises the sheet to half when the sheet sits lower. Local `data` gets a synthetic `status: 'generating'` before the server answers.
Evidence: DetailedSummarySection.tsx:304-313 sets the early status, calls `onAvailabilityRef.current?.(true)` and `selectRef.current?.()` unconditionally inside `doRegenerate`. Its callers are `handleGenerate` (AI menu and Retry) and `handleConfirmRegenerate`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name the actual scope (every regenerate start) in the touch point, or call select() only from the AI-menu run.

</details>

### claude-read:F10 — bucket B, INFO, open

Claim: docs/ADDON-DEVELOPMENT.md adds an `intelligence | inspector-tabs | ask` row to the per-add-on slot table. That row has nothing to do with `document-side`.
Impact: Documentation only. It does not mislead a code change.
Evidence: The diff of docs/ADDON-DEVELOPMENT.md near line 1790 adds `| intelligence | inspector-tabs | ask |` next to the planned document-side row.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F9 — bucket B, INFO, open

Claim: Several fixture, stub and test files that the touch-point list omits were changed. The shared Next navigation stub's `useRouter` now records pushes in a global for every component spec.
Impact: The test harness is changed for all e2e-components specs, not just the new ones. A spec that relied on `push` being a no-op object identity is unaffected, but the reach is wider than planned.
Evidence: frontend/e2e-components/stubs/next-navigation.ts:63-69. Also changed: fixtures/focusMode.tsx (message merge under docside), fixtures/inspectorResponsive.tsx (archive file, document-side entries, exported deepMerge), stubs/documentSideSlot.tsx (new), spec-viewport.spec.ts, componentFixtureParity.test.tsx, the new DocumentSideJump.test.tsx and DocumentSideSlot.test.tsx, and MediaShell.test.tsx.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List these under the e2e registry and stubs bullet.

</details>

## Not verified

- claude-read: Did not run any test or e2e spec.
- claude-read: Did not read EpubPreview, MediaPlayerBlock, MediaCanvas or the e2e app.tsx beyond the diff hunks.
- claude-read: Did not verify the behaviour of the MobileInspectorSheet mount/unmount with stale tabRequest.
- claude-verify: Base-commit content (no git access): whether F8's dialog gating and F10's doc row predate this commit.
- claude-verify: Whether buildInspectorTabs mounts unavailable document-side tabs hidden (assumed, so that the AI offer registers).
- claude-verify: Runtime behaviour; no tests or e2e were run.

TOTAL: 10 findings
