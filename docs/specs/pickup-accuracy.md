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
  never reads `playback_position`, `duration`, `played_segments`, `liked_at`,
  `is_favorite` or `dismissed_at`.
- The profile and the candidates cover every kind of file, but Pickup is a video surface
  and documents are not something the viewer wants recommended. Lanes built from
  documents take turns in the feed, and the video app then drops those rows, which leaves
  short shelves on mixed drives (45 and 3 unwatched videos measured on 2026-11-09).
- There is no measurement of accuracy at all.

So:

- **SPEC-ADDON-095**: the profile weights each watched video by how much of it was
  watched. Liked and favourite videos count fully. A video opened and abandoned, or
  dismissed from Continue watching, does not shape the profile.
- **SPEC-ADDON-096**: the profile and the feed contain videos only, on every Pickup
  surface.
- **SPEC-ADDON-097**: each rebuilt feed's top 40 is recorded in a log table in the
  Intelligence DB, kept for 180 days, so accuracy in real use can be measured afterwards.
- **SPEC-ADDON-098**: a read-only evaluation command reports accuracy two ways: by
  replaying past history (`replay`) and from the log (`online`).

The viewer is one person with a profile (`lit_viewer`), mostly on a PC browser. A
household can have several profiles; each has its own feed per drive, as today.

## Definitions

- **Video**: a core `files` row with `file_type = 'video'`. This is the core's own
  `type=video` predicate (`backend/app/routers/drives.py`, `_kind_predicate`), and it
  includes `.loft` embeds (`mime_type = 'application/vnd.litloft.loft+json'`).
- **Reported duration** `d`: `watch_history.duration` of the row, the value the player
  reported. `files.duration` (the probed length) is not used: a row whose `d` is 0 was
  opened but never reported playback, whatever the file's probed length.
- **Played seconds** `p`: the sum of this viewer's `played_segments.played_seconds` for
  the file (0 when there are none). `played_segments` exists only since 2026-10-31, so for
  older history `p` is 0. `p` counts a replayed part twice. It is used without the core's
  segment size, so the addon does not copy that constant.
- **Watched fraction** `f`, defined when `d` is finite and above 0:
  `f = clamp(max(playback_position, min(p, d)) / d, 0, 1)`. A video played to the end has
  `playback_position = d` (`.claude/rules/design-decisions.md`, watch history), so
  `f = 1`.
- **Dismissed**: `watch_history.dismissed_at` is set and is not earlier than
  `last_played_at`. This is the core's own reading: a play after a dismissal undoes it
  (`backend/app/models.py`, the continue-watching filter).
- **Engagement** `e` of one history row, in `[0, 1]`. The first matching rule applies:
  1. The file is liked (`files.liked_at IS NOT NULL`) or a favourite
     (`files.is_favorite = 1`): `e = 1`.
  2. The row is dismissed: `e = 0`.
  3. `d` is finite and above 0: `e = 0` when `f < F_MIN`, otherwise
     `e = min(1, f / F_FULL)`.
  4. The file is a `.loft` embed: `e = E_UNKNOWN`. Some embed providers cannot report
     position or duration, and the rules say absence means unknown, not unfinished.
  5. Otherwise (a native video that was opened but never reported playback, or one whose
     `d` is 0, negative, NaN or infinite): `e = 0`.

  Constants: `F_MIN = 0.10`, `F_FULL = 0.5`, `E_UNKNOWN = 0.5`. Reaching half of a video
  counts as fully watched. These values are first guesses. The replay in SPEC-ADDON-098
  checks them before shipping (item 10).
- **Kept row**: a history row of a live video (not trashed, not missing) in the drive with
  `e > 0`.

## Required items

### 1. Normal flow

**Building a feed (SPEC-ADDON-095, SPEC-ADDON-096).** The worker keeps its triggers
(`scan.complete` webhook, hourly sweep) and its per-drive, per-viewer loop. Changes:

1. Per drive, once per sweep, the worker reads the set of live videos in the drive from
   the core DB (`files` with `drive = :drive`, `file_type = 'video'`, `deleted_at` and
   `missing_since` NULL).
