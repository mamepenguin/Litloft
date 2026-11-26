# Sidecar subtitles follow their video, and a video's page manages them

SPEC-ID: SPEC-CORE-184
SPEC-ID: SPEC-CORE-185
SPEC-ID: SPEC-CORE-186
SPEC-ID: SPEC-ADDON-187

Approval: sha256:a4f02644cb6995df4e62ebb72e0f86523974d57e56e96a038f6bd9b518812d8d Yuichi Senga 2026-11-26

## Summary

A subtitle (`.srt`, `.vtt`) is a sidecar file next to its video and has no database row.
Rename and move already carry sidecars. But copy, purge and every name collision ignore them,
and nothing in the UI lists, replaces or removes a subtitle. This change closes that gap for
the person who keeps videos with subtitle files on a drive.

- **SPEC-CORE-184 (file operations).**
  - One ownership rule decides which video a sidecar belongs to.
  - Copy copies the sidecars.
  - Purging a trashed video deletes the sidecars only it owns.
  - Refused before anything moves: a rename, move, batch rename, copy or upload that would
    land a sidecar on an existing name, or hand an existing sidecar to a different video.
  - A multi-file move keeps going and reports each refused file.
- **SPEC-CORE-185 (the Subtitles list).**
  - A video's file page gets a Subtitles list with add, replace and delete.
  - Every subtitle upload is checked for size and encoding before it lands.
  - Every refusal is shown as a translated message.
- **SPEC-CORE-186 (leftovers from when subtitles had rows).**
  - No file can be renamed or created into a subtitle name.
  - Every deletion of an old subtitle row is announced with `files.purged`.
  - Purging an old subtitle row never deletes the file.
- **SPEC-ADDON-187 (knowledge editor).** It no longer inserts `loft://undefined` when a
  subtitle is dropped or pasted into a note.

Design: https://claude.ai/artifact/5rnicTtn6t549nD2nLrhX9, saved in
`docs/process/reviews/feature-subtitle-sidecars/design/`.

## Definitions

- **Sidecar name.** In a folder, a file named `<stem>.srt`, `<stem>.vtt`, `<stem>.<lang>.srt` or
  `<stem>.<lang>.vtt`, where `<lang>` is 2 or 3 ASCII letters. Names are compared after NFC
  normalisation, as `_parse_subtitle_filename` does today. Media Import writes one `<stem>.vtt`
  per `.loft` (SPEC-ADDON-165), which this rule matches.
- **Subtitle-serving row.** A `File` row with `file_type == "video"`, or a `.loft`
  (`application/vnd.litloft.loft+json`). It counts whether it is active, trashed or missing.
  A row retired by `resolve_db_path_conflict` (`file_path` starting `__missing_`) does not
  count.
- **Owners.** A sidecar in folder F is owned by the subtitle-serving rows in F whose stem makes
  it a sidecar name. Only the rows with the **longest** such stem count.
  - Example: with `movie.mp4` and `movie.ja.mp4` in one folder, `movie.ja.srt` is the bare
    track of `movie.ja.mp4` alone.
  - Rows with the same stem (`movie.mp4`, `movie.mkv`) are all owners of `movie.srt`. Such a
    sidecar is **shared**.
- **Own sidecars of V.** The sidecars V owns, shared or not. The list, the player and every
  operation below use only these.
- **Owner change.** An operation changes owners when a sidecar that has owners before the
  operation and stays where it is ends up owned under a different stem.
  - Example: the longest-stem owner moves from `movie` to `movie.ja`.
  - Not an owner change:
    - a sidecar with no owner gaining one (a subtitle uploaded before its video);
    - a sidecar gaining or losing an owner with the same stem (`movie.mkv` beside
      `movie.mp4`, an upload over a Missing row of the same name);
    - a target already holding byte-identical content, which counts as carried;
    - a sidecar the operation itself carries, copies or deletes.
- **One language.** A 3-letter code that `_LANG_NAMES` maps to the same language as a 2-letter
  one (`jpn`/`ja`, `eng`/`en`, `chi`/`zh`, `kor`/`ko`) is the same language for "one track per
  language". The select offers only the 2-letter codes.
- **Size limit.** 5 MiB (5 × 1024 × 1024 bytes). It is the constant `get_subtitle` already
  uses, defined once and shared.

## Required items

### 1. Normal flow

**SPEC-CORE-184: file operations**

