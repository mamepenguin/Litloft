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
- open finding claude-read:CR-6 is bucket A or BLOCKER
- open finding claude-read:CR-7 is bucket A or BLOCKER
- open finding claude-read:CR-8 is bucket A or BLOCKER
- open finding claude-deep:F1 is bucket A or BLOCKER
- open finding claude-deep:F2 is bucket A or BLOCKER
- open finding claude-deep:F3 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/knowledge/.github/workflows/ci.yml — partial: Diff hunks only (node-version lines).; partial: Only the two changed hunks (node-version) in the supplied diff.
- addons/knowledge/frontend/Editor.tsx — partial: Diff hunk around completeUpload only.; partial: The changed hunk in the upload handler, from the diff.
- addons/knowledge/frontend/messages/en.json — partial: Diff hunk only.; partial: The changed hunk from the diff.
- addons/knowledge/frontend/messages/ja.json — partial: Diff hunk only.; partial: The changed hunk from the diff.
- backend/app/main.py — partial: Diff hunks in _run_purge_batch and imports.; partial: The _run_purge_batch hunk from the diff.
- backend/app/routers/drives.py — partial: Diff hunks in create_text_file and imports.; partial: The create_text_file hunk from the diff.
- backend/app/routers/files.py — partial: All changed hunks from the diff, including the new subtitle endpoints, which appear whole. I grepped copy_file callers.; partial: Diff hunks: _batch_error, _detect_file_subtitles, batch move/rename/copy, get_subtitle, the new subtitle endpoints, rename/move/copy endpoints.
- backend/app/routers/uploads.py — full: Read the whole file.; partial: The init_upload hunk from the diff, plus a grep of its call into the service.
- backend/app/schemas.py — partial: Diff hunks only.; partial: The changed hunks from the diff.
- backend/app/services/fileops.py — partial: Diff hunks plus lines 320-349 and 476-525 read from the file.; partial: The changed hunks from the diff. I read lines 1160-1240 (_validate_no_duplicates) in full and 146-168 (_ensure_empty_folder_tracked).
- backend/app/services/scanner.py — partial: Diff hunks only.; partial: The two changed hunks from the diff.
- backend/app/services/subtitle.py — partial: Diff hunks, which cover nearly the whole rewritten module except convert_srt_to_vtt.; partial: Nearly the whole new module appears in the diff, but the convert_srt_to_vtt tail is unchanged and was not read.
- backend/app/services/upload.py — partial: Diff hunks in init_upload, _finish_subtitle_upload and complete_upload.; partial: The changed hunks in init_upload, _finish_subtitle_upload and complete_upload, from the diff.
- frontend/e2e-components/fixtures/app.tsx — partial: Diff hunks only.; partial: The two-line hunk from the diff.
- frontend/e2e-components/fixtures/subtitlesSection.tsx — full: New file, shown whole in the diff.; full: New file, whole content in diff.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Diff hunk only.; partial: The one-line hunk from the diff.
- frontend/e2e-components/subtitles-section-touch.spec.ts — full: New file, shown whole in the diff.; full: New file, whole content in diff.
- frontend/src/components/BatchRenameDialog.tsx — partial: Diff hunks in imports and handleSubmit.; partial: The changed hunks (imports, the submit callback) from the diff.
- frontend/src/components/ClipboardProvider.tsx — partial: Diff hunks in paste.; partial: The paste callback hunks from the diff, plus a grep of lines 140-150.
- frontend/src/components/ConfirmDialog.tsx — partial: Diff hunks only.; partial: The changed hunks from the diff.
- frontend/src/components/FileActions.tsx — partial: Diff hunks: handleRename, handleMove, RenameDialog props.; partial: The changed hunks (handleRename, handleMove, RenameDialog props) from the diff.
- frontend/src/components/FileContextMenu.tsx — partial: Diff hunks: handleRename, handleMove, RenameDialog.; partial: The changed hunks from the diff.
- frontend/src/components/FileDetail/FileDetailContainer.tsx — partial: Diff hunks only.; partial: The changed hunks from the diff.
- frontend/src/components/FileDetail/FileDetailPresenter.tsx — partial: Diff hunks only.; partial: The changed hunks from the diff.
- frontend/src/components/FileDetail/ShellLayout.tsx — partial: Diff hunks plus lines 725-754.; partial: The changed hunks from the diff.
- frontend/src/components/FileDetail/SubtitlesSection.tsx — full: New file, shown whole in the diff.; full: New file, whole content in diff.
- frontend/src/components/FileDetail/hooks/useFileDetailData.ts — partial: Diff hunks plus lines 155-194.; partial: The diff hunks, plus lines 160-189 (the rename callback) read in full.
- frontend/src/components/RefusalText.tsx — full: New file, shown whole in the diff.; full: New file, whole content in diff.
- frontend/src/components/RenameDialog.tsx — partial: Diff hunks only.; partial: The changed hunks from the diff.
- frontend/src/components/SelectionBar.tsx — partial: Diff hunks in handleBatchMove.; partial: The handleBatchMove hunk and the imports, from the diff.
- frontend/src/components/UploadProgress.tsx — partial: Diff hunks only.; partial: The changed hunks from the diff.
- frontend/src/components/VideoPlayer.tsx — partial: Diff hunks for the track rendering.; partial: The track rendering hunk and the imports, from the diff.
- frontend/src/components/player/hooks/useCaptionTrackSelection.ts — full: New file, shown whole in the diff.; full: New file, whole content in diff.
- frontend/src/components/quick-note/QuickNoteContainer.tsx — partial: Diff hunks only.; partial: The changed hunks from the diff.
- frontend/src/hooks/useCreateFile.ts — partial: Diff hunks only.; partial: The changed hunks from the diff.
- frontend/src/hooks/useDragAndDrop.ts — partial: Diff hunks in the drop handler.; partial: The diff hunks, plus lines 190-234 (the drop handler) read in full.
- frontend/src/hooks/useInlineRename.ts — partial: Diff hunks: describeFailure and commit.; partial: The changed hunks (describeFailure, commit) from the diff.
- frontend/src/hooks/useShellCaptions.ts — partial: Diff hunks only.; partial: The changed hunks from the diff.
- frontend/src/hooks/useUpload.ts — partial: Diff hunks only.; partial: The changed hunks from the diff.
- frontend/src/lib/api.ts — partial: Diff hunks plus lines 15-69 (fetchJSON and fetchJSONStatus).; partial: The diff hunks, plus lines 21-27 (fetchJSON) and 717-771 (initUpload, completeUpload).
- frontend/src/lib/apiError.ts — partial: Diff hunk only.; partial: The constructor hunk from the diff.
- frontend/src/lib/subtitleErrors.ts — full: New file, shown whole in the diff.; full: New file, whole content in diff.
- frontend/src/messages-core/en.json — partial: Diff hunk (subtitles namespace).; partial: The added subtitles block from the diff.
- frontend/src/messages-core/ja.json — partial: Diff hunk (subtitles namespace).; partial: The added subtitles block from the diff.
- frontend/src/types/index.ts — partial: Diff hunks only.; partial: The changed hunks from the diff.
- mcp-server/src/tools/batch.ts — partial: Diff hunks (descriptions) only.; partial: The two description hunks from the diff.

