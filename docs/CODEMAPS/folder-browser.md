# Codemap: Folder browser (two-pane layout, tree filter, in-folder filter)

**Last Updated:** 2026-05-09
**Specs:**
- [docs/superpowers/specs/2026-05-08-vault-core-merger-phase3.md](../superpowers/specs/2026-05-08-vault-core-merger-phase3.md) — two-pane layout (drive-level tree + content)
- [docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md](../superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md) — `<FilterField>` introduction, right-pane filter, tree filter (chips replacement)

**Scope:** the drive-level browser at `/drive/{drive}` and `/drive/{drive}/{path}`. Two-pane layout (folder tree on the left, content on the right), per-pane filter UIs, virtual scroll, and the lazy / full-load tree fetch strategy. The filter pair introduced in Phase 4 (right-pane in-folder filter + tree filter that replaces the old type-filter chips) is the focus of this map.

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
            ├─ FolderToolbar (sort / view-mode / batch / addons)
            ├─ FilterField (text + type dropdown)      ── always-on, never persisted
            │    └─ useFolderFilter                    (in-memory, cleared on folder navigation)
            ├─ fileTypeFilter                          (shared type-match utility)
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
