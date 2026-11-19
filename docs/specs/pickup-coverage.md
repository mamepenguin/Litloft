# Pickup: a glance is not a watch

SPEC-ID: SPEC-ADDON-149
SPEC-ID: SPEC-ADDON-150
SPEC-ID: SPEC-CORE-142

Approval:

## Summary

Pickup (the intelligence addon's per-viewer feed) never recommends a video the viewer has opened,
and weighs each opened video as a seed by how far its position got. So a video opened for a few
seconds is gone from recommendations for good, and a video skimmed and then sought to the end
counts as fully watched. This change decides both from what was actually played, recorded in
`played_segments` (SPEC-CORE-026): a video counts as **watched** when its played coverage reaches
half its length. A watched video is excluded, also at the moment the feed is served, and is a
full-weight seed; a video only glanced at stays a candidate and is no seed. History last played
before 2026-11-05 keeps today's rule. The video app's Recommended shelf stops filtering Pickup's
items by the core's `unwatched` state, so glanced videos can reach it. The shelves' watch states
(position 90 %), Continue and Recently viewed are unchanged.

- **SPEC-ADDON-149**: which of the viewer's videos are excluded, when the feed is rebuilt, and
  the filter applied when the feed is served.
- **SPEC-ADDON-150**: each history row's engagement (its weight as a seed), and the evaluation
  commands.
- **SPEC-CORE-142**: the video app's Recommended shelf and its See all page restrict Pickup's
  items to the target only.

## Required items

### 1. Normal flow

Definitions, per viewer `v`, drive, and video file `f` (`file_type = 'video'`, `.loft` embeds
included) with a `watch_history` row `W` (`last_played_at` `L`, `playback_position` `p`,
reported `duration` `D`):

- **Recording start** `R` = 2026-11-05 00:00:00 UTC, a margin after `played_segments` and its
  recording fix were merged (2026-11-01). It is compared with `L` parsed as naive UTC by
  `_parse_naive_utc`, as today.
- `W` is **legacy** when `L < R`, or when `L` cannot be parsed.
- `D` is **known** when it is a finite number above 0.
- **Coverage** `C` = `Σ min(s, D − s·n)` over `v`'s `played_segments` rows for `f` with
  `played_seconds > 0` and `s·n < D`, where `s` = 5, the core's `PLAYED_SEGMENT_SECONDS`; 0 when
  `D` is not known. A segment counts once however many seconds it holds.
- **Short** video: `D` known and `D < 20`. Played stretches under 10 s are never recorded, so a
  short video's coverage says nothing; its position is used instead.
- `f` is **watched** by `v` when any of these holds:
  1. `f` is liked or favourite (these flags are per file, shared by every viewer, as today);
  2. `W` is legacy;
  3. `f` is short and `2·p ≥ D`;
  4. `f` is not short, `D` is known and `2·C ≥ D`.

  Every other video with a row is **glanced**: a row whose `D` is not known (the detail page was
  opened and nothing played, or `D` is 0, NaN, infinite or negative), and one with too little
  played.

**SPEC-ADDON-149, exclusion, rebuild and serving.**

1. The worker builds each viewer's exclusion set from the same read that builds its staleness
   signature (`watch_signature`, used by `_stale_work`): every file of a kind other than video
   that the viewer has a row for, and every watched video. A glanced video is a candidate like a
   video never opened. Trashed and missing files stay in the computation, as today.
2. The signature carries, per row: `L`; the lifecycle, liked, favourite and dismissal flags (as
   today); the file type and mime type; the sum of played seconds (one decimal, as today, for
   legacy engagement); and `D`, `p` and `C`, each written to one decimal. A change in whether a
   video is watched, or in its engagement, therefore changes the checkpoint, and the viewer is
   rebuilt on the next sweep. Two sweeps over unchanged data on the same UTC date compute the same
   checkpoint.
3. `watched_file_ids` returns the same set as rule 1.
4. `GET /api/addons/intelligence/pickup` (the feed read) first removes from the viewer's stored
   feed, in rank order, every file in the viewer's current exclusion set (rule 1, read at request
   time), and then answers from that filtered list exactly as it answers from the stored list
   today: `offset` and `limit` slice the filtered list, `total` is its length, and `window=daily`
   shuffles the first `min(40, total)` of it and takes `limit`. Pages stay full and `total` stays
   the count a reader reaches, so no client changes. A video watched since the last sweep never
   comes back from the feed.
