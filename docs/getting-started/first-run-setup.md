# First-run setup

The first time you open Litloft, it sends you to `/setup`. The wizard turns the mounted directories into named drives, sets up access control, and chooses which addons each drive uses.

The wizard runs while `data/setup_completed` does not exist. Finishing it creates that file.

## Setup token

No password exists yet, so the wizard asks for a **setup token** instead. Until setup is finished, only someone with the token can change the configuration.

`configure.py` prints an address that already carries the token:

```
→  http://localhost:3000/setup?token=6f2a…
```

Open it and the wizard skips straight to the language choice.

If you started the containers another way, the backend prints the token at startup:

```bash
docker compose logs backend | grep "setup token"
```

Paste it into **Setup token** and press **→**.

`configure.py` saves the token in `.env` as `LITLOFT_SETUP_TOKEN`, so it stays the same across restarts. If that variable is not set, every backend restart prints a new token.

If setup is already finished, the page says **Setup is complete.** with a link back to Litloft.

## Language

Choose **English** or **日本語**. The choice is saved in a cookie and carries over to the app.

## Welcome

A summary of the steps ahead. Press **Get started**.

## Drives

The wizard lists one drive for each directory mounted under `/app/drives/`. You do not type paths here. For each drive, set:

- **Name**: shown in the sidebar and used in the URL. It starts as the slug from `configure.py`. Letters, numbers and hyphens are safest.
- **Group** (optional): an access group. A drive with a group is hidden until someone unlocks a password for that group. Leave it blank for a public drive.

To add or remove a drive, change the mounts in `docker-compose.override.yml` (or re-run `configure.py`), run `docker compose up -d --build`, and reload `/setup`.

## Access control

- **Public (LAN-only, no auth)**: anyone on your network can browse every drive, and anyone can open the admin pages. `passwords.json` stays empty.
- **Password protected**: you set an admin password in the next step.

## Admin password

Shown only for **Password protected**. The password you enter becomes the admin password: it unlocks every group and opens the admin pages. All groups must stay checked.

If no drive has a group, this password protects only the admin pages, and every drive stays public.

You can add passwords for single groups later, in [Settings](../admin-guide/settings-gui.md#passwords).

## Addon policy

Shown when addons are installed. A short description of each addon comes first, then one card per drive with a switch for each addon. Every switch starts on. Turn one off to keep that addon away from that drive.

Finer switches, such as the intelligence addon's cloud transcription, are set later in [Settings](../admin-guide/settings-gui.md#addon-policy).

You can skip this step. Anything not saved counts as on.

If the addon list cannot load, the step shows **Retry**. Continuing without it leaves every addon on for every drive.

## Finish

The last step shows a summary. Press **Save and finish**. The wizard saves the drives, the admin password and the addon policy, marks setup as finished, and opens the admin dashboard.

If a save fails, the error appears under the summary and setup is not marked finished. Fix the cause and press **Save and finish** again.

The dashboard then shows **Pending changes — restart required**. Run:

```bash
docker compose restart backend
```

Drives are scanned under their new names when the backend starts.

## After setup

- Change drives, passwords and addons at [`/admin/settings`](../admin-guide/settings-gui.md).
- An administrator is someone who unlocked the admin password, or a password covering every protected drive. When no password exists, everyone is an administrator. Do not expose a public-mode install to the internet.

## Troubleshooting

- **No drives on the Drives step.** Nothing is mounted under `/app/drives/`. Fix the mounts in `docker-compose.override.yml` (or re-run `configure.py`), run `docker compose up -d --build`, and reload.
- **Locked out after choosing Password protected.** Stop the stack, fix `passwords.json` by hand (see [Direct file editing](../admin-guide/settings-gui.md#direct-file-editing)), and start it again.
- **Running the wizard again.** Stop the stack, delete `data/setup_completed`, and start it. If the wizard still does not appear, also set `drives.json` to `[]` so the backend reads the mounts again. Empty the file; do not delete it. Your files are not touched.
- **An addon is missing from the Addon policy step.** Check that its folder under `addons/` is checked out and the images were rebuilt. For intelligence and knowledge, also check that `configure.py` enabled the service and that its container is running.

Next: the [user guide](../user-guide/overview.md).
