# A line that stays on screen counts once in Ask, find and exact search

SPEC-ID: SPEC-ADDON-171
SPEC-ID: SPEC-ADDON-172
SPEC-ID: SPEC-ADDON-173

Approval:

## Summary

Frame OCR opens a new segment whenever any text on screen changes, and every segment stores
everything on screen. A line that stays up — a channel name, a watermark, a slide title — is
therefore repeated in every segment while the subtitles under it change. Three readers pass
those repeats on:

- **SPEC-ADDON-171, file Ask.** A question about a video sends the frame text as passages.
  On the production library (2026-11-23), 757 of 12,247 videos with text exceed
  `rag.file_question_max_chars` (16,000) and are answered from part of the file. For 471 of
  them the transcript alone fits and the frame text pushes them over, and 57% of those
  videos' frame-text characters are lines repeated from another segment.
- **SPEC-ADDON-172, find in file.** The find bar lists one row per segment for each
  occurrence. On 25 production videos with over 100 segments, searching each one's most
  repeated line gives 2,322 rows today.
- **SPEC-ADDON-173, exact search.** `/search/exact` (and the MCP `search_exact` tool) returns
  one hit per matching frame-text chunk, so the same line on screen for a minute gives a
  hit per segment.

With this change, each of the three treats a line repeated from an earlier segment, within
60 seconds of the last time it was on screen, as already seen:

- Ask drops it from the passage. Videos over budget fall from 757 to 464.
- Find drops the occurrence. On the 25 videos, the 2,322 rows fall to 188.
- Exact search drops the hit when every matching line in it was already seen.

A kept find row or exact hit keeps today's times. Nothing stored changes.

## Terms

- **Segment**: the `video_frame_texts` rows of one video with the same `start_time` and
  `end_time`; one segment is one frame-OCR read, and its chunks are its rows in
  `chunk_index` order. Segments are ordered by `start_time`.
- **Line**: one `\n`-separated part of a text, with surrounding whitespace removed by
  Python's `str.strip()` (Unicode whitespace, U+3000 included); a part that is empty after
  that is not a line. Lines are compared as whole strings, in any script, exactly.
- **Merged text of a segment**: its chunks' stored texts joined as the find route joins them
  today (`_merge_chunks` in `app/file_find.py`: each next chunk's longest overlap of 20 to
  200 characters with the end of the text so far is dropped, and a chunk with no such
  overlap is appended after a `\n`).
- **Lines of a segment**: the lines of its merged text, as a set. A part of a chunk that a
  chunk boundary cut in the middle of a line is not among them unless the merged text has
  the identical line, so such a part is never repeated.
- **Repeated**: a line `L` of segment `S` is repeated when an earlier segment (smaller
  `start_time`) has `L` among its lines and `S.start_time − U ≤ 60`, where `U` is the
  largest `end_time` among the earlier segments that have `L`. Equal lines inside one
  segment are never repeated against each other. The window, 60 seconds, is a module
  constant (`OCR_REPEAT_WINDOW_SECONDS`) shared by the three readers.
- **Frame-text row** (Ask): a passage of a video built from an `fts_text_content` row whose
  `chunk_index` is an integer with a `video_frame_texts` row for the same file and index;
  its segment is that row's, and its position is the segment's `start_time`
  (`{ "seconds": start_time }`), as today.

## Required items

### 1. Normal flow

**SPEC-ADDON-171, file Ask**

1. A viewer asks about a video from the file Ask tab, or sends a follow-up, as today
   (`POST /api/addons/intelligence/files/{file_id}/ask`).
2. `load_material` reads the file's rows as today. For a file whose `file_type` is
   `video` (a YouTube `.loft` included), it also reads every `video_frame_texts` row of the
   file (`chunk_index`, `start_time`, `end_time`, `text`) to form its segments.
3. Each frame-text row's text is filtered. Its stored text is split on `\n`; a part whose
   stripped form is a line repeated in the row's segment is removed. Lines are judged
   against every segment of the file, not only against the rows that end up sent.
   - A row in which nothing was removed keeps its stored text, unchanged byte for byte.
   - A row in which a part was removed becomes its remaining parts, as stored (blank parts
     included), joined by `\n` in their order.
   - A row whose remaining parts are all blank is removed.
4. From here, the budget, ranking (each frame-text row by the stored embedding of its whole
   chunk), fitting, numbering, `partial`, prompts, frames, `get_frames`, history and
   citations work exactly as today, on the filtered rows. The prompts are not changed.

**SPEC-ADDON-172, find in file**

1. The find bar asks `GET /api/addons/intelligence/files/{file_id}/find?q=` as today.
2. For a video's frame-text segments, occurrences are found in each segment's merged text
   as today. Each occurrence belongs to the line of the merged text that contains its
   first character.
