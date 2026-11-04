# Search results by passage

SPEC-ID: SPEC-ADDON-048
SPEC-ID: SPEC-CORE-040

Approval:

## Summary

The search results page lists files. A file that matched in many places shows at most
three timestamp pills, its PDF pages or chapters, and one two-line snippet
(`buildSearchSnippet`), so a viewer who wants the place where something was said or
written has to open files one by one. This change adds a second view of the same search,
**Passages**: every place the search found, across files, in order of relevance. A row
is one passage: a stretch of speech, a PDF page, the text read from a picture, an EPUB
chapter, or, with Scene search on, a scene. It shows a frame or the file's thumbnail, the
place (time range, page, chapter), the file name and the stored excerpt in full. Clicking
the row opens the file at that place.

- **SPEC-ADDON-048**: intelligence's `GET /search` accepts `passages=true` and then adds a
  `passages` list to each result: one entry per distinct place among that file's matches,
  with its own kind, location, `chunk_index`, excerpt, score, whether a keyword search
  matched it, the terms to highlight, and a frame URL for video places. Without
  `passages=true` the response is unchanged.
- **SPEC-CORE-040**: the results page gets a 「ファイル / 箇所」 `SegmentedControl` under the
  query field, kept in the URL as `show=passages`; the Passages view renders the passages
  of the same search answer, grouped by file where the file first appears, at most three
  per file, with 「このファイルの他の箇所 N 件 →」 for the rest and a count line
  「N ファイル・M 箇所」.

