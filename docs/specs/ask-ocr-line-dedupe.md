# Ask about a video sends each on-screen line once while it stays on screen

SPEC-ID: SPEC-ADDON-171

Approval:

## Summary

A file question about a video sends the video's on-screen text (frame OCR) as passages, one
passage per stored `fts_text_content` chunk. Frame OCR opens a new segment whenever any text
on screen changes, and every segment stores everything on screen, so a line that stays up —
a channel name, a watermark, a slide title — is repeated in every segment while subtitles
under it change. Measured on the production library on 2026-11-23: of 12,247 videos with
text, 757 exceed `rag.file_question_max_chars` (16,000) and are answered from part of the
file; for 471 of them the transcript alone fits and the frame text pushes them over, and 57%
of those videos' frame-text characters are lines repeated from another segment.

This change drops, at question time, each frame-text line that already appeared in the same
video within the previous 60 seconds. Measured the same way, the videos over budget fall from
757 to 453. Nothing stored changes; search, scenes and every other reader of the frame text
are untouched. It is for the person asking about a long or text-heavy video, who today gets
an answer from part of the file because of text the model has already been shown.

## Terms

- **Frame-text row**: a passage of a video built from an `fts_text_content` row whose
  `chunk_index` has a `video_frame_texts` row for the same file; its position is that row's
  `start_time` (`{ "seconds": start_time }`), as today.
- **Line**: one `\n`-separated part of a frame-text row's text, with surrounding whitespace
  removed; an empty line is not a line.
- **Seen at**: for each distinct line, the `start_time` of the latest frame-text row, in the
  order below, that contains it, whether or not the line was kept there.
- **Window**: 60 seconds, a module constant (`OCR_REPEAT_WINDOW_SECONDS`).

## Required items

### 1. Normal flow

1. A viewer asks about a video from the file Ask tab, or sends a follow-up, as today
   (`POST /api/addons/intelligence/files/{file_id}/ask`).
2. `load_material` reads the file's transcript chunks and `fts_text_content` rows as today.
3. Only for a file whose `file_type` is `video`, the frame-text rows are walked in the order
   they are sent today (`chunk_index` as an integer, which is time order), and each row's
   lines are filtered:
   - a line is dropped when it has a seen-at time and the row's `start_time` minus that time
     is at most the window (a line repeated inside the same row, or in another chunk of the
     same segment, has a difference of 0 and is dropped);
   - every line of the row, kept or dropped, then has its seen-at time set to the row's
     `start_time`;
   - the row's text becomes its kept lines joined by `\n`, in their original order.
4. A frame-text row with no kept line is not a passage: it gets no number and is not sent.
5. Rows that are not frame-text rows (transcript chunks, and document chunks of every other
   kind of file) are unchanged.
6. The budget, ranking, fitting, numbering, `partial`, prompts, frames, `get_frames`, history
   and citations then work exactly as today on the resulting rows. A filtered row keeps its
   position and its stored embedding (`text_content` row with the same `chunk_index`) for
   ranking.

### 2. Failure cases

- A frame-text row whose text has no line → it has no kept line and is not sent (today an
  empty text is already skipped).
- `start_time` missing for a chunk → the row is not a frame-text row (as today it gets the
  document position); its text is sent unfiltered and its lines set no seen-at time.
- Everything else fails as today; this step reads no store beyond what `load_material`
  already reads and calls nothing.

### 3. States

None. The filtering is a pure function of the rows read for one question; nothing persists
between questions.

### 4. Data read and written

- Read, unchanged: `indexed_files`, `transcript_chunks`, `fts_text_content`,
  `video_frame_texts` (`chunk_index`, `start_time`), `embeddings` in `search.db`.
- Written: nothing. No table, cache or file changes.

### 5. External services

None added. The LLM and embedding calls are those of today; the embedding call happens only
when the material exceeds the budget, which is now less often.

### 6. Authorization

Unchanged: the file must be an active file of the `X-Lit-Drive` drive the viewer can access
with `rag` on (SPEC-ADDON-053 I1 as revised). The filter runs after those checks, on the
same file's rows.

### 7. Effect on existing features

- Only `load_material` in `app/rag/file_question.py` changes, so the file Ask tab, follow-ups
  and the frame paths built on its `Material` (SPEC-ADDON-071, 108, 114, 116) see the
  filtered passages.
- Unchanged: the normal Ask (`/ask`, `rag/context.py`, `rag/service.py`), search, exact
  search, scene search, find in file, the Visual Index, `video_contents` (the section list of
  SPEC-ADDON-116, which reads `video_frame_texts` itself), the MCP tools, the OCR worker and
  what it stores.
- Pictures, audio and documents: no frame-text rows, so unchanged.

### 8. Error behavior

No new error, log line or status. A question that used to say it read part of the file may
now read the whole file.

### 9. User-visible behavior

- For a video whose on-screen text repeats, fewer answers carry the "read part of the file"
  notice (`partial` false where it was true).
- Citation numbers of a video's frame-text passages can differ from today's, since a fully
  repeated row no longer takes a number. Pills still seek to the cited row's start.
