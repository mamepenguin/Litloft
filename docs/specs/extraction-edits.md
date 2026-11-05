# Correct a transcript or a picture's text, and keep the original

SPEC-ID: SPEC-ADDON-065
SPEC-ID: SPEC-ADDON-067
SPEC-ID: SPEC-ADDON-068

Approval:

## Summary

The intelligence addon turns speech into a transcript and the words in a picture into
text, and search, find in this file and Ask read only that text. When the machine gets a
name or a term wrong, the owner today has no way to fix it: the transcript panel and the
search excerpts show the wrong word, and searching for the right word does not find the
file.

This change lets the owner correct:

- **one utterance of a transcript at a time** (SPEC-ADDON-065): the rows of the
  transcript panel's 「発話」 view, which are `transcript_chunks` rows
  (`addons/intelligence/app/models.py:193-231`);
- **the text read from one picture** (SPEC-ADDON-067): the OCR text that B1 stores as the
  picture's `text_content` chunks (`addons/intelligence/app/workers/ocr.py:183-219`).

For every file it keeps exactly one **original**: the transcript or picture text as the
machine left it, stored just before the first human correction or the first Refine of
that file, whichever comes first. **元の結果に戻す** puts the whole file back to it. There
is no edit history. A file that holds a human correction is never overwritten by
automatic re-processing; only the owner's explicit restore, or an explicit redo that the
owner confirms, replaces it (SPEC-ADDON-068).

This revises a design rule. `.claude/rules/design-decisions.md` §"Transcript Refine"
says "Refine is destructive and there is nothing to revert to … Do not add a revert that
implies a stored original exists." After this change Refine stores the original before it
writes, and restore uses it. The rule is rewritten in the same change (Touch points).

Out of scope, decided by the owner on 2026-11-05/06: PDF body text, the text in video
frames and scanned PDF pages (unit B2b, later), and edit history. The editing controls
will get a Design Artifact before implementation; this spec fixes behaviour and states,
not pixels.

The core repository gets no product code (see Checked, no action). SPEC-CORE-047, reserved
for a core part, is not used.

Where this spec settles something the owner has not decided, it says so in
`## Questions for the owner` and states the answer it assumes.

## Required items

### 1. Normal flow

Terms used below:

- **utterance**: one `transcript_chunks` row. The transcript panel's 「発話」 view
  (`source === "chunks"`, `addons/intelligence/frontend/TranscriptSection.tsx:366-370`)
  draws one row per utterance with its start time (`TranscriptSection.tsx:765-877`).
- **an utterance's words**: the `transcript_words` rows of the file with
  `timestamp_start >= u.start` and `timestamp_end <= u.end` (the bounds Refine uses,
  `addons/intelligence/app/workers/refine.py:199-224`), except that a zero-duration word
  at a time `t` that is both this utterance's start and the previous utterance's end
  belongs to the previous utterance only.
- **picture text**: the text OCR read from one picture, as one string whose lines are
  separated by `\n` (the engine's lines joined by newlines, `ocr.py:262`).
- **original**: the stored snapshot described in C1.
- **corrected file**: a file with at least one saved human correction that has not been
  undone by a restore or replaced by a confirmed redo.
- **search rows**: what search, find in this file and Ask read for a file's extracted
  text: `fts_transcripts` / `fts_transcripts_word` and the `whisper` embeddings for a
  transcript (`addons/intelligence/app/workers/whisper.py:1473-1514`), `fts_text_content`
  / `fts_text_content_word` and the `text_content` embeddings for a picture
  (`ocr.py:183-219`), the file's `tfidf_keywords` embedding (`whisper.py:1244-1344`) and
  its `idf_doc_terms` freshness (`addons/intelligence/app/idf_backfill.py:59-73`).
- **busy**: for one file, a Refine job for it accepted by the route and not yet ended
  (the route claims it before answering, as `_reindex_in_flight` does,
  `routers/files.py:331-333`), a "redo confirmed" mark set on it (C8; from
  acceptance until the run stores a result, fails or the addon restarts, whether or not
  a task is in the queue at that moment), or a restore of it in progress. Queued and running are read from the index queue and the
  indexer's in-progress set (`_processing_by_type`, `indexer.py:967`). A transcription or
  OCR task that is not a confirmed redo does not make a file busy: a correction saved
  while it runs wins, because its write re-checks (C7). A pending follow-up item is not
  busy either.
- **file generation**: a per-file, per-kind counter, incremented by every write that
  replaces the whole stored text of that kind: a restore (C4), a stored transcription or
  OCR result (C9, C12), and each Refine write (window or re-chunk). A correction does
  not increment it.
- **stale item**: a follow-up item writes nothing, checked inside its own write
  transaction, when the file's generation has moved past the one it was queued at, when
  (for an utterance or picture item) the stored text is no longer the text it was
  queued for, or when the file's row has been purged. An item for a file that is in the
  trash or missing is not stale: it waits (see below).
- **the follow-up worker**: one new background worker for the whole addon. It takes one
  item at a time, across all files, in the order queued: an utterance's embedding,
  keyword vector and realignment (A8-A10), a picture's embeddings (B7), a restore's
  re-embedding (C4), and the rebuild of a corrected file's search rows (C7). It holds the
  alignment model through the same ref-counted `aligner.job_scope()` Refine uses
  (`addons/intelligence/app/workers/aligner.py:251-320`). Its pending items are stored, so
  it resumes them at start, after the start-up migrations (the embedding-model rebuild
  included) have run; an item that failed is tried again 10 minutes later and at every
  start. It does not stop while the indexing queue is paused.
  The parts of an item (embedding and keyword vector; realignment) commit separately, and
  a retry redoes only the parts not yet done. An item for a file in the trash or missing
  waits until the file is active again; a purge deletes it.

#### A. Correct one utterance (SPEC-ADDON-065)

1. On a video or audio file's page, the owner opens the transcript panel and the 「発話」
   view. Each utterance row offers **修正** (revealed like the quote button: on row hover,
   on focus inside the row, and always on a coarse pointer, as at
   `TranscriptSection.tsx:865-874`). The 「字幕」 (words) and external-subtitle views offer
   no edit. While the file is busy, **修正** is shown disabled.
2. **修正** turns that row's text into a single-line text field holding the utterance's
   current text, with **保存** and **キャンセル**. While a field is open, the panel stops
   following playback (as when the reader scrolls, `TranscriptSection.tsx:438-467`), the
   row does not seek when clicked, and the page's keyboard shortcuts do not act on keys
   typed in the field. Enter saves; Escape cancels and restores the row as it was. At most
   one row is in edit mode.
3. **保存** sends `PUT /files/{file_id}/transcript/utterances/{index}` with
   `{ "text": <new text>, "expected_text": <text shown when editing began>,
   "expected_start": <the row's start> }`. The new text is trimmed of leading and trailing
   whitespace; line breaks cannot be typed.
4. The addon checks, in order: the file is active, in `X-Lit-Drive` and has a transcript
   (else 404); the file is not busy (else 409 `busy`); an utterance with that `index`
   exists and its stored text and start equal `expected_text` and `expected_start` (else
   409 `changed`); the text is at most 2,000 characters (else 422); an empty text is not
   for the file's only remaining utterance (else 422 `last_utterance`, 「最後の発話は空に
   できません」).
5. If the new text equals the stored text, nothing is written and the answer is 200 with
   the row unchanged.