1. *Listing.* `detect_subtitles`, the file detail's `subtitles` and
   `GET /api/files/{id}/subtitles/{index}` cover only the video's own sidecars. The order is
   unchanged: the bare track first, then by language.
2. *Single rename and single move.*
   - Before anything changes, every own sidecar is planned to its new name: `<new stem>` plus
     the part after the old stem.
   - A planned name held by another own sidecar of the same video, which moves in the same
     operation, counts as free.
   - The operation is refused with 409 when either:
     - a planned name is taken on disk and its content differs (code `subtitle_name_taken`); or
     - the operation would change owners (code `subtitle_owner_change`).
   - Otherwise the video moves, then each sidecar. The order is by dependency, so no sidecar is
     written onto a name another own sidecar still holds; a cycle goes through a temporary
     name. Each sidecar is:
     - **copied** if another owner stays in the old folder under the same stem;
     - **left as is** when the target already holds byte-identical content; the source is
       then deleted if no owner stays in the old folder;
     - **moved** in every other case.
3. *Batch rename.* The same planning runs over the whole batch, in the batch's existing
   execution order, before anything changes. Names freed by earlier steps of the batch count
   as free. Any conflict refuses the whole batch with 409 `subtitle_conflict`, whose `names`
   lists every conflicting sidecar of either kind, and nothing changes. Batch rename is already all-or-nothing for the files themselves.
4. *Batch move* (`PUT /api/files/batch/move`, used by drag and drop of several files and by
   paste).
   - It stays per file. Each file is planned as in step 2 against the disk as the earlier files
     left it.
   - A refused file stays where it is. Its `errors` entry carries the code and the names.
   - The others move.
5. *Copy*, single and batch, same drive or another.
   - The copy's name is chosen as today (`_copy`, `_copy_2`, …).
   - A candidate is skipped when any own sidecar, renamed to that candidate's stem, would land
     on a taken name, or when the copy would change owners in the destination folder.
   - Each own sidecar is copied beside the copy under the copy's stem. The source sidecars are
     not touched.
6. *Video upload.* An upload whose file name classifies (by extension) as a video or a `.loft`,
   and whose new row would change owners in its folder, is refused at init with 409
   `subtitle_owner_change`. It is not checked again at complete.
7. *Trash and restore.* Unchanged. Trashing does not touch disk, the trashed row keeps owning
   its sidecars, and restore finds them in place.
8. *Purging a trashed video.* This covers single purge, batch purge, Empty trash and the
   30-day auto-purge.
   - After the row's purge commits, each of its own sidecars is deleted, unless another
     subtitle-serving row in the folder, in any state, has the same stem.
   - The check runs after the commit that deleted the rows. Empty trash commits once for all
     rows, so two trashed owners of one sidecar purged together delete it.
   - A sidecar is never handed to a shorter-stem video. With `movie.mp4` beside
     `movie.ja.mp4`, purging `movie.ja.mp4` deletes `movie.ja.srt`.

**SPEC-CORE-185: the Subtitles list on a video's page**

1. The Info tab of a video's file page shows a **字幕 / Subtitles** section, after the file's
   metadata. It applies only to `file_type == "video"`, not to a `.loft`. It appears wherever
   the Info tab appears: beside the player, stacked under it, and in the phone's inspector
   sheet. Contents:
   - one row per own sidecar, showing its language label (`既定` / `Default` for a bare
     track) and its file name;
   - the section label carries the count;
   - **字幕を追加 / Add subtitle** under the rows.
   - With no sidecar: `字幕はありません / No subtitles`, then the add button.
2. *Add.*
   - The button opens an inline form: a file chooser (`.srt`, `.vtt`), a language select, the
     resulting file name, **キャンセル** and **追加**.
   - The language select offers: the 2-letter codes of the `_LANG_NAMES` table, `指定しない /
     None`, and `その他のコード… / Other code…`, which opens a text field under the select taking
     2 or 3 ASCII letters.
   - Language names, in the select and on the rows, are translated on the frontend from the
     code (`messages-core`). An unknown code is shown upper-cased, and a bare track as `既定`.
   - The code is lowercased. The file is saved as `<video stem>[.<lang>].<ext>` beside the
     video.
   - The list and the player's tracks refresh.
3. *Replace.*
   - On a row, a replace control opens a file chooser.
   - The picked file is saved under the row's name, with the picked file's extension. It is
     written to a temporary name, then renamed into place.
   - If the extension differs, the old file is deleted after the new one is in place.
   - The list and the player refresh.
