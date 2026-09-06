# Admin dashboard

The admin dashboard at `/admin` is the operational view of Litloft. It is visible only to a *master viewer* — someone whose unlocked password groups cover every protected drive (or every viewer when `passwords.json` is absent).

> **Image needed:** annotated screenshot of the admin dashboard showing per-drive cards, system metrics, and the restart-pending banner.

## What you see

The page is composed of stacked sections, each driven by an API call:

### Per-drive cards

For every drive in `drives.json`:

- **File counts by type** — video, audio, document, archive, image, other, in that fixed order and always all six. A type the drive holds none of reads as `0` in muted text rather than being left out, so the breakdown on one card lines up with the breakdown on the next. Subtitle files are counted under *other*: the six names are what the card shows, and the total has to match the file count above it.
- **Trash count and bytes** — how much would be reclaimed by an empty-trash cycle.
- **Missing count** — files that disappeared from disk and are awaiting recovery.
- **Last scan** — when the scanner last walked this drive.
- **Index queue** (if the intelligence addon is enabled) — items pending semantic indexing, as one running/waiting total. The eleven per-task queues behind it are listed individually only while they are moving; the idle ones sit behind a *Show N idle queues* disclosure.

Click a drive card to drill into per-drive admin actions.

### System metrics

**Disk usage is listed per filesystem, not per drive**, with the drives
that share each one named beside it. `shutil.disk_usage` measures a
mount: asking it once per drive gave every drive on the same disk
identical numbers, so an empty drive read as half full. A drive whose
path cannot be read is left out rather than shown as a full disk.


A single card with global stats:

- DB size (bytes of `data/data.db`).
- Uptime (since the last container restart).
- Total file count, total trash size, total missing count.
- Last full scan.
- Background job status (auto-purge, scan, addon workers).

### Duplicates

Files sharing a `file_hash` are grouped here. Useful when consolidating after a bulk import. Each row links to the file detail page so you can pick a winner and delete the rest.

### Addon alerts

Above the drive cards, before anything else on the page, addons may raise something an operator should see first — the intelligence addon puts its failed indexing jobs here. The band is absent when nothing is wrong; it is not a section with an empty state.

### Addon widgets

Independent addons inject **dashboard widgets**:

- *Cloud Sync* — remote, schedule, last run, manual *Sync now*.
- *Intelligence* — index queue depth, model memory, last reconciliation.
- (Other addons may add their own slots.)

Slots are filtered by per-drive policy — a widget will not render if its addon is disabled for every drive on the dashboard's scope.

### Restart-pending banner

When the configuration on disk is ahead of the running backend (drive added, password rotated, etc.), Litloft writes a `data/restart_pending` flag and the dashboard surfaces a yellow banner: *Pending changes — restart the backend to apply*. The flag clears automatically on the next backend boot.

## Authorisation

`require_admin` checks that the current viewer holds **all** protected `access_group` names. If `passwords.json` is absent, every viewer is implicitly an admin.

For protected setups, ensure your own master password covers every group used in `drives.json`. The setup wizard enforces this on first run; later edits at `/admin/settings` validate against the same rule.

## Useful actions

From the dashboard you can:

- **Force a rescan** — *Rescan* in the folder toolbar's `…` menu, inside the drive. (Not on the dashboard's drive cards; they carry no rescan button.) This re-walks the directory and reconciles the DB, then reports what it found — how many files were added, recovered and are now missing, or that nothing changed. If a scan is already running on that drive it says so rather than failing.
- **Empty trash** — purges everything older than 30 days, or all trashed files with confirmation.
- **Purge all missing** — `purge_all_missing` runs in chunks of 200 with a webhook per batch.
- **Restart backend** — the UI does not actually restart the container; it points you at `docker compose restart backend` and the *restart-pending* flag.

## Where the data comes from

- `GET /api/admin/dashboard` — aggregates per-drive and system metrics in one round-trip.
- `GET /api/admin/duplicates` — paginated duplicates groups.
- `GET /api/addons/status` — addon catalog and per-drive enablement.
- `GET /api/admin/config/restart-status` — the `data/restart_pending` flag.

The dashboard listens on the WebSocket too, so changes to the underlying state (a new file scanned, an addon error) reflect without a refresh.

## Common ops tasks

- **Free disk space.** Empty trash, then *Purge all missing* if you have stale records.
- **Spot a stuck index.** Watch the intelligence widget; a task row that stays on screen with a depth that does not move usually means the LLM provider is unreachable (a task with nothing to do drops back into the idle disclosure). `docker compose logs -f intelligence` confirms.
- **Audit access.** Visit `/admin/settings` → *Passwords*. Server returns masked entries (`password: "***"`); you can see which groups each entry unlocks.
- **Rotate JWT secret.** Set `JWT_SECRET` in `.env` and `docker compose restart backend`. All existing JWTs become invalid; viewers re-unlock.

For step-by-step settings changes, see [settings GUI](settings-gui.md).
