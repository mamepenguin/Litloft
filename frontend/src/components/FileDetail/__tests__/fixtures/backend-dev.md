# Backend development

The backend is FastAPI + SQLite (SQLAlchemy) + ffmpeg. Code is under `backend/app/`, tests under `backend/tests/`.

The rules for this code are in [`.claude/rules/backend-conventions.md`](../../.claude/rules/backend-conventions.md) and [`.claude/rules/design-decisions.md`](../../.claude/rules/design-decisions.md). Read them before changing the backend; this page does not repeat them.

## Running locally

Run the backend and its tests inside Docker. The pinned Pydantic does not work with a local Python 3.14.

```bash
docker compose up -d --build backend
docker compose exec backend bash    # interactive shell

# Tests (build context is the repo root)
docker build -f backend/Dockerfile.test -t litloft-test .
docker run --rm litloft-test
```

## Code layout

```
backend/app/
├── main.py            # entry point: startup scan, sentinel migration, restart_pending clear, addon loading
├── config.py          # drives.json reader, DATA_DIR, sentinel and flag paths
├── database.py        # engine, sessions, _migrate()
├── models.py          # ORM models, active_file_filter()
├── schemas.py         # Pydantic schemas
├── auth.py            # JWT, viewer_id, is_admin / require_admin
├── routers/           # admin, admin_config, admin_markdown_images, auth, collections, comments,
│                      # drive_policies, drives, files, progress, smart_folders, uploads, ws,
│                      # addon_proxy, internal (/api/internal/*)
└── services/          # scanner, fileops, thumbnail, upload, heic, subtitle, hash, ws, event_hooks,
                       # frontmatter, markdown_relations, safepath, atomic_write, config_writer, …
```

## Helpers to use

| Need | Use |
|---|---|
| Resolve a user-supplied path inside a drive | `app.services.safepath.resolve_safe_path(drive, rel_path)` |
| List files | `.filter(active_file_filter())` from `app.models`. Never write `deleted_at.is_(None)` by hand. |
| Restore a file | `app.services.fileops.restore_file()`. It clears both `deleted_at` and `missing_since`. |
| Replace a file in a drive | `app.services.atomic_write.replace_file_contents()` / `replacing_file()` (keeps the file's mode) |
| Write a generated file under `DATA_DIR` | `app.services.atomic_write.write_generated_file()` / `generating_file()` |
| Rewrite `drives.json` / `passwords.json` | `app.services.config_writer.atomic_write_json()`. It keeps a `.bak` and touches `restart_pending` unless told not to. |
| Emit a lifecycle event (`files.*`, `scan.complete`) | `app.services.event_hooks.emit()` from async code, `emit_from_thread()` from a sync handler, `emit_sync()` from the scanner thread. These notify addon webhooks and connected browsers. |
| Send a browser-only WebSocket event from a thread | `app.services.ws.broadcast_from_thread(event, data, drive=...)` |

## Authentication helpers

In `app.auth`:

- `get_unlocked_groups(request)`: the groups in the caller's JWT, read from an `Authorization: Bearer` header if present, otherwise from the `access_token` cookie; `[]` when there is none.
- `check_drive_access(drive, groups)`: raises 404 when the drive is locked for the caller.
- `is_admin(groups)` / `require_admin(request)`: the admin check. Use `Depends(require_admin)` on admin routes.
- `get_viewer_id(request)`: the 16-character `viewer_id` from the `lit_viewer` cookie or `X-Lit-Viewer` header, or `None`.

## Markdown

- `app.services.frontmatter`: `parse`, `compose`, `ensure_id`, `extract_valid_tags`, `extract_valid_aliases`. They are pure: use the returned dict, do not mutate `metadata`. For a `.md` write, run `ensure_id` before writing the bytes so `File.md_id` and the file agree (see `_inject_md_id` in `routers/files.py`).
- A second copy of the parser is in `addons/knowledge/app/services/frontmatter.py`. Change both together.
- `app.services.markdown_relations`: extracts `[[wiki links]]` and `loft://` references, resolves wiki targets within one drive, syncs `file_relations`, and rewrites `[[old]]` links in other notes of the same drive when a `.md` file is renamed or moved (`rewrite_basename_in_drive`). The rewrite does not touch frontmatter.
- In `PUT /api/files/{id}/content`, each projection (`md_id`, tags, aliases, relations, thumbnail) commits in its own `try` block after the content write, so a failed projection never undoes the write.

## Thumbnails

Shapes and sizes are specified in `backend-conventions.md`. `GET /api/files/{id}/thumbnail` sends `Cache-Control: no-cache` and answers `If-None-Match` itself, because the URL stays the same when a thumbnail is regenerated. Keep both if you change the handler.

## Adding an endpoint

1. Add the route to a router under `backend/app/routers/`.
2. Add request and response schemas to `backend/app/schemas.py`.
3. Put the logic in `backend/app/services/`.
4. Add tests under `backend/tests/`.
5. Document a public endpoint in the [HTTP API reference](../reference/api.md).
6. An Internal API endpoint must pass the [Internal API policy](addon-dev.md#internal-api-policy), needs the two-layer contract tests described in [`.claude/rules/internal-api-policy.md`](../../.claude/rules/internal-api-policy.md), and is documented in [ADDON-DEVELOPMENT.md](../ADDON-DEVELOPMENT.md#internal-api).

## Database changes

- Change the model in `models.py`.
- Add the migration to `_migrate()` in `database.py`. It must be idempotent and safe on a database that already has rows.
- A new NOT NULL column needs a default and a backfill in the migration.

## Logging

Use `logging.getLogger(__name__)`. The level is INFO, set in `main.py`. Do not log a path from a request body before it has passed the path check.

## Prohibitions

- No addon-specific code in core. Addons may import core; core never imports addons.
- Never return password values from `passwords.json` to the client; the admin API masks them as `***`.
- No language-dependent rules in LLM or string-processing code (see `backend-conventions.md`).
- Do not block the event loop with CPU-bound work; run it with `asyncio.to_thread()` or an executor.

## See also

- [Architecture](architecture.md)
- [Addon development](addon-dev.md)
- [Testing](testing.md)