6. Otherwise, in one transaction:
   - if the file has no original yet, the original is stored (C1);
   - the file is marked corrected;
   - the utterance's words are deleted;
   - for a non-empty text: the utterance's `text` becomes the new text, it is marked
     corrected (with the time) and **realignment pending**; its `chunk_index`,
     `timestamp_start`, `timestamp_end`, `language` and `speaker_id` stay as they were;
   - for an empty text: the utterance row is deleted; the other utterances keep their
     `chunk_index` (the indexes then have a gap);
   - the file's `fts_transcripts` and `fts_transcripts_word` rows are rewritten from its
     chunk rows (blank texts skipped), as Refine does (`refine.py:418-435`);
   - the utterance's `whisper` embedding (matched by the chunk's start and end, as
     `refine.py:501-516` does) and its vector, and the file's `tfidf_keywords` embedding
     and vector, are removed, `tfidf_keywords_indexed` is set false, and the file's term
     set is marked stale (`mark_idf_terms_stale`);
   - a follow-up item for the utterance is queued (none for an empty text, except the
     keyword vector of A8).
7. The answer is 200 with the updated utterance. The panel shows the new text with a
   **修正済み** mark at once, or drops the row for an empty text. Keyword search, exact
   search and find in this file see the new text from this commit on.
8. The follow-up item, when the worker takes it:
   - embeds the utterance's text and stores its `whisper` embedding and vector;
   - recomputes the file's `tfidf_keywords` embedding from its current chunk texts and
     sets `tfidf_keywords_indexed` true (`whisper.py:1244-1344`, which also invalidates
     the Similar Files cache);
   - realigns the utterance (A9).

   A stale item writes nothing. A correction of another utterance does not make an item
   stale, so two corrections saved before the worker runs both get their embedding and
   realignment. If the keyword vector is still missing when no item is left, the existing
   keyword backfill (`indexer.py:367-413`) rebuilds it, because the flag is false. Only a
   failure to load the alignment model or to reach the audio counts toward A10's three
   attempts; an embedding failure is retried without limit.
9. Realignment uses the same WhisperX forced alignment Refine uses
   (`aligner.py:110-248`, `align_segment`) on the saved text over
   `[timestamp_start, timestamp_end]` of that utterance only, with the utterance's
   language. It decodes only that span of the file's audio, not the whole file. On
   success the aligned units become the utterance's words (each with the utterance's
   language and `speaker_id`), and the pending mark is cleared. When the language is one
   WhisperX has no alignment model for, when alignment runs and returns nothing, when the
   audio is reached but cannot be decoded, or when the file is a `.loft` reference (it has
   no audio to align against: its chunks come from a VTT, or from Media Import's temporary
   audio, which is deleted after transcription, `whisper.py:994-998`), the utterance keeps its start and
   end, has **no words**, and the pending mark is cleared. Word times are never estimated
   in proportion to time or text length (design-decisions.md §"Transcript Refine").
10. When the alignment model cannot be loaded (the first use of a language downloads it,
    `aligner.py:48-85`; or memory runs out), or the audio file cannot be reached (the
    drive is not mounted), the utterance
    stays realignment pending with no words and the item is tried again. After the third
    failed attempt the utterance ends as no word timings, like a failed alignment. To
    tell these apart, the aligner reports one of: aligned units; `unsupported` (WhisperX
    has no alignment model for the language, which `whisperx.load_align_model` signals
    with `ValueError`, and an empty language, which is never sent to it); `load_failed` (any other error while loading); `no_result`
    (alignment ran and returned nothing or raised). Only `load_failed` and an unreachable
    file are retried.
11. When an item finishes, the addon emits `intelligence.transcript.updated`
    `{file_id, drive, reason: "corrected"}` (drive-scoped through
    `post_addon_event`, `addons/intelligence/app/addon_events.py:53`). An open transcript
    panel for that file refetches the transcript and the subtitles; its subtitles fetch
    does not use a cached copy. The same event is emitted with `reason: "replaced"` when
    a Refine job completes or a transcription result is stored for the file, and with
    `reason: "rebuilt"` when a rebuild item (C7) finishes, and with `reason: "ended"`
    when a Refine job fails or a confirmed regenerate ends without a result, so an open
    panel's rows and busy state follow every change that ends; the start of busy is not
    announced, so a control can stay enabled until its request answers 409 `busy`; `intelligence.picture_text.updated`
    likewise carries `replaced` (a stored OCR result), `rebuilt` and `ended`; a rebuild that sets a flag true also calls
    `emit_processing_updated`, like every other flag change.
12. **Subtitles for a corrected utterance without words.** `subtitles.vtt`
    (`routers/files.py:240-307`) and the 「字幕」 view show a corrected utterance that has
    no words (pending, or alignment failed) as exactly one cue: its text, from its
    `timestamp_start` to its `timestamp_end` (its end cut at the next cue's start by the
    existing no-overlap rule, SPEC-ADDON-018, when they overlap), broken into lines by the existing line rules
    (`addons/intelligence/app/subtitle_builder.py:487-536`) but not split in time. This
    applies only to a file that has word rows, or whose kept original has word rows. An
    utterance that is not corrected and has no words is treated as today (no cue), and a
    file with no word rows in it or in its original (a VTT-based `.loft`, a file
    transcribed before word rows existed) keeps answering 404 whatever is corrected. The VTT's language is
    chosen as today from the first word row (`routers/files.py:290`), and from the first
    utterance only when the file has no word row left. `subtitles.vtt` is served with
    `Cache-Control: private, no-cache` instead of `max-age=300` (`routers/files.py:304`),
    so a reopened page reads the corrected cues.

#### B. Correct a picture's text (SPEC-ADDON-067)

1. On a picture's page, a new **画像の文字** section (`file-detail-sections` slot id
   `picture-text`, priority 10, declared in `addons/intelligence/manifest.json` and
   `addons/intelligence/frontend/slots.ts`; it follows `visual-description` at 9) shows
   the picture text, line by line, when the stored picture text is non-empty. Otherwise no
   section is shown. The section is shown whatever `features.image_ocr` is.
2. The section offers **修正** (disabled while the picture is busy). It turns the text
   into a multi-line text field with **保存** and **キャンセル**; Escape cancels,
   Cmd/Ctrl+Enter saves.
3. **保存** sends `PUT /files/{file_id}/picture-text` with
   `{ "text": <new text>, "expected_text": <text shown when editing began> }`. Line breaks
   are kept; trailing whitespace on each line and blank lines at the start and end are
   removed.
4. The addon checks, in order: the file is an active picture in `X-Lit-Drive` whose
   stored picture text is non-empty or that is corrected (else 404); it is not busy (else
   409 `busy`); the stored picture text equals `expected_text` (else 409 `changed`); the
   text is at most 100,000 characters (else 422).
5. If the new text equals the stored text, nothing is written (200).
6. Otherwise the new text is chunked with `ContentExtractor.chunk_text` at its defaults,
   as OCR does (`ocr.py:262`), and, in one transaction: the original is stored if the
   file has none (C1); the picture text becomes the new text and the file is marked
   corrected; the picture's `text_content` embeddings and vectors are removed and its
   `fts_text_content` / `fts_text_content_word` rows are replaced by the new chunks with
   `page` null (none for an empty text); `ocr_indexed` stays as it is; a
   follow-up item for the picture is queued.
7. The section shows the new text with a **修正済み** mark (and keeps showing, as a
   corrected empty text, if the owner emptied it). The follow-up item embeds the stored
   chunks as the picture's `text_content` embeddings, unless the item is stale,
   then emits
   `intelligence.picture_text.updated`
   `{file_id, drive, reason: "corrected"}`.
