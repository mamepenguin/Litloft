# Review r3: Clips fix commits

at: knowledge 15d30c7, d60b2c7, 2c44f41, ea7f465; core 46dc3bded, 8fe5c6805 (read with `git show`, not a range)
threat model: personal tool, owner only, no adversary. A = silently wrong in normal use; B = misuse.
material: the commits; .claude/rules/frontend-conventions.md; DESIGN.md; docs/process/testing-and-comments.md; docs/specs/clips-frame.md item 9; design-check.md; decisions.md; design/ClipsHome.dc.html, ClipsLibrary.dc.html.

Run: `NO_COLOR=1 pnpm exec vitest run src/addons/knowledge/clipsapp src/addons/knowledge/__tests__/clipsHome.test.tsx` -> 8 files, 112 tests passed.

## Checked, holds

- Card and skeleton title boxes agree: card title `min-h-[2.9em] line-clamp-2 text-[15px] leading-[1.45]` (ClipCard.tsx:102) = 43.5px for zero to two lines; skeleton title `h-[2.9em] text-[15px]` (ClipShelfBlock.tsx:30) = 43.5px; meta `min-h-4` text-xs (16px line) vs skeleton `h-4`. Same height on both pointer types.
- Grid/strip skeleton split (2c44f41): `CoverGrid` is always `ClipGrid` (a grid at every pointer), and its skeletons now take `min-w-0` only (CoverShelf.tsx:78), as its cards do (CoverShelf.tsx:73). `ClipShelfBlock`'s loading skeletons keep `ITEM` (150px on a coarse pointer), as its cards do (ClipShelfBlock.tsx:127). No other `SkeletonCard` caller.
- Padding split (ea7f465): the header's `py-2` (PageHeader.tsx:96) adds 8px under the tab rule, so `pt-7` + 8 = 36px (ClipsHome.dc.html:71) and `pt-4` + 8 = 24px (ClipsLibrary.dc.html:72). Shelf pages keep `pt-6` (no artboard). Only the content wrapper changes; header unaffected.
- D-4: `size="sm"` plus `text-[13px] font-semibold` on Mark as verified (ClipRow.tsx:48).
- formatRelativeAge locale: `useLocale()` passed through; ja strips spaces ("3日前"); same call as ReadingCard.tsx:71 on the same `created_at` field, so timezone parsing matches an existing screen.
- e2e fixtures render production components: `clipsPage.tsx` mounts the real `ClipsPage` with stubbed fetch answers; `clipsRow.tsx` mounts the real `CoverGrid` with `skeletons={1}`, the same component and prop the Library's No grouping and shelf pages use while asking for more. No fixture-only branch in the components.

## Findings

### F-1 (A, test hole) At 1280px the skeleton height check is satisfied by grid stretch, not by the skeleton
- where: frontend/e2e-components/clips-row.spec.ts:96-126 (core 8fe5c6805), fixture frontend/e2e-components/fixtures/clipsRow.tsx:40
- rule: docs/process/testing-and-comments.md "After GREEN" (which mutation this case kills); spec item 9 "skeleton cards at final size", I8
- condition: the spec measures `li[data-testid="clip-skeleton"]` itself. In a grid row the `li` is stretched to the row's height. Measured with the built fixture (Pixel 5 context): at 1280 the grid has 5 columns, so the skeleton is the 7th item and shares row 2 with card 6 (both top 298); its `li` is 229.5px while its first child is 156px, i.e. the `li` height is the row's, whatever the skeleton's own content is. At 390 (2 columns) the skeleton sits alone in row 4 and its `li` is its own content (200.25), so the 390 case is the only one that can see a skeleton shorter than a card. A skeleton taller than a card is still caught at both widths through the cards' `a` heights. Also the spec runs only in the Pixel 5 (coarse) project, and only the `CoverGrid` skeleton is measured; `ClipShelfBlock`'s loading skeletons (the Home shelves, where R-5 saw the jump) are never compared against their own cards, so a class passed only there (ClipShelfBlock.tsx:122-125) is unmeasured.
- what escapes today: nothing that the 390 case does not also catch, as long as the 390 case stays. Measuring the skeleton's content (last child bottom - first child top) instead of the `li` box would make the 1280 case real.
- frequency 0, impact 2

