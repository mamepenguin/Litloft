# Media Import addon review r1 — commit 3aa927f (parent f529156)

Reviewed: `git show 3aa927f` in `addons/media_import`, against core `d12c83ed9`
`backend/app/services/sidecar_match.py` (core worktree at c4bd99624).
Threat model: personal tool, single owner, no adversary.

Baseline: in a scratch worktree (core c4bd99624 + addon 3aa927f), the CI command
`docker run --rm mi-review python -m pytest -q` gives `402 passed`.

## Findings

No bucket A finding. Every behaviour the spec names (NFC naming in both sanitizers,
NFC-literal sidecar lookup at the four sites, NFC exclusion tests, 24-hour gate, empty
inventory) was read against the code and matches. The 13 tests in `test_nfc_names.py`
all fail on the parent f529156 (RED confirmed). The findings below are test gaps
measured by surviving mutations, plus one spec-level behaviour note.

### F1 — B, medium — a caption rest pattern wide enough to select the `.loft` survives the suite
- Claim: changing `_download_captions_sync`'s rest pattern from `".*.vtt"` to `".*"`
  passes all 402 tests. With that mutation, a caption download beside an existing
  `<stem>.loft` renames `<stem>.<lang>.vtt` to `<stem>.vtt` and then unlinks
  `<stem>.loft` as an "extra candidate" (`"<stem>.en.vtt" < "<stem>.loft"` in sort order).
  No caption test puts a `.loft` (or any non-`.vtt` sibling) next to the downloaded
  caption, so nothing pins that the pattern stays inside `.vtt` files.
- Evidence: `backend/service.py:256`; mutation `cap-rest-dot-star` below, survived.
- Fix direction: add a row to `test_spec_addon_002_caption_download_leaves_stem_vtt`
  (or its fixture) that also writes `<stem>.loft` and asserts it is still present.
- Invariant: I12 (match set), I10 (deletes no other file) — unguarded, not broken.

### F2 — B, low — I12's "`.*.vtt` never selects `<stem>.vtt` itself" is not pinned
- Claim: changing the caption rest pattern to `"*.vtt"` (which also selects `<stem>.vtt`)
  survives. Observable effect of that regression: when a previous `<stem>.vtt` exists and
  the new language file sorts after it (`<stem>.zh.vtt`, `<stem>.yue.vtt`), `best` is the
  old `<stem>.vtt`, no rename happens and the fresh caption is left as `<stem>.zh.vtt`.
- Evidence: `backend/service.py:256`; mutation `cap-rest-star-vtt`, survived.
- Fix direction: a caption-test row with a pre-existing `<stem>.vtt` and a `zh` language
  file, asserting the content of `<stem>.vtt` is the new one.
- Invariant: I12 (unguarded).

### F3 — B, medium — a stale-cleanup rest pattern that deletes every old sidecar survives
- Claim: changing `_cleanup_stale_stt_temp_files`'s rest pattern from `".stt_temp.*"` to
  `".*"` passes the suite. That mutation deletes every file older than 24 h named
  `<stem>.*` beside every registered `.loft` — the `.loft` itself, its `.vtt`, any other
  title's sidecar sharing the prefix. The NFC stale test writes the `.loft` fresh (mtime
  now), so the age gate hides it; no test has an old non-temp sibling.
- Evidence: `backend/service.py:396`; mutation `stale-rest-wide`, survived;
  `backend/tests/test_nfc_names.py` stale test writes the `.loft` without backdating it.
- Fix direction: backdate the `.loft` (and add an old `<stem>.vtt`) in
  `test_spec_addon_002_stale_cleanup_matches_nfd_temp_and_keeps_young_ones` and assert
  they survive.
- Invariant: I10, I14 (unguarded).

