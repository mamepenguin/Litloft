# knowledge addon

The `knowledge` addon turns Litloft into a personal notes vault and web-clip archive. It is Obsidian-flavoured: notes are plain `.md` files with YAML frontmatter, living anywhere inside a drive. There is no separate "Vault" abstraction — the drive is the only scope, matching the core rule that a drive is a security boundary.

## What it provides

- **Notes browser** — a sidebar over the drive's `.md` files with folders, pinning, renaming, moving, tag editing, and sort by updated / created / name.
- **Markdown editor** — a CodeMirror 6 editor with live preview, autosave, wiki links, and drag-and-drop image upload.
- **Version history** — every text write is snapshotted; the editor lists past versions with a diff and a restore action.
- **Source capture** — collect quotes and timestamps from anywhere in Litloft into a basket, then commit them into a note.
- **Web clipping** — paste a URL or a piece of HTML; the addon fetches, sanitises, converts to Markdown, and saves.
- **Frontmatter sync** — when an external editor (Obsidian, vim, etc.) edits a note, the scanner reconciles `tags`, `source_file_ids`, and other recognised keys with the addon's database.
- **Summary note** — a file-detail section showing the approved summary note for the currently open core file.
- **Connections graph** — a force-directed view of how notes and files reference each other.
- **Drive-scoped search** — keyword search over note bodies.
- **Distill** (early preview) — promote an LLM-generated summary into a note.

> **Image needed:** screenshot of a note in the editor alongside its file detail page with the Summary note section.

## Installation

The addon runs as an independent service on port 8200. The recommended path is to answer **yes** when `configure.py` prompts to enable the knowledge addon — it writes the service block into `docker-compose.override.yml` and generates `KNOWLEDGE_WEBHOOK_SECRET` / `CORE_INTERNAL_SECRET` into `.env` for you. Then:

```bash
docker compose up -d --build
```

For a manual install (no `configure.py`), add a service block like this to `docker-compose.override.yml` and set the two secrets in `.env` (`openssl rand -hex 32`):

```yaml
services:
  backend:
    environment:
      - KNOWLEDGE_SERVICE_URL=http://knowledge:8200
      - KNOWLEDGE_WEBHOOK_SECRET=${KNOWLEDGE_WEBHOOK_SECRET:-}
      - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET:-}

  knowledge:
    build: ./addons/knowledge
    expose:
      - "8200"
    environment:
      - HOMEVAULT_INTERNAL_URL=http://backend:8000
      - KNOWLEDGE_WEBHOOK_SECRET=${KNOWLEDGE_WEBHOOK_SECRET:-}
      - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET:-}
    volumes:
      - ./data/addons/knowledge:/knowledge-data
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
```

`KNOWLEDGE_SERVICE_URL` on the **backend** is what lets the core's addon proxy find the service; without it the routes 404. The two secrets have to be set on both containers, because each one gates traffic in one direction.

