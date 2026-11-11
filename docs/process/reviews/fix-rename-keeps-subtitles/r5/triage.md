# Triage: r5

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- claude-deep: Partly yes, at a much smaller scale than before, and this round also removed one rule. cde9bc7a3 is the only code commit since r4; 5ea567d60 adds tests, and 4e5d2d82c and f08c2dd63 are records. cde9bc7a3 removes the subtitle's 409 and the silent skip of `scan.complete`, both of which r4 reported. It adds one more branch of the kind bd49bc092 added in the previous round, a test for 'is this a subtitle' on the upload path: `replaces_subtitle` at init, joining the branches in `complete_upload` and in the route. So the upload path now special-cases subtitles in three places, and the route's branch repeats the same emit with different counts. It adds no new state, and no prediction of the kind r2 and r3 kept adding; the row state stays removed. The per-sidecar `target.exists()` prediction from r1 is untouched, and its failures stay in the ledger, which gained four more rows this round. On the row strand the design is no longer being patched. The remaining pattern is at the edge of the decision that a subtitle is a file with no record: each capability it lacks is handled by a branch or a ledger row. This round's new findings follow from that, because a file with no record has no version, validation, reindex or folder tracking around it.
- claude-read: Only cde9bc7a3 changes behaviour in this range; 5ea567d60 adds tests, and 4e5d2d82c and f08c2dd63 record the review and R-5. It removes no branch or state and adds one branch, `replaces_subtitle` in `init_upload`, plus an `emit` inside the route's existing subtitle branch. It adds no state and no prediction of disk or name order, so the per-sidecar prediction strand from r1 to r3 and the row-following strand removed in bd49bc092 do not recur. One pattern does repeat. bd49bc092 added a subtitle exception to `complete_upload` and to the route, and this round adds another at `init_upload` and extends the one in the route, so the upload path now treats subtitles differently at each of its stages. On this strand the design is being patched modestly: each exception answers a finding about the one before, because the early return lost the event and the row-less file lost its removal path. The rest of r4's open findings were moved to known-issues.md rather than changed in code, so the record grew by four entries while the code gained one branch. The new findings sit at the edge of the replacement itself: the index does not notice it, it has no undo, and it matches only the exact composed name.

