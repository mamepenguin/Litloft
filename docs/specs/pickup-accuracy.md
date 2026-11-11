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
- **Live**: `deleted_at` and `missing_since` both NULL.
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
- **Engagement** `e` of a video's history row, in `[0, 1]`. The first matching rule
  applies:
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
  counts as fully watched. These values are first guesses, checked by the shipping bar
  (item 10).
- **Reference time** `now`, and an optional upper bound `until`: the instant ages, the
  window and "newest" are measured from, and the end of the history read. The worker
  uses the current time and no `until`. The replay uses `now = until = t` for cut point
  `t`.
- **Window rows** at a reference time: the viewer's history rows in the drive whose
  `last_played_at` parses, is not more than 1 day after `now`
  (`_FUTURE_TOLERANCE_DAYS`, as today), is before `until` when one is given, and is no
  more than 365 days before `now`.
- **Kept row**: a window row of a live video with `e > 0`.

## Required items

### 1. Normal flow

**Building a feed (SPEC-ADDON-095, SPEC-ADDON-096).** The worker keeps its triggers
(`scan.complete` webhook, hourly sweep) and its per-drive, per-viewer loop. Changes:

1. Per drive, once per sweep, the worker reads the set of live videos in the drive from
   the core DB (`files` with `drive = :drive`, `file_type = 'video'`, live).
2. Candidate rows for each channel (`clip_thumbnail`, `tfidf_keywords`, `text_content`)
   are loaded as today, and then only rows whose file is in that set are kept, with
   `CandidateSet.file_ids` and the matrix rows filtered together. A channel that no video
   in the drive has produces no candidates, and so no lanes.
3. Per viewer, the profile history is the kept rows, newest first, cut to 2000. The
   window, the timestamp drops, the kind filter and the `e = 0` drop all happen before
   the cap. So a document, an unparseable row or a video with `e = 0` never pushes a kept
   row out. Each kept row carries its `e`.
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

**Code shape.** The worker and the replay go through the same functions:

- `profile_history(drive, viewer_id, *, now, until=None, videos_only=True, weighted=True)`
  returns `WatchedFile(file_id, last_played_at, engagement)` rows, newest first, cut to
  2000.
  - `videos_only` keeps live videos only; otherwise live files of every kind.
  - `weighted` gives video rows their `e` and drops those with `e = 0`; rows of other
    kinds get `e = 1`. When `weighted` is false, every row gets `e = 1` and none is
    dropped.
  - The worker calls it with the defaults.
- `build_lanes(history, *, key, now, vectors=representative_vectors)` takes the reference
  time and a vector source, a callable `(file_ids, channel) -> {file_id: unit vector}`.
  The worker passes nothing, which keeps today's reads. The replay passes a lookup into
  vectors it loaded once.
- `engagement(...)` is a pure function of the fields in the Definitions.
- `load_candidates` stays as it is. A new `restrict_candidates(candidates, file_ids)`
  returns the subset, with ids and matrix rows filtered together.

**Settled and retrying empty feeds.** Today an empty window stores the checkpoint
(settled), and an empty lane list or an empty interleave stores a null checkpoint
(retrying). After this change, an empty feed is settled in exactly one case: the viewer
has no kept row. That case now includes histories whose window rows are all non-video,
all `e = 0`, or all dismissed, which today build lanes. Every other empty outcome stays
retrying, as today, because indexing may still catch up:
- kept rows, but none has a vector (no lane);
- the drive has no video candidate row;
- lanes and candidates exist, but no candidate survives the exclusion and the score
  floor.

