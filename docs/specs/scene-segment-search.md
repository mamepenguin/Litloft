# Scene segment search

SPEC-ID: SPEC-ADDON-041
SPEC-ID: SPEC-ADDON-042
SPEC-ID: SPEC-CORE-025

Approval: sha256:0b5308cb70945d21e1c9c1f8d1eb0297515c254a640dfb114634165e85e2de0a Yuichi Senga 2026-11-01

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

A viewer who wants a moment inside a video turns on **Scene search**, but that toggle only
adds scene frames to the ranked file list. It answers "which files", not "from when to
when", and its score gates can return nothing for a query whose frames are good. This
change adds a list of scene candidates, each a video with a start and end time, above the
file list while the toggle is on. It reads the scene-frame vectors the indexer already
stored. Nothing is re-indexed and no model other than the existing text encoder runs.

- SPEC-ADDON-041: `GET /search/scene-segments` returns time segments for a query.
- SPEC-ADDON-042: the intelligence addon shows those segments on the search page.
- SPEC-CORE-025: the search page offers a generic `search-results-top` addon slot.

Why the existing route cannot do this, from the code:

- `_vector_search_clip` discards every candidate when the top score minus the mean of the
  50 candidates is below `score_gap_threshold` (0.02). A stand-in over 23 general videos,
  reusing frame vectors at the production sampling times, gave a gap of 0.011 for one
  query whose ten best frames all showed what was asked, so that query returns nothing.
- Each match has a fixed `timestamp_end` of `timestamp_start + 30`, whatever the video does.
- Results compete with text channels and are ranked as files.

What was measured, and its limits: on general videos, frame search separates places,
objects and compositions from random frames well, and is weak on actions and on intent
that a picture cannot show. Scores do not indicate that nothing matches. These figures come
from one judge and small samples, and recall and segment boundaries were not measured.

## Required items

### 1. Normal flow

**`GET /search/scene-segments?q=&limit=`** (SPEC-ADDON-041), drive from `X-Lit-Drive`.

1. `q` is stripped and must be 1 to 200 characters. `limit` is an integer 1 to 50 (default
   20).
2. `F` is the number of `embeddings` rows with `embedding_type = 'clip'` and a non-null
   `timestamp_start` whose file is active and in the request's drive. If `F` is 0, answer
   `{"query", "segments": [], "partial": false}`.
3. The query is embedded with `embed_text_clip`.
4. **Seeds.** One KNN over the `clip` partition of `vec_clip` with `k = 4096`, the most a
   vec0 query allows and the `_CLIP_DRIVE_FETCH_MAX` already used here. Rows of other
   drives, inactive files and null timestamps are dropped; the rows left are the seeds. A
   seed's score is its KNN distance through `_l2_to_cosine_similarity`. With no seeds, answer
   `segments: []`, with `partial` from step 9.
5. **Threshold.** `Required = min(max(min(50, ceil(F / 10)), F // 100), 4096)`, so about the
   top 1% of frames, or up to the top 10% on a drive with few, and `R = min(Required, number
   of seeds)`. `T` is the score of the `R`-th best seed. It is relative to this query and this
   drive; no absolute score, gap or margin gate applies.
6. **Files.** The 30 files with the highest best seed score, ties by `file_id`, are kept. For
   each, the timestamps of all its `clip` rows are read in time order, with or without a stored
   vector. The KNN is exact and `T` is a seed's score, so every frame at or above `T` is already
   a seed, and no other vector needs reading.
7. **Segments.** In one file, seeds scoring at least `T` form a segment when each is at most
   45 seconds after the previous one.
   - `start`: the first frame's timestamp.
   - `end`: the smallest of the file's next strictly later frame timestamp after the
     segment's last frame, that last timestamp plus 30, and the file's duration when it is
     greater than that last timestamp.
   - `peak`: the timestamp of the highest-scoring frame in the segment, the earliest on a tie.
   - `score`: that frame's score, rounded to 4 decimal places.
8. Segments are ordered by unrounded score, highest first, with ties by `file_id` then
   `start`. A file contributes at most 2 segments; later ones are skipped. The first `limit`
   are returned.
9. Response: `{"query": <stripped q>, "segments": [{"file_id", "filename", "start", "end",
   "peak", "score"}], "partial": <bool>}`. `partial` is true when the KNN returned 4096 rows
   and fewer than `Required` seeds remain.
