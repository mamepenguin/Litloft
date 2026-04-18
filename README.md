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
- **Video/audio streaming** — In-browser playback with Range Request support, subtitle/caption display, cast support
- **Image/document viewer** — Preview with prev/next navigation, Markdown rendering (syntax highlighting, task lists, Mermaid)
- **Archive viewer** — Browse ZIP contents and extract individual files (Shift_JIS support)
- **Playlists** — User-created playlists and automatic folder playback
- **File operations** — Upload (incl. folder upload), rename, move, copy, delete, in-browser text file editing, batch operations, clipboard (copy/cut/paste)
- **Trash** — Soft delete with 30-day auto-purge, restore from trash
- **Missing files** — Gracefully track files removed from the filesystem without losing viewer history, tags, or AI data
- **Search, tags, favorites** — Quickly find files within a drive
- **Semantic search + Ask** — Embedding-based search and natural-language Q&A with citations, Whisper transcription, CLIP frame search, AI summaries (including editable long-form Markdown summaries with auto-linked citations for hallucination detection), auto-tag suggestions, transcript refine (intelligence addon)
- **Knowledge notes** — Per-drive Markdown Vaults and web clipping (knowledge addon)
- **URL downloads** — yt-dlp downloads and HvLink external-URL references (downloader addon)
- **Pinned folders** — Shortcuts to frequently used folders
- **Comments/notes** — Per-file comments with viewer profiles
- **Watch history** — Resume playback, recently played, viewing progress tracking
- **Duplicate detection** — Hash-based duplicate file detection with storage stats
- **Access control** — Optional per-drive password protection
- **Per-drive addon policy** — Enable or disable individual addon features per drive via `drives.json`
- **Admin dashboard** — Drive stats, scan status, system health monitoring, addon widgets
- **Dark/light theme** — Toggle between themes
- **i18n** — Japanese / English (next-intl, cookie-based locale)
- **PWA** — Add to home screen for a native app-like experience
- **Addon system** — Extensible with in-process and standalone service addons, drive-scoped or global

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
| `addons` | Per-drive addon policy (see [Per-Drive Addon Policy](docs/DRIVE-POLICY.md)) |

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

#### Windows notes

- Use [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) with the WSL 2 backend enabled.
- Volume mount paths in `docker-compose.yml` use forward slashes even on Windows (e.g. `//c/Users/you/Videos:/app/drives/videos`). Alternatively, use WSL paths (`/mnt/c/Users/you/Videos`).
- Symlinks for in-process addons may require Developer Mode enabled or an elevated prompt. As an alternative, copy the addon directory instead of symlinking.

### 4. Access control (optional)

To password-protect specific drives:

```bash
cp passwords.json.example passwords.json
```

```json
[
  { "password": "family-secret", "groups": ["family"] },
  { "password": "my-master-pw", "groups": ["family", "private"] }
]
```

| Field | Description |
|-------|-------------|
| `password` | Password to unlock drives |
| `groups` | List of group names unlocked by this password |

Add to backend volumes in `docker-compose.yml`:

```yaml
- ./passwords.json:/app/passwords.json:ro
```

Rebuild after changes: `docker compose up -d --build`

#### Unlocking drives

1. Navigate to `http://<ip>:3000/unlock` (no link in the UI)
2. Enter the password
3. Check "Remember this device" to persist for 1 year
4. Click "Unlock" to be redirected to the home page with protected drives visible

A "Lock" button appears in the sidebar while unlocked.

> **Note:** If `passwords.json` is not present, all drives are publicly accessible (default behavior). If a drive has `access_group` set but no matching password exists in `passwords.json`, that drive will be permanently inaccessible.

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

## Updating

```bash
git pull
docker compose up -d --build
```

Containers are rebuilt and restarted. If the build fails, the previous containers remain running.

## License

MIT
