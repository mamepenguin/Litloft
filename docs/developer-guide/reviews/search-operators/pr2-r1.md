# Review: search operators PR 2 (frontend), round 1

- Reviewed: `716b40da9413de971eccb4e03e57bfc42a3b9041`, range `434a22786..716b40da9`, worktree `/Users/libre/Sources/video_share-ops2`.
- Baseline at the SHA: `pnpm exec vitest run` 555 files / 8063 passed; `pnpm exec tsc --noEmit` clean.
- Material read: diff; CLAUDE.md; rules review-workflow, design-decisions, frontend-conventions, tests, comments; spec `2026-09-28-search-operators.md` incl. "Decisions after the spec review" and `## Checked, no action`; spec review F1-F11; invariants.md; pr1-r1.md; search-page-jump README (no tests for already-correct code / painting).

## Findings

(written incrementally below)

### F1 [introduced] [low] invariant: none (reads wrong; user-reachable) — scoped modal keeps a spinner forever when `type:` cannot hold inside the scope and a request was in flight
- Where: `frontend/src/components/search/useFileSearch.ts`, the `kinds.impossible` early return (`setMerged([]); setTotal(0); return;`). It does not `setLoading(false)`. The previous effect's cleanup aborts the in-flight listing, and that request's `.finally` is guarded by `!ctrl.signal.aborted`, so `loading` stays `true`. `SearchResultsList` renders the spinner when `loading && merged.length === 0`, and the "no results" row is gated on `!loading`.
- Reproduction (probe test with the scope harness of `GlobalSearch.scope.test.tsx`, Notes scope `type: "text"`): first `getDriveFiles` call never resolves; type `foo type:vid` (not a kind → text search, request fires after 300 ms), then `foo type:video` (disjoint with `text` → impossible). Advance 2 s.
  - `716b40da9`: 1 listing call, spinner count 1, no-results row absent — spinner stays until the next edit.
  - `434a22786`: 2 listing calls, spinner 0 (the second query was a plain text search whose reply clears `loading`).
- The same unguarded return exists on the pre-existing empty-query path, but there `hasQuery` is false so the results list (and its spinner) is not rendered; the new path is the first one where it is visible.
- User reach: Notes scope, finish typing a disjoint `type:` value while the previous request is still out (slow listing, or pasting). Needs the timing, so rare; the user sees a spinner instead of "no results".

