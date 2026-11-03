# Image matches beyond the first fifty, and past the score cutoff on request

SPEC-ID: SPEC-ADDON-046
SPEC-ID: SPEC-ADDON-055
SPEC-ID: SPEC-CORE-035

Approval: sha256:c74146104d52b81c2e35a24ff0a67a7954d92a8d56997b89770b206553028c11 Yuichi Senga 2026-11-03

## Summary

A viewer who searches a drive of their own pictures for a subject they photograph a lot
gets at most 50 pictures. On production, "ペンギン" on the photos drive returns 50 results,
41 of them penguins, although 382 pictures carry a suggested ペンギン tag. The image channel
of precision search (`_vector_search_clip` in the intelligence addon's `app/search.py`)
takes the 50 nearest representative frames of the drive (`rrf_candidates`) before its
score cutoff runs, so the cutoff never gets a say for a subject with more than 50 pictures.

This change does three things, all for the viewer on the search page:

- **SPEC-ADDON-046**: in precision search with Scene search off, the image channel takes
  as many of the drive's nearest representative frames as the effective `limit`, never
  fewer than today's 50. The existing margin cutoff then decides where the list ends.
  `GET /search` accepts `limit` up to 1000, and `search.max_limit` defaults to 1000.
- **SPEC-ADDON-055**: a new `GET /search/images` returns, in one response, the drive's
  files ranked by how similar their representative frame is to the query, the first 2000
  of them, with no margin cutoff.
- **SPEC-CORE-035**: the search page asks `/search` for up to 1000 results, and at the end
  of the list offers **Show more by similarity**. It fetches `/search/images` once and
  appends, in that order, the files not already in the list, revealing them as the viewer
  scrolls.

The score cutoff stays because it keeps an unrelated query from listing the whole drive.
It becomes a mark of "confident up to here" rather than the end of what can be seen. The
continuation starts from the drive's best frame and skips what is already shown, so a
match the first list did not reach, for whatever reason, is not lost between the two.

### Measurements

Read-only, 2026-11-03, against the real indexes with the production image model. Ground
truth is the drive's pending suggested tags on the photos drive (3,757 representative
frames), and the BLIP caption words on the local test image drive (1,138), which has no
suggested tags. Both are model output, so the numbers are approximate. The photos drive is
mostly penguins, so its counts for other subjects are thin.

Where the penguins rank in the drive, by image similarity alone:

| Query | top 50 | top 200 | top 500 | top 750 | top 1000 | last of the 382 |
|---|---|---|---|---|---|---|
| ペンギン | 41 | 148 | 318 | 364 | 377 | 1951 |
| penguin | 44 | 154 | 316 | 365 | 377 | 1799 |
| ペンギンの写真 | 35 | 146 | 305 | 354 | 372 | 2706 |

Where the existing margin cutoff (best score − `score_cutoff_margin`, 0.05) ends the list
once the 50 cap is gone:

| Drive, word | Truth | Cutoff rank | Truth found by the cutoff | Precision at the cutoff | Rank for 90% of the truth |
|---|---|---|---|---|---|
| photos, ペンギン | 382 | 610 | 90% | 0.56 | 601 |
| photos, 料理 | 224 | 197 | 67% | 0.76 | 387 |
| photos, 鳥 | 236 | 209 | 52% | 0.59 | 910 |
| photos, 猫 | 102 | 26 | 4% | 0.15 | 1743 |
| test images, dog | 43 | 43 | 93% | 0.93 | 42 |
| test images, car | 103 | 102 | 79% | 0.79 | 125 |
| test images, flower | 48 | 24 | 44% | 0.88 | 64 |
| test images, food | 31 | 99 | 97% | 0.30 | 69 |
| test images, tree | 28 | 6 | 18% | 0.83 | 455 |

The ranking is good for a concrete subject on both drives. The cutoff is not: it stops
far too early for some words (猫, flower, tree) and late for others (food). No single
threshold fits, which is why the continuation is in the viewer's hands rather than a
tuned number. The user chose this design on 2026-11-03 after seeing these tables.

## Required items

### 1. Normal flow

SPEC-ADDON-046:

1. The search page sends `GET /api/addons/intelligence/search?q=ペンギン&limit=1000` with
   `X-Lit-Drive: photos`.
2. `search()` computes `effective_limit = min(limit, max_limit)` as today. In precision
   mode with `include_scene_clip=false`, it passes `max(effective_limit, rrf_candidates)`
   to `_vector_search_clip` as the depth, instead of `rrf_candidates`. Every other channel
   and mode keeps `rrf_candidates`.
