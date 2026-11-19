# Grouping and sort: one wording across the apps, remembered per Target

SPEC-ID: SPEC-CORE-145
SPEC-ID: SPEC-CORE-146
SPEC-ID: SPEC-ADDON-147
SPEC-ID: SPEC-ADDON-148

Approval:

## Summary

The four apps (Video, Reading, Notes, Clips) each choose how the Library is grouped and
sorted, but the controls disagree. Video says 分類, Reading and Clips say まとめ方, and
Notes uses a two-button switch in its rail. The sort menu is 並べ替え in two apps and
並び順 in the other two. Clips can only group by tag, while Video can also group by folder
and by month. Where the choice is kept differs too:

- Video and Reading keep the grouping per drive and forget the sort.
- Notes keeps its rail segment per drive and the sort in the URL.
- Clips keeps both only in the URL.

So switching the Target (a Smart Collection or a collection) never changes how the
Library is shown.

This change:

- names the two menus 分類 and 並び順 in every app, with option names taken from the
  terms macOS Finder uses;
- gives Clips Video's grouping menu (Tag, Folder, Date Added, None);
- turns the Notes rail switch into the same 分類 menu;
- remembers the grouping and the sort per Target in the browser, so a "Recipes" Target can
  open grouped by tag while "Reading now" opens newest first.

It is for the single viewer of a personal library.

What each SPEC-ID promises:

- **SPEC-CORE-145**: the per-Target view store in `frontend/src/lib/appPrefs.ts`, and Video
  and Reading using it for their classification/group and their Library sort.
- **SPEC-CORE-146**: the wording of the Video and Reading menus.
- **SPEC-ADDON-147**: Clips. A 分類 menu with Tag, Folder, Date Added and None, its shelf
  pages, the per-Target view and its wording.
- **SPEC-ADDON-148**: Notes. The rail's 分類 menu, the per-Target view (segment and sort)
  and its wording.

No new shared UI component is added. The menus are already the core `ToolbarMenu` and
`MenuRadioGroup` in every app, and each app keeps the list of groupings it offers. The
only new shared code is the store in `appPrefs.ts`.

## Required items

### 1. Normal flow

**The view store (SPEC-CORE-145).**

- A view is `{ group?: string; sort?: string }`. `group` holds the app's own value:
  - Video: its classification;
  - Reading: its group;
  - Notes: its rail segment;
  - Clips: its grouping.
- It is stored per app, per drive and per Target id, under one key per app and drive:
  `<prefix>.view.<encodeURIComponent(drive)>`. `<prefix>` is the app's existing prefix
  (`litloft.videoApp`, `litloft.readingApp`, `litloft.addon.knowledge`,
  `litloft.addon.knowledge-clips`).
- The value is a JSON object that maps a Target id (`default`, a Smart Collection id, or
  `collection:<id>`, exactly the value `readAppTarget` returns) to a view.
- `readTargetView(app, drive, targetId)` returns the stored view, or `{}`.
- `writeTargetView(app, drive, targetId, change)` merges `change` into that Target's entry
  and leaves every other entry untouched.
- The Target id used for both is the Target **in force**, and the saved Target id stays
  stored, as it does today:
  - In every app, a saved Target that is gone or unusable puts `default` in force, so the
    view shown and the view written belong to the Target the viewer actually sees.
  - In Notes and Clips, a member Target whose evaluation is `tooLarge` or `failed` also
    puts `default` in force (`useNotesTarget` today).
  - In Video and Reading, a `tooLarge` or `failed` member Target keeps its own id and
    shows today's "この対象は使えません" body or Retry, not the Library. There, no view is
    read or written until the Library is shown.

**Choosing the view in force.** On mount, and on every Target change, each app resolves
`group` and `sort` once, in this order:

1. A URL parameter, where the app has one. It wins over everything else.
   - Clips Library: `group` and `sort`.
   - Notes Library: `sort`, and `folder` / `tag`, which imply the segment. Notes has no
     `group` parameter.
2. The Target's stored value, if it is one the app offers in the current state.
   Exception: Video's stored `watch` without a profile shows Folder, as
   `effectiveClassification` does today, and does not fall through to step 3. It stays
   stored and applies again once a profile exists.
3. Only when the Target in force is `default`: the app's old per-drive value
   (`litloft.videoApp.classification.<drive>`, `litloft.readingApp.group.<drive>`,
   `litloft.addon.knowledge.classification.<drive>`). This makes an upgrade change nothing
   the viewer sees on the default Target.
4. The app's default:

