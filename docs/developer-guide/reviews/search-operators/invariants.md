# Invariants: search operators, stage 1

## Touch points

- PR 1 (backend): `GET /api/drives/{drive}/files` (`tag`, `type` repeatable), `_apply_kind_filter` / `_kind_predicate` / `_apply_kinds_filter` in `backend/app/routers/drives.py` (shared with the folder tree's `type_filter`), `docs/reference/api.md`
- PR 2 (frontend): query parser in `lib/`, `lib/api.ts`, `useFileSearch`, `useFolderFiles`, `useLauncherRows`, `GlobalSearch`, the search page, `docs/user-guide/search.md`
- PR 3 (frontend): value suggestions in the modal

## Invariants

1. A query without operators produces the same requests and results as before, semantic stage included.
2. Existing single-value `tag` / `type` listing calls, and the tree's `type_filter`, return what they returned before.
3. Repeated `tag` returns only files carrying every tag; repeated `type` returns files of any of the kinds.
4. With any operator present, no semantic hit appears and no semantic request is made.
5. Operators only lists the files passing the filters, with no text filter.
6. Filtering stays inside the drive: no other drive's tags or files appear as candidates or results; a locked drive yields nothing.
7. Moving from the modal to the search page keeps the same filters, scoped or not.