8. **Where the picture text is stored.** The OCR worker stores the joined text it read
   (the string it chunks) as the picture text in the same transaction as its rows
   (`ocr.py:183-219`), an empty string when it found nothing. A picture read before this
   change has no stored picture text; for it, the text shown and kept as the original is
   rebuilt from its `fts_text_content` rows by the merge find in this file already uses
   (`addons/intelligence/app/file_find.py:68-79`, overlap 200), and stored at that moment.

#### C. The original, restore, and protection (SPEC-ADDON-068)

1. **Storing the original.** The first write that changes a file's extracted text — a
   saved correction (A6, B6) or the first window a Refine job applies
   (`refine.py:772-808`) — stores the original in the same transaction, before changing
   anything:
   - for a transcript, every `transcript_chunks` row (index, text, language, start, end,
     speaker, refined time and model) and every `transcript_words` row (text, language,
     start, end, speaker) of the file as they are at that moment;
   - for a picture, the picture text as it is at that moment (B8).

   Once stored, no correction and no Refine changes it. A file has at most one original
   per kind. A file refined before this change has no machine text left to keep; for it,
   the transcript as stored at its first correction or next Refine is the original.
2. **Restore.** When a file has an original, the transcript panel's header in the 「発話」
   view (where Refine sits, `TranscriptSection.tsx:722-734`, shown whether or not Refine
   is enabled) and the 画像の文字 section offer
   **元の結果に戻す** (disabled while the file is busy). For a picture whose current text
   is empty and whose original is not, the section stays visible so restore can be
   reached. **元の結果に戻す** opens a confirmation (「修正をすべて取り消し、機械が出した元の結果に
   戻します。」, **戻す** / **キャンセル**). On **戻す**, the frontend sends
   `POST /files/{file_id}/transcript/restore` or `POST /files/{file_id}/picture-text/restore`.
3. The addon checks, in order: active file in `X-Lit-Drive` (else 404); it has an
   original of that kind (else 404); it is not busy (else 409 `busy`).
4. Restore, in one transaction: replaces all of the file's chunks and words (or its
   picture text) with the original's, so that utterance count, indexes, boundaries,
   texts, refined marks and word times are exactly the original's; clears every
   correction mark and realignment-pending mark and drops the file's queued follow-up
   items; rewrites the file's keyword rows (for a picture, the `fts_text_content` rows
   from the original chunked as in B6); removes its `whisper` and `tfidf_keywords` (or
   `text_content`) embeddings and vectors; sets `tfidf_keywords_indexed` false; leaves `whisper_indexed` and
   `ocr_indexed` as they are; marks its term set stale; increments its file
   generation; deletes the original; and queues a
   follow-up item that embeds the restored texts and recomputes `tfidf_keywords`. The
   answer is 200; the addon emits `intelligence.transcript.updated` or
   `intelligence.picture_text.updated` with `reason: "restored"`.
5. After a restore the file is in the machine state: no original, no corrections, not
   protected. A later correction or Refine stores a new original from that state.
6. **Protection.** For a corrected file with no confirmed redo (C8), no automatic path
   calls the transcription provider or the OCR engine for it, or changes or deletes its
   chunks, words, picture text, marks or original. The automatic paths are:
   - the text-embedding model rebuild at startup, which deletes all vectors and the
     `fts_text_content` rows and resets `whisper_indexed` and `ocr_indexed`
     (`addons/intelligence/app/database.py:653-722`);
   - the `.loft` reset when a reference gains a VTT or temporary audio
     (`addons/intelligence/app/indexer.py:666-740`), which no longer considers a corrected
     reference at all, so a Media Import `*.stt_temp.m4a` beside it does not win over the
     correction and does not reset its flag on every reconcile;
   - `_resume_incomplete` and reconcile re-queuing files whose flag is false
     (`indexer.py:742-840`), with any `features.image_ocr` mode;
   - the folder Refine (`POST /refine/folders`, `routers/refine.py:128-200`), which skips
     corrected files and lists them in a new `skipped_corrected` field of its answer;
   - the startup clean-up of transcription jobs left running (`whisper.py:1531-1590`),
     which today deletes the file's transcript via `_remove_whisper_data`; for a corrected
     file it only marks the job failed.
7. **Rebuilding search rows without re-running extraction.** At the very start of the
   transcription task (`index_whisper`, before the `.loft` branch, the provider set-up
   and the policy checks, `whisper.py:818-998`) and of the OCR task (`index_ocr`, before
   the engine is created, `ocr.py:225-279`), a corrected file without a confirmed redo is
   not processed: the task queues a rebuild item for the follow-up worker and returns
   without changing the flag. At start the follow-up worker also queues a rebuild item for
   every corrected file whose `whisper_indexed` or `ocr_indexed` is false, whatever the OCR
   mode. A rebuild item creates the file's missing search rows from the stored text only
   (the chunk rows for a transcript; the stored picture text, chunked as in B6, for a
   picture), and then sets the flag true. If its embedding fails, the flag stays false
   and the item is tried again.

   **Re-check at write time.** A transcription or OCR task can pass the guard and then
   meet a correction saved while it ran. So `_persist_transcript`
   (`whisper.py:1395-1528`), the `.loft` VTT path (`whisper.py:1778-1890`) and OCR's
   `_write` (`ocr.py:183-219`) check again inside their own write transaction: if the file
   is now corrected without a confirmed redo, they write nothing (the result is
   discarded, the flag is left false) and queue a rebuild item. The zero-segment branch
   of `_persist_transcript` (`whisper.py:1408-1432`) re-checks the same way before it
   sets the flag. For a discarded transcription the job record ends `skipped` with the
   reason `corrected` (the shape `_record_skipped_job` writes, `whisper.py:1038`), no
   `intelligence.transcription.completed` is emitted, and the task returns False, so
   summaries and suggested tags are not re-queued and no keyword vector is computed from
   the discarded result; a discarded OCR result likewise returns False.
8. **Explicit redo.** These requests replace a corrected file's text:
   - `POST /files/{file_id}/reindex` with `whisper` or `ocr` in `tasks`
     (`routers/files.py:336-478`), sent from **Index details → 再生成**
     (`addons/intelligence/frontend/IndexDetailsDialog.tsx:225-245`) and from the failed
     jobs list's **再試行** (`addons/intelligence/frontend/FailedJobsModal.tsx:133`);
   - `POST /refine/files/{file_id}` (`routers/refine.py:101-125`), sent from the
     transcript panel's Refine button. It gains an optional JSON body
     `{ "overwrite_corrections": bool }`. Its checks run in this order: the existing
     feature gate (400), drive policy (403) and LLM gate (`require_llm`), then the file
     (404), then corrected (409 `corrected`), then busy (409 `busy`, which also refuses a
     second Refine of the same file while one is running). Folder Refine claims each file it
     queues before answering, and skips (without listing) a file that already has a Refine
     claimed, so a file never has two Refine jobs at once.

   For a corrected file each is refused with 409 `corrected`, with nothing reset, queued
   or started, unless the body carries `"overwrite_corrections": true`. The flag on a kind
   that is not corrected is ignored and sets no mark. For reindex the
   checks run in this order: the body (422), the file (404), `ocr` on a non-picture or
   with OCR `false` (422), then the corrected check, which refuses the whole request if any
   of `whisper` / `ocr` would touch a corrected kind; only then does the existing
   already-queued split run. A confirmed reindex sets the "redo confirmed" mark for that
   kind before the already-queued split, so a task already in the queue runs as the
   confirmed redo.

   How the frontend knows a file is corrected: `GET /files/{id}/transcript` and
   `GET /files/{id}/picture-text` carry `corrected`; `GET /files/{id}/index-details` gains
   `corrected: {transcript: bool, picture_text: bool}`. The transcript panel's Refine and
   Index details confirm before sending: for a corrected kind, Index details' existing
   regenerate confirmation (`IndexDetailsDialog.tsx:355-372`) shows the text below instead
   of its usual one (one dialog, not two). The failed jobs list does not know, and
   confirms when an answer is 409 `corrected`; every surface does the same on such an
   answer. The texts: 「このファイルには手で直した箇所があります。再生成すると、修正と保存して
   ある元の結果は消えます。」 (Index details, failed jobs) or 「このファイルには手で直した箇所が
   あります。AI 補正は修正後の文章を書き換えます。」 (Refine), with **続ける** /
   **キャンセル**; the request is (re)sent with the flag only after **続ける**.
