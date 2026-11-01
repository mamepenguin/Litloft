# Image matches survive the score gates of precision search

SPEC-ID: SPEC-ADDON-043
SPEC-ID: SPEC-ADDON-044

Approval:

## Summary

A viewer searches a drive for something it clearly holds and gets nothing. On production,
"ペンギン" in the photos drive returns 0 results although 382 of its 3,758 pictures carry a
suggested ペンギン tag and rank at the top of the CLIP channel. Two stages of precision
search (`GET /search`, the search page and popup, MCP `semantic_search`) cause this:

- **The gap and coefficient-of-variation checks** in `_vector_search_clip` discard every
  candidate when the top score does not stand out from the mean of the 50 nearest. A
  subject with many pictures has a flat top 50 because all 50 are true matches. "ペンギン"
  scores 0.2036 to 0.1945, a gap of 0.0057 against the threshold of 0.02. The check keeps
  unrelated words instead: "量子力学" has a gap of 0.0471 and returns 20 pictures.
- **The combined score cutoff** in `_build_results` drops results below half the top
  score. An image match scores about 0.14 (0.7 × a cosine near 0.2), and the top keyword hit
  scores 0.3. So one document containing "flower" removes every picture of a flower from the
  result list.

This change removes the first for the CLIP channel (**SPEC-ADDON-043**) and exempts image
matches from the second in precision mode (**SPEC-ADDON-044**). It is for the viewer
searching their own pictures. The cost is deliberate: a search that used to narrow to a
few files now also lists image matches, usually below them.

"Image match" here means a result with a CLIP match: a picture's or a video's representative
frame (`clip_thumbnail`, the **Thumbnail** badge) or, with Scene search on, a video frame
(`clip`, the **Visual** badge).

The user decided the scope on 2026-11-01, including the cutoff exemption, after seeing the
measurements below. The benchmark drives are the photos drive on production and the local
test image drive. The production main and videos drives are auxiliary, for the other media
types.

### Measurements

Measured on 2026-11-01 by running `search()` read-only over the real indexes, in a process
of its own, with the stages disabled in memory. The query sets:

- **POS**: the 20 most frequent suggested tags of the drive, leaving out 画像, 写真, 屋内, 屋外,
  動画, 風景, 人物 and テキスト, or the 20 most frequent caption nouns on the test image drive,
  which has no suggested tags. Words the user named are added: ペンギン, penguin, 水族館, 動物園,
  犬, 花, 猫, 海 on photos; カレー, パスタ, ケーキ, 味噌汁, 魚, 肉 on main; ピカチュウ, ポケモン,
  イラスト on videos.
- **NEG**: 量子力学, 確定申告, 請求書, 恐竜の化石, 住民票, quantum mechanics.
- **KW**: ten frequent filename tokens. **Known item**: up to 15 strings sampled from the
  stored text of each embedding type.

A hit is a top-20 result whose tag or caption contains the query.

| Drive, query set | Stage | Zero-result queries | Hits in top 20 | Baseline top 20 kept | Image-only results in top 20 |
|---|---|---|---|---|---|
| photos, POS (28) | today | 16 | 122 | | 220 |
| | 043 only | 0 | 297 | 221/221 | 544 |
| | 043 + 044 | 0 | 309 | 221/221 | 559 |
| test images, POS (20) | today | 0 | 16 | | 30 |
| | 043 only | 0 | 16 | 255/255 | 30 |
| | 043 + 044 | 0 | 102 | 255/255 | 148 |
| main, POS (26) | today | 0 | 187 | | 60 |
| | 043 + 044 | 0 | 248 | 386/395 | 166 |
| videos, POS (23) | today | 2 | 171 | | 20 |
| | 043 + 044 | 0 | 213 | 352/360 | 120 |
| main, NEG (6) | today | 0 | | | 20 |
| | 043 + 044 | 0 | | 50/50 | 90 |
| videos, NEG (6) | today | 0 | | | 20 |
| | 043 + 044 | 0 | | 39/39 | 93 |

