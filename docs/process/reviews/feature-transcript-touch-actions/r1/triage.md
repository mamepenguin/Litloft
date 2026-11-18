# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Read coverage

Product files:
- addons/intelligence/app/main.py — full: Read lines 1-80, which include the only changed hunk and its module context.
- addons/intelligence/frontend/ExtractionEditsReview.test.tsx — partial: Read only the changed hunk at @@ -424 in the diff. I did not open the enclosing it() start.
- addons/intelligence/frontend/TranscriptEditDialog.tsx — full: New file; read the whole file.
- addons/intelligence/frontend/TranscriptSection.test.tsx — full: Read both changed hunks with their enclosing it() blocks in the diff.
- addons/intelligence/frontend/TranscriptSection.tsx — partial: Read lines 225-644, 800-880 and 1100-1366, which cover every changed hunk and its enclosing code. The rest of the file was not read.
- addons/intelligence/frontend/TranscriptSectionTouch.test.tsx — full: New file; read the whole file in the diff.
- addons/intelligence/frontend/messages/en.json — full: Read the one-line changed hunk in the diff.
- addons/intelligence/frontend/messages/ja.json — full: Read the one-line changed hunk in the diff.
- frontend/e2e-components/fixtures/app.tsx — full: Read both changed hunks (import and arrangement spread) in the diff.
- frontend/e2e-components/fixtures/transcriptTouch.tsx — full: New file; read the whole file in the diff.
- frontend/e2e-components/spec-viewport.spec.ts — full: Read the one-line changed hunk in the diff.
- frontend/e2e-components/transcript-touch.spec.ts — full: New file; read the whole file in the diff.

Test files:
- frontend/src/__tests__/ime-enter-guard.test.ts — partial: Read only the diff hunks.
- frontend/src/__tests__/row-action-reveal.test.ts — partial: Read only the diff hunks.

## Needs a human

### unspecified_behavior

Note: The service-wide pdfminer log level drops to ERROR (addons/intelligence/app/main.py:63). No spec covers this.
- claude-read: The service-wide pdfminer log level drops to ERROR (addons/intelligence/app/main.py:63). No spec covers this.
- claude-verify: The pdfminer logger is raised to ERROR in addons/intelligence/app/main.py:63. This is a backend logging behavior change that no spec in this review covers.

### unspecified_behavior

Note: The pdfminer logger is raised to ERROR in addons/intelligence/app/main.py:63. This is a backend logging behavior change that no spec in this review covers.
- claude-read: The service-wide pdfminer log level drops to ERROR (addons/intelligence/app/main.py:63). No spec covers this.
- claude-verify: The pdfminer logger is raised to ERROR in addons/intelligence/app/main.py:63. This is a backend logging behavior change that no spec in this review covers.

## Findings

A: 0
B: 4
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The commit changes addons/intelligence/app/main.py to raise the `pdfminer` logger to ERROR. That backend logging change is not in the spec's touch-point list and has nothing to do with transcript touch actions.
Impact: In the intelligence service, every pdfminer WARNING is now silent, for all PDFs and not only the per-glyph FontBBox noise the comment names. A PDF whose text pdfminer extracts poorly but only warns about will no longer leave any trace in the logs. The change also ships under a transcript-UI spec, with no spec or test of its own.
Evidence: addons/intelligence/app/main.py:61-63 adds `logging.getLogger("pdfminer").setLevel(logging.ERROR)`. The touch points in docs/specs/transcript-touch-actions.md name no backend file, and invariants.md has no Revisions. pdfminer is used by addons/intelligence/app/extractors/pdf.py.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Move the pdfminer log-level change into its own change (or the PDF spec that owns pdfminer), or add it to this spec's touch points.

</details>

### claude-read:TP-4 — bucket B, LOW, open

Claim: The commit changes two core convention-guard tests, frontend/src/__tests__/ime-enter-guard.test.ts and frontend/src/__tests__/row-action-reveal.test.ts, and neither is in the touch-point list. The reveal guard now exempts TranscriptSection.tsx entirely from its coarse-pointer reveal check.
Impact: A core repository-wide guard gains an exemption list (COARSE_DRAWS_STRIP_INSTEAD) that skips the whole of TranscriptSection.tsx. A later hover-only control added to that file would no longer be caught on the coarse path. The Enter guard's declared count also moves from 9 to 10.
Evidence: In frontend/src/__tests__/row-action-reveal.test.ts, the new constant COARSE_DRAWS_STRIP_INSTEAD is added to the offenders filter. In frontend/src/__tests__/ime-enter-guard.test.ts, TranscriptEditDialog.tsx is added to ADDON_TEXT_FIELD_ENTER and toHaveLength(9) becomes toHaveLength(10). The Touch points name only `.claude/rules/frontend-conventions.md` as rules passed through, not these guard files.
Repro: Mutation in thought: add a REVEAL-only hover control to TranscriptSection.tsx that is not gated by `!coarse`. With the file exempted, row-action-reveal.test.ts would not flag it.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add both guard tests to the spec's touch points. Consider narrowing the exemption so it does not cover the whole file.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The commit edits addons/intelligence/frontend/ExtractionEditsReview.test.tsx, a SPEC-ADDON-070 design test, and the touch points do not list it. §7 names only TranscriptSection.test.tsx and TranscriptSectionCorrections.test.tsx as existing tests to change.
Impact: An existing assertion that 修正 carries `pointer-coarse:min-h-11` is inverted, and a new one is added on 保存. Because this file is not a declared touch point, nobody was told that a guard from another spec was changed.
Evidence: addons/intelligence/frontend/ExtractionEditsReview.test.tsx hunk @@ -424: `expect(edit.className).not.toContain("pointer-coarse:min-h-11")`, plus a new 保存 class assertion.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add ExtractionEditsReview.test.tsx to the spec's touch points, or record it in invariants.md Revisions.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: The commit adds a new test file, addons/intelligence/frontend/TranscriptSectionTouch.test.tsx, which the touch points do not list. The spec says coarse-path tests go into TranscriptSection.test.tsx or move within TranscriptSectionCorrections.test.tsx.
Impact: The coarse-path guard for I1–I9 lives in a file the plan does not name. TranscriptSectionCorrections.test.tsx, which the plan does name, is untouched.
Evidence: The new file addons/intelligence/frontend/TranscriptSectionTouch.test.tsx (1045 lines) is in the diff. The spec's Touch points name only the two existing test files.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List TranscriptSectionTouch.test.tsx in the touch points.

</details>

## Not verified

- claude-read: I did not run any test or the e2e spec.
- claude-read: I did not check whether pdfminer emits WARNINGs that matter for extraction quality in addons/intelligence/app/extractors/pdf.py.
- claude-read: I did not open TranscriptSectionCorrections.test.tsx to check for coarse-pointer assumptions.
- claude-read: I did not read the full body of row-action-reveal.test.ts to see what the exempted check covers in detail.
- claude-verify: Could not run git diff, so I did not confirm directly that each change is new relative to origin/develop. Diff membership relies on r1/product-files.txt and r1/test-files.txt plus the current file contents.
- claude-verify: Did not check the full contents of TranscriptSectionTouch.test.tsx (claimed 1045 lines) or whether the old guard count was 9.
- claude-verify: Did not check whether the submodule pointer in core actually pins the addon commit that contains these changes.

TOTAL: 4 findings
