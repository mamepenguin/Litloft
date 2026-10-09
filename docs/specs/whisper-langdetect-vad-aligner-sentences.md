# Language detection looks past a non-speech opening; refine keeps every sentence

SPEC-ID: SPEC-ADDON-012
SPEC-ID: SPEC-ADDON-013
SPEC-ID: SPEC-ADDON-014

Approval:

## Summary

Three fixes found by R-5 of `docs/specs/whisper-langdetect-refine-digits.md` (SPEC-ADDON-009/010/011),
all in the intelligence addon, all on the same branch.

**SPEC-ADDON-012.** 009 detects the language from the first 30 s of the file. On a clip with
a 40 s instrumental opening followed by Japanese speech, detection returned `en 0.638`, so
the English built-in prompt was applied, and Whisper transcribed the Japanese speech as an
English translation. Whisper's own detection inside `transcribe` (which runs after its VAD
removes non-speech) reported `ja 0.999` on the same file; with no prompt the speech came out
as Japanese, with the Japanese prompt as punctuated Japanese (measured 2026-10-09). So 009
made such files worse than before it. Measured on the same build: `detect_language(...,
vad_filter=True)` on the first 120 s returns `ja 0.999` for that clip, and `ja 0.999` /
`en 1.0` for the plain Japanese and English clips, unchanged. When VAD finds no speech at
all, faster-whisper 1.1.0 still answers, with `en 0.615` for silence, noise and a pure music
excerpt alike, so a file whose first 120 s hold no speech must not reach `detect_language`.
After this change detection decodes the first 120 s, skips when VAD finds no speech, and
otherwise detects with VAD on.

**SPEC-ADDON-013.** `aligner.align_segment` keeps only `segments[0]` of `whisperx.align()`'s
result. WhisperX 3.3.1 splits the text it aligns into sentences (NLTK Punkt) and returns one
segment per sentence, so every sentence after the first in a refined chunk is dropped from
the word rows, and `rechunk_from_words` then rebuilds the chunk text from those rows. R-5:
an English transcript went from 4517 to 1561 characters after refine, with no warning;
reproduced 2026-10-09 by aligning a 29-word, two-sentence text, which returned the 3 words of
the first sentence. Japanese is not split by Punkt, which is why Japanese refine kept its
text. The bug predates 010, but 010 is the first spec to ask for refine on English text.
After this change every segment's rows are kept, in order.

**SPEC-ADDON-014.** A subtitle cue that exceeds half the width is laid out on two lines by
`subtitle_builder._balance_two_lines`. Its split position can fall inside a number: R-5
found cue 107 rendered as `だいたい3.` / `3キロくらい…`. 010 keeps cues from *ending* at a
decimal point but did not cover this in-cue line split. After this change the line split
never falls inside a number written in digits.

For the operator and viewers of a library that transcribes with `whisper_local` (012) or
refines transcripts (013, 014). The operator has not refined any English transcript, so no
stored transcript has lost text to 013's bug on their library.

## Required items

### 1. Normal flow

SPEC-ADDON-012 (replaces 009 Normal flow step 2):

1. As 009 step 1: `_transcribe_file` runs with no override and no caller prior text.
2. `_detect_language` decodes **the first 120 seconds** of the file's audio with `ffmpeg`
   (`-t 120`, mono, float32, at `model.feature_extractor.sampling_rate`), with the same 60 s
   timeout.
3. It runs faster-whisper's Silero VAD (`faster_whisper.vad.get_speech_timestamps`, default
   options) on those samples. When it finds no speech, detection stops (failure cases).
4. Otherwise it calls `model.detect_language(audio=<samples>, vad_filter=True)`; faster-whisper
   removes the non-speech parts and detects on the first 30 s of what remains.
5. 009 steps 3–4 follow unchanged: probability ≥ 0.5 picks the built-in prompt.

SPEC-ADDON-013:

1. Refine calls `align_segment(waveform, chunk_start, chunk_end, text, language)` per chunk,
   as today.
