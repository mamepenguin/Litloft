# knowledge addon

The `knowledge` addon adds Markdown notes to Litloft: an editor, version history, web clipping, a capture basket for quotes, and a graph of how notes and files connect. Notes are ordinary `.md` files with YAML frontmatter, stored anywhere in a drive, so other editors such as Obsidian can open them too. Each drive is its own collection of notes; nothing links across drives.

## What it provides

- **Notes** in the sidebar has a Home and a Library for the drive's Markdown and text files, with the chosen note shown and editable beside the list. See [Notes](../user-guide/notes.md).
- **Clips** in the sidebar, right after Notes, gathers the web pages you clipped, apart from the notes you wrote.
- Every note and clip card and row opens the core file menu on right-click or a 500 ms press: the Notes Home sections, the Notes Library, the Clips Home shelves, its unverified rows, and the Clips Library and shelf pages. **Remove from history** appears only in Notes' Continue writing and Clips' Recently opened, and only with a profile.
- A Markdown editor with live preview, autosave, `[[wiki links]]`, and image upload by drag and drop or paste.
- A version history where you browse and restore earlier versions of a note.
- A capture basket that collects quotes and timestamps from anywhere in Litloft so you can add them to a note.
- Web clipping, which saves a web page as a Markdown note.
- **Create note**, which starts a note that cites the file you are looking at.
- A file can show a note chosen as its summary note, in the **Note** panel under a player or in the file page's sections.
- A connections graph of how notes and files refer to each other.
- **New note** and **Clip web page** in the **Add** menu on Home and in Library folders.

Clipping, committing the capture basket, and **Create note** need a [profile](../user-guide/profile-preferences.md). Without one, they fail.

## Installation

