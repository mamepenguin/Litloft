# Triage: r4

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks
- R-5 ran at 012a6fa849071068a49d93af5e66926b2b67c1e5, and these files changed since: docs/developer-guide/known-issues.md; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-deep: Mostly no: the last round removed more state than it added, and the design stopped being patched on the strand that r2 and r3 flagged. c37fb760a added a copy-or-move branch, sibling claims, a longest-first order and a per-step name replay. 1deeba6a0 removed all four and added a new state, the subtitle's own row, with `_follow_sidecar_row` and its taken-path branch. 6b7dfd7ea then added a second branch for that state in the scanner. That was the repeating pattern: each round taught one more consumer about rows that uploads created and the scanner denied. bd49bc092 removes that state at its source: `_follow_sidecar_row`, the moved-pairs return value, the scanner's keep-and-recover branch and the tests for them all go, and uploads stop creating rows. It adds a different kind of thing: a subtitle branch in `complete_upload`, a one-time row drop in the scanner that runs on every scan, and a second response shape handled by an `isinstance` in the route and a union in the frontend client. None of these repeats a branch or prediction from the earlier rounds. The new shape does have consumers still to handle: the knowledge editor's dead link is recorded but not fixed, and the route skips `scan.complete`. The per-sidecar `target.exists()` prediction from r1 remains, and its known failures are now recorded as limits rather than patched. The remaining commits since r3 are merges, submodule pins and ledger corrections with no new branch in this feature.
- claude-read: Partly yes, and this round is mostly a removal. Earlier rounds added per-sidecar predictions (r2: copy-or-move, sibling claims, longest-first order, a replayed name state), which 1deeba6a0 removed, and then a new state, the subtitle's own row, with `_follow_sidecar_row` and a scanner branch that kept such rows alive. bd49bc092 removes that state: `_follow_sidecar_row`, the scanner's keep-and-recover branch, the moved-pairs return value and the per-row commit are all gone, and r2's still-open question, whether an upload should register a subtitle at all, is answered no. That is the first round to remove the source of the branches rather than add another one, and it closes all the r3 row findings. It does add branches of its own: a subtitle branch in `complete_upload`, a transitional row-drop block at the top of the scan, a union response with an isinstance check in the route, and a union return type in the frontend. The scanner therefore gains a subtitle-specific branch for the second round running, though with the opposite effect and with cleanup as its only job. The upload branch's early return is what skips `scan.complete`, and the rows are closed at upload but not at rename or create, so the remaining findings are at the edge of this one decision and not repeats of the earlier prediction pattern. The design is no longer being patched on the row strand. Sidecar placement itself is still one pass of per-sidecar `target.exists()` checks, with its known limits moved to the ledger and not redesigned. The other commits in the range are develop merges and submodule pins that do not touch this design.

