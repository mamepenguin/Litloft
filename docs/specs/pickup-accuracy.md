# Pickup accuracy: watched depth, videos only, and a way to measure it

SPEC-ID: SPEC-ADDON-095
SPEC-ID: SPEC-ADDON-096
SPEC-ID: SPEC-ADDON-097
SPEC-ID: SPEC-ADDON-098

Approval:

## Summary

Intelligence's Pickup feed ranks files the viewer has not opened, from a taste profile
built over their watch history (`addons/intelligence/app/pickup/`). It feeds the drive
home's Pickup row, the Pickup page and the video app's **Recommended** shelf. Accuracy
here means putting what the viewer wants to watch now at the top. Three defects work
against it today, and a fourth gap means nobody can tell whether a change helps:

- Every opened file shapes the profile with the same weight. A video opened for three
  seconds and closed counts as much as one watched to the end and liked. The profile
  never reads `playback_position`, `duration`, `played_segments`, `liked_at` or
  `is_favorite`.
- The profile and the candidates cover every kind of file, but Pickup is a video surface
  and documents are not something the viewer wants recommended. Lanes built from
  documents take turns in the feed, and the video app then drops those rows, which leaves
  short shelves on mixed drives (45 and 3 unwatched videos measured on 2026-11-09).
- There is no measurement of accuracy at all.

So:

- **SPEC-ADDON-095**: the profile weights each watched video by how much of it was
  watched. Liked and favourite videos count fully. A video opened and abandoned does not
  shape the profile.
- **SPEC-ADDON-096**: the profile and the feed contain videos only, on every Pickup
  surface.
- **SPEC-ADDON-097**: each rebuilt feed's top 40 is recorded in a log table in the
  Intelligence DB, kept for 180 days, so accuracy in real use can be measured afterwards.
- **SPEC-ADDON-098**: a read-only evaluation command, run in the Intelligence container,
  reports accuracy two ways: by replaying past history (`replay`) and from the log
  (`online`).

The viewer is one person with a profile (`lit_viewer`), mostly on a PC browser. A
household can have several profiles; each has its own feed per drive, as today.

## Definitions

- **Video**: a core `files` row with `file_type = 'video'`. This is the core's own
  `type=video` predicate (`backend/app/routers/drives.py`, `_kind_predicate`), and it
  includes `.loft` embeds (`mime_type = 'application/vnd.litloft.loft+json'`).
- **Watched fraction** `f` of one history row, for a video whose stored `duration` is a
  finite number above 0:
  `f = clamp(max(playback_position, covered) / duration, 0, 1)`, where `covered` is the
  number of this viewer's `played_segments` rows for the file with `played_seconds > 0`,
  times `PLAYED_SEGMENT_SECONDS` (5).
  `played_segments` exists only since 2026-10-31, so for older history `covered` is 0 and
  `f` comes from the position alone. A video played to the end has `position = duration`
  (`.claude/rules/design-decisions.md`, watch history), so `f = 1`.
- **Engagement** `e` of one history row, in `[0, 1]`:
  1. The file is liked (`files.liked_at IS NOT NULL`) or a favourite
     (`files.is_favorite = 1`): `e = 1`.
  2. Otherwise, the stored duration is finite and above 0: `e = 0` when `f < F_MIN`,
     otherwise `e = min(1, f / F_FULL)`.
  3. Otherwise, the file is a `.loft` embed: `e = E_UNKNOWN`. Some embed providers cannot
     report position or duration, and the rules say absence means unknown, not
     unfinished.
  4. Otherwise (a native video that was opened but never reported playback): `e = 0`.

  Constants: `F_MIN = 0.10`, `F_FULL = 0.5`, `E_UNKNOWN = 0.5`. Reaching half of a video
  counts as fully watched. These values are first guesses. The replay in SPEC-ADDON-098
  checks them before shipping (item 10).
- **Engaged**: `e > 0`.

## Required items

### 1. Normal flow

**Building a feed (SPEC-ADDON-095, SPEC-ADDON-096).** The worker keeps its triggers
(`scan.complete` webhook, hourly sweep) and its per-drive, per-viewer loop. Changes:

