# Litloft Codemaps

**Last Updated:** 2026-05-13

Architectural codemaps for navigating the Litloft codebase. Each map lists the files that participate in a feature area with a one-line description, so you can land on the right entry point without grep'ing.

For project-wide rules and rationale, see `.claude/rules/` and `docs/superpowers/specs/`.

## Maps

- [config-gui.md](./config-gui.md) — First-run wizard, admin settings GUI, atomic config writes, restart-pending flag
- [search.md](./search.md) — GlobalSearch popup (filename + semantic merged inline, popup→page `searchCache` handoff), `/drive/{drive}/search` virtual-folder result page, Smart Folder DB / API / UI, intelligence `search-modes` page-context
- [folder-browser.md](./folder-browser.md) — Drive-level two-pane layout, `<FilterField>` (right-pane in-folder filter + tree-pane filter that replaces the old type-filter chips), tree lazy-vs-full-load fetch strategy, `treeFilterTransform`, new-file creation (FolderToolbar button + `Cmd/Ctrl+N`, `useCreateFile`, backend mime-allowlist removal + suffix numbering)
- [markdown-id.md](./markdown-id.md) — Phase A of the Markdown link 3-form feature: frontmatter `id:` auto-numbering, `File.md_id` projection, shared `ensure_id`/`compose` helpers, `_inject_md_id` on `PUT /content`, knowledge `note_scanner` reconcile fill

## Conventions

- File paths are absolute from repo root.
- Each entry: `path — one-line purpose`.
- Maps are scoped to a feature, not a layer. Cross-cutting concerns (auth, ws, scanner) live in their own maps as they are added.
- Keep each map under ~150 lines. If a map grows beyond that, split by sub-feature.