Earlier runs:
- r1 / claude-read: First review. With no touch-point list declared, the place the change should reach and does not is `fileops.batch_rename`; every other video rename or move path reaches the new sidecar step.
- r2 / claude-deep: Only c37fb760a changes code; ff3771cf5 and c5fcadfab record reviews and R-5. Compared with the first round, it added and removed nothing symmetrically: it removed no branch or state and added a copy-versus-move branch beside the earlier exists-then-skip branch, a claim state (`sibling_stems`, active or not), a per-step prediction of which name each batch row holds (`position`, `old_names`, `later`) and a global ordering rule. So yes, the round repeats the pattern of the one before, adding per-sidecar decisions on name matching rather than planning all source and target pairs at once. The design is being patched. Each addition fixed its reported case and has a counter-case at its edge: the copy branch leaves an orphan when the last claimant finds the target taken, the ordering handles only growing stems, and the plan-order premise fails on mixed extensions.
- r2 / claude-read: Yes, the design is being patched. ff3771cf5 and c5fcadfab are records only and change no code, so c37fb760a is the single code round since r1. The first implementation predicted disk state one sidecar at a time with `target.exists()`. c37fb760a adds more predictions of the same kind on top of it: a fixed longest-first order that predicts which names free up, a sibling list with a new copy-or-move branch, and in the batch path a `later` state that replays the name each row holds at each step. No branch, state or prediction was removed. Each new prediction covers the input it was written for and misses a neighbouring one: the reverse language-suffix rename, a batch target freed by a later row, and a same-stem pair acted on together. All three come from choosing per sidecar without first planning the final set of names.
- r3 / claude-deep: Read in order, and leaving out the tag and relation commits that arrive through the merge from develop: yes for one strand, no for the other. c37fb760a (reviewed in r2) added a copy-or-move branch, sibling claims, a longest-first order and a per-step name replay. 1deeba6a0 removed all four, so that strand of per-sidecar prediction shrank; the sort's removal returned one rename shape to listing-order dependence, which known-issues.md records. The same commit added a new state, the subtitle's own row, with a `taken` branch, and 6b7dfd7ea added a second branch for that state in the scanner. Each of the last two code rounds therefore adds a branch for the fact that uploads create rows for subtitles while the scanner says it never does, and this review finds a third place that needs one, EmptyFolder tracking. On that strand the design is being patched: r2 asked whether uploads should register subtitles at all, and that question is still undecided. The rows are being taught place by place to behave like files.
- r3 / claude-read: The earlier rounds added predictions, and this range removed them. c37fb760a had added a copy-or-move branch, a sibling claim state, a position-based `later` state and a longest-first ordering; 1deeba6a0 deletes all four, together with their tests in e5ea1ef91, and the outcomes they guarded are recorded in known-issues.md instead. That part is a real simplification. But the same range then adds branches of a new kind for one new state, a subtitle that has a File row: 1deeba6a0 adds `_follow_sidecar_row` with its row-missing and target-taken branches, and 6b7dfd7ea adds a subtitle-row branch to the scanner, because the third R-5 run found rows flagged missing. So two consecutive rounds each special-cased that state at one consumer, and the two new findings are further consumers not yet handled: empty-folder tracking in `move_file` and the batch move loop. For this state the design is being patched. The question r2 raised, whether an upload should register a subtitle row at all, was answered by keeping the row, which leaves each path that assumes subtitles have no row to be corrected in turn. The other tag-related commits in the range belong to merged develop work and do not touch this design.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: A trashed subtitle row left by an earlier version stays in Trash while its file keeps serving the video as a track. Purging it, by hand or through the trash purge loop, deletes that file and the video loses the track (decisions.md:58 observed this by hand). The dialog says only that the file will be deleted.; Restoring such a trashed row gives a card back until the next scan, which then removes the row without notice.; Dropping a subtitle row emits no `files.purged`. Intelligence catches up through the orphan purge in reconcile (indexer.py:477-484) because the scan emits `scan.complete`, but the row removed at upload.py:183 waits for the next reconcile, and knowledge rows naming the id are cleaned only by `files.purged` (addons/knowledge/app/routers/webhooks.py).; A folder containing only uploaded subtitles is listed as empty, while its directory and files stay on disk. `delete_folder` (fileops.py:918-944) does not touch the disk and removes the EmptyFolder row, so a later scan lists the folder again. The non-row subtitle files stay invisible throughout.; Skipping `scan.complete` also skips the `drive.structure_changed` WebSocket event that it maps to (event_hooks.py:150, :164). A detail page already open during a subtitle upload may therefore not refresh its track list. decisions.md:55 notes this case was not exercised.
- claude-deep: A note link of the form `loft://<id>` to a previously uploaded subtitle row, which the editor used to create correctly, dangles silently once the startup scan drops that row.
- claude-deep: A trashed subtitle row still deletes the real file on purge, including the automatic retention purge at backend/app/main.py:135-152, although that file is still served as the video's track until then. decisions.md:58 observed the manual purge. The row is the only way left to remove such a file from the UI.
- claude-deep: A trashed subtitle row keeps naming its path after the file is carried away. If a later rename or move carries a sidecar back to that path, the trash purge deletes that file.
- claude-deep: `movie.ja.srt` being both the bare track of `movie.ja.mp4` and the Japanese track of `movie.mp4` is recorded in known-issues.md, but which video owns it stays undefined.
- claude-deep: Uploading a subtitle with no matching video stores a file with no card, no track and no removal path; the answer is still a 200 and the drawer shows it as complete.
- claude-read: A trashed subtitle row left by an earlier version stays in Trash while its file keeps serving the video as a track. Purging it, by hand or through the trash purge loop, deletes that file and the video loses the track (decisions.md:58 observed this by hand). The dialog says only that the file will be deleted.
- claude-read: Restoring such a trashed row gives a card back until the next scan, which then removes the row without notice.
- claude-read: Dropping a subtitle row emits no `files.purged`. Intelligence catches up through the orphan purge in reconcile (indexer.py:477-484) because the scan emits `scan.complete`, but the row removed at upload.py:183 waits for the next reconcile, and knowledge rows naming the id are cleaned only by `files.purged` (addons/knowledge/app/routers/webhooks.py).
- claude-read: A folder containing only uploaded subtitles is listed as empty, while its directory and files stay on disk. `delete_folder` (fileops.py:918-944) does not touch the disk and removes the EmptyFolder row, so a later scan lists the folder again. The non-row subtitle files stay invisible throughout.
- claude-read: Skipping `scan.complete` also skips the `drive.structure_changed` WebSocket event that it maps to (event_hooks.py:150, :164). A detail page already open during a subtitle upload may therefore not refresh its track list. decisions.md:55 notes this case was not exercised.
- claude-verify: A row renamed or created with a .srt or .vtt name is deleted at the next scan with its comments, history and tag links, while the file stays on disk (scanner.py:441-451).
- claude-verify: A subtitle upload no longer emits scan.complete, so an adjacent .vtt reaches Intelligence only at the next reconcile (uploads.py:82-83).

