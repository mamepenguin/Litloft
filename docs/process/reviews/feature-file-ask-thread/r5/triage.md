# Triage: r5

## Warnings

- R-5 ran at 1dde119a99781700a35d96cc180d4731d7334b6a, and these files changed since: .claude/agents/design-checker.md, DESIGN.md, backend/app/routers/drives.py, backend/app/routers/shelves.py, backend/app/schemas.py and 8 more; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: r2→r3 removed the hand-written block classifier in favour of markdown-it block tokens. r3→r4 kept the hand-written inline scanner and added state around it (inlineRanges, a handled set, a fallback pass), which patched the design. r4→r5 removed that scanner and its state entirely: rewriteInline, closingBacktickRun, answerBlocks, inlineRanges and handled are deleted, and every code decision now comes from parser tokens. That is a removal. In exchange it adds one new mechanism, sentinel substitution with a lengthened prefix and padded counters. This mechanism carries a new prediction: that swapping `[n]` for bracket-free text does not change how markdown-it parses the answer. The prediction fails for link reference definitions (R1). So this round removed the old duplicated prediction of the renderer's code-span rules but introduced a different one. It is not the same branch re-added round after round, but the same spot is being patched again.

Earlier runs:
- r2 / claude-read: The commits since r1 are mostly develop work merged into the branch: the YouTube frames specs and code (SPEC-ADDON-076..078, SPEC-CORE-058), the reading app (SPEC-CORE-059..063) and YouTube scene tiles (SPEC-ADDON-079..080). For this feature they answered r1's scope findings by giving the YouTube work approved specs on develop, declaring the empty-answer failure and the created-path change as revisions I11 and I12, and renumbering this spec to SPEC-ADDON-081..084. I saw no added branch, state or prediction in the file-Ask-thread design itself. The YouTube storyboard spec, however, was revised three times for tile timing: the sheet duration over the cell count, then 1/fps, then an interval recovered from round(fps*duration). Each round replaced the previous timing rule with a new derived prediction, and min_interval thinning was dropped along the way. That pattern is patching in the YouTube design, not in this change.
- r3 / claude-read: The r2→r3 round removed design rather than adding it. The hand-written block classifier in rewriteAnswer, a fence state, an indented flag, previousBlank and two regex predictions of where CommonMark blocks start, was deleted and replaced with markdown-it's own block tokens. That removes the duplicate prediction of the renderer that caused r2's finding. The other commits are the companion fixture alias for the new import and docs or review records, and they add no branch or state. The inline-span half of the same prediction (rewriteInline and closingBacktickRun) is still hand-written and per-line, so one copy of the renderer's rules remains. That is the source of R1. Removing it the same way, with code_inline from the parser, would finish the round rather than patch it.
- r4 / claude-read: r2→r3 removed design: the hand-written block classifier was replaced with markdown-it block tokens. r3→r4 did not remove the remaining hand-written inline-span scanner (rewriteInline/closingBacktickRun), as r3 had suggested. It kept the scanner and added state around it: an inlineRanges list taken from the parse, a `handled` set, and a second fallback pass for lines outside any inline range. That fixes the multi-line case, but the hand-written prediction of CommonMark code-span rules remains, and it still differs from the renderer on escaped backticks (R1). This round therefore patches around the same duplicated prediction instead of removing it. The design is being patched in this one spot, though more mildly than in earlier rounds.

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

Claim: rewriteAnswer replaces each `[n]` with a bracket-free sentinel before it parses, and removing the brackets changes the parse itself: a line such as `[1]: https://example.com` is a link reference definition for the renderer but a plain paragraph for the sentinel text. A following line indented 4 spaces is therefore a code_block on screen but a lazy paragraph continuation in the note builder, so a `[n]` inside that on-screen code is rewritten or removed.
Impact: Take an answer that ends with reference-style source lines, e.g. "[1]: https://example.com\n    see arr[2]". AnswerMarkdown renders line 2 as a `<pre>` code block that shows `arr[2]` as typed, with no pill. The saved note turns it into `see arr[0:05](loft://…?t=5)`, or `see arr` when 2 has no position. The code in the note silently differs from what the viewer read.
Evidence: addons/intelligence/frontend/askNoteFormat.ts rewriteAnswer builds sentinelText by replacing every MARKER match with `${prefix}${index}` and parses only sentinelText (`collect(blockParser.parse(sentinelText, {}))`). markdown-it 14.1.1 lib/rules_block/reference.mjs:11 requires the line to start with `[`, so `LITASKSENTINEL0: https://…` is never a reference. On the original text, reference.mjs:25 reads the 4-space line as a continuation only while it looks for a title. When the title fails it rolls back (`nextLine = destEndLineNo`, :162-163) and sets `state.line = nextLine` (:210), so the indented line starts a new block and the code rule makes it a code_block. On the sentinel text the same line is a lazy continuation of the paragraph (an indented code block cannot interrupt a paragraph), so no code_block token holds the sentinel, codeIndexes misses it, and markerReplacement runs. AnswerMarkdown.applyCitations skips `code, pre` (AnswerMarkdown.tsx:232).
Repro: Traced by hand from markdown-it 14.1.1 source, not executed: buildAskThreadMarkdown({fileId:'vid000000001', filename:'lecture.mp4', fileType:'video', turns:[{question:'why', answer:'[1]: https://example.com\n    see arr[2]', citations:[{n:2, position:{seconds:5}}]}]}). The note's second answer line becomes `    see arr[0:05](loft://vid000000001?t=5)`, while the renderer parses the original as a reference definition followed by a code_block holding `see arr[2]`. No test in askNoteFormat.test.ts or AskTabThread.test.tsx has a reference definition.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Parse the original answer, not a substituted one, and map code tokens back to source offsets (block `map` line ranges for fence/code_block plus the inline token's content scanned for code_inline), or choose a sentinel that keeps the `[`…`]` shape (e.g. `[LITASKSENTINEL0]`) so reference definitions and link labels parse the same. Add a test with a reference-definition line followed by an indented line.

</details>

## Not verified

- claude-read: I did not run markdown-it or the tests. R1 is traced by hand from markdown-it 14.1.1 reference.mjs and the CommonMark paragraph rule, not executed.
- claude-read: I did not confirm that the intelligence addon resolves the same markdown-it version (14.1.1) as frontend/node_modules at runtime.
- claude-read: I did not re-review the backend invariants (I1-I3, I8-I12) or the AskTab/askStore state logic in depth this round, because the fix commit does not touch them.
- claude-read: The reviewed commit fb15fd8 itself only records review documents. I reviewed the branch diff and the fix commits as supplied.
- claude-verify: The trace was not run in markdown-it. It was done by reading reference.mjs, the paragraph rule's behavior and the code rule's behavior.
- claude-verify: Whether gray-matter frontmatter stripping in MarkdownPreview (line 374) can shift the parse for an answer that starts with `---` was not checked.
- claude-verify: How often a model answer in normal use contains a `[n]: url` line followed by indented code was not assessed.

TOTAL: 1 findings
