# R2 findings: c79613acb (fix: classify uploaded mp4 by probe so the rescan skip cannot keep it as video)

Reviewed SHA: c79613acb (worktree `scratchpad/review-wt2`), on its own. Parent c448c3014 reviewed in r1.

## Findings

### F1 [introduced] LOW (test gap against invariant 5). Nothing holds the revive path of the upload probe
- Where: `backend/app/services/upload.py:287-288` (`existing.file_type = file_type` / `existing.mime_type = mime_type` in the reuse branch). The test is `backend/tests/test_upload.py` `TestAudioOnlyMp4Upload`.
- Claim: the fix is correct on both paths, because the probed pair is computed once before the row lookup and both branches assign it. But the only new test uploads to a fresh path, so only the new-row branch is exercised. Before this commit the reuse-branch assignment was unobservable for a same-path re-upload: the path fixes the extension, so `classify()` returned the pair the row already had. Now the probe result is the only thing that can differ. Dropping the two assignments (M3) leaves a revived `video`/`video/mp4` row as `video` after an audio-only upload, and after every later scan, because the size matches the disk. That is F1 of r1 again, through the path its fix claims to cover. The mutation survives the **full suite** (3588 passed).
- Evidence: out-of-tree repro `scratchpad/repro2/test_zz_repro2.py::test_upload_revives_missing_video_row_as_audio` seeds a missing `talk.mp4` row stored as `video`/`video/mp4`, uploads an AAC-only mp4 to that path, checks that the same row id was revived, and checks `audio`/`audio/mp4` both right after the upload and after `_scan_and_register`.
  - c79613acb: PASSED.
  - c448c3014 (image `litloft-review-c448`): FAILED, `('video','video/mp4') == ('audio','audio/mp4')`.
  - c79613acb + M3: FAILED. The in-tree suite stays green.
- The code is right today, so no user can hit this. It is a test that would let an invariant-5 break through (R-4: an A if the supervisor applies that rule, otherwise a ledger item). The fix would be one more row, or a parametrize over "fresh path / missing row at the path", in the existing upload test.

## Q1: did c79613acb do what it claims, and what did it break?

It did. `complete_upload` now runs `refine_classification_with_probe(target_full, *classify(...))` after assembly and before the row lookup, the same call `register_single_file` makes. Measured with the out-of-tree repro `scratchpad/repro2/test_zz_repro2.py` (4 tests). All 4 pass at c79613acb. At c448c3014, 3 fail and 1 passes:
- new row, audio-only `.mp4`: `audio`/`audio/mp4` (in-tree test, plus repro `..._gets_duration_and_no_thumbnail`)
- new row, audio-only `.mov`: `audio`/`audio/mp4` (repro; at c448c3014 it is `video/quicktime`)
- revived missing row stored `video`, audio-only upload: same row id, `audio`/`audio/mp4`, and still so after a scan (repro; at c448c3014 it is `video`). See F1 for the test gap.
- revived missing row stored `audio`, video upload: `video`/`video/mp4`, with a thumbnail and a duration (repro; passes on both SHAs)

Downstream of classification, for an audio-only mp4 now seen as `audio/mp4`:
- `is_probeable_media("audio","audio/mp4")` is True, so the duration is still read. Repro: 2 s source, duration in (1.5, 2.5).
- `get_thumbnail_generator("audio", …)` is None, so `thumbnail_path` is None. At c448c3014 the video generator ran on an audio-only file and failed (ffmpeg errors in the log), which also ended in None. So the outcome is the same, minus two failing ffmpeg runs. This closes r1's `[pre-existing]` note about the window between upload and the next scan.
- `probe_file_chapters` gates on `is_probeable_media`, so it still runs (`chapters_probed_at` is set in the repro).
- `read_image_dimensions` only runs for `image`, so it is unaffected.
- The trashed-ghost path deletes the old row and takes the new-row branch, so it is covered by the same probe.

