# Triage: r1

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- claude-read: First review. With no touch-point list declared, the place the change should reach and does not is `fileops.batch_rename`; every other video rename or move path reaches the new sidecar step.

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

Note: When the destination already holds a same-named subtitle, the request returns 200 with no user-visible message, the video's own sidecar stays behind under the old name, and the video now shows the other file's captions. The R-5 walk in decisions.md step 6 observed this and only a backend WARNING records it. The behavior is deliberate and tested for not overwriting, but no document states that the user sees another video's captions and is not told.; A sidecar move failure after the commit is logged only, so the API response reports full success while some tracks are detached. This is deliberate best effort, but the user cannot see it.; A video moved to another drive takes its subtitles along, including from a locked drive to an open one. The video itself moves the same way, so this looks consistent, but it is not stated.
- claude-deep: Same-stem siblings: which file owns a shared sidecar is undefined, and the code gives it to whichever file is renamed or moved first.
- claude-deep: A sidecar arriving beside an existing same-stem video becomes that video's track as well.
- claude-deep: A collision at the destination yields a partial move reported as plain success.
- claude-deep: A cross-drive sidecar move goes through shutil.move's copy and unlink, so a failure mid-copy can leave a partial target that detect_subtitles offers as a track, and a retry would then skip it because the target exists.
- claude-deep: Intelligence's loft lookup uses the broader pattern `stem*.vtt` (addons/intelligence/app/workers/whisper.py:1745), while core moves only names matching the two-or-three-letter language rule. A `clip.notes.vtt` beside a loft stays behind on rename; before this commit it also stayed, so this is unchanged but now differs from the moved set.
- claude-read: When the destination already holds a same-named subtitle, the request returns 200 with no user-visible message, the video's own sidecar stays behind under the old name, and the video now shows the other file's captions. The R-5 walk in decisions.md step 6 observed this and only a backend WARNING records it. The behavior is deliberate and tested for not overwriting, but no document states that the user sees another video's captions and is not told.
- claude-read: A sidecar move failure after the commit is logged only, so the API response reports full success while some tracks are detached. This is deliberate best effort, but the user cannot see it.
- claude-read: A video moved to another drive takes its subtitles along, including from a locked drive to an open one. The video itself moves the same way, so this looks consistent, but it is not stated.
- claude-verify: On a destination collision, the operation returns success, the sidecar stays behind and the video plays the file already at the destination (subtitle.py:132-136).
- claude-verify: Moved sidecars attach to whichever video holds the target stem: renaming movie.mp4 to film.mp4 when film.webm exists gives film.webm the moved tracks, because detection is stem-based (subtitle.py:83-88).
- claude-verify: A sidecar is moved even when a trashed or other same-stem video also relies on it (subtitle.py:119-123).

### unspecified_behavior

Note: On a destination collision, the operation returns success, the sidecar stays behind and the video plays the file already at the destination (subtitle.py:132-136).; Moved sidecars attach to whichever video holds the target stem: renaming movie.mp4 to film.mp4 when film.webm exists gives film.webm the moved tracks, because detection is stem-based (subtitle.py:83-88).; A sidecar is moved even when a trashed or other same-stem video also relies on it (subtitle.py:119-123).
- claude-deep: Same-stem siblings: which file owns a shared sidecar is undefined, and the code gives it to whichever file is renamed or moved first.
- claude-deep: A sidecar arriving beside an existing same-stem video becomes that video's track as well.
- claude-deep: A collision at the destination yields a partial move reported as plain success.
- claude-deep: A cross-drive sidecar move goes through shutil.move's copy and unlink, so a failure mid-copy can leave a partial target that detect_subtitles offers as a track, and a retry would then skip it because the target exists.
- claude-deep: Intelligence's loft lookup uses the broader pattern `stem*.vtt` (addons/intelligence/app/workers/whisper.py:1745), while core moves only names matching the two-or-three-letter language rule. A `clip.notes.vtt` beside a loft stays behind on rename; before this commit it also stayed, so this is unchanged but now differs from the moved set.
- claude-read: When the destination already holds a same-named subtitle, the request returns 200 with no user-visible message, the video's own sidecar stays behind under the old name, and the video now shows the other file's captions. The R-5 walk in decisions.md step 6 observed this and only a backend WARNING records it. The behavior is deliberate and tested for not overwriting, but no document states that the user sees another video's captions and is not told.
- claude-read: A sidecar move failure after the commit is logged only, so the API response reports full success while some tracks are detached. This is deliberate best effort, but the user cannot see it.
- claude-read: A video moved to another drive takes its subtitles along, including from a locked drive to an open one. The video itself moves the same way, so this looks consistent, but it is not stated.
- claude-verify: On a destination collision, the operation returns success, the sidecar stays behind and the video plays the file already at the destination (subtitle.py:132-136).
- claude-verify: Moved sidecars attach to whichever video holds the target stem: renaming movie.mp4 to film.mp4 when film.webm exists gives film.webm the moved tracks, because detection is stem-based (subtitle.py:83-88).
- claude-verify: A sidecar is moved even when a trashed or other same-stem video also relies on it (subtitle.py:119-123).

