# Pickup recency: favour newer videos among the ones that match

SPEC-ID: SPEC-ADDON-102
SPEC-ID: SPEC-ADDON-103

Approval:

## Summary

Intelligence's Pickup feed (`addons/intelligence/app/pickup/`) ranks unopened videos by
how closely they resemble the viewer's interests. It feeds the drive home's Pickup row,
the Pickup page and the video app's **Recommended** shelf. Time enters only on the
history side (an interest goes quiet with a 7-day half-life). A candidate's own age is
never consulted, so a video added three years ago and one added yesterday rank the same
when they resemble the history equally.

The replay measured after SPEC-ADDON-095..098 shipped (main drive, viewer `02bb`, 55 cut
points) shows the cost: recall@40 was 0.098 for the shipped ranking and 0.127 for plain
newest-first. The viewer wants what a video site does: new arrivals first, chosen by
what they are interested in, and not simply the newest list.

- **SPEC-ADDON-102**: inside each interest lane, candidates are ranked by
  `similarity × freshness`, where freshness decays with the candidate's age. Which
  candidates qualify is unchanged (the similarity floor still applies to similarity
  alone). The half-life and floor of the decay are chosen by `replay`, which gains one
  row per candidate setting.
- **SPEC-ADDON-103**: a video that becomes a candidate in a drive is reflected in that
  drive's feeds on the next hourly sweep, rather than when the viewer's history next
  moves or the UTC date rolls.

## Definitions

- **Reference time** `now`: naive UTC, taken once per drive computation (one call of
  `_compute_for_drive`, hourly or after `scan.complete`) by calling
  `app.pickup.freshness.reference_now()` before any read. It is used for every viewer of
  that drive in that computation. It feeds freshness only. The profile window, the lane
  ages, the checkpoint's date term and `computed_at` keep their own clocks as today.
  Tests fix it by monkeypatching `reference_now`. In `replay` it is the cut point `t`.
- **Age** of a candidate at reference time `now`: `(now − files.created_at)` in days.
  `files.created_at` is set by the core scanner from the file's mtime when it inserts the
  row (`backend/app/services/scanner.py`), else the insert time. Nothing updates it later.
  It is the column the `newest` reference in `replay` already sorts by. It is parsed by
  the rules `last_played_at` uses (`_parse_naive_utc`): an aware value is converted to
  UTC, and a naive one is taken as UTC.
- **Freshness**: `FLOOR + (1 − FLOOR) × 0.5 ^ (age / HALF_LIFE_DAYS)`.
  - An age between −1 and 0 days (clock skew) is taken as 0.
  - A `created_at` that cannot be parsed, or lies more than 1 day after `now`, gets
    freshness `FLOOR`, the value of an infinitely old file. Freshness is never invented.
- **Ranking score**: `similarity × freshness`, computed in float64, where `similarity` is
  the lane score `score_lanes` computes today (cosine, chunks reduced by `max`).
- **Ranking order** within a lane, used both for the per-lane cut and in `interleave`:
  ranking score descending, then similarity descending, then file id ascending.
  - At freshness 1 for every candidate, this order equals version 3's, which sorts by
    similarity and then file id in `interleave`.
  - Version 3's per-lane cut breaks similarity ties by matrix row order. The cut now
    breaks them by file id. It changes which 120 a lane keeps only when the 120th and
    121st candidates have exactly equal similarity.
- `HALF_LIFE_DAYS` and `FLOOR` are constants of a new module `app/pickup/freshness.py`.
  They are separate from `app.pickup.profile.HALF_LIFE_DAYS` (interest decay), which
  does not change.

## Contracts

- `app/pickup/freshness.py`:
  - `HALF_LIFE_DAYS: float`, `FLOOR: float`.
  - `reference_now() -> datetime`: naive UTC now.
  - `freshness(created_at: datetime | None, now: datetime, *, half_life_days: float = HALF_LIFE_DAYS, floor: float = FLOOR) -> float`.
    `created_at` is naive UTC or `None`. `None` (unparseable) gives `floor`. With
    `floor = 1` it returns 1.0 for every input.
