# Codemap: Search (popup launcher + search results page + Smart Folder)

**Last Updated:** 2026-05-03
**Specs:**
- `docs/superpowers/specs/2026-05-01-search-ui-rich-redesign.md` — origin of the two-layer UX
- `docs/superpowers/specs/2026-05-02-search-results-unification-phase3.md` — unification of the results page into a single list
- `docs/superpowers/specs/2026-05-03-search-popup-semantic-merge.md` — popup semantic merge + cache handoff

**Scope:** the two-layer search UX. The `Cmd/Ctrl+Shift+F` quick-launcher popup (filename + semantic merged in parallel), and the virtual-folder-style results page at `/drive/{drive}/search` (including cache hydrate from the popup). The Smart Folder (saved searches) DB / API / UI. The intelligence addon's `search-modes` entry on the results page.

## Architecture

```
User input
  │
  ▼
GlobalSearch (popup)               ── filename + semantic in parallel → mergeResults → top 8
  ├─ filename:  getDriveFiles({search, limit: 8}, {signal})        ← 300ms debounce
  ├─ semantic:  isSemanticSearchAvailable(drive)
  │             → fetchSemanticHits(query, drive, {limit: 8, signal})
  │             (no-op empty array when the addon is absent / policy off)
  ├─ MergedResultItem row: thumbnail + path + match badges + timestamp pills
  ├─ writeSearchCache({drive, query, type, sceneClip}, {filenameMatches, semanticHits, filenameTotal})
  ├─ click → /drive/{drive}/files/{id}                  (quick-nav, unchanged)
  └─ Enter / "Show all →"
        │
        ▼
/drive/{drive}/search?q=...       ── SearchPage
        │
        ▼
FolderBrowser (searchQuery=q)
  ├─ "Search: \"q\"" heading + SmartFolderSaveButton replace the breadcrumb
  ├─ <AddonSlot id="search-modes" props={{ query, drive, filter, onSelect }} />
  │     intelligence: FindModeSlot
  └─ FileGrid (= same as a regular folder; preview / right-click / multi-select / batch all work)
        │
        ▼
useFolderFiles({ searchQuery })
  ├─ on mount, readSearchCache(...) → on hit, inject filenameMatches/total/semanticHits into initial state (skip fetch)
  ├─ on miss, fall through to the normal getDriveFiles + fetchSemanticHits path
  └─ even on hit, semantic is revalidated (stale-while-revalidate)
        │
        ▼
GET /api/drives/{drive}/files?search=q&type=&sort=&order=&page=&limit=
```

Smart Folders are self-contained in `/drive/{drive}/search?q=...&smart_folder_id=...` URLs and reached from the sidebar.

### Why the popup → results page handoff

In Phase 3, the results page already merged filename + semantic into one list (`useFolderFiles` calls `fetchSemanticHits` directly and runs `mergeResults` + `sortMerged`). Doing the same merge in the popup eliminates perceived latency, and `searchCache` (TTL 60 s, partial-write safe) avoids a second fetch. The core/addon dependency rule still holds: the popup and the results page both call intelligence's HTTP routes only through the thin wrapper in `frontend/src/lib/semanticSearch.ts`, with no addon-slot data pipe required (the leading comment in `semanticSearch.ts` states that "HTTP routes are the addon's public contract").

The 2026-05-01 spec's "do not surface semantic in the popup" decision **rested on the assumption that the results page had two parallel lists**. Phase 3 collapsed that into one, so the assumption disappeared and the decision was reversed (spec `2026-05-03-search-popup-semantic-merge`).

## Frontend