**Rebuild trigger (SPEC-ADDON-095).** The watch signature (`profile.watch_signature`,
unpacked by the worker's `_stale_work` and hashed by `_checkpoint`) gains, per history
row: the file's liked state (`liked_at IS NOT NULL`), its favourite state, `p`, and
whether the row is dismissed. Liking or unliking, favouriting or unfavouriting, recording
played ranges, or dismissing moves the checkpoint even when `last_played_at` did not
move, and the next sweep rebuilds that viewer's feed. The signature still covers every
history row of the drive (not only videos), as today. Rows are hashed sorted by file id,
and `p` is written rounded to one decimal with a fixed format, so an unchanged history
hashes the same on every sweep.

**Recording the feed (SPEC-ADDON-097).** `_store` returns the `computed_at` it wrote.
After `_store` commits a feed with at least one item, the worker writes one
`pickup_feed_log` row in its own transaction:
`(drive_id, viewer_id, computed_at, profile_version, file_ids)`. `computed_at` is the
value `_store` returned, stored in the same form. `file_ids` is a JSON array of the first
40 stored file ids in rank order (fewer when the feed is shorter). In the same
transaction, rows of any drive and viewer with `computed_at` older than 180 days are
deleted. An empty feed writes no log row.

**Evaluating (SPEC-ADDON-098).** The operator runs, inside the Intelligence container:

```
python -m app.pickup.evaluate replay --drive <name> [--days 60] [--horizon 7] [--viewer <id>]
python -m app.pickup.evaluate online --drive <name> [--days 30] [--viewer <id>]
```

In normal use this is `docker compose exec intelligence python -m app.pickup.evaluate …`
against the live databases. A `mode=ro` connection inside the container that owns the
database reads a WAL database safely; only opening it from the macOS host through the bind
mount is unsafe. Before merge, the commands run against copies (item 10), because the
running image does not have them yet.

Both commands open the core DB (`HOMEVAULT_DB_PATH`) and the Intelligence DB
(`INTELLIGENCE_SEARCH_DB_PATH`, or the default path) through a new read-only opener in
`app/database.py`. It sets the same module-level engines and session factories that
`get_litloft_db`, `get_search_db_read` and `get_search_engine` use, so the unchanged
readers work. Its connections are SQLite `mode=ro` URIs with sqlite-vec loaded, and it
attaches no listener that issues a `PRAGMA` write. The commands never call
`init_search_db`, `init_litloft_db` or anything else that creates tables or migrates.

`replay`, per viewer with history in the drive (or the one given). Let `T0` be today's
00:00 UTC. The cut points are `t = T0 - horizon - i days` for `i = 0 .. days - 1`, so
every cut point's target window `[t, t + horizon)` has fully passed. For each cut point:

1. **Opened before t**: files with this viewer's history row in the drive and
   `last_played_at < t`.
2. **Universe at t**, per channel: the drive's candidate rows (`load_candidates`, loaded
   once per channel), restricted to live files with `files.created_at < t` that were not
   opened before `t`.
3. **Targets at t**: live videos of the drive with `files.created_at < t`, with this
   viewer's history row whose `last_played_at` is in `[t, t + horizon)` and whose `e` is
   above 0. A target with no vector in any channel still counts: no configuration can
   rank it, which is a real miss.
4. A cut point with no target is skipped and counted as skipped.
5. Each configuration produces a ranking:
   - `before`: `profile_history(..., now=t, until=t, videos_only=False, weighted=False)`,
     candidates of every kind, then `build_lanes`, `score_lanes`, `interleave` as in the
     worker. Apart from cutting the history after the timestamp drops instead of before
     them, this is the ranking before this change.
   - `depth`: as `before` with `weighted=True`.
   - `video`: as `before` with `videos_only=True` and video candidates only.
   - `after`: `videos_only=True, weighted=True`, video candidates only. This is the
     worker's path.
   - `random`: the universe's videos (with a vector in any channel), in a random order
     seeded by drive, viewer and `t`.
   - `newest`: the same videos by `files.created_at`, newest first, then file id.

   History vectors come through `build_lanes`'s `vectors` source, from vectors loaded
   once per viewer and channel.
6. Metrics per configuration and cut point, with `T` the targets and `R_k` the first `k`
   of the ranking: `recall@k = |T ∩ R_k| / |T|` for `k = 12` and `40`, and `hit@40 = 1`
   when `T ∩ R_40` is non-empty, else 0.
7. Per viewer and configuration, each metric is the mean over the evaluated cut points.
   Viewers are never pooled.

`online`, per viewer:

1. **Targets**: live videos of the drive with this viewer's history row whose
   `last_played_at` is in the last `--days` days and whose `e` is above 0.
2. A target's **feeds**: this viewer's log rows for the drive with `computed_at` in
   `[last_played_at - 48 h, last_played_at)`. A feed shown before the viewer opened the
   video is among them as long as the last progress save came within 48 hours of that
   feed. Feeds built after the video was opened already excluded it, so they cannot hide
   a hit.
3. A target with no feed is not evaluated and is counted as unscored.
4. A target is a hit at 12 when it is among the first 12 ids of any of its feeds, and a
   hit at 40 when it is among the ids of any of its feeds.
5. `recall@12` and `recall@40` are the shares of evaluated targets that are hits.

When `pickup_feed_log` does not exist yet, `online` prints `no feed log` to stderr and
exits 0.

**Output.** Markdown on stdout, viewers ordered by viewer id. Each viewer starts with a
line `viewer <id>`. Ratios have three decimals. A mean over zero items prints `-`.

- `replay`: then a line `candidate videos: <n at the earliest cut point> .. <n at the
  latest cut point>`, then a table with the columns
  `config | cuts | skipped | targets | recall@12 | recall@40 | hit@40`, one row per
  configuration in the order above. `cuts` counts evaluated cut points. `targets` sums
  the targets over them, so a file can count at several cut points.
- `online`: a table with the columns
  `week | targets | unscored | recall@12 | recall@40 | versions`. There is one row per
  ISO week of the target's `last_played_at` (`YYYY-Www`), oldest first, then a row
  `total`. `targets` counts evaluated targets. `versions` lists the `profile_version`
  values of the feeds used, ascending and comma-separated.

### 2. Failure cases

- **The core DB cannot be read** (video set, history, likes, segments): as today, the
  drive or viewer is skipped for this sweep, logged, and picked up on the next one. The
  stored feed is left as it was.
- **A viewer has no kept row** (only documents, only brief opens, only dismissed videos,
  or nothing in the window): the stored feed becomes empty (`total = 0`) and the
  checkpoint is stored (settled).
- **A viewer has kept rows but no lane**, **the drive has no video candidate row**, or
  **no candidate survives the exclusion and the score floor**: the stored feed becomes
  empty with a null checkpoint (retrying), as today.
- **The log write fails** (disk, lock timeout): the error is logged as a warning, the
  feed already committed stays, and the next rebuild writes a new log row. A log row is
  never written for a feed that was not committed.
- **No viewer to evaluate** (the drive has no history, an unknown drive or viewer):
  the command prints the single line `no viewers` to stdout and exits 0. It does not
  check the drive against `drives.json`.
- **A viewer with no evaluated cut point or target**: that viewer's table is printed
  with zero counts and `-` means. Exits 0.
- **A database file is missing or unreadable for a command**: exits non-zero with the
  error on stderr.

### 3. States

A viewer's feed per drive is one `pickup_profile` row plus its `pickup_item` rows. Its
states, with the checkpoint each leaves:

| State | `total` | checkpoint |
|---|---|---|
| absent | no row | none |
| empty, settled | 0 | stored |
| empty, retrying | 0 | null |
| populated | > 0 | stored |

Transitions happen only in a rebuild for that viewer and drive:

- absent → empty settled / empty retrying / populated: the first rebuild (the viewer has
  a history row in the drive).
- empty settled or populated → any present state, itself included: only when the
  signature moved (history rows added or changed, likes, favourites, played seconds,
  dismissal, the date, the profile version). Which state follows depends on the outcome:
  no kept row → settled; kept rows and an empty feed → retrying; otherwise populated.
- empty retrying → any present state: on every sweep, whether or not the signature
  moved.
- Not allowed: any transition to absent; any change to a settled or populated feed while
  the signature is unchanged; any change of state caused by the log write.

A failed rebuild (unreadable core data) leaves the state and the checkpoint as they were.

`pickup_feed_log` rows are only appended, and pruned at 180 days.

### 4. Data read and written

