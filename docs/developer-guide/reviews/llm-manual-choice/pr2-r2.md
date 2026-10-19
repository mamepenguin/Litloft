# PR-2 review, round 2

Reviewed: fix commit `d124ada` (parent `40de532`) in `addons/intelligence`, branch `feat/llm-manual-choice-ui`.
Baseline at `d124ada`: `pnpm exec vitest run src/addons/intelligence` → 41 files, 686 passed, 2 todo. `pnpm exec tsc --noEmit` clean.
Tree restored after every mutation and probe; `git status` in `addons/intelligence` is clean at the end.

## Findings

No bucket-A finding: no path found that sends a profile the user did not pick, or that changes a request without a choice.

### G1 [introduced] B, low — while the menu is open, its keys are taken from every focused element, including text fields

- `frontend/RegenerateWithMenu.tsx:69-105`: the five bindings are pushed with `editingOnly: false` at `OVERLAY_PRIORITY`. `ShortcutsProvider` therefore answers them wherever focus is, as long as `open` is true. At `40de532` they were a React `onKeyDown` on the menu's wrapper, so they only fired for events from inside it.
- The menu stays open when focus leaves it by Tab (round 1 recorded this and left it uncounted). Pressing a key after that now:
  - Home, End, ArrowUp or ArrowDown in a textarea or input: `preventDefault()` and focus jumps back into the menu. The caret does not move.
  - Escape: closes the menu and moves focus to the trigger, away from the field.
  - Any arrow key with focus elsewhere: focus also jumps into the menu.
- Reproduction (scratch test, deleted): `ShortcutsProvider` + `RegenerateWithMenu` + a `<textarea>`. Open the menu, focus the textarea, then `keyDown(textarea, …)`.
  - `d124ada`: Home, End and ArrowDown each give `focusStays=false defaultPrevented=true`. Escape gives `menuOpen=false focusStays=false`.
  - `40de532` (its `RegenerateWithMenu.tsx` copied beside it): all four give `focusStays=true defaultPrevented=false`, and the menu stays open.
- Mutation N4 (`editingOnly` removed from one binding) stays live, so no test covers this either way. With `editingOnly` left undefined, the provider's editing partition would skip text fields.

### G2 [introduced] B, low — the summary and detailed-summary menus share one shortcut context id

- `RegenerateWithMenu.tsx:70`: the id `"intelligence-regenerate-with"` is a constant. `ShortcutsProvider.push` replaces any context with the same id, and `pop` removes it whichever instance pushed it. The file page renders both `SummarySection` and `DetailedSummarySection`, and each has its own `RegenerateWithMenu`.
- Scenario: open menu A, Tab out of it (it stays open), reach menu B's trigger and open B. B's context replaces A's. Close B with Escape. A is still open but has no bindings:
  - its arrows go to the page (video seek, or the citation handler);
  - Escape no longer closes it and goes to the page's Escape binding.
- Reproduction (scratch test, deleted): two menus under one `ShortcutsProvider` with a page context that records arrowdown and escape. Open A, open B, Escape in B, then ArrowDown and Escape on A's item.
  - `d124ada`: A's arrow does not move focus, A is still open after Escape, and the page records `["arrowdown"], ["escape"]`.
  - `40de532`: A's arrow moves focus and Escape closes A. The page records only `arrowdown`, which is F1(b) as already known.
- This is reachable only through the Tab-out path (the scrim swallows a pointer press), so the severity is low.

### G3 [pre-existing to d124ada; introduced by the PR at 40de532] B, low — F1(a) still reproduces when the open menu's trigger has focus

- `DetailedSummarySection.tsx:747`: the new guard skips the `window` handler only when `e.target` is inside a `[role="menu"]`. The trigger is outside the menu but inside `host`.
- Scenario: the detailed summary is expanded and the menu is open. Shift+Tab from the first item to the "▾" trigger, which leaves the menu open, then press ArrowDown. The menu binding moves focus to the first item (`at < 0 → 0`). The `window` handler then runs, because its target is the trigger, and moves focus to `[data-citation-section-path="全体像/0"]` with a smooth scroll. The menu stays open with focus outside it.
- Reproduction (temporary test in `DetailedSummarySection.test.tsx`, restored): real `ShortcutsProvider`, `openMenu()`, `trigger.focus()`, `keyDown(trigger, ArrowDown)` → `{"menuOpen":true,"activeIsMenuItem":null,"citation":"全体像/0"}`.
- At `40de532` the same path produced the same result, so `d124ada` did not introduce it. It narrowed F1(a) to the trigger path and did not close it.

### G4 [introduced] B, low — the Escape half of the fix (F2) is not held by any test

- The new tests "keeps the menu's keys from the page's shortcuts" (both suites) assert `pageKeys` is not called with `escape`. RTL renders into a `div` container, so React's root listener sits below `document`, and round 1 showed this setup cannot tell the two Escape implementations apart.
- Mutation N11 puts Escape back on a wrapper `onKeyDown` with `stopPropagation()`, which is exactly the F2 defect in production, and leaves every test green.
- The arrow half is held: N12 puts ArrowDown back on `onKeyDown` and is killed by both suites.
- Round 1's probe recipe (`createRoot(document)`) is the setup that distinguishes them.

### Already filed (one line each)

