# Name matching against a directory listing ignores Unicode normalization

SPEC-ID: SPEC-ADDON-001
SPEC-ID: SPEC-ADDON-002
SPEC-ID: SPEC-CORE-003

Approval: sha256:1811edf305fbf39b2e77f979c1443d32946b0e2be702bac326f376f01e7767bf Yuichi Senga 2026-10-06

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

On the production host (macOS, APFS, drives bind-mounted into Linux containers) some
file names on disk are in Unicode NFD or a mix of NFC and NFD, while every path the core
stores is NFC (`scanner.register_single_file`, `safepath.validate_filename`). Opening a
path works either way, because the host filesystem ignores normalization. Matching a
name against a directory listing does not: the listing returns the bytes on disk and the
comparison is exact. A `glob()` built from a stored name has a second failure: `[`, `]`,
`*` and `?` in a title are read as pattern syntax.

Measured on production on 2026-10-06: 5,768 active `.loft` files, of which 111 have an
adjacent `.vtt` that differs from the stored stem only in normalization, and 6 more have
one whose stem contains a glob metacharacter. All 117 were marked transcribed with no
transcript, and the pass that should pick up a late `.vtt` uses the same glob, so they
never recover. The NFD names come from video titles: Media Import writes the title it
receives as the file name without normalizing it, and NFD `.loft` files have been created
on most days from June to October 2026.

This change makes every place that matches a stored name against a directory listing
compare NFC to NFC, by listing and comparing rather than globbing; makes Media Import
write new `.loft` names in NFC; and fixes the same pattern in the core's batch-rename
duplicate check, where a miss overwrites a file. It is for the single household user, whose
YouTube imports lose their transcripts, search hits and Ask citations without any error.

Spec IDs:

- **SPEC-ADDON-001** — Intelligence finds the subtitle file next to a `.loft` whatever
  the normalization of either name, and whatever glob metacharacters the stem contains,
  both when indexing and when deciding to re-index.
- **SPEC-ADDON-002** — Media Import writes new `.loft` and `.vtt` names in NFC, and its own
  sidecar lookups (downloaded captions, speech-to-text temp audio) match by
  NFC-normalized literal name, not by glob.
- **SPEC-CORE-003** — The core's batch rename never overwrites a file. Names are
  compared after NFC and `str.lower` on both sides. A rename is refused with 409 when, at
  the moment it would run, its target is still held by another file in the same folder;
  a chain whose order frees each target first (renumbering down) is allowed and
  succeeds, a swap or a chain that needs a name before it is freed (renumbering up) is
  refused.

The domains follow the user's decision of 2026-10-06: the addon repositories have no spec
location, so this spec lives in the core and the addon behaviors take `ADDON` ids.
`docs/process/PROJECT.md` is updated to say so. The process workflow does not check out
the submodules, so `check-traceability` in CI cannot see addon tests; the user decided
(2026-10-06) not to edit the kit-owned `process.yml` here. The two `ADDON` rows stay at
`approved` until the kit can check out submodules; then they move to `implemented`.

## Required items

### 1. Normal flow

SPEC-ADDON-001, indexing a `.loft`:

1. The indexer picks up a `.loft` whose `whisper_indexed` is false.
2. The worker finds the **matching `.vtt` files** with the sidecar matcher (Touch
   points): the entries of the `.loft`'s directory whose NFC name starts with the NFC
   stem of the `.loft` taken as literal text, whose remaining name matches `*.vtt`
   (`fnmatchcase`, so case-sensitive as `glob` on Linux), and, checked only for entries
   whose name already matched, for which `Path.is_file()` is true (symlinks followed).
   Compared with today's `glob(f"{stem}*.vtt")` the differences are: normalization is
   ignored, `[ ] * ?` in the stem are literal, and a directory named like a `.vtt` is
   not a match.
3. If one of them is exactly `<stem>.vtt` after NFC it is used; otherwise the first in
   sorted order of the on-disk names, as today. The chosen file is opened through its
   on-disk entry, not through a path rebuilt from the NFC name.
4. Cues are parsed; chunks, embeddings, FTS rows and TF-IDF keywords are written, as
   today. No word rows are written (the `.vtt` path never writes them).

SPEC-ADDON-001, the reconcile pass:

1. For each active `.loft` with `whisper_indexed` true, the temp-audio check runs first,
   as today. Then, for a `.loft` with no transcript chunk, the pass looks for matching
   `.vtt` files exactly as in step 2 above (the same function).
