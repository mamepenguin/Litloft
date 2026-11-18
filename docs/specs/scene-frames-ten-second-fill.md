# Scene frames: a 10-second fill, one candidate list, and YouTube candidates from the video

SPEC-ID: SPEC-ADDON-144
SPEC-ID: SPEC-ADDON-145
SPEC-ID: SPEC-ADDON-146

Approval:

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
- **SPEC-ADDON-145.** The frame scan stops writing change frames, and the selection reads
  the scene candidates only. Change frames already stored are moved into the scene
  candidates of their native video, keeping their ids, so each video's selection pool is
  unchanged by the move; a `.loft`'s are deleted. The scan's 1 fps hashes stay.
- **SPEC-ADDON-146.** When a YouTube `.loft`'s video is downloaded (SPEC-ADDON-117), its
  scene candidates are built from the downloaded file exactly as for a native video and
  replace the storyboard tiles. The storyboard stays the candidates of a `.loft` not yet
  downloaded or whose download failed.

On production, the 10-second fill grows the scene candidates by about 1.33 times (median
1.17 per video, 3.4 at the 90th percentile; long takes grow, cut-dense videos do not).
Scene search over 15 everyday queries kept 248 of 276 result files; the only query that
changed noticeably had no strong match and swapped one set of repeated OP/ED long takes
for another (hako `K5lsjv1dT8hGzjHJ7yVVt`).

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
5. Embedding and storing, as today (`timestamp_end = timestamp_start + 30`).

The default of `I` becomes 10 (`app/config.py`, `search-config.yml.example`).
`search-config.yml` is the operator's file and is not rewritten: an install whose file
says `min_interval: 30` keeps 30 until the operator edits it. The docs say so.

**One candidate list (SPEC-ADDON-145).**

1. The frame scan (`index_frame_scan`) computes and stores its 1 fps hashes and sizes
   (`video_frame_scans`) and sets `frame_scan_indexed` in one transaction, as today. It
   no longer selects change seconds, embeds no frame, writes no change frame, writes no
   frame cache entry, and does not load the CLIP model. In the same transaction it
   deletes any change frames of the file and their vectors.
2. The selection (`load_selection_inputs`, `_pool`, `selection_pool`, `select_scenes`)
   reads the scene candidates only. The pool is the scene candidates with a vector and
   a time in the span. The scan is still read for the steady-second check.
3. The move: on every start, after the orphan cleanup, a background job takes each file
   that has change frames, one file per transaction under the search write lock:
   - Native video: each change frame that has a vector and whose time is more than 3 s
     from every pool candidate of the file becomes a scene candidate. Its row keeps its
     id, `timestamp_start` and `content_preview`, gets `timestamp_end =
     timestamp_start + 30`, `embedding_type = 'clip'` and `vector_table = 'vec_clip'`.
     Its vector moves from `vec_clip_change` to `vec_clip` with the `clip` partition.
     Every other change frame of the file (within 3 s, or with no vector) is deleted
     with its vector. No thinning by `M`.
   - Any other file (a `.loft`): its change frames are deleted with their vectors.
   - When the job has moved at least one file it clears the similar-files cache
     (`invalidate_similar_cache`) at its end. It does nothing when no change frame is
     left.
4. The `vec_clip_change` table stays, empty. Nothing writes it. Its dimension migration
   (`_migrate_vec_clip_change_if_needed`) recreates the table and no longer touches any
   file's flags.

**YouTube candidates from the video (SPEC-ADDON-146).**

1. `indexed_files` gains `loft_candidates_done` (BOOLEAN NOT NULL DEFAULT 0), an additive
   migration. It is read only for `.loft` rows; for any other file its value is ignored
   by every query.
