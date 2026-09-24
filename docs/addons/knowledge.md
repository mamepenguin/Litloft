# knowledge addon

The `knowledge` addon adds Markdown notes to Litloft: an editor, version history, web clipping, a capture basket for quotes, and a graph of how notes and files connect. Notes are ordinary `.md` files with YAML frontmatter, stored anywhere in a drive, so other editors such as Obsidian can open them too. Each drive is its own collection of notes; nothing links across drives.

## What it provides

- **Notes page**: **Notes** in the sidebar lists and searches the drive's Markdown and text files. See [Notes](../user-guide/notes.md).
- **Markdown editor**: live preview, autosave, `[[wiki links]]`, and image upload by drag and drop or paste.
- **Version history**: browse and restore earlier versions of a note.
- **Capture basket**: collect quotes and timestamps from anywhere in Litloft, then add them to a note.
- **Web clipping**: save a web page as a Markdown note.
- **Create note**: start a note that cites the file you are looking at.
- **Summary note**: a file can show a note chosen as its summary.
- **Connections graph**: how notes and files refer to each other.
- **Add menu**: **New note** and **Clip web page** in the **Add** menu on Home and in Library folders.

Clipping, committing the capture basket, and **Create note** need a [profile](../user-guide/profile-preferences.md). Without one, they fail.

## Installation

The addon runs as its own container on port 8200. Answer **yes** when `configure.py` asks to enable the knowledge addon. It writes the service into `docker-compose.override.yml`, writes `KNOWLEDGE_WEBHOOK_SECRET` and `CORE_INTERNAL_SECRET` into `.env`, and builds `event-hooks.json`. Then:

```bash
docker compose up -d --build
```

Without `configure.py`, add this to `docker-compose.override.yml` and set both secrets in `.env` (generate each with `openssl rand -hex 32`):

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

- `KNOWLEDGE_SERVICE_URL` on the backend is how the backend finds the addon. Without it, the addon's routes answer `404`.
- Set both secrets on both containers.
- The addon hears about missing, recovered and purged files through `event-hooks.json`, mounted into the backend at `/app/event-hooks.json`. `configure.py` builds that file from the addons' `manifest.json` files; see [File events](overview.md#file-events).

The addon does not mount your drives. It reads and writes notes through the backend.

## Configuration

Environment variables of the `knowledge` container:

| Variable | Default | Meaning |
|---|---|---|
| `KNOWLEDGE_DATA_DIR` | `/knowledge-data` | Where the addon keeps its database, `knowledge.db`. |
| `HOMEVAULT_INTERNAL_URL` | `http://backend:8000` | The backend's address on the Docker network. |
| `KNOWLEDGE_USER_AGENT` | a desktop Chrome user agent | User agent for fetching web pages to clip. |
| `KNOWLEDGE_WEBHOOK_SECRET` | *(empty)* | Shared secret the backend sends in the `X-Webhook-Secret` header on file events. The addon rejects a call with the wrong value (`403`). Also required by the intelligence addon to clear a summary note. |
| `CORE_INTERNAL_SECRET` | *(empty)* | Shared secret for the addon's calls to the backend's internal API. **Web clipping fails without it**; see [Clips are unverified](#clips-are-unverified). |
| `NOTE_SCANNER_INTERVAL_SECONDS` | `3600` | How often to check for notes edited outside Litloft. |

With a secret empty, that check is skipped. Set both on a real installation.

## Notes and frontmatter

A clipped note looks like this:

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

…
```

- `id`: a stable identifier. Litloft adds one when a note is saved or scanned without it. Do not change it.
- `url`, `origin`: where the note came from, for example `webclip` or `source_capture`.
- `tags`: the note's tags. For Markdown files the frontmatter is where tags live, and Litloft's tag list follows it. See [Tags on Markdown files](../user-guide/tags-and-relations.md#tags-on-markdown-files).
- `source_file_ids`: the Litloft files the note cites. These appear in the connections graph and make the note show up on those files.

A note's title is its filename. Rename the file to rename the note.

## The editor

A Markdown file on a drive with the editor turned on opens in the editor on its file page. A `.txt` file opens for reading only.

The editor has three views: **Edit**, **Split** (editor and preview side by side, not offered on narrow screens), and **Preview**. In **Edit**, live preview styles the text as you type: headings, bold, links, lists, task checkboxes and code blocks. The Markdown characters are hidden except on the line the cursor is on. Frontmatter is shown as YAML in **Edit** and as a properties card in **Preview**.

The formatting toolbar never wraps. Controls that do not fit move into the **More formatting and versions** menu at its end, which also holds **Keep this version** and **Version history**.

- **Autosave.** Your changes are saved two seconds after you stop typing. There is no save button.
- **Conflicts.** If the file changed somewhere else, for example in Obsidian or on another device, the editor says so and lets you reload the saved copy or keep yours.
- **Images and files.** Drop or paste a file into the editor to upload it into the note's folder. An image is inserted as `![name](loft://<file_id>)`; other files as a link.
- **Wiki links.** Type `[[` to pick another note in the drive. A link to a note that does not exist offers to create it.

Images linked as `loft://<file_id>` keep working when the image is moved or renamed. The first such image in a note becomes its thumbnail. Two or more images on consecutive lines are shown side by side in one row; put a blank line between them to stack them.

Images linked by an `https://` address are loaded from that site each time. An admin can copy them into the library from `/admin/markdown-images`.

The editor's keys are listed in [Keyboard shortcuts](../user-guide/keyboard-shortcuts.md#markdown-editor-knowledge-addon).

## Version history

Litloft keeps a version every time a `.md` or `.txt` file is written, whoever wrote it, and when the file is created. The knowledge addon adds the **Version history** panel at the bottom of the editor. You can also open it from **Version history** in the editor toolbar menu or in the file's `...` menu.

- Versions are listed newest first, 50 per page. Each shows the time, whether it is a **Kept version** or **Autosaved**, who saved it if they have a profile, and how many lines were added and removed.
- Select a version to see what changed in it. **Read-only preview** shows its full text as raw Markdown.
- **Restore this version** saves the old text as a new version, so a restore can itself be undone. Unsaved edits are kept as a version first.
- `Cmd/Ctrl+S`, or **Keep this version**, marks the current text as a kept version.
- Autosaves by the same person within five minutes of each other are merged into one version.
- A file keeps at most 200 versions. When there are more, the oldest autosaved versions are removed. Kept versions are never removed.

The history is stored by Litloft itself, so the versions are still there if the addon is removed.

## Capture basket

The capture basket collects pieces of other files to add to a note. Look for the capture button on:

- a search result (its snippet);
- the video or audio player (the current time);
- a document or PDF (the selected text, or the current page);
- a transcript line or an Ask citation, with the [intelligence addon](intelligence.md).

The basket is in the header on every page. It holds up to 100 items per drive and is kept in the browser tab until you save it; closing the tab loses it. In the basket you can reorder items, add a comment to each, and remove items.

Saving adds the items to a note under a `## Captures` heading. Each item has a link back to the source, opening at the right time or page, the quote, and your comment. The source files are added to the note's `source_file_ids`.

- **Append to {filename}** adds to your usual note. By default this is `Captures/Inbox.md`. You can instead choose a daily note named `YYYY-MM-DD.md`, and a different folder. This setting is kept per drive in the browser.
- **Other save methods** offers **New note** or **Existing note**.

## Web clipping

Clip a web page from **Web clip** at the bottom of the Notes page, from **Clip web page** in the **Add** menu, or with the bookmarklet offered on the Notes page.

Litloft creates the note at once and fetches the page in the background. It keeps the article, removes scripts and page furniture, converts it to Markdown, and renames the note after the article's title. If you edit the note before the fetch finishes, your edit is kept and the fetched text is discarded.

- If a URL was clipped before, Litloft asks: **Open existing**, **Create new** or **Cancel**. A URL whose earlier clips all failed is clipped again without asking.
- A clip from the **Add** menu saves into the folder the menu was opened in. When it is ready, a notice says **Clipped: {title}**, or **A web page could not be clipped**.
- If Litloft cannot fetch a page, for example one behind a login, you can paste the page's HTML instead. Nothing is fetched then.

### Clips are unverified

Every clip is saved as an **unverified** source. It can be searched at once, but Ask does not use it as evidence until you press **Trust as a source** on its file page. See [Trusted sources](../user-guide/file-browsing.md#trusted-sources-and-the-review-queue).

Because of this, **`CORE_INTERNAL_SECRET` must be set on both containers**. Without it, the clip cannot be marked unverified, so clipping fails (`502`) rather than saving the page as a trusted source. The empty placeholder note is left in the folder.

### Pages that are refused

To keep a clip URL from reaching inside your network, Litloft refuses:

- anything other than `http` and `https`;
- the Docker service names `backend`, `frontend`, `knowledge`, `intelligence`, `postgres`, `redis` and `localhost`;
- addresses that are private, loopback, link-local, multicast, reserved, unspecified or in `100.64.0.0/10`, and names that resolve to them or do not resolve;
- responses that are not HTML;
- redirects from `https` to `http`, and more than five redirects. Every redirect is checked again.

## Create note and summary note

**Create note** in any file's `...` menu creates a note whose frontmatter already cites that file, and opens it.

A file's **Summary note** section shows the note chosen as the summary of that file, with **Edit in Knowledge**. With the [intelligence addon](intelligence.md), **Save as file** on an AI detailed summary saves it as a note and makes it that file's summary note.

## Connections graph

The graph shows the drive's notes and files as points and their connections as lines. It is at `/drive/{drive}/addons/knowledge/connections`. Open it from **Note & file connections** on the Notes page, or from **See connections as a graph** in the **Related** tab of a Markdown or text file.

- A line is a [file relation](../user-guide/tags-and-relations.md#file-relations), or a note citing a file in `source_file_ids`.
- Colour points by file type, tag or folder, or use one colour.
- **Center on this** focuses on one file to a chosen depth. **Reset to full view** or `Escape` shows the whole drive again. Opening the graph from a file centres it on that file; a file with no connections shows the whole drive and says so.
- Notes with no connections are listed separately.
- With more than 200 points, the page suggests centring on a file. If the drive has more than 5,000 relations, the page says the graph is incomplete.

## Notes edited outside Litloft

If you edit notes with another program, Litloft picks up the changes to `tags` and `source_file_ids` within an hour, and once when the addon starts. `NOTE_SCANNER_INTERVAL_SECONDS` sets the interval. Changes made in Litloft's editor apply at once.

## Per-drive policy

In `drives.json`, or in **Addon policy** at `/admin/settings`:

```json
{
  "name": "Knowledge",
  "addons": {
    "knowledge": true
  }
}
```

`"knowledge": false` turns the addon off for the drive. Two features can be set on their own:

| Feature | Effect when `false` |
|---|---|
| `editor` | No editor on note pages, no **Create note** in the file's `...` menu, and no **New note** in the **Add** menu. |
| `index` | File events for the drive are not sent to the addon. |

**Clip web page** has no feature of its own: it is shown wherever the addon is on, even when `editor` is off. **New note** on the Notes page is also shown whatever `editor` says, because it uses [Quick Note](../user-guide/quick-note.md).

Turning the addon off for a drive hides it there. Nothing the addon stored is deleted, and the notes stay on the drive.

## API

The addon's routes are reached through the backend at `/api/addons/knowledge/...`. All except `resync-tags` need the `X-Lit-Drive` header, which the web app sends. Routes marked *profile* answer `401` without a profile.

| Endpoint | Purpose |
|---|---|
| `GET /clips?url=` | Your earlier clips of a URL in this drive. *profile* |
| `POST /clips` | Clip a URL. Answers `202` and finishes in the background; the result arrives as the WebSocket event `knowledge.clip.ready` or `knowledge.clip.failed`. *profile* |
| `POST /clips/pasted` | Clip pasted HTML. Answers `201` when done. *profile* |
| `POST /captures/commit` | Save capture basket items into a note. *profile* |
| `POST /notes` | Create a note with a given folder, filename and content. *profile* |
| `POST /note-from-file` | Create a note citing a file. *profile* |
| `POST /distill` | Save a summary as a note and make it the file's summary note. *profile* |
| `GET /notes/by_source_file/<id>` | Notes that cite a file. |
| `POST /note-openings` | The first lines of the given notes, for lists. |
| `GET /search?q=` | Search the text of the drive's notes. |
| `GET /connections-graph` | The drive's connections graph. |
| `POST /resync-tags/<file_id>` | Copy a note's frontmatter tags into Litloft's tag list. |
| `POST /file_active_summary`, `GET` / `DELETE /file_active_summary/<file_id>` | A file's summary note. |
| `GET /file_active_summary/<file_id>/note` | The summary note to show on a file page. |

Version history is part of Litloft itself: `GET /api/files/<id>/versions?limit=&offset=`, `GET /api/files/<id>/versions/<version_id>`, and `GET /api/files/<id>/versions/<version_id>/diff`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Every clip fails, leaving an empty note behind | The secret is missing on the backend or the addon. Set it on both and restart. |
| Clipping or **Create note** fails at once | No profile is set. |
| Notes, clips and the graph are missing | `KNOWLEDGE_SERVICE_URL` is not set on the backend, or the addon is off for this drive. |
| Tags edited in another program do not appear | Wait for the next check (hourly by default), or save the note once in Litloft. |

`docker compose logs -f knowledge` shows the addon's log, including each check for outside edits. `http://knowledge:8200/health` on the Docker network answers `{"status": "ok"}` when the addon is running.

## See also

- [Notes](../user-guide/notes.md) for the Notes page.
- [Quick Note](../user-guide/quick-note.md), Litloft's own note panel in the header.
- [Addon overview](overview.md) for per-drive policy.