### F2 [introduced] [high — CI] invariant: none — `pnpm lint` fails on the search page
- `frontend/src/app/drive/[name]/search/page.tsx:76` — `error  Compilation Skipped: Existing memoization could not be preserved  react-hooks/preserve-manual-memoization` on `handleToggle`'s `useCallback`.
- Reproduction: `cd frontend && pnpm lint` (the command CI's "Lint" step runs, `.github/workflows/ci.yml`).
  - `716b40da9`: exit 1; the only non-probe error is this one (the other two error files were my own untracked probe tests, since removed).
  - `434a22786` (second worktree): exit 0, no errors.
- The only change to the file is the `parseSearchQuery(q).hasOperators` guard around the scene toggle, so that edit is what makes the React Compiler rule bail. `tsc --noEmit` and vitest are green, which is why it did not show up there.
- Effect: the PR's frontend CI job goes red. No runtime behaviour change is implied by the lint error itself (the compiler just skips optimising the component).

### F3 [introduced] [trivial] invariant: none — `navigateToSearchPage`'s new `type` parameter has no caller that passes it
- `frontend/src/components/GlobalSearch.tsx`: `navigateToSearchPage(term: string, type?: FileKind)`; both callers (lines 325, 335) pass only `term`. The scoped path builds its href through `searchPageHref` inside `scopedSeeAll` instead. Dead parameter; a reader may assume scoped Enter goes through it. B, ledger.

## Q1 — places the diff reaches that the touch-point list omits

The PR 2 touch points name: parser in `lib/`, `lib/api.ts`, `useFileSearch`, `useFolderFiles`, `useLauncherRows`, `GlobalSearch`, the search page, `docs/user-guide/search.md`. The diff also reaches:
1. `lib/searchMerge.ts` `mergeResults` (new `nameMatched`, default `true`). Shared by the modal's two paint paths and the search page; no other caller (grep). Default keeps old behaviour.
2. `components/search/SearchResultsList.tsx` — the scoped rows' highlight text.
3. `components/FolderBrowser.tsx` — the **`search-modes` addon slot** (intelligence Find) is now unmounted when operators are present. This is an addon-facing surface, not only core UI.
4. `lib/searchCache.ts` (indirectly) — entries keyed on the raw query now hold *filtered* listings, and the modal ↔ search page hand-off hydrates from them (keys still match: modal `type: scopeType`, page `type: ?type=` which scoped Enter sets to `scope.type`).
5. `hooks/useInfiniteScroll` (indirectly) — `fetchPage` can now return a synthetic `{data: [], total: 0}` without a request.
6. `lib/api.ts getDriveFiles` is listed, but note its serialization changed from `set` to `append` for **every** caller (CollectionPanel, ImageGallery, DriveHome, RightPaneFolder, knowledge AllNotes/NoteResults/NotesLanding/FileLinkModal). All pass a single value or nothing; URL probe shows identical strings for single values.
7. Smart folder save/replay (SmartFolderSaveButton / `lib/driveViews.ts`) — code untouched, but the user guide now promises `tag:` survives a save; it does (raw `q` is stored and replayed through the same page).

Candidates for a missing invariant: (3) — "a query without operators mounts `search-modes` with the same props" (held today by `FolderBrowser.header.test.tsx`, M49 killed) and "with operators the slot is absent" (not held, M45 survived). Nothing else looked like it needs one.

## Q2 — invariant checks

- **Invariant 1 holds.** Probes at `716b40da9` vs `434a22786`, identical output:
  - modal unscoped `"  a  b "`: listing params `{"search":"a  b","limit":8}` (same keys, same order), semantic `("a  b","main")`, cache key `{query:"a  b",type:null,includeSceneClip:false}`.
  - modal scoped (Notes): `{"search":"a  b","limit":8,"type":"text"}`, no semantic availability call, cache key `type:"text"`, Enter → `/drive/main/addons/knowledge?view=all&q=a%20%20b`.
  - search page `("  a  b ", null)`, `("review","video")`, `("review","document")`: defined listing params identical, semantic `(q, drive, {limit:50,type})` identical, merged rows/`match_meta` identical. The page's params object now carries `tag/favorite/liked: undefined` keys; real `getDriveFiles` yields the same URL (`search=a++b&type=video&sort=created_at&order=desc&page=1&limit=30` from both shapes).
- **Invariant 4**: modal skips availability + semantic request; page clears hits (M22/M23 killed). The modal keeps the previous query's rows (semantic ones included) on screen until the filtered listing paints — the same stale-while-typing as any query change before this PR; not raised.
- **Invariant 5**: operators-only sends `search: ""` + filters; no badge (M14/M25/M41 killed). Search page Relevance → `created_at desc`, stable sort keeps it.
- **Invariant 7**: unscoped Enter / "View all" → `?q=<raw>`; scoped Enter and the footer link → `?q=<raw>&type=<scope.type>` (M34–M38 killed); page intersection uses the same `resolveKinds` as the modal, and the page hydrates from the modal's cache entry under the same key. Scoped modal shows no history, so no history path loses the scope kind.
- Scope ∩ `type:` and toolbar ∩ `type:`, disjoint → no request (M4/M12/M24 killed). Pagination with a skipped request: `total 0`, `hasMore` false.
- Only F1 is a user-visible defect found; F2 breaks CI.

## Q3 — drive boundary

No cross-drive reach. Parsed tags/kinds/flags go only to `GET /api/drives/{current drive}/files`; `searchPageHref` uses the modal's current drive (URL-encoded); `type` in that href comes from the typed `SearchScope.type`. No tag candidates in this PR. A locked drive's 404 goes through the existing catch paths (empty list).

## Q4 — mutation table

Targeted set = searchQuery, GlobalSearch{,.scope,.jump}, useFolderFiles, api, searchMerge tests (263 tests); "full" = `src` or `src/components src/app`.

| id | file | mutation | want | result | note |
|---|---|---|---|---|---|
| M1 | searchQuery | text always `words.join(" ")` | kill | killed | byte-for-byte row |
| M2 | searchQuery | drop `holds(kind, fixed) ? fixed` | kill | killed | |
| M3 | searchQuery | `holds` without document nesting | kill | killed | |
| M4 | searchQuery | `impossible` always false | kill | killed | |
| M5 | searchQuery | no tag dedup | kill | killed | |
| M6 | searchQuery | invalid `type:` counts as operator | kill | killed | |
| M7 | searchQuery | drop `markdown` alias | kill | killed | |
| M8 | searchQuery | drop full-width colon | kill | killed | |
| M9 | searchQuery | no NFKC on name | kill | killed | |
| M10 | searchQuery | unfixed kinds → first only | kill | killed | |
| M11 | searchQuery | no normalise on `is:`/`type:` value | kill | killed | |
| M12 | useFileSearch | drop impossible guard | kill | killed | |
| M13 | useFileSearch | semantic not skipped for operators | kill | killed | |
| M14 | useFileSearch | `nameMatched = true` | kill | killed | |
| M15 | useFileSearch | `search: query.trim()` | kill | killed | 52 fail |
| M16 | useFileSearch | drop `tag` | kill | killed | |
| M17 | useFileSearch | drop `liked` | kill | **survived** | code correct; `is:liked` forwarding asserted nowhere in the modal |
| M18 | useFileSearch | drop `favorite` | kill | killed | |
| M19 | useFileSearch | single kind sent as array | kill | killed | |
| M20 | useFileSearch | send `parsed.types` instead of resolved kinds | kill | killed | |
| M21 | useFileSearch | cache key `query: parsed.text` | kill | **survived** | code correct; would let `foo tag:x` read `foo`'s cached semantic hits (inv 4); cache is mocked in tests |
| M22 | useFolderFiles | semantic effect ignores operators | kill | killed | |
| M23 | useFolderFiles | skip without clearing hits | kill | killed | |
| M24 | useFolderFiles | drop impossible guard | kill | killed | |
| M25 | useFolderFiles | `nameMatched: true` | kill | killed | |
| M26 | useFolderFiles | `search: searchQuery.trim()` | kill | killed | |
| M27 | useFolderFiles | drop `tag` | kill | killed | |
| M28 | useFolderFiles | drop `liked` | kill | **survived** | code correct; the `is:liked` test asserts only `match_meta` |
| M29 | useFolderFiles | drop `favorite` | kill | killed | |
| M30 | useFolderFiles | kinds ignore operators | kill | killed | |
| M31 | useFolderFiles | toolbar kind ignored | kill | killed | |
| M32 | useFolderFiles | drop `parsed, searchKinds` from fetchPage deps | kill | survived | eslint exhaustive-deps flags it (warning); query-change refetch not held by a test — same gap existed for `searchQuery` before |
| M33 | useFolderFiles | drop `parsed.hasOperators` from effect deps | live | survived | equivalent: `searchQuery` is a dep |
| M34 | GlobalSearch | scoped see-all always own href | kill | killed | |
| M35 | GlobalSearch | scoped see-all without `type` | kill | killed | |
| M36 | GlobalSearch | scoped see-all always core page | kill | killed | inv 1 for scoped Enter |
| M37 | GlobalSearch | Enter uses raw `scope` | kill | killed | |
| M38 | GlobalSearch | footer uses raw `scope` | kill | killed | |
| M39 | SearchResultsList | highlight raw query | live | survived | painting (standing decision) |
| M40 | SearchResultsList | highlight always `parsed.text` | live | survived | equivalent: `markMatches` trims, and no-operator `text` is `q.trim()` |
| M41 | searchMerge | ignore `nameMatched` | kill | killed | |
| M42 | api | `tag` `set` instead of `append` | kill | **survived (full suite)** | code correct (URL probe `tag=x&tag=y`); the only frontend holder of inv 3's wire shape; every test mocks `getDriveFiles` |
| M43 | api | `type` `set` instead of `append` | kill | **survived (full suite)** | as M42 (`type=video&type=image`) |
| M44 | api | drop empty-tag skip | live | survived | parser never yields an empty tag; backend drops `?tag=` (PR 1) |
| M45 | FolderBrowser | `search-modes` shown with operators | kill | **survived (full)** | code correct; slot hand-off would carry the raw operator query to intelligence Find (inv 4 on click) |
| M46 | search page | scene toggle shown with operators | live | survived (full) | painting |
| M47 | useLauncherRows | `off` without `browsing` | kill | survived (search tests; one unrelated PdfPreview timeout in the wide run) | pre-existing: same mutation survives at `434a22786`; browse mode renders a different list |
| M48 | useLauncherRows | `off` without `scope` | kill | killed | |
| M49 | FolderBrowser | `search-modes` never shown | kill | killed (full) | inv 1 for the slot |
| M50 | search page | scene toggle never shown | kill | survived (full) | pre-existing gap: the toggle was never under test; painting/control |

Survivors meant to survive: M33, M39, M40, M44, M46. Survivors on correct code, listed per the standing decision (no new tests asked for): M17, M21, M28, M42, M43, M45. Pre-existing: M32 (shape), M47, M50.

Tree restored after every mutation (`git checkout -- <file>`); probe test files deleted; second worktree at `434a22786` removed; `git status --short` clean at the end.

TOTAL: 3 findings
