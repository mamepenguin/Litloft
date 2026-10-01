# PR-2 review, round 1

Reviewed: `addons/intelligence` @ `40de532` (diff `2c163b7..40de532`, frontend only).
Baseline: `pnpm exec vitest run src/addons/intelligence` → 41 files, 676 passed, 2 todo.
Touched files' suites: llmChoice.api 22, SummarySection 29, DetailedSummarySection 44, Page 45 — all green.

## Findings

No bucket-A finding: no path found that sends a profile the user did not pick, or sends `profile` from a plain button (see Answers and Mutations).

### F1 [introduced] B, medium — Arrow keys in "Regenerate with…" also drive the page's own key handlers

- `frontend/RegenerateWithMenu.tsx:61-80`: ArrowUp/ArrowDown/Home/End call `preventDefault()` and move focus, but the event keeps propagating.
- (a) Detailed summary, expanded: `DetailedSummarySection.tsx:743-768` has a `window` keydown handler that, for ArrowUp/ArrowDown with focus inside the section host, focuses and scrolls to a citation section. The menu sits inside that host (`:1053-1078`), so ArrowDown on the first menu item moves focus to item two and then straight to `[data-citation-section-path="全体像/0"]`, with a smooth scroll. The menu stays open with focus outside it. `v` in the menu also toggles verify mode.
- (b) Video file page: `useVideoShortcuts` binds `arrowup`/`arrowdown` to seek +60 s / −60 s through `ShortcutsProvider`, which listens on `document` and does not look at `defaultPrevented`. Each arrow press in either summary's menu seeks the video by a minute.
- Reproduction (scratch tests, removed): (a) rendering the section with `generatedResponse`, expanding, opening the menu, `keyDown(first, ArrowDown)` → `document.activeElement` is the section div, not the second item. (b) `ShortcutsProvider` + a `useShortcuts` arrowdown handler + `RegenerateWithMenu`: ArrowDown in the menu → focus on the second item **and** the shortcut handler called once.
- Why the tests miss it: `SummarySection.test` "moves through the choices…" exercises the keys where neither listener exists; the detailed suite has no keyboard test for the menu.

### F2 [introduced] B, low — Escape in the menu is answered twice in the running app

- `frontend/RegenerateWithMenu.tsx:63-67` relies on `e.stopPropagation()` in a React `onKeyDown`. Next's App Router roots React on `document` (`next/dist/client/app-index.js:32`, `appElement = document`), the same node `ShortcutsProvider` listens on, so stopping propagation does not keep the press from the provider. This repo's own `FileAIActionsButton.tsx:70-93` records the same trap and moves its Escape onto the shortcut stack for that reason.
- Scenario: detailed summary with citations expanded (`useShortcuts` "Collapse citations" enabled), open the menu, press Escape → the menu closes and the expanded citations collapse too.
- Reproduction (scratch, removed): `createRoot(document)` rendering `ShortcutsProvider` + a `useShortcuts` escape handler + `RegenerateWithMenu`; Escape on the focused menu item → menu closed and the escape handler called once. With RTL's default `div` container the same test shows 0 calls, which is why `SummarySection.test` "closes on Escape" is green.

### F3 [introduced] B, low — tests let several wrong-profile and disabled-state regressions through

Each mutation below leaves every test green (table at the end). The code at `40de532` is correct on all of them; the gap is that nothing holds it.