Earlier runs:
- r1 / claude-read: First review. With no touch-point list declared, the place the change should reach and does not is `fileops.batch_rename`; every other video rename or move path reaches the new sidecar step.
- r2 / claude-deep: Only c37fb760a changes code; ff3771cf5 and c5fcadfab record reviews and R-5. Compared with the first round, it added and removed nothing symmetrically: it removed no branch or state and added a copy-versus-move branch beside the earlier exists-then-skip branch, a claim state (`sibling_stems`, active or not), a per-step prediction of which name each batch row holds (`position`, `old_names`, `later`) and a global ordering rule. So yes, the round repeats the pattern of the one before, adding per-sidecar decisions on name matching rather than planning all source and target pairs at once. The design is being patched. Each addition fixed its reported case and has a counter-case at its edge: the copy branch leaves an orphan when the last claimant finds the target taken, the ordering handles only growing stems, and the plan-order premise fails on mixed extensions.
- r2 / claude-read: Yes, the design is being patched. ff3771cf5 and c5fcadfab are records only and change no code, so c37fb760a is the single code round since r1. The first implementation predicted disk state one sidecar at a time with `target.exists()`. c37fb760a adds more predictions of the same kind on top of it: a fixed longest-first order that predicts which names free up, a sibling list with a new copy-or-move branch, and in the batch path a `later` state that replays the name each row holds at each step. No branch, state or prediction was removed. Each new prediction covers the input it was written for and misses a neighbouring one: the reverse language-suffix rename, a batch target freed by a later row, and a same-stem pair acted on together. All three come from choosing per sidecar without first planning the final set of names.
- r3 / claude-deep: Read in order, and leaving out the tag and relation commits that arrive through the merge from develop: yes for one strand, no for the other. c37fb760a (reviewed in r2) added a copy-or-move branch, sibling claims, a longest-first order and a per-step name replay. 1deeba6a0 removed all four, so that strand of per-sidecar prediction shrank; the sort's removal returned one rename shape to listing-order dependence, which known-issues.md records. The same commit added a new state, the subtitle's own row, with a `taken` branch, and 6b7dfd7ea added a second branch for that state in the scanner. Each of the last two code rounds therefore adds a branch for the fact that uploads create rows for subtitles while the scanner says it never does, and this review finds a third place that needs one, EmptyFolder tracking. On that strand the design is being patched: r2 asked whether uploads should register subtitles at all, and that question is still undecided. The rows are being taught place by place to behave like files.
- r3 / claude-read: The earlier rounds added predictions, and this range removed them. c37fb760a had added a copy-or-move branch, a sibling claim state, a position-based `later` state and a longest-first ordering; 1deeba6a0 deletes all four, together with their tests in e5ea1ef91, and the outcomes they guarded are recorded in known-issues.md instead. That part is a real simplification. But the same range then adds branches of a new kind for one new state, a subtitle that has a File row: 1deeba6a0 adds `_follow_sidecar_row` with its row-missing and target-taken branches, and 6b7dfd7ea adds a subtitle-row branch to the scanner, because the third R-5 run found rows flagged missing. So two consecutive rounds each special-cased that state at one consumer, and the two new findings are further consumers not yet handled: empty-folder tracking in `move_file` and the batch move loop. For this state the design is being patched. The question r2 raised, whether an upload should register a subtitle row at all, was answered by keeping the row, which leaves each path that assumes subtitles have no row to be corrected in turn. The other tag-related commits in the range belong to merged develop work and do not touch this design.
- r4 / claude-deep: Mostly no: the last round removed more state than it added, and the design stopped being patched on the strand that r2 and r3 flagged. c37fb760a added a copy-or-move branch, sibling claims, a longest-first order and a per-step name replay. 1deeba6a0 removed all four and added a new state, the subtitle's own row, with `_follow_sidecar_row` and its taken-path branch. 6b7dfd7ea then added a second branch for that state in the scanner. That was the repeating pattern: each round taught one more consumer about rows that uploads created and the scanner denied. bd49bc092 removes that state at its source: `_follow_sidecar_row`, the moved-pairs return value, the scanner's keep-and-recover branch and the tests for them all go, and uploads stop creating rows. It adds a different kind of thing: a subtitle branch in `complete_upload`, a one-time row drop in the scanner that runs on every scan, and a second response shape handled by an `isinstance` in the route and a union in the frontend client. None of these repeats a branch or prediction from the earlier rounds. The new shape does have consumers still to handle: the knowledge editor's dead link is recorded but not fixed, and the route skips `scan.complete`. The per-sidecar `target.exists()` prediction from r1 remains, and its known failures are now recorded as limits rather than patched. The remaining commits since r3 are merges, submodule pins and ledger corrections with no new branch in this feature.
- r4 / claude-read: Partly yes, and this round is mostly a removal. Earlier rounds added per-sidecar predictions (r2: copy-or-move, sibling claims, longest-first order, a replayed name state), which 1deeba6a0 removed, and then a new state, the subtitle's own row, with `_follow_sidecar_row` and a scanner branch that kept such rows alive. bd49bc092 removes that state: `_follow_sidecar_row`, the scanner's keep-and-recover branch, the moved-pairs return value and the per-row commit are all gone, and r2's still-open question, whether an upload should register a subtitle at all, is answered no. That is the first round to remove the source of the branches rather than add another one, and it closes all the r3 row findings. It does add branches of its own: a subtitle branch in `complete_upload`, a transitional row-drop block at the top of the scan, a union response with an isinstance check in the route, and a union return type in the frontend. The scanner therefore gains a subtitle-specific branch for the second round running, though with the opposite effect and with cleanup as its only job. The upload branch's early return is what skips `scan.complete`, and the rows are closed at upload but not at rename or create, so the remaining findings are at the edge of this one decision and not repeats of the earlier prediction pattern. The design is no longer being patched on the row strand. Sidecar placement itself is still one pass of per-sidecar `target.exists()` checks, with its known limits moved to the ledger and not redesigned. The other commits in the range are develop merges and submodule pins that do not touch this design.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: A subtitle upload is accepted with no content check. `get_subtitle` reads with `utf-8-sig` (routers/files.py:1358), so replacing a working track with a Shift-JIS `.srt`, which is common for Japanese subtitles, is expected to turn that track into a 500 with no captions shown. The drawer still shows success. The missing check is pre-existing, but before this round it could not destroy a working track through the app.; Uploading `movie.vtt` beside an existing `movie.srt` is not a replacement. Both remain and both are offered as the bare track, with the order set by listing order.; An open detail page keeps its track list and loaded cues after a subtitle is replaced or added. The sixth R-5 walk step 2 observed no refetch of the file in a second tab, although `drive.structure_changed` arrived.; `scan.complete` with `added` 0 is now sent for a scan that did not happen. Its subscribers read only the drive, so this looks harmless, but the payload no longer means a scan or an added file. Nothing distinguishes it from a real scan.
- claude-deep: Replacement has no confirmation and keeps no copy. Uploading a folder again answers 409 for its videos and notes but silently overwrites any hand-edited subtitle with the same name. The docs state the replacement, but not that it is unconditional and cannot be undone.
- claude-deep: An upload now replaces a file whose path a trashed row holds and deletes that row, so the trash entry can no longer be restored and its comments and tags go. Before this round the same upload answered 409 when the file was still on disk. `test_upload_over_a_path_holding_a_row_removes_the_row` pins the row's removal with no file at the path, not this overwrite.
- claude-deep: A detail page already open does not refetch its tracks after a subtitle upload: decisions.md:69 observed the WebSocket frames arrive with no `GET /api/files/<id>`, because only folder and drive views subscribe to `drive.structure_changed`. known-issues.md does not record this.
- claude-deep: A subtitle upload answers `removed: 0` in `scan.complete` even when it deleted a row. No current consumer branches on that value, since Intelligence only logs it.
- claude-read: A subtitle upload is accepted with no content check. `get_subtitle` reads with `utf-8-sig` (routers/files.py:1358), so replacing a working track with a Shift-JIS `.srt`, which is common for Japanese subtitles, is expected to turn that track into a 500 with no captions shown. The drawer still shows success. The missing check is pre-existing, but before this round it could not destroy a working track through the app.
- claude-read: Uploading `movie.vtt` beside an existing `movie.srt` is not a replacement. Both remain and both are offered as the bare track, with the order set by listing order.
- claude-read: An open detail page keeps its track list and loaded cues after a subtitle is replaced or added. The sixth R-5 walk step 2 observed no refetch of the file in a second tab, although `drive.structure_changed` arrived.
- claude-read: `scan.complete` with `added` 0 is now sent for a scan that did not happen. Its subscribers read only the drive, so this looks harmless, but the payload no longer means a scan or an added file. Nothing distinguishes it from a real scan.
- claude-verify: No document says whether replacing a .vtt should re-index a loft that already has transcript chunks.
- claude-verify: No document says whether a subtitle upload should validate encoding or the 5 MB serving limit before it replaces a working file.
- claude-verify: A detail page already open in a second tab keeps its old track list after a subtitle upload until it is reloaded (decisions.md:69).

