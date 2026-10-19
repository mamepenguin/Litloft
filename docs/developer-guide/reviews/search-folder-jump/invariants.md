# Invariants: search modal folder jump

## Touch points

- `frontend/src/components/GlobalSearch.tsx` (Folders block, one index space across Go to and Folders)
- `frontend/src/components/search/useJumpDestinations.ts` (pin key becomes `folder:<path>`; `useJumpFolders`)
- `frontend/src/components/search/JumpRows.tsx` (heading, offset, detail line)
- `frontend/src/lib/pageJump.ts` (`indexFolders`, `matchFolders`, `folderJumpKey`, `FOLDER_LIMIT`)
- New read on modal open: `getFolderTree(drive, { flat: true })`
- `messages-core/{ja,en}.json` (`pageJump.folders`), `search.driveRoot` now drawn by GlobalSearch
- `docs/user-guide/search.md`
- No backend, WS event or DB change. `design-decisions.md`: Drives (security boundary).

## Invariants

1. With no row highlighted, Enter goes to the search page, whether or not folder rows are shown.
2. Folder rows come only from the current drive; after a drive switch with the modal open, the previous drive's folders are not rendered even before the new response arrives.
3. A folder is listed only if its own name matches; a match only in a parent segment does not list it.
4. The same folder is never shown in both Go to (as a pin) and Folders.
5. A highlighted row stays on the same destination when any list arrives, grows or reorders, including a folder moving between Go to and Folders.
6. Empty query and scoped modal render what they do today; the scoped modal fetches no folder tree; typing adds no request.
7. At most 5 folder rows.
8. Opening a folder row does not add the query to search history.
