# Review r2 — Intelligence addon, fix commit bccce30 (parent 2c2a836)

Repository: addons/intelligence. Reviewed `git show bccce30` only, against the r1 findings F1–F5 in `addon-intelligence-r1.md`.
Spec: docs/specs/nfc-tolerant-name-matching.md (SPEC-ADDON-001; I4, I7, I17).
Threat model: personal tool, single owner, no adversary; container runs as root.

Baseline (scratch worktree at bccce30, `docker build -f Dockerfile.test -t intel-r2 .`):
`docker run --rm intel-r2 python -m pytest -q tests/test_loft_vtt_sidecar.py tests/test_sidecar_match.py tests/test_listing_call_inventory.py` → `37 passed`.
Mutations ran the same three files with the worktree's `app/` and `tests/` bind-mounted (`-o addopts=""`).

## Mutations

| id | target | mutation | want | result |
|---|---|---|---|---|
| N1 | indexer.py temp-audio `try` | `except ValueError` (OSError escapes) | kill | killed (2 failed) |
| N2 | indexer.py temp-audio `except` | drop `unlistable_count += 1` | kill | killed (2 failed) |
| N3 | whisper.py `_loft_stt_temp_path` | `except ValueError` (OSError escapes) | kill | killed (1 failed) |
| N4 | indexer.py `match_siblings` `try` (pre-existing branch) | `except ValueError` | kill | **LIVED** (37 passed; full suite `3097 passed, 2 skipped`) → R2-F1 |
| N5 | indexer.py `match_siblings` `except` (pre-existing branch) | drop `unlistable_count += 1` | kill | **LIVED** (37 passed) → R2-F1 |
| N6 | indexer.py temp-audio `except` | treat unreadable as has-temp-audio (re-queue) | kill | killed (1 failed) |
| N7 | app/sidecar_match.py | call `normalize` through a non-`unicodedata` receiver (`_text.normalize`, behaviour identical) | kill | killed by `test_stored_name_listings_normalize` |
| N7b | N7 plus `_NORMALIZERS` restored to the r1 set | — | live | lived (37 passed): confirms the r1 hole and that the new qualification closes it |
| N8 | test_listing_call_inventory.py `_called_names` | drop the `receiver.attr` line | kill | killed (`test_stored_name_listings_normalize`) |

Worktree restored after every mutation (`git status --short` empty) and removed at the end.

## Real-permission check of F1 (outside the fixture)

Scratch test (not committed) reusing the fixtures of `tests/test_loft_vtt_sidecar.py`, run as uid 1000 in the test image so modes take effect. `locked/` holds `Clip.loft` + `Clip.vtt`; `open/` holds an NFC loft with an NFD `.vtt`. Modes 000, 0311 (search, no read) and 0611 (read, no search):
- reconcile: returns; `open` → False; `locked` stays True; exactly one WARNING `Skipped 1 loft ref(s) ...` — for all three modes.
- index: no exception; `flocked` → True, no chunks — for all three modes.
Result `6 passed`. r1 F1 is fixed at bccce30.

N4 rerun under the same real-permission test: killed at mode 0311 (`PermissionError` escapes reconcile). So the branch N4/N5 mutate is live behaviour, reachable in practice, and only the fixture-based suite misses it.

## r1 findings status

- F1 (A, I17): addressed. Both `is_file()` checks now catch `OSError`; verified with real permissions above.
- F2 (B, I4): addressed. `test_spec_addon_001_loft_with_chunks_is_not_requeued` (NFD `.vtt` present, chunks present) fails if the `has_chunks` short-circuit is removed (the loft would match a `.vtt` and be reset).
- F3 (B): addressed. The `[0]` / `[1]` parametrization kills `if True:` and `if unlistable_count > 1:` by construction (0 WARNINGs expected / 1 expected).
- F4 (B): addressed. Case `sorted-by-on-disk-bytes-not-nfc` orders `éz.vtt` before `f.vtt` (on-disk) where NFC order would put `f.vtt` first.
- F5 (B, I7): partly addressed — see R2-F2.

## Findings

### R2-F1
- Bucket: B (test gap; the behaviour left unguarded is I17)
- Severity: low-medium
- Invariant: I17
- Claim: The fixture change that fixes F1's test blind spot creates a new one. `unlistable` now makes `os.stat` fail for everything inside a blocked folder, so in reconcile every blocked loft is caught by the new temp-audio `except OSError` before `match_siblings` runs. The pre-existing `except OSError` around `match_siblings(parent, stem, "*.vtt")` in `_reset_loft_refs_with_new_vtt` (and its `unlistable_count += 1`) is no longer reached by any test. That branch is the one taken by a folder that can be searched but not listed (mode `-wx`/`--x`: stat of the absent temp audio returns False, `scandir` raises EACCES). With it broken, reconcile raises out, the session rolls back, no other loft is reset that pass and the rest of `reconcile()` is skipped — the same failure F1 described.
- Evidence: N4 and N5 live on the targeted files; N4 lives on the full suite (`3097 passed, 2 skipped`); N4 is killed by the real-permission scratch test at mode 0311 (`PermissionError` from reconcile).
- Repro: change `except OSError:` after `has_vtt = bool(match_siblings(...))` in `app/indexer.py` to `except ValueError:` and run the suite.
- Note: the fixture now models only "folder neither listable nor searchable". The indexer path in whisper.py is still exercised (its temp-path check returns None first, then `match_siblings` raises), so only reconcile is uncovered. A second blocking mode (scandir/listdir only, stat unaffected) for one reconcile case would reach the branch.

### R2-F2
- Bucket: B
- Severity: low
- Invariant: I7 (detector precision)
- Claim: r1 F5 is only half addressed. Part (2) is closed: `_NORMALIZERS` now requires `unicodedata.normalize` qualified (N7 killed, N7b shows the r1 set would have let it live). Part (1) is unchanged: a listing call at module level gets `scope = tree` from `visit(tree, "", tree)`, so any `match_siblings` or `unicodedata.normalize` call anywhere in that module satisfies `test_stored_name_listings_normalize` for it. Also unchanged: `match_siblings` is matched as a bare attribute name from any receiver. Not exercised by today's inventory (both `stored-name` keys are inside `match_siblings`), so a hole for future entries only.
- Evidence: `_scan()` still calls `visit(tree, "", tree)`; `_called_names` still adds `sub.func.attr` for every attribute call.

TOTAL: 2 findings
