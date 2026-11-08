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
   After that transaction commits, the old `frames/{file_id}/tiles/` is removed and the
   new directory is renamed to `frames/{file_id}/tiles/`. The rows and the tiles on disk
   then name the same times.

Serving (SPEC-ADDON-079):

4. `GET /files/{file_id}/scene-tile?t=<seconds>` looks up the indexed, active file as
   the frame route does (drive header optional, the host's `file_access` pre-check),
   computes `ms` from `t` with the same rounding, and returns
   `frames/{file_id}/tiles/{ms}.webp` as `image/webp` with the frame route's immutable
   cache header.

Showing (SPEC-ADDON-080):

5. File page, CLIP frames panel: for a `.loft` (mime
   `application/vnd.litloft.loft+json`) the panel requests `clip-timestamps` when it
   mounts, appears only when that returns at least one row, and shows each row's picture
   from the scene-tile route at the row's `start`. Clicking a picture seeks the player to
   that time, as for a native video. Native videos behave exactly as today (lazy fetch on
   first expand, frame route).
6. Search page, Scene candidates grid: a candidate whose filename ends in `.loft` shows
   the scene-tile route's picture at the segment's `peak` instead of a blank card. Native
   candidates keep the frame route.

### 2. Failure cases

- Encoding or writing a tile fails: the leg is a transient failure with class
  `tile_write_failed`, as a failed embed is (SPEC-ADDON-078 I8): no rows are replaced,
  the new directory is removed, the old rows and tiles stay.
- The swap after commit fails (removing the old directory or renaming): logged as a
  warning; the rows are already committed. A row whose tile is missing shows the blank
  card; the next `clip` run writes the tiles again. The leg's result is unchanged.
- The route finds no file for `ms`: 404. That covers a reference indexed before this
  change, a native video, a `.loft` of another provider, a `t` that is not a row time,
  and a file not indexed or not active.
- The file is not `file_type == "video"`: 400 `Not a video file`, as the frame route.
- In the UI a tile request that fails shows the blank card (grid) or a blank picture of
  the same size (panel); nothing else is requested in its place.

### 3. States

Per YouTube `.loft`: no tiles (indexed before this change, or the leg found no
storyboard) → tiles matching the current rows (after a successful storyboard leg). A
later successful run moves to the new set; a failed run stays where it was. A file
removed from the index loses its tiles with the frame cache. No other state.

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
- `docs/addons/intelligence.md` (the YouTube references paragraph and the route list),
  `docs/user-guide/search.md` (the YouTube candidate sentence).
- No protected path is edited.

## Invariants

I1. `GET /files/{id}/scene-tile?t=` returns only a file under `frames/{id}/tiles/` whose name is `t` in milliseconds with the frame cache's rounding, as `image/webp`; when no such file exists it answers 404, and it never contacts the network, never runs ffmpeg and never writes a file.
I2. After a successful storyboard leg, the names in `frames/{id}/tiles/` are exactly the `timestamp_start` values of the file's `clip` rows in milliseconds, and each file is the tile that was embedded for that row, at the tile's own size.
I3. A storyboard leg that fails before its row transaction commits leaves the file's `clip` rows and its `frames/{id}/tiles/` as they were, and leaves no temporary tile directory.
I4. The scene-tile route is reachable only through the host's file-access check, and with `X-Lit-Drive` present it answers as the frame route does for a file outside that drive.
I5. `GET /files/{id}/frame`, Ask and the MCP tools never return or cache a storyboard tile, and the frame cache files `{ms}.webp` and `{ms}.large.webp` are never written by the storyboard leg.
I6. The CLIP frames panel of a `.loft` appears only after `clip-timestamps` returns at least one row, takes every picture from the scene-tile route, and never requests the frame route; for a native video the panel requests nothing before its first expand and takes its pictures from the frame route, as before.
I7. A `.loft` candidate in the Scene candidates grid requests only the scene-tile route at its `peak`, and shows the blank card when that request fails; a native candidate requests only the frame route, as before.
I8. Removing a file from the index (and the policy-off drive purge) removes its tiles with its frame cache.

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
