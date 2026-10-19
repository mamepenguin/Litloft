# Review: search operators PR 3 (value suggestions), round 1

Reviewed: a32807ed7fe7295203b2f165a5771a990989bc8c (range ddb7a530d..a32807ed7), worktree /Users/libre/Sources/video_share-sugg.
Baseline: the 6 search test files pass (171 tests).

## Findings

### F1 [introduced] A (test gap), invariant 10: no test holds "Enter with nothing highlighted still opens the search page while suggestions are shown"
- Surviving mutation M28 (GlobalSearch.tsx Enter handler): prepend `if (selectedIndex < 0 && suggestions.length > 0) { openJump(suggestions[0]); } else ...` so a bare Enter completes the first suggestion instead of submitting. want=kill, **survived** (171/171 in the six search files).
- The code is correct today (probe: `tag:旅` with suggestions visible, bare Enter -> `router.push("/drive/main/search?q=tag%3A%E6%97%85")`). The only operator-Enter test (`page jump with operators`) runs with `getDriveTags -> []`, so no suggestion is on screen when it presses Enter. The invariant is declared for this PR and nothing holds it; the natural "auto-accept the top suggestion" edit would pass CI.
- Cheapest hold: one `press("Enter")` case in the new `operator value suggestions` describe (tags mocked), asserting the push.

### F2 [introduced] A (test gap), invariant 9: the "already in the query" wiring and its case-insensitivity are not held
- M18b (useLauncherRows.ts): `used = []` instead of `parseSearchQuery(query.slice(0, active.replaceFrom)).tags`. want=kill, **survived**. The unit test holds `suggestValues`' filter, but nothing checks that the component passes the tags of the query to it; deleting the wiring re-offers a tag already typed (`tag:旅行 tag:` -> 旅行 offered again).
- M12 / M12b (searchQuery.ts): drop `.toLowerCase()` on either side of the `used` comparison. want=kill, **survived**. The unit row is titled "left out, case-insensitively" but its data (`旅行` vs `旅行`) has no case, so it cannot tell. User-reachable under the mutation: drive tag `trip`, query `tag:TRIP tag:` -> `trip` offered again (probe on the real code: correctly left out).
- Hold: change the unit row's `used` to a differently-cased ASCII tag (one row edit), and one component case typing `tag:X tag:` (or put a used tag in the existing Enter test's query).

### F3 [introduced] B (test gap, low), none: full-width space before the token is not held
- M5 (searchQuery.ts): remove `q.lastIndexOf("　")`. want=kill, **survived**. Probe on the real code: `京都　tag:旅` offers 旅行/旅館 and completes to `京都　tag:旅行 ` (correct). Under the mutation the whole query is one token, the PARTIAL regex rejects it and the block goes silent (fails to silence, not to nonsense). A Japanese IME in full-width mode types `　` routinely, so this is the most likely separator the table is missing; it is one row in the existing `activeOperatorValue` table.

### F4 [introduced] B, none (candidate for a missing invariant, see Q1): under a scope, `type:` suggests kinds the scope makes impossible
- `suggestValues` for `type` returns the whole vocabulary regardless of the scope's kind. In a video-scoped modal, `type:` offers `image`, `audio`, ...; picking `image` produces a query whose intersection is empty, so the modal "requests nothing" and shows No results. Reachable by any user in a scoped modal. Tag counts under a scope are also drive-wide (spec says drive-wide, so that part is by design).

### F5 [introduced] B, none: the typed value is offered back as its own completion
- `type:video` (or `is:favorite`, `tag:旅行`) is still the "active" token until a space follows, so the block shows the value already typed (probe: `type:video` with one video result -> suggestions `["video"]`; first ArrowDown + Enter only appends a space, value `"type:video "`, no navigation). With results present the first ArrowDown lands on this no-op row instead of the first file. Not an invariant break (invariant 8 holds); UX only.

