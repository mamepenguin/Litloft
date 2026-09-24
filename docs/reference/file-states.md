# File states

Every file row is in one of three states, stored in two mutually exclusive columns:

| State | `deleted_at` | `missing_since` | Auto-purge | Default queries |
|---|---|---|---|---|
| Active | NULL | NULL | — | included |
| Missing | NULL | set | never | excluded |
| Trash | set | NULL | after 30 days | excluded |

The database keeps data that cannot be rebuilt from the filesystem (watch history, comments, tags, version history, transcripts, embeddings), so a file that disappears from disk is marked Missing rather than deleted.

In backend code, select usable files with `app.models.active_file_filter()`; do not test `deleted_at.is_(None)` directly.

## Active

The file is on disk and the row is current.

## Missing

The scanner did not find the file at its recorded path.

- Set on the first scan pass that does not find the file. There is no grace period; only the mount check and move detection below hold it back. Trashed rows are never marked Missing.
- Cleared when a scan finds the file at the same path again, an upload or a new text file lands on that path (the existing row is reused), or the file is detected as moved.
- Effects:
  - `GET /api/files/{id}` and every write endpoint: `404`.
  - `GET /api/files/{id}/stream`, `/render`, `/preview-text`: `410 Gone`.
  - `GET /api/files/{id}/thumbnail`: still served. If the thumbnail file is gone too, a placeholder image is returned.
  - Events: `files.missing` on entry, `files.recovered` on exit.
- Listed at `GET /api/drives/{drive}/missing`.

Missing files are never purged automatically. Remove them with `DELETE /api/files/{id}/purge`, `POST /api/files/batch/purge`, or `POST /api/drives/{drive}/missing/purge-all`. Purge-all commits every 200 files and emits one `files.purged` with every id at the end; if it fails partway, the files already committed stay purged and no event is sent.

### Unmounted drives

If a drive's root path does not exist, the scan of that drive stops before marking anything, so an unmounted drive does not turn every file Missing. This checks only the drive root: files under an unreadable subfolder of a mounted drive are still marked Missing.

### Move detection

A file that disappears from one path and appears at another in the same scan pass is treated as a move:

- Matched by `(file_hash, file_size)`. Only rows that were Active before the pass and have a stored hash can match. When two or more files share the same key, on either the old or the new side, none of them match; they become Missing and new rows.
- The existing row is updated in place (path, folder, filename, title, type, thumbnail), so all linked data stays attached.
- Event: `files.moved`. Browsers receive `drive.structure_changed`.
- When a `.md` file's name changes, `[[old-name]]` wiki links in other `.md` files on the same drive are rewritten.

### When the scanner runs

- At backend startup: every drive, one after another. If `drives.json` is missing or invalid, the scan is skipped.
- Manually: `POST /api/drives/{drive}/scan`.

There is no periodic scan. Uploads and file operations update their own rows directly, but a file deleted on disk outside Litloft stays Active until the next startup or manual scan.

Scans share one lock with other maintenance jobs (such as the Markdown image import), so only one runs at a time. `POST .../scan` returns `409 Scan already in progress` while the lock is held.

## Trash

A viewer deletes a file.

- Set only on an Active file. Trashing a Missing file returns `404`; purge it instead.
- Cleared by `POST /api/files/{id}/restore` or `POST /api/files/batch/restore`, which clear both `deleted_at` and `missing_since`. If the file is no longer on disk, restore returns `404 File no longer exists on disk`.
- Effects:
  - The file on disk is not moved or changed.
  - Playlists keep the entry and show it as unavailable. Adding a trashed or Missing file to a playlist returns `404`.
  - Events: `files.deleted` (payload includes `"type": "soft_delete"`) on entry, `files.restored` on exit.
- Listed at `GET /api/drives/{drive}/trash`.

### Auto-purge

Runs at backend startup and then every 24 hours. The 30-day period is fixed; there is no setting for it.

- Takes trashed files older than 30 days and deletes each one on its own: the file on disk, its thumbnail, any HEIC conversion, and the row. Deleting the row also deletes its relations, comments, watch history and version history.
- A file that cannot be deleted is skipped and retried on the next run.
- Removes empty folders left behind, up to the drive root.
- Emits one `files.purged` with every id purged in that run.

Manual purge (`DELETE /api/files/{id}/purge`, `POST /api/files/batch/purge`, `POST /api/drives/{drive}/trash/empty`) emits `files.purged` for the purged files. Purging cannot be undone.

## Version history

Text and Markdown files keep an edit history, written on every content save.

- It survives Trash and Missing: a restored or recovered file comes back with its full history.
- `GET /api/files/{id}/versions` and the related routes return `404` while the file is in Trash or Missing.
- Purging a file deletes its history for good.
- A file moved outside Litloft keeps its history, because move detection reuses the row.
- Up to 200 versions per file. Only automatic versions are removed to make room; explicitly saved ones are kept. Automatic saves by the same viewer within 5 minutes are combined into one version.
- If recording a version fails, the content is still saved, so a change can exist with no version for it.

## For addons

- `files.missing`: keep your data; the file may come back.
- `files.recovered`: clear any missing markers.
- `files.moved`: the `file_id` is unchanged and the path has changed. Keep data keyed by `file_id`; refresh any cached path.
- `files.deleted`: the file is in Trash and may be restored. Do not delete your data.
- `files.purged`: delete your data; the file will not come back.

`files.*` payloads carry `file_ids` only, with no `drive`. The core applies each listener's per-drive policy per id, so an event can arrive with some ids removed. See [configuration: event-hooks.json](configuration.md#event-hooksjson).

## See also

- [Trash and missing files](../user-guide/trash-and-missing.md): what viewers see.
- [WebSocket events](websocket-events.md): event names and payloads.