3. `_vector_search_clip` takes that many nearest `clip_thumbnail` rows of the drive with
   today's widening fetch (`_drive_thumbnail_neighbours`, up to the 4,096 nearest rows of
   the partition), then applies the floor and the margin cutoff unchanged.
4. The rest of `search()` (other channels, combiner, `_build_results`, hydration) runs
   unchanged. For ペンギン the response holds about 610 image matches plus any keyword
   matches.

SPEC-ADDON-055:

1. `GET /api/addons/intelligence/search/images?q=ペンギン` with `X-Lit-Drive`, optionally
   `type` (the same values as `/search`).
2. The addon embeds `q` with the image model and scores the representative frame
   (`clip_thumbnail`) of every active file of the request drive. The ranking is exact over
   the drive's own frames; it is not limited to the 4,096 nearest rows of the shared
   partition.
3. It drops frames scoring below `min_score_clip_thumbnail`, applies `type`, sorts by
   descending cosine similarity (ties by `file_id` ascending), and keeps the first 2000.
   There is no margin cutoff.
4. It builds each kept file's result exactly as `/search` in precision mode would for a
   file whose only match is that frame: the same segment (one `clip_thumbnail` match with
   the raw cosine), the same `match_types: ["clip_thumbnail"]`, and the same `score`,
   `alpha × type_weight_clip_thumbnail × cosine` with today's constants.
5. It hydrates the kept files through the core's `POST /api/internal/files/bulk`
   (`hydrate_files`), as `/search` does.
6. The response uses the `/search` response model (`results`, `total`, `indexed_files`,
   `service_version`); the core's addon proxy adds `available: true` as it does for
   `/search`.

SPEC-CORE-035:

1. The viewer searches on the search page (`/drive/{drive}/search?q=...`). Filename
   results and semantic results are merged as today; the semantic request asks for
   `limit=1000` instead of 50.
2. When the conditions in 9 hold and nothing has been fetched for this search key,
   **Show more by similarity** is drawn after the last result, below the filename list's
   end-of-list sentinel. "The semantic results have arrived" means the page's own
   `limit=1000` response; hits hydrated from the header popup's search cache
   (`readSearchCache`) do not count.
3. Clicking it sends one `GET /search/images` with the query, the drive and the toolbar
   type. While it runs, the button shows it is busy and cannot be clicked again.
4. On success the page stores the answer, in the endpoint's order, as the continuation.
   What is drawn from it is computed at every render: the stored results whose file is
   not in the list above and that pass the current trust filter. If none would be drawn
   right after the answer arrives, the button disappears and nothing is appended.
5. The first 100 of those are drawn at once as ordinary rows below everything else. Each
   time the end of the list is in view, the next 100 follow; if the end is still in view
   after a reveal, the next 100 follow again, until all are drawn. While some remain
   undrawn, the existing end-of-list spinner sits there in place of the button; when all
   are drawn, nothing is drawn there.
6. Drawn rows are part of the page's list `files`, with everything that reads it: the
   text filter, Select all, shift-range selection, the bulk bar's count, Play all, the
   `fileIds` passed to the addon `folder-actions` slot, and dragging. Undrawn rows are not.
7. The viewer's own actions on a drawn row apply to it as on any row: toggling favorite
   updates the row at once; moving it to the trash or out of the folder scope removes it
   from the continuation.

### 2. Failure cases

- Intelligence down, a non-200 answer, or `available: false` from `/search`: the semantic
  part is empty as today (`fetchSemanticHits` returns `[]`), and the button is not drawn.
- From `/search/images`: a non-200 answer (the core proxy turns the addon's 5xx into
  502) or `available: false` appends nothing and returns the button to its idle state; a
  later click sends exactly one new request. The page tells this apart from an empty
  success.
- A `/search/images` answer that arrives after the search key changed: discarded, never
  stored.
- The drive has no frame above the floor: `/search/images` returns no results, and the
  page removes the button.
- The image model fails to embed the query: the addon answers 503, as
  `/search/scene-segments` does; through the proxy the page sees 502 and takes the
  retryable path above.
- Hydration of `/search/images` is sent to `files/bulk` in batches of at most 500 ids.
  If any batch fails or times out, the addon answers 503 rather than snapshot fields, so
  rows never arrive marked `trust_unknown` and silently vanish under a trust filter.
  `/search` keeps today's snapshot fallback.
- `limit` above 1000 on `/search`: 422 from FastAPI validation.

### 3. States

Continuation, for one search key (query, drive, type, Scene search, sort, order). The
trust filter is not part of the key; it is applied when drawing.