2. If anything matches, `whisper_indexed` is set to false and the file is queued again.
3. On the first pass after deployment this re-queues the 117 files measured above, with
   no manual step.

SPEC-ADDON-002, import:

1. A link import or a subscription import receives a title.
2. `_sanitize_filename` NFC-normalizes the title first, then replaces the forbidden
   characters, strips and truncates to 200 code points as today; after the cut it drops
   any trailing characters for which `unicodedata.combining()` is non-zero, so a mark
   that NFC could not compose is never left without its base. Both copies of the
   function (`service.py`, `subscription/manager.py`) behave identically. The `.loft` is
   written under that name, with ` (N)` added on a clash as today.
3. A subscription transcript is written as `<that stem>.vtt`, so both share one form.
4. Caption download by yt-dlp and speech-to-text temp audio use the stored NFC stem, as
   today. The files they produce are found by listing the directory instead of `glob()`.
   Each site keeps the shape of its current pattern: an entry matches when its NFC name
   starts with the NFC stem taken literally, and the rest of the name matches the part of
   today's pattern after `{stem}` with `fnmatch` semantics. So:
   - `_download_captions_sync`: rest matches `.*.vtt`
   - `_cleanup_stt_temp` and `_cleanup_stale_stt_temp_files`: rest matches `.stt_temp.*`
     (the stale cleanup keeps its 24-hour age gate)
   - `_download_stt_audio_sync`: rest matches `.stt_temp.*.part`, then `.stt_temp.*`
   The match set is identical to today's for any stem without glob metacharacters whose
   on-disk form is NFC.
5. After selection, every equality or exclusion test between names at these sites
   (`best.name != vtt_path.name`, `c != vtt_path`, `p.name != final_path.name`) compares
   NFC names, so an NFD spelling of the target is treated as the target itself and is
   never renamed onto itself or unlinked as "another candidate".
6. Every name Media Import derives from a `.loft`'s stem (link-import `<stem>.vtt`,
   `<stem>.stt_temp.*`) is built from the stored NFC stem, which after step 2 is also the
   `.loft`'s own on-disk stem.

SPEC-CORE-003, batch rename:

1. The user renames several files at once.
2. Before anything moves, the check simulates the renames in the order they will run,
   which is the order of `ids` in the request (the order the files were selected), as
   today. Folders are identified by `NFC(file.folder_path)`, so two rows whose stored
   folder paths differ only in normalization share one folder. For each folder the
   batch touches the check starts from the set of names held there: the `is_file()`
   entries of that folder's listing (directories and other entries are not names, as
   today), each as `NFC(name).lower()` (`str.lower`, as today, not `casefold`).
3. For each file whose name changes, in execution order, let `old = NFC(filename).lower()`
   and `new = NFC(new_name).lower()` in that file's folder. If `new != old` and `new` is
   in the set, the batch is refused with 409 `File already exists: <new_name>` and
   nothing moves. Otherwise `old` leaves the set and `new` joins it. A file renamed to a
   case or normalization variant of its own name (`new == old`) never clashes. Each
   folder has its own set, so a file in another folder never frees or holds a name here.
4. Consequently a renumbering down (`2.mp4 → 1.mp4`, `3.mp4 → 2.mp4` with `1.mp4`
   absent) passes; a renumbering up (`1.mp4 → 2.mp4`, `2.mp4 → 3.mp4`) and a swap are
   refused; the user renames them in two steps.
5. The existing in-batch check (two files given the same new name) is unchanged.
6. The renames then run one by one in the same order, as today, and the DB is flushed
   after each file's row changes, so the `(drive, file_path)` UNIQUE constraint is
   checked in that same order. A chain the simulation passed therefore never meets a
   row still holding its target. One commit at the end and today's rollback on any
   error are unchanged.

### 2. Failure cases

- The `.loft`'s directory cannot be listed (permission, unmounted drive): the indexer
  treats it as no `.vtt` found, as `glob()` does today (it returns nothing on an
  unreadable directory), and logs one WARNING with the file id. The reconcile pass skips
  that file, continues with the next and with the reconcile steps after it, and logs one
  WARNING per pass with the number of files skipped this way, only when that number is
  above zero.
- Two `.vtt` files whose names are equal after NFC (one NFC, one NFD) sit next to the
  same `.loft`: on the production host they cannot both exist, because APFS treats them as
  the same name. On a byte-exact filesystem the first in sorted order wins. No error.
- A `.vtt` exists but is empty or has no cues: unchanged; the `.loft` is marked indexed
  with no chunks, and the reconcile pass re-queues it on every pass, as it already does
  today for this case.
