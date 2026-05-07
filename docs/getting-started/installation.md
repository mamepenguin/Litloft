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
git clone https://github.com/mamepenguin/Litloft.git litloft
cd litloft
```

## Choose your drive layout

A *drive* is a top-level content area in Litloft (e.g. *Movies*, *Photos*, *Knowledge*). Each drive maps to a host directory mounted into the backend container. You will declare drives twice:

1. In `drives.json` — the logical name and the **container** path the backend sees.
2. In `docker-compose.override.yml` — the **host** path mapped to that container path.

## Create a `docker-compose.override.yml`

`docker-compose.yml` is the base file and you should not edit it. User-specific configuration lives in an override file:

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
```

Open it and adjust the `services.backend.volumes` block. The default mounts a single drive named `default` from `./videos` (a folder under the repo) to `/app/drives/default`. Add as many lines as you need:

```yaml
services:
  backend:
    volumes:
      - ./videos:/app/drives/default
      - /mnt/nas/movies:/app/drives/movies
      - /mnt/nas/photos:/app/drives/photos
```

The container path **must** match the `path` field in the matching `drives.json` entry (see [first-run setup](first-run-setup.md)).

## (Optional) Set the port

The frontend listens on `3000` by default. To change it, create a `.env` file:

```dotenv
LITLOFT_PORT=8080
```

## (Optional) Enable password protection

If you want password-gated drives, you will create a `passwords.json` later through the setup wizard. To make it available to the container, also uncomment this volume in `docker-compose.override.yml`:

```yaml
- ./passwords.json:/app/passwords.json:ro
```

## (Optional) Provide secrets

Some addons and internal endpoints use shared secrets. Copy the example env file and fill it in:

```bash
cp .env.example .env
```

Generate strong secrets with `openssl rand -hex 32`. See [environment variables](../reference/env-variables.md) for what each value does.

## Build and start

```bash
docker compose up -d --build
```

The first build takes several minutes (frontend npm install, backend pip install, ffmpeg, etc.). Subsequent restarts reuse cached layers.

## Verify

Wait a few seconds for the backend healthcheck to flip green, then open the frontend:

```
http://localhost:3000     # or http://<your-LAN-IP>:3000
```

You will be redirected to `/setup` — proceed to [first-run setup](first-run-setup.md).

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
- **Healthcheck never goes green.** Check `docker compose logs backend`; usually it is a missing path declared in `drives.json` that does not exist inside the container, or a mistyped volume in the override file.
- **Frontend says `502 Bad Gateway`.** The backend is not yet healthy. Wait, then refresh.

## Updating

See [upgrading](upgrading.md).

## Uninstall

`docker compose down` stops and removes the containers. Your data — `data/`, `drives.json`, `passwords.json` — is left on disk so you can reinstall later. To wipe everything: `docker compose down -v && rm -rf data drives.json passwords.json`.
