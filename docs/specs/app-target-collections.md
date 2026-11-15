# Collections in the apps' Target menu, and member targets for addon apps

SPEC-ID: SPEC-CORE-118
SPEC-ID: SPEC-CORE-119

Approval:

## Summary

The apps' Target menu (`TargetMenu`, shared by Video, Reading and the Photo Diary addon)
lists only Smart Collections. A viewer who gathered files by hand in a collection cannot
narrow an app to it. This spec lists collections in the Target menu and in Manage…, beside
Smart Collections in one name-ordered list, and lets Video and Reading use a collection as
their target. It also opens to addons what Photo Diary needs to do what SPEC-CORE-117 did
for Video and Reading: the id filter of `filtered_drive_files` and the member-target
helpers. The user of all of it is the one person who runs Litloft.

- **SPEC-CORE-118**: collections in `TargetMenu` and `ManageTargetsDialog`, the saved id of
  a collection target, and Video and Reading resolving a collection target.
- **SPEC-CORE-119**: the addon surface. `filtered_drive_files`'s `file_ids`, the target-id
  and collection-target helpers, the member-target helpers, and the `TargetMenuProps` that
  carry collections become documented names in `docs/ADDON-DEVELOPMENT.md`.

The Photo Diary side (member targets and collection targets in its own routes and pages) is
the addon's spec, `docs/specs/target-members.md` in `mamepenguin/Litloft-photo-diary-addon`
(SPEC-PD-021, SPEC-PD-022), approved together with this one. This change merges to the
core's `develop` first, because the addon's CI builds against it.

Not in this spec: the Home and sidebar entries of the apps; Ask, MCP and search (they
already take collections); a collection's own sort order applied to the app (the app owns
the order, as for Smart Collections).

## Agreed design

No new artboard (agreed). The rows reuse what exists:

- A collection row and a Smart Collection row carry the icons the Ask page's ＋ 範囲 →
  コレクション uses (SPEC-ADDON-110 D5,
  `docs/process/reviews/feature-smart-collection-parity/design/Ask.dc.html`): `Library` for a
  collection, `ListFilter` for a Smart Collection, 14px, `text-text-muted`. In the Target
  menu the icon sits between the radio row's check column and the name; in Manage… between
  the checkbox and the name. The default row has no icon.
- Everything else in the menu and the dialog (sizes, spacing, the default row's count,
  disabled rows, Manage…, the dialog's search field, retry and 完了) is unchanged.

## Definitions

- **Target id.** What `readAppTarget` returns and `writeAppTarget` and the shown set store:
  `"default"`; a Smart Collection's id, bare, exactly as today; or `collection:<id>` for a
  collection's id. Collection and Smart Collection ids are 12-character nanoids with no
  `:`, so a bare id is never read as a collection and an id saved before this change keeps
  its meaning. The storage keys do not change.
- **Target list.** The drive's collections (`GET /api/drives/{drive}/collections`) and Smart
  Collections (`GET /api/drives/{drive}/smart-folders`) in one list, ordered by name with
  `new Intl.Collator(locale, { numeric: true })`; equal names put the collection first, then
  compare ids. This is the sidebar's initial order (SPEC-CORE-107) and D5's.
- **Collection target.** The target a `collection:<id>` names, resolved against the loaded
  collection list. It sends the app's base kinds as `type` and the collection's current name
  as `collection`, nothing else. A collection is always usable.

## Required items

### 1. Normal flow

**SPEC-CORE-118 (Target menu and the core apps).**

1. `TargetMenuProps` gains one optional prop, `collections?: { list:
   LoadState<CollectionSummary[]>; retry: () => void }`, so a caller that gives the list
   always gives its retry. Without it the menu lists no collection and otherwise behaves as
   today, except for the order and icons of step 2. No existing prop changes.
2. The menu lists the default row (with its count, as today), then the target list's
   entries that are shown (step 4), in the target list's order, each with its icon. A
   Smart Collection row is disabled with the unavailable title when `isUsable` says so, as
   today; a collection row is never disabled. The current target, when not in the shown
   set, is listed too, at its place in the order (today it is appended at the end).
3. Choosing a collection row calls `onChoose("collection:<id>")`; a Smart Collection row
   calls `onChoose(<id>)` as today; the checked row is the one whose target id equals
   `selectedId`.
4. Shown set (unchanged rule, now over both kinds): never saved means every Smart
   Collection (an unusable one disabled, as today) and every collection is listed; a saved set lists exactly the entries whose
   target id it holds (an empty set lists none), so a collection created after the set was
   saved is not listed until the viewer checks it in Manage… (agreed). Saved ids not in the
   loaded lists are ignored.
5. Manage… lists the target list (both kinds, the same order and icons), filtered by the
   search field over names as today. Toggling a collection adds or removes
   `collection:<id>` in the app's shown set, the first toggle saving the set as today (from
   never saved: every usable Smart Collection and every collection, then the toggle).
   While any list given to the menu is still loading, Manage… lists the rows of the lists
   already loaded with their checkboxes disabled, so no toggle is written from a partial
   list; the menu itself lists the rows of the lists already loaded and may be chosen from,
   as today while the Smart Collection list loads. A toggle writes the checked entries of
   both loaded lists; saved ids in neither list are dropped, as today.
