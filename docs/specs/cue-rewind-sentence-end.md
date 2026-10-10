# A cue carried over by a width or duration flush still ends at its sentence end

SPEC-ID: SPEC-ADDON-017

Approval:

## Summary

`subtitle_builder.build_cues` groups transcript words into subtitle cues. When the word just
added makes the cue reach `max_width` or `max_duration`, `flush_with_rewind` emits the cue up
to an earlier safe break and carries the rest (the "tail", which ends with that word) into the
next cue. The hard- and soft-boundary tests for that word sit in the `elif` of the same
branch, so they are skipped: when the word ends a sentence (`。`, `.`, `?` …) or is followed by
a silence, the tail is not ended there, and the next sentence is appended to it. R-5 of
SPEC-ADDON-015 found `12：30からです。本日の定例会議の議題は` as one cue (2.10–5.60 s),
running across a full stop and a 0.8 s silence; the same rows with `12.30` give the same cue on
the code before 015, so the bug predates it. After this change, once the flush has run, the
tail is tested with the same hard- and soft-boundary rules as any other cue, measured on the
tail itself, and ended there when they hold. For viewers of the subtitles.

## Required items

### 1. Normal flow

SPEC-ADDON-017:

1. `build_cues` appends each word to the current cue and computes, for that word, `ends_hard`,
   `ends_soft` and the gap to the next word, as today.
2. When the cue reaches `max_duration` or `max_width`, `flush_with_rewind(word_end)` runs as
   today.
3. If the flush left words in the current cue (a tail), the tail's duration (`word_end` minus
   the tail's first `timestamp_start`) and display width are computed, and the boundary tests
   of the normal path are applied to them unchanged:
   - hard: tail duration ≥ `min_duration` and (`ends_hard` or gap ≥ `silence_gap`);
   - soft: tail duration ≥ `min_duration`, `ends_soft`, and tail width ≥ `max_width * 0.75`.
   If either holds, the whole tail is emitted as a cue ending at `word_end`, and the next word
   starts a new cue.
4. If the flush emitted everything, or neither test holds, nothing more happens, as today.
5. The path where the cue did not reach a limit is unchanged.

### 2. Failure cases

- A tail shorter than `min_duration` that ends a sentence still carries into the next cue, as
  any cue under `min_duration` does today. Accepted: the existing rule exists to avoid
  flashing cues, and this change does not relax it.
- A tail that is itself still over `max_width` (a single very long word): unchanged; the next
  word triggers another flush as today.

### 3. States

None. Cues are built on request from stored words; nothing is stored.

### 4. Data read and written

Read: transcript word rows, as today. Nothing written.

### 5. External services

None.

### 6. Authorization

Unchanged: the subtitles endpoint's existing access checks.

### 7. Effect on existing features

- `build_cues` is called only by the WebVTT path (`subtitle_builder.py`, `to_webvtt(build_cues(...))`).
  Chunks (`workers/whisper.py`) and search are not affected.
- Cue text and timing change only for cues that follow a width or duration flush whose tail
  ended a sentence or met the soft-boundary test. Every transcript's subtitles are rebuilt on
  request, so stored transcripts show the change without re-transcribing.
- The digit-separator rules (010, 015) apply unchanged: a separator between digits is not
  `ends_hard`/`ends_soft`, so it does not end a tail either.

### 8. Error behavior

None new.

### 9. User-visible behavior

A subtitle cue that begins with the carried-over end of a sentence ends at that sentence's
end (or at the silence after it) instead of running into the next sentence; the next sentence
starts its own cue. Other cues are unchanged.

### 10. Non-functional

One more width and duration computation per flush; no measurable cost.

## Touch points

- `addons/intelligence/app/subtitle_builder.py`: `build_cues` (the limit branch of the word
  loop).
- Read, not changed: `flush_with_rewind`, `emit`, `_safe_break_between`, `CueConfig`,
  `app/digit_separator.py`.
- Tests: new tests citing SPEC-ADDON-017 in `addons/intelligence/tests/`.
- The addon change is committed in the addon repository; the core bumps the
  `addons/intelligence` pointer.
- Review topic: `docs/process/reviews/feature-cue-rewind-sentence-end/`.
- Docs: none; no page describes how cues are cut.
- No protected path.

## Invariants

I1. When the word that makes a cue reach `max_width` ends with `。` (or `.`), the flush carries
a tail ending with that word, and the tail's duration is at least `min_duration`, the tail is
a cue of its own ending at that word's `timestamp_end`, and the following word starts the next
cue.
I2. The same holds when that word is followed by a gap of at least `silence_gap` and does not
end with punctuation, and when the cue reached `max_duration` rather than `max_width`.
I3. A tail ending with `、` is ended there only when its width is at least `max_width * 0.75`
and its duration at least `min_duration`; otherwise it carries forward.
I4. A tail whose duration is under `min_duration` carries forward even when it ends a sentence.
I5. A tail ending with a digit separator (`3.` before `3`, `12：` before `30`) carries forward.
I6. For any input, the cues' texts joined in order contain every input word once, in order,
and each cue's `end` is not before its `start`.
I7. Every expected output in the existing `build_cues` tests (including SPEC-ADDON-010 and
SPEC-ADDON-015 cue tests) is unchanged.

## Checked, no action

- **Ending a short tail at a sentence end.** Would relax `min_duration` for this path only;
  a flashing fragment is worse than a merged cue, and no case has been seen.
- **Making `flush_with_rewind` prefer the sentence end as its rewind point.** The rewind
  already picks a safe break that keeps the head above half the width; the defect is only that
  the tail is never tested, which this change fixes with the existing rules.
- **Chunks (`_build_chunks_from_words`).** They have no rewind; their sentence breaks are
  unaffected.
- **Line layout inside a cue (`_balance_two_lines`).** Unchanged; it receives shorter cues.
