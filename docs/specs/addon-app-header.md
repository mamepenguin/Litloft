# App header and Target for addon pages

SPEC-ID: SPEC-ADDON-106

Approval:

## Summary

The built-in apps (Video, Reading) share a header: the app's icon and title, the scope line
"<drive> · N items", a **Target** button that replaces the app's default target with one of
the drive's smart folders, and a tabs row. An addon page cannot use that Target today: the
key the choice is remembered under is built from `AppId`, a closed list of the built-in
apps (`frontend/src/lib/appPrefs.ts`), and the rule that turns a smart folder into listing
conditions exists only inside the Reading and Video apps.

This change opens three things to addons, without the core naming any addon:

- **An app key that can be an addon.** `TargetMenu`, `AppHeader` and the storage helpers
  take either a built-in app id or `{ addon: <addon name> }`. An addon's keys live under
  `litloft.addon.<name>.`, apart from every built-in key. Built-in keys do not change.
- **One resolver for "a smart folder within these kinds".** `resolveAppTarget(folder,
  baseKinds)` is Reading's rule with the base kinds as an argument. Reading calls it with
  its own kinds and behaves as before. Video keeps its own resolver.
- **A backend helper on the documented surface.** `filtered_drive_files` in
  `app.routers.drives`, the predicate the file listing and the shelves endpoint share, is
  added to the in-process addon import table, so an addon applies a target with the same
  predicates and gets the same set.

The first user is the Photo Diary addon (its own spec, `SPEC-PD-016` and `SPEC-PD-017`
in that repository). This change alters nothing a viewer can see in the core.

## Required items

### 1. Normal flow

1. An addon page draws `AppHeader` with `target.app = { addon: "<name>" }`, where
   `<name>` is the addon's own name (`^[a-z][a-z0-9_-]*$`, the rule the addon loader
   already applies). The key builder uses the name as given; it neither checks nor encodes
   it. The regex is part of the documented contract, and the loader has already refused
   any other name before a page can call this.
2. `TargetMenu` behaves exactly as it does for a built-in app: the default row with the
   count of `defaultTargetTypes`, the smart folders in the viewer's shown set, a disabled
   row for each folder `isUsable` rejects, and **Manage…**. The shown set is read from and
   written to the addon's key (table in 4). `TargetMenu` and `useShownTargets` compare the
   app key and `defaultTargetTypes` by value (a string derived from each), so an addon
   that writes `{ addon: "<name>" }` or `["image"]` inline does not re-read storage or
   re-request the default count on every render.
3. The addon reads the saved target with `readAppTarget(drive: string, app: AppKey):
   string` and saves a choice with `writeAppTarget(drive: string, app: AppKey, id:
   string): void`, both exported from `frontend/src/lib/appPrefs.ts`, where `AppKey` is
   `AppId | { addon: string }`. `id` is `"default"` or a smart folder id. For a
   built-in app these read and write the same key as `readAppPrefs` / `writeAppPrefs`
   use for `target`. `readAppTarget` does not check the id against the drive's folders:
   the caller falls back to the default target for a folder that is gone or unusable and
   keeps the saved id, as Reading does, and the documentation says so.
4. The addon resolves the chosen folder with `resolveAppTarget(folder: SmartFolder |
   null, baseKinds: readonly FileKind[]): AppTarget`, in a new module
   `frontend/src/lib/appTarget.ts` that also exports `AppTarget` and `AppTargetParams`
   (the shapes `ReadingTarget` and `ReadingTargetParams` have today). `baseKinds` is
   non-empty and holds only kinds that hold no other kind (every kind except `document`);
   the resolver throws for an empty list or for `document`, since either would silently
   widen or empty the target.
   - `folder === null` (the default target) → usable, `params.type` = `baseKinds`.
   - The folder's query has a negated operator or any duration part. A negated operator
     is `-` or `!` at the start of the query or after whitespace, then one of `tag`,
     `type`, `path`, `in`, `size`, `duration`, `is` in any letter case, then optional
     spaces and `:` or the full-width `：`. Either gives `{ usable: false, reason:
     "unsupported_part" }`.
   - The folder's own kind and its query's kinds contradict (`resolveKinds(...).impossible`),
     or the kinds they name hold none of `baseKinds` → `{ usable: true, empty: true,
     params: null }`.
   - Otherwise usable, with `params.type` = the base kinds the named kinds hold (all of
     `baseKinds` when no kind is named), and `search`, `tag`, `folder`, `collection`,
     `favorite`, `liked`, `size` from the query, as Reading builds them today.