- [pre-existing] core `toolbarMenuHome` detector needs `RegenerateWithMenu.tsx` listed (core PR).
- [pre-existing] `Page.test` "puts a ?q= seed in the box" flake: it failed again alongside M10, P5 and N10 here. It was not counted as a kill; the targeted tests killed each of those.
- [pre-existing] PdfPreview flake: not met.
- [pre-existing] P9 (`askProfile` dropped from `runAsk`'s deps) is still live. Round 1 put it under Answers, not F3, and the triage did not ask for it.

## Answers

**1. Did the fix do what round 1 asked?**

- **F1, F2.** With focus inside the open menu, ArrowUp/Down/Home/End/Escape reach no lower `ShortcutsProvider` context (killed N1, N6, N12; round 1's F1(b) probe shape now records zero page calls). The detailed section's `window` handler is skipped for events from inside a menu (N1 killed).
  - The video-seek and Collapse-citations bindings sit at priority 0 under the menu's `OVERLAY_PRIORITY`, so they are shadowed. N2 (priority 0) is live only because push order already favours the menu, which opens last.
  - Two gaps remain: the trigger path (G3), and the test that should hold the Escape half (G4).
- **F4.** Done. The items now have `aria-label="cloud — gpt-x (External server)"` from the shared `choiceLabel`, and the Ask select uses the same function (N9, N10 killed).
- **F3.** Every listed gap now has a killing test: M10, M12, S8, S9, D5, D6, D7, D12, P5, P10. End and Home are covered too (N7, N8).
- **Does the guard suppress anything it should not?** Other `role="menu"` elements on the page are core's `OverflowMenu`, `FileActions`, `ToolbarMenu`, `SortButton` and the rest, plus this addon's `FileAIActionsButton`. None of them wraps the detailed-summary host or its citation nodes, so citation navigation and Enter are unaffected. The only change: `v` pressed while focus is in one of those menus no longer toggles verify mode. On `main` it did, because the handler lets `v` through from anywhere. A letter typed in a menu flipping a hidden mode is not behaviour anyone relies on, so I do not count it.

**2. What did the fix break?**

- G1: text fields while the menu is open.
- G2: two menus collide on one context id.
- Nothing on the closed-menu path:
  - The context is pushed only while `open`. N3 (always pushed) is killed by the assertion that ArrowDown reaches the page after the menu closes.
  - Citation arrow navigation and `v` from the section are untouched: the guard requires the target to be inside a menu.
  - Focus returns to the trigger on Escape (N5 killed).
  - Video shortcuts work again once the menu closes, because `useShortcuts` pops on `enabled=false`.

**3. Are the new tests real?**

- Yes, apart from G4. Both keyboard tests mount the real `ShortcutsProvider` and a page context that binds all five keys, and they assert declared focus targets.
- The stale-answer test uses two deferred promises resolved out of order and asserts the literal option list and the sent profile.
- The failed and dormant view tests assert the literal request bodies and the disabled trigger.
- I re-ran the author's kill claims myself (table below), and every F3 item is killed.

**4. Trajectory.**

- There is only one fix round, so "two rounds in a row" cannot be assessed yet.
- What `d124ada` removed: the menu's own `onKeyDown` dispatcher, replaced by the shared stack. That is converging.
- What it added: one branch, the `closest('[role="menu"]')` guard in the detailed section's `window` handler. That is a prediction about which events belong to someone else, made by a second dispatcher that the stack cannot outrank.
- G3 shows the prediction is incomplete: it misses events whose target is the trigger. If the next fix widens that guard (trigger, `aria-expanded`, focus checks), it is the same listener gaining a second prediction of the same kind, and by R-4 that would be the design being patched.
- The supervisor may want to note the shape for the next round: two keyboard dispatchers (the `window` listener and the stack) both answering arrows inside `host`.
- Separately, G1 and G2 come from what the move to the stack brought with it (`editingOnly: false`, a fixed id). They are not new branches.

## Mutations run

Run from `frontend/` with `pnpm exec vitest run` on the named suites. Each was restored with `git checkout -- <file>` in `addons/intelligence`.

| id | target | want | result |
|---|---|---|---|
| N1 | remove the `role="menu"` guard in the window handler | kill | killed (det keyboard test) |
| N2 | menu context at priority 0 | live | live (push order already wins) |
| N3 | menu context pushed while closed | kill | killed (sum: ArrowDown reaches page after close) |
| N4 | `editingOnly` removed from End | live | live (G1: nothing tests text fields) |
| N5 | Escape closes without returning focus | kill | killed (sum, det) |
| N6 | Escape binding removed | kill | killed (sum, det) |
| N7 | End goes to first | kill | killed |
| N8 | Home goes to last | kill | killed |
| N9 | item `aria-label` removed | kill | killed |
| N10 | `choiceLabel` drops the parentheses | kill | killed (sum, page) |
| N11 | Escape back on wrapper `onKeyDown` + `stopPropagation` (F2 shape) | kill | **live** (G4) |
| N12 | ArrowDown back on wrapper `onKeyDown` (F1(b) shape) | kill | killed (sum, det) |
| M10 | no `setChoices(null)` at effect start | kill | killed (page "drops the last drive's choices…") |
| M12 | stale-token guard removed | kill | killed (page "ignores a late answer…") |
| P10 | kept choice sent while select hidden | kill | killed |
| P5 | select enabled while streaming | kill | killed |
| S8 | note not cleared on next run | kill | killed |
| S9 | note not cleared on file change | kill | killed |
| D5 | failed-view menu never disabled | kill | killed |
| D6 | dormant menu sends Auto | kill | killed |
| D7 | dormant menu never disabled | kill | killed |
| D12 | failed-view rejected note removed | kill | killed |
| P9 | `askProfile` dropped from `runAsk` deps | kill | live (pre-existing; not in triage) |

23 mutations: 20 killed and 3 live. N2 was declared live. N4 is G1. N11 is G4. P9 was already filed.

Probes (scratch tests, deleted or restored):
- G1 and G2: `zzProbe.test.tsx` against the current menu and the `40de532` menu.
- G3: a temporary test appended to `DetailedSummarySection.test.tsx`.

TOTAL: 4 findings
