# R1 findings: c448c3014 (perf: skip the audio-only sniff for unchanged files on rescan)

Reviewed SHA: c448c3014 (worktree `scratchpad/review-wt`). Parent: 37b89692a (= origin/develop).
Parent comparisons were run from `git archive c448c3014^` extracted to `scratchpad/parent-tree`, built as image `litloft-review-parent`.
Repro tests live outside the tree at `scratchpad/repro/test_zz_repro.py`, mounted into the container with `-v`.

## Touch points the diff reaches that invariants.md does not list

- **Every writer of `files.file_size` / `files.file_type` / `files.mime_type` that does not probe.** The gate trusts the stored pair whenever the stored size matches the disk. Before this commit the stored pair was always overwritten by a fresh probe, so a writer that skipped the probe was corrected on the next scan. After it, the stored pair *is* the classification for as long as the size holds. That makes these writers touch points:
  - `backend/app/services/upload.py` `complete_upload` (new row and revived row: `classify()` only, `file_size = stat().st_size`), the main web upload path. See F1.
  - `backend/app/routers/drives.py` create-file (missing-row revival ~L971-991, new row ~L1064-1072): `classify()` only, `file_size = len(content_bytes)`. It can name a `.mp4` but writes body text, so ffprobe would fail and leave `video` anyway. Not separately reachable.
  - `backend/app/services/fileops.py` copy (~L317): copies `file_size`, `file_type` and `mime_type` from the source with identical bytes. That is correct when the source was correct and inherits F1 when it was not.
- `scanner.py` `_scan_and_register` for **trashed** (`deleted_at` set) and **missing-then-recovered** rows: both go through the gate, because `existing` holds every row of the drive. Measured below that this is benign.

Conclusion: the touch-point list was incomplete. It needed an invariant about rows written without a probe, e.g. "an audio-only mp4 registered by any path other than the scanner is `audio`/`audio/mp4` after the next scan". The supervisor decides whether to add it.

## Findings

### F1 [introduced] HIGH (bucket A candidate). An audio-only .mp4/.mov uploaded through the web UI now stays `video`/`video/mp4` permanently
- Where: `backend/app/services/scanner.py:124-141` (`_unchanged_probe_result`) together with `backend/app/services/upload.py:218` / `:280-282` / `:302-304`.
- Claim: `complete_upload` classifies with `classify()` only (no `refine_classification_with_probe`) and stores the real on-disk size. On the parent, the next scan probed the file and downgraded it to `audio`/`audio/mp4`. On this SHA, the stored `("video","video/mp4")` is in `probe_outcomes("video","video/mp4")` and the size matches, so the gate returns the stored pair and the file is never probed again. The file is never corrected unless its size changes. The user sees the file as a video, with no thumbnail and the video pipeline. Cloud STT may reject it as malformed video, which is what the downgrade exists to prevent (see the `_SNIFF_AUDIO_DOWNGRADE` comment).
- The same applies to a revived (missing-state) row reused by an upload to the same path, and to any copy (`fileops`) of such a row.
- Reproduction: `scratchpad/repro/test_zz_repro.py::test_uploaded_audio_only_mp4_is_downgraded_by_next_scan`. It uploads an ffmpeg-generated AAC-only mp4 via `upload_service.init_upload/receive_chunk/complete_upload`, then calls `_scan_and_register`.
  - parent (`litloft-review-parent`): PASSED, the row becomes `audio`/`audio/mp4`.
  - c448c3014 (`litloft-review`): FAILED, `assert ('video', 'video/mp4') == ('audio', 'audio/mp4')`.
- Invariants: none of 1-4 is violated as literally written. Invariant 4 in fact *demands* the skip, because `("video","video/mp4")` is a classification "the probe could have produced". The invariant is written in terms of "could have produced" rather than "was produced". That is why the list does not catch this, and why it is a candidate for an R-0 revision (supervisor/user). The behaviour is a user-visible regression against the parent.
- The spec's `## Checked, no action` accepts "a transient ffprobe failure that left an audio-only file as `video` is no longer retried". It does not mention the upload path, where the probe never ran at all and so did not merely fail transiently. Every audio-only mp4 uploaded through the UI hits this, deterministically.
- Shapes that do not make this reachable: probe in `complete_upload`, as `register_single_file` already does. That is a one-line change, and it puts the upload path in step with the scanner and `register_single_file`. Alternatively, record that a probe happened. The spec rejected a `classification_probed_at` column. The author and supervisor decide.

