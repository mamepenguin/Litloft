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

- Set: on the **first** scan pass that does not find the file at its recorded path. There is no grace period or tolerance window — a single pass that misses the file flips it to Missing (the mount-failure and move-detection rules below are the only things that hold it back). Trashed rows are skipped; the scanner never flips Trash to Missing.
- Cleared: scanner sees the file again at the same path, **or** an upload to the same path revives it (no INSERT — that would violate the `(drive, file_path)` uniqueness), **or** a text-file create lands on that path and reuses the row, **or** the file is detected as moved (see below).
- Effects:
  - `GET /api/files/{id}` and every mutating endpoint: `404 Not Found` (they resolve through `active_file_filter()`).
  - `GET /api/files/{id}/stream`, `/render`, `/preview-text`: `410 Gone`.
  - `GET /api/files/{id}/thumbnail`: still served from disk. If the thumbnail file is gone too, a placeholder JPEG is returned rather than a 404.
  - Event: `files.missing` on entry, `files.recovered` on exit.
- Listed at `GET /api/drives/{drive}/missing`.

Missing files are never auto-purged. Remove them explicitly: `DELETE /api/files/{id}/purge` for one, `POST /api/files/batch/purge` for a selection, or `POST /api/drives/{drive}/missing/purge-all` for the whole drive (`purge_all_missing`, which commits in batches of 200 so each commit releases the SQLite write lock and the operation stays interruptible; a single `files.purged` carrying every id is emitted afterwards, not one per batch).

### Mount-failure protection

If `drive_path.exists() == False`, the scanner returns early so a missing mount does not flip every file in the drive into Missing. Restoring the mount on the next pass quietly resumes normal operation. This is a drive-root check only: if the mount is present but a subtree is unreadable, files under it still flip to Missing on that pass.

### Move detection

A file that disappears from path A and reappears at path B **within the same scan pass** is treated as a move, not as Missing + new:

- Match key: `(file_hash, file_size)`. Rows with no stored `file_hash` are never move-matched and fall through to Missing. The disappeared record and the new path must be an **unambiguous single-candidate** pair — if two or more records share the same `(file_hash, file_size)` on either the old or the new side, none of them match and they fall back to Missing + new.
- On a match the existing DB row follows the file: `file_path`, `folder_path`, filename, title, mime, thumbnail are updated in place and `missing_since` is cleared. All linked data (watch history, comments, tags, relations, version history, transcripts, embeddings) stays attached because the row is the same row.
- Event: `files.moved` (not `files.missing` followed by a fresh insert). The scanner path fires the webhook only — it does not WebSocket-broadcast.
- Markdown special case: when an out-of-band rename changes a `.md` basename, `[[old-stem]]` wiki-links in other `.md` files in the same drive are rewritten.

### When the scanner runs

- **Backend startup** — a full scan of every drive (`scan_all_drives`). If `drives.json` is missing or malformed (fresh install before the first-run wizard), the scan is skipped rather than crashing startup.
- **Manual trigger** — `POST /api/drives/{drive}/scan`.
- **Incremental** — uploads and file operations register/relocate single rows directly without a full pass.

There is **no periodic auto-scan**. A file deleted out-of-band on disk stays Active in the DB until the next startup or a manual rescan.

Scans take the app-wide maintenance lock, so only one drive scans at a time — and that lock is shared with other long-running maintenance work (the markdown image import job), so either can block the other. `POST .../scan` returns `409 Scan already in progress` while the lock is held, whatever holds it.

## Trash

User-initiated soft delete:

- Set: `deleted_at = NOW`, on an **Active** row only. A Missing file cannot be trashed — `delete_file` filters on `active_file_filter()`, so trashing one returns `404`. Purge it instead.
- Cleared: explicit restore (`POST /api/files/{id}/restore`, `POST /api/files/batch/restore`), which clears **both** `deleted_at` and `missing_since` as a defensive safety net. Restore also requires the file to still be on disk; if it vanished while in trash, restore returns `404 File no longer exists on disk`.
- Effects:
  - The file on disk is **not moved**. Trash is purely a database flag.
  - Default queries exclude the row.
  - Playlists keep their existing references, rendered as muted; adding a trashed or missing file to a playlist is rejected with `404`.
  - Event: `files.deleted` (payload adds `"type": "soft_delete"`) on entry, `files.restored` on exit.