### unspecified_behavior

Note: No document says whether replacing a .vtt should re-index a loft that already has transcript chunks.; No document says whether a subtitle upload should validate encoding or the 5 MB serving limit before it replaces a working file.; A detail page already open in a second tab keeps its old track list after a subtitle upload until it is reloaded (decisions.md:69).
- claude-deep: Replacement has no confirmation and keeps no copy. Uploading a folder again answers 409 for its videos and notes but silently overwrites any hand-edited subtitle with the same name. The docs state the replacement, but not that it is unconditional and cannot be undone.
- claude-deep: An upload now replaces a file whose path a trashed row holds and deletes that row, so the trash entry can no longer be restored and its comments and tags go. Before this round the same upload answered 409 when the file was still on disk. `test_upload_over_a_path_holding_a_row_removes_the_row` pins the row's removal with no file at the path, not this overwrite.
- claude-deep: A detail page already open does not refetch its tracks after a subtitle upload: decisions.md:69 observed the WebSocket frames arrive with no `GET /api/files/<id>`, because only folder and drive views subscribe to `drive.structure_changed`. known-issues.md does not record this.
- claude-deep: A subtitle upload answers `removed: 0` in `scan.complete` even when it deleted a row. No current consumer branches on that value, since Intelligence only logs it.
- claude-read: A subtitle upload is accepted with no content check. `get_subtitle` reads with `utf-8-sig` (routers/files.py:1358), so replacing a working track with a Shift-JIS `.srt`, which is common for Japanese subtitles, is expected to turn that track into a 500 with no captions shown. The drawer still shows success. The missing check is pre-existing, but before this round it could not destroy a working track through the app.
- claude-read: Uploading `movie.vtt` beside an existing `movie.srt` is not a replacement. Both remain and both are offered as the bare track, with the order set by listing order.
- claude-read: An open detail page keeps its track list and loaded cues after a subtitle is replaced or added. The sixth R-5 walk step 2 observed no refetch of the file in a second tab, although `drive.structure_changed` arrived.
- claude-read: `scan.complete` with `added` 0 is now sent for a scan that did not happen. Its subscribers read only the drive, so this looks harmless, but the payload no longer means a scan or an added file. Nothing distinguishes it from a real scan.
- claude-verify: No document says whether replacing a .vtt should re-index a loft that already has transcript chunks.
- claude-verify: No document says whether a subtitle upload should validate encoding or the 5 MB serving limit before it replaces a working file.
- claude-verify: A detail page already open in a second tab keeps its old track list after a subtitle upload until it is reloaded (decisions.md:69).