6. Video and Reading load the collection list on mount alongside the Smart Collection list
   and pass both to the menu.
7. A saved `collection:<id>` is looked up in the collection list only; while that list is
   loading, the app is not ready and sends no request carrying the target (as for a saved
   Smart Collection today). A saved bare id waits for the Smart Collection list only, as
   today. A saved `"default"` waits for neither.
8. When the collection is found, every request the app makes under the target (the header
   count, Discover, Library, the shelf pages, the provider shelf page and the restriction of
   suggested videos) carries `type` = the app's base kinds (Video `["video"]`, Reading
   `["pdf", "epub", "archive"]`) and `collection` = the collection's name, through today's
   GET routes. It carries no `search`, `tag`, `folder`, `size`, `duration`, `favorite`,
   `liked` or `file_ids`. The conditions a face or page adds itself apply as today. The
   Target control shows the collection's name.
9. The name sent is the one in the list loaded on mount (or on the last retry). The
   Discover cache works for a collection target as for a listing-parameter target (its key
   holds the params, so the name).

**SPEC-CORE-119 (addon surface).**

1. `filtered_drive_files(..., file_ids=...)` becomes part of the addon surface with the
   meaning it has in the listing (SPEC-CORE-115): a file passes the `in:` condition when it
   is in a named collection or its id is in `file_ids`; with no collection, only when listed;
   `file_ids=[]` passes nothing through `in:`; every other condition still applies; `None`
   (the default) is today's query. The caller caps the list (10,000 in the core's routes).
   `trust`, `origin` and `exclude_origin` stay outside the surface.
2. `@/lib/appTarget` gains, and documents:
   - `parseAppTargetId(id)` → `{ kind: "default" } | { kind: "smart"; id } |
     { kind: "collection"; id }`; anything that is not `"default"` and does not start with
     `collection:` is `smart`;
   - `collectionTargetId(collectionId)` → `"collection:<id>"`;
   - `resolveCollectionTarget(collection, baseKinds)` → `{ usable: true, params: { type:
     [...baseKinds], collection: [collection.name] } }`, with the same `baseKinds` check
     (throws) as `resolveAppTarget`.
   Video and Reading use them; they do not keep a second copy.
3. Documented as they are today (no behavior change): `resolveMemberTarget`,
   `evaluateMemberTarget`, `MemberTarget`, `MemberEvaluation` from `@/lib/memberTarget`;
   `useMemberTarget` from `@/components/appshell/useMemberTarget`; `MEMBER_ID_LIMIT` from
   `@/lib/inNameResolution`; `getCollections` from `@/lib/api`; `CollectionSummary` from
   `@/types`; `RetryButton` from `@/components/appshell/RetryButton`.
4. The "Drawing the app header and Target" section states that `readAppTarget` may return
   `collection:<id>` once the page passes `collections` to the menu, and shows the
   collection and member paths in its example.

### 2. Failure cases

- The collection list fails to load: the menu lists the default row, the Smart Collections
  and Manage…; Manage… shows today's `RetryButton` in place of the list, which calls the
  retry of every given list that failed (and only those). A saved `collection:<id>` gives the default target at once,
  the saved id kept; a retry that loads the list applies it as a target change, as a saved
  Smart Collection does today.
- The Smart Collection list fails and the collection list loads: the menu lists the default
  row, the collections and Manage…; Manage… shows the retry in place of the list whenever
  any given list failed, as it does today for the one list.
- The saved collection is gone: the default target, the saved id kept (as a gone Smart
  Collection).