- `app.pickup.profile.live_videos(drive) -> dict[str, datetime | None]` replaces
  `live_video_ids`. It maps each live video id to its `created_at` parsed by
  `_parse_naive_utc`, or `None` when that fails.
- `app.pickup.retrieval.arrival_stamp(drive) -> str`: the stamp of step 11, as a
  deterministic string. It raises on a read failure.
- `score_lanes(candidates, centroids, *, channel, exclude_file_ids, limit, freshness: Mapping[str, float] | None = None)`:
  - It returns, per lane, `(file_id, similarity, ranking_score)` triples in ranking
    order.
  - `freshness=None` means 1.0 for every file. A file absent from a given mapping gets
    `FLOOR` (`app.pickup.freshness.FLOOR`).
  - `similarity` is `float(float32 value)`, as stored at version 3. `ranking_score` is
    `similarity * freshness` in float64, so it equals `similarity` exactly at freshness
    1.
- `interleave(lanes, scored, *, depth)`:
  - `scored` maps `cluster_id` to those triples.
  - A file present in several lanes' lists is credited to the lane with the highest
    `similarity` for it, with ties going to the lane listed first.
  - Survivors are sorted in ranking order.
  - `FeedItem` gains `similarity: float`, and `FeedItem.score` is the ranking score.

## Required items

### 1. Normal flow

**Ranking (SPEC-ADDON-102).**

1. A sweep finds a stale viewer and loads the drive's candidate sets, as today.
2. Reading the drive's live videos now also reads each one's `created_at`. One freshness
   value per live video is computed against the sweep's reference time. It does not
   depend on the viewer, so it is computed once per sweep.
3. `score_lanes` computes similarity as today. A candidate qualifies exactly as today:
   not opened by the viewer, similarity `>= 0.45` and `< 0.999`. Qualifying candidates
   are then ordered by ranking score, and each lane keeps its best 120 by ranking score.
   It is no longer the best 120 by similarity.
4. `interleave` credits a file reachable from several lanes to the lane with the highest
   similarity for it, with ties going to the lane listed first, as today. Each lane's
   survivors are sorted in ranking order, and the stride schedule over lane weights is
   unchanged.
5. The stored `pickup_item.score` and `FeedItem.score` hold the ranking score.
6. `PROFILE_VERSION` goes from 3 to 4, so every viewer's feed is rebuilt on the first
   sweep after deployment.

**Replay (SPEC-ADDON-102).**

7. `python -m app.pickup.evaluate replay` keeps its rows `before`, `depth`, `video`,
   `after`, `random` and `newest`.
   - `before`, `depth`, `video` and `after` call `score_lanes` with `freshness=None`
     (1.0 everywhere).
   - `after` is therefore observably the worker's ranking with `FLOOR = 1`: videos
     only, engagement weighted, no freshness. It is the baseline.
8. It adds one row per grid setting, named `f"fresh_h{H:g}_f{F:g}"` (`fresh_h7_f0`,
   `fresh_h30_f0.5`). The grid is `HALF_LIFE_DAYS ∈ {7, 30, 90, 365}` ×
   `FLOOR ∈ {0, 0.5}`, and the rows are reported in that order (H outer, F inner).
   - Each row reuses the lanes `after` built at that cut point. It does not run the
     profile and k-means again: freshness does not touch the profile.
   - It re-scores and re-interleaves with freshness computed at the cut point `t` from
     `t − created_at`.
9. The row whose `(H, F)` equals the worker's constants has `*` appended to its name in
   the report's configuration column (`fresh_h30_f0.5*`). When the worker's `FLOOR` is
   1 (see *Ship bar*), `after*` is marked instead.
10. The constants that ship are the grid setting with the highest recall@40 on the main
    drive for viewer `02bb`, run against a production copy as in SPEC-ADDON-098. The
    result is recorded in `docs/process/reviews/<topic>/decisions.md`. The ship bar is in
    *Checked, no action* → *Ship bar*.

**New arrivals (SPEC-ADDON-103).**

