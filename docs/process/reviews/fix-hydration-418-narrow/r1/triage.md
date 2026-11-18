# Triage: r1

## Trajectory

This run:
- claude-read: The diff reaches the two hook files and the new test. None is in a touch-point list, because no invariants file exists. Through the hooks' changed first-commit semantics it also reaches about 11 consumer components, none of them named.

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
- frontend/src/hooks/useFocusMode.ts — full: Read the whole file (lines 1-98).
- frontend/src/hooks/useIsMobile.ts — full: Read the whole file (lines 1-23).

Test files:
- frontend/src/hooks/__tests__/viewportHydration.test.tsx — full: Read the whole file (lines 1-49).

## Needs a human

### unspecified_behavior

Note: On a server-rendered page, the first committed frame reports isMobile=false and useIsWideViewport=false together, which is inconsistent: 'desktop' yet 'narrow'. Consumer layout effects run once with this pair.; On a client-side navigation (a non-hydrating mount), useSyncExternalStore uses getSnapshot right away, so the first render has the real width. This matches the old useState initializer.; useFocusLayout is always false in the server render and the hydration commit, so focus mode never appears in the first paint even when stored state and width allow it.
- claude-read: On a server-rendered page, the first committed frame reports isMobile=false and useIsWideViewport=false together, which is inconsistent: 'desktop' yet 'narrow'. Consumer layout effects run once with this pair.
- claude-read: On a client-side navigation (a non-hydrating mount), useSyncExternalStore uses getSnapshot right away, so the first render has the real width. This matches the old useState initializer.
- claude-read: useFocusLayout is always false in the server render and the hydration commit, so focus mode never appears in the first paint even when stored state and width allow it.
- claude-verify: During the hydration commit, every consumer receives isMobile=false and wide=false at the same time; the code does not specify whether layout effects in the consumers (ShellLayout useLayoutEffect, useInspectorFit, MarkdownDocumentLayout split→preview effect) behave correctly in that state.

### unspecified_behavior

Note: During the hydration commit, every consumer receives isMobile=false and wide=false at the same time; the code does not specify whether layout effects in the consumers (ShellLayout useLayoutEffect, useInspectorFit, MarkdownDocumentLayout split→preview effect) behave correctly in that state.
- claude-read: On a server-rendered page, the first committed frame reports isMobile=false and useIsWideViewport=false together, which is inconsistent: 'desktop' yet 'narrow'. Consumer layout effects run once with this pair.
- claude-read: On a client-side navigation (a non-hydrating mount), useSyncExternalStore uses getSnapshot right away, so the first render has the real width. This matches the old useState initializer.
- claude-read: useFocusLayout is always false in the server render and the hydration commit, so focus mode never appears in the first paint even when stored state and width allow it.
- claude-verify: During the hydration commit, every consumer receives isMobile=false and wide=false at the same time; the code does not specify whether layout effects in the consumers (ShellLayout useLayoutEffect, useInspectorFit, MarkdownDocumentLayout split→preview effect) behave correctly in that state.

## Findings

A: 0
B: 2
C: 0

### claude-read:R1-SCOPE-2 — bucket B, LOW, open

Claim: The change alters what every consumer of useIsMobile, useIsWideViewport and useFocusLayout sees in the first commit of a server-rendered page. That commit now reports isMobile=false and wide=false together, a 'desktop but narrow' state that the old hooks never reported after hydration. Layout effects and ref callbacks in the consumers run once with these values before the forced re-render.
Impact: About 11 consumers are reached without being named in the diff. FileDetailShell's useLayoutEffect(evaluateYield) and the attach/measureFirst ref callback in useInspectorFit run once with isMobile=false at phone widths. Effects in MarkdownDocumentLayout, ShellLayout and useFindInFile likewise see the desktop value first. I found no persisted wrong result. The yield in FileDetailShell needs leftPane.shownBySetting, which TwoPaneLayout ties to besideViewport. useInspectorFit re-runs `run('publish')` once isMobile changes. In normal use this is a transient re-layout that the hook's docstring already describes.
Evidence: useIsMobile.ts:21 and useFocusMode.ts:70 use useSyncExternalStore with server snapshots that return false. During hydration React renders with the server snapshot and corrects it in a later synchronous render. The old code read window in its useState initializer, so a client re-render after a mismatch saw the real width in its first commit. Consumers: FileDetailShell.tsx:123, 187, 198-204 and 219-221; useInspectorFit.ts:97-131 and 152-165; ShellLayout.tsx:399-411; MarkdownDocumentLayout.tsx:100; useFindInFile.ts:80-81; AppShell.tsx:121; TwoPaneLayout.tsx:111; TreeToggle.tsx:26; Header.tsx:68; ChromeButtons.tsx:56; InboxView.tsx:49; FileDetailChrome.tsx:54; FileDetailSkeleton.tsx:63. None of these is in the diff or in a touch-point list.
Repro: not_reproduced. This comes from reading the code and React's useSyncExternalStore hydration semantics. I did not run it. The author's decisions.md records a Playwright run at 390, 700 and 1440 with no page error, but that run does not observe what consumer effects do in the first commit.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the consumers above as touch points. Optionally add a hydration test that mounts FileDetailShell at 390px and asserts that treeYieldStore and inspectorFormStore hold no desktop-derived values after hydration settles.

</details>

### claude-read:R1-SCOPE-1 — bucket B, INFO, open

Claim: The diff reaches three paths that are not in any touch-point list, because this change has no spec and no invariants file: frontend/src/hooks/useIsMobile.ts, frontend/src/hooks/useFocusMode.ts and frontend/src/hooks/__tests__/viewportHydration.test.tsx.
Impact: No user-facing effect by itself. No planned scope exists that the reach of the change could be checked against, so the consumer-facing change in R1-SCOPE-2 has no list that could have caught it.
Evidence: docs/process/reviews/fix-hydration-418-narrow/ holds only decisions.md and r1/; it has no invariants.md. The brief says no invariants file exists. The diff changes useIsMobile.ts:3-22, useFocusMode.ts:6 and :65-71, and adds the test file.
Repro: not_reproduced. I compared the file listing with the absence of an invariants file; no touch-point list exists to compare against.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Have a person accept the change without a spec in decisions.md, or add an invariants.md that lists the two hooks, and their consumers, as touch points.

</details>

## Not verified

- claude-read: I did not run the test file or any mutant; the mutant outcomes are reasoned from the code.
- claude-read: I did not confirm whether React flushes the useSyncExternalStore consistency re-render before or after the rAF that useInspectorFit schedules in measureFirst.
- claude-read: I did not read TwoPaneLayout's besideViewport derivation to confirm that leftPane.shownBySetting is false at phone widths during hydration.
- claude-read: I did not read every consumer's full effects; I grepped isMobile uses and read FileDetailShell.tsx:115-314 and useInspectorFit.ts in full.
- claude-read: I did not check whether any other test fires resize after mount for useIsWideViewport.
- claude-verify: Did not run tests or the app; could not observe the transient commit or any visible flicker or mis-layout from it.
- claude-verify: Old code was read from the main checkout, not from the origin/develop object directly; I assumed it matches the base.
- claude-verify: Did not inspect each consumer's layout effect for actual misbehaviour under false/false.

TOTAL: 2 findings