| State | Meaning | Drawn at the end of the list |
|---|---|---|
| hidden | nothing fetched, and a condition in 9 does not hold | nothing |
| offered | nothing fetched, every condition in 9 holds | the button |
| loading | the one `/search/images` request is in flight | the button, busy |
| open | answer stored, some drawable rows not yet drawn | the spinner |
| done | answer stored and every drawable row drawn, or none was drawable | nothing |

The conditions in 9 govern only hidden ↔ offered. Allowed transitions:

- hidden → offered and offered → hidden as the conditions in 9 change.
- offered → loading on click.
- loading → open on success with drawable rows; loading → done on success with none;
  loading → offered on failure.
- open → open when the end of the list is in view (100 more drawn); open → done when the
  last are drawn.
- any state → hidden, with the stored answer dropped and any in-flight answer discarded,
  when the search key changes.

A refresh of the list (`reset()` after a `drive.structure_changed` or `drive.file_updated`
event, or a `refreshKey` bump) keeps the stored answer and the state. While the filename
pages are reloading or have more pages, no continuation row is drawn; once they are
complete, the rows are drawn again, deduplicated against the reloaded list, up to the
count already revealed.

Not allowed: a second request while loading; any request from hidden, open or done; a
transition from open or done back to offered for the same search key.

### 4. Data read and written

- Read: intelligence `search.db` (`vec_clip` `clip_thumbnail` partition, `embeddings`,
  `indexed_files`); core files through the Internal API bulk hydration.
- Written: nothing by either endpoint.
- Frontend: the continuation lives in component state only. The search page keeps no
  snapshot today (`FolderBrowser.tsx` skips it for search), and this change adds none.

### 5. External services

- The core's `POST /api/internal/files/bulk`, called by `hydrate_files` for both
  endpoints, now with up to 1000 ids for `/search` and 2000 for `/search/images` (in
  batches of at most 500). For `/search` a failure or timeout falls back to snapshot
  fields as today; for `/search/images` it answers 503 (2).
- The image model runs inside the intelligence container.

### 6. Authorization

`/search/images` is a manifest route with `pre_check: {type: addon_feature, feature:
search}` and `response_filter: {type: current_drive_only, array_path: results,
drive_field: drive}`, the same as `/search`. The drive comes from `X-Lit-Drive`, validated
by the core's addon proxy against the viewer's accessible drives. A locked or unknown
drive, or a drive whose `search` feature is off, answers 404.

### 7. Effect on existing features

- `GET /search` callers with `limit` ≤ 50 (the header search popup asks for 8, MCP
  `semantic_search` defaults to 20) see the same results as today, since the image
  channel's depth stays 50 for them.
- MCP `semantic_search` with `limit` 51 to 100 may now return more image matches. Its
  schema is not changed.
- Recall mode (Ask, Find) and Scene search keep a depth of 50.
- `search.max_limit` default rises from 100 to 1000 in `SearchConfig`, and the explicit
  `max_limit: 100` line in `search-config.yml.example` is removed so the default applies.
  An existing `search-config.yml` copied from the old example still says 100 and keeps
  it: its first list ends at 100, and the continuation still reaches everything after it,
  since it skips what is shown rather than starting at a rank.
  `docs/getting-started/upgrading.md` tells the operator to delete that line to get the
  deeper first list. Production is updated this way by hand at deploy.
- `/search/compare`, `/search/scene-segments`, `find_similar` and the header popup are
  untouched.
- The justified image grid holds its last line while the continuation is loading or open,
  as it does while filename pages remain (`moreMayFollow`), and yields to an active text
  filter as today.

### 8. Error behavior

The viewer sees no error text; a failed continuation leaves the button to click again. The
addon logs `Search images failed: <error>` at ERROR and answers 500, as `/search` does for
its own failures.

### 9. User-visible behavior

- On the search page, a search for a subject with many pictures lists them past the first
  50, up to where the cutoff ends (at most 1000 results from `/search`).
- **Show more by similarity** (ja: **似ている順にさらに表示**) is drawn after the last
  result when all of these hold: the query has text and no operators, the intelligence
  addon is available for the drive, Scene search is off, the sort is **Relevance**, the
  filename results have no more pages, the semantic results have arrived (1. step 2), and
  they hold at least one result with a `clip_thumbnail` match. The last condition keeps
  the button off a drive with no pictures, where it could add nothing.
- Appended results are ordinary rows with the **Thumbnail** badge, in descending
  similarity, below everything else. Once drawn they behave like the rows above them (1,
  step 6). The results heading count does not include them.
- The button is a secondary button (DESIGN.md *Buttons*, the default variant), centred
  below the list in grid and list view; while busy it is disabled. The loader is the
  existing end-of-list spinner.