### F4 — B, low — `_download_stt_audio_sync` has no test; its new listing calls are unmeasured
- Claim: there is no test calling `_download_stt_audio_sync` (grep of `backend/tests` at
  3aa927f finds none). Three mutations at its new `_siblings` / `_same_name` lines survive:
  first pattern `.stt_temp.*.part` -> `.stt_temp.*`, fallback `.stt_temp.*` ->
  `.stt_temp.*.part`, and dropping the final-path exclusion entirely. SPEC-ADDON-002 step 4
  names this site and I11 / I12 cover it, but only code reading backs it.
- Evidence: `backend/service.py:334-340`; mutations `dl-first-rest-no-part`,
  `dl-fallback-rest-part`, `dl-no-final-exclusion`, all survived.
- Fix direction: a test with a fake `YoutubeDL` that writes an NFD-stem
  `.stt_temp.webm.m4a` (and one that writes a `.part`) and asserts the result is
  `<NFC stem>.stt_temp.m4a` with no other `.stt_temp.*` left.
- Invariant: I11, I12 (unguarded).

### F5 — B, low — I16 (unlistable folder raises nothing new) is not tested
- Claim: removing the `except OSError: return []` in `_siblings` passes the suite. The
  behaviour is right in the code (`backend/service.py:54-59`), and in normal use the
  folder exists, so this is only a missing guard. One reachable path: `_download_stt_audio_sync`
  calls `_cleanup_stt_temp` before `parent.mkdir(...)` (`service.py:313-314`), so a
  missing parent relies on this swallow; `Path.glob` returned nothing there before.
- Evidence: mutation `siblings-no-oserror`, survived.
- Fix direction: call `_cleanup_stt_temp` and `_download_captions_sync` (with the fake
  `YoutubeDL`) on a stem whose parent does not exist and assert no exception / `(False, None)`.
- Invariant: I16 (unguarded).

### F6 — B, low — the trailing-mark trim keeping only the last mark is not tested
- Claim: replacing `while` with `if` in the trim of either `_sanitize_filename` survives.
  `UNCOMPOSABLE_CUT` puts only one combining mark inside the first 200 code points
  (`"a"*198 + "q" + mark | mark + "tail"`), so a single-step trim already passes. A cut
  that leaves two marks (`"a"*197 + "q" + 2 marks + ...`) would expose it.
- Evidence: `backend/service.py:48-49`, `backend/subscription/manager.py:104-105`;
  mutations `svc-trim-if`, `mgr-trim-if`, survived.
- Fix direction: one more `SANITIZE` row, e.g. `"a"*197 + "q́́́" + "tail"` -> `"a"*197 + "q"`.
- Invariant: I13 (unguarded for multiple marks).

### F7 — B, low — the trim also strips a trailing mark when nothing was cut (spec-mandated)
- Claim: the trim runs on every title, not only when the 200-cut separated a mark from its
  base, so a title that legitimately ends in a non-composing mark loses it. Measured with
  the function body copied verbatim:
  `"ข่าววันนี้ ไม่"` -> ends `"ไม"` (Thai tone mark U+0E48, ccc 107, dropped: "not" becomes
  a different syllable); `"あ゙あ゙あ゙"` -> `"あ゙あ゙あ"`; `"a"*197 + "e" + 3 acutes + "x"`
  -> drops two acutes that still had their base inside the cut. Only the file name
  changes; nothing is missed or overwritten, and the behaviour is exactly what I13 /
  normal-flow step 2 require. Reported so the spec owner can decide whether the trim
  should apply only when `len(title) > 200` before the cut (the stated purpose is the cut).
- Evidence: `backend/service.py:47-50`, `backend/subscription/manager.py:103-106`.
- Invariant: none broken; I13 as written forces this.

## Mutation log

Command per mutation (addon backend bind-mounted over the image's copy, tree restored with
`git checkout -- <file>` after each): `docker run --rm -v <addon>/backend:/app/addons/media_import mi-review python -m pytest -q -o addopts= -p no:cacheprovider`.

