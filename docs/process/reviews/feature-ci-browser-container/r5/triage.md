# Triage: r5

## Trajectory

This run:
- claude-deep:
  > The rounds so far:
  > - r1 to r2: a documentation fix.
  > - r2 to r3: added a prediction to a test, APP_TABLE_HEIGHT = 560.
  > - r3 to r4: removed that prediction and added a new mechanism, the fontconfig file, a `fonts` step in each job and I12 with its tests.
  > - r4 to r5 (72a6773f2): adds no branch, no state and no prediction. It removes one claim from a test comment, the clause saying no test step can run without the fonts step, which the code did not enforce. It chooses to correct the prose rather than add a new condition to the EPUB gate.
  >
  > This round repeats nothing an earlier round added. The design is not being patched.
- claude-read:
  > The rounds so far:
  > - r1→r2: a documentation fix (the PyYAML install line).
  > - r2→r3: added a prediction. APP_TABLE_HEIGHT became 560, which encoded the CJK fallback font in a test.
  > - r3→r4: removed that prediction and added a new mechanism instead: a fontconfig file, a `fonts` step per job, I12 and its tests.
  > - r4→r5 (72a6773f2): adds no branch, state or prediction. It removes a claim, the comment clause saying no test step can run without the fonts step. It neither repeats r4's addition nor extends the EPUB gate.
  >
  > The design is not being patched in layers. The r4 gap is now documented truthfully rather than closed: the EPUB step still runs after a failed fonts step, and the job is red. CD-2 (the binding is not checked) remains unaddressed.

