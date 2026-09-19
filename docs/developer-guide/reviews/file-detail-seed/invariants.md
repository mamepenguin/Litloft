# R-0 invariants — navigation loading, PR 1 (file detail)

Approved by the user 2026-09-20.

1. Opening a file from any list draws the file's name and player/preview box
   in the first frame after the click, with no "Loading..." text and no
   spinner.
2. Opening a file issues exactly one `GET /api/files/{id}` (not counting
   later explicit refetches).
3. A write from the detail view (title/description edit, tags, rename) is
   never built from seed-only data: edit affordances that send a whole
   field set wait for `fresh`.
4. `chaptersPresent` is false until the fresh detail response says
   otherwise; a seed never turns chapters on.
5. `recordFileView` and `addRecentlyPlayed` still fire exactly once per
   opened `fileId`.
6. A stale seed is always replaced: after the fetch resolves, the view shows
   the fetched values even if they differ from the seed.
7. A fetch for a file the viewer has already left does not overwrite the
   file now on screen.
8. Missing/trash files keep their current behaviour (404 → not-found).

## Already known (answer with one `[pre-existing]` line each, do not re-derive)

- K1: intelligence addon `DetailedSummarySection` and
  `VisualDescriptionSection` call `getFile` themselves, so on desktop an
  open still costs 3 requests (1 core + 2 addon). Measured.
- K2: media_import's YouTube embed shows a black box for ~1 s while its
  iframe loads, after the core poster.

## Revisions

- After r1 (user, 2026-09-20): invariant 2 now reads "Opening a file issues
  exactly one `GET /api/files/{id}` from core code". The two addon calls (K1)
  move to the intelligence PR (Phase 4), which switches them to
  `getFileShared`.
- After r1 (user, 2026-09-20), prompted by r1 F6: added invariant
  9. Moving to another file inside a mounted host never attributes the
     previous file's player state (position, duration, content) to the new
     file id.