Test files:
- addons/knowledge/frontend/__tests__/Editor.dnd.test.tsx — partial: Diff hunks only.; partial: The changed hunks from the diff.
- backend/tests/subtitle_sidecar_helpers.py — full: New file in diff.; full: New file, shown whole in the diff.
- backend/tests/test_copy.py — partial: Diff hunks only.; partial: The changed assertion hunks from the diff.
- backend/tests/test_listing_call_inventory.py — partial: Diff hunk only.; partial: The inventory hunk from the diff.
- backend/tests/test_sidecar_subtitles_follow_video.py — partial: Diff hunks only.; partial: The diff hunks, plus a grep of lines 110-246 (non-video and batch rename tests).
- backend/tests/test_subtitle_rows.py — full: New file in diff.; full: New file, shown whole in the diff.
- backend/tests/test_subtitle_sidecars_api.py — full: New file in diff.; full: New file, shown whole in the diff.
- backend/tests/test_subtitle_sidecars_listing.py — full: New file in diff.; full: New file, shown whole in the diff.
- backend/tests/test_subtitle_sidecars_ops.py — full: New file in diff.; full: New file, shown whole in the diff.
- frontend/src/__tests__/row-action-reveal.test.ts — partial: Diff hunk only.; partial: The changed hunk from the diff.
- frontend/src/components/FileDetail/__tests__/SubtitlesSection.states.test.tsx — full: New file in diff.; full: New file, shown whole in the diff.
- frontend/src/components/FileDetail/__tests__/SubtitlesSection.test.tsx — full: New file in diff.; full: New file, shown whole in the diff.
- frontend/src/components/__tests__/BatchRenameDialog.subtitleConflict.test.tsx — full: New file in diff.; full: New file, shown whole in the diff.
- frontend/src/components/__tests__/ClipboardProvider.subtitleMove.test.tsx — full: New file in diff.; full: New file, shown whole in the diff.
- frontend/src/components/__tests__/ConfirmDialog.subtitleDelete.test.tsx — full: New file in diff.; full: New file, shown whole in the diff.
- frontend/src/components/__tests__/RenameDialog.subtitleError.test.tsx — full: New file in diff.; full: New file, shown whole in the diff.
- frontend/src/components/__tests__/SelectionBar.subtitleMove.test.tsx — full: New file in diff.; full: New file, shown whole in the diff.
- frontend/src/components/__tests__/VideoPlayer.subtitleTracks.test.tsx — full: New file in diff.; full: New file, shown whole in the diff.
- frontend/src/components/__tests__/VideoPlayerShell.test.tsx — partial: Diff hunks only.; partial: The changed hunks from the diff.
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: Diff hunk only.; partial: The changed hunk from the diff.
- frontend/src/hooks/__tests__/useInlineRename.subtitleConflict.test.ts — full: New file in diff.; full: New file, shown whole in the diff.
- frontend/src/hooks/__tests__/useShellCaptions.test.tsx — partial: Diff hunks only.; partial: The changed hunks from the diff.
- frontend/src/lib/__tests__/api.subtitles.test.ts — full: New file in diff.; full: New file, shown whole in the diff.
- frontend/src/lib/__tests__/subtitleErrors.test.ts — full: New file in diff.; full: New file, shown whole in the diff.

