# Refine rewrites the keyword index of the transcript it changes

SPEC-ID: SPEC-ADDON-019

Approval: sha256:404a815720c48d1f31237699add7f8a2240bbeb1a69365375f128a5d49803eb3 Yuichi Senga 2026-10-11

## Summary

Transcript refine (`workers/refine.py`) rewrites a file's `transcript_chunks`: each refined
window's chunk text is replaced, and after the last window the file is re-chunked at
sentence boundaries with new `chunk_index` values. The keyword index (`fts_transcripts`
and `fts_transcripts_word`) is written only when the file is transcribed
(`workers/whisper.py`), so after refine it still holds the pre-refine text under the old
chunk numbers. Keyword search then misses the words refine corrected (a proper noun, a
number written as digits), still matches the words it removed, and resolves a hit's
`chunk_index` against the re-chunked rows, so the timestamp and excerpt of the hit belong
to another chunk. `docs/addons/intelligence.md` states the gap ("It does not update
keyword search"). After this change, every refine transaction that writes the file's
chunks also replaces the file's rows in both keyword tables from those chunks, so keyword
search matches what the transcript shows. Files refined before this change are not
repaired (the human's decision). For anyone who searches transcripts by keyword.

## Required items

### 1. Normal flow

SPEC-ADDON-019:

1. A refine job runs as today (`_run_refine_job`): per window, the LLM call, then a write
   block (`with get_search_db()`) that stores the refined text and realigns words.
2. In that same write block, after the window's chunk rows are updated, the file's rows in
   `fts_transcripts` and `fts_transcripts_word` are replaced with one row per
   `transcript_chunks` row of the file whose text is not blank (after stripping
   whitespace): `file_id`, `chunk_index` written as the decimal string of the chunk row's
   integer `chunk_index` (`3` → `'3'`), and `text` as stored in the chunk row. This is
   the shape the transcription path writes (`upsert_fts_transcripts`). The chunk rows are
   read after the window's edits are flushed, so the window's refined text is what is
   indexed.
3. When the job re-chunks (`rechunk_from_words`, after all windows, when something was
   refined), the same replacement runs in the re-chunk write block, after the new chunk
   rows exist, so the keyword index carries the new `chunk_index` values.
4. Embeddings are recomputed afterwards as today; the keyword index does not wait for
   them.

What is indexed is the chunk text as stored, not the LLM's output as such. Re-chunking
rebuilds chunk text from the word rows, and where forced alignment did not run (no audio,
or the aligner returned nothing) the word rows keep the transcription's words
(`.claude/rules/design-decisions.md`, Transcript Refine), so that span's chunk text, and
its keyword rows, are the pre-refine words. The keyword index follows the stored
transcript; it does not change what refine stores.

### 2. Failure cases

- Writing the keyword rows raises: the write block rolls back as a whole
  (`get_search_db` rolls back on an exception), so that window's chunk text, word rows
  and keyword rows all stay as they were, and the job ends with
  `intelligence.refine.failed` as any other exception in the job does today. Windows
  committed earlier keep their chunks and matching keyword rows.
- A window where the LLM refined nothing: no write block runs, nothing changes.
- The re-chunk write block raises (in `rechunk_from_words` or in the keyword write): it
  rolls back as a whole, so the chunk rows as committed by the last window and their
  keyword rows from that window's step 2 remain, and the job ends with
  `intelligence.refine.failed`.
- Re-chunking produces no chunks (the file has no non-blank word rows): no re-chunk write
  happens; the keyword index already matches the chunks from step 2.
- The job fails or the process stops between windows: the keyword index matches the
  chunks as committed so far.
- Files refined before this change keep their stale keyword rows until they are
  transcribed again. Accepted by the human; nothing repairs them at startup.

### 3. States

None new. The keyword rows are a mirror of `transcript_chunks`; after each committed refine
write they equal it.

### 4. Data read and written

- Read: the file's `transcript_chunks` rows, inside the write block.
- Written: the file's rows in `fts_transcripts` and `fts_transcripts_word` (deleted and
  re-inserted). No other file's rows. `fts_files`, `fts_text_content`,
  `fts_text_content_word`, `fts_retrieval_keywords` and the embeddings are not touched by
  this step.

### 5. External services

None. The LLM and aligner calls are unchanged.

### 6. Authorization

Unchanged: refine's existing feature gate and drive policy check.

### 7. Effect on existing features

Readers of `fts_transcripts` / `fts_transcripts_word` see the refined chunks of a file
refined after this change:

- keyword search (`search._keyword_search_transcripts`), whose hit text, `chunk_index`
  and timestamps now come from the same chunk;
- the required-keyword hard filter (`search._fts_lookup_required`);
- Ask citation BM25 (`citations._query_top_chunks_bm25`) and the in-file keyword chunk
  lookup (`rag/context.py`), which resolve `chunk_index` against the current chunks;
- the rarity filter's vocabulary (`rag/rarity_filter.py`, `fts_transcripts_word_vocab`),
  whose document frequencies now count refined text.

The transcription path, which writes the same tables, is unchanged.

### 8. Error behavior

None new: a failure surfaces as the existing `intelligence.refine.failed` event and
`refine job failed` log line.

### 9. User-visible behavior

For a file refined after this change, keyword search matches the transcript text stored
after refine (in the usual case, the words as refine wrote them), no longer matches words
that are in no stored chunk, and a hit opens at the timestamp of the chunk that contains
it. `docs/addons/intelligence.md` says that keyword search matches the refined transcript
instead of stating the gap.

### 10. Non-functional

Each write rewrites the file's whole keyword rows, in both tables: once per refined window
(`WINDOW_SIZE` 10 chunks) and once after re-chunking, inside the write lock that refine
already holds for that block. Measured 2026-10-11 on a copy of this machine's DB (45,265
keyword rows): for the largest transcript (2,308 chunks) one rewrite of both tables takes
about 126 ms, so each window holds the lock about 0.13 s longer, released between windows
during the LLM call; over the job's ~231 windows that adds about 29 s of lock time in
total. Accepted: other writers wait at most one window's write. No LLM or embedding cost.