- **Dormant view sends Auto instead of the choice** (D6): `DetailedSummarySection.tsx:836-842`, `onChoose={onGenerateWith}` → `onChoose={() => onGenerate()}`. The user picks `cloud`, confirms the "switch back to the AI summary" dialog, and routing generates. That is an explicit choice answered by routing at the UI level (invariant 3's intent). No test renders the dormant view with choices.
- **Menu enabled while a run is in flight in the failed and dormant views** (D5, D7): only the generated body's menu has a disabled test. The spec's "Checked, no action" relies on "buttons disabled while generating" to rule out a double submit with a choice.
- **Stale-response guard** (M12, the author's M30, declared live): `llmChoice.ts:44`. Without it, drive A's late answer `{auto: null, choices: [P]}` replaces drive B's; the Ask page then preselects `P` (`Page.tsx:418`) and sends it on drive B, where routing would have served Auto. That is a profile the user did not pick, so I would declare this one `want=kill`. A deferred-promise test (two drives, resolve out of order) would hold it.
- **Reset to `null` at effect start** (M10): `llmChoice.ts:39`. Without it, the previous drive's or file's list stays offered until the new one arrives, with the same preselect consequence as above on an auto-null drive.
- **Hidden select still sends a kept choice** (P10): `Page.tsx:410`, drop `!profileOffered`. Scenario: the user picks `cloud`, a refetch returns `{auto: "local", choices: [cloud]}`, the select disappears, and every later question still sends `cloud` with nothing on screen saying so.
- **Ask select enabled while streaming** (P5): `Page.tsx:953`. Untested.
- **Stale "model unavailable" note** (S8, S9, D12, D13): the note survives a later successful run or a move to the next file if the resets are removed; nothing asserts they go.

### F4 [introduced] B, low — the menu item's accessible name runs the model and "External server" together

- `RegenerateWithMenu.tsx:122-129`: two inline spans with no separator, so the name is `cloud — gpt-xExternal server`. `SummarySection.test.tsx` "lists each choice…" asserts that exact string, so the test pins the defect instead of the intended name. The Ask select already writes `cloud — gpt-x (External server)` (`Page.tsx:962-965`).

### Already filed (one line each)

- [pre-existing] core `toolbarMenuHome` detector must list `RegenerateWithMenu.tsx` as a `ToolbarMenu` importer (core PR).
- [pre-existing] no-summary file on a drive whose routing serves nothing has no generate button (AI menu is core's and routing-only).
- [pre-existing] `Page.test` "puts a ?q= seed in the box" flake: it also failed under M3 and P4. I did not count it as a kill there; the targeted tests killed both anyway.
- [pre-existing] PdfPreview core flake: not met.
- [pre-existing] PR-1 F1 (`/llm/choices/*` ignores the global switch): reachable only on Ask when `/status` is unreadable (`ragAvailable` forced `true`). The POST then fails with the same "RAG feature is disabled" as on `main`, so nothing changes.

### F5 [pre-existing] B, low — failed view with an active knowledge note: Retry, and now the choice, do nothing

- `DetailedSummarySection.tsx:276-288` opens `confirmRegenerateOpen` when `edited_at || hasActiveSummary`, but the failed branch (`:476-512`) renders no `ConfirmDialog`. The click sets state and nothing appears. The new menu entry in that view inherits it.
- Reproduced on both `2c163b7` (parent file copied beside the suite) and `40de532`: `status: "failed"`, `has_active_summary: true`, click Retry → 0 dialogs, 0 regenerate calls.
- Not established: whether `failed` plus an active note (or `edited_at`) is reachable in practice, for example a dormant regenerate that fails before the note pointer is cleared.

## Answers to the brief's questions

**Places the diff reaches that are not in the touch-point list.** These are the only candidates for a missing invariant:

1. The file page's global key handling: the `ShortcutsProvider` stack (video seek on arrows, the detailed-summary Escape "collapse citations") and `DetailedSummarySection`'s own `window` keydown handler (F1, F2). This is the one reach with user-visible breakage.
2. Every Ask error, not only `profile_unavailable`. `askQuestionStream` now throws `LLMRequestError`. A non-string `detail` (for example a 422 list) now gives `"<status> <statusText>"` where it used to give `"[object Object]"`. `.status` is kept.
3. Auto summary and detailed regenerate now go through the addon-local `fetchJSONWithDetail` instead of core `fetchJSON`. At this SHA they are semantically identical (`credentials: "include"`, same message). They will drift if core `fetchJSON` gains behaviour.
4. Core `DismissScrim` / `useMenuSurface` imports (cross-repo coupling; covered by the known detector item).
5. New `GET /llm/choices/*` requests: one per summary section with a summary, one per detailed section that is available or failed, and one per Ask mount with RAG available. Each refetches after every file or drive change, and the detailed one after each generation (the list drops to `null` while `status` is `generating`).

**Can the UI send a profile the user did not pick, or `profile` from a plain button?** Not at this SHA.
- Plain buttons and both AI-menu offers call with no profile: M1, S1, S2 and D9 killed; S3 is equivalent because choices are only fetched once a summary exists.
- Menu items send `choice.name` from the list currently rendered. A refetch drops the list to `null`, which unmounts the menu.
- The confirm dialog: `pendingProfile` is written on every open, including `undefined` from the plain button, so a cancelled choice cannot leak (D2 killed).
- Ask: stale `chosenProfile` is filtered against the current list (P3 killed). It is reset on a drive change (P2 killed) and ignored when the select is hidden (code correct, P10 untested).
- The one unpicked send is by design and tested: with `auto: null`, Ask preselects `choices[0]`, and the select shows it.
- What would break this goes untested: F3 (stale guard, the `null` reset, the dormant wiring).

**No-choice behaviour vs `main` (invariant 1).** With one choice that is also `auto`, or a failed choices request, no control is rendered, and the request bodies are byte-identical to `main`:
- summary Auto: no body, no Content-Type;
- detailed: `{force}`;
- Ask: `{query[, top_k, file_type]}`.

M1, M3 and S2 are killed; M2 and D10 are equivalent because `JSON.stringify` drops `undefined`. The differences are the extra GET (reach 5) and the wrapper `div`s around the buttons. Layout is measured separately and not judged here.

**Disabled-while-generating and feature-off.**
- Disabled while generating holds in code on every entry: the generated body, dormant and failed views (`working`), the summary (`regenerating`) and the Ask select (`streaming`). Tests cover only the generated body and the summary (F3).
- Feature-off holds. Summary: `GET /summary` answers `available: false` when `features.summaries == "false"`, and a per-drive policy 404 becomes `available: false` too, so choices are never fetched (S4 killed). Detailed: same (D4 killed). Ask: gated on `ragAvailable` (P8 killed), except in the `/status`-unreadable case under "Already filed".
- AI-menu paths never carry a choice.

**Accessibility.**
- The trigger and the menu are labelled "Regenerate with…" / "別のモデルで再生成". The select is labelled "Model" / "モデル".
- Focus moves to the first item on open and returns to the trigger on Escape (M19, M20 killed).
- Escape is answered twice in production (F2). Arrows leak (F1). The item name runs two spans together (F4).
- Tab out of an open menu leaves it open (no Tab or focusout handling). Core `ToolbarMenu` behaves the same, so not counted.
- After a choice, focus goes to the trigger, which is then disabled while the run lasts, so focus falls to `body`. The plain button does the same, so not counted.

**Tests that would let a defect through.**
- No `>=` detectors and no vacuous mocks found. `fetchLLMChoices` defaults to throwing, so an unstubbed test sees "no choices", not a fake list.
- Expected values are declared literals, except F4's, which writes the defect into the expectation.
- The `profile_unavailable` tests use the real `isProfileUnavailable` / `LLMRequestError`, so the classification is not mocked away.
- The gaps are F3. Also P9 (dropping `askProfile` from `runAsk`'s deps) is live, which suggests `t` / `tc` change identity on every render in the test setup. That makes the closure-staleness test vacuous for that dependency. Not investigated further.

## Mutations run

Run from `frontend/` with `pnpm exec vitest run` on the named suites. `api` = `llmChoice.api.test.ts`, `sum` = `SummarySection.test.tsx`, `det` = `DetailedSummarySection.test.tsx`, `page` = `Page.test.tsx`. After each run: `git checkout -- <file>` in `addons/intelligence`. `git status` is clean at the end, and `pnpm exec tsc --noEmit` is clean at `40de532`.

| id | target | want | result |
|---|---|---|---|
| M1 | summary Auto sends a JSON body | kill | killed |
| M2 | detailed always sets `profile` key (undefined) | live | live (equivalent: JSON drops undefined) |
| M3 | Ask always sends `profile: null` for Auto | kill | killed |
| M4 | `isProfileUnavailable` ignores status | kill | killed |
| M5 | `isProfileUnavailable` ignores detail | kill | killed |
| M6 | `readDetail` drops the body | kill | killed |
| M7 | `fetchLLMChoices` always hits `/summaries` | kill | killed |
| M8 | `choiceOffered` ≥1 instead of ≥2 | kill | killed |
| M9 | drop the auto-null single-choice clause | kill | killed |
| M10 | no reset to `null` at effect start | kill | **live** (F3) |
| M11 | fetch while disabled | kill | killed |
| M12 | stale-response token guard removed (author's M30) | kill | **live** (F3) |
| M13 | `refetch` is a no-op | kill | killed |
| M14 | drop `Array.isArray(choices)` shape check | live | live (defensive) |
| M15 | menu items never disabled | kill | killed |
| M16 | menu trigger never disabled | kill | killed |
| M17 | item sends the first choice's name | kill | killed |
| M18 | `close()` not called before `onChoose` (author's M39) | live | live (menu stays open over a disabled list; cosmetic) |
| M19 | Escape does not return focus | kill | killed |
| M20 | no initial focus on open | kill | killed |
| M21 | Escape without `stopPropagation` | live | live (and it does not work in production anyway: F2) |
| M22 | End goes to first item | kill | **live** (untested key; low) |
| S1 | summary drops the chosen profile | kill | killed |
| S2 | plain summary button sends `auto` | kill | killed |
| S3 | AI-menu offer sends `choices[0]` | live | live (equivalent: no choices when no summary) |
| S4 | choices fetched without a summary | kill | killed |
| S5 | no refetch on `profile_unavailable` | kill | killed |
| S6 | any error treated as `profile_unavailable` | kill | killed |
| S7 | summary menu never disabled | kill | killed |
| S8 | rejected note not cleared on the next run | kill | **live** (F3) |
| S9 | rejected note not cleared on file change | kill | **live** (F3) |
| D1 | confirm ignores `pendingProfile` | kill | killed |
| D2 | plain button does not overwrite `pendingProfile` | kill | killed |
| D3 | no choices in the failed view | kill | killed |
| D4 | choices fetched with the feature off | kill | killed |
| D5 | failed-view menu never disabled | kill | **live** (F3) |
| D6 | dormant menu sends Auto | kill | **live** (F3) |
| D7 | dormant menu never disabled | kill | **live** (F3) |
| D8 | detailed: no refetch on `profile_unavailable` | kill | killed |
| D9 | body menu wired to the plain handler | kill | killed |
| D10 | always pass `{force, profile}` | live | live (equivalent) |
| D11 | failed-view menu removed | kill | killed |
| D12 | failed-view rejected note removed | kill | **live** (F3) |
| D13 | `pendingProfile`/note not reset on file change | live | live (`pendingProfile` is rewritten on every open; the note half is F3) |
| P1 | Ask ignores the chosen profile | kill | killed |
| P2 | no reset on drive change | kill | killed |
| P3 | stale choice not filtered | kill | killed |
| P4 | auto null → Auto instead of first choice | kill | killed |
| P5 | select enabled while streaming | kill | **live** (F3) |
| P6 | Ask: no refetch on `profile_unavailable` | kill | killed |
| P7 | "Auto" offered when `auto` is null | kill | killed |
| P8 | choices fetched with RAG off | kill | killed |
| P9 | `askProfile` dropped from `runAsk` deps | kill | **live** (test setup; see Answers) |
| P10 | kept choice sent while the select is hidden | kill | **live** (F3) |
| P11 | Auto stored as `""` not `null` | live | live (equivalent) |
| P12 | `profile_unavailable` message replaced | kill | killed |

56 mutations: 36 killed, 20 live — 8 declared live (M2, M14, M18, M21, S3, D10, D13, P11; all equivalent or cosmetic), 11 test gaps (M10, M12, M22, S8, S9, D5, D6, D7, D12, P5, P10), 1 hidden by the test setup (P9).

Probes (scratch tests under `frontend/src/addons/intelligence/zz*`, deleted):
- F1(a): detailed section keyboard.
- F1(b) and F2: `ShortcutsProvider` + `RegenerateWithMenu`, rendered once in a `div` root and once with `createRoot(document)`.
- F5: on the parent and on the current file.

TOTAL: 5 findings
