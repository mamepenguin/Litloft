# Markdown links: frontmatter `id:` + wiki-link resolver + renderer + rename rewrite (Phase A + B + C + D)

**Last Updated:** 2026-05-13
**Spec:** `docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md` §1-3 + §4 Phase A, B, C, D

Phases A, B, C, and D of the 3-form Markdown link feature.

- **Phase A (landed)** — every `.md` file gets a Zettelkasten-style `id:` in its frontmatter, mirrored to a `File.md_id` column.
- **Phase B (landed)** — wiki-link extraction (`[[X]]`) + drive-scoped resolver, projection of frontmatter `aliases:` to `File.md_aliases`, and a per-file resolver endpoint that the renderer (Phase C) consumes.
- **Phase C (landed)** — frontend layer: `markdown-it` inline rule for `[[X]]`, a fetch-and-render wrapper that pulls resolutions per file, the Knowledge editor's `[[` autocomplete dropdown, and a new-note dialog for unresolved targets.
- **Phase D (landed)** — when a `.md` file is renamed, `[[old_basename]]` references in other `.md` files in the same drive are rewritten to `[[new_basename]]`. Hooked from both the explicit rename API and the scanner's hash-based move detection.

Canonical / projection split mirrors the existing tags rule (`.claude/rules/design-decisions.md` → "Tag editing"): frontmatter is canonical, the `File.md_*` columns are projection caches. Phase E (LLM output policy) remains out of scope here.

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

## Frontend renderer + editor (Phase C)

Frontend layer that consumes `GET /api/files/{id}/wiki-resolutions` and turns `[[X]]` into the three documented DOM shapes (`wiki-link wiki-resolved` / `wiki-unresolved` / `wiki-ambiguous`; CSS tokens recorded in `DESIGN.md` §2.3).

- `frontend/src/lib/api.ts`
  - `WikiResolveResult` discriminated union — `{kind: "resolved", file_id}` / `{kind: "unresolved"}` / `{kind: "ambiguous", candidates}`.
  - `getWikiResolutions(fileId) -> Promise<Record<string, WikiResolveResult>>` — unwraps the `{resolutions: ...}` envelope, throws on `404` (file not found / inaccessible) and `415` (not markdown). Callers pass the returned map straight through as the `wikiResolution` prop.
- `frontend/src/components/MarkdownPreview.tsx`
  - New `markdown-it` inline rule registered with `md.inline.ruler.before("link", "wiki_link", ...)`. Recognises `[[X]]`, `[[X|disp]]`, `[[X#heading]]` and emits one of the three DOM shapes. The resolution map rides on `env.wikiResolution`; absence of an entry falls back pessimistically to `wiki-unresolved` so the body still renders before the resolutions fetch returns.
  - New prop `wikiResolution?: Record<string, WikiResolveResult>` on `<MarkdownPreview>` and on the underlying `renderMarkdownToSafeHtml` helper. The `WikiResolveResult` type is re-exported from `MarkdownPreview.tsx` for callers that want to import it from one place.
  - Sanitiser allowlist updated to keep the `data-wiki-target` attribute through DOMPurify so the Knowledge slot-based click handler can read the raw target text off `.wiki-unresolved` nodes (handler wire-up is the open follow-up — see "Open follow-ups" below).
- `frontend/src/components/MarkdownFileViewer.tsx` (new)
  - Extracted from `MarkdownPreview.tsx` to keep the latter focused on the rule pipeline. Owns two parallel `useEffect`s — one fetches the body via `/stream`, the other calls `getWikiResolutions(fileId)`. They are deliberately decoupled: the body renders immediately and links flip from the pessimistic unresolved default to their real state once the resolutions request resolves. Both effects key off `(fileId, externalReloadKey)` so the parent can force a reload without unmounting.
  - Re-exported from `MarkdownPreview.tsx` for backward-compatible imports while the file detail / editor preview paths migrate over.

## Knowledge editor + unresolved-link dialog (Phase C)