2. `whisperx.align()` returns one or more segments for the text.
3. `align_segment` collects the word rows (or, for CJK, the character rows) of **every**
   segment, in the order WhisperX returns them, then applies its existing two passes
   (untimed-token interpolation, clamping to the chunk window) to that combined list.

SPEC-ADDON-014:

1. `build_cues` hands each cue to `_balance_two_lines`, as today.
2. A cue within the soft width is returned unchanged, as today.
3. A candidate split position is **inside a number** when the characters on both sides of it
   belong to one number written in digits: a run of `0`–`9`, possibly with single `.` or `,`
   characters each between two digits (`2025`, `3.3`, `1,500`), where a space between a row
   that ends in such a separator and a row that starts with a digit (`3.` `3km`, token rows
   joined by a space) also counts as inside.
4. In the space-separated path, a space inside a number is not used; the split moves to the
   nearest space that is not, or the cue stays on one line if there is none.
5. In the CJK path, a soft-punctuation character that is a digit separator is not used as the
   split, and a midpoint (janome or fallback) that falls inside a number moves to the nearer
   end of that number; if that end is the start or the end of the text, the other end is
   used, and if both are, the cue stays on one line.

### 2. Failure cases

SPEC-ADDON-012:

- `ffmpeg` fails, cannot start or times out, VAD raises, or `detect_language` raises: one
  WARNING, `None`, transcription without a prompt — as 009.
- No samples in the first 120 s: one INFO, `None`, neither VAD nor `detect_language` runs.
- VAD finds no speech in the first 120 s (silence, music, noise; an opening longer than
  120 s): one INFO, `None`, `detect_language` is not called, no prompt. Whisper's own
  detection still chooses the transcription language, as before 009.
- Probability below 0.5: as 009.

SPEC-ADDON-013:

- A segment with no rows contributes nothing; the other segments' rows are still kept.
- Every segment empty: `None`, as today when `segments[0]` is empty; refine keeps the old
  word rows for that chunk.
- Rows that WhisperX returns out of time order across segments are not reordered; the
  existing clamp drops rows outside the chunk window, as today.

SPEC-ADDON-014:

- A cue whose only possible split positions are inside numbers stays on one line, wider than
  the soft width. Accepted: it is still within the cue's maximum width.

### 3. States

None. No new state; a chunk's `text_refined_at` and refine job states are unchanged.

### 4. Data read and written

- 012: reads up to 120 s of the media file per detection (was 30 s). Writes nothing new.
- 013: the same `transcript_words` / `transcript_chunks` / embedding writes as today; for a
  multi-sentence chunk in a non-CJK language they now hold every sentence. Transcripts
  already refined are not touched; the operator has none in English.
- 014: none stored; cues are built on request.

### 5. External services

None. VAD and detection run in the worker; WhisperX alignment runs in the worker.

### 6. Authorization

None. No endpoint, permission or policy changes.

### 7. Effect on existing features

- 012: files with up to about 90 s of non-speech opening now get the prompt for their
  spoken language instead of a wrong one or none; files with no speech in the first 120 s
  get no prompt (before 009 every file got none). Production uses Deepgram (009 item 7), so
  this does not reach production transcripts.
- 012: `detect_language` runs on the speech parts only, so a mostly-English opening line in
  a Japanese video can still detect English; a mixed opening is a limit of first-N-seconds
  detection, unchanged in kind.
- 013: refine on a multi-sentence chunk in English (or any language Punkt splits) now keeps
  all its text, so the rebuilt chunks, embeddings, subtitles, summaries and Ask read the full
  refined text. Japanese refine is unchanged.
- 013: digits written by 010 in English still get zero-length rows between timed
  neighbours (010 item 7); that now happens in every sentence rather than only the first.
- 014: only the line layout inside a cue changes; cue boundaries and timing are unchanged.

### 8. Error behavior

- 012: the INFO for "no speech in the first 120 s" is new; WARNING and the other INFO
  messages as 009. Nothing in the UI.
