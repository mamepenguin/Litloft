# Triage: r10

## Trajectory

This run:
- claude-read: The round since r9 (ef0732a, intelligence 21db863→03359fc) removes branches and adds none. The section root had two leave handlers: onPointerLeave guarded by `target === currentTarget`, and onPointerOut guarded by a non-null `relatedTarget` outside the root. The round replaces both with one unconditional `onPointerLeave={onSectionPointerLeave}` and relies on React's own enter/leave computation. It adds no state and no prediction, and the by-source lifetime table from the r8→r9 consolidation is unchanged. Over the whole run: r7 moved code without adding anything. The r7 fix added state (browseSource) and guards (the WS expandedRef and policy checks). The r8 fix added a prediction branch (paused→playing in the jump detector) and patched the same browse-point lifetime again. The r9 round folded the per-trigger lifetime checks into one table. This round removes the hand-written leave detection that the r9 round exposed. The last two rounds have simplified rather than patched, so the design is no longer being patched.

Earlier runs:
- r7 / claude-read: One code-changing round since r6 (2b58368, the submodule bump to 03f079af). The other two commits (8225838, a8c2ed2) are review records only. The round moves the Ruler's width state, ResizeObserver layout effect and native keydown listener out of the Presenter into two Container hooks (hooks/useRulerWidth.ts, hooks/useRulerKeys.ts), and passes rulerRef and rulerWidth down as props. It adds no new branch, state or prediction. The `disabled` gate inside the Ruler effect becomes the equivalent `enabled = view === \"expanded\"` argument, and the mount-only measurement becomes `active = view !== \"collapsed\"`. The `onKeyDown` prop is removed. This is a relocation that removes state from the Presenter, not a patch that adds to the design.
- r8 / claude-read: Three code-changing rounds since r6. r6→r7 (2b58368) only moved code: it carried the Ruler's state and effects into hooks and added nothing. The r7 fix (52d0c43 → e36738a) added new state, a `browseSource` ref, threaded through every setBrowsePoint call and through dragStart, plus two new guards on the WS effect (expandedRef, policy). The play-start fix (eb7e5b0 → e5f0863) then added a third case, paused→playing, to the jump detector, which is a new prediction branch. Both rounds patch the same thing, the rules for when a browse point dies. One splits clearing by source and the other refines what counts as a jump. Neither round removed a branch or a state. The split by source is still incomplete: handleJump ignores browseSource (R8-1). So yes: the browse-point lifetime design is being patched one trigger at a time rather than stated once, as one rule per source.
- r9 / claude-read: The fix round since r8 (aae6904, intelligence 21db863) removes branches rather than adding them. Before it, the browse-point lifetime was spread across three places: an inline pointerType+source check in handleSectionPointerLeave, a `!== \"keyboard\"` early return in handleSectionBlur, and an unconditional clear in handleJump. Separate browseRef/browseSource/setBrowse(null) resets also sat in the file-change effect, expand() and collapse(). The round replaces all of these with one declarative table (browseLifetime.ts: CLEARED_BY by source) and a single clearBrowseOn(event) entry point. It removes the pointerType parameter from onSectionPointerLeave and drops the redundant clear in expand(). It adds no new state, because browseSource already existed in r7→r8, and no new prediction. r8 noted that the lifetime was being patched one trigger at a time, and this round states it once, as one rule per source. The leave detection itself was not revisited, so the jump that used to mask it is gone and the gap in R9-1 is exposed. The earlier rounds did add things: the r7 fix added browseSource and the WS guards, and the r8 play-start fix added the paused→playing jump branch. This round consolidates those additions.

C findings so far: 2

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: I ran no vitest or Playwright tests. The mutation conclusions come from reading the code and from my knowledge of React's EnterLeaveEventPlugin and RTL's fireEvent aliasing.
- claude-read: I did not check in a real browser how pointerout relatedTarget behaves when the pointer enters the cross-origin YouTube iframe.
- claude-read: I did not re-check the invariants this round did not touch (I1, I3–I11) beyond what r6–r9 recorded.
- claude-read: I did not confirm that submodule commit 03359fc contains only the shown Presenter and test changes compared with 21db863, beyond grepping the working tree.
- claude-verify: ScenesSectionPresenter.tsx rendering: tick placement, the 0.05 s dot rule, height stability, 24rem width and no-scroll CSS (I5, I9 dot rule, I11 drawn-label overlap at real widths)
- claude-verify: useWindowPictures 150 ms settle (I8), useRulerKeys listener attachment, usePlaybackClock jump detection
- claude-verify: Core e2e and layout tests, the manifest.json scenes entry, and the docs changes
- claude-verify: No tests were run; this verifier can only read files

TOTAL: 0 findings