1. Per drive, once per sweep, the worker reads the set of active videos in the drive from
   the core DB (`files` with `drive = :drive`, `file_type = 'video'`, `deleted_at` and
   `missing_since` NULL).
2. Candidate rows for each channel (`clip_thumbnail`, `tfidf_keywords`, `text_content`)
   are loaded as today and then kept only where the file is in that set. A channel that no
   video in the drive has produces no candidates, and so no lanes.
3. Per viewer, the profile history is read as today (one year, 2000 rows, newest first,
   active files), plus for each row the file's `file_type`, `mime_type`, `liked_at`,
   `is_favorite`, the row's `playback_position` and `duration`, and the viewer's
   `played_segments` count for that file. Rows that are not videos are dropped. Each
   remaining row gets its engagement `e`, and rows with `e = 0` are dropped.
4. The kept rows are clustered as today, with two changes. `choose_k` takes the number of
   kept rows. The centroid of each cluster, during k-means and for the lane, is the mean
   of its members' vectors weighted by `e`, then normalized. The k-means seeding
   (k-means++ from the seeded RNG) is unchanged.
5. A lane's raw weight is `log1p(sum(e * decay(age)))` over its members (was
   `log1p(sum(decay(age)))`). Normalization (`W_MIN`), the interleave and the depth (300)
   are unchanged.
6. The exclusion set is unchanged: every file the viewer has opened in the drive, of any
   kind, any engagement, trashed or missing included.
7. The feed is stored as today. `PROFILE_VERSION` becomes 3, so every viewer's feed is
   rebuilt on the first sweep after deployment.

**Rebuild trigger (SPEC-ADDON-095).** The worker's watch signature gains three things per
row: the file's liked state (`liked_at IS NOT NULL`), its favourite state, and the sum of
the viewer's `played_seconds` for that file. Liking, favouriting or recording played
ranges moves the checkpoint even when `last_played_at` did not move, and the next sweep
rebuilds that viewer's feed. The signature still covers every history row of the drive
(not only videos), as today.

**Recording the feed (SPEC-ADDON-097).** After `_store` commits a feed with at least one
item, the worker writes one `pickup_feed_log` row in its own transaction:
`(drive_id, viewer_id, computed_at, profile_version, file_ids)`. `computed_at` equals the
`computed_at` just stored in `pickup_profiles`, and `file_ids` is a JSON array of the first
40 stored file ids in rank order (fewer when the feed is shorter). In the same transaction,
rows of any drive and viewer with `computed_at` older than 180 days are deleted. An empty
feed writes no log row.

**Evaluating (SPEC-ADDON-098).** An operator runs, inside the Intelligence container:

```
python -m app.pickup.evaluate replay --drive <name> [--days 60] [--horizon 7] [--viewer <id>]
python -m app.pickup.evaluate online --drive <name> [--days 30] [--viewer <id>]
```

Both open the core DB and the Intelligence DB read-only, write nothing, and print a
Markdown table to stdout.

`replay`, per viewer with history in the drive (or the one given), for each cut point `t`
at 00:00 UTC of each of the last `--days` days (default 60):

1. **History at t**: that viewer's history rows in the drive with `last_played_at < t`.
   Engagement uses each row's current stored values (see item 2 for what this leaks).
2. **Targets at t**: videos in the drive with a history row for that viewer whose
   `last_played_at` falls in `[t, t + horizon days)` (default 7) and whose engagement is
   above 0. A file that is in the history at `t` cannot be a target, because a file has
   only one history row.
3. **Candidates at t**: active files of the drive created before `t`
   (`files.created_at < t`), excluding everything in the history at `t`. Each
   configuration then applies its own kind filter.
4. A cut point with no target is skipped and counted as skipped.
5. Each configuration ranks the candidates with the production code path
   (`build_lanes`, `score_lanes`, `interleave`), the candidate vectors loaded once per
   channel and masked per cut point. Configurations:
   - `before`: every kind of history row with `e = 1` and every kind of candidate. This
     reproduces the ranking before this change.
   - `depth`: engagement as defined, every kind.
   - `video`: `e = 1`, videos only.
   - `after`: engagement and videos only, which is the shipped behaviour.
   - `random`: candidate videos in a random order seeded by drive, viewer and `t`.
   - `newest`: candidate videos by `files.created_at`, newest first.
