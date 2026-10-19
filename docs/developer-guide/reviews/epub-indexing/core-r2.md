# PR-B core review, round 2

Reviewed: fix commit `48d768191` (tree at `48d768191`), worktree `/Users/libre/Sources/video_share-epub-index`.
Reviewer: independent subagent, no author context. Tree restored after every mutation; nothing fixed.
Record read: `invariants.md`, `core-r1.md` (F1 is what this fixes; F2 ledgered, not re-reported).

## Mutation log

Runner: `scratchpad/pr-b-r2/mut.py`. Each mutant of `frontend/src/hooks/useSelectedFile.ts` ran against the CI command
`pnpm exec vitest run` over `useSelectedFile.test.tsx`, `RightPaneFile.test.tsx`, `CollectionDetail.test.tsx`,
`CollectionItemsPane.test.tsx`, `useFileNav.test.tsx`. Baseline (plus the four `FolderBrowser.*` files that use the hook): 9 files, 200 tests green.
`pnpm exec tsc --noEmit` and eslint on the two changed files: clean.

| id | mutation | want | got |
|---|---|---|---|
| M1 | drop `"section"` from FILE_LOCATION_PARAMS | kill | kill (section row) |
| M2 | drop `"page"` | kill | kill (page row) |
| M3 | drop `"t"` | kill | kill (t row) |
| M4 | same-file check removed (always delete) | kill | kill (re-select A row) |
| M5 | same-file check inverted (`===`) | kill | kill (all four rows) |
| M6 | delete moved after `params.set(file, id)` with the check evaluated there (always equal, never deletes) | kill | kill |
| M7 | check evaluated before `set`, delete after `set` | live | live (equivalent: the keys are disjoint from `file`) |
| M8 | check against `searchParams` instead of the copied `params` | live | live (equivalent: same contents at that point) |
| M9 | add `"highlight"` to the list | kill | kill (highlight/view row) |
| M10 | never delete (`if (false)`) | kill | kill |

All want/got agree. `git status` after the run: only the untracked review files.

## Callers checked

`grep selectFile|useSelectedFile` over `frontend/src` and `addons/*/frontend` (no addon uses the hook):

| caller | what it does | location key intended on the target? | effect of the fix |
|---|---|---|---|
| `TwoPaneLayout.handleSelectFile` ← `FolderTreePane` row click | open another file from the tree | no | drops the previous file's keys (F1 fixed) |
| `RightPaneFile` `useFileNav({ onNavigate: selectFile })` | arrow keys / swipe next-prev in the drive pane | no | drops (F1 fixed) |
| `RightPaneFile` ImageGallery `onClose` | only when `currentFileId !== fileId` | no | drops; images read none of the keys anyway |
| `CollectionItemsPane` item click | switch item in the collection pane | no | drops |
| `CollectionDetail` → `FileNavigationOverrideProvider onNavigate={selectFile}` → `useFileCardLink` override wrapper (FileGrid / FileListRow cards inside a collection) | card click | no | drops |
| `FolderBrowser` | reads `fileId` only | — | none |

No caller sets `file` together with `t` / `page` / `section` through `selectFile`: the hook's signature takes only an id, so none can.

Links that land at a location do not go through `selectFile`:

- `MatchOverlay` pills (`?t=`, `?page=`, `?section=`), rendered in `FileGrid` / `FileListRow` (in-drive search) and `MergedResultItem` (global search), are `next/link` to `/files/{id}?<key>=N` with `stopPropagation`, so the card wrapper (Link or the collection override `div`) never runs. `/files/[id]/page.tsx` redirects through `buildCanonicalFileUrl`, whose `CARRIED_QUERY_KEYS` still carries all three. Invariants 6 and 8 are untouched by this commit; the pill hrefs are held by round-1 M26/M34 and the redirect by M01.
- Ordinary folder cards use `fileLinkHref(file, sortQuery)`, which builds a fresh query and never carried a location key (before or after).
- The collection / folder-play full-screen route builds next-file URLs from `buildNavUrl`'s own allowlist (`collection`, `folder_play`, `sort`, `order`), so it drops location keys already. Unchanged, as claimed.
- The only readers of `t` / `page` / `section` are `RightPaneFile` and `FileDetailFullScreen`, both gated on a file being selected.

Residual checked, not a finding: `clearFile` does not drop the location keys, so closing the pane leaves e.g. `?section=3` with no `file`. Nothing reads it without a file, and the next `selectFile` sees `file == null !== id` and drops it; `fileLinkHref` builds fresh. No path reaches a file with the stale key.

## Trajectory answer

Round 1 (`59bb836c9..a83112c1c`) is the implementation, not a fix; it added `section` to `CARRIED_QUERY_KEYS` and threaded `initialSection` through the hosts. Round 2 (`48d768191`) adds one branch (the same-file check) and one constant list. Only one fix round exists, so "two rounds in a row adding a branch/state/prediction" cannot hold yet. The shape of this fix is a class-wide rule (every in-file location key, on every file switch) rather than a special case for `section`, so it also closes the pre-existing `page` / `t` carry instead of adding a case for the new key. That reads as converging, not patching.

One observation for the supervisor, not counted: `FILE_LOCATION_PARAMS` is a subset of `CARRIED_QUERY_KEYS` kept as a separate literal. A future in-file location key has to be added to both; nothing fails if only the redirect list gets it (it would leak across files the way F1 did). No user can hit this today.

## Findings

None. The fix does what it claims: switching file drops `section`, `page` and `t`; re-selecting the current file keeps them; other keys (`sort`, `highlight`, `view`) are copied as before. Every mutant of the change is killed except two equivalent ones. No caller of `selectFile` relied on carrying a location key, and no search pill, timestamp pill or chapter pill routes through it, so invariants 6, 7 and 8 are not affected.

TOTAL: 0 findings
