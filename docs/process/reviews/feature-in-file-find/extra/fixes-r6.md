# Review r6 — 7ad2c1a39 (front-dropping and score fallbacks for text-row find marks), on fa7e34434

Scope: `git show 7ad2c1a39` only. Probes and mutants ran in a throwaway detached worktree at
7ad2c1a39 (`scratchpad/rev6-core`), removed afterwards. Nothing in `video_share-b2` was edited.

## How the probes were built

- Rows: the same Python copy of the addon path as r5 (`chunk_text` 400/80 with `strip()`,
  `_merge_chunks`, `_positions`, `_snippet`, 80 code points either side with `…`). For CSV, JSON,
  SRT and VTT the text is first passed through the addon's own `_clean_by_type`, executed from
  `addons/intelligence/app/extractors/text.py` as it stands.
- Ground truth in Markdown: re-render with that one occurrence replaced by a same-length marker;
  the rendered occurrence that disappears is the right one; none disappears = right answer is
  "no mark". For cleaned formats: the k-th cleaned occurrence is the k-th occurrence in a line the
  cleaner keeps (not a timing / header / cue-number line, not a JSON key).
- Actual: `markFindOccurrences` on the real `MarkdownPreview` output with the `textSource` the
  viewer passes (`{text: source, bodyStartLine: frontmatterLines, mode: "markdown"}`), or a
  one-span-per-line `<pre>` in plain mode as `TextLines` draws it.
- Knowledge path: each corpus file is given a knowledge-style frontmatter (`id`, `title` = its H1,
  `created`, `tags` = the three probe terms), rows are cut from the whole file, and
  `MarkdownPreview` gets gray-matter's `content` (the body), as `Editor.tsx` does.

## Corpus run (same 147 `docs/**/*.md` files, same 3 terms each, up to 10 rows per term as r5)

| Path | Rows | Correct mark | Correct no-mark | Wrong mark | Missing mark |
|---|---|---|---|---|---|
| Core viewer, source with frontmatter (r5 at b8a77c9cc) | 3910 | 3902 | 6 | 1 | 1 |
| Core viewer, source with frontmatter (this commit) | 3910 | 3903 | 5 | 2 | 0 |
| Knowledge preview, body only (parent fa7e34434) | 4698 | 4017 | 544 | 2 | 135 |
| Knowledge preview, body only (this commit) | 4698 | 4152 | 543 | 3 | 0 |

- Core: the 161 rows in files whose merged chunks are not the source (the chunk-seam files of r5
  finding 4) were scored against the unique full-snippet position: all 161 correct, so the
  front-dropping also recovers the seam rows r5 counted as unfound.
- Core wrong marks (2): `developer-guide/backend-dev.md` `backend` row 6 and
  `user-guide/drives-and-access.md` `admin` row 5. Both rows sit in a link URL that the render
  hides; both are now marked on the visible text of **the same link** (finding 5). r5's
  "missing" row (backend-dev row 7) is now correct.
- Knowledge: every frontmatter row (title, tag) gives no mark: 543 of 545 expected-none rows; the
  other 2 are the same two link-URL rows. The 135 rows the parent missed near the top of each note
  are all correct now. The third wrong mark is `developer-guide/reviews/346/r2.md` `synced` row 9,
  in a code block of identical lines (finding 4, pre-existing).
- Predecessor's 23 synthetic Markdown cases (link URL, image, aliased wikilink, fence language,
  nested lists, tables, CRLF, ...): 132 correct, 12 correct no-mark, 0 wrong, 1 missing: the
  visible row of the reference-style link `See [docs][budget] and budget.` scores 3, below 10.
  (The harness reported a second "missing" on that line's label row; that is a ground-truth
  artifact, since replacing the label breaks the reference and makes it render as text.)

## Cleaned formats, plain mode (finding 3 of r5)

| Input | Rows | Correct | Missing | Wrong | Parent |
|---|---|---|---|---|---|
| CSV, 40-row household ledger, `budget` / `groceries` | 39 | 39 | 0 | 0 | (r5 measured 0/20 on its CSV) |
| CSV with quoted cells holding commas, `beacon` | 72 | 72 | 0 | 0 | |
| Real Whisper VTT in the repo (`feature-whisper-langdetect-refine-digits/r5/`, en ×2, ja ×2), 14 terms | 110 | 99 | 10 | **1** | 0/110 |
| JSON, 20 log entries with long `text` values | 41 | 16 | 25 | 0 | |
| JSON, 15 short note objects | 52 | 1 | 51 | 0 | |