- A title becomes a name that already exists after NFC: the existing ` (N)` loop finds it
  (`exists()` sees through normalization on the host), unchanged.
- Batch rename where the folder does not exist: no names are held there, as today.
- Batch rename where the folder exists but cannot be listed: the listing error
  propagates as today (a 500 before anything moves; the dialog shows its generic error).
- A target held only by a DB row whose file is not on disk (a trashed or missing file
  keeps its `file_path`): not in the listing, so the simulation passes, and the
  per-file flush raises the UNIQUE error; the batch is rolled back as today (500,
  nothing changed). Unchanged behavior, see Checked, no action.
- Batch rename fails partway: today's rollback, unchanged.
- Media Import: when a directory cannot be listed, the shared matcher returns no matches
  and logs nothing, exactly as `glob()` does today, so every site keeps its current
  outcome (captions: `(False, None)`; temp-audio download: the existing "did not produce
  STT audio" error; cleanups: nothing removed). It never raises, so a cleanup called
  from an `except` block cannot replace the original exception.

### 3. States

No new state. `IndexedFile.whisper_indexed` keeps its two values; this change only alters
which files the existing transition `true → false` (reconcile) applies to, and which
`.vtt` the existing `false → true` (indexing) reads. The batch rename gains no
intermediate state; it only refuses more plans.

### 4. Data read and written

- Drive directories: listed (read) by Intelligence, Media Import and the core batch
  rename. Written only where they are written today.
- Intelligence `search.db`: `indexed_files.whisper_indexed` (written by reconcile, as
  today); `transcript_chunks`, `embeddings`, `vec_text`, FTS rows and TF-IDF keyword rows
  (written by the `.vtt` indexing path, as today). `transcript_words` is not written by
  this path. For the 117 files this is the first time these rows exist.
- Downstream queues: after a successful `.vtt` index, `requeue_after_whisper` enqueues
  summaries, auto-tags and chapter suggestions for features in `on_index` mode, as it
  does for every transcribed file (see item 5).
- Core DB `files`: read by the batch rename, unchanged; written by Media Import's
  registration through the core, unchanged (it was already NFC).
- Files on disk: new `.loft` and `.vtt` names are NFC. Existing files are not renamed,
  except by Media Import's own cleanup and caption steps as stated in I10.

### 5. External services

No new kind of call. The one-time burst below was accepted by the user on 2026-10-06.
The `.vtt` path itself calls no speech-to-text provider and no LLM; it runs the
embedding model. But a successful index triggers the existing `requeue_after_whisper`,
so for every feature in `on_index` mode the recovered files get the same LLM jobs any
other transcribed `.loft` got. Production on 2026-10-06 has `summaries` and `auto_tags`
in `on_index`: deploying this change enqueues up to 117 summary jobs and 117 auto-tag
jobs once, routed and gated by each drive's `llm_cloud` policy exactly as for other
files. A slow or failing LLM leaves those jobs to the existing retry and sweep; it does
not affect the transcripts.

### 6. Authorization

Unchanged. Indexing and reconcile are background work inside the Intelligence
container; Media Import's routes and the core batch rename keep their current drive
access checks. No new endpoint.

### 7. Effect on existing features

- Search, Ask, the transcript panel, chapters derived from transcripts and detailed
  summaries start to see the 117 recovered transcripts. Features in `on_index` mode run
  for them through the existing `requeue_after_whisper` (item 5); features in `manual`
  mode run when the user asks, as today.
- `.vtt` sidecar selection in Intelligence changes from glob to listing: a stem with
  `[...]` now matches, which is the intended effect.
- The prefix rule is kept: a `.loft` named `Title` with no `.vtt` of its own still takes
  `Title (1).vtt`, as today (see Checked, no action).
- Media Import thumbnails already use the NFC stem (`_save_loft_thumbnail`), so NFC
  `.loft` names do not change thumbnail paths. The `filename` that `create_loft_sync`
  returns to API callers is the NFC name.
- The core subtitle detection for local videos (`services/subtitle.py`) already compares
  NFC to NFC and is unchanged.
- Batch rename: a rename that today silently overwrites an NFD-named sibling, a file
  that a cross-folder "self" match let through, or another batch file in an upward chain
  or swap, is refused with 409. A downward chain, which today succeeds or fails with a
  500 depending on the order SQLAlchemy flushes rows (by primary key), now succeeds
  every time. Batches without any overlap rename exactly as today, thumbnails included
  (in a passing chain each thumbnail moves into a slot its owner has already left).

### 8. Error behavior

- Batch rename: the backend returns its existing 409 `File already exists: <name>` in
  the newly refused cases. The batch-rename dialog shows its existing generic failure
  message for every failure, as today; it is not changed.
- Intelligence logs: one WARNING per file from the indexer when a `.loft`'s directory
  cannot be listed; one WARNING per reconcile pass with the count of such files, only
  when the count is above zero.
- No other new message.

### 9. User-visible behavior

- After deployment, within one reconcile interval plus indexing time, the 117 `.loft`
  files show their transcript in the chunk-based transcript panel, appear in transcript
  search and can be cited by Ask. They do not gain a subtitle track
  (`/files/{id}/subtitles.vtt` needs word rows, which the `.vtt` path does not write).
- Those of them that lack a summary or tag suggestions get one generated, per item 5.
- New imports whose title contains decomposed characters are named in NFC on disk. In
  Finder and in Litloft the name looks the same.
- A batch rename onto a name held by a file whose on-disk name is NFD is refused, as it is
  for an NFC one.
- A batch rename that would rename a file onto a name another file still holds at that
  point (a swap, or renumbering up) now fails with the dialog's generic error and
  changes nothing, where today it silently loses files. Renaming in two steps (for
  example to a temporary prefix first) works. The user guide's "Batch rename" section
  says so in one sentence.
- Renumbering down into free names succeeds reliably.

### 10. Non-functional

- Listing a directory per `.loft` in the reconcile pass: the pass already does a `glob()`
  per such file, which lists the directory too, so the cost is the same order. The
  matcher normalizes each listed name once and stats only name-matched entries, so it
  adds no per-entry stat. The
  candidate set is only active `.loft` files with `whisper_indexed` true and no chunk.
- No schema change, no migration, no new configuration.

## Touch points

- `addons/intelligence/app/sidecar_match.py` (new) — the NFC-literal sibling matcher for
  Intelligence. It cannot import the core's copy (separate container), so the two files
  are identical and kept so by review, like `frontmatter.py`. Their shared contract:
  `match_siblings(directory, stem, rest_pattern)` lists `directory`, keeps entries whose
  NFC name starts with `NFC(stem)` as literal text and whose remainder matches
  `rest_pattern` by `fnmatch.fnmatchcase`, then keeps those for which `is_file()` is
  true, and returns their on-disk paths sorted by on-disk name. It raises `OSError` when
  the directory cannot be listed; each caller decides what that means (Intelligence:
  WARNING and "no match"; Media Import: "no match", silently). It logs nothing itself.
- `addons/intelligence/app/workers/whisper.py` — `_index_loft_vtt` (`.vtt` lookup, the
  `<stem>.vtt` preference, WARNING on an unlistable directory).
- `addons/intelligence/app/indexer.py` — `_reset_loft_refs_with_new_vtt` (`.vtt` lookup,
  per-pass WARNING count).
- `addons/intelligence/tests/` — new tests, and the inventory test (I7).
- `backend/app/services/sidecar_match.py` (new) — the same matcher in the core, used by
  Media Import, which runs in-process and may import the core.
- `addons/media_import/backend/service.py` — `_sanitize_filename`, `create_loft_sync`,
  `_download_captions_sync`, `_cleanup_stt_temp`, `_download_stt_audio_sync`,
  `_cleanup_stale_stt_temp_files`.
- `addons/media_import/backend/subscription/manager.py` — `_sanitize_filename`,
  `_allocate_loft_path`, `_save_vtt`.
- `addons/media_import/backend/tests/` — new tests, a test that both `_sanitize_filename`
  copies give the same output, and the inventory test (I7).
- `backend/app/services/fileops.py` — `_validate_no_duplicates` (batch rename). A HIGH
  risk zone (`docs/process/PROJECT.md`, data the filesystem cannot regenerate).
- `backend/app/services/fileops.py` — `batch_rename` (a flush after each file's row
  changes).
- `backend/tests/` — batch-rename tests and the inventory test over `backend/app` (I7).
- `docs/user-guide/upload-and-fileops.md` — one sentence in "Batch rename": a file
  cannot take a name another selected file still holds at that point in the selection
  order; rename through a temporary name instead.
- `docs/process/PROJECT.md` — "Where specs live": an addon behavior with no spec
  location in its own repository is specified in the core with an `ADDON` id. Not a
  protected path (project-owned). `process.conf` needs no change: `ADDON` is already in
  `domains` and `addons` in `test_dirs`.
- `docs/developer-guide/known-issues.md` — the dotted-title caption overlap (Checked, no
  action).
- Submodule pointers `addons/intelligence` and `addons/media_import` in the core
  repository (CLAUDE.md, Git).
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary; missing
  files; no core-to-addon dependency — the core helper names no addon),
  `.claude/rules/backend-conventions.md` (no language-dependent rules: NFC normalization
  is script-independent; `import app.config as config`).
