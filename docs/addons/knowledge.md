# knowledge addon

The `knowledge` addon turns Litloft into a personal notes vault and web-clip archive. It is Obsidian-flavoured: notes are plain `.md` files with YAML frontmatter, organised under a *Vault* root within a drive.

## What it provides

- **Vaults** — dedicated subtrees of a drive that hold Markdown notes. Multiple Vaults per drive; one is *active* at a time.
- **Web clipping** — paste a URL or a piece of HTML; the addon fetches, sanitises, converts to Markdown, and saves.
- **Frontmatter sync** — when an external editor (Obsidian, vim, etc.) edits a note, the scanner reconciles `tags`, `source_file_ids`, and other recognised keys with the addon's database.
- **File active summary** — a sidebar widget showing related notes / clips for the currently open core file.
- **Vault-scoped search** — keyword search over note bodies.
- **Distill** (early preview) — summarise notes through the configured LLM.

> **Image needed:** screenshot of a Vault note alongside its file detail page with the Active Summary widget.

## Installation

The addon runs as an independent service on port 8200. The recommended path is to answer **yes** when `configure.py` prompts to enable the knowledge addon — it writes the service block into `docker-compose.override.yml` and generates `KNOWLEDGE_WEBHOOK_SECRET` / `CORE_INTERNAL_SECRET` into `.env` for you. Then:

```bash
docker compose up -d --build
```

For a manual install (no `configure.py`), add a service block like this to `docker-compose.override.yml` and set the two secrets in `.env` (`openssl rand -hex 32`):

```yaml
services:
  knowledge:
    build: ./addons/knowledge
    expose:
      - "8200"
    environment:
      - HOMEVAULT_INTERNAL_URL=http://backend:8000
      - KNOWLEDGE_WEBHOOK_SECRET=${KNOWLEDGE_WEBHOOK_SECRET:-}
      - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET:-}
      - NOTE_SCANNER_INTERVAL_SECONDS=3600
    volumes:
      - ./data/addons/knowledge:/knowledge-data
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
```

