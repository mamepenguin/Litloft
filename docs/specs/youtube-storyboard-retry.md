# An explicit regenerate retries a failed YouTube storyboard

SPEC-ID: SPEC-ADDON-085

Approval:

## Summary

When the storyboard leg of a YouTube `.loft` fails (the `.loft` cannot be read, `yt-dlp`
fails, a sheet cannot be downloaded or decoded, CLIP fails on a tile, or a tile cannot be
written), the clip worker remembers the file id in memory and every later attempt in that
process ends False at once, with no call to YouTube, until the addon restarts. That stops
the resume machinery from calling YouTube in a loop, but it also swallows the owner's own
**Index details** → Regenerate of Image analysis (CLIP) and the Failed Jobs **Retry**:
both send `POST /files/{file_id}/reindex` with `clip`, and the job they queue returns at
once. After this change an explicit reindex request that names `clip` forgets that file's
recorded failure, so the next storyboard leg of that file calls YouTube once more. The
automatic paths keep the guard. This is for the owner who sees a YouTube reference without
scenes and presses Regenerate or Retry.

## Required items

### 1. Normal flow

1. The owner presses Regenerate on Image analysis (CLIP) in Index details, or Retry on the
   file in Failed Jobs. The frontend sends `POST /files/{file_id}/reindex` with `tasks`
   containing `clip` (unchanged).
2. The route validates the payload and looks the file up exactly as today (422 for a bad
   payload, 404 for an unknown, inactive or other-drive file). Nothing below runs on
   those answers.
3. When `tasks` contains `clip`, the route removes `file_id` from the clip worker's
   in-memory record of failed storyboard attempts. This happens before the
   already-queued check, so it also happens when the answer is 202 `already_queued`.
4. The route continues as today: for `clip` not already queued it sets `clip_indexed`
   false and enqueues the `clip` task.
5. The next `clip` job of that file (the one just queued, or one already in the queue)
   runs the storyboard leg in full: lookup, sheets, CLIP, tiles, rows and swap, as
   SPEC-ADDON-078 and SPEC-ADDON-079 describe.
6. If that leg fails again, the file id is recorded again and later automatic attempts in
   this process end at once, as today.

### 2. Failure cases

| Step | What goes wrong | What the system does |
|---|---|---|
| 2 | Bad payload, unknown task, empty tasks, unknown / inactive / other-drive file | Unchanged answer (422 / 404); the failure record is not touched |
| 2 | `tasks` does not contain `clip` | The failure record is not touched |
| 3 | The file id is not in the record (never failed, or a native video) | Nothing happens; removing an absent id is not an error |
| 5 | The storyboard leg fails again | As today: nothing written, rows and tiles as they were, `clip_indexed` false, the job returns False, the id is recorded again |
| 5 | The process restarts before the job runs | The record is empty after a restart anyway; the job runs normally when resumed |

### 3. States

The in-memory record of failed storyboard attempts holds a file id from a failure of that
file's storyboard leg until the process restarts **or an explicit reindex request naming
`clip` for that file is accepted past the file lookup**, whichever comes first. A later
failure adds it again. No other state changes; `clip_indexed`, the rows and the tiles move
exactly as before.

### 4. Data read and written

| Store | Access |
|---|---|
| In-memory failed-storyboard record (`app/workers/clip.py`) | Written: one id removed by the reindex route |
| `indexed_files.clip_indexed`, the index queue | Unchanged behaviour of the reindex route |
| Search DB rows, frame cache, tiles | Not touched by this change |

### 5. External services

None added. The change lets one more storyboard leg call YouTube (`yt-dlp` lookup and
`i.ytimg.com` sheets) per explicit request, with the existing time limits of
SPEC-ADDON-078. An automatic path never removes the record, so repeated failures still do
not loop against YouTube.

### 6. Authorization

Unchanged. The reindex route takes the drive from `X-Lit-Drive` (`require_drive`) and
answers 404 for a file outside it; the record is touched only after that lookup succeeds,
so a request for another drive's file cannot clear its record.

### 7. Effect on existing features

- Every caller of `POST /files/{file_id}/reindex` with `clip`: Index details Regenerate,
  the Failed Jobs Retry, and any other client of the route. All of them are explicit
  owner actions.
