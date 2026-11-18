# Scene frames: a 10-second fill, one candidate list, and YouTube candidates from the video

SPEC-ID: SPEC-ADDON-144
SPEC-ID: SPEC-ADDON-145
SPEC-ID: SPEC-ADDON-146

Approval: sha256:b8f691c32fc88fc84869d121b1c2945d83df8d78b4267924e12bca7a92bedda1 Yuichi Senga 2026-11-19

## Summary

A video has two lists of frames today. The scene candidates (`clip` rows) are ffmpeg's
scene changes plus a fill on a 30-second grid; they feed scene search, the Scenes list
and the representative-frame selection. The change frames (`clip_change` rows) come from
the frame scan and feed only the selection. Measured on production (8,855 videos), 94%
of the gaps between consecutive change frames are exactly 10 s: they are a 10-second
sample of the video, not a list of changes. For a YouTube `.loft` the scene candidates
are storyboard tiles on a fixed grid (1, 2, 5 or 10 s), and the selection drops every
change frame within 3 s of a candidate, so on production 2,981 of 2,981 change frames of
the 73 `.loft`s with a 1, 2 or 5 s storyboard never reach the Scenes list.

This change makes the scene candidates the one list of frames:

- **SPEC-ADDON-144.** A native video's scene candidates are its scene changes plus a fill
  that leaves no gap longer than `min_interval`, whose default becomes 10 s. When the
  list exceeds `max_frames` it is thinned evenly over the whole video instead of being
  cut off after its first `max_frames` frames.
- **SPEC-ADDON-145.** The frame scan stops writing change frames. Change frames already
  stored are moved into the scene candidates of their file, keeping their ids, so every
  file's selection pool is the same before and after the move. The scan's 1 fps hashes
  stay.
- **SPEC-ADDON-146.** When a YouTube `.loft`'s video is downloaded (SPEC-ADDON-117), its
  scene candidates are built from the downloaded file exactly as for a native video and
  replace the storyboard tiles. The storyboard stays the candidates of a `.loft` not yet
  downloaded or whose download failed.