## Needs a human

### unspecified_behavior

Note: A rename, move or copy of a video with no sidecars of its own is never checked for owner change, while an upload of the same name is refused.; Every GET /api/files/{id} for a video or .loft now queries all rows of its folder and lists the folder on disk to compute ownership.
- claude-read: A rename, move or copy of a video with no sidecars of its own is never checked for owner change, while an upload of the same name is refused.
  - F1 × I8 = 8, claude-read: Renaming a video onto another video's language-suffixed stem silently moves that track to the renamed video.
  - F1 × I7 = 7, claude-verify: Renaming, moving or copying a sidecar-less video onto a longer stem such as movie.ja.mp4 silently moves another video's track to it, and the original video loses that subtitle with no message.
- claude-read: Every GET /api/files/{id} for a video or .loft now queries all rows of its folder and lists the folder on disk to compute ownership.
  - F8 × I1 = 8, claude-read: Each detail load in a large folder is slightly slower; nothing visible changes.
  - F8 × I2 = 16, claude-verify: Every video detail open queries the folder's rows and lists the folder, which at most adds a little latency in very large folders.

### unspecified_behavior

Note: Batch rename treats any renamed row, including images and documents, as an owner candidate and carries the same-stem video's sidecars with it.
- claude-deep: Batch rename treats any renamed row, including images and documents, as an owner candidate and carries the same-stem video's sidecars with it.
  - F3 × I8 = 24, claude-deep: Batch-renaming a poster or thumbnail image that shares a stem with a video silently moves the video's subtitle to the image's new name.
  - F2 × I7 = 14, claude-verify: Batch-renaming a folder where a poster image shares the video's stem can carry the video's subtitles to the image's new name, and the video silently loses its tracks.

## Unspecified behavior, recorded

- claude-read: A replace whose picked file differs from the stored sidecar only in extension case (stored movie.ja.SRT, picked .srt) builds a different name. On a case-insensitive mount it finds that name taken by the file itself and answers 409 subtitle_language_taken.
  - F1 × I3 = 3, claude-read: An upper-case extension written on the host plus the macOS bind mount: the viewer is told to use Replace while already using it.
  - F1 × I3 = 3, claude-verify: On a case-insensitive mount, replacing a sidecar stored as .SRT with a picked .srt can answer 409 subtitle_language_taken, and the user has to delete the track and add it again.