### unspecified_behavior

Note: Same-stem siblings: which file owns a shared sidecar is undefined, and the code gives it to whichever file is renamed or moved first.; A sidecar arriving beside an existing same-stem video becomes that video's track as well.; A collision at the destination yields a partial move reported as plain success.; A cross-drive sidecar move goes through shutil.move's copy and unlink, so a failure mid-copy can leave a partial target that detect_subtitles offers as a track, and a retry would then skip it because the target exists.; Intelligence's loft lookup uses the broader pattern `stem*.vtt` (addons/intelligence/app/workers/whisper.py:1745), while core moves only names matching the two-or-three-letter language rule. A `clip.notes.vtt` beside a loft stays behind on rename; before this commit it also stayed, so this is unchanged but now differs from the moved set.
- claude-deep: Same-stem siblings: which file owns a shared sidecar is undefined, and the code gives it to whichever file is renamed or moved first.
- claude-deep: A sidecar arriving beside an existing same-stem video becomes that video's track as well.
- claude-deep: A collision at the destination yields a partial move reported as plain success.
- claude-deep: A cross-drive sidecar move goes through shutil.move's copy and unlink, so a failure mid-copy can leave a partial target that detect_subtitles offers as a track, and a retry would then skip it because the target exists.
- claude-deep: Intelligence's loft lookup uses the broader pattern `stem*.vtt` (addons/intelligence/app/workers/whisper.py:1745), while core moves only names matching the two-or-three-letter language rule. A `clip.notes.vtt` beside a loft stays behind on rename; before this commit it also stayed, so this is unchanged but now differs from the moved set.
- claude-read: When the destination already holds a same-named subtitle, the request returns 200 with no user-visible message, the video's own sidecar stays behind under the old name, and the video now shows the other file's captions. The R-5 walk in decisions.md step 6 observed this and only a backend WARNING records it. The behavior is deliberate and tested for not overwriting, but no document states that the user sees another video's captions and is not told.
- claude-read: A sidecar move failure after the commit is logged only, so the API response reports full success while some tracks are detached. This is deliberate best effort, but the user cannot see it.
- claude-read: A video moved to another drive takes its subtitles along, including from a locked drive to an open one. The video itself moves the same way, so this looks consistent, but it is not stated.
- claude-verify: On a destination collision, the operation returns success, the sidecar stays behind and the video plays the file already at the destination (subtitle.py:132-136).
- claude-verify: Moved sidecars attach to whichever video holds the target stem: renaming movie.mp4 to film.mp4 when film.webm exists gives film.webm the moved tracks, because detection is stem-based (subtitle.py:83-88).
- claude-verify: A sidecar is moved even when a trashed or other same-stem video also relies on it (subtitle.py:119-123).

## Findings

A: 0
B: 9
C: 0

### claude-deep:batch-rename-leaves-sidecars — bucket B, HIGH, open

