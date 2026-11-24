# Review of bda117d7d (diff fc37efd67..bda117d7d) — fixes for u2 F1, F3, F8, F9, F10

Ran read-only at HEAD = bda117d7d: `pnpm exec vitest run` on InspectorTabsSlot, Workbench, MediaShell, WorkbenchCollection test files — 4 files, 158 tests pass. e2e not run (as instructed).

## Answers to the questions

- **F1 fixed, every form.** The only `inspector-tabs` availability is `ShellLayout.tsx:354-357` (`reportedValue(...) === true`), identical to 248273caf. The desktop pane (`buildTabs(stackedLayout)`) and the phone sheet (`buildTabs(true)`) share that mapping; the collection surface has no inspector (`FileDetailPresenter.tsx:80-82`) and draws no `inspector-tabs`. The pinned addon (`41d86247` `AskTab.tsx`) reports `false` in a layout effect per file and `true` after the availability fetch, so the Ask tab still appears under the restored semantics. `tabs.ts` doc comment ("only `true` gives it a button") now matches the call site.
- **F3 fixed for the grid on both surfaces.** `Workbench.tsx:99-107` sets `hidden` and drops the 18rem floor when `shownPanelIds` is empty; `globals.css:1188-1190` makes it `display:none`; the collection 60% height rule is now `:not([hidden])` (`globals.css:1260-1265`). Canonical wide (inspector open or closed — `workbenchWide` does not depend on it) and the collection surface at every width use this; canonical stacked/phone render no `Workbench` at all. `data-workbench="on"` (`ShellLayout.tsx:432`) uses the same `shownPanelIds`, so host and grid agree. One residue: see N2.
- **`hidden` vs mount-once (I4) and `active` (I8).** Toggling the grid changes one attribute; the children list and keys are unchanged, so nothing remounts. Every not-shown section was already `display:none` before this commit, so hiding the grid when *no* section is shown changes nothing for any mounted entry: off entries stay mounted and their `onAvailability` reports still flow (the toggle row reads `available`, not the grid). `item.render(itemShown)` is the same expression renamed, so `active` is unchanged.
- **Tests.** `InspectorTabsSlot.test.tsx` at bda117d7d differs from 248273caf only in setup (`waitFor`/`measureRow` imports, `measureRow(900)` in `beforeEach`, waiting for `data-inspector-fit` in `renderKind`); every assertion is identical. `Workbench.test.tsx` adds only `fireEvent.click(slot-entry-ask-filled)` in the two SPEC-CORE-087 I6 tests (lines 560, 580) — the authorised correction. `MediaShell.test.tsx:459-467` now asserts the grid exists and carries `hidden` instead of the stale `.media-detail-below` null check — tighter, not looser. No other test file changed.
- **New e2e.** `workbench-no-panel-desktop.spec.ts` uses the real `FileDetailContent` fixture on both surfaces with `workbench-panels = "[]"` (the real key, `lib/workbenchPanels.ts:5`), waits for the Panels group (so a panel is available but none is on), and asserts the grid is `display:none` and 0px tall. Reverting the fix makes it `flex` and 288px (canonical) / ≥288px (collection), so it fails as it should. It measures the grid only, not the whole space under the player (so it does not see N2), and only at 1440x900; the collection rule is width-independent, so the missing narrow case is not a gap in practice. Registered in `projects.ts` DESKTOP_ONLY and `spec-viewport.spec.ts`.
- **F9, F10** match `Main.dc.html:73` (16px 2px-stroke X; lucide `X` default stroke is 2) and `:70` (no card border, header bottom rule kept). F10 has a light-theme consequence: N1.
- **F8 DESIGN.md text**: see N3.

## Findings