The 2% of baseline results lost from the top 20 on main and videos are displaced by files
that gained a CLIP match on top of a keyword match, and so rose. Those files also raise the
top score, so a low-ranked non-image result can fall below the cutoff and leave the list: 1 of
1,125 baseline results on main and 9 of 856 on videos for POS, none on photos or test images,
and none for NEG or KW. The alternative of judging non-image results only against each other
loses 1 on each of main and videos, but adds 87 weak text and keyword results that today's
cutoff removes, with the same hits and the same top 20 kept.

Known items: the source file's rank did not move on any drive (found, top 5 and top 20
counts are identical to today). The median result count of those queries rises from 1-15
to about 50 on most embedding types, which is the cost named above.

With Scene search on, the photos drive goes from 5 zero-result queries of 8 to 1, and its
hits from 10 to 38. "ペンギン" goes from 0 results to 45.

## Required items

### 1. Normal flow

SPEC-ADDON-043 (CLIP channel):

1. `search()` or `execute_search_compare` calls `_vector_search_clip`, as today, with
   Scene search on or off and in either mode.
2. The KNN runs as today (SPEC-ADDON-025).
3. No gap or coefficient-of-variation check runs on the returned scores. Whether they
   stand out from each other no longer decides anything.
4. The per-type floors (`min_score_clip`, `min_score_clip_thumbnail`) and the margin
   cutoff (`score_cutoff_margin`, or the recall margin in recall mode) apply as today.

SPEC-ADDON-044 (combined cutoff):

1. `_build_results` applies the filters and sorts by score, as today.
2. In precision mode, `top_score` is the highest score of all results, those with a CLIP
   match included, as today. A result is dropped when its score is below
   `top_score * score_cutoff_ratio` **and** its `match_types` contain neither `clip_thumbnail`
   nor `clip`.
3. In recall mode, every result below the ratio is dropped, as today.
4. `limit` truncates the sorted list, as today.

The text channel (`_vector_search_text`) keeps its gap and coefficient-of-variation checks
and `search.score_gap_threshold` keeps its meaning there.

### 2. Failure cases

No new failure. A failed CLIP embedding leaves the channel out as today, so no result has
a CLIP match type and the cutoff applies to all of them. A failed KNN raises as today, and
`GET /search` answers 500.

### 3. States

None. Search keeps no state, and neither stage has one.

### 4. Data read and written

Reads `vec_clip`, `embeddings` and `indexed_files` as today. Nothing is written, and there
is no migration. `search.score_gap_threshold` in `search-config.yml` stays valid and now
acts on the text channel only.

### 5. External services

None. The query is embedded locally as today.

### 6. Authorization

Unchanged. The drive filter runs in `_drive_thumbnail_neighbours` and `_build_results`.
Access to a drive is enforced by the core's addon proxy and `require_drive`.

### 7. Effect on existing features

- **Search page and popup**: receive more image hits. In relevance order
  `computeHybridScore` in `frontend/src/lib/searchMerge.ts` ranks them, and a CLIP-only hit
  stays low because its score is a cosine near 0.2 weighted 0.8. The page asks for 50 results
  and the popup for 8, so weak hits can fill the popup's slots when there are fewer than 8
  strong matches. On the page, filename matches loaded by later pages are merged above image
  hits already shown, so with more of them on screen more results visibly move. The merge
  logic does not change.
- **MCP `semantic_search`**: uses `GET /search`, so it sees the same results and keeps its
  tool text. In `recall` mode it does not change.
- **Ask, Find and evals**: call `search()` in recall mode. The gap check is already off
  there and SPEC-ADDON-044 does not apply, so their results do not change.
- **`GET /search/compare`**: its lists go through `_vector_search_clip` and, in `_build_results`'s
  default precision mode, the exemption, the RRF list included. This is deliberate: it is a
  diagnostic of the same two functions, so no separate invariant covers it.