4. *Delete.*
   - On a row, a delete control opens the app's confirm dialog. It names the file and says the
     file is removed from disk and cannot be restored.
   - If the sidecar is shared, it also says how many other videos use it.
   - On confirm, the file is deleted and the list and the player refresh.
   - With no sidecar left, the player offers the generated track, as it does today.
5. *One track per language.* Add refuses a language the video already has, whatever the
   extension. Replace cannot create a second track: replacing `movie.ja.srt` with a `.vtt` while
   `movie.ja.vtt` also exists is refused.
6. *Upload checks.* These apply to add, replace and the general upload drawer:
   - a subtitle over the size limit, or one that does not decode as UTF-8 (a BOM is allowed),
     is refused and nothing is written;
   - a general upload of a subtitle whose name is taken stays refused (409).
7. A general upload that creates a folder holding only subtitles makes that folder listed in
   its parent at once (tracked as an empty folder), not after the next scan.
8. *Refusals are shown translated.* Every 409, 400 or 413 described here carries a
   machine-readable code. Every entry point turns the code into a message in the viewer's
   language and names the files involved. The entry points are:
   - rename: `RenameDialog` (from `FileActions` and `FileContextMenu`, shown inside the dialog
     as D8), the file page's title rename, and the folder tree's inline rename
     (`useInlineRename`);
   - move: the move dialog of `FileActions`, the context menu, the selection bar's move
     (`SelectionBar`), drag and drop (`useDragAndDrop`) and paste (`ClipboardProvider`);
   - batch rename (`BatchRenameDialog`), copy (single and batch), new file and quick note
     (`subtitle_extension_reserved`);
   - the Subtitles list;
   - the upload drawer.

   The messages (ja; en equivalents in `messages-core`):

   | Code | Message |
   |---|---|
   | `subtitle_name_taken` | 行き先に同じ名前の字幕があります。 + names |
   | `subtitle_owner_change` | 別の動画の字幕の持ち主が変わるため、この操作はできません。 + names |
   | `subtitle_conflict` (batch) | 字幕の名前が重なるため変更できません。 + names |
   | `subtitle_language_taken` | この言語の字幕はすでにあります。差し替えを使ってください。 |
   | `subtitle_language` | 言語コードは英字 2〜3 文字で入力してください。 |
   | `subtitle_extension` | .srt か .vtt のファイルを選んでください。 |
   | `subtitle_extension_reserved` | .srt と .vtt の名前は字幕のアップロードでだけ使えます。 |
   | `subtitle_too_large` | 字幕が 5 MB を超えています。 |
   | `subtitle_not_utf8` | UTF-8 で保存された字幕ではありません。 |
   | sidecar carry failure | 字幕の一部を移せませんでした。 + names |

   A multi-file move or paste shows one notice with the number of files left in place for a
   subtitle reason, `N 件は字幕のため移動しませんでした`, beside the existing failure notice
   when other files failed for other reasons.
   A 404 on replace or delete reloads the list and shows `字幕の一覧が古くなっていたため読み直しました。`;
   a 500 shows the app's generic failure text.
9. After a rename or move made from a video's own page, the list shows the tracks that went
   with it.

**SPEC-CORE-186: leftover subtitle rows and subtitle names**

1. Renaming a file (single or batch) to a name with a `.srt` or `.vtt` extension answers 400
   `subtitle_extension_reserved`, and nothing changes. The same applies to creating a file
   with such a name (`POST /api/drives/{drive}/files`). Folders and subtitle uploads are not
   affected.
2. Every deletion of a subtitle `File` row is announced in one `files.purged`, sent after the
   commit that deleted it, with the drive passed as the `drives` hint. The payload stays
   `{file_ids}`. This covers:
   - the scan dropping leftover rows;
   - a subtitle upload replacing a row at its path;
   - purges.
3. Purging a subtitle row, trashed or missing, by any purge path, deletes the row and its
   thumbnail and leaves the file at its path on disk.

**SPEC-ADDON-187: knowledge editor**

1. When a dropped or pasted file is a subtitle and the upload answers `status: "sidecar"`, the
   editor removes its `uploading…` placeholder and inserts nothing. A notice says the subtitle
   was saved beside the files of that folder. The upload itself is unchanged.

### 2. Failure cases

