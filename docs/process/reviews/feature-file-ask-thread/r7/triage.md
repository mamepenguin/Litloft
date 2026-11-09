# Triage: r7

## Warnings

- R-5 ran at 1dde119a99781700a35d96cc180d4731d7334b6a, and these files changed since: .claude/agents/design-checker.md, .github/workflows/ci.yml, DESIGN.md, backend/app/routers/drives.py, backend/app/routers/shelves.py and 9 more; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-deep: The commits since r6 are mostly develop work merged into the branch. SPEC-ADDON-085 added one new state, a pending-retry set beside the failed set in the clip worker. Its two spec-review rounds refined that one mechanism (atomic consume, failure leaves the id in the failed set) rather than layering a new state each round. The reading-app design fix and its PageHeader wrap follow-ups are unrelated to this feature. For the file Ask thread itself, the rounds since r6 add no branch, state or prediction to askNoteFormat or the store: they renumber the spec, add the markdown-it alias the r5/r6 parser change needed, repoint the submodules, and, in 610ab690b, give the browser CI job the submodules and the link tree. That last commit removes an earlier assumption (that the browser job needs no addons) rather than adding a new one. Its only new coupling is that browser results now depend on the addon pins. The design is not being patched in this window.
- claude-read: The rounds up to r6 patched the saved-note code detection over and over. r2→r3 replaced the hand-written block classifier with markdown-it tokens, which removed it. r3→r4 added state around the remaining inline scanner. r4→r5 removed that scanner and added sentinel substitution, a new prediction that the substituted text parses like the original. r5→r6 narrowed that prediction by keeping brackets in the sentinel. Since r6, the fix commits add no branch, state or prediction to the file-Ask-thread design. They are develop merges (the YouTube storyboard retry SPEC-ADDON-085, the reading-app design fix), the renumbering and re-approval of the spec to SPEC-ADDON-081..084, INDEX ledger cleanup, docs, and this CI commit. The CI commit removes a stated assumption (that the browser job needs no addons) and adds a dependency on the submodules and link tree. That is new build-time state, but it is not a repeat of anything an earlier round added. The YouTube retry spec went through its own two-step revision: first a removal from the Failed record, then a separate Pending-retry record with atomic consumption. That replaced a race-prone mechanism within one feature's spec review; it was not patched across rounds of this review. Overall, the design is not being patched in this round.

