# Whisper detects the language again; refine writes numbers in digits

SPEC-ID: SPEC-ADDON-009
SPEC-ID: SPEC-ADDON-010
SPEC-ID: SPEC-ADDON-011

Approval:

## Summary

Three fixes in the intelligence addon's transcription path.

**SPEC-ADDON-009.** `whisper_local` picks a built-in `initial_prompt` per language from a
language it detects before transcribing (`app/workers/whisper.py:_detect_language`). The
detection passes a file path to faster-whisper's `WhisperModel.detect_language`, which in
the installed faster-whisper 1.1.0 takes decoded audio (`audio: numpy.ndarray`), so every
call raises, is logged as "Language detection failed", and returns `None`. No file has been
transcribed with the built-in prompt since it shipped, so `whisper_local` transcripts lack
the punctuation the prompt exists to induce (measured 2026-10-09: a Japanese clip came out
with no 。 or 、 at all). After this change the detector decodes the first 30 s of the file
and passes the samples, and the built-in prompt applies as designed.

**SPEC-ADDON-011.** The whisper worker reads its settings from the legacy tree
`settings.indexing.whisper` (`whisper.py` `_ensure_loaded`, `_transcribe_file`, and the
`.loft` caption path), while the documented keys are `transcription.whisper_local.*` and
`settings.transcription.whisper_local` is where the config loader merges both (legacy as the
base, new keys on top). A value set under the documented keys (`initial_prompt`,
`beam_size`, `batch_size`, the thresholds, the segment durations) has therefore never taken
effect. After 009 this would become visible: an operator's documented `initial_prompt` would
lose to the built-in one. After this change the worker reads the merged tree.

**SPEC-ADDON-010.** Transcript refine asks the LLM to write numbers that state a quantity,
count, date, time, amount, measurement or ordinal in Arabic digits, in one stated form. ASR
engines differ here (ElevenLabs Scribe writes Japanese numbers in kanji, `二千二十五年`;
Deepgram and Whisper write `2025年`), so the displayed transcripts, subtitles and the text
that semantic search, summaries and Ask read hold both forms. After this change a refined
transcript uses digits whichever engine produced it. So that a decimal number is not cut at
its decimal point, the chunker and the subtitle cue builder stop treating a `.` or `,`
between two digits as punctuation.

All three are for the operator and viewers of a library that uses `whisper_local` (009,
011) or transcript refine (010).

## Required items

### 1. Normal flow

SPEC-ADDON-009:

1. `_transcribe_file` runs for a file, or for a piece of a split file, with no non-empty
   caller-supplied prior text and an empty (or whitespace-only) `initial_prompt` in
   `settings.transcription.whisper_local` (see 011).
2. `_detect_language` decodes **only the first 30 seconds** of the file's audio with
   `ffmpeg` (`-t 30`, mono, float32, at `model.feature_extractor.sampling_rate`, which is
   16000 for every Whisper model), with a 60 s timeout, and calls
   `model.detect_language(audio=<samples>)`.
3. A language reported with probability ≥ 0.5 is returned; `resolve_initial_prompt` maps it
   to the built-in prompt for the ten languages in `whisper_prompts.DEFAULT_INITIAL_PROMPTS`,
   or to `None` for any other language.
4. Transcription (sequential or batched) runs with that `initial_prompt`, exactly as today.

When the merged config holds a non-empty `initial_prompt`, or the caller passes non-empty
prior text, steps 2–3 do not run, as today. The splitter passes prior text to a piece only
when the previous piece produced text; a piece that follows an empty piece (silence, music)
runs detection like the first piece. That is intended: it has no prior text to imitate.
Pieces of one file can therefore detect different languages.

SPEC-ADDON-011:

1. Wherever the whisper worker reads `settings.indexing.whisper` today (`_ensure_loaded`'s
   `batch_size`, `_transcribe_file`'s config for transcription and the override, and the
   `.loft` caption path's segment durations), it reads `settings.transcription.whisper_local`
   instead.
2. That object is built by the existing loader: legacy `indexing.whisper.*` values as the
   base, `transcription.whisper_local.*` values on top, field by field, the same defaults in
   both classes. An operator with only legacy keys sees no change; one with documented keys
   now gets them. An operator with both trees gets the new tree's value for every field it
   sets (item 7).
3. The model is still chosen by `models.whisper`. `transcription.whisper_local.model` has
   never been read by the worker; the line is removed from the docs and the example config
   rather than wired up.

SPEC-ADDON-010:

1. A refine job builds the system prompt (`refine/system.jinja2`) for a window of chunks.
2. The prompt carries one more line, for every `llm.output_language`, placed immediately
   after the punctuation instruction and immediately before "Do not add words other than
   punctuation.". The line is exactly:

   ```
   - Numbers: write every number that states a quantity, count, date, time, amount of money, measurement or ordinal in Arabic digits (0-9), with no digit-group separators and a decimal point only where the speaker said one. When the speaker used a large-number unit word (a word for ten thousand, a million and the like), keep that word and write its multiplier in digits. Leave a numeral that is part of a fixed word or idiom as it is. Rewriting a number this way is allowed even though it changes the character count.
   ```

3. The LLM's answer is parsed, stored, re-aligned and re-embedded exactly as today.
4. A **digit separator** is a row whose text, stripped of surrounding whitespace, ends with
   `.` or `,`, where the character before that one is a digit `0`–`9` (in the same row, or,
   when the row is the separator alone, the last character of the previous row's stripped
   text), and the next row's stripped text starts with a digit `0`–`9`. It covers the
   aligner's character rows (`3` `.` `3`) and a provider's token rows (`3.` `3km`). The test
   runs on the rows each function already tests for punctuation; in `build_cues` for
   Japanese, those are the rows after the janome regrouping.
5. In `_build_chunks_from_words` (`whisper.py`, used at index time and by
   `rechunk_from_words` after refine), a digit separator does not count as hard or soft
   punctuation. The silence-gap break and the `max_duration` flush still apply to it as to
   any row.
6. In `subtitle_builder.build_cues`, a digit separator does not count as a hard or soft
   punctuation end either: it neither ends a cue nor is recorded as a safe break for the
   width or duration rewind. Other cue rules (duration, width, gaps) are unchanged.

### 2. Failure cases

SPEC-ADDON-009:

- `ffmpeg` exits non-zero, cannot start, or exceeds the 60 s timeout, or `detect_language`
  raises: `_detect_language` logs one WARNING and returns `None`; transcription runs with no
  `initial_prompt`, as on any detection failure today. If the file really is unreadable,
  transcription then fails as it does today.
- `ffmpeg` succeeds but yields no samples (no audio in the first 30 s): one INFO log, `None`,
  `detect_language` is not called.
- Probability below 0.5 (silence, music, a mixed-language opening): `None`, INFO log, no
  prompt, unchanged.
- A detected language outside the ten: `None` from `resolve_initial_prompt`, unchanged.
- A retry of the transcription (`transcribe_with_retry`) runs detection again; the cost is
  one 30 s decode per attempt.

SPEC-ADDON-011:

- A documented key with a value the worker cannot use fails as the same value under the
  legacy key fails today; the loader's validation is unchanged.

SPEC-ADDON-010:

- The LLM ignores the instruction for some numbers: the text is stored as returned. Nothing
  in code converts numbers; a mixed transcript is no worse than today.
- The LLM rewrites a numeral that belongs to a fixed word: stored as returned. Refine is
  destructive, so this cannot be undone except by transcribing again. The instruction names
  the exception; no code check is added.
- A `.` that ends a sentence right after a number, followed by a sentence that starts with a
  digit (`… in 2024. 3 people …`), or `,` in a list of numbers (`1,2,3`), is a digit
  separator and no longer breaks by punctuation. The silence gap and duration limit still
  break such text. Accepted.

### 3. States

None. 009 changes how one call gets its argument, 011 which settings object is read, 010
prompt text and one punctuation test. A chunk's `text_refined_at` and the refine job states
are unchanged.

### 4. Data read and written

- 009: reads the first 30 s of the media file once more. Writes the same transcript rows as
  today; their text differs because the prompt now applies.
- 011: reads the merged settings object instead of the legacy one; writes nothing new.
- 010: the same `transcript_chunks` / `transcript_words` / embedding writes as today; refined
  text differs in how numbers are written, and chunk boundaries no longer fall at a digit
  separator by punctuation. Transcripts already refined or indexed are not touched.
  Subtitle cues are built on request from word rows, so cues of existing transcripts change
  at a digit separator.

### 5. External services

- 009, 011: none; whisper runs on the host.
- 010: the configured LLM provider receives a system prompt about one paragraph longer.
  Slow, down or wrong behaves as today.

### 6. Authorization

None. No endpoint, permission or policy check changes. Refine still runs only where the
drive policy allows it, and an offhost profile still needs `llm_cloud`.

### 7. Effect on existing features

- 009: every `whisper_local` transcription with no override now gets the built-in prompt for
  its language. Output style changes (punctuation appears). The prompts were written to
  avoid vocabulary bleed (`whisper_prompts.py`) but have never run on real audio; R-5 runs
  them (item 9).
- 009: punctuation changes chunk shape. `_persist_transcript` builds chunks with
  `_build_chunks_from_words`, which ends chunks at `。`/`.` and prefers `、`/`,`; without
  punctuation, chunks were cut by silence gaps and duration alone. New `whisper_local`
  transcripts therefore get different chunk counts and lengths, which changes their
  embedding rows, search excerpts, Ask citations, subtitle cues and the chunk input to
  chapter suggestions. The duration and length limits on a chunk are unchanged.
- 009, 011: production. Production's provider is `deepgram` and its `drives.json` sets no
  addon policy on any drive (checked 2026-10-09), so no drive falls back to `whisper_local`
  for `transcription_cloud`, and neither change reaches production transcripts until the
  provider or a policy changes.
- 011: an operator with both trees. The example config ships `transcription.whisper_local`
  filled with default values next to the legacy block, and the new tree wins field by field,
  so a value tuned only in the legacy block is replaced by the example's default. Checked
  2026-10-09: production and this machine both hold default values in both trees, so no
  value changes for them. Accepted under the personal-tool premise; the deprecation WARNING
  is unchanged.
- 011: `refine.py` already reads `settings.transcription.whisper_local`; after 011 the worker
  and refine read the same object.
- 010: readers of refined text (displayed transcript, subtitles, semantic search, summaries,
  Ask) see digits where they saw kanji or spelled-out numbers. **Keyword search does not
  change**: refine does not rewrite the keyword index (`fts_transcripts`,
  `fts_transcripts_word`), which keeps the text from indexing time. That gap exists today
  for every refine correction and is left to a separate spec.
- 010: forced alignment after refine. The Japanese alignment model's vocabulary contains
  `0`–`9` (checked 2026-10-09 in `jonatasgrosman/wav2vec2-large-xlsr-53-japanese`
  `vocab.json`), so digits are aligned like other characters. In a word-level language whose
  model has no digits (English), a digit token gets no timestamps and falls into the
  aligner's existing untimed-token path: a zero-length row between its timed neighbours, as
  Deepgram's digits already get when refined today.
- 010: the digit-separator rule applies to every chunk built from words and every cue built,
  for every provider and language.

### 8. Error behavior

- 009: the WARNING "Language detection failed for …" is no longer logged on every
  `whisper_local` file; it appears only when decoding or detection really fails or times
  out. Nothing is shown in the UI.
- 011: the existing deprecation WARNING for legacy keys is unchanged.
- 010: none new.

### 9. User-visible behavior

- 009: new `whisper_local` transcripts in the ten built-in languages carry punctuation, and
  their chunks (search excerpts, subtitle cues) follow sentences. R-5 transcribes a Japanese
  and an English clip with `whisper_local` and records that punctuation appears and that no
  word from the built-in prompt shows up where it was not said.
- 011: `transcription.whisper_local.*` values in `search-config.yml` take effect.
- 010: newly refined transcripts write numbers as digits (`2025年`, `3.3km`, `44分`, `1人`,
  `1万5000円`), and punctuation never cuts a chunk or a subtitle cue at a decimal point.

### 10. Non-functional

- 009: one extra decode of at most 30 s of audio per file, piece or retry: about 2 MB of
  float32 at 16 kHz, whatever the file's length, bounded to 60 s of wall time.
- 011: none.
- 010: about 120 more input tokens per refine request. No privacy change: the same chunks go
  to the same provider.

## Touch points

- `addons/intelligence/app/workers/whisper.py`: `_detect_language` (009); the three reads of
  `settings.indexing.whisper` (011); `_build_chunks_from_words` (010). Submodule; committed in
  the addon repository, and the core bumps the pointer.
- `addons/intelligence/app/subtitle_builder.py`: the punctuation-end and safe-break tests in
  `build_cues` (010).
- `addons/intelligence/search-config.yml.example` and `docs/addons/intelligence.md`: the
  `transcription.whisper_local.model` line is removed (011).
- `addons/intelligence/app/prompts/refine/system.jinja2`: the line in 010.
- `addons/intelligence/tests/`: tests for all three. The test image already installs
  `ffmpeg`; faster-whisper stays stubbed by `tests/conftest.py`, and a fake model exposing
  `feature_extractor.sampling_rate` stands in for it.
- `docs/addons/intelligence.md`: the **Transcript refine** section gets a sentence saying
  refine writes numbers as digits and does not update keyword search.
- `.claude/rules/backend-conventions.md` (read, not edited): the ban on language-dependent
  rules in LLM and string logic. The instruction in 010 names no language's vocabulary, the
  digit-separator test is about the digits `0`–`9`, and no code converts numbers.

## Invariants

I1. With no override and no caller prior text, a file whose detected language is `ja` with
probability ≥ 0.5 is transcribed with `DEFAULT_INITIAL_PROMPTS["ja"]` as `initial_prompt`,
in both the sequential and the batched path; at probability below 0.5 it is transcribed with
`initial_prompt=None`.
I2. `_detect_language` passes a numpy array of decoded samples, never a path or string, to
`detect_language`, and the array holds at most 30 s of audio at
`model.feature_extractor.sampling_rate`, whatever the length of the file.
I3. When the decode fails, times out, or `detect_language` raises, `_detect_language`
returns `None` and logs exactly one WARNING, and the file is still transcribed, with
`initial_prompt=None`; a decode that yields no samples returns `None` without calling
`detect_language`.
I4. With a non-empty `initial_prompt` in the merged config, or non-empty caller prior text,
that text is the `initial_prompt` and neither the decode for detection nor `detect_language`
runs; a value that is empty or whitespace only counts as absent.
I5. A value set only under `transcription.whisper_local` (`initial_prompt`, `beam_size`,
`batch_size`, `compression_ratio_threshold`, `no_speech_threshold`, `log_prob_threshold`,
`condition_on_previous_text`, `min_segment_duration`, `max_segment_duration`) is the value
the whisper worker uses; a value set only under the legacy `indexing.whisper` is still used
when the new key is absent.
I6. The refine system prompt for `output_language` `ja`, `en` and a language with no entry in
`_PUNCTUATION_INSTRUCTIONS` contains the line given in 010 Normal flow step 2, verbatim,
immediately after that language's punctuation instruction and immediately before "Do not
add words other than punctuation.", and still contains every line it holds today: the
ASR-correction role, "Do not change the meaning … keep the character count similar …", the
proper-noun line, the no-translation line, the punctuation instruction, "Do not add words
other than punctuation.", and the JSON output format.
I7. Refine stores the LLM's `text_refined` as returned, byte for byte; no code path converts
numbers in it.
I8. `_build_chunks_from_words` does not break by punctuation at a digit separator (010
Normal flow step 4), in both the character-row and the token-row form; a `.` or `,` row that
is not a digit separator breaks exactly as today, and the silence-gap break and the
`max_duration` flush still apply at a digit separator.
I9. `subtitle_builder.build_cues` does not end a cue by punctuation at a digit separator and
does not record one as a safe break, for Japanese (after regrouping) and for other
languages; any other `.` or `,` row ends a cue and is recorded exactly as today.

## Checked, no action

- **Rewriting the keyword index after refine.** Keyword search reads `fts_transcripts` /
  `fts_transcripts_word`, written only at index time; refine never updates them, for numbers
  or for any other correction. Fixing that is its own change (delete and re-insert the file's
  rows from refined chunks, plus the TF-IDF keywords) with its own spec.
- **Converting numbers in code** (kanji numerals to digits after refine, or on raw ASR
  output). It would need one language's numeral grammar in code, which
  `.claude/rules/backend-conventions.md` forbids, and it cannot tell a counted number from an
  idiom.
- **Unifying numbers in transcripts that are not refined.** Only refine reaches the text
  with an LLM; a raw Scribe transcript keeps kanji numbers until it is refined.
- **Re-refining or regenerating existing transcripts.** Refine is destructive; the operator
  decides per file.
- **Decoding the whole file for detection** with `faster_whisper.decode_audio`. A file under
  the split threshold is not split, and a 50 MB low-bitrate file can run hours, decoding to
  about 1 GB; faster-whisper reads only the first 30 s anyway.
- **Detecting past a music or silent opening** (VAD, or more detection segments). The
  original design samples the first 30 s; this change restores that design and does not
  extend it.
- **Passing decoded audio on to `transcribe`** to save a decode. It changes the
  transcription call in both paths for a 30 s saving.
- **`whisper_local` ignoring `language_hint`.** A separate gap, not part of this bug.
- **Warning when both trees set a field to different values.** Useful for a shared
  deployment; for the one operator here both trees hold the same values (item 7).
- **Wiring `transcription.whisper_local.model` to the model loader.** `models.whisper`
  already chooses the model and is what operators set; a second key for it would need a
  precedence rule for no gain.
- **Removing the legacy `indexing.whisper` tree.** The loader already merges and warns; 011
  only changes which object the worker reads.
- **`_balance_two_lines` splitting a cue's two lines at `,`.** That split is inside one cue
  and does not end it; the instruction forbids digit-group commas, so a `,` between digits is
  rare.
- **Forbidding decimal points in the instruction** instead of changing the chunker. `3.3km`
  is how the number is said; the chunker is the part that misreads it.
- **Testing against a real Whisper model.** Too heavy for the suite, and the test image does
  not install faster-whisper. A fake model that enforces faster-whisper 1.1.0's
  `detect_language(audio=..., ...)` signature, with a real `ffmpeg` decode of a small
  generated audio file, stands in. The real model runs in R-5.
- **Invariants for the docs sentence and the tests.** Prose and tests are not behavior; the
  docs sentence is checked in review against items 7 and 9.