The addon runs as its own container on port 8200. Answer yes when `configure.py` asks to enable the knowledge addon. It writes the service into `docker-compose.override.yml`, writes `KNOWLEDGE_WEBHOOK_SECRET` and `CORE_INTERNAL_SECRET` into `.env`, and builds `event-hooks.json`. Then:

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
| `CORE_INTERNAL_SECRET` | *(empty)* | Shared secret for the addon's calls to the backend's internal API. Web clipping fails without it, and saving an Ask answer answers `502` though the note is written; see [Clips are unverified](#clips-are-unverified) and [Notes saved from Ask are unverified](#notes-saved-from-ask-are-unverified). |
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

A Markdown file on a drive with the editor turned on opens in the editor on its file page.

A `.txt` file up to 1 MB opens the same way, in a plain editor: **Edit** and **Preview** only, no Split, no formatting buttons, no Markdown styling, no `[[` links, and nothing is uploaded when you drop or paste a file. Autosave, the conflict prompt and version history work as for a note. The file keeps its byte order mark and line endings. The name above the page edits the part before `.txt`, and `.txt` stays. A `.txt` that is not UTF-8 text or whose line endings are mixed opens in **Preview** and shows a notice in **Edit**; it has no version history. A `.txt` over 1 MB, and every other text file, stays read-only.

The editor has three views: **Edit**, **Split** (editor and preview side by side, not offered on narrow screens), and **Preview**. In **Edit**, live preview styles the text as you type: headings, bold, links, lists, task checkboxes and code blocks. The Markdown characters are hidden except on the line the cursor is on. Frontmatter is shown as YAML in **Edit** and as a properties card in **Preview**.

The formatting toolbar never wraps. Controls that do not fit move into the **More formatting and versions** menu at its end, which also holds **Keep this version** and **Version history**.

- Your changes are saved two seconds after you stop typing. There is no save button.
- If the file changed somewhere else, for example in Obsidian or on another device, the editor says so and lets you reload the saved copy or keep yours.
- Drop or paste a file into the editor to upload it into the note's folder. An image is inserted as `![name](loft://<file_id>)`; other files as a link.
- Type `[[` to pick another note in the drive for a wiki link. A link to a note that does not exist offers to create it.

Images linked as `loft://<file_id>` keep working when the image is moved or renamed. The first such image in a note becomes its thumbnail. Two or more images on consecutive lines are shown side by side in one row; put a blank line between them to stack them.

Images linked by an `https://` address are loaded from that site each time. An admin can copy them into the library from `/admin/markdown-images`.

The editor's keys are listed in [Keyboard shortcuts](../user-guide/keyboard-shortcuts.md#markdown-editor-knowledge-addon).

## Version history

Litloft keeps a version every time a `.md` or `.txt` file is written, whoever wrote it, and when the file is created. The knowledge addon adds the **Version history** panel at the bottom of the editor. You can also open it from **Version history** in the editor toolbar menu or in the file's `...` menu.

- Versions are listed newest first, 50 per page. Each shows the time, whether it is a **Kept version** or **Autosaved**, who saved it if they have a profile, and how many lines were added and removed.
- Select a version to see what changed in it. **Read-only preview** shows its full text as raw Markdown (for a `.txt`, exactly as stored).
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

## Clips

**Clips** is at `/drive/{drive}/addons/knowledge/clips`, below Notes in the sidebar. It lists only files whose frontmatter has `origin: webclip`, so a clip stays a clip when you move it or write in it, and it becomes a note again when you delete that line.

- **Clip a web page**, at the top right, opens a form for a URL or pasted HTML: destination folder, duplicate check and bookmarklet. A clip made there appears on the page without a reload.
- The header has a **Target** menu, **Clip a web page** and the tabs **Home** and **Library**. **Home** has the shelves **Unread** (no history row for you), **Recently opened** (latest opening first) and **Unverified** (still waiting for **Trust as a source**), each with **See all** to a page of that shelf. Without a [profile](../user-guide/profile-preferences.md), **Unread** becomes **New clips** and **Recently opened** is not drawn; **Unverified** stays.
- **Library** is `?view=all`. It groups by tag (`group=tags`, the default), folder
  (`group=folder`), date added (`group=month`) or not at all (`group=none`), and sorts by
  `sort=newest` (the default), `oldest` or `title`. The Folder and Date Added groupings ask
  the core `shelves` route for `by=folder` and `by=month` under the target's conditions. A
  grouping whose answer reports a single shelf draws every clip in one grid, as None does.
- Unread, Recently opened, New clips and the tag shelves are cover cards. **Unverified** is a list of rows, each with **Mark as verified**, which writes the clip's trust tier through the core's `PUT /api/files/{id}/trust-tier`.
- A card shows the clip's first Markdown image, its title, its site and a reading time of `max(1, round(bytes / 1500))` minutes. A red dot marks a clip you have not opened. Opening a card goes to the file page and counts as opening it.
- A drive with no clips shows one empty state, and the page keeps its header and its **Clip a web page** action.

### Library URLs

The Clips Library names its view in the URL, so Back after a menu choice returns to the
previous one:

- **Library**: `?view=all&group=<tags|folder|month|none>&sort=<newest|oldest|title>`.
- **Shelf page**: `?view=shelf&shelf=<id>&sort=<sort>`, where `<id>` is `unread`, `recent`,
  `new`, `unverified`, `tag:<name>`, `untagged`, `folder:<key>` or `month:<YYYY-MM>`. A
  folder key is the server's key verbatim: a trailing `/` names the files directly in that
  folder, no trailing slash names its subtree, and the empty key is the drive root. A
  `month:` key is `YYYY-MM`; any other key is unknown, and the page opens Home.

A `group` or `sort` the URL leaves out, or states unreadably, opens on the choice
remembered for the target in force (else the app default), and the page replaces the URL
with it once the Library is drawn, without a history entry. A `tag:`, `untagged`, `folder:`
or `month:` shelf page fills in `sort` the same way, and its back link is
`?view=all&group=<tags|folder|month>&sort=<sort>`. The Notes Library's URLs always carry
`sort` (`updated`, `title` or `created`) for the same reason; its rail segment is not a URL
parameter, and `folder` or `tag` in the URL selects an entry and implies the segment.

The Library's filters are in the URL too: `tag` (repeated; a clip must carry every one)
and `trust` (`unverified` or `verified`), and `q`, the name filter (title or folder path
contains it; trimmed and cut to 200 characters, rewritten by replace when it is not). A filter change replaces the URL without a
history entry. Every grouping, every `tag:`, `untagged`, `folder:` and `month:` shelf page
and that page's back link carry them; Home and its shelf kinds (`unread`, `recent`, `new`,
`unverified`) ignore them. The Home and Library tab links carry none, a Target choice drops
them (as does a Home-shortcut landing on another Target), and any other `trust` value is removed from the URL by replace. The tag menu's
candidates come from the core `tag-counts` route under every condition in force.

