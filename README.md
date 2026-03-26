# HomeVault

A self-hosted file manager and media streaming app for your home LAN. Runs on Docker, accessed via browser (PWA).

> **Note:** This project is developed for personal use. Issues and PRs are welcome, but response and support are not guaranteed.

> **Warning:** HomeVault is designed for trusted home networks only. It does not provide the level of security required for internet-facing deployments. Do not expose it to the public internet without adding your own authentication and encryption layer (e.g. reverse proxy with HTTPS and VPN).

> Japanese documentation: [docs/README.ja.md](docs/README.ja.md)

<!-- TODO: Screenshot (drive list or folder browser main screen) -->
![HomeVault main screen](docs/screenshots/main.png)

## Features

- **Multi-drive** — Separate content areas by purpose (family videos, music, photos, etc.)
- **Folder browser** — Navigate nested folder hierarchies like a file manager
- **Video/audio streaming** — In-browser playback with Range Request support
- **Image/document viewer** — Preview with prev/next navigation
- **Playlists** — User-created playlists and automatic folder playback
- **File operations** — Upload, rename, move, delete, drag-and-drop organization
- **Search, tags, favorites** — Quickly find files within a drive
- **Pinned folders** — Shortcuts to frequently used folders
- **Access control** — Optional per-drive password protection
- **Dark/light theme** — Toggle between themes
- **PWA** — Add to home screen for a native app-like experience

<!-- TODO: Screenshots (feature gallery, 2-3 images side by side) -->
<p align="center">
  <img src="docs/screenshots/folder-browser.png" width="32%" alt="Folder browser" />
  <img src="docs/screenshots/video-player.png" width="32%" alt="Video player" />
  <img src="docs/screenshots/playlist.png" width="32%" alt="Playlist" />
</p>

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python 3.12) + SQLite (SQLAlchemy) + ffmpeg |
| Frontend | Next.js 16 (App Router, TypeScript, Tailwind CSS v4) |
| Infrastructure | Docker Compose (2 containers) |

```
Browser → :3000 (Next.js) → rewrites /api/* → :8000 (FastAPI, internal only)
```

## Getting Started

### 1. Configure drives

Create `drives.json` from the example:

```bash
cp drives.json.example drives.json
```

```json
[
  { "name": "Family Videos", "path": "/app/drives/family" },
  { "name": "TV Shows", "path": "/app/drives/tv", "readonly": true },
  { "name": "Private", "path": "/app/drives/private", "access_group": "private" }
]
```

| Property | Description |
|----------|-------------|
| `name` | Display name in the UI |
| `path` | Container path (mounted via `docker-compose.yml` volumes) |
| `readonly` | Set `true` to disable file operations (default: writable) |
| `access_group` | Access control group name (omit for public drives) |

### 2. Mount drives in docker-compose.yml

```yaml
services:
  backend:
    volumes:
      - ./drives.json:/app/drives.json:ro
      - /path/to/family-videos:/app/drives/family:ro
      - /path/to/tv-shows:/app/drives/tv:ro
      - /path/to/private:/app/drives/private
      - ./data:/app/data
```

### 3. Start

```bash
docker compose up -d --build
```

Open `http://localhost:3000` in your browser. From other devices on your LAN, use `http://<host-ip>:3000`.

### 4. Access control (optional)

To password-protect specific drives:

```bash
cp passwords.json.example passwords.json
```

```json
[
  { "password": "your-password", "groups": ["private"] }
]
```

Add to backend volumes in `docker-compose.yml`:

```yaml
- ./passwords.json:/app/passwords.json:ro
```

If `passwords.json` is not present, all drives are publicly accessible (default behavior).

## Development

```bash
# Start
docker compose up -d --build

# Backend tests (run inside Docker)
docker build -f backend/Dockerfile.test -t homevault-test backend/
docker run --rm homevault-test

# Frontend tests
cd frontend && pnpm test

# Logs
docker compose logs -f backend
```

## Deployment (Mac mini)

Supports automatic deployment via `git push`.

### Initial setup (on Mac mini)

```bash
# Create bare repository
git init --bare ~/homevault.git

# Install post-receive hook
cp deploy/post-receive ~/homevault.git/hooks/post-receive
chmod +x ~/homevault.git/hooks/post-receive
```

> Edit `DEPLOY_DIR` and `GIT_DIR` in `deploy/post-receive` to match your environment.

### Deploy from dev machine

```bash
# Add remote (once)
git remote add deploy libre@<mac-mini-ip>:homevault.git

# Deploy via push
git push deploy main
```

Containers are replaced only when `docker compose build` succeeds. On failure, the current version is preserved.

## License

MIT
