# Invariants: search modal folder browse

## Touch points

- `frontend/src/components/GlobalSearch.tsx` (key routing, "/" via onChange, browse branch, chip)
- `frontend/src/components/search/useFolderBrowse.ts`, `BrowseRows.tsx` (with `BrowseChip`), `LauncherRow.tsx` (new)
- `frontend/src/components/search/JumpRows.tsx`, `useJumpDestinations.ts` (rows carry `folderPath`, › button)
- `frontend/src/lib/folderBrowse.ts` (new), `frontend/src/lib/pageJump.ts` (`normalise` exported)
- New read per level: `getFolderTree(drive, { root, include_files: true }, { signal })`
- `messages-core/{ja,en}.json` (`pageJump.browse*`), `docs/user-guide/search.md`, `docs/user-guide/keyboard-shortcuts.md`
- `ime-enter-guard.test.ts` declares `lib/folderBrowse.ts`
- No backend, WS event or DB change. `design-decisions.md`: Drives (security boundary).

## Invariants

1. Outside browse mode, ← moves the caret, → moves the caret unless a folder row is highlighted, and Enter behaves as it did before this change.
2. Browse mode shows only the current drive's current folder's direct children; a response for another level or another drive is never shown, and a drive switch leaves browse mode.
3. ← and Backspace go up only when the input is empty, the key is unmodified and not a repeat; with text they edit it.
4. ← at the drive root leaves browse mode for normal search.
5. Enter with nothing highlighted opens the browsed folder's page (the Library at the drive root).
6. With a scope chip active, browse mode cannot be entered and "/" is ordinary text.
7. Opening anything from browse mode does not add to search history.
8. At most 100 rows per level; the filter runs over the whole level before the cap.
9. While browsing, file search, Go to, Folders and the empty-state lists are neither shown nor requested.
10. Entering or leaving a level clears the highlight.
