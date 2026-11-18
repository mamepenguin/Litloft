# Clips: the apps' frame, cover cards, and a Library of tag shelves

SPEC-ID: SPEC-ADDON-138
SPEC-ID: SPEC-ADDON-139
SPEC-ID: SPEC-ADDON-140
SPEC-ID: SPEC-CORE-136

Approval: sha256:7a5746f5719b7206d6542f93551eca0c970ac3dffd25cccd0454fbd488dfa841 Yuichi Senga 2026-11-18

## Summary

The Clips page of the Knowledge addon (`/drive/{drive}/addons/knowledge/clips`,
`clips-app.md`) has its own header, no Target, and rows built from the Notes rows. Notes
moved onto the apps' frame (`notes-app.md`); this change does the same for Clips, and gives
it content that fits what clips are: pages gathered from outside, mostly recipes, chosen
by their picture and read once.

- **SPEC-ADDON-138, the frame and Home.** The core `AppHeader` with the Clips icon and
  title, the scope line "<drive> · N clips", the shared Target menu, "Clip a web page" as
  the header's primary action, and the tabs **Home** and **Library**. Home keeps its
  shelves (Unread, Recently opened, Unverified; New clips without a profile). Unread,
  Recently opened and New clips are drawn as cover cards; Unverified is a list of rows,
  each with a "Mark as verified" button. Every shelf has "See all ›" to a shelf page.
- **SPEC-ADDON-139, Library and shelf pages.** Two menus above the Library: grouping
  (**By tag**: one shelf of cover cards per tag, the most used first, "Untagged" last; or
  **No grouping**: every clip as a grid) and sort (**Newest clipped**, **Oldest
  clipped**, **Title**). A shelf page shows one shelf's clips as a paged grid. A card
  opens the clip's file page.
- **SPEC-ADDON-140, covers and sites.** A new Knowledge route `POST /clip-covers` reads the
  start of each clip and answers its cover (the first Markdown image of the body, a
  `loft://` file or an `http(s)` URL) and its site (the host of the frontmatter `url`,
  else of the first non-image `http(s)` URL in the start of the body). Nothing is stored.
- **SPEC-CORE-136, the Target menu's default count by origin.** `TargetMenu` gains the
  optional `defaultTargetOrigin`, the counterpart of `defaultTargetExcludeOrigin`, so the
  menu counts "All clips" as clips only.

Notes does not change (I10).

Agreed design: https://claude.ai/artifact/4vifoHSVwqoHQWC85S91bp (made with the Notes
design on 2026-11-18), saved in `docs/process/reviews/feature-clips-frame/design/`:
`ClipsHome.dc.html` (Home, 1440) and `ClipsLibrary.dc.html` (Library by tag, 1440).
Visible decisions, as checkable lines:

- Header as on Notes: icon tile + "Clips" + scope line; at the right the Target button
  ("All clips"), then the red "Clip a web page" button (below the tabs on a phone, full
  width); the tabs "Home" and "Library".
- Home, top to bottom: "Unread" with its count beside the heading and "See all ›" at the
  right; "Recently opened" with "See all ›"; "Unverified" with "See all ›". Unread and
  Recently opened are cover cards in columns at least 200px wide with a 20px gap.
- An Unverified row: a 72×54 thumbnail (the cover, or the tint), the title on one line,
  "site · age" under it, and the "Mark as verified" button at the right.
- A cover card: a 4:3 cover (the clip's first image, cropped to fill; without one, a
  flat tint with no text), a red dot at the cover's top left when unread, the title in up
  to two lines, then in muted text "site · N min · age" on Home and shelf pages and
  "site · N min" in the Library.
- Library: two menu buttons, grouping ("By tag ⌄") and sort ("Newest clipped ⌄"), and
  nothing else above the shelves; each shelf headed by the tag, its count and "See all ›";
  one row of cover cards.

Declared differences between the design and this spec, accepted with it:

- **The cover tint is one token, not eight tints.** The design's varied tints are
  placeholders for pictures; a clip without a cover gets the elevated surface colour.
