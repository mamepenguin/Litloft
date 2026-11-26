# Sidecar subtitles follow their video, and a video's page manages them

SPEC-ID: SPEC-CORE-184
SPEC-ID: SPEC-CORE-185
SPEC-ID: SPEC-CORE-186
SPEC-ID: SPEC-ADDON-187

Approval:

## Summary

A subtitle (`.srt`, `.vtt`) is a sidecar file next to its video and has no database row.
Rename and move already carry sidecars, but copy, purge and every name collision do not, and
nothing in the UI lists, replaces or removes a subtitle. This change closes that gap for the
person who keeps videos with subtitle files on a drive:

- **SPEC-CORE-184** — file operations: one ownership rule decides which video a sidecar belongs
  to; copy copies the sidecars; purging a trashed video deletes the sidecars only it owns; a
  rename, move or batch rename that would land a sidecar on an existing name is refused before
  anything moves.
- **SPEC-CORE-185** — the video's file page gets a Subtitles list with add, replace and
  delete, and every subtitle upload is checked for size and encoding before it lands.
- **SPEC-CORE-186** — leftovers of the time subtitles had rows: no file can be renamed or
  created into a subtitle name, the scan that drops an old subtitle row says so with
  `files.purged`, and purging a trashed old subtitle row never deletes the file.
- **SPEC-ADDON-187** — the knowledge editor no longer inserts `loft://undefined` when a
  subtitle is dropped or pasted into a note.

## Definitions

- **Sidecar name.** In a folder, a file named `<stem>.srt`, `<stem>.vtt`, `<stem>.<lang>.srt`
  or `<stem>.<lang>.vtt`, where `<lang>` is 2 or 3 ASCII letters, compared after NFC
  normalisation (as `_parse_subtitle_filename` does today).
- **Subtitle-serving file.** A `File` row with `file_type == "video"`, or a `.loft`
  (`application/vnd.litloft.loft+json`), in any state: active, trashed or missing.
- **Owner.** A sidecar in folder F is owned by the subtitle-serving files in F whose stem
  makes it a sidecar name, keeping only those with the **longest** such stem. So with
  `movie.mp4` and `movie.ja.mp4` in one folder, `movie.ja.srt` is the bare track of
  `movie.ja.mp4` only; `movie.mp4` does not list it. Two files with the same stem
  (`movie.mp4`, `movie.mkv`) are both owners of `movie.srt`: the sidecar is **shared**.
- **Own sidecars of V.** The sidecars V owns, shared or not.

## Required items

### 1. Normal flow

**SPEC-CORE-184 — file operations**

1. *Listing.* `detect_subtitles` and the file detail's `subtitles` list only the own sidecars
   of the video, by the ownership rule. Order is unchanged: the bare track first, then by
   language.
2. *Rename, move, batch rename.* Before the video moves, every own sidecar is planned to its
   new name (`<new stem>` + the part after the old stem). If a planned name is already taken
   on disk, and no earlier step of the same operation frees it, the whole operation answers
   409 and nothing moves (see 2. Failure cases). Otherwise the video moves and then each
   sidecar: a sidecar that another owner still needs after the operation (a shared sidecar
   whose other owner stays in the old folder under the same stem) is **copied**; any other is
   **moved**.
3. *Copy* (single and batch). The copy's name is chosen as today (`_copy`, `_copy_2`, …),
   except that a candidate is skipped when any of the video's own sidecars, renamed to the
   candidate's stem, would land on a taken name. Each own sidecar is then copied beside the
   copy under the copy's stem. The original sidecars are not touched. Copy across drives
   works the same way.
4. *Trash and restore.* Unchanged: trashing a video does not touch disk, so its sidecars stay;
   restoring it finds them where they were.
5. *Purge of a trashed video* (single purge, batch purge, Empty trash, the 30-day auto-purge).
   After the video file is deleted, each of its own sidecars is deleted unless another
   subtitle-serving row (any state) still owns it.

**SPEC-CORE-185 — the Subtitles list on a video's page**

