# Markdown frontmatter `id:` (Phase A)

**Last Updated:** 2026-05-13
**Spec:** `docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md` §1-3 + §4 Phase A

Phase A of the 3-form Markdown link feature: every `.md` file gets a Zettelkasten-style `id:` in its frontmatter, mirrored to a `File.md_id` column. This is the substrate Phase B+ (wiki-link extraction, resolver, rename rewrite) will build on. Phase A does **not** add wiki-link parsing, resolution, or rewrites — that scope is excluded here.

Canonical / projection split mirrors the existing tags rule (`.claude/rules/design-decisions.md` → "Markdown frontmatter `id:`" / "Tag editing").

## Shared helpers

- `backend/app/services/frontmatter.py` — `ensure_id(metadata, existing_id, now) -> (new_metadata, id)` + `compose(metadata, body) -> str`. Pure / immutable. `id` format `^\d{12,17}$`, base `YYYYMMDDhhmmss` (UTC). Same-second collision disambiguation is the caller's job.
- `addons/knowledge/app/services/frontmatter.py` — sibling implementation with identical signatures (cross-container duplication, drift caught in PR review).

## Core write path

- `backend/app/routers/files.py` — `_inject_md_id(db, file, body)` (helper) and `put_file_content` handler. For `.md` writes: parses frontmatter → `ensure_id` → collision check against `File.md_id` in the same drive → rewrites body bytes → atomic disk write → projects `injected_md_id` onto `File.md_id` in a separate commit (durability isolated from the content write, same pattern as the tags projection).
- `backend/app/models.py` — `File.md_id: Mapped[str | None]` column + `idx_files_drive_md_id` index on `(drive, md_id)`.
- `backend/app/database.py` — `_migrate` block (search: `Spec 2026-05-12-markdown-link-three-forms`) adds the column and index in-place via `ALTER TABLE` / `CREATE INDEX IF NOT EXISTS`.

## Knowledge addon path

- `addons/knowledge/app/services/note_scanner.py` — `_maybe_fill_frontmatter_id(...)`. During the reconcile loop, when a note's frontmatter has no valid `id`, the addon composes a new body and writes it through `client.put_file_content(file_id, content, if_match)`. 412 etag-mismatch is a soft failure (retried next pass); 403/404 are protected-error signals; other write failures are logged and not retried.
- `addons/knowledge/app/internal_client.py` — `put_file_content(file_id, content, if_match) -> etag` (pre-existing wrapper over `PUT /api/files/{id}/content`; reused, not introduced by Phase A).

## Out of scope for Phase A

- Wiki-link extractor / `services/markdown_relations.py` — Phase B.
- `File.md_aliases` column and `aliases:` reading — Phase B.
- `GET /api/files/{id}/wiki-resolutions` — Phase B.
- Renderer / Editor autocomplete — Phase C.
- Rename rewrite — Phase D.
- Core scanner injection at first-detect — landing in a later phase; for now first-touch happens on the next write through `PUT /content` or `note_scanner`.