5. `PROFILE_VERSION` goes from 4 to 5, so every viewer's feed is rebuilt on the first sweep after
   deployment.

**SPEC-ADDON-150, engagement.** For a video row:

1. liked or favourite → 1;
2. otherwise dismissed (`dismissed_at` at or after `L`, as today) → 0;
3. otherwise legacy → today's value: `f = max(p, min(Σ played_seconds, D)) / D`, 0 below 0.10,
   `min(1, f / 0.5)` from there (`F_MIN`, `F_FULL`); 0.5 for a `.loft` without a known `D`;
   0 otherwise;
4. otherwise watched (rules 3 and 4) → 1;
5. otherwise 0.

A row with engagement 0 is not kept in the profile (unchanged), so a glanced video is no seed. A
dismissed video that is watched stays excluded with engagement 0, as today.

**Evaluation (`python -m app.pickup.evaluate`).** In `replay` at cut point `t`:

- `after`, the freshness grid rows and the marked `fresh_…` row use this change's exclusion and
  engagement. The exclusion is judged from the rows with `L < t` and the rows whose `L` does not
  parse, each with the segments as stored now (segments carry no time).
- `before`, `depth`, `video`, `random`, `newest` and the "candidate videos" count keep
  `PROFILE_VERSION` 4's exclusion (every file opened before `t`, and every row whose `L` does not
  parse); `depth` keeps version 4's engagement.
- The targets of `replay` and of `online` are the rows with this change's engagement above 0.

**SPEC-CORE-142, the video app's Recommended.** The Recommended shelf on Discover and its See all
page restrict the `video-discover-recommended` provider's items to the target (as today) and no
longer to the core's `watch=unwatched` state. Pickup's own exclusion, applied at serving time,
decides which videos the viewer has watched. Without a profile Recommended is not drawn, as
today. Other provider shelves are unchanged. `restrict.ts` keeps its `watch` option for other
callers.

### 2. Failure cases

| Step | What goes wrong | What the system does and the viewer sees |
|---|---|---|
| Sweep | Reading history or segments fails | No feed or profile row is written for that viewer; the previous feed stays served (filtered at serving time by rule 4 when that read works), and the viewer is retried on the next sweep. |
| Serving | Reading the exclusion set fails | The request fails as any other read failure of that endpoint does today. The clients treat it as today: the home Pickup row and Discover's Recommended are absent, the Pickup page shows its empty text, and the See all page shows its failed state with Retry. |
| A row | `D` is NaN, infinite or negative | `D` is not known: glanced, unless liked, favourite or legacy. |
| A row | `p` is NULL, NaN, infinite or negative | `p` is taken as 0 (as `_finite(position) or 0.0` does today), in rule 3 and in the signature. |
| Segments | Rows with `s·n ≥ D` (the duration shrank after recording) | Ignored by the coverage sum. |
| Recommended | The restrict request fails | The shelf behaves as SPEC-CORE-067 / SPEC-CORE-081 define a failed restrict; nothing in this change alters it. |
| Recommended | The viewer's profile cookie is gone | Pickup returns an empty feed and Recommended is not drawn. Without `watch` the restrict never answers `viewer_required`; accepted. |

### 3. States

Computed at every sweep and every feed read, never stored: per viewer and video, watched or
glanced, and an engagement in `[0, 1]`.