| Store | Read / written | What |
|---|---|---|
| Core DB `files` | read | `id`, `drive`, `file_type`, `mime_type`, `liked_at`, `is_favorite`, `deleted_at`, `missing_since`, `created_at` (the commands only) |
| Core DB `watch_history` | read | `viewer_id`, `file_id`, `playback_position`, `duration`, `last_played_at`, `dismissed_at` |
| Core DB `played_segments` | read | per (viewer, file), the sum of `played_seconds` |
| Intelligence DB `embeddings`, `indexed_files`, `vec_clip`, `vec_text` | read | as today |
| Intelligence DB `pickup_item`, `pickup_profile` | written | as today, plus the settled checkpoint when there is no kept row |
| Intelligence DB `pickup_feed_log` (new) | written by the worker, read by `online` | see below |

`pickup_feed_log`: `drive_id TEXT`, `viewer_id VARCHAR(16)`, `computed_at DATETIME`,
`profile_version INTEGER`, `file_ids TEXT` (JSON array). Primary key
`(drive_id, viewer_id, computed_at)`, and an index on `computed_at`. Created by
`Base.metadata.create_all` in `init_search_db`. No existing table changes. An older build
ignores the table.

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
- **SPEC-ADDON-094** (Recommended's page provider, approved 2026-11-12, on another
  branch) pages the same feed. It needs no change, because the feed's shape is
  unchanged. Both branches bump the `addons/intelligence` pointer, so whichever merges
  second rebases its addon commit onto the first's. That spec's remark that the Pickup
  page lists every kind of file stops being true here. That is a rationale there, not an
  invariant.
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
- at DEBUG, per viewer: kept rows, dropped rows by reason (not a video, `e = 0`), and
  lanes.

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
- `docs/addons/intelligence.md`:
  - the feature table's Pickup row says it is a feed of videos you have never opened;
  - the Pickup section says that Pickup lists videos only, that how much of a video was
    watched, likes and favourites weight the history, and that a video opened briefly or
    dismissed does not count;
  - its operator part documents the two commands (run with `docker compose exec`) and
    the 180-day log.

  `docs/user-guide/video.md` needs no change, because Recommended was already videos
  only.

### 10. Non-functional

- **Time**: a rebuild adds one query per drive for the video set and one per viewer for
  likes, dismissal and segments. The weighted k-means costs the same as today. The video
  filter shrinks the candidate matrices.
- **Command time**: `replay` with the defaults on the production `videos` drive must
  finish in under 10 minutes on the Mac mini.
- **Size**: about 40 ids per logged feed. Every viewer is rebuilt at least once a day,
  because the checkpoint includes the date, plus once per watch-driven rebuild. Rows are
  pruned at 180 days. A few MB at most.
- **Lock**: the log write takes the Intelligence DB's write lock after the feed commit.
  A lock timeout is the "log write fails" path. The first sweep after deployment rebuilds
  and logs every viewer, once.
- **Privacy**: the log holds the same kind of data as `pickup_item` (file ids per
  viewer). It stays in the Intelligence DB and is never served by an endpoint.