- **Taken name or owner change.** The operation is refused with 409 (per file for a batch
  move), and nothing on disk or in the DB changes for the refused file. The same
  mixed-extension renumbering as the known issue (`new.mp4`, `ep_1.mkv`, `ep_2.mp4` →
  `ep_{n}`) is now refused instead of mismatching subtitles. The viewer renames in two steps.
- **A sidecar carry, copy or purge-delete fails** on a disk error or a permission error after
  the video's change committed:
  - the failure is logged with both paths;
  - the video's change stands and is not rolled back;
  - the operation's response carries `sidecar_errors: [names]`;
  - the UI shows `字幕の一部を移せませんでした` with the names.
- **Copy finds no candidate name** within the existing 1000 candidates: 409, as today.
- **Add / replace.**
  - The extension is not `.srt` or `.vtt`: 400 `subtitle_extension`.
  - Over the size limit: 413 `subtitle_too_large`.
  - Not UTF-8: 400 `subtitle_not_utf8`.
  - The language is taken: 409 `subtitle_language_taken`.
  - The video would not own the new file: 409 `subtitle_owner_change`.
  - A disk error: 500 and logged. On replace, the previous file is unchanged. If deleting the
    old file fails after a replace that changed the extension, the answer is 200 with
    `sidecar_errors`, and both files are listed.
- **Replace / delete naming a file that is not an own sidecar** (a stale list, another video's
  sidecar, a path): 404, and nothing changes.
- **A sidecar no row owns.**
  - It blocks a sidecar landing on its name with different content, and a general upload of a
    subtitle with its name. The 409 names it, and removing it is done on the host. No screen
    lists it.
  - A video arriving under its stem simply becomes its owner. That is not an owner change, so a
    folder of subtitles and videos uploads in any order.
- **Knowledge.** A failed upload takes the editor's existing failure path, unchanged.

### 3. States

- **Sidecar file.** Present or absent; ownership is computed per request from the folder's rows
  and names, and nothing is stored.
  - Add, replace and delete move a file between present and absent, or swap its bytes.
  - Purge moves the sidecars of the purged row to absent, unless another row shares them.
  - Trash, restore, missing and recovery leave sidecars as they are.
- **Subtitles list.** `loading` (with the file page), `ready(rows)`, and one action at a time.
  - While an add, replace or delete runs:
    - that action's control shows busy;
    - every other add, replace or delete control in the list is disabled;
    - playback and the rest of the page stay usable.
  - None can start while the page is loading.
  - An action's error shows under the list until the next action starts or the page is left.
  - The add form keeps its file and language after an error and clears after a success.
  - An answer that arrives after the page moved to another file is discarded: it changes
    neither that file's list nor its player.
- **Player tracks.** After add, replace or delete, the player's track list is the new list.
  - Tracks are keyed by file name, and their URLs carry the sidecar's version, so a replaced
    file is fetched fresh and the track being shown stays the same file across an add or a
    delete of another track.
  - If the track being shown is deleted and captions are on, the player shows the first
    remaining track, or the generated track when none remain.

### 4. Data read and written

- **Read.**
  - `File` rows of the folder: `drive`, `folder_path`, `filename`, `file_path`, `file_type`,
    `mime_type`, `missing_since`, `deleted_at`.
  - Folder listings on disk.
  - The bytes of a sidecar and of its target when checking for identical content.
- **Written on disk.** Sidecar files: copy, move, delete, and write on add or replace (to a
  temporary file, then `os.replace`).
- **Written in the DB.**
  - No new table or column.
  - SPEC-CORE-185 step 7 adds an `EmptyFolder` row through `_ensure_empty_folder_tracked`.
  - SPEC-CORE-186 deletes leftover subtitle rows, as it already does.

### 5. External services

None.

### 6. Authorization

- The new endpoints resolve the video through `_get_file_or_404` with the viewer's unlocked
  groups, like rename and move, so a locked drive answers 404. No admin requirement.
- Every path comes from the video's row and a name produced by the ownership rule, checked
  with the existing drive-boundary helpers (`existing_or_409` / `new_or_409`,
  `validate_within_drive`). A client-supplied `name` is only compared against the own
  sidecars' names after NFC; it is never opened as a path.

### 7. Effect on existing features

- The player and `GET /api/files/{id}/subtitles/{index}` use the new listing, so `movie.mp4`
  stops offering `movie.ja.srt` when a `movie.ja.*` row exists.