| Path | Purpose |
|---|---|
| `frontend/src/components/GlobalSearch.tsx` | Quick-launcher popup. Fires filename + semantic in parallel with AbortController → unifies into one list via `mergeResults` + `sortMerged("relevance","desc")` → renders the top 8 (`POPUP_LIMIT`) using `MergedResultItem`. Writes results to `searchCache`. Enter does `router.push('/drive/{drive}/search?q=...')`; appends a "Show all →" link at the end of the result list. Does not call `AddonSlot` / `FilterTabs` (the slot is for the results page only). |
| `frontend/src/components/search/MergedResultItem.tsx` | Row component for the popup's unified list. Thumbnail + title + path + match-badge row (filename / path / audio / video / metadata / text) + timestamp-pill row (only for transcript / clip, up to 5). Pill click does a `?t=N` deep link; row click goes to the file detail page. |
| `frontend/src/components/search/__tests__/MergedResultItem.test.tsx` | Verifies filename only / semantic only / both / click navigation / timestamp pills. |
| `frontend/src/lib/searchCache.ts` | In-memory cache for the popup → results page handoff. `Map<string, SearchCacheEntry>` + TTL 60 s. Key = `{drive}::{query}::{type ?? "all"}::{scene ? 1 : 0}`. Partial-write safe (filename and semantic arrive at different times, so writing one side never erases the other). No subscribe API (the popup keeps its own state; the results page uses cache only as initial hydrate). |
| `frontend/src/lib/searchCache.test.ts` | TTL / partial write / read / key identity. |
| `frontend/src/lib/searchMerge.ts` | filename + semantic merge / sort (preexisting; shared by the popup and the results page). |
| `frontend/src/lib/semanticSearch.ts` | Thin wrapper over intelligence's semantic-search HTTP routes. Exposes `isSemanticSearchAvailable(drive)` and `fetchSemanticHits(query, drive, {limit?, signal?})`. Leading comment makes explicit that "HTTP routes are the addon's public contract". AbortSignal-aware (2026-05-03). |
| `frontend/src/lib/api.ts` | `getDriveFiles(drive, params, {signal?})` accepts an AbortSignal (extended 2026-05-03). Smart Folder CRUD lives in separate functions. |
| `frontend/src/app/drive/[name]/search/page.tsx` | Route for the search results page. Reads `q` / `type` / `sort` / `order` / `smart_folder_id` from `useSearchParams` and passes them through to `FolderBrowser` — a thin wrapper. |
| `frontend/src/components/FolderBrowser.tsx` | The shared generic browser. Accepts the `searchQuery` / `typeFilter` / `smartFolderId` props. When `searchQuery` is set, it hides the breadcrumb and renders the "Search: \"q\"" heading plus `<AddonSlot id="search-modes" props={{ query, drive, filter, onSelect }} />` at the top. The FileGrid is shared with regular folders. |
| `frontend/src/components/folder/useFolderFiles.ts` | Data-fetching hook. With `searchQuery` set, it calls `readSearchCache` on mount; on hit, it seeds `useInfiniteScroll`'s initial state with `filenameMatches` / `filenameTotal` / page=1 and primes `semanticHits` (fetch is skipped). On miss, it fetches normally. Even on hit, semantic is revalidated. |
| `frontend/src/components/SmartFolderSaveButton.tsx` | The button next to the "Search: ..." heading. With no `smart_folder_id` URL param, it shows "★ Save as Smart Folder"; with one, it shows "Saved: {name}" plus an Update / Rename / Delete dropdown. |
| `frontend/src/components/SmartFolderSaveDialog.tsx` | Name-entry dialog (used for POST). |
| `frontend/src/components/SidebarSmartFoldersSection.tsx` | The "Smart Folders" sidebar section. Auto-hides at zero entries. Right-click / long-press for Rename / Delete. |
| `frontend/src/hooks/useSmartFolders.ts` | CRUD plus a drive-scoped cache. |
| `frontend/src/test/setup.ts` | Vitest setup. As of 2026-05-03, adds a `globalThis.jest = vi` polyfill (for fake-timers / testing-library `waitFor` compatibility). |
| `frontend/src/components/__tests__/GlobalSearch.test.tsx` | Popup merge scenarios (filename only / semantic only / both / availability false), spies on cache writes, verifies AbortController cancellation of the prior request, and verifies Enter triggers a push. |
| `frontend/src/components/__tests__/SmartFolderSaveButton.test.tsx` | 10 tests: state transitions across save / saved / update / rename / delete modes. |
| `frontend/src/components/__tests__/SidebarSmartFoldersSection.test.tsx` | 8 tests: listing, hidden when empty, context menu. |

## Backend

| Path | Purpose |
|---|---|
| `backend/app/database.py` | Phase 11 migration: creates the `smart_folders` table. |
| `backend/app/models.py` | The `SmartFolder` ORM model. |
| `backend/app/schemas.py` | `SmartFolderCreate` / `SmartFolderUpdate` / `SmartFolderResponse` Pydantic schemas. |
| `backend/app/routers/smart_folders.py` | CRUD for `/api/drives/{drive}/smart-folders` (GET / POST / PATCH / DELETE). Sits under `require_drive_access`; locked drives return 404; cross-drive access returns wrong-drive 404. |
| `backend/tests/test_smart_folders.py` | 17 tests: every CRUD path, cross-drive blocking, locked → 404, the `viewer_id` write-only contract, allowing duplicate names. |

## Smart Folder DB schema

