# Triage: r3

## Trajectory

This run:
- claude-read: The design is still being patched, but the rounds since r2 mix removals with additions. 03469502 removed one prediction, the font-dependent 0.4–0.65 ratio window, and replaced it with a conditional drive-floor assertion. That assertion is a new prediction tied to the 56px constant, and it is probably skipped (R1). d4c73ac5 tuned a constant (gap-2 to gap-1) to win back 1px for a Japanese name on the CI fonts. ba82c6b7 then reverted that constant and added a new negative-margin hang (`max-sm:-mr-2`) on two wrappers. Commit 7d9806cd added another numeric prediction (the icon exactly 16px after the count) and changed the edge assertions from the button box to the chevron. So each round still fixes one measured symptom with one more width constant or one more pixel prediction (r2 added the 14px svgs, ≤16 gap and w-14; this round adds -mr-2 and =16). The one round that removed something (the ratio window) put a weaker check in its place. 5b1bdf1e5 itself changes only review documents.

Earlier runs:
- r2 / claude-read: Yes, the design is being patched. The fix rounds since r1 keep re-tuning flex sizing on the same phone scope line, and each round adds a fixture case and a numeric prediction. The previous state had the Target start at a 40% basis that grows up to max-content (`basis-[40%] grow shrink-0 max-w-max`). 56d3b8f5 added a 'summer' folder fixture and a test that predicts a 0.4–0.65 width ratio. dcb4fc8f removed the 40% starting share, which is one predicate fewer, but it added a basis-0, grow, min-w-min rule on the scope and two new hard-coded floors: the drive's `w-14` (56px) and the quiet value's `min-w-[2.5em]`. The review shots (icon squashed, ja name cut, scope-row blank space) and the matching tests (14px svg widths, a gap of 16px or less, a whole Japanese name) show the same pattern in earlier rounds: each fixed one measured symptom with one more width constraint. The newest round replaced a heuristic and did not only stack on it, but the line's behaviour still depends on constants that no test pins.

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

Claim: The test rewritten in 03469502 ('a folder name wider than two fifths of the line: the Target's name is cut only once the drive name is down to its floor') guards its only new assertion with `if (!m.targetName.whole)`. With 'Holiday 25' and the 8px hang that ba82c6b7 added, the Target's name most likely fits whole at 375px, so the drive-floor check never runs.
Impact: A change to the drive's phone floor (for example `max-sm:w-14` changed to `max-sm:w-20`) passes the whole suite. The test that names that floor skips its assertion. The long-drive plus long-folder scenarios check only that the Target is cut, the 14px svg widths and the 16px icon offset, and all of these hold whatever the floor is, because the count always ends the scope span. In use, the drive-first cut order described in I10 could change and no test would notice. The rest of I10 would still hold.
Evidence: frontend/e2e-components/app-header.spec.ts, the test after 'with a long drive name': `if (!m.targetName.whole) expect(driveWidth).toBeLessThanOrEqual(DRIVE_FLOOR + 0.5);`. Nothing checks the 'wider than two fifths' precondition in the title, because the ratio window was deleted. My estimate of the 375px line: 375 − 32 (header px-4) − 40 (tile) − 12 (gap-x-3) + 8 (`max-sm:-mr-2`, PageHeader.tsx:136) ≈ 299px. Scope floor: 56 + 4 + '· 1,234 videos' (≈92) ≈ 152. Then gap-2 (8). Target max-content: 8+14+4+'Holiday 25' (≈68)+4+14+8 ≈ 120. That sums to about 280 < 299, so the name is whole and the branch is skipped. Whether it runs depends on the fonts, which is exactly what the commit set out to remove.
Repro: Mutation, reasoned and not run: in AppHeader.tsx change `max-sm:w-14` to `max-sm:w-20`. 'Holiday 25' still fits, so the conditional is skipped. The long-drive and long-folder scenarios still see a cut name, svgs of 14px and an icon 16px after the count. No test fails.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Make the assertion unconditional in a scenario where the Target's name is known to be cut. In the long-drive plus long-folder case, assert that the drive span's width is about 56px. Alternatively, assert `m.targetName.whole === false` before the floor check so the test cannot silently skip it.

</details>

### claude-read:R2 — bucket B, LOW, open

Claim: No phone test catches leftover blank space between the count and an uncut Target, the defect recorded as detail-375-scope-row-blank-space. If `max-sm:grow` is dropped from the drive span, the drive stops at 56px and a gap opens after the count, and every test still passes.
Impact: A regression would bring back a long drive name cut to 56px, with an empty run between '· N videos' and the Target, at 375px. The suite stays green. The design check asked for this to be fixed.
Evidence: AppHeader.tsx: the drive span has `min-w-0 truncate max-sm:w-14 max-sm:max-w-max max-sm:grow`. The gap checks in app-header.spec.ts ('no blank is left between the count and the cut Target' ≤16 and the new 'icon starts 16px after the count') run only in scenarios where `targetName.whole` is false. The 'long drive name' default-target test asserts only that the drive is cut, the count and the Target's name are whole, and nothing overflows.
Repro: Mutation, reasoned and not run: delete `max-sm:grow` from the drive span. The scope div still grows with justify-between, so the Target stays at the right edge. The drive holds at 56px and the count follows it, which leaves blank space. No assertion measures the count-to-Target distance when the Target is whole.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In the 'long drive name' test with the default target, assert `m.target.left - m.count.right <= 8 + 1`, or assert that the icon sits 16px after the count, as the cut-Target scenarios already do.

</details>

### claude-read:R3 — bucket B, INFO, open

Claim: The commit-message statement 'the Japanese default target name beside a four-digit count was 1px short of whole' was fixed in d4c73ac5 by narrowing the gap. ba82c6b7 undid that change. The Japanese 'name is whole' test now passes only because of the 8px hang, a margin of about 4px over the font metrics.
Impact: None today. A future change to the quiet control's padding, or a CI font change, can flip the Japanese test once more. That test is the only check that the Japanese default name stays whole.
Evidence: In PageHeader.tsx:119 the scope row's gap went from gap-2 to gap-1 (d4c73ac5) and back to gap-2 (ba82c6b7). Line 136 adds `max-sm:-mr-2`. app-header.spec.ts 'in Japanese with drive main: the default Target's name is whole' checks `scrollWidth <= clientWidth`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run Playwright or the unit tests. The width estimates in R1 come from approximate font metrics, not from measurement.
- claude-read: I did not inspect the screenshots or design artboards that commit 5b1bdf1e5 records.
- claude-read: I did not read the contents of commits b1715809, 1f2ed451, 5ef23009 and b42577e1 beyond their titles, since they appear to be docs or review records.
- claude-read: I did not re-check the backend contract test, appPrefs or appTarget, because no fix since r2 touches them.
- claude-verify: I did not run the Playwright suite, so I could not confirm in the test harness's fonts that the line 109 branch is skipped.
- claude-verify: I did not read the git diffs or commit messages of d4c73ac5, ba82c6b7 or 03469502. The history comes from decisions.md and the current code only.
- claude-verify: I did not check the 640px and 1280px layouts or the I1-I9 storage and resolver invariants.

TOTAL: 3 findings
