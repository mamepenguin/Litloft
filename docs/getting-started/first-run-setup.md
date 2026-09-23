# First-run setup

The first time you load Litloft in a browser, you are redirected to `/setup`, a wizard where you turn the mounted directories into named drives and decide how access is gated. `configure.py` already wired the containers and the backend seeded one stub drive per mounted directory; the wizard is where that becomes your real configuration (names, passwords, AI features).

No admin password exists yet at that point, so the wizard cannot ask for one. It asks for a **setup token** instead, and until setup completes that token is the only thing that can write the configuration.

> **Image needed:** screenshot of the wizard's overall stepper. See [`IMAGES-NEEDED.md`](../IMAGES-NEEDED.md).

## When the wizard runs

The setup wizard is shown when the file `data/setup_completed` does **not** exist. The first successful run creates this sentinel file. To re-run setup later, delete the sentinel, restart the backend, and open the new token's URL from the log.

## Step 0 — Setup token

`configure.py` prints the address to open when it finishes, and that address already carries the token:

```
→  http://localhost:3000/setup?token=6f2a…
```

Open it and the wizard goes straight to the language choice. Nothing is typed.

If you started the containers another way, the backend prints the token at startup instead:

```
docker compose logs backend | grep "setup token"
```

Paste it into the field and press →. The token gates every write the wizard makes, including the last one that marks setup complete, so nobody else on the network can configure the install or finish it out from under you.

A restart mints a new token. If you restart mid-setup, read the log again.

Opening `/setup` on an install that has already been through it says so and
offers a link back to Litloft; there is no token that reopens the wizard. To
re-run it, delete the sentinel as above.

Set `LITLOFT_SETUP_TOKEN` in `.env` to choose the value yourself; `configure.py` writes it there and reuses whatever it finds, so re-running it does not invalidate a setup already in progress.

## Step 1 — Language

Choose the UI language. English is selected by default, and the choice is stored client-side (cookie + localStorage) for both the wizard and the running app. Locale is later changeable from the in-app settings.

## Step 2 — Welcome

A localised summary of what the next four steps will collect. No input needed.

## Step 3 — Drives

The wizard lists the drives the backend detected — one per directory you mounted under `/app/drives/` via `configure.py`. You do not type host paths here; the mounts are already wired. For each detected drive you set:

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Display name and URL slug. Defaults to the mount slug; rename it to something readable. Avoid path separators (`/`, `\`). Unicode is fine (e.g. `Movies`, `Photos`). |
| `access_group` | no | If set, the drive is protected and only viewers who unlock this group via password can see it. Set up groups in steps 4–5. |

The container path is fixed by the mount and is not editable here. To add or remove a drive, add or remove a mount line in `docker-compose.override.yml` and run `docker compose up -d --build` again.

If no drives appear, no directories are mounted under `/app/drives/`. Fix the `services.backend.volumes` block in `docker-compose.override.yml` (or re-run `configure.py`), rebuild, and reload `/setup`.

## Step 4 — Access mode

Pick how access is gated:

- **Public** — every drive is visible to everyone on the LAN. `passwords.json` stays empty (`[]`), which is treated exactly like having no passwords at all.
- **Protected** — at least one drive uses an `access_group`. You will set passwords in step 5.

You can switch later from the admin settings page.

## Step 5 — Password (only if Protected)

Create one or more password entries. Each entry has:

- `password` — the password string. Compared with HMAC-SHA256 against the entered value.
- `groups` — list of `access_group` names this password unlocks.

The wizard makes you create at least one password whose `groups` cover **every** protected drive. This guarantees you have an admin path: a viewer who unlocks all groups holds *master viewer* status and can edit settings later.

> **Tip.** Use one password that covers all groups for yourself, plus narrower passwords (one or two groups each) for housemates or kids.

## Step 6 — Addon policy

If addons are installed, the step opens with **a short list of what each addon is** — once, not once per drive — followed by one card per drive holding a switch for each addon. Every switch starts on; turn one off to keep that addon out of that drive.

Per-feature flags are not offered here. The wizard is a yes-or-no per addon; the finer toggles an addon declares — the `intelligence` addon's `transcription_cloud`, for one — are edited afterwards at `/admin/settings`, which is also where you would go to change any of this later.

An addon or feature nothing has been saved for is **on**. Skipping this step leaves every installed addon enabled on every drive, and only the switches you turn off are saved.

A switch belongs to its drive, so renaming the drive afterwards on the Drives step keeps your choice.

If the list of installed addons cannot be loaded, the step says so and offers **Retry**. Continuing without it saves nothing, so every installed addon stays enabled on every drive, and the summary says the addons were left at their defaults.

## Step 7 — Complete

A summary of what you configured: drive count, access mode, addon enablement. Click **Finish**; the wizard:

1. Writes `drives.json` with your names and access groups (atomic write through `.tmp` + rename), replacing the seeded stubs.
2. Writes password entries into `passwords.json` if you chose Protected (the file already exists as `[]`; the wizard fills it in).
3. Writes the per-drive addon policy into `drives.json` under each drive's `addons` field.
4. Creates `data/setup_completed`.
5. Triggers a backend rescan.

If saving the addon policy is rejected, the error is shown under the summary and setup is not marked complete; fix the cause and click **Finish** again.

You are then redirected to the home page (`/`) listing your drives.

## After setup

- All settings can be edited at [`/admin/settings`](../admin-guide/settings-gui.md). Some changes (drive paths, addon policy reload) require a backend restart — Litloft surfaces a *pending changes* banner and a `data/restart_pending` flag is set.
- A *master viewer* is anyone whose unlocked password covers every protected drive. Master viewers see the **Admin** link in the global menu.
- If you set `access_mode = Public`, anyone on your LAN is effectively an admin. This is a deliberate design choice for trusted home networks; do not expose Litloft to the internet in this mode.

## Troubleshooting

- **No drives detected on the Drives step.** No directories are mounted under `/app/drives/`. Re-check the `services.backend.volumes` block in `docker-compose.override.yml` (or re-run `configure.py`), then `docker compose up -d --build` and reload.
- **Locked out after setting protected mode.** `data/setup_completed` blocks the wizard from re-running. To recover: stop the stack, edit `passwords.json` directly, and start again. As a last resort, `rm data/setup_completed` and reset `drives.json` / `passwords.json` to `[]` (`echo '[]' > drives.json && echo '[]' > passwords.json`) to start clean — reset them to `[]`, do **not** delete the files (an absent single-file bind-mount makes Docker create an unusable directory). This does **not** delete files in your drives, only the configuration.
- **Addons not showing in step 6.** Confirm the addon's submodule under `addons/` is checked out and the images were rebuilt, and that the addon container (if independent) is enabled in `configure.py` and up.

Continue with the [user-guide overview](../user-guide/overview.md) or jump straight to [browsing files](../user-guide/file-browsing.md).
