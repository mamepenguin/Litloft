# A subtitle cue ends no later than the next cue starts

SPEC-ID: SPEC-ADDON-018

Approval:

## Summary

`subtitle_builder.build_cues` ends each cue at the `timestamp_end` of its last word. Stored
word rows can overlap: in file `0Bdqkd-7jvPe` the row `。` runs 13.12–14.88 s while the next
row `え` starts at 13.695 s. A cue ending with such a row then ends after the next cue starts,
and a player shows both cues at once for that stretch. R-5 of SPEC-ADDON-017 counted 1,306
overlapping cue pairs across 113 transcribed files (1,045 before 017; median 0.65 s, up to
6.9 s). After this change every cue's end is clamped to the start of the next cue, so at most
one cue is on screen at a time. The word rows are not changed. For viewers of the subtitles.

## Required items

### 1. Normal flow

SPEC-ADDON-018:

1. `build_cues` builds the cues as today.
2. On the complete cue list (after the trailing `emit` of the last cue) and before the
   two-line layout, for each cue that has a next cue, comparing against the next cue's
   `start` (never an already clamped value): if the cue's `end` is later
   than the next cue's `start`, and the next cue's `start` is later than the cue's own `start`,
   the cue's `end` becomes the next cue's `start`. Nothing else about the cue changes.
3. The last cue keeps its `end`.
4. The WebVTT is serialised from these cues as today.

### 2. Failure cases

- Next cue starting at or before the cue's own `start` (word rows out of order, or two cues
  starting at the same instant): the cue is left as it is, overlap included, because clamping
  would give it no time on screen and the viewer would lose its text. Not observed in the
  measured data; accepted.
- A clamp that leaves a cue very short: its text shows briefly, which is what the audio
  timing gives; accepted.

### 3. States

None. Cues are built on request; nothing is stored.

### 4. Data read and written

Read: transcript word rows, as today. The word rows and the `words` passed to `build_cues`
keep their overlapping times. Written, indirectly: a transcript-panel capture into a
knowledge note records the cue's `end` as `end_seconds` (see item 7), so new captures store
the clamped end; existing notes are not touched.

### 5. External services

None.

### 6. Authorization

Unchanged: the subtitles endpoint's existing access checks.

### 7. Effect on existing features

- `build_cues` is called only by `build_vtt` (the subtitles endpoint). Its WebVTT is read by
  the players (web, iOS) and by the transcript panel (`TranscriptSection.tsx`, the "words"
  source via `parseVttCues`). In the panel the highlighted row is the cue with
  `start <= currentTime < end`, so during a former overlap the highlight now moves to the next
  row at its start instead of staying on the earlier row; a capture to a knowledge note
  records the clamped `end`. Both are intended. Chunks and search do not read cues.
- Cue boundaries, texts and starts are unchanged; only some `end` times move earlier.
- SPEC-ADDON-017 I1, I2, I7 and I8 state cue ends as a word's `timestamp_end`; they now hold
  before the clamp (see Revises).

### 8. Error behavior

None new.

### 9. User-visible behavior

In the player (web and iOS, both read the WebVTT), a subtitle disappears when the next one
appears instead of both showing together. In the transcript panel the highlighted row
follows the same timing, and a capture records the clamped end. Cues that did not overlap
are unchanged.

### 10. Non-functional

One pass over the cues; no measurable cost.

## Touch points

- `addons/intelligence/app/subtitle_builder.py`: `build_cues` (after the word loop, before
  `_balance_two_lines`).
- Read, not changed: `to_webvtt`, `build_vtt`, the word rows in `transcript_words`;
  `addons/intelligence/frontend/TranscriptSection.tsx` (reads the WebVTT; its highlight and
  capture follow the clamped ends).
- Tests: new tests citing SPEC-ADDON-018 in `addons/intelligence/tests/` and in
  `addons/intelligence/frontend/TranscriptSection.test.tsx` (I8).
- The addon change is committed in the addon repository; the core bumps the
  `addons/intelligence` pointer.
- Review topic: `docs/process/reviews/feature-cue-no-overlap/`.
- Docs: none; no page describes cue timing.
- No protected path.

## Invariants

I1. On any input, including word rows that overlap, for every pair of consecutive cues
returned by `build_cues` where the second starts later than the first, the first's `end` is
not later than the second's `start`; this covers the second-to-last cue against the last.
I2. A cue whose `end` was later than the next cue's `start` (and that next `start` later than
its own) ends exactly at the next cue's `start`.
I3. A cue whose `end` was not later than the next cue's `start` keeps its `end`, and the last
cue keeps its `end`.
I4. Every cue's `start` and `text` are what they were before this change, and the number of
cues is unchanged.
I5. Every cue's `end` is not before its `start`.
I6. When the next cue starts at or before a cue's `start`, that cue's `end` is unchanged.
I7. The `words` list passed to `build_cues`, and every dict in it, are unchanged after it
returns.
I8. In the transcript panel, given WebVTT whose cues are back to back, the highlighted row
changes to the next row when playback reaches that row's `start`.

## Revises

SPEC-ADDON-017 I1. When the word that makes a cue reach `max_width` ends with `。` (or `.`), the flush carries a tail ending with that word, and the tail's duration is at least `min_duration`, the tail is a cue of its own ending at that word's `timestamp_end`, clamped by SPEC-ADDON-018 to the next cue's start, and the following word starts the next cue.
SPEC-ADDON-017 I2. The same holds when that word is followed by a gap of at least `silence_gap` and does not end with punctuation, and when the cue reached `max_duration` rather than `max_width`, with the end clamped by SPEC-ADDON-018 to the next cue's start.
SPEC-ADDON-017 I7. In the cases of I1 and I2, the cue before the tail is the rewind head, with the same text as before SPEC-ADDON-017 and the same `end` before the SPEC-ADDON-018 clamp.
SPEC-ADDON-017 I8. A cue that never reaches `max_width` or `max_duration` ends at the first word that passes the hard or soft test, exactly as before SPEC-ADDON-017, its end then clamped by SPEC-ADDON-018 to the next cue's start.

## Checked, no action

- **Fixing the overlapping word rows at the source.** The rows come from Whisper word
  timestamps and the aligner; changing them would rewrite stored transcripts that cannot be
  regenerated without re-transcribing, and the transcript panel tolerates the overlap. The
  cue builder is where two things are shown at once, so it is fixed there.
- **Shifting the next cue's start later instead.** The start is when the speech begins;
  moving it would show the text after it is heard.
- **A minimum gap between cues.** Players handle back-to-back cues; no flicker was reported.
- **Overlap inside one cue's words.** Invisible: one cue is one text block.
