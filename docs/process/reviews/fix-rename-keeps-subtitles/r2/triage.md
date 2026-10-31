# Triage: r2

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- claude-deep: Only c37fb760a changes code; ff3771cf5 and c5fcadfab record reviews and R-5. Compared with the first round, it added and removed nothing symmetrically: it removed no branch or state and added a copy-versus-move branch beside the earlier exists-then-skip branch, a claim state (`sibling_stems`, active or not), a per-step prediction of which name each batch row holds (`position`, `old_names`, `later`) and a global ordering rule. So yes, the round repeats the pattern of the one before, adding per-sidecar decisions on name matching rather than planning all source and target pairs at once. The design is being patched. Each addition fixed its reported case and has a counter-case at its edge: the copy branch leaves an orphan when the last claimant finds the target taken, the ordering handles only growing stems, and the plan-order premise fails on mixed extensions.
- claude-read: Yes, the design is being patched. ff3771cf5 and c5fcadfab are records only and change no code, so c37fb760a is the single code round since r1. The first implementation predicted disk state one sidecar at a time with `target.exists()`. c37fb760a adds more predictions of the same kind on top of it: a fixed longest-first order that predicts which names free up, a sibling list with a new copy-or-move branch, and in the batch path a `later` state that replays the name each row holds at each step. No branch, state or prediction was removed. Each new prediction covers the input it was written for and misses a neighbouring one: the reverse language-suffix rename, a batch target freed by a later row, and a same-stem pair acted on together. All three come from choosing per sidecar without first planning the final set of names.

Earlier runs:
- r1 / claude-read: First review. With no touch-point list declared, the place the change should reach and does not is `fileops.batch_rename`; every other video rename or move path reaches the new sidecar step.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: A shared sidecar becomes two independent files after a rename or move, so a later edit to one does not reach the other.; A sibling row marked missing claims sidecars just as a trashed one does, so renaming the surviving video leaves a copy for a file that may never return. No test covers the missing state.; Purging a trashed sibling removes only its own file (fileops.py:719-741), so the original the trashed row was claiming stays with no owner.; With a same-stem sibling, renaming `movie.mp4` to `movie.ja.mp4` copies `movie.ja.srt` and then finds the bare target occupied, because the claimed original was not moved away. The new video's bare track is then the old language track. This is reasoned from subtitle.py:141-149 and no test covers it.; A partial `shutil.copy2` failure can leave a truncated target, which detect_subtitles offers and later runs skip because the target exists.
- claude-deep: A claim lasts as long as the row exists, so a missing or trashed sibling that never returns makes each later rename copy instead of move. Purging that row (physical_delete at fileops.py:719) does not remove the sidecar it claimed, so the original then has no owner.
- claude-deep: Two copies of a shared sidecar diverge once either is edited. No document says a shared subtitle stops being shared after one video leaves.
- claude-deep: A sidecar arriving under a new stem becomes a track of any existing video with that stem, or of `x.mp4` when it arrives as `x.ja.srt`. For example, renaming `other.mp4` to `movie.ja.mp4` beside `movie.mp4` gives `movie.mp4` a Japanese track holding other's bare subtitle. r1 reported the general form and it is unchanged.
- claude-deep: `shutil.copy2` to a shared target can leave a partial file on failure, and detection would offer it while the next attempt would skip it because the target exists. This is the same shape as the partial `shutil.move` copy r1 noted, now also reachable on the same drive.
- claude-read: A shared sidecar becomes two independent files after a rename or move, so a later edit to one does not reach the other.
- claude-read: A sibling row marked missing claims sidecars just as a trashed one does, so renaming the surviving video leaves a copy for a file that may never return. No test covers the missing state.
- claude-read: Purging a trashed sibling removes only its own file (fileops.py:719-741), so the original the trashed row was claiming stays with no owner.
- claude-read: With a same-stem sibling, renaming `movie.mp4` to `movie.ja.mp4` copies `movie.ja.srt` and then finds the bare target occupied, because the claimed original was not moved away. The new video's bare track is then the old language track. This is reasoned from subtitle.py:141-149 and no test covers it.
- claude-read: A partial `shutil.copy2` failure can leave a truncated target, which detect_subtitles offers and later runs skip because the target exists.

