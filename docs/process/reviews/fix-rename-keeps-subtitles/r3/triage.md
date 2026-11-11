# Triage: r3

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- claude-deep: Read in order, and leaving out the tag and relation commits that arrive through the merge from develop: yes for one strand, no for the other. c37fb760a (reviewed in r2) added a copy-or-move branch, sibling claims, a longest-first order and a per-step name replay. 1deeba6a0 removed all four, so that strand of per-sidecar prediction shrank; the sort's removal returned one rename shape to listing-order dependence, which known-issues.md records. The same commit added a new state, the subtitle's own row, with a `taken` branch, and 6b7dfd7ea added a second branch for that state in the scanner. Each of the last two code rounds therefore adds a branch for the fact that uploads create rows for subtitles while the scanner says it never does, and this review finds a third place that needs one, EmptyFolder tracking. On that strand the design is being patched: r2 asked whether uploads should register subtitles at all, and that question is still undecided. The rows are being taught place by place to behave like files.
- claude-read: The earlier rounds added predictions, and this range removed them. c37fb760a had added a copy-or-move branch, a sibling claim state, a position-based `later` state and a longest-first ordering; 1deeba6a0 deletes all four, together with their tests in e5ea1ef91, and the outcomes they guarded are recorded in known-issues.md instead. That part is a real simplification. But the same range then adds branches of a new kind for one new state, a subtitle that has a File row: 1deeba6a0 adds `_follow_sidecar_row` with its row-missing and target-taken branches, and 6b7dfd7ea adds a subtitle-row branch to the scanner, because the third R-5 run found rows flagged missing. So two consecutive rounds each special-cased that state at one consumer, and the two new findings are further consumers not yet handled: empty-folder tracking in `move_file` and the batch move loop. For this state the design is being patched. The question r2 raised, whether an upload should register a subtitle row at all, was answered by keeping the row, which leaves each path that assumes subtitles have no row to be corrected in turn. The other tag-related commits in the range belong to merged develop work and do not touch this design.