## Touch points

- `addons/intelligence/app/workers/refine.py`: `_run_refine_job` (the per-window write
  block) and `rechunk_from_words` or its write block in `_run_refine_job`.
- `addons/intelligence/app/database.py`: `upsert_fts_transcripts` is called; read, not
  changed.
- Tables written: `fts_transcripts`, `fts_transcripts_word`.
- Read, not changed: `app/search.py`, `app/citations.py`, `app/rag/context.py`,
  `app/rag/rarity_filter.py`, `app/workers/whisper.py`.
- Tests: new tests citing SPEC-ADDON-019 in `addons/intelligence/tests/`.
- The addon change is committed in the addon repository; the core bumps the
  `addons/intelligence` pointer.
- Docs: `docs/addons/intelligence.md`, the Transcript refine section (the sentence on
  keyword search).
- Review topic: `docs/process/reviews/feature-refine-fts-reindex/`.
- No protected path.

## Invariants

I1. After a refine job that refined at least one chunk completes, the file's rows in
`fts_transcripts` are exactly one row per non-blank `transcript_chunks` row of the file,
with `chunk_index` equal to the decimal string of the chunk's `chunk_index` and the same
`text`; the same holds for `fts_transcripts_word`.
I2. After such a job, keyword search for a word that appears in a stored chunk's text and
not in the file's pre-refine chunks returns that file, with the hit's timestamps equal to
those of the stored chunk row whose text contains the word.
I3. After such a job, keyword search for a word that appeared in the file's pre-refine
chunks and appears in no stored chunk's text no longer returns that file from the
transcript index.
I4. When re-chunking produces no chunks, I1 still holds after the job, with the chunks'
refined text.
I5. A refine job that refines no chunk leaves the file's keyword rows unchanged.
I6. When writing the keyword rows raises inside a window's write block, that window's
chunk text and the file's keyword rows are both what they were before the window.
I7. Keyword rows of other files, and the rows of `fts_files`, `fts_text_content`,
`fts_text_content_word` and `fts_retrieval_keywords`, are unchanged by a refine job.
I8. When a job fails in window k after earlier windows committed refined text, or when its
re-chunk write block raises, the file's keyword rows equal its chunk rows as last
committed (by I1's comparison), including the refined text of the committed windows.

## Checked, no action

- **Repairing files refined before this change.** The human chose not to: they keep their
  stale keyword rows until transcribed again. (On this machine's test data no file has a
  refined chunk; production was not measured.)
- **The TF-IDF keyword vector** (`embedding_type="tfidf_keywords"`, flag
  `tfidf_keywords_indexed`). It is a dense vector used by semantic search, not the keyword
  index, and recomputing it means a new embedding call and its own retry path. SPEC-ADDON-010
  listed it beside the keyword index; it is left to its own spec.
- **Writing the keyword rows once at the end of the job only.** The per-window write keeps
  the index equal to the chunks at every commit, including when the job fails part way or
  re-chunking produces nothing (I4, I8).
- **Updating only the changed rows** instead of replacing the file's rows. The file's
  `chunk_index` values all change at re-chunk, and the transcription path already
  replaces per file; one shape for both.
- **A startup consistency check between the keyword index and the chunks.** Covered by the
  repair decision above.
