# Review of ae718a61f (fix: 270px floor on the enlarged-panels cap)

Scope: `git show ae718a61f` only (parent 53892c948). Threat model: personal tool, sole user, no adversary.

## What was checked

- The floor rule `.media-detail-host[data-workbench="on"][data-player-focus="on"] .media-detail-player[data-framed="true"] { min-width: min(100%, 480px, rail*0.5*16/9) }` against the existing caps in `globals.css`.
- Resolved width with the value on: `max(rail*0.3*16/9, min(100%, 480, rail*0.5*16/9))` (min-width beats max-width when larger). Height is therefore `max(0.3*vh, min(270, 0.5*vh))`, or the canvas width if that is smaller. This matches the revised I2 exactly, including "unless the canvas width limits the frame first".
- Where the floor applies (both attributes are needed):
  - Beside: `workbenchWide` true, so `data-workbench="on"` and the floor applies. Covered by the e2e CAP_WINDOWS cases (floor, share and half regimes).
  - Stacked with the inspector closed: `stacked` in `inspectorFormStore` is `form === "stacked" && open`, so a closed inspector keeps `workbenchWide` true and the floor applies. The inspector-closed e2e at 1440x900 is in the floor regime (0.3 * ~844 < 270).
  - Value off: `playerFocusApplies` is false, so there is no `data-player-focus` and no floor.
  - Collection surface: `FileDetailPresenter` builds its own host with neither `data-workbench` nor `data-player-focus`, so there is no floor.
  - Stacked with the inspector open, the phone, and `awaitingForm`: `workbenchWide` is false, so there is no `data-workbench` and no floor. (`data-player-focus="on"` is still set there; see B1.)
  - Unframed (audio): `playerFramed` is false and the selector also needs `data-framed`, so there is no floor.
  - Mini player: the frame moves into an inner `fixed` box with its own `w-[min(320px,…)]`. The wrapper's min-width only sizes the placeholder, so nothing changes in the mini window.
  - Pseudo and system full screen: the pinned frame is `fixed` or UA full screen, sized by the viewport. The `::before` slot keeps the wrapper's width, the same as before the fix, so the page does not move. The `[data-sheet-snap]` full-screen rules are phone-only.
- Wider than the canvas: prevented by the `100%` term, which resolves against the same host content box as `width: 100%`.
- Above 50%: prevented by the `rail*0.5*16/9` term, which uses the same `--rail-avail` as the 0.5 cap.
- No conflict with the base `--player-avail` cap: the workbench rule already overrides it. The stacked-open `--fit-player-h` cap is never combined with the floor, because `data-workbench` is absent there.
- The controls measure the frame with `getBoundingClientRect().width` on `player-frame`, which is `w-full` inside the wrapper. At the floor the frame is exactly 480, `480 < 480` is false, and the pointer layout is used.
- Ran `playwright-components.config.ts player-workbench-desktop.spec.ts -g "SPEC-CORE-104 I2|SPEC-CORE-104 I1 I7"` at ae718a61f: 7 passed.

## (A) Silently wrong in normal use

None found.

## (B) Odd input, misuse, latent coupling, test gaps

B1. `data-player-focus="on"` is set outside the workbench forms.
- Condition: `playerFocusApplies` (ShellLayout.tsx:217) does not include `workbenchWide`. So on the phone and in stacked-with-inspector-open, the host still gets `data-player-focus="on"` and `--workbench-player-share: 0.3` whenever the value is on and a panel is stored. The floor stays off only because the CSS selector also requires `data-workbench="on"`.
- Risk: someone who simplifies the selector to `[data-player-focus="on"]` would leak the floor into those forms. The I1/I7 "stacked with the inspector open" e2e at 800x900 would not catch that: the frame is canvas-limited there, so it is unchanged with or without the floor.
- Fix: gate with `playerFocusApplies && workbenchWide`.
- Frequency 0 (needs a future edit). Impact 3. Invariants: I2, I7.

B2. 480 in CSS duplicates `COMPACT_MAX_WIDTH`, and 0.5 duplicates `WORKBENCH_PLAYER_SHARE`.
- Condition: either constant changes in TS and the CSS does not follow.
- Effect: if `COMPACT_MAX_WIDTH` is raised, for example for a longer time display, the floor regime silently brings back compact controls (no skip, settings or full-screen button), which is exactly what this fix removes. The e2e also hard-codes `FOCUSED_FLOOR = 270`, so it would stay green.
- The 0.5 drift only mis-bounds the floor against a changed default cap.
- Frequency 1. Impact 3. Below the fix threshold. Invariant: I2.
- Cheapest behaviour-based guard: in the existing floor-regime e2e case (iPad 11-inch, 1210x764), hover the frame and assert that the Settings and Full screen buttons are shown. That tests the purpose of the floor, not its number, and it would also catch removal of the floor.
- Alternative: pass the floor through `mediaHostStyle` as a CSS variable built from `COMPACT_MAX_WIDTH`, which removes the duplicate.

B3. The `100%` term (canvas narrower than 480) has no test.
- Condition: a desktop workbench form whose canvas content box is under 480px, roughly a window about 770px wide or less with the sidebar open. If the term were dropped, the frame would overflow the canvas sideways. No e2e case has a canvas under 480 with the value on.
- Frequency 1. Impact 3. Invariant: I2 ("unless the canvas width limits the frame first").
- The other two terms are covered by analysis:
  - Removing the floor fails the "floor" case, where 30% of the visible height is about 190px against 270 expected.
  - Dropping the 0.5 term fails the "half" case. `regimeOf` guarantees `half <= 268`, and at 1440x560 the gap is about 18px, well past the 2px tolerance.
- I did not run mutations, because the brief forbids editing repo files.

B4. The DESIGN.md Workbench table (line 1287) still says "half, or `30%`" with no 270px / 480px floor. That is a rule document per frontend-conventions ("when a new token or scale changes a rule, update the rule"). A reader who trusts it could remove the floor as off-design.
- Frequency 1. Impact 3.
- Fix: add the floor to that row.

TOTAL: 4 findings