### unspecified_behavior

Note: A claim lasts as long as the row exists, so a missing or trashed sibling that never returns makes each later rename copy instead of move. Purging that row (physical_delete at fileops.py:719) does not remove the sidecar it claimed, so the original then has no owner.; Two copies of a shared sidecar diverge once either is edited. No document says a shared subtitle stops being shared after one video leaves.; A sidecar arriving under a new stem becomes a track of any existing video with that stem, or of `x.mp4` when it arrives as `x.ja.srt`. For example, renaming `other.mp4` to `movie.ja.mp4` beside `movie.mp4` gives `movie.mp4` a Japanese track holding other's bare subtitle. r1 reported the general form and it is unchanged.; `shutil.copy2` to a shared target can leave a partial file on failure, and detection would offer it while the next attempt would skip it because the target exists. This is the same shape as the partial `shutil.move` copy r1 noted, now also reachable on the same drive.
- claude-deep: A claim lasts as long as the row exists, so a missing or trashed sibling that never returns makes each later rename copy instead of move. Purging that row (physical_delete at fileops.py:719) does not remove the sidecar it claimed, so the original then has no owner.
- claude-deep: Two copies of a shared sidecar diverge once either is edited. No document says a shared subtitle stops being shared after one video leaves.
- claude-deep: A sidecar arriving under a new stem becomes a track of any existing video with that stem, or of `x.mp4` when it arrives as `x.ja.srt`. For example, renaming `other.mp4` to `movie.ja.mp4` beside `movie.mp4` gives `movie.mp4` a Japanese track holding other's bare subtitle. r1 reported the general form and it is unchanged.
- claude-deep: `shutil.copy2` to a shared target can leave a partial file on failure, and detection would offer it while the next attempt would skip it because the target exists. This is the same shape as the partial `shutil.move` copy r1 noted, now also reachable on the same drive.
- claude-read: A shared sidecar becomes two independent files after a rename or move, so a later edit to one does not reach the other.
- claude-read: A sibling row marked missing claims sidecars just as a trashed one does, so renaming the surviving video leaves a copy for a file that may never return. No test covers the missing state.
- claude-read: Purging a trashed sibling removes only its own file (fileops.py:719-741), so the original the trashed row was claiming stays with no owner.
- claude-read: With a same-stem sibling, renaming `movie.mp4` to `movie.ja.mp4` copies `movie.ja.srt` and then finds the bare target occupied, because the claimed original was not moved away. The new video's bare track is then the old language track. This is reasoned from subtitle.py:141-149 and no test covers it.
- claude-read: A partial `shutil.copy2` failure can leave a truncated target, which detect_subtitles offers and later runs skip because the target exists.

## Findings

A: 0
B: 9
C: 0

### claude-deep:batch-cascade-keeps-the-wrong-tracks — bucket B, MEDIUM, open

Claim: A batch whose video names are valid in plan order, because extensions differ, carries sidecars against targets that later rows have not yet freed, so videos keep other videos' subtitles.
Impact: Renumbering `new.mp4`, `ep_1.mkv`, `ep_2.mp4` with template `ep_{n}`, each with a bare `.srt`, answers 200. `ep_1.mp4` then plays the old `ep_1.mkv` subtitle, `ep_2.mkv` plays the old `ep_2.mp4` subtitle, and `new.srt` is left detached with no owner. Only `ep_3.mp4` is right. The user is told nothing and sees wrong captions under correct labels.
Evidence: `_validate_no_duplicates` (fileops.py:1041-1060) compares full names, so `ep_1.mp4` is free while `ep_1.mkv` exists. `_carry_batch_sidecars` runs in plan order (fileops.py:1153), and its stated premise that an earlier rename frees the name holds only for the video's full name, not for the shared stem. Step by step: new's target `ep_1.srt` exists (subtitle.py:143) and is skipped; ep_1's target `ep_2.srt` exists and is skipped; ep_2's row is copied because the earlier row's new stem `ep_2` claims `ep_2.srt` (fileops.py:1173, subtitle.py:141, :149). `test_a_name_freed_earlier_in_the_batch_takes_its_sidecar` uses one extension only. On the base the same names would also find these wrong tracks by stem, so the misattachment predates the change and the new carry does not repair it.
Repro: Traced by reading, not run. Seed the three videos and new.srt, ep_1.srt, ep_2.srt in a/, then PUT batch/rename in that id order with template `ep_{n}`. Expected from the code: new.srt, ep_1.srt, ep_2.srt and ep_3.srt on disk, where ep_1.srt and ep_2.srt still hold their old content.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Plan every sidecar's source and target for the whole batch first, then apply them in an order or through temporary names that resolve chains, and add this cascade as a test.