6. For each configuration and cut point: `recall@12` and `recall@40` (share of targets in
   the first 12 / 40 of the ranking, rank order, no daily shuffle), and `hit@40` (1 when
   any target is in the first 40).

The table has one row per configuration: the mean of each metric over evaluated cut
points, plus the counts of evaluated and skipped cut points and of targets.

`online`, per viewer, over log rows with `computed_at` in the last `--days` days
(default 30), in `computed_at` order:

1. A log row's targets are videos with a history row for that viewer whose
   `last_played_at` falls in `[computed_at, next log row's computed_at)` (until now for the
   last row), and whose engagement is above 0.
2. `recall@12` and `recall@40` against the logged ids (first 12 / all of them), and
   `hit@40`, as in `replay`.

The table has one row per ISO week of `computed_at`, then a total row, with the same
columns, plus the profile version of the rows in that week (several, comma-separated, if
it changed).

### 2. Failure cases

- **The core DB cannot be read** (video set, history, likes, segments): as today, the
  drive or viewer is skipped for this sweep, logged, and picked up on the next one. The
  stored feed is left as it was.
- **A viewer has history but no engaged video**: the profile has no lanes, and the stored
  feed becomes empty (`total = 0`) with a null checkpoint, as when `build_lanes` returns
  nothing today. Pickup is then absent from every surface for that viewer and drive.
- **A drive has no video with embeddings**: no candidates, so the feed is empty, as
  above.
- **`duration` is 0, negative, NaN or infinite** for a native video: engagement rule 4,
  `e = 0`. A `position` above `duration` is clamped by `f`'s clamp.
- **The log write fails** (disk, lock): the error is logged as a warning, the feed already
  committed stays, and the next rebuild writes a new log row. A log row is never written
  for a feed that was not committed.
- **`replay` with a drive that has no history or no videos**: prints the table with zero
  evaluated cut points. Exits 0.
- **`online` with no log rows in the window**: prints the header and a total row of zero
  counts. Exits 0.
- **An unknown drive or viewer passed to the command**: as above (no rows). The command
  does not check the drive against `drives.json`.
- **A database file is missing or unreadable for the command**: the command exits non-zero
  with the error on stderr and writes nothing.

### 3. States

A viewer's feed per drive: **absent** (no profile row), **empty** (`total = 0`), or
**populated**. Transitions happen only on a rebuild, as today. The new thing is that a
viewer can go from populated to empty when they have no engaged video left in the
window.

`pickup_feed_log` rows are append-only apart from the 180-day deletion. There is no
other state.

### 4. Data read and written

| Store | Read / written | What |
|---|---|---|
| Core DB `files` | read | `id`, `drive`, `file_type`, `mime_type`, `liked_at`, `is_favorite`, `deleted_at`, `missing_since`, `created_at` (the command only) |
| Core DB `watch_history` | read | `viewer_id`, `file_id`, `playback_position`, `duration`, `last_played_at` |
| Core DB `played_segments` | read | per (viewer, file): count of rows with `played_seconds > 0`, sum of `played_seconds` |
| Intelligence DB `embeddings`, `indexed_files`, `vec_clip`, `vec_text` | read | as today |
| Intelligence DB `pickup_items`, `pickup_profiles` | written | as today |
| Intelligence DB `pickup_feed_log` (new) | written by the worker, read by `online` | see below |

`pickup_feed_log`: `drive_id TEXT`, `viewer_id VARCHAR(16)`, `computed_at DATETIME`
(naive UTC), `profile_version INTEGER`, `file_ids TEXT` (JSON array). Primary key
`(drive_id, viewer_id, computed_at)`, an index on `computed_at`. Created by
`Base.metadata.create_all` in `init_search_db`. There is no change to an existing table.

The core DB is mounted read-only into the Intelligence container and nothing here writes
it.

### 5. External services

None. No LLM, network or model call. Everything uses embeddings that indexing already
made.

