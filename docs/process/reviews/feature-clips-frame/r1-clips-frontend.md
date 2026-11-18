# r1 — Clips frontend (SPEC-ADDON-138 / 139, frontend half of 140)

Reviewer: fresh process, no implementation context.
Commits (knowledge addon): 64508ac ce107e5 90f62ca 9b4ddbb ca54b79 501a0e7 ca6283a 3b1229f.
Core: f39607b0d (TargetMenu `defaultTargetOrigin`), read only for the prop.
Round 2 (added at the lead's request): ef4f3ad (ClipCard's unread text, ClipShelfBlock on
`pointer-coarse:` variants). 41d4d5a (acceptance tests) is not reviewed. Findings A7, A8, T8 are
ef4f3ad's; line numbers for ClipCard / ClipShelfBlock in those are at ef4f3ad.
Line numbers are at 3b1229f.

Threat model: personal tool, owner is the only user, no adversary.
A = silently wrong in normal use. B = odd input / misuse. D = visible difference from the agreed
design. R = a written rule. T = mutation survivor (test gap), scored by the defect it lets through.

## Bucket A

### A1. A clip added mid-list is not drawn on a paged grid already scrolled past page 1
- `clipsapp/usePagedClips.ts:85-91` (refresh re-asks page 1 only), spec item 5 vs Revises I25
  ("appears without a reload wherever the current Target, grouping and sort place it within what
  is already loaded").
- Condition: Library No grouping sorted by Title (or a tag shelf page under Title), two or more
  pages drawn, a clip is added through the form whose title sorts into page 2+. The count rises;
  the fresh page 1 does not contain it, `shown` stays 120, the next page asked is
  `floor(120/60)+1 = 3`, which starts after it, so it is not drawn until reload.
- Spec tension: item 5 says only the first page is re-asked; I25 says it appears within what is
  loaded. One of the two has to give; this is for the human.
- Frequency 1, impact 3.

### A2. A drawn card that left the shelf on the server shifts the page boundary and hides one clip
- `clipsapp/usePagedClips.ts:89-91, 124` — the refresh keeps every drawn card the fresh page does
  not name, and `shown` counts it; I3.
- Condition: a shelf page or the No grouping grid with 2+ pages drawn; a clip on page 1 is
  trashed or retagged from another tab/device, then a `knowledge.clip.ready` refresh arrives. The
  stale card stays and counts in `shown`, so the next page starts one past the server's boundary
  and the clip that moved up across it is never drawn in this scroll.
- Frequency 0-1, impact 5. Below threshold.

### A3. (3b1229f only) Coarse-pointer loading skeletons have zero width
- `clipsapp/ClipShelfBlock.tsx` @3b1229f: in the strip the skeleton `<li>` is `min-w-0` with only
  empty children, so as a flex item it shrinks to 0 and the shelf shows no skeleton on touch;
  §9 Loading ("skeleton cards at final size").
- Fixed by ef4f3ad (`ITEM` with `pointer-coarse:w-[150px] pointer-coarse:shrink-0` on the
  skeleton too), but no test pins the fix (T8, E1).
- Frequency 8 (every touch load), impact 1.

### A4. The Unverified shelf page loads as a grid of 4:3 card skeletons, then becomes rows
- `clipsapp/ShelfPage.tsx:70-84` — the rows branch needs `phase === "ready"`, so loading falls
  through to `CoverGrid` skeletons; §9 Loading, the page is "a list of the same rows" (item 8).
- Condition: every visit to `?view=shelf&shelf=unverified` and every later page (no row skeleton
  for `more === "loading"` either). Visible jump, nothing wrong.
- Frequency 3, impact 1.

### A5. Target with no clips + drive count failed: Recently opened is not drawn
- `pages/clips.tsx:162` (`targetHasNone && driveCount === null` → `body = null`), §2 / §3
  "Either count fails: no empty state is drawn; shelves that answer are drawn".
- Condition: a Target with 0 clips and the drive-wide count fails. Home draws nothing, though
  Recently opened (target-free) would answer; also no "Try again".
- Frequency 0-1, impact 3.

### A6. Clearing and re-entering the same nickname reuses the earlier dots
- `clipsapp/clipMeta.ts:98` resets only when the key differs from the last one asked; a null key
  never reaches `ensureDots`, so A → (none) → A keeps A's old set. §3 Profile ("clears every dot
  and asks again").
- Condition: nickname cleared and set again to the same value without leaving the page; dots are
  those of the first visit (only stale if another device opened clips meanwhile).
- Frequency 1, impact 1.

### A7. (ef4f3ad) The hidden "Unread" text makes a touch phone's page scroll sideways
- `clipsapp/ClipCard.tsx:101` (`{dot && <span className="sr-only">…}`) with
  `ClipShelfBlock.tsx:21-22` (the coarse-pointer strip); I9 (no horizontal page scroll at 390px).
- `sr-only` is `position: absolute` with its static position. No ancestor between it and the
  page is positioned (`Link` is `block`, the `li`, the strip `ul`, `PageFrame` and AppShell's
  `<main>` are not), so its containing block lies outside the strip's `overflow-x: auto` and the
  strip does not clip it: the span of a card scrolled off to the right extends the document.
- Measured in Chromium (Playwright, 390px, the same structure: 12 cards 150px wide, gap 12,
  in a `flex overflow-x-auto` list, one `sr-only` span per card): `documentElement.scrollWidth`
  390 without the span, **1798** with it; 390 again with `position: relative` on the link.
- Condition: a phone (coarse pointer), Home with a profile — every Unread card carries the text —
  or any shelf with a dotted card past the screen edge. The whole page pans sideways.
- Frequency 8, impact 3 → 24, over the threshold. The fix suggested by the measurement is
  `relative` on the card's link (or on the `li`). An I9 e2e at 390px run with a coarse pointer
  (`hasTouch`) would have caught it; one run with a mouse cannot, since the strip is not drawn.

### A8. (ef4f3ad) On a mouse the hidden cards past the shelf's capacity still fetch thumbnails
- `ClipShelfBlock.tsx:111,120-123` — every item is rendered, the overflow `hidden`
  (`display: none`). A `loft://` cover is an eager `<img>` (`ClipCard.tsx:51`, `loading` unset
  for internal thumbnails), which Chromium fetches even under `display: none`; external covers
  are `lazy` and are not.
- Condition: every Home / By tag shelf on a mouse: up to 12 thumbnail requests where 3-5 cards
  show. Nothing wrong is drawn. Frequency 8, impact 1.

## Bucket B

- B1. `clipsapp/useTagShelves.ts:76-83` — a later By-tag answer whose shelves are all already
  drawn (non-empty) leaves `hasMore` true at the same offset, so `useNearEnd` re-asks the same
  offset while the sentinel stays visible. Needs counts to reorder between the first and the later
  request. Frequency 0, impact 3.
- B2. A tag literally named `no_tag` is the Untagged key (`requests.ts:26`, core `shelves.py:36`);
  its See all opens `tag:no_tag`, which asks the untagged files. Frequency 0, impact 3.
- B3. `usePagedClips.ts:126` / `useTagShelves.ts:72` — later pages are never aborted; a Target
  flipped A → B → A before the page answers appends A's stale page to A's new list (same scope
  string). Frequency 0, impact 3.
- B4. `pages/clips.tsx:56-57` — `blockedFor` is one nickname: after a 400 for A, switching to B
  and back to A keeps A without a profile until remount, though "the nickname changed".
  Frequency 0, impact 3.

## Design differences (D)

Judged from code against `design/ClipsHome.dc.html` and `design/ClipsLibrary.dc.html`, after the
spec's declared differences (one tint token, ShelfBlock columns/rows, no-artboard states).

- D1. Library menus (`clipsapp/Library.tsx:33,46`): design = filled sand pills (#e5e5e0, no
  border), label only ("タグ別 ⌄", "クリップした順 ⌄"), primary text. Code = default
  `ToolbarMenu`: bordered card pill with a leading Tags / ArrowUpDown icon and muted text.
  (`ToolbarMenu` has a `filled` variant, but it shows label + value, so neither variant matches
  exactly.)
- D2. Shelf headings (`clipsapp/ClipShelfBlock.tsx:70-77`): design h2 20px with the count 15px
  inside the heading; code 18px (`text-lg`) and count 14px — ShelfBlock's sizes reproduced.
- D3. Library spacing (`Library.tsx:32,104`): design 40px menus → first shelf and 40px between
  shelves; code 24px (`pb-6`) and 48px (`gap-12`).
- D4. Unverified heading → first row (`Home.tsx:124` via `ShelfHeading` `mb-4`): design 8px,
  code 16px.

Matches checked and found equal: card 4:3 cover / dot 10px at 10,10 with 2px ring / title 15px
semibold two lines / meta 12px "site · N min · age" on Home and shelf pages, "site · N min" in
the Library; Unverified row 72×54 thumbnail, one-line title, "site · age", button at the right;
Home order Unread (count) → Recently opened → Unverified (no count), 48px between sections;
Library: two menus and nothing else above the shelves; each shelf tag, count, See all.

## Rules (R)

- R1. `clipsapp/ClipShelfBlock.tsx` `ClipGrid` (No grouping, shelf pages) always uses
  `cardGridTemplate(0, …)` = `repeat(auto-fill, minmax(min(200px, calc(50% - 10px)), 1fr))` and
  never measures. DESIGN.md "Measure against the container" → Card grids: "Do not write … 
  `repeat(auto-fill, …)` into a card grid". Rendered result is container-based and looks right;
  frequency 0 of a visible error, impact 1. Also `200px` vs "keep thresholds in rem".

## Mutation (T)

Command: `cd frontend && NO_COLOR=1 pnpm exec vitest run src/addons/knowledge/__tests__/clipsPage.test.tsx src/addons/knowledge/clipsapp`
(165 tests; Notes target tests added for I10). One mutation at a time, file restored byte-for-byte
after each; `git status` clean at the end.

Killed: origin dropped from clip conditions; target overriding the fixed type/origin; drive
count without origin; `defaultTargetOrigin` removed; tag/unverified shelf page without target
params; count / shelves ignoring member ids; Recently opened hidden under an empty Target;
Recently opened requiring a target; dots without `opened=false`; dots without `ids`; dots asked
without a profile (`dotsKey: nickname`); `hasDot` ignoring the key; `withProfile` ignoring the
400; dot 400 not reported; dots not reset on a new nickname; stale-epoch dot answer accepted;
Unread 400 not reported; next page `ceil`, `+2`; drawn rows not skipped; no "adds nothing" stop;
count not decremented on remove; removed card re-added by an in-flight refresh (first page and
later page); saving card capped out; trust write on mount without a press; wrong tier; failure
removing the row; button not disabled while saving; Notes default app key changed; `choose`
writing Notes' key; read ignoring the app; Clips menu given Notes' key; clip form keyed by view;
form unmounted on shelf pages; form unmounted on close; tag offset +1; tag `hasMore` false;
refresh keeping later tag shelves; Untagged label/See all/key; event id not re-asked; failed
covers / dots never retried; scope count not refreshed; held event refreshing on mount; grid
refresh replacing.

Survivors (measured against the 165 tests of the command above; the acceptance tests of 41d4d5a
were not run, so some of these may already be pinned there):

### T1. Library By tag and No grouping are not pinned to the Target's conditions (I1)
- Mutations: `loadTagShelves` and `loadGridPage` sending only `type`/`origin` instead of
  `clipConditions(target)` (`requests.ts:151,176`) — both survive. The I1 test
  ("sends the target's conditions … on every listing") does not visit the Library.
- Defect let through: with a Smart Collection / collection Target the Library silently shows
  every clip of the drive. Frequency 5 (every Library visit under a non-default Target),
  impact 8.

### T2. A Target change does not have to restart the Library (spec item 4, §3)
- Mutations: dropping `target.key` from the No grouping scope (`Library.tsx:137`) and from the
  By tag scope (`useTagShelves.ts:35`) — both survive. Since the effects depend on `scope`, not on
  `fetchPage`, the Library would keep the previous Target's clips after a Target change.
- Frequency 3, impact 8.

### T3. Shelf pages replacing their cards on a refresh
- Mutation: `replaceOnRefresh: true` for every shelf (`useShelfData.ts:61`) survives; only the
  No grouping grid's merge is tested through the page. Defect: a refresh on a shelf page with 2+
  pages drawn drops every card after the first 60 (Revises I25 "A refresh never blanks … cards
  already drawn"). Frequency 3, impact 5.

### T4. Nothing pins "only when pressed" against the row's own link (I5)
- Mutation: `onClick={onVerify}` added to the Unverified row's title link (`ClipRow.tsx:35`)
  survives. Opening a clip from the Unverified shelf would silently mark it verified.
  Frequency 3, impact 8. (A write-on-mount mutation is killed.)

### T5. Clip form unmounted while the Target is looked up
- Mutation: `clipMounted && target.status !== "lookingUp"` (`clips.tsx:258`) survives. A Target
  change to a member Smart Collection would drop what was typed. Outside I11's literal list
  (Home/Library/shelf moves), inside SPEC-ADDON-100 I27's intent. Frequency 1, impact 5.

### T6. A profile-only shelf page after a 400 is not sent Home
- Mutation: `leaveForHome` tested on `!nickname` instead of `!withProfile` (`clips.tsx:129`)
  survives; the page would stay on Unread with "Couldn't load". §3 Profile. Frequency 0-1,
  impact 3.

### T7. The drive-wide count not re-asked on a refresh
- Mutation: `loadDriveClipCount` scoped load given a constant refresh (`clips.tsx:112`)
  survives; with a non-default Target holding 0 on an empty drive, a clip added outside the
  Target leaves "No clips yet". Frequency 0-1, impact 3.

### T8. (ef4f3ad) Nothing pins the coarse-pointer strip
- Survivors against the same command: E1 skeleton `li` without `ITEM` (the A3 bug back); E3
  `pointer-coarse:flex` removed from the list (touch gets a 2-column grid of 150px items with
  every spill card shown); E4 / E5 the coarse skeleton count (`pointer-coarse:block` /
  `pointer-coarse:hidden` dropped). Killed: spill not shown on coarse, sr-only dropped or always
  present, 150px items on a mouse, spill shown on a mouse.
- jsdom applies no Tailwind, so the unit test can only read class strings; the testing rule
  sends layout to e2e. An e2e-components check with a coarse pointer at 390px (strip is a
  sideways list of 150px cards, skeletons visible, `scrollWidth === clientWidth`) would pin E1,
  E3 and A7 together. Defect let through: E3 impact 5, frequency 8 on a phone if introduced.

Also survived, not findings: dots asked for the Unread shelf too (`CoverShelf.tsx:22`, one extra
request, every card already has its dot; impact 1); `hasDot` on Recently opened (equivalent:
its key is null so `hasDot` is false either way); Recently opened given `props.target`
(`Home.tsx:48`, equivalent: `useShelfData` scopes `recent` with `"-"` and `loadShelfPage` returns
before reading the target).

Checked, no finding: `seenReady` uses `undefined` as "nothing seen"; the real `useWebSocket`
returns `null` before any event, so the first `knowledge.clip.ready` after mount does refresh.

## Author's choices, judged

- ClipShelfBlock in the addon reproducing ShelfBlock: accepted. Columns via `useCardColumns`
  with 200/20, `rowsFor`, capacity slice, heading markup, See all aria-label all match
  ShelfBlock. Deviations: row gap 24px (`gap-y-6`), a `LoadFailed` with text instead of
  `RetryButton` (spec asks "Couldn't load" + "Try again", so correct), and the coarse strip (A3).
- A saving card kept past the cap: accepted; it is what item 8 asks ("neither removes nor
  re-adds"), and Home can show 6 rows for the length of a save.
- Unknown URL values replaced: accepted; `rewrittenHref` keeps what it can read and drops
  `sort` on non-tag shelf pages, matching item 11's URL shape.
- Unverified rows with no unread dot: accepted; item 7 names "cards", the design row has none.
- Covers (and dots) asked for every fetched item, not only the drawn ones: accepted; Home asks
  up to 12 where 3-5 are drawn, ≤ 1 extra request per shelf, and a resize then draws without a
  wait. Nothing wrong is shown.

TOTAL: 25 findings