### unspecified_behavior

Note: Replacement has no confirmation and keeps no copy. Uploading a folder again answers 409 for its videos and notes but silently overwrites any hand-edited subtitle with the same name. The docs state the replacement, but not that it is unconditional and cannot be undone.; An upload now replaces a file whose path a trashed row holds and deletes that row, so the trash entry can no longer be restored and its comments and tags go. Before this round the same upload answered 409 when the file was still on disk. `test_upload_over_a_path_holding_a_row_removes_the_row` pins the row's removal with no file at the path, not this overwrite.; A detail page already open does not refetch its tracks after a subtitle upload: decisions.md:69 observed the WebSocket frames arrive with no `GET /api/files/<id>`, because only folder and drive views subscribe to `drive.structure_changed`. known-issues.md does not record this.; A subtitle upload answers `removed: 0` in `scan.complete` even when it deleted a row. No current consumer branches on that value, since Intelligence only logs it.
- claude-deep: Replacement has no confirmation and keeps no copy. Uploading a folder again answers 409 for its videos and notes but silently overwrites any hand-edited subtitle with the same name. The docs state the replacement, but not that it is unconditional and cannot be undone.
- claude-deep: An upload now replaces a file whose path a trashed row holds and deletes that row, so the trash entry can no longer be restored and its comments and tags go. Before this round the same upload answered 409 when the file was still on disk. `test_upload_over_a_path_holding_a_row_removes_the_row` pins the row's removal with no file at the path, not this overwrite.
- claude-deep: A detail page already open does not refetch its tracks after a subtitle upload: decisions.md:69 observed the WebSocket frames arrive with no `GET /api/files/<id>`, because only folder and drive views subscribe to `drive.structure_changed`. known-issues.md does not record this.
- claude-deep: A subtitle upload answers `removed: 0` in `scan.complete` even when it deleted a row. No current consumer branches on that value, since Intelligence only logs it.
- claude-read: A subtitle upload is accepted with no content check. `get_subtitle` reads with `utf-8-sig` (routers/files.py:1358), so replacing a working track with a Shift-JIS `.srt`, which is common for Japanese subtitles, is expected to turn that track into a 500 with no captions shown. The drawer still shows success. The missing check is pre-existing, but before this round it could not destroy a working track through the app.
- claude-read: Uploading `movie.vtt` beside an existing `movie.srt` is not a replacement. Both remain and both are offered as the bare track, with the order set by listing order.
- claude-read: An open detail page keeps its track list and loaded cues after a subtitle is replaced or added. The sixth R-5 walk step 2 observed no refetch of the file in a second tab, although `drive.structure_changed` arrived.
- claude-read: `scan.complete` with `added` 0 is now sent for a scan that did not happen. Its subscribers read only the drive, so this looks harmless, but the payload no longer means a scan or an added file. Nothing distinguishes it from a real scan.
- claude-verify: No document says whether replacing a .vtt should re-index a loft that already has transcript chunks.
- claude-verify: No document says whether a subtitle upload should validate encoding or the 5 MB serving limit before it replaces a working file.
- claude-verify: A detail page already open in a second tab keeps its old track list after a subtitle upload until it is reloaded (decisions.md:69).

## Findings

A: 0
B: 9
C: 0

