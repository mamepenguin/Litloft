# Invariants: search modal page jump

## Touch points

- `frontend/src/components/GlobalSearch.tsx` (index space, highlight identity, Enter, result list)
- `frontend/src/components/search/useJumpDestinations.ts`, `JumpRows.tsx` (new)
- `frontend/src/lib/pageJump.ts` (new), `frontend/src/lib/driveViews.ts` (collection and smart-folder hrefs)
- `SidebarSmartFoldersSection.tsx`, `useCollectionManagement.ts` (call the shared href builders)
- New reads on modal open: `getPins`, `getCollections`, `getSmartFolders`, `getDriveSummary`, `getAuthStatus`
- `messages-core/{ja,en}.json` (`pageJump` namespace), `docs/user-guide/search.md`
- No backend, WS event or DB change. `design-decisions.md`: Drives (security boundary).

## Invariants

1. With no row highlighted, Enter goes to the search page, whether or not Go to rows are shown.
2. No Go to row points into a drive other than the current one; after switching drive with the modal open, the previous drive's pins, collections, smart folders and Missing row are not rendered even before the new responses arrive.
3. Missing files and Admin rows appear only under the conditions the sidebar shows them (`missing_count > 0`, `is_admin`).
4. A highlighted row (Go to or file) stays on the same destination when the other list arrives, grows or reorders.
5. On an empty query, and with a scope chip active, the modal renders what it renders today; with a scope active no destination is fetched.
6. Typing makes no request beyond today's filename and semantic searches.
7. At most 3 Go to rows.
8. Go to rows are reachable with ArrowDown and Enter when there are zero file results, and while the file search is loading.
9. Opening a Go to row does not add the query to search history.
10. Every fixed row the sidebar renders has a launcher destination with the same href, and vice versa.