9. **What a confirmed regenerate does.** The "redo confirmed" mark lets exactly one
   transcription (or OCR) run replace the file:
   - When that run stores a result with at least one utterance (or, for OCR, at least
     one line), the result replaces the corrected text, and the corrections, the
     original and the mark are deleted, the generation incremented and the file's queued
     follow-up items dropped, in the same transaction.
   - When the run ends with a failure, the corrected text, the marks and the original
     stay as they were, the "redo confirmed" mark is cleared, and the file is protected
     again (a later regenerate needs a new confirmation). For transcription: the provider
     or the provider set-up fails (any error class, recorded as a failed job as today,
     so it appears in the failed jobs list); it returns no segments (the job ends
     `succeeded` as today); a confirmed `.loft` run finds no VTT, an empty one or no
     chunks; or an admin marks the failed job resolved
     (`routers/admin.py:1234-1293`). For OCR: the file is unreadable, the engine fails, or
     it reads no line; in each case OCR's own empty write (`ocr.py:254-267`) does not run
     for a corrected picture.
   - When the run is deferred without a result — a transient cloud-policy error
     (`whisper.py:946-952`), the `index` policy off at dequeue (`:974-979`), a path that
     fails validation (`:905-907`), a file that cannot be reached (`ocr.py:229-250`) — the mark stays and the retry is still
     the confirmed run. A deferred confirmed OCR run is re-queued by the follow-up worker's
     10-minute retry whatever `features.image_ocr` is. An OCR engine that cannot be
     created stays failed for the life of the process (`ocr.py:71-103`), so it, and a
     failed embedding of the confirmed run's text (`ocr.py:269-273`), count as failures.
   - After a failure, the corrected file's flag is set true by a rebuild item, which the
     failure queues (the corrected rows are intact, so it only adds what is missing). An
     admin's resolve of a failed job on a corrected file (`routers/admin.py:1278-1282`)
     queues the same rebuild instead of setting `whisper_indexed` and
     `tfidf_keywords_indexed` true itself.
   - When a confirmed regenerate ends without a result, Index details shows
     「再生成できませんでした。修正はそのまま残っています。」 on that task's row the next time
     it is opened.
   - At every start of the addon, every "redo confirmed" mark is cleared before any task
     runs, so a confirmed run that was queued or running when the container stopped ends
     there.
10. **What a confirmed Refine does.** It runs on the corrected text, with these
    differences from today's Refine:
    - it is refused with 409 `busy` while any follow-up item of the file is queued or
      running (which covers every realignment-pending utterance); this applies to every
      per-file Refine, corrected or not, and folder Refine skips such files as busy;
    - a corrected utterance without words is left out of the LLM windows
      (`refine.py:757-814`): its text is neither sent nor written;
    - re-chunking (`rechunk_from_words`, `refine.py:307-415`) keeps every corrected
      utterance without words exactly as it is (text, start, end, marks) and builds the
      new utterances only from the words outside those utterances' spans, so no text is
      lost; then every utterance of the file, kept or rebuilt, is renumbered `0..n-1` by
      start time, the keyword rows are rewritten from the renumbered rows, and the kept
      utterances are re-embedded together with the rebuilt ones (`rechunk_from_words`
      deletes every `whisper` embedding of the file, `refine.py:372-385`);
    - the file stays corrected and keeps its original (C1); utterances rebuilt from words
      do not carry the per-utterance 修正済み mark;
    - each window write and the re-chunk increment the generation, and the re-chunk drops
      the file's queued follow-up items.

    An open panel holding old indexes gets 409 `changed` on its next save and refetches.
11. **Refine keeps the original.** A Refine job on a file with no original stores it (C1)
    in the transaction of its first applied window. A job that applies no window stores
    nothing. After Refine, 元の結果に戻す is offered.
12. **Other writes that end an original.** On a file that is not corrected, every stored
    machine result — `_persist_transcript` (`whisper.py:1395-1528`), the `.loft` VTT path
    (`whisper.py:1778-1890`) and the OCR write (`ocr.py:183-219`) — deletes the file's
    original of that kind in its own transaction, because the file's machine state is
    now that result. (A refined file that is re-transcribed loses its refine and its
    original, as it loses its refine today.) The zero-segment success path of
    `_persist_transcript` (`whisper.py:1408-1432`) writes no transcript and deletes
    nothing. A refined file whose transcript the startup clean-up deleted
    (`whisper.py:1561`) keeps its original until its next stored result deletes it; with
    no utterances the panel is not shown, so restore is not offered for it meanwhile.

#### D. Answers the frontend reads

- `GET /files/{id}/transcript` (`TranscriptResponse`, `schemas.py:235`) gains
  `has_original` (bool), `corrected` (bool) and `busy` (bool); each chunk
  (`TranscriptChunkResponse`, `schemas.py:218`) gains `correctedAt` (time or null) and
  `wordsPending` (bool), next to the existing `refinedAt`.
- `GET /files/{id}/picture-text` answers
  `{file_id, text, corrected, has_original, busy}`. It answers 404 for a file that is not
  an active picture in `X-Lit-Drive`, and for a picture with no stored or rebuildable
  picture text, or whose text is empty and which has no original. It does not depend on
  `features.image_ocr`.
- `PUT …/utterances/{index}` answers the updated chunk in the shape above; `PUT
  …/picture-text` and both restores answer the `GET` shape of their kind.
- `POST /refine/folders` gains `skipped_corrected` (list of file ids); the folder Refine
  button reports 「手で直したファイル {n} 件は対象外にしました」 next to its existing result
  when `n > 0`.
- `GET /files/{id}/index-details` gains `corrected` (C8) and
  `redo_ended_without_result: {transcript: bool, picture_text: bool}` (C9), true from a
  confirmed regenerate that ended without a result until the next correction, restore
  or confirmed regenerate of that kind.

### 2. Failure cases

