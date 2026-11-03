# Triage: r2

## Trajectory

This run:
- claude-read: Round 1 (dae5b0e, 31ce44a): docs only. They record the r1 review and the decision, and add a 'What the excerpt says' section to behavior.md. No code branch. Round 2 (7be8a00): tests only. It adds the subtitle row and a new text-assertion test file, with no new production state. Round 3 (422fa2e): adds one new predicate (showsRawExcerpt) and one new branch in TextThumbnail's setText (`isOffice || showsRaw`), plus file_type in the effect deps. That predicate repeats a condition the original commit already added in showsTextExcerpt (other && text/*), so the same decision now exists in two places (see F2). This is a mild sign of patching, but no round added a branch that an earlier fix round had also added, and no round has yet needed to undo or re-patch an earlier fix. Round 4 (ca82bb7): docs only, recording the R-5 run. No round removed a branch or state.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 2
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: No test row has leading or trailing blank space in the body of an other + text/* file, so dropping the trim on the raw path survives.
Impact: A later edit can change `raw.trim()` to `raw` for source files and no test fails. Today the only visible effect is blank lines at the top of a card for a file that starts with newlines (whitespace-pre-line keeps them), and the card already shows only a few lines. That is a cosmetic, silent change in normal use.
Evidence: frontend/src/components/TextThumbnail.tsx:85 sets `isOffice || showsRaw ? raw.trim() : stripPreviewText(raw)`. Every other + text/* body in frontend/src/components/__tests__/sourceCardExcerptText.test.tsx (the rows table) starts with a non-blank character and ends with one, so `expected === body` with or without the trim.
Repro: Mutant: TextThumbnail.tsx:85 -> `setText(isOffice ? raw.trim() : showsRaw ? raw : stripPreviewText(raw))`. Every row in sourceCardExcerptText.test.tsx still compares equal. Predicted to survive (not run).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a row whose body is "\n\n#include <stdio.h>\n\n" and whose expected value is "#include <stdio.h>".

</details>

### claude-read:F2 — bucket B, INFO, open

Claim: The predicate `file_type === "other" && mime startsWith "text/"` is written twice, once in showsTextExcerpt and again in showsRawExcerpt, and nothing ties the two together.
Impact: Suppose a later edit widens showsTextExcerpt to admit another bucket with a text/* mime, or changes how `other` is decided. TextThumbnail would then silently send the newly admitted files through stripPreviewText, which is the r1 F1 mangling again, and only for the files that edit touched. No user can hit this today. It is a divergence risk.
Evidence: frontend/src/lib/textExcerpt.ts:17-18 (`text/*` branch, `document || other`) and frontend/src/lib/textExcerpt.ts:23-26 (`other && text/*`) state the same condition separately. TextThumbnail.tsx:71 decides the transform on its own, apart from the gate the surfaces use (FileCard.tsx:75, FileListRow.tsx:87, JustifiedFileCell.tsx:63).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Express the transform as the complement inside one helper (for example `excerptKind(file): 'raw' | 'cleaned' | 'office' | null`) so the gate and the transform come from one decision.

</details>

## Not verified

- claude-read: Did not run vitest, tsc or lint. All mutant outcomes are predicted by reading.
- claude-read: Did not view the r2 screenshots in docs/process/reviews/fix-source-card-excerpt/shots/.
- claude-read: Did not check that /api/files/{id}/stream serves every newly admitted text/* mime (e.g. text/xml, text/x-sgml) with an OK status on the 1 KiB Range, beyond what decisions.md reports for catalog.xml.
- claude-read: Did not verify FileGrid's justified-layout threshold again in this round; relied on the r1 analysis.
- claude-verify: Did not run the test suite or the mutation; F1 survival is inferred by reading the rows.
- claude-verify: Did not inspect the git diff against origin/develop to classify whether the duplicated predicate was introduced by this commit or the whitespace-pre-line styling predates it.
- claude-verify: Did not check the Office fetch path (getPreviewTextUrl) behavior.

TOTAL: 2 findings