- Changing the query, type, Scene search, sort or order removes the appended results. A
  refresh of the list does not; the appended rows reappear once the reloaded list is
  complete. Changing the trust filter re-filters them without a new request.
- The header search popup, Ask, Find and Scene candidates do not change.

### 10. Non-functional

Times are measured on production, warm: the same request run a second time in a row, so
the model and the pages of `search.db` are loaded.

- `GET /search` with `limit=1000` on the photos drive answers within 1.5 s.
- `GET /search/images` on the photos drive (3,757 frames) answers within 3 s, hydration
  included, and on a drive of 20,000 frames within 6 s.
- `/search/images` returns at most 2000 results. The page renders 100 appended rows at a
  time. The first list is rendered at once, as filename results are today; R-5 records
  how long the search page takes to settle with about 1000 rows on a desktop browser.
- The hydration of up to 2000 ids fits within `hydrate_files`' own timeout; when it does
  not, `/search` falls back to snapshot fields and `/search/images` answers 503. Both
  manifest routes set `"timeout": 30`, as the other search routes do, so a cold request is
  not cut at the proxy's 15 s default.
- Privacy: nothing new leaves the container, and both endpoints stay within the request's
  drive.

## Touch points

- `addons/intelligence/app/search.py`: the depth `search()` passes to `_vector_search_clip`
  in precision mode with Scene search off; a new function behind `/search/images`.
- `addons/intelligence/app/routers/search.py`: `limit` upper bound of `/search` (1000);
  new route `GET /search/images`.
- `addons/intelligence/app/schemas.py`: `SearchResponseModel` reused unchanged.
- `addons/intelligence/app/file_hydrate.py`: called, not changed.
- `addons/intelligence/app/config.py`: `SearchConfig.max_limit` default.
- `addons/intelligence/search-config.yml.example`: `max_limit`.
- `addons/intelligence/manifest.json`: route `/search/images` with the `pre_check` and
  `response_filter` of `/search` and `"timeout": 30`; the `/search` route also gets
  `"timeout": 30`, since it now hydrates up to 1000 ids.
- `addons/intelligence/tests/test_search_knn_partition.py` (SPEC-ADDON-025 I1) and
  `addons/intelligence/tests/test_search_clip_score_gates.py` (SPEC-ADDON-044 I9):
  updated to the revised sentences below in the same addon commit; new tests for 046 and
  055.
- `frontend/src/lib/semanticSearch.ts`: a fetch for `/search/images`.
- `frontend/src/lib/searchMerge.ts` (`buildMatchMeta`, `fileItemFromHit`): called, not
  changed; appended rows are built through them.
- `frontend/src/components/FileGrid.tsx` (`moreMayFollow`): called, not changed; the held
  last line still yields to an active text filter, as today.
- `frontend/src/components/folder/useFolderFiles.ts`: semantic `limit` 1000; continuation
  state, dedup, reset, reveal.
- `frontend/src/components/folder/FolderContent.tsx`: the button below the sentinel, and
  the continuation rows in the list.
- `frontend/src/components/FolderBrowser.tsx`: passes the continuation through to
  `FolderContent`.
- `frontend/src/messages-core/ja.json`, `en.json`: the button label.
- `docs/user-guide/search.md`: one sentence under *Searching by meaning*.
- `docs/addons/intelligence.md`: `/search/images`, the `limit` bound, `max_limit`.
- `docs/getting-started/upgrading.md`: delete `max_limit: 100` from an existing
  `search-config.yml` to get the deeper first list.
- Rules passed through: `.claude/rules/design-decisions.md` (drive is a security
  boundary; addon drive-scope context propagation; proxied routes close with 404 when the
  policy is off), `.claude/rules/frontend-conventions.md` (translation files, DESIGN.md).
- The button's place below the grid and the held last line are checked in a real browser
  (R-5), since jsdom does not lay out.
- No protected path is edited. The addon change is merged in the intelligence repository
  first, then the core moves the `addons/intelligence` gitlink.

## Invariants