| App | Default group | Default sort |
|---|---|---|
| Video | Folder | Date Added (newest first) |
| Reading | None | Date Added (newest first) |
| Notes | Folders | Date Modified |
| Clips | Tag | Date Added (newest first) |

**The URL always states the view (Notes and Clips).** When the Library body is drawn
(not while the Target is looking up, and not in an empty-Target or empty-drive state) and
the URL lacks a parameter the app has, or carries an unreadable value, the page replaces
the URL (`router.replace`, no history entry). The replacement fills in the value resolved
by steps 2 to 4:

- Clips Library: `group` and `sort`.
- A Clips shelf page that follows the sort (`tag:`, `untagged`, `folder:`, `month:`):
  `sort`.
- Notes Library: `sort`. Every Library URL Notes writes carries `sort` explicitly,
  `updated` included, so the fill-in runs once. The segment is not a URL parameter.

So a URL in history names the sort (and in Clips the grouping) it showed, and Back after a
Clips menu choice or a Notes sort choice returns to the previous one. Back after a Notes
segment choice does not restore the segment, because the segment is not in the URL.
This also covers today's rewrite of unknown values. It writes no storage.

A history entry made under an earlier Target still carries that Target's `group` / `sort`.
Back onto it shows those values (the URL wins, as for any link) under the Target now in
force, and writes nothing.

**Saving.** Choosing a value in the 分類 or 並び順 menu of the Library, including the
value already shown:

- calls `writeTargetView` for the Target in force with that field only;
- in Notes and Clips, pushes the URL with the value when it differs from the URL's
  (Notes' segment choice clears `folder`, `tag` and `note`, as today, and carries no
  segment in the URL).

Nothing else writes the view. Opening a URL does not write. Neither does a sort change on
a See all / shelf page, a fallback to a default, or reading an old per-drive value. The old
per-drive keys are still read (step 3) and are never written or deleted.

**Target change.** A Target change is the viewer choosing a Target in the Target menu.
These are not Target changes, and leave the URL's `group` / `sort` as they are:

- the first resolution on load, from "looking up" to the saved Target;
- a fallback to `default` discovered on load or later (the URL still wins; with no URL
  value, the `default` view applies);
- a member Target's re-evaluation, whatever its member count.

Notes' existing drop of `note` keeps its current trigger. On a Target change:

- in Video and Reading, applies that Target's view in force (steps 2 to 4);
- in Clips, replaces the URL (no history entry, as a Target change adds none today). On
  the Library the replacement drops `group` and `sort`. On a shelf page it drops `sort`
  and keeps `shelf`. The new Target's view then fills them in, as above. Home is
  unchanged.
- in Notes, on the Library (`view=all`) only, replaces the URL without `sort` and `note`,
  and keeps `folder`, `tag` and `q`. Home's URL is untouched.
  Today a Target change keeps the selection and drops the note, and that stays. The new
  Target's sort fills in, and its stored segment applies when neither `folder` nor `tag`
  is present. The replacement waits behind the editor's save gate (SPEC-ADDON-130 I4),
  as the Target change does today.

**Video and Reading (SPEC-CORE-145, 146).**

- The Library's 分類 menu and 並び順 menu read and write the view as above. The sort
  options are unchanged.
- Video's 分類 gains なし / None (`all`). It is listed last: フォルダ, タグ, 追加日, 長さ,
  視聴状態, なし. Under なし, Video lists `by=all` as one grid, 60 per page, appended on
  scrolling, as Reading's None does. 視聴状態 stays in this spec. SPEC-CORE-147 moves it to
  a filter.
- Reading's 分類 becomes Clips' set: タグ / Tag (`tag`), フォルダ / Folder (`folder`), 追加日 /
  Date Added (`month`), なし / None (`none`, the default). Folder and Date Added request
  `by=folder` / `by=month` under the chip, tags and state in force. They page shelves like
  By tag, order shelves the server's way and title them as Video does, with See all
  carrying the conditions in force as Reading's See all does today. The folder chips stay;
  a chip narrows the books, and Folder groups the books inside it.
- Video's Watch-state fallback is unchanged: a saved `watch` with no profile shows Folder
  and stays stored.
- See all / shelf pages keep their URL `sort`. They open on the Library's sort in force,
  as today, and never write the view.

**Clips (SPEC-ADDON-147).**

- The Library's 分類 menu offers, in this order: タグ / Tag (`group=tags`, default),
  フォルダ / Folder (`group=folder`), 追加日 / Date Added (`group=month`) and なし / None
  (`group=none`).
