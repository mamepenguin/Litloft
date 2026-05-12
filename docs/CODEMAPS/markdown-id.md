# Markdown links: frontmatter `id:` + wiki-link resolver (Phase A + B)

**Last Updated:** 2026-05-13
**Spec:** `docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md` §1-3 + §4 Phase A, B

Phases A and B of the 3-form Markdown link feature.

- **Phase A (landed)** — every `.md` file gets a Zettelkasten-style `id:` in its frontmatter, mirrored to a `File.md_id` column.
- **Phase B (landed)** — wiki-link extraction (`[[X]]`) + drive-scoped resolver, projection of frontmatter `aliases:` to `File.md_aliases`, and a per-file resolver endpoint that the renderer (Phase C) will consume.

Canonical / projection split mirrors the existing tags rule (`.claude/rules/design-decisions.md` → "Tag editing"): frontmatter is canonical, the `File.md_*` columns are projection caches. Phase C (renderer), Phase D (rename rewrite), and Phase E (LLM output policy) are out of scope here.

## Shared helpers

- `backend/app/services/frontmatter.py` — `ensure_id(metadata, existing_id, now) -> (new_metadata, id)` + `compose(metadata, body) -> str` + `extract_valid_aliases(metadata) -> list[str]`. Pure / immutable. `id` format `^\d{12,17}$`, base `YYYYMMDDhhmmss` (UTC); same-second collision disambiguation is the caller's job. `extract_valid_aliases` enforces `_MAX_ALIASES=20`, `_MAX_ALIAS_LEN=100`, case-sensitive dedup, drops non-strings (no YAML-bool coercion).
- `addons/knowledge/app/services/frontmatter.py` — sibling implementation with identical signatures (cross-container duplication, drift caught in PR review).

## Wiki-link extractor + resolver (Phase B)

`backend/app/services/markdown_relations.py` — single source of truth for parsing the 3 link forms inside `.md` bodies.

- `extract_links(content) -> ExtractedLinks(loft_ids, wiki_targets)` — regex pass over the body. Honours CommonMark `\[` escapes (placeholder swap before matching, so `\[\[X\]\]` is not captured). Wiki regex `\[\[([^\]\[\|#]+?)(?:#[^\]\|]+)?(?:\|[^\]]+)?\]\]` captures the target only; `[[X|disp]]` and `[[X#head]]` collapse to `X`. `loft://` regex requires exactly 12 file-id chars and consumes any trailing query/fragment.
- `resolve_wiki_targets(db, drive, self_dir, targets) -> (resolved_ids, diagnostics)` — batched resolution. Used by `_sync_md_file_relations` for the `file_relations` diff.
- `resolve_wiki_targets_with_map(db, drive, self_dir, targets) -> (target_to_id, diagnostics)` — variant that preserves the `target → file_id` mapping. Used by `GET /wiki-resolutions`.
- Dataclasses: `ExtractedLinks` (frozen — `loft_ids`, `wiki_targets`) and `ResolveDiagnostic` (`target`, `kind: "unresolved" | "ambiguous"`, `candidates: list[str]`).
- Pure read against the ORM session; callers own the commit boundary.

### Resolver precedence (spec §3.3, strict)

Walked in order; the first rule with hits stops the chain. Ambiguity is intra-rule only — a basename hit on a different file wins over an alias hit on others; the resolver does not fall through after a single basename hit.

1. `^\d{12,17}$` → `File.md_id` exact match (drive-local).
2. `./` / `../` prefix → relative-from-`self_dir` (`<basename>.md` auto-completed).
3. Contains `/` → relative-from-`self_dir`, then absolute-from-drive-root.
4. `Path(filename).stem` match across the drive (case-sensitive).
5. `File.md_aliases` (JSON list) contains the target.
6. Otherwise → unresolved.
7. Multiple intra-rule hits → ambiguous (`candidates` carries `file_path` per row).

Cross-drive resolution never happens (drive = security boundary, hako `cRNeIvcbhz449BwTmof5m`).

## Core write path

