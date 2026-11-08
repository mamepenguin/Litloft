# Storyboard tiles as the pictures of a YouTube reference's scenes

SPEC-ID: SPEC-ADDON-079
SPEC-ID: SPEC-ADDON-080

Approval:

## Summary

A YouTube `.loft` has CLIP scene rows cut from its storyboard (SPEC-ADDON-078), but no
picture is shown for them: the file page hides its CLIP frames panel for every `.loft`,
and a YouTube candidate in the search page's Scene candidates grid is a blank card,
because the only picture source, the frame route, costs a 2 to 7 s YouTube lookup per
request. The storyboard tiles the index already cut are the pictures CLIP saw, at
thumbnail size, so this change keeps them and shows them there.

- **SPEC-ADDON-079, a tile store and route.** When the storyboard leg indexes a YouTube
  `.loft`, it also writes each kept tile as a WebP file beside the file's frame cache.
  A new route, `GET /files/{file_id}/scene-tile?t=`, returns the stored tile whose time
  is `t` and nothing else. It never contacts YouTube and never runs ffmpeg.
- **SPEC-ADDON-080, the two places that show it.** The CLIP frames panel appears for a
  `.loft` that has scene rows and shows their tiles; a `.loft` candidate in the Scene
  candidates grid shows its tile. A tile that is missing shows the blank card already
  used when a frame cannot be loaded.

The frame route, Ask and the MCP tools are unchanged: a tile is never returned as a frame
(SPEC-ADDON-071 I7, SPEC-ADDON-076 I2).

## Required items

### 1. Normal flow

Indexing (SPEC-ADDON-079):

1. The storyboard leg runs as SPEC-ADDON-078 states: it downloads the sheets, cuts the
   kept tiles, and embeds each one.
2. Each tile it embeds is also encoded as WebP (q70, at the tile's own size, never
   enlarged) into a new directory `frames/{file_id}/tiles.<random>/`, named
   `{ms}.webp`, where `ms` is the tile's timestamp in milliseconds rounded as the frame
   cache rounds it.
3. In the transaction that replaces the file's `clip` rows, nothing about tiles changes.
   After that transaction commits, the swap runs: the old `frames/{file_id}/tiles/` is
   renamed aside to `tiles.old.<random>/`, the new directory is renamed to
   `frames/{file_id}/tiles/`, and the old one is removed. The rows and the tiles on disk
   then name the same times. The row commit and the swap of one file id run under a
   per-file lock in the process, so two runs on the same file finish one after the
   other and the later commit's tiles are the ones left.
   At the start of every storyboard leg, any `frames/{file_id}/tiles.*` directory left
   by an earlier run (a failed swap or a process exit) is removed; `tiles/` itself is
   kept.

Serving (SPEC-ADDON-079):

