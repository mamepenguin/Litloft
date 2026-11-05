# Review of 9cf7cc9ac (fix round r3, I5 letters-and-digits context)

Reviewed commit `9cf7cc9ac` on `d504b4019`, in a detached worktree. Nothing in
`/Users/libre/Sources/video_share-b2` was edited.

## Method

Probe: `MarkdownPreview` (chrome off, the same `.markdown-body` container the
hook marks) renders a source, and `markFindOccurrences` runs once per row. The
rows are built the way `file_find._row` / `exact_search._snippet` build them:
the stored text is the raw `.md` source (`extractors/text.py` does not clean
`.md`), the snippet runs 80 code points either side with `…`, and `match_start`
is a **code-point** offset. The same probe was run against the parent
`d504b4019` findMarks.ts for comparison. `TextLines` cases were probed on a
`<pre>` holding the raw file, with the stored text as `_clean_srt` /
`_clean_json` / `_clean_csv` produce it.

Result per row (`→ #k` = the rendered occurrence that got the current mark,
NONE = no current mark, no scroll):

| Note | 9cf7cc9ac | d504b4019 (parent) |
|---|---|---|
| R-5 beacon-note (frontmatter title+tag, `# Beacon maintenance`, paragraphs, list) | rows 1-2 NONE (intended), **row 3 (heading) NONE**, rows 4-8 right | rows 3,5,6,7 wrong |
| No frontmatter, `# Beacon log` + paragraphs | all right | all right |
| Japanese, frontmatter `title: 灯台メモ`, `# 灯台の点検`, paragraph with 2 hits, list | **rows 3 and 4 (heading, 2nd hit in first paragraph) NONE**, 5-6 right | 6 wrong |
| `**beacon**`, `` `beacon --on` ``, `*beacon*`, `_beacon_` | all right | all right |
| Punctuation next to the term (`beacon. beacon! beacon? beacon`) | all right | all right |
| Identical lines `check the beacon` ×3 | all right | all right |
| Ordered list `1. Check beacon` … `10. Close beacon` | **all 4 NONE** | all right |
| Task list `- [x] fix beacon` | **all 3 NONE** | all right |
| Inline links `[manual](https://example.com/beacon-manual)` | **rows 1, 4 NONE** (and row 2, an occurrence inside the URL, NONE as it should) | 3 of 4 wrong |
| Image `![beacon photo](loft://…)` then two paragraphs | **rows 2-3 NONE** | 1 wrong |
| Wiki link `[[Beacon notes\|the notes]] and the beacon` | **row 2 NONE** | wrong |
| Code fence ```` ```python ```` between two hits | **all 3 NONE** | all right |
| `Tom &amp; Jerry beacon` | **both NONE** | all right |
| Emoji before the term (`🚨 alert 🚨 the beacon …`) | **both NONE** | all right |
| `.srt` in TextLines (stored text = cleaned dialogue) | **all NONE** | all right |
| `.json` in TextLines (stored = string values) | **all NONE** | all right |
| `.csv` in TextLines | all right | all right |

PDF (`page` rows): the ordinal-then-first fallback is intact
(`chooseCurrentOccurrence` returns `ordinal - 1` / 0 for `kind === "page"`),
and the existing PDF tests in `FindInFile.test.tsx` pass.

Windows: both sides now take 20 filtered characters (the snippet side through
`contextText(...).at[match_start]`, the rendered side through `context.at[at]`),
so 20 letters/digits are compared, not 20 raw characters. Verified on the
probe rows that matched (e.g. Japanese row 5, list rows).

Citation mark, closing cleanup, cross-node marks: unchanged code paths
(`indexText`, `segmentsFor`, `wrap`, `clearFindMarks`); their tests pass.

## Findings

### F1. Frontmatter letters still leak into the first body occurrences' window; those rows now get no current mark

- file:line: `frontend/src/lib/findMarks.ts:79-103` (snippet `before` taken from the stored text; rendered `before` taken from the container, which starts at the body)
- Claim: the stored `.md` text includes the frontmatter, the marked container (`.markdown-body`) does not (`PropertiesPanel` is outside it, `MarkdownPreview.tsx:505-512`). For any body occurrence with fewer than 20 letters/digits of body text before it, the snippet's `before` carries frontmatter letters (`…tagsbeaconharbor`), the rendered `before` is shorter, `occurrence.before.slice(-20)` can never equal it, and the text row falls to `null`. The "fewer where the snippet is cut" allowance is one-sided: it shortens the window when the *snippet* runs out, never when the *rendered unit* starts.
- When: every note with frontmatter (the knowledge addon writes `id`/`title`/`tags` on every note) whose first heading or first sentence contains the term. The heading usually restates the title, which is the word one searches for. In Japanese the leak covers the first ~20 characters of body text, so the second hit of a short first paragraph is lost too.
- Frequency: 6. Impact: 5 (row 3 of 8 shows 「3 / 8」 with no current mark and no scroll; the reader scrolled elsewhere is not brought to the heading).
- Evidence: probe, R-5 beacon-note shape built exactly like `_row`: row 3 (`# Beacon maintenance`) → NONE. Japanese note `title: 灯台メモ` / `# 灯台の点検` / `北の灯台は月曜に清掃した。南の灯台は…`: rows 3 and 4 → NONE (row 4's 20-letter window is `モ灯台の点検北の灯台は月曜に清掃した南の`, the `モ` comes from the title).
- A symmetric cut would fix it: when the rendered `before` is shorter than 20 (unit start), compare only its length of the snippet's tail, as is already done for the snippet side.
- Introduced vs pre-existing: the leak is pre-existing (the parent put the heading row on the wrong occurrence); the "no mark" outcome is introduced by this commit.

