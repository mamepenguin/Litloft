# An explicit regenerate retries a failed YouTube storyboard

SPEC-ID: SPEC-ADDON-085

Approval:

## Summary

When the storyboard leg of a YouTube `.loft` fails (the `.loft` cannot be read, `yt-dlp`
fails, a sheet cannot be downloaded or decoded, CLIP fails on a tile, or a tile cannot be
written), the clip worker remembers the file id in memory and every later attempt in that
process ends False at once, with no call to YouTube, until the addon restarts. That stops
the resume machinery from calling YouTube in a loop, but it also swallows the owner's
**Index details** → Regenerate of Image analysis (CLIP): it sends
`POST /files/{file_id}/reindex` with `clip`, and the job it queues returns at once. After
this change a reindex request that names `clip` and passes every check of the route leaves
a pending retry for that file, and the next storyboard leg of that file consumes it and
calls YouTube once more, even if a leg was already running when the request arrived. Automatic attempts
without a pending retry keep the guard. This is for the owner who sees a YouTube
reference without scenes and presses Regenerate.

## Required items

### 1. Normal flow

1. The owner presses Regenerate on Image analysis (CLIP) in Index details. The frontend
   sends `POST /files/{file_id}/reindex` with `tasks` containing `clip` (unchanged).
2. The route runs every check it runs today, in the same order: payload (422), file
   lookup (404), the `ocr` / `frame_ocr` / `page_ocr` checks (422), `overwrite_corrections`
   (422), corrections (409 `corrected`, 409 `busy`).
3. Once all of those have passed, and only when `tasks` contains `clip`, the route records
   a pending storyboard retry for `file_id` in the clip worker's memory. This is
   immediately before the already-queued split, so it happens for both 202 answers,
   `accepted` and `already_queued`.
4. The route continues as today: for `clip` not already queued it sets `clip_indexed`
   false and enqueues the `clip` task.
5. When a storyboard leg of that file starts, it removes the file's pending retry if one
   is held, in one atomic removal. If the file is in the Failed record and no pending
   retry was removed, the leg ends False at once (as today). Otherwise it runs in full:
   lookup, sheets, CLIP, tiles, rows and swap, as SPEC-ADDON-078 and SPEC-ADDON-079
   describe. Whichever leg of the file starts next consumes the retry: the job the route
   queued, or one already in the queue.
6. The file leaves the Failed record only when a leg ends with a definite result (rows
   written, no `sb0`, no known duration, or not YouTube). A leg that ends any other way,
   by a classified failure or by an exception, leaves the file in Failed, so later legs
   without a pending retry end at once, as today.

**A request while a leg of the file is running.** The route answers `accepted` and
enqueues the job, but the queue drops a job for a file that is being processed when
`workers.clip_parallel` is above 1 (the default is 2); with 1 the job waits and runs right
after. The running leg started before the request, so it does not consume the retry. If it
fails, nothing queues `clip` again at once (the worker logs and waits for
reconciliation); the retry stays pending and is consumed by the next leg, which comes from
the next `reconcile()` (hourly by default, `indexing.reconciliation_interval`) or the
next scan-complete from the core. If the running leg succeeds, the pending retry is
consumed by the next leg of that file whenever one runs, and has no other effect.

### 2. Failure cases