| id | site | mutation | want | result |
|---|---|---|---|---|
| svc-no-nfc | service `_sanitize_filename` | drop the NFC line | kill | killed (test_nfc_names sanitizer rows, link import) |
| svc-nfc-after-cut | service | NFC applied after strip+cut | kill | killed (nfd-truncated-after-nfc, nfd-longer-than-cut) |
| svc-nfc-after-sub | service | NFC after `re.sub`, before cut | live | live (equivalent: replaced chars are ASCII starters) |
| svc-no-trim | service | trim loop disabled | kill | killed (no-orphan-combining-mark) |
| svc-trim-if | service | `while` -> `if` | kill | **survived** -> F6 |
| svc-trim-before-cut | service | trim, then cut | kill | killed (no-orphan-combining-mark) |
| mgr-no-nfc | manager `_sanitize_filename` | drop the NFC line | kill | killed (sanitizer rows, subscription loft+vtt) |
| mgr-nfc-after-cut | manager | NFC after strip+cut | kill | killed |
| mgr-nfc-after-sub | manager | NFC after `re.sub` | live | live (equivalent) |
| mgr-no-trim | manager | trim disabled | kill | killed |
| mgr-trim-if | manager | `while` -> `if` | kill | **survived** -> F6 |
| mgr-trim-before-cut | manager | trim, then cut | kill | killed |
| cap-rest-star-vtt | captions | `".*.vtt"` -> `"*.vtt"` | kill | **survived** -> F2 |
| cap-rest-dot-star | captions | `".*.vtt"` -> `".*"` | kill | **survived** -> F1 |
| cleanup-rest-part-only | `_cleanup_stt_temp` | `.stt_temp.*` -> `.stt_temp.*.part` | kill | killed (test_nfc_names, test_loft_creation) |
| cleanup-rest-wide | `_cleanup_stt_temp` | `.stt_temp.*` -> `.*` | kill | killed |
| dl-first-rest-no-part | `_download_stt_audio_sync` | first pattern `.stt_temp.*.part` -> `.stt_temp.*` | kill | **survived** -> F4 |
| dl-fallback-rest-part | `_download_stt_audio_sync` | fallback `.stt_temp.*` -> `.stt_temp.*.part` | kill | **survived** -> F4 |
| stale-rest-part-only | stale cleanup | `.stt_temp.*` -> `.stt_temp.*.part` | kill | killed |
| stale-rest-wide | stale cleanup | `.stt_temp.*` -> `.*` | kill | **survived** -> F3 |
| siblings-no-oserror | `_siblings` | remove `except OSError` | kill | **survived** -> F5 |
| cap-same-best-bytes | captions `_same_name(best, vtt)` | byte `!=` | live | live (equivalent: a `.*.vtt` match can never equal `<stem>.vtt`) |
| cap-same-c-bytes | captions `_same_name(c, vtt)` | byte `!=` | live | live (equivalent, same reason) |
| dl-same-bytes | stt download `_same_name(p, final)` | byte `!=` | live | live (no test; also near-equivalent because the opening `_cleanup_stt_temp` removes any NFD spelling of the final name) |
| dl-no-final-exclusion | stt download | drop the final-path exclusion | kill | **survived** -> F4 |
| same-name-bytes | `_same_name` body | `a == b` | live | live (all its uses are equivalent or untested, see above) |
| stale-no-age-gate | stale cleanup | remove `if mtime > cutoff: continue` | kill | killed |
| stale-age-gate-inverted | stale cleanup | `>` -> `<` | kill | killed (test_nfc_names, test_loft_creation) |

Checked, no finding: the AST inventory's empty `INVENTORY` is correct (`git grep` finds no
`.glob/.rglob/.iterdir/.walk/listdir/scandir/fnmatch` call in `backend/` outside tests at
3aa927f); `create_loft_sync` and `_allocate_loft_path` name the `.loft` from the NFC title
and `_save_vtt` derives `.vtt` from the `.loft` path, so stems agree byte for byte (I5, I11);
caption / STT stems come from the DB `file_path` through `_resolve_drive_file_path`, whose
`resolve()` does not rewrite the name; the `Title.Part2.vtt` prefix overlap is listed in the
spec's Checked, no action.

TOTAL: 7 findings
