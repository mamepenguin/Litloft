# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: On every AppShell screen (folder, home, settings, admin) the fixed menu and tree buttons now sit at top 8px instead of 12px. The spec's §7 says screens other than file pages see no change; behavior.md says the move applies to every screen.; The sidebar spacer (12..52) and the buttons (8..48) no longer line up while the sidebar is open.
- claude-read: On every AppShell screen (folder, home, settings, admin) the fixed menu and tree buttons now sit at top 8px instead of 12px. The spec's §7 says screens other than file pages see no change; behavior.md says the move applies to every screen.
- claude-read: The sidebar spacer (12..52) and the buttons (8..48) no longer line up while the sidebar is open.

## Findings

A: 0
B: 3
C: 0

### claude-read:R1-stale-spec-D2 — bucket B, LOW, open

Claim: The spec's D2 still says the trail starts at the content box's left edge, and invariant I2 checks against 'the edge D2 defines', but the code now adds a minimum 16px inset and a header-left-plus-16 term.
Impact: Someone checking I2 against the spec as written would see Header.tsx:89/95 (`Math.max(16, …)`) as a violation and could revert the fix, which would put the home crumb flush against the sidebar's border again (the defect behavior.md reports). The spec's §7 line saying 'screens other than file pages see no change' is also no longer true: the buttons moved 4px on every AppShell screen.
Evidence: docs/specs/file-detail-single-header.md:47-53 (D2 unchanged: 'or the left edge of the box that holds the file's content'), :184-185 (§7), :314-316 (I2 refers to D2). Header.tsx:89 `Math.max(16, paddingLeft)` and :95 `Math.max(16, wanted - frame.left)`. The revision exists only in docs/process/reviews/fix-file-header-row-alignment/behavior.md:17-27 and DESIGN.md.
Repro: not_reproduced. Found by reading the spec next to Header.tsx.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the left-edge wording in D2 and the 'no change on other screens' sentence in §7, or point both at behavior.md's revised D2.

</details>

### claude-read:R1-unlisted-sidebar-spacer — bucket B, LOW, open

Claim: Moving the fixed buttons from top 12px to top 8px reaches the sidebar's `sidebar-button-row` spacer, which reserves space for those buttons at their old position and is not in the spec's touch-point list.
Impact: Cosmetic only. When the sidebar is open (inline or as an overlay), the empty spacer that marks where the menu and tree buttons sit now covers y=12..52, but the buttons sit at y=8..48. Nothing overlaps: the first sidebar row still starts at y=60, below the buttons. The spacer simply no longer matches the buttons it reserves room for, and no test ties the two together.
Evidence: frontend/src/components/sidebar/SidebarLibrarySection.tsx:49-51: the comment says 'Where the fixed menu and tree buttons sit', and the spacer is `mb-2 h-10` inside the `<nav className="... p-3">` at frontend/src/components/Sidebar.tsx:157, so it covers y=12..52, which was the old `top: 12px` with 40px buttons. frontend/src/components/ChromeButtons.tsx:58 now uses `+ 8px`. The touch-point list (docs/specs/file-detail-single-header.md:257-305) names neither Sidebar.tsx nor SidebarLibrarySection.tsx. Only SidebarLibrarySection.test.tsx:25-26 checks the spacer, and it checks only the class names `h-10` and `shrink-0`.
Repro: not_reproduced. Derived by reading the code: nav padding 12px + h-10 gives a spacer at 12..52; ChromeButtons top 8px + h-10 buttons gives 8..48.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either give the spacer the buttons' geometry (for example, start it 4px higher), or list the sidebar spacer as a deliberately unchanged touch point.

</details>

### claude-read:R1-weak-unit-assertion — bucket B, INFO, open

Claim: MenuButton.test.tsx only checks that the `top` string contains '8px', so values like 18px, 28px or 48px would also pass.
Impact: No user can hit this through that test, because the e2e centre-line checks (file-header-row.spec.ts:65-78, file-header-row-desktop.spec.ts:243-266, 0.5px tolerance) would catch a wrong offset. The unit test on its own gives little protection.
Evidence: frontend/src/components/__tests__/MenuButton.test.tsx:98 `expect(row.style.top).toContain("8px")`.
Repro: Mutation: change ChromeButtons.tsx:58 from '+ 8px' to '+ 18px'. Expected: MenuButton.test.tsx still passes; the e2e centre-line tests fail. Not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Match a word boundary, for example `/(^|[^\d])8px/`.

</details>

## Not verified

- claude-read: I did not run any test or the app. All geometry here comes from reading the code and from the numbers recorded in decisions.md.
- claude-read: A non-zero safe-area-inset-top (notched iOS PWA).
- claude-read: Whether other routes outside AppShell render ChromeButtons. I checked only AppShell.tsx and the fixtures.
- claude-read: Whether the pseudo-fullscreen spec's underMenuButton probe follows the button's rect or a fixed point.
- claude-verify: Did not run any tests or e2e specs (file-header-row-desktop.spec.ts, file-header-row.spec.ts).
- claude-verify: Did not open SidebarLibrarySection.test.tsx to confirm what it asserts.
- claude-verify: Did not diff against origin/develop; the old top: 12px value is taken from behavior.md:12.
- claude-verify: Did not check behaviour with a non-zero safe-area-inset-top: the sidebar is fixed top-0 with no safe-area padding, while the buttons add the inset.

TOTAL: 3 findings