2. Candidate rows for each channel (`clip_thumbnail`, `tfidf_keywords`, `text_content`)
   are loaded as today and then kept only where the file is in that set. A channel that no
   video in the drive has produces no candidates, and so no lanes.
3. Per viewer, the profile history is read in this order:
   1. Every history row of the viewer in the drive for a live video, with
      `last_played_at` inside the window (365 days), along with `playback_position`, `d`,
      `dismissed_at`, the file's `mime_type`, `liked_at` and `is_favorite`, and `p`.
   2. Each row gets its engagement `e`. Rows with `e = 0` are dropped.
   3. The newest 2000 remaining rows (by `last_played_at`) are the profile history.

   So the 2000-row cap and the window count kept rows only. A document, or a video with
   `e = 0`, never pushes a kept row out.
4. Clustering is per channel, as today. `choose_k` still takes the number of profile
   files that have a vector in that channel. Every mean of member vectors is weighted by
   `e` and then normalized: the k-means centroid update, the lane centroid, the centroid
   used to choose where a singleton cluster is merged, and the directionless-cluster
   check (`_MIN_CENTROID_NORM`). The k-means seeding (k-means++ from the seeded RNG) is
   unchanged.
5. A lane's raw weight is `log1p(sum(e * decay(age)))` over its members (was
   `log1p(sum(decay(age)))`). Normalization (`W_MIN`), the interleave and the depth (300)
   are unchanged.
6. The exclusion set is unchanged: every file the viewer has opened in the drive, of any
   kind, any engagement, trashed or missing included.
7. The feed is stored as today. `PROFILE_VERSION` becomes 3, so every viewer's feed is
   rebuilt on the first sweep after deployment.

To make the replay possible (SPEC-ADDON-098), the profile functions that compute ages,
the window and the cap take an explicit reference time. The worker passes the current
time, which is today's behaviour.

**Rebuild trigger (SPEC-ADDON-095).** The worker's watch signature gains, per history
row: the file's liked state (`liked_at IS NOT NULL`), its favourite state, `p`, and
whether the row is dismissed. Liking or unliking, favouriting or unfavouriting, recording
played ranges, or dismissing moves the checkpoint even when `last_played_at` did not
move, and the next sweep rebuilds that viewer's feed. The signature still covers every
history row of the drive (not only videos), as today.

**Recording the feed (SPEC-ADDON-097).** After `_store` commits a feed with at least one
item, the worker writes one `pickup_feed_log` row in its own transaction:
`(drive_id, viewer_id, computed_at, profile_version, file_ids)`. `computed_at` equals the
`computed_at` just stored in `pickup_profiles`. `file_ids` is a JSON array of the first
40 stored file ids in rank order (fewer when the feed is shorter). In the same
transaction, rows of any drive and viewer with `computed_at` older than 180 days are
deleted. An empty feed writes no log row.

**Evaluating (SPEC-ADDON-098).** An operator runs, in a container built from the
Intelligence image:

```
python -m app.pickup.evaluate replay --drive <name> [--days 60] [--horizon 7] [--viewer <id>]
python -m app.pickup.evaluate online --drive <name> [--days 30] [--viewer <id>]
```

Both open the core DB (`HOMEVAULT_DB_PATH`) and the Intelligence DB
(`INTELLIGENCE_SEARCH_DB_PATH`, or the default path) read-only: an SQLite `mode=ro`
URI connection with sqlite-vec loaded. They never call `init_search_db` or anything else
that creates tables or migrates. They write nothing, and print Markdown tables to
stdout.

`replay`, per viewer with history in the drive (or the one given). Let `T0` be today's
00:00 UTC. The cut points are `t = T0 - horizon - i days` for `i = 0 .. days - 1`, so
every cut point's target window `[t, t + horizon)` has fully passed. For each cut point:

1. **History at t**: that viewer's history rows in the drive with `last_played_at < t`,
   built by the same steps as above with `t` as the reference time: window and cap
   measured from `t`, ages measured from `t`. A file's live state and its liked,
   favourite and dismissed state are today's, because the core keeps no history of them.