- The collection is renamed or deleted while the app is open: requests keep the old name,
  so the app lists nothing under it (or, if a collection of that name is created meanwhile,
  that collection's files) while the Target control shows the old name, until the app's
  lists are loaded again (a page mount or a retry). Accepted below.
- A locked or unknown drive: 404 as today.

### 3. States

Target in force for Video and Reading: default; a Smart Collection (listing parameters,
empty, or member target, as today); a collection. Look-up: a saved id waits for the one
list its kind needs; failure or absence of the entry gives the default target with the
saved id kept. Not allowed: a request carrying a target before its list has loaded; a
request under a collection target carrying any condition other than `type` and
`collection`; a collection row disabled.

### 4. Data read and written

- Read: `collections` through `GET /api/drives/{drive}/collections` (new for the apps), and
  the listing and shelves routes as today.
- Written: `localStorage` target and shown-set keys, unchanged keys, now also holding
  `collection:<id>` values. No table, column, migration or endpoint.

### 5. External services

None.

### 6. Authorization

Unchanged. The collection list and the listing are drive-scoped (`_validate_drive`), and
`collection` resolves only the request drive's collections.

### 7. Effect on existing features

- Every caller of `TargetMenu`: rows are now in name order (Smart Collections were in the
  server's newest-first order) and carry icons; the current target is no longer appended at
  the end. A caller that passes no `collections` lists no collection.
- Video and Reading with the default target or a Smart Collection target: unchanged
  requests and usability.
- Photo Diary built against this core before its own change: unchanged except for the order
  and icons; it passes no `collections`.
- `docs/ADDON-DEVELOPMENT.md`: names added; nothing removed or reinterpreted, so no
  *Extension-point changes* row. `readAppTarget` returning `collection:<id>` happens only
  for a page that passes `collections`.
- The Internal API: unchanged.

### 8. Error behavior

As in 2. Nothing is logged.

### 9. User-visible behavior

- The Target menu and Manage… of Video and Reading list collections with Smart Collections,
  by name, with the `Library` / `ListFilter` icons.
- Choosing a collection narrows the app to that collection's files of the app's kinds; the
  Target control shows its name.
- No new string.
- Docs: `docs/user-guide/video.md` and `docs/user-guide/reading.md` (a collection can be a
  target), `docs/ADDON-DEVELOPMENT.md` (SPEC-CORE-119).

### 10. Non-functional

One more list request per app mount. A collection target adds one subquery, as `in:` does.

## Touch points

- `frontend/src/components/appshell/TargetMenu.tsx`, `ManageTargetsDialog.tsx`,
  `frontend/src/components/ToolbarMenu.tsx` (`MenuRadioOption` gains an optional icon)
- `frontend/src/lib/appTarget.ts` (target-id and collection-target helpers),
  `frontend/src/lib/videoAppTarget.ts`, `frontend/src/lib/readingAppTarget.ts`
- `frontend/src/components/videoapp/useVideoApp.ts`, `VideoApp.tsx`, `VideoShelfPage.tsx`,
  `VideoAppHeader.tsx`, `useProviderShelfPage.ts`; `frontend/src/components/readingapp/useReadingApp.ts`,
  `ReadingApp.tsx`, `ReadingShelfPage.tsx`, `ReadingAppHeader.tsx` (whichever of these
  build `TargetMenuProps` or read the target's folder)
- `docs/ADDON-DEVELOPMENT.md`, `docs/user-guide/video.md`, `docs/user-guide/reading.md`
- Read, not changed: `backend/app/routers/drives.py` (`filtered_drive_files`'s `file_ids`,
  already there), `frontend/src/lib/memberTarget.ts`, `useMemberTarget.ts`,
  `frontend/src/lib/appPrefs.ts` (keys unchanged)
- Tests whose harnesses mock only `/smart-folders` (`VideoApp.*.test.tsx`,
  `ReadingApp.*.test.tsx`, shelf-page tests, `TargetMenu.test.tsx`,
  `ManageTargetsDialog` tests) gain a `/collections` answer; assertions of the old
  newest-first order or the appended current target change to the name order. No
  assertion is otherwise loosened.
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary, no
  core-to-addon dependency), `.claude/rules/frontend-conventions.md`
- No protected path is edited. No submodule pointer moves.

## Invariants

I1. The Target menu and Manage… list the drive's collections and Smart Collections in one
list ordered by `Intl.Collator(locale, { numeric: true })` on the name, a collection before
a Smart Collection of equal name and then by id, after the default row, each with its
`Library` or `ListFilter` icon; a collection row is never disabled; the current target is
listed even when not in the shown set, at its place in that order.

I2. Choosing a collection saves and selects `collection:<id>`; a bare saved id keeps
meaning a Smart Collection; a saved `collection:<id>` whose collection is not in the
loaded list, or whose list failed to load, gives the default target without deleting or
rewriting the saved id, and a later successful retry of the list applies it.

I3. In Video and Reading, every request under a collection target carries exactly `type` =
the app's base kinds and `collection` = that collection's name as target conditions, never
`search`, `tag`, `folder`, `size`, `duration`, `favorite`, `liked` or `file_ids` from the
target, so the app lists exactly the listing's answer for those parameters; the faces' and
pages' own conditions apply as today.

I4. While a saved target's list is loading, no request carrying a target goes out: a
`collection:<id>` waits for the collection list only, a bare id for the Smart Collection
list only, and `"default"` for neither.

I5. The shown set holds target ids of both kinds under the app's existing key: never saved
lists every Smart Collection (unusable ones disabled) and every collection; a saved set lists exactly its
members plus the current target; a toggle in Manage… changes only that app's and that
drive's set and never the current target; ids not in the loaded lists are ignored.

I6. Under the default target and under any Smart Collection target, every request Video and
Reading send carrying the target is exactly what it was before this change (the one new
request is the collection list on mount); a `TargetMenu` given no `collections` lists no
collection row.

I7. When any list given to Manage… failed to load, the dialog shows the retry in place of
the list, and the retry asks again for every failed list and no other; while any given list
is loading no toggle can be made, so a written shown set never lacks the entries of a list
that had not loaded.

I8. `parseAppTargetId` reads `"default"` as default, every `collection:<id>` as that
collection, and every other value as a Smart Collection id; `collectionTargetId` and
`parseAppTargetId` round-trip; `resolveCollectionTarget` throws for an empty base list or
one holding `document`, as `resolveAppTarget` does.

I9. `filtered_drive_files` called with `file_ids` selects exactly the files `POST
/api/drives/{drive}/files/query` lists for the same parameters and ids (SPEC-CORE-115 I1:
union with `collection`, only listed ids without it, `[]` passing nothing through `in:`),
and with `file_ids=None` exactly what it selected before; `docs/ADDON-DEVELOPMENT.md`
states this meaning.

## Revises

SPEC-CORE-059 I14. The shown set is saved per app and per drive under its own key and holds Smart Collection ids and `collection:<id>` values; never saved means every Smart Collection (an unusable one disabled) and every collection is listed, a saved set lists exactly its members (an empty set lists none), and the current target is listed whether or not it is a member.
SPEC-CORE-059 I15. Manage… never changes the current target and writes no Smart Collection or collection; a stored shown set that is not a JSON array of strings is read as never saved, and ids not in the drive's lists are ignored.
SPEC-CORE-117 I8. In Video and Reading, a member target sends no request under the target before its evaluation succeeds; every request after it carries `file_ids` = the evaluated members and `type` within the app's base kinds, and none of the target query's own conditions, while the face's and page's own conditions (folder chips, tag filter, watch state, URL folder and tag, `key`, `ids`) apply as today; no Discover cache entry is read or written; a failed evaluation replaces each face's or page's body with one retry control and a set over 10,000 with the この対象は使えません line, the header count is hidden, the Target control shows the Smart Collection's name, and neither falls back to the default target; a Smart Collection without free text produces exactly today's requests carrying the target and today's usability (the apps also request the collection list on mount, SPEC-CORE-118).
SPEC-CORE-054 I10. The face, classification and target are remembered per drive under separate keys; a stored value that is unknown, stale, not offered in the current state, or a Smart Collection or collection id that is not in this drive's list falls back to its default without an error screen and is never sent to the backend; a saved Watch state survives the profile's absence.

## Checked, no action

- A collection target by its id instead of its name: the listing's `collection` takes names,
  matched case-insensitively within the drive, and names are unique within a drive across
  both kinds (SPEC-CORE-108). Sending ids would need a new listing parameter. The cost is
  the rename case in 2.
- Evaluating a collection to `file_ids`, as a member target: not needed; `collection`
  selects exactly its items, without the 10,000 cap.
- Showing newly created collections in an app whose shown set was saved (agreed not to):
  the one rule for both kinds; Manage… lists them unchecked.
- A collection's own order inside the app: the app owns the order.
- An *Extension-point changes* row: nothing in the documented surface is removed or given
  another meaning. The order of the menu's rows is not part of the documented surface.
- The item count beside a collection row: Smart Collections show none; the default row's
  count is unchanged.
- A new design: agreed to reuse D5's icons; no artboard.
- iOS: it wraps the web UI.