### unspecified_behavior

Note: A row renamed or created with a .srt or .vtt name is deleted at the next scan with its comments, history and tag links, while the file stays on disk (scanner.py:441-451).; A subtitle upload no longer emits scan.complete, so an adjacent .vtt reaches Intelligence only at the next reconcile (uploads.py:82-83).
- claude-deep: A note link of the form `loft://<id>` to a previously uploaded subtitle row, which the editor used to create correctly, dangles silently once the startup scan drops that row.
- claude-deep: A trashed subtitle row still deletes the real file on purge, including the automatic retention purge at backend/app/main.py:135-152, although that file is still served as the video's track until then. decisions.md:58 observed the manual purge. The row is the only way left to remove such a file from the UI.
- claude-deep: A trashed subtitle row keeps naming its path after the file is carried away. If a later rename or move carries a sidecar back to that path, the trash purge deletes that file.
- claude-deep: `movie.ja.srt` being both the bare track of `movie.ja.mp4` and the Japanese track of `movie.mp4` is recorded in known-issues.md, but which video owns it stays undefined.
- claude-deep: Uploading a subtitle with no matching video stores a file with no card, no track and no removal path; the answer is still a 200 and the drawer shows it as complete.
- claude-read: A trashed subtitle row left by an earlier version stays in Trash while its file keeps serving the video as a track. Purging it, by hand or through the trash purge loop, deletes that file and the video loses the track (decisions.md:58 observed this by hand). The dialog says only that the file will be deleted.
- claude-read: Restoring such a trashed row gives a card back until the next scan, which then removes the row without notice.
- claude-read: Dropping a subtitle row emits no `files.purged`. Intelligence catches up through the orphan purge in reconcile (indexer.py:477-484) because the scan emits `scan.complete`, but the row removed at upload.py:183 waits for the next reconcile, and knowledge rows naming the id are cleaned only by `files.purged` (addons/knowledge/app/routers/webhooks.py).
- claude-read: A folder containing only uploaded subtitles is listed as empty, while its directory and files stay on disk. `delete_folder` (fileops.py:918-944) does not touch the disk and removes the EmptyFolder row, so a later scan lists the folder again. The non-row subtitle files stay invisible throughout.
- claude-read: Skipping `scan.complete` also skips the `drive.structure_changed` WebSocket event that it maps to (event_hooks.py:150, :164). A detail page already open during a subtitle upload may therefore not refresh its track list. decisions.md:55 notes this case was not exercised.
- claude-verify: A row renamed or created with a .srt or .vtt name is deleted at the next scan with its comments, history and tag links, while the file stays on disk (scanner.py:441-451).
- claude-verify: A subtitle upload no longer emits scan.complete, so an adjacent .vtt reaches Intelligence only at the next reconcile (uploads.py:82-83).

### unspecified_behavior

