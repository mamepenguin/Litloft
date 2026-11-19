# Triage: r3

## Trajectory

This run:
- claude-deep: Since r2 the branch's own rounds are dc5b423c0 (INDEX status, docs only), merge 0215ef84c (brings in unrelated develop work) and 78e058f2c (one test expectation re-measured). No round adds a branch, a state or a prediction to the CI wiring or the check script. The only new element is an environment-specific expected value in an existing test, made under a human-approved I6 revision. It does not repeat anything an earlier round added, and nothing was removed. The design is not being patched.
- claude-read: The fix commits since r2 are mostly not fixes to this change. f62fe60c through 4f829590 come from the Pickup coverage work (SPEC-ADDON-149/150, SPEC-CORE-142), merged from develop at 0215ef84c; dc5b423c0 is an INDEX status edit. The only commit for this change is 78e058f2c, which re-measures one test constant after the container's fonts changed the measured height, with the human approving and the I6 revision recording it. It adds no branch, state or prediction to the CI wiring or the browser-check script, and it repeats nothing an earlier round added. r2's round changed documentation only. The design is not being patched; the one cost is less headroom in the 807px layout case.

Earlier runs:
- r2 / claude-deep: There is one fix round (29a43fe3a). It adds no branch, state or prediction. It changes no code at all: it corrects a stale local-install instruction so that it matches the CI install line that r1 already reviewed. It removes the wrong 'only pytest installed' claim and introduces no new mechanism. The design is not being patched. r1 CD-2 is left unaddressed.
- r2 / claude-read: There is one fix round since r1: commit 29a43fe3a, a documentation-only edit to testing.md § The bootstrap script. It adds no branch, state or prediction to the code, and the round before it (the original implementation) has no prior fix to repeat. It aligns one prose instruction with the existing ci.yml install line. This is not a pattern of patching the design. Nothing was removed.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Read coverage

Product files:
- .github/workflows/ci.yml — partial: Read lines 280-509, which cover both browser jobs (302-393) and the bootstrap job (480-497), i.e. every hunk of the branch diff. Commit 78e058f2c does not change this file.; partial: Read lines 290-399 in the working tree, which cover both browser jobs. The bootstrap hunk was reviewed in r1 and r2, and commit 78e058f2c does not change this file.
- frontend/e2e-layout/addon-policy.spec.ts — full: Read the whole file (204 lines), including the changed constant and comment and every assertion that reads APP_TABLE_HEIGHT.; full: Read the whole file (lines 1-204), including the changed constant and comment and every assertion that uses them.
- frontend/scripts/check-playwright-browsers.mjs — full: Read the whole file (88 lines). It is unchanged by this commit.; full: Read the whole file (lines 1-88). Commit 78e058f2c does not change it.

Test files:
- frontend/src/__tests__/check-playwright-browsers.test.ts — full: Read the entire file as quoted in the branch diff; I did not open it in the working tree. Commit 78e058f2c does not change it.; full: Read the whole new file as quoted in the branch diff. It is unchanged by this commit.
- tests/test_ci_browser_jobs.py — full: Read the entire file as quoted in the branch diff; I did not open it in the working tree. Commit 78e058f2c does not change it.; full: Read the whole new file as quoted in the branch diff. It is unchanged by this commit.

## Needs a human

### unspecified_behavior

Note: The layout suite's absolute table-height expectation now encodes the Playwright image's font resolution (WenQuanYi Zen Hei). The spec does not say which environment the layout constants are measured in, or that local host runs may disagree (CD-1).
- claude-deep: The layout suite's absolute table-height expectation now encodes the Playwright image's font resolution (WenQuanYi Zen Hei). The spec does not say which environment the layout constants are measured in, or that local host runs may disagree (CD-1).

## Findings

A: 0
B: 2
C: 0

### claude-deep:CD-1 — bucket B, LOW, open