CSV is fixed. VTT mostly fixed, with one wrong mark on real data (finding 2). JSON is mostly not:
the key name sits between every two values in the file but not in the cleaned text, so the
before-context never agrees and only rows with ≥10 letters on the after side inside the same value
reach the threshold (finding 6).

## Findings

### 1. A frontmatter value that repeats the body's text gets a wrong mark on the knowledge path

- **File:line**: `frontend/src/lib/findMarks.ts:192-209` (front-dropping in `locateTextRow`), reached
  from `MarkdownPreview.tsx:469-474` with the body-only source the knowledge editor passes.
- **Claim**: on the knowledge path a frontmatter row is kept unmarked only because its snippet,
  after dropping, still holds frontmatter text that the body does not have (the next key, or the
  closing `---`). When the 80 code points after the term all lie inside one frontmatter value, and
  the body contains that same text, the remainder is found in the body and the row is marked on the
  body's occurrence. The body's own row then marks the same occurrence again. I5 says a row
  located in frontmatter gets no mark; here the row is a frontmatter row that never reaches that
  check because it is located in the body instead.
- **When**: a note whose frontmatter carries a long `summary:` / `description:` / `excerpt:` that
  repeats the opening sentence of the body (common in notes imported from other tools and in
  hand-written notes that open with their own summary), and a term in it more than 80 characters
  before the end of the value. Knowledge preview only; the core viewer gets it right.
- **Frequency**: 1. **Impact**: 4 (the outline sits on body text identical to what the row shows,
  so it reads as a duplicate step rather than a jump to an unrelated place).
- **Evidence**: synthetic `summary: The beacon on the north pier was cleaned on Monday and the
  keeper replaced the lamp before the storm arrived from the west.` with the same sentence as the
  body's first paragraph: knowledge row 2 (the summary's `beacon`) → marks rendered 1, expected
  none; core viewer: none (correct). With the summary carrying a longer tail, row 1 → rendered 0.
  At the parent fa7e34434 both rows were unmarked. The addon's own clip frontmatter
  (`url`, `origin`, `created`) is not affected: a clip URL row is followed by `origin:` within 80
  characters, and even a 100-character URL that recurs in the body as a link stayed unmarked.
- **Introduced** by this commit.

### 2. In a subtitle file, a phrase that recurs mid-cue takes the mark from the same phrase split across a cue boundary

- **File:line**: `frontend/src/lib/findMarks.ts:429-438` (whole-text score fallback in plain mode),
  scoring through `chooseCurrentOccurrence` (`:289-338`).
- **Claim**: the snippet is cut from the cleaned text, where cues are joined by a space; the
  rendered VTT/SRT has the cue number and the timing line between them, and those digits count as
  context letters. An occurrence at the start or end of a cue therefore loses its before- or
  after-side agreement (score ≤ 20), while another occurrence of the same phrase in the middle of a
  cue keeps both sides. When the surrounding words are a recurring name or phrase of ≥10 letters,
  the other occurrence wins uniquely, above the threshold: a wrong mark and a scroll to a different
  cue.
- **When**: find in a `.vtt` / `.srt` whose speaker repeats a place name or phrase, once broken
  over a cue line and once inside a cue. Whisper cuts cues by time, so this happens naturally.
- **Frequency**: 1 (find in a subtitle file is occasional; ~1% of its rows). **Impact**: 5 (the
  scroll lands on another cue with the same words; the timing above it is the only tell).
- **Evidence**: real file `docs/process/reviews/feature-whisper-langdetect-refine-digits/r5/addon-012-014/ja-whisper-subtitles.vtt`,
  term `公園`, row 7: the occurrence is cue 105 `公園まで行くとですね、`, preceded by cue 104
  `さらにそこから\nシンボルプロムナード`. It is marked on rendered occurrence 3, cue 89
  `そしてシンボル\nプロムナード公園や夢の`, whose before-side agrees on the 10 letters
  `シンボルプロムナード`; the right occurrence (6) agrees on 0 before. 1 of 110 rows over the four
  real VTT files; a constructed lecture with `the annual budget was approved` split over two cues
  and repeated whole in a later cue gives the same wrong mark for `budget` and `harbor`, in VTT and
  SRT alike.
- **Introduced** by this commit as an approved I5 fallback; the same scoring ran for every row at
  r4 (c18f75676), so this is r4's behaviour returning for cleaned files. Dropping digits that come
  from timing lines, or scoring only the side that does not cross a cue boundary, would close it.

