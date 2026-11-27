# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- frontend/src/app/unlock/page.tsx — full: Read the whole file (101 lines).

Test files:
- frontend/src/app/unlock/__tests__/page.test.tsx — full: Read the whole file (77 lines).

## Unspecified behavior, recorded

- claude-read: After a successful unlock the `finally` block sets loading=false, so the submit button re-enables while the full page load is still in flight and a second click sends another unlock request.
  - F1 × I1 = 1, claude-read: Triggered only by clicking submit again during the brief page load; the second POST is harmless and the user still lands on the target.
  - F1 × I1 = 1, claude-verify: After a successful unlock, the finally block at unlock/page.tsx:44-45 re-enables the button while window.location.assign is still loading. On a home LAN that window is brief, and a second click only sends another successful unlock before the page changes, which does no harm.
- claude-read: The /unlock page remains in browser history after the full page load, so Back returns to the unlock form (same as the previous router.push behavior).
  - F2 × I1 = 2, claude-read: Pressing Back after unlocking shows the password form again; nothing is lost.
  - F2 × I2 = 4, claude-verify: Pressing Back after an unlock shows the /unlock form again even though the cookie is already set, as router.push did before. The user just goes forward or navigates elsewhere.

## Findings

A: 0
B: 2
C: 0

### claude-read:R2 — bucket B, LOW, open

Claim: The setup wizard also grants an unlock session (SetupWizard.tsx:287 `await unlock(password.password, false)`) and then navigates client-side with `router.push("/admin")` (CompleteStep.tsx:58), so it is an unlock path that does not end in a full page load, unlike the /unlock page after this change.
Impact: After finishing first-run setup in protected mode, providers mounted in the root layout (WebSocketProvider, AddonSlotsProvider, sidebar data via useSidebarData's mount-time getDrives/getAuthStatus, frontend/src/components/sidebar/useSidebarData.ts:43-46) may keep state read under the pre-unlock cookie until a reload. Happens at most once per install.
Evidence: frontend/src/app/setup/SetupWizard.tsx:281-291 unlocks; frontend/src/app/setup/steps/CompleteStep.tsx:58 router.push('/admin'); frontend/src/app/layout.tsx:73-87 mounts WebSocketProvider/AddonSlotsProvider/SidebarProvider above every page including /setup. Whether the Sidebar component is actually mounted on /setup (AppShell.tsx:367) and whether the WS filter matters before passwords exist was not established.
Repro: not_reproduced
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Decide whether CompleteStep should end in window.location.assign('/admin') when the wizard unlocked a session; out of this change's scope unless a person extends it.

</details>

### claude-read:R1 — bucket B, INFO, open

Claim: The diff reaches `.claude/rules/design-decisions.md`, a repository-wide rules file that is not one of the implicit touch points (docs/specs, INDEX.md, docs/process/reviews); no invariants file exists, so there is no declared touch-point list that names it.
Impact: No runtime effect. A new standing rule ('Unlock and Lock end in a full page load') now binds every future change to auth flows; a person should confirm that adding a project-wide rule was intended as part of this fix.
Evidence: .claude/rules/design-decisions.md:9 (added bullet). The Lock half of the rule matches code at frontend/src/components/Sidebar.tsx:64-65 (`await lockApi(); window.location.href = "/"`); the /unlock half matches frontend/src/app/unlock/page.tsx:37.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Tests were not executed (no command tool); in particular that vi.stubGlobal('location', ...) is what `window.location.assign` resolves to under the vitest jsdom environment.
- claude-read: Whether the Sidebar is mounted on /setup and whether the WebSocket drive filter on the setup page actually leaves stale state after CompleteStep's router.push (finding R2).
- claude-read: Backend behavior of /api/auth/unlock and the WebSocket group fixing at connect time.
- claude-read: The in-app evidence recorded in decisions.md was not reproduced.
- claude-verify: I did not run the test suite; I could not execute commands.
- claude-verify: I could not run git diff, so I did not check the exact diff hunks. I took the touched files from classification.json and product-files.txt.
- claude-verify: I did not check whether the /admin page or any middleware forces a full reload after setup completes, which would hide the effect described in R2.
- claude-verify: I did not check whether the WebSocket provider reconnects on route change.

TOTAL: 2 findings
