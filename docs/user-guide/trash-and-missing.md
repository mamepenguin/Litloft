# Trash and missing files

A file you delete goes to **Trash**. A file that disappears from disk without you deleting it goes to **Missing Files**. Neither appears in ordinary listings or search. The technical details are in [file states](../reference/file-states.md).

## Trash

![Trash view listing deleted files with restore and delete-forever actions](../images/user-guide/trash-view-actions.png)

**Move to Trash** does not touch the file on disk. It stays in Trash for 30 days, then it is deleted for good, along with its comments, tags and watch history. Each item shows how many days it has left. The 30 days cannot be changed.

Open **Trash** at the bottom of the sidebar. For each file:

- **Restore** puts it back where it was, with its comments, tags and history.
- **Permanently Delete** removes it from disk now. This cannot be undone.

**Empty Trash** permanently deletes everything in it, after asking you to confirm.

To act on several files, `Cmd/Ctrl+click` a card to start selecting and `Shift+click` to select a range. The bar at the bottom restores or permanently deletes the selection.

A file in the trash still shows in any collection it was already in, dimmed and not playable. You cannot add it to a collection.

### When something stays in Trash

- **Restore does nothing** — the file is no longer on disk, so there is nothing to restore.
- **An item is older than 30 days** — Litloft could not delete it, for example because its drive was removed or the file's permissions block it. It is tried again every day and clears once the cause is fixed.

## Missing files

When Litloft scans a drive and a file is no longer there, the file becomes *missing*. This happens when a disk is unplugged, a network share drops, or a file is moved outside Litloft. Scans run when the backend starts and when you press **Rescan**.

**Missing Files** appears at the bottom of the sidebar only when the drive has some. Missing files cannot be opened or played, but Litloft keeps everything about them: comments, tags, watch history, collections, thumbnails and addon data such as transcripts.

If a whole drive is unreachable, its files are not marked missing.

### Getting a missing file back

- Put the file back at the same path and rescan. It returns with everything it had.
- Or upload a file to the same path through Litloft.

### Clearing missing files

Missing files are never deleted automatically. On **Missing Files**, **Permanently Delete** removes one file's data, and **Permanently Delete All** removes all of them. This deletes their comments, tags and history and cannot be undone.