2. A `.loft` classified as source `other` has it set true where its other flags are
   closed today (the inapplicable-flags block of the sweep and the fetch's classification).
   An unclassified `.loft` keeps it false until classified.
3. A YouTube `.loft` fetch wants the candidates stage when `loft_candidates_done` is
   false. The sweep's incomplete-file query (`_collect_incomplete`) and its `.loft`
   enqueue condition include the flag, still under `loft_fetch_failures < 3`.
4. The CLIP model is needed by the candidates stage and by the fetch's storyboard step
   only. The fetch checks it before the download when the candidates stage is wanted;
   the storyboard step loads it when the candidates stage is not wanted, as it does today
   when the scan is not wanted.
5. After the download and before the scan and OCR stages, the candidates stage:
   1. Probes the downloaded file's duration; when the probe gives none it uses
      `IndexedFile.duration`; when that is NULL too there is no fill.
   2. Runs steps 1–4 of SPEC-ADDON-144 on the downloaded file and embeds every kept
      frame, waiting between embedding batches while the queue is paused.
   3. Takes `storyboard_lock(file_id)` and, in one transaction, checks that the file is
      still active, replaces every scene candidate of the file with the new rows and
      sets `loft_candidates_done` and `clip_indexed` true. A file no longer active gets
      nothing written and the stage is not counted.
   4. Still under the lock, after the commit: writes a `small` frame cache entry from
      the downloaded file at each new row's `timestamp_start`, keeping an entry already
      there and skipping one it cannot write, then removes `frames/{id}/tiles/`.
6. The storyboard leg of a CLIP task (`_index_clip_loft` → `_index_youtube_storyboard`)
   and the storyboard step of a fetch (SPEC-ADDON-121) re-read the gate under
   `storyboard_lock`, in the transaction that would replace the rows; when the gate holds
   they write no row and no tile, the thumbnail leg runs as today, and the leg ends with
   `clip_indexed` true. When the flag is true but the file has no scene candidate, they
   write the storyboard as before.
7. A CLIP regenerate of a `.loft` sets `loft_candidates_done` false, both when applied at
   once (`routers/files.py` reindex) and when recorded during a running fetch and applied
   at its end (`loft_media._apply_recorded_requests`), along with what it resets today
   (SPEC-ADDON-117). The storyboard leg then writes the storyboard again and the queued
   fetch rebuilds the candidates from the video.
8. The `vec_clip` dimension migration (`_migrate_vec_clip_if_needed`), which deletes every
   scene candidate, also sets `loft_candidates_done` false for every YouTube `.loft`, so
   each is fetched again.
9. A YouTube `.loft` already fetched before this change has `loft_candidates_done` false,
   so it is wanted again and fetched as backfill (priority -10), as SPEC-ADDON-117
   fetches existing `.loft`s. Its scan and OCR flags are already true, so only the
   candidates stage runs.
10. After a successful candidates stage, the Visual Index `on_index` hook is called as
    after a scan; under SPEC-ADDON-111 I9 it enqueues a run only for a `.loft` with no
    run, so an existing run is left as it is and shows as stale until regenerated.

### 2. Failure cases

- **Native fill extraction fails for a kept time**: that time is left out; the rest are
  stored.
- **The scene-detection pass times out** (300 s, as today): there are no scene frames and
  the fill covers the whole video. Unchanged by this spec.
- **The move fails for a file** (a database error): that file's transaction rolls back,
  its change frames and scene candidates stay, the job logs the file id and goes on with
  the next file; the next start tries it again.
- **Candidates stage fails** (no frame extracted, extraction or embedding error, the
  transaction fails): the file's scene candidates, its tiles and `loft_candidates_done`
  are as they were (the storyboard stays), nothing is written to the frame cache, and
  the fetch counts it as a stage that did not set its flag (SPEC-ADDON-117 I6).
- **A counted failure before the download** (lookup, no rendition, download, short
  duration): counted as today; at the cap of 3 it closes every wanted stage, the
  candidates stage included.
- **At the cap**: `loft_candidates_done` becomes true and the file's scene candidates
  (storyboard or none) stay as they are.
- **A `small` cache entry cannot be written**: it is skipped; the rows stay; that scene's
  tile draws the blank tile-sized block with its time label and seek (SPEC-ADDON-089 I7).
- **The tiles directory cannot be removed**: logged with the file id; the rows stay.
  `scene-tile` then serves a tile only at a time where one exists, else the `small`
  entry.
- **The CLIP model cannot be loaded**: a fetch that wants the candidates stage does not
  start (SPEC-ADDON-117 I3); not counted.

### 3. States

`.loft` scene candidates:

| State | Candidates | `loft_candidates_done` |
|---|---|---|
| None yet | no rows | false |
| Storyboard | storyboard tiles | false |
| From the video | scene changes + fill of the downloaded file | true |
| Closed at the cap | storyboard tiles, or none | true |
| Source `other` | none | true |

Allowed transitions:

- none → storyboard: the storyboard leg or a fetch's storyboard step.
- none or storyboard → from the video: a successful candidates stage.
- none or storyboard → closed at the cap: the third counted failure.
- closed at the cap with no rows → storyboard (flag stays true): the storyboard leg or
  step, since the gate does not hold.
- any → none or storyboard, flag false: a CLIP regenerate, or the `vec_clip` dimension
  migration.
- unclassified → source `other`: classification.

Not allowed:

- from the video → storyboard while the flag is true.
- closed at the cap or from the video → from the video, except after the flag went false.
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
| `indexed_files.loft_candidates_done` | new column; written by the candidates stage, the cap, classification as `other`, a CLIP regenerate (immediate or deferred), the `vec_clip` dimension migration |
| `indexed_files.clip_indexed` | written by the candidates stage |
| `indexed_files.loft_fetch_failures` | written by the fetch as today; a failed candidates stage counts |
| frame cache `frames/{id}/{ms}.webp` (`small`) | written by the candidates stage |
| `frames/{id}/tiles/` | removed by the candidates stage |
| similar-files cache (in process) | cleared once at the end of a move that moved a file |
| `app/config.py`, `search-config.yml.example` | default `min_interval` 10 |
| the downloaded file in the fetch directory | read by the candidates stage, deleted at the fetch end as today |

### 5. External services

None new. The candidates stage reads the file the fetch already downloaded; it makes no
YouTube call. The fetch's lookup and download are unchanged (SPEC-ADDON-117).

### 6. Authorization

None changes. Indexing and fetching are background work; the routes that read the
candidates keep their drive checks.

### 7. Effect on existing features

- **Scene search, scene segments, similar files, concept tagging, tag kNN** read
  `clip` rows: they see more frames on long takes (SPEC-ADDON-144) and the moved change
  frames (SPEC-ADDON-145); for a `.loft`, the video's frames after its candidates stage.
- **The selection** (Scenes list, `/scenes`, `list_video_scenes`, the Visual Index, the
  Ask frames): for a native video the pool is unchanged by the move (same ids, times and
  order: a moved frame is more than 3 s from every pool candidate, so its sort key never
  ties with one), so existing Visual Index runs keep their fingerprint. A later CLIP
  regenerate rebuilds the candidates under the new rule and changes the pool, as a
  regenerate always has. For a `.loft`, the pool is the video's frames after its
  candidates stage, and its existing Visual Index run shows as stale.
- **The Scenes list ruler and `clip-timestamps`** draw one tick per `clip` row
  (SPEC-ADDON-089 I1): denser on long takes and on moved videos.
- **Frame scan**: still queued and counted (`pending.frame_scan`, the Scene change scan
  bar); faster, as it embeds nothing. It no longer needs the CLIP model.
- **Visual Index gate** (needs a scene candidate and a done scan): unchanged.
- **`scene-tile`** for a `.loft`: after the candidates stage serves the `small` entries.
- **SPEC-ADDON-112 pool step 1** ("plus every change frame more than 3 s from every
  scene candidate") becomes "the scene candidates"; the tests that pin the 3 s rule and
  change-frame pools are rewritten against SPEC-ADDON-145.
- **SPEC-ADDON-121 I1** (a fetch writes the storyboard for a `.loft` with no candidates)
  holds as stated: the gate needs at least one scene candidate.
- **A CLIP model change** (the `vec_clip` dimension migration) refetches every YouTube
  `.loft` once, as it already rescans every native video.
- **`timestamp_end = timestamp_start + 30`**, `SEGMENT_TAIL_SECONDS` (30) and
  `MAX_GAP_SECONDS` (45) of scene segments, and `SEGMENT_GROUP_WINDOW` (30) of search
  stay; see Checked, no action.

### 8. Error behavior

A candidates-stage failure is logged as `loft_media candidates failed for <file id>
(<class>)` and counted like a scan failure; the dashboard's YouTube fetch row shows it as
today. A move failure is logged with the file id and the exception class. No log line
carries a URL or a path. A scene whose `small` entry could not be written shows the blank
tile with its time label, as a failed tile does today.

### 9. User-visible behavior

- On native videos with long takes, the Scenes list ruler and scene search have a frame
  at least every 10 s instead of every 30 to 60 s; videos past `M` frames have frames to
  their end.
- On a YouTube `.loft`, after its fetch, scene times are the video's cuts and fill
  frames, not a storyboard grid; pictures come from the `small` cache. Its Visual Index
  run, if any, shows as stale.
- The indexing dashboard's YouTube fetch row shows the already-fetched `.loft`s queued
  again until they are refetched.
- An operator whose `search-config.yml` says `min_interval: 30` sees no change on native
  videos until they edit it and regenerate.

### 10. Non-functional

- Rows: about 1.33 times the scene candidates on regenerated or new videos; the move
  adds about 286,000 rows on production and removes about 650,000 change frames.
- Extraction: thinning on times keeps ffmpeg seeks at most `M` per video.
- The move runs in the background, one file per transaction; queries keep running.
- A `.loft` refetch downloads one 720p rendition again (about 300–500 MB per 30 minutes,
  deleted after) and adds one ffmpeg scene-detection pass over it; about 100 `.loft`s on
  production are refetched as backfill.
- A CLIP regenerate of a native video embeds more frames on long takes.

## Touch points

- `addons/intelligence/app/workers/clip.py`: `_extract_frame_paths`,
  `_fill_interval_gaps`, `_index_clip_loft`, `_index_youtube_storyboard`,
  `index_storyboard`
- `addons/intelligence/app/workers/frame_scan.py`: `_store`, `index_frame_scan`,
  `_change_seconds`, `_spread`, `_keep_small_pictures`
- `addons/intelligence/app/workers/video_visual_selection.py`: `load_selection_inputs`,
  `_pool`, `selection_pool`, `select_scenes`, `SelectionInputs`
- `addons/intelligence/app/workers/loft_media.py`: `_stages_wanted`, `_fetch`,
  `_storyboard_step`, `_count_failure`, `_failed_result`, `_apply_recorded_requests`,
  the classification of source `other`
- `addons/intelligence/app/routers/files.py`: reindex (CLIP regenerate of a `.loft`)
- `addons/intelligence/app/indexer.py`: start-up (the move job, after
  `cleanup_orphaned_embeddings`), `_collect_incomplete`, the inapplicable-flags block,
  the `.loft` enqueue condition, the Visual Index hook after a fetch
- `addons/intelligence/app/database.py`: `loft_candidates_done` migration,
  `_migrate_vec_clip_if_needed`, `_migrate_vec_clip_change_if_needed`, `vec_clip`
  partition insert for the move
- `addons/intelligence/app/models.py`: `IndexedFile.loft_candidates_done`
- `addons/intelligence/app/search.py`: `invalidate_similar_cache` (called)
- `addons/intelligence/app/config.py`, `addons/intelligence/search-config.yml.example`:
  `min_interval` default 10
- Tables: `embeddings`, `vec_clip`, `vec_clip_change`, `indexed_files`,
  `video_frame_scans`; frame cache `frames/{id}/` and `frames/{id}/tiles/`
- Tests under `addons/intelligence/tests/` that pin the 3 s pool rule, change-frame
  writes, the scan's CLIP requirement and the storyboard leg
- Docs: `docs/addons/intelligence.md` (frame extraction, `min_interval`, the operator
  step)
- Rules passed through: `.claude/rules/design-decisions.md` (drive-scoped queries,
  missing files keep their data), `.claude/rules/backend-conventions.md` (additive
  migrations, `import app.config as config`)

## Invariants

I1. For a native video with a known positive duration and no more than `M` times, the stored frame times include every scene frame time, the first is below 1 s, no two consecutive ones are more than `I` apart, and the last is no more than `I` before the duration, except where a fill frame's extraction failed.
I2. A native video's scene candidates number at most `M`; when the scene and fill times numbered `count > M`, the stored times are a subset of the times at index `(i · count) // M` of the time-ordered list, missing only failed extractions, so the video is covered to its last `count / M` times; at most `M` fill extractions run.
I3. After the move, no `clip_change` row and no `vec_clip_change` vector exists, and for every native video the selection pool (ids, times and order) and the candidate fingerprint are the same as before the move; a file whose move failed keeps all its change frames and its scene candidates unchanged, and the other files are still moved.
I4. A frame scan writes no `clip_change` row, no `vec_clip_change` vector and no frame cache entry, leaves none of the file's change frames, and writes its scan row and flag in one transaction as before; it runs and sets its flag when the CLIP model cannot be loaded.
I5. The selection reads no `clip_change` row; for the same scene candidates and scan it returns the same navigation and Ask lists whether or not change frames exist.
I6. A YouTube `.loft` whose candidates stage succeeded has scene candidates equal to what SPEC-ADDON-144 gives for its downloaded file and the duration of step 5.1, `loft_candidates_done` and `clip_indexed` true, a `small` cache entry at each candidate's time (except those it could not write), and no `frames/{id}/tiles/` directory.
I7. A candidates stage that fails, or finds the file no longer active, leaves the `.loft`'s scene candidates, its tile files and `loft_candidates_done` exactly as they were and writes no frame cache entry; a failure is counted, an inactive file is not.
I8. While the gate holds, neither the storyboard leg nor a fetch's storyboard step writes a scene candidate or a tile of that `.loft`, including a leg that started before the candidates stage committed; a CLIP regenerate, applied at once or at the end of a running fetch, sets the flag false, after which the storyboard leg writes the storyboard as before and a fetch rebuilds the candidates from the video.
I9. A YouTube `.loft` with `loft_candidates_done` false and fewer than 3 counted failures is wanted by a fetch; one with its scan and OCR done downloads once and runs only the candidates stage; a native video or a `.loft` of source `other` is never selected by the sweep for this flag.
I10. The third counted failure of a `.loft` fetch sets `loft_candidates_done` true and leaves its scene candidates as they were.
I11. The `vec_clip` dimension migration leaves every YouTube `.loft` with `loft_candidates_done` false; the `vec_clip_change` dimension migration changes no file's flags.
I12. With no `min_interval` in `search-config.yml`, the fill uses 10 s; with a value there, it uses that value; a database written by this build still opens in a build without the column.

## Revises

SPEC-ADDON-111 I1. Scene search, tag kNN, scene segments, similar files, concept tagging and the Scenes grid tiles return the same results for a file before and after its frame scan.
SPEC-ADDON-111 I7. A frame scan writes its scan row and its flag in one transaction, removing the file's change frames and their vectors in it, or writes nothing; it writes nothing and leaves the flag false when the file is unreachable at the start or before the write, the drive's `index` feature is off or the write fails, and writes nothing when the file is no longer active; it keeps what it read after a stall, an early exit or the 600 s extraction limit of a reachable file; it embeds no frame and writes no change frame.
SPEC-ADDON-111 I8. Only native videos and YouTube `.loft`s are ever scanned, and every active one with the flag false is queued (a YouTube or unclassified `.loft` as its SPEC-ADDON-117 fetch), new videos and regenerates ahead of the backfill; purging a file and the orphan cleanup remove its scan row, its change frames and their vectors; a `vec_clip_change` dimension mismatch recreates the table and changes no file's flag; a CLIP regenerate of either queues one scan (a fetch for a `.loft`) and sets its flag false, unless one is running, when it is recorded and applied as SPEC-ADDON-117 step 8 says.
SPEC-ADDON-117 I11. The scan of a `.loft` writes no frame cache entry; the candidates stage (SPEC-ADDON-146) writes, after its row commit, a `small` frame cache entry at each new scene candidate's time, keeping an entry already there and skipping one it cannot write; a native video's scan and CLIP leg write none.
SPEC-ADDON-078 I7. The storyboard leg writes no row and no tile for a `.loft` whose `loft_candidates_done` is true and that has a scene candidate, checked under `storyboard_lock` in the transaction that would replace the rows; otherwise it replaces a YouTube `.loft`'s `clip` rows in one transaction after every kept tile has been embedded, times tile `k` (numbered across sheets) as `k` times the interval recovered from `count = round(fps * duration)` (the smallest whole second `i` with `ceil(duration / i) + 1 == count`, else `duration / (count - 1)`), never `k / fps` nor a sheet's duration, keeps the first tile and then a tile only when `k < count`, its timestamp is below the known duration, and it is at least `duration / max_frames` after the last kept tile, does not thin tiles by `min_interval`, writes no `clip_thumbnail` row and no row for another file, and runs whatever the thumbnail leg did.
SPEC-ADDON-078 I8. After the `clip` task of a `.loft`, `clip_indexed` is true exactly when the thumbnail leg is done and the storyboard leg found the gate of SPEC-ADDON-146 holding, wrote rows, found no `sb0` or no known duration, or found the `.loft` not YouTube; on a transient failure it is false, the existing `clip` rows are as they were, and the same file is not attempted again in that process; a repeat run never leaves two sets of rows or a second `clip_thumbnail` row.
SPEC-ADDON-121 I4. The storyboard leg run by indexing and by a CLIP regenerate behaves as SPEC-ADDON-078 I7 and I8 state, as revised by SPEC-ADDON-146.

## Checked, no action

- **Copy the change frames instead of regenerating every video.** The move needs no
  decoding and no embedding, and keeps every pool and Visual Index fingerprint as it is.
  The moved frames follow the scan's rule (10 s after the last change), not the new fill
  rule; a CLIP regenerate replaces them with the fill. Regenerating 8,711 videos would
  decode about 1,900 hours of video again.
- **Thinning moved frames by `M`.** Not done: thinning would change the pool and make
  Visual Index runs stale on the about 324 videos over `M`.
- **Dropping `vec_clip_change`.** A migration only adds (backend conventions); the table
  stays empty so an older build still opens the database. An older build then sees no
  change frames, and its pool is the scene candidates.
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
- **Refetching `.loft`s already at the cap.** They keep their storyboard; a CLIP
  regenerate resets the count and refetches one.
- **Rebuilding a `.loft`'s existing Visual Index run automatically.** SPEC-ADDON-111 I9
  keeps automatic runs to videos with no run; replacing about 100 runs would spend LLM
  calls without a request.
- **Producing a missing `small` entry on demand.** `scene-tile` never contacts the
  network or runs ffmpeg (SPEC-ADDON-117 I9); a missing picture shows the blank tile.
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
