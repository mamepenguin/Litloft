# Review of 08745ca62 (fix round r4: scored I5 context, code-point offsets)

Reviewed commit `08745ca62` on `fdfa51f32`, in the detached worktree
`scratchpad/rev4-core`. Nothing in `/Users/libre/Sources/video_share-b2` was
edited.

## Method

Probe (`rev4-core/frontend/src/__probe__/probe.test.tsx`, full output in
`scratchpad/review-b2/probe-r4.log` plus the later cases below): `MarkdownPreview`
(chrome off, the `.markdown-body` the hook marks) renders a source, and
`markFindOccurrences` runs once per row. Rows are built the way `file_find._row`
and `exact_search._snippet` build them: the stored text is the raw `.md` source
with its frontmatter, 80 code points either side, 「…」 where cut, and a
code-point `match_start` (`at - snippet_start + 1` when cut). Three
implementations run on the same DOM and rows:

- **guard**: `findMarks.ts` at 08745ca62.
- **noguard**: the same file with the two `score = -1` blocks (lines 143-160)
  deleted, i.e. the approved I5 (r3) rule as written.
- **parent**: `findMarks.ts` at `fdfa51f32` (exact-window match, text rows
  without fallback).

`→ #k` is the rendered occurrence (0-based) that got the current mark; NONE is
no current mark and no scroll.

## Findings

### F1. The unit-start guard can move a body row's current mark onto a later occurrence (wrong mark)

- file:line: `frontend/src/lib/findMarks.ts:147-153`
- Claim: the guard sets the guarded occurrence's score to -1; it does not
  withhold the row's mark. When the occurrence that really is the row's (the
  first in the body, with frontmatter above it) is guarded out, any other
  occurrence whose 20 letters after the term agree for 10 or more takes the
  mark, uniquely. Without the guard the two tie and the text row gets none; with
  it the row lands on the wrong occurrence, and two rows share one current mark.
- When: a note with frontmatter whose body starts with the term (a `# Heading`
  or a first sentence), with a letter-bearing token (task box `[x]`, link URL,
  list number, `loft://` id) 10-19 letters after the term, and the same phrase
  repeated later in the body after a word that is not in the frontmatter. A
  heading restated in a task item is the plausible shape.
