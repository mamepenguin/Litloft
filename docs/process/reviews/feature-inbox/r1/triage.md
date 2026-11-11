# Triage: r1

## Warnings

- R-5 ran at cc526349741e9afb5ffc67fe59dfe237e4f61a35, and these files changed since: .claude/rules/internal-api-policy.md, backend/app/database.py, backend/app/routers/internal.py, backend/app/services/fileops.py, docs/ADDON-DEVELOPMENT.md and 4 more; run R-5 again if any of them changes what a user sees

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
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: An upload without inbox_source over a trashed file's path now overwrites the trashed bytes and purges the trashed row, instead of returning 409 (F1).; FileDetailFullScreen.handleAfterDelete sends the user back to the inbox after a delete from a nav=inbox detail (frontend/src/components/FileDetailFullScreen.tsx:139-144). The spec only defines close.; The detail toast's Undo calls undoInboxDone without awaiting it and without error handling (InboxDetailActions.tsx:46), so a failed undo from the detail is silent.
- claude-deep: Uploading over a trashed file's path now succeeds for every caller of the upload route and destroys the trashed copy.
- claude-deep: Closing the right-pane file under nav=inbox discards all other query parameters.
- claude-read: An upload without inbox_source over a trashed file's path now overwrites the trashed bytes and purges the trashed row, instead of returning 409 (F1).
- claude-read: FileDetailFullScreen.handleAfterDelete sends the user back to the inbox after a delete from a nav=inbox detail (frontend/src/components/FileDetailFullScreen.tsx:139-144). The spec only defines close.
- claude-read: The detail toast's Undo calls undoInboxDone without awaiting it and without error handling (InboxDetailActions.tsx:46), so a failed undo from the detail is silent.
- claude-verify: An upload to a path held by a trashed file now succeeds for every upload, with or without inbox_source. It overwrites the trashed content on disk and deletes the trashed row.

### unspecified_behavior

Note: An upload to a path held by a trashed file now succeeds for every upload, with or without inbox_source. It overwrites the trashed content on disk and deletes the trashed row.
- claude-deep: Uploading over a trashed file's path now succeeds for every caller of the upload route and destroys the trashed copy.
- claude-deep: Closing the right-pane file under nav=inbox discards all other query parameters.
- claude-read: An upload without inbox_source over a trashed file's path now overwrites the trashed bytes and purges the trashed row, instead of returning 409 (F1).
- claude-read: FileDetailFullScreen.handleAfterDelete sends the user back to the inbox after a delete from a nav=inbox detail (frontend/src/components/FileDetailFullScreen.tsx:139-144). The spec only defines close.
- claude-read: The detail toast's Undo calls undoInboxDone without awaiting it and without error handling (InboxDetailActions.tsx:46), so a failed undo from the detail is silent.
- claude-verify: An upload to a path held by a trashed file now succeeds for every upload, with or without inbox_source. It overwrites the trashed content on disk and deletes the trashed row.

### unspecified_behavior

Note: Uploading over a trashed file's path now succeeds for every caller of the upload route and destroys the trashed copy.; Closing the right-pane file under nav=inbox discards all other query parameters.
- claude-deep: Uploading over a trashed file's path now succeeds for every caller of the upload route and destroys the trashed copy.
- claude-deep: Closing the right-pane file under nav=inbox discards all other query parameters.
- claude-read: An upload without inbox_source over a trashed file's path now overwrites the trashed bytes and purges the trashed row, instead of returning 409 (F1).
- claude-read: FileDetailFullScreen.handleAfterDelete sends the user back to the inbox after a delete from a nav=inbox detail (frontend/src/components/FileDetailFullScreen.tsx:139-144). The spec only defines close.
- claude-read: The detail toast's Undo calls undoInboxDone without awaiting it and without error handling (InboxDetailActions.tsx:46), so a failed undo from the detail is silent.
- claude-verify: An upload to a path held by a trashed file now succeeds for every upload, with or without inbox_source. It overwrites the trashed content on disk and deletes the trashed row.

## Findings

A: 0
B: 10
C: 0

### claude-deep:SCOPE-1 — bucket B, HIGH, open

