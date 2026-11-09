# Triage: r4

## Warnings

- R-5 ran at 1dde119a99781700a35d96cc180d4731d7334b6a, and these files changed since: .claude/agents/design-checker.md, DESIGN.md, backend/app/routers/drives.py, backend/app/routers/shelves.py, backend/app/schemas.py and 8 more; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: r2→r3 removed design: the hand-written block classifier was replaced with markdown-it block tokens. r3→r4 did not remove the remaining hand-written inline-span scanner (rewriteInline/closingBacktickRun), as r3 had suggested. It kept the scanner and added state around it: an inlineRanges list taken from the parse, a `handled` set, and a second fallback pass for lines outside any inline range. That fixes the multi-line case, but the hand-written prediction of CommonMark code-span rules remains, and it still differs from the renderer on escaped backticks (R1). This round therefore patches around the same duplicated prediction instead of removing it. The design is being patched in this one spot, though more mildly than in earlier rounds.

Earlier runs:
- r2 / claude-read: The commits since r1 are mostly develop work merged into the branch: the YouTube frames specs and code (SPEC-ADDON-076..078, SPEC-CORE-058), the reading app (SPEC-CORE-059..063) and YouTube scene tiles (SPEC-ADDON-079..080). For this feature they answered r1's scope findings by giving the YouTube work approved specs on develop, declaring the empty-answer failure and the created-path change as revisions I11 and I12, and renumbering this spec to SPEC-ADDON-081..084. I saw no added branch, state or prediction in the file-Ask-thread design itself. The YouTube storyboard spec, however, was revised three times for tile timing: the sheet duration over the cell count, then 1/fps, then an interval recovered from round(fps*duration). Each round replaced the previous timing rule with a new derived prediction, and min_interval thinning was dropped along the way. That pattern is patching in the YouTube design, not in this change.
- r3 / claude-read: The r2→r3 round removed design rather than adding it. The hand-written block classifier in rewriteAnswer, a fence state, an indented flag, previousBlank and two regex predictions of where CommonMark blocks start, was deleted and replaced with markdown-it's own block tokens. That removes the duplicate prediction of the renderer that caused r2's finding. The other commits are the companion fixture alias for the new import and docs or review records, and they add no branch or state. The inline-span half of the same prediction (rewriteInline and closingBacktickRun) is still hand-written and per-line, so one copy of the renderer's rules remains. That is the source of R1. Removing it the same way, with code_inline from the parser, would finish the round rather than patch it.

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R1 is bucket A or BLOCKER

## Findings

A: 1
B: 0
C: 0

### claude-read:R1 — bucket A, LOW, open

Claim: The hand-written code-span scanner in the saved-note builder treats a backslash-escaped backtick as the opening of a code span. Text that CommonMark renders as plain text is therefore kept as if it were code, and a `[n]` inside it stays raw in the note.
Impact: Take an answer containing "Use \`x [1]` here". markdown-it renders it as plain text with a citation pill, because the escaped backtick is literal and the later backtick has no closing run. The saved note keeps `[1]` as a bare marker: it is neither a `loft://` link nor removed. This is rare in model output, but the note then silently differs from the rule.
Evidence: addons/intelligence/frontend/askNoteFormat.ts rewriteInline (around lines 219-246) starts a span at any '`' and does not look at a preceding backslash. closingBacktickRun finds the later single backtick, and that range is copied verbatim (`out += line.slice(i, close + run)`). escapeLinkLabel at :182 is the only place where backslashes are handled. The r4 fix (answerBlocks/inlineRanges) still sends the joined paragraph through the same scanner, so this edge case remains. Neither askNoteFormat.test.ts nor AskTabThread.test.tsx has a case with an escaped backtick.
Repro: Traced by hand, not executed: buildAskThreadMarkdown with the answer "Use \\`x [1]` here" and citations [{n:1, position:{seconds:5}}]. The answer line in the note is unchanged: "Use \\`x [1]` here". Under CommonMark the expected output is "Use \\`x [0:05](loft://<id>?t=5)` here".
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Take inline code ranges from markdown-it's own `code_inline` tokens, or skip a backtick preceded by an odd number of backslashes, and add a test with an escaped backtick.

</details>

## Not verified

- claude-read: I did not run markdown-it or the tests. The escaped-backtick behaviour is reasoned from CommonMark rules and from reading rewriteInline.
- claude-read: I did not confirm the exact `map` values markdown-it 14 assigns to table-cell inline tokens.
- claude-read: I did not re-review the backend invariants (I1-I3, I8-I12) in depth this round, because the fix commits do not touch them.
- claude-read: The reviewed commit e57e1067 itself only records review documents. I reviewed the branch diff and the fix commits as supplied.
- claude-verify: I did not run the code or the tests; the trace was done by reading the code.
- claude-verify: I did not check how AnswerMarkdown's markdown-it renderer handles the same input, beyond CommonMark's escape rules.
- claude-verify: I did not search the test files for escaped-backtick coverage.

TOTAL: 1 findings