5. `resolveReadingTarget(folder)` becomes `resolveAppTarget(folder, READING_BASE_KINDS)`.
   `ReadingTarget` and `ReadingTargetParams` stay as aliases of the new types and
   `READING_BASE_KINDS` stays exported, so the Reading files that import them are not
   edited.
6. On the backend, an in-process addon calls
   `filtered_drive_files(db, drive_name, *, path, recursive, search, favorite, liked, tag,
   type, folder, collection, size, duration)` and narrows its own query to the ids of the
   query in the returned `(query, normalized_search)` pair. The documented contract is
   these parameters, with the listing's meaning, and that return shape. The function's
   other keyword parameters (`trust`, `origin`, `exclude_origin`) stay undocumented.
   The listing validates two inputs in FastAPI before calling it, so the caller owns them:
   `search` at most 200 characters and every `type` a `FileKind`. Given those, it answers
   as the listing does, including 400 for a `path` with `..` or a leading `/` and for a
   `folder`, `collection`, `size` or `duration` that does not normalise.

**What becomes documented surface.** The new `ADDON-DEVELOPMENT.md` section lists, and
from then on "Extension-point changes" covers: `AppHeader` and `AppHeaderProps`,
`TargetMenuProps` (`@/components/appshell/AppHeader`, `@/components/appshell/TargetMenu`),
`AppKey`, `readAppTarget` / `writeAppTarget` (`@/lib/appPrefs`), `resolveAppTarget`,
`AppTarget`, `AppTargetParams` (`@/lib/appTarget`), `useLoad` / `LoadState`
(`@/components/appshell/useLoad`) and `getSmartFolders` (`@/lib/api`), `PageTabs`
(`@/components/PageTabs`), `SmartFolder` (`@/types/smartFolder`), `FileKind`
(`@/types`), the two storage key shapes in 4, and `filtered_drive_files` as stated in 6.
The "Extension-point changes" list of what counts as breaking gains a bullet: a name,
prop or storage key shape in that section removed, renamed or given another meaning.

### 2. Failure cases

- Storage refuses a read or a write (private window, quota): the read gives `"default"` /
  "never saved", the write is dropped, as the built-in apps behave today.
- A stored target or shown set from a built-in key is never read for an addon key, so a
  value saved for Video cannot select or hide a folder in an addon.
- `filtered_drive_files` raises `HTTPException(400)` for a filter or path that does not
  normalise (a malformed size, for example), as it does for the listing. The addon's route
  passes it on.
- `resolveAppTarget` with an empty `baseKinds` or one holding `document` throws.

### 3. States

None new. The target is `"default"` or a smart folder id, as for the built-in apps. A
resolved target is usable, usable-and-empty, or unusable, as Reading's is today.

### 4. Data read and written

Browser `localStorage` only. Keys, with `<d>` = `encodeURIComponent(drive)`:

| App key | Target | Shown set |
|---|---|---|
| built-in `video` | `litloft.videoApp.target.<d>` (unchanged) | `litloft.videoApp.targets.<d>` (unchanged) |
| built-in `reading` | `litloft.readingApp.target.<d>` (unchanged) | `litloft.readingApp.targets.<d>` (unchanged) |
| `{ addon: n }` | `litloft.addon.<n>.target.<d>` | `litloft.addon.<n>.targets.<d>` |

`face` and `classification` stay built-in only: `readAppPrefs` / `writeAppPrefs` keep
taking a built-in id. No table, no endpoint, no backend code change.

### 5. External services

None.

### 6. Authorization

Unchanged. The smart folder list is read through the existing
`GET /api/drives/{drive}/smart-folders`, which applies drive access. `filtered_drive_files`
filters by the drive it is given and does not check access itself; the addon's route runs
its own drive check before calling it, as every in-process addon route must
(`docs/ADDON-DEVELOPMENT.md`, drive context header).

### 7. Effect on existing features

- Reading: its resolver is replaced by a call with its kinds. Every existing
  `readingAppTarget` test keeps passing unchanged.
- Video: unchanged. `resolveVideoTarget` is not moved onto the new resolver: it accepts
  duration parts and does not reject negated operators, and changing that is not this
  change.
- `TargetMenu`, `useShownTargets`, `readShownTargets`, `writeShownTargets` change the type
  of their `app` argument; built-in callers pass the same strings as before.
- Built-in apps' saved choices: same keys, so nothing a viewer saved is lost.

### 8. Error behavior