The knowledge addon does not bind-mount drive directories — it reaches the note files indirectly, by reading file content through the [Internal API](../developer-guide/addon-dev.md#internal-api-policy) on the Docker network.

## Configuration

| Env var | Default | What it does |
|---|---|---|
| `KNOWLEDGE_DATA_DIR` | `/knowledge-data` | Directory for the addon's SQLite DB and intermediate state. |
| `HOMEVAULT_INTERNAL_URL` | `http://backend:8000` | Core API endpoint on the Docker network. |
| `KNOWLEDGE_USER_AGENT` | (browser-like) | Override for the web-clip fetcher. |
| `KNOWLEDGE_WEBHOOK_SECRET` | *(empty)* | HMAC for lifecycle webhooks (`files.missing` etc.). Also gates the service-to-service summary-note route. |
| `CORE_INTERNAL_SECRET` | *(empty)* | Shared secret for `/api/internal/files/<id>/content` calls. **Required for web clipping** since clips must be marked unverified as they are created; without it core answers 503 and the clip fails rather than landing as a trusted source. |
| `NOTE_SCANNER_INTERVAL_SECONDS` | `3600` | Cadence for the frontmatter reconciler. |

Both secrets default to empty, in which case the corresponding gate no-ops. That keeps development frictionless, but on a real install set them — they are the only defence in depth behind the Docker network boundary.

## Data model

The addon manages two on-disk surfaces:

- **Notes** — `.md` files anywhere under one of the core's drives. The user owns the layout.
- **Addon SQLite** at `${KNOWLEDGE_DATA_DIR}/knowledge.db` — `clip_jobs`, `note_origins` (the queryable cache mapping note → origin, keyed by drive), `note_origin_sources`, and `file_active_summaries`.

`note_origins` is a cache, not the source of truth. The `.md` frontmatter is authoritative; the scanner rebuilds the rows from it.

### Frontmatter convention

A typical clipped note looks like:

```markdown
---
id: "20260412081400"
url: https://example.com/sqlite-vs-postgres
origin: webclip
created: 2026-04-12T08:14:00Z
tags: [database, decisions]
source_file_ids: [file_abc123]
---

# Why we picked SQLite

…body…
```

- `id` — a timestamp-shaped stable handle. The core injects it on every `.md` write if it is missing; it is what `[[wiki links]]` resolve against, so a note keeps its identity across renames.
- `url`, `origin` — set by the pipeline that created the note. Values in use today: `webclip`, `source_capture`, and whatever the caller passes to `distill`.
- `created` — ISO timestamp.
- `tags` — list; canonical for `.md` files. The core projects it onto `File.tags` on every content write, and the scanner reconciles it hourly for external edits.
- `source_file_ids` — list of core `file_id`s this note references. This is what populates the summary-note section and the connections graph.

There is no `title:` convention. The display title of a note comes from its filename, so renaming the file is how you rename the note.

The frontmatter parser is implemented twice — in core (`backend/app/services/frontmatter.py`) and in this addon (`addons/knowledge/app/services/frontmatter.py`) — because they live in different containers and cannot share code. Drift is caught in PR review.

## The editor

The Markdown editor is CodeMirror 6, and it belongs to this addon. The chrome around it does not: the title, the save indicator, the view-mode toggle, and the inspector toggle are core's Markdown document layout, and the view mode itself is core state that the editor reads. On the standalone `/addons/knowledge` route there is no such layout, so the editor falls back to keeping the view mode locally. Practically this means the editor behaves identically either way, but only the text surface is the addon's to change.

There are three view modes, switched from the segmented toggle in the chrome or by cycling with a keyboard chord:

| Mode | What you see |
|---|---|
| **Edit** | The editor alone, with live preview applied to the text you are typing. |
| **Split** | Editor and rendered preview side by side. Hidden below 768px, where there is no room for two panes. |
| **Preview** | The rendered note alone, with the frontmatter shown as a properties card above the body rather than as YAML. |

If the window narrows past the mobile breakpoint while you are in Split, the editor drops you into Preview and stays there — it does not bounce back when you rotate the device again.

### Live preview

Live preview is not a separate pane; it is styling applied inside the editor. Headings take their heading size, `**bold**` renders bold, links render as links, blockquotes and fenced code blocks get their own line treatment, list bullets become real bullets, task list markers become clickable checkboxes, and `---` becomes a rule.

The syntax markers themselves are hidden — until your cursor enters that line, at which point the raw Markdown for that line reappears so you can edit it. Frontmatter is left alone entirely and always shows as raw YAML.

### Editing, saving, and images

- **Autosave.** Edits are written back two seconds after you stop typing. There is no save button.
- **Conflicts.** Writes are ETag-guarded. If the file changed elsewhere (another device, Obsidian, the scanner) the editor reports a conflict and offers to reload from the server or overwrite with your copy, rather than silently clobbering either side.
- **Images and files.** Drop or paste a file into the editor and it uploads into the note's own folder, replacing an "uploading…" placeholder with `![name](loft://<file_id>)`. Non-image files get an ordinary link instead.
- **Wiki links.** Typing `[[` opens an autocomplete over the drive's notes. A link to a name that does not exist yet offers to create the note.

### How images behave

Images inside a note are referenced by file id — `![alt](loft://<file_id>)` — not by a filesystem path, so moving or renaming the image does not break the note.

Two core behaviours follow from that:

- **The first local image becomes the note's thumbnail.** Whenever a `.md` file is written, scanned, or moved, the core looks for the first inline `loft://` image in the body and projects a thumbnail from it. Notes therefore get real cover images in the file grid. Remove the image and the projection is cleared.
- **Consecutive images render as a row.** Two or more images with no blank line between them are grouped into a single equal-height flex row in the rendered preview, instead of stacking. The Markdown is untouched — only the rendering changes — so a blank line between them is how you opt out.

Images referenced by an external `https://` URL still render, but they are fetched from that host every time. An admin can localise them in bulk from `/admin/markdown-images`: it first analyses a folder and reports which hosts the images come from, and only the hosts you approve are then downloaded into `{note folder}/assets/`, with the reference rewritten to `loft://`. Each rewrite lands as a kept version, so the original text stays in the note's history. That job is core's, not this addon's, and never runs on its own.

Editor keyboard chords are listed in [Keyboard shortcuts](../user-guide/keyboard-shortcuts.md#markdown-editor-knowledge-addon).

## Version history

Every write to a `.md` or `.txt` file — from this editor, from the API, from a clip, from a capture commit — is stored by the core as a compressed snapshot in its `file_versions` table. Creating a text file records an initial version too, so the history starts from the file's first byte.

Recording is entirely core's — it happens on the write, whoever made it, whether or not this addon is installed. What the addon adds is the way to browse and act on it: a collapsible **Version history** panel below the editor text. It lists versions newest first, 50 to a page, each row showing relative time (with the exact timestamp underneath), the saver's nickname if they have set one, and a `+N −M` line delta against the previous version. Selecting a row shows the diff and a read-only preview of that version's full text.

Four behaviours are worth knowing:

- **Consecutive automatic saves collapse.** If the same person saves again within five minutes and the previous version was automatic, the existing version is rewritten instead of a new one being added. Otherwise a long editing session would bury the history under one entry per pause.
- **`Cmd/Ctrl+S` keeps a version.** The note is already saved, so this does not save in the usual sense — it marks the current text as a version worth keeping. Kept versions never collapse into a later save and are never pruned. They are flagged in the list. Pressing it when nothing has changed since the last version promotes that version to kept rather than adding a duplicate.
- **History is capped, but only automatic versions are pruned.** A file keeps at most 200 versions; when it overflows, the oldest *automatic* versions are dropped and the line deltas of their successors are recomputed. Kept versions survive.
- **Restore is not a rewind.** Restoring re-saves the old text as a new version on top of the history, so nothing is lost and you can undo the restore by restoring again. If your current draft had unsaved edits, those are written as a kept version first. If the note changed underneath you mid-restore, the restore is cancelled and says so.

The vocabulary here is deliberately not git's: versions, changes, keep, restore. There are no commits, branches, or reverts to learn.

Behind it are three core endpoints, all scoped to `text/markdown` and `text/plain` files the viewer can already read:

- `GET /api/files/<id>/versions?limit=&offset=`
- `GET /api/files/<id>/versions/<version_id>` — full text of one version.
- `GET /api/files/<id>/versions/<version_id>/diff` — line diff against the previous version.

Stored bodies are integrity-checked on read (size and ETag must match); a corrupt or oversized row surfaces as an error rather than as wrong text.

## Source capture

Capture is the "I want to keep this bit" path. It works across the whole app, not just inside Knowledge:

- a **search result** — the matching snippet;
- a **media position** — the current timestamp in the video or audio player;
- a **document selection or PDF page** — the selected text, or the page you are on;
- a **transcript line** or an **Ask answer citation** from the intelligence addon.

Each of these offers a quote-mark button that drops the item into the **capture basket**. On the surfaces that repeat one per row — a search result, a transcript line — it appears on hover or focus and stays visible on a touch screen, rather than being drawn hundreds of times over — a per-drive tray in the header, holding up to 100 items. The basket lives in the browser's session storage, so it is private to that tab session and never leaves the device until you commit it. Inside the basket you can reorder items, attach a note to each one, and drop the ones you do not want.

Committing writes Markdown into a note under a `## Captures` heading, one bullet per capture: a `loft://` link back to the source file (carrying `?t=` or `?page=` so the link lands at the right spot), the quote as a blockquote, and your note underneath. The note's `source_file_ids` are updated so the captures show up in the connections graph and the summary-note section.

There are three destinations:

- **Quick append** (the default) — appends to a note chosen by the destination setting, creating it if it does not exist. The setting has a folder and two modes: *fixed*, which always uses `Inbox.md`, or *daily*, which uses `YYYY-MM-DD.md` for today. The default is `Captures/Inbox.md`. It is stored per drive in the browser.
- **New note** — opens a save dialog for a filename and folder.
- **Existing note** — search the drive's Markdown notes and append to the one you pick.

Appends are ETag-guarded and serialised per target path, so two commits racing into the same daily note do not lose each other's captures.

## Web clipping

Two endpoints, both drive-scoped:

- `POST /api/addons/knowledge/clips` — `{ "url": "https://..." }`. Creates a placeholder `.md` immediately and returns `202`; a background worker fetches the page via httpx, extracts content with readability-lxml plus trafilatura, sanitises with bleach, converts to Markdown via markdownify, then overwrites the placeholder and renames the file to a slug of the article title. The UI is told over WebSocket (`knowledge.clip.ready` / `knowledge.clip.failed`).
- `POST /api/addons/knowledge/clips/pasted` — `{ "url": ..., "html": ... }`. The same extraction, but starting from HTML you paste in, with no network fetch at all. This is the fallback the UI offers when a server-side fetch fails — useful for pages behind a login that Litloft cannot reach on its own.

`GET /api/addons/knowledge/clips?url=...` looks up existing jobs for a URL so the UI can warn about a duplicate before clipping again. The lookup is scoped to `(viewer, drive)`, so it cannot be used to probe what was clipped on another drive.

The dashboard also offers a **bookmarklet** to drag to your browser's bookmark bar. It does not talk to the API directly: it opens the Knowledge page for that drive with the current page's URL and title prefilled and submits the URL clip for you, so no cross-origin permission is involved.

The placeholder write is guarded: if you (or the scanner) touch the file while the fetch is in flight, the fetched content is discarded rather than overwriting your edit.

### Clips land unverified

Every clip is created with core's trust tier set to **unverified**. It is
fully searchable from the moment it lands, but it does not ground Ask
answers until you have read it and pressed **Trust as a source** on the file
page. See [trusted sources](../user-guide/file-browsing.md#trusted-sources-and-the-review-queue).

The reasoning: a clip is text someone else wrote, saved because a headline
looked promising. Treating it as evidence the instant it arrives is how a
marketing page ends up cited back at you with a page number.

Two operational consequences:

- **`CORE_INTERNAL_SECRET` must be set**, or clipping fails with `502`. This
  is deliberate. The alternative — carrying on and letting the clip land
  trusted — is the exact defect the tier exists to prevent, and it would fail
  silently. The realistic cause is a one-time configuration gap, so it
  surfaces on your first clip and is fixed once.
- If you had already ruled on that file yourself, core answers `409` and
  **your decision stands**; the clip still succeeds.

### SSRF safety

The fetcher refuses:

- Any scheme other than `http` / `https`.
- The Docker service names on Litloft's own network (`backend`, `frontend`, `knowledge`, `intelligence`, `postgres`, `redis`, `localhost`) by hostname, before DNS is even consulted.
- Hostnames whose DNS answers include a loopback, link-local, multicast, private, reserved, unspecified, or CGNAT (`100.64.0.0/10`) address — including IPv4-mapped IPv6 forms — and IP literals in those ranges.
- Hostnames that fail to resolve at all.
- Responses that are not `text/html` or `application/xhtml+xml`.
- Redirects that downgrade `https` to `http`, or that exceed five hops. Every hop is re-validated.

So a malicious clip URL cannot make Litloft fetch from inside its own Docker network. There is no port allowlist — the address checks, not the port number, are what stop internal access.

## Summary note

The "Summary note" section is what the user sees in Litloft's file detail page when knowledge is enabled.

- It renders the note that has been approved as the summary for the current file — one pointer per file, held in the addon's `file_active_summaries` table.
- The pointer is written by `distill` (and cleared by intelligence when a summary is regenerated), and both ends are verified to live in the same drive before it is stored.
- Lifecycle webhooks (`files.missing` / `files.recovered` / `files.purged`) keep `note_origin_sources` honest so nothing dangles.

The active-summary pointer used to live in core (`file_active_summaries`) but was migrated into the knowledge addon as part of the [Internal API policy](../developer-guide/addon-dev.md#internal-api-policy) cleanup — it does not satisfy R1 (first-class core entity) and would have leaked from a single addon into the core API surface.

Alongside it, a **Create note** action in any file's `[...]` menu creates a stub `.md` whose frontmatter already cites that file, and an **Edit note** action opens `.md` files directly in the editor.

## Connections graph

`GET /api/addons/knowledge/connections-graph` returns a force-directed view of the current drive, drawn on the Knowledge dashboard. It unions two edge sources:

- core `file_relations` — explicit file-to-file relations;
- `note_origin_sources` — notes citing files through `source_file_ids`.

Edges present in both are deduplicated. Nodes can be coloured by file type, tag, folder, or flat, and the view can be focused on one file to a chosen depth. Notes with no connection at all are listed separately as unlinked notes rather than drawn as floating dots.

Two honesty guards: above roughly 200 nodes the UI suggests picking a centre file, and if the core returns a full page of relations (5000) the response is marked truncated and the UI says the graph is incomplete instead of presenting a partial picture as whole.

## Note scanner

A periodic background job (default every hour, `NOTE_SCANNER_INTERVAL_SECONDS`, with one pass immediately at startup):

1. Walks the `note_origins` rows and asks the core for each note's current `updated_at`.
2. For notes newer than the row's `last_synced_at`, re-fetches the content through `GET /api/internal/files/<id>/content` and re-parses the frontmatter.
3. Re-projects what it finds:
   - `tags` → `POST /api/internal/files/<id>/tags` on the core (gated by `CORE_INTERNAL_SECRET`).
   - `source_file_ids` → `note_origin_sources`.
   - a missing `id:` → written back into the file, so links to it stay stable.

This is how external editing (Obsidian, vim) stays in sync. It runs without a user cookie, which is why it needs the internal content endpoint rather than the normal cookie-gated stream route; 403/404 responses from it are counted separately as `protected_errors` so a permissions problem does not hide inside the generic error count.

Editing tags in the Litloft UI does not wait for this pass — the core projects `.md` frontmatter tags onto `File.tags` synchronously on every content write, and the editor also pokes `POST /api/addons/knowledge/resync-tags/<file_id>` after each save. The hourly scan is the fallback for edits Litloft never saw.

## Lifecycle webhooks

The core forwards file lifecycle events to the addon:

- `files.missing` — for any note origin pointing at this file, append a *missing* marker.
- `files.recovered` — clear the marker.
- `files.purged` — remove the row from `note_origin_sources` (so the summary-note section does not display dangling references).

The webhook payload is signed with HMAC-SHA256 using `KNOWLEDGE_WEBHOOK_SECRET`. Without this header, the addon refuses the request — without the secret, any process inside the Docker network could forge events and delete data.

## API surface

Everything below is reached through the core's addon proxy at `/api/addons/knowledge/...`, and everything except `resync-tags` requires the drive context header the frontend attaches automatically.

| Endpoint | What it does |
|---|---|
| `GET /clips?url=` | Look up existing clip jobs for a URL in this drive. |
| `POST /clips` | Clip from a URL (async, `202`). |
| `POST /clips/pasted` | Clip from pasted HTML (sync, `201`). |
| `POST /captures/commit` | Commit basket captures into a new, quick-append, or existing note. |
| `POST /notes` | Create a note with explicit folder / filename / content. |
| `POST /note-from-file` | Create a stub note citing a source file. |
| `POST /distill` | Promote an LLM summary into a note (preview). |
| `GET /notes/by_source_file/<id>` | Notes citing a given file. |
| `GET /search?q=` | Keyword search over the drive's text notes. |
| `GET /connections-graph` | Note-and-file relation graph for the drive. |
| `POST /resync-tags/<file_id>` | Re-project one note's frontmatter tags into the core. |
| `POST /file_active_summary`, `GET`/`DELETE /file_active_summary/<file_id>` | Summary-note pointer. |
| `GET /file_active_summary/<file_id>/note` | The rendered summary note itself. |

Version history is a **core** API, not an addon one — see the endpoints listed under [Version history](#version-history).

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

A drive opts out simply by setting `"knowledge": false`. Two feature keys are recognised for finer control: `editor` (the inline editor on a note's detail page, and the **Create note** entry in any file's `[...]` menu) and `index` (whether lifecycle webhooks are forwarded for that drive). Unspecified keys are enabled by graceful degradation, and changes take effect on container restart.

Turning knowledge off for a drive stops new writes and hides the UI; it does not delete anything the addon already recorded. The notes themselves are ordinary `.md` files on the drive and are untouched either way.

## Observability

- `docker compose logs -f knowledge` — service logs. The scanner logs each pass's counts, including `protected_errors` and `tags_projected`.
- `GET /health` on the container (`http://knowledge:8200/health`) — a bare liveness check returning `{"status": "ok"}`. It is not exposed through the addon proxy and reports no scan timestamps, so the logs are the place to look for scanner state.

## Future direction

The `distill` endpoint is an early step toward LLM-driven note curation; expect more of it over time (related-note suggestions, tag clustering). The connections graph and `[[wiki links]]` already give the addon most of a lightweight personal wiki — what is thinnest today is authoring backlinks deliberately rather than as a side effect of citing source files.

## See also

- [Addon overview](overview.md)
- [Quick Note](../user-guide/quick-note.md) — the core's global note capture. The Knowledge dashboard's old "Quick memo" button was removed in favour of it, since the core action is available from the header on every screen.
- [Keyboard shortcuts](../user-guide/keyboard-shortcuts.md#markdown-editor-knowledge-addon) for the editor chords.
- [Tags and relations](../user-guide/tags-and-relations.md) for the core/knowledge tag-store split.
- [Internal API policy](../developer-guide/addon-dev.md#internal-api-policy).
