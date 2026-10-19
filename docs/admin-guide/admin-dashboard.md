# Admin dashboard

The **Dashboard** at `/admin` shows the state of each drive and of the server. Open it from **Administration** at the bottom of the sidebar.

Only administrators can open it: viewers who unlocked the admin password, or a password covering every protected drive. When no password exists, everyone is an administrator. Anyone else sees **403 Forbidden**.

The header links to **Markdown images** and **Settings**.

## Alerts

Addons can put a warning at the top of the page. The intelligence addon shows failed indexing jobs there. Nothing is shown when there is nothing wrong.

## Drives

One card per drive:

- The number of files, then a count for each type: video, audio, document, archive, image and other. A type with no files shows `0`, dimmed.
- **Scanning...** while a scan runs, otherwise **Last Scanned** with the time, or **Never Scanned**.

To rescan a drive, open it and choose **Rescan** from the folder toolbar's `…` menu. The dashboard updates when the scan finishes. Only one scan runs at a time across all drives.

## System

- **Total Files**, and **Trash**: the number of trashed files.
- **Database**: the size of `data/data.db`.
- **Thumbnail Cache**, **Converted Cache** and **Temp Files**: the space these take under `data/`.
- **Uptime** since the backend last started.
- Disk usage for each filesystem, with the drives on it named beside it. A drive whose directory cannot be read is left out.

## Addon widgets

Addons can add their own panels below the system section. The intelligence addon shows its indexing queue there. A queue that stays at the same depth usually means the LLM or transcription provider is unreachable; `docker compose logs -f intelligence` shows why.

## Duplicate Files

Pick a drive to see groups of files with identical content. Open a group and tick the copy to keep; it is marked **Keep**. Press **Delete Selected** and confirm, and the other copies go to the trash.

## Markdown images

**Markdown images** opens **Attach Markdown Images**. It finds Markdown files whose images are on external HTTPS sites, downloads the images from the hosts you allow, saves them in an `assets` folder next to each note, and changes the note to point at the saved copy.

1. Choose a **Drive**, optionally a **Folder** and **Include subfolders**, and press **Analyze**.
2. Check the counts and the hosts, choose the hosts allowed for download, and press **Attach**.

A job stopped by a backend restart shows **Interrupted by restart**.

## Pending changes

After a change on the Settings page, the admin pages show **Pending changes — restart required**. **Copy** copies the command:

```bash
docker compose restart backend
```

The banner clears when the backend starts.

## Signing out every device

Unlocks are signed with a key in `data/.jwt_secret`. To make every device unlock again, for example after removing a password, delete the key and restart:

```bash
rm data/.jwt_secret
docker compose restart backend
```

If you pass `JWT_SECRET` to the backend in `docker-compose.override.yml`, that value is used instead of the file; change it and run `docker compose up -d`.

The backend creates a new key at startup. If you set `JWT_SECRET` in the backend's environment, change that value instead.

## Trash and missing files

Emptying the trash and clearing missing files are done inside each drive, not on the dashboard. See [Trash and missing files](../user-guide/trash-and-missing.md).

## API

The dashboard reads `GET /api/admin/dashboard`, `GET /api/drives/{drive}/duplicates`, `GET /api/addons/status` and `GET /api/admin/config/restart-status`. See [HTTP API](../reference/api.md).