- Startup recovery, reconciliation, `_resume_incomplete`, the vector-dimension migration,
  the policy purge and the `.loft` reset do not go through this route and keep the guard.
- The admin `resolve` endpoint (sets `clip_indexed` true) is unchanged and does not touch
  the record.
- Native videos: the record never holds their ids; removal is a no-op.

### 8. Error behavior

No new response or message. The route's answers are unchanged. A failed retry logs the
existing `youtube storyboard failed: file=<id> class=<class> ...` warning, now once per
explicit request rather than never after the first failure.

### 9. User-visible behavior

Regenerate on Image analysis (CLIP), or Retry in Failed Jobs, for a YouTube reference
whose storyboard failed earlier in this process now tries YouTube again: on success the
reference gains its scenes, its CLIP frames panel and its Scene candidates pictures
without a restart. Before, the job ended at once and nothing changed until the addon
restarted. Text, layout and responses are unchanged. `docs/addons/intelligence.md` gets
one sentence on the rule.

### 10. Non-functional

Each explicit request permits at most one more storyboard leg for that file, bounded by
the existing lookup and sheet time limits. No new memory: the record only shrinks here.
The record is touched from the event loop while the worker reads it from its thread; a
set membership test and a discard of one id are each atomic under the GIL, and the worst
interleaving (the discard lands while a leg is checking) only decides whether that one
leg runs or ends at once.

## Touch points

- `addons/intelligence/app/workers/clip.py`: the failed-storyboard record; a small
  function that forgets one file id.
- `addons/intelligence/app/routers/files.py`: `reindex_file` calls it when `tasks`
  contains `clip`, after the file lookup and before the already-queued split.
- `addons/intelligence/tests/`: acceptance tests for SPEC-ADDON-085.
- `docs/addons/intelligence.md` (core repo): one sentence in the YouTube references
  paragraph.
- No protected path is edited. No endpoint, event, table, manifest entry or frontend file
  changes.

## Invariants

I1. After a storyboard failure of a YouTube `.loft`, an accepted `POST /files/{file_id}/reindex` naming `clip` makes the next `clip` job of that file call the YouTube lookup again, both when the route answers `accepted` and when it answers `already_queued`.
I2. After a storyboard failure, a `clip` job queued by any path other than that route (resume, reconciliation, startup recovery) still ends False without calling the YouTube lookup, until the process restarts or the route is called for that file.
I3. A reindex request that does not name `clip`, or that ends in 422 or 404 (including a file on another drive), leaves the failed-storyboard record as it was.
I4. A retried storyboard leg that fails again records the file again, so the following automatic attempt in that process makes no YouTube call.
I5. A retried leg that succeeds ends with the rows, tiles and `clip_indexed` true exactly as a first successful leg does (SPEC-ADDON-078 I8, SPEC-ADDON-079 I2).
I6. The route's responses (status codes and bodies) for every request are unchanged.

## Revises

SPEC-ADDON-078 I8. After the `clip` task of a `.loft`, `clip_indexed` is true exactly when the thumbnail leg is done and the storyboard leg wrote rows, found no `sb0` or no known duration, or found the `.loft` not YouTube; on a transient failure it is false, the existing `clip` rows are as they were, and the same file is not attempted again in that process unless an explicit `POST /files/{file_id}/reindex` naming `clip` is accepted for it; a repeat run never leaves two sets of rows or a second `clip_thumbnail` row.

## Checked, no action

- **Forgetting on every automatic reset too.** The record exists to stop the resume
  machinery from calling YouTube in a loop; clearing it on automatic paths would bring the
  loop back.
- **Clearing the whole record on any reindex.** Only the named file is the owner's
  intent; clearing others would let their resume jobs call YouTube.
- **Showing "failed until restart" in the UI.** After this change Regenerate does what it
  says, so no new text is needed. Whether a storyboard failure is listed in Failed Jobs is
  not changed here.
- **A time-based expiry of the record.** Not asked for; the explicit action covers the
  case the owner sees, and an expiry would reintroduce periodic YouTube calls for a video
  that is gone.
- **The admin `resolve` endpoint.** It marks the file done without a retry; it has no
  reason to touch the record.