### claude-deep:directory-at-subtitle-path-guard-unpinned — bucket B, LOW, open

Claim: No automated test fails if the `is_file()` half of `replaces_subtitle` is removed, so a directory with a subtitle name could pass the 409 check unnoticed.
Impact: If the guard is dropped, an upload to a directory named `movie.srt` passes init, sends every chunk, and then fails at `os.replace` with a 500 rather than a 409. The session also stays behind until the abandoned-upload cleanup. Only the manual walk covers this today.
Evidence: backend/app/services/upload.py:134. `test_an_existing_file_of_another_type_still_refuses_the_upload` uses `note.md`, which fails the `is_subtitle_file` half instead. No test in backend/tests/test_sidecar_subtitles_follow_video.py creates a directory with a subtitle name. decisions.md:71 walked it by hand. upload.py:235 handles only `_SizeMismatch`, so an OSError leaves the session in place.
Repro: Mutation reasoned, not run: change upload.py:134 to `replaces_subtitle = is_subtitle_file(filename)`. Every replacement test has a regular file at the path, and the 409 test has a `.md` name, so the mutant is predicted to survive.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a test that creates a directory named `movie.srt` and asserts that init answers 409 and the directory is unchanged.

</details>

### claude-deep:replaced-vtt-keeps-old-transcript-in-index — bucket B, LOW, open

Claim: Replacing a `.vtt` beside a loft whose transcript is already chunked changes the captions but not the indexed transcript, although the upload now announces a scan.
Impact: A user corrects `clip.vtt` by uploading it again. The player shows the corrected text, while Ask and search keep answering from the old text and citing it, with no message. Nothing reindexes it on a later reconcile either, so this is not a delay like the one r4 reported: the old text stays until the file is reindexed by hand.
Evidence: backend/app/services/upload.py:134-135 now allows the replacement, and backend/app/routers/uploads.py:82-87 emits `scan.complete`. addons/intelligence/app/indexer.py:138-139 `_loft_needs_reset` returns False once the loft is chunked, before it looks at the VTT, so `_reset_loft_refs_with_new_vtt` (:488, :620) leaves it alone. A grep of indexer.py finds no mtime comparison. addons/intelligence/app/workers/whisper.py:1731-1763 reads the VTT only when the indexing task runs. Before cde9bc7a3 the upload answered 409, so the app could not produce this state. decisions.md:67 says the sixth run started no addon service.
Repro: not_reproduced (read-only review; Intelligence was not run). Steps from reading the code: index a loft with `clip.vtt` until it has chunks, upload a corrected `clip.vtt`, wait for the reconcile that `scan.complete` triggers, then search for a phrase only the corrected file holds. Expected: no match, while a phrase from the old file still matches.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> When a subtitle upload replaced an existing `.vtt`, request a reindex of the matching loft, or record the limit in known-issues.md if it is accepted.

</details>

### claude-deep:replacement-misses-a-decomposed-sidecar-name — bucket B, LOW, rejected

Claim: Replacement compares the NFC upload name by exact path, so on a normalization-sensitive filesystem an NFD-named sidecar is not replaced and a second file with the same track identity appears.
Impact: On a Linux or NAS drive holding a sidecar copied from macOS, uploading the corrected subtitle leaves two files. The video lists the same track twice. A later rename or move carries whichever is listed first, so the old text can take the new name while the corrected file stays behind under the old name with only a backend warning. The user then sees the old captions after correcting them.
Evidence: backend/app/services/upload.py:120 normalizes the name through `validate_filename`, and :134 tests that exact path with `is_file()`. backend/app/services/subtitle.py:83-98 lists both files as the same language and normalizes both paths to the same NFC string, so both track entries serve one file. subtitle.py:119-123 keeps listing order, and :132-136 skips the second file because the first already took the target. backend/tests/test_listing_call_inventory.py:3-6 names this hazard class. `test_a_second_upload_replaces_the_file` uses an ASCII name only. decisions.md:17 walked an NFD rename on the Docker Desktop mount, not an NFD replacement.
Repro: not_reproduced (read-only review). Steps from reading the code, on a normalization-sensitive filesystem: place a video and an NFD-named `.srt` with the same dakuten stem, upload the NFC name, GET the file's `subtitles`, then rename the video. Expected: two entries with one path, and after the rename one file under the new stem and one under the old, chosen by listing order. APFS is expected to treat the two names as one file, so this would not reproduce there.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In the subtitle upload, find an existing file whose NFC name equals the upload's name and replace that entry, removing the old spelling, and add an NFD row to the replacement test.

