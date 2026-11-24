# App header and Target for addon pages, and a quieter Target

SPEC-ID: SPEC-ADDON-106
SPEC-ID: SPEC-CORE-099

Approval: sha256:debc2df3f6ed4943dacd0e9f602ff2f16f9cc6aa98068feae29919cda1282d86 Yuichi Senga 2026-11-13

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
in that repository).

**SPEC-CORE-099** changes how the app header looks, for Video and Reading as well as for an
addon. At a phone width the Target button sat on the title row, so a longer title than
"読む" / "動画" was cut short by it, and the filled button drew the eye before the title.
Now the title row never holds the Target below 640px: the Target moves to the right end of
the scope line. And the Target is drawn as a quiet control, muted text without a fill. The
user chose this (design option A) over putting the Target in the tabs row.

The domains: SPEC-ADDON-106 is the surface opened for addons; SPEC-CORE-099 is the visible
change to the core's own apps.

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
   use for `target`, and like `readAppPrefs` it reads an empty stored value as
   `"default"`. `readAppTarget` does not check the id against the drive's folders:
   the caller falls back to the default target for a folder that is gone or unusable and
   keeps the saved id, as Reading does, and the documentation says so.
4. The addon resolves the chosen folder with `resolveAppTarget(folder: SmartFolder |
   null, baseKinds: readonly FileKind[]): AppTarget`, in a new module
   `frontend/src/lib/appTarget.ts` that also exports `AppTarget` and `AppTargetParams`
   (the shapes `ReadingTarget` and `ReadingTargetParams` have today). `baseKinds` is
   non-empty and holds only kinds that hold no other kind (every kind except `document`);
   the resolver throws for an empty list or for `document`, since either would silently
   widen or empty the target. The throw is a programming-error contract: nothing catches
   it, so an addon that passes such a list fails on its first render in development; the
   documentation says so.
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
   `search` at most 200 characters and every `type` a `FileKind` or `"markdown"` (the
   listing's `FileKindParam`). Given those, it answers
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

**Header layout (CORE-099).** For every page drawn by `AppHeader` (the Video and Reading
apps and their shelf pages, and an addon page):

7. The title is one line; when it does not fit it is cut with an ellipsis, never wrapped.
8. The Target control has no fill and no border: the target icon, the target's name and a
   chevron, in the muted text colour (`text-text-muted`) at 14px (`text-sm`, the scope
   line's size). The word 対象 / Target is not drawn. Its accessible name is
   `<label>: <name>`, built by `ToolbarMenu` as it is today from `TargetMenuProps.label`
   (`対象` / `Target` from each app's own messages), and `<label>: …` while the name is
   being looked up; `label` also stays the menu's heading. Its hit area is at least 44px
   tall on a coarse pointer. On hover (where the device can hover) and while the menu is
   open it takes `bg-bg-elevated`. The control is a new `quiet` shape of `ToolbarMenu`;
   its existing `filled` and default shapes draw exactly as before.
9. At 640px and wider: the icon tile, then the title with the scope line under it, then the
   Target and any `actions` at the right end of the title row, as today.
10. Below 640px: the icon tile, then the title alone on its row, and under the title one
    line holding the scope text at its start and the Target at its end (`actions` are not
    on this line; step 12). The count part of the scope text (`· N本`) is never cut. When
    the line is short, the drive name is cut with an ellipsis first (decided by the user;
    the sidebar also names the drive), and the Target's name after it, down to a minimum
    of the icon, three characters and the chevron. A breadcrumb stays above, as today.
11. The tabs row stays under the header's lines at every width, unchanged.
12. `actions` (the shelf pages' sort menu): below 640px they leave the header's lines and
    sit on their own row, at its right end, as the header's last row: after the tabs row
    when there is one (decided by the user), so it is directly above the content (design
    option 2, chosen by the user over a full-width select and an icon-only button). At
    640px and wider they stay at the title row's end, left of the Target. The shelf pages
    pass their sort menu in the quiet shape at every width, showing its current choice
    (`↕ 追加日（新しい順） ▾`). The same sort menus on the Library faces keep their
    current shape (decided by the user): the shape is chosen by a prop the shelf pages
    pass, not by changing the sort menu components' default.
13. The header is still drawn by `PageHeader`, inside its `<header>`, which keeps the only
    `<h1>`: `AppHeader` passes a new `PageHeader` option that, below 640px, puts the
    Target at the scope line's end and the other `actions` on the last row of step 12.
    Every other `PageHeader` caller passes nothing new and draws as before.

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
- Video and Reading, their shelf pages: the header layout and the Target's look change
  (steps 7 to 11, 13); on the shelf pages the sort menu takes the quiet shape and, below
  640px, its own row (step 12). The Library faces' sort menus do not change.

### 8. Error behavior

Nothing new. Storage failures are silent, as now. A 400 from `filtered_drive_files` is the
caller's to show.

### 9. User-visible behavior

SPEC-ADDON-106 adds nothing visible. SPEC-CORE-099 changes the header of Video, Reading
and their shelf pages as in steps 7 to 13, including the shelf pages' sort menu; the menu that opens, its rows and Manage… are
unchanged.

Agreed design: https://claude.ai/artifact/3DhNVLqgN9R2mCaj2aNxii, saved in
`docs/process/reviews/feature-addon-app-header/design/` (`canvas.json` and the
`.dc.html` artboards; the menu artboards `Target-Menu.dc.html` and
`Target-Manage.dc.html` are Reading's, unchanged). The artboards draw Photo Diary; Video and
Reading take the same form with their own icon, title, count and tabs. Checkable lines:

- wide: title row = icon tile, title over scope line, quiet Target at the right end; tabs
  row under it;
- 375px: title alone on its row; under it the scope text at the start and the quiet Target
  at the end of the same line; tabs row under that;
- 375px with a long smart folder name: the name ends in an ellipsis inside the Target; the
  title and the scope text are whole;
- 375px shelf page (`Shelf-B.dc.html`): breadcrumb, title, scope line with the Target,
  then the quiet sort menu on its own row at the right, above the list;
- the Target shows no 対象 label and no fill.

Declared differences: the artboards' sidebar is an empty column, and their calendar, map
and pins are illustrative (they belong to Photo Diary's spec).

### 10. Non-functional

No new request. `resolveAppTarget` is synchronous and runs over one folder's query.

## Touch points

- `frontend/src/components/PageHeader.tsx` and its tests: the option of step 13
  (CORE-099).
- `frontend/src/components/videoapp/VideoShelfPage.tsx`, `readingapp/ReadingShelfPage.tsx`
  and their sort menus (`SortChoiceMenu`, `ReadingSortMenu`): a prop for the quiet shape,
  passed only by the shelf pages; the Library faces keep the default.
- `frontend/src/components/appshell/AppHeader.tsx`: passes that option.
- `frontend/src/components/ToolbarMenu.tsx`: the `quiet` shape;
  `frontend/src/components/appshell/TargetMenu.tsx` uses it. `toolbarMenuHome.test.ts`,
  `popup-dismissal.test.ts`, `reading-video-faces.html` and
  `readingVideoLayoutFixtureParity.test.tsx` keep passing unedited.
- `frontend/e2e-components/`: the real `AppHeader` rendered for Video, Reading and a shelf
  page with its sort menu, measured at 375px (default, long folder name, long drive name), 640px and
  1280px. The header test in `frontend/e2e-layout/video-app.spec.ts` measures a hand copy
  of the old header (`fixtures/video-app.html`); its header assertions move to the
  real-component test and the fixture's header is redrawn to the new shape.
- `DESIGN.md` §6 "Page Header": for an app header below 640px, the Target at the scope
  line's end and an actions row as a fourth row; the quiet control shape (no fill, no
  border, muted 14px, `bg-bg-elevated` on hover and open, 44px on a coarse pointer).
- `docs/user-guide/video.md`, `docs/user-guide/reading.md`: they name a **Target**
  button; they now say the control shows the target's name with a target icon, at the
  title row's end, or under the title on a phone.

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

I10. On every page drawn by `AppHeader`, below 640px the title row holds only the icon tile
and the title, the Target is on the scope line's row at its end, the title and the count
(`· N`) are never cut, the drive name being cut first when the line is short, and nothing in the header overflows the viewport at
375px, also with a long folder name as the target.

I11. At 640px and wider the Target is at the title row's right end, and at every width the
tabs row is under the header.

I12. The Target control draws no 対象 / Target text and no fill, and its accessible name is
`<label>: <name>` (`対象: すべての本`, for example).

I13. On a shelf page below 640px the sort menu is on the header's last row at its
right end, above the list, and shows its current choice; at 640px and wider it is on the
title row left of the Target.

I14. The title of an `AppHeader` page is one line at every width and is cut with an
ellipsis when it does not fit; the quiet Target and the quiet sort menu are at least 44px
tall on a coarse pointer and take `bg-bg-elevated` on hover and while open.

I15. Every `PageHeader` caller other than `AppHeader`, and every `ToolbarMenu` caller other
than `TargetMenu` and the shelf pages' sort menus, draws as before this change at 375px and at 1280px.

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
- **Fixing `PageHeader` for every page.** The cut title is visible only where a long title
  meets actions on a narrow screen; `AppHeader` is where the Target lives, so the layout
  change is there. Other `PageHeader` users keep today's layout.
- **The sort menu as a full-width select (option 1) or an icon-only button (option 3).**
  Drawn and declined by the user: the select outweighed the quiet Target; the icon hid
  the current order.
- **The Target in the tabs row (option B).** Drawn and declined by the user: the Target
  narrows what the count counts, so it sits beside the count.
- **Parent kinds as base kinds.** Decided by the user: base kinds hold no other kind;
  `document` throws (step 4).
