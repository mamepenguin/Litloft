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

This change drops, at question time, each frame-text line that a passage sent for the same
question already showed within the previous 60 seconds. Measured the same way, the videos
over budget fall from 757 to 453. Nothing stored changes; search, scenes and every other
reader of the frame text are untouched. It is for the person asking about a long or
text-heavy video, who today gets an answer from part of the file because of text the model
has already been shown.

## Terms

- **Frame-text row**: a passage of a video built from an `fts_text_content` row whose
  `chunk_index` is an integer with a `video_frame_texts` row for the same file and index; its
  position is that row's `start_time` (`{ "seconds": start_time }`) as today, and its span
  ends at that row's `end_time`.
- **Line**: one `\n`-separated part of a frame-text row's stored text, with surrounding
  whitespace removed; an empty part is not a line. Lines are compared as whole strings, in
  any script. A part that a chunk boundary or the 200-character chunk overlap cut in the
  middle is a line as it stands and matches only an identical string.
- **Sent rows**: the frame-text rows of this question's passages: every frame-text row when
  the material fits the budget, otherwise the rows chosen by fitting (step 4).
- **Seen until**: for a line, the latest `end_time` among the sent rows, earlier in file
  order than the row being read, that contain the line, whether or not the line was kept in
  them. Lines earlier in the same row count, with the row's own `end_time`.
- **Window**: 60 seconds, a module constant (`OCR_REPEAT_WINDOW_SECONDS`).
- **Filtering** a sequence of frame-text rows: walk them in file order (`chunk_index` as an
  integer, which is time order), and in each row walk its lines in order. A line is dropped
  when it has a seen-until time and the row's `start_time` minus that time is at most the
  window (zero or negative included); every line, kept or dropped, then updates its
  seen-until time before the next line is read. A row in which nothing was dropped keeps its
  stored text unchanged. A row in which a line was dropped becomes its kept lines joined by
  `\n`, in their order. A row with no kept line is removed.

## Required items

### 1. Normal flow

1. A viewer asks about a video from the file Ask tab, or sends a follow-up, as today
   (`POST /api/addons/intelligence/files/{file_id}/ask`).
2. `load_material` reads the file's transcript chunks and `fts_text_content` rows as today,
   and for a video reads `end_time` beside `start_time` from `video_frame_texts`.
3. Only for a file whose `file_type` is `video` (a YouTube `.loft` included), the frame-text
   rows are filtered as a whole, in file order. If the transcript chunks, the other rows and
   the filtered frame-text rows total at most the passage budget, all of them are sent in
   file order with `partial` false.
4. Otherwise rows are ranked as today (SPEC-ADDON-053 step 4 with the ranking text of
   SPEC-ADDON-081 step 5; a frame-text row ranks by the stored embedding of its whole
   chunk) and fitted in rank order. A candidate frame-text row is measured as the text it
   keeps when filtered against the frame-text rows already taken; a candidate is skipped
   when that length would exceed the remaining budget, as today. Every other row is measured
   by its text, as today. A frame-text row that keeps nothing is skipped and takes no budget.
   If nothing fits, the best-ranked row is sent cut to the budget, as today (filtered first
   when it is a frame-text row).
5. The taken frame-text rows are filtered again among themselves, in file order, and the
   result is sent with the other taken rows in file order, with `partial` true. Adding an
   earlier row can only remove lines from later ones, so the total stays within the budget.
6. Numbering, prompts, frames, `get_frames`, history and citations then work as today on the
   rows sent.

### 2. Failure cases

- An `fts_text_content` row of a video whose `chunk_index` is not an integer or has no
  `video_frame_texts` row is not a frame-text row (as today it gets the document position):
  its text is sent unfiltered and it gives no line a seen-until time.
- A frame-text row whose stored text has no line is removed (today an empty text is already
  skipped).
- A video with a transcript whose frame-text rows all filter away still has its transcript
  passages; a video with any frame-text line keeps at least the row where the line first
  appears, so the material is never empty where it is not empty today.
- Everything else fails as today; the filter reads only what `load_material` reads and calls
  nothing.

### 3. States

None. The filtering is a pure function of the rows read for one question; nothing persists
between questions.

### 4. Data read and written

- Read: `indexed_files`, `transcript_chunks`, `fts_text_content`, `embeddings` in `search.db`,
  as today; `video_frame_texts` (`chunk_index`, `start_time`, and now `end_time`).
- Written: nothing. No table, cache or file changes.

### 5. External services

None added. The LLM and embedding calls are those of today; the embedding call happens only
when the material exceeds the budget, which is now less often.

### 6. Authorization

Unchanged: the file must be an active file of the `X-Lit-Drive` drive the viewer can access
with `rag` on (SPEC-ADDON-053 I1 as revised). The filter runs after those checks, on the
same file's rows.

### 7. Effect on existing features

- Only `load_material` and its fitting helper in `app/rag/file_question.py` change, so the
  file Ask tab, follow-ups and the frame paths built on its `Material` (SPEC-ADDON-071, 108,
  114, 116) see the filtered passages. The frame numbers `[P+1]…` follow the reduced `P`.
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
- A line that stays on screen is cited at the time it first appeared in a sent row, or
  reappeared after more than 60 seconds away, not at each later segment.

### 10. Non-functional

- Time: filtering is linear in the frame-text lines; fitting filters each candidate against
  the rows already taken, at most once per candidate. No measurable cost against the LLM
  call.
- Privacy and cost: strictly less text is sent to the model for the same question.
- `docs/addons/intelligence.md` (the file Ask paragraph on `rag.file_question_max_chars`)
  gains one sentence: on-screen text a video repeats within a minute is sent once.