Claim: `init_upload` now accepts an upload to a path whose on-disk file belongs to a trashed row, a change to the init conflict check that is outside the declared touch points (upload.py is listed only for the session field and the arrival in `complete_upload`), and it applies to every upload, with or without `inbox_source`.
Impact: In normal use, a user who trashes `report.pdf` and later uploads a different `report.pdf` to the same folder no longer gets a 409. `replacing_file` renames the new bytes over the trashed file, and `complete_upload` deletes the trashed row. The trashed version vanishes from Trash with no purge and no confirmation, although the trash otherwise keeps a file for 30 days and only a manual purge is irreversible. If `complete_upload` then fails after the rename (for example a commit error), the rollback keeps the trashed row but its path now holds the new bytes, so a restore brings back the wrong content. The spec's failure list still says 'Upload to a path that already holds a file: 409 at init as today'.
Evidence: backend/app/services/upload.py:126-138 `_has_trashed_ghost`; upload.py:167-171 skips the 409 when a trashed row owns the path; upload.py:275 `replacing_file(target_full)` overwrites the on-disk file before the try; upload.py:336-345 `db.delete(existing)` for the trashed row. backend/app/routers/uploads.py:32,44-45 add a `db` dependency to init only to feed this check. The comment at upload.py:312-315 still says init's FS check guaranteed no live physical file at the path. backend/tests/test_inbox_arrival.py `test_trashed_ghost_is_replaced_and_gets_a_new_row` asserts the new behavior, but no test covers an upload without `inbox_source`, the lost trashed content, or a failure after the rename.
Repro: Read only: create `note.md`, DELETE /api/files/{id} (the file stays on disk), then init+chunk+complete an upload of `note.md` with no `inbox_source`. Before this change init answered 409. Now it answers 200, the old row is gone and GET /api/drives/{drive}/trash no longer lists it. Not executed.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Restore the unconditional 409 at init when the target exists on disk, and drop the `db` parameter from init. Alternatively, a person adds this behavior to the spec and touch points explicitly, with a test for an upload without `inbox_source` and for a failure after the rename.

</details>

### claude-read:F1 — bucket B, MEDIUM, open

Claim: init_upload no longer answers 409 when the target path holds a trashed file on disk, for every upload whether or not it carries inbox_source; this behaviour change is outside the touch points, which name only the session field and the arrival in complete_upload for upload.py.
Impact: A user who trashes `report.pdf` and later uploads a new `report.pdf` to the same folder now has the trashed bytes overwritten in place by replacing_file and the trashed row purged in complete_upload. The trashed version disappears from Trash with no prompt, well before the 30-day purge, and cannot be restored. Before this change the same upload got a 409 at init. The spec's own failure list says 'Upload to a path that already holds a file: 409 at init as today', and its 'Checked, no action' list says re-uploading over a file on disk is already a 409.
Evidence: backend/app/services/upload.py:126-138 adds _has_trashed_ghost. backend/app/services/upload.py:167-171 skips the 409 when a trashed row owns the path. backend/app/routers/uploads.py:32 adds a db dependency so the check runs on every HTTP init. complete_upload then writes over the path at upload.py:275 (replacing_file(target_full)) and deletes the ghost row at upload.py:336-345. The comment at upload.py:312-315 still says init guarantees no live physical file is at the path. backend/tests/test_inbox_arrival.py::test_trashed_ghost_is_replaced_and_gets_a_new_row exercises the new path only with inbox_source set. No test covers an upload without inbox_source over a trashed path, and backend/tests/test_upload.py has no trash case.
Repro: Create note.md, DELETE /api/files/{id} (soft delete: the file stays on disk), then POST /api/drives/{drive}/upload/init for note.md without inbox_source. Before the change: 409. After: 200, and complete overwrites the on-disk bytes and removes the trashed row. Traced by reading the code, not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either drop the _has_trashed_ghost bypass and keep the 409 at init, or add it to the spec and touch points as a deliberate change, with a test for an upload without inbox_source over a trashed path and a decision on whether the trashed content may be destroyed.

</details>

### claude-deep:SCOPE-2 — bucket B, LOW, open

Claim: `frontend/src/hooks/useSelectedFile.ts` is changed but is not in the touch-point list: with `nav=inbox`, `clearFile` now replaces the URL with `/drive/{drive}?view=inbox`.
Impact: Closing a file in the right pane (the in-page `?file=` selection) under `nav=inbox` drops every other search parameter and navigates away. A pathname that is not `/drive/{name}` gives the wrong base, because `pathname.split('/').slice(0,3)` hard-codes the prefix shape.
Evidence: frontend/src/hooks/useSelectedFile.ts:58-61; covered by frontend/src/hooks/__tests__/useSelectedFile.inboxClose.test.tsx.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `frontend/src/hooks/useSelectedFile.ts` to the touch points.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: The detail's inbox controls are mounted from shared detail chrome files that are not in the touch-point list: FileDetail/FileDetailChrome.tsx, FileDetail/ShellLayout.tsx, FileDetailShell.tsx and markdown/MarkdownDocumentLayout.tsx.
Impact: Every detail host (2-pane, full screen, Markdown, HTML preview, canvas viewers) now renders InboxDetailActions, and ShellLayout hides the image-only FileNavControls when nav=inbox. A regression in the gate (nav=inbox, a host provider and a nav state) would show 済み or duplicate arrows on ordinary file pages. Reviewers working from the touch-point list would not look at these files.
Evidence: frontend/src/components/FileDetail/FileDetailChrome.tsx:10,135 imports and renders InboxDetailActions whenever fileId is set. frontend/src/components/FileDetail/ShellLayout.tsx:128,388 adds `!inboxWalk` to the image FileNavControls condition. FileDetailShell.tsx:169-170 and MarkdownDocumentLayout.tsx:113-114 now pass fileId to the chrome. The gate is at frontend/src/components/inbox/InboxDetailActions.tsx:31.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F4 — bucket B, LOW, open