4. `GET /files/{file_id}/scene-tile?t=<seconds>` looks up the indexed, active file as
   the frame route does (drive header optional, the host's `file_access` pre-check),
   computes `ms` from `t` with the same rounding, and returns
   `frames/{file_id}/tiles/{ms}.webp` as `image/webp` with the frame route's immutable
   cache header.

Showing (SPEC-ADDON-080):

5. File page, CLIP frames panel: for a `.loft` (mime
   `application/vnd.litloft.loft+json`) the panel requests `clip-timestamps` when it
   mounts and renders nothing until that returns at least one row. It then appears as
   the native panel does: a collapsed header with the row count, expanded by a click,
   showing 20 pictures at a time with the same near-end paging. Each picture comes from
   the scene-tile route at the row's `start`. Clicking a picture seeks the player to
   that time, as for a native video. Native videos behave exactly as today (lazy fetch on
   first expand, frame route).
6. Search page, Scene candidates grid: a candidate whose filename ends in `.loft` shows
   the scene-tile route's picture at the segment's `peak` instead of a blank card. Native
   candidates keep the frame route.

### 2. Failure cases

- Encoding or writing a tile fails: the leg is a transient failure with class
  `tile_write_failed`, as a failed embed is (SPEC-ADDON-078 I8): no rows are replaced,
  the new directory is removed, the old rows and tiles stay.
- The swap after commit fails (a rename or the removal): logged as a warning naming the
  file id; the rows stay committed and `clip_indexed` is true. Whatever the swap left
  (old tiles in `tiles/`, no `tiles/`, or a `tiles.*` directory) stays until the next
  storyboard leg, which removes every `tiles.*` directory first and writes a fresh set.
  Until then a row whose tile is missing shows the blank picture; an old tile under the
  same time shows the picture of that time from the earlier run (same video).
- The process exits between the commit and the end of the swap: the same states, cleared
  the same way by the next leg.
- A re-run that ends `no_sb0`, `no_duration` or not YouTube: it touches neither the
  existing rows (SPEC-ADDON-078) nor the existing tiles.
- Route input: `t` is declared as the frame route declares it (`float`, required,
  `>= 0`), so a missing, negative or non-numeric `t` answers 422. The checks then run in
  this order: file lookup (404 when not indexed or not active, or outside the
  `X-Lit-Drive` drive), file type (400 `Not a video file` unless `file_type ==
  "video"`), tile (404 when `frames/{file_id}/tiles/{ms}.webp` does not exist). A
  reference indexed before this change, a native video, a `.loft` of another provider
  and a `t` that is not a row time all end at the tile check.
- `clip-timestamps` fails for a `.loft` panel: the panel stays hidden (as when it returns
  no rows) and nothing is retried until the page is opened again.
- In the UI a tile request that fails shows the blank card (grid) or a blank block of
  the picture's size with no alt text shown (panel); nothing else is requested in its
  place.

### 3. States

Per YouTube `.loft`:

- **No tiles**: indexed before this change, or never had a storyboard.
- **Tiles match rows**: after a storyboard leg whose swap succeeded.
- **Tiles out of step**: after a swap that failed or was cut short by a process exit —
  old tiles under `tiles/`, no `tiles/`, and/or a leftover `tiles.*` directory.

Transitions: any state → tiles match rows on a storyboard leg whose swap succeeds; any
state → tiles out of step on a swap failure; a leg that fails before its commit, or ends
`no_sb0` / `no_duration` / not YouTube, leaves the state as it was. A file removed from
the index loses `frames/{file_id}/` entirely, whatever the state.

### 4. Data read and written

- Written: `intelligence_data_dir/frames/{file_id}/tiles/` (and the temporary
  `tiles.<random>/`), only by the storyboard leg.
- Read: the same directory, by the scene-tile route; `indexed_files` (read) for the
  file lookup; `clip-timestamps` (existing, read) by the panel.
- Not touched: the frame cache files `{ms}.webp` / `{ms}.large.webp`, the `embeddings`
  table schema, the core DB.

### 5. External services

None new. The tiles come from the sheets the storyboard leg already downloads; the route
makes no network call.

### 6. Authorization

The route is listed in the addon manifest exactly as `/files/{file_id}/frame` is:
`drive_optional: true` and `pre_check: {type: file_access, param: file_id}`, so the host
checks that the caller may read the file's drive, and when `X-Lit-Drive` is present the
route enforces the current-drive match as the frame route does. A locked drive's file
answers 404 from the host before the addon.

### 7. Effect on existing features

- `purge_frame_cache` already removes `frames/{file_id}/` on file removal and policy-off
  purge, so tiles go with it; no new purge path.
- The frame route, Ask, `/scenes`, the MCP tools, scene search scores and order are
  unchanged; the scene-segments response is unchanged (no `frame_url`, SPEC-ADDON-078
  I10).
- The CLIP frames panel for a native video, and the guard for every non-video file, are
  unchanged.
- The storyboard leg writes about 10 to 15 KB per tile (at most `max_frames` tiles, 500
  by default), once per indexing.

### 8. Error behavior

- Log lines: `youtube storyboard failed: ... class=tile_write_failed` on a write failure;
  a warning naming the file id on a failed swap. No URL is logged (SPEC-ADDON-076 I5).
- A viewer sees a blank card or blank picture for a missing tile and no error text.

### 9. User-visible behavior

- A YouTube reference indexed with this change shows a CLIP frames panel on its file page
  with one small picture per scene row, labelled with its time, and its candidates in the
  Scene candidates grid show a picture.
- A reference indexed before this change shows the panel with blank pictures and blank
  candidate cards until its `Image analysis (CLIP)` task is regenerated from **Index
  details**.
- A `.loft` of another provider shows no panel, as today.
- Pictures are storyboard quality (320x180 or smaller), the same as what CLIP indexed.

### 10. Non-functional

- The route reads one small file; no lookup, no ffmpeg, no lock.
- Disk: at most `max_frames` tiles per YouTube reference, each tens of KB at most.
- Privacy: tiles are public YouTube storyboard images of a video the user saved; they are
  stored only under the addon's data directory and served only through the file-access
  check.

## Touch points

- `addons/intelligence/app/workers/clip.py`: `_embed_tiles` / `_index_youtube_storyboard`
  (write tiles to a temporary directory, swap after the row commit, new failure class).
- `addons/intelligence/app/frame_cache.py`: the tile directory path helper beside
  `frame_cache_dir`, the shared millisecond rounding.
- `addons/intelligence/app/routers/files.py`: new `GET /files/{file_id}/scene-tile`.
- `addons/intelligence/manifest.json`: the route entry (proxied route, file-access
  pre-check).
- `addons/intelligence/frontend/ClipFramesSection.tsx`: the `.loft` branch.
- `addons/intelligence/frontend/SceneCandidatesSection.tsx`: the `.loft` picture.
- `addons/intelligence/frontend/api.ts`: `getSceneTileUrl`.
- Tests under `addons/intelligence/tests/` and `addons/intelligence/frontend/`.
- `docs/addons/intelligence.md` (the YouTube references paragraph, whose "never shown"
  and "blank card" sentences become false, and the route list),
  `docs/user-guide/search.md` (the YouTube candidate sentence, which also says a
  reference saved earlier shows pictures after its `Image analysis (CLIP)` is
  regenerated; no user-guide page documents the file page's CLIP frames panel, so that
  sentence covers both places).
- The core gitlink for `addons/intelligence`, bumped to the merged addon commit.
- No protected path is edited.

## Invariants

I1. `GET /files/{id}/scene-tile?t=` returns only a file under `frames/{id}/tiles/` whose name is `t` in milliseconds with the frame cache's rounding, as `image/webp`; when no such file exists it answers 404, `t` is validated as the frame route validates it (422), a non-video file answers 400, and it never contacts the network, never runs ffmpeg and never writes a file.
I2. After a storyboard leg whose swap succeeded, the names in `frames/{id}/tiles/` are exactly the `timestamp_start` values of the file's `clip` rows in milliseconds, each file is the tile that was embedded for that row at the tile's own size, and no `frames/{id}/tiles.*` directory remains.
I3. A storyboard leg that fails before its row transaction commits, or ends `no_sb0`, `no_duration` or not YouTube, leaves the file's `clip` rows and its `frames/{id}/tiles/` as they were, and leaves no temporary tile directory.
I4. The scene-tile route is reachable only through the host's file-access check, and with `X-Lit-Drive` present it answers as the frame route does for a file outside that drive.
I5. `GET /files/{id}/frame`, Ask and the MCP tools never return or cache a storyboard tile, and the frame cache files `{ms}.webp` and `{ms}.large.webp` are never written by the storyboard leg.
I6. The CLIP frames panel of a `.loft` renders nothing until `clip-timestamps` returns at least one row (and stays hidden when it fails), then shows the native panel's collapsed header with the count and 20-at-a-time paging, takes every picture from the scene-tile route, never requests the frame route, and shows a blank block of the picture's size with no visible alt text for a tile that fails; for a native video the panel requests nothing before its first expand and takes its pictures from the frame route, as before.
I7. A `.loft` candidate in the Scene candidates grid requests only the scene-tile route at its `peak`, and shows the blank card when that request fails; a native candidate requests only the frame route, as before.
I8. Removing a file from the index (and the policy-off drive purge) removes its tiles with its frame cache.
I9. A swap that fails after the row commit leaves the rows committed and `clip_indexed` true and logs a warning naming the file id; the next storyboard leg of that file removes every `frames/{id}/tiles.*` directory before writing, and two legs of one file in a process never interleave their commit and swap.

## Checked, no action

- **Reading the tile from YouTube on request** (a lookup, one sheet download, a crop): it
  keeps a 2 to 7 s lookup on every uncached picture and depends on signed URLs that
  expire; the tiles are already in hand at indexing time and cost tens of KB each.
- **Writing tiles into the frame cache as `{ms}.webp`**: the frame route would then serve
  a storyboard tile as the frame at `t`, which SPEC-ADDON-076 I2 forbids; a separate
  directory and route keep "frame" meaning the video's own frame.
- **A backfill of references indexed before this change**: they show blank pictures
  until their `clip` task is regenerated, the same manual step SPEC-ADDON-078 already
  needs for scene rows.
- **The nearest tile for a `t` that is not a row time**: both callers pass a row time
  (`start` from `clip-timestamps`, `peak` from scene segments), so exact match is enough
  and a wrong picture cannot be served.
- **Tiles in the MCP `list_video_scenes` output** instead of small frames: it would make
  the scene list cheaper but changes SPEC-CORE-058; its own change if wanted.
- **A label telling sampled tiles from scene-change frames**: the user decided no.
- **Tiles for non-YouTube `.loft` providers**: they have no storyboard leg.
- **A purge that runs while a storyboard leg is in flight**: the leg's row commit would
  already write rows for the purged file; the tiles follow the rows and add no new case.
  Purges happen on file removal and a policy change, not during a reindex in normal use.
- **Retrying a `tile_write_failed` file before a restart**: it joins the existing
  per-process failed set (SPEC-ADDON-078 I8), as every other transient class does.
