# File states

Litloft uses a three-state model for files, encoded in two columns:

| State | `deleted_at` | `missing_since` | Auto-purge | Default queries |
|---|---|---|---|---|
| Active | NULL | NULL | — | included |
| Missing | NULL | set | Never | excluded |
| Trash | set | NULL | After 30 days | excluded |

The two columns are mutually exclusive. Always go through `app.models.active_file_filter()` for "show me usable files" queries; never write `deleted_at.is_(None)` directly.

## Active

The default state. The file is on disk and the DB row is current. Visible everywhere.

## Missing

The scanner found that the file disappeared from disk:

- Set: on the **first** scan pass that does not find the file at its recorded path. There is no grace period or tolerance window — a single pass that misses the file flips it to Missing (the mount-failure and move-detection rules below are the only things that hold it back).
- Cleared: scanner sees the file again at the same path, **or** an upload to the same path revives it (no INSERT — that would violate the `(drive, file_path)` uniqueness), **or** the file is detected as moved (see below).
- Effects:
  - GET / mutating endpoints: `404 Not Found`.
  - Stream: `410 Gone`.
  - Thumbnail: still served (kept on disk).
  - Event: `files.missing` on entry, `files.recovered` on exit.

Missing files are kept indefinitely. Use `purge_all_missing` (batch size 200) to clean up.

### Mount-failure protection

If `drive_path.exists() == False`, the scanner returns early so a missing mount does not flip every file in the drive into Missing. Restoring the mount on the next pass quietly resumes normal operation. This is a drive-root check only: if the mount is present but a subtree is unreadable, files under it still flip to Missing on that pass.

### Move detection

A file that disappears from path A and reappears at path B **within the same scan pass** is treated as a move, not as Missing + new:

- Match key: `(file_hash, file_size)`. The disappeared record and the new path must be an **unambiguous single-candidate** pair — if two or more records share the same `(file_hash, file_size)` on either the old or the new side, none of them match and they fall back to Missing + new.
- On a match the existing DB row follows the file: `file_path`, `folder_path`, filename, thumbnail are updated in place and `missing_since` is cleared. All linked data (watch history, comments, tags, relations, transcripts, embeddings) stays attached because the row is the same row.
- Event: `files.moved` (not `files.missing` followed by a fresh insert).
- Markdown special case: when an out-of-band rename changes a `.md` basename, `[[old-stem]]` wiki-links in other `.md` files in the same drive are rewritten.

### When the scanner runs

- **Backend startup** — a full scan of every drive (`scan_all_drives`).
- **Manual trigger** — `POST /api/drives/{drive}/scan`.
- **Incremental** — uploads and file operations register/relocate single rows directly without a full pass.

There is **no periodic auto-scan**. A file deleted out-of-band on disk stays Active in the DB until the next startup or a manual rescan. Scans are serialised by a single global lock: only one drive scans at a time across the whole app, and a concurrent `POST .../scan` returns `409 Scan already in progress`.

## Trash

User-initiated soft delete:

- Set: `deleted_at = NOW`. `missing_since` is cleared if it was set (you cannot trash a file that is already missing — Litloft does not let you delete what is not there).
- Cleared: explicit restore (`POST /api/files/{id}/restore`), which clears **both** `deleted_at` and `missing_since` as a defensive safety net.
- Effects:
  - The file on disk is **not moved**. Trash is purely a database flag.
  - Default queries exclude the row.
  - Playlists keep their references, rendered as muted.
  - Event: `files.deleted` on entry, `files.restored` on exit.

### Auto-purge

A background task runs at backend startup and every 24 hours:

- Selects rows with `deleted_at < NOW - 30 days`.
- Deletes the on-disk file.
- Deletes the DB row (cascade removes relations, comments, watch history).
- Cleans empty parent directories.
- Emits `files.purged` (one event per batch of 200).

Manual purge via the admin UI fires the same event for the affected files.

## Why three states?

Most file-management apps treat the database as a cache of the filesystem and either delete rows when files disappear or never delete them at all. Litloft instead:

- Treats the DB as an **independent source of truth** for things that cannot be regenerated from the filesystem (watch history, comments, tags, transcripts, embeddings).
- Distinguishes "user explicitly removed this" (Trash) from "we expected this and it is gone" (Missing) so addons can react differently.
- Preserves the unique `path` constraint by reviving missing rows on re-upload rather than inserting duplicates.

## Addon implications

Addons subscribe to lifecycle events and decide:

- `files.missing` — keep your data; the file might come back. Mark as missing to gray it out in your UI.
- `files.recovered` — clear your missing markers.
- `files.moved` — the file's `file_id` is unchanged but its path changed. Keep all data attached to the `file_id`; do not treat it as a delete + add.
- `files.purged` — drop your data; the file will not come back.

Addons should not delete on `files.deleted` (Trash) — the file might be restored. Wait for `files.purged`. Note that an out-of-band move emits `files.moved`, **not** `files.missing` followed by a fresh insert, so addons that key off `file_id` need no special handling; addons that cache paths must refresh them on `files.moved`.

## Operational notes

- The 30-day trash retention is fixed in code today.
- Hard delete (`DELETE /api/files/{id}?purge=true`) is irreversible.
- Restoring a missing file via re-upload preserves all linked data because the row is the same row.
- The `restore_file()` helper clears both flags so a half-trashed-half-missing edge case never sticks around.

## See also

- [Trash and missing files](../user-guide/trash-and-missing.md) — the user-facing view.
- [WebSocket events](websocket-events.md) — for the lifecycle event names and payloads.
