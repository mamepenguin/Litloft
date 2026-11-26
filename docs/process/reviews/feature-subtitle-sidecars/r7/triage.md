# Triage: r7

## Trajectory

This run:
- claude-deep: One fix round (r6 to now). The backend fixes mostly removed special cases rather than adding them. They dropped the `if not own` early return in _sidecar_carry_plan and the `if own` / `if sidecar_errors is not None` conditions in copy_file. In batch rename, `if not own: continue` was replaced by the same `_serves_subtitles` guard that rename, move and copy already use, which aligns the paths instead of predicting new states. The frontend fixes added the same per-entry-point branch (map the refusal to a toast, read sidecar_errors) at two more call sites, and adjusted a count in a third. That is the pattern r6 found missing, and it shows the error mapping is duplicated across about ten call sites rather than centralised. It is not a new branch layered on the previous round's branch, so I do not read this as the design being patched.
- claude-read: The backend fix round (8bb46fd) removed branches rather than adding them. It deleted the `if not own: return []` early exit in _sidecar_carry_plan and the `if not own: continue` in batch rename, and replaced the `if own:` gate in copy_file and the conditional carry with one `_serves_subtitles` guard plus an unconditional carry. The planning path is converging on a single rule. The frontend rounds (06e85cf, 93fe247) do add branches, and they are the same branches the original change already added at other entry points: a subtitleFailure toast in a catch, a sidecar_errors toast after batchMove, and a split of the subtitle count from the generic count. The per-entry-point notice handling is being patched site by site, not centralised, so the next missed entry point would need the same patch again. Only one earlier review (r6) exists, so this is the first round of fixes.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/knowledge/.github/workflows/ci.yml — partial: Changed hunks only (node-version lines), from the diff.; partial: Diff hunks only (node-version lines).
- addons/knowledge/frontend/Editor.tsx — partial: Changed hunk around completeUpload, from the diff.; partial: Diff hunk around completeUpload only.
- addons/knowledge/frontend/messages/en.json — partial: Changed hunk from the diff.; partial: Diff hunk only.
- addons/knowledge/frontend/messages/ja.json — partial: Changed hunk from the diff.; partial: Diff hunk only.
- backend/app/main.py — partial: Diff hunk in _run_purge_batch and imports.; partial: _run_purge_batch hunk and imports from the diff.
- backend/app/routers/drives.py — partial: Diff hunk in create_text_file.; partial: create_text_file hunk from the diff.
- backend/app/routers/files.py — partial: All changed hunks from the diff, including the new subtitle endpoints, which are shown whole.; partial: All diff hunks, including the new subtitle endpoints shown whole.
- backend/app/routers/uploads.py — partial: Diff hunk in init_upload.; partial: init_upload hunk from the diff.
- backend/app/schemas.py — partial: Changed hunks from the diff.; partial: Diff hunks only.
- backend/app/services/fileops.py — partial: All diff hunks and the r6 fix diff. Grepped the _serves_subtitles/own/_carry_sidecars lines (325-1217) and read _ensure_empty_folder_tracked (146-168).; partial: Lines 220-696 read from the file (copy_file, _sidecar_carry_plan, rename_file, move_file in full), plus the diff hunks for purge and batch rename.
- backend/app/services/scanner.py — partial: Diff hunks only.; partial: The two changed hunks from the diff.
- backend/app/services/subtitle.py — partial: Diff hunks, covering the whole rewritten module except convert_srt_to_vtt.; partial: The whole rewritten module as shown in the diff, except the unchanged convert_srt_to_vtt.
- backend/app/services/upload.py — partial: Changed hunks in init_upload, _finish_subtitle_upload and complete_upload, from the diff.; partial: Diff hunks in init_upload, _finish_subtitle_upload and complete_upload.
- frontend/e2e-components/fixtures/app.tsx — partial: Diff hunks only.; partial: Two-line hunk from the diff.
- frontend/e2e-components/fixtures/subtitlesSection.tsx — full: New file shown whole in the diff.; full: New file, whole content in diff.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Diff hunk only.; partial: One-line hunk from the diff.
- frontend/e2e-components/subtitles-section-touch.spec.ts — full: New file shown whole in the diff.; full: New file, whole content in diff.
- frontend/src/components/BatchRenameDialog.tsx — partial: Changed hunks (imports, submit callback) from the diff.; partial: Diff hunks in imports and submit.
- frontend/src/components/ClipboardProvider.tsx — partial: Diff hunks in paste, including the r6 fix.; partial: Paste callback hunks from the diff and the r6 fix diff.
- frontend/src/components/ConfirmDialog.tsx — partial: Changed hunks from the diff.; partial: Diff hunks only.
- frontend/src/components/FileActions.tsx — partial: Changed hunks (handleRename, handleMove, RenameDialog props) from the diff.; partial: Diff hunks: handleRename, handleMove, RenameDialog props.
- frontend/src/components/FileContextMenu.tsx — partial: Changed hunks from the diff.; partial: Diff hunks only.
- frontend/src/components/FileDetail/FileDetailContainer.tsx — partial: Changed hunks from the diff.; partial: Diff hunks only.
- frontend/src/components/FileDetail/FileDetailPresenter.tsx — partial: Changed hunks from the diff.; partial: Diff hunks only.
- frontend/src/components/FileDetail/ShellLayout.tsx — partial: Changed hunks from the diff.; partial: Diff hunks only.
- frontend/src/components/FileDetail/SubtitlesSection.tsx — full: New file shown whole in the diff.; full: New file, whole content in diff.
- frontend/src/components/FileDetail/hooks/useFileDetailData.ts — partial: Diff hunks plus lines 160-194 (the rename callback) read from the file.; partial: Rename callback hunks from the diff and the r6 fix diff.
- frontend/src/components/RefusalText.tsx — full: New file shown whole in the diff.; full: New file, whole content in diff.
- frontend/src/components/RenameDialog.tsx — partial: Changed hunks from the diff.; partial: Diff hunks only.
- frontend/src/components/SelectionBar.tsx — partial: Diff hunks in handleBatchMove.; partial: handleBatchMove hunk and imports from the diff.
- frontend/src/components/UploadProgress.tsx — partial: Changed hunks from the diff.; partial: Diff hunks only.
- frontend/src/components/VideoPlayer.tsx — partial: Diff hunks for track rendering.; partial: Track rendering hunk and imports from the diff.
- frontend/src/components/player/hooks/useCaptionTrackSelection.ts — full: New file shown whole in the diff.; full: New file, whole content in diff.
- frontend/src/components/quick-note/QuickNoteContainer.tsx — partial: Changed hunks from the diff.; partial: Diff hunks only.
- frontend/src/hooks/useCreateFile.ts — partial: Changed hunks from the diff.; partial: Diff hunks only.
- frontend/src/hooks/useDragAndDrop.ts — partial: Diff hunks in the drop handler, including the r6 fix.; partial: Drop handler hunks from the diff and the r6 fix diff.
- frontend/src/hooks/useInlineRename.ts — partial: Changed hunks (describeFailure, commit) from the diff.; partial: Diff hunks: describeFailure and commit.
- frontend/src/hooks/useShellCaptions.ts — partial: Changed hunks from the diff.; partial: Diff hunks only.
- frontend/src/hooks/useUpload.ts — partial: Changed hunks from the diff.; partial: Diff hunks only.
- frontend/src/lib/api.ts — partial: Changed hunks from the diff, and a grep of copyFile/batchCopy callers.; partial: Diff hunks, plus a grep for copyFile and batchCopy callers.
- frontend/src/lib/apiError.ts — partial: Constructor hunk from the diff.; partial: Diff hunk only.
- frontend/src/lib/subtitleErrors.ts — full: New file shown whole in the diff.; full: New file, whole content in diff.
- frontend/src/messages-core/en.json — partial: Added subtitles block from the diff.; partial: Diff hunk (subtitles namespace).
- frontend/src/messages-core/ja.json — partial: Added subtitles block from the diff.; partial: Diff hunk (subtitles namespace).
- frontend/src/types/index.ts — partial: Changed hunks from the diff.; partial: Diff hunks only.
- mcp-server/src/tools/batch.ts — partial: Diff hunks (descriptions) only.; partial: The two description hunks from the diff.

