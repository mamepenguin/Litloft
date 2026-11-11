# Triage: r7

## Trajectory

This run:
- claude-read: One code-changing round since r6 (2b58368, the submodule bump to 03f079af). The other two commits (8225838, a8c2ed2) are review records only. The round moves the Ruler's width state, ResizeObserver layout effect and native keydown listener out of the Presenter into two Container hooks (hooks/useRulerWidth.ts, hooks/useRulerKeys.ts), and passes rulerRef and rulerWidth down as props. It adds no new branch, state or prediction. The `disabled` gate inside the Ruler effect becomes the equivalent `enabled = view === \"expanded\"` argument, and the mount-only measurement becomes `active = view !== \"collapsed\"`. The `onKeyDown` prop is removed. This is a relocation that removes state from the Presenter, not a patch that adds to the design.

Earlier runs:
- none

C findings so far: 2

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-verify:V2 is bucket A or BLOCKER

## Needs a human

### open_c (claude-verify:V1)

Question: The section-level blur handler clears the browse point for every pointer type. I3 says a touch or pen browse point stays until a tile or card is tapped, the playback jumps, the section collapses or the file changes. The spec lists "focus leaves the section" only under Keyboard (§1 step 9).
Impact: A finger tap on the ruler focuses it, because it has tabIndex=0. Any later tap outside the section moves focus to the body or another element, and that silently drops the touch browse point. Tapping the player is one example. I3 lists no such trigger.
Evidence: ScenesSectionContainer.tsx:382-389: handleSectionBlur calls setBrowsePoint(null) whenever relatedTarget is outside the section, with no pointer-type check. Presenter.tsx:175 wires onBlur on the section root. Presenter.tsx:431 sets tabIndex=0 on the ruler, so a tap focuses it. docs/specs/scene-timeline.md:116-120 gives an exhaustive clearing list for touch, without blur. Line 138 puts the blur rule under Keyboard. No test covers blur (grep for blur/focusout in __tests__ finds nothing).
Note: The section-level blur handler clears the browse point for every pointer type. I3 says a touch or pen browse point stays until a tile or card is tapped, the playback jumps, the section collapses or the file changes. The spec lists "focus leaves the section" only under Keyboard (§1 step 9).

### unspecified_behavior

Note: A mouse browse point is not cleared when the pointer leaves the browser window directly from a child of the section. onPointerOut needs a non-null relatedTarget, and onPointerLeave needs target === currentTarget (Presenter.tsx:164-174). This matters only when the section touches the window edge.; The WS effect does not check policy.enabled. A visual_video event for the current file, while expanded with the policy off or still loading, would fetch visual-index and draw Visual Index parts, against I9's policy-off clause. Unlikely in normal use, because a policy-off drive should emit no such events.; After re-expanding, a stale global lastEvent for the same file triggers a second visual-index request, which supersedes the initial one. The visible result is the same.
- claude-verify: A mouse browse point is not cleared when the pointer leaves the browser window directly from a child of the section. onPointerOut needs a non-null relatedTarget, and onPointerLeave needs target === currentTarget (Presenter.tsx:164-174). This matters only when the section touches the window edge.
- claude-verify: The WS effect does not check policy.enabled. A visual_video event for the current file, while expanded with the policy off or still loading, would fetch visual-index and draw Visual Index parts, against I9's policy-off clause. Unlikely in normal use, because a policy-off drive should emit no such events.
- claude-verify: After re-expanding, a stale global lastEvent for the same file triggers a second visual-index request, which supersedes the initial one. The visible result is the same.

## Findings

A: 1
B: 0
C: 1

### claude-verify:V2 — bucket A, LOW, open

Claim: On a fileId change while the section is expanded, the WS reload effect still sees the render-time expanded=true. It can then request visual-index for the new file before that file's first expand.
Impact: An extra GET visual-index goes out for a native video that was never expanded, against I6's "requests no ... visual-index ... before its first expand". The result is written into state while the section is collapsed. It is not drawn, because the header needs view==='expanded', and the next expand resets it. So the user sees nothing wrong. The only cost is the spurious request.
Evidence: ScenesSectionContainer.tsx:118-137: the reset effect sets expandedRef=false and calls setExpanded(false). It does not change the `expanded` value captured in the current render. Lines 224-240: the WS effect re-runs because fileId and loadVisual changed. It checks `expanded` (still true in this commit) but not expandedRef.current, unlike the initial-load effect at line 205. useWebSocket.ts:7-19 returns the global lastEvent, which persists. If that event is a video_visual event whose file_id equals the new fileId, loadVisual(true) runs at line 229 after resetVisual has already bumped the generation, so its result is applied.
Repro: Reproduced by reading the code, not by running it. Expand Scenes on file A. A WS intelligence.video_visual.progress event for file B arrives and is the latest event. Navigate to file B without collapsing. The WS effect calls getVideoVisualIndex(B) before any expand of B.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> In the WS effect at ScenesSectionContainer.tsx:225, also return when `!expandedRef.current`. Consider also skipping when `!policy.enabled`.

</details>

### claude-verify:V1 — bucket C, LOW, open

Claim: The section-level blur handler clears the browse point for every pointer type. I3 says a touch or pen browse point stays until a tile or card is tapped, the playback jumps, the section collapses or the file changes. The spec lists "focus leaves the section" only under Keyboard (§1 step 9).
Impact: A finger tap on the ruler focuses it, because it has tabIndex=0. Any later tap outside the section moves focus to the body or another element, and that silently drops the touch browse point. Tapping the player is one example. I3 lists no such trigger.
Evidence: ScenesSectionContainer.tsx:382-389: handleSectionBlur calls setBrowsePoint(null) whenever relatedTarget is outside the section, with no pointer-type check. Presenter.tsx:175 wires onBlur on the section root. Presenter.tsx:431 sets tabIndex=0 on the ruler, so a tap focuses it. docs/specs/scene-timeline.md:116-120 gives an exhaustive clearing list for touch, without blur. Line 138 puts the blur rule under Keyboard. No test covers blur (grep for blur/focusout in __tests__ finds nothing).
Repro: Reproduced by reading the code, not by running it. Touch environment: tap the ruler, which sets the browse point and focuses the ruler. Then tap a non-focusable area or the video outside the section. focusout reaches the section root with relatedTarget null or outside, and setBrowsePoint(null) runs.
Introduced: introduced
Reviewer bucket: C | Author bucket: 

## Not verified

- claude-read: I did not run vitest or Playwright, so the claim that the suites still pass after the refactor rests on reading the code.
- claude-read: I did not check that submodule commit 03f079af contains exactly the files shown in the diff, beyond grepping the working tree.
- claude-read: I did not re-review the behavioural invariants I1–I3 and I5–I10 beyond the code the fix commit touched.
- claude-read: I did not check whether React StrictMode double-invoking effects affects the listener attach and detach in the dev build.
- claude-verify: Nothing was run: no tests, no e2e, no layout checks. Every conclusion comes from reading the code.
- claude-verify: The core changes (section-rows.test, line-clamp-display.test, e2e-layout and e2e-components fixtures, docs) and the manifest and slots changes were not read.
- claude-verify: usePlaybackClock jump detection (§9) and useRulerWidth were not read.
- claude-verify: The I5 no-scroll and max-width checks across real viewports and pointers were not checked.

TOTAL: 2 findings