Claim: APP_TABLE_HEIGHT now pins the table height the Playwright image renders with its fallback CJK font (560), so `pnpm test:e2e:layout` run the documented local way (host browsers via `playwright install --with-deps chromium`, testing.md:196) checks against a font environment it does not have.
Impact: A developer who runs the layout suite on an Ubuntu host set up as testing.md § Browser suites says gets the old runner's fonts and a table about 548px high. The test 'the app's own table is the height the claims are made about' (addon-policy.spec.ts:142-145) then fails, and so does the `wrapperHeight` check in 'the cap is 70% of the window' (:152). The failure is loud, not silent. The height was already environment-dependent before this commit, and only the environment it agrees with has changed. Spec §7 says local runs are unchanged.
Evidence: frontend/e2e-layout/addon-policy.spec.ts:27 `APP_TABLE_HEIGHT = 560`. :144 `expect(Math.round(m.tableHeight)).toBe(APP_TABLE_HEIGHT)`. decisions.md:13 says the image resolves system-ui and sans-serif to WenQuanYi Zen Hei and the fixture loads no web font. docs/developer-guide/testing.md:194-229 still tells developers to install host browsers and run `pnpm test:e2e:layout`, with no mention of the image.
Repro: not_reproduced (read-only). Expected: on an ubuntu-24.04 host after `playwright install --with-deps chromium`, `pnpm test:e2e:layout` reports tableHeight 548 against the expected 560.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Have testing.md § Browser suites say that the layout suite's measured heights are taken in mcr.microsoft.com/playwright:v1.58.2-noble, or give the command that runs it in that image.

</details>

### claude-read:CR3-1 — bucket B, INFO, open

Claim: Re-measuring APP_TABLE_HEIGHT to 560 moves the scroll threshold to 800px (0.7 × 800 = 560). The declared non-scrolling 807px case now sits 4.9px above the threshold; before the change the margin was 16.9px.
Impact: On a later image or font-package change that adds about 0.4px per row across the 12 rows, two things break together. The 807px height case flips (scrollsVertically becomes true while it is declared false), and the exact-height check at line 144 fails. The failure is loud: CI goes red and nothing passes silently. The suite has simply become more sensitive to fonts in the image.
Evidence: frontend/e2e-layout/addon-policy.spec.ts:27 `APP_TABLE_HEIGHT = 560`. Line 37 declares `{ height: 807, innerScroll: false }`, and 807 × 0.7 = 564.9. Line 169 asserts `height * 0.7 < APP_TABLE_HEIGHT` equals innerScroll, and line 144 asserts that the rounded table height equals the constant exactly.
Repro: not_reproduced (read-only). Arithmetic: 564.9 − 560 = 4.9px of headroom, against 564.9 − 548 = 16.9px before.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: I ran nothing. Neither the layout suite nor the vitest and pytest tests were executed, and the table heights of 560 in the image and 548 on a host come from decisions.md, not my own measurement.
- claude-deep: What a macOS developer machine measures for the table, which would differ again.
- claude-deep: Branch protection on develop (I7).
- claude-deep: The develop-merged pickup-coverage commits, which are outside this change's diff.
- claude-read: I did not run Playwright, so I have not confirmed that the container measures exactly 560 or that macOS/local runs measure 548 or anything else.
- claude-read: I did not inspect git objects to confirm that commit 78e058f2c contains only the quoted hunk. I compared the working tree with the diff instead.
- claude-read: Branch protection on develop (I7) is a GitHub setting outside the repository.
- claude-read: I did not re-check the vitest and pytest test files beyond their content in the quoted diff; this commit does not change them.
- claude-read: I did not read the addon-policy fixture HTML in full, only its font-related lines.
- claude-verify: Did not run Playwright locally or in the image, so I did not observe the measured height of 560 or what a host install would measure.
- claude-verify: Did not inspect CI run 44498253376.
- claude-verify: Did not diff the commit against origin/develop to confirm that no other spec lines changed.

TOTAL: 2 findings