11. A drive computation that found viewers reads one drive-level **arrival stamp**. It
    reads it after listing viewers and before the staleness checks, the candidate load
    and the live-video read. The stamp is:
    - for each Pickup channel (`clip_thumbnail`, `tfidf_keywords`, `text_content`), the
      count of `embeddings` rows of that type whose `indexed_files` row is in the drive,
      active, and of `file_type = 'video'`;
    - the count of the drive's live videos in the core DB and the greatest `created_at`
      among them, as the stored text.
12. The stamp is part of every viewer's checkpoint for that drive. When a video's
    embedding of any Pickup channel is written, or a video is added, trashed, restored or
    goes missing, every viewer of the drive is rebuilt on that computation.
    - Reading the stamp first means an embedding written between the stamp read and the
      candidate load moves the next stamp, and its viewers are rebuilt again on the next
      computation.
    - Image and document embeddings do not move the stamp.

### 2. Failure cases

- **The live-video read fails.** The sweep for that drive is abandoned, as today: no
  feed is built from an unknown video set and no checkpoint moves.
- **The arrival-stamp read fails** (either database). The sweep for that drive is
  abandoned the same way and logged with `logger.exception`. Falling back to a stamp
  without arrivals would store a checkpoint that skips the viewer until the date rolls,
  which is the delay this spec removes.
- **A `created_at` that cannot be parsed, or one more than a day in the future.** That
  candidate gets freshness `FLOOR`. It is still ranked, by similarity times `FLOOR`. It
  is never dropped and never put first.
- **`FLOOR = 0` and a very old candidate.** The float64 product reaches exactly 0 only
  after about 1000 half-lives (about 20 years at H = 7). Such candidates still qualify.
  Among those tied at 0, the second key (similarity) orders them. The order is total
  through the file-id key.
- **Freshness rounding to `FLOOR`.** At `FLOOR > 0`, about 53 half-lives on, freshness
  equals `FLOOR` exactly, so two old files of different ages tie on freshness and are
  ordered by similarity, then file id. Equal freshness is the stated meaning of "both
  very old".
- **`replay` on a drive where a grid row yields no feed** (no lanes). That row scores like
  any empty ranking, as today.

### 3. States

None new. A viewer's Pickup state is still "no profile row", "profile with feed" or
"profile with empty feed", with the transitions of SPEC-ADDON-095..098. What changes is
when a rebuild is due: an arrival-stamp change becomes a third reason, after a history
change and a date change.

### 4. Data read and written

- Core DB `files` (read, through the existing read-only session): `created_at` is added
  to the live-video read. Count and max of `created_at` for the arrival stamp.
- Intelligence `search.db` `embeddings` and `indexed_files` (read): per-channel counts
  for the arrival stamp.
- `pickup_profile` (written, as today): the checkpoint now includes the arrival stamp and
  version 4.
- `pickup_item` (written, as today): ranks follow the new order, and `score` holds the
  ranking score.
- `pickup_feed_log` (written, as today): `profile_version = 4` on new rows.
- No schema change, except the additive index of §10 if the stamp read needs it.

### 5. External services

None. Everything runs inside the Intelligence container against its own DB and the
core DB mount.

### 6. Authorization

Unchanged. Feeds are per drive and per viewer. The candidate set, the live-video read and
the arrival stamp are each filtered to the drive being swept, so no count or date from
another drive enters a drive's checkpoint or ranking. Serving the feed keeps its
existing drive-access and viewer checks in `app/routers/pickup.py`.

### 7. Effect on existing features

- **Drive home Pickup row, Pickup page, video app Recommended and its See all**: they
  read `pickup_item` by rank. Their order and contents change. Their code does not. The
  daily window (Pickup row) and the top-40 shuffle (Recommended) now draw from a top that
  leans newer.
- **The profile** (`build_lanes`, lane weights, the 7-day interest half-life, `W_MIN`):
  unchanged.
- **`online`**: unchanged. New log rows carry version 4, so accuracy before and after
  can be split by version.
- **`find_similar`, search, Ask**: they do not use `score_lanes` or the Pickup tables.
  Unaffected.