</details>

### claude-deep:subtitle-only-folder-upload-stays-unlisted — bucket B, LOW, open

Claim: A subtitle upload into a folder with no records creates the directory but records no EmptyFolder row, so the folder is not listed until a scan.
Impact: Add, Folder with a folder holding only subtitles shows every file as complete, but neither the uploading tab nor another tab lists the folder, even after a reload. The user cannot browse to it from the UI, and the files have no card to show where they went. A rescan brings it back as 0 items. The `scan.complete` added this round refreshes the listing but gives it nothing new to show.
Evidence: backend/app/services/upload.py:182-198 `_finish_subtitle_upload` neither tracks nor untracks a folder, while backend/app/services/fileops.py:144 `_ensure_empty_folder_tracked` is the helper for this state. backend/app/services/atomic_write.py:47 creates the missing parents. decisions.md:75 observed the behavior in the sixth run with both tabs. `test_a_folder_holding_only_an_uploaded_subtitle_is_listed_as_empty` calls `_scan_and_register` first and creates the directory by hand, so it does not cover the state before a scan. docs/developer-guide/known-issues.md records the limit.
Repro: Observed by the author's run in decisions.md:75, not run by this reviewer: a folder holding only `alone.srt`, uploaded through Add, Folder, was absent from both tabs until a rescan.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Call `_ensure_empty_folder_tracked` for the upload's folder in `_finish_subtitle_upload`, and add a test with `relative_path` that asserts the listing without a scan.

</details>

### claude-deep:unreadable-replacement-discards-a-working-track — bucket B, LOW, open

Claim: A subtitle upload lands without checking that the file can be served, so a replacement that is not UTF-8 or is over 5 MB discards a working track and answers 200.
Impact: A Shift_JIS `.srt`, which is an ordinary encoding for Japanese subtitles, replaces a working UTF-8 file. The drawer shows success. The track request then fails, so the video shows no captions for that track and the page gives no reason. The earlier good file is gone, and the app holds no copy of it.
Evidence: backend/app/routers/files.py:1358 calls `read_text(encoding="utf-8-sig")` with no guard, so a decode error becomes a 500; backend/app/main.py has no matching exception handler. files.py:1354-1356 answers 413 over 5 MB. backend/app/services/upload.py:226-234 checks only the declared size before `os.replace`, and upload.py:249-250 finishes with no content check. The failing read predates this change; cde9bc7a3 adds the path that overwrites a good file with such a one. The sixth R-5 run used readable text only (decisions.md:68), and backend/tests/test_subtitle.py has no match for shift, cp932, sjis or utf-8-sig.
Repro: not_reproduced (read-only review). Steps from reading the code: upload `movie.mp4` and a UTF-8 `movie.srt`, upload a Shift_JIS `movie.srt` with Japanese text, then GET `/api/files/<id>/subtitles/0`. Expected: complete answers 200 and the GET answers 500.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Before replacing, refuse a subtitle upload that the serving route could not read (size and decoding), or make the route decode common encodings. Add a test that uploads a non-UTF-8 replacement.

</details>

### claude-read:decomposed-subtitle-not-replaced-and-doubles-the-track — bucket B, LOW, rejected

Claim: The replace check compares the exact composed name, so on a filesystem that keeps normalization forms apart, a sidecar stored decomposed is not replaced and the upload adds a second file for the same track.
Impact: A Japanese-named `動画.ja.srt` copied in from a Mac and stored in NFD stays on disk when the corrected subtitle is uploaded. The upload reports success. The video then lists two tracks with the same label, and the one shown first depends on listing order, so the old text can stay the default. Renaming the video afterwards makes both sidecars compete for one target, and the second stays behind under the old name.
Evidence: backend/app/services/upload.py:120 applies NFC through `validate_filename` (fileops.py:67), and :129 and :134 test that exact path with `target_full.is_file()`. backend/app/services/subtitle.py:52-58 and :83-98 match both spellings to the same stem and language and do not remove duplicates; :102 sorts by language only, so the sort keeps listing order. subtitle.py:129-136 gives both the same target in a move. The new tests use only ASCII names for replacement; `test_a_decomposed_sidecar_name_lands_under_the_composed_target` covers only the rename.
Repro: not_reproduced (read-only review). Steps on ext4 or another normalization-preserving filesystem: write an NFD `動画が.ja.srt` beside `動画が.mp4`, upload the NFC name with new text, then GET the file detail. Reading the code predicts two `ja` entries and both files on disk. On APFS through Docker Desktop the two names are expected to resolve to one file, so this needs another host.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the target folder when a subtitle is uploaded and replace any file whose NFC name equals the target, then add a parametrized NFD row beside `test_a_second_upload_replaces_the_file`.