Nothing new. Storage failures are silent, as now. A 400 from `filtered_drive_files` is the
caller's to show.

### 9. User-visible behavior

None in the core. Video and Reading look and behave as before. The Photo Diary spec
describes what its viewers see.

### 10. Non-functional

No new request. `resolveAppTarget` is synchronous and runs over one folder's query.

## Touch points

- `frontend/src/lib/appPrefs.ts`: the app key type (a built-in id or `{ addon: string }`),
  the key builder for target and shown set, `readAppTarget`, `writeAppTarget`;
  `readShownTargets` / `writeShownTargets` take the app key.
- `frontend/src/lib/appTarget.ts` (new): `resolveAppTarget`, its target and params types.
- `frontend/src/lib/readingAppTarget.ts`: `resolveReadingTarget` calls `resolveAppTarget`.
- `frontend/src/components/appshell/TargetMenu.tsx`, `useShownTargets.ts`,
  `AppHeader.tsx` (through `TargetMenuProps`): the type of `app`.
- Tests: `frontend/src/lib/__tests__/` (keys, resolver), the existing
  `readingAppTarget.test.ts`, `appPrefs.test.ts`, `appPrefs.targets.test.ts` and
  `components/appshell/__tests__/TargetMenu.test.tsx` stay as they are and pass; a new
  `TargetMenu` test with an inline addon key (I8); a backend test in `backend/tests/` for
  listing parity of `filtered_drive_files` (I9). No backend code changes.
- `docs/ADDON-DEVELOPMENT.md`: `app.routers.drives` / `filtered_drive_files()` added to
  "Allowed imports" with the contract of step 6; a new section on drawing the app header
  and Target in an addon page listing the names under "What becomes documented surface",
  the storage keys and the caller's fallback for a gone or unusable folder; the new bullet
  in "Extension-point changes".
- Rules passed through: `.claude/rules/design-decisions.md` "No core-to-addon
  dependencies" and "A drive is a security boundary"; `.claude/rules/frontend-conventions.md`.
- `docs/specs/INDEX.md`.
- No protected path.

## Invariants

I1. A target or shown set saved for Video or Reading before this change is still the
selected target and the shown set after it: their keys are `litloft.videoApp.*` and
`litloft.readingApp.*` exactly as before.

I2. An addon's keys start with `litloft.addon.<name>.`, so no addon name, `video` and
`reading` included, reads or overwrites a built-in app's target or shown set.

I3. Two addons with different names keep separate targets and shown sets for the same
drive, and a choice made in one drive never applies to another drive, including a drive
whose name is a prefix of the other's.

I4. `resolveAppTarget` marks a folder unusable whenever its query has a negated operator
or a duration part, whatever the base kinds.

I5. `resolveAppTarget` never returns a `type` outside the base kinds: a folder that names
no kind gets every base kind, one whose kinds hold none of them is empty with no params,
and an empty base list or one holding `document` throws instead of resolving.

I6. `resolveReadingTarget` returns the same result as before for every folder, so the
Reading app requests and lists the same books.

I7. No core frontend or backend file names an addon to make this work: the app key of an
addon comes only from the addon's own call.

I8. With an addon key written inline, a shown-set toggle made while storage refuses the
write still applies after the addon page re-renders, and the open menu requests the
default count once; a change of the key's value (another addon name, or `"video"` against
`{ addon: "video" }`) reads that key's shown set, and a change of `defaultTargetTypes`'s
value requests the default count again.

I9. `filtered_drive_files` called with the documented parameters selects exactly the files
`GET /api/drives/{drive}/files` lists for the same parameters, and a malformed `size`
raises 400. (`search` and `type` within the caller's bounds of step 6.)

## Checked, no action

- **Opening `AppTabs`.** Not needed: `AppHeader` already takes any `tabs` node, and an
  addon passes `PageTabs` with its own faces. `AppTabs` stays Discover / Library.
- **A shared `useAppTarget` hook.** Reading's hook also loads its count, faces and group,
  and the addon's needs differ (Photo Diary sends a target to its own endpoints). The
  pieces above are enough for an addon to write a short hook; a shared one waits for a
  second addon.
- **Moving Video onto `resolveAppTarget`.** Video allows duration and has no negation
  check; aligning the rules would change which folders Video accepts.
- **Opening `face` / `classification` to addons.** An addon's faces are its own; Photo
  Diary keeps its view in the URL.
- **An Internal API endpoint for external-service addons.** `POST /files/matching`
  already serves them; this change is for in-process addons.
- **iOS app.** It wraps the web UI; nothing to change.
