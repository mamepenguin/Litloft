# #284 — invariants

1. Saving note N never deletes or modifies a `markdown` row whose `file_id_a` is not N.
2. Saving note N never deletes or modifies an `internal` row.
3. After saving N, the `markdown` rows with `a = N` are exactly N's valid targets
   not already held by an `internal` (N, T) row — including when one of several
   links is removed.
4. After saving N, no NULL-origin related row touches N.
5. Creating a Markdown file with content through `POST /api/drives/{drive}/files`
   leaves the same rows as saving that content.
6. The sync never creates or deletes a row whose kind is not `related`.
7. `GET /api/files/{id}/relations` lists each (counterpart, kind) at most once.
8. A sync failure never rolls back the content write or the file creation.
9. After knowledge creates a note citing S, exactly one related row joins the
   note and S, with `a = note`; removing the citation and saving removes it.
10. A relation created through `POST /api/internal/file_relations` has origin `internal`.

Revised 2026-09-15 after ownership-r3 (user-approved): startup migration removed;
invariants 2, 4, 7 and 10 rewritten.