| Step | What goes wrong | What the system does | What the owner sees |
|---|---|---|---|
| 2 | Bad payload, unknown task, empty tasks, an OCR task the file cannot take, a bad `overwrite_corrections` | Unchanged 422; no pending retry | The existing error, unchanged |
| 2 | Unknown, inactive or other-drive file | Unchanged 404; no pending retry | Unchanged |
| 2 | Corrected file without confirmation, or busy | Unchanged 409; no pending retry | Unchanged confirmation or busy message |
| 2 | `tasks` does not contain `clip` | No pending retry | Unchanged |
| 3 | The file never failed, or is a native video | The pending retry is recorded and consumed by the next leg with no other effect (a native video has no storyboard leg, so it stays pending until the process restarts) | Nothing different |
| 4 | The file is soft-deleted between the lookup and the flag write (the route's existing 404 there), or the flag write or enqueue raises (500) | The pending retry, already recorded, stays; an inactive file runs no leg, an active one consumes it on its next leg | Unchanged 404 or 500 |
| 5 | The retried leg fails again, by a classified failure or an exception | As today: nothing written, rows and tiles as they were, `clip_indexed` false; the id is in Failed afterwards | Image analysis (CLIP) stays `pending` in Index details and the scenes do not appear, the same as before pressing Regenerate; no message |
| 5 | The process restarts before a leg runs | Both records are empty after a restart; the resumed job runs normally | Nothing different |

### 3. States

Two in-memory records in the clip worker, both empty at process start:

- **Failed**: holds a file id from a classified failure of that file's storyboard leg
  until a leg of that file ends with a definite result, or the process restarts.
- **Pending retry**: holds a file id from the moment a reindex request naming `clip`
  passes every check of the route (immediately before the already-queued split) until a
  leg of that file starts, or the process restarts.

A leg that starts with the id in Failed and not in Pending retry ends False at once with
no YouTube call. Any other leg runs in full. `clip_indexed`, the rows and the tiles move
exactly as before.

### 4. Data read and written

| Store | Access |
|---|---|
| In-memory Failed record (`app/workers/clip.py`) | Read at the start of each leg; one id added on a classified failure (unchanged); one id removed when a leg ends with a definite result |
| In-memory Pending retry record (`app/workers/clip.py`) | New. One id added by the reindex route; removed by the leg that consumes it |
| `indexed_files.clip_indexed`, the index queue | Unchanged behaviour of the reindex route |
| Search DB rows, frame cache, tiles | Not touched by this change |

### 5. External services

None added. Each request that passes the route's checks permits at most one more storyboard leg for that file to call
YouTube (`yt-dlp` lookup and `i.ytimg.com` sheets), within the existing time limits of
SPEC-ADDON-078. No automatic path adds a pending retry, so repeated failures still do not
loop against YouTube.

### 6. Authorization

Unchanged. The reindex route takes the drive from `X-Lit-Drive` (`require_drive`) and
answers 404 for a file outside it; the pending retry is recorded only after every check
has passed, so a request for another drive's file cannot record one.

### 7. Effect on existing features

- Callers of `POST /files/{file_id}/reindex` with `clip`: Index details Regenerate and any
  other client of the route. All are explicit owner actions. Failed Jobs does not list
  storyboard failures (it reads `JobRecord` rows, which the clip worker does not write),
  so its Retry is not a path to this behaviour; that listing is unchanged.
- Startup recovery, reconciliation, `_resume_incomplete`, `reset_falsely_completed_clip`,
  the vector-dimension migration, the policy purge, the `.loft` reset and
  `IndexManager.prioritize` (`POST /queue/prioritize` and the Visual Index's call) do not
  go through this route and never add a pending retry. A job they queue does consume one that the
  route recorded.
- The admin `resolve` endpoint (sets `clip_indexed` true) is unchanged and touches neither
  record.
- Native videos: they have no storyboard leg; a pending retry recorded for one has no
  effect.

### 8. Error behavior

No new response or message. The route's answers are unchanged. A failed retry logs the
existing `youtube storyboard failed: file=<id> class=<class> ...` warning, once per leg
that runs.

### 9. User-visible behavior

Regenerate on Image analysis (CLIP) for a YouTube reference whose storyboard failed
earlier in this process now tries YouTube again, right away when no leg of that file is
running, and otherwise at the next reconciliation or scan (see item 1): on success the reference gains its
scenes, its CLIP frames panel and its Scene candidates pictures without a restart. A retry
that fails looks the same as before the press (Image analysis (CLIP) stays `pending`, no
message); telling a failed retry from one not yet run is not in scope. Text, layout and
responses are unchanged. `docs/addons/intelligence.md` gets one sentence on the rule.

### 10. Non-functional

Each request that passes the route's checks permits at most one more storyboard leg for
that file, bounded by the existing lookup and sheet time limits. The Pending retry record
holds at most one entry per file. Both records live in the addon process; the route
touches them from the event loop while legs run on worker threads. Each access is one set
operation on one id (add, discard, membership, or a single `remove` that raises when the id
is absent), which is atomic under the GIL. The leg consumes the retry with that single
`remove`, never a membership test followed by a discard, so a request that arrives at any
point after the removal leaves its retry pending for the next leg.

## Touch points

- `addons/intelligence/app/workers/clip.py`: the Failed record, the new Pending retry
  record, a function the route calls to record a retry, and the check at the start of
  `_index_youtube_storyboard`.
- `addons/intelligence/app/routers/files.py`: `reindex_file` records a pending retry when
  `tasks` contains `clip`, after every existing check and immediately before the
  already-queued split.
- `addons/intelligence/tests/`: acceptance tests for SPEC-ADDON-085.
- Core repo: `docs/addons/intelligence.md` (one sentence in the YouTube references
  paragraph), `docs/specs/INDEX.md` (the SPEC-ADDON-085 row), and the `addons/intelligence`
  gitlink, moved to the addon commit that carries the change after the addon PR merges
  (the order of CLAUDE.md: addon first, then the core pointer).
- No protected path is edited. No endpoint, event, table, manifest entry or frontend file
  changes.

## Invariants

I1. After a storyboard failure of a YouTube `.loft`, a reindex request naming `clip` that the route answers 202 (`accepted` or `already_queued`) makes the next storyboard leg of that file call the YouTube lookup.
I2. A reindex request naming `clip` that passes the route's checks while a storyboard leg of that file is running, when that leg then fails, still makes the following leg of that file call the YouTube lookup.
I3. After a storyboard failure, a leg of that file with no pending retry (queued by resume, reconciliation, startup recovery or a direct enqueue) ends False without calling the YouTube lookup, until the process restarts.
I4. A reindex request that does not name `clip`, or that the route answers 422, 404 or 409 before the already-queued split (including a file on another drive and a `["clip","ocr"]` request refused for the OCR task), records no pending retry.
I5. One request permits exactly one full leg: after the retried leg ends by a classified failure or by an exception, the next leg without a new request makes no YouTube call.
I6. A retried leg that succeeds ends with the rows, tiles and `clip_indexed` true exactly as a first successful leg does (SPEC-ADDON-078 I8, SPEC-ADDON-079 I2).
I7. The route's responses (status codes and bodies) are unchanged for every request.

## Revises

SPEC-ADDON-078 I8. After the `clip` task of a `.loft`, `clip_indexed` is true exactly when the thumbnail leg is done and the storyboard leg wrote rows, found no `sb0` or no known duration, or found the `.loft` not YouTube; on a transient failure it is false, the existing `clip` rows are as they were, and the same file is not attempted again in that process except by a leg that consumes a pending retry, which only a reindex request naming `clip` that passed every check of the route records; a repeat run never leaves two sets of rows or a second `clip_thumbnail` row.

## Checked, no action

- **Forgetting on every automatic reset too.** The Failed record exists to stop the resume
  machinery from calling YouTube in a loop; letting automatic paths clear it would bring
  the loop back.
- **Clearing the whole Failed record on any reindex.** Only the named file is the owner's
  intent; clearing others would let their resume jobs call YouTube.
- **Simply removing the id from Failed in the route.** A leg already running when the
  request arrives would add the id back on failure and the owner's request would be lost
  (the queued job is dropped while the file is processing, and the next one ends at
  once). The Pending retry record survives that.
- **Showing that a retry ran and failed.** Index details shows `pending` either way; a
  new status or message is a separate change.
- **Listing storyboard failures in Failed Jobs.** That needs the clip worker to write
  `JobRecord` rows, a separate behaviour.
- **A time-based expiry of the Failed record.** Not asked for; the explicit action covers
  the case the owner sees, and an expiry would bring back periodic YouTube calls for a
  video that is gone.
- **The admin `resolve` endpoint.** It marks the file done without a retry; it has no
  reason to touch either record.
- **Queueing the retry at once when a running leg fails.** The rare case of pressing
  Regenerate during the leg that then fails waits for the next reconciliation or scan;
  queueing at once would add a path from the worker back into the queue for it.
- **A pending retry left for a native video or an inactive file.** It is one id in memory
  until restart and has no effect.
