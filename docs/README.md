# Litloft Documentation

Welcome to the Litloft docs. Litloft is a self-hosted file and media app for trusted home networks. It can optionally use an LLM for tag suggestions, summaries, and natural-language Q&A over your files. Runs on Docker and is accessed through a browser (PWA).

> **LAN only.** Litloft is designed for trusted networks. Do not expose it to the public internet without an HTTPS reverse proxy plus a VPN, or per-drive password protection at minimum.

---

## Documentation map

### New to Litloft?

Start here.

- [Installation](getting-started/installation.md) — Docker setup, prerequisites, first boot.
- [First-run setup](getting-started/first-run-setup.md) — Walk through the `/setup` wizard step by step.
- [Upgrading](getting-started/upgrading.md) — `git pull` flow, breaking changes, data migration.

### Using Litloft (User Guide)

For everyday users: viewers, players, search, organisation.

- [Overview of features](user-guide/overview.md)
- [Drives and access control](user-guide/drives-and-access.md)
- [Browsing files](user-guide/file-browsing.md)
- [Viewers and players](user-guide/viewers-and-players.md) — video, audio, image, Markdown, PDF, Office, ZIP.
- [Search](user-guide/search.md) — keyword, tag filter, semantic, scene search.
- [Upload and file operations](user-guide/upload-and-fileops.md)
- [Playlists and favourites](user-guide/playlists-favorites.md)
- [Tags and file relations](user-guide/tags-and-relations.md)
- [Trash and missing files](user-guide/trash-and-missing.md)
- [Comments and watch history](user-guide/comments-history.md)
- [Profile and preferences](user-guide/profile-preferences.md)
- [Keyboard shortcuts and gestures](user-guide/keyboard-shortcuts.md)

### Administration (Admin Guide)

For operators running Litloft for one or many users.

- [Admin dashboard](admin-guide/admin-dashboard.md)
- [Settings GUI](admin-guide/settings-gui.md) — drives, passwords, addon policy.
- [docker-compose customisation](admin-guide/docker-compose.md)
- [Backup and restore](admin-guide/backup-restore.md)

### Addons

Optional capability modules. Each addon is a separate Git repository under `addons/`.

- [Addon overview](addons/overview.md) — scopes, policy, in-process vs independent service.
- [intelligence](addons/intelligence.md) — AI search, Ask (RAG), summaries, transcripts, vision.
- [knowledge](addons/knowledge.md) — Vaults, web clips, frontmatter notes.
- [cloud-sync](addons/cloud-sync.md) — scheduled rclone backups.
- [media_import](addons/media-import.md) — URL → `.loft` reference files (YouTube/Vimeo).

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

---

## At a glance

- **Stack** — FastAPI (Python 3.12) + SQLite, Next.js 16 (App Router, TypeScript) + Tailwind v4, Docker Compose, ffmpeg.
- **Default URL** — `http://localhost:3000` (override with `LITLOFT_PORT`).
- **Storage** — SQLite (`data/videos.db`), thumbnails (`data/thumbnails/`), uploads (`data/uploads/`), addon DBs under `data/addons/`.
- **Configuration files** — `drives.json` (drives + per-drive addon policy), `passwords.json` (optional access groups), `.env` (secrets), `docker-compose.override.yml` (mounts, ports, addon services), `addons/intelligence/search-config.yml` (AI features).
- **Languages** — English, Japanese (cookie-driven, no URL prefix).
- **Browser support** — Modern Chromium, Firefox, Safari (latest two majors).

## Image assets

Diagrams and screenshots referenced in these docs are tracked in [`IMAGES-NEEDED.md`](IMAGES-NEEDED.md). Contributions welcome.

## Legacy documentation

Older single-file docs (`FEATURES.md`, `ADDON-DEVELOPMENT.md`, `INTELLIGENCE.md`, etc.) have been moved under [`legacy/`](legacy/) and remain readable for cross-reference, but the structured docs in this directory are the canonical source going forward.
