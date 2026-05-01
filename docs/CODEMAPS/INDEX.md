# Litloft Codemaps

**Last Updated:** 2026-05-01

Architectural codemaps for navigating the Litloft codebase. Each map lists the files that participate in a feature area with a one-line description, so you can land on the right entry point without grep'ing.

For project-wide rules and rationale, see `.claude/rules/` and `docs/superpowers/specs/`.

## Maps

- [config-gui.md](./config-gui.md) — First-run wizard, admin settings GUI, atomic config writes, restart-pending flag
- [search.md](./search.md) — GlobalSearch popup launcher, `/drive/{drive}/search` virtual-folder result page, Smart Folder DB / API / UI, intelligence `search-modes` page-context

## Conventions

- File paths are absolute from repo root.
- Each entry: `path — one-line purpose`.
- Maps are scoped to a feature, not a layer. Cross-cutting concerns (auth, ws, scanner) live in their own maps as they are added.
- Keep each map under ~150 lines. If a map grows beyond that, split by sub-feature.
