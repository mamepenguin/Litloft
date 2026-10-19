# Review r1 — Intelligence addon, commit 2c2a836 (parent 55a54e0)

Repository: addons/intelligence. Reviewed commit 2c2a836 only.
Spec: docs/specs/nfc-tolerant-name-matching.md (SPEC-ADDON-001; I1–I4, I7, I17).
Threat model: personal tool, single owner, no adversary.

Baseline (unmutated, scratch worktree at 2c2a836): targeted tests `33 passed`.

## Matcher parity

`diff backend/app/services/sidecar_match.py <(git show 2c2a836:app/sidecar_match.py)` → no output (byte-identical).

## Mutations

Each mutation applied alone in the scratch worktree, then `git checkout -- app`.
Unless noted, tests run: `pytest -q -o addopts="" tests/test_sidecar_match.py tests/test_loft_vtt_sidecar.py tests/test_listing_call_inventory.py` (33 tests) in the `Dockerfile.test` image, with the worktree's `app/` and `tests/` mounted.

| id | target | mutation | want | result |
|---|---|---|---|---|
| M1 | sidecar_match.py:24 | `prefix = stem` (no NFC on stem side) | kill | killed (4 failed) |
| M2 | sidecar_match.py:28 | `name = entry.name` (no NFC on entry side) | kill | killed (9 failed) |
| M3 | sidecar_match.py:29 | `fnmatchcase(name, prefix + rest_pattern)` (stem as glob syntax) | kill | killed (9 failed) |
| M4 | sidecar_match.py:29 | `fnmatch.fnmatch` instead of `fnmatchcase` | kill | killed, but only by `test_listing_call_inventory` (call key changed). Behaviourally equivalent on Linux (`os.path.normcase` is identity on posix), so no behavioural test can kill it in the container. Not a finding. |
| M5 | sidecar_match.py:31 | drop `is_file()` filter | kill | killed (2 failed) |
| M6 | sidecar_match.py:31 | drop the sort | kill | killed (1 failed) |
| M7 | sidecar_match.py:31 | sort key `NFC(p.name)` instead of on-disk `p.name` | kill | **LIVED** (33 passed) → F4 |
| M8 | whisper.py:1683 | drop the WARNING on an unlistable folder | kill | killed |
| M9 | whisper.py:1682 | `except ValueError` (OSError escapes) | kill | killed |
| M10 | whisper.py:1695 | exact-name preference compares raw `c.name == f"{stem}.vtt"` | kill | killed |
| M11 | whisper.py:1694-1697 | drop exact-name preference (always first) | kill | killed |
| M12 | whisper.py:1693 | `exact_name` not NFC-normalized | kill | killed |
| M13 | indexer.py:636 | `except ValueError` (OSError escapes) | kill | killed |
| M14 | indexer.py:637 | counter never incremented | kill | killed |
| M15 | indexer.py:643 | `if True:` (WARNING also when count is 0) | kill | **LIVED** (33 passed) → F3 |
| M16 | indexer.py:643 | `if unlistable_count > 1:` | kill | **LIVED** (33 passed) → F3 |
| M17 | indexer.py:638 | `break` instead of `continue` | kill | killed |
| M18 | indexer.py:637-639 | unlistable treated as has-vtt (re-queue) | kill | killed |
| M19 | indexer.py:631-632 | drop `if has_chunks: continue` | kill | **LIVED** — targeted 33 passed; also `tests/test_reconcile_drift.py` + `tests/test_whisper_skip_jobrecord.py` (45 passed); **full suite 3093 passed, 2 skipped** → F2 |
| M20 | indexer.py:617-632 | has_chunks short-circuit moved before the temp-audio check | kill | survives the targeted 33; killed by `tests/test_reconcile_drift.py::TestLoftTempAudioReset::test_temp_audio_resets_even_when_loft_already_has_chunks` (pre-existing test). Not a finding. |

Unmutated full suite (default CMD of the image built from the worktree at 2c2a836): `3093 passed, 2 skipped, 1 warning in 261.89s`.
Worktree restored after every mutation (`git status --short` empty) and removed at the end.

## Findings

### F1
- Bucket: A
- Severity: medium (trigger is uncommon in this deployment: the container runs as root, no `USER` in `Dockerfile`; reachable through a host-shared folder the VM is denied, or a stat that fails with EIO on a stale mount)
- Invariant: I17
- Claim: A `.loft` whose directory cannot be read *or searched* (e.g. mode 000, EACCES on stat) is not handled as I17 requires, because the temp-audio `Path.is_file()` that runs before the new `try` raises. In Python 3.12 `Path.is_file()` swallows only ENOENT/ENOTDIR/EBADF/ELOOP; EACCES and EIO propagate.
  - Reconcile: `indexer.py:620` `temp_audio.is_file()` raises `PermissionError` out of `_reset_loft_refs_with_new_vtt`. The `get_search_db()` session rolls back, so **no other `.loft` is reset in that pass** (a sibling NFC/NFD loft with a new `.vtt` stays `whisper_indexed=True`), and `reconcile()`'s outer `except Exception` (`indexer.py:481`) logs "Reconciliation failed" and skips `_sync_thumbnail_paths`, `reset_falsely_completed_clip_thumbnail` and `_resume_incomplete`. This repeats on every pass while the folder stays unreadable.
  - Indexer: `whisper.py:122` (`_loft_stt_temp_path`, called at `whisper.py:825` before `_index_loft_vtt`) raises the same way, so `index_whisper` raises, the worker logs "Whisper indexing failed", and `whisper_indexed` stays False — the loft is re-queued by `_resume_incomplete` on every pass instead of being recorded as true.
