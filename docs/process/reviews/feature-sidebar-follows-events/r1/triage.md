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
- backend/app/routers/collections.py — full: Read lines 95-298, covering every changed hunk and its enclosing handler; the import hunk seen in the diff.; full: Read the whole file.
- backend/app/routers/drives.py — full: Read pin_folder and unpin_folder (1915-1969), the only changed functions; import hunk seen in the diff.; partial: Read lines 1900-1969 (list, pin and unpin handlers containing every changed hunk) plus the import hunk in the diff.
- backend/app/routers/internal.py — full: Read replace_file_tags_internal (160-199); import hunk seen in the diff.; partial: Read lines 150-209 (replace_file_tags_internal with its changed hunk) plus the import hunk in the diff.
- backend/app/services/ws.py — full: Read the whole file.
- frontend/src/components/Sidebar.tsx — full: Read lines 80-209 including both changed hunks and the enclosing SidebarNav body.; partial: Read the changed hunks (around lines 97-110 and 187-190) in the diff; not opened in full.
- frontend/src/components/sidebar/SidebarCollectionsSection.tsx — full: Read handleDrop (200-249) and the props/import hunks in the diff.; partial: Read lines 155-244 (menu items, drag handlers, handleDrop) and 415-464, plus the import and props hunks in the diff.
- frontend/src/components/sidebar/useCollectionManagement.ts — full: Read the whole file.
- frontend/src/components/sidebar/useDriveScopedReads.ts — full: Read the whole file.
- frontend/src/components/sidebar/useSidebarData.ts — full: Read the whole file.; full: The whole new file content is visible in the diff (48 lines).

Test files:
- backend/tests/test_sidebar_change_events.py — full: New file, read entirely in the diff.; full: New file; read in full in the diff.
- frontend/src/__tests__/uploadLock.test.tsx — partial: Diff hunk only (mock return shape).; partial: Read only the diff hunk (mock return shape).
- frontend/src/components/__tests__/SidebarActiveRow.test.tsx — partial: Diff hunk only (mock return shape).; partial: Read only the diff hunk.
- frontend/src/components/__tests__/SidebarAddonNav.test.tsx — partial: Diff hunk only (mock return shape).; partial: Read only the diff hunk.
- frontend/src/components/__tests__/SidebarAddonNavCatalogue.test.tsx — partial: Diff hunk only (mock return shape).; partial: Read only the diff hunk.
- frontend/src/components/__tests__/SmartFolderSidebar.test.tsx — partial: Diff hunk only (props).; partial: Read only the diff hunk.
- frontend/src/components/__tests__/driveSwitchBoundary.test.tsx — partial: Diff hunk only (mock return shape).; partial: Read only the diff hunk.
- frontend/src/components/__tests__/imeEnterGuard.test.tsx — partial: Diff hunk only (prop rename).; partial: Read only the diff hunk.
- frontend/src/components/__tests__/sidebarShellFixtureParity.test.tsx — partial: Diff hunk only (mock return shape).; partial: Read only the diff hunk.
- frontend/src/components/sidebar/__tests__/SidebarCollectionsSection.test.tsx — partial: Diff hunk only (defaultProps).; partial: Read only the diff hunk.
- frontend/src/components/sidebar/__tests__/SidebarItemReorder.test.tsx — partial: Diff hunks only (props and the drop test).; partial: Read only the two diff hunks.
- frontend/src/components/sidebar/__tests__/SmartCollectionDialogPortal.test.tsx — partial: Diff hunk only (mock return shape).; partial: Read only the diff hunk.
- frontend/src/components/sidebar/__tests__/sidebarFollowsEvents.test.tsx — full: New file, read entirely in the diff.; full: New file; read in full in the diff, and checked that the helper exports it imports exist.
- frontend/src/components/sidebar/__tests__/useCollectionManagement.test.ts — partial: Diff hunks only (setup, create/rename/delete, new I10 and I11 tests).; partial: Read only the diff hunks.
- frontend/src/components/sidebar/__tests__/useSidebarData.events.test.tsx — full: New file, read entirely in the diff.; full: New file; read in full in the diff.
- frontend/src/components/sidebar/__tests__/useSidebarData.summaryError.test.ts — partial: Diff hunks only (wrapper and rewritten refresh test).; partial: Read the diff hunks, which cover most of the file.
- frontend/src/components/sidebar/__tests__/useSidebarData.test.ts — full: Read the whole file.; partial: Diff hunk only (removed useWebSocket mock).