- Tag and None behave as today.
- Folder and Date Added call `shelves` with `by=folder` / `by=month`, under the same Target
  conditions (`type=text`, `origin=webclip`, `file_ids` for a member Target). They page
  shelves the way By tag does: `per_shelf=12`, `shelf_limit=12`, more as the viewer
  scrolls. The order is the server's: folders by count then name, months newest first.
- A folder shelf is titled with the folder's last segment, or the drive name for the root.
  A month shelf is titled with the year and month, formatted for the locale as Video
  formats them.
- Each of these shelves has "See all ›" to a new shelf page,
  `?view=shelf&shelf=folder:<key>` or `?view=shelf&shelf=month:<YYYY-MM>`, plus the
  Library's `sort`.
  - `<key>` is the server's shelf key verbatim (URL-encoded): a trailing `/` means "files
    directly in that folder", no trailing slash means the subtree, and the empty key is the
    root. `folder:` with an empty key parses. `month:` parses only with a `YYYY-MM` key;
    anything else is an unknown shelf id and is rewritten as today (to Home).
  - The page requests `by=folder|month` with that `key`, follows the URL `sort` as a tag
    shelf page does, and lists 60 at a time.
  - Its heading is the same title the Library shelf has. Like today's tag shelf pages, it
    has no sort menu; the sort comes from the Library.
- The back link of a `tag:`, `untagged`, `folder:` or `month:` shelf page goes to
  `?view=all&group=<tags|folder|month>&sort=<sort>`, the grouping the shelf belongs to.
  The Library tab is the current tab on those pages.
- The 並び順 menu offers 追加日（新しい順） / Date Added (Newest First) (`newest`),
  追加日（古い順） / Date Added (Oldest First) (`oldest`) and タイトル / Title (`title`).
  The values and the requests are unchanged.

**Notes (SPEC-ADDON-148).**

- At 1280px and wider, the two-button switch at the top of the rail becomes a
  `ToolbarMenu` with label 分類 and options フォルダ / Folders and タグ / Tags. Its accessible
  name is "分類: フォルダ" / "分類: タグ" (en "Group By: Folders" / "Group By: Tags"). It
  sits where the switch was, and the entries below are unchanged.
- Below 1280px (1024–1279 and the phone list layout), the rail is already one
  `ToolbarMenu` (`LibraryRailMenu`). Only the heading of its segment group changes, from
  分類の軸 to 分類.
- Option labels stay フォルダ / Folders and タグ / Tags.
- Choosing a segment does what it does today (clears `folder`, `tag` and `note`). It
  additionally writes the view for the Target in force. It no longer writes
  `…knowledge.classification.<drive>`.
- The stored segment and sort are read synchronously before the rail and list requests,
  so no first request goes out with `updated` or `folder` and is then replaced.
- With `folder` or `tag` in the URL, the segment is the one they imply (URL wins).
- The 並び順 menu (renamed from 並べ替え) offers 変更日 / Date Modified (`updated`), タイトル /
  Title (`title`) and 作成日 / Date Created (`created`). The values and the requests are
  unchanged.

**Wording (SPEC-CORE-146, and the wording parts of ADDON-147/148).** ja / en:

| Where | Before | After |
|---|---|---|
| Video menu label | 分類 / Classification | 分類 / Group By |
| Video option `month` | 追加した月 / Month added | 追加日 / Date Added |
| Video option `watch` | 視聴状態 / Watch state | 視聴状態 / Watch State |
| Video, Reading sort label | 並べ替え, 並び順 / Sort | 並び順 / Sort By |
| Video, Reading `newest` | 追加日（新しい順） / Added (newest first) | 追加日（新しい順） / Date Added (Newest First) |
| Video, Reading `oldest` | 追加日（古い順） / Added (oldest first) | 追加日（古い順） / Date Added (Oldest First) |
| Video, Reading `played` (Continue shelf page) | 最後に開いた順 / Last opened | 最後に開いた日 / Date Last Opened |
| Reading group label | まとめ方 / Group | 分類 / Group By |
| Reading group `tag` | タグ別 / By tag | タグ / Tag |
| Reading group `none` | なし / None | なし / None (unchanged) |
| Clips group label | まとめ方 / Grouping | 分類 / Group By |
| Clips group `tags` | タグ別 / By tag | タグ / Tag |
| Clips group `none` | まとめない / No grouping | なし / None |
| Clips sort label | 並び順 / Sort | 並び順 / Sort By |
| Clips `newest` | クリップした順 / Newest clipped | 追加日（新しい順） / Date Added (Newest First) |
| Clips `oldest` | 古い順 / Oldest clipped | 追加日（古い順） / Date Added (Oldest First) |
| Clips `title` | タイトル順 / Title | タイトル / Title |
| Notes segment label | 分類の軸 / Classify by | 分類 / Group By |
| Notes segment options | フォルダ / Folders, タグ / Tags | unchanged |
| Notes sort label | 並べ替え / Sort | 並び順 / Sort By |
| Notes `updated` | 更新順 / Updated | 変更日 / Date Modified |
| Notes `title` | タイトル順 / Title | タイトル / Title |
| Notes `created` | 作成順 / Created | 作成日 / Date Created |

