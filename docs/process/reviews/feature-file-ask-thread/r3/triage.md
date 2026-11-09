# Triage: r3

## Warnings

- R-5 ran at 1dde119a99781700a35d96cc180d4731d7334b6a, and these files changed since: .claude/agents/design-checker.md, DESIGN.md, backend/app/routers/drives.py, backend/app/routers/shelves.py, backend/app/schemas.py and 8 more; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: The r2→r3 round removed design rather than adding it. The hand-written block classifier in rewriteAnswer, a fence state, an indented flag, previousBlank and two regex predictions of where CommonMark blocks start, was deleted and replaced with markdown-it's own block tokens. That removes the duplicate prediction of the renderer that caused r2's finding. The other commits are the companion fixture alias for the new import and docs or review records, and they add no branch or state. The inline-span half of the same prediction (rewriteInline and closingBacktickRun) is still hand-written and per-line, so one copy of the renderer's rules remains. That is the source of R1. Removing it the same way, with code_inline from the parser, would finish the round rather than patch it.

Earlier runs:
- r2 / claude-read: The commits since r1 are mostly develop work merged into the branch: the YouTube frames specs and code (SPEC-ADDON-076..078, SPEC-CORE-058), the reading app (SPEC-CORE-059..063) and YouTube scene tiles (SPEC-ADDON-079..080). For this feature they answered r1's scope findings by giving the YouTube work approved specs on develop, declaring the empty-answer failure and the created-path change as revisions I11 and I12, and renumbering this spec to SPEC-ADDON-081..084. I saw no added branch, state or prediction in the file-Ask-thread design itself. The YouTube storyboard spec, however, was revised three times for tile timing: the sheet duration over the cell count, then 1/fps, then an interval recovered from round(fps*duration). Each round replaced the previous timing rule with a new derived prediction, and min_interval thinning was dropped along the way. That pattern is patching in the YouTube design, not in this change.

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

Claim: The saved-note builder still finds inline code spans one line at a time, so a CommonMark code span that crosses a line ending is treated as text, and the `[n]` inside it is rewritten to a `loft://` link or removed.
Impact: An answer whose inline code wraps across a soft line break, for example "Use `arr\n[1]` here", shows on screen as `<code>arr [1]</code>` with no pill, because applyCitations skips code. The saved note silently replaces that `[1]` with `[0:05](loft://…?t=5)`, or deletes it when it has no position, so the code in the note differs from what the viewer read. The reverse also happens: an unclosed backtick run on one line leaves the rest of that line to be rewritten even when markdown-it closes the span on a later line.
Evidence: addons/intelligence/frontend/askNoteFormat.ts rewriteAnswer calls `rewriteInline(line, …)` for each line that `codeLineIndexes` does not mark as block code. `rewriteInline` and `closingBacktickRun` look for the closing run only inside the same `line` string, and an unmatched opening run is copied literally before the scan moves on (`out += line.slice(i, i + run)`). The r2 fix replaced only block detection with markdown-it tokens (`fence`, `code_block`) and did not use `code_inline`. MarkdownPreview (frontend/src/components/MarkdownPreview.tsx:93) uses markdown-it with the same options, and CommonMark code spans may contain line endings. AnswerMarkdown.applyCitations skips text under `code, pre` (AnswerMarkdown.tsx:232).
Repro: Traced by hand, not executed: call buildAskThreadMarkdown with the answer "See `x\ny [1]` z" and citations [{n:1, position:{seconds:5}}]. Line 1 "See `x" has no closing run, so the backtick is copied. Line 2 "y [1]` z" goes through rewriteMarkers and becomes "y [0:05](loft://<id>?t=5)` z". markdown-it renders `x y [1]` as one code_inline, so on screen it is code and shows no pill. No test in askNoteFormat.test.ts or AskTabThread.test.tsx has a multi-line code span.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Take inline code ranges from the same markdown-it parse: walk the `inline` tokens' children for `code_inline`, or map paragraph content offsets, and skip markers inside them. Add a test with a code span that crosses a soft line break.

</details>

## Not verified

- claude-read: I did not run markdown-it or the tests. The claim that a code span crosses a soft line break comes from the CommonMark rules, not from execution.
- claude-read: I did not re-review I1–I6 and I8–I12 in depth this round. The fix commits touch only askNoteFormat.ts, its tests, the fixture alias and the docs.
- claude-read: I did not check that markdown-it's `map` for a fence inside a blockquote covers exactly the `>`-prefixed source lines; I relied on the new test asserting it.
- claude-verify: I did not run the builder or the test suite. The reproduction was traced by hand from the source.
- claude-verify: I did not check other invariants (I1-I6, I8-I12) beyond what R1 touches.
- claude-verify: I did not check whether the frontend-side applyCitations in AnswerMarkdown has the same multi-line span edge case at render time.

TOTAL: 1 findings