</details>

### claude-deep:batch-internal-sibling-loop-untested — bucket B, LOW, open

Claim: No test fails if the loop that adds batch rows as siblings is removed, so the position-based name replay is unpinned.
Impact: If `fileops.py:1165-1173` were deleted or its `later` choice inverted, selecting `one.mp4` and `one.mkv` and renaming them with `clip_{n}` would move `one.srt` to `clip_1.srt` and leave `clip_2.mkv` with no track, with the suite still green. This is the exact shared-stem regression r1 reported, on the batch path.
Evidence: Of the four tests in `TestBatchRename`, three have no two batch rows sharing a stem or an outside row only. The fourth, `test_siblings_renamed_together_share_the_moved_sidecar`, gives both rows the same destination stem `x_one`, so moving and copying both satisfy its `_tracks` assertions. backend/tests/test_batch_rename.py has no match for srt, vtt or subtitle. No case has two same-stem batch rows going to different stems.
Repro: Mutation reasoned, not run. Delete fileops.py:1165-1173, then run backend/tests/test_sidecar_subtitles_follow_video.py. Step one moves one.srt to x_one.srt and step two finds no sidecar, so all tests are expected to pass: survives. Setting `later` to always False or always True is expected to survive too.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a batch test with `one.mp4`, `one.mkv` and `one.srt` under template `clip_{n}` that asserts clip_1.srt and clip_2.srt both exist and one.srt is gone.

</details>

### claude-deep:longest-first-breaks-the-inverse-rename — bucket B, LOW, open

Claim: Longest-name-first ordering solves only stems that grow, so renaming `movie.ja.mp4` back to `movie.mp4` deterministically leaves a track behind.
Impact: A user who renames `movie.mp4` to `movie.ja.mp4` with `movie.srt` and `movie.ja.srt`, which R-5 step 5 shows working, and then undoes it, loses the Japanese track with a 200 response. The result is `movie.srt` plus `movie.ja.ja.srt`, which matches no video and is invisible in the file list. A plain undo does not restore the earlier state.
Evidence: backend/app/services/subtitle.py:135 sorts longest first. With old stem `movie.ja` and new stem `movie`, `movie.ja.ja.srt` comes first and its target is `movie.ja.srt`, which still exists, so subtitle.py:143-147 skips it. `movie.ja.srt` then moves to `movie.srt`. `_parse_subtitle_filename` (subtitle.py:62-65) rejects `ja.ja` as a language for stem `movie`. `test_language_suffixed_stem_does_not_depend_on_listing_order` covers only the growing direction. Before c37fb760a this case depended on listing order; now it fails every time.
Repro: Traced by reading, not run. Seed a/movie.ja.mp4, a/movie.ja.srt and a/movie.ja.ja.srt, then PUT rename to movie.mp4. Expected from the code: a/ holds movie.ja.ja.srt, movie.mp4 and movie.srt; detect_subtitles('a/movie.mp4') returns only the bare track.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Order by whether each target is another sidecar's source (a topological order, or longest first only when the new stem is longer and shortest first when it is shorter), and add the round-trip rename as a test.

</details>

### claude-deep:same-destination-siblings-leave-orphan-sidecar — bucket B, LOW, open