- **Sweep cost**: during a video import, every viewer of the drive is rebuilt on each
  hourly sweep while video embeddings keep arriving. A rebuild is one candidate load per
  channel per sweep (shared by all viewers) plus one matrix product per viewer, which
  SPEC-ADDON-095..098 measured at 11–17 s for a whole multi-configuration replay.
  - The candidate load is shared by all of a drive's stale viewers, so viewers with no
    kept rows add no load of their own.
  - The time of one rebuilding computation on the main drive of the production copy is
    measured and recorded in `decisions.md`. It must be at most 2 minutes.
- **Daily picks during the day**: the drive-home row and Recommended draw a date-seeded
  shuffle from the feed's top. A rebuild already changes that top whenever the viewer
  plays something. Arrivals add a second cause, so during a video import the day's picks
  can change hourly. The Pickup page, paged by offset, can repeat or skip a row across a
  rebuild between pages, as it can today after a play.
- **Existing tests updated where they pin version 3** (none deleted or loosened):
  - `test_z_pickup_accuracy_worker.py` pins `PROFILE_VERSION == 3`.
  - `test_z_pickup_worker.py` pins the return shape of `live_video_ids` and the
    signature of `_checkpoint`.
  - `test_z_pickup_retrieval.py` pins the signature of `score_lanes` and its order.
  - `test_z_pickup_feed.py` calls `interleave` with `(file_id, score)` pairs. It moves to
    triples, and every property it asserts is kept.
  - `test_z_pickup_evaluate_after.py` asserts SPEC-ADDON-098 I9. It asserts the revised
    clause: `after` equals the worker's feed with `FLOOR` patched to 1, and the `*` row
    equals the worker's feed with its shipped constants. Its fixtures give files
    different `created_at` values, so that the two differ.

### 8. Error behavior

The viewer sees nothing new. Failures keep the last stored feed, as today. The operator
sees `logger.exception` lines for an abandoned sweep (live-video read, arrival stamp).
They follow the existing `Pickup: could not …; skipping this sweep` wording.

### 9. User-visible behavior

- Pickup, its page, and Recommended show newer videos higher among those that match the
  viewer's interests. How strongly depends on the shipped constants.
- A video added to a drive appears in those surfaces within about an hour of its
  embeddings being written, if it matches. Before this change it waited for the viewer's
  next play or the next UTC day.
- `docs/addons/intelligence.md`:
  - *Pickup* (and the feature-table row) says that newer videos rank higher among
    matching ones, unless freshness ships off (see *Ship bar*).
  - It says that new arrivals appear within the hour.
  - The Recommended sentence "up to 12 are picked for the day" also says the picks can
    change during the day as new videos arrive.
  - The *replay* bullet lists the `fresh_…` rows.
- `docs/user-guide/video.md`: the Recommended paragraph gains one sentence saying that
  newer videos come first among the ones that match, and that the picks can change
  during the day as new videos arrive.
- No text, control or default in the UI changes.

### 10. Non-functional

- Freshness for all live videos is one pass per sweep: O(videos), viewer independent.
- The arrival stamp is three counts on `search.db` plus one aggregate on core `files`.
  It is read per drive computation, only when the drive has viewers. It must take at
  most 1 s per drive on the production copy's main drive. That is measured and recorded
  in `decisions.md`. If it exceeds 1 s, an index on `embeddings(embedding_type)` or on
  `indexed_files(drive, file_type, active)` is added. That is an additive migration,
  which `backend-conventions.md` allows, and it is approved with this spec.
- `replay` re-scores 8 grid rows per cut point without rebuilding lanes. With the
  default `--days 60`, the run on the main drive of the production copy must take at
  most 2 minutes.
- No new data leaves the container. `created_at` was already readable through the core
  DB mount.

## Touch points

- `addons/intelligence/app/pickup/retrieval.py`: `score_lanes` takes per-file freshness,
  ranks and cuts by ranking score, and keeps qualification on similarity.
- `addons/intelligence/app/pickup/feed.py`: `interleave` takes triples, credits by
  similarity and orders by ranking order (see *Contracts*). The stride is unchanged.
- `addons/intelligence/app/pickup/profile.py`: `live_videos` replaces `live_video_ids`.
  `PROFILE_VERSION = 4`.