## Touch points

- `addons/intelligence/app/rag/file_question.py` (`load_material`, `_fit`; a new constant and
  the line filter), committed in the intelligence addon repository
- `addons/intelligence/tests/` (acceptance tests for this spec), in the addon repository
- `addons/intelligence` gitlink in the core repository (the pointer bump to the merged addon
  commit, with which the ledger row becomes `implemented`)
- `docs/addons/intelligence.md`
- `docs/specs/INDEX.md`
- Rules passed through: `.claude/rules/design-decisions.md` (LLM features; frame OCR lines are
  machine output and are not corrected), `.claude/rules/backend-conventions.md` (no
  language-dependent rules: the filter compares whole lines exactly, in any script)

## Invariants

I1. For a video, a frame-text line is not sent when an identical line was in a sent frame-text row earlier in file order (or earlier in the same row) whose `end_time` is at most 60 seconds before this row's `start_time`; every other line of a sent frame-text row is sent, in its order within its row.
I2. A line that stays on screen through consecutive segments is sent once, in the first sent row that contains it, however long each segment lasts; a line is sent again only after 60 seconds in which no sent row contained it.
I3. Whenever a row containing a frame-text line is taken, the line appears in at least one sent passage: a line dropped from a sent row is present in another sent row of the same question, also when the material is over budget.
I4. A frame-text row with no kept line takes no `[n]` number and is not sent; the remaining passages are numbered consecutively in file order, frames follow from the reduced count, and every `citations` entry names a number that was sent, with that passage's position.
I5. Transcript chunks, the chunks of pictures, audio and documents, and every frame-text row in which no line was dropped are sent with exactly the stored text, order and positions they had before this change.
I6. A video whose transcript, other rows and filtered frame-text rows total at most the passage budget is sent whole with `partial` false; otherwise the sent text, after the final filtering, totals at most the passage budget and `partial` is true.
I7. The change writes nothing: `search.db`, the frame cache and every other store hold the same rows after a question as before it, and search, scene search, exact search, the normal Ask and `video_contents` return what they returned before.

## Revises

SPEC-ADDON-053 I2. When the file's chunk text, after a video's frame-text lines are filtered as SPEC-ADDON-171 states, totals at most the passage budget (`rag.file_question_max_chars` minus the characters of the history turns sent), all chunks are sent in file order and `partial` is false; otherwise the sent chunk text totals at most the passage budget, chosen by the ranking and fitting rule of 053 step 4 with the ranking text of SPEC-ADDON-081 step 5 and the fitting of SPEC-ADDON-171 step 4, sent in file order, and `partial` is true.
SPEC-ADDON-081 I1. A file question with no `history` or an empty one sends the model the same system prompt, user prompt and chunks, ranked by the new question alone, as before SPEC-ADDON-081, with a video's frame-text lines filtered as SPEC-ADDON-171 states; with history and a file over budget, ranking embeds the last `history` entry's question as sent, a newline, and the new question.
SPEC-ADDON-108 I1. A video with at least one `transcript_chunks` or `fts_text_content` row gets the availability it had before SPEC-ADDON-108, the passages it had then with the frame-text line filter of SPEC-ADDON-171 applied, and its frames by SPEC-ADDON-114; availability answers `true` for a text-less video only when some profile can see, and `false` for audio with no text chunk and for a `.loft` that is unreadable or whose source is not YouTube.

## Checked, no action

- **Merging at index time instead (store lines with start and end times).** It would also
  shrink search and scene rows, but changes stored data, the OCR worker, every reader of
  `video_frame_texts`, and needs a re-read or migration of 679,067 segments. The question-time
  filter gets the measured benefit with no stored change. Revisit if another reader needs it.
- **Other windows.** Production, over-budget videos after filtering every row, by window
  measured from the previous containing row's end: 0 s 490, 30 s 457, 60 s 453, 300 s 442
  (from its start instead, whole file: 439). Under 60 s OCR flicker (a line missed in one
  segment) makes a line new again; beyond it the gain is 11 videos, and a line shown again
  much later (a revisited slide) would lose its second time. The measurement read the stored
  chunk text, cut fragments included, as the filter will.
- **Filtering against every row rather than the sent rows.** Simpler, but over budget a
  line kept only in a row that loses the ranking would reach the model in no passage (a slide
  title or a name card missing from the answer). Filtering against the sent rows keeps the
  line in the first sent row that has it.
- **Filtering only when the text exceeds the budget.** Always filtering keeps one rule for
  every video and removes noise for videos that fit too; the model loses only an exact line
  it was shown in another sent passage under a minute before, and it still has the frames.
- **Annotating a kept line with how long it stays on screen.** Adds characters to every
  line; no question type measured needs it. The frames and `get_frames` cover "what is on
  screen at t".
- **Near-duplicate lines (OCR misreads of the same text, fragments cut by chunking).** Exact
  match only: a fuzzy rule would need a threshold that behaves differently per script.
- **Re-embedding filtered rows for ranking.** The stored embedding of the whole chunk still
  describes the row; recomputing would add an embedding call per row per question. A row
  can rank on text that was removed from it; accepted.
- **`video_contents` excerpts (the section list) also repeat the same lines.** It is capped
  at 120 characters per section and is a separate reader; out of scope.
- **The normal Ask.** Its context is built from search hits in `rag/context.py`, not from a
  whole file; unchanged.
- **The remaining 453 over-budget videos** (approved chapters as an overview, a
  `get_transcript(start, end)` tool, hybrid ranking) are a separate change, decided after
  this one ships.
- **User guide.** A viewer needs nothing new to use Ask; only the addon reference paragraph
  on the budget changes.