Earlier runs:
- r1 / claude-read: First review. With no touch-point list declared, the place the change should reach and does not is `fileops.batch_rename`; every other video rename or move path reaches the new sidecar step.
- r2 / claude-deep: Only c37fb760a changes code; ff3771cf5 and c5fcadfab record reviews and R-5. Compared with the first round, it added and removed nothing symmetrically: it removed no branch or state and added a copy-versus-move branch beside the earlier exists-then-skip branch, a claim state (`sibling_stems`, active or not), a per-step prediction of which name each batch row holds (`position`, `old_names`, `later`) and a global ordering rule. So yes, the round repeats the pattern of the one before, adding per-sidecar decisions on name matching rather than planning all source and target pairs at once. The design is being patched. Each addition fixed its reported case and has a counter-case at its edge: the copy branch leaves an orphan when the last claimant finds the target taken, the ordering handles only growing stems, and the plan-order premise fails on mixed extensions.
- r2 / claude-read: Yes, the design is being patched. ff3771cf5 and c5fcadfab are records only and change no code, so c37fb760a is the single code round since r1. The first implementation predicted disk state one sidecar at a time with `target.exists()`. c37fb760a adds more predictions of the same kind on top of it: a fixed longest-first order that predicts which names free up, a sibling list with a new copy-or-move branch, and in the batch path a `later` state that replays the name each row holds at each step. No branch, state or prediction was removed. Each new prediction covers the input it was written for and misses a neighbouring one: the reverse language-suffix rename, a batch target freed by a later row, and a same-stem pair acted on together. All three come from choosing per sidecar without first planning the final set of names.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: When a row already holds the target path, the file moves but its own row stays at the old path (fileops.py:403-412, pinned by `test_row_holding_the_target_path_stays_and_the_rename_succeeds`). At the next scan, by reading the code, the stale row at the target recovers and takes over the file with its old tags and history, while the uploaded row is flagged missing.; A batch rename with `clip_{n}` that selects a video and its uploaded subtitle numbers them separately, for example `clip_1.mp4` and `clip_2.srt`, so the track detaches with a 200. The dialog offers no way to keep the pair together.; A trashed subtitle row follows its file, because `_follow_sidecar_row` applies no state filter (fileops.py:396-400), so it stays trashed at the new path and possibly on another drive. No test covers this.; A sidecar row's move produces no `files.moved` event of its own: the routes emit only the video's id (routers/files.py:381, :435, :1379). Addon reactions to the subtitle row were not traced.
- claude-deep: After the scanner fix, an uploaded subtitle stays in the listing as its own card through rescans, while a subtitle placed on disk never has one. The same file therefore looks different by origin. decisions.md:33 and :46 observed the card, and the user guide says subtitles do not appear in the file list.
- claude-deep: Databases where a rescan already flagged uploaded subtitles missing will see them recover as cards on the next scan after this change, with a files.recovered event for each.
- claude-deep: A subtitle row that follows its video is not named in the files.moved event (routers/files.py:381 and :435 emit only the video ids), and a row whose path the carry changed gets no event of its own. Intelligence documents a reconcile for missed events (addons/intelligence/app/indexer.py:374), but other subscribers were not traced.
- claude-deep: Video and sidecar are not committed together. A process stop between the video's commit and the carry leaves the sidecars under the old name, and a stop between shutil.move and the row commit leaves an active row with no file until a rescan.
- claude-deep: `movie.ja.srt` is both the bare track of `movie.ja.mp4` and the Japanese track of `movie.mp4`, so renaming `movie.mp4` takes it from the other video. Commit 84bed1b38 removed the `movie.ja.mp4` example from known-issues.md because its stated form with `movie.srt` was wrong, and this form is not recorded.
- claude-read: When a row already holds the target path, the file moves but its own row stays at the old path (fileops.py:403-412, pinned by `test_row_holding_the_target_path_stays_and_the_rename_succeeds`). At the next scan, by reading the code, the stale row at the target recovers and takes over the file with its old tags and history, while the uploaded row is flagged missing.
- claude-read: A batch rename with `clip_{n}` that selects a video and its uploaded subtitle numbers them separately, for example `clip_1.mp4` and `clip_2.srt`, so the track detaches with a 200. The dialog offers no way to keep the pair together.
- claude-read: A trashed subtitle row follows its file, because `_follow_sidecar_row` applies no state filter (fileops.py:396-400), so it stays trashed at the new path and possibly on another drive. No test covers this.
- claude-read: A sidecar row's move produces no `files.moved` event of its own: the routes emit only the video's id (routers/files.py:381, :435, :1379). Addon reactions to the subtitle row were not traced.

### unspecified_behavior

