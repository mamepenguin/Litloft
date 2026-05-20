# Upgrading

Litloft is upgraded by pulling new code (core + addons) and rebuilding the containers.

```bash
git pull --recurse-submodules
docker compose up -d --build
```

If the build fails, the previous image keeps running — you do not get a half-broken deployment.

## What survives an upgrade

Mounted in from the host and never touched by the build:

- `data/` — SQLite DB, thumbnails, uploads, addon DBs, sentinels, JWT secret.
- `drives.json`, `passwords.json` — your configuration.
- `docker-compose.override.yml` — your volume and service customisation.
- `.env` — your secrets.
- `addons/<name>/` — addon repositories and their data files (e.g. `search-config.yml`).

## What gets replaced

- The application code in `backend/`, `frontend/`, and the base `docker-compose.yml`.
- Container images (rebuilt on each `--build`).

## The `/setup` wizard does not reappear

Newer Litloft builds run the `/setup` wizard on first launch and own logical configuration there. Upgrading an existing install does **not** drop you back into the wizard: on startup the backend sees your non-empty `drives.json` and, if `data/setup_completed` is missing, creates it automatically (a one-time migration for installs that predate the sentinel). Your drives, passwords, and addon policy are untouched. The wizard only runs on genuinely fresh installs whose `drives.json` is still empty.

## Database migrations

The backend applies schema migrations on boot. There is no separate `migrate` command. Schema changes are forward-only: rolling back to an older Litloft after a migration may not be safe. Take a backup before pulling.

```bash
# quick backup before upgrade
cp -a data data.bak.$(date +%Y%m%d)
```

See [backup and restore](../admin-guide/backup-restore.md) for full options.

## Addon upgrades

Each addon under `addons/` is its own Git repository, tracked as a submodule of this one. The `git pull --recurse-submodules` above already advances each submodule to the commit the core points at. If you want the latest tip of each addon's own default branch instead, update them explicitly:

```bash
git submodule update --remote --merge
docker compose up -d --build
```

Addon-specific config files (for example `addons/intelligence/search-config.yml`) are *not* overwritten by submodule updates, but new fields may be introduced. After an addon upgrade, glance at the addon's `search-config.yml.example` (or equivalent) to see what is new.

## Restart-pending banner

Some configuration changes (drive paths, password file edits, addon policy) only take effect after a backend restart. The admin UI shows a *pending changes* banner backed by `data/restart_pending`. After `docker compose up -d --build` (or `docker compose restart backend`), the flag clears automatically.

## Breaking-change policy

Litloft is developed primarily for personal use; breaking changes are possible. Watch the repository's `CHANGELOG.md` (when present) and Git commit history for notes prefixed with `BREAKING:`. For unfamiliar major version bumps, take a `data/` backup before upgrading.

## Rolling back

If an upgrade causes problems:

```bash
git log --oneline -20            # find the previous commit
git checkout <previous-sha>
docker compose up -d --build
```

If a database migration has already run, restore `data/data.db` from a backup before bringing the stack up. Mismatched schema and code is the most common cause of post-rollback errors.

## Continuous deployment helper

`deploy/post-receive` is a Git hook that auto-rebuilds when a developer pushes to a bare repo on the host. It is for the project author's own workflow and not something most operators need.
