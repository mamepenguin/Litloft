# Triage: r3

## Trajectory

This run:
- claude-read: The r3 fix commit 38784498c changes only test files. It moves four negative assertions from pushMock to loadFullPageMock and adds a direct test of the real loadFullPage helper. It adds no branch, state or prediction to product code, and it repeats nothing an earlier round added. The earlier rounds were r1 (an inline window.location.assign in unlock/page.tsx) and a321dac75 (consolidation into one shared helper, also applied to CompleteStep). This round closes the test gaps that r2 reported. The rounds converge; the design is not being patched.

Earlier runs:
- r2 / claude-read: There was one code round after r1. a321dac75 did not add a branch or state. It replaced the inline window.location.assign in unlock/page.tsx with a shared loadFullPage helper and applied the same helper to CompleteStep's existing success path, which resolves r1 R2. It also removed the router dependency from CompleteStep and the location stub from the unlock test. a97f53fa1 only shortened the rules bullet. 0f84750fb and c3602265e are review records. No round repeats a branch, state or prediction that an earlier round added. This is consolidation, not patching. The one leftover is that negative test assertions were not migrated with the positive ones.

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
- frontend/src/app/setup/__tests__/SetupWizard.test.tsx — partial: Read lines 470-529 and 885-962 (every hunk this commit changed, with the enclosing tests). Grepped all pushMock and loadFullPageMock usages (lines 4-12, 50-51, 203, 499, 502, 524, 753, 795, 834, 880, 921, 946, 959).
- frontend/src/app/unlock/__tests__/page.test.tsx — full: Read the whole file (79 lines).
- frontend/src/lib/__tests__/fullPageLoad.test.ts — full: Read the whole file (20 lines).

## Unspecified behavior, recorded

- claude-read: After a successful unlock or setup completion, the `finally` block re-enables the submit button while the full page load is still in flight.
  - F1 × I1 = 1, claude-read: Only a second click during the brief reload triggers it; that click re-POSTs unlock or complete-setup, and the user still lands on the target page.
  - F1 × I2 = 2, claude-verify: After a successful unlock (unlock/page.tsx:42-44) or complete-setup (CompleteStep.tsx:61-63), the button becomes clickable again during the short window before the browser navigates; on a home LAN the user would rarely see or click it, and a second click at most sends a redundant request or flashes an error before the page load.

## Findings

A: 0
B: 1
C: 0

### claude-read:R1 — bucket B, INFO, open

Claim: CompleteStep's 'does not redirect on failure' test checks that loadFullPage was not called right after `waitFor(() => mockFetch called)`. fetch is called synchronously when the button is clicked, so the check does not wait for the handler's failure branch (await res.json(), setError, finally) to finish.
Impact: The negative assertion now targets the correct mock, but it runs before the handler settles. Suppose a regression navigated on failure late in the handler, for example from the `finally` block after `await res.json()`. Whether this test catches it depends on whether that continuation finishes within RTL's waitFor drain (one setTimeout(0)). A user would then land on /admin with setup unfinished and never see the error.
Evidence: frontend/src/app/setup/__tests__/CompleteStep.test.tsx:70-78 waits only for `mockFetch` to have been called (line 74-76), then asserts `loadFullPageMock` not called (line 77). CompleteStep.tsx:38 calls fetch synchronously inside handleComplete when onBeforeSubmit is absent. The failure branch at CompleteStep.tsx:46-55 awaits res.json() before it returns, and the finally block runs at :61-63. The SetupWizard negatives (SetupWizard.test.tsx:497-499, :913-921, :939-946) are not affected, because they first await the error text through findByText.
Repro: not_reproduced. Mutation from reading: move `loadFullPage("/admin")` from CompleteStep.tsx:58 into the `finally` block. Whether CompleteStep.test.tsx:70-78 kills this depends on microtask and macrotask timing that I could not run. Calling loadFullPage before the `!res.ok` check (with no await in between) is probably killed by the waitFor drain.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Before asserting that loadFullPageMock was not called, await the rendered error (`await screen.findByText(...)`) or wait for the submit button to re-enable, as the SetupWizard negatives already do.

</details>

## Not verified

- claude-read: Tests were not executed (I have no command tool). Mutation results come from reading the code.
- claude-read: I did not confirm that under vitest's jsdom environment `window.location` resolves to the object installed by vi.stubGlobal('location', ...). If it does not, fullPageLoad.test.ts would fail visibly rather than pass silently.
- claude-read: I did not confirm the exact timing of RTL waitFor's drain relative to Response.json() in the CompleteStep failure test (R1).
- claude-read: I did not check real-browser behavior after the full page load (fresh sidebar, addon and WebSocket state).
- claude-verify: Did not run vitest, so the actual microtask ordering under RTL's waitFor/act wrapper is not checked empirically.
- claude-verify: Did not inspect the SetupWizard.test.tsx line ranges cited as unaffected.
- claude-verify: Did not check the backend behavior of a second complete-setup POST.

TOTAL: 1 findings
