# Triage: r2

## Trajectory

This run:
- claude-read:
  > Yes, the design is being patched. Each fix round after r2 adds a branch, state or prediction on top of the previous one, and no round removes one.
  >
  > - 197f6ff and 9cf7cc9 first collapsed whitespace and then switched to letters-and-digits context windows. Both are predictions about how rendered text relates to indexed text.
  > - 08745ca replaced exact window equality with a score. It added a threshold of 10, a uniqueness rule, code-point offsets, and a special "partial window" penalty for frontmatter rows.
  > - b8a77c9 abandoned the rendered-text guess for position. It added `locateTextRow`, `data-source-lines` tokens in markdown-it, a `FindTextSource` mode and a frontmatter offset. The score logic stayed for PDF page rows, and the partial-window penalty was deleted.
  > - 7ad2c1a (r5) re-added the score as a fallback inside the position path. It added three more branches: dropping leading snippet characters when the snippet is not found, a count-mismatch test per block, and a plain-text whole-file scoring path for cleaned sources such as CSV, VTT and SRT. Each branch has its own tests.
  >
  > Every round exists because the addon stores chunk text without offsets, so the client must infer a position in rendered text. Each patch covers one more observed mismatch: frontmatter, links, list markers, cleaned sources. The test lists grow by adding fixture notes, for example 40 notes in the `it.each`. The mapping is still a heuristic, which means the next mismatch will need another branch. The addon could return a source offset instead.
  >
  > On the addon side, the overlap fix (f7f1160) does narrow one prediction. It caps the overlap per extractor instead of using a fixed 200. This is a reduction rather than an addition.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- needs_human_record claude-read:R2-3

## Needs a human

### needs_human_record (claude-read:R2-3)

Question: The overlap merge still takes the longest suffix-prefix match up to the replay limit, so in periodic text a match longer than the true replay can drop occurrences, while I12 says no occurrence is dropped.
Impact: A file with identical repeated lines near a chunk boundary can show one place too few. The repeated-line tests pass for three shapes, but they do not cover every period and phase.
Evidence: addons/intelligence/app/file_find.py `_overlap` scans from `min(limit, len(text), len(chunk))` downwards and returns the first suffix-prefix match. The spec's own 'Checked, no action' section records periodic text as a known limit.
Note: addons/intelligence/app/file_find.py:60-65 `_overlap` scans from min(limit, len(text), len(chunk)) down to _OVERLAP_MIN and returns the first suffix-prefix match. That is the longest match, which is what I12 literally defines, and the limit is the extractor's replay size. In strictly periodic text a match longer than the true replay can therefore drop occurrences. That is inherent to the longest-match definition and the spec records periodic text as a known limit. Whether this counts as a violation of I12's 'no occurrence is dropped' is for the human to decide.

## Findings

A: 0
B: 3
C: 0

### claude-read:R2-1 — bucket B, LOW, open

Claim: `locateTextRow` drops leading characters from the snippet until the remainder is found, and a short remainder that holds the term can match an unrelated body occurrence, so a frontmatter (title or tag) row can receive the current mark on a body occurrence.
Impact: In the knowledge editor (body rendered without frontmatter), stepping to a title or tag row can outline and scroll to a body occurrence instead of giving no current mark, which r5 says it must not do. It needs a snippet whose trailing context after the term is short or also appears in the body.
Evidence: frontend/src/lib/findMarks.ts locateTextRow: the loop `for (; dropFrom <= matchIndex; dropFrom += 1)` accepts any remainder that contains the term and the text after it. The remainder is not required to be anchored to the rendered body.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Require the remainder to be longer than the term plus a minimum context, or keep rows that start in the frontmatter unlocated.

</details>

### claude-read:R2-2 — bucket B, LOW, open

Claim: A test reads the live file docs/developer-guide/backend-dev.md and asserts hard-coded mark indices 4 and 5 for rows 6 and 7.
Impact: Any edit to that documentation page changes the occurrence structure and fails an unrelated frontend test. It also does not guard the behaviour if the page is edited.
Evidence: FindInFile.test.tsx: BACKEND_DEV_NOTE = readFileSync(path.resolve(process.cwd(), '../docs/developer-guide/backend-dev.md')) and `const expected = { 6: 4, 7: 5 }`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Copy the relevant excerpt into a fixture constant.

</details>

### claude-read:R2-3 — bucket B, LOW, open

Claim: The overlap merge still takes the longest suffix-prefix match up to the replay limit, so in periodic text a match longer than the true replay can drop occurrences, while I12 says no occurrence is dropped.
Impact: A file with identical repeated lines near a chunk boundary can show one place too few. The repeated-line tests pass for three shapes, but they do not cover every period and phase.
Evidence: addons/intelligence/app/file_find.py `_overlap` scans from `min(limit, len(text), len(chunk))` downwards and returns the first suffix-prefix match. The spec's own 'Checked, no action' section records periodic text as a known limit.
Repro: not_reproduced
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not read the full source of findMarks.ts, useFindMarksIn.ts or MarkdownPreview.tsx at the commit. I relied on the diff, and the main diff was truncated at 200000 bytes.
- claude-read: I ran no tests and could not run the e2e EPUB spec.
- claude-read: I did not check the addon route, the manifest or the addon proxy behaviour in this round beyond the file_find.py diff.
- claude-read: I did not check whether `data-source-lines` survives DOMPurify in every configuration or reaches capture and copy code.
- claude-read: I did not check that i18n keys are present in en.json and ja.json.
- claude-verify: I did not run any test or code.
- claude-verify: I did not check the rest of the diff or invariants I1-I4 and I6-I11.
- claude-verify: I did not construct a concrete frontmatter row that mis-marks a body occurrence.

TOTAL: 3 findings