### F2. The new integration test builds the body rows from a text without the frontmatter, so it asserts the heading row is marked while production leaves it unmarked

- file:line: `frontend/src/components/FileDetail/__tests__/FindInFile.test.tsx` `beaconRows()` (body rows from `BEACON_BODY`, title/tag rows from `BEACON_NOTE`), test "marks each body row's own occurrence and gives the title and tag rows none"
- Claim: the addon builds every row's snippet from one unit, the whole stored note. The test cuts body-row snippets out of `BEACON_BODY`, so the heading row's snippet starts at `# Beacon` with no frontmatter before it. That is the shape that matches; the production shape (F1) does not. The test is green for a case the running app fails, and is exactly the R-5 S1 case it claims to cover.
- When: n/a (detector gap for F1).
- Frequency/impact: those of F1 (6 × 5).
- Evidence: in the worktree, changing only `beaconRows()` to cut the body rows out of `BEACON_NOTE` (`rows.push(beaconRow(BEACON_NOTE, BEACON_NOTE.indexOf(BEACON_BODY) + at, rows.length + 1))`, same ordinals) makes the test fail at step 3: `expected [] to have a length of 1 but got +0` (`FindInFile.test.tsx:1740`), i.e. the heading row has no current mark. Restored.
- Introduced.

### F3. Markdown syntax that carries letters or digits defeats the filter, and the per-kind fallback turns rows the parent got right into rows with no mark