### Opening Notes or Clips on a Target

Notes on any view (`/drive/{drive}/addons/knowledge`) and Clips on any view
(`/drive/{drive}/addons/knowledge/clips`) read `target` from the URL: a Smart Collection
id, or `collection:<collection id>`. The page holds every listing, shelf and count until
the list that resolves the id answers, then saves that Target as the one the menu would
choose and removes `target` from the URL without a history entry. An id that is not in the
drive, `default` or an empty value leaves the saved Target in force, writes nothing and is
removed the same way.

### Covers and sites

The cover and site of a card are read from the start of each clip (the first 4096 bytes); nothing is stored.

- The cover is the first Markdown image `![alt](target)` after the frontmatter. A `loft://<file id>` target is used when that file is an active image of the same drive, and is drawn through the core's thumbnail route. An absolute `http(s)` URL is drawn directly by the browser from its host, with `referrerpolicy="no-referrer"`, so the clip's source site (or the image's host) sees the request. HTML `<img>` is not read. A cover that is missing or fails to load leaves a plain block.
- The site is the host of the frontmatter `url` when it is an `http(s)` URL, else of the first `http(s)` link after the frontmatter that is not an image. It is lower-cased, without a port and without a leading `www.`.

The bookmarklet on the Clips page opens `/drive/{drive}/addons/knowledge/clips?prefill=…&title=…&autosubmit=1`, so a bookmarklet clip is made and shown on Clips. A bookmarklet installed earlier still opens Notes, which passes the same parameters on to Clips.

## Web clipping

Clip a web page from **Clip a web page** on the Clips page, from **Clip web page** in the **Add** menu, or with the bookmarklet offered on the Clips page.

Litloft creates the note at once and fetches the page in the background. It keeps the article, removes scripts and page furniture, converts it to Markdown, and renames the note after the article's title. If you edit the note before the fetch finishes, your edit is kept and the fetched text is discarded.

- If a URL was clipped before, Litloft asks: **Open existing**, **Create new** or **Cancel**. A URL whose earlier clips all failed is clipped again without asking.
- A clip from the **Add** menu saves into the folder the menu was opened in. When it is ready, a notice says **Clipped: {title}**, or **A web page could not be clipped**.
- If Litloft cannot fetch a page, for example one behind a login, you can paste the page's HTML instead. Nothing is fetched then.

### Clips are unverified

Every clip is saved as an **unverified** source. It can be searched at once, but Ask does not use it as evidence until you press **Trust as a source** on its file page. See [Trusted sources](../user-guide/file-browsing.md#trusted-sources-and-the-review-queue).

Because of this, `CORE_INTERNAL_SECRET` must be set on both containers. Without it, the clip cannot be marked unverified, so clipping fails (`502`) rather than saving the page as a trusted source. The empty placeholder note is left in the folder.

### Notes saved from Ask are unverified

Every note saved through Ask's **Markdownで保存**, from the drive's Ask page or a file's **Ask** tab, is saved as an **unverified** source. It can be searched, but Ask does not use it as evidence until you press **Trust as a source** on its page: an earlier answer from the model must not come back as evidence for a later question. See [Trusted sources](../user-guide/file-browsing.md#trusted-sources-and-the-review-queue).

Ask notes already in the library are declared unverified at the addon's next start. When the declaration at save time fails, the save answers `502` with a detail saying the note was saved but could not be marked unverified; the note stays where it was written and is declared at the next start. `CORE_INTERNAL_SECRET` must be set on both containers for this, as for clips.

### Pages that are refused

To keep a clip URL from reaching inside your network, Litloft refuses:

- anything other than `http` and `https`;
- the Docker service names `backend`, `frontend`, `knowledge`, `intelligence`, `postgres`, `redis` and `localhost`;
- addresses that are private, loopback, link-local, multicast, reserved, unspecified or in `100.64.0.0/10`, and names that resolve to them or do not resolve;
- responses that are not HTML;
- redirects from `https` to `http`, and more than five redirects. Every redirect is checked again.

## Create note and summary note

**Create note** in any file's `...` menu creates a note whose frontmatter already cites that file, and opens it.

A file's summary note is the **Note** panel under the player on a video, audio or `.loft` file, the last block of **Info** before the comments on a file without a player (in the sheet's **Info** on a phone), and a **Summary note** section under the text on a Markdown note or a plain-text document. Every form shows the note chosen as the summary of that file, with **Edit in Knowledge**. With the [intelligence addon](intelligence.md), **Save as file** on an AI detailed summary saves it as a note and makes it that file's summary note.

## Connections graph

The graph shows the drive's notes and files as points and their connections as lines. It is at `/drive/{drive}/addons/knowledge/connections`. Open it from **See this note in the graph** under a note in the Notes Library, or from **See connections as a graph** in the **Related** tab of a Markdown or text file.

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
| `POST /clip-covers` | The cover and site of the given clips, for cards. See [POST /clip-covers](#post-clip-covers). |
| `POST /captures/commit` | Save capture basket items into a note. *profile* |
| `POST /notes` | Create a note with a given folder, filename and content. *profile* |
| `POST /note-from-file` | Create a note citing a file. *profile* |
| `POST /distill` | Save a summary as a note and make it the file's summary note. *profile* |
| `GET /notes/by_source_file/<id>` | Notes that cite a file. |
| `POST /note-openings` | The first lines of the given notes, for lists. |
| `GET /notes/with-sources` | Ids of the drive's notes that cite at least one source file. |
| `POST /notes/sources` | The source files of the given notes, in citation order. |
| `GET /search?q=` | Search the text of the drive's notes. |
| `GET /connections-graph` | The drive's connections graph. |
| `POST /resync-tags/<file_id>` | Copy a note's frontmatter tags into Litloft's tag list. |
| `POST /file_active_summary`, `GET` / `DELETE /file_active_summary/<file_id>` | A file's summary note. |
| `GET /file_active_summary/<file_id>/note` | The summary note to show on a file page. |

### POST /clip-covers

Request: `{"file_ids": ["<id>", ...]}`, at most 60 ids. Needs `X-Lit-Drive`; no profile is needed.

Response: `{"covers": {"<id>": {"image_id": string|null, "image_url": string|null, "site": string|null}}}`. Only active text files of the request's drive that the caller may read get an entry; any other id is absent, so a locked or other drive's file is not revealed. `image_id` is the id of an image file in the drive, `image_url` an external image URL; at most one is set. A file whose start cannot be read, or whose cover and site are not found, answers all three as `null`. If the check of the `loft://` image ids fails, every `image_id` is `null` and the rest of the answer stands. Nothing is stored. The rules for the cover and the site are under [Covers and sites](#covers-and-sites).

| Status | When |
|---|---|
| `400` | `X-Lit-Drive` is missing. |
| `422` | More than 60 ids. |
| `502` | The backend's access check or file lookup failed. |

### Notes that cite sources

Both routes need `X-Lit-Drive` and no profile, and answer only for notes the addon has indexed in that drive.

`GET /notes/with-sources` answers `{ "ids": ["<note id>", ...] }`, sorted, for every indexed note of the drive that cites at least one source file in `source_file_ids`.

`POST /notes/sources` takes `{ "file_ids": ["<note id>", ...] }`, 1 to 60 ids (anything else is `422`; repeated ids are read once), and answers:

```json
{ "notes": { "<note id>": [
  { "source_file_id": "...", "title": "...", "filename": "...", "folder_path": "...",
    "mime_type": "...", "has_thumbnail": true, "locator": { "t": 83 } }
] } }
```

- A note that is not indexed in the drive is absent from `notes`; a note with no resolvable source has an empty list.
- Sources are in the order of `source_file_ids`. A source that does not exist, or is in another drive, is left out.
- `locator` is the position of the note's first `loft://<source id>?t=<seconds>` or `?page=<n>` link to that source in the body, as `{ "t": seconds }` or `{ "page": n }`, and `null` when the body has none.
- The note texts are read through the backend. When a note cannot be read, its sources come from the index, in id order, and its locators are `null`.
- `503` means the addon's index (`Knowledge index unavailable`) or the backend's file lookup (`File lookup unavailable`) could not be reached.

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
