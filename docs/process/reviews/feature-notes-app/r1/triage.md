# Triage: r1

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
- unspecified_behavior

## Read coverage

Product files:
- addons/knowledge/app/main.py — full: diff hunk (router import and include) read
- addons/knowledge/app/routers/notes_sources.py — full: new file, whole content in diff
- addons/knowledge/frontend/AllNotes.tsx — full: deleted; whole content in diff
- addons/knowledge/frontend/AllNotesRail.tsx — full: deleted; whole content in diff
- addons/knowledge/frontend/ContinueCard.tsx — full: diff hunks read; usages grepped
- addons/knowledge/frontend/Editor.tsx — partial: changed hunks in diff plus grep of frameless/VersionHistoryPanel lines 131-207, 1447-1562; not the whole 1500+ line file
- addons/knowledge/frontend/EditorToolbar.tsx — full: changed hunks and enclosing component read via diff and grep
- addons/knowledge/frontend/KnowledgeEditSection.tsx — full: changed hunks in diff
- addons/knowledge/frontend/NoteResults.tsx — full: deleted; whole content in diff
- addons/knowledge/frontend/NoteSearchScope.tsx — full: diff hunk read
- addons/knowledge/frontend/NotesLanding.tsx — full: diff hunks read (only SectionHeading kept)
- addons/knowledge/frontend/NotesPage.tsx — full: rewritten; whole new content in diff
- addons/knowledge/frontend/Page.tsx — full: diff hunks with the whole component
- addons/knowledge/frontend/VersionHistoryPanel.tsx — partial: diff hunks plus lines 220-279 read in file
- addons/knowledge/frontend/allNotesParams.ts — full: deleted; whole content in diff
- addons/knowledge/frontend/editorSaveHandle.ts — full: new file in diff
- addons/knowledge/frontend/library/LibraryList.tsx — full: new file in diff
- addons/knowledge/frontend/library/LibraryRail.tsx — full: new file in diff; ToolbarMenu props checked
- addons/knowledge/frontend/library/NotesLibrary.tsx — full: new file in diff
- addons/knowledge/frontend/library/libraryUrl.ts — full: new file in diff
- addons/knowledge/frontend/library/pane/Connections.tsx — full: new file in diff
- addons/knowledge/frontend/library/pane/NotePaneContainer.tsx — full: new file in diff
- addons/knowledge/frontend/library/pane/NotePanePresenter.tsx — full: new file in diff
- addons/knowledge/frontend/library/pane/useNoteData.ts — full: new file in diff
- addons/knowledge/frontend/library/railModel.ts — full: new file in diff
- addons/knowledge/frontend/library/shownNote.ts — full: new file in diff
- addons/knowledge/frontend/library/useLibraryLayout.ts — full: new file in diff
- addons/knowledge/frontend/library/useNotesList.ts — full: new file in diff
- addons/knowledge/frontend/library/useRailEntries.ts — full: new file in diff
- addons/knowledge/frontend/library/useScopedLoad.ts — full: new file in diff
- addons/knowledge/frontend/messages/en.json — partial: diff hunk for notesLibrary/notesApp/notes only
- addons/knowledge/frontend/messages/ja.json — partial: diff hunk for notesLibrary/notesApp/notes only
- addons/knowledge/frontend/notesapp/ContinueWritingSection.tsx — full: new file in diff
- addons/knowledge/frontend/notesapp/Home.tsx — full: new file in diff
- addons/knowledge/frontend/notesapp/NotesWithSourcesSection.tsx — full: new file in diff
- addons/knowledge/frontend/notesapp/RecentlyUpdatedSection.tsx — full: new file in diff
- addons/knowledge/frontend/notesapp/RetryLink.tsx — full: new file in diff
- addons/knowledge/frontend/notesapp/Skeleton.tsx — full: new file in diff
- addons/knowledge/frontend/notesapp/changeGate.ts — full: new file in diff
- addons/knowledge/frontend/notesapp/listing.ts — full: new file in diff
- addons/knowledge/frontend/notesapp/locator.ts — full: new file in diff
- addons/knowledge/frontend/notesapp/sourceKind.ts — full: new file in diff
- addons/knowledge/frontend/notesapp/sourcesApi.ts — full: new file in diff
- addons/knowledge/frontend/notesapp/useNotesTarget.ts — full: new file in diff
- addons/knowledge/frontend/notesapp/useNotesWithSources.ts — full: new file in diff
- addons/knowledge/manifest.json — full: diff hunk read
- frontend/e2e-components/build-bundle.ts — full: diff hunk read
- frontend/e2e-components/fixtures/app.tsx — partial: diff hunks only
- frontend/e2e-components/fixtures/notesAllClipsToggle.tsx — full: deleted; whole content in diff
- frontend/e2e-components/fixtures/notesLibrary.tsx — full: new file in diff
- frontend/e2e-components/notes-all-clips-toggle.spec.ts — full: deleted; whole content in diff
- frontend/e2e-components/notes-library-desktop.spec.ts — full: new file in diff
- frontend/e2e-components/page-header-actions.spec.ts — partial: added hunk only
- frontend/e2e-components/projects.ts — partial: diff hunk only
- frontend/e2e-components/spec-viewport.spec.ts — partial: diff hunks only
- frontend/src/components/PageHeader.tsx — partial: diff hunks only
- frontend/src/components/appshell/AppHeader.tsx — full: diff hunks covering the whole component
- frontend/src/components/appshell/TargetMenu.tsx — partial: diff hunks only

