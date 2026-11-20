# Name filter in the app Libraries

SPEC-ID: SPEC-CORE-156
SPEC-ID: SPEC-ADDON-159

Approval:

## Summary

The Video, Reading and Clips Libraries can narrow by tag and state (SPEC-CORE-147,
SPEC-ADDON-151) and group by folder. A viewer who remembers part of a title still has to
scan shelves for it, or leave the app for the search page. This change adds a name filter
to the Libraries and to their See all pages. It is a substring match on the file's title
and folder path, the match the backend's `search` parameter already performs. It is not
semantic search.

On the Library face the filter is an icon at the right end of the tab row (発見 |
ライブラリ, or ホーム | ライブラリ in Clips). Pressed, it opens into a text field. On a See
all page it is a field in the header, always open. The text is kept like the tag and
state filters: in memory in Video and Reading, in the URL in Clips. A Library-origin See
all page starts with the Library's text, and a change made there is the Library's text
on return.

Notes is out of scope, because its rail already searches. Photo Diary is out of scope.

The agreed design is https://claude.ai/artifact/RZxbBjoFTS17m8kBvmZk8g, saved in
`docs/process/reviews/feature-app-library-name-filter/design/`. Its artboards are Main,
Open, SeeAll, Clips, Phone, PhoneOpen, PhoneEmpty, Discover and PhoneSeeAll. Reading is
drawn by the Video artboards: its tab row and See all header have the same shape.

What each SPEC-ID promises:

- **SPEC-CORE-156**: the core `NameFilter` part, the `PageTabs` trailing slot, and the
  filter in the Video and Reading Libraries and their See all pages.
- **SPEC-ADDON-159**: the filter in the Clips Library and its Library-origin shelf pages.

## Required items

### 1. Normal flow

**Matching.** There is no backend change. The filter sends its text as `search`. The
backend already treats `search` this way (`filtered_drive_files` in
`backend/app/routers/drives.py`):

- NFC-normalised and LIKE-escaped;
- matched as a substring with `ilike` against `File.title` OR `File.folder_path`;
- ANDed with every other condition;
- `max_length=200` on the query model.

So 「京都」 matches 京都 紅葉めぐり and every file under `旅行/京都/`. Case folding is
SQLite's: ASCII letters only.

**Which requests carry the name.** With a non-empty name N in force:

- **Video Library**: every `shelves` / `shelves/query` request, every grouping and the
  なし grid (`by=all&key=all`), and the tag menu's `tag-counts` / `tag-counts/query`.
- **Reading Library**: the same, except the folder-chip request. That request stays the
  Target alone, as `useLibraryChips` defines it, so chips do not appear or vanish while
  typing.
- **Video and Reading See all pages** (listing mode): every `shelves` request. The page
  takes N from its URL `q`, as below.
- **Clips Library**: every Tag, Folder, Date Added and None request, and the tag menu's
  `tag-counts`. On `tag:`, `untagged`, `folder:` and `month:` shelf pages, every request.
- **Never carry it**:
  - the header-count `files` request (`useVideoApp`, `useReadingApp`, Clips
    `loadClipCount`), so the count stays the Target's total;
  - Discover and Clips Home;
  - Clips' Home-origin shelf kinds;
  - provider `entry` pages.

The name is added where the Library face builds its request (`LibraryFace` and the Clips
Library and shelf code), not in the app-level `params`. Discover and the count share
those `params`.

A Smart Collection with free text is a member Target (`resolveMemberTarget`). Its
requests send member ids and none of the Target's own conditions. A Target without free
text has no `search` in its parameters. So the name's `search` is the only `search` a
request carries.

**The core part.** `frontend/src/components/appshell/NameFilter.tsx` (new) takes:

- `value`, the applied name;
- `onApply(name)`;
- `alwaysOpen`, default `false`;
- `onLeavePending?(name)`, called once on unmount when an apply is still pending;
- `scopeKey?`, a string; when it changes, a pending apply is dropped.

Its labels come from core `appFilters` inside the part, so Clips passes no copy. It
draws:

- **Closed** (only when not `alwaysOpen`): an icon button with lucide `Search` and
  `aria-label` 名前で絞り込み / Filter by name. Its size follows DESIGN.md's touch-target
  rule, which is keyed to the pointer and not the width: 44×44 on a coarse pointer
  (`pointer-coarse:`) and 36×36 otherwise.