| From | To | Cause |
|---|---|---|
| no row | glanced | the first open after `R` (a row with `D` = 0), unless liked or favourite |
| no row | watched | the first open of a liked or favourite video |
| glanced | watched | coverage reaches half of `D` (or position does, for a short video); the video is liked or favourited by anyone |
| watched | glanced | unliking or unfavouriting a video watched only through that; `D` re-reported larger so that the rule no longer holds; a legacy row played again so that `L ≥ R` without enough coverage; a short video replayed and saved at a position below half |
| glanced | watched | `D` re-reported smaller so that the rule holds |
| row | no row | `DELETE /api/files/{id}/progress` removes history and segments; the video is a candidate like a never-opened one |

Not allowed: a position change alone never changes whether a video that is not short is watched; dismissing never changes it; trashing, restoring, a file
going missing or recovering never changes it; another viewer's history or segments never change
it.

### 4. Data read and written

- Read: the core's `watch_history`, `played_segments`, `files` (the read-only mount), by the
  sweep and by the feed read.
- Written: the addon's pickup feed and profile rows, as today; their content changes.
- No schema change in either database. No core backend change.

### 5. External services

None.

### 6. Authorization

Unchanged. Each viewer's feed is built and filtered from that viewer's rows only, within one
drive (`.claude/rules/design-decisions.md`, the drive boundary). The Recommended restrict keeps
the core's target and access checks.

### 7. Effect on existing features

- **The drive home's Pickup row, the Pickup page, and the video app's Recommended and its See
  all page**: videos glanced at since `R` come back as candidates, and skimmed-then-sought videos
  stop pulling similar videos up. A glanced video can appear in Continue and in a Pickup shelf at
  the same time; accepted.
- **Evaluation**: `after` and the grid rows move; the version 4 rows do not.
- Core shelves, the `watch` filter, Continue, Recently viewed and the finished state are not
  touched.