- claude-read: The knowledge addon's CI now runs on Node 24 instead of 20 as part of the subtitle gitlink bump.
  - F0 × I2 = 0, claude-read: A CI change outside the feature; users do not see it.
  - F0 × I1 = 0, claude-verify: Only the addon's CI runner changes Node version, and the user never sees it in use.
- claude-deep: The file page's title rename shows nothing when the backend refuses for a subtitle reason.
  - F2 × I5 = 10, claude-deep: A rename from the video page whose sidecar name is taken just doesn't happen, with no message.
  - F1 × I3 = 3, claude-verify: Typing a .srt or .vtt name into a markdown page's title closes the field as if it saved, but nothing changed and no message is shown.
- claude-deep: A paste refused only for subtitle reasons shows two error toasts for the same files.
  - F1 × I2 = 2, claude-deep: Cut and paste onto a folder with a clashing subtitle shows both the generic 'could not paste' toast and the 'stayed because of a subtitle' toast.
  - F1 × I2 = 2, claude-verify: A paste whose only failures are subtitle refusals shows a generic failure toast and a subtitle toast for the same files.
- claude-deep: _ensure_empty_folder_tracked after a subtitle upload tracks only the immediate folder, not intermediate parents created by a nested relative_path.
  - F1 × I3 = 3, claude-deep: Uploading a folder tree that contains only subtitles may leave intermediate folders out of their parent's listing until a scan; not verified against the folder listing code.
  - F1 × I3 = 3, claude-verify: A folder upload whose nested folders hold only subtitles may leave an intermediate folder unlisted until the next scan, though the folder listing might derive it from the deeper tracked path.

## Findings

A: 6
B: 10
C: 0

### claude-deep:F1 — bucket A, HIGH, open

Claim: Batch rename plans sidecar carries for every renamed row without checking that the row serves subtitles, so a non-video row that shares a stem with a video carries the video's sidecars away.
Impact: A user batch-renames a selection that includes a poster image `movie.jpg` beside `movie.mp4` and `movie.srt`. The video's `movie.srt` is silently moved to `<new stem>.srt`, so `movie.mp4` loses its subtitle track and the image's new name now holds it. The request answers 200 with empty sidecar_errors.
Evidence: backend/app/services/fileops.py:1214-1234: `own = sim.own(old_stem)` runs for every file in rename_plan with no `_serves_subtitles(file)` guard. `_sidecar_carry_plan` (fileops.py:488) and `copy_file` (fileops.py:327) both have the guard. The removed `_carry_batch_sidecars` went through `_carry_sidecars`, which returned early for non-serving rows. In the walk-through, `counts[old_stem] -= 1` also takes the video's stem count to 0, so `plan_sidecar_carry` sees owners==1, chooses mode 'move', and finds the target owned by the new stem, so no conflict is raised.
Repro: not_reproduced (read only). Walk-through: rows movie.mp4 (video) and movie.jpg (image) in folder a, file a/movie.srt. PUT /api/files/batch/rename with ids=[jpg] and template 'photo_{n}'. The sim's stem_counts are {movie:1}, sim.own('movie') returns [movie.srt], dest_stems is ['photo_1'], and the carry moves movie.srt to photo_1.srt. No test covers it: test_non_video_keeps_same_stem_srt covers only the single rename and has no video beside the file.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> In _validate_no_duplicates, skip the sidecar planning (continue after the held update) when `not _serves_subtitles(file)`. Add a batch-rename test with movie.jpg beside movie.mp4 and movie.srt.

</details>

### claude-read:CR-6 — bucket A, HIGH, open

Claim: A rename, move or copy of a subtitle-serving row that has no own sidecars skips the owner-change check. A sidecar-less video renamed or moved onto a longer stem silently takes another video's sidecar.
Impact: Example: renaming clip.mp4 to movie.ja.mp4 in a folder holding movie.mp4 and movie.ja.srt answers 200. movie.mp4 silently loses its Japanese track, and movie.ja.mp4 now plays it as its default track. The same happens when a sidecar-less movie.ja.mp4 is moved, or copied, into such a folder. Upload init refuses the same arrival.
Evidence: In backend/app/services/fileops.py:493-495 `_sidecar_carry_plan` returns `[]` when `own` is empty, before plan_sidecar_carry runs its dest_index.all() owner-change loop. In fileops.py:1216-1218 batch rename does `if not own: continue`, which also skips sim.apply, so later steps see stale stems. In fileops.py:333-342 copy_file uses the sidecar-aware candidate check only when `own` is non-empty. By contrast, upload.py init_upload calls arrival_owner_changes unconditionally. No test covers a sidecar-less mover.
Repro: Reasoned from the code, not run: seed movie.mp4 and clip.mp4 in folder a, and write a/movie.ja.srt. Run PUT /api/files/{clip}/rename with {new_filename:'movie.ja.mp4'}. The rename answers 200. GET /api/files/{movie} lists no 'ja' track, and GET /api/files/{clip} lists movie.ja.srt as the bare track. I2 requires a 409 subtitle_owner_change.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> In _sidecar_carry_plan, _validate_no_duplicates and copy_file, run the destination owner-change check (as in arrival_owner_changes or the dest_index.all() loop) even when `own` is empty. In batch rename, also update the simulated stems for such steps.

