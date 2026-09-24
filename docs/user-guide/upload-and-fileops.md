# Upload and file operations

## Uploading files

Drop files or a folder onto any folder listing, or choose **Files** or **Folder** from the **Add** menu. A drop on Home uploads to the drive root. A dropped folder keeps its subfolders.

![Upload progress drawer showing queued and completed uploads](../images/user-guide/upload-progress-drawer.png)

The drawer at the bottom of the screen shows each file's progress. You can cancel a file that has not finished, **Clear** the finished ones, and collapse the drawer. Two files upload at a time.

Things to plan around:

- Uploads do not resume. Closing or reloading the tab stops the upload, and you have to start that file again from the beginning. If part of a file fails, that file fails and the drawer shows an error.
- The size limit is 50 GB per file unless your administrator changed it (`LITLOFT_MAX_UPLOAD_SIZE_GB`, see [environment variables](../reference/env-variables.md)). A reverse proxy in front of Litloft may have its own limit.
- An upload is refused before it starts if the disk has less than 110% of the file's size free.
- An upload is also refused if a file already exists at that path.

### Uploading a missing file again

If a file went missing from disk, uploading it to the same path brings the old entry back, with its tags, comments and watch history. If the file at that path is in the trash, the upload replaces it as a new file.

## Renaming, moving, and copying

Folders, and files in the folder tree, rename in place. See [renaming in place](file-browsing.md#renaming-in-place). The right-click and `…` menus offer:

- **Rename**: a name that is already taken, starts with a dot, uses forbidden characters or is over 255 characters is refused. Renaming a Markdown file also updates `[[links]]` to it in the other notes of the drive.
- **Move**: pick another folder in the same drive.
- **Copy** / **Cut**, then **Paste**: go to the target folder and press **Paste here** in the banner above the list. The clipboard survives a reload.

Pasting in a different drive copies or moves the files to that drive.

After a paste the clipboard is empty. If nothing could be pasted, it stays, so you can try another folder. A message says how many files could not be pasted.

A copy is a new file. It starts with no likes, no favourite, no watch history, no tags and no comments. If the name is taken, the copy is named `_copy`, `_copy_2`, and so on. A move to a name that is taken is refused.

To work on several files, use select mode and the selection bar. If one file fails, the others still go through.

### Batch rename

Select files and choose **Rename** in the selection bar. The dialog previews every new name before you apply it. There are three modes:

- **Template**: build names from `{original}` and a counter `{n}`, with a start number and zero-padding.
- **Regex**: a pattern and a replacement.
- **Prefix / Suffix**: add or remove text at the start or end.

## Editing text

To edit a Markdown or text file in the browser you need the [Knowledge addon](../addons/knowledge.md). On the file's page, press **Open editor**. Without the addon, text files are read-only in the browser. See [notes](notes.md).

- The editor saves 2 seconds after you stop typing.
- If someone changed the file elsewhere, it shows **Changes detected on another device** and lets you reload theirs or keep yours.
- Files over 1 MB cannot be saved from the editor. Replace them by uploading instead.

## Trash and permanent delete

Deleting a file moves it to the **Trash**. The file stays on disk until it is permanently deleted.

- Items in the trash are deleted permanently after 30 days.
- **Restore** puts a file back. It fails if the file has since disappeared from disk.
- **Permanently Delete** on a file, or **Empty Trash** for the whole drive, deletes the file from disk at once, whatever its age. This cannot be undone.
- A missing file cannot go to the trash, because there is nothing on disk. Delete it permanently from **Missing Files**.

See [trash and missing files](trash-and-missing.md).

## Downloading

Choose **Download** from a file's right-click menu or in the viewer. Downloads can be resumed by download managers.

You cannot download several files at once, or a folder as a ZIP.

## ZIP files

Open a `.zip` file to browse what is inside, like a folder. Other archive types, such as TAR or RAR, are not opened.

- **Download** a single entry. Images and plain text open in the browser.
- **Download archive** in the toolbar downloads the whole ZIP.
- Only the first 10,000 entries are listed, and an entry over 50 MB cannot be opened.

Litloft does not unpack a ZIP into the drive. To do that, download it, unpack it and upload the files.

## Backups

See [backup and restore](../admin-guide/backup-restore.md).