### F-2 (A, test rule) jsdom tests assert Tailwind class names for a layout property, and the e2e already kills the same mutations
- where: addons/knowledge frontend/clipsapp/__tests__/ClipCard.test.tsx:78-81 (15d30c7, `toHaveClass("min-h-[2.9em]", "line-clamp-2")`); frontend/clipsapp/__tests__/ClipShelfBlock.test.tsx:102-109 (2c44f41, className regex on `w-[150px]`)
- rule: docs/process/testing-and-comments.md "Layout and overflow need the real environment" (matching text cannot verify a layout property) and "After GREEN" (delete a test no mutation needs)
- condition: both check a string, so they fail under a behaviour-keeping refactor (e.g. `min-h-[43.5px]`, or a 150px width moved into a shared constant) and pass a broken layout (e.g. `leading` changed so 2.9em is no longer two lines). The core e2e covers both properties: removing `min-h-[2.9em]` makes the one-line cards shorter than two-line ones at both widths (clips-row.spec.ts:124); giving the grid skeleton the 150px strip width on a coarse pointer makes the 390 skeleton 150px wide, its 4:3 cover 112.5px instead of 126.75px, and its height about 186px against 200.25px (fails clips-row.spec.ts:125).
- fix direction: delete both jsdom cases (the e2e holds the property).
- frequency 0, impact 1

### F-3 (A) With the clip form open, switching Home / Library / a shelf page moves the form up or down
- where: addons/knowledge frontend/pages/clips.tsx:257 (d60b2c7, ea7f465)
- rule: none broken; the per-view top padding was tuned for the first section (Home 36px) and the menus (Library 24px), but the clip form is the first child of the same wrapper (clips.tsx:258-262) and stays mounted across views (R-5: "the form ... stayed mounted across Home -> Library -> shelf")
- condition: open "Clip a web page", then press the Library tab (or a See all): the open form jumps 12px up (28 -> 16px), and 8px down again on a shelf page (24px). Before the split it stayed put.
- frequency 1, impact 1 (a small jump; nothing is lost)

### F-4 (B) A `created_at` that is not a date now throws instead of drawing "Invalid Date"
- where: frontend/src/lib/format.ts:21-41, called from addons/knowledge frontend/clipsapp/ClipCard.tsx:69 (d60b2c7)
- condition: `new Date(bad).getTime()` is NaN, every comparison is false, the last branch calls `format(Math.max(1, NaN), "year")`, and Intl throws RangeError (checked in node: "Value need to be finite number"). The card list would unmount instead of showing one bad age. d60b2c7 had to change clipsPage.test.tsx:1058 because its fixture minutes reached `09:60`, which is exactly this. The backend always sends a valid timestamp, and ReadingCard has the same exposure, so this is misuse/fixture-only.
- frequency 0, impact 5

## Design differences

### D-1 Ages: "N hours ago" for today and "N months/years ago" for old clips, where the artboard shows "今日" and a date ("8月31日")
- design: ClipsHome.dc.html:132-148
- implementation: formatRelativeAge (lib/format.ts:35-41) never says "today" and never falls back to a date. Spec item 9 (docs/specs/clips-frame.md:318-319) now names formatRelativeAge, so this is the approved behaviour; listed so the owner accepts it explicitly. The spec's own example "today" is not something formatRelativeAge produces (en gives "now" / "3 hours ago").
- visible: at a glance

### D-2 One-line titles now leave a blank line under them (design-check D-7, introduced by 15d30c7)
- design: two-line clamp with no reserved height (ClipsHome.dc.html:21)
- implementation: `min-h-[2.9em]` (ClipCard.tsx:102); every card is two title lines tall. This is what makes skeleton and card agree (spec item 9), so it trades the artboard for I8/item 9; needs the owner's acceptance.
- visible: side by side

## Checked, no defect

- formatRelativeAge cost: two `Intl.RelativeTimeFormat` per call, about 0.024 ms in node; 200 cards about 5 ms per full re-render. Not a concern.
- `now` is now unused in `useMetaLine` (`_now`, ClipCard.tsx:65); harmless plumbing, ages are taken at render time as in the Reading app.
- Ran `pnpm exec playwright test --config=playwright-components.config.ts clips-row clips-primary-action`: 22 passed. The no-scroll checks read `document.documentElement.scrollWidth` against `innerWidth` on the real `ClipsPage`, which includes overflow hidden by an ancestor; they would see a widened page.

TOTAL: 6 findings