- `addons/knowledge/frontend/WikiLinkAutocomplete.tsx` (new)
  - `[[`-triggered ARIA listbox. Calls `searchVault` (debounced 100 ms) to enumerate `.md` notes in the active vault, fuzzy-matches by basename + alias. Confirmed selection inserts `[[<basename>]]`; `Shift+Enter` inserts `[[<md_id>]]` when the hit has an `md_id` for disambiguation. The host owns keyboard nav through the `WikiLinkAutocompleteHandle` imperative handle so ArrowDown / ArrowUp / Enter / Esc flow through the textarea, not through the popup.
- `addons/knowledge/frontend/Editor.tsx`
  - `[[` trigger detection walks backwards from the caret on every keystroke, closes on whitespace or newline, and exposes a `wikiTrigger = {start, query}` state. Replacement uses `${[[}${linkBody}${]]}` so the textarea range from `triggerStart - 2` through the caret is rewritten atomically.
- `addons/knowledge/frontend/UnresolvedLinkDialog.tsx` (new)
  - Modal that mints a new `.md` note from a clicked `[[X]]`. Pre-fills filename `<target>.md` and folder = source-note folder. Calls `createTextFile(drive, {path, content: \`# ${target}\n\`})` so the resolver picks the new note up on the next render cycle. Client-side path-traversal guard (defense in depth — backend also rejects). 409 / 5xx surface as a `role="alert"` while the dialog stays open. Lives in the addon because only Knowledge knows how to mint a fresh note; core only exposes the `wiki-unresolved` class so the addon's slot wiring can locate the targets.
- i18n keys (knowledge addon): `knowledge.unresolvedLinkDialog.{title,filenameLabel,folderLabel,cancel,create}` and `knowledge.wikiAutocomplete.*` live in `addons/knowledge/frontend/messages/{ja,en}.json`.

## Tests (Phase C)

- `frontend/src/components/__tests__/MarkdownPreview.wikilink.test.tsx` — inline rule renders all three DOM shapes from a synthetic `wikiResolution` map.
- `addons/knowledge/frontend/__tests__/UnresolvedLinkDialog.test.tsx` — dialog open / submit / path-traversal guard / error surface.

## Rename rewrite (Phase D)

When a `.md` file's basename changes, other `.md` bodies in the same drive that reference the old basename via `[[old_basename]]` / `[[old_basename|disp]]` / `[[old_basename#head]]` are rewritten to point at the new basename. Spec §3.7 + §7.6.