Decided by the user on 2026-11-04 and not reopened here (design artifact
https://claude.ai/artifact/CzzLaQkAcQyP1X6KaSi47h): a 「ファイル / 箇所」 SegmentedControl
under the query field, the choice in the URL and not per user; both views come from one
search; passages are listed across files by relevance; the kinds are utterances (frame
and time range), PDF pages, picture text, EPUB sections (chapter title); each row shows the
locator, the file name and the stored excerpt in full, with no reindex; clicking opens the
file at that time, page or section; same-file passages are grouped where the file first
appears, at most 3, then 「このファイルの他の箇所 N 件 →」; the count line
「N ファイル・M 箇所」 and no scores; only keyword-matched words are highlighted and a
semantic-only passage has none; scenes appear only when Scene search is on; nothing past
the margin cutoff in v1; the phone layout as in the artifact.

This spec builds on `docs/specs/filtered-semantic-search.md` (SPEC-CORE-039 /
SPEC-ADDON-047, "A2"), which merges first: the results page heading becomes an editable
query field with operator chips, and `/search` takes a `filter`. Where this spec says
"the query field" and "the chip row" it means A2's.

## Required items

### 1. Normal flow

Terms. *Hit*: one `SearchResultItem` of `/search`. *Match*: one entry of a hit's
`segments[].matches[]` as today, which is one internal `MatchInfo`. *Place*: what a
passage points at, defined per kind in step 3 below. *Keyword channel*: `fts_transcripts`
or `fts_text_content`; *vector channel*: `vec_text` or `vec_clip`.

SPEC-ADDON-048, `/search`:

1. `GET /search` accepts an optional `passages` boolean (default false). Every other
   parameter, A2's `filter` included, keeps its meaning; `passages` changes neither which
   files are returned, nor their order, scores, `match_types` or `segments`.
2. With `passages=true`, each hit carries `passages: [SearchPassage]`. Without it the
   response has no `passages` key at all.
3. A hit's matches become passages by kind; the kind is decided by the addon from the
   match type and the indexed file:

   | Kind | From matches of type | Place (identity) | Location fields |
   |---|---|---|---|
   | `utterance` | `whisper` (text vector), `transcript` (keyword) with a start time | `(timestamp_start, timestamp_end)` | `start`, `end` |
   | `scene` | `clip` (scene frame; present only with `include_scene_clip=true`) | `timestamp_start` | `start`, `end` |
   | `section` | `text_content` of an EPUB (`EPUB_MIME`) whose `page` is set | `chunk_index` | `section`, `section_title` |
   | `page` | `text_content` of any other file whose `page` is set | `chunk_index` | `page` |
   | `picture_text` | `text_content` of a file whose `file_type` is `image` | `chunk_index` | none |
   | `text` | any other `text_content` | `chunk_index` | none |

   Matches of type `metadata`, `clip_thumbnail`, `vision_description`,
   `retrieval_keywords` and `blip_caption`, a `transcript` match without a start time,
   and a `text_content` match without a `chunk_index` make no passage. A passage is never
   made from a file-level match.
4. Matches of one hit with the same kind and the same place merge into one passage. A text
   vector match and a keyword match of the same transcript chunk carry the same start and
   end (both are written from the same chunk list in `workers/whisper.py`), and a text
   vector match and a keyword match of the same text chunk carry the same `chunk_index`
   (`workers/metadata.py`, `workers/ocr.py`).
5. To make 3 and 4 possible, a keyword transcript match carries the transcript chunk's
   `chunk_index` (the `fts_transcripts` row has it), and every keyword match keeps the
   full stored text of its FTS row besides the 200-character `text` it has today. These are
   internal fields; the wire `segments` are unchanged.
6. `SearchPassage` is
   `{ kind, start: float|null, end: float|null, page: int|null, section: int|null,
   section_title: str|null, chunk_index: int|null, text: str, score: float,
   keyword: bool, highlight_terms: [str], frame_url: str|null }`:
   - `chunk_index`: the text chunk's index for `section` / `page` / `picture_text` /
     `text`; the transcript chunk's index for an `utterance` when a keyword match supplied
     it, else null; null for `scene`.
   - `score`: `alpha × v + (1 − alpha) × k`, the formula `_combine_scores_cosine` uses for a
     file, applied to the passage's own matches: `v` the best vector score among them
     weighted by the same `type_weight_*` the file score uses, `k` the best keyword score
     among them, each 0 when absent. Rounded to 4 places like the other scores.
   - `keyword`: true exactly when a keyword-channel match is among the passage's matches.
   - `highlight_terms`: for a keyword passage, the strings the FTS query was built from —
     each whitespace-separated query term with its hiragana and katakana variants, as
     `_build_fts_query` makes them, deduplicated; `[]` for every other passage.
   - `text`: for a passage that is not `keyword`, the stored `content_preview` of its
     match, exactly as stored. For a `keyword` passage, the 200-character `text` the
     keyword match has today when an occurrence of a highlight term (compared as in
     step 7 of the core flow) lies wholly inside it; otherwise a 200-character window of
     the FTS row's stored text that starts 40 characters before the first occurrence (or
     at 0), with `…` before it when it does not start at 0 (pending human confirmation).
     `""` for `scene`.
   - `frame_url`: for `utterance` and `scene` passages of a file whose `file_type` is
     `video` and whose mime type is not the `.loft` reference type (`whisper.LOFT_MIME`),
     `/api/addons/intelligence/files/{file_id}/frame?t=<floor(start)>`; null otherwise.
   - `start`, `end`: seconds as stored; a `scene` passage takes the frame's stored
     `timestamp_end`.
7. Within a hit, `passages` is sorted by `score` descending; ties by location ascending
   (`start`, then `page` / `section`, then `chunk_index`).
8. There is no per-file cap. A hit's passages are bounded by the channels: each channel
   returns at most `rrf_candidates` (50) chunks for the whole query, so a response holds at
   most about 200 passages in total, before merging.
9. With A2's `filter`, the channels already rank only within the filter's ids, so the
   passages are those of the filtered hits; nothing else changes. A2 answers
   `include_scene_clip=true` with `filter` with 422, so a filtered query has no scene
   passages.

SPEC-CORE-040, results page:

1. The URL parameter `show` selects the view: `show=passages` is Passages, its absence (or
   any other value) is Files. Files is the default and is the view today.
2. The results page's meaning search (`fetchSemanticHits` from `useFolderFiles`) always
   sends `passages=true`, in both views, so one request feeds both and switching sends
   none. The search modal, Show more by similarity (`/search/images`) and every other
   caller do not send it.