### N1. Light theme: a shown panel has no visible edge — design-level, human picks
- Where: `globals.css:1203-1212` `.media-detail-workbench-panel` — border removed, background `var(--color-bg-card)`. Light tokens `globals.css:31-32`: `--bg-primary: #ffffff`, `--bg-card: #ffffff`; the canvas background is `body { background: var(--bg-primary) }` (`globals.css:154-155`; `<main>` in `FileDetailShell.tsx:483-487` sets none). DESIGN.md:611-612 itself records that these two surfaces "are both white in the light theme".
- What goes wrong: in the light theme the card is white on white with no border and no shadow, so only the header's bottom rule marks a panel; its sides and bottom are invisible, and two panels side by side read as one area split by a 16px gap. `Main.dc.html` was drawn only in the dark palette (`#1a0e10` page, `#231216` card), where the surface step carries the edge.
- Condition: light theme (system light mode), any player page with a panel on.
- Frequency 8 if the user runs light mode, else 0; impact 2 (cosmetic, panel bounds unreadable).
- Evidence: tokens and rule above. Options: keep the border in the light theme only, or `bg-bg-elevated` for the card in light — the human decides, since F10 was a design-match fix.

### N2. With no toggle row (no available panel, no preview action) 16px of blank remains under the player — A, residue of F3
- Where: `MediaCanvas.tsx:38` `MEDIA_HOST_CLASS = "media-detail-host w-full p-4 [&>*+*]:mt-4"` and `FileDetailPresenter.tsx:158` (same class on the collection host). `Workbench` always renders its root `.media-detail-workbench` div (`Workbench.tsx:61-65`); with no row and the grid `display:none` it is 0px tall but still takes `margin-top: 1rem` from `[&>*+*]:mt-4`.
- What goes wrong: SPEC-CORE-085 I2 / step 9 ("With none of them available, the area under the row has zero height"; player as today). The canonical page shows host padding + a 16px margin of nothing under the player (32px total instead of 16px); on the collection surface `rest` is pushed 16px further down.
- Condition: a player file on a drive where no `player-side` entry is claimed (intelligence off by policy or not installed), no active-summary note, and no `file-preview-actions` claimant. With intelligence on, a silent Transcript entry counts as available, so the row exists and this does not occur.
- Frequency 3, impact 1.
- Evidence: class strings above; the new e2e measures only `.media-detail-workbench-grid`, so it cannot see this. Rendering nothing (`return null`) when there is no row and no shown panel would be wrong for mount-once (entries must stay mounted); the fix is to drop the margin when the root is empty, e.g. `empty:hidden`-style rule on `.media-detail-workbench:not(:has(> :not([hidden])))` or not counting it in the sibling margin.

### N3. The F8 exception removes the toggles' non-colour state cue (DESIGN.md §2.2 "Never rely on colour alone") — design-level, human picks
- Where: `DESIGN.md:615-618` (new exception), `globals.css:1153` (off: `1px solid var(--bg-border)`), `globals.css:1167-1171` (on: accent border, `text-primary`, weight 600).
- What goes wrong: with both states bordered, on vs off now differs by border colour, text colour, and a 500→600 weight step; the presence/absence of the outline, which the rest of §Selected-state controls relies on, is gone. DESIGN.md:259 says "Never rely on colour alone to convey state — pair with an icon or text." The weight step is the only non-colour cue and is slight at 12px. The exception text does not say how it satisfies §2.2. No other DESIGN.md rule is contradicted (`rounded-full` pills are listed at :501; accent border is not a fill under §2.2).
- Also (design difference, fix-or-accept): the dark `--bg-border` is `rgba(255,255,255,0.08)` (`globals.css:74`), while `Main.dc.html:204` draws off pills at `0.14`; in the dark theme the off outline is about half as visible as agreed.
- Condition: every view of the toggle row. Frequency 10, impact 1 (on/off still distinguishable by colour and weight; `aria-pressed` is correct).
- Evidence: lines above. Not a code defect; the human accepted F8, so this is only whether the recorded rule should say how state is carried without colour.

## Checked, no finding

- `shownPanelIds` in `Workbench` and `ShellLayout` is the same function over the same inputs, so `data-workbench="on"` (host min-height, player cap) is never on while the grid is hidden, nor off while it shows.
- Specificity: `.media-detail-workbench-grid[hidden]` (0,2,0) beats `.media-detail-workbench-grid` and the wide/narrow `flex-direction` rules only set direction; the collection height rule is excluded by `:not([hidden])` anyway.
- A stored id whose panel is unavailable on this file leaves the grid hidden (shown filters on `available`), and it reappears with the 18rem floor when the entry reports `true`.
- `X` from lucide-react is already a dependency used elsewhere; `aria-hidden` on the svg, the button keeps its `aria-label`.

TOTAL: 3 findings