| Step | What goes wrong | What the system does |
|---|---|---|
| A3, B3, C2 | The request fails (network, 5xx) | Nothing changes server-side; the field stays open with the typed text and 「保存できませんでした」; the confirmation closes with 「戻せませんでした」. |
| A4, B4 | The text changed since the field opened (another tab, a Refine that finished, a restore) | 409 `changed`; nothing is written; the UI shows 「内容が更新されました。読み込み直してから修正してください。」, refetches, and closes the field. |
| A4, B4, C3, C10 | The file is busy | 409 `busy`; nothing is written; 「処理中のため、いまは操作できません。」 |
| A4, B4 | Text over the length cap | 422; nothing is written; the field stays open with 「長すぎます」. |
| A4, B4, C3 | File missing, trashed, unknown, in another drive, or without a transcript / picture text / original | 404; nothing is written; the field stays open with its text and 「このファイルは編集できなくなりました。」, or the restore dialog closes with that text. |
| A4 | Emptying the only remaining utterance | 422 `last_utterance`; nothing is written; the field stays open with 「最後の発話は空にできません」. |
| A6, B6, C4 | The write transaction raises | It rolls back: text, marks, words, keyword rows, embeddings, the original and the queued items are all as before; 500. |
| A8, B7, C4, C7 | Embedding fails or the embedder is unavailable | The stored text and keyword rows stay; the item is tried again (follow-up worker). Until then semantic search has no vector for that utterance or file. |
| A8, B7 | The text changed again before the item ran | The item writes nothing; the newer item does the work. |
| A9 | Alignment fails or does not apply | The utterance keeps start and end and has no words; subtitles show it as in A12. |
| A10 | The alignment model cannot be loaded | The utterance stays realignment pending, subtitles show it as in A12, and the item is tried again. |
| A8, C7 | Container restarts before an item ran | Items and marks are stored; the worker resumes them at start. |
| C6 | An automatic path reaches a corrected file | It queues a rebuild item only (C7); the provider and the engine are not called and nothing stored is changed. |
| C8 | A redo request without the flag reaches a corrected file (an old tab, the failed jobs list, the MCP server, a script) | 409 `corrected`; nothing is reset, queued or started; the frontend shows the C8 confirmation. |
| C9 | A confirmed regenerate fails, finds nothing, is cut by a restart, or is marked resolved | Corrected text, marks and the original stay; the redo mark is cleared; the file is protected again. |

### 3. States

Per file and per kind (transcript, picture text):

| State | Original stored | Corrected | Automatic re-processing |
|---|---|---|---|
| Machine | no | no | allowed (today's behaviour) |
| Refined (transcript only) | yes | no | allowed; a stored re-transcription result replaces the refined text and deletes the original (C12) |
| Corrected | yes | yes | not allowed (C6, C7) |
| Corrected, redo confirmed | yes | yes | the one confirmed run only (C9) |

Allowed transitions:

- Machine → Refined: a Refine job applies its first window (C11).
- Machine or Refined → Corrected: a correction is saved (A6, B6).
- Corrected → Corrected: another correction; a confirmed Refine (C10).
- Refined or Corrected → Machine: restore (C4).
- Refined → Machine: a stored transcription result (C12).
- Corrected → Corrected, redo confirmed: a confirmed regenerate is accepted (C8).
- Corrected, redo confirmed → Machine: the confirmed run stores a non-empty result (C9).
- Refined → Refined: another Refine (the original stays).
- Refined → Refined, no utterances: the startup clean-up deletes the transcript of a
  re-transcription cut by a restart (C12). Restore through the API is allowed and puts
  the original back; the panel is not shown, so the UI does not offer it. A stored
  result moves it to Machine and deletes the original.
- Corrected, redo confirmed → Corrected: the confirmed run ends any other way, or the
  addon starts again before it stored a result (C9).
- Any → (no rows): the file is purged (`files.purged`, or the startup purge of a drive
  whose `index` policy is off).

Refused: a correction, restore or Refine while the file is busy (409 `busy`), so a
correction cannot be saved while a confirmed run is queued or running; restore without
an original (404); Refine of picture text (no such feature); a regenerate of a corrected
file without the flag (409 `corrected`); a Refine while an utterance is realignment
pending (409 `busy`); emptying the only remaining utterance (422). A deferred confirmed run keeps the file in Corrected, redo confirmed, and busy, until it
stores a result, fails or the addon restarts; a correction or restore cannot be saved in
between. There is no "Machine, redo confirmed" state: the flag on a kind that is not corrected sets no mark.

Per utterance:

| State | Text | Words |
|---|---|---|
| Machine | as transcribed or refined | from the transcription or Refine's alignment |
| Corrected, realignment pending | saved text | none |
| Corrected, aligned | saved text | from forced alignment of the saved text |
| Corrected, no word timings | saved text | none (alignment failed or does not apply) |

Transitions: any state → pending, on a save of a non-empty different text; any state →
(row deleted), on a save of an empty text; pending → aligned or no word timings, by the
follow-up; pending stays pending when the model cannot be loaded, and becomes no word
timings after the third such attempt (A10); any → the original's
rows, on restore; a confirmed Refine keeps corrected utterances without words as they
are and replaces the others by Machine-state utterances rebuilt from words (C10); a
rebuild item (C7) changes no utterance state.

### 4. Data read and written

All in the intelligence addon's `search.db`; the core DB is not touched.

| Store | Read / write |
|---|---|
| `transcript_chunks` | read; written by A6 (text, correction mark, realignment-pending mark; row delete for an empty text), A9 (pending mark cleared), C4 (all rows replaced), C9 and C12 (replaced by a new result). New nullable columns for the correction time and the realignment-pending mark, added by an idempotent migration. |
| `transcript_words` | read; written by A6 (the utterance's words deleted), A9 (inserted), C4 (all rows replaced). |
| `indexed_files` | read; written: new file-level marks — corrected (per kind) and redo confirmed (per kind) — the "redo ended without result" mark (per kind), and the file generation per kind, plus `whisper_indexed` / `ocr_indexed` / `idf_terms_*` as today. Idempotent migration. |
| New table: kept originals | one row per file and kind at most: stored time, trigger (correction or Refine), and the snapshot of C1. Written by C1. Deleted by C4, C9 (stored result), C12, `_purge_file` and `purge_drive`. |
| New table: picture texts | one row per picture: the current picture text. Written by the OCR worker (B8), B6, C4, C9 and the first read of a legacy picture (B8); deleted by `_purge_file` and `purge_drive`. |
| New table: follow-up items | pending items (file, kind, utterance index, the file generation and the text they were queued for, attempts, last attempt). Written by A6, B6, C4, C7; deleted when done, by C4 for the file, and by the purge. |
| `fts_transcripts`, `fts_transcripts_word` | rewritten per file by A6 and C4. |
| `fts_text_content`, `fts_text_content_word` | rewritten per picture by B6, C4 and C7. |
| `embeddings`, `vec_text` | `whisper` rows of one utterance (A6, A8), `text_content` rows of one picture (B6, B7), all of a file's `whisper` or `text_content` rows (C4, C7), and the `tfidf_keywords` row (A8, C4, C7). |
| `job_records` | read for "transcription running"; `fail_orphaned_running_jobs` writes them as today. |
| The index queue (in memory) | read for "queued". |
| The file's audio on disk | read: one utterance's span (A9). |
| `model_cache_dir` | read; the first alignment of a language writes the WhisperX model there (A10). |

### 5. External services

- **WhisperX alignment model download.** `whisperx.load_align_model` fetches the
  per-language wav2vec2 model into `model_cache_dir` on first use (`aligner.py:63-72`).
  It sends no user data. While it is slow, the follow-up worker waits on it; when it
  fails, A10 applies. Once cached there is no network call.
- Nothing else. The embedder and the aligner run in the container; no correction, text or
  audio is sent to an LLM or any outside service. Refine, which sends text to the
  configured LLM, is unchanged apart from C8, C10 and C11.

### 6. Authorization

Anyone who can open the file may correct it and restore it, as anyone who can open it
may Refine it today. Checks:

- The core's addon proxy: each new route is declared in
  `addons/intelligence/manifest.json` with `pre_check {type: "file_access", param:
  "file_id"}` and `require_drive: true`, like `/refine/files/{file_id}`. A locked drive's
  or another drive's file gets 404 from the proxy.
- The addon: `require_drive` and a lookup restricted to `IndexedFile.drive == drive` and
  `active` (as `_fetch_indexed_file`, `routers/refine.py:84-99`), answering 404
  otherwise.
- No new policy feature: correction needs only the drive's existing `index` policy (a
  drive with it off has no transcript or picture text to correct).

### 7. Effect on existing features

- **Transcript panel** (`TranscriptSection.tsx`): gains the edit mode, the 修正済み mark,
  元の結果に戻す, disabled controls while busy, and a refetch (transcript and subtitles)
  on `intelligence.transcript.updated`. The Refine button asks for confirmation on a
  corrected file (C8).
- **Subtitles** (`routers/files.py:240-307`, `subtitle_builder.py`): one cue per
  corrected utterance without words (A12); `Cache-Control` becomes `private, no-cache`.
  Files with no corrections get exactly the cues they get today. The core player's
  `<track>` (`frontend/src/components/VideoPlayer.tsx:250-257`,
  `frontend/src/hooks/useShellCaptions.ts:49`) loads the VTT once per page and shows a
  correction the next time the page is opened; it is not changed.
- **Search, exact search, find in this file, Ask, the single-file question, the MCP
  `get_transcript` tool** (`mcp-server/src/tools/read.ts:360-380`): read the chunk text,
  keyword rows and embeddings, so they see corrections with no change of their own. Find
  in this file reads `fts_transcripts` joined to `transcript_chunks`
  (`file_find.py:172-198`) and `fts_text_content` (`file_find.py:120-169`). An emptied
  utterance is a deleted row, so no reader sees an empty utterance.
- **Refine** (`workers/refine.py`, `routers/refine.py`): stores the original (C11),
  refuses a corrected file without the flag (C8) and while an utterance is pending
  (C10), keeps utterances without words through re-chunking (C10), and folder Refine
  skips corrected files (C6).
- **Transcription worker** (`whisper.py`): the corrected-file guard at the start of
  `index_whisper` (C7), the confirmed redo (C9), original deletion (C12), and the orphan
  clean-up leaves a corrected file's rows. All three callers of `_remove_whisper_data`
  (`whisper.py:1443, 1561, 1833`) are reached only after the guard or for files the
  guard lets through.
- **OCR worker** (`ocr.py`): stores the picture text (B8), the corrected-file guard
  (C7), original deletion (C12).
- **Embedding-model rebuild** (`database.py:546-734`): unchanged; its flag resets now
  lead corrected files into C7.
- **Index details and the failed jobs list** (`IndexDetailsDialog.tsx`,
  `FailedJobsModal.tsx`): the C8 confirmation and the flag.
- **Derived LLM output** — summaries, detailed summaries and their citations, suggested
  tags, chapter suggestions, retrieval keywords, the Visual Index's nearby transcript —
  is not regenerated or invalidated by a correction (Checked, no action).
- **`idf_doc_terms`**: corrections and restores mark the file stale, which the existing
  backfill handles (spec idf-term-table I2).
- **Purge**: `files.purged` and the startup drive purge delete a file's original, picture
  text, marks and follow-up items with the rest of its data.

### 8. Error behavior

What the owner sees is in the failure table (§2). The texts are in the addon's
`frontend/messages/{ja,en}.json`. Logged by the addon:

- INFO when an original is stored (file id, kind, trigger), when a restore commits, when
  an automatic path or task hands a corrected file to the rebuild, and when a confirmed
  redo ends without a result.
- WARNING when alignment fails (file id, utterance index, reason class), when the
  alignment model cannot be loaded, and when a follow-up item fails.
- No text of a transcript or picture is written to the log.

### 9. User-visible behavior

- Transcript panel, 「発話」 view: **修正** per row (hover, focus, coarse pointer;
  disabled while busy); single-line field; **保存** / **キャンセル**; Enter / Escape; a
  **修正済み** mark on corrected rows, next to the existing AI 補正 mark when both apply;
  an emptied row disappears. **元の結果に戻す** in the header when an original exists.
- 「字幕」 view and `subtitles.vtt`: a corrected utterance's new words once its item
  finishes; before that, or when alignment failed, the utterance's text as one cue over
  its own span (A12). The player's subtitle track shows corrections the next time the
  file's page is opened.
- Picture page: a **画像の文字** section when the picture has text (or has an original to
  restore), with **修正**, a multi-line field, **修正済み**, and **元の結果に戻す** when an
  original exists.
- Confirmations: restore (C2); regenerate or retry of a corrected file, and Refine of a
  corrected file (C8).
- Search excerpts, find-in-file rows and Ask citations show the corrected text; folder
  Refine reports the corrected files it skipped.
- English labels: "Edit", "Save", "Cancel", "Edited", "Restore original", "Text in
  image", and the confirmation texts translated.
- Docs: `docs/addons/intelligence.md` documents correction, the original, restore,
  protection, the new routes, `skipped_corrected` and the events, and rewrites
  §"Transcript refine" (`:289-297`, "there is no undo"); `docs/reference/websocket-events.md`
  (`:56`) lists the two new events; `docs/user-guide/viewers-and-players.md` says where to
  correct a transcript, that a corrected file is not re-transcribed automatically, and
  that the player shows corrected subtitles after the page is reopened;
  `docs/user-guide/search.md` says picture text can be corrected on the picture's page.

### 10. Non-functional

- Save latency: A6, B6 and C4 are each one short write transaction; no embedding,
  alignment or audio decode runs inside a request or under the `search.db` write lock.
- One follow-up worker for the addon, one item at a time; alignment of one utterance
  decodes at most that utterance's span (20 s at the default `max_segment_duration`,
  `addons/intelligence/app/config.py:99`). The alignment model (about 1 GB per language,
  `aligner.py:24-36`) is shared with Refine through `job_scope` and released when neither
  has work.