- **Open**: a field with the `Search` icon at the left, then an `<input type="search">`
  with `aria-label` 名前で絞り込み / Filter by name and placeholder 名前で絞り込み... /
  Filter by name.... While the field holds text, an × button (`aria-label` 入力をクリア /
  Clear input) sits at the right. The browser's own search cancel button is hidden.
  - The border is the strong text colour while the field holds text, and the default
    border colour otherwise.
  - Its width comes from its caller (below).
  - Its height is 44px on a coarse pointer and 36px otherwise. Its text is 16px on a
    coarse pointer, so iOS does not zoom on focus, and 14px otherwise.

The part holds a draft (the input's text) and an open flag.

- The field **holds text** when the raw draft is not empty. That decides the × button,
  the strong border, and whether Escape clears or closes.
- The field **is empty for closing** when the trimmed draft is empty. A field holding
  only spaces therefore shows ×, and on blur it closes and its draft is emptied.

Its rules:

- **Apply.** The applied name is the draft trimmed and cut to 200 characters.
  `maxLength` is 200.
  - Typing applies 300ms after the last input event.
  - While IME composition is in progress nothing is applied. The 300ms starts at
    `compositionend`.
  - Enter applies at once and keeps focus.
  - × applies the empty name at once, cancels any pending apply, and keeps focus in the
    field.
  - Escape with text does the same as ×.
  - Deleting the text with Backspace is an ordinary edit, applied after 300ms.
- **`value` from outside.** The part remembers the last name it applied. When `value`
  changes to something other than that name, the draft becomes `value` and any pending
  apply is cancelled. This covers a reset, a Target choice, a URL change by Back, and
  normalisation. When `value` arrives equal to the last applied name, the draft is left
  alone. That is the echo of the part's own apply, possibly landing a render later
  through `router.replace`. So a trailing space, or characters typed while a replace is
  landing, survive.
- **Open and close** (when not `alwaysOpen`):
  - The icon opens the field and focuses the input.
  - The field closes back to the icon when the input loses focus with an empty trimmed
    draft.
  - Escape on an empty field closes it and focuses the icon.
  - A non-empty `value` draws it open without moving focus to it.
  - A reset while the input has focus empties the draft and leaves the field open until
    blur.
- **`alwaysOpen`**: never closed and never drawn as the icon. Escape on an empty field
  does nothing, and blur does nothing.
- **Unmount with a pending apply.** The part calls `onLeavePending(trimmed draft)` if it
  was given one. Otherwise the pending text is dropped. No caller issues
  `router.replace` from `onLeavePending`. What each caller passes:

  | Caller | `onLeavePending` | `scopeKey` |
  |---|---|---|
  | Video / Reading Library | writes the store's `name` | — |
  | `from=library` See all page | writes the store's `name` only | — |
  | Any other See all page | not given | — |
  | Clips | not given | the view and shelf (`view`, `shelf`) |

  So in Video and Reading, leaving the Library or a `from=library` See all page within
  300ms of typing (by a card, Back, or a tab switch) keeps what was typed. In Clips,
  moving between the Library and a shelf page with the field still mounted changes
  `scopeKey`, and the pending text is dropped. It is never applied to the page just
  left, nor to the page just opened.

**The tab-row slot.** `PageTabs` gains an optional `trailing` node, and `AppTabs` passes
it through.

- Without `trailing`, `PageTabs` renders exactly what it renders today: same elements,
  same classes.
- With `trailing`, it renders an outer `div`:
  - The `div` carries the row's bottom border and is a non-wrapping flex row with items
    centred.
  - Inside, first the existing `nav` (with its tablist role when it has one), without its
    own bottom border and with `flex-shrink: 0`, so the tabs keep their size.
  - Then a wrapper holding `trailing`, with `flex: 1; min-width: 0; display: flex;
    justify-content: flex-end`.
  - The trailing node is never inside the `nav` or the tablist.

**Field width.**

- In the tab row: 260px from `sm` up. Below `sm` it fills the wrapper, which is the
  row's width left after the tabs.
- On a See all page it sits inside the header's existing `actions` node. No header
  component changes. The page passes as `actions` one wrapper holding the field, then the
  sort.
  - From `sm` up the wrapper is a row: the field (260px), then the sort. `PageHeader`
    places `actions` before the Target, as today.
  - Below `sm`, `PageHeader` already gives `actions` a full-width row of its own after
    the title row (a See all page has no tabs). There the wrapper is a column, `w-full`:
    the field fills the row's width, and the sort is on the line below, at the start
    (PhoneSeeAll).

**Video and Reading (SPEC-CORE-156).**

- The filter store (`appshell/libraryFilters.ts`) gains `name: string` beside `tags`
  and `state`. `writeLibraryFilters` accepts `name`, and `useLibraryFilters` returns
  `name` and `setName`.
- The name has the tags' lifetime:
  - **Kept by**: client-side navigation (a tab switch, a See all round trip, a file page
    round trip, another app or page and back), re-choosing the Target in force, a
    fallback to `default`, a member re-evaluation, and clearing the profile.
  - **Emptied by**: a full page load, opening the app on another drive, a Target choice
    (SPEC-CORE-145), and a Home-shortcut landing (`?target=`) on a Target other than
    the one in force. A landing on the Target already in force keeps it, as it keeps tag
    and state (home-app-shortcuts I7).
- **Where the field is drawn.** The app root (`VideoApp.tsx`, `ReadingApp.tsx`) builds
  `AppTabs` and owns the field. It passes `NameFilter`, bound to the store, as
  `trailing` only while the Library body is drawn:
  - the face is ライブラリ;
  - the Target is ready and usable, not failed, unusable or still being looked up;
  - the drive is not empty.

  In every other state the slot is empty, and the store keeps the name. On 発見 the slot
  is empty.
- Every Library-origin See all link (`from=library`) carries `q=<name>` when the name is
  set.
- Shelf headers show the counts the backend returns under the name.
- `filtersActive` includes the name. So the empty state 条件に合う項目はありません /
  Nothing matches these filters (SPEC-CORE-147) is shown when the name, a tag or the
  state narrows the Library to nothing. A Target that is empty or unusable, and an empty
  drive, keep their own states, which take precedence.
- The tag menu's `conditionsKey` and every Library load scope include the name, so a
  load for an older name is never drawn.
- **Between an apply and its answer** the Library shows exactly what it shows today when
  a tag or the state changes: the same loading display for the same requests. The name
  adds no loading state of its own. The same holds for See all pages and Clips.

**See all pages (Video, Reading).**

- In listing mode the header shows `NameFilter` with `alwaysOpen`, holding the URL's
  `q`. This holds whatever the `from`.
  - Listing mode is: not a provider `entry` page, `by` readable, the key valid, and the
    page not blocked by a missing profile (Video `watchBlocked`, Reading `!keyValid`).
    These are the states in which the page requests `shelves`.
  - In any other state, and on a provider `entry` page, no field is drawn and `q` is
    ignored. No request carries it.
- **URL normalisation.** A `q` that is untrimmed or longer than 200 characters is
  replaced, with no history entry, by its trimmed, cut form. An empty result removes `q`.
  The field shows the normalised text. Requests use it from the first render.
- **An applied change** replaces the URL's `q` (removed when empty) with no history
  entry.
  - On a `from=library` page it also writes the store's `name`, so Back to the Library
    shows it.
  - On any other page (`from=discover`, or no `from`) it does not touch the store.
- Opening a See all page writes nothing to the store.
- Discover-origin links carry no `q`.
- **A Target choice on the page** drops `q` with `tag` / `watch`. In the render that
  shows the new Target, before the replace lands, the requests carry no `q`. The page's
  `urlFilters` key includes `q`.
- When `q`, a tag or a watch state is in force and the page has no result, it shows 条件に
  合う項目はありません / Nothing matches these filters. Otherwise it shows its current
  empty state.

**Clips (SPEC-ADDON-159).**

- The name lives in the URL as `q`, beside `tag` and `trust`. `ClipFilters` gains
  `name`, `readClipFilters` reads `q` normalised as above, and `hasClipFilters` and
  `clipFiltersKey` include it. The load scopes that use `clipFiltersKey` therefore change
  with the name. So does the Clips tag menu's own `conditionsKey` (`clipsapp/Library.tsx`
  `Menus`, built today from the Target, the tags and `trust`).
