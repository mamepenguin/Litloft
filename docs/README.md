# Litloft Documentation

Litloft is a self-hosted file and media library for a trusted home network. It runs on Docker and is used from a browser, or installed as a web app. With an LLM configured, it can also suggest tags, write summaries and answer questions about your files.

> **LAN only.** Litloft is designed for trusted networks. To reach it from outside, use a VPN such as Tailscale; do not expose it to the public internet.

---

## Documentation map

### New to Litloft?

Start here.

- [Installation](getting-started/installation.md) — prerequisites, `configure.py`, first start, HTTPS for iPhone and iPad.
- [First-run setup](getting-started/first-run-setup.md) — the `/setup` wizard: drive names, access control, addons per drive.
- [Upgrading](getting-started/upgrading.md) — pull and rebuild, database migrations, rolling back.

### Using Litloft (User Guide)

For viewers: browsing, players, search, organising.

- [Overview of features](user-guide/overview.md)
- [Drives and access control](user-guide/drives-and-access.md)
- [Browsing files](user-guide/file-browsing.md)
- [Quick Note](user-guide/quick-note.md) — capture a Markdown note from any screen.
- [Notes](user-guide/notes.md) — find a drive's Markdown and text files (Knowledge addon).
- [Viewers and players](user-guide/viewers-and-players.md) — video, audio, image, Markdown, PDF, Office, ZIP.
- [Search](user-guide/search.md) — keyword, tag filter, semantic, scene search.
- [Upload and file operations](user-guide/upload-and-fileops.md)
- [Collections, favorites and likes](user-guide/playlists-favorites.md)
- [Tags and file relations](user-guide/tags-and-relations.md)
- [Trash and missing files](user-guide/trash-and-missing.md)
- [Comments and watch history](user-guide/comments-history.md)
- [Profile and preferences](user-guide/profile-preferences.md)
- [Keyboard shortcuts and gestures](user-guide/keyboard-shortcuts.md)
- [iOS app](user-guide/ios-app.md) — build and connect the app; background audio.

### Administration (Admin Guide)

For the person running the server.

- [Admin dashboard](admin-guide/admin-dashboard.md)
- [Settings](admin-guide/settings-gui.md) — drives, passwords, addon policy.
- [docker-compose customisation](admin-guide/docker-compose.md) — mounts, port, addon services.
- [Monitoring and troubleshooting](admin-guide/monitoring.md) — health check, logs, common issues.
- [Backup and restore](admin-guide/backup-restore.md)

### Addons

Optional capability modules. Each addon is a separate Git repository under `addons/`.

- [Addon overview](addons/overview.md) — scopes, policy, in-process vs independent service.
- [intelligence](addons/intelligence.md) — AI search, Ask (RAG), summaries, transcripts, vision.
- [knowledge](addons/knowledge.md) — Vaults, web clips, frontmatter notes.
- [cloud-sync](addons/cloud-sync.md) — scheduled rclone backups.
- [media_import](addons/media-import.md) — URL → `.loft` reference files (YouTube/Vimeo).

### Integrations

Ways to reach a Litloft library from outside the browser.

- [MCP server](../mcp-server/README.md) — browse and edit a library from an MCP
  client such as Claude Desktop. A thin wrapper over the same public `/api/*`
  endpoints the web frontend uses; it adds no backend endpoints and no bypass of
  drive access control.

### Reference

Lookup material.

- [Configuration reference](reference/configuration.md) — every setting in one place.
- [Environment variables](reference/env-variables.md)
- [HTTP API](reference/api.md)
- [WebSocket events](reference/websocket-events.md)
- [File states](reference/file-states.md) — Active / Missing / Trash semantics.

### Developer guide

For contributors and addon authors.

- [Architecture](developer-guide/architecture.md)
- [Backend development](developer-guide/backend-dev.md)
- [Frontend development](developer-guide/frontend-dev.md)
- [Addon development](developer-guide/addon-dev.md)
- [Testing](developer-guide/testing.md)
- [Contributing](developer-guide/contributing.md)
- [Known issues](developer-guide/known-issues.md)
- [Review findings](developer-guide/reviews/)

---

## At a glance

- **Stack** — FastAPI (Python 3.12) + SQLite, Next.js 16 (App Router, TypeScript) + Tailwind v4, Docker Compose, ffmpeg.
- **Default URL** — `http://localhost:3000` (override with `LITLOFT_PORT`).
- **Storage** — SQLite (`data/data.db`), thumbnails (`data/thumbnails/`), uploads (`data/uploads/`), addon DBs under `data/addons/`.
- **Setup split** — `configure.py` wires the containers (mounts, port, addon services). Drive names, passwords and addon policy are set in the `/setup` wizard, and later at `/admin/settings`.
- **Configuration files** — `drives.json` (drives and addon policy), `passwords.json` (passwords; empty means all public), `.env` (secrets), `docker-compose.override.yml` (mounts, port, addon services), `addons/intelligence/search-config.yml` (intelligence settings).
- **Languages** — English and Japanese.

## Image assets

Diagrams and screenshots referenced in these docs are tracked in [`IMAGES-NEEDED.md`](IMAGES-NEEDED.md). Contributions welcome.
