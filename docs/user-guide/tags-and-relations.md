# Tags and file relations

Litloft's tagging is structured but understated. There is no hierarchy and no global tag list — tags are per drive, applied flat. File relations are a separate, typed graph.

## Tags

Open any file's viewer; a **chip editor** below the title lets you add or remove tags. Tags auto-complete from the drive's existing tag set.

### Where tags live

The canonical store depends on the file extension:

| File type | Canonical store | Notes |
|---|---|---|
| `.md` | YAML frontmatter (`tags: [...]`) | `File.tags` is a projection cache. |
| Everything else | `Tag` table + `file_tags` junction in the DB | Edited via the chip editor. |

For Markdown files, edits to the chip editor rewrite the YAML frontmatter via `PUT /api/files/{id}/content`; the backend's content handler then re-projects `File.tags` from the new frontmatter inside the same transaction.

If the projection fails (e.g., the projection step crashes after the content write), the content write is still durable. A subsequent edit will re-project.

The frontmatter parser is implemented twice — once in core (`backend/app/services/frontmatter.py`) and once in the knowledge addon (`addons/knowledge/app/services/frontmatter.py`) — because they live in different containers. Drift is caught in PR review.

### Frontend always uses `saveFileTags`

The frontend has a single helper, `saveFileTags(file, tags)`. It internally branches on MIME / extension. The UI layer must not decide where to write — see `frontend/src/lib/api.ts`.

### Why split?

The split optimises for the *primary* tool used to manage each file type:

- For Markdown notes, your editor of choice (Obsidian, Helix, plain `vim`) typically stores tags in YAML frontmatter. Litloft following that convention means external editing stays in sync without extra orchestration.
- For everything else (videos, images, PDFs), there is no equally universal in-file tagging convention, so a database table is the simplest source of truth.

### Tag filtering and search

- Tag filter chips are available on every folder browser and on the search page.
- Multiple tags act as AND.
- The filter applies to both Markdown frontmatter tags and database tags transparently — the projection makes them indistinguishable to the query layer.

### Auto-tags (intelligence addon)

When the `intelligence` addon is enabled with `features.auto_tags = "manual"` or `"on_index"`, the LLM proposes tags for each file. Proposals are **not applied silently**:

- The chip editor shows them as **Suggested**.
- You **Approve** or **Dismiss** each tag.
- Approve writes through `saveFileTags` (and retries once on `ConflictError`).

See [intelligence addon → auto-tags](../addons/intelligence.md#auto-tags).

### Internal API write endpoint

`POST /api/internal/files/{id}/tags` (gated by `CORE_INTERNAL_SECRET`) is reserved for the knowledge addon's note scanner, which needs to project frontmatter changes detected by an external editor. **Frontends must not call this** — use the public `PUT /api/files/{id}/tags` instead.

## File relations

A *file relation* is a typed link between two files in the same drive: `(file_a, file_b, kind)`.

- The set of valid `kind` values is enforced at the application layer, not by a DB constraint, so addons can extend it. Common kinds:
  - `related` — a generic "see also" link.
  - `prev` / `next` — a sequence (chapters).
  - Addon-specific kinds (e.g., `summary_target`, `note_origin`).
- Relations are **bidirectional in queries**. A `WHERE` lookup for relations of file X returns rows where X is in either column.
- Both ends of a relation must be in the same drive; cross-drive links return `400 Bad Request`.
- The foreign key to `files.id` is `ON DELETE CASCADE` — purging a file removes its relations.

### Markdown-derived relations

For `.md` files, the backend extracts every `loft://<file_id>` link in the body and synchronises them into the relations table on save. So a Markdown note that links to other Litloft files automatically populates that file's *Related* section, and vice versa.

### Where relations show up

- The file detail page has a **Related files** section listing all relations.
- Search results (semantic mode) can promote related files when relevance is close.

### API

- `POST /api/internal/file_relations` — create.
- `GET /api/internal/file_relations?file_id=...` — list both directions.
- `DELETE /api/internal/file_relations/<id>` — remove.

The Internal API is for addon-to-core writes. The frontend reads relations from the file detail data payload directly. See [Internal API policy](../developer-guide/addon-dev.md#internal-api-policy) for the rules.
