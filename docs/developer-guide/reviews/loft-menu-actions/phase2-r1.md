# Review: Phase 2 intelligence swap, addon commit 9bda03d, round 1

Reviewed: addon `9bda03d0400f718e52d3afd1a55761311e7d8088` (branch `feat/core-file-ai-actions`,
parent `8f527c6`), against core develop `a9079aee1` (`frontend/src/lib/fileAiActions.ts`).
Tree unmoved during review. Baseline: `pnpm vitest run src/addons/intelligence` → 40 files,
558 passed / 2 todo.

## Touch points reached by the diff but not in the list

Searched `rg fileAiActions|FileAiActionKind|ACTION_ICON|offerIntelligenceAction|useOfferFileAiAction|FileAIActionsButton`
over the whole repo (core, every addon, docs, e2e fixtures), excluding specs/reviews.

- **Core `frontend/e2e-components/fixtures/app.tsx:276-284`** (not in the list). The
  layout fixture's `#anchored` menu hard-codes five rows, one per intelligence kind, with the
  comment "One row per `FileAiActionKind`: the menu's height at its largest". The type no
  longer exists, and after Phase 3 the largest menu is six rows (Media Import's
  `media_import.transcribe`). The fixture feeds the e2e-layout measurement of which way the
  menu hangs, so this is the one unlisted place whose *value* the swap makes stale. See F2.
  Not reached by this diff textually (core file), reached semantically.
- Core `componentFixtureParity.test.tsx` (listed): still passes; it reads only the menu class
  template and `MENU_GAP_PX`, both unchanged.
- Other addons: none reference the store or the `file-ai-actions` slot (only
  `addons/intelligence/frontend/slots.ts:24`).
- Core detectors enumerating addon files (`i18n-keys`, `row-action-reveal`, `officeMimes`,
  `page-headings`, `sidebar-headings`, `anchoredDropdowns`, `watchHistoryCallSites`,
  `viewer-chrome`): none keys on `fileAiActions.ts` or on `t(action.labelKey)`; whole suite
  result below.
- Docs: no page under `docs/` names `fileAiActions`, `FileAiActionKind` or the wrapper.
- Link tree: `frontend/src/addons/intelligence/` has no dangling link to the deleted
  `fileAiActions.ts` (checked with `find -type l ! -exec test -e`).

Answer: one unlisted place (the e2e fixture), no unlisted code path.

## Mutation table

Runner: apply one exact-string replacement to one file, run the six test files that exercise
the menu (`FileAIActionsButton`, `SummarySection`, `SuggestedTagsSection`,
`DetailedSummarySection`, `SuggestedChaptersSection`, `VisualDescriptionSection`), restore with
`git -C addons/intelligence checkout -- <file>`.

### Wrapper `offerIntelligenceAction.ts`

| # | Mutation | want | result | killing test |
|---|---|---|---|---|
| W1 | swap order tags 10 ↔ summary 20 | kill | killed | keeps a fixed order and icon… |
| W2 | chapters order 40 → 55 (after visual) | kill | killed | keeps a fixed order and icon… |
| W3 | every order 0 (id tie-break decides) | kill | killed | keeps a fixed order and icon… |
| W4 | detailedSummary order 30 → 15 | kill | killed | keeps a fixed order and icon… |
| W5 | summary icon BookOpen → FileText | kill | killed | keeps a fixed order and icon… |
| W6 | visualDescription icon → Sparkles | kill | killed | keeps a fixed order and icon… |
| W7 | chapters icon → FileText | kill | killed | keeps a fixed order and icon… |
| W8 | duplicate id: summary uses `intelligence.tags` | kill | killed | keeps a fixed order…; drops an entry when its section withdraws |
| W9 | duplicate id: visual uses `intelligence.chapters` | kill | killed | keeps a fixed order and icon… |
| W10 | `label: labelKey` (untranslated) | kill | killed | 15 tests |
| W11 | `label: t("generateTags")` constant | kill | killed | 10 tests |
| W12 | `useTranslations("search")` | kill | killed | 13 tests |
| W13 | drop `busy` | kill | killed | disables an entry whose run is already in flight |
| W14 | `active: true` | kill | killed | 10 tests (withdraw / disappear / section gating) |
| W15 | `run: () => {}` | kill | killed | 7 tests |
| W16 | `order + 200` (after a foreign 100) | kill | killed | lists another provider's offer by its order… |
| W17 | `fileId: "x"` | kill | killed | 32 tests |
| W18 | id = bare kind, no `intelligence.` prefix | live | survived | — (ids still unique; the prefix only namespaces against other addons) |