## Unspecified behavior, recorded

- claude-read: A rename that answers 404 closes the input silently with no toast even when the collection is still in the shown list (e.g. deleted in another tab before its event arrived), not only when it has already left the list.
  - F1 × I2 = 2, claude-read: Triggered by renaming a collection someone just deleted elsewhere; the user sees the input close and the row disappear after the re-read, with no error message.
  - F1 × I2 = 2, claude-verify: Renaming a collection that was deleted in another tab within the ~500 ms before its event arrives gets a 404 (useCollectionManagement.ts:173-175); the input closes silently and the re-read removes the row, which is the right end state.
- claude-read: After the sidebar's own collection write it re-reads collections immediately and then runs a full four-GET round about 500 ms later when its own broadcast arrives.
  - F5 × I1 = 5, claude-read: Every sidebar create/rename/delete/drop produces the immediate reloadCollections plus the round from drive.collections_changed; nothing visible, only extra requests.
  - F5 × I1 = 5, claude-verify: Every own collection write in the sidebar triggers an immediate collections re-read and then a four-GET round ~500 ms later from its own broadcast; the user sees nothing beyond extra LAN requests.
- claude-read: The no-drive branch sets tags and summary to null directly without telling the tracker, so returning to the same drive and folder with a failing tag read leaves tags null instead of an empty scoped value.
  - F0 × I1 = 0, claude-read: Needs a failed tags request right after returning to the same drive; SidebarTagsSection renders null and empty identically, so the user sees no difference.
  - F1 × I2 = 2, claude-verify: After leaving drive pages (setTags(null) at useDriveScopedReads.ts:229 without updating the tracker's shownScope) and returning to the same drive/folder, a failing tag read hits fail()'s shownScope===key early return (:82), so the Tags section stays in its null/loading state instead of empty; needs a failed read on a home LAN.
- claude-deep: Any 404 from a sidebar rename closes the input silently and re-reads the list, including when the collection is still listed (deleted in another tab before any round arrived) or when the 404 is the drive-not-found answer.
  - F1 × I2 = 2, claude-deep: A rename of a collection that another tab or MCP just deleted closes with no message; the row then disappears after the re-read, so the user sees no explanation, but nothing is lost.
  - F1 × I2 = 2, claude-verify: A sidebar rename that 404s (collection deleted elsewhere just before, or drive gone) closes the input with no toast and re-reads; the row disappears, so the user sees a correct but unexplained close.
- claude-deep: A watched event matched just before a drive switch, whose onMatch runs in a queued microtask, can start a gathering, and then a round, for the newly shown drive.
  - F1 × I1 = 1, claude-deep: An event for the previous drive that arrives during a drive switch causes one extra set of four GETs for the new drive; nothing visible changes.
  - F0 × I1 = 0, claude-verify: An event matched in the same tick as a drive switch runs onMatch in a microtask (useWebSocketRefresh.ts:67-70) after driveRef updated, starting a round for the new drive; this needs precise timing and only causes a harmless extra read of the current drive.
- claude-deep: When currentDrive becomes null, tags and summary are set to null directly without updating the tracked list's shown scope, so a later failed tags read for the same drive leaves tags null instead of an empty scoped list.
  - F1 × I1 = 1, claude-deep: SidebarTagsSection renders null and empty items the same way (return null at SidebarTagsSection.tsx:85), so the user sees no difference.
  - F1 × I2 = 2, claude-verify: Same as claude-read index 2: returning to the same drive after the no-drive state with a failing tag read leaves tags null (loading state) instead of an empty scoped list.

## Findings

A: 0
B: 2
C: 0

### claude-deep:SCOPE-1 — bucket B, LOW, open

Claim: The diff adds a new product module, frontend/src/components/sidebar/useDriveScopedReads.ts, that the touch-point list does not name; it holds the subscription, the gathering timers, the per-list sequence and reloadCollections, which the touch-point list places in useSidebarData.ts.
Impact: No user impact. The behaviour the spec assigns to useSidebarData.ts lives in an unlisted file, and the ScopedTags type moved there (useSidebarData.ts still re-exports it). A reviewer or a later change that checks only the listed files would miss where the sequence and failure rules are enforced.
Evidence: frontend/src/components/sidebar/useDriveScopedReads.ts:1-250 is a new file (createTrackedList at :57, startGathering at :192, useWebSocketRefresh at :235, reloadCollections at :237). frontend/src/components/sidebar/useSidebarData.ts:14-15 imports useDriveScopedReads and re-exports ScopedTags, and :41-45 delegates everything except drives and auth. The spec's touch points list only useSidebarData.ts, useCollectionManagement.ts, SidebarCollectionsSection.tsx and Sidebar.tsx under frontend/src/components.
Repro: Compare the file list of the diff with the Touch points section of docs/specs/sidebar-follows-events.md: useDriveScopedReads.ts is the only product path in the diff that the list does not name.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add useDriveScopedReads.ts to the touch-point list in the invariants revision, or record that the hook was extracted from useSidebarData.ts.

</details>

### claude-read:F1 — bucket B, LOW, open

Claim: The diff adds a new product file, frontend/src/components/sidebar/useDriveScopedReads.ts, which the declared touch-point list does not name; the list places the subscription, gathering, per-list sequence, failure behaviour and reloadCollections in useSidebarData.ts, but they live in this new file.
Impact: No user-visible effect. A reviewer or later spec that reads the touch-point list to find where the sidebar's sequence rule and WebSocket gathering live is pointed at useSidebarData.ts, which now only delegates; related-spec lookups keyed on touch-point paths will not find this file.
Evidence: frontend/src/components/sidebar/useDriveScopedReads.ts:1-250 (new file: WATCHED_EVENTS at :20, createTrackedList at :57, gathering timers at :175-205, useWebSocketRefresh at :235, reloadCollections at :237); frontend/src/components/sidebar/useSidebarData.ts:41-45 only calls useDriveScopedReads. Touch points list only useSidebarData.ts, useCollectionManagement.ts, SidebarCollectionsSection.tsx, Sidebar.tsx and useWebSocketRefresh.ts on the frontend product side.
Repro: Compare the files in the diff against the `## Touch points` section of docs/specs/sidebar-follows-events.md: every other product and test path is listed (tests via §7 and 'new tests under frontend/src/components/sidebar/__tests__/'), docs and rules paths are listed, INDEX.md and the spec are implicit; useDriveScopedReads.ts is the only unlisted path.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add frontend/src/components/sidebar/useDriveScopedReads.ts to the touch-point list (as the home of the subscription, gathering, sequence and reloadCollections), or record it as a revision in invariants.md.

</details>

## Not verified

- claude-deep: I did not run any test (frontend or backend). Pass/fail is not observed.
- claude-deep: I did not check that the conftest `client` fixture yields the 4-tuple the backend test unpacks.
- claude-deep: I did not check other callers that write pins or collections outside the listed routers (for example home on_home toggles), or whether the sidebar shows anything they change.
- claude-deep: I did not read the sidebarHarness helper's fetch routing beyond its exported names.
- claude-deep: I did not inspect submodules; the diff shows none touched.
- claude-read: Did not run any backend or frontend tests; behaviour judged by reading only.
- claude-read: Did not verify that WebSocketContext's default value lets useSidebarData.test.ts render without a provider after its useWebSocket mock was removed.
- claude-read: Did not read the test helper modules sidebarHarness and nameInUse used by sidebarFollowsEvents.test.tsx.
- claude-read: Did not read the whole of the modified test files, only their diff hunks.
- claude-verify: Backend broadcast code (collections.py, drives.py, internal.py, ws.py) and its tests were not read.
- claude-verify: Docs changes (websocket-events.md, ADDON-DEVELOPMENT.md, known-issues.md, design-decisions.md) were not checked.
- claude-verify: SidebarCollectionsSection.tsx and Sidebar.tsx were not read.
- claude-verify: No code was run; behaviors were reasoned from source only.

TOTAL: 2 findings