Earlier runs:
- r2 / claude-read: The commits since r1 are mostly develop work merged into the branch: the YouTube frames specs and code (SPEC-ADDON-076..078, SPEC-CORE-058), the reading app (SPEC-CORE-059..063) and YouTube scene tiles (SPEC-ADDON-079..080). For this feature they answered r1's scope findings by giving the YouTube work approved specs on develop, declaring the empty-answer failure and the created-path change as revisions I11 and I12, and renumbering this spec to SPEC-ADDON-081..084. I saw no added branch, state or prediction in the file-Ask-thread design itself. The YouTube storyboard spec, however, was revised three times for tile timing: the sheet duration over the cell count, then 1/fps, then an interval recovered from round(fps*duration). Each round replaced the previous timing rule with a new derived prediction, and min_interval thinning was dropped along the way. That pattern is patching in the YouTube design, not in this change.
- r3 / claude-read: The r2→r3 round removed design rather than adding it. The hand-written block classifier in rewriteAnswer, a fence state, an indented flag, previousBlank and two regex predictions of where CommonMark blocks start, was deleted and replaced with markdown-it's own block tokens. That removes the duplicate prediction of the renderer that caused r2's finding. The other commits are the companion fixture alias for the new import and docs or review records, and they add no branch or state. The inline-span half of the same prediction (rewriteInline and closingBacktickRun) is still hand-written and per-line, so one copy of the renderer's rules remains. That is the source of R1. Removing it the same way, with code_inline from the parser, would finish the round rather than patch it.
- r4 / claude-read: r2→r3 removed design: the hand-written block classifier was replaced with markdown-it block tokens. r3→r4 did not remove the remaining hand-written inline-span scanner (rewriteInline/closingBacktickRun), as r3 had suggested. It kept the scanner and added state around it: an inlineRanges list taken from the parse, a `handled` set, and a second fallback pass for lines outside any inline range. That fixes the multi-line case, but the hand-written prediction of CommonMark code-span rules remains, and it still differs from the renderer on escaped backticks (R1). This round therefore patches around the same duplicated prediction instead of removing it. The design is being patched in this one spot, though more mildly than in earlier rounds.
- r5 / claude-read: r2→r3 removed the hand-written block classifier in favour of markdown-it block tokens. r3→r4 kept the hand-written inline scanner and added state around it (inlineRanges, a handled set, a fallback pass), which patched the design. r4→r5 removed that scanner and its state entirely: rewriteInline, closingBacktickRun, answerBlocks, inlineRanges and handled are deleted, and every code decision now comes from parser tokens. That is a removal. In exchange it adds one new mechanism, sentinel substitution with a lengthened prefix and padded counters. This mechanism carries a new prediction: that swapping `[n]` for bracket-free text does not change how markdown-it parses the answer. The prediction fails for link reference definitions (R1). So this round removed the old duplicated prediction of the renderer's code-span rules but introduced a different one. It is not the same branch re-added round after round, but the same spot is being patched again.
- r6 / claude-read: r2→r3 removed the hand-written block classifier in favour of markdown-it block tokens. r3→r4 patched around the remaining hand-written inline scanner by adding state (inlineRanges, a handled set, a fallback pass). r4→r5 removed that scanner and its state, and added one new mechanism: sentinel substitution, which carries the prediction that the substituted text parses like the original. r5→r6 adds no branch, state or prediction. It changes one template string so the sentinel keeps the `[`…`]` shape, which narrows the existing prediction rather than layering a new one on it, and it adds two test cases. The same spot has been touched in four consecutive rounds, so the area has been patched repeatedly, but this round is a minimal correction of the r5 mechanism, not another added layer.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 3
C: 0

### claude-deep:D1 — bucket B, LOW, open

Claim: The component fixture bundle now imports addon files through the gitignored link tree (`../../src/addons/intelligence/...`). In a checkout without the submodules or without `setup-addons.sh`, the fixture does not build at all, so every e2e-components case fails, not only the Ask-thread case.
Impact: A developer who runs `pnpm test:e2e:components` as `docs/developer-guide/testing.md:206-209` describes, without first linking the addons, gets a bundle failure across all component specs instead of a single failing case. CI is not affected, because commit 610ab690b adds `submodules: recursive` and `./setup-addons.sh` to that job.
Evidence: frontend/e2e-components/fixtures/app.tsx:78-80 imports `../../src/addons/intelligence/AskTab`, `askStore` and `messages/en.json`. setup-addons.sh:5,168-173 builds `frontend/src/addons/<name>/` as per-file symlinks. The build-bundle.ts comment still says 'Addon slot modules are not part of the fixture: bundling them would assert about whichever addon commits core points at'. The 'Components in a browser' section of testing.md:198-213 does not mention setup-addons.sh.
Repro: not_reproduced (reasoned from the import paths and the link-tree script; not run)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name `./setup-addons.sh` as a prerequisite in the 'Components in a browser' section, or lazy-load the ask-thread arrangement so that a missing link tree fails only that case.

</details>

### claude-read:R1 — bucket B, LOW, open

