# A colon between digits is part of the number

SPEC-ID: SPEC-ADDON-015

Approval: sha256:c19907e7074c1d4761a052d6e5c1879cda0648ce8d3ddc17b43a68f77dd77864 Yuichi Senga 2026-10-10

## Summary

SPEC-ADDON-010 stopped a `.` or `,` between two digits from acting as punctuation when the
intelligence addon cuts transcripts into chunks and subtitle cues, and SPEC-ADDON-014 kept
the two-line layout of a cue from breaking inside such a number. A time written in digits
with a colon, `12:30` or `12：30`, is not covered: `:` and `：` are soft punctuation
(`_PUNCT_SOFT` in `subtitle_builder.py` and `workers/whisper.py`), so a cue may end at
`12:` with `30` starting the next one, a chunk may end there, and a long CJK cue's line
break may fall right after the colon (`…12：` / `30から…`). Refine (010) asks the LLM to
write times in digits, so these appear in every refined transcript that mentions one. After
this change `:` and `：` between two digits count as digit separators wherever `.` and `,`
already do, through the one helper module `app/digit_separator.py`. For viewers of the
subtitles and for search, which reads chunks.

## Required items

### 1. Normal flow

SPEC-ADDON-015:

1. `app/digit_separator.py` recognises four separator characters: `.`, `,`, `:` (U+003A) and
   `：` (U+FF1A). Digits stay `0`–`9` only.
2. `is_digit_separator(prev_text, text, next_text)` answers as 010 Normal flow step 4
   defines, with "`.` or `,`" read as any of the four characters. `12:` followed by `30`,
   `12：` followed by `30`, and a lone `:` row between rows ending and starting
   with a digit are digit separators.
3. `splits_number(text, pos)` answers as 014 Normal flow step 3 defines, with "`.` or `,`"
   read as any of the four characters. In `12:30` and `12：30` the positions of the
   colon and of each digit after the first are inside the number; in `12: 30` the colon
   and the digits after the first are, and the space is not (as `3. 3km` in 014), which
   does not matter because the space-separated path never splits there (step 4).
4. The callers do not change. Because they already ask these two functions:
   - `workers/whisper.py` `_build_chunks_from_words` does not break a chunk by punctuation
     at a colon between digits;
   - `subtitle_builder.build_cues` does not end a cue by punctuation there and does not
     record a safe break there;
   - `_balance_two_lines` keeps `12:30` on one line in the space-separated path and moves a
     CJK split that falls inside `12：30` to the edge of the number, as 014 does for `3.3`;
     the CJK soft-punctuation scan skips a `：` or `:` inside a number and continues to the
     next soft punctuation.
5. A `:` or `：` that does not sit between two digits (`Note: 3 items`, `時刻：12時`) is
   soft punctuation exactly as today.

### 2. Failure cases

- `1:2` meaning a ratio, `3:16` a verse, `1：0` a score: these are numbers by this
  definition too and stay together, which is what a reader wants for them as well.
- `Step 1: 2 eggs` written with a space: the space form counts as inside the number (as
  `3. 3km` does for 014), so that cue loses one soft break candidate and the `1:` row is no
  longer a soft chunk break. The silence gap and the width and duration limits still split
  both. Accepted.
- A CJK label number followed by a count with no space (`その1：3種類`, `ポイント2：5分`)
  is also joined: the cue does not end and the line does not break at that `：`, and the
  chunk does not break there by punctuation. The text reads fine on one line or broken
  elsewhere. Accepted.
- A long run of times (`12:30, 13:45, …`) with no other break: the duration and width
  limits still bound chunks and cues, as 010 I8 and 014 step 4 already state for `.`/`,`.

### 3. States

None. Chunks are stored when transcribed or refined; cues are built on request.

### 4. Data read and written

- Chunks (`transcript_chunks`) written by a transcription or refine run after this change
  may end at different words than before. Existing rows are not rewritten.
- Cues: none stored.

### 5. External services

None. No LLM, Whisper or aligner call changes.

### 6. Authorization

None. No endpoint changes.

### 7. Effect on existing features

- Every caller of `is_digit_separator` and `splits_number` (listed in step 4) gains the new
  characters; there are no other callers.
- `_PUNCT_SOFT` keeps `:` and `：`; only the digit-separator test excludes them.
- Search over chunks: a chunk no longer ends in the middle of a time, so a time is not
  split between two chunks' texts and embeddings.