10. The handler runs off the event loop, and `manifest.json` declares the route with the
    `addon_feature` `search` pre_check and `"timeout": 30`, as `/search/scenes` does.

**Search page slot** (SPEC-CORE-025). `frontend/src/app/drive/[name]/search/page.tsx`
renders `<AddonSlot id="search-results-top">` between the toggle row and `FolderBrowser`,
with props `{query, drive, includeSceneClip, typeFilter, smartFolderId}`. The slot renders
only where the toggle row renders, so not for a query with operators.

**Scene list** (SPEC-ADDON-042).

1. The addon registers a section in that slot. It requests the endpoint with the default
   limit when `includeSceneClip` is true, `query` is non-empty, `typeFilter` is null or
   `video`, and `smartFolderId` is null. Scene candidates are videos of the whole drive, so
   they would contradict a narrower listing.
2. Each candidate shows a lazily loaded frame from the existing
   `/files/{id}/frame?t=<peak>`, the filename and the time range, in response order. Times
   read `m:ss`, or `h:mm:ss` from one hour, each value on its own, joined by `-`, as in
   `59:50-1:00:10`. `start` is floored and `end` is rounded up to a whole second.
3. Activating a candidate opens the file's detail page with `?t=<floor(start)>`, the rule
   `lib/matchTimestamps.ts` states for `?t=` links.

### 2. Failure cases

| Step | What goes wrong | What happens |
|---|---|---|
| Endpoint | `q` empty after stripping or too long, `limit` out of range | 422 |
| Endpoint | `X-Lit-Drive` missing | 400 (`require_drive`) |
| Endpoint | drive not accessible to the caller | proxy 403 |
| Endpoint | the drive's `search` policy is off | proxy 404 |
| Endpoint | the drive has no eligible frames | 200, `segments: []`, `partial: false` |
| Endpoint | other drives fill all 4096 seeds, so the drive has none | 200, `segments: []`, `partial: true` |
| Endpoint | a frame's row has no vector in `vec_clip` | it can never be a seed, and its timestamp still bounds `end` |
| Endpoint | frames exist but the KNN returned under 4096 rows and none is a seed | 200, `segments: []`, `partial: false` |
| Endpoint | the encoder is cold and the route passes 30 seconds | proxy timeout, shown as the failure line |
| Endpoint | the text encoder fails | addon answers 503 `Embedding unavailable`, logged, as `/search/scenes` does; it does not use the wrapper that turns a failure into `None` |
| Endpoint | a table read fails | addon answers 500 `Search failed`, logged |
| Endpoint | either of the two above, seen by the browser | the proxy's 502 |
| Scene list | the request fails | the section shows a one-line failure message; the file list is unaffected |
| Scene list | the addon is absent | the section does not exist |
| Scene list | the policy answers 404 | the section enters idle and shows nothing |
| Scene list | a frame image fails to load | the candidate keeps its text and stays usable |

### 3. States

The endpoint is stateless. The scene list has these states.

| State | Meaning |
|---|---|
| idle | a request condition of the scene list's step 1 does not hold, or the route answered 404; nothing is shown |
| loading | a request is in flight |
| loaded | candidates are shown |
| empty | the response had no candidates |
| failed | the request failed |

- On mount, and on any change of query, drive, toggle, type filter or smart folder, the
  current request is cancelled and the section enters loading when every condition holds, or
  idle otherwise. Nothing else refetches. The server may finish a cancelled request's work.
- loading moves to loaded, empty, failed or idle only on the response to the current request. A
  response to anything earlier is ignored in every state, so it cannot leave idle.
- failed has no retry control. It leaves through the changes above.

### 4. Data read and written

Read: `embeddings`, `indexed_files`, `vec_clip`. The new endpoint writes nothing, in any
store. Showing a candidate calls the existing frame route, which may extract the frame and
write its existing cache under `intelligence_data_dir/frames/`.

### 5. External services

None. The encoder is local and no LLM is called.

### 6. Authorization

The core addon proxy checks drive access and the `search` policy through `X-Lit-Drive` and
the pre_check. The handler restricts every row to `indexed_files.drive = <request drive>`.

### 7. Effect on existing features

