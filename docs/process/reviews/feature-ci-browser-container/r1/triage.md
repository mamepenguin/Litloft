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
- .github/workflows/ci.yml — full: Read lines 240-519, which cover both changed hunks (the frontend-components and frontend-layout-epub jobs, and the bootstrap job) with their enclosing jobs.; full: Read the whole file (lines 1-549).
- frontend/scripts/check-playwright-browsers.mjs — full: Opened and read the whole file (88 lines).; full: Read the whole file (lines 1-88).

Test files:
- frontend/src/__tests__/check-playwright-browsers.test.ts — full: New file; read in full from the diff, which contains the entire file.; full: New file; read its entire content as shown in the diff (all 256 lines).
- tests/test_ci_browser_jobs.py — full: New file; read in full from the diff and checked lines 1-40 against the working tree.; full: New file; read its entire content as shown in the diff (all 230 lines).

## Needs a human

### unspecified_behavior

Note: The local bootstrap-test instructions in testing.md:78-84 now produce a collection error without PyYAML. The spec does not cover this.; The new vitest test runs in addon repositories' frontend CI. The spec's §7 does not declare this reach.
- claude-deep: check-playwright-browsers.mjs with `--browsers-json` as the last argument sets the path to the empty string; readFileSync('') then fails and the script reports 'cannot read browsers.json at '. This fails closed, but the error names an empty path.
- claude-deep: A name passed twice (for example `chromium chromium`) is checked and printed twice; no dedup is specified.
- claude-deep: The EPUB step's `steps.browsers.outcome == 'success'` makes the EPUB step skipped, not failed, when the browser check fails. The job is still red because the browser step failed, which matches I4.
- claude-verify: The local bootstrap-test instructions in testing.md:78-84 now produce a collection error without PyYAML. The spec does not cover this.
- claude-verify: The new vitest test runs in addon repositories' frontend CI. The spec's §7 does not declare this reach.

### unspecified_behavior

Note: check-playwright-browsers.mjs with `--browsers-json` as the last argument sets the path to the empty string; readFileSync('') then fails and the script reports 'cannot read browsers.json at '. This fails closed, but the error names an empty path.; A name passed twice (for example `chromium chromium`) is checked and printed twice; no dedup is specified.; The EPUB step's `steps.browsers.outcome == 'success'` makes the EPUB step skipped, not failed, when the browser check fails. The job is still red because the browser step failed, which matches I4.
- claude-deep: check-playwright-browsers.mjs with `--browsers-json` as the last argument sets the path to the empty string; readFileSync('') then fails and the script reports 'cannot read browsers.json at '. This fails closed, but the error names an empty path.
- claude-deep: A name passed twice (for example `chromium chromium`) is checked and printed twice; no dedup is specified.
- claude-deep: The EPUB step's `steps.browsers.outcome == 'success'` makes the EPUB step skipped, not failed, when the browser check fails. The job is still red because the browser step failed, which matches I4.
- claude-verify: The local bootstrap-test instructions in testing.md:78-84 now produce a collection error without PyYAML. The spec does not cover this.
- claude-verify: The new vitest test runs in addon repositories' frontend CI. The spec's §7 does not declare this reach.

## Findings

A: 0
B: 2
C: 0

### claude-deep:CD-1 — bucket B, LOW, open