- A name change replaces the URL (removing `target` as today) and adds no history entry.
- **What each rewrite does with `q`**:
  - **Keep it**: the `group` / `sort` fill-in; the unreadable-`trust` rewrite (it removes
    `trust` only); a shelf page's `sort` fill-in; the 分類 / 並び順 choice (a push); the
    `target` removal after a Home-shortcut landing.
  - **Drop it**: the unknown view or shelf rewrite (`replace(pathname)`, to Home); the
    leave-for-Home replace when a shelf needs a profile; a Target choice, which drops it in
    the same replace as `tag` / `trust`. In the interim render, `effectiveParams` strips
    `q` too.
  - **Normalise it**: an untrimmed or over-200 `q` is rewritten as on See all pages. An
    empty one is removed.
- A `q` on Home or a Home-origin shelf URL is ignored and left in place, as `tag` and
  `trust` are there today.
- Library-origin shelf pages (`tag:`, `untagged`, `folder:`, `month:`) carry `q`, apply
  it, and keep it in their back link. Links to Home's shelf kinds carry none. The tab
  links carry none, so a round trip through ホーム empties the name in Clips.
- `NameFilter` is in the tab row's `trailing` whenever the current tab is ライブラリ and
  the body is drawn: the Target is ready, not empty, and not being looked up. That
  covers the Library and the Library-origin shelf pages, which show ライブラリ as
  current. It is not drawn on Home or on Home-origin shelf pages.