- file:line: `frontend/src/lib/findMarks.ts:32` (`CONTEXT_CHAR`), `:110-115` (text rows → `null`)
- Claim: the filter drops punctuation-only syntax (`#`, `-`, `*`, `` ` ``, `_`), but not syntax whose characters are letters or digits and that the page does not show as text: ordered-list numbers (`1.`, drawn by `::marker`), task boxes (`[x]`), link and image targets (`(https://…)`, `(loft://id)`), image alt text, wiki-link targets (`[[target|alias]]`), code-fence info strings (```` ```python ````), entities (`&amp;`). Any occurrence within 20 letters of one of them fails the context test. In the parent, these rows fell back to `ordinal`, which is right in any note whose frontmatter does not contain the term; now a text row with no context match gets no mark.
- When: ordered lists, task lists and links are everyday Markdown; web clips from the knowledge addon are link-dense. Example: a numbered how-to note searched for a word that appears in its steps: no step ever gets the current mark.
- Frequency: 7. Impact: 5 (noticeable: count advances, nothing is marked current, nothing scrolls).
- Evidence (probe, 9cf7cc9ac vs parent): ordered list 4/4 NONE vs 4/4 right; task list 3/3 NONE vs right; fenced block with a hit before, inside and after 3/3 NONE vs right; `Tom &amp; Jerry beacon` 2/2 NONE vs right; links 2 rows NONE (parent wrong there too); image then paragraphs 2/2 NONE.
- This is a consequence of the I5 revision itself (letters-only comparison + no fallback on text rows), so it is a design question for the human rather than a fix to make here: either the comparison runs on text extracted the way the page renders it (e.g. the stored source rendered through the same markdown-it and read back as text), or text rows keep a fallback when the unit has no frontmatter occurrence of the term.
- Introduced (the no-mark outcome; the mismatch existed before).

### F4. `match_start` is a code-point offset, the client indexes UTF-16; an emoji before the term now costs the row its mark

- file:line: `frontend/src/lib/findMarks.ts:79-87` against `addons/intelligence/app/file_find.py:115-116`
- Claim: Python's `at - snippet_start` counts code points. With one astral character (emoji, some CJK extension kanji) in the 80 characters before the term, the client's `match_start` lands one UTF-16 unit early per such character, so `snippetStart`/`snippetEnd` are off and the `after` window starts inside the term. No occurrence matches, and the text row gets `null`. The parent fell back to the ordinal and was right.
- When: notes with emoji near the term (headings like `## 🚨 Incidents`, checklists with ✅ — ✅ is BMP, but 🚨, 📌, 🔥 are astral).
- Frequency: 3. Impact: 5.
- Evidence: probe `🚨 alert 🚨 the beacon failed\n\nlater the beacon was fixed`: both rows NONE at 9cf7cc9ac, both right at the parent. (Row 2's snippet contains the emoji in its 80-character head.) The same offset presumably shifts the highlighted term in the row list (`FindTabPresenter.tsx:34`), pre-existing, not verified.
- Introduced as a visible failure (the offset itself is pre-existing).

### F5. `.json` / `.vtt` / `.srt` in TextLines: every row now gets no current mark

- file:line: `frontend/src/lib/findMarks.ts:110-115`, against `addons/intelligence/app/extractors/text.py` (`_clean_json`, `_clean_vtt`, `_clean_srt`)
- Claim: for these types the stored text is cleaned (JSON string values only; subtitle dialogue without indices and timings), while `TextLines` shows the raw file (`TextPreview.tsx` takes `application/json` and `text/*`). Keys, cue numbers and timestamps are letters/digits, so no window matches. The parent's ordinal fallback was right (the cleaned text keeps the occurrences in order); now no row is marked current.
- When: searching inside a JSON or WebVTT file opened in the viewer.
- Frequency: 1. Impact: 5. Below the threshold; listed for completeness.
- Evidence: probe on a `<pre>` with the raw file and rows from the cleaned text: srt 3/3 NONE (parent 3/3 right), json 3/3 NONE (parent right), csv 2/2 right on both.
- Introduced (no-mark outcome).

### Checked, no finding

- Letters-only does not, in the probes, make two different occurrences look alike: punctuation-separated repeats (`beacon. beacon! beacon?`) and identical lines both resolve by position/nearest-ordinal as before. Collapse only happens for occurrences whose 20 letters/digits on both sides agree and differ only in punctuation, e.g. `re-check` vs `recheck` (odd input).
- Emphasis, inline code, punctuation next to the term, Japanese without spaces (outside the frontmatter reach): right.
- Window sizes: 20 filtered characters on both sides (see Method).
- `page` rows keep ordinal-then-first.
- `kind` added to `FindMarkRow`: every caller passes a `FindRow`, which carries it.

## Mutation testing

Suite run per mutant: `findMarks.test.ts`, `FindInFile.test.tsx`,
`MarkdownFileViewer.find.test.tsx`, `FindMarksRender.test.tsx` (100 tests,
baseline green). Tree restored after each mutant (`git checkout`).

Killed:
- M1 filter `[\p{L}\p{N}]` → `\S` (keeps punctuation/syntax): 3 failed
- M2 filter → letters only (drops digits): 1 failed
- M3 page fallback removed (page rows → null): 2 failed
- M4 text rows fall back to ordinal/first (the parent's behaviour): 4 failed
- M5 page fallback ignores ordinal (always first): 1 failed
- M7 window 20 → 40: 2 failed
- M12 tie-break `<` → `<=` (later occurrence wins ties): 1 failed
- M14 compare the full rendered `after` instead of the snippet's length: 2 failed
- M15 `FindTextBodyProvider` removed around the knowledge-edit slot in `ShellLayout.tsx`: 1 failed
- M16 `FindTextBodyProvider` removed in `MarkdownFileViewer.tsx`: 1 failed

Survived:
- M6 window 20 → 10. Lets through: two occurrences whose nearest 10 letters on each side agree but whose 20 differ (repeated phrases in long notes, e.g. `… check the beacon after the storm` twice in different paragraphs) are treated as equal, and the nearest-ordinal one wins — which, with frontmatter occurrences shifting `ordinal`, can be the wrong one. No test has two occurrences that agree on 10 letters and differ within 20.
- M10 compare the full rendered `before` instead of the snippet's length, and M11 drop the `before.length === 0` branch. Both differ from the code only when the snippet offers fewer letters before the term than the rendered unit does, which in ordinary text happens only at the unit start, where the rendered side is short too (F1 is the reverse case). Near-equivalent in ordinary use; a test with an 80-character head holding fewer than 20 letters (a Markdown table or a URL-free symbol run) would separate them.
- M13 iterate `contextText` by UTF-16 unit instead of code point. Both sides then drop surrogate halves consistently, so only astral letters (CJK Ext-B kanji such as 𠮷) leave the comparison; equivalent for matching purposes.
- M8 drop the `Math.min(row.snippet.length, …)` clamp, and M9 `?? context.text.length` → `?? position + needle.length`. Equivalent: `match_start + match_length` never exceeds the snippet for addon rows, and `context.at[at + needle.length]` is always defined since `indexOf` only returns starts that fit.

TOTAL: 5 findings