### 3. Front-dropping in a cleaned file can pick a repeat by an ordinal counted in a different text

- **File:line**: `frontend/src/lib/findMarks.ts:192-230` (dropping, then the `hits.length > 1`
  tie-break by `row.ordinal` against `termStarts(source, term)`).
- **Claim**: for a row within 80 characters of the end of the cleaned text the snippet has no
  trailing `…` and a short tail. Dropping can then shrink it to the term plus that tail, which
  recurs in the raw file. The tie-break compares the row's ordinal, counted in the **cleaned**
  text, with ordinals counted in the **raw** file, which in JSON also holds every key and every
  short string the cleaner dropped. The nearest ordinal is then a different occurrence: a wrong
  mark, where the parent gave none.
- **When**: a JSON file whose keys contain the search term (`"budget": 30` next to
  `"name": "lamp budget"`), searching the term, on the last rows of the file.
- **Frequency**: 0–1. **Impact**: 4.
- **Evidence**: `{"budget": 1200, "budget_note": "...", "items": [{"name": "lamp budget",
  "budget": 30} ×5]}`, term `budget`, row 7 (the last `lamp budget`): marked on rendered
  occurrence 6 (the second item), expected 12. The remainder `lamp budget` has 5 hits; their raw
  ordinals are 5, 7, 9, 11, 13 and the row's ordinal is 7.
- **Introduced** by this commit. The same comparison of a cleaned-text ordinal with a raw-text
  position also underlies finding 4.

### 4. Knowledge preview: inside repeated text, the ordinal tie-break is off by the frontmatter's occurrences

- **File:line**: `frontend/src/lib/findMarks.ts:212-230`.
- **Claim**: r5 finding 1 noted it in parentheses and this commit does not address it. The row's
  ordinal counts the term in the whole file, frontmatter included; the hits are ordinalled in the
  body. When the snippet itself repeats in the body (identical lines in a code block or log), the
  nearest-ordinal hit is shifted by the number of frontmatter occurrences, so consecutive rows mark
  the next repeat, and the last few collapse onto the same one.
- **When**: a knowledge note with the term in its title or tags and a run of ≥160 characters of
  identical lines containing it (pasted logs, config dumps).
- **Frequency**: 1. **Impact**: 3 (the shifted mark sits on an identical line nearby).
- **Evidence**: corpus `developer-guide/reviews/346/r2.md`, `synced`, row 9 → rendered 8, expected
  7 (core viewer: 7). Synthetic note with `tags: [synced]`, `title: synced notes` and 8 identical
  lines `last_synced_at=None  cooldown_until=now+60min` in a fence: rows 5–8 → 4, 5, 6, 6
  (expected 2, 3, 4, 5); core viewer all correct. Identical at the parent.
- **Pre-existing** (b8a77c9cc). Counting the hits' ordinals in the text the row was cut from (the
  body offset by the frontmatter's occurrence count) would close it; it needs the frontmatter, which
  the knowledge path does not pass.

### 5. A row in a hidden link URL is now marked on the link's visible text (r5 finding 2: holds, with this residue)

- **File:line**: `frontend/src/lib/findMarks.ts:501-505` (score within a block whose counts differ).
- **Claim**: r5 finding 2 is closed: no visible row lands on its neighbour any more, and the last
  visible row of the block is marked. But the hidden row itself is not left unmarked: it scores
  against the visible occurrences of its block, and when the link text repeats the URL's words
  (`[`.claude/rules/backend-conventions.md`](../../.claude/rules/backend-conventions.md)`,
  `[admin dashboard guide](../admin-guide/admin-dashboard.md)`), the link text wins. Two
  consecutive rows then mark the same occurrence. This is what I5 r5 prescribes (score within the
  block), and the new test pins it (`FindInFile.test.tsx:2117-2142`, row 6 → mark 4), so it is a
  design outcome for the human to confirm, not a slip. Where the link text does not repeat the
  URL (`[the docs](https://example.com/budget/plan)`) the hidden row scores 0 and stays unmarked.
- **When**: a relative link whose text is its own path or title, with the term in it.
- **Frequency**: 3. **Impact**: 2 (the outline is on the link that hides the occurrence).
- **Evidence**: corpus, the two core wrong marks and two of the three knowledge ones.
- **Introduced** (consequence of the approved rule).

### 6. JSON: r5 finding 3 still holds for most rows

- **File:line**: `frontend/src/lib/findMarks.ts:429-438` with `_clean_json`
  (`addons/intelligence/app/extractors/text.py:141-163`).
