# Codemap: Folder browser (two-pane layout, tree filter, in-folder filter)

**Last Updated:** 2026-05-09
**Specs:**
- [docs/superpowers/specs/2026-05-08-vault-core-merger-phase3.md](../superpowers/specs/2026-05-08-vault-core-merger-phase3.md) — two-pane layout (drive-level tree + content)
- [docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md](../superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md) — `<FilterField>` introduction, right-pane filter, tree filter (chips replacement)
- [docs/superpowers/specs/2026-05-09-new-file-creation-core.md](../superpowers/specs/2026-05-09-new-file-creation-core.md) — Phase 4 new-file creation in Core (toolbar button + Cmd/Ctrl+N), backend mime-allowlist removal, suffix numbering on collision
- [docs/superpowers/specs/2026-05-09-tree-context-menu.md](../superpowers/specs/2026-05-09-tree-context-menu.md) — tree-pane right-click menu (ports the Knowledge addon's row context menu to the core)
- [docs/superpowers/specs/2026-05-09-tree-pane-drag-drop.md](../superpowers/specs/2026-05-09-tree-pane-drag-drop.md) — tree-pane drag-and-drop (ports the Knowledge sidebar's move gesture; reuses the core `useDragAndDrop` hook with a DataTransfer fallback for cross-pane drops)

**Scope:** the drive-level browser at `/drive/{drive}` and `/drive/{drive}/{path}`. Two-pane layout (folder tree on the left, content on the right), per-pane filter UIs, virtual scroll, the lazy / full-load tree fetch strategy, and the toolbar/shortcut surface for creating new folders and files in the current folder. The filter pair introduced in Phase 4 (right-pane in-folder filter + tree filter that replaces the old type-filter chips) and the new-file creation flow (also Phase 4) are the focus of this map.

## Architecture

```
/drive/{drive}/{...path}                   ── drive-level layout (Phase 3)
  │
  └─ TwoPaneLayout
       ├─ FolderTreePane (left, optional)              ── drive-wide tree
       │    ├─ FilterField (text + type dropdown)      ── replaces the old TypeFilterChips
       │    │    ├─ text:        useTreeTextFilter     (in-memory, cleared on tree-pane unmount)
       │    │    └─ typeFilter:  useTreeTypeFilter     (localStorage `tree:typeFilter:{drive}`)
       │    ├─ useFolderTreeQuery                      (lazy expand by default)
       │    │    └─ on filter ON, switches to one-shot full-tree fetch
       │    ├─ treeFilterTransform                     (pure)
       │    │    ├─ groupByParent
       │    │    ├─ computeMatchTables (matched / ancestor / descendant tables)
       │    │    └─ buildFilteredRows
       │    └─ FolderTreeRow rows
       │         └─ data-state="ancestor" + opacity-60 for path-context rows
       │
       └─ FolderContent  /  RootFileListing (right)
            ├─ FolderToolbar (sort / view-mode / batch / addons / New Folder / New File)
            │    ├─ onCreateFolder  → useCreateFolder
            │    └─ onCreateFile    → useCreateFile  (new in Phase 4; omitted in special views)
            ├─ FilterField (text + type dropdown)      ── always-on, never persisted
            │    └─ useFolderFilter                    (in-memory, cleared on folder navigation)
            ├─ fileTypeFilter                          (shared type-match utility)
            ├─ useShortcuts                            (Cmd/Ctrl+N → onCreateFile, file-browser scope)
            └─ FileGrid / FileList                     (virtual scroll preserved)
```

Both filter sites use the **same `<FilterField>`** component but separate state and separate filter functions — they intentionally do not share or influence each other. The tree filter operates on the cached tree; the right-pane filter operates on the current folder's file list.

### Lazy vs full-tree fetch

`useFolderTreeQuery` is the source of truth for the tree's data:

- **Filter OFF (default):** fetches one path at a time as the user expands folders (`getFolderTree(drive, { root, type_filter, depth: 1 })`). Cached per `{drive, typeFilter, path}`.
- **Filter ON:** the tree filter cannot evaluate matches in unloaded subtrees, so the pane switches to a one-shot full-tree fetch. The cache is dropped and re-seeded.
- Toggling the filter on or off therefore costs one round trip; the manual expand state (`tree:expanded:{drive}`) is restored when filter is turned off.

For very large drives (10k+ files) this strategy is acceptable as a Phase 4 ceiling; an incremental search index is a Phase 5+ concern.

## Frontend

### Filter pair (Phase 4, 2026-05-09)

| Path | Purpose |
|---|---|
| `frontend/src/components/folder/FilterField.tsx` | Shared filter component used by both the right pane and the tree pane. Composition: lucide `Search` icon + text input with debounce + `×` clear button when text is non-empty + Radix DropdownMenu for the type filter (`All` / `Markdown` / `Video` / `Image` / `PDF`). Active type styles the dropdown label with `text-accent`. Single component, two call sites; no per-pane variants. |
| `frontend/src/components/folder/__tests__/FilterField.test.tsx` | Debounce, type-dropdown selection, clear button, accent label. |
| `frontend/src/hooks/useFolderFilter.ts` | Right-pane filter hook. Holds `text` (debounced ~300 ms) and `typeFilter` in `useState`; both clear on folder navigation (no persistence). Returns the filtered file list using `fileTypeFilter` + name substring match. Folders are not filtered. |
| `frontend/src/hooks/__tests__/useFolderFilter.test.ts` | AND combination, case-insensitive match, folders pass through, navigation reset. |
| `frontend/src/hooks/useTreeTextFilter.ts` | Tree-pane text filter (plain `useState`, cleared on tree-pane unmount). The tree-pane *type* filter still goes through the existing `useTreeTypeFilter` (localStorage). |
| `frontend/src/hooks/__tests__/useTreeTextFilter.test.ts` | State lifecycle. |
| `frontend/src/lib/fileTypeFilter.ts` | Shared utility. Maps a file → one of `markdown` / `video` / `image` / `pdf` / `other` based on mime + extension, then matches against the active `TreeTypeFilter`. Used by both filter hooks. |
| `frontend/src/lib/treeFilterTransform.ts` | Pure transformation pipeline for the tree filter: `groupByParent` rebuilds parent → children edges from the flat tree, `computeMatchTables` produces match / ancestor / descendant flag tables (a folder match cascades to descendants, a file/folder match marks its ancestors), `buildFilteredRows` flattens the resulting tree into virtual-scroll rows preserving order. Pure & deterministic — keeps `FolderTreePane` thin. |

### New file creation (Phase 4, 2026-05-09)

| Path | Purpose |
|---|---|
| `frontend/src/lib/api.ts` (`createTextFile`) | Public wrapper over `POST /api/drives/{drive}/files` with body `{ path, content }`. Throws `ApiError` on non-2xx, returns the created `FileItem`. Replaces what was previously only available inside the knowledge addon. |
| `frontend/src/hooks/useCreateFile.ts` | Mirrors `useCreateFolder`. Accepts `{ drive, currentPath }`, returns `{ createFile, isCreating }`. `createFile()` posts `untitled-{YYYYMMDD-HHMMSS}.md` to the current folder (drive root when `currentPath` is empty), then `router.push(/files/{id}?edit=1)`. Reentrancy-guarded by `isCreating`. Backend handles same-name collisions by suffixing `(1)`, `(2)`, etc., so the timestamped name is fire-and-forget. |
| `frontend/src/hooks/__tests__/useCreateFile.test.ts` | Success, error path, drive-root vs nested folder. |

### Tree-pane context menu (2026-05-09)

The `FolderTreePane` ports the Knowledge sidebar's right-click menu to the core, reusing the existing `FolderContextMenu` and `FileContextMenu` (mounted by `FolderContent` / `DriveHome` for the right pane). The menus accept new opt-in callback props that the right pane leaves unset — call sites that don't pass them keep the original menu.

| Path | Change |
|---|---|
| `frontend/src/components/folder/FolderTreeRow.tsx` | New optional `onContextMenu(row, event)` prop. The row swallows the browser context menu only when the prop is provided so the right pane's row (no menu wired) keeps the default behaviour. |
| `frontend/src/components/folder/FolderTreePane.tsx` | Holds menu state (`{kind: "folder"\|"file", row, position}`), reads pin state via `usePinnedFolders(drive)`, drives `useCreateFile(drive, "")` for "new file here" (per-call path override), and bumps an internal `refreshKey` to force `useFolderTreeQuery` to refetch after a successful mutation. Stub-builds a `Folder` / `FileItem` from the tree node so the existing menus mutate without a metadata round-trip. |
| `frontend/src/components/FolderContextMenu.tsx` | New optional props `onOpen`, `onCreateFileHere`, `onCreateFolderHere`. The "new folder here" item opens an inline `NameInputDialog`, calls `createFolder(drive, target.path, name)` on submit, then invokes `onCreateFolderHere?.()` for the caller to refresh. The right pane omits all three opt-ins; its surface is unchanged. |
| `frontend/src/components/FileContextMenu.tsx` | New optional `onOpenInNewTab` prop. When provided, the menu shows "Open in new tab" above "Download". Right-pane callers (FileGrid, etc.) leave it unset. |
| `frontend/src/components/NameInputDialog.tsx` | New: name-only input dialog mirroring `RenameDialog`. Used by "new folder here" inside `FolderContextMenu`; reusable for other "create with a name" flows. |
| `frontend/src/hooks/useCreateFile.ts` | `createFile()` now accepts an optional override path. The toolbar / Cmd+N call sites pass nothing and behave identically; the tree menu passes the row's path so the new file lands in that folder regardless of the URL location. |
| `frontend/src/hooks/useFolderTreeQuery.ts` | Accepts `refreshKey?: number` as a fourth dimension of the cache key. Bumping it drops the cache and forces a refetch — the way the tree pane invalidates after a context-menu mutation. |
| `frontend/src/messages-core/{ja,en}.json` | New keys: `folder.open`, `folder.newFileHere`, `folder.newFolderHere`, `folder.newFolderTitle`, `file.openInNewTab`. After editing, run `node frontend/scripts/merge-addon-messages.mjs` to regenerate `frontend/src/messages/{ja,en}.json`. |

### Tree-pane drag-and-drop (2026-05-09)

The `FolderTreePane` reuses the existing core `useDragAndDrop` hook (DataTransfer-based, MIMEs `application/x-file-ids` / `application/x-folder-path`) instead of duplicating the Knowledge sidebar's internal-state pattern. That choice gives cross-pane drops (drag a card from the right pane → drop on a tree row) for free.

| Path | Change |
|---|---|
| `frontend/src/hooks/useDragAndDrop.ts` | `handleDrop` now reads `e.dataTransfer.getData(...)` as a fallback when the internal `draggedIdsRef` / `draggedFolderRef` are empty. Two panes mounting their own hook instance can't see each other's refs, so the DataTransfer payload is the only thing both ends agree on. Malformed JSON is rejected without an API call. |
| `frontend/src/components/folder/FolderTreeRow.tsx` | New optional `onDragStart` / `onDragEnd` / `dropTargetProps` / `isDragSource` / `isDropHover`. The row is `draggable` only when `onDragStart` is supplied; drop handlers attach only when `dropTargetProps` is non-null. Source rows render at `opacity-40`; drop-hover rows render `ring-2 ring-accent ring-inset bg-accent/10`. |
| `frontend/src/components/folder/FolderTreePane.tsx` | Instantiates `useDragAndDrop({ drive, selectedIds: empty Set, onComplete: refresh })` (the same `refresh` callback that the context menu uses, so both gestures invalidate the tree via the same `refreshKey` bump). Wires per-row drag/drop props: file rows are drag sources only, folder rows are drag sources *and* drop targets — except `isDropDisabled(node.path)` returns true for self/descendant of the active drag, in which case the drop props are `null`. Adds a thin **root drop band** under `<FilterField>` that only renders while a drag is in progress, so the resting layout is unchanged. **Drag is disabled while a filter is active** because the filtered list mixes ancestor-context rows that look identical to children but live at different real paths. |
| `frontend/src/messages-core/{ja,en}.json` | New key `tree.dropToRoot`. After editing, run `node frontend/scripts/merge-addon-messages.mjs`. |

Out of scope: auto-expand on drag-over hover, external OS file drop on tree rows (handled separately by `UploadZone` over the right pane), multi-select drags from the tree.

### New file creation — wired call sites

| Path | Change |
|---|---|
| `frontend/src/components/folder/FolderToolbar.tsx` | Added optional `onCreateFile?: () => void` prop. When provided, renders a "新規ファイル / New File" button next to the existing "新規フォルダ / New Folder". When omitted (special views) the button is not rendered. |
| `frontend/src/components/FolderBrowser.tsx` | Calls `useCreateFile(drive, currentPath)` and passes `createFile` into both `FolderToolbar.onCreateFile` and a `useShortcuts` registration of `Cmd+N` / `Ctrl+N` (scope `file-browser`). In special views (favorites, search results, tag view) it passes `undefined` to `FolderToolbar` and registers the shortcut with `enabled: false`, so neither surface fires. |
| `frontend/src/messages-core/{ja,en}.json` | New keys: `folder.newFile` and `shortcuts.newFile` (both `"新規ファイル"` / `"New File"`). After editing, run `node frontend/scripts/merge-addon-messages.mjs` to regenerate `frontend/src/messages/{ja,en}.json`. |

### Modified call sites

| Path | Change |
|---|---|
| `frontend/src/components/folder/FolderTreePane.tsx` | The header now renders `<FilterField>` in place of the old `<TypeFilterChips>`. When `(text \|\| typeFilter)` is non-empty, the pane: (1) switches `useFolderTreeQuery` to full-load mode, (2) runs `treeFilterTransform` on the cached tree, (3) auto-expands ancestors of matches so they are reachable, (4) renders `<FolderTreeRow isAncestor>` rows with `data-state="ancestor"` and `opacity-60` for path-context rows. Empty-state shows the "no match" copy with a *Clear filters* button. |
| `frontend/src/components/folder/FolderContent.tsx` | Renders `<FilterField>` between the toolbar and the grid. Pipes the file list through `useFolderFilter` before handing it to the virtual list. Empty-state on zero match. |
| `frontend/src/components/RootFileListing.tsx` | Same wiring as `FolderContent`, scoped to the drive root. |
| `frontend/src/components/folder/FolderTreeRow.tsx` | Accepts `isAncestor: boolean`; when true emits `data-state="ancestor"` and applies `opacity-60`. The expand/collapse caret and selection behaviour are unchanged. |
| `frontend/src/messages-core/{ja,en}.json` | New `filter` namespace: `placeholder.tree`, `placeholder.folder`, `type.{all,markdown,video,image,pdf}`, `empty.tree`, `empty.folder`, `clear`. After editing, run `node frontend/scripts/merge-addon-messages.mjs` to regenerate `frontend/src/messages/{ja,en}.json`. |

### Removed

| Path | Notes |
|---|---|
| `frontend/src/components/folder/TypeFilterChips.tsx` | Absorbed into `<FilterField>`. |
| `frontend/src/components/folder/__tests__/TypeFilterChips.test.tsx` | Deleted with the component. |
| `frontend/src/hooks/useTreeTypeFilter.ts` | **Kept.** The tree pane's type-filter persistence lives here; `<FilterField>` reads/writes through it. |

### Pre-existing tree / folder pieces (relevant context)

| Path | Purpose |
|---|---|
| `frontend/src/components/folder/TwoPaneLayout.tsx` | Drive-level layout. Hoists the tree pane next to the content pane (Phase 3, hoisted at `/drive/{drive}/layout.tsx`). |
| `frontend/src/hooks/useFolderTreeQuery.ts` | Per-path lazy fetch with cache keyed by `{drive, typeFilter, path}`. Drops the cache when `typeFilter` changes (counts and visibility differ). |
| `frontend/src/hooks/useTreeEnabled.ts` | Tree-pane open/closed toggle persistence. |
| `frontend/src/hooks/useTreeExpansion.ts` | Per-drive expanded-folder set in localStorage (`tree:expanded:{drive}`). |
| `frontend/src/hooks/useTreeTypeFilter.ts` | Per-drive type filter in localStorage (`tree:typeFilter:{drive}`). |
| `frontend/src/components/folder/useFolderFiles.ts` | Right-pane file list. The right-pane filter sits on top of this hook's output; this hook itself is unchanged by Phase 4. |

## Backend

### New file creation endpoint (Phase 4, 2026-05-09)

| Path | Change |
|---|---|
| `backend/app/routers/drives.py` (`POST /api/drives/{drive_name}/files`, `create_text_file`) | (1) `_TEXT_CREATE_ALLOWED_MIMES` removed — accepts any extension (or none). 415 is no longer returned. The body is JSON `{ path, content }` and `content` is treated as opaque UTF-8 text regardless of extension. `classify(filename)` still runs to populate `File.mime_type`. (2) Path traversal check (400) now runs before classification. (3) On same-name collision with an *active* or *trashed* file, the endpoint auto-suffixes the basename: `foo.md` → `foo (1).md` → `foo (2).md` … up to 99. 409 is now reserved for the "too many collisions" edge case. *missing*-state files at the same path still UPSERT (revive the existing row). (4) The 1 MB body cap is unchanged. |
| `backend/app/routers/drives.py` (`_next_unique_path` helper) | Computes the next unused suffixed name by checking the DB for both active and trashed entries. Trashed entries are deliberately included so users do not see "trash exists" via name conflicts. |
| `backend/tests/test_drives_create_text_file.py` | Covers non-allowlisted extensions (`.json`, `.py`, `.html`, `.yaml`, no extension), suffix numbering on collision, missing-state UPSERT, 1 MB cap, traversal rejection. |

## E2E

| Path | Purpose |
|---|---|
| `frontend/e2e/folder-filter.spec.ts` | Right-pane filter: text match, type dropdown, navigation clears state, empty-state and *Clear filters* button. |
| `frontend/e2e/tree-filter.spec.ts` | Tree filter: text match, type dropdown, ancestor dimming, reload preserves the type filter and clears the text, full-tree fetch on filter ON. |

## Persistence summary

| State | Storage | Lifetime |
|---|---|---|
| Right-pane text | `useState` | Cleared on folder navigation, reload, and pane re-mount. |
| Right-pane type | `useState` | Cleared on folder navigation, reload, and pane re-mount. |
| Tree-pane text | `useState` (in `useTreeTextFilter`) | Cleared on tree-pane unmount and reload. Survives folder navigation while the pane is open. |
| Tree-pane type | localStorage `tree:typeFilter:{drive}` | Survives reload and navigation. Per drive (a photo drive can default to `Image`). |
| Tree expand state | localStorage `tree:expanded:{drive}` | Per drive. Suspended while the tree filter is active; restored when it clears. |

The asymmetry — text never persisted, type persisted only for the tree — is intentional. The tree's type filter functions as a per-drive preference (origin: hako `rOloIC47lE4P3MyCtf1Vv`), while text persistence would create "I am secretly being filtered" surprises (origin: spec §2.6, §3.7).

## Match rules

| Surface | Name match | Type match |
|---|---|---|
| Right pane | Substring on filename incl. extension, case-insensitive. Folders bypass. | `fileTypeFilter`. Folders bypass. |
| Tree pane | Substring on file **and** folder names. | `fileTypeFilter` for files only; folders bypass type. |

A folder match cascades — its children are shown even if they do not match individually (the user is asking for that subtree). A file match propagates upward — its ancestors render in the dimmed `isAncestor` style as path context.

Special characters: filters are literal substring (no regex, no fuzzy, no full-width / half-width normalisation). Future work, not Phase 4 scope.

## Performance notes

- Right pane: `useMemo` over the file list + 300 ms text debounce; the existing virtual scroll keeps frame budget intact at 1000+ files.
- Tree pane: full-tree fetch on filter ON costs one round trip per toggle. `treeFilterTransform` is O(N) over the cached tree; rebuilt on each `(text, typeFilter)` change. The same virtual scroller from Phase 3 keeps tall results cheap.
- Switching the tree filter on for a drive with 10k+ files is acceptable; 100k+ is a known scaling cliff to be addressed by a future incremental search index (Phase 5+).

## Related rules

- `.claude/rules/frontend-conventions.md` — i18n keys must live in `messages-core/` only; the merge script combines core + addon.
- `.claude/rules/design-decisions.md` "Drives" — the tree filter is drive-scoped. Both filter surfaces are intra-drive.

## Related codemaps

- [search.md](./search.md) — the heavier sibling of the right-pane filter (drive-wide search popup + results page). The right-pane filter intentionally complements but does not call into it.