- **Shipping bar** (procedure decided by the user, 2026-11-12). Before merge, `replay`
  runs with the defaults against copies of the production databases, never against the
  live files from outside their container:
  1. Inside the running production `backend` and `intelligence` containers, the user
     copies the core DB (`/app/data/data.db`) and `/intelligence-data/search.db` with
     Python's `sqlite3` backup API (the images have no `sqlite3` CLI). The copies go into
     a scratch directory under the bind-mounted data directory, so the host sees them.
     Each copy is then switched out of WAL (`PRAGMA journal_mode=DELETE`), so it can be
     opened `mode=ro` from a read-only mount.
  2. On the Mac mini, the Intelligence image is built from this branch. The command runs
     with `docker run --rm`, with the copies mounted read-only and pointed at by
     `HOMEVAULT_DB_PATH` and `INTELLIGENCE_SEARCH_DB_PATH`. The running stack is not
     touched.
  3. The user runs the commands themselves (`!`). The author supplies them, each line
     under about 60 characters. The copies are deleted afterwards.

  It passes when, for every viewer with at least 10 evaluated cut points on the `videos`
  drive, `after` has `recall@40` at least as high as both `before`'s and `video`'s.
  - `after` against `before` checks the whole change.
  - `after` against `video` checks the engagement constants on their own, since both
    rank videos only.
  - `random` and `newest` are printed for reference and are not part of the bar. Replay
    flatters every content-based configuration against them (see "Historical accuracy
    of replay"). `online` answers that question after shipping.

  When no viewer reaches 10 evaluated cut points, the bar has not passed. In either
  failing case the author stops and shows the table to the human. Only the human revises
  the constants, as a revision of I1 in `docs/process/reviews/<topic>/invariants.md`.
  `replay` is then run again with them. `PROFILE_VERSION` stays 3, because nothing has
  shipped. The table of the passing run goes into the review topic's `decisions.md`.

## Touch points

- `addons/intelligence/app/pickup/profile.py`:
  - `profile_history` (`now`, `until`, `videos_only`, `weighted`; filters before the
    cap);
  - `engagement`, and the `engagement` field of `WatchedFile`;
  - `build_lanes` (`now`, `vectors`), with every member mean weighted by `e`
    (`_kmeans`, `_centroid`, `_merge_singletons`) and with `raw_weight`;
  - `watch_signature`, and `PROFILE_VERSION`.
- `addons/intelligence/app/pickup/retrieval.py`: `restrict_candidates`.
- `addons/intelligence/app/workers/pickup.py`:
  - the per-drive video set;
  - `_stale_work` and `_checkpoint` for the extended signature;
  - `_compute_for_viewer` for the settled and retrying empty outcomes;
  - `_store` returning `computed_at`;
  - the feed log write and pruning.
- `addons/intelligence/app/models.py`: `PickupFeedLog`.
- `addons/intelligence/app/database.py`: the new table through `create_all` (no `ALTER`),
  and the read-only opener.
- `addons/intelligence/app/pickup/evaluate.py` (new): `replay` and `online`.
- `addons/intelligence/app/routers/pickup.py`: read, unchanged in shape.
- The existing pickup tests (`tests/test_z_pickup_*.py` and the worker tests). They are
  updated where they pin unweighted means, `raw_weight(ages)`, every-kind candidates, or
  lanes built from a history with no kept row. None is deleted or loosened.
- Core DB tables read: `files`, `watch_history`, `played_segments`.
- `docs/addons/intelligence.md` (feature table and Pickup section), `docs/specs/INDEX.md`,
  the `addons/intelligence` submodule pointer.
- Rules passed through:
  - `.claude/rules/design-decisions.md` (drive boundary, watch history and completion,
    file state);
  - `.claude/rules/backend-conventions.md` (migrations only add).
- No protected path is edited.

## Invariants

I1. For any history and reference time, `build_lanes` weights each kept video by exactly its engagement in every mean of member vectors (the k-means update, the singleton merge choice, the directionless check and the lane centroid, each normalized) and in the lane raw weight `log1p(sum(e * decay(age)))`, where `e` is 1 for a liked or favourite video however little was watched, else 0 when dismissed, else `min(1, f / 0.5)` from `f = 0.10` up and 0 below, else 0.5 for a `.loft` without a reported duration, else 0.
I2. At a fixed reference time, adding or removing a history row for a non-video file, or for a video with engagement 0, changes the built feed only by excluding or re-admitting that file, including when the viewer has more than 2000 kept rows and when rows lie on both sides of the 365-day window.
I3. No file whose core `file_type` is not `video` appears in a stored feed.
I4. A feed is built only from its own drive's history and files, and never contains a file the viewer has opened in that drive, of any kind and any engagement, trashed or missing included.
I5. With `last_played_at` unchanged, liking, unliking, favouriting, unfavouriting, adding played ranges to or dismissing a video the viewer has opened, or deploying a new `PROFILE_VERSION`, causes that viewer's feed for the drive to be rebuilt on the next sweep, and two sweeps over an unchanged history compute the same checkpoint.
I6. With the signature unchanged, a viewer with no kept row is not rebuilt again that day, and a viewer whose feed came out empty while kept rows exist is rebuilt on every sweep.
I7. A committed feed with `total > 0` has at most one `pickup_feed_log` row, and exactly one when the log write succeeds, holding its first `min(40, total)` file ids in rank order with the profile's `computed_at`; an empty feed has none; a failed log write leaves the feed and its profile row as committed; after any log write no row older than 180 days remains.
I8. Neither evaluation command changes either database file or creates a table, including when `pickup_feed_log` does not exist.
I9. In `replay` at cut point `t`, no configuration ranks a file the viewer opened before `t` or one created at or after `t`; the targets are exactly the live videos created before `t` with engagement above 0 and `last_played_at` in `[t, t + horizon)`; `recall@k = |T ∩ R_k| / |T|` is averaged per viewer over evaluated cut points only; and `after` ranks exactly as the worker builds the feed for the same history, candidates and reference time.
I10. In `online`, a target is a hit at `k` exactly when it is among the first `k` ids of one of that viewer's log rows for the drive computed in the 48 hours before its `last_played_at`, and a target with no such row is unscored rather than counted as a miss.

## Checked, no action

- **Recording impressions and clicks on Recommended.** Rejected by the user in favour of
  the feed log. It would need the core shelf and its card links to report back, and it
  misses videos found by other routes. As a consequence, `online` measures the feed
  before any surface's `restrict` (smart folder, `watch=unwatched`), not what a surface
  drew.
- **Historical accuracy of replay.** `watch_history` keeps one row per (viewer, file).
  - A video opened before `t` and resumed or rewatched after it has
    `last_played_at >= t`. Replay therefore treats it as an unseen candidate and a
    target, although production would have excluded it. A video watched across a cut
    point is common, because progress saves run during playback.
  - Content-based configurations rank such files highly, since they resemble the history.
    `random` and `newest` do not.
  - Engagement, like, favourite, dismissal and live state are also today's values.
  - So replay flatters every content-based configuration alike, which keeps their
    comparison fair, but flatters them all against `random` and `newest`. The shipping
    bar therefore compares content-based configurations only.
- **What `online` cannot see.**
  - A video opened before a feed and rewatched after it has its last play moved later,
    so a feed built after the first open (which excluded it) is the one in its 48-hour
    window. It then counts as a miss.
  - A watch whose last progress save comes more than 48 hours after the feed that showed
    it counts as a miss or as unscored.
  - Telling these apart needs per-play history, which the core does not keep.
  - Feeds that came out empty write no log row, so they never score. That is correct,
    because they showed nothing.
- **`before` against version 2.** `before` uses the new history read with every kind and
  `e = 1`. It differs from version 2 only in cutting the history at 2000 after dropping
  unparseable and future rows rather than before. No history near 2000 rows with such
  rows is expected. There is no stored version-2 oracle, and `before` is the same path
  with two switches off.
- **`liked_at` and `is_favorite` are per file, not per viewer.** One household member's
  like weights another member's profile, but only for a file that member has also opened.
  Accepted for a household tool.
- **`p` counts replayed parts twice.** A viewer who replays the first minute of a long
  video ten times reaches a higher `f` than they watched. Accepted: it is still
  engagement, and it avoids copying the core's segment size into the addon.
- **`files.duration` as a fallback for the reported duration.** Not used. A zero reported
  duration means playback never started, and that is exactly what rule 5 is for.
- **`files.created_at` as "existed at t".** It is the time the core inserted the row, so
  on a rescanned drive early cut points have few candidates. The `candidate videos` line
  shows how many, and a viewer needs 10 evaluated cut points for the bar to count.
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
  keeps its `pickup_*` rows, as `pickup_item` already does. `pickup_feed_log` rows for it
  stay until the 180-day prune, which runs on any log write. Unchanged behaviour, and
  nothing serves the log.
- **Recommending documents somewhere else.** A separate entry point, if ever. The user
  decided Pickup is for videos.
- **Making the constants configurable.** Not done. They are code constants under
  `PROFILE_VERSION`, revised from replay results.
- **Time-of-day or device context.** Not considered for this spec. There is no
  per-request profile.