- `backend/app/routers/files.py`
  - `_inject_md_id(db, file, body)` + `put_file_content` handler. For `.md` writes: parses frontmatter → `ensure_id` → collision check against `File.md_id` in the same drive → rewrites body bytes → atomic disk write → projects `injected_md_id` onto `File.md_id` in a separate commit (durability isolated from the content write, same pattern as the tags projection).
  - **Phase B additions**, all isolated in their own try/commit blocks so a projection or sync failure cannot roll back the durable content write:
    1. Frontmatter `aliases:` → `File.md_aliases` (JSON-encoded list, or `NULL` if empty).
    2. `_sync_md_file_relations(db, file_id, drive, content, self_dir)` rewritten to delegate to `extract_links` + `resolve_wiki_targets`. Now returns diagnostics; the loft-id set and the resolved wiki-id set are unioned, self-references stripped, and the result diffed against `file_relations` for INSERT / DELETE.
  - `GET /api/files/{file_id}/wiki-resolutions` — Phase B endpoint. Reads the body from disk (not the DB), runs `extract_links` + `resolve_wiki_targets_with_map`, and emits a per-target verdict. Response shape:

    ```json
    {
      "resolutions": {
        "<target>": {"kind": "resolved", "file_id": "<id>"},
        "<target>": {"kind": "unresolved"},
        "<target>": {"kind": "ambiguous", "candidates": ["..."]}
      }
    }
    ```

    Errors: `404` for unknown / trashed / missing / inaccessible (password-gated drives stay hidden, not forbidden); `415` for non-markdown files. Iteration order matches body order for deterministic UI rendering.

- `backend/app/models.py`
  - `File.md_id: Mapped[str | None]` (`String(32)`) + `idx_files_drive_md_id` index on `(drive, md_id)`.
  - `File.md_aliases: Mapped[str | None]` (`Text`, JSON-encoded list, drive-scoped). **No index** — alias lookup is a drive-scoped scan, bounded by the drive = security boundary rule.

- `backend/app/database.py`
  - `_migrate` block (search: `Spec 2026-05-12-markdown-link-three-forms`) adds `md_id` + its index, then `md_aliases`, via `ALTER TABLE` / `CREATE INDEX IF NOT EXISTS`. Forward-only, idempotent on a populated DB.

- `backend/app/services/scanner.py`
  - `_ensure_md_id_for_new_file` is the core-side first-detect injector for both `id` *and* `aliases`. When a new `.md` row is created, it parses the frontmatter once and projects `extract_valid_aliases(...)` onto `File.md_aliases` alongside the `id` write. Projection failures are logged but never roll back the row insert.

## Knowledge addon path

- `addons/knowledge/app/services/note_scanner.py` — `_maybe_fill_frontmatter_id(...)`. During the reconcile loop, when a note's frontmatter has no valid `id`, the addon composes a new body and writes it through `client.put_file_content(file_id, content, if_match)`. 412 etag-mismatch is a soft failure (retried next pass); 403/404 are protected-error signals; other write failures are logged and not retried. Phase B reused this write path — once the body lands via `PUT /content`, the core projects aliases as part of its post-write pipeline.
- `addons/knowledge/app/internal_client.py` — `put_file_content(file_id, content, if_match) -> etag` (pre-existing wrapper).

## Tests

- `backend/tests/services/test_markdown_relations.py` — extractor (6 forms incl. escape handling) + resolver (every rule, ambiguous, unresolved, drive-isolation).
- `backend/tests/services/test_frontmatter.py` — `extract_valid_aliases` caps / dedup / coercion drops.
- `backend/tests/routers/test_files_content_sync.py` — `PUT /content` projects aliases + diffs `file_relations` via the new resolver path.
- `backend/tests/routers/test_files_wiki_resolutions.py` — endpoint shape, 415 / 404 paths, drive-gating.

## Out of scope here

- Renderer (`MarkdownPreview.tsx` wiki_link inline rule, unresolved-click dialog) — Phase C.
- Editor `[[` autocomplete — Phase C.
- Rename rewrite (`.md` basename change cascades into other `.md` bodies) — Phase D.
- LLM output policy (intelligence → knowledge save uses `[[id]]`) — Phase E.
- `PUT /content` `link_diagnostics` response payload — deferred (spec §3.5); the per-file `GET /wiki-resolutions` endpoint covers the renderer's needs today and is read-on-demand rather than write-piggybacked.
