# r2 — Clips fix commits (re-review of r1 T1-T4, D3, D4, A7)

Reviewer: fresh process, no implementation context.
Commits (knowledge addon, read with `git show`): 7aeb478 8f58889 04bd74b 39b7e69.
Line numbers are at 39b7e69. Spec: `docs/specs/clips-frame.md` with step 5 as revised by
978c60ef5 / 2d155d130 ("re-asks every page it has loaded ... and merges them").

Threat model: personal tool, owner is the only user, no adversary.
A = silently wrong in normal use. B = odd input / misuse. T = mutation survivor.

Baseline: the command below, 217 tests, all pass at 39b7e69.
How the mutations were applied and restored is under "Mutation (T)".

## r1 items: are they closed?

| r1 | Fix | Verdict |
|---|---|---|
| T1 Library not pinned to the Target's conditions | 8f58889 `I1 %s asks with the Target's conditions` (By tag, No grouping) | Closed: the r1 mutations (`loadGridPage` / `loadTagShelves` sending only type/origin) are now killed |
| T2 Target change does not restart the Library | 8f58889, two `step 4 a Target change starts ... over` tests | Closed: dropping `target.key` from either scope is killed |
| T3 shelf pages replacing on refresh | 8f58889 + 39b7e69 (shelf page refresh test, now multi-page) | Closed: `replaceOnRefresh: true` for every shelf is killed |
| T4 title link writing a trust tier | 8f58889 `I5 opening an Unverified row's clip writes no trust tier` | Closed: `onClick={onVerify}` on the row's link is killed |
| D3 Library spacing 24/48 → 40/40 | 04bd74b `pb-10`, `gap-10` | Matches the design value. No test (jsdom); see "also survived" |
| D4 Unverified heading 16 → 8px | 04bd74b `ShelfHeading tight` (`mb-2`) on Home only | Matches. No test; see "also survived" |
| A7 sr-only "Unread" widening the page | 39b7e69 `relative` on the card's `Link` | Closed: the absolutely placed span's containing block is now the link, inside the strip's `overflow-x: auto`. Pinned by a class/containment unit test (killed when `relative` is dropped); not measured in a browser here |
| r1 A1 / A2 (refresh re-asked page 1 only; stale card shifting the boundary) | 39b7e69 re-asks `ceil(drawn / 60)` pages and drops unnamed cards | Closed for 2+ pages; A2 remains on a one-page grid (A3 below) |

## 7aeb478: acceptance-test edits judged against the spec

None weakens a claim the spec makes.

- `clipsFrame.test.tsx:160` `findByText("Unread")` → `findByRole("heading", {level: 2, name: "Unread"})`:
  the claim is "the shelves still load" (§2, count fails). Every Unread card now carries an sr-only
  "Unread", so the text query matched several nodes and threw; the heading is the shelf itself.
  Stricter, not weaker.
- `clipsFrame.test.tsx:263` closing the form: `urlField()` null → `not.toBeVisible()`. Step 5 says
  only "opens and closes"; nothing in the spec says closing unmounts, and keeping it mounted serves
  I11's intent. The region is hidden with the `hidden` attribute (`pages/clips.tsx:259`), which
  jsdom's `toBeVisible` honours, so the assertion is real (it would fail if close did nothing).
- `clipsFrame.test.tsx:372` `getByText("C clip 1")` → `findByText`: the claim is that Recently
  opened ignores the Target; C clip 1 is outside `sf-trip`, so it can only come from that shelf.
  Waiting for it does not hide a blanking (there is no earlier drawn state to lose).
- `clipsLibrary.test.tsx:285-301` title paging: the spec fixes `sort=title order=asc` and draws
  in the server's order; it says nothing about natural number order. With text order the 60th of
  62 titles is "K clip 7" and page 2 is "K clip 8", "K clip 9", which the edit asserts, including
  that "K clip 9" is absent before page 2. Same strength as before (page 1 bounded, page 2 drawn
  after the scroll, exactly pages 1 and 2 asked).