Test files:
- addons/knowledge/frontend/__tests__/AllNotes.test.tsx — full: deleted; content in diff
- addons/knowledge/frontend/__tests__/Editor.requestSequence.test.tsx — full: new, in diff
- addons/knowledge/frontend/__tests__/Editor.saveHandle.acceptance.test.tsx — full: new, in diff
- addons/knowledge/frontend/__tests__/Editor.saveHandle.test.tsx — full: new, in diff
- addons/knowledge/frontend/__tests__/EditorToolbar.border.test.tsx — full: new, in diff
- addons/knowledge/frontend/__tests__/KnowledgeEditSection.saveHandle.test.tsx — full: new, in diff
- addons/knowledge/frontend/__tests__/NoteSearchScope.test.tsx — partial: diff hunk only
- addons/knowledge/frontend/__tests__/NotesPage.test.tsx — partial: deleted; skimmed in diff
- addons/knowledge/frontend/__tests__/VersionHistoryPanel.test.tsx — partial: diff hunk only
- addons/knowledge/frontend/__tests__/c3-chrome.test.tsx — partial: diff hunks only
- addons/knowledge/frontend/__tests__/notesApp.frame.test.tsx — partial: skimmed in diff
- addons/knowledge/frontend/__tests__/notesApp.home.test.tsx — partial: skimmed in diff
- addons/knowledge/frontend/__tests__/notesAppHarness.tsx — partial: skimmed in diff
- addons/knowledge/frontend/__tests__/notesFrame.test.tsx — partial: skimmed in diff
- addons/knowledge/frontend/__tests__/notesHome.test.tsx — partial: skimmed in diff
- addons/knowledge/frontend/__tests__/notesLeaveClipsOut.test.tsx — partial: diff hunks only
- addons/knowledge/frontend/__tests__/notesLibrary.test.tsx — partial: skimmed in diff
- addons/knowledge/frontend/__tests__/notesPrimaryAction.test.tsx — full: new, in diff
- addons/knowledge/frontend/__tests__/notesRoutesManifest.test.ts — full: new, in diff
- addons/knowledge/frontend/__tests__/page.test.tsx — partial: diff hunks only
- addons/knowledge/frontend/__tests__/popup-dismissal.test.ts — partial: diff hunk only
- addons/knowledge/frontend/__tests__/reachability.test.ts — partial: diff hunk only
- addons/knowledge/frontend/library/__tests__/NotesLibrary.test.tsx — partial: skimmed in diff
- addons/knowledge/frontend/library/__tests__/libraryUrl.test.ts — full: new, in diff
- addons/knowledge/frontend/library/__tests__/listing.test.ts — full: new, in diff
- addons/knowledge/frontend/library/__tests__/railModel.test.ts — full: new, in diff
- addons/knowledge/frontend/library/__tests__/shownNote.test.ts — full: new, in diff
- addons/knowledge/tests/test_notes_sources.py — partial: diff was truncated partway through this file
- addons/knowledge/tests/test_notes_with_sources.py — not_read: beyond the diff truncation; not opened
- frontend/src/components/__tests__/PageHeader.test.tsx — partial: diff hunk only
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: diff hunks only
- frontend/src/components/__tests__/toolbarMenuHome.test.ts — partial: diff hunk only
- frontend/src/components/appshell/__tests__/AppHeader.test.tsx — full: new, in diff
- frontend/src/components/appshell/__tests__/TargetMenu.test.tsx — partial: diff hunk only

## Needs a human

### unspecified_behavior

Note: The file page's version history panel switches between one and two columns by container width rather than viewport width (F1).; The e2e fixture build resolves addon packages from frontend/ (F3).
- claude-read: The file page's version history panel switches between one and two columns by container width rather than viewport width (F1).
- claude-read: The e2e fixture build resolves addon packages from frontend/ (F3).
- claude-verify: The file page's version history panel now switches to two columns by its own container width (@xl, 36rem), where before it followed the viewport (lg, 1024px). At some widths the file page's panel layout may differ from before.

### unspecified_behavior

Note: The file page's version history panel now switches to two columns by its own container width (@xl, 36rem), where before it followed the viewport (lg, 1024px). At some widths the file page's panel layout may differ from before.
- claude-read: The file page's version history panel switches between one and two columns by container width rather than viewport width (F1).
- claude-read: The e2e fixture build resolves addon packages from frontend/ (F3).
- claude-verify: The file page's version history panel now switches to two columns by its own container width (@xl, 36rem), where before it followed the viewport (lg, 1024px). At some widths the file page's panel layout may differ from before.

## Findings

A: 0
B: 5
C: 0

### claude-read:F1 — bucket B, MEDIUM, open