- `.loft` rows are subtitle-serving rows, so their `.vtt` follows copy, purge and the refusal
  rules. Intelligence reads the same file, by the wider match of SPEC-ADDON-001 I1. The
  Subtitles list is not shown for `.loft`.
- Batch rename keeps its in-order file collision check (SPEC-CORE-003). The sidecar check
  replays the same order.
- `files.purged` from a scan or an upload now reaches the knowledge and intelligence webhooks
  and the browser's `drive.structure_changed` for that drive.
- The upload drawer shows translated text for subtitle refusals (SPEC-CORE-030 I11, revised
  below).
- A rename or move response from the file page no longer empties the page's subtitles.

### 8. Error behavior

- What each refusal shows is in Normal flow 185.8. The codes are those in its table.
- `fetchUploadJSON`'s existing `destination_folder_not_found` string detail is unchanged; only
  the new refusals use the object form.
- A 409/400/413 body is `{"detail": {"code": "<code>", "names": ["<drive-relative path>", …]}}`.
  `names` is empty where no file is involved.
- Logged: every sidecar move, copy or delete failure with both paths, and every refused
  operation at `info` with its code.

### 9. User-visible behavior

- The design's visible decisions. Each is a checkable line:
  - D1. On a video's Info tab, a `字幕` section after the file metadata. Its label is
    `text-xs font-medium text-text-muted` with the count beside it at `font-normal`.
  - D2. One row per track: the language label in `text-sm`, the file name under it in
    `text-xs text-text-muted` on one line with an ellipsis. The rows are `rounded-xl px-2.5
    py-2` and turn `bg-bg-elevated` on hover.
  - D3. Per row, two trailing icon buttons, replace and delete (delete in `text-danger`). They
    are 32px on a fine pointer, revealed on hover or focus within the row (`opacity-0`, not
    hidden), and always visible at 44px on a coarse pointer. Their accessible names carry the
    language (`日本語の字幕を差し替え`).
  - D4. `字幕を追加` is a secondary (sand) button with a plus icon, under the rows. In the
    empty state it sits under `字幕はありません`.
  - D5. The add form is an inline bordered panel (`bg-bg-elevated`, `rounded-2xl`) holding:
    - `ファイル` with a `選択…` button and the chosen name;
    - `言語` as a select;
    - the resulting file name in `text-xs text-text-muted`;
    - `キャンセル` (ghost) and `追加` (the accent fill), right-aligned.
  - D6. The delete dialog has:
    - the title `字幕を削除しますか？`;
    - the file name in bold;
    - `ディスクから削除します。元に戻せません。`;
    - when shared, `同じ名前の動画 N 本からも消えます。`;
    - `キャンセル` (secondary) and `削除` (danger).
  - D7. An error sits under the list as a `bg-danger/15` box with an alert icon and the
    translated message.
  - D8. A rename refused by a sidecar shows, in the rename dialog, an alert box with
    `行き先に同じ名前の字幕があります。` and the names in bold. The input border turns
    `--danger`.
- Rename, move, batch rename, copy and upload can now be refused because of a subtitle.
- A copied video plays with its subtitles.
- Emptying the trash no longer leaves a deleted video's subtitles behind.
- Japanese and English strings live in `messages-core`, and the knowledge notice in the
  addon's messages.

### 10. Non-functional

- Ownership needs the folder's rows and one directory listing per folder per operation. A
  batch lists each touched folder once.
- The identical-content check compares bytes only when both sizes match. Subtitles are at most
  5 MiB.
- Subtitle bodies are sent in one multipart request, not a chunked upload.
- Nothing new leaves the machine.

## API contract

- `SubtitleInfo` gains three fields; the existing ones stay:
  - `filename`: the sidecar's file name, NFC;
  - `shared_with`: the number of other owners of that sidecar;
  - `version`: the file's `st_mtime_ns` as a string.
- `POST /api/files/{id}/subtitles`, multipart: `file`, and `language` (`""` for a bare track).
  Answers 201 `{"subtitles": SubtitleInfo[]}`.