- Size: an utterance's text at most 2,000 characters; a picture text at most 100,000. The
  original of a long transcript holds every chunk and word row (tens of thousands of rows
  for a 2-hour video), stored once per file.
- Privacy: nothing leaves the container except the one-time alignment model download,
  which carries no user data.
- Schema: the migrations add columns and tables only, are idempotent, and leave existing
  rows' values unchanged.

## Touch points

- `addons/intelligence/app/models.py`: new columns on `TranscriptChunk` and `IndexedFile`;
  the kept-original, picture-text and follow-up-item tables.
- `addons/intelligence/app/database.py`: idempotent migrations for the above.
- `addons/intelligence/app/routers/files.py`: `GET /files/{id}/transcript` gains the
  fields of D; `GET /files/{id}/index-details` (`:481`) gains `corrected`;
  `PUT /files/{id}/transcript/utterances/{index}`; `POST /files/{id}/transcript/restore`;
  `GET` / `PUT /files/{id}/picture-text`; `POST /files/{id}/picture-text/restore`;
  `POST /files/{id}/reindex` gains `overwrite_corrections` and the check order of C8
  (`:336-478`); `GET /files/{id}/subtitles.vtt` (`:240-307`): cues for corrected
  utterances without words and `Cache-Control: private, no-cache`.
- `addons/intelligence/app/rag/tools/get_file_chunks.py`: ranges by `chunk_index`, not by
  list position.
- `addons/intelligence/app/main.py` lifespan: clear every redo mark at start, after
  `fail_orphaned_running_jobs` and before the indexer and the follow-up worker take work.