- **Shelves follow DESIGN.md, not one fixed row.** A shelf is the cards that fit its
  rows as `ShelfBlock` lays them out (columns from the container's width at a 200px
  minimum and 20px gap; one row at three columns or more, two rows at two; a sideways
  strip only on a coarse pointer), where the design draws one row, five fixed columns in
  the Library, and a 24px row gap on Home (owner's choice, 2026-11-18).
- **States without an artboard** (phone, No grouping, shelf pages, empty, loading and
  error) are built from the components named in item 9.

## Required items

### 1. Normal flow

**SPEC-ADDON-138, the frame and Home**

1. The viewer opens `/drive/{drive}/addons/knowledge/clips`. The page draws `AppHeader`
   with the Newspaper icon, title "Clips", the Target menu, "Clip a web page" as
   `primaryAction`, and the tabs. It does not call `useOverlaySidebar()`. It uses
   `PageFrame` `width="wide"`, as Notes.
2. The Target is Notes' target hook (`notesapp/useNotesTarget.ts`) given the app key as a
   parameter: Notes passes `{ addon: "knowledge" }` as today, Clips passes
   `{ addon: "knowledge-clips" }`; `BASE_KINDS = ["text"]` for both. `AppKey` names one
   app per addon and is used only as a storage prefix (`appPrefs`, `useShownTargets`), so
   Clips' saved target and its shown-targets list live under
   `litloft.addon.knowledge-clips.*` and Notes' keys are untouched. Every request below
   that lists, counts or shelves clips carries the target, `type=text` and
   `origin=webclip`; a member target goes through the ids forms as on Notes. The menu's
   `label` is "Target", `defaultLabel` "All clips", `unavailableLabel` "Unavailable",
   `defaultTargetTypes = ["text"]`, `defaultTargetOrigin = "webclip"`. Unusable targets
   behave as on Notes.
3. The scope line shows the drive and, once known, "N clips": the `total` of `files` with
   the target, `type=text`, `origin=webclip`.
4. "Home" is the URL without `view`; "Library" is `?view=all`. Tabs, the Library menus and
   "See all" push history. A Target change writes storage only, adds no history entry,
   and starts every shelf and grid over from its first page. Home, Library and shelf
   pages are one page component, so moving between them keeps the clip form mounted
   (SPEC-ADDON-100 I27). On a shelf page the tab it came from (Home or Library, step 10)
   is the current tab.
5. "Clip a web page" opens and closes the existing clip form (`ClipSection`) in a region
   under the header; `?prefill=` opens it with the URL and title filled, as today.
   **Refresh** happens on `knowledge.clip.ready` and on `ClipSection`'s `onClipAdded`
   (which also covers pasted clips and "create anyway"). The scope count re-asks, and so
   does the drive-wide count when it was 0. Every shown card shelf or grid re-asks every
   page it has loaded (Home shelves; each page of 60 a No grouping grid or a shelf page
   has drawn) and merges them in its sort order: a clip not drawn yet takes its place, a drawn card is updated
   with the answer's data (title, size, dates), and later pages already drawn stay. By
   tag re-asks its first 12 tag shelves and replaces that set, its order and counts; the
   shelves drawn after them are dropped and asked again from `offset=12` as the viewer
   scrolls. Covers and unread dots are then asked for the cards not asked about yet, for
   the cards whose last ask failed, and for the clip the event names. A Target change, a
   nickname change and a remount are not refreshes; they start over.
6. Home, with a profile: **Unread** (`shelves` `by=all` `key=all`, `opened=false`, newest
   clipped first, 12 cards), with its count beside the heading; **Recently opened**
   (`watch-history` `filter=all`, `type=text`, `origin=webclip`, limit 12, newest opened
   first; it does not follow the Target, like Notes' Continue writing); **Unverified**
   (`shelves` `by=all` `key=all`, `trust=unverified`, newest clipped first, 5 rows, no
   count beside the heading). Without a profile: **New clips** (`shelves` `by=all`
   `key=all`, newest first, 12) and **Unverified**. Card shelves draw as many of their 12
   as `ShelfBlock` fits. A shelf with no cards is not drawn. "See all ›" goes to that shelf's
   page (step 10). "With a profile" means a nickname is set and no request has answered
   400 `viewer_required` for that nickname; the Unread request (it carries `opened`) is
   the one that can answer it, and after it no request needing a viewer (Unread, the
   unread dots, Recently opened) is sent until the nickname changes (SPEC-ADDON-100 I24).
7. **Unread dot.** With a profile, for the cards of every shelf and grid except Unread and
   Recently opened, the page asks `shelves` `by=all` `key=all` `opened=false`
   `ids=<card ids>` `per_shelf=60` (60 ids per request, no target) for cards not asked
   about yet, and draws the dot on the cards it returns. Every Unread card has the dot; no
   Recently opened card has it. Without a profile no card has it. Until the answer
   arrives, and if it fails, those cards have no dot.
8. "Mark as verified" is drawn on the rows of the Unverified shelf and its shelf page
   (which is a list of the same rows) only. It sends `PUT /api/files/{id}/trust-tier` `{tier: "verified"}`. While it is in flight
   the button is disabled; on success the row leaves the shelf without reloading it and
   the shelf page's count drops by one; Home's 5 are not refilled until the next
   refresh, and a Home shelf left with no row is not drawn. On failure the button returns with "Couldn't
   save" beside it, the card stays, and it can be pressed again. A refresh that arrives
   while saving neither removes nor re-adds that card; the save's result decides it. On
   the Unverified shelf page, the next page after any removal is page
   `floor(shown / 60) + 1`, where `shown` is the number of rows still drawn, and rows
   already drawn are skipped. A shelf page asks no further page once `shown` reaches its
   count or a page adds nothing new.
9. Choosing a card opens the clip's file page (`canonicalFileUrl`). The file page records
   the view as it does today; the Clips page records nothing itself. The card's title is
   the file's `title`, or its filename without the extension when `title` is empty.

**SPEC-ADDON-139, Library and shelf pages**

10. Library (`?view=all`) has two `ToolbarMenu` buttons: grouping ("By tag" `group=tags`,
    the default, or "No grouping" `group=none`) and sort ("Newest clipped" `sort=newest`,
    the default; "Oldest clipped" `sort=oldest`; "Title" `sort=title`), both kept in the
    URL; an unknown value is read as the default and replaced in the URL. The Library tab
    links to `?view=all` with no menus (the defaults). The sort applies to the cards inside each tag shelf and to the grid (shelves
    `sort=created_at` `order=desc|asc`, or `sort=title` `order=asc`).
    - **By tag**: `shelves` `by=tag` with the target, `per_shelf=12`, `shelf_limit=12`,
      shelves ordered by count, then more shelves as the viewer scrolls (`useNearEnd`,
      `offset`) until all are drawn. The untagged shelf (`no_tag`) is last, headed
      "Untagged". Each shelf: tag, count, "See all ›", one row of cards.
    - **No grouping**: `shelves` `by=all` `key=all` pages of 60 (`page`), appended on
      scrolling to the end, as a grid.
11. A shelf page is `?view=shelf&shelf=<id>` (plus the Library's `sort` for `tag:` and
    `untagged`) with `<id>` one of `unread`, `recent`, `new`, `unverified`, `tag:<name>`,
    `untagged`. Its back link ("‹ Home" or "‹ Library") goes to
    `?view=all&group=tags&sort=<sort>` for `tag:` and `untagged`, else to Home. An unknown
    `view` value is Home. It shows the shelf's title, its count (none for `recent`),
    and its clips as a grid, 60 per page, appended on scrolling. The requests are the
    shelf's own (step 6, step 10) with `per_shelf=60` and `page`; `recent` asks
    `watch-history` with `limit=50` (the route's maximum) and offers no further page.
    Without a profile, `unread` and `recent` go to Home (replace); `new` is shown with or
    without a profile; if the profile goes while such a page is shown, it goes to Home
    (replace). A shelf page whose first page answers no clip shows "No clips here"; when
    the drive has no clip, "No clips yet" (State "Empty") is drawn instead.
12. Card shelves on Home and in By tag use `ShelfBlock` with a clip grid (`lib/cardGrid`
    metrics: 200px minimum, 20px gap). No grouping and card shelf pages are grids of the
    same metrics that wrap.

**SPEC-ADDON-140, covers and sites**

13. Whenever cards are drawn, the page asks `POST /api/addons/knowledge/clip-covers`
    `{file_ids}` (at most 60 per request) for the cards it has not asked about yet, and
    draws each card's cover and site when the answer arrives; the card is drawn at once
    with the tint and no site, at its final size. Answers are kept while the page is
    mounted; a refresh asks again for the clip the event names.
14. The route requires `X-Lit-Drive`, keeps the ids `filter-file-ids` lets through,
    drops those `/files/bulk` does not answer as active text files (`TEXT_MIMES`) of the
    request's drive, as `note-openings` does, reads the first 4096 bytes of each kept
    file through `InternalClient.get_file_opening` (the core's `/api/files/{id}/stream`
    with a Range, under the caller's credential), and answers
    `{covers: {<id>: {image_id: str|null, image_url: str|null, site: str|null}}}` with one
    entry per kept id; dropped ids are absent. The `loft://` ids found are checked with
    one more `/files/bulk`; if that call fails, every `image_id` is null and the rest of
    the answer stands.
    - The cover is the first Markdown image `![alt](target)` or `![alt](target "title")`
      after the frontmatter. When its target is `loft://<id>` and `/files/bulk` answers
      that id as an active file of the same drive with `file_type` `image`, `image_id` is
      that id. When its
      target is an absolute `http(s)` URL, `image_url` is that URL. Otherwise both are
      null. HTML `<img>` is not read.
    - `site`: the host of the frontmatter `url` when it is an `http(s)` URL; else the host
      of the first `http(s)` URL after the frontmatter that is not an image target (a
      link target `[text](url)`, an autolink `<url>` or a bare URL); else null. The host
      is lower-cased, without port, without a leading `www.`; an IDN host is kept as
      written.
    A kept file whose start cannot be read is answered with all three null.
15. The card draws `image_id` through `/api/files/<image_id>/thumbnail`, or `image_url`
    directly with `referrerpolicy="no-referrer"` and lazy loading; an image that fails to
    load leaves the tint. The reading time is `max(1, round(file_size / 1500))` minutes.

**SPEC-CORE-136, Target menu**

16. `TargetMenu` gains `defaultTargetOrigin?: string`, passed as `origin` in the "All …"
    count request beside `type` (and in the memo's dependencies); absent, the request is
    as today. It combines with `defaultTargetExcludeOrigin` as the listing does.

### 2. Failure cases

- The scope count fails: the scope line shows the drive alone; shelves still load, and
  the empty states are not drawn (they need a count of 0).
- A Home or Library shelf fails: its heading with "Couldn't load" and "Try again"; the
  others are unaffected. The request for more tag shelves (`offset`) fails: the drawn
  shelves stay, with "Try again" under them, which re-asks that offset.
- The first page of a No grouping grid or a shelf page fails: "Couldn't load" and "Try
  again" in place of the grid. A later page fails: the drawn cards stay, with "Try again"
  under them, which re-asks that page.
- The Unread request answers 400 `viewer_required`: step 6.
- The unread-dot request fails or answers 400: those cards have no dot until the next
  refresh asks for them again; a 400 also ends "with a profile" (step 6).
- `clip-covers` fails or times out: cards keep the tint and no site until the next
  refresh asks for those ids again.
- The trust-tier write fails: step 8.
- A `?view=shelf` with an unknown `shelf` id goes to Home (replace).

### 3. States

- Page: Home | Library (`group` tags | none, `sort`) | shelf page. Moves: tabs and "See
  all" (push); a menu choice (push); the back link (push); an unknown shelf or a
  profile-only shelf without a profile → Home (replace).
- Target: default | Smart Collection | collection | member, each looking up → ready |
  empty | unusable, as on Notes. A change of Target resets Library's `offset` and every
  grid to page 1.
- Empty, decided from the Target's count:
  - The Target is `empty` or its count is 0: the drive-wide count is asked once
    (`files` `type=text&origin=webclip&limit=1`, no target).
  - The drive has no clip: "No clips yet" with today's body, no tabs, no shelves.
  - The drive has clips and the Target has none: the tabs stay; Home shows "No clips in
    this Target" (`EmptyState`, no body) and Recently opened under it when it has cards
    (it ignores the Target); Library shows "No clips in this Target".
  - Either count fails: no empty state is drawn; shelves that answer are drawn.
- Profile: with ↔ without (nickname set, cleared or changed; a 400 `viewer_required`).
  A change rebuilds Home's shelves, clears every dot and asks again (with a profile), and
  sends a shown `unread` or `recent` shelf page to Home when it ends without a profile.
- Card: tint (no answer yet, no cover, or the image failed) → cover; dot | no dot (step 7).
- Unverified row: idle → saving → gone (success) | failed (failure); failed → saving
  (pressed again). No other transition.

### 4. Data read and written

- Read: `files` (counts), `shelves`, `watch-history`, `/api/files/{id}/thumbnail`; in the
  route, core Internal API `filter-file-ids` and `/files/bulk`, and the core's
  `/api/files/{id}/stream` (Range) under the caller's credential.
- Written: `files.trust_tier` and `trust_reviewed_at` through the existing
  `PUT /api/files/{id}/trust-tier`, only from "Mark as verified"; the clip form's existing
  writes (unchanged). The new route stores nothing.
- Browser storage: `litloft.addon.knowledge-clips.target.<drive>` and the shown-targets
  list under the same prefix, written by the shared Target menu. The Library's menus are
  in the URL.
- Outside hosts: the viewer's browser loads `image_url` covers from the clip's source
  site, without a referrer.

### 5. External services

No server-side call. The site is read from text already in the drive. The browser loads
external cover images (`image_url`) directly from their hosts; a slow, missing or
refusing host leaves the tint.

### 6. Authorization

Unchanged: every listing is the core's, under the viewer's unlocked drives. `clip-covers`
requires `X-Lit-Drive`, filters ids through `filter-file-ids` and drops files of other
drives, so no entry for a locked or other drive is answered (I6). A `loft://` cover is
drawn through the core thumbnail route, which applies its own access check.

### 7. Effect on existing features

- Notes: `useNotesTarget` takes the app key as a parameter; Notes passes the key it uses
  today, so its saved target, requests and menu are unchanged (I10). `note-openings`,
  `NoteRows`, `SectionHeading`, `useNoteOpenings` are unchanged; Clips stops importing
  them.
- The bookmarklet and `?prefill=` still open Clips with the form open.
- `TargetMenu` callers that do not pass `defaultTargetOrigin` send the same count request.
- Removed: `ClipsAll` (the date-grouped list), `ClipsTabs`, `ClipShelf`, `ClipsHome`,
  `ClipsEmpty`; `?view=all` now shows the Library.
- SPEC-ADDON-100's design lines D2 (icon-only phone button), D3 (no See all, no count),
  D4 (rows) and D5 (date-grouped All with Load more) are replaced by this spec's design;
  `frontend/e2e-components/clips-primary-action.spec.ts` and `fixtures/clipsPage.tsx`,
  which measure D2, are rewritten to measure I9, and `clips-row.spec.ts` with
  `fixtures/clipsRow.tsx`, which measure D4, are rewritten to measure the card (neither
  is deleted; owner's choice, 2026-11-18).

### 8. Error behavior

Item 2. The route logs a failed opening read at debug and answers nulls for that file; it
answers 502 if the Internal API's filter or bulk call fails, 422 above 60 ids, 400 without
the drive.

### 9. User-visible behavior

- Texts (en / ja): "Clips"; "N clips" / "N 件"; "All clips" / "すべてのクリップ";
  "Target" / "対象"; "Unavailable" / "使えません"; "Clip a web page" / "Web ページをクリップ";
  "Home" / "ホーム", "Library" / "ライブラリ"; "Unread" / "未読", "Recently opened" /
  "最近開いた", "Unverified" / "未確認", "New clips" / "新しいクリップ"; "See all" /
  "すべて表示"; "Mark as verified" / "確認済みにする"; "Couldn't save" / "保存できませんでした";
  "By tag" / "タグ別", "No grouping" / "まとめない"; "Newest clipped" / "クリップした順",
  "Oldest clipped" / "古い順", "Title" / "タイトル順"; "Untagged" / "タグなし"; "N min" /
  "N 分"; "No clips here" / "ここにはクリップがありません"; "No clips in this Target" /
  "この対象にはクリップがありません"; "‹ Home" / "‹ ホーム", "‹ Library" / "‹ ライブラリ";
  "Couldn't load" / "Try again" as Notes; "No clips yet" and its body as today.
- The age on a card and an Unverified row is the clip's `created_at` as a relative age
  (`formatRelativeAge` from `lib/format`, as the Reading app: "today", "2 days ago").
- Loading: skeleton cards at final size in each shelf and grid.
- Phone (below 640px): shelves scroll sideways with cards 150px wide; grids are two
  columns; the Library's two menus sit on one row.

### 10. Non-functional

- `clip-covers`: at most 60 ids, 8 parallel reads of at most 4096 bytes each, as
  `note-openings`.
- Reading time: 1500 bytes a minute is about 500 Japanese characters (3 bytes each in
  UTF-8) or 250 English words (about 6 bytes each with the space); both reading rates are
  common estimates, so one constant serves both without detecting the language.
- No horizontal page scroll at 1440, 1280, 1024 and 390px (I9).

## Touch points

- Knowledge frontend: `pages/clips.tsx` (rewritten on `AppHeader`);
  `notesapp/useNotesTarget.ts` (the app key as a parameter, Notes' default unchanged) and
  its tests; new `clipsapp/` (Home, Library, shelf page, `ClipCard`, `useClipCovers`,
  `useUnreadDots`, requests); `clips/requests.ts` moved into `clipsapp/`; removed
  `clips/ClipsAll.tsx`, `clips/ClipsTabs.tsx`, `clips/ClipShelf.tsx`,
  `clips/ClipsHome.tsx`, `clips/ClipsEmpty.tsx`; `messages/en.json`, `messages/ja.json`
  (`knowledge.clips.*`); tests beside them. Tests citing SPEC-ADDON-100 that cover
  removed code move to the new components so every implemented SPEC-ID keeps a citation.
- Knowledge backend: new `app/routers/clip_covers.py`, `app/main.py` (router),
  `app/schemas.py` (request/response), `manifest.json` (proxied route
  `POST /clip-covers`, scope drive, no `pre_check` or `addon_feature`, as
  `note-openings`), tests `tests/test_clip_covers.py`.
- Core frontend: `components/appshell/TargetMenu.tsx` (`defaultTargetOrigin`) and its test.
- Core tests listing knowledge files, updated in the pointer-bump PR:
  `toolbarMenuHome.test.ts`, `ime-enter-guard`, `page-headings`, `section-headings`,
  `line-clamp-display`, `escape-listeners`, `page-container-width`, `popup-dismissal`,
  `reachability`, `componentFixtureParity`, `scripts/check-coverage-denominator.mjs` for
  type-only modules, as they apply.
- e2e-components: `clips-primary-action.spec.ts` and `fixtures/clipsPage.tsx` rewritten to
  measure I9; `clips-row.spec.ts` and `fixtures/clipsRow.tsx` (which measure
  SPEC-ADDON-100 D4) rewritten to measure the card (4:3 cover, two-line title, I8); and
  their `spec-viewport.spec.ts`, `projects.ts` registrations.
- Core: `lib/cardGrid.ts` gains the clip grid metrics if `ShelfBlock` needs them there.
- Docs: the Clips section of `docs/user-guide/notes.md`, `docs/addons/knowledge.md` (the
  route), `docs/ADDON-DEVELOPMENT.md` (`defaultTargetOrigin`).
- PRs: core (`TargetMenu`) → Knowledge → core pointer bump with the inventory tests, e2e
  and docs.

## Invariants

I1. Every card, count and shelf on the Clips page (Home, Library, shelf pages, scope line, the Target menu's "All clips") counts or shows only files with `md_origin` `webclip` and `type=text`, under the Target in force; Recently opened is the one shelf that ignores the Target.
I2. The scope line's N equals `files` `total` for the same Target with `type=text` and `origin=webclip`, and a tag shelf's count equals the number of cards its shelf page reaches over all its pages.
I3. Every clip in the Target is reachable from the Library: No grouping reaches it over its pages, and By tag reaches it through the shelf page of one of its tags or of "Untagged"; the Unverified shelf page reaches every clip still unverified over its pages, however many were marked verified on the way.
I4. Once the unread-dot answer for a card has arrived, with a profile the card shows the dot exactly when the viewer has no watch-history row for it; without a profile, and after a 400 `viewer_required`, no card shows the dot.
I5. "Mark as verified" changes only that file's trust tier (to `verified`, with `trust_reviewed_at` set), and only when the viewer pressed it; apart from it and the clip form's existing writes, no request from the Clips page writes to the core or the drive.
I6. `clip-covers` never answers an entry for a file outside the request's drive, not readable by the caller, or not an active text file, and a non-null `image_id` is always an active image file of the same drive.
I7. A card's cover is the first Markdown image after the frontmatter (a `loft://` image of the same drive or an absolute `http(s)` URL, else none), and its site is the host of the frontmatter `url` when it is an `http(s)` URL, else the host of the first `http(s)` URL in the start of the body that is not an image's target; it is never text that is not such a host.
I8. Drawing covers never moves a card: a card has its final size before its cover answer arrives.
I9. At 1440, 1280, 1024 and 390px the Clips Home and Library do not scroll horizontally, and the header draws "Clip a web page" after the Target (full width below the tabs on a phone).
I10. The Notes pages and their saved target, `note-openings`, and the `TargetMenu` count of every caller that does not pass `defaultTargetOrigin` behave exactly as before.
I11. Once opened, the clip form is not unmounted by moving between Home, Library and shelf pages; after a 400 `viewer_required`, no request that needs a viewer is sent until the nickname changes (SPEC-ADDON-100 I24, I27 held here).

## Revises

SPEC-ADDON-100 I28. When the drive has no clip, the empty state replaces the tabs and the shelves on both tabs, and the header with its primary action is drawn; when the drive has clips but the Target has none, the tabs stay and "No clips in this Target" replaces the shelves (Recently opened excepted on Home).
SPEC-ADDON-100 I25. A clip added through the Clips page's form (by URL, paste or "create anyway") raises the counts at once and appears without a reload wherever the current Target, grouping and sort place it within what is already loaded; placed beyond that, it appears when the viewer reaches its place. A refresh never blanks shelves or cards already drawn.
SPEC-ADDON-100 I29. Clips `?view=all` is the Library: grouped by tag or ungrouped, sorted newest clipped first by default, 60 cards per page when ungrouped, as cover cards without age groups.

## Checked, no action

- **A core column for the site** (the earlier design note): the production recipes carry
  no frontmatter `url`, so a column projected from it would leave 1,434 cards without a
  site. Reading the start of the body in the addon covers both, stores nothing and needs
  no core change (owner's choice, 2026-11-18).
- **Covers fetched or stored by the server**: the browser loads an external cover itself
  (owner's choice, 2026-11-18); nothing is downloaded into the drive here. Taking images
  in at clip time is a separate change.
- **Invariants for the reading time, the trust-write failure, the route's 400/422 and the
  unknown shelf id**: covered by tests from items 1 and 2; none can silently lose or leak
  data.
- **A reading pane like Notes'**: clips are read once and are long pages with pictures;
  the file page already reads them well. Cards open the file page.
- **A connections tab or graph**: the recipe clips make a whole-drive graph unreadable.
- **Site as a shelf grouping**: not in the design; a later change if wanted.
- **A core `AppKey` with an app name** (`{ addon, app }`): Clips' own storage keys are
  reached with a distinct addon key string, which `appPrefs` uses only as a prefix; a core
  change would buy nothing visible.
- **A copy of the target hook for Clips**: one parameter keeps one implementation; Notes'
  tests pin its default.
- **Unread dot on Recently opened**: every card there has been opened, so none has it.
- **"Mark as verified" on every unverified card**: the owner chose the Unverified shelf
  only (2026-11-18); other faces are for choosing by cover.