Note: A note link of the form `loft://<id>` to a previously uploaded subtitle row, which the editor used to create correctly, dangles silently once the startup scan drops that row.; A trashed subtitle row still deletes the real file on purge, including the automatic retention purge at backend/app/main.py:135-152, although that file is still served as the video's track until then. decisions.md:58 observed the manual purge. The row is the only way left to remove such a file from the UI.; A trashed subtitle row keeps naming its path after the file is carried away. If a later rename or move carries a sidecar back to that path, the trash purge deletes that file.; `movie.ja.srt` being both the bare track of `movie.ja.mp4` and the Japanese track of `movie.mp4` is recorded in known-issues.md, but which video owns it stays undefined.; Uploading a subtitle with no matching video stores a file with no card, no track and no removal path; the answer is still a 200 and the drawer shows it as complete.
- claude-deep: A note link of the form `loft://<id>` to a previously uploaded subtitle row, which the editor used to create correctly, dangles silently once the startup scan drops that row.
- claude-deep: A trashed subtitle row still deletes the real file on purge, including the automatic retention purge at backend/app/main.py:135-152, although that file is still served as the video's track until then. decisions.md:58 observed the manual purge. The row is the only way left to remove such a file from the UI.
- claude-deep: A trashed subtitle row keeps naming its path after the file is carried away. If a later rename or move carries a sidecar back to that path, the trash purge deletes that file.
- claude-deep: `movie.ja.srt` being both the bare track of `movie.ja.mp4` and the Japanese track of `movie.mp4` is recorded in known-issues.md, but which video owns it stays undefined.
- claude-deep: Uploading a subtitle with no matching video stores a file with no card, no track and no removal path; the answer is still a 200 and the drawer shows it as complete.
- claude-read: A trashed subtitle row left by an earlier version stays in Trash while its file keeps serving the video as a track. Purging it, by hand or through the trash purge loop, deletes that file and the video loses the track (decisions.md:58 observed this by hand). The dialog says only that the file will be deleted.
- claude-read: Restoring such a trashed row gives a card back until the next scan, which then removes the row without notice.
- claude-read: Dropping a subtitle row emits no `files.purged`. Intelligence catches up through the orphan purge in reconcile (indexer.py:477-484) because the scan emits `scan.complete`, but the row removed at upload.py:183 waits for the next reconcile, and knowledge rows naming the id are cleaned only by `files.purged` (addons/knowledge/app/routers/webhooks.py).
- claude-read: A folder containing only uploaded subtitles is listed as empty, while its directory and files stay on disk. `delete_folder` (fileops.py:918-944) does not touch the disk and removes the EmptyFolder row, so a later scan lists the folder again. The non-row subtitle files stay invisible throughout.
- claude-read: Skipping `scan.complete` also skips the `drive.structure_changed` WebSocket event that it maps to (event_hooks.py:150, :164). A detail page already open during a subtitle upload may therefore not refresh its track list. decisions.md:55 notes this case was not exercised.
- claude-verify: A row renamed or created with a .srt or .vtt name is deleted at the next scan with its comments, history and tag links, while the file stays on disk (scanner.py:441-451).
- claude-verify: A subtitle upload no longer emits scan.complete, so an adjacent .vtt reaches Intelligence only at the next reconcile (uploads.py:82-83).

## Findings

A: 0
B: 10
C: 0

### claude-deep:purged-video-leaves-uploaded-subtitle-that-reattaches — bucket B, MEDIUM, open

Claim: Permanently deleting a video leaves its uploaded subtitle on disk with no way to remove it in the app, and that file silently becomes a track of any later video with the same stem.
Impact: A user deletes `movie.mp4` from Trash and uploads a new `movie.mp4` with a corrected `movie.srt`. The new video plays the old captions under an ordinary label. The corrected subtitle's upload is refused with 409, so the old text stays until someone edits the drive from the host. The purged folder's directory also survives, because the leftover file makes `rmdir` fail, and the next scan lists the folder again as empty. Before this change an uploaded subtitle had a card, so the user could trash and purge it.
Evidence: backend/app/services/fileops.py:704-726 `physical_delete` unlinks only the row's own path and has no sidecar step. backend/app/services/upload.py:246-247 now gives the subtitle no row, so nothing in Trash or Missing represents it. backend/app/services/upload.py:132-133 refuses an upload when the file exists. backend/app/services/subtitle.py:83-88 matches tracks by stem alone. backend/app/main.py:170-179 stops at a non-empty directory, and backend/app/services/scanner.py:854-872 records any directory without active rows as an EmptyFolder. docs/developer-guide/known-issues.md:265-269 records that the subtitle cannot be replaced or removed, but not that it attaches to the next same-stem video or keeps the folder alive. test_sidecar_subtitles_follow_video.py has no purge case.
Repro: not_reproduced (read-only review). Steps from reading the code: upload a/movie.mp4 and a/movie.srt, delete the video, purge it from Trash, upload a new a/movie.mp4, open it, then upload a corrected a/movie.srt. Expected: the new video offers the old track, the second subtitle upload answers 409 at init, and the directory `a` still exists.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> When a video is purged, also remove the sidecars it alone claims. Alternatively, let a subtitle upload replace an existing subtitle file instead of answering 409. Add a test that purges a video, uploads a new one with the same stem and asserts its tracks.

