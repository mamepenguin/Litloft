# Triage: r4

## Trajectory

This run:
- claude-deep: r3 added a prediction: APP_TABLE_HEIGHT = 560, which encoded the image's CJK fallback font in an existing test under an I6 exception. r4 removes that prediction. 5f77636c8 restores 548 and the 783px comment, and the I6 (r4) revision drops the exception. In its place r4 adds a new mechanism: a fontconfig file, a `fonts` step in each browser job, invariant I12 and two pytest tests. No earlier round added this mechanism, so it does not repeat a prior patch. It replaces the r3 approach (adjusting the expectation) with fixing the environment. The design is not being patched repeatedly. The new step adds a state the existing EPUB gate does not consider (CD-1).
- claude-read:
  > The rounds so far:
  > - r1 to r2: a documentation fix (the PyYAML install line).
  > - r2 to r3: re-measured APP_TABLE_HEIGHT to 560. This put an environment-specific prediction (the CJK font's height) into a test.
  > - r3 to r4 (edd274227, 5f77636c8, 1260db974, be7d45e76): removed that prediction (APP_TABLE_HEIGHT back to 548, I6 back to its original text) and replaced it with a mechanism that changes the environment instead: one new CI step (id `fonts`) per browser job, a config file, invariant I12 and its tests.
  >
  > The r4 round reacts to the same root cause as r3, the image's fallback font. It does not repeat r3's addition; it removes it. It adds one new step to each job and leaves the existing conditions unchanged; the EPUB `if` was not extended to cover the new step (CR4-1). The design is not being patched in layers.

Earlier runs:
- r2 / claude-deep: There is one fix round (29a43fe3a). It adds no branch, state or prediction. It changes no code at all: it corrects a stale local-install instruction so that it matches the CI install line that r1 already reviewed. It removes the wrong 'only pytest installed' claim and introduces no new mechanism. The design is not being patched. r1 CD-2 is left unaddressed.
- r2 / claude-read: There is one fix round since r1: commit 29a43fe3a, a documentation-only edit to testing.md § The bootstrap script. It adds no branch, state or prediction to the code, and the round before it (the original implementation) has no prior fix to repeat. It aligns one prose instruction with the existing ci.yml install line. This is not a pattern of patching the design. Nothing was removed.
- r3 / claude-deep: Since r2 the branch's own rounds are dc5b423c0 (INDEX status, docs only), merge 0215ef84c (brings in unrelated develop work) and 78e058f2c (one test expectation re-measured). No round adds a branch, a state or a prediction to the CI wiring or the check script. The only new element is an environment-specific expected value in an existing test, made under a human-approved I6 revision. It does not repeat anything an earlier round added, and nothing was removed. The design is not being patched.
- r3 / claude-read: The fix commits since r2 are mostly not fixes to this change. f62fe60c through 4f829590 come from the Pickup coverage work (SPEC-ADDON-149/150, SPEC-CORE-142), merged from develop at 0215ef84c; dc5b423c0 is an INDEX status edit. The only commit for this change is 78e058f2c, which re-measures one test constant after the container's fonts changed the measured height, with the human approving and the I6 revision recording it. It adds no branch, state or prediction to the CI wiring or the browser-check script, and it repeats nothing an earlier round added. r2's round changed documentation only. The design is not being patched; the one cost is less headroom in the 807px layout case.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Read coverage

Product files:
- .github/playwright-fonts.conf — full: Read the whole file (6 lines) in the working tree.
- .github/workflows/ci.yml — partial: Read lines 290-414 in the working tree, which cover both browser jobs including the new fonts steps and the EPUB gate. The bootstrap install hunk (`pip install pytest PyYAML==6.0.2`) was read from the diff only; this commit does not change it.; partial: Read lines 290-519 in the working tree. That range covers both browser jobs (295-409), including both new fonts steps, and the bootstrap job (496-513), so every hunk of the diff is included.
- frontend/scripts/check-playwright-browsers.mjs — full: Read the whole file (88 lines) in the working tree. This commit does not change it.; full: Read the whole file (lines 1-88) in the working tree. This commit does not change it.

Test files:
- frontend/src/__tests__/check-playwright-browsers.test.ts — full: Read the entire file as quoted in the branch diff (256 lines). This commit does not change it.; full: Read the entire file as quoted in the branch diff and did not open it in the working tree. This commit does not change it.
- tests/test_ci_browser_jobs.py — full: Read the entire file from the branch diff, and read lines 230-306 (the I12 tests) in the working tree.; full: Read the full file as quoted in the branch diff, and re-read lines 230-306 (the new fonts tests) in the working tree.

## Needs a human

### unspecified_behavior

Note: If the fonts step fails, the EPUB suite still runs under the image's default CJK fallback. The job is already red, but the EPUB result is produced under a font setup the spec says is wrong.
- claude-deep: The spec does not say what the EPUB step should do when the fonts step fails while the browser check passed. Today the EPUB step runs without the font config (CD-1).
- claude-deep: Whether the user fontconfig is loaded depends on the image's system fonts.conf including conf.d/50-user.conf and on XDG_CONFIG_HOME being unset. GitHub Actions sets HOME=/github/home in container jobs, and the step writes there. The spec does not mention this dependency.
- claude-deep: `<prefer>` inserts Liberation Sans immediately before the matched `sans-serif` element, not at the head of the list. If an earlier conf.d file (for example the WenQuanYi package's own conf, numbered below 50) already prepended WenQuanYi before `sans-serif`, WenQuanYi would still come first. The spec reports a local measurement of 548 in the image with the file, which suggests this does not happen, but I could not confirm it.
- claude-deep: The app's font stack (globals.css:142-145) names Arial and Helvetica, which Ubuntu's metric aliases map to Liberation Sans, and also CJK names (メイリオ, Meiryo, ＭＳ Ｐゴシック) that come before Arial. The user file does not touch those names. The spec's statement that 'the app's font stack names no font the image has' is a claim about resolution that the code does not check.
- claude-verify: If the fonts step fails, the EPUB suite still runs under the image's default CJK fallback. The job is already red, but the EPUB result is produced under a font setup the spec says is wrong.

### unspecified_behavior

Note: The spec does not say what the EPUB step should do when the fonts step fails while the browser check passed. Today the EPUB step runs without the font config (CD-1).; Whether the user fontconfig is loaded depends on the image's system fonts.conf including conf.d/50-user.conf and on XDG_CONFIG_HOME being unset. GitHub Actions sets HOME=/github/home in container jobs, and the step writes there. The spec does not mention this dependency.; `<prefer>` inserts Liberation Sans immediately before the matched `sans-serif` element, not at the head of the list. If an earlier conf.d file (for example the WenQuanYi package's own conf, numbered below 50) already prepended WenQuanYi before `sans-serif`, WenQuanYi would still come first. The spec reports a local measurement of 548 in the image with the file, which suggests this does not happen, but I could not confirm it.; The app's font stack (globals.css:142-145) names Arial and Helvetica, which Ubuntu's metric aliases map to Liberation Sans, and also CJK names (メイリオ, Meiryo, ＭＳ Ｐゴシック) that come before Arial. The user file does not touch those names. The spec's statement that 'the app's font stack names no font the image has' is a claim about resolution that the code does not check.
- claude-deep: The spec does not say what the EPUB step should do when the fonts step fails while the browser check passed. Today the EPUB step runs without the font config (CD-1).
- claude-deep: Whether the user fontconfig is loaded depends on the image's system fonts.conf including conf.d/50-user.conf and on XDG_CONFIG_HOME being unset. GitHub Actions sets HOME=/github/home in container jobs, and the step writes there. The spec does not mention this dependency.
- claude-deep: `<prefer>` inserts Liberation Sans immediately before the matched `sans-serif` element, not at the head of the list. If an earlier conf.d file (for example the WenQuanYi package's own conf, numbered below 50) already prepended WenQuanYi before `sans-serif`, WenQuanYi would still come first. The spec reports a local measurement of 548 in the image with the file, which suggests this does not happen, but I could not confirm it.
- claude-deep: The app's font stack (globals.css:142-145) names Arial and Helvetica, which Ubuntu's metric aliases map to Liberation Sans, and also CJK names (メイリオ, Meiryo, ＭＳ Ｐゴシック) that come before Arial. The user file does not touch those names. The spec's statement that 'the app's font stack names no font the image has' is a claim about resolution that the code does not check.
- claude-verify: If the fonts step fails, the EPUB suite still runs under the image's default CJK fallback. The job is already red, but the EPUB result is produced under a font setup the spec says is wrong.

## Findings

A: 0
B: 3
C: 0

### claude-deep:CD-1 — bucket B, LOW, open

Claim: The EPUB step's gate checks only `steps.browsers.outcome`, so if the new `fonts` step fails, the EPUB suite still runs without the pinned fontconfig. The pytest comment at tests/test_ci_browser_jobs.py:244-245 says the opposite: 'nothing lets a test step run without it'.
Impact: Suppose the fonts step fails, for example because `cp` cannot write under `$HOME` as `--user 1001`. The layout step is skipped by the implicit success(). The EPUB step still runs under the image's default CJK fallback, so its results come from a font environment I12 says no test step sees. The job still turns red because the fonts step failed, so nothing passes silently. What goes wrong is that the EPUB result shown for that run comes from the wrong environment. A reader who trusts the test comment would believe the gate covers this case.
Evidence: .github/workflows/ci.yml:390-394 adds the step with id `fonts` and no `if`. ci.yml:407 has `if: ${{ !cancelled() && steps.browsers.outcome == 'success' }}`, which does not mention `steps.fonts`. test_fonts_step_installs_the_user_fontconfig (tests/test_ci_browser_jobs.py:246-264) checks only that the fonts step has no `if`/`continue-on-error`. test_layout_epub_job_runs_both_suites pins the EPUB `if` to the exact string without the fonts condition, so adding the fonts condition would fail that test.
Repro: not_reproduced (read-only). Reasoning from GitHub Actions semantics: a failed `fonts` step → `success()` is false, so the layout step is skipped; `!cancelled()` is true and `steps.browsers.outcome == 'success'` is true, so the EPUB step runs.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either add `&& steps.fonts.outcome == 'success'` to the EPUB `if` and to the spec/test string, or delete the clause 'and nothing lets a test step run without it' from the test comment at tests/test_ci_browser_jobs.py:244-245.

</details>

### claude-read:CR4-1 — bucket B, LOW, open

Claim: The EPUB step's condition checks only `steps.browsers.outcome`, not `steps.fonts.outcome`. If the fonts step fails, the EPUB suite still runs without the pinned fontconfig, and the pytest comment that says 'nothing lets a test step run without it' is false for that step.
Impact: If `mkdir`/`cp` into `$HOME/.config/fontconfig` fails, for example because `/github/home` is not writable under `--user 1001` (a case the spec lists), the layout step is skipped through the implicit success(). The EPUB step still runs in Chromium and WebKit with the image's CJK fallback font, and any text-dependent failure it reports is a second failure under a misleading name, which the step's own comment says the `if` is meant to prevent. The job is already red because the fonts step failed, so nothing passes silently.
Evidence: .github/workflows/ci.yml:390-394 is the fonts step (id `fonts`, no `if`). ci.yml:407 is `if: ${{ !cancelled() && steps.browsers.outcome == 'success' }}` on the EPUB step and does not reference `fonts`. ci.yml:403-405 says the browser-check condition is there so a broken setup 'skips the suite instead of failing it again under a misleading name'. tests/test_ci_browser_jobs.py:244-245 says '...and nothing lets a test step run without it', yet test_fonts_step_installs_the_user_fontconfig (:247-264) checks only the fonts step's own `if`/`continue-on-error`, and test_layout_epub_job_runs_both_suites pins EPUB_IF to the string without `fonts`.
Repro: not_reproduced (read-only). Mutation in thought: make the fonts step fail (e.g. `cp` to an unwritable HOME). Under Actions' condition rules the layout step is skipped and the EPUB step runs. No test in tests/test_ci_browser_jobs.py fails for this ordering, because none asserts that the EPUB `if` gates on `fonts`.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either add `&& steps.fonts.outcome == 'success'` to the EPUB `if` (together with spec item 2 and EPUB_IF in the pytest), or delete the clause 'and nothing lets a test step run without it' from tests/test_ci_browser_jobs.py:244-245.

</details>

### claude-deep:CD-2 — bucket B, INFO, open

Claim: test_fonts_conf_prefers_liberation_sans checks only that an alias names the generic and a `<prefer>` family. It does not check `binding="strong"`, and it does not check that the file takes effect in the image, given the system fontconfig include order.
Impact: Changing `binding="strong"` to `weak` (or deleting it) would still pass the pytest. Whether that changes resolution depends on the image's conf.d (lang scoring against WenQuanYi). The only thing that catches an ineffective font config is the layout suite's exact-height assertion (addon-policy.spec.ts:144, now 548), and only in the layout-and-EPUB job. The component jobs have no absolute font canary, but they passed before under the CJK fallback, so an ineffective config there would not create a silent wrong result.
Evidence: tests/test_ci_browser_jobs.py:276-279 matches `<alias>` by its first `<family>` and the first `<family>` of `<prefer>`, and ignores the `binding` attribute. .github/playwright-fonts.conf:4-5 uses binding="strong".
Repro: Mutation in thought: remove `binding="strong"` from both aliases → both parametrized cases of test_fonts_conf_prefers_liberation_sans still pass (survives). Change `<prefer>` to `<accept>` → `alias.find("prefer")` is None → killed. Remove the fonts step from one job → `_index` finds 0 → killed. Move the fonts step after a test step → order assertion killed.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Assert binding == 'strong' on the matching alias.

</details>

## Not verified

- claude-deep: I ran nothing: not pytest, not vitest, not Playwright in the image, and not fc-match. That the image with this file measures 548 comes from the spec, not from my own measurement.
- claude-deep: The image's /etc/fonts conf.d contents (whether 50-user.conf is included, and what the WenQuanYi package's conf prepends and at what priority) and whether XDG_CONFIG_HOME is set in mcr.microsoft.com/playwright:v1.58.2-noble.
- claude-deep: That HOME=/github/home is writable by uid 1001 in the container, and that Playwright passes HOME to the launched Chromium and WebKit processes.
- claude-deep: Whether Chromium on Linux resolves CSS `system-ui` through a fontconfig family named 'system-ui', so I do not know whether the system-ui alias has any effect.
- claude-deep: Branch protection on develop (I7).
- claude-deep: I checked only through the supplied diff and the working tree that commit be7d45e76 contains only the quoted hunks; I did not inspect git objects.
- claude-read: I ran nothing: no pytest, no vitest, no Playwright, and no `fc-match` in the image. That the image resolves sans-serif and system-ui to Liberation Sans with this file, and measures 548 px, comes from the spec text only.
- claude-read: Whether Playwright's WebKit build in the image reads the user fontconfig file at ~/.config/fontconfig, and whether Chromium queries fontconfig with the literal `system-ui` family.
- claude-read: Whether /github/home is writable by uid 1001 in the container job.
- claude-read: Branch protection on develop (I7).
- claude-read: I did not use git to confirm that be7d45e76 contains exactly the quoted hunks; I compared them with the working tree instead.
- claude-verify: I did not run fc-match or Playwright inside mcr.microsoft.com/playwright:v1.58.2-noble, so I did not confirm that the user fontconfig takes effect there or that a weak binding would actually change the resolved font.
- claude-verify: I did not run the pytest suite.
- claude-verify: I did not confirm the HOME value and its writability for --user 1001 in GitHub container jobs.
- claude-verify: I did not review check-playwright-browsers.mjs, the vitest test, the testing.md table or the branch protection settings.

TOTAL: 3 findings
