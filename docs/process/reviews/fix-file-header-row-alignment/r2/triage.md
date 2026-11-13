# Triage: r2

## Trajectory

This run:
- claude-read: There was one fix round after r1, in commit e44f989c1; 5221d9d1a only records the review. That round added no new branch, state or prediction to production code. It changed one constant set, the spacer's -mt-1 and mb-3, so the existing spacer lines up with the buttons' new 8px top. It also tightened one assertion. The only new conditional is in a test: an `if (sidebar === "open")` block that checks the spacer's geometry. No earlier round added the same kind of thing, so this does not look like patching the design. The spec's prose was left unchanged by the human's decision and was not edited.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 1
C: 0

### claude-read:R2-spec-D2-still-stale — bucket B, LOW, open

Claim: docs/specs/file-detail-single-header.md still describes the trail's left term as the content box's left edge (D2) and still says screens other than file pages see no change (§7), but the code now insets the trail by at least 16px and moves the fixed buttons on every screen.
Impact: No user can hit this. A later reader who checks I2 against the spec could treat Header.tsx's `Math.max(16, …)` terms as a bug and revert them, which would bring back the home crumb sitting flush against the sidebar's or tree's border. The human decision says behavior.md supersedes D2 and §7, but that is recorded only in decisions.md:3, not in the spec.
Evidence: docs/specs/file-detail-single-header.md:48 ('or the left edge of the box'), :185 ('than file pages see no change'); frontend/src/components/Header.tsx:89 and :95 use Math.max(16, …); docs/process/reviews/fix-file-header-row-alignment/decisions.md:3 records 'the spec's D2 and §7 are superseded by behavior.md for this fix'.
Repro: not_reproduced. Found by reading the spec next to Header.tsx.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the 'left edge of the box' wording in D2 and the 'see no change' sentence in §7, or replace them with a pointer to behavior.md's revised D2.

</details>

## Not verified

- claude-read: I did not run any unit or e2e test.
- claude-read: I did not confirm that the overlay or mobile sidebar renders the same nav with the same p-3 padding.
- claude-read: I did not check a non-zero safe-area-inset-top.
- claude-read: I did not open behavior.md to confirm it states the revised D2 completely.
- claude-verify: Did not run git diff, so I did not confirm that the spec file is unchanged between origin/develop and the commit; I read it in the worktree at HEAD.
- claude-verify: Did not run any tests or check the screenshots.
- claude-verify: Did not check whether other docs (for example a spec index or changelog) already describe the revised D2.

TOTAL: 1 findings