</details>

### claude-deep:rename-into-subtitle-extension-drops-the-row-at-next-scan — bucket B, LOW, open

Claim: The scanner deletes every non-trashed row whose filename has a subtitle extension, including rows that became subtitle-named through rename or file creation rather than an earlier upload.
Impact: Renaming `notes.txt` to `notes.vtt`, batch-renaming a file to such a name, or creating a text file with that extension answers success and keeps the card until the next scan or restart. The scan then deletes the row with its comments, watch history, tags and versions. The file stays on disk with no card, the deletion is only an INFO log line, and no message reaches the user.
Evidence: backend/app/services/scanner.py:441-449 selects by `is_subtitle_file(row.filename)` and `deleted_at is None`, with no check of how the row arose. backend/app/services/fileops.py:403 validates the new name without an extension rule, and backend/app/routers/drives.py:1084-1096 creates a row from any name it is given. backend/tests/test_sidecar_subtitles_follow_video.py `TestScanRemovesSubtitleRows` seeds rows directly and only pins that they disappear; `test_comments_and_watch_history_go_with_the_row` pins the loss itself. The comment at scanner.py:438-440 describes only rows left by an earlier upload.
Repro: not_reproduced (read-only review). Steps from reading the code: seed a/notes.txt with a row and a comment, PUT rename to notes.vtt, then POST the drive scan. Expected: 200 from both, no row, no comment, and a/notes.vtt on disk.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Refuse a rename or create that gives a row a subtitle extension, or tell the user that the record will go. Add a test for whichever is chosen.

</details>

### claude-deep:scan-row-drop-branches-unpinned — bucket B, LOW, open

Claim: Two lines of the new row-drop code can be removed with the suite staying green: the orphan tag cleanup on both paths, and the removal of a dropped row from the scan's `existing` map.
Impact: If the tag cleanup is dropped, a tag used only by a subtitle row stays in the drive's tag list with zero files. If `del existing[row.file_path]` is dropped, the dropped row counts as unseen, so the scan's `missing` count rises and `files.missing` names an id that no longer exists. A later edit could introduce either one unnoticed.
Evidence: backend/app/services/scanner.py:448 and :451, backend/app/services/upload.py:187. In backend/tests/test_sidecar_subtitles_follow_video.py the helper `TestScanRemovesSubtitleRows._row` and `_upload` create no tags, the scan's return value is never read, and no event is asserted. `test_upload_over_a_path_holding_a_row_removes_the_row` covers only a missing row, not an active or trashed one.
Repro: Mutations reasoned, not run. Delete scanner.py:451, delete upload.py:187, or delete scanner.py:448; the tests in this file only check the rows, comments and files afterwards, so all three are predicted to survive.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Seed a tagged subtitle row on both paths and assert the Tag row goes. Assert `missing == 0` from the scan and record emitted `files.missing` ids.

</details>

### claude-deep:subtitle-dropped-in-editor-writes-a-dead-link — bucket B, LOW, open

Claim: The knowledge editor writes `loft://undefined` into the note when a subtitle is dropped on it, because the new upload answer has no id, and the frontend type was shaped so the compiler accepts this.
Impact: The note silently gains a link that goes nowhere, reported as a successful drop with no error toast. The user sees it only by reading the note or clicking the link. The defect is recorded in known-issues.md, but a test or the compiler would otherwise have caught it.
Evidence: addons/knowledge/frontend/Editor.tsx:729-732 interpolates `fileItem.id` with no check. frontend/src/lib/api.ts declares `id?: undefined` on `SidecarUploadResult`, so `fileItem.id` type-checks on the union; without that field the access would be a type error. addons/knowledge/frontend/__tests__/Editor.dnd.test.tsx always mocks `completeUpload` with an id. docs/developer-guide/known-issues.md:271-273 records the row. decisions.md:63 says the editor drop case was not run.
Repro: Reasoned from the code, not run: call `uploadFile` with `completeUpload` resolving to `{status: "sidecar", drive: "d", file_path: "a/x.srt"}`. Expected: the placeholder is replaced by `[x.srt](loft://undefined)` and no toast appears.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In `uploadFile`, when the answer has no id, remove the placeholder and show a message that the subtitle landed beside the note. Remove `id?: undefined` so the compiler requires callers to narrow the union.