3. The view control is a `SegmentedControl` labelled 「表示」 with the options 「ファイル」
   and 「箇所」, in a row of its own directly under A2's chip row (under the field when
   there are no chips). It is shown only while the page runs a meaning search: a query
   with non-blank text on a drive where `isSemanticSearchAvailable` is true and kinds are
   possible (A2's conditions). Otherwise the control is hidden and the page shows Files,
   leaving `show` in the URL untouched.
4. Choosing an option sets or deletes `show` with `router.replace`, keeping every other
   parameter, and scrolls the result list to the top. FolderBrowser's URL-sync effect
   (`router.replace` on `type` / `sort` / `order`) and A2's submission (`router.push` with
   `q`) keep `show` as they keep `include_scene_clip`.
5. The Passages view takes the hits that the Files view merges for the same answer (those
   in `useFolderFiles`'s `semanticHits` after the type filter the addon applied and the
   trust filter `matchesTrustFilter` applies, which is a no-op on search pages today), and
   lists their passages:
   - Each hit's passages are already sorted (addon step 7). A file's *best score* is the
     score of its first passage. Files with no passage are not listed.
   - Groups are ordered by best score descending; ties by the hit's position in the
     answer. Each group shows its first three passages; when it has more, a line
     「このファイルの他の箇所 N 件 →」 with N = the group's passage count − 3 follows them.
   - Filename-only matches from the listing, and the Show more by similarity
     continuation, are not in this view.
