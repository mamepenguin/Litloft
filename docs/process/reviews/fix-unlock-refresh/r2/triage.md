# Triage: r2

## Trajectory

This run:
- claude-read: There was one code round after r1. a321dac75 did not add a branch or state. It replaced the inline window.location.assign in unlock/page.tsx with a shared loadFullPage helper and applied the same helper to CompleteStep's existing success path, which resolves r1 R2. It also removed the router dependency from CompleteStep and the location stub from the unlock test. a97f53fa1 only shortened the rules bullet. 0f84750fb and c3602265e are review records. No round repeats a branch, state or prediction that an earlier round added. This is consolidation, not patching. The one leftover is that negative test assertions were not migrated with the positive ones.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- frontend/src/app/setup/steps/CompleteStep.tsx — full: Read the whole file (152 lines).
- frontend/src/app/unlock/page.tsx — full: Read the whole file (99 lines).
- frontend/src/lib/fullPageLoad.ts — full: Read the whole file (9 lines).

Test files:
- frontend/src/app/setup/__tests__/CompleteStep.test.tsx — full: Read the whole file (146 lines).
- frontend/src/app/setup/__tests__/SetupWizard.test.tsx — partial: Read lines 470-529 and 890-959. Grepped every pushMock/loadFullPageMock usage (lines 4-12, 50-51, 203, 499, 502, 524, 753, 795, 834, 880, 921, 946, 959).
- frontend/src/app/unlock/__tests__/page.test.tsx — full: Read the whole file (79 lines).

## Unspecified behavior, recorded

- claude-read: Finishing setup in public mode also ends in a full page load of /admin, though no cookie changed.
  - F1 × I1 = 1, claude-read: Happens once per install at the end of the wizard. The user sees a full reload instead of a client transition.
  - F1 × I1 = 1, claude-verify: Finishing setup in public mode (once per install) does a full reload of /admin instead of a client-side navigation, and the user sees at most a slightly slower page change.
- claude-read: After a successful complete-setup, the `finally` block re-enables the finish button while the full page load is in flight, so a second click can POST complete-setup again.
  - F1 × I1 = 1, claude-read: Needs a click during the short reload after the last wizard step. The user still lands on /admin.
  - F1 × I2 = 2, claude-verify: After a successful finish, CompleteStep.tsx:61-62 re-enables the button before the document navigation unloads the page, so a quick second click on a slow load can POST complete-setup again, and the user may briefly see an error message before /admin loads.

## Findings

A: 0
B: 2
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: After the move from router.push to loadFullPage, the 'does not finish / does not redirect' tests still assert only `pushMock` not called. The component never calls router.push now, so these negative assertions pass whatever the code does.
Impact: If a regression made CompleteStep navigate to /admin when complete-setup or a pre-submit save fails (for example, loadFullPage moved above the `!res.ok` check or into `finally`), no test would fail. A user would then be sent to /admin with setup unfinished, and the error message would never show.
Evidence: frontend/src/app/setup/__tests__/CompleteStep.test.tsx:70-78 ('does not redirect on failure') checks only `expect(pushMock).not.toHaveBeenCalled()`. SetupWizard.test.tsx:499, :921 and :946 do the same. CompleteStep.tsx no longer imports useRouter (lines 1-7), so pushMock can never be called. The positive tests were switched to loadFullPageMock (CompleteStep.test.tsx:58; SetupWizard.test.tsx:203, 502, 524, 753, 795, 834, 880, 959), but the negative ones were not.
Repro: Mutation: in CompleteStep.tsx move `loadFullPage("/admin")` from line 58 into the `finally` block at line 61. Reading the tests, 'does not redirect on failure' (CompleteStep.test.tsx:70) and the SetupWizard tests at :893 and :924 still pass, because they assert pushMock, not loadFullPageMock. The tests were not executed.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In CompleteStep.test.tsx:77 and SetupWizard.test.tsx:499, :921 and :946, assert `expect(loadFullPageMock).not.toHaveBeenCalled()`, either in place of or alongside the pushMock assertion.

</details>

### claude-read:R2 — bucket B, INFO, open

Claim: `loadFullPage` in fullPageLoad.ts is mocked in every test that reaches it. No test checks that it actually performs a document navigation.
Impact: If the helper body were changed to a client-side navigation or a no-op, all tests would stay green. The stale sidebar, addon catalogue and WebSocket filter that this fix addresses would come back unnoticed. The function is one line, so the practical risk is small.
Evidence: frontend/src/lib/fullPageLoad.ts:7-9 sets `window.location.href = path`. vi.mock('@/lib/fullPageLoad') replaces it at unlock/__tests__/page.test.tsx:20-22, CompleteStep.test.tsx:6-8 and SetupWizard.test.tsx:6-8. Grep found no test that imports the real module.
Repro: Mutation: replace the body of fullPageLoad.ts:8 with `window.history.pushState(null, "", path)`. Reading the tests, none would fail. The tests were not executed.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a small test that stubs window.location and asserts that `href` is set to the path.

</details>

## Not verified

- claude-read: Tests were not executed. I have no command tool, so mutation results come from reading the code.
- claude-read: Whether a real browser shows fresh sidebar, addon and WebSocket state after the full load at /admin was not checked.
- claude-read: I did not check whether /admin middleware or the server redirects a freshly set-up install somewhere else.
- claude-read: I read SetupWizard.test.tsx only around the changed hunks and pushMock usages, not the whole file.
- claude-verify: I did not run the test suite or try the mutation described for R1; it was reasoned from source only.
- claude-verify: I did not check the unlock/page.tsx test assertions beyond the mock setup lines 1-40.
- claude-verify: I did not check whether the backend complete-setup endpoint is idempotent on a second POST.

TOTAL: 2 findings