**One core part for the view menus.** `frontend/src/components/appshell/ViewMenus.tsx`
holds the 分類 and 並び順 menus. Each app passes its option list and value. All four apps
draw their view menus through it, so a later change to how these menus look is made in
one place. They are drawn as today's outlined `ToolbarMenu` with the label shown; this
change does not redesign them. Reading's tag and state menus (filters) keep their look
until SPEC-CORE-147.

Below 640px the two view menus sit on one row at equal widths, and a long value is cut
with an ellipsis (design artboard Phone, row 2).

**The menus' look.** This applies to the Library control row, and to the Notes rail at
1280px and wider. Below 1280px the Notes rail stays the one `LibraryRailMenu`, with only
its heading renamed. The quiet sort menus in the See all / shelf page headers keep their
look and get only the new wording. In all four apps, the grouping menu is a `ToolbarMenu` with the
`LayoutList` icon and its label shown ("分類 フォルダ"). The sort menu is a `ToolbarMenu`
with the `ArrowDownUp` icon and its label shown ("並び順 追加日（新しい順）"). The Library
order is 分類 first, then 並び順. Today Reading uses `Layers`, Clips `Tags` and
`ArrowUpDown`, and only Video's and Reading's grouping menus show the label. The agreed
design is https://claude.ai/artifact/B2vcc6DPrGHjDkDhjPzrxe, saved in
`docs/process/reviews/feature-app-view-per-target/design/`. Its artboards:

- Main: every app's control row, before and after;
- PerTarget: per-Target memory in Clips, interactive;
- ClipsFolder: Clips grouped by Folder with the 分類 menu open;
- ClipsShelf: a folder shelf page;
- NotesRail: the Notes rail menu at 1280px.

Checkable lines from the design, at 1280px:

- Every app's Library control row is 分類 then 並び順, both outlined menus with icon,
  label and value. In Video, Reading and Clips they follow the filters after a gap (Main;
  the filters themselves are SPEC-CORE-147).
- At 390px the view menus are one row of two equal-width buttons (Phone, row 2).
- Clips Library: header, then tabs ホーム | ライブラリ, then the control row, then shelves.
  A shelf is a title, a count, "すべて見る ›" at the right end, then one row of cards.
  The 分類 menu lists タグ, フォルダ, 追加日, なし, with a check on the current one
  (ClipsFolder).
- Clips folder shelf page: header and tabs with ライブラリ current, "‹ ライブラリ", then a
  heading with its count, then a grid of cards (ClipsShelf).
- Notes Library: rail, list and pane. The rail's first element is the 分類 menu, with the
  entries below it. The list's search field is followed by the 並び順 menu (NotesRail).

PerTarget is an explanation of the behaviour, not a layout to match.

Unchanged: フォルダ / Folder, タグ / Tag, 長さ / Length, タイトル / Title, サイズ / Size.
The column says "タイトル", not Finder's "名前", because the value sorted is the file's
title, not its filename.

### 2. Failure cases

- **localStorage throws or is unavailable** (private mode, quota). The read returns `{}`.
  The write is swallowed. The page shows the default and works. A menu choice still
  applies until the next mount, drive change or Target change: each app holds the chosen
  value in memory, and Notes and Clips also have it in the URL. It is not remembered
  across visits.
- **The stored JSON cannot be parsed, or is not an object.** Treated as `{}` on read. On
  the next write the key is replaced by an object holding only the new entry. The views
  of other Targets on that drive are lost, which is only a reset to defaults. This is the
  one case where a write changes other Targets' entries (they were unreadable already).
- **A stored value the app does not offer.** Examples: a removed option, `watch` without a
  profile, a value from another app's key written by hand. It is skipped, and the next
  step of the order applies. It is not removed from storage and is never sent to the
  backend.
- **The Target is still loading** (its list or members are not ready). The view is
  resolved for the Target id that will be in force. No request goes out before the
  Target is ready, as today (app-target-collections I8). If the saved Target then turns
  out gone or unusable, the view is resolved again for `default`.