I1. With `limit` ≤ 50, `GET /search` returns the same results in the same order as before the change for the same index and query; `limit` 1000 is accepted and 1001 answers 422.
I2. In recall mode, and with `include_scene_clip=true`, the image channel takes at most `rrf_candidates` frames, whatever `limit` is.
I3. For a `/search` request without `type`, in precision mode with Scene search off, every active file of the drive whose representative frame is among the 4,096 nearest `clip_thumbnail` rows and scores at or above both `min_score_clip_thumbnail` and the drive's best surviving score minus `score_cutoff_margin` is in the response, as long as the response holds fewer than `effective_limit` results; with no `max_limit` configured, `effective_limit` is the requested `limit` up to 1000.
I4. `/search/images` returns only active files of the request drive and of the requested `type`, each with a `clip_thumbnail` frame scoring at or above `min_score_clip_thumbnail`; they are exactly the drive's top 2000 such files by that frame's cosine, whatever other drives' frames score, in non-increasing order with ties by `file_id`.
I5. Each `/search/images` result has the `score`, `match_types` and segment that `/search` in precision mode gives a file whose only match is that frame.
I6. Through the core's addon proxy, `/search/images` answers 404 for a drive the viewer cannot access and for a drive whose `search` feature is off; on the addon's own route it answers 503 when the query cannot be embedded or a hydration batch fails.
I7. The search page asks `/search` for `limit=1000`. The button is drawn only in offered and loading, offered requires every condition in 9, and no `/search/images` request is sent before the click, while one is in flight, or after an answer was stored for the same search key.
I8. With the text filter off, every drawable row drawn and the filename pages complete, each file `/search/images` returned that passes the trust filter appears on the page exactly once, either above the continuation or in it, and the continuation rows follow every other row in the endpoint's order.
I9. Storing an answer, drawing more of it, or a refresh of the list leaves the order and count of the rows above the continuation unchanged by it, and the results heading count never includes continuation rows.
I10. On success the first 100 drawable rows are drawn without a scroll; each further reveal draws at most 100; and while filename pages are reloading or remain, no continuation row is drawn.
I11. A failed `/search/images` answer stores nothing and draws nothing, the button is clickable again, and the next click sends exactly one request. An answer for an earlier search key is never stored, and changing the search key leaves no continuation row on the page.
I12. Select all, shift-range selection, the bulk bar's count, Play all and the addon `folder-actions` `fileIds` include drawn continuation rows and no undrawn one, and the text filter matches only drawn rows.
I13. Toggling favorite on a drawn continuation row changes that row's star at once, and moving it to the trash removes it from the page.
I14. Neither endpoint writes to `search.db` or to the core database.

## Revises

SPEC-ADDON-025 I1. With Scene search off and a requested drive, and with thresholds and margin that let every row through, `_vector_search_clip` returns the `min(D, N)` nearest `clip_thumbnail` matches of active files in that drive, and no `clip` match. D is the depth `search()` passes: `max(effective_limit, rrf_candidates)` in precision mode, `rrf_candidates` in recall mode. N is the number of such rows among the 4,096 nearest `clip_thumbnail` rows. This holds however many `clip` rows, other drives' thumbnails or inactive files' thumbnails are nearer to the query.
SPEC-ADDON-044 I9. `search(q, limit=100, drive=D)` with Scene search off, over a drive holding 60 thumbnails inside a 0.01 band above the floor and no other match, returns all 60 of them, and `search(q, limit=50, drive=D)` returns the 50 nearest. With one keyword match on another file of the drive, `limit=100` returns 61 results, the keyword match first.

## Checked, no action

- **Text and keyword channels keep their 50-candidate depth.** They have the same cap,
  but A1 is about pictures and only pictures were measured. Measure documents and
  transcripts before changing them.
- **Auto-tag suggestions as search keywords.** The 382 penguins are found exactly by the
  pending suggested tags, which are LLM output like `retrieval_keywords`. Indexing them as
  retrieval keywords is a separate unit, not part of this spec.
- **A tuned or per-query threshold.** Measured above: no single threshold fits, so the
  cutoff stays as it is and the continuation is the viewer's choice.
- **Scene search continuation.** Scene frames are many per video and already have Scene
  candidates; Scene search keeps today's depth and draws no button.
- **The header search popup and MCP.** The popup shows 8; MCP keeps its schema. Neither
  gets a continuation.
- **Server-side paging.** The continuation is one request of at most 2000 results and is
  revealed client-side 100 at a time; paging would need offsets that shift with dedup and
  with index changes, for sizes that fit one response.
- **The first list's 4,096-row window.** `/search` keeps today's widening fetch. A frame it
  misses because other drives' frames are nearer is reached by the continuation, whose
  ranking is exact over the drive.
- **Restoring the search page on Back.** The search page keeps no snapshot of its own and
  does not restore its scroll position; it can only start from the header popup's short
  cache. The continuation is not restored either.
- **The core calls the intelligence endpoint directly.** `semanticSearch.ts` already
  does this for `/search`; the continuation is one more call of the same kind.
- **The results heading count.** The continuation is open-ended by design, so it is not
  counted.