- Text that changes to say a video counts once half of it has been played: the addon's
  `pickup.description` becomes ja 「視聴履歴から見つけた、まだ観ていない動画です。」 (was 「まだ開いていない」)
  and en "Videos you have not watched yet, drawn from what you have been watching." (was "not
  opened"); `docs/addons/intelligence.md` (the features table, the Pickup paragraph,
  "are still unwatched", the engagement paragraph and "A file you have opened, ever, is never in
  the feed"); `docs/user-guide/video.md` (Recommended as "videos you have not watched").

### 8. Error behavior

No new message. Errors log as the sweep and the endpoint log them today.

### 9. User-visible behavior

Only what Pickup and Recommended show changes, from the first sweep after deployment: videos
glanced at since `R` can appear; seeds are videos watched at least halfway, liked or favourited
ones, and older history; a video watched since the last sweep disappears from the feed at once.

### 10. Non-functional

- The coverage read (one query per viewer over the viewer's `played_segments` rows in the drive,
  through the `(viewer_id, file_id, segment_index)` key, at most `ceil(D / 5)` rows per video)
  runs in the hourly staleness check and in each feed read. Accepted for a personal tool.
- Per viewer only. Nothing is aggregated across viewers.

## Touch points

- `addons/intelligence/app/pickup/profile.py`: `watch_signature` and its SQL, `watched_file_ids`,
  `engagement`, `_PROFILE_HISTORY_SQL` / `profile_history`, the recording-start, segment-width
  and short-video constants, `PROFILE_VERSION`.
- `addons/intelligence/app/workers/pickup.py`: `_stale_work` (the exclusion set) and
  `_checkpoint`.
- `addons/intelligence/app/routers/pickup.py`: the serving filter.
- `addons/intelligence/app/pickup/evaluate.py`: `_HISTORY_SQL`, `_opened_before`,
  `_rank_configs`, the targets.
- `addons/intelligence/frontend/messages/ja.json`, `en.json`: `pickup.description`.
- `addons/intelligence/tests/` for pickup, including the tests that pin version 4's exclusion and
  engagement, which change only as the Revises lines below allow.
- `frontend/src/components/videoapp/useDiscover.ts` (the provider call and the rebuild from
  stored ids), `frontend/src/components/videoapp/useProviderShelfPage.ts`: the Recommended
  restrict; and the core tests that assert `watch=unwatched` for Recommended
  (`frontend/src/components/videoapp/__tests__/VideoShelfPage.recommended.test.tsx`,
  `VideoApp.discoverProviders.test.tsx`, `VideoApp.discoverCache.test.tsx`), under the
  SPEC-CORE-067 I3 and SPEC-CORE-081 I3 revisions.
- The `addons/intelligence` submodule pointer in the core, bumped after the addon PR merges. The
  core frontend change ships in the same core PR as that bump, never before it, so Recommended
  never runs without `watch=unwatched` against an addon without the serving filter.
- `docs/addons/intelligence.md`, `docs/user-guide/video.md` (lines 24 and 44),
  `docs/ADDON-DEVELOPMENT.md` (the `video-discover-recommended` slot row and the See all
  paragraph, which say the restrict adds `watch=unwatched`, plus an entry under *Extension-point
  changes*).
- Rules passed through: `.claude/rules/design-decisions.md` (watch history and profiles, the
  drive boundary, addons read the core DB read-only), `.claude/rules/backend-conventions.md`,
  `.claude/rules/frontend-conventions.md`.
- No protected path is edited.

## Invariants

I1. For a non-legacy video row: liked or favourite gives engagement 1; otherwise dismissed gives 0; otherwise a watched row gives 1 and any other row 0, whatever `p` is (for a video that is not short) and however many times its segments were replayed.
I2. Coverage counts each of the viewer's own segments with `played_seconds > 0` once, as `min(5, D − 5n)`, ignores segments with `5n ≥ D`, and is 0 when `D` is not known; a non-short video is watched exactly when `2·C ≥ D`, and a short video (`D < 20`) exactly when `2·p ≥ D`.
I3. A row with `L < R` or an unparseable `L` is excluded and weighted exactly as at `PROFILE_VERSION` 4; a row with `L ≥ R` follows this change.
I4. The feed read's ids are exactly the stored feed in rank order minus the viewer's exclusion set read at request time, sliced by `offset` and `limit` (or, for `window=daily`, the first `min(40, total)` of that list shuffled by the existing seed, cut to `limit`), and its `total` is the length of that filtered list.
I5. `_stale_work`, `watched_file_ids` and the feed read compute the same exclusion set for the same data, and `PROFILE_VERSION` is 5.
I6. The video app's Recommended shelf and its See all page, and Discover's rebuild of Recommended from stored ids, send their restrict with the target and without `watch`, and Recommended is not drawn without a profile; other provider shelves send what they sent before.

## Revises

SPEC-ADDON-095 I1. For any history and reference time, `build_lanes` weights each kept video by exactly its engagement in every mean of member vectors (the k-means update, the singleton merge choice, the directionless check and the lane centroid, each normalized) and in the lane raw weight `log1p(sum(e * decay(age)))`, where `e` is SPEC-ADDON-150's engagement.
SPEC-ADDON-095 I2. At a fixed reference time, adding a history row for a non-video file, or for a watched video (SPEC-ADDON-149) with engagement 0, gives exactly the feed built from the unchanged kept history with that file added to the exclusion set, and adding one for a glanced video gives exactly the feed built from the unchanged kept history and exclusion set (removing such rows undoes it), including when the viewer has more than 2000 kept rows and when rows lie on both sides of the 365-day window.
SPEC-ADDON-095 I4. A feed is built only from its own drive's history and files, and never contains a non-video file the viewer has a row for or a video the viewer has watched under SPEC-ADDON-149, trashed or missing included.
SPEC-ADDON-095 I5. With `last_played_at` unchanged, liking, unliking, favouriting, unfavouriting, dismissing, a change in a video's coverage, position or reported duration, a change in the sum of its played seconds, or deploying a new `PROFILE_VERSION`, causes that viewer's feed for the drive to be rebuilt on the next sweep, as does a change to the drive's arrival stamp (SPEC-ADDON-103); two sweeps over an unchanged history and arrival stamp on the same UTC date and `PROFILE_VERSION` compute the same checkpoint.
SPEC-ADDON-098 I9. In `replay` at cut point `t`, no configuration ranks a file it excludes (`after`, the grid rows and `fresh_…`: the files watched under SPEC-ADDON-149, judged from rows with `last_played_at < t` and rows whose `last_played_at` does not parse; `before`, `depth`, `video`, `random`, `newest`: every file opened before `t` and every unparseable row) or one created at or after `t`; the targets are exactly the live videos created before `t` with SPEC-ADDON-150 engagement above 0 and `last_played_at` in `[t, t + horizon)`; `recall@k = |T ∩ R_k| / |T|` is averaged per viewer over evaluated cut points only; `after` ranks exactly as the worker builds the feed with `FLOOR = 1` (videos only, engagement weighted, freshness 1 everywhere); and the `fresh_…` row marked `*` ranks exactly as the worker builds the feed for the same history, candidates and reference time.
SPEC-ADDON-102 I1. For a fixed history, reference time and candidate set, the set of files that qualify for a lane is exactly the set of candidates not excluded under SPEC-ADDON-149 with similarity in `[0.45, 0.999)`. Freshness changes only their order and which 120 a lane keeps.
SPEC-CORE-057 I8. Discover's shelves are: Continue = the viewer's videos that meet the desk predicate of SPEC-CORE-069 (`by=watch&key=continue`), most recently played first; Recommended = only with a profile, the `video-discover-recommended` provider's items restricted to the target, in its order, never a random sample, not drawn when no provider yields an item; each `video-discover-shelves` addon shelf; New = videos by `created_at` descending; each at most 12; a shelf with no videos is not drawn; Continue is not drawn without a profile.
SPEC-CORE-067 I3. Discover draws a provider-shelf item only if its id was returned by the `restrict` given to that same shelf's provider call, and never by another shelf's. So a provider can never make Discover show a file outside the app's target, outside `type=video`, or of another drive. For Recommended, which videos the viewer has watched is decided by the provider (SPEC-ADDON-149), not by the restrict.
SPEC-CORE-081 I3. In Recommended mode the shelf page draws an item only if its id was accepted by a `restrict` of that page's own load with the app's current drive and target. It never shows a file outside the target or of another drive; which videos the viewer has watched is decided by the provider (SPEC-ADDON-149).

## Checked, no action

- **Dismissed glances.** 「Continue から外す」 acts on Continue only; a glanced video that was
  dismissed is still a candidate. Saying "not interested" in a pick is a separate change (a
  "not interested" control on pickup cards).
- **Glances under 10 s.** They record no segments, so `C = 0` and the video is glanced, which is
  what this change wants.
- **Rounded-up segments.** A segment with any played seconds counts whole, so spaced stretches
  can reach half with about a third actually played. Accepted: "half" is a rough line by the
  user's choice, and a third-watched video is not a glance.
- **Embeds that cannot report playback** (Vimeo). Judged like any video, so one is glanced however
  long it is watched. Accepted by the user: few, and they stay candidates rather than vanish.
- **Segment width.** The addon mirrors the core's 5 s; the core has no plan to change it, and the
  addon's tests pin the arithmetic.
- **Legacy rows played again after `R`.** Judged by the new segments only; a video fully watched
  before `R` and briefly reopened becomes glanced and stops being a seed. Rare; it returns a seen
  video to the candidates.
- **Discover's stored order.** Discover rebuilds Recommended from the ids it stored at the last
  visit (SPEC-CORE-077), and an answer arriving after that rebuild settled is not drawn during
  the visit. A video watched since the last visit can therefore stay on Recommended for that
  one visit; the next visit's stored ids come from a filtered answer.
- **SPEC-CORE-081 I4** (the `viewer_required` path) is unchanged; Recommended simply no longer
  receives it (Failure cases).
- **Core shelves' finished state.** Unchanged by request.
- **Audio.** Pickup recommends videos only; audio rows are non-video and stay excluded as today.