</details>

### claude-deep:F2 — bucket A, MEDIUM, open

Claim: The file page's title rename swallows every failure in a console.error, so a subtitle refusal (409 subtitle_name_taken / subtitle_owner_change, 400 subtitle_extension_reserved) from that entry point shows nothing.
Impact: Renaming a video from its own page to a name whose sidecar is taken does nothing visible. The title stays as it was, and the user gets no message or names.
Evidence: frontend/src/components/FileDetail/hooks/useFileDetailData.ts:185-187: `catch (err) { console.error("Failed to rename file:", err); }`. There is no subtitleFailure call and nothing is rethrown to the caller. Spec 185.8 lists 'the file page's title rename' as a rename entry point.
Repro: not_reproduced. Read only: the catch path has no UI side effect.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Map the caught error through subtitleFailure(err, te) and toast or rethrow it, so the title editor can show the message.

</details>

### claude-deep:F3 — bucket A, LOW, open

Claim: Drag-and-drop of several files ignores the batch move's sidecar_errors, so a failed carry is never shown at that entry point.
Impact: When a carry fails on disk during a multi-file drag-and-drop move, the user sees no 'some subtitles could not be moved' notice. A video can end up without its subtitles, and nothing names the files.
Evidence: frontend/src/hooks/useDragAndDrop.ts:214-221: the `ids.length > 1` branch reads only `answer.errors`. The single-file branch (209-213), SelectionBar and ClipboardProvider all read sidecar_errors.
Repro: not_reproduced. Read only: answer.sidecar_errors is never referenced in the batch branch.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> After the skipped toast, add `const carried = answer.sidecar_errors ?? []; if (carried.length) toast.error(sidecarErrorMessage(ts, carried));`

</details>

### claude-read:CR-7 — bucket A, LOW, open

Claim: A drag-and-drop of several files ignores the batch move's `sidecar_errors`, so a failed sidecar carry is never shown at this entry point.
Impact: When a carry fails on an I/O error during a multi-file drag move, the subtitle is left behind and no notice appears. The single-file drag path and the selection bar do show it.
Evidence: frontend/src/hooks/useDragAndDrop.ts, in the `ids.length > 1` branch: `const answer = await batchMove(ids, targetPath)` reads only `answer.errors` for moveSkipped. It never calls sidecarErrorMessage on `answer.sidecar_errors`, while SelectionBar.tsx and ClipboardProvider.tsx do.
Repro: not_reproduced (needs an I/O failure during a carry)
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Toast sidecarErrorMessage(ts, answer.sidecar_errors) in the multi-file drop branch.

</details>

### claude-read:CR-8 — bucket A, LOW, open

Claim: The file page's title rename (MarkdownDocumentLayout via useFileDetailData.rename) swallows every failure, including the 400 subtitle_extension_reserved, so no message appears.
Impact: Renaming a note to x.srt from its page title shows nothing. The title edit appears to succeed, and the name reverts on reload.
Evidence: In frontend/src/components/FileDetail/hooks/useFileDetailData.ts:185-187 the catch only runs `console.error`, and the function never rethrows. 185.8 lists 'the file page's title rename' as an entry point. onRename is wired only to MarkdownDocumentLayout (ShellLayout.tsx:741).
Repro: not_reproduced
Introduced: pre-existing
Reviewer bucket: A | Author bucket: 

### claude-deep:F4 — bucket B, LOW, open

