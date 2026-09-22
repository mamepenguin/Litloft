# Invariants — orphan tags on purge

Declared before the first review round (R-0).

1. After a file is hard-deleted, a `Tag` row whose last file that was is gone
   from the database.
2. A `Tag` still attached to at least one file — trashed, missing or active —
   survives every purge. Trashing a file removes no tag.
3. A purge writes no row outside the purged file's own drive. A tag of the same
   name in another drive is untouched.
4. The purge paths keep their transaction shapes: `purge_all_missing` still
   commits in chunks of 200, and the startup auto-purge still commits or rolls
   back each row on its own.
5. A purge that raises leaves the tags as they were, along with the row.
6. `POST /api/internal/files/{id}/tags` and `PUT /api/files/{id}/tags` still
   sweep orphans as they did.

TOTAL: 6 invariants