Note: After the scanner fix, an uploaded subtitle stays in the listing as its own card through rescans, while a subtitle placed on disk never has one. The same file therefore looks different by origin. decisions.md:33 and :46 observed the card, and the user guide says subtitles do not appear in the file list.; Databases where a rescan already flagged uploaded subtitles missing will see them recover as cards on the next scan after this change, with a files.recovered event for each.; A subtitle row that follows its video is not named in the files.moved event (routers/files.py:381 and :435 emit only the video ids), and a row whose path the carry changed gets no event of its own. Intelligence documents a reconcile for missed events (addons/intelligence/app/indexer.py:374), but other subscribers were not traced.; Video and sidecar are not committed together. A process stop between the video's commit and the carry leaves the sidecars under the old name, and a stop between shutil.move and the row commit leaves an active row with no file until a rescan.; `movie.ja.srt` is both the bare track of `movie.ja.mp4` and the Japanese track of `movie.mp4`, so renaming `movie.mp4` takes it from the other video. Commit 84bed1b38 removed the `movie.ja.mp4` example from known-issues.md because its stated form with `movie.srt` was wrong, and this form is not recorded.
- claude-deep: After the scanner fix, an uploaded subtitle stays in the listing as its own card through rescans, while a subtitle placed on disk never has one. The same file therefore looks different by origin. decisions.md:33 and :46 observed the card, and the user guide says subtitles do not appear in the file list.
- claude-deep: Databases where a rescan already flagged uploaded subtitles missing will see them recover as cards on the next scan after this change, with a files.recovered event for each.
- claude-deep: A subtitle row that follows its video is not named in the files.moved event (routers/files.py:381 and :435 emit only the video ids), and a row whose path the carry changed gets no event of its own. Intelligence documents a reconcile for missed events (addons/intelligence/app/indexer.py:374), but other subscribers were not traced.
- claude-deep: Video and sidecar are not committed together. A process stop between the video's commit and the carry leaves the sidecars under the old name, and a stop between shutil.move and the row commit leaves an active row with no file until a rescan.
- claude-deep: `movie.ja.srt` is both the bare track of `movie.ja.mp4` and the Japanese track of `movie.mp4`, so renaming `movie.mp4` takes it from the other video. Commit 84bed1b38 removed the `movie.ja.mp4` example from known-issues.md because its stated form with `movie.srt` was wrong, and this form is not recorded.
- claude-read: When a row already holds the target path, the file moves but its own row stays at the old path (fileops.py:403-412, pinned by `test_row_holding_the_target_path_stays_and_the_rename_succeeds`). At the next scan, by reading the code, the stale row at the target recovers and takes over the file with its old tags and history, while the uploaded row is flagged missing.
- claude-read: A batch rename with `clip_{n}` that selects a video and its uploaded subtitle numbers them separately, for example `clip_1.mp4` and `clip_2.srt`, so the track detaches with a 200. The dialog offers no way to keep the pair together.
- claude-read: A trashed subtitle row follows its file, because `_follow_sidecar_row` applies no state filter (fileops.py:396-400), so it stays trashed at the new path and possibly on another drive. No test covers this.
- claude-read: A sidecar row's move produces no `files.moved` event of its own: the routes emit only the video's id (routers/files.py:381, :435, :1379). Addon reactions to the subtitle row were not traced.

## Findings

A: 0
B: 7
C: 0

### claude-deep:last-sidecar-row-leaving-drops-the-source-folder — bucket B, MEDIUM, open

Claim: move_file decides whether the old folder is empty while an uploaded subtitle's row still sits in it, and _follow_sidecar_row then moves that row out with no empty-folder bookkeeping, so the folder ends with no rows and no EmptyFolder record.
Impact: Upload movie.mp4 and movie.srt into folder `a`, then move the video to another folder or drive. The request answers 200 and the directory still exists on disk, but `a` disappears from the folder tree and listing until the next rescan. The user cannot open it or upload into it. With a row-less sidecar, or with the video alone, the same move keeps `a` visible, so the result depends on how the subtitle got there.
Evidence: backend/app/services/fileops.py:579 calls `_ensure_empty_folder_tracked(db, old_drive, old_folder)` before the carry. Its check at :148-154 finds the still-active subtitle row in the folder and returns without tracking. fileops.py:592 then carries, and `_follow_sidecar_row` (:388-421) changes drive, folder_path and file_path and commits without calling `_ensure_empty_folder_tracked` or `untrack_empty_folder`. backend/app/routers/drives.py:284-302 and :424-441 build folders only from active File rows and EmptyFolder rows. scanner.py:849-863 restores the record, which is why a rescan hides this. test_sidecar_subtitles_follow_video.py has no match for EmptyFolder. The R-5 third and fourth runs left `keep.txt` in the source folder, so the folder stayed populated (decisions.md:35 and :47).
Repro: not_reproduced (read-only review). Steps from reading the code: upload movie.mp4 and movie.srt into `a` with nothing else in it, PUT /api/files/<video id>/move to `b`, then GET the drive's folder tree. Expected: `a` is absent, and there is no EmptyFolder row for it, while the directory exists on disk. A rescan brings it back.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> After the carry in move_file, call `_ensure_empty_folder_tracked` for the old folder again and commit, and add a parametrized case that uploads into a folder with no other file and asserts the folder is still listed.

</details>

### claude-read:source-folder-vanishes-after-uploaded-sidecar-row-follows — bucket B, MEDIUM, open