2. **Targets at t**: videos in the drive with a history row for that viewer whose
   `last_played_at` falls in `[t, t + horizon)` and whose `e` is above 0. A file in the
   history at `t` cannot be a target, because a file has only one history row.
3. **Candidates at t**: live files of the drive created before `t`
   (`files.created_at < t`), excluding every file with a history row before `t`. Each
   configuration then applies its own kind filter.
4. A cut point with no target is skipped and counted as skipped.
5. Each configuration ranks the candidates with the production code path
   (`build_lanes`, `score_lanes`, `interleave`) at reference time `t`. Candidate vectors
   are loaded once per channel and masked per cut point. History vectors are loaded once
   per viewer and channel and looked up per cut point. Configurations:
   - `before`: every kind of history row, `e = 1` for every row (no row dropped), every
     kind of candidate. This reproduces version 2's ranking at reference time `t`.
   - `depth`: engagement as defined, every kind.
   - `video`: `e = 1` for every row, videos only.
   - `after`: engagement and videos only, which is the shipped behaviour.
   - `random`: candidate videos in a random order seeded by drive, viewer and `t`.
   - `newest`: candidate videos by `files.created_at`, newest first.
6. For each configuration and cut point: `recall@12` and `recall@40` (share of targets in
   the first 12 / 40 of the ranking, in rank order, with no daily shuffle), and `hit@40`
   (1 when any target is in the first 40).

Output: one table per viewer, one row per configuration, with the mean of each metric
over that viewer's evaluated cut points, and the counts of evaluated cut points, skipped
cut points and targets. Viewers are never pooled.

`online`, per viewer, over log rows with `computed_at` in the last `--days` days, in
`computed_at` order:

1. A log row's targets are videos with a history row for that viewer whose
   `last_played_at` falls in `[computed_at, next log row's computed_at)` (until now for the
   last row) and whose `e` is above 0.
2. `recall@12` and `recall@40` against the logged ids (the first 12, and all of them), and
   `hit@40`, as in `replay`. A log row with no target is skipped and counted.

Output: one table per viewer, one row per ISO week of `computed_at`, then a total row.
Each row has the means, the counts, and the profile versions of the log rows in it,
comma-separated. When `pickup_feed_log` does not exist yet, `online` prints
`no feed log` to stderr and exits 0.

### 2. Failure cases

- **The core DB cannot be read** (video set, history, likes, segments): as today, the
  drive or viewer is skipped for this sweep, logged, and picked up on the next one. The
  stored feed is left as it was.
- **A viewer has history in the drive but no kept row** (only documents, only brief
  opens, only dismissed videos): the stored feed becomes empty (`total = 0`) and the
  checkpoint is stored. The viewer is not rebuilt again until their history moves, as
  with an empty history today.
- **A viewer has kept rows but no lane** (no kept file has a vector yet): the stored feed
  becomes empty with a null checkpoint, as today, so the next sweep tries again once
  indexing catches up.
- **A drive has no video with embeddings**: no candidates, so the feed is empty with its
  checkpoint stored.
- **The log write fails** (disk, lock): the error is logged as a warning, the feed already
  committed stays, and the next rebuild writes a new log row. A log row is never written
  for a feed that was not committed.
- **`replay` on a drive with no history or no videos**: prints tables with zero evaluated
  cut points. Exits 0.
- **`online` with no log rows in the window**: prints a total row of zero counts. Exits 0.
- **An unknown drive or viewer passed to a command**: as above (no rows). The command
  does not check the drive against `drives.json`.
- **A database file is missing or unreadable for a command**: exits non-zero with the
  error on stderr.

### 3. States

A viewer's feed per drive is one `pickup_profiles` row plus its `pickup_items`. Its
states, with the checkpoint each leaves:

| State | `total` | checkpoint |
|---|---|---|
| absent | no row | none |
| empty, settled | 0 | stored |
| empty, retrying | 0 | null |
| populated | > 0 | stored |