- `addons/intelligence/app/pickup/retrieval.py`: `arrival_stamp`.
- `addons/intelligence/app/workers/pickup.py`: computes freshness once per sweep, reads
  the arrival stamp, and puts it in `_checkpoint`.
- `addons/intelligence/app/pickup/evaluate.py`: grid rows, the `*` mark, and freshness at
  cut point `t`.
- `addons/intelligence/tests/`: new tests citing SPEC-ADDON-102/103. These existing tests
  are updated where they pin version 3 (see §7): `test_z_pickup_accuracy_worker.py`,
  `test_z_pickup_worker.py`, `test_z_pickup_retrieval.py`, `test_z_pickup_feed.py`,
  `test_z_pickup_evaluate_after.py`.
- `addons/intelligence/app/pickup/freshness.py` (new).
- Tables written: `pickup_profile`, `pickup_item`, `pickup_feed_log` (no schema change).
- `docs/user-guide/video.md` (Recommended paragraph).
- `docs/addons/intelligence.md`: the feature-table row for Pickup, the Pickup section,
  and the evaluation bullet.
- `docs/process/reviews/feature-pickup-recency/decisions.md`: the replay result, the
  chosen constants and the stamp timing.
- Core: the `addons/intelligence` gitlink bump only. No core code, no Internal API.
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary,
  `active_file_filter` semantics for live files, LLM-free), `backend-conventions.md`
  (no language-dependent rules: none involved).

## Invariants

I1. For a fixed history, reference time and candidate set, the set of files that qualify for a lane is exactly the set that qualifies at version 3 (not opened, similarity in `[0.45, 0.999)`). Freshness changes only their order and which 120 a lane keeps.
I2. Within a lane, of two qualifying candidates with equal similarity whose `created_at` values parse and lie no more than one day after the reference time, the later one ranks no lower, and strictly higher whenever their freshness values differ.
I3. A candidate whose `created_at` cannot be parsed, or lies more than one day after the reference time, has freshness exactly `FLOOR`, so it never ranks above a candidate of equal similarity whose freshness is above `FLOOR`. A `created_at` up to one day after the reference time has freshness 1.
I4. With every candidate at age 0, the feed is identical, in file ids, order and stored score, to the feed version 3 builds from the same history and candidates, whenever no two candidates of a lane at its 120th place have equal similarity.
I5. A file kept by several lanes' cuts is credited to the one of those lanes where its similarity is highest (ties to the lane listed first), whatever its freshness, including when `FLOOR = 0` has decayed its ranking score to 0.
I6. Each of these changes the checkpoint of every viewer of the drive, so their feeds are rebuilt on the next computation: a new live video row; a new embedding of any Pickup channel for an already-live video; trashing, restoring, or a video going missing. A new image or document embedding does not. Two computations with no change to history, video embeddings, live videos, date or `PROFILE_VERSION` compute the same checkpoint.
I7. If the live-video read or the arrival-stamp read fails, no `pickup_item` or `pickup_profile` row of that drive changes in that computation.
I8. No freshness value, count or date from another drive enters a drive's ranking or checkpoint.
I9. In `replay`, a `fresh_h<H>_f<F>` row at cut point `t` ranks exactly as the worker would with those constants, at reference time `t`, over the same history and candidates. The row marked `*` uses the worker's constants.
I10. A stored checkpoint never vouches for data the feed was not built from: a video embedding written after the stamp read and before the candidate load causes a rebuild on the next computation.

## Revises