- Why the tests pass: the `unlistable` fixture in `tests/test_loft_vtt_sidecar.py` makes only `os.scandir`/`os.listdir` fail while `stat` keeps working, a state a real permission-denied directory does not produce (no `x` bit → stat fails too). Tests also run as root, where mode 000 has no effect.
- Evidence / repro (run as uid 1000 in the test image, scratch test reusing the fixtures of `tests/test_loft_vtt_sidecar.py`; `locked/` holds `Clip.loft` + `Clip.vtt` and is `chmod 0`, `open/` holds an NFC-stored loft with an NFD `.vtt`):
  ```
  RECONCILE: raised PermissionError open.whisper_indexed = True
  INDEX: raised PermissionError whisper_indexed = False
  ```
  Expected per I17: reconcile returns, `open` becomes False, one WARNING with count 1; index marks `flocked` True with one WARNING.
  Standalone check in the same image as uid 1000: `Path('/tmp/d/locked/Clip.stt_temp.m4a').is_file()` → `PermissionError [Errno 13]`.
- Note: the `is_file()` lines predate this commit, but the commit is the one that claims I17 and adds the test for it.

### F2
- Bucket: B (test gap; the behaviour it leaves unguarded is A-class: a re-queue loop)
- Severity: medium
- Invariant: I4 (second clause: "a `.loft` that already has chunks and no speech-to-text temp audio is not re-queued")
- Claim: Nothing in the suite fails if the `has_chunks` short-circuit (`indexer.py:625-632`) is removed (M19). With it gone, every transcribed `.loft` that has its `.vtt` beside it — the normal state of a Media Import loft — is reset to `whisper_indexed=False` on every reconcile pass and re-indexed. The new reconcile tests seed only lofts without chunks.
- Evidence: M19 → targeted 33 passed; full suite 3093 passed, 2 skipped.
- Repro: delete the two lines `if has_chunks: continue` in `_reset_loft_refs_with_new_vtt` and run the full suite.

### F3
- Bucket: B
- Severity: low
- Invariant: spec §2 Failure cases ("logs one WARNING per pass with the number of files skipped this way, only when that number is above zero"); not an I-numbered invariant.
- Claim: The WARNING condition at `indexer.py:643` is not pinned. `if True:` (M15, a "Skipped 0 loft ref(s)" WARNING on every pass) and `if unlistable_count > 1:` (M16, no WARNING when exactly one folder is unlistable) both survive. The only test uses exactly two unlistable folders and no reconcile test asserts the absence of a WARNING.
- Evidence: M15, M16 → 33 passed.

### F4
- Bucket: B
- Severity: low
- Invariant: matcher contract under Touch points ("returns their on-disk paths sorted by on-disk name"); spec §1 step 3 ("otherwise the first in sorted order of the on-disk names, as today").
- Claim: Sorting by the NFC form of the name instead of the on-disk name (M7) survives. The only order test (`sorted-by-on-disk-name`) uses ASCII names, where both orders agree, and `test_spec_addon_001_exact_stem_vtt_wins_after_nfc` gives the same first element under both orders (`" (1)"` sorts before `".vtt"` either way). The order decides which `.vtt` is indexed when no exact `<stem>.vtt` exists, and is part of the contract the core copy must share.
- Evidence: M7 → 33 passed.

### F5
- Bucket: B
- Severity: low
- Invariant: I7 (detector precision)
- Claim: In `tests/test_listing_call_inventory.py`, the `stored-name` check is looser than I7 states in two ways: (1) for a module-level call the "enclosing scope" is the whole module (`visit(tree, "", tree)`), so any `normalize`/`match_siblings` call anywhere in the file satisfies it; (2) `_called_names` collects any attribute name, so any `x.normalize(...)` (not only `unicodedata.normalize`) counts. Neither is exercised today (both `stored-name` keys are inside `match_siblings`), so this is a hole for future entries only.
- Evidence: `_scan()` → `visit(tree, "", tree)`; `_called_names` adds `sub.func.attr` for every `ast.Attribute` call; `_NORMALIZERS = {"match_siblings", "normalize"}`.

TOTAL: 5 findings