</details>

### claude-read:replace-guard-for-a-directory-unpinned — bucket B, LOW, open

Claim: No automated test fails if the `target_full.is_file()` guard is removed from the replacement check.
Impact: Without the guard, a directory named `movie.srt` no longer stops the upload at init. The chunks are sent, and `os.replace` then fails at complete, so the user gets a 500 and an upload session that is never removed, where they now get a 409 before sending anything. The directory itself is not harmed. Only the manual walk covers this today.
Evidence: backend/app/services/upload.py:134. In backend/tests/test_sidecar_subtitles_follow_video.py, `test_an_existing_file_of_another_type_still_refuses_the_upload` covers the name half with `note.md`, and no test makes a directory with a subtitle name. backend/app/services/atomic_write.py:61 is where the failure would surface, and upload.py:235 catches only `_SizeMismatch`, so the cleanup at :246-247 is skipped. decisions.md sixth run step 4 walked this by hand.
Repro: Mutation reasoned, not run: change upload.py:134 to `replaces_subtitle = is_subtitle_file(filename)`. Every test in the file targets a regular file or a non-subtitle name, so all are predicted to pass: survives.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a test that creates a directory `a/movie.srt`, posts init for that name, and asserts a 409 with the directory unchanged.

</details>

### claude-read:replaced-vtt-leaves-search-index-on-old-captions — bucket B, LOW, open

Claim: Replacing the `.vtt` of a loft that already has transcript chunks does not re-index it, so Ask and search keep answering from the old captions although the new `scan.complete` makes it look handled.
Impact: A user imports `clip.loft`, whose captions are indexed, finds a mistake and uploads a corrected `clip.vtt`. The upload answers 200 and the file on disk is new. Ask and search still quote and find the old text, on every later reconcile, with nothing telling the user. For a loft the index is also the only place the correction could show, because known-issues.md records that embeds show no sidecar captions, so the upload has no visible effect. The per-file reindex is the only way out and nothing points to it.
Evidence: backend/app/services/upload.py:134-135 now lets the upload replace the file, and backend/app/routers/uploads.py:82-88 emits `scan.complete`. addons/intelligence/app/indexer.py:1110-1125 runs `reconcile`, and :620-688 resets `whisper_indexed` only when `_loft_needs_reset` is true. indexer.py:138-139 returns False as soon as the loft has chunks, without looking at the VTT. A search of addons/intelligence/app/workers/whisper.py for mtime or hash finds nothing, so no other check notices changed captions. addons/intelligence/tests/test_loft_vtt_sidecar.py covers a loft gaining a VTT, and its test names show no replaced-VTT case. decisions.md sixth run states addon services were not started, so this was not walked.
Repro: not_reproduced (read-only review). Steps: with Intelligence running, index `clip.loft` with `clip.vtt` holding OLD-TEXT, upload `clip.vtt` holding NEW-TEXT through Add, Files, let the reconcile run, then search for both strings. Reading the code predicts OLD-TEXT is still found and NEW-TEXT is not.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Have the reset compare the VTT with what was indexed, for example by storing its mtime or hash on the indexed row, and add a replaced-VTT test in addons/intelligence/tests/test_loft_vtt_sidecar.py. If this is deferred, record it in known-issues.md.

</details>

### claude-read:subtitle-upload-silently-overwrites-with-no-undo — bucket B, LOW, open

