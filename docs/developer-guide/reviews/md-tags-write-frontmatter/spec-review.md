# Spec review: md-tags-write-frontmatter

Reviewed: `docs/superpowers/specs/2026-09-28-md-tags-write-frontmatter.md` against
`invariants.md`, at develop `4b87683cf` (nothing implemented). Parser shapes were
measured by running `backend/app/services/frontmatter.py` (PyYAML 6.0.3) and
`gray-matter` from `frontend/node_modules` locally.

Measured `parse()` results used below:

| input | metadata | body == content |
|---|---|---|
| `---\ntags: [a]\n---\nbody` | `{tags:[a]}` | no |
| `---\r\ntags: [a]\r\nid: 1\r\n---\r\nbody` (CRLF) | `{}` | **yes** |
| `﻿---\ntags: [a]\n---\n` (BOM) | `{tags:[a]}` | no |
| `---\n---\nbody` / `---\n# c\n---\nbody` | `{}` | no |
| `---\nSome paragraph\n---\nbody` (scalar YAML) | `{}` | **no** (body = `body`) |
| `---\n- a\n- b\n---\nbody` (list YAML) | `{}` | **no** |
| `---\ntags: [a\n---\n` (invalid YAML) | `{}` | yes |
| `---\nparagraph after rule\n` (unclosed) | `{}` | yes |
| `--- \n…`, `----\n…`, `\n---\n…` | `{}` | yes |
| `---\ntags: foo\n---` | `{tags:'foo'}` | no |
| `---\ntags: [1, null, 'Foo Bar', true]\n---` | raw non-str entries | no |

gray-matter parses the CRLF case as `{tags:[a], id:1}`; core `parse()` does not.

---

## F1 — CRLF frontmatter is invisible to `parse()`, so the write stacks a second block

- severity: **high**
- invariant: **3** (and 4)
- scenario: a note saved on Windows / by a CRLF tool:
  `---\r\nid: 20250101120000\r\naliases: [X]\r\ntags: [a]\r\n---\r\nbody`.
  `parse()` → `metadata={}`, body = whole content. The spec's malformed rule is
  "opens a frontmatter block (`---\n`) and parses to `{}` with the whole content as
  body"; `---\r\n` does not open with `---\n`, so it is classified *no frontmatter*.
  `PUT /tags ["b"]` composes `---\ntags:\n- b\n---\n\n---\r\nid: …\r\n---\r\nbody`,
  then `_inject_md_id` sees `{tags:[b]}` without `id` and injects a **new** id. Result:
  the old `id`, `aliases`, `tags` become body text (rendered as a table/rule), wiki
  links keyed on the old id stop resolving, and `aliases` projection is lost on the
  next `PUT /content`. gray-matter (frontend chip editor) reads this file's
  frontmatter correctly today, so the web UI shows tags `[a]` for it — this is a
  real shape, not a theoretical one.
- The same misclassification applies to a BOM + malformed block if the "opens
  `---\n`" test is done on raw content rather than the BOM-stripped string.
- suggested change: do not re-derive "has a block" outside the parser. Make
  `parse()` (or a sibling) report whether an opening delimiter line was seen
  (first line after BOM, `rstrip("\r")`/`strip()` == `---`) and whether it closed
  and loaded as a dict. The helper then rejects with 422 every case where an
  opener was seen but a dict was not produced. Either normalise CRLF before parsing
  in the helper (and write LF), or 422 CRLF — but never compose in front of it.

## F2 — Non-dict YAML in a closed block is not caught by the malformed rule and is silently deleted

- severity: **high**
- invariant: **3** (body must mean the same)
- scenario: a note that begins with a thematic break, a paragraph, and another
  break: `---\nSome paragraph\n---\nbody`. YAML loads the paragraph as a string, so
  `parse()` returns `metadata={}` with body = `body` (the block is **excluded**,
  measured). The spec's rule requires "whole content returned as body" to call it
  malformed, so this is treated as "no frontmatter". Compose writes
  `---\ntags:\n- x\n---\n\nbody` — `Some paragraph` is gone from disk. Same for a
  list-shaped block (`---\n- a\n- b\n---`). Only a version-history entry
  (`kind="auto"`) keeps the old text.
- `---\n---\n` and a comment-only block (`None` from `safe_load`) are also
  `metadata={}` / body-excluded, but dropping them loses nothing — the rule must
  distinguish "loaded to None" (safe to replace) from "loaded to a non-dict value"
  (reject).