### F6 [introduced] B, invariant 1 (wording): every modal opening now issues `getDriveTags(drive)`, operators or not, scoped or not
- `useDriveTagNames(open, drive)` is not gated on scope or on an operator being typed, so a query without operators no longer produces "the same requests as before" in the literal sense of invariant 1. The touch-point list declares "a new getDriveTags read when the modal opens", so this is known; recorded so the supervisor can decide whether invariant 1 is meant per query (holds) or per opening (does not). Results for such queries are unchanged (the suggestion memo returns `[]` and `rowOrder` is identical; probe and M-series confirm).

### F7 [introduced] B, none: suggestions follow the end of the query, not the caret
- `activeOperatorValue` reads the last whitespace-delimited token. With the caret moved back into an earlier word, the block still offers values for the last token and completion rewrites the end. Spec §3 said "when the caret sits in a value"; this looks like a deliberate simplification (spec allows §3 details to settle in review), recorded only so it is a decision, not an accident.

## Survivors that are painting, fixture-equivalent, or unreachable (no test proposed, per the standing decision)

- M2 drop `focusInput()` after completion: jsdom keeps focus on the input anyway (the keyboard path never blurs it); matters only for a click. Painting/focus, want=live.
- M19 / M20b (Go to / Folders offsets back to their old values) and M21 (suggestions last in `jumps` while painted first): only observable when suggestions and page/folder jumps show together, which needs a page, collection or folder name containing the typed `op:partial` text. Near-unreachable; want=live.
- M20 file rows / "view all" tail offset without `suggestions.length`: painting only (highlight and `scrollIntoView` target drift by the suggestion count while Enter still acts on the right file). Reachable (`type:video` shows a suggestion and results together) but painting; per the standing decision, listed only.
- M16 (drop `browsing` from the suggestion gate): browse mode renders `BrowseRows`, and its keys go through `browseKeyAction`, so suggestions in `jumps` are inert there (probe R10: none shown). Defensive, want=live.
- M17 (drop `!drive`): the input is disabled without a drive. want=live.
- M8 (drop NFKC on the operator name): only full-width letters (`ｔａｇ：`) reach it. want=live, low.
- M25 (key without the operator): values of different operators never share one list. Equivalent, want=live.
- M30 (`getDriveTags("main")` hard-coded): fixture-equivalent (only drive `main` is used where tags are asserted); the drive-switch guard itself is shared `useDriveOwned` and is killed by the destinations/folders drive-switch tests (M31).
- M32 (error path leaves the previous value): equivalent on first load and on a drive switch (ownership check hides it); only differs when the same drive becomes locked while the modal state survives, which Lock's full reload prevents.

## Questions

1. **Reaches outside the PR 3 touch points.** (a) Every consumer of GlobalSearch's launcher index space, not only `openJump`: `moveHighlight`'s identity recording, the `rowOrder` identity effect, ArrowDown `maxIdx`, the Enter dispatch, `launchKeyAction` (ArrowRight on a suggestion row returns null, caret moves normally), and `scrollIntoView` via `data-search-item`. All behave (probes R7/R8: highlight held by key across late results and late tags). (b) The **scoped modal**: tags load and suggestions show under a scope, while every other launcher loader is off there (`open && !scope`). This is the one reach that yields a candidate invariant: F4. (c) Five existing test files gained a `getDriveTags` mock (no behaviour).
2. **Invariant breaks.** None found in the code. Invariant 8: completion calls `setQuery`+`focusInput` and returns; no push, no `record` (M1, M27 killed). Invariant 9: holds in the code (count>0, drive-owned, used-tags excluded case-insensitively), but its wiring and case handling are unguarded (F2). Invariant 10: holds (probe), unguarded (F1). Invariant 1: results unchanged for operator-free queries; the per-opening tag request is F6. Highlight: resets to -1 when the completion changes the query (reset effect on `query`), after which Enter submits the completed query (probe R4: `/drive/main/search?q=tag%3A旅行`). IME: the `isImeKeystroke` guard precedes all Enter handling (M26 killed by existing tests), so the confirming Enter cannot pick a suggestion.
3. **Drive boundary.** Tags go through `useDriveOwned` with the current drive: a drive switch with the modal open hides the old drive's tags immediately and shows the new drive's once loaded (probe R9: `[]` during, `["旅人1"]` after; calls `main` then `other`). A locked drive answers 404, the loader's catch stores `[]`. Backend `list_drive_tags` filters `Tag.drive == drive_name` after `_validate_drive(unlocked_groups)` and excludes trashed/missing files. No cross-drive path found.
4. **Mutation table** below.