- Frequency: 1. Impact: 5 (the mark is visibly on a different passage from the
  row's snippet; nothing is lost).
- Evidence: probe Z, `FM(title Harbor)` + `# Beacon maintenance plan` +
  `- [x] Approve the beacon maintenance plan by Friday`: row 1 (the heading)
  guard → `#1 prove the [beacon] maintenan` (the list item); noguard → NONE;
  parent → NONE. Probe Z2 (knowledge capture note, `# Beacon` then
  `## Captures`, `- [log.pdf](loft://…?page=3) - p. 3`, quote
  `see beacon captures log pdf…`): row 1 guard → #1, noguard → NONE.
- Introduced (by the guard).

### F2. The unit-start guard withholds the mark from the first body occurrence when a letter-bearing token is 10-19 letters after it

- file:line: `frontend/src/lib/findMarks.ts:147-153`
- Claim: the guard needs the whole 20-letter `after` window to agree. The
  rendered and stored text disagree inside that window whenever Markdown syntax
  that holds letters or digits sits there (task box, link URL, ordered-list
  number, `loft://` link of a capture, code-fence info). The approved rule would
  take the occurrence on 10+ agreeing letters; the guard turns it into no mark.
  Only fires when the note has frontmatter (the snippet's `before` is then
  non-empty while the rendered one is empty).
- When: the knowledge addon's own note shapes put the term-bearing `# Title`
  right after the frontmatter (`build_capture_note`, `distill._compose_markdown`,
  web clips). A capture note with a short title is followed by `## Captures` and
  `- [file](loft://id…)`, so the id enters the window when title-after-term plus
  filename is under ~12 letters. Hand notes: `# Beacon maintenance plan` then a
  task list; `# Beacon manual` then a paragraph with a link; a first paragraph
  `Beacon lamps cleaned, see [log](…)`.
- Frequency: 2. Impact: 5 (count advances, no current mark, no scroll).
- Evidence: probe rows where guard → NONE and noguard → the right occurrence:
  D row 2 (`# Beacon maintenance plan` / `- [x] check the lamp`), F row 1
  (`# Beacon manual` / `See [the guide](https://…)`), H2 row 1 (paragraph
  starting `Beacon lamps cleaned, see [log](https://x.com/a)`), T row 1
  (capture note `# Beacon` / `## Captures` / `- [log.pdf](loft://…)`), V row 1
  (`# 灯台の点検と清掃の記録` / `[地図](https://…)`). Parent → NONE on all of them.
- Introduced (by the guard; the parent also gave none, so no regression against
  the shipped parent, but a regression against the approved rule).

### F3. Short ordered-list items, last task items, code-fence info and link URLs still cost a text row its mark

- file:line: `frontend/src/lib/findMarks.ts:32` (letters and digits kept),
  `:82-102` (agreement stops at the first disagreement), `:169` (threshold 10)
- Claim: the commit message says list markers and links no longer cost a text
  row its current mark. That holds when 10 letters agree on one side within the
  same line. Where an ordered-list number, `[x]`, fence info string or link URL
  falls within ~10 letters on both sides of the term, the score stays under 10
  and the text row gets no mark. Same in both guard versions; it is the
  approved rule's behaviour, so a design question rather than a fix here.
- When: numbered step lists with short items (`1. Check beacon`), a heading
  followed by a numbered list, the last of a short task list, a sentence ending
  with the term after a link, the line right before a code fence.
- Frequency: 3. Impact: 5.
- Evidence: L (`1. Check beacon` … `10. Close beacon`) 4/4 NONE; K3
  (`# 灯台` / `1. レンズを拭く` / `2. 灯台の記録をつける`) 2/2 NONE; E row 2
  (`2. Paint the beacon`, last line) NONE; M row 3 (`- [x] log beacon`, last)
  NONE; O row 1 (`Intro beacon text` before ```` ```python ````) NONE; U2 row 2
  and V row 2 (term ending a sentence after a link) NONE. Parent: NONE on all
  of them too. Long items work: W (three `n. … the beacon …` items of 7+ words)
  3/3 right; M rows 1-2 right; N links rows 1, 3, 4 right.
- Pre-existing (parent gave none as well); not fixed by this commit, contrary
  to its message.

### F4. A unit with fewer than 10 letters of context never gets a mark, even with a single occurrence

- file:line: `frontend/src/lib/findMarks.ts:169`
- Claim: the threshold applies even when the term occurs once in the rendered
  unit. A short note or memo whose term has under 10 letters around it gets no
  current mark and no scroll.
- When: one-line notes, short `.txt` memos (`Beacon lit at dusk.`).
- Frequency: 2. Impact: 5 (but a short note needs no scroll; the plain mark is
  visible).
- Evidence: I4 `Beacon lit at dusk.` (no frontmatter): guard and noguard NONE,
  parent → #0. I, I2, I3 (frontmatter + `Beacon` / `Beacon lit.`): NONE in all
  three versions. X `Call the beacon guy` (exactly 10 letters) → #0.
- Introduced against the parent for frontmatter-less short units; it is the
  approved threshold.

### F5. A row for an occurrence inside a link URL now lands on the link text next to it

- file:line: `frontend/src/lib/findMarks.ts:140-169`
- Claim: the URL occurrence has no rendered counterpart, but its `after`
  letters (`manualfordetail…`) equal those of the visible `beacon` before the
  link, so it scores 20 there. Two rows then share one current mark. The parent
  gave none.
- When: web clips and notes linking to URLs that contain the searched word.
- Frequency: 2. Impact: 2 (the mark sits on the link the URL belongs to).
- Evidence: N row 2 (`…example.com/beacon-manual) for detail`) → `#0 See the
  [beacon]`, which is also row 1's mark; parent NONE.
- Introduced.

### F6. Identical context up to the end of the note: the last occurrence ties and gets no mark

- file:line: `frontend/src/lib/findMarks.ts:140-169`
- Claim: at the end of the unit the snippet's `after` is empty, so it scores 0
  against the last occurrence and against any other; a middle occurrence with
  the same 20 letters before it ties with the last one.
- When: repeated lines at the end of a note (a checklist repeated verbatim).
- Frequency: 1. Impact: 5.
- Evidence: R (`check the beacon` ×3): row 3 NONE in guard and noguard,
  parent → #2. Rows 1-2 right.
- Introduced against the parent; the approved rule's behaviour.

Odd input, one line: `agreeingLetters` and the window slices count UTF-16
units, so an astral letter (𠮷) counts 2 towards the window and the score.

## Guard: with vs without

The guard (`findMarks.ts:143-160`) is not in the approved I5 (r3). Two branches:
unit start (rendered `before` empty, snippet `before` not, and the `after`
window not fully agreeing → score -1) and unit end (the mirror). It only ever
fires on the first or last letters of the rendered body, and the start branch
only when the stored text has letters before them, i.e. frontmatter.

Every row of every probe; rows where the two versions agree are summarised.

| Probe (source shape) | Row | guard | noguard | Which is right |
|---|---|---|---|---|
| A R-5 beacon-note: fm `title: Beacon maintenance notes`, tags beacon/harbor; `# Beacon maintenance`; paras; list | 1 title | NONE | #0 heading | guard (title has no rendered occurrence) |
| | 2 tag | NONE | NONE | both |
| | 3 heading | #0 | #0 | both |
| | 4-8 body | own | own | both |
| B beacon-plain: fm title `Beacon notes`; 4 paras | 1-2 title/tag | NONE | NONE | both |
| | 3-6 body | own | own | both |
| C fm `title: Beacon maintenance` == `# Beacon maintenance` | 1 title | NONE | #0 heading | guard |
| | 2 heading, 3 para | own | own | both |
| D fm `title: Beacon maintenance plan`; `# Beacon maintenance plan` / `- [x] check the lamp` / `- [ ] paint the beacon` | 1 title | NONE | #0 heading | guard |
| | 2 heading | **NONE** | #0 | noguard |
| | 3 last item | #1 | #1 | both |
| E `# Beacon maintenance checklist` / `1. Check the lamp` / `2. Paint the beacon` | 1 heading | #0 | #0 | both |
| | 2 last item | NONE | NONE | neither (F3) |
| F `# Beacon manual` / `See [the guide](https://…) for the beacon.` | 1 heading | **NONE** | #0 | noguard |
| | 2 | #1 | #1 | both |
| G fm title Harbor log; `# Beacon maintenance log`; para | 1-2 | own | own | both |
| H first para `Beacon lamps were cleaned on Monday…` | 1-2 | own | own | both |
| H2 first para `Beacon lamps cleaned, see [log](https://x.com/a) and notes.` | 1 | **NONE** | #0 | noguard |
| | 2 | #1 | #1 | both |
| I / I2 / I3 short notes with fm (`Beacon`, `Beacon lit.`, title `Beacon`) | all | NONE | NONE | neither (F4) |
| I4 `Beacon lit at dusk.` no fm | 1 | NONE | NONE | neither (F4) |
| J last word of a note | 1 | #0 | #0 | both |
| J2 last word `[beacon][1]` + trailing `[1]: https://…` refdef (end branch territory) | 1 | #0 | #0 | both |
| J3 last word + trailing `<!-- todo later -->` (end branch territory) | 1 | #0 | #0 | both |
| K Japanese R-5 shape: fm title 灯台めぐりの記録, tag 灯台; `# 灯台の点検`; paras; list | 1-2 title/tag | NONE | NONE | both |
| | 3-8 body (heading, both first-para hits, list, last) | own | own | both |
| K2 Japanese fm `title: 灯台の点検記録` == `# 灯台の点検記録` | 1 title | NONE | NONE | both |
| | 2-3 | own | own | both |
| K3 Japanese `# 灯台` / numbered list | all | NONE | NONE | neither (F3) |
| L numbered short items, M task list, N links, O code fence, P `&amp;`, Q emoji, Q2 emoji + fm heading, R/R2/R3 repeats, S inline tags + heading, W long numbered items, X short memo | all | same as noguard | | see F3-F6 |
| T capture note (no fm title): `# Beacon` / `## Captures` / `- [log.pdf](loft://…) - p. 3` / quote | 1 heading | **NONE** | #0 | noguard |
| | 2 quote | #1 | #1 | both |
| T2 capture note `# Beacon maintenance` | 1-2 | own | own | both |
| U / U2 distill note `# Beacon upkeep` then list / link | 1 heading | #0 | #0 | both |
| V fm title 港; `# 灯台の点検と清掃の記録` / `[地図](https://…)` | 1 heading | **NONE** | #0 | noguard |
| Y web clip, `url: …/blog/beacon-maintenance-guide`, `# Beacon Maintenance Guide` | 1 url | NONE | #0 heading | guard |
| | 2-3 | own | own | both |
| Y2 same + `By [Jane](https://…)` | 1 url | NONE | #0 heading | guard |
| Y3 web clip `url: …/beacon-history`, first para `Beacon history begins…` | 1 url | NONE | NONE | both |
| Z fm title Harbor; `# Beacon maintenance plan` / `- [x] Approve the beacon maintenance plan by Friday` | 1 heading | **#1 (wrong)** | NONE | neither; guard is worse (F1) |
| | 2 item | #1 | #1 | both |
| Z2 capture `# Beacon` + quote `see beacon captures log pdf…` | 1 heading | **#1 (wrong)** | NONE | neither; guard is worse (F1) |

What each version does in ordinary use:

- **Without the guard** (the approved rule): a frontmatter row with no rendered
  occurrence (a `title:`, or a web clip's `url:` whose slug repeats the title)
  takes the current mark on the body's first heading when 10 or more letters
  after the term agree with it: title equal to, or a prefix of, the H1; a URL
  slug of the article title (C, D, A, Y, Y2). The mark lands on the same words
  at the top of the body, and stepping from that row to the heading row does
  not move the mark. Short titles and titles that end at the term do not do
  this (B, K, K2, Y3). Wrong but on the same words: frequency about 3 (every
  search in a hand note whose title restates the H1, or a web clip whose slug
  does), impact 2.
- **With the guard**: those frontmatter rows get no mark, as R-5 T1/T2
  expected. In exchange, the body's first occurrence, in a note that has
  frontmatter, loses its mark when a letter-bearing token sits 10-19 letters
  after the term (D, F, H2, T, V: F2, frequency 2, impact 5), and in rarer
  notes where the same phrase recurs, the row is moved to a different
  occurrence (Z, Z2: F1, frequency 1, impact 5). Because the guard demotes an
  occurrence instead of withholding the row, it can create a wrong mark the
  approved rule would not.
- The end-of-unit branch made no difference on any probe (J, J2, J3, R): the
  stored text rarely has letters after the last rendered occurrence (a
  trailing HTML comment or link reference definition), and there the 20 letters
  before already agree.

## Earlier behaviour

- Suites `findMarks.test.ts`, `FindInFile.test.tsx`, `FindInFile.epub.test.tsx`,
  `FindMarksRender.test.tsx`, `MarkdownFileViewer.find.test.tsx`: 116/116 green
  at 08745ca62. They cover the citation mark kept on close, closing cleanup,
  cross-node marks, `TextLines` and the PDF `page` fallback (ordinal, else
  first: `findMarks.ts:171-175`, unchanged; M27 below kills a change to it).
- `TextLines`-shaped probe (`<pre>` with the raw file, rows from the stored
  text): `.txt` 3/3 right; `.srt` 3/3 right (parent 0/3: r3 F5 fixed for srt);
  `.json` rows 2-3 right, row 1 (`"name": "beacon log", "notes": …`) NONE
  (keys between values; r3 F5 frequency 1, partly fixed).
- Emoji: Q, Q2 all right; the row-list highlight takes the term itself
  (`FindTabPresenter.tsx:35-52`, killed by M24/M25).

## Mutation testing

Suite per mutant: the five files above (116 tests). Tree restored with
`git checkout` after each; all three worktrees clean at the end. Kills seen at
~3.3 s under three parallel shards were re-run alone: M5 and M21 then
survived, M7 was still killed.

Killed:
- M1 score = after only (before side dropped): 10 failed
- M2 score = before only: 12 failed
- M3 `CONTEXT_CHARS` 20→10: 3 failed
- M4 agreement limit only 20→10: 4 failed
- M6 threshold 10→11: 5 failed
- M7 threshold 10→1: 1 failed
- M8 `best >= 10` → `best > 10`: 4 failed
- M9 tie rule removed (`bestCount === 1`): 2 failed
- M10 later occurrence wins ties (`>=`): 2 failed
- M11 unit-start guard removed: 2 failed
- M13 both guards removed: 2 failed
- M14 unit-start guard needs 10, not the full window: 2 failed
- M18 unit-start guard also fires when rendered `before` is under 20: 3 failed
- M20 `before` compared reading forwards: 3 failed
- M22 `findMarks` match end read as UTF-16: 2 failed
- M23 `codePointOffsetToIndex` counts UTF-16 units: 2 failed
- M24 presenter start raw: 1 failed
- M25 presenter end raw: 1 failed
- M27 page fallback ignores ordinal: 3 failed
- M28 text rows fall back to ordinal: 5 failed

Survived (defect each would let through):
- M21 `findMarks` match **start** read as UTF-16 (end still converted). The
  emoji test's occurrence has 13 agreeing letters after it, enough alone, so
  the shifted `before` window goes unnoticed. Lets through: an emoji before a
  term with under 10 agreeing letters after it (end of line before a list
  number, end of note) loses its mark. Frequency 1, impact 5.
- M16 unit-start guard without `before.length > 0`. Lets through: in a note
  **without** frontmatter, an occurrence at the very start (`Beacon [manual](…)`,
  `# Beacon` then `1. …`) loses its mark when the after window partly
  disagrees. Frequency 2, impact 5. No test has a frontmatter-less note
  starting with the term and syntax within 20 letters.
- M12 unit-end guard removed, M15 its full window → 10, M17 without
  `after.length > 0`. The end branch has no test at all. On the probes it
  changed nothing (J, J2, J3, R); removing it is the approved rule.
- M5 threshold 10→9. No test scores exactly 9. Lets through: a 9-letter
  agreement taking the mark. Frequency 1, impact 2.
- M3b `CONTEXT_CHARS` 20→30. No test differs in letters 21-30. Lets through:
  longer windows, so the guard's full-window condition is harder to meet (more
  F2). Frequency 1, impact 2.
- M19 agreement counts the first mismatching letter too (+1 per side). Lets
  through: 8-letter agreements crossing 10, and the guard passing one letter
  short. Frequency 1, impact 2.
- M26 presenter `start >= snippet.length` check removed, M29 `best` starting at
  0: equivalent (the addon never sends a start at the snippet's end; a winner
  needs 10 anyway).

TOTAL: 6 findings