This revisits the human decision of 2026-11-15 (SPEC-ADDON-112, "change frames are kept
apart from scene search"). The human decided on 2026-11-18, after the measurements
below, that scene search and the selection read one list.

The measured state is the state the move produces: on production, the scene candidates
plus every change frame more than 3 s from them is about 1.33 times the scene candidates
(median 1.17 per video, 3.4 at the 90th percentile; long takes grow, cut-dense videos do
not). Scene search over 15 everyday queries on that state kept 248 of 276 result files;
the only query that changed noticeably had no strong match and swapped one set of
repeated OP/ED long takes for another (hako `K5lsjv1dT8hGzjHJ7yVVt`). A regenerated or new
video gets the 10 s fill, which has about the same density on long takes.

## Terms

- **Native video**: an `indexed_files` row whose `mime_type` is in `VIDEO_TYPES`.
- **YouTube `.loft`**: a `.loft` whose `loft_source` is `youtube` (SPEC-ADDON-117).
- **Scene candidates**: the file's `embedding_type = 'clip'` rows and their `vec_clip`
  vectors.
- **Pool candidates**: the scene candidates that have a vector and a finite
  `timestamp_start`, the set `_pool` measures change frames against today.
- **Change frames**: `embedding_type = 'clip_change'` rows and their `vec_clip_change`
  vectors.
- **`I`**: `indexing.frame_extraction.min_interval`; **`M`**: `max_frames`.
- **Candidates stage**: the new stage of a YouTube `.loft`'s fetch (SPEC-ADDON-146).
- **Candidates-only fetch**: a fetch whose only wanted stage is the candidates stage.
- **The gate**: a `.loft` whose `loft_candidates_done` is true and that has at least one
  scene candidate.

## Required items

### 1. Normal flow

**Scene candidates of a native video (SPEC-ADDON-144).** The CLIP leg runs as today
(`_index_clip_video` → `_extract_frame_paths`):

1. Scene frames: ffmpeg `select='gt(scene,scene_threshold)'`, as today, written to files
   by that one pass.
2. Fill times, when the duration is known and positive. The anchors are 0 s and every
   scene frame time, in time order; when a scene frame is below 1 s, the anchor 0 s is
   left out and that scene frame is the first anchor. For each pair of consecutive
   anchors `a < b` with `b − a > I`, and for the last anchor `a` and the duration `d`
   with `d − a > I`, there are `n = ceil(gap / I) − 1` fill times evenly inside the gap,
   at `a + k · gap / (n + 1)` for `k = 1..n`. Anchor 0 s, when kept, is itself a fill
   time. Without a known duration there are no fill times, as today.
3. Thinning, on times: when the scene times and fill times together number `count > M`,
   the kept times are, in time order, those at index `(i · count) // M` for
   `i = 0..M−1`, the rule the frame scan's `_spread` uses today. Otherwise all are kept.
4. Only the kept fill times are extracted (`extract_frame`); a kept fill time whose
   extraction fails is left out and not replaced. Scene frames that were not kept are
   discarded.
5. Embedding and storing, as today: a frame that fails to embed is left out
   (`_process_frame_batch`), `timestamp_end = timestamp_start + 30`.

The default of `I` becomes 10 (`app/config.py`, `search-config.yml.example`).
`search-config.yml` is the operator's file and is not rewritten: an install whose file
says `min_interval: 30` keeps 30 until the operator edits it. The docs say so.

**One candidate list (SPEC-ADDON-145).**

1. The frame scan (`index_frame_scan`) computes and stores its 1 fps hashes and sizes
   (`video_frame_scans`) and sets `frame_scan_indexed` in one transaction, as today. It
   no longer selects change seconds, embeds no frame, writes no change frame, writes no
   frame cache entry, and does not load the CLIP model. In the same transaction it
   deletes any change frames of the file and their vectors.
2. The selection code is not changed. It still adds change frames more than 3 s from
   every pool candidate to the pool; after the move no change frame exists, so the pool
   is the scene candidates. A file not yet moved keeps its pool as today, so the move
   changes no file's pool at any moment.
3. The move: in the start-up sequence (`app/main.py`), after
   `cleanup_orphaned_embeddings`, a background job takes each file that has change
   frames, one file per transaction under the search write lock. For every file (native
   video or `.loft`): each change frame that has a vector and whose time is more than
   3 s from every pool candidate of the file, the whole file and not only a span, becomes
   a scene candidate. Its row keeps its id, `timestamp_start` and `content_preview`, gets
   `timestamp_end = timestamp_start + 30`, `embedding_type = 'clip'` and
   `vector_table = 'vec_clip'`; its vector moves from `vec_clip_change` to `vec_clip`,
   inserted with the `clip` partition (`vec_partition.insert_vector_sql`). Every other
   change frame of the file (within 3 s, or with no vector) is deleted with its vector.
   No thinning by `M`.
4. The job logs one line when it starts and one when it ends, with the counts of files
   moved, frames moved and frames deleted. When it moved at least one file it clears the
   similar-files cache (`invalidate_similar_cache`) at its end. When no change frame is
   left it does nothing and logs nothing. Before moving anything it checks free space on
   the data volume against the vectors it would insert (rows × dimension × 4 bytes) times
   `vec_partition._FREE_SPACE_FACTOR`; when short it logs that and moves nothing in that
   start. A failure of the job itself (listing the files, a lock timeout outside a file's
   transaction) is logged with its class; start-up continues and the next start tries
   again. Each file's transaction holds the write lock for that file's frames only (at
   most a few hundred rows).
5. The `vec_clip_change` table stays, empty. Nothing writes it. Its dimension migration
   (`_migrate_vec_clip_change_if_needed`) recreates the table and no longer touches any
   file's flags.

**YouTube candidates from the video (SPEC-ADDON-146).**

1. `indexed_files` gains `loft_candidates_done` (BOOLEAN NOT NULL DEFAULT 0), added in
   `_migrate_loft_columns`, before `_migrate_vec_clip_if_needed` runs. When the column is
   added, the same migration sets it true for every `.loft` whose `loft_source` is
   `other` and for every `.loft` whose `loft_fetch_failures` is 3 or more. It is read
   only for `.loft` rows; for any other file its value is ignored by every query.
2. A `.loft` classified as source `other` from then on has it set true where its other
   flags are closed today (the fetch's classification and the sweep's inapplicable-flags
   block). An unclassified `.loft` keeps it false until classified.
3. A YouTube `.loft` fetch wants the candidates stage when `loft_candidates_done` is
   false. The sweep's incomplete-file query (`_collect_incomplete`) selects a `.loft`
   for the flag only when its `mime_type` is the `.loft` type, its source is YouTube or
   unclassified and `loft_fetch_failures < 3`; `IndexManager.prioritize` queues a fetch
   for a YouTube `.loft` that wants the candidates stage, as it does for one that wants
   the scan.
4. The CLIP model is needed by the candidates stage and by the fetch's storyboard step
   only. The fetch checks it before the download when the candidates stage is wanted;
   the storyboard step loads it when the candidates stage is not wanted.
5. After the download and before the scan and OCR stages, the candidates stage:
   1. Probes the downloaded file's duration; when the probe gives none it uses
      `IndexedFile.duration`; when that is NULL too there is no fill.
   2. Runs steps 1–4 of SPEC-ADDON-144 on the downloaded file and embeds every kept
      frame, holding the vectors in memory instead of storing per batch, skipping a
      frame that fails to extract or embed, and waiting between embedding batches while
      the queue is paused. It writes no BLIP caption. Embedding has a 600 s budget
      (the budget the scan's embedding had); when it runs out, or no frame is left, the
      stage has failed.
   3. Writes a `small` frame cache entry from the downloaded file at each kept frame's
      time, keeping an entry already there and skipping one it cannot write, and
      remembers which entries it wrote.
   4. Takes `storyboard_lock(file_id)` and, in one transaction, checks that the file is
      still active, replaces every scene candidate of the file with the new rows,
      deletes any change frames of the file and their vectors, and sets
      `loft_candidates_done` and `clip_indexed` true. When the transaction fails or the
      file is no longer active, it removes the cache entries it wrote in 5.3. A process
      killed between 5.3 and 5.4 leaves those entries; they are valid pictures of those
      times and stay.
   5. After the commit, still under the lock, removes `frames/{id}/tiles/` and clears
      the similar-files cache.
6. The storyboard leg of a CLIP task (`_index_clip_loft` → `_index_youtube_storyboard`)
   and the storyboard step of a fetch (SPEC-ADDON-121) check the gate right after taking
   `storyboard_lock`, before the leg's failed-file gate and retry consumption and before
   any YouTube lookup; when it holds they make no lookup and
   write no row and no tile, the thumbnail leg runs as today, and the leg ends with
   `clip_indexed` true. When the flag is true but the file has no scene candidate, they
   write the storyboard as before.
7. A CLIP regenerate of a `.loft` sets `loft_candidates_done` false, both when applied at
   once (`routers/files.py` reindex) and when recorded during a running fetch and applied
   at its end (`loft_media._apply_recorded_requests`), along with what it resets today
   (SPEC-ADDON-117). The storyboard leg then writes the storyboard again and the queued
   fetch rebuilds the candidates from the video.
8. The `vec_clip` dimension migration (`_migrate_vec_clip_if_needed`), which deletes every
   scene candidate, also sets `loft_candidates_done` false for every YouTube `.loft` with
   `loft_fetch_failures < 3`, so each is fetched again; a capped `.loft` keeps it true and
   its storyboard leg writes the storyboard, since the gate needs a scene candidate.
9. A YouTube `.loft` already fetched before this change has `loft_candidates_done` false,
   so it is wanted again and fetched as backfill (priority -10), as SPEC-ADDON-117
   fetches existing `.loft`s. Its scan and OCR flags are already true, so the fetch is
   candidates-only.
10. A candidates-only fetch takes part in the YouTube result accounting and backoff
    (`_note_result`, SPEC-ADDON-119) like any fetch, but never changes
    `loft_fetch_failures`. An outcome SPEC-ADDON-117 and SPEC-ADDON-119 would count
    (a lookup or download failure directly after a YouTube success, no rendition, a short
    duration, or the stage itself failing) sets `loft_candidates_done` true and leaves
    the scene candidates as they were. Every outcome they would not count (a failure in a
    refusal run, which returns the file to the backlog; a not-accessible `.loft`; the
    drive's `index` feature off; an unavailable model; the disk guard; a missing yt-dlp;
    an inactive file) leaves the flag false for a later fetch.
11. The fetch's result carries whether the candidates stage committed. When it did, the
    loft worker calls the Visual Index `on_index` hook as it does after a scan; under
    SPEC-ADDON-111 I9 it enqueues a run only for a `.loft` with no run, so an existing
    run is left as it is and shows as stale until regenerated.

### 2. Failure cases

- **Native fill extraction or embedding fails for a frame**: that frame is left out; the
  rest are stored.
- **The scene-detection pass times out** (300 s, as today): there are no scene frames and
  the fill covers the whole video. Unchanged by this spec.
- **The move fails for a file** (a database error): that file's transaction rolls back,
  its change frames and scene candidates stay, the job logs the file id and goes on with
  the next file; the next start tries it again. Its pool is unchanged either way.
- **A restart during the move**: files already moved stay moved; the rest are moved on
  the next start.
- **Candidates stage fails** (no frame left, the transaction fails): the file's scene
  candidates, its tiles and `loft_candidates_done` are as they were apart from the
  candidates-only rule, the cache entries it wrote are removed, and the fetch treats it
  as a stage that did not set its flag. In a fetch that also wants the scan or OCR it is
  counted (SPEC-ADDON-117 I6); in a candidates-only fetch, step 10 applies.
- **A restart between the commit (5.4) and the tile removal (5.5)**: the rows, the flag
  and the `small` entries are in place; the old tiles stay. `scene-tile` serves a tile
  only at a time where one exists, otherwise the `small` entry, so a scene shows either
  a storyboard picture of that same time or its own frame.
- **At the cap** (a fetch that also wants the scan or OCR): `loft_candidates_done`
  becomes true with the other wanted stages and the scene candidates stay as they are.
- **A `small` cache entry cannot be written**: it is skipped; that scene's tile draws the
  blank tile-sized block with its time label and seek (SPEC-ADDON-089 I7).
- **The tiles directory cannot be removed**: logged with the file id; the rows stay.
- **The CLIP model cannot be loaded**: a fetch that wants the candidates stage does not
  start (SPEC-ADDON-117 I3); not counted.

### 3. States

`.loft` scene candidates. A state is keyed by the source (`loft_source`), the flag
(`loft_candidates_done`) and the rows:

| State | Source | Candidates | Flag | Wanted by a fetch |
|---|---|---|---|---|
| Unclassified | NULL | none, storyboard, or the video's rows left by a regenerate | false | yes, to classify (SPEC-ADDON-117) |
| None yet | youtube | no rows | false | yes |
| Storyboard | youtube | storyboard tiles, plus moved change frames | false | yes |
| From the video | youtube | scene changes + fill of the downloaded file | true | no |
| Closed | youtube | storyboard tiles and moved change frames, or none | true | no |
| Source `other` | other | none | true | no |

Allowed transitions:

- unclassified → none yet, storyboard, or source `other`: classification (and the
  storyboard leg or step, which replaces leftover video rows with the storyboard).
- none yet → storyboard: the storyboard leg or a fetch's storyboard step.
- unclassified, none yet or storyboard → from the video: a successful candidates stage.
- none yet or storyboard → closed: the cap of a fetch that also wants the scan or OCR, a
  counted failure of a candidates-only fetch (step 10), or the column migration for a
  `.loft` already at the cap.
- closed with no rows → closed with storyboard rows: the storyboard leg or step.
- any state, source `other` included → unclassified with the flag false: a CLIP
  regenerate (it sets the source to NULL), at once or at the end of a running fetch.
- from the video, storyboard or closed under the cap → none yet with the flag false:
  the `vec_clip` dimension migration.

Not allowed:

- from the video → storyboard while the flag is true.
- closed or from the video → from the video, except after the flag went false.
- the flag going false by anything other than a CLIP regenerate or the `vec_clip`
  dimension migration.

Change frames: present (before the move) → absent. Nothing makes them present again.

### 4. Data read and written

| Store | Read / written |
|---|---|
| `embeddings` (`clip`) | written: native CLIP leg (new fill and thinning), the move (type change), candidates stage (replace) |
| `embeddings` (`clip_change`) | written: deleted by the move and by every scan; never inserted |
| `vec_clip` | written: native CLIP leg, the move (insert), candidates stage |
| `vec_clip_change` | written: rows deleted by the move and by every scan; table kept |
| `video_frame_scans` | written by the scan, as today; read by the selection |
| `indexed_files.loft_candidates_done` | new column; written by its migration, the candidates stage, a failed candidates-only fetch, the cap, classification as `other`, a CLIP regenerate (immediate or deferred), the `vec_clip` dimension migration |
| `indexed_files.clip_indexed` | written by the candidates stage |
| `indexed_files.loft_fetch_failures` | written by the fetch as today, except a candidates-only fetch, which never changes it |
| frame cache `frames/{id}/{ms}.webp` (`small`) | written by the candidates stage; its own entries removed on its failure |
| `frames/{id}/tiles/` | removed by the candidates stage |
| similar-files cache (in process) | cleared at the end of a move that moved a file, and after a candidates stage commit |
| `app/config.py`, `search-config.yml.example` | default `min_interval` 10 |
| the downloaded file in the fetch directory | read by the candidates stage, deleted at the fetch end as today |

### 5. External services

None new. The candidates stage reads the file the fetch already downloaded; it makes no
YouTube call. The storyboard leg makes no lookup while the gate holds. The fetch's lookup
and download are unchanged (SPEC-ADDON-117).

### 6. Authorization

None changes. Indexing and fetching are background work; the routes that read the
candidates keep their drive checks.

### 7. Effect on existing features

- **Scene search, scene segments, similar files, concept tagging, tag kNN** read
  `clip` rows: they see the moved change frames (SPEC-ADDON-145), more frames on long
  takes of regenerated or new videos (SPEC-ADDON-144), and for a `.loft`, the video's
  frames after its candidates stage.
- **The selection** (Scenes list, `/scenes`, `list_video_scenes`, the Visual Index, the
  Ask frames): unchanged by the move for every file, before, during and after it (same
  ids, times and order; a moved frame is more than 3 s from every pool candidate, so its
  sort key never ties with one, and its type changes only after it would have joined the
  pool anyway). Existing Visual Index runs keep their fingerprint. A later CLIP
  regenerate, or a `.loft`'s candidates stage, changes the pool; a `.loft`'s existing
  run then shows as stale.
- **The Scenes list ruler and `clip-timestamps`** draw one tick per `clip` row
  (SPEC-ADDON-089 I1): denser on long takes and on moved files.
- **Frame scan**: still queued and counted (`pending.frame_scan`, the Scene change scan
  bar); faster, as it embeds nothing. It no longer needs the CLIP model, so the fetch's
  model check follows the candidates stage instead of the scan.
- **Visual Index eligibility of a `.loft`** (SPEC-ADDON-117 I8, not eligible when
  capped): a candidates-only fetch never changes the failure count, so a backfill refetch
  never makes an existing run ineligible.
- **`scene-tile`** for a `.loft`: after the candidates stage serves the `small` entries.
- **SPEC-ADDON-121 I1** (a fetch writes the storyboard for a `.loft` with no candidates)
  holds as stated: the gate needs at least one scene candidate.
- **A CLIP model change** (the `vec_clip` dimension migration) refetches every YouTube
  `.loft` under the cap once, as it already rescans every native video.
- **`timestamp_end = timestamp_start + 30`**, `SEGMENT_TAIL_SECONDS` (30) and
  `MAX_GAP_SECONDS` (45) of scene segments, and `SEGMENT_GROUP_WINDOW` (30) of search
  stay; see Checked, no action.

### 8. Error behavior

A candidates-stage failure is logged as `loft_media candidates failed for <file id>
(<class>)`. A move failure is logged with the file id and the exception class; the move's
start and end lines carry counts. No log line carries a URL or a path. A scene whose
`small` entry could not be written shows the blank tile with its time label, as a failed
tile does today.

### 9. User-visible behavior

- On native videos with long takes, the Scenes list ruler and scene search have more
  frames: at once from the moved change frames, and after a regenerate a frame at least
  every 10 s; videos past `M` frames have frames to their end after a regenerate.
- On a YouTube `.loft`, after its fetch, scene times are the video's cuts and fill
  frames, not a storyboard grid; pictures come from the `small` cache. Its Visual Index
  run, if any, shows as stale.
- The indexing dashboard's YouTube fetch row shows the already-fetched `.loft`s queued
  again until they are refetched.
- An operator whose `search-config.yml` says `min_interval: 30` sees no change from
  SPEC-ADDON-144 on native videos until they edit it and regenerate.

### 10. Non-functional

- Rows: the move adds about 286,000 scene candidates on production and removes about
  650,000 change frames; regenerated or new videos get about the same density.
- Extraction: thinning on times keeps fill extractions at most `M` per video.
- The move runs in the background, one file per transaction; queries keep running and
  every pool is the same throughout.
- A `.loft` refetch downloads one 720p rendition again (about 300–500 MB per 30 minutes,
  deleted after) and adds one ffmpeg scene-detection pass over it; about 100 `.loft`s on
  production are refetched as backfill.
- A CLIP regenerate of a native video embeds more frames on long takes.

## Touch points

- `addons/intelligence/app/workers/clip.py`: `_extract_frame_paths`,
  `_fill_interval_gaps`, `_index_clip_loft`, `_index_youtube_storyboard`,
  `index_storyboard`
- `addons/intelligence/app/workers/frame_scan.py`: `_store`, `index_frame_scan`,
  `_change_seconds`, `_spread`, `_keep_small_pictures`, `_embed_changes`, `EMBED_SECONDS`
- `addons/intelligence/app/workers/loft_media.py`: `_stages_wanted`, `_fetch`,
  `_storyboard_step`, `_count_failure`, `_failed_result`, `_apply_recorded_requests`,
  the classification of source `other`, the fetch result
- `addons/intelligence/app/routers/files.py`: reindex (CLIP regenerate of a `.loft`)
- `addons/intelligence/app/main.py`: start-up sequence (the move after
  `cleanup_orphaned_embeddings`)
- `addons/intelligence/app/indexer.py`: `_collect_incomplete`, the inapplicable-flags
  block, the `.loft` enqueue condition, `IndexManager.prioritize`, the loft worker's
  Visual Index hook
- `addons/intelligence/app/database.py`: `_migrate_loft_columns`
  (`loft_candidates_done`), `_migrate_vec_clip_if_needed`,
  `_migrate_vec_clip_change_if_needed`
- `addons/intelligence/app/vec_partition.py`: partitioned insert into `vec_clip`
- `addons/intelligence/app/models.py`: `IndexedFile.loft_candidates_done`
- `addons/intelligence/app/search.py`: `invalidate_similar_cache` (called)
- `addons/intelligence/app/config.py`, `addons/intelligence/search-config.yml.example`:
  `min_interval` default 10
- Tables: `embeddings`, `vec_clip`, `vec_clip_change`, `indexed_files`,
  `video_frame_scans`; frame cache `frames/{id}/` and `frames/{id}/tiles/`
- Tests under `addons/intelligence/tests/` that pin change-frame writes, the scan's CLIP
  requirement, its small pictures, and the storyboard leg
- Docs, `docs/addons/intelligence.md`: frame extraction and `min_interval` with the
  operator step; the passage that change frames stay out of scene search, similar files
  and the Scenes tiles; the description of storyboard tiles as a YouTube reference's
  scene frames; the scan keeping a small picture of each change frame and its change
  frames joining the representative frames; what a `.loft` failing three times is left
  without; `max_frames` capping the scan's change frames; the `scene-tile` paragraph and
  "Reading a reference's whole video" (where a `.loft`'s `small` pictures come from);
  the one-time upgrade effects: the start-up move and its log lines, and the refetch of
  already-fetched YouTube references (one 720p download each, deleted after)
- Rules passed through: `.claude/rules/design-decisions.md` (drive-scoped queries,
  missing files keep their data), `.claude/rules/backend-conventions.md` (additive
  migrations, `import app.config as config`)

## Invariants

I1. For a native video with a known positive duration and no more than `M` times, the stored frame times include every scene frame time, the first is below 1 s, no two consecutive ones are more than `I` apart, and the last is no more than `I` before the duration, except where a frame's extraction or embedding failed.
I2. A native video's scene candidates number at most `M`; when the scene and fill times numbered `count > M`, the stored times are a subset of the times at index `(i · count) // M` of the time-ordered list, missing only failed frames, so the video is covered to its last `count / M` times; at most `M` fill extractions run.
I3. For a file whose change frames are intact when the move reaches it, the selection pool (ids, times and order) and the candidate fingerprint read before its commit equal those read after it; after a move in which no file failed, no `clip_change` row and no `vec_clip_change` vector exists; each moved vector is found by a KNN constrained to the `clip` partition; a file whose move failed keeps all its change frames and its scene candidates unchanged, and the other files are still moved.
I4. The similar-files cache is cleared at the end of a move that moved at least one file and after each candidates stage commit, and is not cleared by a move that moved nothing.
I5. A YouTube `.loft` whose candidates stage succeeded has scene candidates equal to what SPEC-ADDON-144 gives for its downloaded file and the duration of step 5.1, no change frame, `loft_candidates_done` and `clip_indexed` true, and no `frames/{id}/tiles/` directory unless the removal failed; its cache entries follow SPEC-ADDON-117 I11 as revised.
I6. A candidates stage that returns with a failure, or finds the file no longer active, leaves the `.loft`'s scene candidates, change frames and tile files as they were; in a fetch that also wants the scan or OCR a failure is counted, an inactive file never is.
I7. A CLIP regenerate, applied at once or at the end of a running fetch, sets `loft_candidates_done` false, after which the storyboard leg writes the storyboard as before and a fetch rebuilds the candidates from the video.
I8. A YouTube or unclassified `.loft` with `loft_candidates_done` false and fewer than 3 counted failures is wanted by a fetch, and `prioritize` on it queues a fetch at priority 100 even when its frame text is read but not indexed; one with its scan and OCR done downloads once and runs only the candidates stage; a native video or a `.loft` of source `other` is never selected by the sweep for this flag, and classification as `other` sets the flag true.
I9. A candidates-only fetch whose outcome SPEC-ADDON-117 and SPEC-ADDON-119 would count sets `loft_candidates_done` true and leaves the scene candidates as they were; one whose outcome they would not count, a refusal run included, leaves the flag false; the failure count follows SPEC-ADDON-117 I6 as revised.
I10. The third counted failure of a fetch that also wants the scan or OCR sets `loft_candidates_done` true and leaves the scene candidates as they were; the migration that adds the column sets it true for every `.loft` of source `other` or at the cap, and false for every other row.
I11. The `vec_clip` dimension migration leaves every YouTube `.loft` under the cap with `loft_candidates_done` false and every capped `.loft` with it true.
I12. After a candidates stage commits, the loft worker calls the Visual Index `on_index` hook for that `.loft`, which enqueues a run only when the `.loft` has no run.
I13. With no `min_interval` in `search-config.yml`, the fill uses 10 s; with a value there, it uses that value; a database written by this build still opens in a build without the column.

## Revises

SPEC-ADDON-111 I1. Scene search, tag kNN, scene segments, similar files, concept tagging and the Scenes grid tiles return the same results for a file before and after its frame scan.
SPEC-ADDON-111 I7. A frame scan writes its scan row and its flag in one transaction, removing the file's change frames and their vectors in it, or writes nothing; it writes nothing and leaves the flag false when the file is unreachable at the start or before the write, the drive's `index` feature is off or the write fails, and writes nothing when the file is no longer active; it keeps what it read after a stall or an early exit of a reachable file; it embeds no frame, writes no change frame and no frame cache entry, and runs and sets its flag when the CLIP model cannot be loaded.
SPEC-ADDON-111 I8. Only native videos and YouTube `.loft`s are ever scanned, and every active one with the flag false is queued (a YouTube or unclassified `.loft` as its SPEC-ADDON-117 fetch), new videos and regenerates ahead of the backfill; purging a file and the orphan cleanup remove its scan row, its change frames and their vectors; a `vec_clip_change` dimension mismatch recreates the table and changes no file's flag; a CLIP regenerate of either queues one scan (a fetch for a `.loft`) and sets its flag false, unless one is running, when it is recorded and applied as SPEC-ADDON-117 step 8 says.
SPEC-ADDON-117 I6. The failure count changes only by a counted failure (+1), a fetch whose stages all set their flags (to 0), or a reindex or CLIP regenerate (to 0), and never by a candidates-only fetch (SPEC-ADDON-146); at 3 the wanted stages are closed with no scan row and no text; a not-accessible `.loft`, an unavailable model or engine, the disk guard, a missing yt-dlp, and a lookup or download failure not directly preceded by a YouTube success are never counted; a download whose probed duration is below 95% of a known lookup duration is counted.
SPEC-ADDON-117 I3. No download starts while another fetch runs, while the queue is paused, at priority -10 while a native `frame_scan` or `frame_ocr` task that is not a re-read of an outdated read (SPEC-ADDON-133) is queued or processing, while the drive's `index` feature is off, when no stage is wanted, when the model or engine a wanted stage needs is unavailable (the CLIP model for the candidates stage, not the scan), or when the disk guard fails; a fetch that ends before its stages ran changes nothing but the duration (from NULL after a lookup), the loft source, the failure count, the flags closed for source `other`, the wanted stages closed at the cap, `loft_candidates_done` set by a counted failure of a candidates-only fetch (SPEC-ADDON-146), and the candidates, tile files and `clip_indexed` its storyboard step wrote (SPEC-ADDON-121).
SPEC-ADDON-117 I11. The scan of a `.loft` writes no frame cache entry; the candidates stage (SPEC-ADDON-146) writes a `small` frame cache entry at each new scene candidate's time before its row commit, keeping an entry already there and skipping one it cannot write, and removes the entries it wrote when the commit does not happen; a native video's scan and CLIP leg write none.
SPEC-ADDON-078 I7. The storyboard leg checks, right after taking `storyboard_lock` and before any lookup, whether the `.loft`'s `loft_candidates_done` is true and it has a scene candidate; if so it makes no lookup and writes no row and no tile. Otherwise it replaces a YouTube `.loft`'s `clip` rows in one transaction after every kept tile has been embedded, times tile `k` (numbered across sheets) as `k` times the interval recovered from `count = round(fps * duration)` (the smallest whole second `i` with `ceil(duration / i) + 1 == count`, else `duration / (count - 1)`), never `k / fps` nor a sheet's duration, keeps the first tile and then a tile only when `k < count`, its timestamp is below the known duration, and it is at least `duration / max_frames` after the last kept tile, does not thin tiles by `min_interval`, writes no `clip_thumbnail` row and no row for another file, and runs whatever the thumbnail leg did.
SPEC-ADDON-078 I8. After the `clip` task of a `.loft`, `clip_indexed` is true exactly when the thumbnail leg is done and the storyboard leg found the gate of SPEC-ADDON-146 holding, wrote rows, found no `sb0` or no known duration, or found the `.loft` not YouTube; on a transient failure it is false, the existing `clip` rows are as they were, and the same file is not attempted again in that process; a repeat run never leaves two sets of rows or a second `clip_thumbnail` row.
SPEC-ADDON-121 I4. The storyboard leg run by indexing and by a CLIP regenerate behaves as SPEC-ADDON-078 I7 and I8 state, as revised by SPEC-ADDON-146; the storyboard step of a fetch checks the same gate the same way.

## Checked, no action

- **Moving the change frames instead of regenerating every video.** The move needs no
  decoding and no embedding, and keeps every pool and Visual Index fingerprint as it is.
  The moved frames follow the scan's rule (10 s after the last change), not the new fill
  rule; a CLIP regenerate replaces them with the fill. Regenerating 8,711 videos would
  decode about 1,900 hours of video again.
- **Removing the change-frame branch of the selection.** Kept so a file not yet moved
  keeps its pool during the move; with no change frame left it reads nothing. Removing it
  is a later cleanup.
- **Thinning moved frames by `M`.** Not done: thinning would change the pool and make
  Visual Index runs stale on the about 324 videos over `M`.
- **Dropping `vec_clip_change`.** A migration only adds (backend conventions); the table
  stays empty so an older build still opens the database. An older build then sees no
  change frames, and its pool is the scene candidates.
- **A read that straddles a file's move commit.** `load_selection_inputs` reads rows and
  vectors in separate connections, so one read across the commit can miss that file's
  moved frames for that read only. The window is one file's transaction; a Visual Index
  run built in it shows as stale and a regenerate fixes it.
- **A scan that runs before the move reaches its file.** The scan deletes the file's
  change frames, so their frames never move; this happens on a regenerate or a scan
  still pending at upgrade, and the regenerate rebuilds the candidates anyway.
- **Reclaiming the space of deleted `vec_clip_change` rows.** sqlite-vec keeps it until a
  VACUUM, which is not run here; `vec_clip` grows by about 0.9 GB on production.
- **The race between the move and a native CLIP regenerate of the same file.** A
  regenerate deletes the scene candidates before its batches; a move of that file in
  between keeps change frames as candidates next to the new ones. The move runs once,
  in the background after start-up; the next regenerate of that file clears it.
- **Keeping the 30 s `timestamp_end`, `SEGMENT_TAIL_SECONDS`, `MAX_GAP_SECONDS` and
  `SEGMENT_GROUP_WINDOW`.** They bound a segment and group hits within 45 s; denser
  frames still group into the same segments. The production comparison ran with them
  unchanged.
- **The 300 s scene-detection timeout.** A long video whose scene pass times out gets
  fill only. This is today's behaviour for native videos and is not changed here.
- **Refetching `.loft`s already at the cap.** They keep their storyboard and moved change
  frames; a CLIP regenerate resets the count and refetches one.
- **Retrying a failed candidates-only fetch.** One attempt, then the `.loft` keeps what
  it has; counting it would cap the `.loft` and remove its Visual Index eligibility
  (SPEC-ADDON-117 I8) for a refetch the user did not ask for. A CLIP regenerate tries
  again.
- **Rebuilding a `.loft`'s existing Visual Index run automatically.** SPEC-ADDON-111 I9
  keeps automatic runs to videos with no run; replacing about 100 runs would spend LLM
  calls without a request.
- **Producing a missing `small` entry on demand.** `scene-tile` never contacts the
  network or runs ffmpeg (SPEC-ADDON-117 I9); a missing picture shows the blank tile.
- **The native CLIP leg clearing the similar-files cache.** It does not today; not
  changed here.
- **Rewriting the operator's `search-config.yml`.** It is the operator's file; the docs
  name the edit.
- **Scene search on weak queries.** With no strong match, repeated OP/ED long takes of a
  series fill the top results, before and after (measured with 夜景). Telling a series'
  repeated sequence from content needs more than one video and is out of scope.
- **Small moving objects in a static shot** (a car crossing a security camera's view).
  Neither scene detection nor the scan's hash sees them; out of scope.
- **A design artifact.** No screen changes shape; the ruler draws more ticks of the same
  kind.
- **Re-reading frame OCR.** OCR keeps its own decode and timing (SPEC-ADDON-133); this
  change does not touch it.
