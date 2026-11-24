# Review of fc37efd67 (diff 248273caf..fc37efd67) — player workbench, canonical + collection

Acceptance tests at fc37efd67: `Workbench.test.tsx` (45) and `WorkbenchCollection.test.tsx` (12) pass (`pnpm exec vitest run` on both files).

## Findings

### F1. inspector-tabs (Ask) silence semantics flipped: an entry that has not answered is now listed — A
- Where: `frontend/src/components/FileDetail/ShellLayout.tsx:353-358` (`available: slotAvailability.isAvailable(...)`, previously `reportedValue(...) === true`), with `inspector/tabs.ts:97` (`listed: tab.available === true`). `isAvailable` returns `true` for an unreported key, so every silent `inspector-tabs` entry is now listed.
- What goes wrong: SPEC-CORE-036 I10 ("drawn as a tab ... only once it has reported available") and SPEC-ADDON-056 I7 ("The Ask tab is listed only after the availability route answered `available: true`") are no longer held. The player-workbench spec does not revise either (it only says `inspector-tabs` stay last). Until the lazily loaded AskTab module mounts and reports `false` in its layout phase, the Ask tab button is listed; on a file without text chunks it then disappears. If the addon module fails to load (`SlotEntryRenderer` renders nothing), the Ask tab stays listed forever with an empty body.
- The commit also rewrote the existing SPEC-CORE-036 I10 tests in `InspectorTabsSlot.test.tsx` to expect the new behaviour ("Silence is available on this slot") — an approved invariant's test changed to match the code, outside this spec's Touch points' intent ("rewritten for the new placement"). The doc comment at `tabs.ts:38-41` now contradicts the call site.
- Condition: opening any file page (first open in a session, before the Ask module is cached; or any open where the module fails to load) on a drive with the intelligence addon.
- Frequency 5, impact 3 (a tab that flashes / an empty Ask tab). Design-level: the spec change of an approved invariant should go to the human regardless of score.
- Evidence: code path above; the diff of `InspectorTabsSlot.test.tsx` (lines removed: `expect(tabs()).toEqual([])` before `report("ask", true)`).
- Why it happened (likely): the acceptance tests `Workbench.test.tsx:553-581` (SPEC-CORE-087 I6) claim `inspector-tabs` with `ASK` and expect `"Ask"` in the tab list without ever reporting `true`. Those tests encode "silence lists an inspector-tabs entry", which contradicts SPEC-CORE-036 I10; the implementation changed core semantics to satisfy them instead of the tests reporting availability. The fix is in the acceptance tests (report `ask: true`), not the core — a human decision because it edits acceptance tests.

### F2. After saving an edit with the description expanded, there is no **Show less** button — A
- Where: `frontend/src/components/FileDetail/FileDescription.tsx:31-43` (`measure` returns early when `expanded`; `overflow` starts `false`), with `FileMetaBlock.tsx:75-109` (the `editing ? <MetadataEditor> : <div>…<FileDescription>` swap unmounts `FileDescription` while editing).
- What goes wrong: `expanded` is correctly kept in `FileMetaBlock` across the edit, but `FileDescription` is a fresh mount after save. Its `overflow` state is `false`, and every measurement is skipped while `expanded` is `true`, so the button never renders. The full text shows with no way to collapse it until the file changes or the block remounts (inspector reopen). Same if the description was expanded and anything else remounts `FileDescription` alone.
- Condition: expand a long description, press Edit, save (with or without changing it).
- Frequency 1, impact 3.
- Evidence: scratch test `scratchpad/rt2/desc.test.tsx` — rendering `FileDescription` with `expanded={false}` on an overflowing `<p>` shows `["Show more"]`; rendering it fresh with `expanded={true}` (the post-save mount) shows `[]` (expected `["Show less"]`). No acceptance test covers SPEC-CORE-088 "saving keeps its state" or the Show more/less buttons in jsdom.

