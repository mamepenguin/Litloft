# Triage: r2

## Trajectory

This run:
- claude-read: There has been one fix round since r1, commit 89b738ec6. It adds a test file only. It adds no production branch, state or prediction, and it removes none, so it does not repeat anything an earlier round added. Nothing here suggests the design is being patched. The round strengthens the I13 checks against the real UploadProgress. It leaves r1 F4 (disarm before lockApi) and the touch-point omissions untouched.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 2
C: 0

### claude-read:F1 — bucket B, MEDIUM, open

Claim: The new placement test sets the bottomChrome store through its setters, so no test checks that MiniPlayerContainer and MobileInspectorSheet actually publish their state to it, or that their unmount cleanups reset it.
Impact: Suppose a later edit removes or breaks `setInspectorSheetState(state)` or its `() => setInspectorSheetState("none")` cleanup. Every test still passes, and the drawer can end up on top of the peek bar. In the cleanup case, it can stay hidden on every page after the viewer leaves a mobile file page with the sheet at half. A wiring regression in MiniPlayerContainer would likewise put the drawer over the mini-player with nothing failing (I13).
Evidence: The only references to `setMiniPlayerShown`, `setInspectorSheetState` and `bottomChrome` are in bottomChrome.ts, UploadProgress.tsx, MiniPlayerContainer.tsx:44-48, MobileInspectorSheet.tsx:114-118 and uploadDrawerPlacement.test.tsx. That test calls the setters directly in `arrange()` (lines 43-48) and never renders MiniPlayerContainer, MobileInspectorSheet or FileDetailShell.
Repro: Mutation (by reading, not run): delete the `useEffect(() => { setInspectorSheetState(state); }, [state])` at MobileInspectorSheet.tsx:114-116, or the unmount cleanup at line 118. No vitest test and no e2e-layout fixture renders the sheet next to the drawer, so the mutant survives. The same applies to MiniPlayerContainer.tsx:44-48.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a vitest case that renders MobileInspectorSheet at peek, half and full, then unmounts it, and checks `getBottomChrome().sheet` each time. Add a matching case for MiniPlayerContainer with `useMiniPlayer` mocked to return `isMini` true and then false.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: The placement test's offset assertions only check that the string contains a substring. As a result, dropping `env(safe-area-inset-bottom)` from either offset survives. The constant-sync check matches `+ 16px)` anywhere in MiniPlayerContainer.tsx, not in the mini-player's bottom style.
Impact: On a device with a bottom safe-area inset (iPhone PWA or iOS app), the peek bar is `56px + env(safe-area-inset-bottom)` tall (MobileInspectorSheet.tsx:57, 211). A regression that removes the env term from `PEEK_OFFSET` would overlap the drawer with the bar by the inset height, and no test would fail (I13). The e2e fixture ignores the safe area too.
Evidence: uploadDrawerPlacement.test.tsx:52-69 checks `expect(bottom).toContain("196px")`, `toContain("56px")` and `"max("`. bottomChrome.ts builds `PEEK_OFFSET = calc(56px + env(safe-area-inset-bottom, 0px))` and `calc(env(...) + 196px)`. Line 81 is `expect(source).toMatch(/\+ 16px\)/)` against the whole file text.
Repro: Mutation (by reading, not run): change `PEEK_OFFSET` to `${SHEET_PEEK_PX}px`. The 'inspector bar' case still contains `56px`, and 'both' still contains `max(`, so the mutant survives.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Assert the exact offset strings, and compare `PEEK_OFFSET` with `SHEET_PEEK_HEIGHT` exported from MobileInspectorSheet. For the gap, match the mini-player's `bottom:` style expression itself.

</details>

## Not verified

- claude-read: I did not run the new test. I did not check whether jsdom 25's CSSStyleDeclaration accepts `calc(env(...))` or `max(calc(...), calc(...))` as a `bottom` value. If it rejects them, `style.bottom` would be empty and the mini-player and 'both' cases would fail rather than pass.
- claude-read: I did not read the .claude/rules convention files in full.
- claude-read: I did not check that `useMiniPlayer`'s `isMini` matches what is visible on screen.
- claude-read: I executed no mutants. Every survived or killed outcome is a prediction from reading the tests.
- claude-verify: I did not run the test suite. I could not confirm that jsdom keeps env() values in style.bottom.
- claude-verify: I did not inspect the R-5 real-browser measurement (Playwright or other e2e) for whether it exercises the producers end to end.
- claude-verify: I did not check where MobileInspectorSheet is mounted at desktop widths.

TOTAL: 2 findings