Test files:
- addons/knowledge/frontend/__tests__/Editor.dnd.test.tsx — partial: Changed hunks from the diff.; partial: Diff hunks only.
- backend/tests/subtitle_sidecar_helpers.py — full: New file in diff.; full: New file shown whole in the diff.
- backend/tests/test_copy.py — partial: Changed hunks from the diff.; partial: Diff hunks only.
- backend/tests/test_listing_call_inventory.py — partial: Diff hunk only.; partial: Inventory hunk from the diff.
- backend/tests/test_sidecar_subtitles_follow_video.py — partial: Changed hunks from the diff.; partial: Diff hunks only.
- backend/tests/test_subtitle_rows.py — full: New file in diff.; full: New file shown whole in the diff.
- backend/tests/test_subtitle_sidecars_api.py — full: New file in diff.; full: New file shown whole in the diff.
- backend/tests/test_subtitle_sidecars_listing.py — full: New file in diff.; full: New file shown whole in the diff.
- backend/tests/test_subtitle_sidecars_ops.py — full: New file in diff, including the r6 fix additions.; full: New file shown whole in the diff, including the r6 fix additions.
- frontend/src/__tests__/row-action-reveal.test.ts — partial: Changed hunk from the diff.; partial: Diff hunk only.
- frontend/src/components/FileDetail/__tests__/SubtitlesSection.states.test.tsx — full: New file in diff.; full: New file shown whole in the diff.
- frontend/src/components/FileDetail/__tests__/SubtitlesSection.test.tsx — full: New file in diff.; full: New file shown whole in the diff.
- frontend/src/components/FileDetail/__tests__/useFileDetailData.renameFailure.test.tsx — full: New file in diff.; full: New file shown whole in the diff.
- frontend/src/components/__tests__/BatchRenameDialog.subtitleConflict.test.tsx — full: New file in diff.; full: New file shown whole in the diff.
- frontend/src/components/__tests__/ClipboardProvider.subtitleMove.test.tsx — full: New file in diff.; full: New file shown whole in the diff.
- frontend/src/components/__tests__/ConfirmDialog.subtitleDelete.test.tsx — full: New file in diff.; full: New file shown whole in the diff.
- frontend/src/components/__tests__/RenameDialog.subtitleError.test.tsx — full: New file in diff.; full: New file shown whole in the diff.
- frontend/src/components/__tests__/SelectionBar.subtitleMove.test.tsx — full: New file in diff.; full: New file shown whole in the diff.
- frontend/src/components/__tests__/VideoPlayer.subtitleTracks.test.tsx — full: New file in diff.; full: New file shown whole in the diff.
- frontend/src/components/__tests__/VideoPlayerShell.test.tsx — partial: Changed hunks from the diff.; partial: Diff hunks only.
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: Changed hunk from the diff.; partial: Diff hunk only.
- frontend/src/hooks/__tests__/useDragAndDrop.subtitle.test.ts — full: New file in diff.; full: New file shown whole in the diff.
- frontend/src/hooks/__tests__/useInlineRename.subtitleConflict.test.ts — full: New file in diff.; full: New file shown whole in the diff.
- frontend/src/hooks/__tests__/useShellCaptions.test.tsx — partial: Changed hunks from the diff.; partial: Diff hunks only.
- frontend/src/lib/__tests__/api.subtitles.test.ts — full: New file in diff.; full: New file shown whole in the diff.
- frontend/src/lib/__tests__/subtitleErrors.test.ts — full: New file in diff.; full: New file shown whole in the diff.

