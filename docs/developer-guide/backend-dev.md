# Backend development

The backend is FastAPI + SQLite + SQLAlchemy + ffmpeg. Code lives under `backend/app/`. Tests under `backend/tests/`.

## Running locally

The Pydantic version Litloft pins is incompatible with local Python 3.14, so always run the backend inside the container:

```bash
docker compose up -d --build backend
docker compose exec backend bash    # interactive shell
```

For tests:

```bash
docker build -f backend/Dockerfile.test -t litloft-test backend/
docker run --rm litloft-test
```

## Code layout

```
backend/app/
├── main.py            # entry point; startup scan, sentinel migration, restart_pending clear
├── config.py          # drives.json/passwords.json reader, DATA_DIR, sentinel paths
├── database.py        # SQLAlchemy engine, sessionmaker, migrations
├── models.py          # ORM models, active_file_filter()
├── schemas.py         # Pydantic schemas
├── auth.py            # JWT, viewer_id, is_admin_viewer
├── routers/
│   ├── files.py       # streaming, metadata, tags, content, progress
│   ├── drives.py      # drive listing, folder traversal, dashboard
│   ├── playlists.py
│   ├── auth.py
│   ├── uploads.py
│   ├── progress.py
│   ├── ws.py
│   ├── admin.py
│   ├── admin_config.py
│   ├── comments.py
│   ├── addon_proxy.py
│   └── internal.py    # /api/internal/*
└── services/
    ├── scanner.py
    ├── fileops.py
    ├── thumbnail.py
    ├── upload.py
    ├── heic.py
    ├── subtitle.py
    ├── preview.py
    ├── hash.py
    ├── ws.py
    ├── addon_registry.py
    └── config_writer.py
```

## Conventions

### `config` import

Use `app.config` as a module reference. Direct imports break test-time path patching:

```python
# CORRECT
import app.config as config
config.DATA_DIR

# WRONG — patches don't take effect
from app.config import DATA_DIR
```

### Path traversal defence

Always look up `file_path` from the DB by ID → normalise with `os.path.realpath()` → verify it lives under `base_dir`. Never trust a user-supplied path.

### Active file filter

Default file queries go through `app.models.active_file_filter()`. Do **not** write `deleted_at.is_(None)` by hand — you will miss the missing-files exclusion and accidentally serve stale data.

```python
from app.models import File, active_file_filter

q = session.query(File).filter(active_file_filter())
```

### Restore semantics

`restore_file()` clears **both** `deleted_at` and `missing_since` as a defensive safety net, even though only one is supposed to be set at a time. This protects against future bugs and out-of-band edits.

### Concurrency

- Scanner uses `asyncio.Lock`. Second concurrent invocation returns 409.
- Sprite generation: `asyncio.Semaphore(2)` plus an in-progress dict to dedup the same file.
- ZIP extraction: `asyncio.Semaphore(3)` global.
- Atomic writes: `.tmp` then `os.replace()`. Use `app.services.config_writer.atomic_write_json()` for JSON.

### Thumbnails

- Video thumbnails: ffmpeg's `thumbnail=300` filter picks a representative frame after skipping the first 10%.
- Image thumbnails: Pillow resize.
- HEIC: **Pillow with pillow-heif**, never ffmpeg (ffmpeg lacks libheif and produces black thumbnails).
- All thumbnails: 320x180 JPEG.

### Markdown frontmatter helpers

`app.services.frontmatter` exposes `parse`, `compose`, and `ensure_id`. They are all pure / immutable — never mutate the `metadata` dict in place; use the returned dict.

For `.md` writes, run `ensure_id(metadata, existing_id=file.md_id, now=...)` **before** writing bytes to disk so the `File.md_id` projection and the on-disk frontmatter agree. Same-second collision disambiguation (3-digit ms suffix → 17 chars) is the caller's job; `ensure_id` itself stays pure. The canonical example is `_inject_md_id` in `routers/files.py`.

A sibling implementation lives at `addons/knowledge/app/services/frontmatter.py` (cross-container duplication, drift caught in PR review). Change them together. See spec `2026-05-12-markdown-link-three-forms.md` §3.1 and the "Markdown frontmatter `id:`" section of `.claude/rules/design-decisions.md`.

## Adding an endpoint

1. Add the route to the appropriate router under `backend/app/routers/`.
2. Define request/response schemas in `backend/app/schemas.py`.
3. Move business logic into `backend/app/services/<name>.py`.
4. Add tests under `backend/tests/`.
5. If the endpoint is public, document it in [HTTP API reference](../reference/api.md).
6. If the endpoint is internal (addon-facing), it must satisfy [Internal API policy](addon-dev.md#internal-api-policy). New internal endpoints require a contract test in `tests/test_internal_api_contract.py` (see hako entry `VHE7K0KWjIzV3M1CyfDAN` for the pattern).

## Database changes

- Edit `models.py` for the schema change.
- Add a migration in `database.py` (forward-only).
- Run tests; the migration must be idempotent and safe on a populated DB.
- Document any backfill expectations.

If you add a new lifecycle column with NOT NULL, provide a default and backfill in the migration. Never assume an upgrade has zero existing rows.

## Authentication helpers

`app.auth`:

- `decode_jwt(request)` — read and validate the cookie; returns `JWTPayload` or `None`.
- `require_admin(request)` — FastAPI dependency that 403s non-admins.
- `is_admin_viewer(payload)` — predicate on a payload.
- `viewer_id_from_request(request)` — derive the 16-char ID from the `lit_viewer` cookie.

Always prefer the dependency style (`Depends(require_admin)`) over inline checks; tests then mock the dependency.

## WebSocket emits

Background threads (the scanner) cannot directly call `await ws.broadcast()`. Use the bridge:

```python
loop.run_in_executor(None, lambda: loop.call_soon_threadsafe(ws.broadcast, event))
```

…or use the helper in `app.services.ws`. This keeps event ordering consistent with HTTP responses.

## Prohibitions

- Do **not** embed language-dependent rules into LLM or string-processing logic. Searching for the literal string `"タイトル"` to detect a Markdown title is a maintenance trap; rely on structural cues (frontmatter, H1) instead.
- Do **not** add addon-specific code paths to core. The dependency is unidirectional: addons may import core, never the other way.
- Do **not** read `passwords.json` content fields back to the client; use `***` masking.

## Logging

- `logging.getLogger("litloft.<module>")`.
- Default level is INFO; set `LOG_LEVEL=debug` in env to lower.
- Avoid logging file paths from request bodies before the path-traversal check.

## Performance

- Use SQLAlchemy 2.x select() style for new code.
- For hot paths (search, dashboard), index columns explicitly in `models.py`.
- Sprite and HEIC conversions are CPU-bound; never block the event loop — push to `asyncio.to_thread()`.

## See also

- [Architecture](architecture.md)
- [Addon development](addon-dev.md)
- [Testing](testing.md)