- `docs/specs/INDEX.md` — three rows.
- No endpoint, WebSocket event or configuration key changes. No protected path is
  edited.

Merge order (Media Import imports a core module, and each addon's CI tests against the
core `develop`):

1. Core PR 1: `backend/app/services/sidecar_match.py`, the batch-rename change, the
   backend inventory test, the user-guide sentence, `PROJECT.md`, `known-issues.md`.
   Carries the SPEC-CORE-003 tests.
2. Intelligence PR, and Media Import PR after core PR 1 is on `develop`. Each carries its
   own SPEC-ADDON tests and inventory test.
3. Core PR 2: the two submodule pointer bumps, verified with
   `git diff --submodule=short addons/`, and SPEC-CORE-003 moved to `implemented`.

## Invariants

I1. A `.loft` gets transcript chunks from an adjacent `.vtt` whose name, after NFC on both sides, starts with the `.loft`'s stem and ends in `.vtt`, whatever the normalization (NFC, NFD or mixed) of either the stored path or the on-disk names.
I2. The `.loft`'s stem is matched as literal text: a stem containing `[`, `]`, `*` or `?` is indexed from its adjacent `.vtt` like any other, and those characters never widen the match (a sibling `Titlex.vtt` does not match the stem `Title[x]`).
I3. When `<stem>.vtt` (compared after NFC) exists beside other matching `.vtt` files, Intelligence indexes `<stem>.vtt`.
I4. The reconcile pass sets `whisper_indexed` to false for an active `.loft` with no transcript chunk exactly when a `.vtt` matching I1–I2 exists beside it; a `.loft` that already has chunks and no speech-to-text temp audio is not re-queued.
I5. Every `.loft` and subscription `.vtt` Media Import creates after this change has an NFC file name, and the `.vtt`'s stem equals the `.loft`'s stem byte for byte.
I6. Media Import's caption download reports success and leaves `<stem>.vtt` on disk when yt-dlp wrote a `<stem>.<lang>.vtt`, also when the stem contains `[`, `]`, `*` or `?`.
I7. In each of `addons/intelligence/app`, `addons/media_import/backend` (tests excluded) and `backend/app`, an AST-based inventory test finds every directory-listing call: the methods `.glob`, `.rglob` and `.iterdir` on any receiver; `.walk` on any receiver except the `ast` module; `glob.glob`, `glob.iglob`, `os.listdir`, `os.scandir`, `os.walk`, `fnmatch.fnmatch`, `fnmatch.fnmatchcase` and `fnmatch.filter` only when called on that module or as a bare name imported from it (so a SQLAlchemy `.filter` is not a match); keys each by (file path, enclosing function's qualified name, call name) with a count, and compares the result with a table in which each key carries a category. A key in category `stored-name` (it compares listed names against a name not taken from the same listing) fails the test unless its enclosing function calls the repository's sidecar matcher or `unicodedata.normalize`; category `listing-only` carries no such check. A call added, removed or moved fails the test until the table is updated.
I8. A batch rename in which some file's new name, after NFC and `str.lower`, is held in the same folder by another file at the moment that rename would run (an unrelated file, including one whose on-disk name is NFD; or another batch file not yet renamed away, as in a swap or an upward chain) returns 409, moves no file and changes no DB row.
I9. A batch rename with no such clash is carried out: every file is renamed, a file renamed to a case or normalization variant of its own name is not reported as a clash, a same-named file in another folder never counts as the file itself, and a downward chain into free names succeeds.
I10. Deploying this change renames, moves or deletes no existing file on a drive, except that Media Import may delete its own stale `<stem>.stt_temp.*` files and rename a downloaded `<stem>.<lang>.vtt` to `<stem>.vtt` for stems its glob used to miss (accepted by the user on 2026-10-06).
I11. Every file Media Import names from a `.loft`'s stem (link-import `<stem>.vtt`, `<stem>.stt_temp.*`) has a stem byte-identical to the stored NFC stem, so Intelligence's exact-path lookup of `<stem>.stt_temp.m4a` finds it.
I12. For a stem without glob metacharacters whose on-disk form is NFC, each Media Import listing site (captions, temp-audio cleanup, stale cleanup, temp-audio download) selects the same set of files as its current `glob` pattern; `.*.vtt` never selects `<stem>.vtt` itself, and `.stt_temp.*` still selects `.part` files.
I13. `_sanitize_filename` in `service.py` and in `subscription/manager.py` return the same NFC string for the same title, at most 200 code points long, and the result never ends in a character with a non-zero `unicodedata.combining()` value.
I14. The stale temp-audio cleanup deletes no `<stem>.stt_temp.*` file younger than 24 hours, whatever the normalization of its name.
I15. In a batch rename that passes the check, every file ends under its new name with its own original bytes, each DB row's `file_path` points at that file, and the request does not fail on the `(drive, file_path)` UNIQUE constraint because of the order of the renames within the batch.
I16. When a Media Import directory cannot be listed, each listing site returns the same result it returns today when `glob()` finds nothing, and raises nothing new.
I17. A `.loft` whose directory cannot be listed is recorded with `whisper_indexed` true by the indexer, and in the reconcile pass it affects neither the handling of the other `.loft` files nor the reconcile steps that run after the `.vtt` check.

## Checked, no action

- **Renaming the existing NFD files on disk to NFC.** Not done (I10). Matching by NFC on
  both sides makes it unnecessary, and renaming 2,000-odd user files has its own risk.
- **The prefix rule in Intelligence.** `Title.loft` without its own `.vtt` takes
  `Title (1).vtt`. This is an existing behavior, it is not caused by normalization, and
  narrowing it changes which files get a transcript. Out of scope; kept as is (I3 only
  guarantees the exact name wins when present).
- **Letting a swap or an upward chain succeed.** That needs a two-phase rename on disk,
  in the DB and for video thumbnails, with its own rollback. The user chose to refuse
  these and allow only chains whose order frees each target (2026-10-06); succeeding is a
  separate spec if it is ever wanted.
- **A rename target held by a trashed or missing file's DB row.** Not visible in the
  listing; the UNIQUE constraint rolls the batch back with a 500, as today (and as a
  single rename does). Not data loss; kept.
- **Video thumbnails keyed by stem.** Two files with the same stem and different
  extensions share a thumbnail slot; existing, unrelated to this change.
- **The kit-owned `process.yml` does not check out submodules.** Not edited here (user
  decision, 2026-10-06); to be raised with the process kit. Until then the SPEC-ADDON
  rows stay `approved`.
- **Two files in different folders given the same new name in one batch.** Refused by the
  existing in-batch check, which is not folder-aware. A false 409, not data loss; kept.
- **`folder_path` is not NFC-normalized** in upload, `move_file`, `copy_file`,
  `move_folder` (`fileops.validate_path_safe`) and Media Import's folder argument. This
  stores a non-NFC folder path in the DB, which is a different defect (DB form, not
  listing comparison). Folder names typed in a browser are NFC in practice. Recorded for a
  separate change.
- **`backend/app/services/subtitle.py` `detect_subtitles`.** Already compares NFC to NFC;
  classified `stored-name` in the inventory and passes its check.
- **Single-file rename, move, copy and other direct opens** (`exists()`, `open()`,
  `rename()` on a path built from the DB). The host resolves them through normalization;
  they are not affected.
- **`clip.py` frame listing, scanner listing, upload temp dirs, addon registry,
  `drive_seed`, `markdown_image_import`, admin listing, eval loaders.** They list a
  directory without comparing against a stored name, or normalize the listed name
  already. They are classified in the inventory test (I7), not changed.
- **frontend and mcp-server.** No server-side directory-listing name match.
- **Media Import's `{stem}.*.vtt` caption pattern also matches another title's
  sidecar** (`Title.Part2.vtt` for `Title`), which `_download_captions_sync` may then
  rename or delete. Existing behavior, not caused by normalization; narrowing it to the
  language code risks missing yt-dlp's language variants and needs its own measurement.
  The user chose to keep it out of this change (2026-10-06); recorded in
  `docs/developer-guide/known-issues.md`. I12 keeps the match set as it is.
- **The batch-rename dialog's generic error.** It discards the response body for every
  failure today; showing the 409 reason is a UI change outside this fix.
- **Byte-exact filesystems holding both an NFC and an NFD name.** Not a production case
  (APFS cannot hold both); first in sorted order wins.