## Unspecified behavior, recorded

- claude-read: Every rename, move and copy of a video or .loft now lists the destination folder and queries its rows, even when the video has no sidecars.
  - F5 × I1 = 5, claude-read: Moving videos between large folders adds a directory listing and a folder query per file, and nothing visible changes.
  - F5 × I1 = 5, claude-verify: Every rename, move or copy of a video or .loft now does an extra directory listing and row query. On a home LAN this costs a few milliseconds that the user does not notice.
- claude-deep: A subtitle upload into a nested relative_path tracks only the deepest folder as an EmptyFolder. Intermediate folders that hold nothing else are not tracked.
  - F1 × I3 = 3, claude-deep: Dropping a folder tree that holds only subtitles in subfolders may leave an intermediate folder unlisted until a scan, unless the listing derives parents from deeper tracked paths.
  - F1 × I2 = 2, claude-verify: An upload of subtitles only, into a new nested relative_path, tracks only the deepest folder as an EmptyFolder (_ensure_empty_folder_tracked, fileops.py:146). An intermediate folder may stay unlisted until a scan if the listing does not derive ancestors.
- claude-deep: A refused title rename on a file page closes the title field showing the old name, and the explanation appears only as a toast.
  - F1 × I2 = 2, claude-deep: Typing a .srt name into a note's title shows a toast while the field closes as if it had saved.
  - F1 × I2 = 2, claude-verify: Renaming a note from its page title to a subtitle extension is refused. The field closes showing the old name, and the explanation appears only in a toast, not inline at the field.