- Listed at `GET /api/drives/{drive}/trash`.

### Auto-purge

A background task starts at backend startup and repeats every 24 hours:

- Selects rows with `deleted_at < NOW - 30 days`, in batches of 100 per commit.
- Deletes the on-disk file, its thumbnail, and any HEIC conversion cache entry.
- Deletes the DB row. `PRAGMA foreign_keys=ON` is set on every connection, so the `ON DELETE CASCADE` foreign keys clear relations, comments, watch history, and version rows with it.
- Cleans empty parent directories, walking up to the drive root.
- Emits a single `files.purged` carrying every id purged in that run — not one event per batch.

Manual purge (`DELETE /api/files/{id}/purge`, `POST /api/files/batch/purge`, `POST /api/drives/{drive}/trash/empty`) fires the same event for the affected files.

## File version history

Text and markdown files carry an edit history in `file_versions`, written on every content `PUT` (`backend/app/services/file_versions.py`). It is orthogonal to the three states, with one wrinkle worth knowing:

- Rows survive Trash and Missing untouched — a trashed file that is restored, or a missing file that reappears, comes back with its full history, because the state change never touches the row.
- The **API** is gated on Active, though: `GET /api/files/{id}/versions` (and the body / diff routes) resolve through `active_file_filter()` and return `404` while a file sits in Trash or Missing. The data is there; it is just not readable until the file is Active again.
- Hard delete drops them. The FK is `ON DELETE CASCADE`, so purge — manual or the 30-day auto-purge — removes the history with the row. There is no way to recover it afterwards.
- Out-of-band moves keep it, like every other linked table, because move detection reuses the same row.
- History is capped at 200 rows per file, and only `auto` rows are evicted — an explicitly saved version is never trimmed away. Consecutive auto-saves by the same viewer within 5 minutes collapse into one row rather than accumulating.
- Recording is best-effort: it runs in a nested transaction, and a failure is logged while the content write still commits. A file can therefore have a content change with no version row behind it.

## Why three states?

Most file-management apps treat the database as a cache of the filesystem and either delete rows when files disappear or never delete them at all. Litloft instead:

- Treats the DB as an **independent source of truth** for things that cannot be regenerated from the filesystem (watch history, comments, tags, version history, transcripts, embeddings).
- Distinguishes "user explicitly removed this" (Trash) from "we expected this and it is gone" (Missing) so addons can react differently.
- Preserves the unique `(drive, file_path)` constraint by reviving missing rows on re-upload rather than inserting duplicates.

## Addon implications

Addons subscribe to lifecycle events and decide:

- `files.missing` — keep your data; the file might come back. Mark as missing to gray it out in your UI.
- `files.recovered` — clear your missing markers.
- `files.moved` — the file's `file_id` is unchanged but its path changed. Keep all data attached to the `file_id`; do not treat it as a delete + add.
- `files.purged` — drop your data; the file will not come back.

Addons should not delete on `files.deleted` (Trash) — the file might be restored. Wait for `files.purged`. Note that an out-of-band move emits `files.moved`, **not** `files.missing` followed by a fresh insert, so addons that key off `file_id` need no special handling; addons that cache paths must refresh them on `files.moved`.

`files.*` payloads carry ids only, with no `drive` key. The core resolves each id to its owning drive when applying per-drive addon policy, so an event can arrive with some ids filtered out.

## Operational notes

- The 30-day trash retention is fixed in code (`TRASH_RETENTION_DAYS` in `backend/app/main.py`); there is no setting for it.
- Hard delete (`DELETE /api/files/{id}/purge`) is irreversible.
- Restoring a missing file via re-upload preserves all linked data because the row is the same row.
- The `restore_file()` helper clears both flags so a half-trashed-half-missing edge case never sticks around.

## See also

- [Trash and missing files](../user-guide/trash-and-missing.md) — the user-facing view.
- [WebSocket events](websocket-events.md) — for the lifecycle event names and payloads.