### F2 [introduced] MEDIUM (test gap; bucket B unless the supervisor adds the spec's "extension-table change reclassifies" to R-0). Nothing holds the outcome-set check
- Where: `backend/app/services/scanner.py:133-135` (`if stored not in probe_outcomes(...)`).
- Claim: weakening the check leaves the gate trusting *any* stored pair whenever the size is unchanged. Because `probe_outcomes` is only consulted inside that check, the gate then also applies to non-probe types (images, pdf, text). An extension-table change, or any row stored with a pair the extension cannot produce, would never be reclassified by a scan again. The spec's Design section names this check as the thing that "lets an extension-table change reclassify a row". No test or invariant holds it.
- Evidence: the full suite partly holds this. Dropping the check entirely (M7) is killed in the full suite by `tests/test_epub_thumbnail.py::TestScan::test_a_row_registered_before_epub_was_known_is_reclassified_with_a_cover`, because the gate then also covers non-probe types. The narrower mutation M7b (`if not probe_outcomes(...)`: gate every mp4/mov regardless of its stored pair) survives the **full suite** (3585 passed). The repro `test_stale_extension_pair_is_reprobed` (a `.mov` row stored as `other`/`application/octet-stream`, unchanged size) FAILS under M7 and M7b and PASSES at c448c3014 and the parent. So for `.mp4`/`.mov` specifically, nothing holds "a stored pair the probe could not produce is reprobed".

### F3 [introduced] LOW (test gap against invariant 2). Only a size *increase* is exercised
- Where: `backend/tests/test_scanner.py` `test_a_resized_mp4_is_probed_and_reclassified` (1 s audio, then 2 s video); gate at `scanner.py:136-137`.
- Claim: invariant 2 says "size changed". Mutating `!=` to `>` (M11: re-probe only when the file grew) survives the suite, so a file that shrank would keep a stale classification and no test would notice. Per R-4, a test that lets an invariant break through is an A. The real code uses `!=`, so no user can hit this today; the gap is in the test.

### F4 [introduced] INFO (bucket B). The `file_record.file_size is None` guard and the `except OSError` branch are unreachable through the tests, and the first is unreachable through the schema
- Where: `scanner.py:127` and `scanner.py:138-139`.
- Claim: `files.file_size` is `nullable=False` (`models.py:69`), so a row loaded from the DB never has `None`. A repro that set it to NULL failed with `NOT NULL constraint failed: files.file_size` on both SHAs. Dropping the guard (M2) and returning `stored` on OSError (M6) both survive. Both branches fail safe toward probing, which is the old behaviour, so this is harmless and recorded only so nobody adds a test or invariant for an unreachable state.

## Questions from the brief

