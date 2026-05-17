# Litloft

A file management and video streaming web app for the home LAN. Runs on Docker.

## Architecture

```
Browser → :3000 (Next.js custom server)
  ├─ HTTP  /api/*  → rewrites → :8000 (FastAPI, Docker-internal only)
  └─ WS    /api/ws → proxy   → :8000 (WebSocket, http-proxy)
```

- **Backend**: FastAPI (Python 3.12) + SQLite (SQLAlchemy) + ffmpeg
- **Frontend**: Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- **Infrastructure**: Docker Compose (2 containers; backend is not exposed externally)
- **Authentication**: optional password protection (per-drive access control via `passwords.json`)
- **Settings GUI**: first launch shows the `/setup` first-run wizard; afterward, drives, passwords, and addon policy are edited at `/admin/settings` (master viewer = a viewer who unlocked with a password that holds all groups; when `passwords.json` is absent, anyone is an admin). The `data/setup_completed` sentinel decides whether to show the wizard, and the `data/restart_pending` flag drives the "pending changes" banner under `/admin`.

## Directory layout

```
backend/
  app/
    main.py          # entry point, startup scan, setup_completed sentinel migration, restart_pending flag clear
    config.py        # drives.json reader, DATA_DIR, sentinel/flag path helpers
    database.py      # SQLAlchemy, migrations
    models.py        # ORM models
    schemas.py       # Pydantic schemas
    auth.py          # JWT auth, viewer_id management, is_admin_viewer helper
    routers/         # API endpoints (files, drives, playlists, auth, uploads, progress, ws, admin, admin_config, comments, addon_proxy, internal)
    services/        # business logic (scanner, fileops, thumbnail, upload, heic, subtitle, preview, hash, ws, addon_registry, config_writer)
  tests/             # pytest (run inside Docker)

frontend/
  src/
    app/             # Next.js App Router pages
      admin/         # admin dashboard; layout.tsx applies the admin gate + RestartBanner
        settings/    # settings editor UI (Drives / Passwords / AddonPolicy sections)
      setup/         # first-run wizard (6 steps)
    components/      # React components (includes RestartBanner, SetupRedirector)
    hooks/           # custom hooks
    lib/             # utilities (api.ts, format.ts, adminConfig.ts, etc.)
    i18n/            # next-intl configuration
    messages/        # translation files (ja.json, en.json)
    types/           # TypeScript type definitions
  server.js          # Custom Server (WebSocket proxy)

deploy/
  post-receive       # git push auto-deploy hook (for developers; not needed for general use)

docker-compose.yml                    # base configuration. Do not edit.
docker-compose.override.yml.example  # user-config template (git-tracked)
docker-compose.override.yml          # user config (not tracked by git)
drives.json          # drive configuration (not tracked by git)
passwords.json       # access-control configuration (not tracked by git)
data/                # SQLite DB + thumbnails + cache + setup_completed sentinel + restart_pending flag (not tracked by git)
```

## Git
The addons within the addons directory are independent Git repositories. Therefore, they are not tracked by the main repository. When making changes, you must also commit them within the respective addon.

## Development commands

```bash
# Start
docker compose up -d --build

# Backend tests (run inside Docker; pydantic is not compatible with local Python 3.14)
docker build -f backend/Dockerfile.test -t video-share-test backend/
docker run --rm video-share-test

# Frontend tests
cd frontend && pnpm test

# Logs
docker compose logs -f backend
```

## Docker
- The backend is `expose`-only (not reachable from outside); the frontend is the only entry point.
- Backend healthcheck → frontend uses `depends_on: condition: service_healthy`.
- `data/` persists the SQLite DB and thumbnail images.
- **Do not edit `docker-compose.yml`.** User-specific configuration (drive mounts, passwords.json, ports) goes in `docker-compose.override.yml`.
- Template: `cp docker-compose.override.yml.example docker-compose.override.yml`, then edit.
- For just changing the port, adding `LITLOFT_PORT=8080` to `.env` is enough.
- Independent-service addons are added the same way through `docker-compose.override.yml`.

## Update and deployment

Update with `git pull && docker compose up -d --build`. If the build fails, the running version is kept.
A `post-receive` hook lives under `deploy/`, but it's an auto-deploy helper for developers (not needed for general use).

## Design documents

Detailed design specs live under `docs/superpowers/specs/`.
Project development rules live under `.claude/rules/`. Codex must read the relevant rule files there before making code, test, configuration, or documentation changes.