Claim: When same-stem siblings are renamed or moved to the same new stem or folder together, the first copies the shared sidecar and the last finds the destination taken, so the original stays on disk with no owner.
Impact: After renaming `one.mp4` and `one.mkv` with a common prefix, or bulk-moving `movie.mp4` and `movie.mkv` to another folder or drive, a stale `one.srt` or `movie.srt` remains in the source folder. Subtitle files are hidden from the file list, so the user cannot see or delete it in the UI. The operation answers 200 with only a WARNING. A later video that takes that stem silently gets the old track, and after a bulk move the source folder is tracked as empty while it still holds the file.
Evidence: backend/app/services/fileops.py:1165-1174 gives the first row the later row's old stem, so subtitle.py:141 sets `shared` and subtitle.py:149 copies. For the second row, the earlier row's stem is `x_one`, so the sidecar is unclaimed, but subtitle.py:143-147 sees the target and continues before any removal. `move_file` reaches the same state through two `_carry_sidecars` calls (fileops.py:556, routers/files.py:402). backend/tests/test_sidecar_subtitles_follow_video.py `test_siblings_renamed_together_share_the_moved_sidecar` asserts only `_tracks`, not `_names`, so it passes with the leftover present although its name says the sidecar moved. The R-5 record's bulk-rename step used two different stems, and its shared-stem steps moved one video only.
Repro: Traced by reading, not run. Seed a/one.mp4, a/one.mkv and a/one.srt, then PUT /api/files/batch/rename with prefix `x_`. Expected from the code: a/ holds one.srt, x_one.mkv, x_one.mp4 and x_one.srt, with one WARNING. Adding `assert _names(...)` without one.srt to the existing test would fail.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> When the destination exists, the sidecar has no remaining claimant and the two files have identical content, remove the source. Make the existing test assert the full directory listing.

</details>

### claude-read:batch-inner-sibling-logic-unpinned — bucket B, LOW, open

Claim: No test depends on the loop that counts other batch rows as siblings, so deleting it or forcing its `later` choice survives the suite.
Impact: A later edit to `_carry_batch_sidecars` could drop the claim of a row still to come. Then `one.mp4` and `one.mkv` batch-renamed to different stems would move `one.srt` to the first video, and the second would silently lose its track. This is the regression the fix exists to prevent, and only the manual walk would notice, but the second R-5 run's batch rename step had no shared stem.
Evidence: backend/app/services/fileops.py:1165-1173 is the logic. The only batch test with a shared stem, `test_siblings_renamed_together_share_the_moved_sidecar`, gives both rows the same new stem `x_one` and checks only tracks. With the loop deleted, the first row moves `one.srt` to `x_one.srt` and the second finds nothing, so both still report the track. The other batch tests have no stem shared within the batch. decisions.md second run step 1 used `ep1` and `ep2`, which share nothing.
Repro: Mutation reasoned, not run. Replace fileops.py:1172 with `later = False`, or `later = True`, or delete lines 1165-1173. Tracing each batch test in backend/tests/test_sidecar_subtitles_follow_video.py predicts all three survive. A batch with `one.mp4` and `one.mkv`, template `clip_{n}`, asserting both tracks, would kill the first and third.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a batch row in which same-stem videos get different new stems, and assert that each has the track.

</details>

### claude-read:batch-sidecar-blocked-by-later-rename-gets-wrong-track — bucket B, LOW, open