3. An occurrence whose line is repeated in its segment is left out. A kept occurrence's row
   is exactly today's row: `start`, `end`, `snippet`, offsets, `ordinal`, `boxes` and
   `frame_size` are computed as today from the unfiltered merged text.
4. `total`, `truncated`, the order of rows and the 2,000-row cap are computed over the kept
   rows, exactly as today's rule computes them over all rows. Transcript, document,
   picture-text and Visual Index scene rows are unchanged.

**SPEC-ADDON-173, exact search**

1. `/search/exact` finds matching `fts_text_content` chunks as today. Its callers are the
   agent route itself and the MCP `search_exact` tool; no page of the web UI calls it.
2. For a hit on a video's frame-text chunk, the matching lines are the stripped `\n`-parts
   of the chunk's stored text that contain the folded term (ASCII folding, as the match).
   - The hit is left out when it has at least one matching line and every matching line is
     repeated in its segment.
   - Every kept hit, including one with no matching line (the term crosses a line break),
     is exactly today's hit: `start_time`, `end_time`, `snippet`, `match_count` and the
     location are unchanged.
   - The segments are read for the videos that have a frame-text hit, before paging.
3. The total and the paging (`limit`, `offset`) are over the kept hits, in today's order.
   Transcript, document and scene hits are unchanged.

### 2. Failure cases

- An `fts_text_content` row of a video whose `chunk_index` is not an integer or has no
  `video_frame_texts` row is not part of any segment. Ask sends it unfiltered and exact
  search keeps it unchanged. It adds no line to any segment.
- A video with a transcript whose frame-text rows all filter away still has its transcript
  passages. A video with any frame-text line keeps at least the row of the first segment
  that has it, so the Ask material is never empty where it is not empty today.
- A video with no `video_frame_texts` rows: nothing is repeated, and all three readers
  answer as today.
- Everything else fails as today. The filter reads `video_frame_texts`, which every reader
  already reads, and calls nothing.

### 3. States

None. Each reader computes repeats from the rows of one request; nothing persists.

### 4. Data read and written

- Read: `video_frame_texts` (`chunk_index`, `start_time`, `end_time`, `text`) for the files
  concerned, in addition to what each reader reads today. Exact search reads the segments of
  every video with a frame-text hit.
- Written: nothing. No table, cache or file changes.

### 5. External services

None added. Ask's embedding call happens only when the material exceeds the budget, which is
now less often.

### 6. Authorization

Unchanged for each reader. The filter runs after the existing drive, file and policy checks,
on rows those checks already admitted.

### 7. Effect on existing features

- `app/rag/file_question.py` (`load_material`): the file Ask tab, follow-ups and the frame
  paths built on its `Material` (SPEC-ADDON-071, 108, 114, 116) see the filtered passages.
  The frame numbers `[P+1]…` follow the reduced `P`.
- `app/file_find.py`: the find bar, its count, chips and next/previous step through the kept
  rows.
