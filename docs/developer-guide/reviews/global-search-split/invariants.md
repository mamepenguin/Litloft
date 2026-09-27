# Invariants: GlobalSearch split (behaviour-preserving refactor)

## Touch points

- PR-1 (data): `frontend/src/components/GlobalSearch.tsx`; new `components/search/useFileSearch.ts`, `useRecentAndHistory.ts`, `useLauncherRows.ts`
- `core-search-vocabulary.test.ts` gains `useLauncherRows.ts` as a caller (1 key)
- PR-2 (render): `GlobalSearch.tsx`; new `components/search/SearchResultsList.tsx`, `SearchFooter.tsx`; the phone and desktop branches share one `body` and one `footer`; `core-search-vocabulary.test.ts` moves 4 keys to the two new callers
- No backend, WS event, DB, i18n or doc change

## Invariants

1. Every existing GlobalSearch-related test passes with its test code unchanged (GlobalSearch, .scope, .jump, .browse, AppShell.globalSearch, accent-budget, uploadZoneHosts, ime-enter-guard).
2. Calls to `lib/api` and `lib/semanticSearch` keep their count, arguments and timing: 300 ms debounce, the second stage aborted with the query, cache read before and written after both stages, history recorded on the same actions only.
3. What the modal renders for a given sequence of props, responses and keys is unchanged, including the highlight across late replies.
4. `GlobalSearch` stays the only export used by `Header` / `AppShell`.