6. Each passage row shows, left to right: a 16:9 picture — `frame_url` with the start time
   overlaid (`formatDuration(start)`), else the file's `thumbnail_url`, else the file-type
   icon; then, stacked: the locator, the file name (from the hydrated file, else the
   hit's `filename`), and the excerpt.

   | Kind | Locator | Excerpt | Opens |
   |---|---|---|---|
   | `utterance` | `formatDuration(start)–formatDuration(end)` | `text` | `/files/{id}?t=<floor(start)>` |
   | `scene` | `formatDuration(start)–formatDuration(end)` | 「映像一致」 (`search.matchClip`), muted | `/files/{id}?t=<floor(start)>` |
   | `page` | 「p.N」 (`search.matchedPages`) | `text` | `/files/{id}?page=N` |
   | `section` | `section_title`, else 「セクション N」 (`search.matchedSectionNumber`) | `text` | `/files/{id}?section=N` |
   | `picture_text` | 「画像の文字」 | `text` | `/files/{id}` |
   | `text` | 「本文」 | `text` | `/files/{id}` |

   The excerpt is shown in full: no line clamp and no client-side cut (the addon bounds
   it at about 200 characters).
7. Highlight: in a passage whose `keyword` is true, every occurrence of any of its
   `highlight_terms` in the excerpt is wrapped in `<mark>`, compared case-insensitively
   (`toLocaleLowerCase` on both sides); where occurrences overlap, the longer term wins and
   marks do not nest. A passage whose `keyword` is false gets no mark, even when its
   excerpt contains a query word.
8. The 「他の箇所」 line is a link to `/files/{id}` (the file, opened at its start). When
   find-in-file (B2) ships, that change points it at the file's find-in-file view with the
   query; until then it opens the file only (pending human confirmation).
9. The count: in Passages, A2's scope position shows 「N ファイル・M 箇所」 on `sm` and
   wider, and 「M 箇所」 below `sm`, with N the number of groups and M the number of
   passages in all groups, the hidden ones included. In Files it stays as today
   (`common.items`).
10. In Passages, the toolbar keeps the type filter (it narrows the addon request as
   today) and hides sort, view mode (grid / list), select and Play all, because none of
   them applies to passages; `sort` and `order` stay in the URL and apply again in Files.
   The `search-results-top` slot (Scene candidates) and the Scene search toggle stay where
   and as they are in both views.

### 2. Failure cases

- The addon is unreachable, answers non-200, or the request fails: in Files nothing
  changes (name matches only, no message, as today). In Passages the list shows the
  failure state (see 8). This needs `fetchSemanticHits` to tell a failure from an empty
  answer, which A2 step 3a already requires; the results page reads that distinction too.
- Hydration failed (`file` null on a hit): rows use the hit's `filename` and the
  `/api/files/{id}/thumbnail` fallback that `fileItemFromHit` already builds; links work.
- A hit without `passages` (an addon older than this change, behind a stale pin): treated
  as no passages; Files is unaffected.
- A frame request fails (ffmpeg error, file gone): the `<img>` falls back to the file's
  thumbnail, then the icon; the row stays.
- The query, type filter, A2 filter or Scene search changes while a request is in flight:
  the previous hits are dropped first (as A2 I7 states for Files), so no passage of the
  previous answer is drawn under the new query.
- `show=passages` while no meaning search runs (blank text, intelligence off for the
  drive, impossible kinds): the control is hidden and Files is shown; the parameter is
  left alone so it applies again when the conditions return.
- A passage's file is trashed or goes missing while the page is open: the row stays until
  the next search, as a hit does in Files today; opening it shows the file page's own 404.

### 3. States

View: `files` and `passages`, from `show`. Transitions only by the control, by Back /
Forward, or by a link carrying `show`. Forbidden: a submission, a type, sort or order
change, or a Scene search toggle changing the view.

Passage list (Passages view only):

| From | To | When |
|---|---|---|
| hidden | loading | Passages selected and a meaning search is pending |
| loading | listed | the addon answered 200 with at least one passage |
| loading | empty | the addon answered 200 with no passage |
| loading | failed | the addon answered non-200 or the request failed |
| failed | loading | 再試行 pressed |
| any | loading | the query text, type, A2 filter or Scene search changes (previous rows dropped first) |
| any | hidden | Files selected, or the meaning search stops applying (step 3 of the core flow) |

Forbidden: `listed` showing rows of a previous answer; `empty` shown for a failure; the
count shown while `loading`.

### 4. Data read and written

- Intelligence: reads what `/search` reads today, plus the full stored text of the FTS
  rows it already fetched (no new query) and `chunk_index` of `fts_transcripts` rows
  (already selected). Writes nothing. The frame route reads and writes its existing
  frame cache under `intelligence_data_dir/frames/`, as for Scene candidates.
- Core: reads nothing new; writes nothing.
- Browser: the URL gains `show`. Nothing in `localStorage`; the modal's search cache is
  untouched (the modal does not send `passages`).

### 5. External services

None outside the Docker network. Frames come from the addon's `/files/{id}/frame` through
the addon proxy, which spawns ffmpeg on a cache miss.

### 6. Authorization

Unchanged. `/search` runs behind the addon proxy's `X-Lit-Drive` validation and the
`search` feature `pre_check`; passages come from the same drive-scoped hits. The frame
route's `file_access` `pre_check` authorises each `<img>` request for the file's drive,
as for Scene candidates. No Internal API endpoint is added or changed.

### 7. Effect on existing features

- `/search` without `passages=true` (the modal, MCP `semantic_search`, Ask, Find, the
  admin compare page): unchanged.
- The Files view: unchanged, apart from the control above the list and the request
  carrying `passages=true` (its answer's existing fields do not change).
- A2's header: unchanged; the control row sits under its chips, and its submissions keep
  `show`.
- Smart Folders save the query as today; `show` is not saved, so a Smart Folder opens in
  Files.
- Scene candidates (`search-results-top`), Show more by similarity, the
  `search-result-actions` slot on Files snippets: unchanged in Files; the first two are
  not part of Passages.

### 8. Error behavior

- Failed (Passages): the list area shows 「箇所を読み込めませんでした」 with a 「再試行」
  button that re-runs the meaning search; the count is hidden. Files shows nothing new.
- Empty (Passages): `EmptyState` `no-results`, with a secondary action 「ファイルで表示」 that
  switches to Files when the Files view has at least one row.
- The addon logs nothing new; a failed search is logged as today (`Search failed`).

### 9. User-visible behavior

Layout (artifact; `DESIGN.md` values):

- Desktop: under the field and chips, the control row starts with the `SegmentedControl`
  (two text segments, `w-48`), selected segment with the accent border (§Selected-state
  controls). Rows sit in one column capped at `max-w-list-row` (§3.6). A row is a grid of
  an 88 × 50 px picture (`rounded-lg`, `object-cover`) and the text column, `gap-3`,
  `py-2.5 px-1.5`, `rounded-xl`, `hover:bg-accent/5`. The locator is `text-xs
  font-semibold text-text-primary`, the file name `text-xs text-text-muted` truncated to
  one line with the full name in `title`, the excerpt `text-[13px] leading-relaxed
  text-text-primary` with §3.5's Japanese line breaking. The time overlay on a frame is
  `text-[10px]` white on `bg-black/55`, `rounded`, bottom right (§Over-video chrome). A
  group ends with a `border-b border-bg-border`; the 「他の箇所」 line is `text-xs
  text-text-muted`, aligned with the text column, `hover:text-text-primary`. Marks use
  `bg-highlight-bg` (§2.2). No accent fill anywhere in the view.
- Below `sm` (390 px): the control and 「M 箇所」 share one row (control at the start,
  count at the end); the picture is 64 × 36 px; the 「他の箇所」 line aligns with the text
  column. No horizontal scrolling at 390 px.
- A section locator longer than the column is truncated to one line with the full title in
  `title`.
- Order is by relevance only; nothing on screen shows a score.
- Loading: three skeleton rows in the row shape (`bg-bg-elevated`, the existing
  `animate-pulse` skeleton pattern); the count is hidden until the answer settles.
  Refetch: the previous rows are removed when the new request starts.
- Keyboard: Tab order is the two segments, then each row (one link per row) in order,
  each group's 「他の箇所」 link after its rows. Enter on a row opens it; Enter or Space on a
  segment selects it and focus stays on it.
- Screen reader: the control is `role="group"` named 「表示」 / "Show" with
  `aria-pressed` segments (the existing `SegmentedControl`). The list is an `<ol>` named
  「箇所」 / "Passages"; each group is an `<li>` holding an `<ol>` of its rows and the
  「他の箇所」 link. A row link reads its locator, file name and excerpt in that order; the
  picture is `alt=""`. The 「他の箇所」 link reads 「{file name} の他の箇所 N 件」 /
  "N more passages in {file name}". The failure message is `role="alert"`.
- New strings in `messages-core/ja.json` and `en.json`: 「表示」/"Show",
  「ファイル」/"Files", 「箇所」/"Passages", 「{files} ファイル・{passages} 箇所」 /
  "{files, plural, …} · {passages, plural, …}", 「{passages} 箇所」, 「画像の文字」/"Text in
  picture", 「本文」/"Text", 「このファイルの他の箇所 {count} 件 →」 / "{count} more in this
  file →", its accessible name, 「箇所を読み込めませんでした」/"Couldn't load passages",
  「ファイルで表示」/"Show files". 「再試行」 and the existing match labels are reused.
- Docs: `docs/user-guide/search.md` (search page and searching by meaning): the
  Files / Passages switch; that Passages lists only places found inside files (speech,
  pages, chapters, picture text, and scenes with Scene search on), so files found only by
  name or thumbnail are in Files alone; that 「他の箇所」 opens the file.
  `docs/addons/intelligence.md`: `passages=true` on `/search` and the `SearchPassage`
  shape.
- `DESIGN.md` §6 gains a short "Search passage rows" entry: a passage row shows its excerpt
  in full and is not a Search Snippet (whose one-per-hit and `line-clamp-2` rules stay for
  Files) (pending human confirmation).

### 10. Non-functional

- Payload: at most about 200 passages of about 200 characters each per answer, so
  `passages=true` adds well under 100 KB to the 1000-hit results-page request.
- Time: building passages is a pass over matches already in memory; `/search` with
  `passages=true` answers within 10 % of the same request without it.
- Frames: each `<img>` is `loading="lazy"`, so a cache miss spawns ffmpeg only for rows
  near the viewport, through the existing frame route and cache.
- Rendering: all passages render at once, with no paging; the bound above keeps that to
  about 200 rows.
- Privacy: no new data leaves the Docker network.

## Touch points

Addon (intelligence):
- `addons/intelligence/app/search.py`: `MatchInfo` gains the transcript `chunk_index` and
  the FTS row's full text for keyword matches; `_keyword_search_transcripts` and
  `_keyword_search_text_content` fill them; passage building (kind, merge, score,
  `keyword`, `highlight_terms`, excerpt window, `frame_url`), reusing `_build_fts_query`'s
  variants and `_TYPE_WEIGHTS`.
- `addons/intelligence/app/routers/search.py`: the `passages` parameter on `/search` only;
  `_to_response_model` emits `passages` only when asked.
- `addons/intelligence/app/schemas.py`: `SearchPassage`; `SearchResultItem.passages`
  omitted from the JSON when not requested.
- `addons/intelligence/tests/`: kinds, merge of vector and keyword matches of one place,
  exclusions, score formula, ordering, `keyword` / `highlight_terms`, the excerpt window,
  `frame_url` (video, audio, `.loft`), no `passages` key without the parameter, unchanged
  `segments`, composition with A2's `filter`.
- `docs/addons/intelligence.md`.
- The gitlink bump of `addons/intelligence` in the core repository.

Core:
- `frontend/src/lib/semanticSearch.ts`: `passages` option on `fetchSemanticHits`.
- `frontend/src/lib/searchMerge.ts`: `SemanticHit.passages` type.
- New `frontend/src/lib/searchPassages.ts`: grouping, ordering, locator, link, highlight
  segmentation.
- New `frontend/src/components/search/PassageList.tsx` (rows, groups, skeleton, empty,
  failed).
- `frontend/src/components/folder/useFolderFiles.ts`: send `passages=true`, expose the
  passage groups and a failure flag, retry.
- `frontend/src/components/FolderBrowser.tsx`: the control row, the Passages body in
  place of `FolderContent`, the count, `show` in the URL-sync effect.
- `frontend/src/components/folder/FolderToolbar.tsx`: hiding sort, view mode, select and
  Play all in Passages.
- `frontend/src/app/drive/[name]/search/page.tsx`: reading `show`; A2's submission keeps it.
- `frontend/src/messages-core/ja.json`, `en.json`.
- Frontend tests next to the existing search tests; a `frontend/e2e-layout/` case with a
  static fixture at 390 px and at desktop width.
- `DESIGN.md` §6 (pending human confirmation), `docs/user-guide/search.md`.

Rules passed through: `.claude/rules/design-decisions.md` (drive boundary; the addon reads
`X-Lit-Drive`; SPA navigation through `Link` / `router`), `.claude/rules/frontend-conventions.md`
(DESIGN.md, `messages-core` only, component placement under `components/search/`),
`.claude/rules/backend-conventions.md` (no language-dependent rule: the kana variants are
the FTS query's own expansion, not a vocabulary), `DESIGN.md` §2.2, §3.5, §3.6,
§Selected-state controls, §Search result timestamp pills, §Search Snippet, §Over-video
chrome, §7. No Internal API endpoint, no HIGH zone and no protected path is touched.

## Invariants

I1. Without `passages=true`, `/search` returns the same JSON as before this change for the same request, with no `passages` key.
I2. With `passages=true`, the results, their order, `score`, `match_types` and `segments` are identical to the same request without it.
I3. Each hit's `passages` holds exactly one entry per distinct (kind, place) among its matches of the kinds in the table, and none for `metadata`, `clip_thumbnail`, `vision_description`, `retrieval_keywords`, `blip_caption`, an untimed transcript match or a text match without `chunk_index`; a text vector match and a keyword match of the same chunk or the same transcript stretch are one passage.
I4. A passage's `score` is `alpha × v + (1 − alpha) × k` over its own matches with the file score's type weights, and each hit's `passages` is sorted by it descending.
I5. `keyword` is true exactly when a keyword-channel match is among the passage's matches, and `highlight_terms` is empty exactly when `keyword` is false; a non-keyword passage's `text` equals the stored `content_preview`.
I6. A keyword passage whose stored FTS text contains a highlight term has an excerpt that contains one.
I7. `frame_url` is set exactly for `utterance` and `scene` passages of a non-`.loft` video, and no passage of kind `scene` exists unless `include_scene_clip=true`.
I8. The results page makes one meaning request per query, type, filter and Scene search setting, and switching between Files and Passages sends no request.
I9. The view is `passages` exactly when `show=passages` and a meaning search runs; choosing an option changes only `show`, with `router.replace`, and the URL-sync effect and A2's submission keep `show`.
I10. Passages groups are ordered by their first passage's score, show at most three rows each in the addon's order, and the 「他の箇所 N 件」 line appears exactly when a group has more, with N the rest; the count's M equals the passages in all groups including the hidden ones, and N the number of groups.
I11. Each row links to its file at `?t=<floor(start)>` for utterances and scenes, `?page=` for pages, `?section=` for sections, and with no locator for picture text and text.
I12. A mark appears only in a passage whose `keyword` is true, and wraps exactly the case-insensitive occurrences of its `highlight_terms` in the excerpt, without nesting.
I13. No row of a previous answer is shown once the query, type, filter or Scene search has changed, and a failed meaning request shows the failure state, never the empty state.
I14. At 390 px wide, measured in a real browser by `frontend/e2e-layout/`, the control and 「M 箇所」 share one row, rows do not overflow horizontally, and the picture is 64 px wide; at desktop width the picture is 88 px and the rows stay within `max-w-list-row`.

## Checked, no action

- **MCP `semantic_search` gains nothing.** It forwards `/search`'s JSON verbatim, so
  sending `passages=true` would roughly double what an agent reads for the same answer,
  and its `segments` already carry per-segment excerpts and locations. `passages` is
  opt-in so the tool's output stays byte-identical. Recommended: no change.
- **A new route for passages.** Rejected: both views must come from one search, and a
  second route would run the channels twice and could disagree with Files. An opt-in
  parameter on `/search` gives both from one answer.
- **A per-file cap on the wire.** Not needed: the channels bound the total at about 200
  before merging, and the 「他の箇所 N 件」 count needs every passage of the file.
- **Paging.** Not needed for the same bound; all rows render at once.
- **`section` on content matches.** Already on the wire for EPUB matches
  (`_segment_match` maps `page` to `section` and adds `section_title`); passages reuse
  the same mapping.
- **A frame field on `segments` for scene matches.** The frame belongs to a passage;
  `segments` stay as they are (I1, I2).
- **Going past the margin cutoff (a second tier of "more passages").** Later, by the
  user's decision.
- **Per-word highlighting as drawn in the artifact.** The artifact marks 「倉庫」「移転」
  「費用」 separately in a query typed without spaces; keyword search matched the whole
  term, so marking its parts would claim matches that did not happen. Marks follow what
  the keyword channel matched (I12).
- **Passages in the search modal.** The decision places the control on the results page.
- **The `search-result-actions` slot (capture to a note) on passage rows.** Not decided;
  Files keeps it on its snippet.
- **Moving the Scene search toggle into the control row**, as the artifact draws it on
  desktop. It stays above the header, where `search/page.tsx` renders it today, so this
  change does not move A2's header layout further.
- **Vision descriptions, metadata and representative-frame matches as passages.** They
  describe the whole file, not a place in it.
- **Remembering the view per user.** Decided: the URL only.
- **Scores on screen.** Decided: none.

## Pending human confirmation

- The excerpt of a keyword passage is a 200-character window around the first match when
  the match lies past the stored 200 characters (addon step 6, `text`). Without it, most
  keyword matches in 1000-character PDF and text chunks would show an excerpt without the
  word and so without a mark. It reads stored text only; nothing is reindexed.
  Recommended.
- Until find-in-file ships, 「このファイルの他の箇所 N 件 →」 opens the file at its start
  (core step 8). Recommended: an in-place expansion would contradict "at most 3 per file".
- `DESIGN.md` §6 gains "Search passage rows" in this PR. Recommended.