- suggested change: classify a closed block whose YAML loads to a non-`None`,
  non-dict value as malformed → 422. Put this in the same parser-reported flag as
  F1.

## F3 — `id:` injection without `md_id` projection: batch tagging mints duplicate ids

- severity: **medium**
- invariant: **3** (the new `id` must be unique to mean anything) — and a
  data-integrity concern for wiki-link resolution
- scenario: step 5 runs `_inject_md_id`, step 6 projects only `File.tags`. For a
  `.md` without an `id:` (no frontmatter, or `title:` only), the tag write injects
  `id: <YYYYmmddHHMMSS>`. `_inject_md_id`'s collision check queries **`File.md_id`
  in the DB**, which the helper never sets. `batch/tags` over N such notes within one
  second writes the **same 14-digit id** into every file. Even if the helper does
  project `md_id` (as `put_file_content` does), the collision fallback appends
  `now.microsecond // 1000` without re-checking, so a third file in the same
  millisecond still collides — a pre-existing weakness that batch makes reachable.
  `File.md_id` also stays NULL for a single `PUT /tags` until the next `PUT /content`.
- suggested change: the helper projects `file.md_id = injected_md_id` and commits it
  (as `put_file_content` does) before the next file in the batch; make the collision
  fallback re-query (or loop) until unique. Alternatively, do not inject `id:` from
  the tag path at all — nothing in the problem statement needs it.

## F4 — "Unchanged tag list → no write" can leave `File.tags` ≠ frontmatter

- severity: **medium**
- invariant: **1**
- scenario: the spec's own "Checked, no action" item says a `.md` uploaded/placed
  on disk with `tags: [a]` has `File.tags=[]`. MCP `update_tags(["a"])` → requested
  equals the frontmatter list → "no write". Step 6 (projection) is listed after the
  write; if the no-write branch returns early, `File.tags` stays `[]` while the
  frontmatter says `[a]`, and the endpoint returns `tags: []` for a request of
  `["a"]`. Same for `batch/tags` merge when every requested name is already present:
  the user tags the file, sees success, and the tag never appears.
- suggested change: always run the projection (step 6) from the frontmatter under
  the lock, whether or not bytes were written; only the disk write is skipped.

## F5 — `batch/tags` must become async too; the spec only converts `PUT /tags`

- severity: **medium**
- invariant: **8** (the same race, via the batch endpoint) and 6
- scenario: `batch_tags` is a sync `def` (runs in the threadpool). An
  `asyncio.Lock` from `_text_write_locks` cannot be awaited there, so as written the
  batch path either skips the lock or needs an ad-hoc bridge. Without the lock,
  `write_text_content`'s re-read → compare → `replace_file_contents` runs in a worker
  thread concurrently with `put_file_content` on the event loop; a `PUT /content`
  landing between the ETag compare and the replace is overwritten silently (lost
  write).
- suggested change: state that `batch_tags` becomes `async def` too (and switches
  `emit_from_thread` → `await event_hooks.emit`, as `batch_rename` does), taking
  each file's lock in turn.

## F6 — OSError from the disk write is outside the spec's error list; in a batch it aborts the loop

- severity: **medium**
- invariant: **6**; also a behaviour change for `PUT /tags`
- scenario: a drive bind-mounted `:ro`, or a NAS path the container user cannot
  write (the atomic writer also needs to create a temp file in the directory).
  Today `PUT /tags` / `batch/tags` on such a `.md` succeed (DB-only). After the
  change, `replace_file_contents` raises `OSError`/`PermissionError`, which is not an
  `HTTPException`: `PUT /tags` returns 500, and in `batch_tags` (which catches only
  `HTTPException`) the whole request 500s — earlier `.md` writes already committed
  by `write_text_content`'s `db.commit()`, later files not attempted, nothing in
  `errors[]`. Tagging `.md` on a read-only drive becomes impossible, and the spec's
  error list (404/413/422) and the docs plan do not mention it.
- suggested change: map `OSError` from the write to a defined status (e.g. 409/503
  with a clear detail) in the helper, so batch records it in `errors[]` and
  continues; list the read-only-drive consequence in the api.md change.

## F7 — Size is checked on the bytes read, not on the bytes written

- severity: **low**
- invariant: **4** (the 1 MB bound)
- scenario: a `.md` of 1 MB minus a few bytes passes step 2; compose + `id:`
  injection + new `tags:` push it over `_TEXT_WRITE_MAX_BYTES`; `write_text_content`
  has no size check, so it is written. Afterwards `GET /content` refuses to serve it
  for editing (`file_size <= _TEXT_WRITE_MAX_BYTES` at files.py ~841) and any
  `PUT /content` of it is 413 — the note is no longer editable in the app.