- `app/exact_search.py`: `/search/exact` and the MCP `search_exact` tool get the kept hits.
- Unchanged: the normal Ask (`/ask`, `rag/context.py`, `rag/service.py`, including the
  shortlist's exact-match step, which does not call `find_exact`), semantic search and the
  passage results view, scene search, the Visual Index, `video_contents`, the OCR worker and
  what it stores.

### 8. Error behavior

No new error, log line or status.

### 9. User-visible behavior

- Ask: for a video whose on-screen text repeats, fewer answers carry the "read part of the
  file" notice. Citation numbers of frame-text passages can differ from today's. A line that
  stays on screen is cited at the time it first appeared, or reappeared after more than 60
  seconds away.
- Find: a line on screen for several segments is one row at the time it appeared, instead of
  one row per segment. The count and chips are smaller by the same amount.
- Exact search: the same, one hit per run of a line on screen, at the segment where it
  appeared.

### 10. Non-functional

- Time: one pass over a video's segments per request, in memory. Exact search reads the
  segments of the matched videos only. Measured on production with the most common
  on-screen strings: 43,975 hits in 283 videos read 54,853 segments in 0.07 s, on top of
  0.22 s for today's match query. No new cap is needed under the 30 s proxy timeout.
- Privacy and cost: less text reaches the model for the same question.
- Docs:
  - `docs/addons/intelligence.md` gains one sentence each in the file Ask budget paragraph,
    the find paragraph and the MCP `search_exact` sentence.
  - `docs/reference/api.md`'s find entry states the rule.
  - The MCP `search_exact` description (`mcp-server/src/tools/search.ts`) says that a line
    on screen across consecutive frame-text segments gives one hit, at the time it
    appeared.

## Touch points

- `addons/intelligence/app/rag/file_question.py` (`load_material`)
- `addons/intelligence/app/file_find.py` (`_frame_occurrences`)
- `addons/intelligence/app/exact_search.py` (`_text_hits`, `_frame_segments` and the paging
  in `find_exact`)
- A shared helper for segments, merged text, lines and repeats, with the window constant, in
  the intelligence addon
- `mcp-server/src/tools/search.ts` (the `search_exact` description, core repository)
- `addons/intelligence/tests/` (acceptance tests for this spec)
- The three files above are committed in the intelligence addon repository. In the core
  repository, the `addons/intelligence` gitlink moves to the merged addon commit, and with it
  the ledger rows become `implemented`.
- `docs/addons/intelligence.md`, `docs/reference/api.md`
- `docs/specs/INDEX.md`
- Rules passed through:
  - `.claude/rules/design-decisions.md`: LLM features; frame OCR lines are machine output and
    are not corrected.
  - `.claude/rules/backend-conventions.md`: no language-dependent rules. The filter compares
    whole lines exactly, in any script.

## Invariants

I1. For a video, a frame-text line is repeated exactly when an earlier segment has the identical line and the latest `end_time` among such earlier segments is at most 60 seconds before this segment's `start_time`; identical lines within one segment are never repeated against each other.
I2. Ask sends no `\n`-part of a frame-text row whose stripped form is a repeated line, and sends every other part of every frame-text row it sends, as stored and in its order within its row; a frame-text row in which nothing was removed is sent with its stored text unchanged, and a row whose remaining parts are all blank takes no `[n]`.
I3. Ask numbers the passages it sends consecutively in file order, frames follow from that count, and every `citations` entry names a number that was sent, with that passage's position.
I4. Ask's budget, ranking, fitting and `partial` are those of SPEC-ADDON-053 step 4 (with SPEC-ADDON-081 step 5), applied to the filtered rows: a video whose filtered rows total at most the passage budget is sent whole with `partial` false.
I5. Find returns no frame-text row whose occurrence lies in a repeated line of its segment's merged text, and returns every other row exactly as today, field for field; `total`, `truncated`, order and the cap are today's rule over the kept rows.
I6. Exact search leaves out a frame-text hit exactly when it has at least one matching line and every matching line is repeated; every kept hit is exactly today's hit, field for field, and the total and pages are over the kept hits.
I7. Transcript chunks, documents, pictures, audio, Visual Index scenes, and every frame-text row or hit of a video in which no line is repeated are returned or sent exactly as before this change.
I8. The change writes nothing: `search.db`, the frame cache and every other store hold the same rows after any of the three requests as before it, and semantic search, the normal Ask and `video_contents` return what they returned before.

## Revises

SPEC-ADDON-053 I2. When the file's chunk text, after a video's repeated frame-text lines are removed as SPEC-ADDON-171 states, totals at most the passage budget (`rag.file_question_max_chars` minus the characters of the history turns sent), all chunks are sent in file order and `partial` is false; otherwise the sent chunk text totals at most the passage budget, chosen by the ranking and fitting rule of 053 step 4 with the ranking text of SPEC-ADDON-081 step 5, sent in file order, and `partial` is true.
SPEC-ADDON-081 I1. A file question with no `history` or an empty one sends the model the same system prompt, user prompt and chunks, ranked by the new question alone, as before SPEC-ADDON-081, with a video's repeated frame-text lines removed as SPEC-ADDON-171 states; with history and a file over budget, ranking embeds the last `history` entry's question as sent, a newline, and the new question.
SPEC-ADDON-108 I1. A video with at least one `transcript_chunks` or `fts_text_content` row gets the availability it had before SPEC-ADDON-108, the passages it had then with its repeated frame-text lines removed as SPEC-ADDON-171 states, and its frames by SPEC-ADDON-114; availability answers `true` for a text-less video only when some profile can see, and `false` for audio with no text chunk and for a `.loft` that is unreadable or whose source is not YouTube.
SPEC-ADDON-114 I8. Pictures, audio, documents, a `.loft` that is not a text video, every request whose profile cannot see, the availability route, the normal Ask with its agentic loop and the MCP tools answer as they did before this change, except that a video's passages have their repeated frame-text lines removed as SPEC-ADDON-171 states and `search_exact` leaves out the frame-text hits SPEC-ADDON-173 leaves out; text-less videos differ only by the request layout of I11 and by SPEC-ADDON-116.
SPEC-ADDON-061 I1. The find answer's `total` equals the number of non-overlapping occurrences of the folded term within the file's text units (a video's units being its frame-text segments), transcript chunks that have a start, and — only while the drive's Visual Index is open — scene `visible_text` (never `scene_label`), less the frame-text occurrences that SPEC-ADDON-172 leaves out because their line is repeated; an occurrence inside the overlap of two adjacent text chunks of one unit counts once; `rows` is the first `min(total, 2000)` of them in position order, `truncated` is true exactly when `total > 2000`, and each row's `snippet[match_start:match_start+match_length]` folds to the term.
SPEC-ADDON-066 I9. The find answer for a video includes one `scene` row per occurrence in each frame-text segment, except an occurrence in a line repeated in its segment (SPEC-ADDON-172), with the segment's `start` and `end`, whether or not the drive's Visual Index is open, ordered by `start` with utterance, then Visual Index scene, then frame text at an equal start; the answer's `indexed` is true for a video whose `frame_ocr_indexed` is true; for a scanned PDF it includes `page` rows for the stored page text.
SPEC-ADDON-032 I2. `/search/exact` returns exactly the segments of the requested sources whose text contains `q` under the stated comparison, for every length of `q`, less the video frame-text segments that SPEC-ADDON-173 leaves out because every matching line is repeated: `total` equals their number, and paging by `offset` in steps of `limit` visits each once, in the stated order; no character of `q` acts as a wildcard (`%`, `_` and `\` match only themselves).

## Checked, no action

- **Merging at index time instead** (store each line with start and end times). It would
  change stored data, the OCR worker and every reader of `video_frame_texts`, and needs a
  re-read or migration of 679,067 segments. The three request-time filters give the measured
  benefit with no stored change.
- **Other windows.** Production, Ask over-budget videos by window: 0 s 490, 30 s 457,
  60 s 453, 300 s 442 (measured with repeats inside a segment also dropped). Under 60 s,
  OCR flicker (a line missed in one segment) makes a line new again. Beyond 60 s the gain is
  about 11 videos, and a line shown again much later (a revisited slide) would lose its
  second time.
- **Dropping repeats inside one segment.** It would also drop short lines whose position
  carries meaning: cells of a table (`Yes`, `0`), braces and `else:` in code, list
  numbering. That leaves a table or code block on one screen misaligned. Keeping them
  costs 8 videos (464 against 456 over budget).
- **A table or code block that changes slightly between segments** loses its unchanged lines
  in the later segment. The full block was in the earlier segment's passage, and Ask sends
  frames to a profile that can see. Accepted.
- **Ask judging repeats only against the rows actually sent** (so a line whose first row
  loses the ranking stays in a later sent row). The human chose judging against every
  segment. It is the rule the measurement used and the one find and exact search use, and
  fitting against the taken rows raised four contradictions in the spec design review. The
  loss happens only when `partial` is true, and the answer then says it read part of the
  file.
- **Telling the model that a frame-text passage holds only what newly appeared.** The human
  chose not to change the prompts. That would revise SPEC-ADDON-114 I10 and needs checking
  against the production model. Revisit if answers show the model misreads it.
- **Extending a kept find row's `end` or exact hit's `end_time` to the end of the line's
  run on screen.** The human chose to keep today's times. The player's find outline draws
  a row's boxes from its `start` to its `end` and outlines together the rows sharing both,
  so a longer `end` would keep the first segment's boxes up after the line moved or left,
  and split rows of one screen apart.
- **Opening a video from a `screen_text` search passage (`?t=<start>&find=<term>`) whose
  segment has the term only in a repeated line.** The find answer then has no row at `t`,
  so the bar opens with no row current and no outline (frame-ocr-hit-place I6's "no row
  otherwise"); the player still seeks to `t`. The human accepted this.
- **Near-duplicate lines** (OCR misreads of the same text, fragments cut by chunking). Exact
  match only: a fuzzy rule would need a threshold that behaves differently per script. In
  the find probe, rows whose line differs from the most common one were 585 of 2,322, and
  the rule still removed 92% of rows.
- **Re-embedding filtered Ask rows for ranking.** The stored embedding of the whole chunk
  still describes the row, and recomputing would add an embedding call per row per
  question. A row can rank on text that was removed from it; accepted.
- **Changing `snippet` or `match_count` of a kept exact hit** to skip repeated lines. The
  snippet still shows a real occurrence in that chunk. Accepted as today's.
- **Lines taken per chunk instead of from the merged text.** The merged text is the form the
  find route already reads, and it has no chunk overlap, so a line cut by a chunk boundary
  is whole there. One definition then serves all three readers.
- **Semantic search and the passage results view.** They rank chunks by meaning, at most 3
  per file in the passage view, so a whole chunk is not a repeat even when one of its lines
  is.
- **`video_contents`** (the section list) also repeats lines. It is capped at 120 characters
  per section and is a separate reader; out of scope.
- **The remaining over-budget videos** (approved chapters as an overview, a
  `get_transcript(start, end)` tool, hybrid ranking) are a separate change.
- **User guide.** A viewer needs nothing new to use these. The addon reference and the API
  reference change.