Callers: `complete_upload` has one caller, `routers/uploads.py:77`. It emits `files.recovered` / `scan.complete` and returns `file_to_response`, none of which depends on the type. Other non-probing writers of the classification columns are unchanged (r1 listed them: `drives.py` create-file writes text bodies, and `fileops` copy inherits from its source, which is now correct for uploads).

Cost: one extra `ffprobe` (30 s timeout) per `.mp4`/`.mov` upload. It runs synchronously inside the `async` route, as the existing duration probe and thumbnail ffmpeg already do. That is the same blocking pattern, one process more. Not a finding.

Nothing broken was found. Full suite at c79613acb: 3588 passed, 4 skipped.

## Q2: trajectory

Two diffs. c448c3014 added a prediction to the scanner: a stored pair inside the probe-outcome set, at an unchanged size, is what the probe would return. c79613acb adds **no** branch, state or prediction to that gate. It adds a probe call to a writer that had none, which **removes** a state: a `.mp4`/`.mov` row classified by extension only and never probed, written by upload. Its scanner-side changes are tests only. So no round repeats the shape of the round before it, and the change is not being patched.

For the supervisor, a fact rather than a finding: the gate's prediction holds only if every writer of an `.mp4`/`.mov` row has probed it. c79613acb satisfies that for upload by matching `register_single_file`. Nothing enforces it for a future writer. Rows written before the upgrade are already declared out of scope.

## Q3: invariants 1-5

No path breaks them at c79613acb. 1-4 are held by `tests/test_scanner.py` (`TestRescanSkipsTheSniffForUnchangedFiles`), now including the shrink case. 5 holds on the new-row path (in-tree test) and on the revive path (repro only, F1).

## Out of scope ([pre-existing], one line each)
- [pre-existing] Rows uploaded after the last scan before the upgrade stay unprobed. Not re-derived.
- [pre-existing] EXIF re-read every scan. Not re-derived.
- [pre-existing] Markdown body read every scan. Not re-derived.
- [pre-existing] Two rglob passes. Not re-derived.
- [pre-existing] r1 F4 (unreachable `file_size is None` guard and OSError branch). Not re-derived.

## Prose
Nothing would lead a reader to a wrong code change.

## Mutation table

Each run used `tests/test_upload.py` + `tests/test_scanner.py` (47 tests) + the out-of-tree repro (4 tests), at c79613acb with one mutation. The tree was restored after each (`git checkout -- .`; `git status --short` empty).

| id | mutation | want | in-tree result | repro |
|---|---|---|---|---|
| M1 | revert the upload probe (`classify()` only) | kill | KILLED (`TestAudioOnlyMp4Upload::test_lands_as_audio_and_stays_audio_after_a_scan`) | 3 fail |
| M2 | reuse branch writes `classify()` instead of the probed pair | kill (inv 5) | **LIVE** (47 passed) → F1 | `revives_missing_video_row_as_audio` fails |
| M3 | reuse branch drops the type/mime assignment (probe on the new-row path only) | kill (inv 5) | **LIVE**, also in the **full suite** (3588 passed) → F1 | both revive repros fail |
| M11 | scanner re-probes only when the size grew (`>`) | kill (inv 2) | KILLED (`test_a_resized_mp4_is_probed_and_reclassified[shrinks]`) | none |
| M11+T2 | M11 with the `shrinks` row removed | live (shows the shrink row is the only killer) | LIVE (46 passed) | n/a |
| M7b | gate every mp4/mov whatever the stored pair (`if not probe_outcomes(...)`) | kill | KILLED (`test_a_stored_pair_no_probe_could_produce_is_probed`) | none |
| T1 | stale-pair test stops writing the `other`/`octet-stream` pair | kill (the test input is load-bearing) | KILLED (that test fails: unchanged row is not probed) | n/a |

Full suite unmutated at c79613acb: 3588 passed, 4 skipped.

TOTAL: 1 findings