- Every embedding the follow-up worker writes keeps today's id shapes (`wh_<file>_<chunk
  index>_<hex>`, `ocr_<file>_<index>_<hex>`), because citations parse them.
- `addons/intelligence/app/workers/refine.py` `realign_words_for_chunk`: treats every
  non-success outcome of the aligner as today's `None` (keeps the old words).
- `addons/intelligence/app/routers/admin.py`: marking a failed transcription job resolved
  (`:1234-1293`) clears the transcript redo mark and, on a corrected file, queues a
  rebuild instead of setting `whisper_indexed` / `tfidf_keywords_indexed` true (C9). OCR writes no job record, so it has
  no such path.
- `addons/intelligence/app/schemas.py`: `TranscriptChunkResponse` (`:218`),
  `TranscriptResponse` (`:235`), the new request and response models.
- `addons/intelligence/app/subtitle_builder.py`: one cue per corrected utterance without
  words.
- `addons/intelligence/app/routers/refine.py`, `app/workers/refine.py`: store the original
  in the first applied window; `overwrite_corrections`; the route claims the file as busy
  before answering (today `_active_refine_files` is filled only when the task runs,
  `workers/refine.py:654`); busy while an utterance is pending; corrected utterances
  without words left out of the windows; `rechunk_from_words` keeps them and renumbers;
  generation increments; folder Refine skips corrected files
  and answers `skipped_corrected`; the docstrings that say revert does not exist
  (`routers/refine.py:7-10`, `workers/refine.py:147-151`) are deleted.
- `addons/intelligence/app/workers/whisper.py`: the guard at the start of `index_whisper`;
  the confirmed redo and original deletion in `_persist_transcript` and the `.loft` VTT
  path; `fail_orphaned_running_jobs` leaves a corrected file's rows and clears its redo
  mark.
- `addons/intelligence/app/workers/ocr.py`: store the picture text; the guard; original
  deletion; the confirmed redo.
- `addons/intelligence/app/workers/aligner.py`: called for one utterance's span; decoding
  only that span.
- A new follow-up worker in `addons/intelligence/app/workers/`, started and resumed from
  `addons/intelligence/app/main.py` / `app/indexer.py`.
- `addons/intelligence/app/indexer.py`: `_reset_loft_refs_with_new_vtt` (`:666-740`) and
  `_resume_incomplete` (`:742-840`) reach corrected files only through the guard;
  `_purge_file` (`:2304`) deletes the new rows.
- `addons/intelligence/app/purge.py`: the per-drive purge covers the new tables (via
  `_purge_file`).
- `addons/intelligence/app/addon_events.py`: the two new events, drive-scoped.
- `addons/intelligence/manifest.json`: proxy routes for the new paths; the
  `file-detail-sections` entry `picture-text`, priority 10.
- `addons/intelligence/frontend/TranscriptSection.tsx` (also: the playback highlight
  compares positions with positions, not with `chunk_index`), `IndexDetailsDialog.tsx`,
  `FailedJobsModal.tsx`, `FolderRefineButton.tsx` (reports `skipped_corrected`),
  `api.ts`, a new picture-text section and its `slots.ts` entry,
  `messages/{ja,en}.json`.
- `addons/intelligence/tests/` and the addon's frontend tests: tests citing the three
  SPEC-IDs.
- `.claude/rules/design-decisions.md` §"Transcript Refine": the sentences "Refine is
  destructive and there is nothing to revert to …" and "Do not add a revert that implies
  a stored original exists." are replaced by the rule of C1/C4 (one kept original per
  file, stored before the first correction or Refine, restore puts it back, no history);
  a new rule states C6/C7 (automatic paths never overwrite a corrected file) and that a
  corrected utterance whose alignment fails has no words, while a Refine window whose
  alignment fails keeps the old ones. **This revises a project design rule.**
- `docs/addons/intelligence.md`, `docs/reference/websocket-events.md`,
  `docs/user-guide/viewers-and-players.md`, `docs/user-guide/search.md`.
- `docs/specs/INDEX.md`: three draft rows; at approval, the SPEC-ADDON-051 row set to
  `superseded` (question 8).
- The core's `addons/intelligence` submodule pointer, bumped to the merged addon commit
  (CLAUDE.md, "Git"); the SPEC-ADDON rows become `implemented` with that bump.

No protected path of the core is edited: no `internal.py`, `addon_proxy.py`, auth,
scanner, file operations, core database, Dockerfile, compose or gate file.

## Invariants

I1. Saving a correction to one utterance changes only that utterance and its words: every other utterance's text, start, end and index, every word outside the utterance's words (a zero-duration word at the boundary it shares with the previous utterance included), and the corrected utterance's start, end, index, language and speaker are byte-for-byte unchanged, through the save and its follow-up.
I2. After a correction or a restore commits, keyword search, exact search and find in this file return the file for a term that occurs only in the new text and not for a term that occurred only in the replaced text; no `whisper`, `tfidf_keywords` or `text_content` embedding, vector or `content_preview` holding the replaced text survives the commit; a stale follow-up item writes nothing, while a correction of another utterance never makes an item stale; the file's term set is marked stale and `tfidf_keywords_indexed` is false from the commit until the keyword vector is rebuilt; and pending items and realignment-pending marks survive a restart and are run again after it.
I3. After a corrected utterance's follow-up, its words are exactly the units `align_segment` returned for the saved text within its span (its midpoint placement of untimed punctuation included), or there are none; no code path writes a word time derived from length or position; `subtitles.vtt`, served with `Cache-Control: private, no-cache`, shows a corrected utterance without words as exactly one cue with its text from its start to its end in a file that has, or whose original has, word rows, while a file with no correction gets exactly today's cues and status.
I4. A file has at most one kept original per kind; it is stored in the same transaction as the first correction or the first applied Refine window, equals the file's chunk and word rows (or picture text) as they were immediately before that write, and no later correction or Refine changes it; on a file that is not corrected, a stored transcription or OCR result with at least one utterance or line deletes that kind's original in the same transaction, and the zero-segment path deletes nothing.
I5. Restore makes the file's chunk and word rows (or picture text) equal to the kept original, clears every correction, pending and redo mark, deletes the original, and leaves the keyword rows matching the restored text; a restore that raises before commit changes nothing.
I6. For a corrected file without a confirmed redo, no automatic path — the embedding-model rebuild, the `.loft` reset, `_resume_incomplete`, reconcile, a transcription or OCR task (including one that was already running when the correction was saved, whose result is discarded), or the startup clean-up of running jobs — calls the transcription provider or the OCR engine for it, or changes or deletes its chunk rows, word rows, picture text, marks or original; it only adds search rows built from the stored text, and does so under every `features.image_ocr` mode.
I7. Reindex with `whisper` or `ocr`, and per-file Refine, on a corrected file answer 409 and change no flag, queue no task and start no job unless the body has `overwrite_corrections: true`; the frontend sends that flag only after the viewer confirms a dialog for that file; and folder Refine starts no job for a corrected file and lists exactly the corrected files it skipped in `skipped_corrected`.
I8. A confirmed regenerate removes the corrections and the original only in the transaction that stores its non-empty result; when it fails, finds nothing, is marked resolved, or the addon restarts before it stored a result, the corrected text, marks and original are as before and the file is protected again.
I9. A Refine of a file is refused with 409 while another Refine of it is accepted and not yet ended (the claim exists before the route answers) and while any follow-up item of the file is queued or running; a confirmed Refine re-embeds every utterance it leaves, kept or rebuilt; a confirmed Refine of a corrected file sends no corrected utterance without words to the LLM and leaves its text, start and end unchanged, and the file stays corrected with its original unchanged.
I10. Every correction and restore route answers 404 and writes nothing for a file outside `X-Lit-Drive`, missing, trashed or not indexed, answers 409 and writes nothing while the file is busy or when the expected text or start does not match, and touches no row of any other file; the two new events carry the file's drive so a viewer without access to it does not receive them; and after `files.purged` or a drive purge no original, picture text, mark or follow-up item of a purged file remains.
I11. The OCR worker stores, in the same transaction as its rows, exactly the joined text it chunked as the picture text; a picture read before this change gets, on first read, the text rebuilt from its `fts_text_content` rows by the find-in-file merge, and that text is what is kept as its original.

## Revises

SPEC-ADDON-050 I1. After a successful OCR run on an active picture that is not corrected, it has `ocr_indexed` true, the engine's kept lines joined by newlines stored as its picture text, and exactly those lines chunked at 1000/200 as its `text_content` embeddings and `fts_text_content` rows with `page` null, and no earlier OCR rows.
SPEC-ADDON-050 I2. A reached picture that is not corrected, with no recognised text, one that cannot be decoded, or one over 50 MB or 50 million pixels (checked before decoding) ends with `ocr_indexed` true and no OCR rows, and no sweep queues it again; for a corrected picture under a confirmed redo the same outcomes leave its corrected text and rows as they were.
SPEC-ADDON-050 I6. A picture's `text_content` and `fts_text_content` rows are removed only by its own OCR write, a correction or restore of its picture text, the rebuild of a corrected picture's search rows from its stored text, a text-embedding model purge, a file purge, or the startup purge of a drive whose `index` policy is off; none of these writes or removes another file's rows.

## Questions for the owner

Each states the answer this spec assumes.

1. **Picture with no text.** A picture whose OCR found nothing shows no 画像の文字
   section and cannot be given text (B1, B4). Assumed: yes, out of scope.
2. **Refine of a corrected file.** Allowed after confirmation; utterances without words
   pass through re-chunking unchanged; refused while one is pending (C10). Assumed: yes.
3. **OCR mode.** A corrected picture's search rows are rebuilt from its stored text under
   every `features.image_ocr` mode, and the section and correction work when OCR is
   `false` (B1, C7). Assumed: yes.
4. **Subtitle fallback.** Only corrected utterances without words get a cue from their
   text; `.loft` and legacy files keep today's subtitles (A12). Assumed: yes.
5. **Player track.** The core player's subtitle track shows corrections only after the
   page is reopened; no core change (A12, §7). Assumed: yes. Reloading the track live is a
   core change that would need SPEC-CORE-047.
6. **Drive purge.** Turning a drive's `index` policy off, and removing or renaming a
   drive in `drives.json` (`purge.py:330-341` purges drives the core no longer knows),
   purge its corrections and originals with the rest of its intelligence data (§7), and
   `docs/addons/intelligence.md` says so. Assumed: yes.
7. **Busy controls.** 修正 and 元の結果に戻す are shown disabled while the file is busy
   (A1, B2, C2); a queued task that will only rebuild a corrected file's search rows
   does not count as busy. Assumed: yes; the Design Artifact settles the look.
8. **SPEC-ADDON-051.** `docs/specs/INDEX.md` has a draft row reserving
   `docs/specs/extraction-corrections.md` for this unit, made before the IDs above were
   assigned. Assumed: set it to `superseded` in this change's approval commit.
9. **Alignment that never becomes possible.** When the alignment model cannot be loaded,
   an utterance stays pending for three attempts (about 20 minutes, or across restarts)
   and then ends with no word timings (A10). Assumed: yes.
10. **Emptying an utterance.** Saving an empty text deletes the utterance (A6); emptying
    the last remaining one is refused (A4). Assumed: yes.
11. **A confirmed regenerate that ends without a result.** A failure clears the
    confirmation and keeps the corrections; a deferral (policy lookup, `index` off, file
    unreachable) keeps the confirmation for the retry; Index details then says
    「再生成できませんでした。修正はそのまま残っています。」 (C9). Assumed: yes.
12. **Media Import's speech-to-text audio on a corrected `.loft`.** A correction wins over
    a later `*.stt_temp.m4a`: the reference is not re-transcribed unless the owner
    confirms a regenerate (C6). Assumed: yes.
13. **Keys in the edit fields.** Enter / Escape and Cmd/Ctrl+Enter act only inside the
    field and are not added to `docs/user-guide/keyboard-shortcuts.md`. Assumed: yes.
14. **Media Import temp audio beside a corrected `.loft`.** The temp audio is left on
    disk and ignored while the file is corrected; a confirmed regenerate uses it if it is
    still there (as today, temp audio wins over the VTT), and its outcomes are those of
    C9's transcription branch. Assumed: yes.
15. **Processing drawer after a failed confirmed regenerate.** The drawer's transcript
    stage reads `failed` (latest job failed, `routers/files.py:108-133`) until the failed
    job is resolved, although the corrected transcript is intact. Assumed: leave it; the
    alternative changes SPEC-ADDON-057 I5.
16. **Where 元の結果に戻す shows.** In the transcript panel header in the 「発話」 view,
    whether or not Refine is enabled; not in the 「字幕」 or external views. Assumed: yes.

## Checked, no action

- **Edit history.** Decided against by the owner: one original and the current text only.
- **PDF body text, video-frame and scanned-PDF OCR, the Visual Index's `visible_text`.**
  Out of scope (B2b and later).
- **Splitting, merging or retiming utterances.** A correction changes text only; start
  and end stay.
- **Derived LLM output.** Summaries, detailed summaries and their citations, suggested
  tags, chapter suggestions and retrieval keywords are not regenerated or marked stale
  after a correction; the owner regenerates them from their own controls. Detailed
  summary citations name embedding ids that a re-embed replaces; Refine already has this
  effect today.
- **Speaker labels.** A correction keeps the utterance's `speaker_id` and gives its new
  words the same one; Refine's rule of dropping speakers (`refine.py:284-299`) is
  unchanged.
- **The core repository.** Every route, store and screen involved is in the intelligence
  addon; the core proxy serves the new routes from the manifest. No Internal API endpoint
  is added, so `.claude/rules/internal-api-policy.md` is not engaged. SPEC-CORE-047 is not
  used.
- **MCP.** `get_transcript` returns the corrected text; no edit tool is added.
- **A refined file's protection.** A file that is only refined is not protected; an
  automatic re-transcription replaces it, as today. Only a human correction protects.
- **The orphan clean-up for files that are not corrected.** `fail_orphaned_running_jobs`
  deleting a machine transcript when a re-transcription is cut by a restart is unchanged
  for uncorrected files; the file is transcribed again.
- **Concurrent edits from two tabs.** `expected_text` / `expected_start` turn the second
  save into 409 `changed`; there is no merge.
- **Language of a corrected utterance.** Kept from the row; a correction in another
  language aligns with the stored language's model, and ends with no words if it does
  not fit.
- **Legacy pictures.** For a picture read before this change, the original is the merge
  of its overlapping chunks (B8), a heuristic that can differ slightly from the engine's
  joined lines; a restore then chunks that merged text. Re-running OCR to get the exact
  text is not done, because it would be a re-process.
- **Gaps in `chunk_index`.** After an empty save the indexes have a gap, which keeps every
  other utterance's index and its `wh_<file>_<index>_…` embedding id (read by
  `citations.py:117-124`) unchanged. Two readers treat the index as a list position and
  are changed (Touch points): the panel's playback highlight (`TranscriptSection.tsx:387-388`
  compares a list position with `cue.index`) and Ask's `get_file_chunks`
  (`rag/tools/get_file_chunks.py:144, 227-251`, which slices by position).
- **The SPEC-ADDON-050 invariants I4 and I9** (OCR queueing by mode, `pending.ocr`) hold
  as written: the rebuild of C7 is a follow-up item, not an OCR task.
