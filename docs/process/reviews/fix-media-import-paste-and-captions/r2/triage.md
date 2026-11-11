# Triage: r2

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- claude-read: Only one round since r1 changes code. 88e708493 and ff7322a56 are record-only commits by their subject lines and by the listing given. 0b277d11b removed a branch: the shutil.move copy fallback goes away with os.replace and the shutil import is dropped. It added one new guard, the `is_dir` check at service.py:243, because mkdtemp in a missing folder would otherwise raise, and it moved one state, the scratch directory, from /tmp onto the drive. No earlier round added a similar guard or prediction, so this is not a repeating patch pattern. The move does introduce an on-drive state that needs handling after a crash (CR-2), so a further round here would be adding to that same state.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: A new timing dependence in the Composer folder: when a submit finishes before the 400 ms debounce fires, the cleanup at Composer.tsx:158 cancels the preview, so selectedFolder stays empty and the next URL uses its own remembered folder. When the preview fires first, Composer.tsx:148 fills the picker with the remembered folder, the state is not reset after submit, and the next URL goes to that folder whatever its kind. The same user action can therefore send the next import to different folders. The picker shows the folder, so it is visible. Retaining the folder is old behaviour; a submit that also sends the right kind before the preview is what this change makes reliable.; Unchanged from r1 and still present: a failed resolve sends a channel URL to createLoft (Composer.tsx:153, 181), and tests encode it; a preview answering after a successful submit leaves the empty composer showing Subscribe (Composer.tsx:143-144); classified.current is keyed by URL only.
- claude-read: A new timing dependence in the Composer folder: when a submit finishes before the 400 ms debounce fires, the cleanup at Composer.tsx:158 cancels the preview, so selectedFolder stays empty and the next URL uses its own remembered folder. When the preview fires first, Composer.tsx:148 fills the picker with the remembered folder, the state is not reset after submit, and the next URL goes to that folder whatever its kind. The same user action can therefore send the next import to different folders. The picker shows the folder, so it is visible. Retaining the folder is old behaviour; a submit that also sends the right kind before the preview is what this change makes reliable.
- claude-read: Unchanged from r1 and still present: a failed resolve sends a channel URL to createLoft (Composer.tsx:153, 181), and tests encode it; a preview answering after a successful submit leaves the empty composer showing Subscribe (Composer.tsx:143-144); classified.current is keyed by URL only.

## Findings

A: 0
B: 2
C: 0

### claude-read:CR-2 — bucket B, LOW, open

Claim: A `.mi_captions_*` scratch directory left in a drive folder by a backend process killed during a caption download is never removed.
Impact: A container restart during the roughly two seconds of a caption download or refresh leaves a hidden directory in the user's folder, invisible in the UI. If that folder is later deleted, the trash purge's rmdir fails on it, so the folder stays on disk and the next scan lists it again as an empty folder. Deleting it again removes only the database rows, so it comes back on each scan until someone removes the directory from the host. cloud-sync also uploads the leftover, because its rclone call has no excludes. The scratch location before 0b277d11b was the container's /tmp, which did not touch the drive.
Evidence: service.py:249-251 creates the directory inside the drive folder, and TemporaryDirectory cleanup does not run on SIGKILL. The only stale-temp sweep, service.py:378-419 (`_cleanup_stale_stt_temp_files`, started at service.py:669 and 673), matches `.stt_temp.*` sibling files only and skips non-files (service.py:401, 406). No other code refers to `.mi_captions`. main.py:174-180 stops at the rmdir OSError. scanner.py:836-854 adds any non-hidden directory without active files as EmptyFolder. fileops.py:899-925 only soft-deletes and removes rows. cloud-sync/backend/service.py:275-283 passes no filter to rclone sync.
Repro: not_reproduced; found by reading. Suggested steps: create `<folder>/.mi_captions_x/captions.en.vtt`, delete the folder in the UI, let the purge run, then scan and observe the folder listed again as empty.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Extend the periodic stale-temp sweep to remove `.mi_captions_*` directories older than _STT_TEMP_MAX_AGE in the folders of known lofts, with a test beside the existing sweep tests.

</details>

### claude-read:CR-3 — bucket B, LOW, open

Claim: No test would fail if `_download_captions_sync` stopped calling `_dedup_rolling_vtt`.
Impact: Removing or misplacing the call, for example inside the early-return flow of the block this change rewrote, would give users YouTube auto-captions with rolling duplicate text, and the addon's suite would stay green.
Evidence: service.py:274 is the only call, and this change moved it out of the old `if vtt_path.exists()` branch. A case-insensitive grep for `_dedup_rolling_vtt` and `rolling` in addons/media_import/backend/tests returns nothing. The tests that reach this line assert only the return value or `"hello" in` the file (test_nfc_names.py:189-190, 204-206; test_loft_caption_state.py:128-130), and those fixtures have no rolling duplicates. Decisions.md records 60 cues and 4376 bytes at both R-5 runs, which is in-app evidence that the current code path gives the same output as the first run, but it is not a regression test.
Repro: not_reproduced; found by reading. Mutation: delete service.py:274; by reading, no test in addons/media_import/backend/tests observes the difference.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Have one caption fake write a rolling VTT and assert the repeated text appears once in `<stem>.vtt`.

</details>

## Not verified

- claude-read: I ran no tests or mutations and made no filesystem experiment; all kill and survive statements and the CR-2 chain come from reading code.
- claude-read: I did not observe how often the backend is killed during a download, and I did not read how interrupted caption jobs resume after restart.
- claude-read: I did not read the Python 3.12 pathlib or tempfile source; statements about rglob and TemporaryDirectory cleanup rest on memory of the standard library.
- claude-read: I did not read the yt-dlp source or the R-5 evidence files under the scratchpad path; I relied on the summary in decisions.md.
- claude-read: Behaviour on the production NFS-backed drive, including rename across directories and rmtree of the scratch directory.
- claude-read: rclone's behaviour when a source file vanishes during sync, and whether it would fail the run.
- claude-read: The process documents under docs/process beyond a keyword search of CLAUDE.md for temp and hidden-file conventions, and other first-party addons' non-backend code that may list drive folders.
- claude-verify: No test or mutant was executed, because this role has only Read, Glob and Grep. Both confirmations come from reading the code.
- claude-verify: Reads used the working tree of the checked-out branch, assuming it matches ff7322a56; the only reported change is the untracked r2 review directory.
- claude-verify: Actual SIGKILL behaviour in the deployed container, and whether SIGTERM on a normal shutdown lets the worker thread finish its TemporaryDirectory cleanup.
- claude-verify: rclone's real handling of a leftover dot-directory was not run; the absence of a filter was checked only in the command arguments and by grep in addons/cloud-sync.
- claude-verify: The R-5 evidence files behind the 60 cues and 4376 bytes figures; only the decisions.md text was matched.

TOTAL: 2 findings