- suggested change: re-check the composed bytes before writing (as
  `put_file_content` does after id injection) → 413.

## F8 — PyYAML re-dump changes values for the frontend reader (YAML 1.1 vs 1.2)

- severity: **low**
- invariant: **3**
- scenario: frontmatter `country: NO\ndraft: yes` (unquoted). PyYAML (1.1) loads
  `False`/`True` and `safe_dump` writes `false`/`true`; gray-matter/js-yaml (1.2),
  which the frontend uses, read the original as the strings `"NO"`/`"yes"` (measured)
  and the rewritten file as booleans. Today core only re-dumps when injecting a
  missing `id:` (once per file); the helper re-dumps on **every** tag change, so this
  becomes a routine path. The "Checked, no action" item covers comments and quoting,
  not a value changing type.
- suggested change: either accept explicitly (add to "Checked, no action" as a value
  change, not only formatting) or rewrite only the `tags:` lines instead of
  round-tripping the whole mapping.

## F9 — Merge with a non-list or non-string `tags:` is unspecified

- severity: **low**
- invariant: **3** (merge must keep existing entries), or a 500
- scenario: (a) `tags: foo` (Obsidian accepts a scalar): "existing raw `tags:`
  list" is undefined; treating it as `[]` writes `[new]` and deletes `foo` from the
  frontmatter, contrary to merge semantics. (b) `tags: [1, null, true]`:
  case-insensitive comparison via `.lower()` on raw entries raises
  `AttributeError` → 500 (outside `HTTPException`, aborts the batch — see F6).
- suggested change: specify: scalar string → treat as a one-element list; compare
  with `str(x).lower()` and skip `None`/non-scalars in the comparison while keeping
  them in the written list.

## F10 — Merge now drops DB-only tags that the current bug created

- severity: **low**
- invariant: none (inv. 1 holds afterwards); behaviour change the spec does not note
- scenario: the bug being fixed has already produced `.md` rows whose `File.tags`
  hold names absent from the frontmatter (the spec's own repro:
  `File.tags=[mcp-added]`, frontmatter `[original]`). `batch/tags` was documented as
  "never destroys per-file history"; after the change a batch add of `x` projects
  from the frontmatter → `File.tags=[original, x]` and `mcp-added` disappears from
  the UI. (The knowledge scanner would also clear it, but only when the note is
  re-scanned.)
- suggested change: decide explicitly — either seed the merge from
  `frontmatter ∪ File.tags` once, or accept and record it in "Checked, no action".

## F11 — Projection failure after the durable write is unspecified

- severity: **low**
- invariant: **1**
- scenario: `write_text_content` commits the bytes, then `replace_file_tags` /
  `cleanup_orphan_tags` raises (DB locked, etc.). `put_file_content` logs and returns
  200 in this case; the spec does not say. If the helper lets it propagate,
  `PUT /tags` returns 500 while the frontmatter already has the new tags and
  `File.tags` has the old ones (until the next `PUT /content` or knowledge scan), and
  a client retry is a no-op write (see F4 — and with F4 unfixed, never re-projects).
  In a batch, the file lands in `errors[]` although its bytes changed.
- suggested change: specify the post-write projection as isolated
  (rollback + log, response reflects disk), matching `put_file_content`.

## F12 — `SelectionBar` discards `errors[]`, so the new per-file 413/422 are invisible

- severity: **low**
- invariant: none (inv. 6 holds server-side)
- scenario: `SelectionBar.handleBatchTag` awaits `batchTag` and closes the dialog
  regardless of `errors`. Before this change batch errors were only 404 for
  inaccessible ids; now a selection containing a malformed/oversized `.md` reports
  success in the UI while that file is untagged. The spec lists "Frontend … not
  changed" and does not consider this caller.
- suggested change: surface `errors.length` in the SelectionBar (toast), or record
  the gap in "Checked, no action".

## F13 — Knowledge scanner projection can overwrite the helper's projection (pre-existing race)

- severity: **low** `[pre-existing]` — same race exists with `PUT /content`
- invariant: **1** (transiently)
- scenario: the knowledge note scanner reads the note (old `tags:`), the helper then
  writes + projects new tags under the core lock, then the scanner posts
  `POST /internal/files/{id}/tags` with the old list. `File.tags` = old while the
  frontmatter = new, until the scanner sees the changed file on a later pass.
- suggested change: none required for this change; ledger item.

TOTAL: 13 findings