</details>

### claude-deep:subtitle-row-drops-send-no-lifecycle-event — bucket B, LOW, open

Claim: The new row deletions in the scanner and in the subtitle upload send no `files.purged`, unlike every other route that removes a file row.
Impact: An addon that relies on that webhook keeps data for a file id that no longer exists. Knowledge's pointer from a file to its active summary note is the case read here: its lifecycle is reconciled only through webhooks, so a pointer on a dropped row is never cleaned. The exposure is narrow, because it needs a subtitle row that had a summary note or another addon record.
Evidence: backend/app/services/scanner.py:446-454 and backend/app/services/upload.py:183-188 delete rows, and neither they nor backend/app/routers/uploads.py:82-83 emit an event. The purge routes do: backend/app/routers/files.py:1914 and backend/app/routers/drives.py:1431. addons/knowledge/manifest.json:51 subscribes to `files.purged`, and addons/knowledge/app/models.py:147-148 says lifecycle runs through those handlers. addons/intelligence/app/indexer.py:369-375 documents a reconcile that detects removed files, so intelligence is expected to recover at its next reconcile. No test asserts an event for either path.
Repro: Mutation reasoned, not run: adding `event_hooks.emit_sync("files.purged", ...)` to the scanner branch, or removing it again, fails no test in test_sidecar_subtitles_follow_video.py. The stale pointer itself is not_reproduced.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Collect the dropped ids and emit `files.purged` with the drive hint from the scanner and from the subtitle upload route, then assert the event in a test.

</details>

### claude-deep:subtitle-upload-skips-scan-complete — bucket B, LOW, open

Claim: A subtitle upload returns before the route emits `scan.complete`, so addons and other open clients are not told that a track file arrived.
Impact: Uploading a `.vtt` beside a loft whose captions failed earlier no longer starts intelligence's reconcile, so transcript indexing of those captions waits for the periodic pass, up to one hour by default. Other open clients also get no `drive.structure_changed`, so their folder tree does not refresh after a folder upload. Nothing is lost, only delayed.
Evidence: backend/app/routers/uploads.py:82-83 returns before the emit at :86-90, which the same route ran for this upload before the change. addons/intelligence/manifest.json:170 subscribes to the event. addons/intelligence/app/indexer.py:488 runs `_reset_loft_refs_with_new_vtt` from reconcile, and :124-143 looks for a sibling `*.vtt`. addons/intelligence/app/config.py:255 sets the interval to 3600 seconds. addons/media_import/backend/service.py:999-1002 emits `scan.complete` after writing captions, the same fact this path now omits. backend/app/services/event_hooks.py:164 maps the event to the structure refresh that frontend/src/components/folder/FolderTreePane.tsx:29 and :168 use.
Repro: not_reproduced (read-only review; intelligence was not run). Steps from reading the code: with intelligence running, take a loft with `whisper_indexed` true and no chunks, upload `<stem>.vtt` through the API, and observe that no scan-complete webhook arrives and indexing starts only at the next periodic reconcile.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Emit `scan.complete` for a subtitle upload with `added` 0 before returning, and add a route test that asserts the event.

</details>

### claude-read:row-drop-side-effects-unpinned — bucket B, LOW, open

Claim: The tests for dropping subtitle rows check only that rows and files are gone, so the tag cleanup in both drop paths and the `del existing` line in the scanner can be removed with the suite staying green.
Impact: Without `del existing[...]`, a scan reports each dropped row as newly missing: the `missing` count shown by the scan is wrong and `files.missing` names ids that no longer exist. Without `cleanup_orphan_tags`, a tag whose only file was an uploaded subtitle stays in the sidebar with nothing behind it. Both would ship unnoticed.
Evidence: backend/app/services/scanner.py:448 and :451 and backend/app/services/upload.py:187 hold these behaviours. In backend/tests/test_sidecar_subtitles_follow_video.py, `test_active_and_missing_rows_go_and_the_files_stay` asserts only the row count and directory names and ignores the scan's return value and events. `_row` sets no tags and leaves `missing_since` None for `one.srt` and `gone.srt`, so scanner.py:791-797 would select them. `test_upload_over_a_path_holding_a_row_removes_the_row` seeds no tag. `test_other_uploads_still_answer_with_the_file` takes a `kind` parameter it never asserts.
Repro: Mutations reasoned, not run. (1) Delete scanner.py:448: the deleted objects keep their loaded attributes after the flush, so `newly_missing_ids` includes them, the update matches no rows, and every assertion in `TestScanRemovesSubtitleRows` still holds. (2) Delete scanner.py:451. (3) Delete upload.py:187. All three are predicted to survive.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Assert `result["missing"] == 0` in the scan test, and seed a tag on the dropped row in both the scan and upload tests, asserting the tag row is gone.