Transitions happen only in a rebuild for that viewer and drive:

- absent → any of the other three: the first rebuild (the viewer has a history row in the
  drive).
- empty, settled → populated / empty, retrying: the history signature moved (new or
  changed rows, likes, favourites, played ranges, dismissal, the date, the profile
  version).
- empty, retrying → any present state: every sweep, regardless of the signature.
- populated → empty, settled: the signature moved and no kept row remains, or no video
  candidate remains.
- populated → empty, retrying: kept rows exist but none has a vector.
- populated → populated: the signature moved.
- Nothing returns a feed to absent. This change does not alter that.

A failed rebuild (unreadable core data) leaves the state and the checkpoint as they were.

`pickup_feed_log` rows are only appended and pruned at 180 days. There is no other
state.

### 4. Data read and written

| Store | Read / written | What |
|---|---|---|
| Core DB `files` | read | `id`, `drive`, `file_type`, `mime_type`, `liked_at`, `is_favorite`, `deleted_at`, `missing_since`, `created_at` (the commands only) |
| Core DB `watch_history` | read | `viewer_id`, `file_id`, `playback_position`, `duration`, `last_played_at`, `dismissed_at` |
| Core DB `played_segments` | read | per (viewer, file), the sum of `played_seconds` |
| Intelligence DB `embeddings`, `indexed_files`, `vec_clip`, `vec_text` | read | as today |
| Intelligence DB `pickup_items`, `pickup_profiles` | written | as today |
| Intelligence DB `pickup_feed_log` (new) | written by the worker, read by `online` | see below |

`pickup_feed_log`: `drive_id TEXT`, `viewer_id VARCHAR(16)`, `computed_at DATETIME`
(naive UTC), `profile_version INTEGER`, `file_ids TEXT` (JSON array). Primary key
`(drive_id, viewer_id, computed_at)`, and an index on `computed_at`. Created by
`Base.metadata.create_all` in `init_search_db`. No existing table changes.

The core DB is mounted read-only into the Intelligence container, and nothing here writes
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
- The evaluation commands run only inside a container on the host, so only the operator
  can run them. They read every viewer's history of the drive they are given, the same
  data the worker reads.

### 7. Effect on existing features

- **Drive home Pickup row, Pickup page, video app Recommended**: all read the same stored
  feed through `GET /pickup`, so all become videos only. On a drive with no videos, the
  home row and the Pickup page show nothing, as they already do for an empty feed
  (`PickupWidget` returns null). Recommended's `restrict` (type=video plus the smart
  folder plus `watch=unwatched`) now drops fewer rows, so its 5-page cap is reached later
  or not at all.
- **SPEC-ADDON-094** (Recommended's page provider, approved 2026-11-12, not yet
  implemented) pages the same feed. It needs no change, because the feed's shape is
  unchanged.
- **Continue watching, history, likes, favourites, dismissal**: read-only here,
  unchanged.
- **The 90% completion gate** (`drives.py`) is untouched. Engagement is a separate reading
  of the same columns.
- **`find_similar`** and search: untouched. Candidate loading is Pickup's own
  (`app/pickup/retrieval.py`).
- **`personal_history` (Ask)**: reads `watch_history` itself, so it is unaffected.

### 8. Error behavior

Nothing new is visible to the viewer. A failed rebuild leaves the previous feed, as today.
Logged:

- the existing warnings and exceptions for unreadable core data;
- `Pickup: could not write feed log drive=%s viewer=%s` at WARNING, with the exception;
- at DEBUG, per viewer: kept rows, dropped rows by reason (not a video, `e = 0`), and lanes.

The commands print errors to stderr and exit non-zero only when they cannot open a
database.

### 9. User-visible behavior

- Every Pickup surface shows videos only. Documents, images, audio and other files no
  longer appear, and history of them no longer affects which videos appear.
- A video opened and closed early (under a tenth watched), or dismissed from Continue
  watching, no longer pulls similar videos into Pickup, unless it is liked or a favourite.
  It still never appears in Pickup itself.