Claim: VersionHistoryPanel.tsx is edited although the touch points name neither it nor any layout change to the file page's editor, and its open grid switches from the viewport breakpoint `lg:` to the container query `@xl:` unconditionally, not only when `frameless`.
Impact: On the file page (where KnowledgeEditSection mounts the same Editor and panel), the version list and preview now lay out side by side whenever the panel is at least 36rem wide, not whenever the viewport is at least 1024px. A tablet-width file page (640–1023px viewport) draws two columns where it drew one, and a narrow desktop column draws one where it drew two. This changes the file page beyond the spec's statement that Editor 'gains the optional saveHandle prop and nothing else'.
Evidence: addons/knowledge/frontend/VersionHistoryPanel.tsx:248 adds `@container`; :267 `grid gap-4 @xl:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]` (was `lg:grid-cols-…`), with no `frameless` condition. The panel is rendered from Editor.tsx:1557 for every host, including the file page.
Repro: not_reproduced (read only). Mutation in thought: on the file page at a 900px viewport with the panel ~600px wide, the class `@xl:grid-cols-…` applies, where before `lg:` did not.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either declare VersionHistoryPanel.tsx (and its file-page layout change) in the touch points, or make the `@container`/`@xl:` switch apply only under `frameless`, keeping `lg:` for the file page.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: Editor.tsx, EditorToolbar.tsx and KnowledgeEditSection.tsx gain a second optional prop `frameless` (toolbar rule, toolbar inset, `.cm-content` left padding, version-panel rule), but the touch points say Editor gains `saveHandle` 'and nothing else' and do not list EditorToolbar.tsx at all.
Impact: A reader working from the touch points would not expect the shared toolbar and editor host classes to change. The default (`frameless` absent) keeps the file page's classes, so a user hits nothing unless F1's unconditional part applies.
Evidence: addons/knowledge/frontend/Editor.tsx:131,207,1453,1493,1562; EditorToolbar.tsx:236,246,283 (class now built from `frameless`); KnowledgeEditSection.tsx:46,54,104; used only from library/pane/NotePaneContainer.tsx:255.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add EditorToolbar.tsx, VersionHistoryPanel.tsx and the `frameless` prop to the touch points.

</details>

### claude-read:F3 — bucket B, LOW, open

Claim: The e2e component build gains a Vite resolve plugin that maps `gray-matter` and `@codemirror/*` imported from `addons/knowledge/` to `frontend/`'s packages, and `projects.ts` gains a DESKTOP_ONLY entry; neither file is in the touch points.
Impact: Build infrastructure for every component fixture changes. An addon file that resolves through this plugin can pass the fixture build while resolving differently from the production build. Only test tooling is affected.
Evidence: frontend/e2e-components/build-bundle.ts:23-38 (plugin `addon-packages-from-frontend`); frontend/e2e-components/projects.ts:44 (`**/notes-library-desktop.spec.ts`).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List build-bundle.ts and projects.ts among the e2e touch points.

</details>

### claude-read:F4 — bucket B, INFO, open

Claim: Knowledge test files beyond the declared list are changed: popup-dismissal.test.ts (FILE_COUNT 66→90) and VersionHistoryPanel.test.tsx (the preview assertion turned into a waitFor).
Impact: Weakening the VersionHistoryPanel preview assertion to `waitFor` hides a change in when the preview fills, in a file the spec does not plan to touch. The count bump is mechanical.
Evidence: addons/knowledge/frontend/__tests__/popup-dismissal.test.ts:53; addons/knowledge/frontend/__tests__/VersionHistoryPanel.test.tsx:324-336.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F5 — bucket B, INFO, open

Claim: New Knowledge modules sit outside the planned homes: the `notes/with-sources` and `notes/sources` clients and the listing clients are in new `notesapp/sourcesApi.ts` and `notesapp/listing.ts`, not in `api.ts`, and the route's models are in `routers/notes_sources.py`, not `app/schemas.py`.
Impact: No user effect. The touch points' `__tests__/api.test.ts` expectations for these clients have no counterpart in api.ts, so a reader following the plan looks in the wrong file.
Evidence: addons/knowledge/frontend/notesapp/sourcesApi.ts, notesapp/listing.ts (getNoteFolderCounts builds its own fetch); addons/knowledge/app/routers/notes_sources.py:37-57 (pydantic models).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run any test or build.
- claude-read: I did not check the truncated tail of the diff (backend test files beyond the cut, and any core inventory test edits).
- claude-read: I did not measure the file page's editor column width at real viewports.
- claude-read: I did not verify whether removed `knowledge.notes` message keys are still referenced by Clips (ClipShelf uses dynamic keys).
- claude-verify: I could not run git diff. I compared against the develop checkout at /Users/libre/Sources/video_share and assumed its working tree matches origin/develop.
- claude-verify: I ran no tests or builds.
- claude-verify: I did not measure the file page's version panel layout in a browser.
- claude-verify: I did not check whether VersionHistoryPanel's preview rendering changed in a way that explains the test's switch to waitFor.

TOTAL: 5 findings