Claim: When a move takes both a video and its uploaded subtitle out of a folder, the source folder is checked for emptiness while the subtitle row is still in it and is never checked again, so the now-empty folder is not tracked and drops out of the folder tree.
Impact: A user uploads `movie.mp4` and `movie.srt` into a folder and moves the video to another folder or drive. The folder still exists on disk, but it disappears from the tree and cannot be opened or used as a destination until a rescan rebuilds the empty-folder rows. Moving the same video with a sidecar that has no row keeps the folder visible, so the result depends on how the subtitle got there, and nothing tells the user.
Evidence: backend/app/services/fileops.py:579 calls `_ensure_empty_folder_tracked(db, old_drive, old_folder)` before the carry at fileops.py:592. At that point fileops.py:148-154 finds the active subtitle row and returns without adding an EmptyFolder. `_follow_sidecar_row` (fileops.py:396-421) then changes the row's folder_path and has no empty-folder step. routers/drives.py:285-302 builds the tree only from active File rows and EmptyFolder rows, so no row names the folder. Only a scan heals it (scanner.py:849-863). test_sidecar_subtitles_follow_video.py has no match for EmptyFolder. The fixtures in the third and fourth R-5 runs left `keep.txt` in the source folder (decisions.md:35 and :47), so those walks could not show this.
Repro: not_reproduced (read-only review). Steps: upload `movie.mp4` and `movie.srt` into `a/`, with nothing else in the folder. PUT `/api/files/<video id>/move` with target_folder_path `b`. Reading the code predicts that `a/` exists on disk, no EmptyFolder row exists for `a`, and the drive's folder tree omits `a` until `POST /api/drives/<drive>/scan`.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Run `_ensure_empty_folder_tracked` for the old folder after the sidecar rows have followed, then commit, and add a test that uploads both files, moves the video and asserts the EmptyFolder row.

</details>

### claude-deep:carried-sidecar-onto-a-ghost-row-can-be-purged — bucket B, LOW, open

Claim: When a carried sidecar lands on a path held by a missing or trashed row, that row stays in place naming the live file, and the sidecar's own row, if any, keeps pointing at a path with no file.
Impact: A Missing Files or Trash entry for `a/film.srt` now names the subtitle just carried there. Permanently Delete on that entry, or Empty Trash, unlinks the live file, and the video loses a track it just kept. Until a rescan, the uploaded subtitle's own card opens as File not found. After a rescan, its row is flagged missing and the ghost is recovered as the owner of the file. The request answered 200 with a warning at most, and with no warning at all when the sidecar has no row.
Evidence: backend/app/services/fileops.py:401-402 returns when the source has no row, without looking at the target, and :403-412 logs and returns when the target is taken. The video's own path clears such ghosts first with `resolve_db_path_conflict` (:168-203, called at :472 and :552). subtitle.py:134 checks only the disk, so a ghost whose file is gone does not stop the move. `purge_missing_file` (:849-866) and `purge_file` (:822-830) both reach `physical_delete`, whose :760-761 unlinks whatever exists at the row's path; decisions.md:37 records that behavior for a missing row. scanner.py:458-464 now recovers the ghost. `test_row_holding_the_target_path_stays_and_the_rename_succeeds` asserts only the source row's place and the video's name, never the ghost or the file.
Repro: not_reproduced (read-only review). Steps from reading the code: seed a missing row at a/film.srt with no file, plus a/movie.mp4 and an uploaded a/movie.srt. PUT rename the video to film.mp4, then DELETE the purge route for the missing row. Expected: a/film.srt is unlinked and detect_subtitles('a/film.mp4') returns [].
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Clear the target through `resolve_db_path_conflict` for an inactive holder, whether or not the sidecar has a row, as the video's path does; or skip the file move when the target path has any row. Extend the existing test to assert the outcome for the ghost row and the file.

</details>

### claude-deep:follow-row-branches-unpinned — bucket B, LOW, open