- 013, 014: none new.

### 9. User-visible behavior

- 012: a `whisper_local` transcript of a video with a music or silent opening is in the
  spoken language and, for the ten built-in languages, punctuated. R-5 transcribes the
  40 s-music clip and records Japanese, punctuated output.
- 013: after refine, an English transcript keeps all of its text. R-5 refines the English
  clip and records the character count before and after.
- 014: a two-line subtitle never shows a number split across its lines.

### 10. Non-functional

- 012: the decode grows from about 2 MB to about 8 MB of float32 per file, piece or retry,
  still bounded by the 60 s timeout; Silero VAD on 120 s of audio takes well under a second
  on CPU.
- 013, 014: none.

## Touch points

- `addons/intelligence/app/workers/whisper.py`: `_detect_language`,
  `_decode_detection_sample` and the detection constants (012).
- `addons/intelligence/app/workers/aligner.py`: `align_segment` (013).
- `addons/intelligence/app/subtitle_builder.py`: `_balance_two_lines` (014); it may reuse
  `app/digit_separator.py`.
- `addons/intelligence/tests/`: tests for all three. `tests/conftest.py` stubs faster-whisper
  and WhisperX; the tests replace the VAD call and `whisperx.align` with fakes.
- `docs/process/reviews/feature-whisper-langdetect-refine-digits/`: the topic this work is
  reviewed under, together with 009/010/011.
- Submodule: committed in the addon repository; the core bumps the pointer.

## Invariants

I1. With no override and no caller prior text, `_detect_language` passes `detect_language`
a numpy array of at most 120 s of decoded audio at `model.feature_extractor.sampling_rate`
and `vad_filter=True`, never a path.
I2. When VAD finds no speech in the decoded samples, `_detect_language` returns `None`
without calling `detect_language`, and the file is transcribed with `initial_prompt=None`.
I3. When VAD finds speech and `detect_language` reports `ja` with probability ≥ 0.5, the file
is transcribed with `DEFAULT_INITIAL_PROMPTS["ja"]`, in both the sequential and the batched
path.
I4. When `align_segment` receives a WhisperX result with several segments, it returns the
rows of every segment, in segment order, each row's text unchanged; a text of N
space-separated words in a word-level language yields N rows when every word is timed.
I5. A WhisperX result whose first segment is empty but whose later segments hold rows still
yields those rows; a result with no rows in any segment yields `None`.
I6. `_balance_two_lines` never returns a cue whose line break falls inside a number written
in digits as defined in 014 step 3, for the space-separated and the CJK path.
I7. `_balance_two_lines` still splits a cue over the soft width at the same position as
today when that position is not inside a number, and returns a cue within the soft width
unchanged.

## Revises

SPEC-ADDON-009 I2. `_detect_language` passes a numpy array of decoded samples, never a path or string, to `detect_language`, with `vad_filter=True`, and the array holds at most 120 s of audio at `model.feature_extractor.sampling_rate`, whatever the length of the file.

## Checked, no action

- **Passing the detected language to `transcribe`.** It would fix the translation case even
  with a wrong detection, but it overrides Whisper's own (measured correct) detection and
  changes the transcription call; 012 fixes the input to the prompt choice instead.
- **Detecting on more than 120 s, or on several windows.** A longer non-speech opening is
  rare in this library; such a file now gets no prompt, which is the pre-009 behaviour, not a
  wrong one.
- **Relying on `detect_language(vad_filter=True)` alone.** Measured: with no speech left it
  returns `en 0.615`, above the 0.5 threshold, so the explicit VAD check is needed.
- **Re-transcribing or re-refining existing transcripts.** None of the operator's English
  transcripts were refined; Japanese ones did not lose text.
- **Splitting cues (not lines) differently for 014.** Cue boundaries are already covered by
  010; only the line layout is wrong.
- **Removing the 30 s wording from 009's Normal flow and failure text.** The earlier spec
  stays as approved; this spec states the new behaviour and revises 009 I2.