- Liking or favouriting a video affects Pickup from the next sweep (within an hour), even
  without watching more of it, and so does undoing either.
- The daily twelve on the home row and Recommended are still drawn from the top 40, and
  the full feed keeps a stable order. No text, layout or control changes.
- `docs/addons/intelligence.md` (Pickup section) says that Pickup lists videos only, that
  how much of a video was watched, likes and favourites weight the history, and that a
  video opened briefly or dismissed does not count. Its operator part documents the two
  commands and the 180-day log. `docs/user-guide/video.md` needs no change (Recommended
  was already videos only).

### 10. Non-functional

- **Time**: a rebuild adds one query per drive for the video set and one per viewer for
  likes, dismissal and segments. The weighted k-means costs the same as today. The video
  filter shrinks the candidate matrices.
- **Command time**: `replay` with the defaults on the production `videos` drive must
  finish in under 10 minutes on the Mac mini.
- **Size**: about 40 ids per logged feed, a few rebuilds per viewer and drive a day,
  pruned at 180 days. A few MB at most.
- **Privacy**: the log holds the same kind of data as `pickup_items` (file ids per
  viewer). It stays in the Intelligence DB and is never served by an endpoint.
- **Shipping bar** (user decision 2026-11-12): before merge, `replay` runs with the
  defaults against copies of the production databases, never against the live files:
  1. Inside the running production `backend` and `intelligence` containers, the user
     takes an SQLite `.backup` of the core DB and of `search.db` into a scratch
     directory.
  2. On the Mac mini, the Intelligence image is built from this branch, and the command
     runs with `docker run --rm`, the copies mounted read-only and pointed at by
     `HOMEVAULT_DB_PATH` and `INTELLIGENCE_SEARCH_DB_PATH`. The running stack is not
     touched.
  3. The user runs the commands themselves (`!`). The author supplies them, each line
     under about 60 characters.

  It passes when, for every viewer with at least 10 evaluated cut points on the `videos`
  drive, `after` has `recall@40` at least `before`'s and above `random`'s. When no viewer
  reaches 10 evaluated cut points, it has not passed. In either failing case the author
  stops and shows the table to the human, and only the human revises the constants. The
  table goes into the review topic's `decisions.md`.

## Touch points

- `addons/intelligence/app/pickup/profile.py`: the history read (video filter,
  engagement fields, filter before the cap), engagement, weighted means, a reference-time
  parameter, the watch signature, `PROFILE_VERSION`.
- `addons/intelligence/app/pickup/retrieval.py`: candidates restricted to a given file-id
  set.
- `addons/intelligence/app/workers/pickup.py`: the per-drive video set, the settled
  checkpoint for a history with no kept row, the feed log write and pruning.
- `addons/intelligence/app/models.py`: `PickupFeedLog`.
- `addons/intelligence/app/database.py`: the new table through `create_all` (no
  `ALTER`), and a read-only opener for the commands.
- `addons/intelligence/app/pickup/evaluate.py` (new): the `replay` and `online`
  commands.
- `addons/intelligence/app/routers/pickup.py`: read, unchanged in shape.
- Core DB tables read: `files`, `watch_history`, `played_segments`.
- `docs/addons/intelligence.md`, `docs/specs/INDEX.md`, the `addons/intelligence`
  submodule pointer.
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary, watch history
  and completion, file state), `.claude/rules/backend-conventions.md` (migrations only
  add).
- No protected path is edited.

## Invariants

