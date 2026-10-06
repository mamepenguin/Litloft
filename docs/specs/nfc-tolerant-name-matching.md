# Name matching against a directory listing ignores Unicode normalization

SPEC-ID: SPEC-ADDON-001
SPEC-ID: SPEC-ADDON-002
SPEC-ID: SPEC-CORE-003

Approval:

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
  NFC-normalized name, not by glob.
- **SPEC-CORE-003** — The core's batch rename treats two names that differ only in
  normalization (and case, as today) as the same name when checking for an existing file,
  and a batch in which one file takes another batch file's current name (a renumbering
  chain or a swap) renames every file without overwriting any.

The domains follow the user's decision of 2026-10-06: the addon repositories have no spec
location, so this spec lives in the core and the addon behaviors take `ADDON` ids.
`docs/process/PROJECT.md` is updated to say so, and `process.yml` checks out the
submodules so `check-traceability` sees the addon tests that cite these ids (user
decision of 2026-10-06).

## Required items

### 1. Normal flow

SPEC-ADDON-001, indexing a `.loft`:

1. The indexer picks up a `.loft` whose `whisper_indexed` is false.
2. The worker finds the **matching `.vtt` files**: the entries of the `.loft`'s directory
   for which `Path.is_file()` is true (symlinks followed, as `glob` + the existing code
   do), whose on-disk name ends in `.vtt` (case-sensitive, as `glob` on Linux), and whose
   NFC name starts with the NFC stem of the `.loft`. The stem is compared as literal
   text, never as a pattern. This is today's `glob(f"{stem}*.vtt")` with two differences
   only: normalization is ignored, and `[ ] * ?` in the stem are literal.
3. If one of them is exactly `<stem>.vtt` after NFC it is used; otherwise the first in
   sorted order of the on-disk names, as today.
4. Cues are parsed; chunks, embeddings, FTS rows and TF-IDF keywords are written, as
   today. No word rows are written (the `.vtt` path never writes them).

SPEC-ADDON-001, the reconcile pass:

1. For each active `.loft` with `whisper_indexed` true and no transcript chunk, the pass
   looks for matching `.vtt` files exactly as in step 2 above (the same function).
2. If anything matches, `whisper_indexed` is set to false and the file is queued again.
3. On the first pass after deployment this re-queues the 117 files measured above, with
   no manual step.

SPEC-ADDON-002, import:

1. A link import or a subscription import receives a title.
2. The title is sanitized as today and then NFC-normalized; the `.loft` is written under
   that name (with ` (N)` added on a clash, as today).
3. A subscription transcript is written as `<that stem>.vtt`, so both share one form.
4. Caption download by yt-dlp and speech-to-text temp audio use the stored NFC stem, as
   today. The files they produce are found by listing the directory instead of `glob()`.
   Each site keeps the shape of its current pattern: an entry matches when its NFC name
   starts with the NFC stem taken literally, and the rest of the name matches the part of
   today's pattern after `{stem}` with `fnmatch` semantics. So:
   - `_download_captions_sync`: rest matches `.*.vtt`
   - `_cleanup_stt_temp` and `_cleanup_stale_stt_temp_files`: rest matches `.stt_temp.*`
   - `_download_stt_audio_sync`: rest matches `.stt_temp.*.part`, then `.stt_temp.*`
   The match set is identical to today's for any stem without glob metacharacters whose
   on-disk form is NFC, so no site deletes or renames a file it would not have touched
   before, other than the file it was failing to find.
5. Every name Media Import derives from a `.loft`'s stem (link-import `<stem>.vtt`,
   `<stem>.stt_temp.*`) is built from the stored NFC stem, which after step 2 is also the
   `.loft`'s own on-disk stem.

SPEC-CORE-003, batch rename:

1. The user renames several files at once.
2. For each target, the duplicate check lists the folder and compares
   `NFC(name).lower()` on both sides (`str.lower`, as today, not `casefold`); the "is
   this a file in the batch" test compares NFC names.