Earlier runs:
- r2 / claude-deep: There is one fix round (29a43fe3a). It adds no branch, state or prediction. It changes no code at all: it corrects a stale local-install instruction so that it matches the CI install line that r1 already reviewed. It removes the wrong 'only pytest installed' claim and introduces no new mechanism. The design is not being patched. r1 CD-2 is left unaddressed.
- r2 / claude-read: There is one fix round since r1: commit 29a43fe3a, a documentation-only edit to testing.md § The bootstrap script. It adds no branch, state or prediction to the code, and the round before it (the original implementation) has no prior fix to repeat. It aligns one prose instruction with the existing ci.yml install line. This is not a pattern of patching the design. Nothing was removed.
- r3 / claude-deep: Since r2 the branch's own rounds are dc5b423c0 (INDEX status, docs only), merge 0215ef84c (brings in unrelated develop work) and 78e058f2c (one test expectation re-measured). No round adds a branch, a state or a prediction to the CI wiring or the check script. The only new element is an environment-specific expected value in an existing test, made under a human-approved I6 revision. It does not repeat anything an earlier round added, and nothing was removed. The design is not being patched.
- r3 / claude-read: The fix commits since r2 are mostly not fixes to this change. f62fe60c through 4f829590 come from the Pickup coverage work (SPEC-ADDON-149/150, SPEC-CORE-142), merged from develop at 0215ef84c; dc5b423c0 is an INDEX status edit. The only commit for this change is 78e058f2c, which re-measures one test constant after the container's fonts changed the measured height, with the human approving and the I6 revision recording it. It adds no branch, state or prediction to the CI wiring or the browser-check script, and it repeats nothing an earlier round added. r2's round changed documentation only. The design is not being patched; the one cost is less headroom in the 807px layout case.
- r4 / claude-deep: r3 added a prediction: APP_TABLE_HEIGHT = 560, which encoded the image's CJK fallback font in an existing test under an I6 exception. r4 removes that prediction. 5f77636c8 restores 548 and the 783px comment, and the I6 (r4) revision drops the exception. In its place r4 adds a new mechanism: a fontconfig file, a `fonts` step in each browser job, invariant I12 and two pytest tests. No earlier round added this mechanism, so it does not repeat a prior patch. It replaces the r3 approach (adjusting the expectation) with fixing the environment. The design is not being patched repeatedly. The new step adds a state the existing EPUB gate does not consider (CD-1).
- r4 / claude-read:
  > The rounds so far:
  > - r1 to r2: a documentation fix (the PyYAML install line).
  > - r2 to r3: re-measured APP_TABLE_HEIGHT to 560. This put an environment-specific prediction (the CJK font's height) into a test.
  > - r3 to r4 (edd274227, 5f77636c8, 1260db974, be7d45e76): removed that prediction (APP_TABLE_HEIGHT back to 548, I6 back to its original text) and replaced it with a mechanism that changes the environment instead: one new CI step (id `fonts`) per browser job, a config file, invariant I12 and its tests.
  >
  > The r4 round reacts to the same root cause as r3, the image's fallback font. It does not repeat r3's addition; it removes it. It adds one new step to each job and leaves the existing conditions unchanged; the EPUB `if` was not extended to cover the new step (CR4-1). The design is not being patched in layers.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- .github/playwright-fonts.conf — full: Read the whole file (6 lines) in the working tree. This commit does not change it.
- .github/workflows/ci.yml — partial: Read lines 290-519 in the working tree. That range covers both browser jobs (295-409), with the fonts steps and the EPUB gate, and the bootstrap job (496-513), so every hunk of the branch diff is included. This commit does not change the file.; partial: Read lines 290-519 in the working tree. This range covers both browser jobs (302-409) and the bootstrap job (496-513), which are every hunk of the branch diff. This commit does not change the file.
- frontend/scripts/check-playwright-browsers.mjs — full: Read the whole file (lines 1-88) in the working tree. This commit does not change it.

Test files:
- frontend/src/__tests__/check-playwright-browsers.test.ts — full: Read the entire file as quoted in the branch diff (256 lines); I did not open it in the working tree. This commit does not change it.; full: Read the entire file as quoted in the branch diff. I did not open it in the working tree. This commit does not change it.
- tests/test_ci_browser_jobs.py — full: Read the entire file from the branch diff, and read lines 225-306 in the working tree, which include the changed comment at 244-245.; full: Read the entire file from the branch diff, and read lines 230-306 in the working tree. That range includes the changed comment at 244-245 and its enclosing test.

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-deep: I ran nothing: not pytest, not vitest, not Playwright, and not fc-match in mcr.microsoft.com/playwright:v1.58.2-noble.
- claude-deep: I did not inspect git objects to confirm that commit 72a6773f2 contains only the quoted one-line hunk. I compared the working tree at tests/test_ci_browser_jobs.py:244-245 with the diff.
- claude-deep: I did not check whether the user fontconfig takes effect in the image (conf.d include order, XDG_CONFIG_HOME, writability of HOME for uid 1001).
- claude-deep: I did not check branch protection on develop (I7).
- claude-deep: I did not open the vitest test in the working tree. I read it only as quoted in the branch diff.
- claude-read: I ran no commands (pytest, vitest, Playwright, fc-match).
- claude-read: I did not inspect git objects to confirm that 72a6773f2 contains only the quoted comment hunk. I compared the hunk with the working tree at tests/test_ci_browser_jobs.py:244-245.
- claude-read: Branch protection on develop (I7) is not visible in the repository.
- claude-read: I did not check whether the user fontconfig actually takes effect in mcr.microsoft.com/playwright:v1.58.2-noble, or whether /github/home is writable by uid 1001.
- claude-read: I did not reopen frontend/src/__tests__/check-playwright-browsers.test.ts in the working tree. I read it from the quoted branch diff.
- claude-verify: I did not run any test or CI job, because I have no execution tools.
- claude-verify: I did not check that the image tag v1.58.2 matches the @playwright/test version in frontend/pnpm-lock.yaml (I9).
- claude-verify: I did not check that the branch protection required-check list matches the job names (I7, a GitHub setting).
- claude-verify: I did not check that test_ci_browser_jobs.py is collected and not skipped in the bootstrap job (I10).
- claude-verify: I did not read the vitest test for check-playwright-browsers.mjs.
- claude-verify: I did not confirm empirically that fontconfig in the container honours the user config before 60-latin.conf.

TOTAL: 0 findings