- `PUT /api/files/{id}/subtitles`, multipart: `name` (an own sidecar's file name) and `file`.
  Answers 200 `{"subtitles": SubtitleInfo[], "sidecar_errors": []}`.
- `DELETE /api/files/{id}/subtitles?name=<file name>`. Answers 200
  `{"subtitles": SubtitleInfo[]}`.
- The endpoints answer 404 for an id that is not an active `file_type == "video"` row (a
  `.loft`, another type, trashed, missing, or a locked drive). A `language` that is not empty
  and not 2–3 ASCII letters answers 400 `subtitle_language`; it is lowercased before use. A
  missing `file` or `name` answers 422 (FastAPI's validation).
- `sidecar_errors: [names]` (empty when nothing failed) is added to the operation responses
  only, never to `FileResponse` from a GET:
  - single rename, move and copy;
  - batch rename, batch move, batch copy;
  - subtitle replace.

  Purges (single, batch, Empty trash, auto-purge) log a failed sidecar delete and report
  nothing.
- A batch move's or batch copy's `errors[]` entry for a subtitle refusal is
  `{"id", "error": "<code>", "names": [...]}`. `error` stays a string. Other entries are
  unchanged.
- The upload drawer's refusals:
  - `upload/init` refuses a subtitle over the limit with 413 `subtitle_too_large`, a taken
    subtitle name with 409 `subtitle_name_taken`, and a video upload that changes owners with
    409 `subtitle_owner_change`;
  - `upload/{id}/complete` refuses a subtitle that is not UTF-8 with 400 `subtitle_not_utf8`
    and removes the assembled file.

## Touch points

- `backend/app/services/subtitle.py`: the ownership rule, `detect_subtitles`,
  `move_sidecar_subtitles`, and new plan / copy / delete / write helpers.
- `backend/app/services/fileops.py`:
  - `rename_file`, `move_file`, `copy_file`, `_resolve_copy_filename`, `batch_rename`;
  - `_carry_sidecars`, `_carry_batch_sidecars`;
  - `physical_delete`, `purge_file`, `purge_all_trash`, `purge_missing_file`,
    `purge_all_missing` (the last two leave sidecars);
  - the rename and create name checks. `validate_filename` itself is not changed: it also
    serves uploads and folders.
- `backend/app/main.py`: `_run_purge_batch` (the 30-day auto-purge) deletes sidecars after
  each row commits.
- `backend/app/routers/files.py`:
  - `_detect_file_subtitles`, `get_subtitle`;
  - `PUT /api/files/{id}/rename`, `PUT /api/files/{id}/move`, `POST /api/files/{id}/copy`;
  - `PUT /api/files/batch/rename`, `PUT /api/files/batch/move`, `POST /api/files/batch/copy`,
    `POST /api/files/batch/purge`;
  - the purge endpoint;
  - the new `POST`, `PUT` and `DELETE /api/files/{id}/subtitles`.
- `backend/app/routers/drives.py`: `POST /api/drives/{drive}/files`,
  `POST /api/drives/{drive}/trash/empty`.
- `backend/app/services/upload.py`:
  - `init_upload`: size, taken name, owner change;
  - `complete_upload` / `_finish_subtitle_upload`: encoding, empty-folder tracking,
    `files.purged`.
- `backend/app/services/scanner.py`: dropping leftover subtitle rows emits `files.purged` after
  the commit.
- `backend/app/services/event_hooks.py`: callers pass `drives=`.
- `backend/app/schemas.py`: `SubtitleInfo`, the new request and response models,
  `sidecar_errors`, the batch move error shape.
- `backend/tests/test_listing_call_inventory.py`: every new directory listing is registered
  with its category (SPEC-ADDON-001 I7).
- Frontend:
  - `frontend/src/components/FileDetail/`: the Subtitles section in the Info tab, and
    `hooks/useFileDetailData.ts`;
  - `frontend/src/lib/api.ts`: the new calls, and keeping a 409/400/413 `detail.code`;
  - `frontend/src/types/index.ts`;
  - the error paths of `frontend/src/components/FileActions.tsx`,
    `frontend/src/components/FileContextMenu.tsx`,
    `frontend/src/components/BatchRenameDialog.tsx`,
    `frontend/src/hooks/useDragAndDrop.ts`, `frontend/src/components/folder/FolderTreePane.tsx`,
    `frontend/src/components/SelectionBar.tsx`, `frontend/src/components/ClipboardProvider.tsx`,
    `frontend/src/components/RenameDialog.tsx` (an optional error prop),
    `frontend/src/hooks/useInlineRename.ts`, the new-file and quick-note dialogs, and
    `frontend/src/hooks/useUpload.ts` / `fetchUploadJSON`;
  - `frontend/src/components/ConfirmDialog.tsx`: new optional props for a rich body and a
    danger confirm. With none given it renders and behaves as before (SPEC-CORE-120 I13);
  - the player's track URLs and keys: `frontend/src/components/VideoPlayer.tsx` and the
    shell player's caption hook;
  - `frontend/src/messages-core/{ja,en}.json`.
- `addons/knowledge/frontend/Editor.tsx` and `addons/knowledge/frontend/messages/{ja,en}.json`.
  Committed and merged in the knowledge repository first, then the core gitlink is bumped.
- Docs:
  - `docs/user-guide/viewers-and-players.md`, `docs/user-guide/upload-and-fileops.md`;
  - `docs/reference/api.md`, `docs/reference/websocket-events.md`,
    `docs/reference/file-states.md`, and the MCP tool docs where `move_files` / `copy_files`
    errors are described;
  - `docs/developer-guide/known-issues.md`: the rows this fixes are removed. The rows kept:
    `.loft` captions over the embed, case-only renames, and the mixed-extension chain, which
    is now refused.
  - `.claude/rules/design-decisions.md`: Trash gains the explicit subtitle delete; Handling
    missing files loses "the scanner never emits `files.purged`"; Drives or Trash gains the
    sidecar ownership line.
- `docs/process/reviews/feature-subtitle-sidecars/design/` (the agreed design).
- Protected paths: none. Checked against `docs/process/risk-and-human-review.md` and
  `process/protected-paths.conf`.

## Invariants

I1. A sidecar is listed for, served for, carried with, copied with and purged with only the
    rows that own it by the longest-stem rule. `movie.mp4` never lists or serves
    `movie.ja.srt` while a `movie.ja.*` subtitle-serving row exists in that folder.
I2. A rename, move (single, or each file of a batch), batch rename or video upload that would
    land a sidecar on a name holding different content, or would change owners, answers 409
    (an `errors` entry for a batch move). The refused file, its sidecars and its row are byte-
    and field-identical afterwards, and no existing file is overwritten. Moving or renaming
    every owner of a shared sidecar, together or one after another, to one place succeeds and
    leaves one copy there.
I3. When no I/O error occurs, after a rename or move every own sidecar of the video sits beside
    it under its new stem with the same bytes. Every owner that did not move still lists every
    sidecar it listed before.
I4. A copy lists at least the source's languages and formats, with the same bytes. The
    source's sidecar files are unchanged.
I5. Purging a trashed video deletes exactly those of its own sidecars that no other row in the
    folder with the same stem owns, and only after the row's deletion has committed. Trashing,
    restoring and purging a missing video change no sidecar.
I6. A subtitle add, replace or delete touches only an own sidecar of the requested video,
    inside that video's folder. A name that is not one of its own sidecars answers 404 and
    changes nothing. An add or replace never leaves two tracks of one language that it created.
I7. A replace that answers anything other than 200 leaves the previous subtitle file
    byte-for-byte unchanged.
I8. No subtitle over 5 MiB, or not decodable as UTF-8, lands on disk through any upload path
    (the drawer, add, replace, the knowledge editor).
I9. No rename or create produces a `File` row whose name has a subtitle extension. Purging a
    subtitle row by any path never deletes the file at its path.
I10. Every subtitle row the core deletes (scan, upload, purge) is announced in one
     `files.purged` per request or scan, sent after the deleting commit with that row's drive
     as the `drives` hint.
I11. Every refusal described in 185.8 shows a message in the viewer's language that names the
     files involved, at each listed entry point. A multi-file move shows the count of files
     left in place. None ends in silence or only a generic "failed".
I12. After add, replace or delete, the player's tracks are the new list without a reload, and a
     replaced track plays the new file's cues. After a rename or move made on the video's own
     page, the Subtitles list shows the carried tracks.
I13. A subtitle upload that creates a folder holding only subtitles makes that folder appear in
     its parent's listing without a scan.
I14. Dropping or pasting a subtitle into the knowledge editor removes the placeholder, inserts
     no `loft://` link, and shows the notice.
I15. A copy whose first candidate name would collide on a sidecar, or change owners, lands
     under the next candidate that does neither, and answers 200.
I16. A sidecar carry or copy that fails is named in the response's `sidecar_errors` and in the
     shown notice. An operation with no failure answers an empty `sidecar_errors`.
I17. In a batch move with refused files, every other file that can move does move, and each
     refused file's `errors` entry carries its code and names.
I18. The delete dialog's confirm deletes exactly the named sidecar. Cancel, X, backdrop and
     Escape delete nothing. The shared line appears exactly when `shared_with` is above 0, and
     `shared_with` equals the number of other owners.
I19. While an add, replace or delete runs, no other one can start in that list, and none can
     start while the page loads. An answer arriving after the page moved to another file
     changes nothing on the new page.
I20. The new endpoints answer 404 for a locked drive and for any id that is not an active
     video row. No Subtitles section is drawn for a `.loft`.

## Revises

SPEC-CORE-003 I9. A batch rename with no such clash, and no sidecar refusal under SPEC-CORE-184, is carried out: every file is renamed, a file renamed to a case or normalization variant of its own name is not reported as a clash, a same-named file in another folder never counts as the file itself, and a downward chain into free names succeeds.
SPEC-CORE-030 I10. `upload/init` with `require_folder: true` and a `folder_path` that is not an existing directory of the drive answers 404 `destination_folder_not_found` and creates no directory, temp directory or session; `upload/{id}/complete` for such a session whose folder has gone answers the same and writes no file and no folder; with an existing folder, or without `require_folder`, both behave as before, except for the subtitle refusals of SPEC-CORE-184 and SPEC-CORE-185 (413 `subtitle_too_large`, 409 `subtitle_name_taken` and `subtitle_owner_change` at init, 400 `subtitle_not_utf8` at complete).
SPEC-CORE-030 I11. The entry for a `destination_folder_not_found` answer shows the translated destination-folder message, the entry for a subtitle refusal (`subtitle_name_taken`, `subtitle_owner_change`, `subtitle_too_large`, `subtitle_not_utf8`) shows its translated message, and every other upload error shows today's text.

## Checked, no action

- **Giving subtitles database rows** (tracks owned by a `video_id`). Rejected: #490 moved
  subtitles out of rows because rows went missing on every rescan and purge deleted the real
  file. A sidecar placed on disk by hand must keep working with no import step.
- **A Litloft trash for subtitles.** The human chose deletion from disk behind a confirm
  dialog.
- **Overwriting a taken sidecar name** on rename or move. Rejected by the human: it deletes a
  file the viewer did not name.
- **Listing or removing sidecars that no row owns.** The human chose to name them in the 409
  and leave removal to the host. They arise only from a missing purge or a failed delete.
- **A batch move made all-or-nothing.** The human kept it per file, with each refused file
  reported.
- **A video placed by hand that takes a sidecar** (found by a scan). A scan cannot refuse, so
  ownership follows the names, as it does today. Only operations through Litloft are refused.
- **Purging a missing video and its sidecars.** A missing purge is DB-only, and the video may
  have been moved off Litloft with its sidecars still wanted. If a shorter-stem video then
  becomes the owner, that is accepted.
- **`.loft` sidecars shown over the YouTube embed.** The embed is an iframe; drawing captions
  over it is its own feature. The known-issues row stays.
- **A rename that changes only the case** leaves sidecars in the old case on a
  case-insensitive macOS bind mount, as it does the video. The known-issues row stays.
- **Converting Shift_JIS or other encodings on upload.** Refused instead. A non-UTF-8 subtitle
  already on disk can now be replaced or deleted from the list.
- **A WebSocket event when a subtitle changes.** The page that made the change refreshes
  itself. Another open page sees the change on its next load.
- **Subtitle tracks for audio files.** Audio players show no captions today; unchanged.
- **The `readonly` drive key**, which nothing enforces, is not enforced here either.
- **The iOS share extension** retries any init 409 under `<stem> (N)` (SPEC-IOS-001 I7). With
  the narrowed owner-change rule, a shared video is refused only when it would take an owned
  sidecar from another stem. The retry then lands under a name that takes nothing, which is
  acceptable. A subtitle over 5 MiB shared from iOS is refused at init.
- **`movie.mp4` stops listing `movie.ja.srt` while a `movie.ja.*` video sits beside it.** This is
  the longest-stem rule applied to the listing, and it is intended.
- **States the design does not draw.** These follow existing components:
  - the busy control shows the app's spinner in place of its icon;
  - the `その他のコード…` field is a text input under the select;
  - the move, paste and carry-failure notices are the app's existing toast;
  - the add form on a phone is the D5 panel at full width.
  - The empty state shows the label without a count.
  - On a coarse pointer, the rows keep `pl-2.5` and drop the right padding, because the two
    44px buttons carry their own space.
- **A shared sidecar in a batch copy** gets one copy per copied owner under each copy's stem,
  so the copies no longer share it. Accepted.