- A line that stays on screen is cited at the time it first appeared (or reappeared after
  more than 60 seconds away), not at each later segment.

### 10. Non-functional

- Time: one pass over rows already in memory; no measurable cost against the LLM call.
- Privacy and cost: strictly less text is sent to the model for the same question.
- `docs/addons/intelligence.md` (the file Ask paragraph on `rag.file_question_max_chars`)
  gains one sentence: on-screen text a video repeats within a minute is sent once.

## Touch points

- `addons/intelligence/app/rag/file_question.py` (`load_material`; a new constant and a
  helper for the line filter)
- `addons/intelligence/tests/` (acceptance tests for this spec)
- `docs/addons/intelligence.md`
- `docs/specs/INDEX.md`
- Rules passed through: `.claude/rules/design-decisions.md` (LLM features; Transcript Refine:
  frame OCR lines are machine output and are not corrected), `.claude/rules/backend-conventions.md`
  (no language-dependent rules: the filter compares whole lines exactly, in any script)

## Invariants

I1. For a video, a frame-text line whose identical text was in a frame-text row starting at most 60 seconds earlier (or earlier in the same row or segment) is not sent; any other line of a frame-text row is sent, in its original order within its row.
I2. A line that has been on screen continuously for longer than the window is sent once, at the row where it first appeared: its seen-at time advances with every row that contains it, kept or not.
I3. A line absent from every frame-text row of the previous 60 seconds is sent again where it reappears, with that row's position.
I4. A frame-text row with no kept line takes no `[n]` number and is not sent; the remaining passages are numbered consecutively in file order, and every `citations` entry names a number that was sent, with that passage's position.
I5. Transcript chunks, the chunks of pictures, audio and documents, and the frame-text rows of a video with no repeated line are sent with exactly the text, order and positions they had before this change.
I6. The budget, `partial` and ranking of SPEC-ADDON-053 step 4 (as revised by SPEC-ADDON-081) are applied to the filtered rows: a video whose filtered text totals at most the passage budget is sent whole with `partial` false.
I7. The change writes nothing: `search.db`, the frame cache and every other store hold the same rows after a question as before it, and search, scene search, exact search, the normal Ask and `video_contents` return what they returned before.

## Revises

SPEC-ADDON-053 I2. When the file's chunk text, after a video's frame-text lines repeated within 60 seconds are removed as SPEC-ADDON-171 states, totals at most the passage budget (`rag.file_question_max_chars` minus the characters of the history turns sent), all chunks are sent in file order and `partial` is false; otherwise the sent chunk text totals at most the passage budget, chosen by the ranking and fitting rule of 053 step 4 with the ranking text of SPEC-ADDON-081 step 5, sent in file order, and `partial` is true.
SPEC-ADDON-108 I1. A video with at least one `transcript_chunks` or `fts_text_content` row gets the availability it had before SPEC-ADDON-108, the passages it had then with the frame-text line filter of SPEC-ADDON-171 applied, and its frames by SPEC-ADDON-114; availability answers `true` for a text-less video only when some profile can see, and `false` for audio with no text chunk and for a `.loft` that is unreadable or whose source is not YouTube.

## Checked, no action

- **Merging at index time instead (store lines with start and end times).** It would also
  shrink search and scene rows, but changes stored data, the OCR worker, every reader of
  `video_frame_texts`, and needs a re-read or migration of 679,067 segments. The question-time
  filter gets the measured benefit with no stored change. Revisit if another reader needs it.
- **Other windows.** Production, over-budget videos after filtering: none 757, adjacent
  segment only 489, 30 s 457, 60 s 453, 300 s 442, whole file 439. Adjacent-only loses to
  OCR flicker (a line missed in one segment returns as new); beyond 60 s the gain is 14
  videos and a line shown again much later (a revisited slide) would lose its second time.
- **Filtering only when the text exceeds the budget.** Always filtering keeps one rule for
  every video and removes noise for videos that fit too; the model loses only an exact line
  it was shown under a minute before, and it still has the frames.
- **Annotating a kept line with how long it stays on screen.** Adds characters to every
  line; no question type measured needs it. The frames and `get_frames` cover "what is on
  screen at t".
- **Near-duplicate lines (OCR misreads of the same text).** Exact match only: a fuzzy rule
  would need a threshold that behaves differently per script.
- **Re-embedding filtered rows for ranking.** The stored embedding of the whole chunk still
  describes the row; recomputing would add an embedding call per row per question.
- **`video_contents` excerpts (the section list) also repeat the same lines.** It is capped
  at 120 characters per section and is a separate reader; out of scope.
- **The normal Ask.** Its context is built from search hits in `rag/context.py`, not from a
  whole file, and its budget problem is different; unchanged.
- **The remaining 453 over-budget videos** (approved chapters as an overview, a
  `get_transcript(start, end)` tool, hybrid ranking) are a separate change, decided after
  this one ships.
- **User guide.** A viewer needs nothing new to use Ask; only the addon reference paragraph
  on the budget changes.