The later edits to acceptance tests in 39b7e69 (`clipsPage.test.tsx:1289` 3 → 4 grid calls,
`clipsLibrary.test.tsx` shelf page refresh) follow the revised step 5 (two drawn pages, both
re-asked) and keep the "later page stays" assertions.

## Bucket A

### A1. A page loaded while a multi-page refresh is on its way is dropped when the refresh lands
- `clipsapp/usePagedClips.ts:104-106` — `unnamed` is filtered against `base` (the list at answer
  time), not against the list the refresh asked for. During a refresh `phase` stays `ready`
  (`:81`), so `loadMore` can append page N+1 meanwhile; when the N-page refresh answers, every
  card of page N+1 is "not named" and `pages > 1`, so it is dropped. Revises I25 ("A refresh never
  blanks ... cards already drawn").
- Condition: No grouping grid or a shelf page with 2+ pages drawn, the viewer scrolls to the end
  while a `knowledge.clip.ready` / `onClipAdded` refresh is in flight.
- Self-heals in practice: the held list changes, `loadMore`'s identity changes, `useNearEnd`
  re-observes and the sentinel (now higher) fires, so page N+1 is asked again. Seen as the cards
  flashing out and back with a scroll jump.
- Frequency 0-1, impact 1. Restricting the drop to cards that were drawn when the refresh started
  (compare against `drawn`, not `base`) removes it.

### A2. (author's choice) A card pushed past the re-asked range leaves the screen
- `usePagedClips.ts:86-89, 104-106`. With N full pages drawn and a clip added that sorts above
  them (every add under Newest), the N re-asked pages end one card earlier and the old last card
  is dropped; it comes back as page N+1 (`floor(60N/60)+1`), which `useNearEnd` asks at once if
  the end is within 400px, else when scrolled to.
- Spec tension: step 5's "later pages already drawn stay" and I25's "never blanks ... cards
  already drawn" read literally say the card stays; step 5's "merges them in its sort order" and
  I3's reachability are what the drop protects (the next page starts at the server's boundary).
  Judged acceptable: nothing is lost or unreachable, and the alternative (keep it) reintroduces
  r1 A2's boundary shift. For the human only if the literal reading of I25 is meant.
- Frequency 1, impact 1.

### A3. A one-page refresh still keeps a card that left the shelf on the server
- `usePagedClips.ts:105` (`pages === 1` keeps every unnamed card). With ≤ 60 drawn, a clip trashed
  or retagged elsewhere stays drawn after a refresh (opening it 404s), while the same event on a
  2-page grid removes it. No card is lost to paging (the next page is `floor(61/60)+1 = 2`, and the
  card that moved up is in the fresh page 1). Unchanged behaviour from r1, now inconsistent
  between one page and several.
- Frequency 1, impact 3. Below threshold.

## Mutation (T)

Command (as given): `cd frontend && NO_COLOR=1 pnpm exec vitest run
src/addons/knowledge/__tests__/clipsLibrary.test.tsx src/addons/knowledge/__tests__/clipsHome.test.tsx
src/addons/knowledge/clipsapp src/addons/knowledge/__tests__/clipsPage.test.tsx` — 217 tests.
`frontend/src/addons/knowledge/**` are per-file symlinks into `addons/knowledge/frontend`, so each
mutation edited the addon file; original bytes were saved and written back after each run, and
`git -C addons/knowledge status --short` is clean at the end.

Killed (multi-page refresh merge): only page 1 asked; page count `floor`; one page fewer; stale
cards kept on a multi-page refresh; unnamed cards dropped on a one-page refresh too; answers merged
in reverse page order; `heldRef` never updated; count from the last page instead of the first.
Unverified paging: next page `ceil(shown/60)+1` (pages loaded instead of rows shown) is killed by
three tests. r1 re-checks: T1a, T1b, T2a, T2b, T3, T4, A7 `relative` all killed.

