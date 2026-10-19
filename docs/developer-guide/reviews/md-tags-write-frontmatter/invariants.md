# R-0 invariants — fix/md-tags-write-frontmatter

## Touch points

- `PUT /api/files/{id}/tags`, `PUT /api/files/batch/tags`
- The bytes of `.md` files on disk; `files`, `file_tags`, `tags`, `file_versions`
- `design-decisions.md` "Tag editing"

## Invariants

1. After `PUT /tags` on a `.md`, the frontmatter `tags:` on disk and `File.tags` hold the same list.
2. A later `PUT /content` that changes only the body keeps those tags.
3. Frontmatter keys other than `tags:` and the body mean the same thing before and after the write (`id`, `aliases`, `title`, …).
4. A `.md` with malformed frontmatter, non-UTF-8 bytes or over 1 MB is rejected, and neither its bytes nor `File.tags` change.
5. For non-`.md` files both endpoints behave exactly as before.
6. In a batch, one failing file leaves the other files' writes in place and appears in `errors[]`.
7. `POST /api/internal/files/{id}/tags` never writes to the file.
8. A `PUT /tags` racing a `PUT /content` on the same file loses neither write silently: they serialise on one lock, and an editor holding the old ETag gets 412 on its next save.
