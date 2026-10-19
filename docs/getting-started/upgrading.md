# Upgrading

Back up `data/` first (see [below](#back-up-first)), then pull the new code and rebuild:

```bash
git pull --recurse-submodules
docker compose up -d --build
```

If the build fails, the running version keeps running.

## What survives an upgrade

These are on the host and the build does not touch them:

- `data/`: database, thumbnails, uploads, addon databases, the setup marker and the token signing key.
- `drives.json`, `passwords.json`.
- `docker-compose.override.yml`.
- `.env`.
- Addon config files such as `addons/intelligence/search-config.yml`.

The application code, the base `docker-compose.yml` and the container images are replaced.

## The `/setup` wizard does not come back

An existing install is not sent to `/setup` after an upgrade. On startup, if `drives.json` already lists drives and `data/setup_completed` is missing, the backend creates `data/setup_completed`. Your drives, passwords and addon settings are not changed.

## Back up first

The backend migrates the database when it starts. There is no separate migrate command, and migrations only go forward: an older version may not run against a migrated database.

```bash
docker compose down
cp -a data data.bak.$(date +%Y%m%d)
```

See [backup and restore](../admin-guide/backup-restore.md) for more.

## Addons

Each addon under `addons/` is a Git submodule pinned to the commit the core expects. `git pull --recurse-submodules` moves them along with the core.

Addon config files are not overwritten, but an addon may add new settings. After an upgrade, compare your `addons/intelligence/search-config.yml` with `search-config.yml.example` next to it.

## Pending changes banner

If the admin pages show **Pending changes — restart required** before the upgrade, the rebuild restarts the backend and the banner clears.

## Breaking changes

Litloft is a personal project and breaking changes can happen. Take a backup of `data/` before every upgrade.

## Rolling back

```bash
git log --oneline -20            # find the previous commit
git checkout <previous-sha>
git submodule update --init --recursive
docker compose down
```

If the database was migrated by the newer version, restore `data/` from the backup you took, then start:

```bash
docker compose up -d --build
```

Old code against a migrated database is the most common cause of errors after a rollback.