## Mutation table

| id | file | mutation | want | result |
|---|---|---|---|---|
| M1 | GlobalSearch.tsx | `complete` branch disabled | kill | killed |
| M2 | GlobalSearch.tsx | drop `focusInput()` on completion | live | survived (focus, jsdom) |
| M3 | searchQuery.ts | no trailing space in completion | kill | killed |
| M5 | searchQuery.ts | drop full-width space boundary | kill | **survived** (F3) |
| M7 | searchQuery.ts | partial `\S*` -> `\S+` | kill | killed |
| M8 | searchQuery.ts | drop NFKC on operator name | live | survived |
| M9 | searchQuery.ts | drop lower-casing on operator name | kill | killed |
| M10 | searchQuery.ts | drop `count > 0` | kill | killed |
| M11 | searchQuery.ts | drop used-tag exclusion | kill | killed |
| M12 | searchQuery.ts | used set not lower-cased | kill | **survived** (F2) |
| M12b | searchQuery.ts | tag name not lower-cased for the used check | kill | **survived** (F2) |
| M13 | searchQuery.ts | no count ordering | kill | killed |
| M14 | searchQuery.ts | no substring matches | kill | killed |
| M15 | searchQuery.ts | limit 8 -> 9 | kill | killed |
| M15b | searchQuery.ts | prefix rank = substring rank | kill | killed |
| M15c | searchQuery.ts | needle not normalised | kill | killed |
| M16 | useLauncherRows.ts | suggestions not gated on browsing | live | survived |
| M17 | useLauncherRows.ts | suggestions not gated on drive | live | survived |
| M18 | useLauncherRows.ts | used tags from the whole query (incl. the token being typed) | kill | survived (over-excludes the exact typed tag; low) |
| M18b | useLauncherRows.ts | used tags = [] | kill | **survived** (F2) |
| M19 | SearchResultsList.tsx | Go to offset 0 | live | survived |
| M20 | SearchResultsList.tsx | file-row offset without suggestions | live (painting) | survived |
| M20b | SearchResultsList.tsx | Folders offset without suggestions | live | survived |
| M21 | useLauncherRows.ts | suggestions last in `jumps` | live (unreachable) | survived |
| M22 | GlobalSearch.tsx | pass `suggestions={[]}` | kill | killed |
| M23 | useLauncherRows.ts | tag loader off under a scope | kill | killed |
| M25 | useLauncherRows.ts | key without operator | live | survived |
| M26 | GlobalSearch.tsx | drop IME guard | kill | killed (pre-existing tests) |
| M27 | GlobalSearch.tsx | record history on completion | kill | killed |
| M28 | GlobalSearch.tsx | bare Enter completes the first suggestion | kill | **survived** (F1) |
| M29 | GlobalSearch.tsx | highlight not reset on query change | live | survived (the key-held effect drops the vanished suggestion anyway; pre-existing effect) |
| M30 | useJumpDestinations.ts | `getDriveTags("main")` hard-coded | kill | survived (fixture-equivalent) |
| M31 | useJumpDestinations.ts | drop drive-ownership check | kill | killed (shared guard) |
| M32 | useJumpDestinations.ts | error path keeps previous value | live | survived (equivalent) |

## Checks

- `pnpm exec tsc --noEmit`: exit 0.
- `pnpm lint`: exit 0 (0 errors, 68 warnings). In the changed files the only warning is the known pre-existing exhaustive-deps on GlobalSearch's recent-reply effect.
- Full `pnpm exec vitest run`: 556/556 files on two runs; one earlier run reported 1 failed test that did not reproduce on either rerun (not identified; likely unrelated timing).
- Tree restored after every mutation and the temporary probe test deleted; `git status --short` clean.

## Known pre-existing (one line each)

- [pre-existing] Tag case folding (backend `func.lower` is ASCII-only; unchanged here).
- [pre-existing] exhaustive-deps warning on the recent-reply effect in GlobalSearch.tsx.

TOTAL: 7 findings