</details>

### claude-read:scan-drops-rows-renamed-to-a-subtitle-name — bucket B, LOW, open

Claim: The scan's row drop matches on filename alone, while rename, batch rename and the create-file route can still put a subtitle name on a row, so a row a user made this way is deleted with its comments, tags and history at the next scan.
Impact: A user renames `transcript.txt` to `movie.srt` so that it becomes the video's track. The rename answers 200 and the card keeps working. The next scan, or the next restart, removes the card, its comments, tags and watch history with only an INFO log line. The file stays on disk and the video gets the track, but the disappearance is unexplained, and it depends on when a scan happens to run. Uploads were closed against this state and these paths were not.
Evidence: backend/app/services/fileops.py:398-423 `rename_file` applies only `validate_filename`, with no subtitle check, and `batch_rename` builds names the same way. backend/app/routers/drives.py:1084-1096 creates a row for whatever name the create route receives. backend/app/services/scanner.py:441-451 deletes every non-trashed row where `is_subtitle_file(row.filename)` holds, whatever its `file_type`. backend/app/main.py:275 runs that scan at every startup. `test_comments_and_watch_history_go_with_the_row` pins the cascade. No test renames a row to a subtitle name.
Repro: not_reproduced (read-only review). Steps: rename a commented `a/transcript.txt` to `movie.srt` beside `a/movie.mp4`, then POST `/api/drives/<drive>/scan`. Reading the code predicts the row and comments are gone, `a/movie.srt` remains, and the video lists the track.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Decide this at the rename and create paths: when the new name is a subtitle, remove the row in the same request or refuse the rename, and add a test for the chosen outcome.

</details>

### claude-read:subtitle-dropped-in-editor-writes-dead-link — bucket B, LOW, open

Claim: The knowledge editor treats a successful subtitle upload as a file with an id and writes `loft://undefined` into the note.
Impact: Dropping an `.srt` or `.vtt` into a note replaces the uploading placeholder with a link that opens nothing. No error toast appears, and the broken text is autosaved into the user's Markdown. The known-issues ledger records this, but the code path still reports success.
Evidence: addons/knowledge/frontend/Editor.tsx:729-732 interpolates `fileItem.id` into `loft://` with no check. frontend/src/lib/api.ts:453-459 declares `SidecarUploadResult` with `id?: undefined`, so that access compiles against the new union and the type check cannot catch it. backend/app/services/upload.py:246-247 returns the id-less answer for these names. addons/knowledge/frontend/__tests__/Editor.dnd.test.tsx mocks `completeUpload` only with ids (:109, :148, :173, :203, :314, :343). decisions.md:63 says no knowledge editor was running, so this case was not walked.
Repro: not_reproduced (read-only review). Steps: open a note in the knowledge editor and drop `movie.srt`. Reading the code predicts the file lands beside the note and the note body gains `[movie.srt](loft://undefined)`.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In `uploadFile`, branch on `status === "sidecar"`: remove the placeholder and leave plain text or show a notice. Add an Editor.dnd case with the sidecar answer.

</details>

### claude-read:subtitle-upload-no-longer-triggers-indexing — bucket B, LOW, open

