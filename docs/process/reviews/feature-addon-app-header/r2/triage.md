# Triage: r2

## Trajectory

This run:
- claude-read: Yes, the design is being patched. The fix rounds since r1 keep re-tuning flex sizing on the same phone scope line, and each round adds a fixture case and a numeric prediction. The previous state had the Target start at a 40% basis that grows up to max-content (`basis-[40%] grow shrink-0 max-w-max`). 56d3b8f5 added a 'summer' folder fixture and a test that predicts a 0.4–0.65 width ratio. dcb4fc8f removed the 40% starting share, which is one predicate fewer, but it added a basis-0, grow, min-w-min rule on the scope and two new hard-coded floors: the drive's `w-14` (56px) and the quiet value's `min-w-[2.5em]`. The review shots (icon squashed, ja name cut, scope-row blank space) and the matching tests (14px svg widths, a gap of 16px or less, a whole Japanese name) show the same pattern in earlier rounds: each fixed one measured symptom with one more width constraint. The newest round replaced a heuristic and did not only stack on it, but the line's behaviour still depends on constants that no test pins.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 3
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: The quiet control's value floor `min-w-[2.5em]` is narrower than three characters plus the ellipsis, so the Target's name can shrink below the minimum that the phone layout describes.
Impact: When the scope line is at its floor (a phone narrower than 375px, or a very long count), the Target shows about two Latin characters, or one to two Japanese characters, before the ellipsis. At 375px with the fixture counts the floor is never reached, so no declared invariant fails. The floor also applies to the shelf pages' quiet sort menu.
Evidence: frontend/src/components/ToolbarMenu.tsx:225 `<span className="min-w-[2.5em] truncate">`. At text-sm, 2.5em is 35px. Truncation draws the ellipsis inside that 35px, so 'Eve…' (~38px) does not fit, and a CJK name gets about 1.5 glyphs. The only test of three characters (`targetNameFirstThree.whole` in app-header.spec.ts) runs where the Target has ~120px or more, far from its floor.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Size the floor from three characters plus the ellipsis (e.g. `min-w-[4em]` for CJK), and add a test at a width that forces the Target to its floor.

</details>

### claude-read:R2 — bucket B, LOW, rejected

Claim: No test pins the drive name's phone floor (`max-sm:w-14` in AppHeader), so if that floor is removed or changed, the drive-first cut order can change without any test failing.
Impact: With a long drive name and a long folder name, how far the drive is cut before the Target is cut depends only on `w-14`. A regression that lets the drive collapse to its longest word, or lets it keep its whole width, would still pass every drive/Target test, because those tests assert `drive.whole === false` (long drive) or `true` (short drive 'fixture') and never measure the drive's cut width.
Evidence: frontend/src/components/appshell/AppHeader.tsx: drive span `min-w-0 truncate max-sm:w-14 max-sm:max-w-max max-sm:grow`. In app-header.spec.ts, the 'long drive name and long folder name' scenarios assert only `targetName.whole` false, the svg widths and the count-to-Target gap. The 'fits beside the count' case asserts `drive.whole` false and the Target whole.
Repro: Mutation (in my head, not run): delete `max-sm:w-14`. The scope's min-content becomes the drive's longest word plus the count. Each assertion in the long-drive scenarios still holds.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In the long-drive and long-folder case at 375px, assert that the drive span's clientWidth is about 56px and that the Target's name is cut.

</details>

### claude-read:R3 — bucket B, INFO, open

Claim: The new 'fits beside the count' test asserts a font-dependent ratio window (0.4 < maxContent/line ≤ 0.65) that describes the fixture, not the behaviour.
Impact: A change of font, locale string or padding can push 'Holiday 25' outside the window. The test would then fail with no layout defect, or have to be retuned, and that hides whether the drive-before-Target order still holds.
Evidence: frontend/e2e-components/app-header.spec.ts, test 'with a long drive name and a folder name that fits beside the count': `expect(fit.maxContent / fit.line).toBeGreaterThan(0.4); ...toBeLessThanOrEqual(0.65)`. The commit message of 56d3b8f5 says the Linux CI fonts already changed results once.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run any unit or e2e test, and I did not render the layout. The flex outcomes come from reasoning about the CSS flex algorithm.
- claude-read: I did not check how Chrome computes the min-content contribution of the drive span when it has a definite width inside the inner flex span.
- claude-read: I did not check the r2 screenshots or design artboards against the current code.
- claude-read: I did not re-read the backend contract test or appTarget/appPrefs beyond the diff, because the fixes since r1 do not touch them.
- claude-verify: I did not run Playwright or any test; the CSS layout conclusions come from reading intrinsic-sizing rules.
- claude-verify: The actual font metrics of the fixture fonts (ellipsis width, glyph widths) were not measured.
- claude-verify: The commit 56d3b8f5 message about Linux CI fonts was not read.
- claude-verify: The invariants other than I10's phone layout were not examined.

TOTAL: 3 findings
