# Refine keeps a chunk as it was when its words cannot be realigned

SPEC-ID: SPEC-ADDON-127, SPEC-ADDON-128

Approval: sha256:748d0edd82eaaf091f7a36d56307b6d6b6479ad68b68aece75366f24a24df455 Yuichi Senga 2026-11-17

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

This is a bug fix in the intelligence addon. Two defects combine so that Refine reports
success and changes nothing.

- The aligner accepts only two-letter language codes. 5,118 production files were
  transcribed with the three-letter code `jpn` (ISO 639-3), so WhisperX finds no alignment
  model and every realignment of those files fails. This also affects the per-utterance
  realignment after a manual correction (`followup._realign_utterance` → `align_span`).
- When a chunk's realignment fails, the job keeps the old word rows (the documented rule)
  but still writes the refined text and the refined marks. The re-chunk step at the end then
  rebuilds every chunk from the word rows, which still hold the old text, so the refined text
  is overwritten while every rebuilt chunk is marked refined. The same happens for any failed
  alignment: unreadable audio, a `.loft` file with word rows, an alignment with no result.

Reproduced in `addons/intelligence/tests/test_refine_iso639_3.py` on the addon at `b0318f9`:
a chunk refined from 「にじゅうにんきた」 to 「20人来た。」 keeps the refined text when the
words are `ja`, and is back to 「にじゅうにんきた」 when they are `jpn` or the audio is
unreadable.

SPEC-ADDON-127: the aligner treats a three-letter language code as the two-letter code of
the same language, for model loading and for the per-character alignment of CJK languages.

SPEC-ADDON-128: a chunk that has word rows and whose realignment does not succeed is left
exactly as it was before the run: its text, its word rows and its refined marks. Only chunks
whose refined text was applied count as refined, and only they make a file "refined".

## Required items

### 1. Normal flow

1. A refine job runs its windows as today: the LLM returns refined text for a window.
2. For each chunk of the window with refined text:
   - If the chunk has no word rows in its span (a `.loft` subtitle file), its refined text
     is applied as today.
   - Otherwise its words are realigned to the refined text. On success the new word rows,
     the refined text and the refined marks (`text_refined_at`, `refined_model`) are
     written, as today. On any other outcome nothing of that chunk is written; it counts
     as skipped.
3. The file's kept original is written in the same transaction as the first applied chunk,
   from the transcript as it was before the run. A run that applies no chunk writes no
   kept original, does not bump the transcript generation and does not re-chunk.
4. After the windows, when at least one chunk was applied, re-chunking runs as today. A
   rebuilt chunk carries the refined marks only when its span overlaps the span of a chunk
   that was refined before re-chunking (in this run or an earlier one). Other rebuilt chunks
   have no refined marks.
5. Language codes reaching the aligner are compared case-insensitively, with any region
   suffix (`ja-JP`, `pt_BR`) dropped, and a three-letter ISO 639-2/639-3 code is replaced by
   the two-letter code of the same language (`jpn`→`ja`, `eng`→`en`, `kor`→`ko`,
   `zho`/`chi`→`zh`). A code with no two-letter equivalent is passed through unchanged.

### 2. Failure cases

| Step | What goes wrong | What happens |
|---|---|---|
| Realign | no model for the language | chunk left as it was, counted as skipped |
| Realign | audio unreadable (waveform `None`) | every chunk with word rows left as it was |
| Realign | model load fails, align raises, alignment returns nothing | chunk left as it was |
| LLM | window fails or is malformed | as today: the window is left as it was |
| Re-chunk | all chunks skipped | re-chunk does not run |

### 3. States

A chunk is "refined" (has `text_refined_at`) or "not refined". A run moves a chunk to
refined only when its refined text is applied (2. above). A chunk that was refined before
the run and whose realignment fails in this run keeps its earlier refined text, words and
marks.

### 4. Data read and written

Search DB, through the existing job: `transcript_chunks` (text, refined marks),
`transcript_words` (realigned spans), `kept_originals`, the transcript generation on
`indexed_files`, FTS and keyword rows, `embeddings`/`vec_text` of applied and rebuilt
chunks. No schema change.

### 5. External services

None new. The LLM call is unchanged.

### 6. Authorization

No change.

### 7. Effect on existing features

- Refine of `jpn` files realigns their words and keeps the refined text.
- A manual correction of an utterance in a `jpn` file gets realigned word timings instead of
  "no word timings". Corrections saved before the fix keep the state they have.
- Subtitles, search and Ask see refined text only where words and text agree.
- The "AI整形済み" badge appears only on cues whose text was refined.
- Refine of `.loft` subtitle files (no word rows) is unchanged.

### 8. Error behavior

The job logs one warning per run naming the file and the number of chunks left as they were
because realignment failed. The completed event's `skipped_count` includes them. Nothing
new is shown in the UI.

### 9. User-visible behavior

Refining a file whose words cannot be realigned leaves the transcript unchanged and shows no
"AI整形済み" badge and no **元の結果に戻す** for that run, instead of looking refined while
showing the old text. `docs/addons/intelligence.md` (Transcript refine) says so.

### 10. Non-functional

None. No extra LLM or alignment call.

## Touch points

- `addons/intelligence/app/workers/aligner.py`: `_normalise_lang`.
- `addons/intelligence/app/workers/refine.py`: `_run_refine_job` (the per-window apply and
  the kept original), `realign_words_for_chunk` (its outcome), `rechunk_from_words` (the
  refined marks on rebuilt chunks).
- `addons/intelligence/tests/`.
- `docs/addons/intelligence.md`: Transcript refine.
- `addons/intelligence` submodule pointer bump in the core repository.
- Rules passed through: `.claude/rules/design-decisions.md` (Transcript Refine: one kept
  original written with the first write; failed alignment keeps the old word rows).
- No protected path is edited.

## Invariants

I1. `align_segment` and `align_span` given `jpn`, `JPN`, `ja-JP` or `ja` load the `ja`
model and return per-character units; given `eng` they load `en`, `kor` → `ko`, `zho` → `zh`.
I2. After a refine run, the file's chunk texts joined in time order equal, ignoring
whitespace, the refined text of every applied chunk and the pre-run text of every other
chunk, joined in time order.
I3. A chunk with word rows whose realignment does not succeed has, after the run, the text,
word rows, `text_refined_at` and `refined_model` it had before the run.
I4. A run that applies no chunk leaves `transcript_chunks`, `transcript_words`,
`kept_originals` and the transcript generation unchanged.
I5. When a run applies at least one chunk, the kept original (if the file had none) equals
the transcript before the run, and it is written in the same transaction as the first applied
chunk.
I6. After re-chunking, a chunk carries refined marks only if its span overlaps a chunk that
was refined before re-chunking.
I7. A chunk with no word rows in its span (a `.loft` subtitle file) receives the refined text
and marks as before the change.

## Checked, no action

- **Rewriting stored `jpn` codes to `ja`**: the aligner reads either; the subtitle builder and
  the Whisper chunker already accept codes starting with `jp`. A data migration is not needed.
- **Normalising codes in the ElevenLabs provider**: new files would get `ja`, but the 5,118
  stored files would still need the aligner change, so one place is enough.
- **Skipping realignment of chunks the LLM did not change**: measured to save about 3 minutes
  per 20-minute `jpn` file once realignment works; a separate change.
- **Re-refining files refined before the fix**: production has no refined file.
- **Refined text for files that cannot be realigned**: a human chose to leave such chunks as
  they were rather than keep refined text that disagrees with the subtitles.
