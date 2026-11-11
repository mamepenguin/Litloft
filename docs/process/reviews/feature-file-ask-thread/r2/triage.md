# Triage: r2

## Warnings

- R-5 ran at 1dde119a99781700a35d96cc180d4731d7334b6a, and these files changed since: .claude/agents/design-checker.md, DESIGN.md, backend/app/routers/drives.py, backend/app/routers/shelves.py, backend/app/schemas.py and 8 more; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: The commits since r1 are mostly develop work merged into the branch: the YouTube frames specs and code (SPEC-ADDON-076..078, SPEC-CORE-058), the reading app (SPEC-CORE-059..063) and YouTube scene tiles (SPEC-ADDON-079..080). For this feature they answered r1's scope findings by giving the YouTube work approved specs on develop, declaring the empty-answer failure and the created-path change as revisions I11 and I12, and renumbering this spec to SPEC-ADDON-081..084. I saw no added branch, state or prediction in the file-Ask-thread design itself. The YouTube storyboard spec, however, was revised three times for tile timing: the sheet duration over the cell count, then 1/fps, then an interval recovered from round(fps*duration). Each round replaced the previous timing rule with a new derived prediction, and min_interval thinning was dropped along the way. That pattern is patching in the YouTube design, not in this change.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R1 is bucket A or BLOCKER

## Findings

A: 1
B: 0
C: 0

### claude-read:R1 — bucket A, MEDIUM, open

Claim: The saved-note builder decides what counts as code with column-0 rules that ignore list context. As a result it rewrites or removes `[n]` inside fenced code that sits in a list item and is indented 4 or more spaces, and it leaves `[n]` raw in an indented list-continuation paragraph, which it mistakes for an indented code block.
Impact: When the viewer saves a thread whose answer has a fenced code block nested under a list item (common in model output, e.g. `1. Step` followed by a fence indented 4 spaces), indexing such as `arr[1]` in that code is silently turned into a `loft://` link or deleted in the note. A loose-list continuation paragraph indented 4 spaces after a blank line keeps raw `[1]` markers that are neither links nor removed. The note differs from what AnswerMarkdown (markdown-it, CommonMark) showed on screen.
Evidence: addons/intelligence/frontend/askNoteFormat.ts rewriteAnswer: the fence opener is detected only by `/^ {0,3}(`{3,}|~{3,})/`. A line with 4 or more leading spaces after a non-blank line therefore goes to `rewriteInline`, which runs `rewriteMarkers` on it. The indented-code test `/^(?: {4}|\t)/ && (indented || previousBlank)` treats any 4-space line after a blank as code, including list-item continuation paragraphs. MarkdownPreview uses markdown-it, which parses a fence inside a list item relative to the item's content column. The AskTabThread tests cover only top-level fences, top-level indented code and inline spans.
Repro: Save a thread whose answered turn's answer is "1. Run:\n    ```python\n    y = arr[1]\n    ```" and whose citations are [{n:1, position:{seconds:5}}]. The note line becomes `    y = arr[0:05](loft://<id>?t=5)`, while on screen the fence renders as a code block with `arr[1]`. With no citation for 1 the line becomes `    y = arr`. Second case: "- item\n\n    see [1]" renders as a list paragraph, but the note keeps `[1]` raw.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Classify code with the same CommonMark parser AnswerMarkdown uses (markdown-it tokens with `map` line ranges for fence/code_block, and code_inline), and rewrite markers only in text outside those ranges. Add tests for a list-nested fence and a list continuation paragraph.

</details>

## Not verified

- claude-read: I did not run any test or build; every behaviour here comes from reading the code.
- claude-read: I did not confirm with a live parser that markdown-it treats a fence indented 4 spaces under '1. ' as a fence. I reasoned it from CommonMark list-item content-column rules.
- claude-read: I did not read InternalClient.declare_trust_tier, so I have not confirmed that every non-2xx answer raises InternalAPIError and every transport failure is an httpx.HTTPError subclass.
- claude-read: I did not check whether the no-history prompt text is byte-identical to the template before this change (I1 against the pre-change state), beyond reading the jinja whitespace control.
- claude-read: The fix-diff record was truncated at 600000 bytes, so I did not see the later fix commits in full.
- claude-verify: I did not run the tests or markdown-it, so the CommonMark list-item parsing is reasoned from the specification, not executed.
- claude-verify: I did not check whether MarkdownPreview's custom plugins change how list or fence content is parsed.
- claude-verify: I did not review the other invariants (I1-I6, I8-I12) or the backend changes.

TOTAL: 1 findings