- **Claim**: the cleaned JSON is the string values joined by spaces; the rendered file has the key
  name immediately before every value and after it the next key. So the before-side of a score
  agrees on 0 letters for any term near the start of a value, and the after-side stops at the end of
  the value. Only rows with ≥10 agreeing letters inside one value reach the threshold; the rest
  get no current mark and no scroll, exactly as at the parent. No wrong mark was seen.
- **When**: find in a `.json` file.
- **Frequency**: 1. **Impact**: 5 (stepping does not move the page for most rows).
- **Evidence**: 20 log entries with long `text` values: 16/41 rows marked, 25 unmarked; 15 short
  note objects: 1/52 marked.
- **Pre-existing** (r5); the commit message claims cleaned files are handled and the I5 text lists
  JSON among them. Whether to accept JSON as a format with mostly no mark is the human's call.

### 7. A frontend test now depends on the prose of `docs/developer-guide/backend-dev.md`

- **File:line**: `frontend/src/components/FileDetail/__tests__/FindInFile.test.tsx:1526-1529`
  (`readFileSync(.../docs/developer-guide/backend-dev.md)`) and `:2117-2142` (rows 6 and 7 hard-coded
  to marks 4 and 5).
- **Claim**: the expected indices are facts about the current wording of line 5 of a developer
  doc. Any edit that adds, removes or moves a "backend" before or inside that paragraph breaks the
  test or, worse, keeps it green while it no longer contains a hidden-URL occurrence at all (the
  case it exists for). `process/gates.conf:27` runs the frontend suite only when a change touches
  `frontend/`, so a docs-only PR that edits this page passes its own gates and the red test lands
  on the next unrelated frontend PR.
- **When**: someone edits `backend-dev.md`, which the CLAUDE.md docs rule makes routine for backend
  changes.
- **Frequency**: 1. **Impact**: 3 (a confusing red CI on an unrelated PR, or a test that silently
  stops covering its case).
- **Evidence**: reading of the test; the same shape is already covered by inline fixtures
  (`LINK_URL_NOTE`), so an inline copy of the paragraph would carry the case without the coupling.
- **Introduced** by this commit.

### 8. The whole-text score fallback is narrower than I5 says, and the narrowing is what keeps knowledge title rows unmarked