- When `q`, a tag or a `trust` is in force and the Library or a Library-origin shelf page
  has no result, it shows the Clips copy of Nothing matches these filters (from
  SPEC-ADDON-151) instead of `noClipsHere`.

### 2. Failure cases

- **A filtered request fails.** The Library or See all page shows its existing failed
  state with Try again. The text stays.
- **Nothing matches.** The empty states above.
- **Over-long or untrimmed text.** Typing is capped by `maxLength`. A URL `q` is
  normalised by replace. No request is sent with more than 200 characters, so the filter
  never gets a 422.
- **Leaving within 300ms of typing.** Video and Reading keep the pending text in the
  store. Clips and See all URLs drop it.

### 3. States

The field (not `alwaysOpen`):

- closed (icon);
- open and empty;
- open with text.

Transitions:

- icon press → open and empty, focused;
- typing → open with text;
- deleting every character → open and empty, with the empty name applied after 300ms;
- × or Escape with text → open and empty, applied at once;
- blur while the trimmed draft is empty, or Escape while empty → closed;
- an outside non-empty `value` → open with that text, focus not moved;
- an outside empty `value` → open and empty if focused, else closed.

With `alwaysOpen`, the two open states only, focused or not. Blur and Escape on an
empty field change nothing.

Not allowed:

- the field closed while its trimmed draft is not empty;
- the field drawn as an icon on a See all page;
- the field drawn on 発見, ホーム, a Home-origin Clips shelf page or a provider `entry`
  page;
- a pending apply firing after ×, Escape, an outside `value` change, a `scopeKey`
  change, or an unmount (where only `onLeavePending` may receive it).

The applied name, per app:

- empty, or a text of 1 to 200 characters with no outer whitespace.
- Video and Reading keep and empty it as listed in §1.
- In Clips it is the URL's `q` on the Library and Library-origin shelf pages.

Not allowed:

- a name surviving a Target choice or a drive change;
- the name reaching the header count, Discover, Clips Home or the Reading chip request.

### 4. Data read and written

- **Backend**: reads `files` (and what the other filters already read) and writes
  nothing. No endpoint, parameter, table or migration is added.
- **Browser**: no storage. Video and Reading keep the name in the in-memory filter
  store. See all pages and Clips keep it in the URL `q`.

### 5. External services

None. The filter only adds a parameter to same-origin core routes the apps already call.

### 6. Authorization

Unchanged. Every request goes through routes that already validate the drive and the
unlocked groups, and `search` narrows within that drive.

### 7. Effect on existing features

- `PageTabs` gains `trailing`. Callers without it (admin settings, NotesPage, the Reading
  and Video Discover face, Clips Home) render unchanged.
- The filter store's shape grows. Reading's chip is not part of it and is unchanged.
- The See all pages' URL and Clips' URL gain `q`.
- The tag menu's candidates follow the name.
- The header count is unchanged, still the Target's total.
- The See all pages' and Clips shelf pages' empty state changes when a filter is in force
  (§1).
- Docs, in the same PRs:
  - `docs/user-guide/video.md`, `reading.md` and `notes.md` (Clips section): one
    sentence on the name filter;
  - `docs/addons/knowledge.md`: Clips URL `q`;
  - `docs/ADDON-DEVELOPMENT.md`: the `NameFilter` part and `PageTabs.trailing`, beside
    `FilterMenus`.