Survivors:

### T1. A refresh whose later page fails is not pinned to "changes nothing"
- Mutation: a later page's failure swallowed as an empty page
  (`fetchPage(i+1).catch(() => ({items: [], count: 0}))` for i > 0, `usePagedClips.ts:90`)
  survives. Defect let through: with 2+ pages drawn, a refresh during which page 2 fails drops
  every card after the first 60 (they are unnamed and `pages > 1`). §2 "A later page fails: the
  drawn cards stay"; I25.
- Frequency 1, impact 5. A unit test in `usePagedClips.test.tsx` (two pages drawn, refresh with
  page 2 rejecting → items unchanged) kills it.

### T2. A row being verified is not pinned through a multi-page refresh
- Mutation: `(pages === 1 || saving.current.has(item.id))` → `pages === 1` (`:105`) survives. The
  existing "refresh while saving" test runs on Home (one page). Defect: on an Unverified shelf
  page with 61+ rows, a refresh that lands while a row is saving and no longer names it (the
  write committed first, or a new clip pushed it past the range) removes the row before the
  save's result; if the save then fails, "Couldn't save" has no row. Step 8 "neither removes nor
  re-adds that card; the save's result decides it".
- Frequency 0-1, impact 3.

### T3. A verified row re-added by a multi-page refresh already on its way
- Mutation: the `gone` filter skipped when `pages > 1` (`:100`) survives; r1's kill of the same
  mutation covered the one-page path only. Defect: on a 61+ row Unverified shelf page, a row
  verified while a refresh is in flight comes back with its button, and the count is one high.
- Frequency 0-1, impact 3.

### T4. No dedup across re-asked pages
- Mutation: the `findIndex` dedup (`:94`) removed survives. Defect: a clip added between the
  page-1 and page-2 requests of one refresh shifts a card into both answers; it is drawn twice
  (duplicate React key) until the next refresh. Frequency 0-1, impact 1.

### T5. A scope change after scrolling asks only page 1
- Mutation: `drawn.scope !== scope` dropped from the page-count condition (`:87`) survives. Defect:
  a Target or sort change on a grid with N pages drawn asks N pages of the new scope at once
  instead of starting over from page 1 (step 4). Everything drawn is correct; only extra requests.
  Frequency 3, impact 1.

Also survived, not findings: `single` ignoring `cap` or ignoring `replaceOnRefresh` (`:85`) —
equivalent here: capped Home shelves never exceed one page except a saved card past the cap, and
their `fetchPage` ignores `page` (`paged: false`), so the extra page is page 1 again, deduped;
Recently opened is one page of `WATCH_HISTORY_MAX`. D3 (`gap-10` → `gap-12`, `pb-10` → `pb-6`)
and D4 (`tight` dropped) survive: spacing classes, which jsdom does not lay out; the rule sends
layout to e2e, impact 1.

## Prose that invites a wrong change

### P1. `usePagedClips.ts:49-52` says the refresh "keeps every drawn card they do not name, so nothing already on screen leaves"
- Lines 104-106 drop unnamed cards when more than one page is re-asked. A reader trusting the
  docstring would "fix" the drop back into r1 A2. Delete the clause.

## Author's choices, judged

- Several pages re-asked → an unnamed card is dropped, except one being saved: accepted. It is
  what makes `shown` match the server's boundary (I3) and closes r1 A2; the saving exception
  follows step 8. Gaps: A1 (race with `loadMore`), T2/T3 untested on the multi-page path.
- Any page failing → nothing changes: accepted, matches §2 and I25; untested (T1).
- Cards pushed past the re-asked range vanish until scrolled to: accepted (A2); `useNearEnd`
  re-asks immediately when the end is near, so the viewer at the bottom sees a flicker at most.

TOTAL: 9 findings
