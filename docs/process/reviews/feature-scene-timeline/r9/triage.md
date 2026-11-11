# Triage: r9

## Trajectory

This run:
- claude-read: The fix round since r8 (aae6904, intelligence 21db863) removes branches rather than adding them. Before it, the browse-point lifetime was spread across three places: an inline pointerType+source check in handleSectionPointerLeave, a `!== \"keyboard\"` early return in handleSectionBlur, and an unconditional clear in handleJump. Separate browseRef/browseSource/setBrowse(null) resets also sat in the file-change effect, expand() and collapse(). The round replaces all of these with one declarative table (browseLifetime.ts: CLEARED_BY by source) and a single clearBrowseOn(event) entry point. It removes the pointerType parameter from onSectionPointerLeave and drops the redundant clear in expand(). It adds no new state, because browseSource already existed in r7→r8, and no new prediction. r8 noted that the lifetime was being patched one trigger at a time, and this round states it once, as one rule per source. The leave detection itself was not revisited, so the jump that used to mask it is gone and the gap in R9-1 is exposed. The earlier rounds did add things: the r7 fix added browseSource and the WS guards, and the r8 play-start fix added the paused→playing jump branch. This round consolidates those additions.

Earlier runs:
- r7 / claude-read: One code-changing round since r6 (2b58368, the submodule bump to 03f079af). The other two commits (8225838, a8c2ed2) are review records only. The round moves the Ruler's width state, ResizeObserver layout effect and native keydown listener out of the Presenter into two Container hooks (hooks/useRulerWidth.ts, hooks/useRulerKeys.ts), and passes rulerRef and rulerWidth down as props. It adds no new branch, state or prediction. The `disabled` gate inside the Ruler effect becomes the equivalent `enabled = view === \"expanded\"` argument, and the mount-only measurement becomes `active = view !== \"collapsed\"`. The `onKeyDown` prop is removed. This is a relocation that removes state from the Presenter, not a patch that adds to the design.
- r8 / claude-read: Three code-changing rounds since r6. r6→r7 (2b58368) only moved code: it carried the Ruler's state and effects into hooks and added nothing. The r7 fix (52d0c43 → e36738a) added new state, a `browseSource` ref, threaded through every setBrowsePoint call and through dragStart, plus two new guards on the WS effect (expandedRef, policy). The play-start fix (eb7e5b0 → e5f0863) then added a third case, paused→playing, to the jump detector, which is a new prediction branch. Both rounds patch the same thing, the rules for when a browse point dies. One splits clearing by source and the other refines what counts as a jump. Neither round removed a branch or a state. The split by source is still incomplete: handleJump ignores browseSource (R8-1). So yes: the browse-point lifetime design is being patched one trigger at a time rather than stated once, as one rule per source.

C findings so far: 2

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R9-1 is bucket A or BLOCKER

## Needs a human

### unspecified_behavior

Note: A touch or mouse browse point is cleared by Enter on the focused ruler, because activate() maps every seek to the 'seek' event. I3's touch list names only tapping a tile or the card. The spec does not say what Enter does to a point that touch set.; When the source changes, the point takes the new source's lifetime. For example, a mouse hover over the ruler after arrow keys turns a keyboard point into a mouse point that survives focus leaving. The spec gives no rule for this; r8 noted it and it is still open.
- claude-read: A touch or mouse browse point is cleared by Enter on the focused ruler, because activate() maps every seek to the 'seek' event. I3's touch list names only tapping a tile or the card. The spec does not say what Enter does to a point that touch set.
- claude-read: When the source changes, the point takes the new source's lifetime. For example, a mouse hover over the ruler after arrow keys turns a keyboard point into a mouse point that survives focus leaving. The spec gives no rule for this; r8 noted it and it is still open.

## Findings

A: 1
B: 0
C: 0

### claude-read:R9-1 — bucket A, LOW, open

Claim: A mouse browse point is not cleared when the pointer leaves the section straight out of the document, for example off the window edge or directly into the YouTube player iframe. Since the r8 fix, nothing else clears it either.
Impact: With a mouse, the user hovers the ruler and then moves off the browser window, perhaps to another monitor, or moves quickly into the embedded player iframe. The grid and the scene card stay frozen on the browsed point and stop following playback, even though the pointer has left the section. Before aae6904 the next playback jump cleared it as a side effect. Now that `mouse` no longer lists `jump`, only a seek, a collapse, a file change, or re-entering and leaving through an in-document element clears it.
Evidence: ScenesSectionPresenter.tsx:164-174 has two clear paths. The first is onPointerLeave, which clears only when `event.target === event.currentTarget`. React's synthetic leave event is targeted at the node the pointer left from, so this holds only when the pointer leaves from the root's own box and not from the ruler or a tile. The second is onPointerOut, which clears only when `relatedTarget` is non-null and outside the section. When the pointer leaves the window or enters a cross-document iframe, relatedTarget is null. browseLifetime.ts:18 now has `mouse: ["pointerleave", "seek", "collapse", "filechange"]` with no jump. The only test of the leave path (ScenesSectionTimeline.test.tsx:281) fires pointerOut with `relatedTarget: document.body`. No test covers a null relatedTarget leaving from a child.
Repro: not_reproduced (read only). Steps: native video playing in the inspector. Move the mouse over the ruler, which sets a mouse browse point, then move it off the window's edge directly from the ruler. pointerout reaches the root with relatedTarget null, and the synthetic pointerleave has target = ruler, not the root. Neither handler calls onSectionPointerLeave. aria-valuenow stays at the browse time while playback advances, and jumps no longer clear it. Mutation: removing the `next &&` guard in onPointerOut fails no test.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> In onPointerOut, treat a null relatedTarget as leaving the section. Or, in onPointerLeave, drop the `target === currentTarget` check, because React dispatches leave on the root only when the pointer has left the root's subtree. Add a test that fires pointerOut from the ruler with relatedTarget null and expects the mouse browse point to be cleared.

</details>

## Not verified

- claude-read: I ran no tests (vitest, Playwright). The mutation results come from reading the code.
- claude-read: I did not check how the inspector is laid out, so I do not know whether the Scenes ruler actually touches the window's edge on desktop. That decides how often the window-leave path in R9-1 happens.
- claude-read: I did not confirm in the React source which version is in use, or whether that version targets synthetic pointerleave at the 'from' node.
- claude-read: I did not re-check the invariants the fix round did not touch (I1, I5–I11) beyond what r6–r8 already recorded.
- claude-verify: I did not run the tests or a browser, so the React leave-event targeting comes from my knowledge of React's EnterLeaveEventPlugin and was not observed.
- claude-verify: I did not check how each browser sets relatedTarget when the pointer moves into a cross-origin iframe.
- claude-verify: I did not check the React version pinned in this repository.

TOTAL: 1 findings