3. A clash returns 409 as today.
4. Otherwise every file whose name changes is first renamed to a temporary name in its
   own folder that collides with nothing, then each is renamed to its new name. A file
   may therefore take a name that another file of the same batch holds when the batch
   starts (`1.mp4 → 2.mp4`, `2.mp4 → 3.mp4`; or a swap), and no file's content is lost.
   Today the renames run one by one in order, so the first one replaces the second file
   on disk before that file has moved.
5. If any step fails, the files already moved are moved back to their original names
   (from the temporary or the final name), the DB is rolled back, and the error is
   returned, as today.

### 2. Failure cases

- The `.loft`'s directory cannot be listed (permission, unmounted drive): the indexer
  treats it as no `.vtt` found, as `glob()` does today (it returns nothing on an
  unreadable directory), and logs one WARNING with the file id. The reconcile pass skips
  that file, continues with the next, and logs one WARNING per pass with the number of
  files skipped this way, not one line per file.
- Two `.vtt` files whose names are equal after NFC (one NFC, one NFD) sit next to the
  same `.loft`: on the production host they cannot both exist, because APFS treats them as
  the same name. On a byte-exact filesystem the first in sorted order wins. No error.
- A `.vtt` exists but is empty or has no cues: unchanged; the `.loft` is marked indexed
  with no chunks, and the reconcile pass re-queues it on every pass, as it already does
  today for this case.
- A title becomes a name that already exists after NFC: the existing ` (N)` loop finds it
  (`exists()` sees through normalization on the host), unchanged.
- Batch rename where the folder cannot be listed: unchanged (no siblings considered).
- Batch rename fails between the two phases (a file vanished, permission): every file
  is returned to its original name and the DB is unchanged, as with today's rollback.

### 3. States

No new state. `IndexedFile.whisper_indexed` keeps its two values; this change only alters
which files the existing transition `true → false` (reconcile) applies to, and which
`.vtt` the existing `false → true` (indexing) reads.

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
- Files on disk: new `.loft` and `.vtt` names are NFC. Existing files are not renamed.

### 5. External services

No new kind of call. The one-time burst below was accepted by the user on 2026-10-06. The `.vtt` path itself calls no speech-to-text provider and no
LLM; it runs the embedding model. But a successful index triggers the existing
`requeue_after_whisper`, so for every feature in `on_index` mode the recovered files get
the same LLM jobs any other transcribed `.loft` got. Production on 2026-10-06 has
`summaries` and `auto_tags` in `on_index`: deploying this change enqueues up to 117
summary jobs and 117 auto-tag jobs once, routed and gated by each drive's `llm_cloud`
policy exactly as for other files. A slow or failing LLM leaves those jobs to the
existing retry and sweep; it does not affect the transcripts.

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
- The `stem*` prefix rule is kept: a `.loft` named `Title` with no `.vtt` of its own still
  takes `Title (1).vtt`, as today (see Checked, no action).
- Media Import thumbnails already use the NFC stem (`_save_loft_thumbnail`), so NFC
  `.loft` names do not change thumbnail paths.
- The core subtitle detection for local videos (`services/subtitle.py`) already compares
  NFC to NFC and is unchanged.
- Batch rename: a rename that today silently overwrites an NFD-named sibling is refused
  with 409, and a renumbering chain or swap inside one batch, which today overwrites a
  file, now succeeds. Watch history, tags and comments stay with the file they belonged
  to, because each DB row follows its own file.

### 8. Error behavior

No new user-visible error. The batch rename's existing 409 `File already exists` message
is returned in the newly detected case. An unlistable directory in the reconcile pass is
logged at WARNING with the file id and the error, once per pass per file.

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
- A batch rename that renumbers files onto each other's names (for example sequential
  numbering started one higher than the current numbers) completes, and each file keeps
  its own content.