- `backend/app/services/markdown_relations.py`
  - `rewrite_basename_in_drive(db, drive, old_basename, new_basename, *, exclude_file_id=None) -> RewriteResult` — drive-scoped scan of active `.md` rows. For each file: split frontmatter prefix verbatim, run an escape-aware regex over the body, write back atomically (`.tmp` + `os.replace`), and bump `File.file_size` so the projection matches the new on-disk byte count. No-op when `old_basename == new_basename`. Per-file read / write errors are logged and skipped — one bad file cannot abort the batch.
  - `RewriteResult` (frozen dataclass): `files_scanned` (active `.md` rows considered after the exclude / self-skip filters), `files_changed` (subset whose body was actually rewritten), `occurrences` (total `[[old…]]` tokens replaced).
  - `_rewrite_body(body, old, new) -> (new_body, occurrences)` — pure helper. Masks `\[` / `\]` with sentinels first so CommonMark-escaped `\[\[old\]\]` is not captured. The match captures the delimiter after the target (`]`, `|`, or `#`) which both gives a word boundary (`[[oldsuffix]]` doesn't match) and lets the suffix flow through verbatim (`[[old|disp]]` → `[[new|disp]]`).
  - `_split_frontmatter_prefix(content) -> (prefix, body)` — preserves the frontmatter block byte-for-byte (indentation, comments, BOM). The body half is what the rewrite touches; the prefix is concatenated back unchanged so `aliases:` entries that happen to equal `old_basename` are **never** rewritten (spec §7.6).
  - Intrinsic self-skip: rows whose `Path(filename).stem == old_basename` are skipped even when `exclude_file_id` is not supplied. This is the safety net for the scanner code path, where the `File.filename` column has already advanced to `new_basename` by the time the hook runs — the row is excluded by neither the explicit id nor a stale stem.

- Hook points:
  - `backend/app/services/fileops.py::rename_file` — after the FS rename, the DB commit of the new filename / file_path / title, and the optional thumbnail move. Triggered only when both `old_filename` and `new_filename` end in `.md` (case-insensitive) and the stems differ. Runs inside a fresh try / except that, on failure, rolls back the rewrite transaction but **does not** undo the user-visible rename — the FS + DB row are already durable. Passes `exclude_file_id=file.id` so the renamed file is filtered out by id rather than relying on stem comparison.
  - `backend/app/services/scanner.py::_scan_and_register` move-detection branch — after `moved_ids.append(candidate.id)`. Triggered when an out-of-band rename (filesystem-level) is detected via the hash-based move heuristic (hako `KITKxD0mHxNaqi9_7BE1s`). Same `.md` + stem-changed gate. Called without `exclude_file_id`; the intrinsic self-skip handles it, since `candidate.filename` has already been updated to the new basename earlier in the same loop iteration.

- Behaviours preserved by construction (also covered by tests, below):
  - Frontmatter is concatenated back **verbatim** — no YAML re-serialisation, so comments / ordering / quoting survive.
  - `\[\[old\]\]` (escaped) is not rewritten — sentinel-masking pass before the regex.
  - `[[oldsuffix]]` is not rewritten — the regex requires the next character after the target to be `]`, `|`, or `#`.
  - `aliases:` entries matching `old_basename` are not rewritten — they live in the frontmatter prefix, which the rewrite never touches.
  - Same-drive only — drive = security boundary (hako `cRNeIvcbhz449BwTmof5m`); cross-drive rewrites are out of scope.

- Not in scope for Phase D:
  - `[[old_md_id]]` (numeric id form) — id is unchanged by rename, no rewrite needed.
  - `[<display>](loft://<id>)` (loft-scheme inline links) — loft id is unchanged by rename.
  - `aliases:` rewrite — managed by the user; rewriting would destroy the "I want to keep referring by the old name" intent (spec §7.6).
  - WebSocket fan-out / `files.updated` events for the rewritten files — current pass is silent. If the renderer cache becomes a problem, the follow-up is to broadcast post-commit.

### Tests (Phase D)

- `backend/tests/test_markdown_relations_rewrite.py` — `_rewrite_body` unit tests (escape, word boundary, alias suffix `|` / `#`, no-op early return) + `rewrite_basename_in_drive` integration (frontmatter preservation, intrinsic self-skip, exclude_file_id, no-op when `old == new`, per-file failure isolation, drive scope).
- `backend/tests/test_fileops_rename_wiki_rewrite.py` — end-to-end through `rename_file`: `.md` rename triggers rewrite, non-`.md` rename does not, rewrite failure does not undo the rename.
- `backend/tests/test_scanner_move_wiki_rewrite.py` — hash-based move detection triggers rewrite without `exclude_file_id`, intrinsic self-skip prevents the moved file from rewriting its own body.

## Open follow-ups

- Slot-based click handler that wires `.wiki-unresolved` clicks in the rendered preview to `UnresolvedLinkDialog`. The CSS class, the `data-wiki-target` allowlist, and the dialog are all in place; the missing piece is the listener that the Knowledge addon attaches to the rendered preview region. Implied by spec §3.8 but not landed yet — track in the Phase C follow-up before declaring the feature complete.

## Out of scope here

- LLM output policy (intelligence → knowledge save uses `[[id]]`) — Phase E.
- `PUT /content` `link_diagnostics` response payload — deferred (spec §3.5); the per-file `GET /wiki-resolutions` endpoint covers the renderer's needs today and is read-on-demand rather than write-piggybacked.
- WebSocket `files.updated` fan-out for rewritten files — Phase D currently runs silent.