- claude-deep: Every video rename or move now lists the source folder and the destination folder on disk and queries their rows, even when the video has no sidecars.
  - F5 × I1 = 5, claude-deep: Renaming or moving a video in a large folder is slightly slower, with no visible change.
  - F5 × I1 = 5, claude-verify: Every video rename or move lists the source and destination folders on disk and queries their rows. The cost is small and the user does not notice it.

## Findings

A: 0
B: 3
C: 0

### claude-deep:D1 — bucket B, LOW, open

Claim: The knowledge gitlink bump still carries the unrelated CI change (actions/setup-node node-version 20 to 24, in two jobs). No touch point names it, and the r6 fix round did not address it.
Impact: Users are not affected. The addon's CI toolchain changes inside a subtitle feature, so a CI break there would be attributed to this change.
Evidence: addons/knowledge/.github/workflows/ci.yml hunks at lines 144-147 and 240-243 in the gitlink range 244d875b..7a94f8d7. The touch points list only Editor.tsx and messages/{ja,en}.json for the knowledge repository.
Repro: Diff inspection of the submodule range.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Land the Node bump as its own knowledge change, or name it as a touch point.

</details>

### claude-read:CR7-1 — bucket B, LOW, open

Claim: The file page's title rename now toasts a subtitle refusal, but it still resolves rather than rejects. The title editor therefore closes as though the rename succeeded, and the old name only comes back on reload.
Impact: A user who types `note.srt` as a markdown page's title sees the translated toast, but the field closes showing the typed text, so whether the rename happened is unclear until the page reloads. I11's message requirement is met. The UI state reads wrong.
Evidence: In frontend/src/components/FileDetail/hooks/useFileDetailData.ts:187-191 the catch toasts subtitleFailure(err, te) and console.errors, but it never rethrows. The r6 verifier recorded that EditableTitle closes the field unless onRename rejects. I did not re-open that component.
Repro: not_reproduced
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Rethrow after toasting, so the title editor stays open on a refusal.

</details>

### claude-deep:D2 — bucket B, INFO, open

Claim: The file page's title rename now toasts a subtitle refusal but still resolves the promise. EditableTitle therefore closes the field as if the rename had succeeded, and a non-subtitle failure is still silent.
Impact: After a refused title rename the field closes showing the old name, and only the toast explains why. A generic failure, such as a plain 409, shows nothing. This is pre-existing behaviour.
Evidence: frontend/src/components/FileDetail/hooks/useFileDetailData.ts, rename catch: `const subtitle = subtitleFailure(err, te); if (subtitle) toast.error(subtitle); console.error(...)`. There is no rethrow. r6 verify noted that EditableTitle.tsx:65-70 shows its error only on rejection.
Repro: not_reproduced. Read only.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: No tests were executed. All findings come from reading the code.
- claude-deep: Whether frontend/src/test/setup.ts's enMessages includes the messages-core subtitles namespace, which the two new English-asserting tests require.
- claude-deep: EditableTitle's behaviour when rename resolves after a toast. This relies on the r6 verifier's reading.
- claude-deep: Whether the folder listing derives intermediate folders from a nested EmptyFolder path.
- claude-deep: The knowledge submodule range beyond the shown hunks, and whether it was merged in the knowledge repository first.
- claude-deep: plan_sidecar_carry behaviour on a case-only rename on a case-insensitive mount.
- claude-read: I ran no tests, backend or frontend.
- claude-read: I did not re-open EditableTitle (or its current path) to confirm it closes on a resolved onRename. I relied on the r6 verifier's note.
- claude-read: I did not trace diskpath._walk to confirm that a non-strict resolve on a missing destination folder never raises.
- claude-read: I did not confirm that the useDragAndDrop test's English expectation resolves through a global next-intl test setup.
- claude-read: I did not read the knowledge submodule outside its hunks.
- claude-verify: The previous node-version value in addons/knowledge ci.yml: I had no git access and saw only the current value 24.
- claude-verify: Whether the folder listing derives intermediate ancestors from EmptyFolder paths, which decides whether the nested-folder behavior is visible.
- claude-verify: I did not trace how ApiStatusError is constructed from rename responses beyond subtitleFailure.

TOTAL: 3 findings