Claim: A subtitle upload now overwrites an existing subtitle file with no confirmation and no way to recover the old text, while every other file type in the same upload is refused.
Impact: A user re-drops an older copy of a folder. Each video and note fails with a visible 409, but each `.srt` and `.vtt` in it quietly replaces the one on disk and shows a check mark in the drawer. A subtitle corrected by hand since that copy is lost. A subtitle has no row, so it has no Trash entry and no version history to return to. The same happens when a different video's subtitle with the same stem is uploaded into the folder.
Evidence: backend/app/services/upload.py:134-136 skips the 409 for any subtitle name over an existing file. frontend/src/hooks/useUpload.ts:97-103 and :136-138 call init and complete with no prompt, and treat this answer like any other completion. `addFileEntries` (useUpload.ts:151) passes folder uploads through the same path. `_finish_subtitle_upload` (upload.py:182-198) records nothing about the replaced file. `test_a_second_upload_replaces_the_file` pins the overwrite. decisions.md sixth run step 3 shows the other types answering 409.
Repro: not_reproduced (read-only review). Steps: upload `a/movie.mp4` and `a/movie.srt` holding CORRECTED, then upload a folder `a` with `movie.mp4` and `movie.srt` holding OLD. Reading the code predicts a 409 on the video, 200 on the subtitle, and `a/movie.srt` holding OLD.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Answer with a flag or a distinct status when a file was replaced, so the drawer can say so, or keep the 409 for folder uploads, where `relative_path` is set, and allow replacing only for a single named file.

</details>

## Not verified

- claude-deep: No test, command, application or mutant was run, because this role has only Read, Glob and Grep. Every repro and mutation result is traced from the code, except those citing decisions.md, whose logs and screenshots were not opened.
- claude-deep: The worktree was read as it stands and assumed to match f08c2dd63, since the status snapshot shows that commit at HEAD with only the r5 directory untracked. Git could not confirm this or the submodule checkouts.
- claude-deep: Intelligence's behavior after a replaced VTT was read in `_loft_needs_reset` and grepped for mtime in indexer.py only. Other files in the addon, a manual reindex route and whether a transcript is compared elsewhere were not traced.
- claude-deep: Whether any deployment of this project uses a normalization-sensitive filesystem for a drive was not observed, and APFS behavior for the NFD case comes from general knowledge.
- claude-deep: What the frontend player shows when a track request answers 500 was not read beyond the player receiving a track URL.
- claude-deep: SQLite lock effects of the scan's early flush were not observed.
- claude-deep: docs/process documents other than the first 60 lines of review.md were not read in full, and .claude/rules files were listed but not read.
- claude-read: No test, command, application or mutant was run because this review is read-only, so every repro and mutation result is predicted from reading the code.
- claude-read: The worktree was read as it stands and assumed to match f08c2dd63; git was not available to confirm it. The status snapshot shows that commit at HEAD with only the r5 directory untracked.
- claude-read: The R-5 logs and screenshots cited in decisions.md were not opened; only the record was read, from line 50 on.
- claude-read: Intelligence was not run. The stale-index finding rests on indexer.py and a search of whisper.py; the rest of `_index_loft_vtt`, the full test file and whether another route resets chunked lofts on a schedule were not read beyond those searches.
- claude-read: Behavior on a normalization-preserving filesystem, and how Docker Desktop on APFS resolves NFD against NFC for `is_file` and `os.replace`, were not observed.
- claude-read: Whether a non-UTF-8 subtitle really answers 500 in the running app was not checked; it is inferred from `read_text` with no error handler in `get_subtitle`.
- claude-read: Of the repository's conventions only docs/process/review.md (first 60 lines) was read. .claude/rules and the other docs/process files were not read this round.
- claude-verify: No test, mutant, application or addon service was run, because this role has only Read, Glob and Grep. Every record rests on reading the code and the decision record.
- claude-verify: The worktree was read as it stands. r5/head.txt names f08c2dd63, but git could not confirm that the tree or the addon submodules match that commit.
- claude-verify: An NFD replacement on the real macOS bind mount was not observed. The two rejections rely on docs/specs/nfc-tolerant-name-matching.md:18-21 and :386-388 for how that host resolves paths.
- claude-verify: The state of upload.py on origin/develop was not read directly. The claim that its exact-path check is unchanged rests on the r4 triage record.
- claude-verify: Whether the UI exposes the per-file reindex route, and whether Media Import can overwrite a VTT beside a chunked loft, were not traced.
- claude-verify: The screenshots and logs cited in decisions.md were not opened, and decisions.md lines 46-63 were not read.

TOTAL: 9 findings