### 8. Error behavior

As in 2: the existing failed state with Try again, or the empty state. Nothing new is
logged.

### 9. User-visible behavior

- On ライブラリ, a search icon at the right end of the tab row. It opens into a field,
  and the items narrow about 300ms after typing stops.
- On 発見 / ホーム there is no icon.
- See all pages show the field, always open. From the Library it holds the Library's
  text, and a change there carries back.
- A Target choice, a reload of Video or Reading, or opening another drive empties the
  name. In Clips, so does a trip through the ホーム tab.
- At 390px the tab-row field fills the row after the tabs, and the 2×2 control grid is
  unchanged. On a See all page the field is a full-width row under the title.

Strings (core `appFilters`, used by the part itself):

- `nameFilter`: 名前で絞り込み / Filter by name;
- `nameFilterPlaceholder`: 名前で絞り込み... / Filter by name...;
- `clearName`: 入力をクリア / Clear input.

Checkable lines from the design:

- Main (1280): the tab row is 発見, ライブラリ (current), then the icon alone at the
  right end. The control row and shelves are unchanged.
- Open (1280): the icon is replaced by a 260px field with the search icon, the text and
  ×, and a dark border. Shelves show only matching items, and the counts follow.
- SeeAll (1280): back link, title. At the right: the field (with the Library's text),
  then the sort, then the Target. Below, the grid of matches.
- Clips (1280): the same tab-row field on ホーム | ライブラリ, with ライブラリ current.
- Phone (390): tab row 発見 | ライブラリ with a 44px icon at the right. The 2×2 control
  grid is below.
- PhoneOpen (390): the field fills the tab row after ライブラリ. The 2×2 grid is
  unchanged.
- PhoneEmpty (390): with text in the field and a tag chosen, the body shows the search
  icon and 条件に合う項目はありません.
- Discover (390): 発見 current, no icon in the tab row.
- PhoneSeeAll (390): back link, then the title row with the Target. Then the field as a
  full-width 44px row, then the sort, then a two-column grid.

### 10. Non-functional

- At most one request burst per 300ms pause in typing, with none per keystroke and none
  during IME composition.
- `ilike '%text%'` scans the drive's filtered rows. That is the cost the files listing's
  search already has.
- No new storage. The text stays in memory or in the viewer's own URL.

## Touch points

- `frontend/src/components/appshell/NameFilter.tsx` (new).
- `frontend/src/components/PageTabs.tsx` (`trailing`) and
  `frontend/src/components/appshell/AppTabs.tsx`.
- `frontend/src/components/appshell/libraryFilters.ts` (`name`).
- `frontend/src/components/videoapp/{VideoApp.tsx, LibraryFace.tsx, shelfLinks.ts,
  VideoShelfPage.tsx, VideoPagedGrid.tsx}` and
  `frontend/src/app/drive/[name]/apps/video/shelf/page.tsx`.
- `frontend/src/components/readingapp/{ReadingApp.tsx, LibraryFace.tsx, shelfLinks.ts,
  ReadingShelfPage.tsx}` and `frontend/src/app/drive/[name]/apps/reading/shelf/page.tsx`.
- `frontend/src/messages-core/{ja,en}.json` (`appFilters`).
- Not changed: `PageHeader.tsx`, `AppHeader.tsx`, `VideoAppHeader.tsx` and
  `ReadingAppHeader.tsx`. The See all field goes through the existing `actions` slot.
- `addons/knowledge/frontend/pages/clips.tsx` and
  `clipsapp/{clipsUrl.ts, Library.tsx, ShelfPage.tsx, requests.ts, useGroupedShelves.ts,
  useShelfData.ts, usePagedClips.ts}`.
- Tests:
  - the Video, Reading and Clips Library and See all / shelf-page tests;
  - `libraryFilters` tests;
  - a `NameFilter` test;
  - `PageTabs` tests;
  - `frontend/src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx` and
    `noHorizontalScrollFixtureParity.test.tsx`;
  - `frontend/e2e-layout/fixtures/reading-video-faces.html` and `no-horizontal-scroll.html`;
  - `e2e-components` for the tab row and the See all header at 390, 1024, 1280 and
    1440px. Specifically:
    - `frontend/e2e-components/fixtures/clipsPage.tsx` and `fixtures/clipsData.ts`;
    - `clips-view-menus*.spec.ts`;
    - `library-filters*.spec.ts`, which measures the 2×2 grid;
    - new specs for the name field.
  - Source-scanning tests that pin `PageTabs.tsx`: `frontend/src/__tests__/tab-styles.test.ts`
    and `section-rows.test.tsx`. They stay green, because the no-`trailing` path is
    unchanged. A failure means that path was changed.
- Docs: `docs/user-guide/{video,reading,notes}.md`, `docs/addons/knowledge.md`,
  `docs/ADDON-DEVELOPMENT.md`.
- Landing order, as in SPEC-CORE-145/147: a core PR, then the knowledge PR, then the
  core pointer bump with the core Clips e2e fixtures.
- No backend change and no protected path.

## Invariants

I1. With a non-empty name N in force, every request listed in §1 as carrying the name (Video and Reading Library shelves and tag-counts, See all `shelves`, Clips Library, Library-origin shelf pages and tag-counts) carries `search=N`, and every item shown has N in its title or folder path, ignoring ASCII case; with the name empty, no request carries `search` from the filter.
I2. The header-count request, Discover's requests, Clips Home's requests, Clips' Home-origin shelf pages, provider `entry` pages (even with `q` in their URL) and Reading's folder-chip request never carry the name, and the field is not drawn on 発見, ホーム, a Home-origin Clips shelf page or an `entry` page.
I3. Typing sends no request until 300ms pass after the last input or `compositionend`, none while IME composition is in progress, Enter applies at once, and results drawn always belong to the name last applied (a load for an older name is never drawn).
I4. In Video and Reading the name is never written to localStorage or sessionStorage; a full page load, opening the app on another drive, a Target choice and a Home-shortcut landing on a different Target empty it; a Home-shortcut landing on the Target in force, a tab switch, a See all round trip, a file page round trip, re-choosing the Target in force, a fallback to `default`, a member re-evaluation and clearing the profile keep it; text typed less than 300ms before leaving the Library or a `from=library` See all page is the store's name afterwards.
I5. A `from=library` See all link carries `q` equal to the Library's applied name and Discover-origin links carry none; on any See all page an applied change replaces `q` without a history entry; on a `from=library` page it is also the Library's name after Back, and on any other page the store is unchanged; opening a See all page leaves the store unchanged; a Target choice on the page sends no request with `q` and removes it.
I6. In Clips the name is exactly the normalised URL `q` on the Library and Library-origin shelf pages; a name change and a Target choice add no history entry; a Target choice, the tab links, the unknown-view rewrite and the leave-for-Home replace remove `q`; the 分類 / 並び順 choice, the group/sort fill-in, the unreadable-trust rewrite, a shelf page's sort fill-in, the `target` removal and a Library-origin shelf page's back link keep it; the field is drawn whenever the current tab is ライブラリ.
I7. × and Escape on a field with text empty the applied name at once and no later request carries the old text; a non-`alwaysOpen` field closes only when its trimmed draft is empty, on blur or Escape, returning focus to the icon on Escape; an `alwaysOpen` field never closes.
I8. Without `trailing`, `PageTabs` renders the same elements and classes as before; with it, the trailing node is outside the `nav` and its tablist; at 1440, 1280, 1024 and 390px in ja and en, the tab row with the field open and holding a 40-character name and the See all header with the same name do not scroll horizontally, the tabs keep their width, and at 390px the Library control row stays the 2×2 grid of SPEC-CORE-147 I8, measured in a real browser.
I9. When the name, a tag, or a state / watch / trust filter is in force and the result is empty, the Library, the Video and Reading See all pages and Clips' Library-origin shelf pages show Nothing matches these filters (ja 条件に合う項目はありません); an empty or unusable Target and an empty drive keep their own states.
I10. No request carries a `search` longer than 200 characters or with outer whitespace, and a See all or Clips URL whose `q` is untrimmed or over 200 characters is replaced, without a history entry, by its normalised form.
I11. The icon button and the input have the accessible name 名前で絞り込み / Filter by name, the × button 入力をクリア / Clear input, and the input's placeholder is 名前で絞り込み... / Filter by name...; the icon button's box is at least 44×44 on a coarse pointer.
I12. In Video and Reading the field is drawn only while the Library body is drawn (face ライブラリ, Target ready and usable, drive not empty), and while it is not drawn the store's name is unchanged; on a See all page the field is drawn only in listing mode, before the sort from `sm` up and as a full-width row under the title row below `sm`.
I13. A pending apply reaches only `onLeavePending` on unmount and nothing after a `scopeKey` change: in Clips, moving between the Library and a shelf page within 300ms of typing never changes the new page's URL or requests; an outside `value` equal to the part's last applied name never changes the draft.

## Revises

SPEC-CORE-147 I10. A Library with no result while a tag is chosen, the state is not すべて, or a name is applied shows 条件に合う項目はありません / Nothing matches these filters as its empty-state title; with no filter set, each app's existing empty title is shown.
SPEC-CORE-147 I5. No filter value is written to localStorage or sessionStorage; in Video and Reading a full page load, opening the app on another drive, and a Target choice show no tag, state すべて and no name, while a tab switch, a See all round trip, a file page round trip, re-choosing the Target in force, a fallback to `default` and a member re-evaluation keep them; in Clips the filters are exactly the URL's `tag` / `trust` / `q`, a filter change and a Target choice add no history entry, a Target choice and the tab links remove them, and the 分類 / 並び順 choice and every fill-in or the unreadable-trust rewrite keep them.
SPEC-CORE-147 I12. Every tag-counts request the menu sends carries every condition in force: the Target's conditions (member ids through POST), Reading's chip, the state, the chosen tags and the name; after a toggle the menu stays open and requests again.
SPEC-CORE-145 I11. Once the Library body is drawn, the Clips URL names the `group` and `sort` shown and the Notes URL names the `sort` shown, so Back after a Clips menu choice or a Notes sort choice shows the previous value; a Clips `tag:`/`untagged`/`folder:`/`month:` shelf page's back link is `?view=all&group=<tags|folder|month>&sort=<the page's sort>` plus the page's `tag`, `trust` and `q`.
SPEC-CORE-145 I14. A Clips folder shelf is titled with its key's last segment (the drive name for the root key `""`), a month shelf with its `YYYY-MM` formatted like Video's month shelves, and its shelf page carries the same heading; "See all ›" of every Clips Library shelf carries the Library's `sort`. `shelf=folder:` with an empty key opens the drive root's shelf page; `shelf=month:` with a key that is not `YYYY-MM` goes to Home by replace; a folder or month key with no clip shows "No clips here" when no `tag`, `trust` or `q` is in force, and the Clips copy of Nothing matches these filters when one is.
SPEC-CORE-063 I16b. The folder chip is never stored; it resets to All on a fresh open and on a target change. The Library sort is stored per Target. The tag, state and name filters are never stored; they last while the page is open and reset on a full page load, a drive change and a Target choice.

## Checked, no action

- **Semantic search in the field.** Rejected by the user. A ranked result has no cut-off
  to filter by, it fights the 並び順 order, and it depends on the intelligence addon.
  The search page and a Smart Collection with free text already cover meaning.
- **Notes.** Its rail already searches.
- **Photo Diary.** Out of scope while its addon catches up with the shared app shell.
  Whether it needs the filter is undecided.
- **Matching `File.filename` instead of the title.** Not done. The card shows the title,
  and the backend's `search` already uses title and folder path, so the Library agrees
  with the search page.
- **Unicode case and kana folding.** Not done. `ilike` folds ASCII only, as the files
  listing's search does today. Japanese has no case. Width and kana folding would be a
  backend change for every search.
- **Seeding the store from a See all URL on open.** Not done. A reloaded See all page
  keeps its own `q` from the URL, but Back to a freshly loaded Library starts empty, as
  every other filter does after a full load.
- **Showing the Library field on Discover.** Rejected by the user. Discover is not
  filtered. Its See all pages get the field, which stays page-local (user's choice).
- **Narrowing Reading's folder chips by the name.** Rejected by the user. The chips stay
  the Target's folders.
- **Collapsing the See all field to an icon.** Not done. That header has no tab row, and
  an always-open field shows the text in force.
- **Putting the field in the control row.** Rejected. It would break the 390px 2×2 grid
  agreed in SPEC-CORE-147.
- **A keyboard shortcut to open the field.** Not added. Cmd/Ctrl+F belongs to
  find-in-file on file pages and to the browser elsewhere.
- **Keeping the Clips name across a ホーム tab round trip.** Not done. The tab links carry
  no filter in Clips (SPEC-ADDON-151), and the name follows the same rule.
- **A separate Reading artboard.** None. Reading's tab row and See all header have the
  Video shape.
