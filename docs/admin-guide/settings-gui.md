# Settings

**Settings** at `/admin/settings` edits drives, passwords and the addon policy after first-run setup. It writes `drives.json` and `passwords.json` for you. Open it from **Settings** on the admin dashboard.

Only administrators can open it: viewers who unlocked the admin password, or a password covering every protected drive. When no password exists, everyone is an administrator.

When the intelligence addon is installed, the page has two tabs, **System** and **Intelligence**. This page covers **System**. The intelligence settings are described in the [intelligence addon guide](../addons/intelligence.md).

## Drives

Lists each drive with its name, container path and group. **Add drive** and **Edit** open a form with:

- **Name**: shown in the sidebar and used in the URL. Must be unique.
- **Path**: the path inside the backend container, for example `/app/drives/movies`. It must be an absolute path to a directory that exists in the container.
- **Group** (optional): the access group. A drive with a group is hidden until someone unlocks a password for that group. Add a matching password under [Passwords](#passwords), or nobody can open the drive.

Settings cannot mount a new host directory. To add one:

1. Re-run `python3 configure.py`, raise the drive count, enter the new path, and let it overwrite `docker-compose.override.yml`. (Or add `- /host/path:/app/drives/<slug>` under the backend's `volumes:` yourself.)
2. Run `docker compose up -d --build`.
3. Press **Add drive** and enter `/app/drives/<slug>` as the path.

**How to add a new drive** on the page repeats these steps.

Renaming a drive is not a move. Files are stored under the drive's name, so after a rename the drive is scanned as new, and tags, comments and watch history stay with the old name.

**Delete** removes the drive from `drives.json` after you press **Confirm delete**. Files on disk are not touched. Litloft keeps its records of the drive's files; adding the drive back under the same name brings them back.

Drive changes take effect after a backend restart.

## Passwords

Lists each password as `***` with the groups it unlocks. Password values are never sent back to the browser, so an existing password cannot be viewed or edited: add a new one and delete the old one.

- **Add password**: enter the **Password** and **Groups (comma-separated)**. Each group must be a drive's group, or `__admin__`.
- **Delete** removes the entry at once.

`__admin__` makes a password an admin password: it opens the admin pages without unlocking any drive. The wizard adds it to the password you create there. Only a viewer who unlocked an admin password can add another one.

When the list is empty, the section shows **Public mode (no passwords.json)** and **Enable password protection**. On such an install everyone is an administrator, so the first admin password cannot be added here. Add it to `passwords.json` by hand (see [Direct file editing](#direct-file-editing)) and restart the backend.

A new or deleted password applies from the next unlock. Viewers who already unlocked stay unlocked until their unlock expires; to sign everyone out, see [Signing out every device](admin-dashboard.md#signing-out-every-device).

## Addon policy

A table of drives against addons. Each switch turns an addon **On** or **Off** for one drive and saves at once. When an addon declares finer switches, for example the intelligence addon's `transcription_cloud` and `chapter_suggestions`, they appear as extra rows under the drive while the addon is on for it. What each one does is explained under the table.

A switch that was never saved counts as on. How a disabled addon behaves is described in the [addon overview](../addons/overview.md#per-drive-policy).

## Restarting

Every save on this page shows **Pending changes — restart required** at the top of the admin pages, with a **Copy** button for the command:

```bash
docker compose restart backend
```

The banner clears when the backend starts again. An addon policy change already applies to the backend when it is saved.

## What is rejected

A save fails with a message when:

- a drive has no name or no path, two drives share a name, or the path is not an absolute path to a directory in the container;
- a password is empty or already used, or has no groups;
- a group is neither a drive's group nor `__admin__`;
- the addon policy names a drive or an addon that does not exist.

## Direct file editing

You can edit `drives.json` and `passwords.json` by hand while the stack is stopped, then start it again.

```json
// drives.json
[
  { "name": "movies", "path": "/app/drives/movies", "access_group": "family" }
]
```

```json
// passwords.json
[
  { "password": "change-me", "groups": ["family", "__admin__"] }
]
```

Keep both files present; write `[]` rather than deleting one. Each save from the GUI leaves the previous version next to the file as `drives.json.bak` or `passwords.json.bak`. If the backend misbehaves after a hand edit, check `docker compose logs backend`.

## API

The page uses these endpoints, under `/api/admin/config`:

| Method and path | Purpose |
|---|---|
| `GET /drives` | Read `drives.json`. |
| `PUT /drives` | Replace `drives.json`. |
| `GET /passwords` | Read `passwords.json`, with every password masked. |
| `PUT /passwords` | Replace `passwords.json`. |
| `POST /passwords/append` | Add one entry. |
| `DELETE /passwords/{index}` | Remove the entry at that position. |
| `GET /addon-policy` | Read each drive's addon policy. |
| `PUT /addon-policy` | Replace the addon policy of the drives named. |
| `GET /restart-status` | Whether a restart is pending. |
| `GET /setup-status` | `{completed, drives}`. No login needed. `drives` is filled only before setup is finished. |
| `POST /setup-token/verify` | Check a setup token. `404` once setup is finished. |
| `POST /complete-setup` | Mark setup as finished. `409` if it already is. |

The `GET` endpoints other than `setup-status` need an administrator. Before setup is finished, the writes need the setup token in the `X-Litloft-Setup-Token` header instead; afterwards they need an administrator. See [HTTP API](../reference/api.md).