### 6. Authorization

- The feed endpoint and its checks are unchanged: `require_drive` with the `X-Lit-Drive`
  header, the proxy's `addon_feature: index` pre-check, and the viewer from
  `X-Lit-Viewer-Id`.
- The drive boundary holds structurally, as today. The video set, history and candidates
  are each read for one drive.
- The evaluation command runs only inside the container (`docker compose exec`), so only
  the operator can run it. It reads every viewer's history of the drive it is given, the
  same data the worker reads.

### 7. Effect on existing features

- **Drive home Pickup row, Pickup page, video app Recommended**: all read the same stored
  feed through `GET /pickup`, so all become videos only. On a drive with no videos, the
  home row and the Pickup page show nothing, as they already do for an empty feed
  (`PickupWidget` returns null). Recommended's `restrict` (type=video plus the smart
  folder plus `watch=unwatched`) now drops fewer rows, so its 5-page cap is reached later
  or not at all.
- **SPEC-ADDON-094** (Recommended's page provider, approved 2026-11-12, not yet
  implemented) pages the same feed. It needs no change: the feed's shape is unchanged.
- **Continue watching, history, likes, favourites**: read-only here, unchanged.
- **The 90% completion gate** (`drives.py`) is untouched. Engagement is a separate reading
  of the same columns.
- **`find_similar`** and search: untouched. Candidate loading is Pickup's own
  (`app/pickup/retrieval.py`).
- **`personal_history` (Ask)**: reads `watch_history` itself, unaffected.

### 8. Error behavior

Nothing new is visible to the viewer. A failed rebuild leaves the previous feed, as today.
Logged:

- the existing warnings and exceptions for unreadable core data;
- `Pickup: could not write feed log drive=%s viewer=%s` at WARNING, with the exception;
- at DEBUG, per viewer: kept rows, dropped rows by reason (not a video, e = 0), and lanes.

The command prints errors to stderr and exits non-zero only when it cannot open a
database.

### 9. User-visible behavior

- Every Pickup surface shows videos only. Documents, images, audio and other files no
  longer appear, and history of them no longer affects which videos appear.
- A video opened and closed early (under a tenth watched, not liked, not a favourite) no
  longer pulls similar videos into Pickup. It still never appears in Pickup itself.
- Liking or favouriting a video affects Pickup from the next sweep (within an hour), even
  without watching more of it.
- The daily twelve on the home row and Recommended are still drawn from the top 40, and
  the full feed keeps a stable order. No text, layout or control changes.
- `docs/addons/intelligence.md` (Pickup section) says Pickup lists videos only, that how
  much of a video was watched, likes and favourites weight the history, and that a video
  opened briefly does not count. Its operator part documents the two commands and the
  180-day log. `docs/user-guide/video.md` needs no change (Recommended was already videos
  only).

### 10. Non-functional

- **Time**: a rebuild adds one query per drive for the video set and one per viewer for
  likes and segments. The weighted k-means costs the same as today. The video filter
  shrinks the candidate matrices.
- **Command time**: `replay` over 60 cut points on the production `videos` drive must
  finish in under 10 minutes on the Mac mini. It loads vectors once per channel.
- **Size**: about 40 ids per logged feed, a few rebuilds per viewer and drive a day,
  pruned at 180 days. A few MB at most.
- **Privacy**: the log holds the same kind of data as `pickup_items` (file ids per
  viewer), stays in the Intelligence DB, and is never served by an endpoint.
- **Shipping bar**: before merge, `replay` runs on the production `videos` drive with the
  defaults. `after` must have `recall@40` at least `before`'s and above `random`'s. If
  not, the author stops and reports the table to the human; the constants are revised
  only by the human. The table goes into the review topic's `decisions.md`.

## Touch points

- `addons/intelligence/app/pickup/profile.py`: history read with engagement fields and the
  video filter, engagement, weighted centroids and raw weight, watch signature,
  `PROFILE_VERSION`.
- `addons/intelligence/app/pickup/retrieval.py`: candidates restricted to a given file-id
  set.
- `addons/intelligence/app/workers/pickup.py`: per-drive video set, feed log write and
  pruning, checkpoint over the extended signature.