Claim: Several behaviors of `_follow_sidecar_row` and the new scanner branch have no test that would fail if they were removed.
Impact: A later edit could drop tag retargeting, so a tagged subtitle moved across drives keeps its old drive's tag row and the destination's tag list and counts disagree. It could also store folder_path `.` for a video moved to a drive root, which hides the card from its folder, or stop refreshing the title. The suite would stay green in each case.
Evidence: `test_row_follows_its_file` compares only drive, folder_path, filename and file_path through `_place` (backend/tests/test_sidecar_subtitles_follow_video.py), and its uploaded subtitle has no tags. Every expected folder is `a`, `b` or `z`, so the root branch at fileops.py:418 never runs. Title at :415-416 is never read. No test forces the rollback at :442-444. `TestScanKeepsUploadedSubtitles` uses ASCII names and checks only missing_since, so the NFC normalize at scanner.py:458 and `recovered_ids.append` at :464 are unpinned. The manual R-5 walk covers the drive root and the title once, and it does not cover tags.
Repro: Mutations reasoned, not run. Delete fileops.py:414; change :418 to `str(target.parent)`; delete :415-416; remove the normalize at scanner.py:458; delete scanner.py:464. Reading the tests predicts all five survive.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a drive-root target, a tagged subtitle moved across drives and a title assertion to the parametrized test, and assert the scan's `recovered` count.

</details>

### claude-deep:sidecar-row-lookup-uses-the-listed-name — bucket B, LOW, open

Claim: The carry looks up a sidecar's row with the name as listed on disk, not its NFC form, so a sidecar listed in NFD does not match its row, whose stored file_path is NFC.
Impact: On a host that presents a Japanese subtitle name decomposed, the file moves and the track keeps working, but the uploaded subtitle's row is silently left at the old path with no log line. Its card opens as File not found until a rescan flags it missing. The carried file then has no row, so the card stays gone. The scanner handles the same name correctly, so the two paths disagree.
Evidence: backend/app/services/subtitle.py:120-124 keeps `item` from `iterdir`, and :140 returns it unnormalized. backend/app/services/fileops.py:439 builds source_rel with `source.relative_to(old_root).as_posix()`, and :398 compares it for equality with `File.file_path`. backend/app/services/upload.py:118 stores the row through `validate_filename`, which applies NFC at fileops.py:67. scanner.py:458 normalizes the same lookup. backend/tests/test_listing_call_inventory.py:3-6 names this hazard and says a stored-name listing must normalize, but `test_stored_name_listings_normalize` only requires a normalize call in the listing function, which subtitle.py:114 and :131 satisfy. `test_a_decomposed_sidecar_name_lands_under_the_composed_target` has no row.
Repro: not_reproduced (read-only review). Mutation of the fixture rather than the code: upload a subtitle with a dakuten name beside a video, rename its file on disk to the NFD spelling, then rename the video. Expected: the file reaches the new NFC name and `_place` for the subtitle row still returns the old path, with nothing logged. Whether an NFC upload is ever listed as NFD depends on the host: APFS through Docker Desktop preserves what was written, so this needs a normalizing mount or a file replaced from outside.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Normalize source_rel to NFC in `_carry_sidecars`, as scanner.py:458 does, and add a row to the NFD test.

</details>

### claude-read:batch-move-reports-failure-for-a-subtitle-already-carried — bucket B, LOW, open

Claim: A batch move that selects a video and then its uploaded subtitle counts the subtitle as failed, because the video's move has already carried that row to the destination.
Impact: Uploaded subtitles appear as their own cards, so selecting both cards and using Cut and Paste is ordinary use. Every file lands correctly, but the page shows `1 file could not be pasted`, and the same request answers an `errors` entry. The user is told something failed when nothing did, and may go looking for a file that is already in place. The selection bar and drag paths discard the errors array, so they show nothing.
Evidence: backend/app/routers/files.py:354-369 calls `fileops.move_file` for each id in turn. The first call carries the subtitle and its row (fileops.py:592, :396-421). The second call builds new_rel from the row's new folder and the same filename (fileops.py:543-544), so old and new paths are the same file. fileops.py:547-548 finds that it exists and raises 409 `File already exists at target`, and files.py:369 records it as an error. frontend/src/components/ClipboardProvider.tsx:135-138 and :158-160 turn the error count into `toast.error(pasteFailed)`. The ids come from selection insertion order (SelectionBar.tsx:100). In the opposite order the subtitle moves first, the video finds no sidecar left to carry, and there is no error. No test in test_sidecar_subtitles_follow_video.py uses `/batch/move`, and the R-5 runs moved only the video card.
Repro: not_reproduced (read-only review). Steps: upload `movie.mp4` and `movie.srt` into `a/`, then PUT `/api/files/batch/move` with ids [video id, subtitle id] and target_folder_path `b`. Reading the code predicts `{"moved": 1, "errors": [{"id": <subtitle id>, "error": "File already exists at target"}]}`, with both files and rows correct in `b/`.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In the batch move loop, treat a row that is already at the requested destination as moved, and add this selection order as a test row.