Claim: The new pytest imports `yaml` at module level, which reaches the documented local bootstrap-test workflow. That workflow is not a touch point: `docs/developer-guide/testing.md` § The bootstrap script still tells developers to install only pytest, "as CI runs them".
Impact: A developer who follows docs/developer-guide/testing.md:78-84 (`pip install pytest` then `python3 -m pytest tests -v`) on an interpreter without PyYAML gets a collection error in tests/test_ci_browser_jobs.py. pytest then reports 'Interrupted: 1 error during collection', so none of the existing configure.py and Dockerfile tests in tests/ run locally. The failure is loud, not silent.
Evidence: tests/test_ci_browser_jobs.py:11 `import yaml` (unconditional, by design per spec item 6). docs/developer-guide/testing.md:78-84 says 'Its tests run on a bare interpreter with only pytest installed, as CI runs them: python3 -m pip install pytest / python3 -m pytest tests -v'. ci.yml:494 now installs `pytest PyYAML==6.0.2`. The touch-point list names only the `### Core jobs` table of testing.md, and spec §7 says the rest of the document is unchanged except the Browser suites section.
Repro: not_reproduced (read-only review). Expected result on an interpreter without PyYAML: `python3 -m pytest tests -v` → ModuleNotFoundError: No module named 'yaml' while collecting tests/test_ci_browser_jobs.py, and the run is interrupted.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add PyYAML==6.0.2 to the install line in testing.md § The bootstrap script and drop 'with only pytest installed', or name that section as a touch point.

</details>

### claude-deep:CD-2 — bucket B, INFO, open

Claim: The new vitest test frontend/src/__tests__/check-playwright-browsers.test.ts runs in every addon repository's frontend CI and in core's vitest shard, coverage, shuffled and tsc/eslint jobs. The touch-point list does not name this reach, and it goes against a stated repository convention that script checks are scripts, not vitest tests, because core's suite ships into addon pipelines.
Impact: After merge to develop, each addon's frontend job (which checks out core develop and runs core's whole suite, testing.md:372-374) also runs this test. It spawns `node` and resolves the installed playwright-core, so a difference in an addon pipeline's install (for example a missing `@playwright/test`) would turn an addon PR red for a core-only CI concern. I found no concrete failure: the test clears PLAYWRIGHT_BROWSERS_PATH and builds its own temporary store.
Evidence: frontend/scripts/check-coverage-denominator.mjs:9-10: 'It is a script, not a vitest test: core's suite is executed by the addon repositories' CI, so a new test here ships into their pipelines unannounced.' docs/developer-guide/testing.md:372-374: addon frontend jobs run core's whole suite. vitest.config.ts:13-18 does not exclude src/__tests__, so the file is collected. check-playwright-browsers.test.ts:31-37 and 218-254 resolve @playwright/test → playwright → playwright-core from frontend/. The spec's touch point names only 'A vitest test for it under frontend/src/ (new)', and §7 says 'The other CI jobs are untouched'.
Repro: not_reproduced (read-only; the addon workflows are not checked out in this worktree, so the addon jobs' install steps could not be read).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name the addon frontend pipelines and core's vitest jobs as places this test reaches, or record why the check-coverage-denominator convention does not apply here.

</details>

## Not verified

- claude-deep: The instructions name commit eda97893f, which by its message only records R-5 in decisions.md. I reviewed the branch diff quoted in the prompt, not that single commit's diff, which I could not compute without git.
- claude-deep: Addon repositories' frontend workflows are not checked out here, so whether they install @playwright/test and run the new vitest test cleanly was not read.
- claude-deep: Branch protection on develop (I7) cannot be observed from the repository.
- claude-deep: No command was run: neither pytest, vitest nor the check script was executed.
- claude-deep: Whether the Playwright image's /ms-playwright actually contains chromium-1208, chromium_headless_shell-1208 and the expected webkit revision for 1.58.2.
- claude-read: Whether branch protection on `develop` was changed (a GitHub setting, not in the repository).
- claude-read: That the commit sha eda97893 alone contains exactly the shown diff. I reviewed the diff supplied in the prompt against the working tree and did not inspect git objects.
- claude-read: The full body of docs/developer-guide/testing.md beyond the diff hunk.
- claude-read: Runtime behaviour of the container jobs (user 1001 permissions, pnpm cache path).
- claude-verify: Did not run pytest or vitest; the collection error and the addon-CI behavior are inferred from the code.
- claude-verify: Did not read the addon repositories' workflows directly; their reach is taken from testing.md:372-374.
- claude-verify: Did not read check-playwright-browsers.mjs or the rest of ci.yml in full for other defects.

TOTAL: 2 findings