I1. In the stored profile, each kept video weighs, in both its lane's centroid and its lane's raw weight, exactly its engagement as defined: 1 when liked or a favourite whatever it was watched, else 0 when dismissed, else `min(1, f / 0.5)` from a watched fraction of 0.10 up, else 0.5 for a `.loft` without a reported duration.
I2. Adding or removing a history row for a non-video file, or for a video with engagement 0, changes the stored feed only by excluding or re-admitting that file, including when the viewer's history exceeds 2000 rows or spans the 365-day window.
I3. No file whose core `file_type` is not `video` appears in a stored feed.
I4. A file the viewer has opened in the drive, of any kind and any engagement, trashed or missing included, never appears in that viewer's feed for the drive.
I5. A feed is built only from the history and files of its own drive.
I6. Liking, unliking, favouriting, unfavouriting, adding played ranges to, or dismissing a video the viewer has opened, and deploying a new `PROFILE_VERSION`, each cause that viewer's feed for the drive to be rebuilt on the next sweep with no change to `last_played_at`.
I7. A failure to write `pickup_feed_log` leaves the stored feed and its profile row as committed, and no log row exists for a feed that was not committed.
I8. Each committed feed with `total > 0` has exactly one `pickup_feed_log` row, holding its first `min(40, total)` file ids in rank order with the profile's `computed_at`; an empty feed has none; and after any log write no row older than 180 days remains.
I9. Neither evaluation command changes either database file.
I10. In `replay` at cut point `t`, no configuration ranks a file that had a history row before `t` or was created at or after `t`, and targets are exactly the videos with engagement above 0 whose `last_played_at` is in `[t, t + horizon)`; in `online`, a log row's targets are exactly those in `[computed_at, next computed_at)`.

## Checked, no action

- **Recording impressions and clicks on Recommended.** Rejected by the user in favour of
  the feed log. It would need the core shelf and its card links to report back, and it
  misses videos found by other routes. As a consequence, `online` measures the feed
  before any surface's `restrict` (smart folder, `watch=unwatched`), not what a surface
  drew.
- **Historical accuracy of replay.** `watch_history` keeps one row per (viewer, file).
  A rewatch moves `last_played_at` past the cut point and drops the file from the history
  at `t`. Engagement, like, favourite, dismissal and live state are today's values, not
  those at `t`. Replay therefore sees a slightly shorter, slightly better-informed history
  than the real one at `t`. The bias is the same for every configuration, so the
  comparison stands. `online` has no such leak.
- **Rewatch targets in `online`.** A file opened before a log row and rewatched after it
  counts as a target that the feed could never have held, which deflates recall a little.
  Telling them apart needs per-play history, which the core does not keep.
- **`liked_at` and `is_favorite` are per file, not per viewer.** One household member's
  like weights another member's profile, but only for a file that member has also opened.
  Accepted for a household tool.
- **`p` counts replayed parts twice.** A viewer who replays the first minute of a long
  video ten times reaches a higher `f` than they watched. Accepted: it is still
  engagement, and it avoids copying the core's segment size into the addon.
- **`files.duration` as a fallback for the reported duration.** Not used. A zero reported
  duration means playback never started, and that is exactly what rule 5 is for.
- **Abandoned or dismissed videos as a negative signal** (pushing candidates away from
  them). Deferred. This spec only stops them counting as interest.
- **A next-episode shelf, a "not interested" control, rank-weighted daily sampling.**
  Deferred. These are separate specs, and the first needs a core/addon boundary decision.
- **Adding `whisper` (transcript chunks) as a channel.** Out of scope. Videos already
  carry `tfidf_keywords`.
- **Re-admitting briefly opened videos as candidates.** Not done: a video the viewer
  opened and closed is one they have seen and turned down. The core's `watch=unwatched`
  is looser. It counts a video opened but never played (stored duration 0) as unwatched
  (`backend/app/routers/shelves.py`, `_watch_bucket`). Pickup keeps such a video out, as
  it does today.
- **`purge_drive` and the Pickup tables.** A drive whose `index` policy is turned off
  keeps its `pickup_*` rows, as `pickup_items` already does. `pickup_feed_log` rows for it
  stay until the 180-day prune, which runs on any log write. Unchanged behaviour, and
  nothing serves the log.
- **Recommending documents somewhere else.** A separate entry point, if ever. The user
  decided Pickup is for videos.
- **Making the constants configurable.** Not done. They are code constants under
  `PROFILE_VERSION`, revised from replay results.
- **Time-of-day or device context.** Not considered for this spec. There is no
  per-request profile.