### F3. With no panel shown, an empty 18rem block (collection: max(18rem, 60% of the viewport)) sits under the player — A (checked by reading CSS)
- Where: `frontend/src/components/FileDetail/workbench/Workbench.tsx:100-103` — the panel grid always gets `style={{ minHeight: "18rem" }}`, whether or not any section is shown; `globals.css:1180-1186` makes it a flex box; `globals.css:1257-1262` gives it `height: max(18rem, calc(var(--rail-avail) * 0.6))` on the collection surface unconditionally (`data-collection-workbench="true"` is always set in `FileDetailPresenter.tsx` `CollectionPlayerCanvas`). Every hidden section is `display: none`, so the grid is an empty box of that height, plus the workbench's `gap: 0.75rem`.
- What goes wrong: SPEC-CORE-085 step 9 / I2 / D5 ("With none of them available, the area under the row has zero height"; "the player is the size it is today"). The default state (nothing stored) is exactly this case, so every player page in a wide form shows ~288px of blank space under the toggle row, and on a collection/playlist play the file information and sections are pushed down by 60% of the viewport of nothing. It also happens on a player file with no panel at all (no toggles, no row) — the grid is still drawn.
- Condition: open any video/audio/.loft on the canonical page (wide form) or play any collection/playlist, with no panel turned on (the default).
- Frequency 10, impact 3 (visible empty space; the collection surface hides the information below the fold).
- Evidence: code path above; no rule in `globals.css` (all workbench rules listed at lines 1092-1262) collapses the grid when no section is shown, and the e2e spec has no "no panel → zero height" case (its height assertions all turn a panel on first). `MediaShell.test.tsx:459-465` "draws no panel area at all when nothing would go in it" passes for the wrong reason: it checks the old `.media-detail-below` class and the toggle group, while `.media-detail-workbench-grid` (with its inline 18rem floor) is in the DOM — the core `active-summary` item always exists on a player file, and the grid is rendered even with zero items.