- Touch points not in invariants.md: see the section at the top. Every non-probing writer of the classification columns is reached, most importantly `upload.py` `complete_upload` (F1).
- Invariants 1-4: no path breaks them as written. All four held at c448c3014, both in the new tests and in the repros (moved, recovered, `.mov`). F1 breaks the *intent* of the audio-only sniff without violating any listed line, because invariant 4 requires the skip for `("video","video/mp4")` whether or not a probe ever produced it.
- Wrong classification a user can hit that the parent would not produce:
  - **Upload** (web UI, and revival of a missing row by upload): yes, F1.
  - **Move detection pass 2**: no. The new path has no row in `existing`, so pass 1 probes it and pass 2 copies the probed pair onto the candidate. Repro `test_moved_audio_only_mp4_stays_audio` PASSES on both SHAs.
  - **Recovered missing row** at the same path and size: keeps its stored (previously probed) pair. Repro `test_recovered_missing_audio_mp4_stays_audio` PASSES on both SHAs. A same-size different file landing at a missing row's path keeps the old pair, which is the size trade the spec accepts.
  - **Trashed rows**: they pass through the gate like active rows. Their stored pair was probed by an earlier scan, so the result equals the parent's, except for F1-origin rows.
  - **NULL file_size**: not reachable (F4).
  - **NFC / non-NFC**: `existing` is keyed by the stored `file_path` and looked up by the NFC `relative_path`. A legacy non-NFC row misses the lookup, goes to `pending_new`, and is probed, the same as on the parent. Nothing changes.
  - **`.loft`**: `classify` gives the loft mime, which is not in `_SNIFF_AUDIO_DOWNGRADE`, so `probe_outcomes` is empty and there is no gate. Unchanged.
  - **`.mov`**: `video/quicktime` maps to `("audio","audio/mp4")`, which is in the outcome set. Repro `test_stale_extension_pair_is_reprobed` confirms that a `.mov` scanned audio-only stays `audio`/`audio/mp4`, and that an out-of-set pair is reprobed.
  - **Same-size content swap** (two files swapped by path, or rewritten at the same byte count): keeps the stale pair. This is the trade accepted in the spec and shared with `_refresh_file_identity`; not a finding.

## Pre-existing (out of scope, one line each)
- [pre-existing] EXIF re-read for EXIF-less images every scan. Not re-derived.
- [pre-existing] Markdown body read every scan. Not re-derived.
- [pre-existing] Two `rglob` passes. Not re-derived.
- [pre-existing] `complete_upload` never runs the audio-only sniff, so an audio-only mp4 is `video` between the upload and the next scan, and the thumbnail generator fails on it (ffmpeg errors in the repro log on both SHAs). This commit turns that window into a permanent state (F1).

## Prose
Nothing would lead a reader to a wrong code change.

## Mutation table

Full suite at unmutated c448c3014: 3585 passed, 4 skipped. Mutation runs used `tests/test_scanner.py` (27 tests) plus the out-of-tree repro file (4 tests after removing the impossible NULL-size case). The repro column lists only the repros that fail; `upload` fails at the unmutated SHA too (F1).

| id | mutation | want | test_scanner.py | repro |
|---|---|---|---|---|
| M1 | drop the size check (`if False`) | kill | KILLED (`test_a_resized_mp4_is_probed_and_reclassified`) | upload |
| M2 | drop the `file_size is None` guard | live | LIVE (27 passed) | upload |
| M3 | `probe_outcomes` returns only the extension pair | kill | KILLED (`test_an_unchanged_audio_only_mp4_stays_audio_without_a_probe`) | upload |
| M4 | `probe_outcomes` returns only the audio pair | kill | KILLED (`unchanged_video_mp4_is_not_probed`, `a_new_mp4_is_probed`) | none (upload passes, because a video-stored row is now reprobed) |
| M5 | invert the size comparison (`==`) | kill | KILLED (all 4 new tests) | none |
| M6 | OSError on stat returns `stored` instead of `None` | live | LIVE (27 passed) | upload |
| M7 | drop the outcome-set check | kill (spec design) | live in test_scanner.py; KILLED in the full suite (`test_epub_thumbnail.py::...reclassified_with_a_cover`) | upload, stale_extension_pair |
| M7b | membership check becomes `if not probe_outcomes(...)` | kill (spec design) | **LIVE in the full suite** (3585 passed) → F2 | upload, stale_extension_pair |
| M8 | `probe_outcomes` returns `{(ft,mt)}` for non-probe mimes (gate on every file) | live (equivalent; extra stat) | LIVE (27 passed) | upload |
| M10 | gate returns the extension pair instead of the stored pair | kill | KILLED (`unchanged_audio_only...`) | upload, recovered_missing |
| M11 | re-probe only when the size grew (`>`) | kill (invariant 2) | **LIVE** (27 passed) → F3 | upload |
| M9 (not run) | apply the gate in `register_single_file` | n/a | `register_single_file` only creates rows; there is no stored row to consult, so the mutation has no meaningful form | |

Tree restored after every mutation (`git -C review-wt checkout -- .`; `git status --short` empty).

TOTAL: 4 findings