1. A video's file page (`file_type == "video"`; not a `.loft`) shows a **Subtitles** list:
   one row per own sidecar with its language label (or the default label for a bare track)
   and its file name. With none, it shows an empty state and the add action.
2. *Add.* The viewer picks a `.srt` or `.vtt` file and a language (none, or a 2–3 letter code
   chosen from a list or typed). The file is saved as `<video stem>[.<lang>].<ext>` beside the
   video, and the list and the player's tracks refresh.
3. *Replace.* On a row, the viewer picks a `.srt` or `.vtt` file. It is saved under the
   row's name with the picked file's extension; if the extension differs, the old file is
   deleted after the new one is written. The list and the player's tracks refresh.
4. *Delete.* On a row, the viewer confirms a dialog naming the file; the sidecar is deleted
   from disk. If it was shared, the dialog says how many other videos also use it. With no
   sidecar left, the player offers the generated track as it does today.
5. *Upload checks*, for add, replace and the general upload drawer alike: a subtitle larger
   than 5 MB, or one that does not decode as UTF-8 (a BOM is allowed), is refused and nothing
   is written. A general upload of a subtitle whose name is taken stays refused (409), with a
   message that points to the video's Subtitles list.
6. A general upload that creates a folder holding only subtitles makes that folder listed in
   its parent at once (tracked as an empty folder), instead of after the next scan.

**SPEC-CORE-186 — leftover subtitle rows and subtitle names**

1. Renaming a file (single or batch) to a name with a `.srt` or `.vtt` extension, or creating
   a file (`POST /api/drives/{drive}/files`) with such a name, answers 400; nothing changes.
2. When a scan drops non-trashed subtitle rows left by an earlier version, it emits one
   `files.purged` with their ids and drive.
3. Purging a trashed subtitle row (single, batch, Empty trash, auto-purge) deletes the row and
   its thumbnail and leaves the subtitle file on disk.

**SPEC-ADDON-187 — knowledge editor**

1. When a dropped or pasted file is a subtitle and the upload answers `status: "sidecar"`,
   the editor removes its `uploading…` placeholder and inserts nothing. A short notice says
   the subtitle was placed beside its video folder's files. The upload itself is unchanged.

### 2. Failure cases

- **Collision on rename, move or batch rename.** 409 with `detail` naming each taken sidecar
  name (drive-relative path). Nothing on disk or in the DB changes. Batch rename is checked in
  its existing execution order, with names freed by earlier steps of the batch counted free,
  so the downward renumbering chains that succeed today still succeed.
- **A sidecar move or copy fails after the video moved** (disk error, permission). Logged; the
  video's change stands, as today. Not rolled back.
- **Copy cannot find a candidate name** within the existing 1000-candidate limit: 409, as
  today.
- **A sidecar delete during purge fails.** Logged; the purge of the row stands. The file left
  behind becomes a sidecar of any later same-stem video (unchanged risk, now only on I/O
  failure).