Claim: Batch rename carries sidecars strictly in rename order, so a video whose new stem is still held by a later row's sidecar is blocked and ends up with that other video's subtitle.
Impact: Renaming `a.mp4` and `clip_1.mkv` with template `clip_{n}` returns 200. `clip_1.mp4` (formerly `a.mp4`) plays the captions of the former `clip_1.mkv`, its own `a.srt` stays behind unattached, and the user is told nothing. The wrong text appears under an ordinary track label.
Evidence: backend/app/services/fileops.py:1153-1174 runs one pass in plan order. `_validate_no_duplicates` (fileops.py:1026-1060) compares full names, so `clip_1.mp4` beside `clip_1.mkv` is allowed. Step 1: `a.srt` targets `clip_1.srt`, which exists, so subtitle.py:143-147 skips it. Step 2: old stem `clip_1`, and the earlier row now named `clip_1.mp4` counts as a sibling (fileops.py:1172-1173), so `clip_1.srt` is shared and copied to `clip_2.srt` and the original stays (subtitle.py:141, :148-149). detect_subtitles for `clip_1.mp4` then returns the former `clip_1.mkv` subtitle. `test_a_name_freed_earlier_in_the_batch_takes_its_sidecar` covers only the opposite order, and the known-issues collision entry describes a subtitle already at the destination, not one that the same batch is moving away.
Repro: not_reproduced (read-only review). Steps: seed a/a.mp4, a/clip_1.mkv, a/a.srt and a/clip_1.srt, then PUT /api/files/batch/rename with those ids in that order, mode template, template clip_{n}. Expected from the code: a/ holds clip_1.mp4, clip_1.srt (text of the old clip_1.srt), clip_2.mkv, clip_2.srt and a.srt.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Plan the sidecar renames for the whole batch before moving any, ordering them by which targets are freed, and add this input as a test row.

</details>

### claude-read:same-stem-pair-acted-on-together-leaves-orphan-copy — bucket B, LOW, open

Claim: When same-stem videos are moved or batch-renamed together under one destination stem, the first step copies the shared sidecar and the last step cannot move it, so a stale copy stays under the old name.
Impact: Selecting `movie.mp4` and `movie.mkv` and moving or prefixing them both leaves `movie.srt` behind in the old place, where no video needs it. Subtitle files do not appear in the file list, so the user cannot see it. A video later given the stem `movie` in that folder silently gets this stale text as its track. On a cross-drive move, a copy stays on the source drive after the user moved everything away.
Evidence: Batch rename: fileops.py:1172-1173 makes the later row claim the old stem, so subtitle.py:148-149 copies. The second row sees only the earlier row's new stem, so `shared` is false, and its target exists, so subtitle.py:143-147 skips and the source stays. Batch move: backend/app/routers/files.py:395-402 calls `move_file` per id, and fileops.py:556 evaluates siblings each time, which gives the same sequence. `test_siblings_renamed_together_share_the_moved_sidecar` asserts only `_tracks` of the new names and never the directory listing. No test seeds a same-stem pair through PUT /batch/move.
Repro: not_reproduced (read-only review). Steps: seed a/one.mp4, a/one.mkv and a/one.srt, then PUT /api/files/batch/rename with mode prefix_suffix, action add_prefix, value x_. Expected from the code: a/ holds x_one.mp4, x_one.mkv, x_one.srt and also one.srt, plus one warning in the backend log. The same pair through PUT /api/files/batch/move to b leaves a/one.srt.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> When the source is no longer claimed and its target holds identical content, remove the source, and assert the directory listing in the together test.

</details>

### claude-read:shortening-rename-loses-language-track — bucket B, LOW, open

Claim: The longest-name-first order fixes a rename that extends the stem but breaks the reverse rename, so renaming `movie.ja.mp4` back to `movie.mp4` strands the language track.
Impact: Undoing the rename the new test pins (`movie.mp4` to `movie.ja.mp4`, then back) returns 200, but `movie.ja.ja.srt` stays under its old name and the Japanese track disappears from the player. A rename the user reverses does not restore the tracks, and only a backend warning records it.
Evidence: backend/app/services/subtitle.py:135 sorts longest first unconditionally. With old stem `movie.ja`, new stem `movie`, and sidecars `movie.ja.ja.srt` and `movie.ja.srt`: the first item targets `movie.ja.srt` (subtitle.py:140), which still exists, so subtitle.py:143-147 logs and skips it. The second then moves to `movie.srt`. `_parse_subtitle_filename('movie', movie.ja.ja.srt)` returns None because `ja.ja` fails the regex at subtitle.py:64. `test_language_suffixed_stem_does_not_depend_on_listing_order` tests only the extending direction.
Repro: not_reproduced (read-only review). Steps: seed a/movie.mp4 with a/movie.srt and a/movie.ja.srt, PUT rename to movie.ja.mp4, then PUT rename back to movie.mp4. Expected from the code: a/ holds movie.mp4, movie.srt and movie.ja.ja.srt, and detect_subtitles offers only the bare track, where it offered two before the round trip.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Stop depending on one fixed order, for example by retrying skipped items after the others have moved, and add the round trip as a test row.

