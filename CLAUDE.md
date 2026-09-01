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

Everything under `addons/` is a **Git submodule** — an independent repository with its own history, branches, and PRs (see `.gitmodules`).

What this does and does not mean for the main repository:

- **Addon file contents are not tracked here.** Editing `addons/knowledge/frontend/Foo.tsx` produces no diff in the main repo. That change must be committed and merged in the addon's own repository.
- **The commit each addon is pinned to _is_ tracked here**, as a gitlink (mode `160000`) in the index. `git status` shows it as a modified path, and `git diff --submodule=short addons/` shows the old and new SHAs.

So a change that spans core and an addon takes two steps, in this order:

1. Commit, PR, and merge inside the addon repository.
2. In the main repository, move the submodule to the merged commit (`git -C addons/<name> checkout main && git -C addons/<name> merge --ff-only origin/main`), then `git add addons/<name>` and commit the pointer bump.

Skipping step 2 leaves the branch pinned to the pre-merge addon commit, so a fresh clone pairs new core code with the old addon and the integration silently fails to load. Verify with `git diff --submodule=short addons/` before opening the core PR.

## Development commands

```bash
# Start
docker compose up -d --build

# Backend tests (run inside Docker; pydantic is not compatible with local Python 3.14)
docker build -f backend/Dockerfile.test -t video-share-test .   # context is the repo root
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
- **Do not edit `docker-compose.yml`.** User-specific configuration (drive mounts, ports) goes in `docker-compose.override.yml`. `configure.py` always generates an empty `drives.json` / `passwords.json` (footgun guard) and writes an unconditional **read-write** `./passwords.json:/app/passwords.json` mount (never `:ro` — the GUI writes it in place). Drive names / passwords / policy are then owned by `/setup` + `/admin/settings`.
- Template: `cp docker-compose.override.yml.example docker-compose.override.yml`, then edit.
- For just changing the port, adding `LITLOFT_PORT=8080` to `.env` is enough.
- Independent-service addons are added the same way through `docker-compose.override.yml`.

## Update and deployment

Update with `git pull && docker compose up -d --build`. If the build fails, the running version is kept.
A `post-receive` hook lives under `deploy/`, but it's an auto-deploy helper for developers (not needed for general use).

## Design documents

### Rules index

`.claude/rules/` holds the invariant conventions and gotchas of this project.
Claude Code loads them automatically; other agents do not. **Read the matching
file before changing code, tests, configuration, or documentation**, and cite
the rule you relied on when a review finding comes from one.

| What you are touching | File to read |
|---|---|
| Anything (drive boundary, file state, trash, playlists, tag editing, file relations, watch history, WS, addons, LLM features) | `.claude/rules/design-decisions.md` |
| `backend/` | `.claude/rules/backend-conventions.md` |
| `frontend/`, `addons/*/frontend/` | `.claude/rules/frontend-conventions.md` |
| `backend/app/routers/internal.py` (adding, removing, or changing an endpoint) | `.claude/rules/internal-api-policy.md` |

`AGENTS.md` is a symlink to this file, so Codex and Claude Code read the same
project instructions. Agent-specific guidance does not belong here: it goes in
`AGENTS.override.md` (Codex reads it ahead of `AGENTS.md`) or under `.claude/`.

### Specs are pre-implementation only, and are not committed

`docs/superpowers/specs/` holds design documents written *before* the work
starts. They quote the code as it stood at design time, so they go stale the
moment the branch merges. `docs/superpowers/` is gitignored on purpose:
specs are local working material, not a repository artifact. Do not `git add`
one, and do not send a reader to a spec to learn how the system behaves today.

A spec is finished when the implementation merges. Nothing is expected to
update it afterwards, so its `Status` line is the author's own bookkeeping and
carries no authority — **verify behaviour against the code, never against a
spec.**

That warning is aimed at readers asking how the system behaves *today*. It does
not apply while the branch is still open: a spec is the design document for the
work under review, and reviewing a change is exactly when to read it. Specs are
named `docs/superpowers/specs/YYYY-MM-DD-topic.md`, so match the topic against
the branch name. `## Checked, no action` lists what the author considered and
deliberately skipped — read it before flagging an omission. Where the code has
moved away from the spec, ask whether the change was intentional rather than
calling it a defect: the design is allowed to evolve during implementation, and
nothing updates the spec when it does.

### Shipped behaviour is documented under `docs/`

Every change that alters what a user, an operator, or an addon developer can
observe must update the matching page under `docs/` **in the same PR** that
ships it:

| What changed | Page to update |
|---|---|
| Something a viewer sees or presses | `docs/user-guide/` |
| A key binding or gesture | `docs/user-guide/keyboard-shortcuts.md` |
| A public HTTP endpoint | `docs/reference/api.md` |
| A WebSocket event | `docs/reference/websocket-events.md` |
| A config file key or env var | `docs/reference/configuration.md`, `docs/reference/env-variables.md` |
| Install / upgrade / first-run flow | `docs/getting-started/` |
| An operator-facing screen or procedure | `docs/admin-guide/` |
| An Internal API endpoint | `docs/ADDON-DEVELOPMENT.md` (also required by `.claude/rules/internal-api-policy.md`) |
| An addon's own surface | `docs/addons/<name>.md` |

Purely internal refactors that change no observable behaviour need no doc
change. If a change is user-visible and no page fits it, add one rather than
leaving it undocumented.