- **Add** with a name already taken: 409 "a subtitle for this language exists; replace it".
  **Add / replace** with a wrong extension, over 5 MB, or not UTF-8: 400 with the reason.
  **Replace / delete** naming a file that is not an own sidecar of the video (stale list,
  another video's sidecar, a path): 404. A disk error: 500, logged, and for replace the old
  file is left as it was (written to a temporary name and renamed into place).
- **Knowledge:** the upload fails → the editor's existing failure path, unchanged.

### 3. States

- A sidecar file: present (owned by one, several or no rows) or absent. Ownership is computed
  from the folder's rows and file names at each request; nothing is stored.
- The Subtitles list: loading (with the file page), loaded with rows, loaded empty, and per
  row an in-progress state while add, replace or delete runs (that row's actions are disabled;
  other rows stay usable). An error shows inline under the list until the next action.
- The video row's lifecycle (active, missing, trash) is unchanged. Trash keeps sidecars;
  purge decides them; missing purge leaves the disk untouched.

### 4. Data read and written

- Read: `File` rows of the folder (`drive`, `folder_path`, `filename`, `file_type`,
  `mime_type`, all states) to apply the ownership rule; folder listings on disk.
- Written on disk: sidecar files (copy, move, delete, write on add/replace via a temporary file
  and `os.replace`).
- Written in the DB: none for sidecars. SPEC-CORE-186 deletes leftover subtitle rows as it
  already does; SPEC-CORE-185 step 6 adds an `EmptyFolder` row through
  `_ensure_empty_folder_tracked`.
- Not written: no new table or column, no cache.

### 5. External services

None.

### 6. Authorization

- The new subtitle endpoints resolve the video through `_get_file_or_404` with the viewer's
  unlocked groups, like rename and move: a locked drive answers 404. No admin requirement,
  like every other file mutation.
- Every path is built from the video's own row and a sidecar name produced by the ownership
  rule, then checked with the existing drive-boundary helpers (`existing_or_409` /
  `new_or_409`, `validate_within_drive`). No client-supplied path is opened.

### 7. Effect on existing features

- The player's track list and `GET /api/files/{id}/subtitles/{index}` use the same listing,
  so `movie.mp4` stops offering `movie.ja.srt` when `movie.ja.mp4` exists.
- Media Import writes `.loft` sidecar `.vtt` files and intelligence reads them; `.loft` is a
  subtitle-serving file, so its sidecars follow copy, purge and the collision rule too. The
  Subtitles list is not shown for `.loft`.
- Batch rename's existing in-order collision check for the files themselves is unchanged; the
  sidecar check runs in the same order before anything moves.
- `files.purged` consumers (knowledge's summary pointers, intelligence's index) receive the
  dropped subtitle ids.

### 8. Error behavior

- Rename, move and batch rename dialogs already show a 409's detail; the detail lists the
  taken sidecar names.
- The Subtitles list shows the server's message inline. The upload drawer shows the server's
  message for a refused subtitle in place of the bare status text.
- Logged: every sidecar move, copy or delete failure with both paths (existing pattern).

### 9. User-visible behavior

- File page of a video: a Subtitles list (design agreed before implementation), with add per
  list and replace / delete per row. The delete dialog is the app's existing confirm dialog.
- Rename / move / batch rename can now be refused because of a subtitle name.
- A copied video plays with its subtitles.
- Emptying the trash no longer leaves a deleted video's subtitles on disk.
- Japanese and English strings in `messages-core`.

### 10. Non-functional

- Ownership needs the folder's rows and one directory listing per operation; batch operations
  list each touched folder once.
- Subtitle bodies are at most 5 MB and are sent in one multipart request; no chunked upload.
- No change to what leaves the machine.

## Touch points

- `backend/app/services/subtitle.py`: ownership rule, `detect_subtitles`, `move_sidecar_subtitles`, new copy / delete / plan helpers.
- `backend/app/services/fileops.py`: `rename_file`, `move_file`, `copy_file`, `_resolve_copy_filename`, `batch_rename`, `_carry_sidecars`, `_carry_batch_sidecars`, `physical_delete`, `purge_file`, `purge_all_trash`, `validate_filename` callers.
- `backend/app/main.py` or wherever the 30-day auto-purge calls `physical_delete`.
- `backend/app/routers/files.py`: `_detect_file_subtitles`, `get_subtitle`, new `POST /api/files/{id}/subtitles`, `PUT /api/files/{id}/subtitles`, `DELETE /api/files/{id}/subtitles` (sidecar named by `name`), batch rename / copy / purge endpoints.
- `backend/app/routers/drives.py`: `POST /api/drives/{drive}/files` (subtitle names refused), trash empty.
- `backend/app/services/upload.py`: `init_upload` (size), `complete_upload` / `_finish_subtitle_upload` (encoding, empty-folder tracking).
- `backend/app/services/scanner.py`: dropping leftover subtitle rows emits `files.purged`.
- `backend/app/schemas.py`: `SubtitleInfo` gains `filename` (and `shared_with` count); request/response models for the new endpoints.
- `frontend/src/components/FileDetail/` (the Subtitles list and its placement), `frontend/src/lib/api.ts`, `frontend/src/types/index.ts`, the upload drawer's error text, `frontend/src/messages-core/{ja,en}.json`.
- `backend/tests/test_listing_call_inventory.py`: every new directory listing is registered there with its category (SPEC-ADDON-001 I7).
- `addons/knowledge/frontend/Editor.tsx` (subtitle drop and paste).
- `docs/user-guide/viewers-and-players.md`, `docs/user-guide/upload-and-fileops.md`, `docs/reference/api.md`, `docs/developer-guide/known-issues.md` (rows this fixes), `.claude/rules/design-decisions.md` (Trash: the explicit subtitle delete; a sidecar ownership line).
- Protected paths: none. Checked against `docs/process/risk-and-human-review.md` and `process/protected-paths.conf`.

## Invariants

I1. A sidecar is listed for, carried by, copied with and purged with only the subtitle-serving
    rows that own it by the longest-stem rule; `movie.mp4` never lists or takes `movie.ja.srt`
    while a `movie.ja.*` video row exists in that folder.
I2. A rename, move or batch rename never overwrites an existing file on disk and never leaves
    a video separated from a sidecar it owned: if any planned sidecar name is taken, the
    operation answers 409 and the video, its sidecars and its row are unchanged.
I3. After a rename or move of one owner of a shared sidecar, every owner that did not move
    still lists that sidecar.
I4. A copied video lists the same tracks (languages and formats) as its source, and the
    source's sidecar files are unchanged.
I5. Purging a trashed video deletes exactly the sidecars no remaining row owns; a sidecar
    shared with any row in any state stays on disk. Trashing, restoring and purging a missing
    video never touch a sidecar.
I6. A subtitle delete, replace or add only ever touches a sidecar of the video named in the
    request, inside that video's folder; a name that is not one of its own sidecars answers
    404 and changes nothing.
I7. A replace that fails leaves the previous subtitle file byte-for-byte unchanged.
I8. No subtitle over 5 MB or not decodable as UTF-8 lands on disk through any upload path.
I9. No rename or create produces a `File` row whose name has a subtitle extension, and purging
    a trashed subtitle row never deletes the file at its path.
I10. Every leftover subtitle row a scan deletes is announced in one `files.purged` for that
     scan, with its id.
I11. Dropping or pasting a subtitle into the knowledge editor never inserts a `loft://` link
     whose id is not a real file id.

## Checked, no action

- **Giving subtitles database rows** (tracks owned by a `video_id`). Rejected: #490 moved
  subtitles out of rows because rows went missing on every rescan and purge deleted the real
  file; a sidecar placed on disk by hand must keep working with no import step.
- **A Litloft trash for subtitles.** The human chose deletion from disk behind a confirm
  dialog: subtitles can usually be fetched again, and a second trash mechanism is not worth it.
- **Overwriting a taken sidecar name on rename or move.** Rejected by the human: it deletes a
  file the viewer did not name.
- **Showing `.loft` sidecars over the YouTube embed.** The embed is an iframe; drawing captions
  over it is its own feature. The known-issues row stays.
- **A rename that changes only the case of the name** leaves sidecars in the old case on a
  case-insensitive macOS bind mount, as it does the video. The known-issues row stays.
- **Purging a missing video deletes its sidecars.** Not done: a missing purge is defined as
  DB-only, and the video may have been moved off Litloft with its sidecars still wanted.
- **Converting Shift_JIS or other encodings on upload.** Refused instead; old encodings are out
  of scope for this personal tool. A subtitle already on disk that is not UTF-8 can now be
  replaced or deleted from the list.
- **A WebSocket event when a subtitle changes.** The page that made the change refreshes
  itself; another open page sees the change on its next load.
- **Subtitle tracks on a file page other than video** (audio files). Players for audio show no
  captions today; unchanged.
- **The `readonly` drive key**, which nothing enforces, is not enforced here either.