`/search`, the meaning of `include_scene_clip`, its gates and its RRF ranking are unchanged.
The file list changes in one way: the flag now stays in the URL on the paths listed in item 9,
so a reload or filter change keeps showing scene-inclusive results where today it silently
falls back to the scene-off list. `/search/scenes` and the Visual Index are unchanged. The new slot is empty when
no addon registers it.

### 8. Error behavior

A failure shows one line in the section and logs through the existing search logger. The
file list stays as it was. Validation errors are the API's 4xx responses.

### 9. User-visible behavior

- With Scene search on, the section appears above the file list. With it off, the page is
  as before and the endpoint is not called.
- **The toggle stays on** through Back, a reload, and a type filter or sort change, and through
  a new query from the header when the current page is that drive's search page with the flag
  on. A query from any other page, including a file's detail page, starts with it off. Today
  `FolderBrowser` and `GlobalSearch` rebuild the search URL without `include_scene_clip`, which
  would turn it off on the way back from a candidate. `GlobalSearch` reads the current URL when
  the query is submitted, and applies the same rule to its "see all" link. Other parameters
  behave as before.
- The heading **Scene candidates** (`シーン候補`) shows in every state except idle. The results
  are the closest candidates, and the list is not a claim that the scene exists. It shows no
  score.
- While loading, the section shows `シーンを探しています` / `Searching for scenes`.
- On failure it shows `シーンを検索できませんでした` / `Couldn't search scenes`.
- The candidates sit in one horizontally scrolling row, so the section's height does not grow
  with their number and the file list stays near the top of the page. Loading reserves the
  row's height, so the list does not move when candidates arrive. The `partial` line sits in
  the heading row. The empty and failed states collapse to one line, which may move the list.
- With `partial` true it shows `このドライブのシーンを見逃している可能性があります` / `Some
  scenes in this drive may have been missed`.
- With no candidates and `partial` false it shows `このドライブにはシーンの索引がありません` /
  `This drive has no scene index`. By I2 this says nothing about the query. With `partial` true
  and no candidates, only the `partial` line shows.
- The row does not widen the page. Measured in a real browser at 375 and 1280 pixels: the
  document does not overflow horizontally, and the section's height is the same while loading
  and with 1 or 20 candidates.
- Text comes from the addon's `messages/{ja,en}.json`. `docs/user-guide/search.md` gains a
  sentence, and `docs/addons/intelligence.md` documents the endpoint.
- A Design Artifact for the section is agreed before its UI is implemented, following
  `DESIGN.md`.

### 10. Non-functional

- One KNN scan of the `clip` partition per request, plus the timestamps of at most 30 files. The
  manifest gives the route a 30-second timeout; the proxy default, which `/search` uses, is 15.
- With the toggle on, one search runs the existing search and this endpoint side by side.
  `/search` may get slower while they share the encoder and the table. Its results may not
  change (I8).
- The time on production-sized data is unmeasured. One whole-table KNN took 0.9 to 3.6 seconds
  on production before the partition. R-5 measures this route and `/search` running together on
  the largest data available, and either passing its timeout there is reported to the human
  before shipping.
- Frames load lazily, so the first view extracts only those scrolled into the row.
- No new table, index, column, or stored vector.
- Time precision is what the stored frames allow: at scene cuts, and about every 30 seconds
  otherwise. A video at the indexer's 500-frame cap has no frames past the cap, and no segment
  reaches more than 30 seconds beyond its last frame.

## Touch points

- `addons/intelligence/app/routers/search.py` and a new module for the segment logic: the
  endpoint.
- `addons/intelligence/manifest.json`: the route and the slot registration.
- `addons/intelligence/app/schemas.py`: the response model.
- `addons/intelligence/frontend/`: the section, `api.ts`, `slots.ts` and
  `messages/{ja,en}.json`. The slot entry's id is `scene-segments`, its label `Scene candidates`, its priority 10.
- `frontend/src/app/drive/[name]/search/page.tsx`: the slot.
- `frontend/src/components/FolderBrowser.tsx`, `frontend/src/components/GlobalSearch.tsx`: keep
  `include_scene_clip` when they rebuild the search URL.
- `frontend/e2e-layout/`: the row measurement, against a static fixture.
- `docs/user-guide/search.md`, `docs/addons/intelligence.md`, and `docs/ADDON-DEVELOPMENT.md`
  for the new slot.
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary, addon slots, no
  core-to-addon dependency, `X-Lit-Drive`), `.claude/rules/frontend-conventions.md`,
  `DESIGN.md`.