- **`find_similar`** and **`/search/scene-segments`**: have their own filters and do not
  call these stages. No change.
- **Existing tests** in `addons/intelligence/tests/test_search_knn_partition.py`, under the
  `Revises` section below:
  - Replaced by tests of the opposite under SPEC-ADDON-043:
    `test_spec_addon_025_a_thumbnail_set_without_a_standout_is_discarded_by_the_gap_check`,
    `test_spec_addon_025_a_thumbnail_set_whose_spread_is_below_the_cv_cutoff_is_discarded`,
    `test_spec_addon_025_gap_check_judges_the_drives_active_thumbnails_not_far_rows_of_other_files`,
    `test_spec_addon_025_cv_check_judges_the_drives_active_thumbnails_not_far_rows_of_other_files`.
  - Removed, because the clause it tests no longer exists and I2 covers the flat set with Scene
    search on: `test_spec_addon_025_scene_on_gap_check_counts_every_row_the_knn_returned`.
  - Kept as they are, because the margin and the floor still decide their outcome:
    `test_spec_addon_025_a_flat_crowd_of_other_files_nearer_does_not_discard_the_drives_standout`,
    `test_spec_addon_025_scene_off_matches_for_a_drive_do_not_depend_on_other_drives_thumbnails`.

### 8. Error behavior

| Failure | The viewer sees | Logged |
|---|---|---|
| CLIP embedding fails | Results without image matches and no message, as today. A search that only image matches could answer returns nothing. | `CLIP text embedding failed` warning, as today |
| KNN fails | The page and popup show the filename results only, because `fetchSemanticHits` turns a 500 into no hits, as today | `Search failed` error, as today |

The debug log lines for the CLIP gap and coefficient-of-variation checks go away with the
checks.

### 9. User-visible behavior

- A search for a subject with many pictures returns them instead of nothing.
- A search with keyword or text matches also lists image matches, up to the 50 candidates
  of the channel, with the **Thumbnail** badge, or **Visual** for a video frame with Scene
  search on. `GET /search` and MCP order them by the combined score, and the page and popup in
  relevance order by `computeHybridScore`. In both, a CLIP-only hit usually comes after the
  other matches, because of its low cosine, but this is not guaranteed for weak keyword
  matches. Other sort orders mix them in, as they mix every result.
- A search with few exact matches shows a longer list. An unrelated word on a drive with
  pictures returns pictures, which already happens today on the photos drive.
- Other results keep their relative order, except where a file that gained a CLIP match
  rises. A low-ranked non-image result can leave the list when such a file raises the top
  score, which is the loss measured above.

`docs/user-guide/search.md` gains a sentence saying that pictures and video frames found by
how they look can be only loosely related and, in relevance order, usually come after other
matches, so that a viewer does not take them for a bug. `docs/addons/intelligence.md` gains
one saying that CLIP matches are exempt from the combined cutoff.

### 10. Non-functional

- Time: removes arithmetic and adds a set test per result. Result counts stay capped by
  `limit` and by the 50 candidates per channel, so the largest response is one that
  already occurs today (for example "自然" on the photos drive returns 50). R-5 records
  `GET /search` time for a query that grows, against the same query on the build before this
  change. The record is informational: a median above 1 s on the second request goes to the
  human, and no other number fails it.
- Privacy and cost: no outside call, and no new data leaves the drive.

### Verification on the benchmark drives

**Test image drive, in the running application (R-5).** The bug reproduces there with "photo",
"picture", "small" and "middle", where the gate discards every CLIP candidate with Scene search
off (4 of 173 words scanned), and "dog" with Scene search on. R-5 reads `source_counts.clip_vector`
of `GET /search/compare?q=photo` on the build before and after the change (0, then at least 1),
and checks that `GET /search?q=flower` lists image matches where it listed none.