The knowledge addon does not bind-mount drive directories — it reaches the Vault files indirectly, by reading file content through the [Internal API](../developer-guide/addon-dev.md#internal-api-policy) on the Docker network.

## Configuration

| Env var | Default | What it does |
|---|---|---|
| `KNOWLEDGE_DATA_DIR` | `/knowledge-data` | Directory for the addon's SQLite DB and intermediate state. |
| `HOMEVAULT_INTERNAL_URL` | `http://backend:8000` | Core API endpoint on the Docker network. |
| `KNOWLEDGE_USER_AGENT` | (browser-like) | Override for the web-clip fetcher. |
| `KNOWLEDGE_WEBHOOK_SECRET` | *required* | HMAC for lifecycle webhooks (`files.missing` etc.). |
| `CORE_INTERNAL_SECRET` | *required* | Shared secret for `/api/internal/files/<id>/content` calls. |
| `NOTE_SCANNER_INTERVAL_SECONDS` | `3600` | Cadence for the frontmatter reconciler. |

## Data model

The addon manages two on-disk surfaces:

- **Vault notes** — `.md` files in a directory tree under one of the core's drives. The user owns the layout.
- **Addon SQLite** at `${KNOWLEDGE_DATA_DIR}/knowledge.db` — Vault registry, `note_origins` (the canonical store mapping note → source clip), `note_origin_sources`.

The Vault root is registered in the addon's DB with a path inside the drive.

### Frontmatter convention

A typical note looks like:

```markdown
---
title: "Why we picked SQLite"
url: https://example.com/sqlite-vs-postgres
origin: web-clip
created: 2026-04-12T08:14:00Z
tags: [database, decisions]
source_file_ids: [file_abc123def456]
---

# Why we picked SQLite

…body…
```

- `title` — display title; falls back to the H1 if absent.
- `url`, `origin` — set by the web-clip pipeline.
- `created` — ISO timestamp.
- `tags` — list; the core projects them to `File.tags` when the file is in core's tag mirror as well.
- `source_file_ids` — list of `file_id`s this note references. The web-clip pipeline can attach these so a clip stays associated with the originating media file.

The frontmatter parser is implemented twice — in core (`backend/app/services/frontmatter.py`) and in this addon (`addons/knowledge/app/services/frontmatter.py`) — because they live in different containers and cannot share code. Drift is caught in PR review.

## Web clipping

`POST /api/addons/knowledge/clip` accepts:

- `{ "url": "https://..." }` — fetch via httpx, run through readability-lxml + trafilatura for content extraction, sanitise with bleach, convert to Markdown via markdownify.
- `{ "html": "..." }` — same pipeline starting from raw HTML (e.g. browser-side selection).
- `{ "text": "..." }` — store as a plain note.

Output:

- A new `.md` file in the active Vault, with frontmatter (`url`, `origin: web-clip`, `created`, optional `source_file_ids`).
- The `note_origins` row links the file back to the URL.

### SSRF safety

The fetcher refuses:

- `file://` URLs.
- Non-HTTP(S) schemes.
- Hostnames resolving to localhost / link-local / RFC 1918 private ranges.
- Ports outside an allowlist (80, 443, common public-API ports).

So a malicious clip URL cannot make Litloft fetch from inside its own Docker network.

## Active Summary

The "summary note" panel is what the user sees in Litloft's file detail page when knowledge is enabled.

- It shows clips and notes whose `source_file_ids` include the current file ID.
- Sourced from the addon's `note_origin_sources` table, kept in sync via lifecycle webhooks (`files.missing` / `files.recovered` / `files.purged`).
- A button toggles between *current* and *all-time* (so you can see notes for files that have since gone missing).

The active-summary pointer used to live in core (`file_active_summaries`) but was migrated into the knowledge addon as part of the [Internal API policy](../developer-guide/addon-dev.md#internal-api-policy) cleanup — it does not satisfy R1 (first-class core entity) and would have leaked from a single addon into the core API surface.

## Note scanner

A periodic background job (default every hour, `NOTE_SCANNER_INTERVAL_SECONDS`):

1. Walks each Vault root.
2. Diffs the `.md` files on disk vs the addon DB.
3. For new/changed files, parses the frontmatter and re-projects:
   - `tags` → calls `POST /api/internal/files/<id>/tags` on the core (gated by `CORE_INTERNAL_SECRET`).
   - `source_file_ids` → updates `note_origin_sources`.

This is how external editing (Obsidian, vim) stays in sync.

## Lifecycle webhooks

The core forwards file lifecycle events to the addon at `/api/addons/knowledge/webhook/...`:

- `files.missing` — for any note origin pointing at this file, append a *missing* marker.
- `files.recovered` — clear the marker.
- `files.purged` — remove the row from `note_origin_sources` (so the Active Summary panel does not display dangling references).

The webhook payload is signed with HMAC-SHA256 using `KNOWLEDGE_WEBHOOK_SECRET`. Without this header, the addon refuses the request — without the secret, any process inside the Docker network could forge events and delete data.

## API surface

For automation and addon-to-addon scripting:

- `GET /api/addons/knowledge/vaults` — list Vaults.
- `POST /api/addons/knowledge/vaults` — create.
- `PATCH /api/addons/knowledge/vaults/<id>/activate` — set active.
- `POST /api/addons/knowledge/clip` — web clip from URL / HTML / text.
- `GET /api/addons/knowledge/notes/search?q=...` — keyword search.
- `POST /api/addons/knowledge/notes/<id>/distill` — summarise via LLM (preview).
- `POST /api/addons/knowledge/tags/resync` — rebuild the tag projection (admin-only).

## Per-drive policy

Configure per drive in `drives.json`:

```json
{
  "name": "Knowledge",
  "addons": {
    "knowledge": true
  }
}
```

A drive opts out simply by setting `"knowledge": false`. Disabling on a drive triggers a `purge_drive` against the addon's records for that drive (skipped if the policy lookup fails, to avoid accidental wipes).

## Observability

- `docker compose logs -f knowledge` — service logs.
- The active vault and last scan time are visible in the addon's status page.
- `GET /api/addons/knowledge/health` returns DB health + last scan timestamp.

## Future direction

The `distill` endpoint is an early step toward LLM-driven note summarisation; expect more curation features (related-note suggestions, tag clustering) over time. The addon already has the data model to support a lightweight personal wiki — what is missing is UI for the bidirectional links beyond `loft://` references.

## See also

- [Addon overview](overview.md)
- [Tags and relations](../user-guide/tags-and-relations.md) for the core/knowledge tag-store split.
- [Internal API policy](../developer-guide/addon-dev.md#internal-api-policy).
