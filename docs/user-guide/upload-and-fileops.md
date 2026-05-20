# Upload and file operations

Litloft accepts files via drag-and-drop or a file picker, then runs them through a chunked upload pipeline that survives flaky connections and large folders.

## Uploading files

Drop files anywhere on a folder page, or use the **Upload** button.

![Upload progress drawer showing queued, paused, and completed uploads](../images/user-guide/upload-progress-drawer.png)

- **Folder upload** is supported in browsers that expose `webkitdirectory`. Drop a folder and the relative tree is preserved.
- **Multi-file upload** is supported. Files are queued and uploaded sequentially per chunked session.
- An upload **progress drawer** at the bottom of the screen lets you monitor speed, ETA, and individual file statuses. You can cancel any in-flight upload.

### Chunked upload protocol

Behind the scenes:

1. `POST /api/drives/<drive>/upload/init` — declare the filename, size, MIME, and target folder; returns an `upload_id`.
2. `POST /api/drives/<drive>/upload/<upload_id>/chunk` — push a chunk (default 5 MiB). Each chunk is independently retryable.
3. `POST /api/drives/<drive>/upload/<upload_id>/complete` — finalise; the backend assembles, hashes, and inserts the file record.

The upload survives the browser tab closing; when reopened, the queue resumes from the last completed chunk for incomplete uploads (best-effort, depends on the server-side temp file still being present).

### Limits and constraints

- **Size**: no hard cap from Litloft itself; constrained by available disk space in the drive's container path. Reverse proxies in front of Litloft (if any) often impose their own limit.
- **Concurrent chunks**: the backend uses a small pool to prevent runaway parallelism on slow disks.
- **Path safety**: file paths are normalised and validated against the drive root (`os.path.realpath()` check) to defend against traversal.

### Reviving a missing file via upload

If a file went *missing* (file deleted from disk, DB row kept), uploading the same path **revives** the existing record rather than inserting a new row. This preserves tags, comments, watch history, and AI artefacts that referenced the original.

## Renaming, moving, and copying

The `…` menu on a file or selection offers:

- **Rename** — change the basename. Server prevents collisions and validates the new name.
- **Move** — change the parent folder; same drive only.
- **Copy** — duplicate to another folder. The copy gets a new file ID and starts with empty watch history; tags and comments are not duplicated.

Batch operations work the same way: select multiple files, then pick the action.

### Empty folders

When a move or delete leaves a parent folder empty, Litloft tracks it in the `empty_folders` table so the count remains accurate. A future write into that path naturally clears the empty tracker.

## Editing text in place

Text and Markdown files can be edited directly in the browser:

- Open the file → click **Edit**.
- The editor is debounced (500 ms) so rapid typing produces a single HTTP write.
- Server limits content to 1 MB per write. Larger files must be replaced via re-upload.
- For Markdown, frontmatter edits trigger a tag re-projection into the database.

## Soft delete (trash)

Deleting a file moves it to the trash:

- `deleted_at` is set; `missing_since` cleared.
- The file remains on disk in its original location — the OS-level filesystem is untouched until purge.
- Trash auto-purges after 30 days. Auto-purge runs at backend startup and every 24 hours.
- Restore at any time before purge. Restore clears both `deleted_at` and `missing_since` (a defensive safety net for out-of-band edits).

For full semantics, see [trash and missing files](trash-and-missing.md).

## Hard delete (purge)

Purging is **irreversible** — both the row and the file on disk are removed.

- From the trash view, **Empty trash** purges everything older than 30 days (or all if you confirm).
- Per file, **Purge** in the trash row removes immediately.
- Empty parent folders are cleaned up after a purge.

A `files.purged` WebSocket event is emitted only on user-initiated purges. Auto-purge cycles also emit the event in batches of 200.

## Downloading

- **Per file** — `Download` button in the viewer; streams the original.
- **Batch** — multi-select files in a folder and click **Download**; the backend zips them on the fly into a streaming response.

Streaming downloads use byte-range requests where supported, so resumable downloaders work.

## Archive entries

For ZIP, TAR, and RAR files, Litloft does not extract on the server. To get a single file out:

- Open the archive in the viewer.
- Right-click the entry → **Extract** to extract to the drive (capped at 50 MB per entry, max 3 concurrent extractions globally).
- Or **Download** to fetch the entry directly as a stream.

## Backups

For backing up the data the user-facing tools touch, see [backup and restore](../admin-guide/backup-restore.md). The short version: snapshot `data/` and your drive directories, both at the host filesystem level, while the stack is up.
