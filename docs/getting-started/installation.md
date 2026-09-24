# Installation

Litloft runs as a Docker Compose stack: a backend, a frontend, and any addon containers you enable.

## Prerequisites

- Docker with Compose v2 (Linux, macOS, or Windows with WSL2).
- Git, to clone the repository and pull updates.
- Python 3, to run `configure.py`. Nothing else is installed on the host. ffmpeg, Node.js and the AI runtimes run inside the containers.
- At least 5 GB of disk space for the database, thumbnails and, if you enable AI, the models.

## Get the code

```bash
git clone --recurse-submodules https://github.com/mamepenguin/Litloft
cd Litloft
```

The addons (`intelligence`, `knowledge`, `cloud-sync`, `media_import`) are Git submodules under `addons/`. If you cloned without `--recurse-submodules`, `configure.py` runs `git submodule update --init --recursive` for you.

## How setup is split

- `configure.py` writes what Docker needs before the stack starts: which host directories to mount, the port, and which addon services to run.
- The `/setup` wizard, in the browser, is where you name the drives, set passwords and choose which addons each drive uses.

A drive is a host directory mounted into the backend. It gets its name and optional password in the wizard, not on the command line.

## Run `configure.py`

```bash
python3 configure.py   # macOS / Linux
py -3 configure.py     # Windows
```

Press Enter to accept the default shown in brackets. It asks for:

1. **How many drives**, then a **host path** (absolute) and a **slug** for each. The slug is a path identifier, not the display name.
2. The **port** (default `3000`).
3. Whether to enable the **intelligence** addon (default yes on a fresh install), and an optional `LLM_API_KEY`. Leave the key blank if you will use a local model such as Ollama, or set it later in `.env`.
4. Whether to enable the **knowledge** addon (default no).

`cloud-sync` and `media_import` are not asked about. They are part of the backend whenever their directory is checked out, and you choose which drives use them in the wizard. See the [addon overview](../addons/overview.md#enabling-and-disabling-addons).

It then writes:

- `docker-compose.override.yml`: drive mounts, port, addon services.
- `drives.json` and `passwords.json`, both empty (`[]`).
- `.env`: the setup token, plus the port, addon secrets and `LLM_API_KEY` when they apply.
- `event-hooks.json`, when an addon service is enabled.
- `addons/intelligence/search-config.yml`, a copy of the example, when intelligence is enabled.

It asks before overwriting any of these files that already exist.

Keep `drives.json` and `passwords.json` as files, even when empty. If either is missing, Docker creates a directory in its place and the backend cannot use it.

To write the override file by hand instead, see [docker-compose customisation](../admin-guide/docker-compose.md).

## Build and start

At the end, `configure.py` asks **Start Litloft now?** (default yes). To start it yourself:

```bash
docker compose up -d --build
```

The first build takes several minutes. Later builds reuse the cache.

## Open the wizard

`configure.py` prints the address to open, for example:

```
→  http://localhost:3000/setup?token=6f2a…
```

The token in the address lets you through the wizard's first step. From another device on the LAN, use `http://<host-ip>:3000/setup?token=…`. Continue with [first-run setup](first-run-setup.md).

To follow the logs:

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

## Adding API keys later

Provider keys (`LLM_API_KEY`, `DEEPGRAM_API_KEY`, `OPENAI_API_KEY` and so on) go in `.env`. After editing it, run `docker compose up -d` so the containers pick up the new values. AI features stay off until you turn them on in the browser. See [environment variables](../reference/env-variables.md).

## Network model

```
Browser
  │
  ▼
:3000 (frontend)                       <─ the only entry point
  ├─ HTTP /api/*  ──────▶ backend:8000
  └─ WS   /api/ws ──────▶ backend:8000
```

The backend is not reachable from outside the Docker network. All traffic goes through the frontend.

## Serving over HTTPS for iPhone and iPad

Open Litloft over `https://` if anyone uses it from Safari on an iPhone or iPad, including from the home screen.

Newer Safari (seen on iPadOS 27) runs a page loaded over plain `http://` with its JavaScript compiler switched off. Everything still works, but roughly ten times slower. PDFs make it easy to notice: turning a page can take several seconds. Only HTTPS fixes it.

The frontend serves plain HTTP, so HTTPS has to come from something in front of it. If your devices already reach the server over [Tailscale](https://tailscale.com), `tailscale serve` provides and renews the certificate. First enable MagicDNS and HTTPS certificates in the Tailscale admin console. Then run this once on the server:

```bash
tailscale serve --bg --https=443 http://localhost:3000   # the port Litloft listens on
```

Litloft is then at `https://<machine-name>.<tailnet>.ts.net`. `--bg` keeps the setting across reboots. `tailscale serve status` shows it. On macOS the command is inside the app bundle, at `/Applications/Tailscale.app/Contents/MacOS/Tailscale`.

A home-screen app belongs to the address it was added from. After switching to HTTPS, open the new address in Safari and add it to the home screen again.

## Common installation issues

- **Port already in use.** Set `LITLOFT_PORT` in `.env`, or re-run `configure.py` with another port.
- **Permission denied on a drive.** The backend must be able to read the host directory, and to write to it for uploads and file operations.
- **Backend never becomes healthy.** Run `docker compose logs backend`. The usual cause is a mistyped path in `docker-compose.override.yml`.
- **No drives in the wizard.** No directory is mounted under `/app/drives/`. Fix the mounts in `docker-compose.override.yml` (or re-run `configure.py`), run `docker compose up -d --build`, and reload `/setup`.
- **`502 Bad Gateway`.** The backend is not ready yet. Wait and reload.

## Updating

See [upgrading](upgrading.md).

## Uninstall

`docker compose down` stops and removes the containers. `data/`, `drives.json` and `passwords.json` stay on disk, so you can start again later.

To start over with a clean configuration, keep the two JSON files but empty them:

```bash
docker compose down
rm -rf data
echo '[]' > drives.json
echo '[]' > passwords.json
```