Claim: A subtitle upload returns before the route emits `scan.complete`, so Intelligence no longer reconciles when a `.vtt` is uploaded beside a `.loft`.
Impact: A user uploads `clip.vtt` beside an imported `clip.loft` that has no transcript. Before this change the upload's `scan.complete` made Intelligence reset the loft and index the captions straight away. Now the file lands and the track is listed, but Ask and search do not get the transcript until the next periodic reconcile (default 3600 s) or an unrelated scan or upload. Nothing tells the user. This is a delay and no data is lost.
Evidence: backend/app/routers/uploads.py:82-83 returns for `SubtitleUploadResponse` before the emit at :86, and `_finish_subtitle_upload` (backend/app/services/upload.py:179-195) only broadcasts the `upload:complete` WebSocket event. addons/intelligence/manifest.json:170-171 subscribes to `scan.complete`. indexer.py:1110-1125 runs `reconcile()`, whose :488 calls `_reset_loft_refs_with_new_vtt`, and :124-143 resets an unchunked loft once `match_siblings(parent, stem, "*.vtt")` finds a file. whisper.py:1732-1745 then indexes that VTT. The only other trigger is `_reconciliation_worker` (indexer.py:1615-1622), with `reconciliation_interval` 3600 (config.py:255). addons/media_import/backend/service.py:1051-1054 emits `scan.complete` after captions for this hand-off. No test asserts either way, and the fifth R-5 walk ran without Intelligence (decisions.md:65).
Repro: not_reproduced (read-only review). Steps: with Intelligence running and an indexed `clip.loft` with `whisper_indexed` true and no chunks, upload `clip.vtt` through Add, Files. Reading the code predicts no reconcile log line until the next hourly pass, where the base branch ran one at once.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Emit `scan.complete` for the drive in the route's subtitle branch, with `added` 0, and add a route test for it.

</details>

## Not verified

- claude-deep: No test, command, application or mutant was run, because this role has only Read, Glob and Grep. Every repro and mutation result is traced from the code.
- claude-deep: The worktree was read as it stands and assumed to match d9733d231; the only untracked path in the status snapshot is the r4 review directory. Git could not be used to confirm this, including that the checked-out submodules match the merged pins.
- claude-deep: The fix diff supplied to this review was truncated at 200000 bytes inside the media_import test diff. The remaining submodule hunks were not read, and only the service and event lines cited were read directly.
- claude-deep: The screenshots and logs cited in decisions.md were not opened; only the record itself was read.
- claude-deep: Intelligence's reconcile was read only as far as line 463, so its removal of ids absent from core is taken from its docstring. Knowledge's `handle_files_purged` was not traced beyond its webhook route and the model docstring.
- claude-deep: How a detail page already open reacts when a subtitle is uploaded beside its video was not checked; decisions.md:55 says it was not exercised either.
- claude-deep: SQLite lock behavior during a first scan with stale rows, and the driver's effective busy timeout, were not observed.
- claude-deep: docs/process documents other than the decision record and .claude/rules/backend-conventions.md were listed but not read in full.
- claude-read: No test, command, application or mutant was run because this review is read-only, so every repro and mutation result is predicted from reading the code.
- claude-read: The worktree was read as it stands and assumed to match d9733d231; git was not available to confirm that or to read the submodule pins directly.
- claude-read: The fix diffs supplied to this review were cut at 200000 bytes, so the trailing part of the submodule diffs was not read in that form. The trajectory rests on the subtitle commits, which appear in full.
- claude-read: The R-5 logs and screenshots cited in decisions.md were not opened, and lines 45-54 of that record, covering the fourth run and the start of the fifth, were not read.
- claude-read: Whether the frontend refetches an open detail page on `drive.structure_changed` was not traced, so the effect of skipping that event is unconfirmed.
- claude-read: How the frontend or addons behave with the renamed-to-subtitle row before the next scan was not traced, and the rename dialog's own validation was not read.
- claude-read: The intelligence reset path was read only as far as cited; the indexing of an uploaded VTT was not run, and whether the index feature is on for a given drive affects the first finding.
- claude-verify: No test, mutant, compiler or running app was executed; this verifier has only Read, Glob and Grep, so every record rests on reading the code.
- claude-verify: I read the working tree on the branch and did not compare it with origin/develop by diff, so 'the route ran this emit before the change' relies on the code shape and the other reviewers' statements.
- claude-verify: Editor.dnd.test.tsx:230 (a chained completeUpload mock) was not read.
- claude-verify: The knowledge addon's files-purged webhook handler and what it would do for a dropped subtitle row were not traced.
- claude-verify: Backend tests that do not contain a double-quoted .srt or .vtt name, and test_listing_call_inventory.py, test_subtitle.py, test_sidecar_match.py and test_classify_table.py, were not read in full for tag or event assertions on the drop paths.

TOTAL: 10 findings