### 10. Non-functional

- Listing a directory per `.loft` in the reconcile pass: the pass already does a `glob()`
  per such file, which lists the directory too, so the cost is the same order. The
  candidate set is only active `.loft` files with `whisper_indexed` true and no chunk.
- No schema change, no migration, no new configuration.

## Touch points

- `addons/intelligence/app/workers/whisper.py` — `_index_loft_vtt` (`.vtt` lookup and the
  `<stem>.vtt` preference).
- `addons/intelligence/app/indexer.py` — `_reset_loft_refs_with_new_vtt` (`.vtt` lookup).
- `addons/intelligence/tests/` — new tests, and an inventory test that pins every
  directory-listing call in `app/` (see I7).
- `addons/media_import/backend/service.py` — `_sanitize_filename`, `create_loft_sync`,
  `_download_captions_sync`, `_cleanup_stt_temp`, `_download_stt_audio_sync`,
  `_cleanup_stale_stt_temp_files`.
- `addons/media_import/backend/subscription/manager.py` — `_sanitize_filename`,
  `_allocate_loft_path`, `_save_vtt`.
- `addons/media_import/backend/tests/` — new tests and the same kind of inventory test.
- `backend/app/services/fileops.py` — `_validate_no_duplicates` (batch rename). A HIGH
  risk zone (`docs/process/PROJECT.md`, data the filesystem cannot regenerate).
- `backend/app/services/fileops.py` — `batch_rename` and `_rollback_fs_renames`
  (two-phase rename and its rollback).
- `backend/tests/` — batch-rename tests and an inventory test over `backend/app`.
- `.github/workflows/process.yml` — `submodules: recursive` on the checkout, as in
  `ci.yml`. CRITICAL zone and a protected path; edited with the user's decision of
  2026-10-06.
- `docs/process/PROJECT.md` — "Where specs live": an addon behavior with no spec
  location in its own repository is specified in the core with an `ADDON` id. A
  protected path (process prose).
- `docs/developer-guide/known-issues.md` — the dotted-title caption overlap (Checked, no
  action).
- Submodule pointers `addons/intelligence` and `addons/media_import` in the core
  repository (CLAUDE.md, Git).
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary; missing
  files; addons must not need core changes for their own behavior — none is added here),
  `.claude/rules/backend-conventions.md` (no language-dependent rules: NFC normalization
  is script-independent).
- `docs/specs/INDEX.md` — three rows.
- No endpoint, WebSocket event, configuration key or user-guide page changes. The
  protected paths edited are `process.yml` and `PROJECT.md`, listed above.

## Invariants

