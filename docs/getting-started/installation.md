# Installation

Litloft runs as a small Docker Compose stack: a FastAPI backend, a Next.js frontend, and any addon containers you choose to enable. Everything is driven from the project directory.

## Prerequisites

- **Docker** (with Compose v2) — Linux, macOS, or Windows with WSL2.
- **Git** — to clone the repo and pull updates.
- **Free disk space** — the SQLite DB, thumbnails, and (if you enable AI) ML models can grow into the gigabytes. Plan for ~5 GB minimum.
- **A LAN hostname or IP** — Litloft is intended for use over a trusted home network.

You do **not** need Python, Node.js, ffmpeg, or any AI runtimes installed locally; everything runs inside containers.

## Get the code

```bash
git clone --recurse-submodules https://github.com/mamepenguin/Litloft
cd Litloft
```

The four shipped addons (`intelligence`, `knowledge`, `cloud-sync`, `media_import`) are tracked as Git submodules under `addons/`. The `--recurse-submodules` flag checks them out at the same time. If you forget it, `configure.py` will detect the empty submodule directories and offer to run `git submodule update --init --recursive` for you.

## How setup is split

Setup has two halves:

- **`configure.py`** wires the container so it can start: which host directories to mount, the port, and which addons to enable. This is the part Docker forces to be on disk before the stack boots.
- **The `/setup` wizard** (in the browser, after the stack is up) is where you do the actual configuration: naming each drive, setting passwords, and choosing AI feature behaviour.

A *drive* is a top-level content area in Litloft (e.g. *Movies*, *Photos*, *Knowledge*). Each drive is a host directory mounted into the backend container; you give it a real name and optional password protection in the wizard, not on the command line.

## Run `configure.py`

```bash
python3 configure.py   # macOS / Linux
py -3 configure.py     # Windows (Python Launcher)
```

It asks, with sensible defaults:

- One **host path** and a **slug** (a short path identifier, not a display name) per drive.
- The **port** (default `3000`).
- Whether to enable the **intelligence** and/or **knowledge** addons (yes/no only — the AI features themselves are configured later in the browser, all off by default).

It then writes `docker-compose.override.yml` (mounts, addon services, env wiring), an empty `drives.json` and `passwords.json` (`[]`), `.env` (only if needed for the port or addon secrets), `event-hooks.json` (if an addon defines hooks), and — when intelligence is enabled — a verbatim copy of `search-config.yml.example`. It does **not** ask for drive names, passwords, access groups, or AI feature modes; those belong to the `/setup` wizard.

`configure.py` only prompts for the two independent-service addons (`intelligence`, `knowledge`); they each run as their own container and need their own `services:` block. The in-process addons (`cloud-sync`, `media_import`) are bundled into the backend image at build time, so they auto-load as soon as the submodule is present and the image is rebuilt — nothing to configure here. See [addon overview](../addons/overview.md#enabling-and-disabling-addons) for the policy-per-drive editor.

You do not need to copy `docker-compose.override.yml.example` by hand — `configure.py` generates the override file. If you would rather hand-write it, see [docker-compose customisation](../admin-guide/docker-compose.md).

> The empty `drives.json` and `passwords.json` are deliberate. The single-file bind-mounts need a real file on the host; an absent file makes Docker create a directory there that the backend cannot use. The backend seeds drive entries from the mounted directories on first startup, and the wizard owns logical configuration from then on.

## (Optional) Provide AI secrets

If you enabled the intelligence addon and want to use the LLM-backed features, set `LLM_API_KEY` (and any provider keys) in `.env`, then re-run `python3 configure.py` so the wiring picks them up. AI features stay off by default until you enable them in the browser. See [environment variables](../reference/env-variables.md) for what each value does.

## Build and start

`configure.py` offers to start the containers automatically at the end of the setup prompts (defaults to yes). If you skipped that prompt or need to restart later:

```bash
docker compose up -d --build
```

The first build takes several minutes (frontend npm install, backend pip install, ffmpeg, etc.). Subsequent restarts reuse cached layers.

## Verify

Wait a few seconds for the backend healthcheck to flip green, then open the frontend:

```
http://localhost:3000     # or http://<your-LAN-IP>:3000
```

You will be redirected to `/setup`, where you name the detected drives and set passwords and AI features — proceed to [first-run setup](first-run-setup.md).

To watch live logs while you work:

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

## Network model

```
Browser
  │
  ▼
:3000 (Next.js custom server)         <─ public entry point
  ├─ HTTP /api/*  ──rewrite──▶ backend:8000
  └─ WS   /api/ws ──proxy────▶ backend:8000/api/ws
```

The backend is `expose:`-only and not reachable from outside the Docker network. All traffic enters through the frontend container. This is intentional — see the [architecture guide](../developer-guide/architecture.md).

## Common installation issues

- **Port already in use.** Set `LITLOFT_PORT` in `.env` or change the `frontend.ports` mapping in your override file.
- **Permission denied on a mounted drive.** The backend runs as the container's default user. Ensure the host directory is readable; for write-heavy features, also writable.
- **Healthcheck never goes green.** Check `docker compose logs backend`; usually it is a mistyped volume in `docker-compose.override.yml` so a mounted directory does not actually exist inside the container.
- **No drives in the wizard.** The backend seeds drives from the directories mounted under `/app/drives/`. If `/setup` shows none, your override file has no drive mounts (or they failed to mount); fix the volumes and run `docker compose up -d --build` again.
- **Frontend says `502 Bad Gateway`.** The backend is not yet healthy. Wait, then refresh.

## Updating

See [upgrading](upgrading.md).

## Uninstall

`docker compose down` stops and removes the containers. Your data — `data/`, `drives.json`, `passwords.json` — is left on disk so you can reinstall later. To wipe configuration while keeping the stack runnable: `docker compose down -v && rm -rf data && echo '[]' > drives.json && echo '[]' > passwords.json`. If you want the directory truly empty, also remove `drives.json` and `passwords.json`, but re-run `python3 configure.py` before starting again (the single-file bind-mounts need those files to exist, otherwise Docker creates unusable directories in their place).