### 8. Error behavior

None new. Both functions are pure string tests.

### 9. User-visible behavior

- A subtitle cue does not end between the hours and minutes of a time written with a
  colon, and a two-line cue does not break its line there.
- Chunk boundaries of newly transcribed or refined text move off such colons.

### 10. Non-functional

No measurable cost: one more membership in a four-character set.

## Touch points

- `addons/intelligence/app/digit_separator.py`: the separator set and the docstrings of
  `is_digit_separator` and `splits_number`.
- Callers, unchanged in code: `addons/intelligence/app/subtitle_builder.py`
  (`build_cues`, `_safe_break_between`, `_balance_two_lines`, `_number_edge`),
  `addons/intelligence/app/workers/whisper.py` (`_build_chunks_from_words`).
- Tests: new rows citing SPEC-ADDON-015 in `addons/intelligence/tests/`; the test oracles
  that hard-code `.,` (`_is_digit_separator_boundary` in `test_digit_separator_breaks.py`,
  `_inside_number` in `test_subtitle_line_split_numbers.py`) learn `:` and `：`, or a
  sweep over colon times would pass whatever the code does.
- The addon change is committed in the addon repository; the core bumps the
  `addons/intelligence` pointer.
- Review topic: `docs/process/reviews/feature-digit-colon-times/`.
- Rule read, not edited: `.claude/rules/backend-conventions.md` (no language-dependent
  rules in string processing; see Checked, no action).
- No protected path.

## Invariants

I1. `is_digit_separator` returns True for a row ending in `:` or `：` whose preceding
character (in the row, or the previous row's last character when the row is the separator
alone) is a digit `0`–`9` and whose next row starts with a digit, and False when either
neighbour is not a digit.
I2. In `朝12：30から` and `at 12:30 today`, `splits_number` is True at the colon and at each
digit after the first, and False at the first digit and just after the last digit; it is
False at the colon of `Note: 3`, `時刻：12時`, `a:3` and `3:a`.
I3. `_build_chunks_from_words` does not break a chunk by punctuation at a `:` or `：` digit
separator, in the character-row and the token-row form; the silence-gap break and the
`max_duration` flush still apply there.
I4. `build_cues` does not end a cue by punctuation at a `:` or `：` digit separator and does
not record a safe break there, for Japanese and for other languages.
I5. `_balance_two_lines` never returns a cue whose line break falls inside `12:30`, `12：30`
or `12: 30`, in the space-separated and the CJK path, with janome available and without.
I6. A `:` or `：` not between two digits still breaks chunks, ends cues and splits CJK lines
exactly as before this change.
I7. Every expected output in the existing SPEC-ADDON-010 and SPEC-ADDON-014 test tables
(chunk groups, cue groups and two-line layouts for `.` and `,`) is unchanged.

## Revises

SPEC-ADDON-014 I7. `_balance_two_lines` never returns a cue whose line break falls inside a number written in digits as defined in 014 step 3 with `:` and `：` added to `.` and `,` (015), for the space-separated and the CJK path, with janome available and without it; a CJK cue whose midpoint falls inside `3.3` in `だいたい3.3キロ…` breaks immediately before the `3.3`.
SPEC-ADDON-014 I9. `_balance_two_lines` still splits a cue over the soft width at the same position as before 015 when that position is not inside a number as 015 defines it, and returns a cue within the soft width unchanged.

## Checked, no action

- **Full-width digits (`１２：３０`).** Digits stay `0`–`9`, as in 010 and 014; refine asks
  for Arabic digits `0-9`, and widening the digit set would change 010's and 014's
  behaviour for `.`/`,` too. Left for a spec that sees them in real output.
- **Removing `:`/`：` from `_PUNCT_SOFT`.** A colon after a word is a real clause break.
- **Other separators (`/` in dates, `-` in ranges, `〜`).** None of them is soft punctuation
  today, so none of them breaks a chunk, cue or CJK line by punctuation.
- **Rewriting stored chunks.** Chunk boundaries are not wrong enough to justify
  re-chunking existing transcripts; new runs pick up the change.
- **backend-conventions' rule on language-dependent string rules.** `：` is a separator
  character, like `.` and `,`, not a word of one language; the test asks whether the
  character sits between two digits, whatever the language of the transcript.
- **Japanese time words (`12時30分`).** No separator, so already one run.
