# Triage: r8

## Trajectory

This run:
- claude-read: Three code-changing rounds since r6. r6→r7 (2b58368) only moved code: it carried the Ruler's state and effects into hooks and added nothing. The r7 fix (52d0c43 → e36738a) added new state, a `browseSource` ref, threaded through every setBrowsePoint call and through dragStart, plus two new guards on the WS effect (expandedRef, policy). The play-start fix (eb7e5b0 → e5f0863) then added a third case, paused→playing, to the jump detector, which is a new prediction branch. Both rounds patch the same thing, the rules for when a browse point dies. One splits clearing by source and the other refines what counts as a jump. Neither round removed a branch or a state. The split by source is still incomplete: handleJump ignores browseSource (R8-1). So yes: the browse-point lifetime design is being patched one trigger at a time rather than stated once, as one rule per source.

Earlier runs:
- r7 / claude-read: One code-changing round since r6 (2b58368, the submodule bump to 03f079af). The other two commits (8225838, a8c2ed2) are review records only. The round moves the Ruler's width state, ResizeObserver layout effect and native keydown listener out of the Presenter into two Container hooks (hooks/useRulerWidth.ts, hooks/useRulerKeys.ts), and passes rulerRef and rulerWidth down as props. It adds no new branch, state or prediction. The `disabled` gate inside the Ruler effect becomes the equivalent `enabled = view === \"expanded\"` argument, and the mount-only measurement becomes `active = view !== \"collapsed\"`. The `onKeyDown` prop is removed. This is a relocation that removes state from the Presenter, not a patch that adds to the design.

C findings so far: 2

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R8-1 is bucket A or BLOCKER

## Needs a human

### unspecified_behavior

Note: Paused→playing allowance: a seek and play issued together from a paused state, for example by another panel, that lands up to about elapsed×rate + 2 s ahead (about 3 s at rate 1, more after a throttled background-tab interval) is not treated as a jump. A touch or keyboard browse point then survives a real seek. §9 does not say how to judge the transition sample.; Changing the source: once a keyboard browse point exists, a mouse hover over the ruler turns it into a mouse browse point. A later focus-leave then keeps it, and only pointer-leave clears it. The reverse also holds. The spec gives no rule for a point re-set by a different input.; If the YouTube controller throws during tick, mediaClock skips notifying (mediaClock.ts:119-125), so previous.at in usePlaybackClock grows stale. The next paused→playing sample then gets a larger forward allowance.
- claude-read: Paused→playing allowance: a seek and play issued together from a paused state, for example by another panel, that lands up to about elapsed×rate + 2 s ahead (about 3 s at rate 1, more after a throttled background-tab interval) is not treated as a jump. A touch or keyboard browse point then survives a real seek. §9 does not say how to judge the transition sample.
- claude-read: Changing the source: once a keyboard browse point exists, a mouse hover over the ruler turns it into a mouse browse point. A later focus-leave then keeps it, and only pointer-leave clears it. The reverse also holds. The spec gives no rule for a point re-set by a different input.
- claude-read: If the YouTube controller throws during tick, mediaClock skips notifying (mediaClock.ts:119-125), so previous.at in usePlaybackClock grows stale. The next paused→playing sample then gets a larger forward allowance.

## Findings

A: 1
B: 0
C: 0

### claude-read:R8-1 — bucket A, LOW, open

Claim: A playback jump clears the browse point whatever set it, so a mouse browse point is dropped while the pointer is still inside the section.
Impact: With a mouse, the user hovers the ruler, then moves onto the grid to click a tile they browsed to. If the playback position jumps in the meantime (a keyboard seek shortcut, a loop back to 0, a YouTube ad ending, or a seek from another panel), the grid and the scene card snap back to the playback position. The pointer is still in the section, and moving over the grid does not set the point again, because only pointermove on the ruler does. The tile the user was aiming at may no longer be on screen.
Evidence: ScenesSectionContainer.tsx:112-113: handleJump runs `if (browseRef.current !== null) setBrowsePoint(null);` and never checks browseSource. The r7 fix added browseSource to make pointer-leave (line 403) and blur (line 412) depend on the source, but the jump path was left as it was. Spec §1 step 5 and I2 say: 'A mouse browse point stays while the pointer is inside the section and is cleared when it leaves.' The jump trigger appears only in the touch list (I3, step 8) and the keyboard list (step 9). The latest fix commit (e5f0863) changed every clock-jump case in ScenesSectionSeek.test.tsx from a mouse browse point to a touch tap. No test now checks what a jump does to a mouse browse point. Before that change, the suite asserted that a jump clears a mouse browse point, which is the opposite of I2.
Repro: not_reproduced (read only). Steps: native video playing with a mediaController. Move the mouse over the ruler at 60 s (source 'mouse'), then onto a grid tile. Change the controller's currentTime by more than 2 s beyond the steady advance in one tick. handleJump calls setBrowsePoint(null), and aria-valuenow returns to the playback time while the pointer is still inside the section. Mutation check: adding `if (browseSource.current === "mouse") return;` to handleJump fails no test.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> In handleJump, return without clearing when browseSource.current === "mouse". Add a jump case with a mouse browse point that expects the point to be kept.

</details>

## Not verified

- claude-read: I ran nothing (vitest, Playwright). The pass and fail claims about the mutations come from reading the code.
- claude-read: I did not check that submodule commit e5f0863 contains exactly the files and lines shown in the diff, beyond grepping the working tree.
- claude-read: I did not re-check the parts of the change that the fix rounds did not touch (I1, I5, I7, I8, I10, I11, the docs and the e2e fixtures).
- claude-read: I did not check how Chromium's background-tab timer throttling interacts with the paused→playing allowance.
- claude-verify: I could not run the test suite or reproduce the behaviour at runtime (read-only tools).
- claude-verify: I did not read usePlaybackClock's jump-detection implementation in detail.
- claude-verify: I did not review the git history of commit e5f0863 to confirm what the earlier tests asserted for mouse browse points.

TOTAL: 1 findings