Claim: The knowledge submodule bump brings a CI change (actions/setup-node node-version 20 to 24, in two jobs) that no touch point or spec item names.
Impact: The addon's CI now runs on a different Node major. Users are not affected directly, but the change ships inside a subtitle feature without review of its own, and a pnpm/engine mismatch would show up as an unrelated CI failure.
Evidence: addons/knowledge/.github/workflows/ci.yml hunks at lines 144-147 and 240-243 (`node-version: 20` to `24`), included in gitlink 244d875b..7a94f8d7. The touch points name only Editor.tsx and messages/{ja,en}.json in the knowledge repository.
Repro: Diff inspection of the submodule range.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either list it as a touch point with its reason, or land the Node bump in the knowledge repository as its own change and bump the gitlink separately.

</details>

### claude-deep:F7 — bucket B, LOW, open

Claim: A paste whose only failures are subtitle refusals shows both the generic 'N could not be pasted' toast and the subtitle 'N stayed put' toast, counting the same files twice.
Impact: The user sees two error toasts for one refused file. This is confusing but not wrong.
Evidence: frontend/src/components/ClipboardProvider.tsx:169-177: pasteFailed counts all `result.errors`, then moveSkipped counts the subtitle subset again. Spec 185.8 says the subtitle notice sits beside the existing notice 'when other files failed for other reasons'.
Repro: not_reproduced. The test ClipboardProvider.subtitleMove only asserts that the subtitle message is contained.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Count pasteFailed over the non-subtitle errors only.

</details>

### claude-read:CR-2 — bucket B, LOW, open

Claim: The knowledge gitlink bump also changes addons/knowledge/.github/workflows/ci.yml, raising the CI Node version from 20 to 24. This change is unrelated to subtitles and is not a declared touch point.
Impact: The knowledge addon's CI toolchain changes as a side effect of the subtitle feature, so a CI break would be attributed to the wrong change.
Evidence: In the addons/knowledge diff, ci.yml has `node-version: 20` changed to `node-version: 24` twice (two jobs). The touch points name only Editor.tsx and messages/{ja,en}.json in the addon.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-deep:F5 — bucket B, INFO, open

Claim: The browser player's caption default and mode handling were rewritten through a new hook, useCaptionTrackSelection.ts, which the touch points do not name and which affects every video, with or without the Subtitles list.
Impact: Every video playback now has a new `default` selection (the chosen key instead of index 0) and an effect that rewrites TextTrack modes. A regression there would change caption behaviour on every video, outside the sidecar feature.
Evidence: frontend/src/components/player/hooks/useCaptionTrackSelection.ts (new file) and frontend/src/components/VideoPlayer.tsx (track `default={key === captionTrackKey}`). The touch points list only 'the player's track URLs and keys: VideoPlayer.tsx and the shell player's caption hook'.
Repro: Diff inspection.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-deep:F6 — bucket B, INFO, open

Claim: Several other product files the diff reaches are not in the touch-point list: backend/app/routers/uploads.py, frontend/src/components/UploadProgress.tsx, frontend/src/components/RefusalText.tsx (new), frontend/src/lib/apiError.ts, frontend/src/lib/subtitleErrors.ts (new), frontend/e2e-components/fixtures/app.tsx and subtitlesSection.tsx, frontend/e2e-components/spec-viewport.spec.ts, and mcp-server/src/tools/batch.ts (only 'MCP tool docs' is listed, but the tool description strings in code changed).
Impact: Readers of the touch-point list would not know that the upload router now opens a DB session for init, that the upload drawer's error rendering changed, or that the MCP tool descriptions shown to agents changed.
Evidence: See the diff for each file. backend/app/routers/uploads.py:33 adds a `db` dependency. UploadProgress.tsx renders errorCode via subtitleErrorMessage. mcp-server/src/tools/batch.ts changes the move_files and copy_files descriptions.
Repro: Set difference between the product file list and the touch points.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-deep:F8 — bucket B, INFO, open

Claim: copy_file runs the planned sidecar copies only when the caller passes a sidecar_errors list, so a caller that omits the argument silently copies no sidecars.
Impact: None today: both callers in backend/app pass a list. A future internal caller would quietly lose I4.
Evidence: backend/app/services/fileops.py (copy_file tail): `if sidecar_errors is not None and sidecar_carries: sidecar_errors.extend(move_sidecar_subtitles(sidecar_carries))`. rename_file and move_file run the carry unconditionally.
Repro: grep for copy_file callers: only routers/files.py:587 and :1701, and both pass a list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Run move_sidecar_subtitles unconditionally and extend the list only when it is given, as rename_file does.