### F4. `active-summary` carries a stale `true` across a remount, so the Note card/tab flickers on every form change — A
- Where: `frontend/src/components/ActiveSummaryHost.tsx:20-27` (reports through `useEffect`, after paint, and only when `available` changes; no report on unmount), with `useSlotAvailability` living in `FileDetailContainer` (outlives the panel's mount) and `panels.tsx:136` (`available: reportedValue(key) === true`).
- What goes wrong: on a form change (SPEC-CORE-087 step 5) or a phone sheet raise, the new `ActiveSummaryHost` mounts with `data === null` while the container still holds `core:active-summary = true` from the previous mount. The first frame draws the Note card (header + close button, empty body) or lists the Note tab; the passive effect then reports `false`, the card/tab vanishes for the fetch's duration, and returns when `useActiveSummary` resolves. SPEC-CORE-085 Non-functional ("the core panels start `false` ... never appears and then vanishes") is not held after a remount. On the phone each raise of the sheet makes the Note tab blink out of the strip.
- Condition: a video with an active summary note, Note turned on (or the phone sheet raised); drag the window across the stacked threshold, open/close the inspector in a narrow row, or raise the sheet.
- Frequency 3, impact 2.
- Evidence: code path above. Reporting `false` in a layout effect on mount (as the spec asks of the addon entries) or resetting the key on unmount would close it.

### F5. The collection surface now fetches `/chapters` for every player file, with or without chapters — A
- Where: `frontend/src/components/FileDetail/workbench/panels.tsx:62-82` — the `chapters` core panel `applies` on every collection player file and always renders `ChaptersPanel`, whose effect (`ChaptersPanel.tsx:68-84`) requests chapters on mount. Before this commit `FileDetailCanvas` mounted `ChaptersPanel` only when `chaptersPresent`.
- What goes wrong: SPEC-CORE-085 Non-functional "Requests: the only new request is the native-video Scenes `clip-timestamps`". Every collection/playlist track without chapters now sends one extra request.
- Condition: any collection, playlist or folder playback.
- Frequency 10, impact 1 (one small LAN request per track; nothing visible).
- Evidence: code path above.

### F6. With find open, a shown panel no longer ends inside the visible area — the canvas scrolls by the find bar's height — A (CSS reading)
- Where: `globals.css:1099-1103` (`.media-detail-host[data-workbench="on"] { min-height: var(--rail-avail) }`) with `ShellLayout.tsx` rendering `<FindBar />` (sticky, in flow: `FindBarPresenter.tsx:45`) as a sibling before `MediaCanvas` inside the same `<main>` scroller (`FileDetailShell.tsx:483-487`). `--rail-avail` is the scroller's whole visible height (`useCompanionMetrics.ts:76-89`), so host + find bar exceed it.
- What goes wrong: SPEC-CORE-085 I5 ("each shown panel ends within the visible area and the scroll container does not scroll"). The bottom of the panels sits one find-bar height below the fold while find is open.
- Condition: a panel on, then open find on a video (wide form).
- Frequency 3, impact 1.
- Evidence: code path above; not measured in a browser.

### F7. Collection surface: the player and information are now inset by 1rem and no longer line up with the queue — A (cosmetic, CSS reading)
- Where: `FileDetailPresenter.tsx` `CollectionPlayerCanvas` host `className="media-detail-host w-full p-4 [&>*+*]:mt-4"`; the old collection host (`FileDetailCanvas`) was `media-detail-host w-full` with no padding. `CollectionPanel` (the queue, `FileDetailFullScreen.tsx:219-231`) is outside this host, so for a video the information above is inset 16px and the queue below is not; `meta`'s own `mt-4` now stacks with the host's `mt-4`.
- Not in the spec or a design (the collection surface was not drawn; SPEC-CORE-090 step 4: "the description and the other sections stay where they are today").
- Condition: every collection/playlist playback.
- Frequency 10, impact 1.
- Evidence: class strings above.

### Design differences (agreed design `docs/process/reviews/feature-player-workbench/design/Main.dc.html`, read as text). Not scored; each is fix-or-accept.

### F8. Off toggles have a transparent border; the design and D2 give them a neutral one
- `globals.css:1148-1158` `.workbench-toggle { border: 1px solid transparent }`. `Main.dc.html:204` draws off pills with `border: 1px solid rgba(255,255,255,0.14)`, and spec D2 says "a neutral border when off". Without it an off toggle is bare text with no pill outline. (DESIGN.md §Selected-state controls says unselected controls carry `border-transparent`; the spec's D2 and the design chose otherwise for these pills — the human picks.)

### F9. The panel close button is a text "×" glyph, not the design's 16px stroke icon
- `Workbench.tsx:116-118` renders `<span aria-hidden>×</span>`; `Main.dc.html:73` draws a 16px, 2px-stroke X (lucide `X`-shaped). The glyph's size and weight follow the font, so it reads smaller and thinner than the other icon buttons on the page.

### F10. Panel cards carry a border; the design's cards have none
- `globals.css:1199-1209` `.media-detail-workbench-panel { border: 1px solid var(--color-bg-border); ... }`. `Main.dc.html:70` cards are a raised background with `border-radius: 12px` and no border (only the header's bottom rule).

### F11. Before `--rail-avail` is measured, a shown panel caps the player against `100dvh` — A (CSS reading, low)
- `globals.css:1099-1115` use `var(--rail-avail, 100dvh)` both for the host's `min-height` and the player cap. The spec's failure case says "The scroll container is not measured yet: the panels are 18rem tall and the player is not capped until the first measurement." For the frame(s) between the first row measurement and `useCompanionMetrics`' first publish, the player is capped at half the dynamic viewport (which includes the app header) and the host is a full viewport tall.
- Condition: opening a video with a stored panel. Frequency 8, impact 1 (one-frame size change of the player; usually invisible).

## Notes (not counted)

- **Merge gate, not a defect at merge time:** the gitlink in fc37efd67 pins `addons/intelligence` at `41d86247`, whose manifest lists `detailed-summary` (and `scenes`) only in `file-detail-sections` and `player-side` holds only `transcript`. At this commit, on a canonical player file the detailed summary is drawn nowhere (Info excludes it through `canvasSlotIds`, `heavySummaries` is `null` on player files, and it is not yet a `player-side` entry), while the collection surface still draws it in its sections. This is fine only if the core PR carries the gitlink bump to the addon change, as the spec's merge order says; verify with `git diff --submodule=short addons/` before the core PR.
- **Panel height (I5) by CSS reading:** `<main>` is `flex flex-col overflow-auto` with a definite height (`FileDetailShell.tsx:483-487`) and the host is its direct child, so with `data-workbench="on"` the host (explicit `min-height`, default `flex-shrink: 1`) shrinks to `--rail-avail`; its flexed height is definite, `.media-detail-workbench` (`min-height: 0`) shrinks, and the grid stops at its 18rem floor, so a long transcript scrolls inside `.media-detail-workbench-body`. I did not run `player-workbench-desktop.spec.ts`; this reading predicts its `:166-189` and `:192-201` cases pass. No rule outside lines 1092-1262 gives the host or grid a height.

## Checked, no finding

- Mount once (I4): workbench sections are keyed by id and keep their child positions (`{shown && header}` leaves a hole, the body `div` keeps its slot), so toggling/closing never remounts an entry; the player and `[data-preview-actions]` in `MediaPlayerBlock` keep their elements (only the `AddonSlot` inside is conditional); `data-workbench` only changes an attribute on the host. `FileDetailContent` keys `FileDetailContainer` by `fileId`, so a file change remounts everything, resets availability and collapses the description. No item, `ActiveSummaryHost` or detailed summary is mounted in two places in one form (`heavySummaries` is `null` on player files; the collection `rest` drops `ActiveSummaryHost` on player files).
- Availability loop: core panels use `reportedValue === true` (start false); slot entries use `isAvailable` (silence = available). An entry that reports `false` then `true` gets its card back if stored, at page load and after a file change (fresh container). `active` never gates availability.
- `active` (I8): workbench passes `shown`; hidden sections get `false`; narrow tabs read `InspectorActiveTabContext` = the selected listed tab of the mounted shell (desktop pane only mounted while open; the sheet only while raised).
- Stored list (I3, SPEC-CORE-086): eviction drops the earliest id not available on this file, else the earliest; only toggle/close write; `storage` event (including `key === null`) re-reads; non-array / non-string values read as empty; storage throwing falls back to memory. Lists longer than two or with duplicates (hand-edited storage) are shown as stored — bucket B.
- Tab order (I6): Info, Find, Pages, Chapters, panels (stable priority sort keeps core-first ties), Related (`postAddonTabs`), inspector-tabs. Wide: no panel tabs. Chapters is never a canonical toggle (`applies` is collection-only).
- Ids (I9): `player-side` entries with a core panel/tab id are filtered; `file-detail-sections` entries whose id is a `player-side` id are excluded on player files on both surfaces; files without a player keep today's sections and `ActiveSummaryHost` placement.
- Before measurement: `awaitingForm` gives no row, no panel, no panel tab and no cap.
- Old preference: nothing in this commit decides placement from `media-layout-preference`; the leftover `[data-media-layout]` grid rules and `MediaLayoutToggle` are reachable only through `FileDetailCanvas`, which now serves non-player files only (later unit).
- Description (I7): clamp is in `FileMetaBlock` above the editor swap; measured on mount/description change and on `ResizeObserver`; Info-only on the canonical page. (F2 is the one gap found.)

TOTAL: 11 findings