Claim: The existing C2 upload drawer was refactored: its stage label and icon were extracted into a new frontend/src/components/ProcessingStageMark.tsx, and frontend/src/components/UploadProgress.tsx now imports them. Neither file is in the touch-point list.
Impact: The upload drawer is an existing feature, and the spec says the drawer is unchanged. Any difference between the extracted rule and the drawer's old inline rendering (the label fallback to stage.key, or the stopped/Minus icon) would change what users see in the drawer, and no touch point flags the drawer for review.
Evidence: frontend/src/components/ProcessingStageMark.tsx:1-31 (new). frontend/src/components/UploadProgress.tsx:16-19,56-57. frontend/src/components/inbox/InboxRow.tsx:12 is the second consumer.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-deep:SCOPE-3 — bucket B, INFO, open

Claim: `frontend/src/components/FileDetail/FileDetailChrome.tsx` is changed but is not in the touch-point list: it renders `InboxDetailActions` in every file detail's chrome whenever `fileId` is set.
Impact: Every file detail header now mounts the inbox action component. Whether it renders nothing outside `nav=inbox` depends on `InboxDetailActions` gating itself, which the touch list never routes a reviewer to.
Evidence: frontend/src/components/FileDetail/FileDetailChrome.tsx:10,135.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the file to the touch points.

</details>

### claude-deep:SCOPE-4 — bucket B, INFO, open

Claim: `frontend/src/components/FileDetail/ShellLayout.tsx` is changed but is not in the touch-point list: it hides the image viewer's `FileNavControls` when `nav=inbox`.
Impact: For images opened from the inbox, the shell's own prev/next overlay is suppressed, so navigation depends on `InboxDetailActions` alone. This changes a shared layout that the list never names.
Evidence: frontend/src/components/FileDetail/ShellLayout.tsx:127-128,386-388.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the file to the touch points.

</details>

### claude-deep:SCOPE-5 — bucket B, INFO, open

Claim: New modules outside the listed locations: `frontend/src/lib/inboxGrouping.ts`, `frontend/src/lib/inboxStage.ts` (holds the I18 stage logic) and `frontend/src/components/sidebar/useInboxCount.ts` (holds the I12 count fetch and refetch).
Impact: A reviewer following the touch list to check I12 and I18 would not open the files where that logic lives.
Evidence: frontend/src/lib/inboxStage.ts:1; frontend/src/lib/inboxGrouping.ts:1; frontend/src/components/sidebar/useInboxCount.ts:3-6.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the three files to the touch points.

</details>

### claude-read:F3 — bucket B, INFO, open

Claim: Returning to the inbox when the 2-pane detail closes is implemented in frontend/src/hooks/useSelectedFile.ts, which is not in the touch-point list.
Impact: clearFile is the generic close path for every 2-pane detail. With nav=inbox it now replaces the URL with `/drive/{drive}?view=inbox` (the drive is taken from the first two path segments) wherever the detail is open. A user who keeps nav=inbox while on a folder route is sent to the inbox rather than back to the folder.
Evidence: frontend/src/hooks/useSelectedFile.ts:58-61
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F5 — bucket B, INFO, open

Claim: New production modules outside the listed paths carry inbox logic: frontend/src/lib/inboxGrouping.ts, frontend/src/lib/inboxStage.ts (the I18 stage rule) and frontend/src/components/sidebar/useInboxCount.ts (the I12 count fetch).
Impact: The logic behind I12 and I18 lives in files the touch points do not name. The list names only SidebarLibrarySection.tsx and components/inbox/, so a reviewer following the list would miss them.
Evidence: docs/process/reviews/feature-inbox/r1/classification.json lists these three files among the touched zones; the touch-point list has no entry for them.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: The full diff beyond the 200000-byte truncation; I inferred the changed frontend files from repository grep for 'inbox', so files changed without that word (for example useWebSocketRefresh, ToastProvider, the upload drawer) may be missed.
- claude-deep: Whether useWebSocketRefresh.ts or the upload drawer components were modified.
- claude-deep: I did not run any test or command.
- claude-deep: The knowledge submodule diff between the two gitlink SHAs.
- claude-read: The truncated part of the diff (frontend and MCP hunks) was not read; the file list comes from docs/process/reviews/feature-inbox/r1/classification.json.
- claude-read: Did not compare UploadProgress.tsx with its pre-change version.
- claude-read: Did not check whether MCP upload_file goes through /upload/init and so also gets the trashed-path bypass.
- claude-read: Did not open the knowledge addon submodule changes.
- claude-read: Ran no tests.
- claude-verify: Whether the init_upload trashed-ghost bypass is new in this change: I could not run git diff against origin/develop. I inferred it is new from the stale comment and the new db dependency.
- claude-verify: I did not inspect the knowledge addon, the MCP server or the e2e-layout tests.
- claude-verify: I did not check runtime behavior or run tests.

TOTAL: 10 findings
