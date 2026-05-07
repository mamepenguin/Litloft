# First-run setup

The first time you load Litloft in a browser, you are redirected to `/setup`, a six-step wizard that creates `drives.json` and (optionally) `passwords.json`. The wizard runs without authentication; until it completes, any LAN client can write the configuration. Run it from the same network you trust to admin from.

> **Image needed:** screenshot of the wizard's overall stepper. See [`IMAGES-NEEDED.md`](../IMAGES-NEEDED.md).

## When the wizard runs

The setup wizard is shown when the file `data/setup_completed` does **not** exist. The first successful run creates this sentinel file. To re-run setup later, delete the sentinel and reload `/setup`.

## Step 1 — Language

Choose `日本語` or `English`. The choice is stored client-side (cookie + localStorage) and influences both the wizard and the running app. Locale is later changeable from the in-app settings.

## Step 2 — Welcome

A localised summary of what the next four steps will collect. No input needed.

## Step 3 — Drives

Declare your drives. Each entry has:

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Display name and URL slug. Avoid path separators (`/`, `\`). Unicode is fine (e.g. `動画`, `Photos`). |
| `path` | yes | The **container** path. Must match a volume mount you set up in `docker-compose.override.yml`. The wizard validates the path is reachable from the backend. |
| `access_group` | no | If set, the drive is protected and only viewers who unlock this group via password can see it. Set up groups in steps 4–5. |

Add as many drives as you need, in any order. Order is preserved in `drives.json` and used in some UIs.

## Step 4 — Access mode

Pick how access is gated:

- **Public** — every drive is visible to everyone on the LAN. No `passwords.json`.
- **Protected** — at least one drive uses an `access_group`. You will set passwords in step 5.

You can switch later from the admin settings page.

## Step 5 — Password (only if Protected)

Create one or more password entries. Each entry has:

- `password` — the password string. Compared with HMAC-SHA256 against the entered value.
- `groups` — list of `access_group` names this password unlocks.

The wizard makes you create at least one password whose `groups` cover **every** protected drive. This guarantees you have an admin path: a viewer who unlocks all groups holds *master viewer* status and can edit settings later.

> **Tip.** Use one password that covers all groups for yourself, plus narrower passwords (one or two groups each) for housemates or kids.

## Step 6 — Addon policy

If addons are installed, you see a matrix of `drives × addons`. Toggle each cell to opt the drive in or out of that addon. Most addons declare per-feature flags too — for example, the `intelligence` addon exposes a `transcription_cloud` toggle so you can keep some drives strictly local.

The defaults are addon-specific. Most addons are **off** unless explicitly enabled, but the policy is *graceful-degradation*: if a feature is unspecified the addon decides whether to enable it.

If no addons are installed, this step is skipped automatically.

## Step 7 — Complete

A summary of what you configured: drive count, access mode, addon enablement. Click **Finish**; the wizard:

1. Writes `drives.json` (atomic write through `.tmp` + rename).
2. Writes `passwords.json` if you chose Protected.
3. Writes the per-drive addon policy into `drives.json` under each drive's `addons` field.
4. Creates `data/setup_completed`.
5. Triggers a backend rescan.

You are then redirected to the home page (`/`) listing your drives.

## After setup

- All settings can be edited at [`/admin/settings`](../admin-guide/settings-gui.md). Some changes (drive paths, addon policy reload) require a backend restart — Litloft surfaces a *pending changes* banner and a `data/restart_pending` flag is set.
- A *master viewer* is anyone whose unlocked password covers every protected drive. Master viewers see the **Admin** link in the global menu.
- If you set `access_mode = Public`, anyone on your LAN is effectively an admin. This is a deliberate design choice for trusted home networks; do not expose Litloft to the internet in this mode.

## Troubleshooting

- **"Path does not exist" on the Drives step.** The container cannot see that path. Re-check your volume mount in `docker-compose.override.yml` and `docker compose up -d` again.
- **Locked out after setting protected mode.** `data/setup_completed` blocks the wizard from re-running. To recover: stop the stack, edit `passwords.json` directly, and start again. As a last resort, `rm data/setup_completed passwords.json drives.json` to start clean (does **not** delete files in your drives, only the configuration).
- **Addons not showing in step 6.** Confirm the addon's symlink under `addons/` is intact and that the addon container (if independent) is up.

Continue with the [user-guide overview](../user-guide/overview.md) or jump straight to [browsing files](../user-guide/file-browsing.md).
