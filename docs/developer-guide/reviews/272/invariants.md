# PR #272 invariants (R-0)

Approved by the supervisor before round 1, unchanged. For 5, a hand-written URL carrying `updated_at` must also not produce a 422.

1. `GET /api/drives/{drive}/files?sort=updated_at` returns rows ordered by
   `File.updated_at` in the requested `order` (default `desc`), ties broken by `id`
   in the same direction, so walking every page yields each matching row exactly
   once.
2. It composes with the listing's other narrowing (`type`, `path`, `recursive`,
   `search`, `tag`, `favorite`): the filter is applied before ordering and paging,
   and `meta.total` counts the filtered set.
3. Only the listing accepts `updated_at`. `GET /files/{id}/neighbors`, the trash
   listing and the missing listing still answer 422 for `sort=updated_at`.
4. The existing listing sort values (`created_at`, `title`, `file_size`,
   `liked_at`, `random`) order exactly as before, and an unknown value still
   answers 422.
5. Nothing in the UI sends or keeps `updated_at` from a URL or a preference: a
   folder view opened with `?sort=updated_at`, a stored per-folder sort of
   `updated_at`, and a list snapshot carrying it all fall back to the default sort
   (no 422, no `updated_at` request), and the Sort button does not offer it.
   A file opened with that value in its URL gets folder order for previous/next.
6. A frontend caller can request `sort=updated_at` from the listing through the
   API client without widening `SortField`.