</details>

### claude-read:uploaded-sidecar-row-left-pointing-at-old-path — bucket B, LOW, open

Claim: A subtitle uploaded through the UI has a File row, and carrying that sidecar moves the file without updating the row.
Impact: A user who drops `movie.mp4` and `movie.ja.srt` together and then renames the video keeps a `movie.ja.srt` entry whose file is gone, so opening it should fail with not-found until a scan marks it missing. The rename itself reports full success.
Evidence: backend/app/services/upload.py:222-224 classifies with no subtitle guard, and upload.py:302-316 adds a File row, reached from backend/app/routers/uploads.py:77. The guards at scanner.py:344 and :451 are on scanner paths only. subtitle.py:148-151 moves the file on disk with no database write, and neither `_carry_sidecars` (fileops.py:401-410) nor `_carry_batch_sidecars` updates rows. A grep found no subtitle filter on listings in routers/drives.py beyond the kind vocabulary (:97-109, :205). Every test in test_sidecar_subtitles_follow_video.py writes sidecars straight to disk through `_sidecars`.
Repro: not_reproduced (read-only review). Steps: upload a/movie.mp4 and a/movie.ja.srt through the upload API, PUT rename movie.mp4 to film.mp4, then GET the listing of a and the row for movie.ja.srt. Expected from the code: the row keeps file_path a/movie.ja.srt, and a/film.ja.srt exists on disk.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Decide whether uploads should register subtitle files at all. If they should not, skip the row in `complete_upload` the same way `scanner` does.

</details>

## Not verified

- claude-deep: No test or application was run because this role has read-only tools. Every repro and mutation result is traced from the code, not observed.
- claude-deep: The R-5 logs and screenshots cited in decisions.md were not opened; only the record itself was read.
- claude-deep: The cost of per-row directory listing was not measured on any real mount.
- claude-deep: The tree was read from the worktree, not extracted from c5fcadfab with git; the branch head was stated to be that commit with only r2 untracked.
- claude-deep: The addons were checked by grep for `.vtt` and `match_siblings` only. Intelligence's handling of a copied sidecar was not traced, and its whisper.py and indexer.py lines were taken from r1 and not reread.
- claude-deep: The frontend was not read, and whether the UI lets a user order a batch as the cascade finding requires was not checked; the API accepts the order given in `ids`.
- claude-read: No test, command or application was run, because this review is read-only. Every repro and mutation result is predicted from reading the code.
- claude-read: The review was read from the worktree without using git, so I did not confirm that the files on disk are exactly the tree of c5fcadfab beyond their matching the supplied diff.
- claude-read: Whether the frontend lets a user upload `.srt` files without a filter was checked only by a grep of upload-named frontend files, and the listing and detail response for a stale subtitle row was not traced end to end.
- claude-read: The R-5 logs and screenshots cited in decisions.md were not opened.
- claude-read: Behavior on a real case-insensitive or normalization-folding mount was not observed.
- claude-read: Addon reactions to sidecars copied rather than moved (intelligence and media_import) were not traced.
- claude-verify: Nothing was executed: this role has only Read, Glob and Grep, so every trace, including the mutant outcomes, comes from reading the code.
- claude-verify: The checkout was read as is and assumed to match c5fcadfab, since the git status snapshot shows that commit at HEAD and git could not be run; the base was compared only through r1/triage.md and detect_subtitles.
- claude-verify: How an uploaded subtitle row renders in the frontend listing, and what opening it does after a carry, was not checked.
- claude-verify: Actual `iterdir()` order and case or normalization behaviour were not observed on APFS, ext4 or a Docker Desktop bind mount.
- claude-verify: The referenced R-5 logs and screenshots under /private/tmp were not opened; only decisions.md was read.

TOTAL: 9 findings