### Button `FileAIActionsButton.tsx`

| # | Mutation | want | result | killing test |
|---|---|---|---|---|
| B1 | `const Icon = Sparkles` (ignore `action.icon`) | kill | killed | keeps a fixed order and icon…; lists another provider's offer… |
| B2 | `key={action.label}` | live | survived | — (labels unique today) |
| B3 | `key="x"` constant | live | survived | — (React warns; withdraw test still passes) |
| B4 | render `action.id` instead of `action.label` | kill | killed | 16 tests |
| B5 | `disabled={false}` | kill | killed | disables an entry whose run is already in flight |
| B6 | Sparkles `className=""` (never pulses) | kill | **survived** | — (F1) |
| B7 | Sparkles always `animate-pulse` | kill | **survived** | — (F1) |
| B8 | `busy = actions.every(...)` | kill | **survived** | — (F1) |
| B9 | drop `if (actions.length === 0) return null` | kill | killed | 11 tests (renders nothing / disappears…) |
| B10 | drop close-on-empty effect | live | survived | — (button unmounts its menu anyway) |
| B11 | `handleRun` does not close | kill | killed | runs the offering section's own callback |
| B12 | every item runs `actions[0].run` | kill | **survived** | — (F4) |
| B13 | render list reversed | kill | killed | keeps a fixed order…; lists another provider's offer… |
| B14 | render only the first entry | kill | killed | 3 tests |

### Section call sites (arguments unchanged by this commit; only the hook name changed)

| # | Mutation | want | result | killing test |
|---|---|---|---|---|
| S1 | tags `active: loaded` (ignore pending) | kill | killed | withdraws the offer while candidates are waiting |
| S2 | tags `busy: false` | kill | **survived** | — (F2) |
| S3 | tags `run` no-op | kill | killed | runs the section's own regenerate… |
| S4 | summary `active` ignores `available` | kill | killed | withdraws the offer once a summary exists |
| S5 | summary offers on `insufficient_content` | kill | killed | offers nothing when there is too little text… |
| S6 | summary `busy: false` | kill | **survived** | — (F2) |
| S7 | detailed offers while `generating` | kill | **survived** | — (F3) |
| S8 | detailed offers when `failed` | kill | **survived** | — (F3) |
| S9 | detailed `busy: false` | kill | **survived** | — (F2) |
| S10 | detailed `run` no-op | kill | **survived** | — (F3) |
| S11 | chapters label always `generateChapters` | kill | killed | dismisses the candidate set and hands 'create again'… |
| S12 | chapters `active` ignores pending | kill | killed | withdraws the AI menu entry while candidates are waiting |
| S13 | chapters `active` ignores `applies` | kill | killed | offers nothing to the AI menu when the drive has the feature off |
| S14 | chapters `busy: false` | kill | **survived** | — (F2) |
| S15 | visual `active` ignores `status` (keeps offering after a description exists) | kill | **survived** | — (F3) |
| S16 | visual `active` ignores `isImageFile` | kill | **survived** | — (F3) |
| S17 | visual `busy: false` | kill | **survived** | — (F2) |
| S18 | visual `run` no-op | kill | killed | posts to generate…; says so when a run started from the AI menu fails |

After all mutations `git -C addons/intelligence status --short` is empty.
Whole core suite at 9bda03d: 557 files, 8132 passed / 2 todo; `pnpm exec tsc --noEmit` exit 0
(includes `componentFixtureParity`).

### On the parent-commit reproductions

Swapping the addon tree to `8f527c6` to rerun the survivors there was refused by the
permission classifier, so no survivor was rerun against the parent. The `[pre-existing]`
labels below rest on the diff instead: every surviving mutation targets a line this commit
did not change (the busy/pulse/`handleRun` lines of the button and every section's
`active`/`busy`/`run` argument are byte-identical at the parent), and the commit removes no
assertion from any test (section test files change one import line each; the button test
only adds tests and widens the order test from three to five rows). A mutation that survives
at 9bda03d therefore had no killing test at the parent either.