- The `addons/intelligence` submodule pointer.
- No protected path is edited.

## Invariants

I1. A segment is returned only from a file that is active and in the request's drive, even when another drive holds closer frames.
I2. When the drive has at least one seed, the endpoint returns at least one segment, whatever the scores are.
I3. In a kept file, every seed at or above `T` belongs to a segment before the per-file cap, and two such seeds more than 45 seconds apart with none between them at or above `T` are never in the same segment.
I4. Every segment has `start` < `end` and `start` <= `peak` < `end`, `start` and `peak` are timestamps of stored frames of that file, and `end` follows the rule of step 7.
I5. Segments are ordered by score, then `file_id`, then `start`; no file contributes more than 2; and the response holds at most `limit`.
I6. `partial` is true exactly when the KNN returned 4096 rows and fewer than `Required` seeds remain.
I7. A response to an earlier query, drive, toggle or filter state never changes what the scene list shows.
I8. Results of `/search`, with `include_scene_clip` on or off, are identical before and after this change.
I9. Through the proxy, the endpoint answers 404 on a drive whose `search` policy is off, and returns no segment for a drive the caller cannot access.
I10. With Scene search off, operators in the query, a non-video type filter or a smart folder, the search page makes no request to the endpoint and shows no scene section, and with it on the flag survives returning from a candidate.

## Checked, no action

- **Items held by the acceptance tests and not by an invariant.** The list stays at ten. `F`,
  `Required` and `T`, the `?t=` value, the absent score, the `partial` line, the 30-file cap,
  the read-only endpoint, the row's measurement, a failure leaving the file list, the flag on
  each path of item 9, the slot's props, and the absence of a slot without an addon are
  requirements above.
- **The proxy's 403 on an inaccessible drive.** `.claude/rules/design-decisions.md` asks for 404
  on a locked drive, and the proxy answers 403 for every proxied route. This is inherited
  behaviour, unchanged here, and I9 does not pin the status.
- **`SmartFolderSaveButton` dropping the flag.** Saving or deleting a smart folder rebuilds the
  URL without it. The section is hidden while a smart folder is active, and the toggle is visibly
  off afterwards, so nothing is silently wrong.
- **A candidate in the first second of a video.** `?t=0` counts as no request in
  `playbackProgress.ts`, so a video with stored progress opens there instead. This is existing
  behaviour for every `?t=0` link and affects only segments that begin at the very start.
- **No maximum segment length.** A long take of similar frames becomes one long segment. It
  still says where the scene begins, and any cap would be an unmeasured guess.
- **Changing the sampling.** Frame density affects long takes more than videos with frequent
  cuts: on 23 videos with frequent cuts, 8 to 9 of the top 10 frames at 5-second sampling
  also came first at the production sampling, while on a set with long takes production
  stores about a sixth of the frames and overlap was lower. Precision of the coarser set was
  not judged. Nothing here prevents a later denser index, and using this first shows whether
  it is worth re-indexing.
- **Removing near-identical segments such as repeated openings.** Comparing peak-frame
  vectors does not separate them: one repeated opening gave cosine 0.985 for one pair and
  0.914 for another, while different scenes from different episodes reached 0.971. A
  threshold would drop real scenes silently or miss the repeats. The per-file cap limits a
  single video only. This remains a known source of repeated candidates.
- **Temporal smoothing.** The probe smoothed over 15 seconds at fixed 5-second sampling.
  Production frames are irregular, so segments are built from raw scores and the 45-second
  gap, which tolerates a dip between frames.
- **Fixing the gates of `include_scene_clip`.** Loosening them changes ordinary search
  ranking, which is a separate decision. I8 keeps it unchanged.
- **Vision-model labels for actions.** Local model labelling costs tens of seconds per
  window and is a separate decision. The response shape can carry it later.
- **An MCP tool.** Viewer need comes first; a tool can follow on the same endpoint.
- **Measuring per-drive frame counts on production.** `partial` reports the case where other
  drives crowd out the seeds rather than hiding it. `Required` never exceeds the drive's frames
  or 4096, so a small or very large drive with no crowding does not report it.
- **Scores in the UI.** They are not comparable between queries and would suggest a meaning
  they do not have.