R-5 also reads `GET /search?q=dog&include_scene_clip=true` on both builds: no result with a
CLIP match before, and at least one after.

**Production drives, before the addon PR merges.** `benchmark.py` runs inside the running
intelligence container on production, through `docker compose exec`. It opens `search.db` with
SQLite's `mode=ro` and runs no migration. In one run, over the same index and the same queries,
it loads develop's `search.py` as the baseline and the branch's `search.py` as the candidate.
The query sets are derived from the index as described above, with a fixed random seed. It prints
counts, and for the videos drive no query text. Results go in `decisions.md`, in the core PR. The
bar, with Scene search off unless the row says otherwise:

| Drive | Pass |
|---|---|
| photos, POS | No zero-result query, and more hits than the baseline |
| photos, POS, Scene search on | Fewer zero-result queries and at least the hits of the baseline |
| main, POS | At least the baseline's hits, and at least 95% of its top 20 kept |
| videos, POS | No zero-result query, and at least 95% of the baseline's top 20 kept |
| All | Known items: the same top-5 count as the baseline |

A miss stops the addon merge and goes to the human. After the core PR deploys, "ペンギン" is
searched once through `GET /search` on the photos drive. If that returns nothing or fails, the
author stops and reports to the human, and nothing is reverted automatically.

## Touch points

- `addons/intelligence/app/search.py`: `_vector_search_clip` and its docstring, `_build_results`.
- `addons/intelligence/app/config.py`: the comment on `score_gap_threshold`.
- `addons/intelligence/tests/test_search_knn_partition.py`: the tests named under item 7.
- `addons/intelligence/tests/test_search.py`, `test_search_file_kind_filter.py`: read as
  the existing checks of `_build_results` and its filters.
- `docs/user-guide/search.md`, `docs/addons/intelligence.md`.
- `docs/specs/INDEX.md`, this spec. The addon PR merges first, then the core PR carries the
  gitlink bump, the docs and the records.
- `docs/process/reviews/feature-clip-score-gate-removal/benchmark.py`: the read-only benchmark
  above, and `decisions.md` beside it for its results.
- The `addons/intelligence` gitlink in the core repository, bumped after the addon's merge.
- Rules passed through: `.claude/rules/design-decisions.md`, Drives (a drive is a security
  boundary) and LLM features (Ask); `.claude/rules/backend-conventions.md`.
- Endpoints whose results change: `GET /search`, `GET /search/compare`. Their shapes do not.
- No protected path is edited, and no table, event or workflow changes.

## Invariants

I1. In precision mode with Scene search off, thumbnails above the floor and inside the
margin are returned when the gap between their top score and their mean is below
`search.score_gap_threshold`, and when that gap is above it but their coefficient of
variation is below 0.01.
I2. In precision mode with Scene search on, thumbnails and scene frames above their floors
and inside the margin are returned under both score shapes of I1.
I3. `_vector_search_clip` still drops a row below its type's floor and a row more than the
margin below the best surviving score, in both modes and with Scene search on or off.
I4. `_vector_search_text` in precision mode still returns nothing for a flat set of scores,
judged by `search.score_gap_threshold` and the coefficient-of-variation cut-off 0.01.
I5. In precision mode, `_build_results` returns a result whose `match_types` contain
`clip_thumbnail` or `clip`, alone or beside another type, although its score is below
`top_score * score_cutoff_ratio`, and drops a result below that value whose `match_types`
contain neither. `skip_cutoff=True` keeps every result, as today.
I6. In recall mode, `_build_results` drops a result below `top_score *
_RECALL_PARAMS.score_cutoff_ratio` whatever its `match_types`, so `search()` in recall mode
returns the same files and scores for the same index as before this change.
I7. The results of `_build_results` are sorted by descending score, and `limit` truncates them
after the cutoff, so an exempted result never precedes a result with a higher score and a
result above the cutoff is never lost to an exempted one with a lower score.
I8. An exempted result is still subject to the `drive`, `file_type` and `file_id_scope`
filters, and to the active-file filter, with Scene search on or off: `search()` returns no
such file of another drive, of another type, outside the scope, or inactive.
I9. `search(q, limit=100, drive=D)` with Scene search off, over a drive holding 60 thumbnails
inside a 0.01 band above the floor and no other match, returns the 50 nearest of them. With
one keyword match on another file of the drive it returns 51 results, the keyword match first.
I10. `top_score` in `_build_results` is the highest score of all results: a keyword-only result
below `ratio` × the score of a file holding a keyword and a CLIP match is dropped.
I11. `benchmark.py` writes nothing to `search.db`, whose open fails on any write because of
`mode=ro`, and its output for the videos drive contains no query text.