- **File:line**: `frontend/src/lib/findMarks.ts:429-433` (`if (source.mode !== "plain") return null;`).
- **Claim**: I5 r5 says "when the snippet cannot be located at all ... the occurrence is chosen
  over the whole rendered text by the same r3 score", with no restriction to a viewer. The code
  applies it only in plain mode. On the knowledge path, a frontmatter title or tag row is exactly
  a row that cannot be located, so the letter of I5 would score it against the body, and a title
  that repeats the H1 would mark the H1. The code's narrowing is the safer reading, and
  `FindInFile.test.tsx` pins it (M9 below, removing the guard, is killed by "places each body row
  on its own occurrence ... rows within 80 characters after the frontmatter"). No defect in use;
  the approved text and the code disagree, which the process treats as something for the human to
  settle (amend I5 to "in a viewer that renders text the addon cleaned", or accept the code).
- **Frequency**: 0. **Impact**: 1.
- **Introduced** by this commit.

## Mutation testing

Test set: `src/lib/__tests__/findMarks.test.ts`, `src/lib/__tests__/findMarks.position.test.ts`
(31 tests, run first), then `src/components/FileDetail/__tests__/FindInFile.test.tsx`,
`FindMarksRender.test.tsx`, `src/components/__tests__/MarkdownFileViewer.find.test.tsx`
(126 tests), only when the first stage survived. 157 tests, green at 7ad2c1a39. One mutant at a
time on `frontend/src/lib/findMarks.ts`, the file restored byte-for-byte after each run (checked).
Line numbers are at 7ad2c1a39.

| Id | Line | Mutation | Result | Killed by |
|---|---|---|---|---|
| M1 | 194 | drop loop `dropFrom < matchIndex` (never tries term-first remainder) | KILLED | FindInFile "first paragraph with a link", "short memo" (frontmatter rows) |
| M2 | 194 | no dropping (`dropFrom <= 0`) | KILLED | position "drops the front of a snippet that reaches into the frontmatter" |
| M3 | 194 | dropping may pass the term (`dropFrom < snippet.text.length`) | KILLED | position "lands every VTT row" |
| M4 | 204-206 | keep dropping after a hit (shortest remainder wins) | **SURVIVED** | — (finding 9) |
| M5 | 211 | `remainderIndex = matchIndex` | KILLED | position "drops the front ..." |
| M6 | 217 | tie-break reads `hit + matchIndex` | SURVIVED (equivalent in use) | — |
| M7 | 232 | located reads `chosen + matchIndex` | KILLED | position "drops the front ..." |
| M8 | 433 | plain fallback removed (null) | KILLED | position CSV, VTT, "scores the whole text" |
| M9 | 433 | mode guard removed (Markdown also scores) | KILLED | FindInFile knowledge "rows within 80 characters after the frontmatter" |
| M10 | 435 | plain fallback scores the unfolded text | **SURVIVED** | — (finding 10) |
| M11 | 435 | plain fallback context with needle length 0 | KILLED | position "scores the whole text" |
| M12 | 481 | block occurrence `<= range.end` | SURVIVED (equivalent in use) | — |
| M13 | 481 | block occurrence `> range.start` | KILLED | FindInFile, 26 tests |
| M14 | 485 | empty-block guard removed | SURVIVED (equivalent) | — |
| M15 | 491 | count comparison forced true (always k) | KILLED | position "scores each visible row ... when the source hides one" |
| M16 | 491 | count comparison forced false (always score) | KILLED | FindInFile, 8 tests |
| M17 | 491 | `sourceCount >= blockOccurrences.length` | KILLED | position "... source hides one" |
| M18 | 491 | `sourceCount <= blockOccurrences.length` | SURVIVED (equivalent in use) | — |
| M19 | 489 | source count `position <= blockTo` | SURVIVED (near-equivalent) | — |
| M20 | 489 | source count `position > blockFrom` | KILLED | FindInFile, 3 tests |
| M21 | 489 | source count over the whole file | KILLED | FindInFile, 5 tests |
| M22 | 498 | k path returns `blockOccurrences[k]` | KILLED | 46 tests |
| M23 | 497 | `k === 0` guard removed | SURVIVED (equivalent) | — |
| M24 | 494 | k loop breaks on `position >= located` | KILLED | 46 tests |
| M25 | 505 | score path returns the block-local index | KILLED | FindInFile backend-dev.md rows 6 and 7 |
| M26 | 502 | score path scores every occurrence, not the block's | KILLED | FindInFile backend-dev.md |
| M27 | 347 | `occurrenceContexts` ignores `indices` | KILLED | FindInFile backend-dev.md |
| M28 | 350 | after-window starts at the match start | KILLED | position "... source hides one", "scores the whole text" |
| M29 | 349 | before-window read at the match end | KILLED | same two |
| M30 | 74 | `SCORE_MIN = 11` | KILLED | findMarks "agrees on exactly ten letters" |
| M31 | 74 | `SCORE_MIN = 9` | KILLED | findMarks "agrees on only nine" |
| M32 | 330 | top score need not be unique | KILLED | findMarks "falls back to the ordinal when two ... share the highest score" |
| M33 | 551-555 | page-row contexts with needle length 0 | **SURVIVED** | — (finding 11) |
| M34 | 193 | `dropFrom = 1` (whole snippet never tried) | KILLED | FindInFile "first paragraph with a link", "short memo" |

Equivalent or near-equivalent survivors, with why no defect is reachable:

- M6 (`findMarks.ts:217`): differs from the code only when dropping happened **and** the remainder
  repeats; on the knowledge corpus (4698 rows) and the synthetic notes its results are identical
  to the unmutated code.
- M12 (`:481`): `range.end` is the end of the block's last text node; markdown-it puts a `"\n"`
  text node between blocks, so no occurrence starts exactly there.
- M14 (`:485`): with no rendered occurrence in the block, both later paths return null anyway
  (`chooseCurrentOccurrence([])` is null; the k path indexes an empty array).
- M18 (`:491`): reachable only when a block renders more occurrences than its source holds
  (e.g. a term split by emphasis, `bud**get**`); identical results on all 3910 + 4698 corpus rows.
- M19 (`:489`): needs a term at column 0 of the line right after a block with no blank line
  between; the score path it then takes picked the same occurrence in every probe.
- M23 (`:497`): with `k === 0`, `blockOccurrences[-1] ?? null` is already null.

### 9. Survivor M4: nothing tests that the longest remainder is used, and the shortest one gives wrong marks

- **File:line**: `frontend/src/lib/findMarks.ts:204-206` (the `break` after the first hit).
- **Claim**: if the loop kept dropping after the first found remainder and used the last one
  (term plus its after-context only), every test passes. In use, losing the before-context makes
  repeats far likelier, and the ordinal tie-break on the knowledge path is off by the frontmatter's
  occurrences (finding 4), so the mark moves to a neighbouring repeat.
- **When it would bite**: a regression in that loop; then knowledge notes with the term in their
  frontmatter and repeated phrases in the body.
- **Frequency** 0 today, **impact of the defect it would let through** 8 (silently wrong marks).
- **Evidence**: M4 on the knowledge corpus: 9 wrong marks against 3 (new ones in
  `fix-configure-preserve-gui-config/r1/triage.md` `intelligence` rows 2 and 4,
  `feature-thumbnail-slot-ownership/r2/triage.md` `thumbnail` row 10,
  `feature-semantic-search-all-hits/r2/triage.md` `rename` row 3, `346/r2.md` rows 7 and 8).
  A knowledge-path test whose body repeats a term-plus-tail phrase (a list of
  `- Note: The addons/intelligence pointer ...` lines) with the term also in `tags:` would kill it.
- **Introduced** (test gap of this commit).

### 10. Survivor M10: the plain fallback scoring the unfolded text is not caught

- **File:line**: `frontend/src/lib/findMarks.ts:435` (`occurrenceContexts(foldedText, ...)`).
- **Claim**: passing the raw text instead of the folded one lets every capital letter in an
  occurrence's context disagree with the folded snippet. The CSV and VTT tests survive because
  their context is mostly lower case.
- **When it would bite**: a regression there; subtitles and CSVs are full of capitals (sentence
  starts, names, categories).
- **Frequency** 0 today, **impact of the defect it would let through** 5 (fewer marks, and some
  wrong ones).
- **Evidence**: M10 on the four real VTT files: correct 99 → 81, wrong 1 → 3; on the synthetic
  CSV/VTT/SRT/JSON set: correct 124 → 100. A cue such as `Cue 1 explains the Annual Budget for
  the North team` in the existing VTT fixture would kill it.
- **Introduced** (test gap of this commit).

### 11. Survivor M33: the refactored page-row path loses its after-side check without a test noticing

- **File:line**: `frontend/src/lib/findMarks.ts:551-555` (page branch now calls
  `occurrenceContexts(folded, starts, needle.length)`).
- **Claim**: with needle length 0 the after-window starts at the match itself, so a PDF page row's
  after-side agreement drops to 0 and only its before-side can reach the threshold; the rest fall
  back to the ordinal. No test distinguishes it, since the page tests either agree on 10+ letters
  before or fall back to the ordinal anyway.
- **When it would bite**: a regression in the shared helper's call from the page branch; PDF pages
  where the term repeats and only the text after it tells the occurrences apart.
- **Frequency** 0 today, **impact of the defect it would let through** 4 (the outline falls back to
  the ordinal, which on a PDF page is usually but not always right).
- **Introduced** (the refactor in this commit moved the page path onto the helper; the page tests
  predate it).

## Other questions asked

- **r5 finding 1 (knowledge preview near the top)**: holds. 135 missing rows at the parent → 0;
  title and tag rows stay unmarked (543 of 545; the two exceptions are link-URL rows, finding 5).
  Residues: findings 1 and 4.
- **r5 finding 2 (hidden occurrence shifts the mark)**: holds; residue finding 5.
- **r5 finding 3 (CSV / JSON / SRT / VTT)**: holds for CSV and mostly for VTT/SRT (finding 2);
  not for JSON (finding 6).
- **New wrong marks** from the fallbacks: finding 1 (frontmatter value repeated in the body),
  finding 2 (subtitles, r4's behaviour returning), finding 3 (JSON near the end). Tag rows and
  title rows on the knowledge path: none found in 431 files plus the synthetic notes (short note,
  title equal to H1, tags only, Japanese, clip `url`/`origin`/`created`).
- **Score fallback in CSV**: 111/111 correct, no wrong mark: `_clean_csv` keeps every letter and
  digit in order, so the right occurrence always has the full score and a duplicate row only ties.
- **Language-dependent rules** (backend-conventions prohibition): none added; the context test
  is `\p{L}\p{N}`, script-neutral.
- One-liners: reference-style links (`[docs][budget] and budget.`) leave the visible row unmarked
  when the paragraph is short (score 3); SRT/VTT cue numbers and timings count as context digits,
  which is the root of finding 2 and of most of the 10 missing VTT rows.

TOTAL: 11 findings