</details>

### claude-read:sidecar-row-tags-title-and-root-unpinned — bucket B, LOW, open

Claim: The tests for `_follow_sidecar_row` compare only drive, folder, filename and path, so the tag retarget, the title update and the root-folder branch can all be removed or broken with the suite staying green.
Impact: An edit that drops `retarget_file_tags` would leave a tagged subtitle moved across drives linked to the old drive's Tag row, so that row keeps counting on the wrong drive and the subtitle's own drive does not list the tag. Removing the title line would leave the card showing the old name after a rename. Removing the root branch would store folder_path `.` for a sidecar moved to a drive root, which would hide it from that folder's listing. Only the manual walks saw title and root, and no walk tagged a subtitle.
Evidence: backend/app/services/fileops.py:414-418 holds the three behaviors. `_place` in backend/tests/test_sidecar_subtitles_follow_video.py returns only `row.drive, row.folder_path, row.filename, row.file_path`, and no test reads `row.title` or `row.tags`. Every parametrized destination of `test_row_follows_its_file` has a non-empty folder (`a`, `b`, `z`), so `target.parent == PurePosixPath('.')` is never true.
Repro: Mutations reasoned, not run. (1) Delete fileops.py:414. (2) Delete fileops.py:415-416. (3) Replace fileops.py:418 with `row.folder_path = str(target.parent)`. Tracing `TestUploadedSubtitleRow` predicts all three survive. Asserting title and tags, and adding a move-to-root row, would kill them.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a move-to-drive-root row to the existing parametrized test, and extend its assertion to title and tag rows.

</details>

## Not verified

- claude-deep: No test, command or application was run because this role has read-only tools. Every repro and mutation result comes from reading the code, and the R-5 record in decisions.md was read but its logs and screenshots were not opened.
- claude-deep: The tree was read from the worktree and assumed to match b6e0da5af, because the git status snapshot shows that commit at HEAD; git could not be run.
- claude-deep: Whether a periodic or startup scan shortens how long a dropped folder stays hidden was not traced; only the manual scan route and the scanner's own repair were read.
- claude-deep: The frontend's handling of the vanished folder, for example when the user is browsing it at the time, was not read.
- claude-deep: Which hosts list an NFC-written name as NFD was not observed; APFS through Docker Desktop is expected to preserve it, from general knowledge and not from a run here.
- claude-deep: Addon subscribers to files.moved and files.recovered were checked by grep only. Whether intelligence or knowledge index subtitle rows was not established.
- claude-read: No test, command or application was run because this review is read-only, so every repro and mutation result is predicted from reading the code.
- claude-read: The worktree was read as it stands and assumed to match b6e0da5; git was not available to confirm it.
- claude-read: The R-5 logs and screenshots cited in decisions.md were not opened; only the record itself was read.
- claude-read: Addon handling of a subtitle row that moves without its own `files.moved` event, and of `files.recovered` for subtitle rows, was not traced.
- claude-read: How often a scan runs on its own was not checked, so how long a vanished folder stays hidden is unknown.
- claude-read: Selection order in the frontend was read only as insertion order into a Set. The order `Select all` inserts was not traced, and the toast was not observed.
- claude-read: Behavior on case-insensitive or normalization-folding mounts was not observed.
- claude-verify: No test, app or mutant was executed, because only Read, Glob and Grep are available; every confirmation comes from reading the code.
- claude-verify: The working tree was read as the commit under review; the commit and its diff against origin/develop could not be compared directly.
- claude-verify: introduced versus pre-existing was not established from a diff for any finding.
- claude-verify: Actual NFD listing behavior on the deployment filesystem was not observed.
- claude-verify: Other references that could depend on a subtitle row's path, such as the search index or addon consumers of files.moved, were not traced.

TOTAL: 7 findings