## Revises

SPEC-ADDON-025 I3. The CLIP channel's discard stages use the configured values: in precision mode `search.min_score_clip_thumbnail` / `search.min_score_clip` and `search.score_cutoff_margin`, in recall mode the same per-type floors and the `_RECALL_PARAMS` margin. No gap or coefficient-of-variation check runs on the CLIP channel.

## Checked, no action

- **Removing the text channel's gate as well.** Measured and rejected. With it off, the
  baseline top 20 kept falls to 153/395 on main, 135/360 on videos and 93/255 on test
  images, and hits fall on main (187 to 128) and videos (171 to 153). Weak text matches
  score above 0.6, which also removes image matches through the cutoff. It would find more
  known items on some embedding types (videos `metadata` 6 to 15 of 15), so it may be worth
  its own spec, but it is not this change.
- **Exempting every result from the combined cutoff.** Measured. It adds weak text and
  keyword results as well, for little gain over this change (test images 99 hits against
  102, main 257 against 248). The exemption names what the cutoff misjudges: cosines near
  0.2 cannot be compared with keyword scores.
- **CLIP-family models.** Measurements and the cosine reasoning are for the default SigLIP2
  model. With a CLIP-family model and a floor of 0.20 nothing was measured. The rules do not
  depend on the model.
- **The ordering of weak image matches outside relevance order.** A viewer who sorts by date
  sees them mixed in. Keeping them last would need a rank tier that no other match type has.
- **Copying the exemption's reason to the RRF list of `GET /search/compare`.** Its scores are
  not cosines, so the reason does not strictly apply there. It is a diagnostic, and giving it
  a mode of its own would make it stop showing what the search does.
- **Surfacing a failed CLIP embedding to the viewer.** It stays a logged warning, as today.
- **A replacement noise filter for image matches.** None was found. Absolute scores do not
  separate relevant from unrelated ("請求書" 0.1887, "猫" 0.1663, "犬" 0.1345). The floor and
  margin stay as they are.
- **The 50-candidate limit.** The photos drive holds 382 ペンギン pictures and shows at most
  50. Raising `rrf_candidates` changes every channel, and paging search results is a feature
  of its own. Requested by nobody yet.
- **Many keyword matches pushing images off the page.** "car" on the test image drive has 31
  document matches, so with a limit of 20 no image reaches the top 20 (the page asks for 50).
  The ranking between image matches and keyword matches is left as it is.
- **Scene search candidates crowded out by other drives.** With Scene search on, the KNN spans
  every drive and the drive filter runs later. In the photos drive "自然" keeps 1 row of 50.
  SPEC-ADDON-025 left this as is, and fixing it costs a full scan per partition. This change
  still helps there: more of the rows that do belong to the drive survive.
- **Searching BLIP captions or suggested tags.** Captions contain "penguin", and suggested
  tags are unapproved by design (`design-decisions.md`, LLM features). Making them searchable
  is a separate feature.
- **Removing `score_gap_threshold` from the configuration.** The text channel still reads it.
- **Documentation of the removed check.** No page under `docs/` describes it.
