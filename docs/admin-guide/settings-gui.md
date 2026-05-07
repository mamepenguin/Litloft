# Settings GUI

`/admin/settings` is the canonical place to edit Litloft configuration after the initial setup wizard. It is a thin wrapper over `drives.json` and `passwords.json` with validation and atomic writes — what you save here is identical to what you would write by hand, just safer.

> **Image needed:** screenshot of the settings page showing the three sections (Drives, Passwords, AddonPolicy).

## Authorisation

The page is reachable only by a master viewer. The middleware in `frontend/src/app/admin/layout.tsx` checks the JWT and redirects unauthorised viewers.

## Section: Drives

Lists every drive in `drives.json`. Per row:

- **Name** — the URL slug. Renaming changes the URL; existing watch history etc. are not orphaned because they reference `file_id`, not the drive name. Pinned folders, however, are keyed by drive name and lose their pin on rename.
- **Path** — container path. Changes are validated: the path must exist inside the backend container and not be the root `/`. Mismatch → inline error.
- **Access group** — optional protection label. Adding or changing this requires a matching `passwords.json` entry to keep someone able to unlock the drive.
- **Addon policy** — opens an inline matrix of toggles for each enabled addon (see *AddonPolicy* below). For addons with sub-feature flags, an expandable row lists each flag.

Add a drive with the `+` button. Validation runs before save; on success the file is written atomically (`.tmp` + rename) and a `data/restart_pending` flag is set. The dashboard banner reminds you to restart.

Delete a drive with the trash icon. The DB rows for files in that drive **stay** until you purge them — Litloft does not auto-delete on drive removal so you can recover from a misclick. To clean them up afterwards, use `purge_all_missing` once the scanner has flagged the orphans as missing.

## Section: Passwords

Lists every entry in `passwords.json`, with passwords masked as `***` (the server never sends actual values back to the client).

Per row:

- **Password** — only editable on row creation; existing rows are read-only on this field.
- **Groups** — the `access_group` names this password unlocks.
- **Delete** — removes the entry.

Adding a password is a separate workflow: enter the password value, choose groups, save. The backend writes to `passwords.json` atomically.

The setup wizard enforces that at least one password covers every group; the settings GUI emits a warning if you delete the last admin-grade password but allows the operation (so you can rotate by adding the new one first, then removing the old).

## Section: AddonPolicy

A matrix of `drives × addons`. Each cell:

- A simple `bool` for addons without sub-features.
- An expandable row of `feature: bool` toggles for addons that declare them.

Saving writes the policy into the corresponding drive's `addons` field in `drives.json`. The intelligence addon, for example, exposes `transcription_cloud` and `rag` flags — useful when you want a *Private* drive to opt out of cloud transcription and Ask while keeping local indexing.

Unspecified keys are *graceful-degradation*: the addon's default applies. To force a feature off explicitly, toggle it visibly to off.

## Validation

The settings GUI rejects:

- Drive names with `/` or `\`.
- Drive paths that do not exist in the container.
- Drive paths set to `/` or other system roots.
- `passwords.json` entries with an empty password or an empty groups array.
- Addon policy referencing addons that are not currently installed.

Errors are shown inline on the relevant field with a descriptive message; the *Save* button stays disabled until the form is valid.

## What changes need a restart

The UI labels each kind of change with a small *Requires restart* badge:

- Adding / removing / renaming drives (scanner enumerates drives on boot).
- Changing addon installation state.

These set `data/restart_pending`. After `docker compose restart backend` the flag clears automatically.

Changes that do **not** need a restart:

- Adding / removing passwords (the JWT issuer reads `passwords.json` on each unlock).
- Editing addon policy (most addons reload policy on the next event with a 30-second TTL on the cache).

## Direct file editing

You can edit `drives.json` and `passwords.json` by hand if you prefer. The conventions are identical:

- Atomic write — write to a temp file then `mv` over the target. Litloft does this for you when using the GUI; do it yourself when scripting.
- Backup — keep the previous version when scripting (Litloft writes a `.bak` automatically).
- Validation — mistakes cause backend startup to fail; check `docker compose logs backend`.

After hand edits, restart the backend.

## API endpoints

For automation:

- `GET /api/admin/config/drives` — read drives.json
- `PUT /api/admin/config/drives` — replace drives.json with validation
- `GET /api/admin/config/passwords` — read masked entries
- `PUT /api/admin/config/passwords` — replace passwords.json
- `POST /api/admin/config/passwords/append` — add one entry
- `DELETE /api/admin/config/passwords/{index}` — remove by index
- `PUT /api/admin/config/addon-policy` — update per-drive addon policy
- `GET /api/admin/config/setup-status` — whether `data/setup_completed` exists
- `GET /api/admin/config/restart-status` — `data/restart_pending` flag

All require admin authentication.