Claim: The batch rename path renames videos without moving their sidecar subtitles, so the detachment this commit addresses still happens through the selection bar's Rename.
Impact: A user who selects videos and uses Rename in the selection bar gets HTTP 200 and new names, but `movie.ja.srt` stays under the old stem. The detail page silently loses those tracks and falls back to the generated track or none. The known-issues entry that warned about this is deleted and the user guide now says renaming takes them along, so nothing records the remaining path.
Evidence: backend/app/services/fileops.py:1043-1104 (`batch_rename`) calls `old_full.rename(new_full)` at :1089 and has no `move_sidecar_subtitles` call; the only call sites are :437 and :528. It is reachable through backend/app/routers/files.py:457-477 and frontend/src/components/BatchRenameDialog.tsx, and docs/user-guide/upload-and-fileops.md:39-45 documents it. `detect_subtitles` (subtitle.py:69-103) matches on the current stem, so the old sidecars no longer match. backend/tests/test_sidecar_subtitles_follow_video.py only exercises PUT /rename and PUT /move, and no backend/tests/*batch* file mentions srt, vtt or subtitle.
Repro: Not run (read-only reviewer); derived from the code. Seed a/movie.mp4 and a/movie.ja.srt, then PUT /api/files/batch/rename with that id in template mode producing film.mp4. Expected from the code: a/ holds film.mp4 and movie.ja.srt, and detect_subtitles('a/film.mp4') returns [].
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> After `db.commit()` in `batch_rename`, call `move_sidecar_subtitles(old, new)` for each completed rename of a file that `_serves_subtitles` accepts, in plan order, using the old and new paths already held in `completed_fs`. Add a batch rename case to the new test file.

</details>

### claude-read:batch-rename-still-detaches — bucket B, HIGH, open

Claim: The bulk rename path `fileops.batch_rename` renames videos without calling `move_sidecar_subtitles`, so sidecar subtitles still detach when a video is renamed through it.
Impact: A user who selects videos and uses the selection bar's rename dialog gets a 200 and renamed files, but `movie.ja.srt` stays under the old name and the detail page stops offering the track, falling back to the generated track or none. This is the symptom the change sets out to remove, and the commit deletes the known-issues entry that warned about it while the user guide now says renaming takes subtitles along.
Evidence: backend/app/services/fileops.py:1089 does `old_full.rename(new_full)` and backend/app/services/fileops.py:1092 calls `_update_file_after_rename` (fileops.py:1107-1122), which moves the thumbnail and updates the row but has no sidecar step. The only `move_sidecar_subtitles` calls are fileops.py:437 and fileops.py:528. Reached from backend/app/routers/files.py:471 via `PUT /api/files/batch/rename`, frontend/src/lib/api.ts:522, frontend/src/components/BatchRenameDialog.tsx:89 and frontend/src/components/SelectionBar.tsx:435. backend/tests/test_batch_rename.py has no mention of srt, vtt or subtitle, test_sidecar_subtitles_follow_video.py has no batch rename case, and the R-5 walk in decisions.md covers bulk move only.
Repro: not_reproduced (read-only review). Steps: place `a/movie.mp4` and `a/movie.ja.srt`, register the video, call `PUT /api/files/batch/rename` with its id and a mode that changes the stem. Reading the code predicts `a/movie.ja.srt` remains and `detect_subtitles` returns no track for the new name.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> After `db.commit()` in `batch_rename`, call `move_sidecar_subtitles` for each completed rename whose file satisfies `_serves_subtitles`, in rename order, and add a batch case to the new test file. If it is deferred instead, restore a known-issues entry naming the bulk rename.

</details>

### claude-deep:shared-stem-sidecar-taken-from-sibling — bucket B, MEDIUM, open

Claim: Sidecars are moved by stem alone, so a subtitle that also serves another file with the same stem is taken away from that file.
Impact: With `movie.mp4`, `movie.mkv` (or `movie.loft`) and `movie.srt` in one folder, renaming or moving `movie.mp4` silently removes the track from `movie.mkv`, possibly to another folder or drive. The same applies to `a.mp4` and `a.ja.mp4` sharing `a.ja.srt`, and to a trashed sibling, whose file stays on disk and is restored without its subtitles. In the other direction, a sidecar arriving beside an existing `film.mkv` becomes a track of that video too. Before this commit the sibling kept its subtitles.
Evidence: backend/app/services/subtitle.py:119-123 selects every file `_parse_subtitle_filename(old_stem, item)` accepts, with no knowledge of other videos. backend/app/services/fileops.py:436-437 and :527-528 pass only the two paths. `delete_file` (fileops.py:716-732) keeps the file on disk. No test in test_sidecar_subtitles_follow_video.py has two subtitle-serving files sharing a stem.
Repro: Not run (read-only reviewer); derived from the code. Seed a/movie.mp4 and a/movie.mkv as video rows plus a/movie.srt, then PUT rename movie.mp4 to film.mp4. Expected from the code: a/ holds film.mp4, film.srt and movie.mkv, and detect_subtitles('a/movie.mkv') returns [].
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In fileops.py, before moving, check whether another row (active or trashed) in the old folder still claims the sidecar under the same parsing rule. If one does, leave the sidecar in place and log it, and add a test for the shared-stem case.

</details>

### claude-read:shared-stem-sidecars-taken-from-sibling — bucket B, MEDIUM, open

Claim: `move_sidecar_subtitles` moves every subtitle matching the old stem without checking whether another file in the folder still uses that stem, so renaming or moving one video removes the tracks from a sibling that shares them.
Impact: With `movie.mp4` and `movie.mkv` or `movie.loft` side by side, both are offered `movie.ja.srt` by `detect_subtitles`. Renaming or moving `movie.mp4` silently leaves the remaining sibling with no subtitle track, and there is no message. Before this commit the same action left the sibling's tracks intact, so this is a new silent wrong result in normal use. The same applies to `movie.mp4` next to `movie.ja.mp4`, where `movie.ja.srt` is the second video's bare track and also matches the first video's language pattern.
Evidence: backend/app/services/subtitle.py:119-123 selects sidecars by name only through `_parse_subtitle_filename`, and subtitle.py:137 moves them. backend/app/services/fileops.py:436-437 and fileops.py:527-528 pass no information about siblings. backend/app/services/subtitle.py:83-88 shows detection is stem-based, so two videos with the same stem share a track. `resolve_db_path_conflict` and the 409 checks compare full names, so same-stem videos with different extensions are permitted. backend/app/services/filetype.py:33 classes `.loft` as video, so it qualifies too. No test in backend/tests/test_sidecar_subtitles_follow_video.py seeds two videos with one stem.
Repro: not_reproduced (read-only review). Steps: seed `a/movie.mp4` and `a/movie.mkv` as video rows plus `a/movie.ja.srt`, then `PUT /api/files/<mp4 id>/rename` to `film.mp4`. Reading the code predicts `a/film.ja.srt` exists and `detect_subtitles('a/movie.mkv', drive)` returns an empty list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Before moving, check the old directory for another file with the old stem that serves subtitles and leave the sidecars in place when one exists, logging a warning, or copy instead of move in that case. Add a test with two same-stem videos.

</details>

### claude-deep:collision-silently-mixes-tracks — bucket B, LOW, open

Claim: When a destination sidecar already exists, the operation returns success with only a backend log warning, leaving the video playing another video's track while its own stays behind.
Impact: After a move or rename into a name that collides, the player offers the track under the same label but shows the other video's text, and the user gets no message. The user's own subtitle remains under the old location with no sign in the UI, and subtitle files do not appear in the file list.
Evidence: backend/app/services/subtitle.py:132-136 logs a warning and continues; `move_sidecar_subtitles` returns None and fileops.py:437 and :528 ignore the outcome. docs/process/reviews/fix-rename-keeps-subtitles/decisions.md step 6 records PUT move 200, no message on the page, and Subtitles showing LEFTOVER-OF-ANOTHER-VIDEO. test_sidecar_subtitles_follow_video.py `test_existing_destination_is_not_overwritten` asserts only the files on disk.
Repro: Observed by the author's run in decisions.md step 6 (not run by this reviewer): moving beta/film.mp4 into beta/leftover, which already held film.srt, returned 200 and the page showed the leftover text.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Have `move_sidecar_subtitles` return the sidecars it left behind and surface them in the rename and move responses so the UI can tell the user.

</details>

### claude-deep:language-suffixed-stem-order-dependent — bucket B, LOW, open

Claim: Renaming to a stem that extends the old stem with a language-like part gives a result that depends on directory listing order.
Impact: Renaming `movie.mp4` to `movie.ja.mp4` with both `movie.srt` and `movie.ja.srt` present can leave `movie.srt` behind if it is processed first, because its target `movie.ja.srt` still exists at that moment. The default track is then lost while the other order succeeds, so the outcome varies by filesystem.
Evidence: backend/app/services/subtitle.py:119-123 keeps `iterdir()` order without sorting, and :128-137 checks `target.exists()` per item while earlier items are still unmoved. For this rename, `movie.srt` targets `movie.ja.srt` and `movie.ja.srt` targets `movie.ja.ja.srt`.
Repro: Not run (read-only reviewer); derived from the code. Call move_sidecar_subtitles with old a/movie.mp4 and new a/movie.ja.mp4 with both sidecars present, forcing `movie.srt` first in the listing. Expected from the code: `movie.srt` stays and a warning is logged.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Process sidecars longest name first, so `movie.ja.srt` vacates its name before `movie.srt` needs it, and add a test for this rename.

</details>

### claude-deep:nfc-slice-untested — bucket B, LOW, open

Claim: No automated test covers the NFC handling in `move_sidecar_subtitles`, so removing the normalization that keeps the name slice aligned would pass the suite.
Impact: A later edit that drops the normalization at subtitle.py:129 would slice an NFD name at the NFC stem's length, producing a garbled target name on drives that hold NFD names. Japanese filenames are in normal use here, and the only check of this path is the manual walk in decisions.md.
Evidence: backend/app/services/subtitle.py:113 and :129-130 compute `name[len(old_stem):]` on NFC text. test_sidecar_subtitles_follow_video.py uses ASCII names only. test_listing_call_inventory.py `test_stored_name_listings_normalize` only requires some normalize call in the function, and :113 would still satisfy it. backend/tests/test_subtitle.py:148-157 shows an NFD fixture is possible for detection.
Repro: Mutation reasoned, not run: change subtitle.py:129 to `name = item.name`. The new test file uses only ASCII names, so its slices are unchanged, and the inventory test still sees the normalize call at :113. Expected result: survives.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a test that writes an NFD sidecar beside an NFC-stored video, renames it, and asserts the exact NFC target name, following backend/tests/test_subtitle.py:148-157.

</details>

### claude-read:nfd-target-name-untested — bucket B, LOW, open

Claim: No automated test exercises `move_sidecar_subtitles` with a decomposed (NFD) sidecar name, so the NFC slice that builds the target name can regress unnoticed.
Impact: If `name = unicodedata.normalize('NFC', item.name)` is dropped, a sidecar stored in NFD on disk gets a target built from a wrong slice offset, because the NFC stem is shorter than the NFD name's stem. It would be silently renamed to a garbled name such as `案内` plus the tail of the old stem and `.ja.srt`, and detached from the video. Japanese names on a macOS-sourced drive are the normal case for this project.
Evidence: backend/app/services/subtitle.py:129-130 slices the normalized name by `len(old_stem)`. A search for `NFD` and `normaliz` in backend/tests/test_sidecar_subtitles_follow_video.py returns nothing. backend/tests/test_subtitle.py:153 covers NFD for detection only. backend/tests/test_listing_call_inventory.py:109-116 only checks that `unicodedata.normalize` is called somewhere in the function, which `old_stem` at subtitle.py:113 still satisfies under this mutation. The manual NFD walk in decisions.md is not a regression test.
Repro: Mutation reasoned, not run: replace subtitle.py:129 with `name = item.name`. Every test in the new file uses ASCII names, where NFC and NFD agree, and the inventory test still sees a normalize call, so the mutant is expected to survive.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a test that seeds a Japanese-named video with an NFD-named `.ja.srt`, renames the video, and asserts the target name is exactly the new stem plus `.ja.srt`.

</details>

### claude-verify:case-only-rename-sidecars-stay-detached — bucket B, LOW, open

Claim: A case-only rename of a video on a case-insensitive Docker Desktop bind mount does not carry its sidecars to the new stem's case, so the video loses its tracks.
Impact: After `Movie.mp4` -> `movie.mp4` on the macOS setup that known-issues.md describes, the row's stem is `movie` while the sidecar on disk is still `Movie.srt`. The stem comparison is case-sensitive, so the detail page offers no track or the generated one. The rename returns 200 with no message.
Evidence: backend/app/services/subtitle.py:115 returns early only when the NFC stems are exactly equal, so a case-only rename reaches the loop. At subtitle.py:132 `target.exists()` is either true on a case-insensitive mount (warning, no move), or false and `shutil.move` at :137 does nothing, per docs/developer-guide/known-issues.md:263-267, which says a case-only rename does nothing inside the container. Either way the sidecar keeps its old case. subtitle.py:58 and :61 compare stems case-sensitively, and detect_subtitles takes the stem from the DB path at subtitle.py:74 and :79. backend/app/services/fileops.py:421-422 stores the new case. test_sidecar_subtitles_follow_video.py has no case-only rename test.
Repro: not_reproduced: traced by reading only, because this role cannot run commands. Expected steps on a Docker Desktop macOS bind mount: place `Movie.mp4` and `Movie.srt`, rename to `movie.mp4` through File actions, then open the Settings panel.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record it in the existing known-issues entry for case-only renames, or make the sidecar stem comparison case-insensitive if the owner wants it fixed.

</details>

## Not verified

- claude-deep: No test or application was run; this reviewer has read-only tools, so every repro is derived from reading the code except where it cites decisions.md, and the screenshots and logs cited there were not opened.
- claude-deep: Behavior on a real case-folding or normalization-folding mount; collision and case-only rename analysis on such mounts comes from reading the code and the comments in fileops.py.
- claude-deep: Whether the intelligence indexer's reaction to files.moved handles a loft whose VTT now follows it beyond the lines read in indexer.py and whisper.py.
- claude-deep: Whether a spec for this change exists or is required under docs/process/workflow.md Skips; that document was not read.
- claude-deep: Frontend behavior of BatchRenameDialog beyond confirming that it calls the batch rename API.
- claude-read: No test, command or application was run because this review is read-only, so every repro and mutation result is predicted from reading the code.
- claude-read: The batch rename repro was not run. The frontend trace stops at the dialog and selection bar components, and I did not check that the selection bar offers rename for video selections at runtime.
- claude-read: What the knowledge addon's rename call at addons/knowledge/app/main.py:94 renames was not read beyond the client method, so I did not check whether it ever targets a video.
- claude-read: The R-5 evidence in decisions.md (logs and screenshots under a scratch path) was not opened.
- claude-read: Behavior on network or cross-device filesystems for `shutil.move` of sidecars was not checked, and neither were other addons reacting to `files.moved`.
- claude-verify: No code or test was executed, because this role has only Read, Glob and Grep. All reproductions are traces through the code, plus the R-5 record in decisions.md for the collision.
- claude-verify: The R-5 logs and screenshots under /private/tmp cited in decisions.md were not opened.
- claude-verify: The actual iterdir order on APFS, ext4 or a Docker Desktop bind mount was not observed for the language-suffixed rename.
- claude-verify: Case-only rename behaviour on a Docker Desktop bind mount was taken from known-issues.md and not observed.
- claude-verify: Whether the tree read in this worktree matches c2e5b8840 exactly was not checked with git; the branch status showed it at that commit with only the r1 directory untracked.
- claude-verify: The addons' use of .vtt sidecars (media_import, intelligence) after a sidecar move was not traced.

TOTAL: 9 findings