```sql
CREATE TABLE smart_folders (
  id TEXT PRIMARY KEY,                       -- nanoid
  drive TEXT NOT NULL,                       -- drive name (orphan rows allowed)
  viewer_id TEXT,                            -- creator's viewer_id (nullable)
  name TEXT NOT NULL,                        -- display name
  query TEXT NOT NULL,                       -- search query
  file_type TEXT,                            -- 'video' | 'image' | 'audio' | 'document' | NULL
  sort_by TEXT,                              -- sort field (NULL = default)
  sort_order TEXT,                           -- 'asc' | 'desc' | NULL
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);
CREATE INDEX idx_smart_folders_drive ON smart_folders(drive);
```

### How `viewer_id` is handled

- When the `lit_viewer` cookie is present, store its SHA-256 prefix; when absent, store NULL.
- **List queries do not use `viewer_id` in the WHERE clause** (current UX: shared within the drive).
- This is a forward-compat measure: the value is recorded at write time so a future "show only my Smart Folders" toggle can be retrofitted onto existing data.
- The design does not violate `.claude/rules/internal-api-policy.md` R4 (write asymmetry): the table is core, and the core UI reads it.

## API Endpoints

All sit under `require_drive_access` and follow the drive-scope access-control rules.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/drives/{drive}/smart-folders` | List Smart Folders inside the drive. |
| POST | `/api/drives/{drive}/smart-folders` | Create. `{ name, query, file_type?, sort_by?, sort_order? }` |
| PATCH | `/api/drives/{drive}/smart-folders/{id}` | Partial update. |
| DELETE | `/api/drives/{drive}/smart-folders/{id}` | Delete. |

### Drive-scope rules

- **Locked drive**: API returns 404 (existence is hidden, not 403; see `.claude/rules/design-decisions.md` "Access control").
- **Cross-drive**: trying to touch drive A's `id` through drive B's path returns 404.
- **Duplicate names**: allowed (different IDs; the UI distinguishes them).
- Drive deletion does not cascade to Smart Folders (orphan rows are allowed). Smart Folders that point at a drive removed from `drives.json` are filtered out of API responses.

## URL contract

```
/drive/{drive}/search?q={query}&type={file_type}&sort={field}&order={asc|desc}&smart_folder_id={id}
```

| Parameter | Required | Purpose |
|---|---|---|
| `q` | Yes | Search query. |
| `type` | No | `video` / `image` / `audio` / `document` |
| `sort` | No | Sort field (omitted = default). |
| `order` | No | `asc` / `desc` |
| `smart_folder_id` | No | Marks the URL as originating from a Smart Folder (switches the button to Update / Rename / Delete mode). |

Changes to `type` / `sort` / `order` use `router.replace` (no history entry). Changes to `q` use `router.push` (so Back returns to the previous query).

## Intelligence addon integration

The `search-modes` slot has one mount, on the results page, and entries draw one layout.

| Path | Purpose |
|---|---|
| `addons/intelligence/frontend/FindModeSlot.tsx` | A right-aligned chip that hands the query off to the Find page. |
| `addons/intelligence/manifest.json` | Registers `find-mode` under `slots["search-modes"]`. |

The popup does not mount this slot. It gets semantic hits from `frontend/src/lib/semanticSearch.ts`, which is the public-contract path, and merges them into the one result list. When intelligence is not installed, `AddonSlot` renders nothing and both surfaces work normally.

For the slot mechanism in detail, see "UI Slot System" in `docs/ADDON-DEVELOPMENT.md`.

## Related rules

- Drive = security boundary (`.claude/rules/design-decisions.md` "Drives"). Smart Folders are also per-drive — no crossover.
- When `passwords.json` is absent, drive-scope control gracefully degrades (everything public).
- The `search-modes` slot is fail-open (when intelligence is not installed, it simply renders nothing).

## Related

- Specs:
  - `docs/superpowers/specs/2026-05-01-search-ui-rich-redesign.md` (origin of the two-layer UX)
  - `docs/superpowers/specs/2026-05-02-search-results-unification-phase3.md` (results-page unification into one list)
  - `docs/superpowers/specs/2026-05-03-search-popup-semantic-merge.md` (popup semantic merge + cache handoff)
- Slot system: `docs/ADDON-DEVELOPMENT.md` "UI Slot System"
- Drive policy: `.claude/rules/design-decisions.md` "Drives" / "Access control"
- Internal API policy (why a core write is justified for Smart Folders): `.claude/rules/internal-api-policy.md` R1 / R4
- Hako: `5rzHwstzWuhtYn6olkz2Y` (rationale for re-introducing semantic in the popup — assumption inversion), `C6TXG5dX4chBj5TnmCiTO` (`searchCache` design), `tUEIFDp-0k-S-fik8jZa1` (lessons from the snapshot-pollution bug — `searchCache` keys on `searchQuery`, so it stays independent from folder snapshots)