I1. A `.loft` gets transcript chunks from an adjacent `.vtt` whose name, after NFC on both sides, starts with the `.loft`'s stem and ends in `.vtt`, whatever the normalization (NFC, NFD or mixed) of either the stored path or the on-disk names.
I2. The `.loft`'s stem is matched as literal text: a stem containing `[`, `]`, `*` or `?` is indexed from its adjacent `.vtt` like any other, and those characters never widen the match.
I3. When `<stem>.vtt` (compared after NFC) exists beside other matching `.vtt` files, Intelligence indexes `<stem>.vtt`.
I4. The reconcile pass sets `whisper_indexed` to false for an active `.loft` with no transcript chunk exactly when a `.vtt` matching I1–I2 exists beside it; a `.loft` that already has chunks and no speech-to-text temp audio is not re-queued.
I5. Every `.loft` and subscription `.vtt` Media Import creates after this change has an NFC file name, and the `.vtt`'s stem equals the `.loft`'s stem byte for byte.
I11. Every file Media Import names from a `.loft`'s stem (link-import `<stem>.vtt`, `<stem>.stt_temp.*`) has a stem byte-identical to the stored NFC stem, so Intelligence's exact-path lookup of `<stem>.stt_temp.m4a` finds it.
I12. For a stem without glob metacharacters whose on-disk form is NFC, each Media Import listing site (captions, temp-audio cleanup, stale cleanup, temp-audio download) selects the same set of files as its current `glob` pattern.
I6. Media Import's caption download reports success and leaves `<stem>.vtt` on disk when yt-dlp wrote a `<stem>.<lang>.vtt`, also when the stem contains `[`, `]`, `*` or `?`.
I7. In each of `addons/intelligence/app`, `addons/media_import/backend` (tests excluded) and `backend/app`, an AST-based inventory test finds every call to `Path.glob`, `Path.rglob`, `Path.iterdir`, `Path.walk`, `glob.glob`, `glob.iglob`, `os.listdir`, `os.scandir`, `os.walk`, `fnmatch.fnmatch`, `fnmatch.fnmatchcase` and `fnmatch.filter` (attribute calls are matched by method name, whatever the receiver), keys each by (file path, enclosing function's qualified name, call name) with a count, and compares the result with a table in which each key carries one category: `stored-name` (compares against a name not taken from the same listing, and goes through the NFC-literal helper) or `listing-only` (does not). A call added, removed or moved fails the test until the table is updated.
I8. A batch rename to a name that equals an existing sibling's on-disk name after NFC and `str.lower` returns 409 and moves no file.
I9. A batch rename whose new names do not collide with any sibling after NFC and `str.lower` behaves as before: every file is renamed, and a file renamed to a case or normalization variant of its own name is not reported as a clash.
I10. No existing file on a drive is renamed, moved or deleted by deploying this change.
I13. A batch rename in which a file's new name equals the current name of another file in the same batch (a chain or a swap) leaves every file under its new name with its own original bytes, and each DB row's `file_path` points at the file whose content it described before.
I14. A batch rename that fails partway leaves every file under its original name with its original bytes and the DB unchanged.

## Checked, no action

- **Renaming the existing NFD files on disk to NFC.** Not done (I10). Matching by NFC on
  both sides makes it unnecessary, and renaming 2,000-odd user files has its own risk.
- **The prefix rule in Intelligence.** `Title.loft` without its own `.vtt` takes
  `Title (1).vtt`. This is an existing behavior, it is not caused by normalization, and
  narrowing it changes which files get a transcript. Out of scope; kept as is (I3 only
  guarantees the exact name wins when present).
- **`folder_path` is not NFC-normalized** in upload, `move_file`, `copy_file`,
  `move_folder` (`fileops.validate_path_safe`) and Media Import's folder argument. This
  stores a non-NFC folder path in the DB, which is a different defect (DB form, not
  listing comparison). Folder names typed in a browser are NFC in practice. Recorded for a
  separate change.
- **`backend/app/services/subtitle.py` `detect_subtitles`.** Already compares NFC to NFC.
- **Single-file rename, move, copy and other direct opens** (`exists()`, `open()`,
  `rename()` on a path built from the DB). The host resolves them through normalization;
  they are not affected.
- **`clip.py` frame listing, scanner listing, upload temp dirs, addon registry,
  `drive_seed`, `markdown_image_import`, admin listing.** They list a directory without
  comparing against a stored name, or normalize the listed name already. They are
  classified in the inventory test (I7), not changed.
- **frontend and mcp-server.** No server-side directory-listing name match.
- **Media Import's `{stem}.*.vtt` caption pattern also matches another title's
  sidecar** (`Title.Part2.vtt` for `Title`), which `_download_captions_sync` may then
  rename or delete. Existing behavior, not caused by normalization; narrowing it to the
  language code risks missing yt-dlp's language variants and needs its own measurement.
  The user chose to keep it out of this change (2026-10-06); recorded in
  `docs/developer-guide/known-issues.md`. I12 keeps the match set as it is.
- **Byte-exact filesystems holding both an NFC and an NFD name.** Not a production case
  (APFS cannot hold both); first in sorted order wins.