SPEC-ADDON-095 I5. With `last_played_at` unchanged, liking, unliking, favouriting, unfavouriting, adding played ranges to or dismissing a video the viewer has opened, deploying a new `PROFILE_VERSION`, or a change to the drive's arrival stamp (SPEC-ADDON-103) causes that viewer's feed for the drive to be rebuilt on the next sweep, and two sweeps over an unchanged history and arrival stamp on the same UTC date and `PROFILE_VERSION` compute the same checkpoint.
SPEC-ADDON-095 I6. With the signature and the drive's arrival stamp unchanged, a viewer with no kept row is not rebuilt again that day, and a viewer whose feed came out empty while kept rows exist is rebuilt on every sweep.
SPEC-ADDON-098 I9. In `replay` at cut point `t`, no configuration ranks a file the viewer opened before `t` or one created at or after `t`; the targets are exactly the live videos created before `t` with engagement above 0 and `last_played_at` in `[t, t + horizon)`; `recall@k = |T ∩ R_k| / |T|` is averaged per viewer over evaluated cut points only; `after` ranks exactly as the worker builds the feed with `FLOOR = 1` (videos only, engagement weighted, freshness 1 everywhere); and the `fresh_…` row marked `*` ranks exactly as the worker builds the feed for the same history, candidates and reference time.

## Checked, no action

- **Ship bar.** The constants ship only if the best grid row beats `after` on recall@40
  on the main drive. Replay flatters content-based rankings, because a video rewatched
  after `t` counts as an unseen target (SPEC-ADDON-098). That bias works *against*
  freshness, since those rewatched videos are old, so a win over `after` is
  conservative. The bar does not require beating `newest`: `newest` is not flattered in
  the same way, and the goal is a ranking that is not the newest list. `online` (version
  4 against version 3 log rows) is the check after shipping.
  - Until the replay is run, the code carries `HALF_LIFE_DAYS = 30`, `FLOOR = 0.5`.
    Tests do not depend on those values: they pass the constants in, or derive the
    expectation from the module's constants.
  - "Beats" means a strictly higher recall@40 at the three decimals the report prints.
    Among grid rows tied for the highest, the larger `HALF_LIFE_DAYS` wins, then the
    larger `FLOOR` (the gentler setting).
  - If no grid row beats `after`, the worker ships with `FLOOR = 1` (freshness 1 for
    every candidate, so I4 makes the ranking version 3's). SPEC-ADDON-103, the grid rows
    in `replay` and `PROFILE_VERSION = 4` still ship. The docs sentence that newer
    videos rank higher is left out, and the result is reported to the user.
- **A multiplicative score rather than an additive blend or a fixed quota of new
  arrivals.** Multiplying keeps the similarity floor meaningful and needs no rescaling of
  cosine values. With `FLOOR`, it also expresses "old but very relevant still shows". A
  quota of new arrivals mixed into the feed would show new videos the viewer has no
  interest in, which the user ruled out ("not the same as the newest list").
- **Freshness on lane qualification.** Not done. A threshold on the product would admit
  weakly matching new videos and exclude strongly matching old ones in ways the floor
  was not measured for.
- **Which date.** `files.created_at` is the file mtime at first scan. yt-dlp, which Media
  Import uses, has defaulted to not setting mtime from the server since 2023, so a
  download's mtime is its download time. A file copied in with an older mtime counts as
  old. The replay result for `newest` (0.127) was measured on this column, so it is the
  measured signal rather than an assumption. A separate "added at" column in the core
  would need a migration and a core change. Not done.
- **A video's publish date on its source site** (YouTube upload date). Not available in
  the core, and it measures the source's freshness, not the viewer's. Not used.
- **Per-viewer or per-drive constants, or a UI control.** Not done. Code constants under
  `PROFILE_VERSION`, revised from replay, as for the profile constants.
- **Rebuilding on arrivals without the drive-level stamp** (for example on a WS event).
  The worker is a periodic sweep, and the stamp makes the existing checkpoint carry it.
  Event-driven rebuilds would be a second trigger path.
- **Counts that coincide** (one video indexed and another trashed in the same hour). The
  live-video max `created_at` usually moves, and the daily date term catches the rest
  within a day.
- **Vectors replaced with the same row count** (an embedding-model rebuild, a reindex,
  a Refine re-embed with an unchanged chunk count). The stamp does not move, so feeds
  keep rankings built from the old vectors until the date rolls or the viewer plays
  something. That is the same as today, and the daily term is the backstop.
- **Diversity across ages inside the top** (forcing some older videos into the top 12).
  `FLOOR` and the stride over lanes already keep old interests present. Not added.
- **Documents.** Pickup is videos only (SPEC-ADDON-096). Unchanged.
