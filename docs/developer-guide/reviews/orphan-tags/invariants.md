# Invariants — orphan tags on purge

Declared before the first review round (R-0).

1. After a file is hard-deleted, a `Tag` row whose last file that was is gone
   from the database. This holds for every hard delete, including the two that
   do not go through `physical_delete`: a path conflict with a trashed row, and
   a re-upload onto one.
2. A `Tag` still attached to at least one file — trashed, missing or active —
   survives every purge. Trashing a file removes no tag.
3. A purge writes no row outside the purged file's own drive. A tag of the same
   name in another drive is untouched.
4. The purge paths keep their transaction shapes: `purge_all_missing` still
   commits in chunks of 200, and the startup auto-purge still commits or rolls
   back each row on its own.
5. A purge that raises leaves the tags as they were, along with the row.
6. **Revised after round 1 (finding 4).** Editing one file's tags sweeps orphans
   in that file's drive only. It previously swept every drive, which
   `design-decisions.md` forbids ("any query/upsert on these tables must be
   drive-scoped"); the parameter this change introduces is what makes scoping
   them one word each. `PUT /api/files/{id}/tags`, the markdown frontmatter
   projection and `POST /api/internal/files/{id}/tags` all still sweep.

TOTAL: 6 invariants