The wrapper deviation (`offerIntelligenceAction.ts` mapping kind → id/order/icon/label)
holds invariants 4 and 5 as far as the wrapper is concerned: every wrapper mutation that
should be killed was killed (W1–W17), including order, icon, duplicate id, label and
namespace. Invariants 1–3 are untouched: the core store is unchanged and still names no addon.

## Findings

### F1 [pre-existing] MEDIUM, invariant 6: the pulsing "AI" icon is held by no test

Evidence: `FileAIActionsButton.tsx:210` (`const busy = actions.some(...)`) and `:240`
(`className={busy ? "animate-pulse" : ""}`). B6 (never pulse), B7 (always pulse) and B8
(`every` instead of `some`) all survive the six test files and the whole suite. Invariant 6
is declared for this phase ("the 'AI' icon pulsing"); only its first half (item disabled) is
held, by "disables an entry whose run is already in flight" (B5, W13 killed).
Reproduction: apply B7 → suite green; the icon pulses with no offer busy.
Not introduced: the lines are unchanged and the parent's tests had no pulse assertion.
Since the invariant was declared for this phase, the supervisor may still want the row added
here: in the existing busy test, assert the trigger's svg has `animate-pulse`, and add a
non-busy row asserting it does not; a two-offer row (one busy) kills B8.

### F2 [pre-existing] MEDIUM, invariant 6 upstream: no section's `busy` argument is held

Evidence: `SuggestedTagsSection.tsx:170`, `SummarySection.tsx:158`,
`DetailedSummarySection.tsx:405`, `SuggestedChaptersSection.tsx:193`,
`VisualDescriptionSection.tsx:195`. Replacing each with `busy: false` (S2, S6, S9, S14, S17)
survives. A run in flight then leaves the menu item enabled, so a second press starts a second
run. The button-level test uses the stand-in `Offering`, so it proves the store carries `busy`,
not that any section sets it.
Reproduction: apply S14 → suite green.

### F3 [pre-existing] MEDIUM, invariant 5: two sections' withdraw conditions are not held

Evidence: `VisualDescriptionSection.tsx:194` — S15 drops `&& !status`, so the "Create
description" entry stays in the menu after a description exists (`status === "success"`),
which is exactly invariant 5; S16 drops `isImageFile(file)`, offering it on non-images.
`DetailedSummarySection.tsx:399-404` — S7/S8 drop the `generating`/`failed` guards, so the menu
offers a second run while one is in progress or beside the failure state. S10 (detailed `run`
no-op, `:406`) also survives: no detailed-summary test presses the menu item.
Reproduction: apply S15 → suite green.
Remedy suggestion (if the supervisor wants it): one row each in the existing section tests —
visual with a `success` status asserts no "AI" button; detailed with `generating` / `failed`
asserts no entry; detailed presses the entry and asserts the generate call.

### F4 [pre-existing] LOW (B): no test presses a menu item other than the only one

Evidence: `FileAIActionsButton.tsx:297`. B12 (`handleRun(actions[0].run)`) survives: every
test that clicks an item renders a single offer. With a foreign provider now in the same menu
this is the path where pressing "Transcribe" would run "Create AI tag candidates". No
declared invariant names it. A row in "lists another provider's offer…" that presses
"Transcribe" and asserts the foreign `onRun` (not the tags `run`) kills it.

### F5 [introduced] LOW (B): core's e2e fixture still sizes the AI menu to intelligence's five kinds

Evidence: `frontend/e2e-components/fixtures/app.tsx:276-284` — the `#anchored` menu renders one
row per `FileAiActionKind` "the menu's height at its largest, which is what the vertical
decision is made on". The type is deleted in this commit (it exists at `8f527c6:frontend/fileAiActions.ts`,
not at 9bda03d), and this commit is what makes the menu open to other providers (test
"lists another provider's offer by its order…"). After Phase 3 the largest menu is six rows,
so the fixture under-measures the height the direction decision uses. Not an unlisted code
path — a stale value in a listed-adjacent core file. The comment names a type that no longer
exists; it would not lead to a wrong code change by itself, so no prose action beyond deleting
the type name. The row count is for Phase 4 to decide (add the sixth row or state the largest
menu differently).

TOTAL: 5 findings
