# Drives and access control

A *drive* is the top-level unit of content in Litloft. Each drive has a name, a host directory, and optional password protection. **A drive is a security boundary** — Litloft never serves cross-drive search, favourites, or tag aggregation. If you want two collections to be isolated, make them two drives.

## Defining a drive

Drives live in `drives.json` (a JSON array) at the project root. You do not create this file by hand: `configure.py` writes it empty (`[]`), the backend seeds one entry per mounted directory on first start, and you name and protect them through the [setup wizard](../getting-started/first-run-setup.md) or the [settings GUI](../admin-guide/settings-gui.md). Direct file editing also works but requires a backend restart — reset the file to `[]` rather than deleting it (the single-file bind-mount needs the file to exist).

```json
[
  { "name": "Movies", "path": "/app/drives/movies" },
  { "name": "Photos", "path": "/app/drives/photos" },
  {
    "name": "Private",
    "path": "/app/drives/private",
    "access_group": "private",
    "addons": { "intelligence": { "transcription_cloud": false } }
  }
]
```

| Field | Required | What it does |
|---|---|---|
| `name` | yes | Unique identifier and URL slug. Avoid `/` and `\`. Unicode allowed. |
| `path` | yes | Container path mounted in by `docker-compose.override.yml`. Validated on save. |
| `access_group` | no | Marks the drive as protected. Only viewers who unlock this group via password can see it. |
| `addons` | no | Per-drive addon policy. See [addons overview](../addons/overview.md). |

## Access groups

An *access group* is a label you attach to a drive. A viewer unlocks zero or more access groups by entering passwords on `/unlock`. A drive is visible to a viewer iff its `access_group` is in their unlocked set, **or** the drive has no `access_group` (public).

Passwords are defined in `passwords.json`:

```json
[
  { "password": "very-good-password", "groups": ["private", "shared"] },
  { "password": "shared-only", "groups": ["shared"] }
]
```

A single password can unlock multiple groups. Multiple passwords can grant the same group. Passwords are compared with HMAC-SHA256 against the entered value.

## How locking is enforced

A locked drive is **invisible**, not just refused:

- API responses omit it entirely (the drive list does not include it).
- Direct URL access returns `404 Not Found` rather than `403 Forbidden`.
- The frontend never names a locked drive. The home screen ends its grid with an outlined card leading to `/unlock` when protected drives exist that you have not unlocked — but the card carries no drive name, no count, no group name, and no total. It says only that a password will get you further.
- That card is absent for a viewer who already holds every access group, and absent when nothing is protected at all.

This *hidden by default* model is by design: it makes a casual-snooping observer unable to tell whether a private drive even exists. A generic way in does not weaken it — the observer learns that *some* password exists, which the `/unlock` page itself already tells anyone who visits it.

## Master viewer (admin)

A viewer whose unlocked password covers **every** access group used in `drives.json` is a *master viewer*. Master viewers:

- See the **Admin** link in the global menu.
- Can edit drives, passwords, and addon policy at [`/admin/settings`](../admin-guide/settings-gui.md).
- Can view the dashboard at `/admin`.

If `passwords.json` is empty (`[]`) or absent, every viewer is implicitly an admin. `configure.py` always generates an empty `passwords.json`; an empty file is treated identically to no file (all drives public). This is the *graceful degradation* mode for personal-use single-user setups, and the default until you add a password through the wizard or settings GUI.

## The unlock flow

1. Viewer navigates to `/unlock`, from the home screen's unlock card or by typing the URL.
2. They enter a password and optionally tick **Remember this device**.
3. The backend issues a JWT (`access_token` cookie). Default lifetime 24 hours; with *remember me* it is 1 year.
4. Subsequent requests include the cookie; the backend reads the unlocked groups from the JWT payload.

## Resetting access

- **Clear cookies** in the browser to forget all unlocks on that device.
- **Edit `passwords.json`** to revoke or change passwords. Existing JWTs remain valid until they expire because the backend does not maintain a session table; for instant revocation, also rotate `JWT_SECRET` in `.env` and restart the backend, which invalidates every issued token.

## Moving between drives

The drive you are in is the row at the top of the sidebar, under the Litloft logo. Press it to
open the others and pick one. On surfaces that belong to no drive — the root page and
`/admin` — that row names the list instead, as "Drives (4)", and folds the same way.
It starts folded, and folds again whenever you arrive somewhere new, so it is
open only while you are asking it something.

Only drives you can currently see are listed. A protected drive you have not unlocked is
absent from the list, exactly as it is absent from the root page and from the API: its
existence is not disclosed before unlock (see [access groups](#access-groups)).

## Multi-drive patterns

A few common shapes:

- **Single public drive.** No `access_group`, no `passwords.json`. Anyone on the LAN sees everything. This is the default after the wizard.
- **Single protected drive.** One drive with `access_group: "all"`, one password covering `["all"]`. A simple "private library" feel.
- **Family setup.** A `kids` drive with `access_group: "kids"`, a `parents` drive with `access_group: "parents"`. Kids' password unlocks `["kids"]`; parents' password unlocks `["kids","parents"]`. Parents are master viewers.
- **AI-quarantined drive.** Add `"addons": {"intelligence": false}` (or `{"intelligence": {"transcription_cloud": false}}`) to keep specific drives from sending content to LLMs or cloud transcription APIs.

## Configuration changes that need a restart

- Adding or removing a drive — the scanner enumerates drives on boot.
- Renaming a drive — the URL slug changes; cached watch history may briefly look orphaned until a rescan.
- Changing addon policy — most addons reload policy on the next event, but indexing addons may need a restart to reflect a freshly disabled drive.

The admin UI shows a *pending changes* banner whenever the configuration on disk is ahead of the running process. A `docker compose restart backend` is enough — no data is lost.