</details>

### claude-read:CR-1 — bucket B, INFO, open

Claim: The diff changes backend/app/routers/uploads.py, which is not in the touch-point list: the init route now injects a DB session and passes it to upload_service.init_upload.
Impact: No user impact. The owner-change refusal at upload init depends on this router change, and the planned touch points do not show it.
Evidence: backend/app/routers/uploads.py:33 adds `db: Annotated[Session, Depends(get_db)]` and line 38 passes `db=db`. The touch points name only backend/app/services/upload.py. upload.py:init_upload runs `arrival_owner_changes` only when `db is not None`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:CR-3 — bucket B, INFO, open

Claim: Several frontend modules the diff creates or changes are not in the touch-point list: frontend/src/components/UploadProgress.tsx (the upload drawer's rendering), frontend/src/lib/apiError.ts (ApiStatusError gains code and names), and the new modules frontend/src/lib/subtitleErrors.ts, frontend/src/components/RefusalText.tsx and frontend/src/components/player/hooks/useCaptionTrackSelection.ts.
Impact: No user impact by itself. The browser player's track selection (useCaptionTrackSelection) and the shared ApiStatusError constructor are reached without being planned, and other callers of ApiStatusError are affected.
Evidence: The diff touches UploadProgress.tsx (it renders `upload.errorCode` through subtitleErrorMessage) and apiError.ts (two new optional constructor parameters). It also creates subtitleErrors.ts, RefusalText.tsx and useCaptionTrackSelection.ts. None of them is named among the frontend touch points, which list only useUpload.ts / fetchUploadJSON, api.ts, VideoPlayer.tsx and the shell caption hook.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:CR-4 — bucket B, INFO, open

Claim: mcp-server/src/tools/batch.ts (MCP tool description strings in server code) is changed. The touch points name only 'MCP tool docs'.
Impact: No user impact. An MCP client's model sees new tool descriptions.
Evidence: In mcp-server/src/tools/batch.ts, the descriptions of move_files and copy_files are edited.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:CR-5 — bucket B, INFO, open

Claim: The diff adds component e2e infrastructure that is not a declared touch point: a new arrangement registered in frontend/e2e-components/fixtures/app.tsx, frontend/e2e-components/fixtures/subtitlesSection.tsx, and an entry in the phone-width list of spec-viewport.spec.ts.
Impact: None for users. The shared fixture registry and the viewport inventory change.
Evidence: fixtures/app.tsx adds `"subtitles-section-phone": SubtitlesSectionPhoneArrangement`, and spec-viewport.spec.ts adds `subtitles-section-touch.spec.ts`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: Nothing was executed: no backend or frontend tests and no mutation runs.
- claude-deep: The full contents of the knowledge submodule range 244d875b..7a94f8d7 beyond the hunks shown, and whether it was merged in the knowledge repository first.
- claude-deep: Whether the folder listing derives intermediate parent folders from EmptyFolder rows (relevant to the I13 nested-path case).
- claude-deep: The batch purge router path and purge_missing_file were not read; I relied on the tests that exercise them.
- claude-deep: Thread safety of emit_sync when called from _finish_subtitle_upload in a worker thread.
- claude-deep: Whether the file page title editor component surfaces errors in some other way than through useFileDetailData.rename.
- claude-read: Did not run any test, backend or frontend.
- claude-read: Did not read the full enclosing functions of most modified product files; I relied on the diff hunks.
- claude-read: Did not verify resolve_on_disk behavior for a destination folder that does not exist yet when computing FolderSidecars.load for a cross-folder move.
- claude-read: Did not check the batch purge and purge-endpoint code paths in files.py beyond the diff.
- claude-read: Did not inspect the knowledge Editor.tsx outside its hunk.
- claude-verify: The previous node-version value in addons/knowledge ci.yml (no git access).
- claude-verify: Which of the out-of-touch-point frontend files are new versus modified relative to origin/develop.
- claude-verify: useCaptionTrackSelection behavior for videos without sidecars.
- claude-verify: Whether the folder listing derives intermediate folders from a nested EmptyFolder path (deep index 3).
- claude-verify: The case-insensitive replace behavior (read index 0) in the subtitle replace endpoint.

TOTAL: 16 findings