Claim: The whole component-fixture bundle now has a hard import of the intelligence addon's link tree (`../../src/addons/intelligence/AskTab`, `askStore`, `messages/en.json`), so every `e2e-components` spec, not only the Ask-thread case, depends on the addon submodule being checked out and on `setup-addons.sh` having run. The developer guide still describes the fixture as importing real components from `src/` with no such prerequisite.
Impact: Suppose a developer runs `pnpm test:e2e:components` in a checkout without submodules or without the link tree, or an addon pointer bump breaks a file that AskTab imports. Vite then cannot bundle `fixtures/app.tsx`, and every component spec fails at once, including unrelated layout cases such as page-header, citation seams and the justified grid. This failure is loud rather than silent, and CI now prepares the tree, so it is a workflow and coupling cost, not a wrong result.
Evidence: frontend/e2e-components/fixtures/app.tsx:78-80 imports from `../../src/addons/intelligence/`. setup-addons.sh:36-52 is what creates `frontend/src/addons/<name>/`. .github/workflows/ci.yml:306-313 now adds `submodules: recursive` and `./setup-addons.sh` to the frontend-layout job, which is why the job builds at all. docs/developer-guide/testing.md:198-213 ('Components in a browser') lists only `pnpm test:e2e:components` and says nothing about the link tree. build-bundle.ts:28-32 keeps the comment that addon slot modules are not part of the fixture 'because bundling them would assert about whichever addon commits core points at', and the new import now does exactly that for one addon file.
Repro: not_reproduced (I could only read the code. In a checkout with no frontend/src/addons/intelligence directory, the relative import in app.tsx has nothing to resolve, so the vite build in buildComponentFixture throws before any spec runs.)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a line to docs/developer-guide/testing.md under 'Components in a browser' saying that `./setup-addons.sh` (with submodules checked out) must run first.

</details>

### claude-deep:D2 — bucket B, INFO, open

Claim: Commit 610ab690b changes what the layout-invariant job compiles. With the link tree present, globals.css `@source "../addons"` now scans the addon sources, so the e2e-layout fixtures run against a sheet that depends on the addon pins. The commit deletes the comment that explained why the job previously ran without addons.
Impact: The e2e-layout results can now change when a submodule pointer moves, even though no core layout file changed. I found no rule that changes behaviour today: `@source` only adds utility classes and imports no addon CSS.
Evidence: .github/workflows/ci.yml:297-313 removes the comment 'No submodules and no setup-addons.sh ... No addon writes a rule the justified grid reads' and adds `submodules: recursive` and `./setup-addons.sh` before `pnpm test:e2e:layout` (line 345). frontend/src/app/globals.css:10 has `@source "../addons";`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: I did not run CI, the Playwright component job or the vite bundle, so whether the fixture builds with the aliases is reasoned from the imports and was not executed.
- claude-deep: I did not check that the submodule pointers at 610ab690b match the addon commits the diff describes.
- claude-deep: I did not check whether contributing.md or frontend-dev.md already tell developers to run setup-addons.sh before the component specs.
- claude-deep: I did not re-verify the I7 note builder or the I1-I3 backend behaviour, which earlier rounds covered and this commit does not touch.
- claude-read: I did not run CI, Playwright, vite or setup-addons.sh. That the bundle resolves and the ask-thread case passes in the new job comes from reading the code only.
- claude-read: I did not check that adding addon sources to the Tailwind scan leaves every existing e2e-layout invariant passing (for example, the justified-grid or line-clamp sheet assertions).
- claude-read: I did not check what `enMessages` in fixtures/app.tsx is built from, or whether any other fixture now needs merged addon translations.
- claude-read: I did not re-review the backend and frontend code behind I1–I12 in depth, because this commit does not touch it.
- claude-read: I did not check the knowledge scanner/startup-pass race beyond reading `_mark_declared`.
- claude-verify: I did not compare against origin/develop (git diff was unavailable), so I cannot say which lines 610ab690b itself changed and which came from earlier branch commits, including the build-bundle.ts comment.
- claude-verify: I did not check whether any addon utility class changes a rule that an e2e-layout fixture measures.
- claude-verify: I did not build the bundle without the link tree to watch the failure happen.

TOTAL: 3 findings