- **Clips Folder / Date Added shelves request fails.** Same as By tag today: the Library
  shows its failed state with Try again, and a failed "more shelves" page shows Try again
  at the end.
- **A Clips shelf page with an unknown `folder:` / `month:` key** (folder gone, month with
  no clips) shows "No clips here", like an empty tag shelf.

### 3. States

Per app, drive and Target, a view field is either *unset* (resolved by steps 3 and 4) or
*set* to a value. Transitions:

- unset → set, and set → set: only through the Library's 分類 / 並び順 menu.
- No transition returns a field to unset, except that a write over an unparsable key
  drops the other entries (section 2). Choosing the value already shown, default
  included, stores it explicitly.

The view in force is derived from the URL, the stored view and the value chosen in this
mount (held in memory, so a failed write still shows the choice). It is recomputed on mount, on a drive
change while mounted, on a Target change, on a URL change in Notes and Clips, and on a
profile change (Video's `watch`). It is resolved synchronously from localStorage before
the first request for the new drive or Target, so nothing of the previous drive's or
Target's view is drawn or requested.

### 4. Data read and written

- **localStorage (browser only).**
  - New keys `<prefix>.view.<drive>`: read and written.
  - Old keys `litloft.videoApp.classification.<drive>`, `litloft.readingApp.group.<drive>`
    and `litloft.addon.knowledge.classification.<drive>`: read only, never written after
    this change.
  - Target keys `<prefix>.target.<drive>`: read as today.
- **URL** (Notes, Clips): read; written by `router.push` / `replace` as described.
- **Backend:** no new endpoint, table or column. Clips additionally calls the existing
  `GET/POST /api/drives/{drive}/shelves` with `by=folder` and `by=month`.

### 5. External services

None. Everything is in the browser and the existing core shelves route.

### 6. Authorization

Unchanged. The view store is per browser and holds only option names and Target ids. The
shelves route applies the same drive access checks for `by=folder|month` as for
`by=tag`.

### 7. Effect on existing features

- `readAppPrefs` / `writeAppPrefs` lose `classification` as a written field. Video's face
  and target keys are unchanged.
- Reading's `group` key is no longer written.
- Video and Reading Library sort, previously reset on every open, now persists per Target.
- Shelf pages and See all links keep their URL `sort`.
- Notes `libraryHref` always writes `sort`, `updated` included, in every URL it builds:
  the menu, rail select, search, note replace, conflicting-selection replace and Target
  replace. Links built outside the Library (`NoteSearchScope`'s `?view=all&q=`, the
  Library tab's `?view=all`) still omit it, and the fill-in adds it.
- Links built elsewhere that omit `sort` are unaffected: an absent value now means "the
  Target's stored view" rather than "the default". The same holds for Home's and Clips
  Home's links to the Library, and for the Library tab.
- Clips `readClipsView` / `needsRewrite` accept `group=folder|month` and the
  `folder:` / `month:` shelf ids. An absent or unknown `group` / `sort` is rewritten to
  the resolved view, not to the app default.
- Clips' Target change on a shelf page now drops `sort` (replace, no history entry).
  Before, a Target change wrote storage only.
- The Video and Reading See all pages, including the Continue shelf page, show the new
  sort labels through the shared message keys.
- Landing order:
  1. A core PR with the store, Video, Reading, the wording and the docs.
  2. After it merges, the knowledge PR. It imports `readTargetView` / `writeTargetView`
     from core develop, which then has them.
  3. A core PR that bumps the knowledge pointer, updates `toolbarMenuHome.test.ts`'s
     list if a new knowledge file imports `ToolbarMenu`, and updates
     `docs/addons/knowledge.md` and `docs/user-guide/notes.md`.
- The TargetMenu, the shown set, `parseAppTargetId` and the target resolvers are
  unchanged.
- Photo Diary uses `appPrefs` for its Target only and is unaffected.
- User guide pages `docs/user-guide/video.md`, `reading.md` and `notes.md` describe the
  menus, their names and what is remembered. They are updated in the same PR (core for
  video/reading; Notes and Clips via `docs/user-guide/notes.md` in core).

### 8. Error behavior

No new error UI. A storage failure is silent (the default is shown). Clips' new shelf
requests reuse the Library's existing failed state and Try again. Nothing is logged.

### 9. User-visible behavior

- The menu names and option names in the wording table, in both languages.
- Clips Library offers Folder and Date Added groupings, with their own shelf pages.
- The Notes rail shows a 分類 menu instead of two buttons at 1280px and wider.
- Each Target remembers the 分類 and 並び順 last chosen for it in that browser:
  - A Target never configured opens with the app's default.
  - The default Target opens with what the drive used before this change.
  - Video and Reading's sort is now remembered. Before, it reset to newest on every open.
- A Notes or Clips link carrying `group` / `sort` / `folder` / `tag` opens with them and
  remembers nothing until the viewer changes a menu.

### 10. Non-functional

- One JSON key per app and drive. An entry is at most ~60 bytes, and the number of entries
  is bounded by the drive's Targets (tens). No pruning of entries for deleted Targets is
  needed.
- No extra requests. Resolution is synchronous from localStorage before the first shelves
  request, so no request is sent with a view that is then replaced.
- The store holds no file names or content, only option values and Target ids.

## Touch points

- `frontend/src/lib/appPrefs.ts`: new `readTargetView` / `writeTargetView`; the
  classification/group fields stop being written.
- `frontend/src/components/videoapp/{useVideoApp.ts, VideoApp.tsx, LibraryFace.tsx, LibraryControls.tsx, labels.ts}`
- `frontend/src/components/readingapp/{useReadingApp.ts, ReadingApp.tsx, LibraryFace.tsx, LibraryControls.tsx, labels.ts, shelfLinks.ts}` and the reading shelf page (folder / month shelves)
- `frontend/src/components/appshell/ViewMenus.tsx` (new)
- `frontend/src/messages-core/{ja,en}.json`: `videoApp.*`, `readingApp.*` keys in the
  wording table.
- `addons/knowledge/frontend/pages/clips.tsx`, `clipsapp/{clipsUrl.ts, Library.tsx, ShelfPage.tsx, requests.ts, useTagShelves.ts}`
  and a hook for the folder/month shelves. This is a submodule, so it gets its own PR and
  then a pointer bump.
- `addons/knowledge/frontend/NotesPage.tsx`, `library/{NotesLibrary.tsx, LibraryRail.tsx, LibraryList.tsx, libraryUrl.ts}`
- `addons/knowledge/frontend/messages/{ja,en}.json`: `knowledge.clips.*`,
  `knowledge.notesLibrary.*`.
- `addons/knowledge/frontend/clipsapp/useShelfData.ts` (folder/month shelf pages) and
  `notesapp/useNotesTarget.ts` (Target in force).
- Tests:
  - `frontend/src/lib/__tests__/appPrefs*` and the video and reading app tests;
  - `frontend/src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx`;
  - `frontend/src/components/__tests__/toolbarMenuHome.test.ts`;
  - the knowledge `clipsapp/__tests__`, `library/__tests__`, `__tests__/notesLibrary.test.tsx`,
    `__tests__/clipsLibrary.test.tsx` and `__tests__/clipsPage.test.tsx`.
- Layout suites and fixtures:
  - `frontend/e2e-layout/fixtures/video-app.html` and `reading-video-faces.html`;
  - `frontend/e2e-layout/video-app.spec.ts`;
  - `frontend/e2e-components/app-header.spec.ts` and `app-header-desktop.spec.ts`;
  - `frontend/e2e-components/fixtures/videoCardSpacing.tsx`;
  - `frontend/e2e-layout/reading-video-faces.spec.ts`;
  - `frontend/e2e-components/notes-library-desktop.spec.ts` and `fixtures/notesLibrary.tsx`;
  - `frontend/e2e-components/clips-primary-action.spec.ts`,
    `clips-primary-action-desktop.spec.ts`, `fixtures/clipsPage.tsx` and
    `fixtures/clipsData.ts` (answering `by=folder|month`).
- Knowledge tests that pin Library URLs or the old segment key:
  - `__tests__/clipsHome.test.tsx`, `clipsFrame.test.tsx`, `clipsCovers.test.tsx` and
    `NoteSearchScope.test.tsx`;
  - `library/__tests__/libraryUrl.test.ts`.

  These change to the new contract. None is deleted or loosened.
- Docs: `docs/user-guide/video.md`, `docs/user-guide/reading.md`,
  `docs/user-guide/notes.md`, `docs/addons/knowledge.md` (the Clips URL surface: `group`
  values, shelf ids, what a missing `group`/`sort` means), and `docs/ADDON-DEVELOPMENT.md` (the app header and Target
  recipe gains the view store).
- Rule passed through: `.claude/rules/frontend-conventions.md` (i18n in `messages-core`
  and the addon's messages, DESIGN.md for menus). No protected path is edited.

## Invariants

I1. Choosing a value in a Library's 分類 or 並び順 menu writes that value under `<prefix>.view.<drive>` for the Target in force only; every other Target's entry (unless the key held unparsable JSON), every other app's keys and every other drive's keys are byte-for-byte unchanged.
I2. No path writes the old per-drive keys (`litloft.videoApp.classification.*`, `litloft.readingApp.group.*`, `litloft.addon.knowledge.classification.*`); and opening any app page, following any link, a URL rewrite, changing the sort on a See all / shelf page, switching Target or drive, and falling back to a default write nothing under `<prefix>.view.<drive>`.
I3. The view shown is: the URL parameter when present and readable (Clips `group`/`sort`, Notes `sort`, and Notes `folder`/`tag` implying the segment), else the Target's stored value when the app offers it in the current state (Video's `watch` without a profile shows Folder), else, for the `default` Target only, the old per-drive value, else the app default; a value the app does not offer is never sent to the backend and never shown.
I4. After choosing view A on Target X and view B on Target Y, switching to X shows A and switching back to Y shows B, in every app, with no URL parameter of the view left over from the previous Target (history navigation excepted: an entry made under X shows its own URL values); in Notes `folder`, `tag` and `q` survive the switch.
I5. With localStorage throwing on every call, or holding unparsable JSON under `<prefix>.view.<drive>`, every app renders its Library with the defaults and no error screen.
I6. When the saved Target is gone or unusable (and in Notes and Clips also `tooLarge` or `failed`), the view read and written is the `default` Target's, and the saved Target id stays stored.
I7. In Clips under Folder and Date Added, every clip of the Target is in exactly one shelf, each shelf's count equals the number of cards its shelf page reaches over all its pages (the root and a trailing-slash key included), and every card shown has `md_origin` `webclip` and `type=text` under the Target in force.
I8. On first load and after a drive or Target change, no shelves, files, rail or folder-counts request is sent with a grouping or sort other than the one finally shown for that Target.
I9. Every 分類 and 並び順 menu label and option in Video, Reading, Notes and Clips, and on their See all / shelf pages, shows the "After" text of the wording table in ja and en (the Notes 分類 menu's accessible name is "分類: フォルダ" / "分類: タグ", en "Group By: Folders" / "Group By: Tags"); none shows まとめ方, 並べ替え, 分類の軸, タグ別, まとめない, クリップした順, 最後に開いた順 or 追加した月.
I10. At 1280px and wider the Notes rail draws a `ToolbarMenu` named 分類 in place of the two-button switch and the rail entries and counts are unchanged; at 1440, 1280, 1024 and 390px in ja and en, no Notes, Clips, Video or Reading Library control row or shelf page header scrolls horizontally or is wider than its container (SPEC-CORE-063 I22 and SPEC-ADDON-139 I9 still hold), measured in a real browser by the `e2e-layout` / `e2e-components` suites.
I11. Once the Library body is drawn, the Clips URL names the `group` and `sort` shown and the Notes URL names the `sort` shown, so Back after a Clips menu choice or a Notes sort choice shows the previous value; a Clips `tag:`/`untagged`/`folder:`/`month:` shelf page's back link is `?view=all&group=<tags|folder|month>&sort=<the page's sort>`.

I12. In the Library control rows of Video, Reading, Notes and Clips, and in the Notes rail at 1280px and wider, the grouping menu draws the `LayoutList` icon and the 分類 label, and the sort menu draws the `ArrowDownUp` icon and the 並び順 label, grouping before sort.
I13. In Notes and Clips, the URL fill-in and the Target-change rewrite add no history entry; opening a Library or shelf URL that already has its view parameters replaces nothing; a fallback to `default` or the first resolution on load leaves the URL's `group` and `sort` as they were.
I15. Every 分類 and 並び順 menu in the four apps is drawn by `ViewMenus`; Video offers フォルダ, タグ, 追加日, 長さ, 視聴状態 (with a profile) and なし, and Reading and Clips offer タグ, フォルダ, 追加日 and なし; below 640px the two view menus are equal in width and on one row.
I14. A Clips folder shelf is titled with its key's last segment (the drive name for the root key `""`), a month shelf with its `YYYY-MM` formatted like Video's month shelves, and its shelf page carries the same heading; "See all ›" of every Clips Library shelf carries the Library's `sort`.

## Revises

SPEC-CORE-057 I10. The face and target are remembered per drive under separate keys, and the classification per Target under `litloft.videoApp.view.<drive>` (the old per-drive classification key read only for the default Target); a stored value that is unknown, stale, not offered in the current state, or a smart folder id that is not in this drive's list falls back to its default without an error screen and is never sent to the backend; a saved Watch state survives the profile's absence.
SPEC-CORE-063 I16. The face and target of Reading are saved per drive under the `litloft.readingApp` keys and its group and Library sort per Target under `litloft.readingApp.view.<drive>`, and Video's saved face and target under `litloft.videoApp` still apply unchanged.
SPEC-CORE-063 I16b. The folder chip is never stored; it resets to All on a fresh open and on a target change. The Library sort is stored per Target.
SPEC-CORE-063 I19. Group None lists books by `all`, Tag by `tag` with `no_tag` last, Folder by `folder` and Date Added by `month` in the server's order, and Sort orders the books inside every shelf and the flat grid.
SPEC-CORE-072 I1. In both apps, the shelf page for `by=watch&key=continue` opened without a recognised `sort` in the URL requests the shelf with `sort=last_played&order=desc` and shows 最後に開いた日 / Date Last Opened as the selected sort.
SPEC-CORE-072 I3. On that page a URL `sort` naming one of the four existing choices opens on that choice with its pair from the table in item 1; `sort=played` or an unknown value opens on Date Last Opened.
SPEC-CORE-072 I4. Every other shelf page (any other `by`, or `by=watch` with another key) and Library offer exactly the four existing choices and never request `sort=last_played`; a shelf page without a recognised `sort`, or with `sort=played`, opens on Date Added (Newest First); Library opens on the Target's view in force (SPEC-CORE-145); Library's See all links never carry `sort=played`.
SPEC-ADDON-131 I9. Choosing a Target writes `litloft.addon.knowledge.target.<drive>` and no other app's key; a saved Target that is gone, cannot be resolved, `tooLarge` or `failed` puts the default Target in force and leaves the saved id stored. Choosing a rail segment writes it for the Target in force under `litloft.addon.knowledge.view.<drive>`. The segment shown is the one `folder` or `tag` in the URL implies; else the Target's stored segment; else, for the default Target only, `litloft.addon.knowledge.classification.<drive>`; else Folders.
SPEC-ADDON-139 I3. Every clip in the Target is reachable from the Library: None reaches it over its pages; Tag, through the shelf page of one of its tags or of "Untagged"; Folder and Date Added, through the shelf page of the one shelf it is in. The Unverified shelf page reaches every clip still unverified over its pages, however many were marked verified on the way.
SPEC-ADDON-100 I29. Clips `?view=all` is the Library: grouped by tag, folder, month added or ungrouped, sorted by the URL's `sort`, else the Target's stored sort, else newest added first, 60 cards per page when ungrouped, as cover cards without age groups.

## Checked, no action

- **A shared core "grouping picker" component.** Not built. Every app already uses
  `ToolbarMenu` / `MenuRadioGroup`, and the options differ per app. Reading groups inside
  folders that act as format walls, Notes groups its rail rather than shelves, and Video
  has length and watch state. A component that knew all of these would make core know
  addon groupings. The user chose to bring Video's approach to Clips instead.
- **Clips grouped by site.** Not offered. The site is derived by the knowledge addon from
  frontmatter. Adding it to the core shelves route would make core interpret addon data
  (`internal-api-policy.md` R1), and the user limited Clips to groupings the existing
  shelves route provides.
- **Notes rail replaced by shelves.** Not done. Notes shows a list and pane, not shelves.
  Only the switch becomes a menu.
- **A URL parameter for the Video / Reading Library grouping and sort.** Not added. Neither
  Library has one today, and the per-Target store replaces the need. See all pages keep
  their URL `sort`.
- **Non-default Targets after the upgrade.** They open with the app default, not the old
  per-drive value, as the user chose ("app default"). Only the default Target inherits the
  old value. A viewer who had set Tag per drive and opens a Smart Collection sees Folder
  once and re-chooses.
- **Pruning entries of deleted Targets.** Not done. They are tens of bytes and harmless. A
  Target id that comes back (an undone delete is not possible, but ids are never reused)
  would find its old view, which is acceptable.
- **Migrating the old per-drive keys into the new key.** Not done. They are read in place
  for the default Target and left stored, so an older build still reads them.
- **The Clips shelf ids `unread`, `recent`, `new` and `unverified`** and Clips Home are
  unchanged.
- **Video's `duration` / `watch` for Clips.** Not offered. Clips have no length, and the
  unread state already has its own Home shelf.
- **macOS wording for Notes `updated` (更新順 → 変更日).** The value sorted is `updated_at`
  (the file's modification time), which Finder calls 変更日 / Date Modified.
- **Video and Reading Library in the URL.** Back in those apps does not undo a menu
  choice, as today; only Notes and Clips have URL state.