- `addons/intelligence/app/models.py`: `PickupFeedLog`.
- `addons/intelligence/app/database.py`: the new table through `create_all` (no
  `ALTER`).
- `addons/intelligence/app/pickup/evaluate.py` (new): the `replay` and `online` commands.
- `addons/intelligence/app/routers/pickup.py`: read, unchanged in shape.
- Core DB tables read: `files`, `watch_history`, `played_segments`.
- `docs/addons/intelligence.md`, `docs/specs/INDEX.md`, the `addons/intelligence`
  submodule pointer.
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary, watch history
  and completion, file state), `.claude/rules/backend-conventions.md` (migrations add
  only).
- No protected path is edited.

## Invariants

I1. Adding a history row for a video with watched fraction under 0.10 that is neither liked nor a favourite changes the feed only by removing that video from it.
I2. A liked or favourite video shapes the profile with full weight whatever its watched fraction, including 0.
I3. No file whose core `file_type` is not `video` appears in a stored feed, and adding or removing a history row for such a file changes no stored feed except by excluding that file.
I4. A file the viewer has opened in the drive, of any kind and any watched fraction, trashed or missing included, never appears in that viewer's feed for the drive.
I5. A feed is built only from the history and files of its own drive.
I6. Liking, favouriting or adding played ranges to a video the viewer has opened causes that viewer's feed for the drive to be rebuilt on the next sweep, with no change to `last_played_at`.
I7. A failure to write `pickup_feed_log` leaves the stored feed and its profile row as committed, and no log row exists for a feed that was not committed.
I8. A `pickup_feed_log` row holds the first `min(40, total)` file ids of the feed stored with it, in rank order, and after any log write no row older than 180 days remains.
I9. Neither evaluation command changes either database.
I10. In `replay`, no configuration ranks, at cut point `t`, a file that had a history row before `t` or that was created at or after `t`.

## Checked, no action

- **Recording impressions and clicks on Recommended.** Considered and rejected by the
  user in favour of the feed log. It would need the core shelf and its card links to
  report back, and it misses videos found by other routes.
- **Historical accuracy of replay.** `watch_history` keeps one row per (viewer, file):
  a rewatch moves `last_played_at` past the cut point and drops the file from the history
  at `t`, and engagement uses today's position, not the position at `t`. Replay therefore
  sees a slightly shorter, slightly better-informed history than the real one at `t`. The
  same bias applies to every configuration, so the comparison stands. `online` has no
  such leak.
- **Rewatch targets in `online`.** A file opened before a log row and rewatched after it
  counts as a target that the feed could never have held, which deflates recall a little.
  Telling them apart needs per-play history that the core does not keep.
- **`liked_at` and `is_favorite` are per file, not per viewer.** One household member's
  like weights another member's profile, but only for a file that member has also opened.
  Accepted for a household tool.
- **Abandoned videos as a negative signal** (pushing candidates away from them).
  Deferred. This spec only stops them counting as interest. Tuning a negative signal
  needs the measurements this spec adds.
- **A next-episode shelf, a "not interested" control, rank-weighted daily sampling.**
  Deferred. These are separate specs, and the first is a core/addon boundary decision.
- **Adding `whisper` (transcript chunks) as a channel.** Out of scope. Videos already
  carry `tfidf_keywords`.
- **Excluding briefly opened videos from the exclusion set** so that they can be
  recommended again. Not done: a video the viewer opened and closed is one they have
  seen and turned down. The core's `watch=unwatched` is looser. It counts a video opened
  but never played (stored duration 0) as unwatched (`backend/app/routers/shelves.py`,
  `_watch_bucket`). Pickup keeps such a video out, as it does today.
- **Recommending documents somewhere else.** A separate entry point, if ever. The user
  decided Pickup is for videos.
- **Making the constants configurable.** Not done. They are code constants under
  `PROFILE_VERSION`, revised from replay results.
- **Time-of-day or device context.** Not considered for this spec. There is no
  per-request profile.
- **The core's "unwatched" definition.** Untouched. `watch=unwatched` and the
  engagement threshold answer different questions.
