# Clips: the apps' frame, cover cards, and a Library of tag shelves

SPEC-ID: SPEC-ADDON-138
SPEC-ID: SPEC-ADDON-139
SPEC-ID: SPEC-ADDON-140
SPEC-ID: SPEC-CORE-136

Approval:

## Summary

The Clips page of the Knowledge addon (`/drive/{drive}/addons/knowledge/clips`,
`clips-app.md`) has its own header, no Target, and rows built from the Notes rows. Notes
moved onto the apps' frame (`notes-app.md`); this change does the same for Clips, and gives
it content that fits what clips are: pages gathered from outside, mostly recipes, chosen
by their picture and read once.

- **SPEC-ADDON-138, the frame and Home.** The core `AppHeader` with the Clips icon and
  title, the scope line "<drive> · N clips", the shared Target menu, "Clip a web page" as
  the header's primary action, and the tabs **Home** and **Library**. Home keeps its three
  shelves (Unread, Recently opened, Unverified; New clips without a profile), now drawn as
  cover cards, each with "See all ›" to a shelf page. An Unverified card has a "Mark as
  verified" button.
- **SPEC-ADDON-139, Library and shelf pages.** Two faces under a switch: **By tag**, one
  shelf of cover cards per tag (the most used first, "Untagged" last), and **Newest
  clipped**, every clip as a grid of cards. A shelf page shows one shelf's clips as a
  paged grid. A card opens the clip's file page.
- **SPEC-ADDON-140, covers and sites.** A new Knowledge route `POST /clip-covers` reads the
  start of each clip and answers its cover image (the first `loft://` image of the body)
  and its site (the host of the frontmatter `url`, else of the first `http(s)` URL in the
  start of the body). Nothing is stored.
- **SPEC-CORE-136, the Target menu's default count by origin.** `TargetMenu` gains the
  optional `defaultTargetOrigin`, the counterpart of `defaultTargetExcludeOrigin`, so the
  menu counts "All clips" as clips only.

Notes does not change (I10).

Agreed design: https://claude.ai/artifact/4vifoHSVwqoHQWC85S91bp (made with the Notes
design on 2026-11-18), saved in `docs/process/reviews/feature-clips-frame/design/`:
`ClipsHome.dc.html` (Home, 1440) and `ClipsLibrary.dc.html` (Library by tag, 1440). Visible decisions, as checkable lines:

- Header as on Notes: icon tile + "Clips" + scope line; at the right the Target button
  ("All clips"), then the red "Clip a web page" button (below the tabs on a phone, full
  width); the tabs "Home" and "Library".
- Home, top to bottom: "Unread" with its count beside the heading and "See all ›" at the
  right; "Recently opened" with "See all ›"; "Unverified" with "See all ›". Each shelf is
  one row of cover cards.
- A cover card: a 4:3 cover (the clip's first image, cropped to fill; without one, a
  flat tint with no text), a red dot at the cover's top left when unread, the title in up to two
  lines, then "site · N min · age" in muted text. An Unverified card shows "site · age"
  and a "Mark as verified" button under it.
- Library by tag: a switch "By tag | Newest clipped" and nothing else above the shelves;
  each shelf headed by the tag, its count and "See all ›"; one row of cover cards.

Declared differences between the design and this spec, accepted with it:

- **The cover tint is one token, not eight tints.** The design's varied tints are
  placeholders for pictures; a clip without an image gets the elevated surface colour.
- **States without an artboard** (phone, the Newest clipped face, shelf pages, empty,
  loading and error) are built from the components named in item 9.

## Required items

### 1. Normal flow

**SPEC-ADDON-138, the frame and Home**

1. The viewer opens `/drive/{drive}/addons/knowledge/clips`. The page draws `AppHeader`
   with the Newspaper icon, title "Clips", the Target menu, "Clip a web page" as
   `primaryAction`, and the tabs. It does not call `useOverlaySidebar()`.
2. The Target follows the addon-app pattern as Notes does (`useNotesTarget`) with
   `APP = { addon: "knowledge-clips" }` and `BASE_KINDS = ["text"]`. `AppKey` names one
   app per addon, and the key is used only as a storage prefix (`appPrefs`,
   `useShownTargets`), so Clips takes its own key: its saved id lives under
   `litloft.addon.knowledge-clips.target.<drive>` and Notes' key is untouched. Every request below that lists,
   counts or shelves clips carries the target, `type=text` and `origin=webclip`; a member
   target goes through the ids forms as on Notes. The menu's `label` is "Target", its
   `defaultLabel` "All clips", `defaultTargetTypes = ["text"]` and `defaultTargetOrigin =
   "webclip"`. `empty`, `tooLarge` and failed targets behave as on Notes.
3. The scope line shows the drive and, once known, "N clips": the `total` of `files` with
   the target, `type=text`, `origin=webclip`.
4. "Home" is the URL without `view`; "Library" is `?view=all`. A tab, the Library's face
   switch and "See all" are links that push history. A Target change writes storage only
   and adds no history entry; it starts every shelf and grid over from its first page.
   Home, Library and shelf pages are one page component, so moving between them keeps the
   clip form mounted (SPEC-ADDON-100 I27).
5. "Clip a web page" opens and closes the existing clip form (`ClipSection`) in a region
   under the header, as today; `?prefill=` opens it with the URL and title filled, as
   today. When a clip finishes (`knowledge.clip.ready`), the scope count and every shown
   shelf or grid re-ask their first page (Home shelves; the Library's first 12 tag
   shelves or first 60 cards; a shelf page's first 60) and merge it in: clips not drawn
   yet are put first, drawn cards stay, later pages already drawn stay (SPEC-ADDON-100
   I25). Covers are asked for the clips not asked about yet and for the clip the event
   names.
6. Home, with a profile: **Unread** (`shelves` `by=all`, `opened=false`, newest clipped
   first, 12 cards), with the shelf's total beside the heading; **Recently opened**
   (`watch-history` `filter=all`, `origin=webclip`, 12, newest opened first; it does not
   follow the Target, like Notes' Continue writing); **Unverified** (`shelves` `by=all`,
   `trust=unverified`, newest clipped first, 12). Without a profile: **New clips**
   (`shelves` `by=all`, newest first, 12) and **Unverified**. A shelf with no cards is not
   drawn. "See all ›" goes to that shelf's page (step 10 of SPEC-ADDON-139). The Unread
   request is the one that answers 400 `viewer_required` (it carries `opened`); on that
   answer Home switches to the without-profile shelves until the nickname changes
   (SPEC-ADDON-100 I24).
6a. **Unread dot.** With a profile, for the cards of every shelf and grid except Unread
   and Recently opened, the page asks `shelves` `by=all` `key=all` `opened=false`
   `ids=<those card ids>` `per_shelf=60` (60 ids per request, the target not repeated)
   and draws the dot on the cards it returns. Every Unread card has the dot; no Recently
   opened card has it. Without a profile no card has it. Until the answer arrives, and if
   it fails, cards have no dot.
7. "Mark as verified" sends `PUT /api/files/{id}/trust-tier` `{tier: "verified"}`. While
   it is in flight the button is disabled; on success the card leaves the Unverified
   shelf (and its page) without reloading it, and the shelf's count drops by one; Home's
   12 are not refilled until the next refresh, and a shelf left with no card is not
   drawn. On failure the button returns with "Couldn't save" beside it, the card stays,
   and it can be pressed again. On the Unverified shelf page, the next page after any
   removal is page `floor(shown / 60) + 1`, where `shown` is the number of cards still
   drawn, and cards already drawn are skipped, so no clip is passed over.
8. Choosing a card opens the clip's file page (`canonicalFileUrl`). The file page records
   the view as it does today; the Clips page records nothing itself.

**SPEC-ADDON-139, Library and shelf pages**

9. Library (`?view=all`) shows the switch "By tag | Newest clipped" (`face=tags`, the
   default, or `face=newest`; push, kept in the URL).
   - **By tag**: `shelves` `by=tag` with the target, `per_shelf=12`, `shelf_limit=12`,
     ordered by count, then more shelves as the viewer scrolls (`useNearEnd`, `offset`)
     until all are drawn. The untagged shelf (`no_tag`) is drawn last, headed
     "Untagged". Each shelf: tag, count, "See all ›", one row of cards (newest clipped
     first).
   - **Newest clipped**: `shelves` `by=all` `key=all` pages of 60 (`page`), newest
     clipped first, appended on scrolling to the end, as a grid.
10. A shelf page is `?view=shelf&shelf=<id>` with `<id>` one of `unread`, `recent`,
    `new`, `unverified`, `tag:<name>`, `untagged`. Its back link goes to Library for
    `tag:` and `untagged`, else to Home. It shows the shelf's title, its count (none for
    `recent`), and its clips as a grid, 60 per page, appended on scrolling. The requests
    are the shelf's own (step 6, step 9) with `per_shelf=60` and `page`; `recent` asks
    `watch-history` with `limit=50` (the route's maximum) and offers no further page.
    Without a profile, `unread` and `recent` go to Home (replace); `new` is shown with or
    without a profile. Under a Target that has no clips with that tag, a tag page shows
    "No clips here".
11. Cards are laid out by the shared card grid (`lib/cardGrid`) at the Reading app's book
    grid sizes (item 9): one row on Home and Library shelves (a horizontal scroller on a
    phone), wrapping on Newest clipped and shelf pages.

**SPEC-ADDON-140, covers and sites**

12. Whenever cards are drawn, the page asks `POST /api/addons/knowledge/clip-covers`
    `{file_ids}` (at most 60 per request) for the cards it has not asked about yet (and
    again for the clip a `knowledge.clip.ready` names), and draws each card's cover and
    site when the answer arrives; the card is drawn at once with the tint and no site, at
    its final size. Answers are kept while the page is mounted.
13. The route checks each id is readable and in the request's drive (as `note-openings`
    does), reads the first 4096 bytes of each text file through the Internal API, and
    answers `{covers: {<id>: {image_id: str|null, image_url: str|null, site: str|null}}}`
    with one entry per requested id that passed the checks (ids dropped by the checks
    are absent):
    - The cover is the first Markdown image `![alt](target)` or `![alt](target "title")`
      after the frontmatter. When its target is `loft://<id>` and `/files/bulk` answers
      that id as an active image of the same drive, `image_id` is that id. When its
      target is an absolute `http(s)` URL, `image_url` is that URL. Otherwise both are
      null. HTML `<img>` is not read.
    - `site`: the host of the frontmatter `url` when it is an `http(s)` URL; else the host
      of the first `http(s)` URL after the frontmatter that is not an image target (a
      link target `[text](url)`, an autolink `<url>` or a bare URL); else null. The host
      is lower-cased, without port, without a leading `www.`; an IDN host is kept as
      written.
    A file whose start cannot be read is answered with all three null.
14. The card draws `image_id` through `/api/files/<image_id>/thumbnail`, or `image_url`
    directly with `referrerpolicy="no-referrer"` and lazy loading; an image that fails to
    load leaves the tint. The reading time is `max(1, round(file_size / 1500))` minutes.

**SPEC-CORE-136, Target menu**

15. `TargetMenu` gains `defaultTargetOrigin?: string`, passed as `origin` in the "All …"
    count request beside `type`; absent, the request is as today. It combines with
    `defaultTargetExcludeOrigin` as the listing does.

### 2. Failure cases

- The scope count fails: the scope line shows the drive alone; shelves still load.
- A Home or Library shelf fails: its heading with "Couldn't load" and "Try again"; the
  others are unaffected. A later page of a shelf page fails: the drawn cards stay, with
  "Try again" under them.
- The Unread `shelves` request answers 400 `viewer_required`: step 6.
- The unread-dot request fails or answers 400: no dots; not retried until the next
  refresh.
- `clip-covers` fails or times out: cards keep the tint and no site; those ids are asked
  again only on the next refresh.
- The trust-tier write fails: step 7.
- A `?view=shelf` with an unknown `shelf` id goes to Home (replace).

### 3. States

- Page: Home | Library (`face` tags | newest) | shelf page. The Target lives in storage.
- Target: as Notes (default, Smart Collection, collection, member; looking up; empty;
  unusable).
- Card: tint (covers not answered, none, or the image failed) → cover; dot (step 6a) |
  no dot. A card never moves back from cover to tint except when its image fails.
- Unverified card: idle → saving → gone (success) | failed (failure); failed → saving
  (pressed again). A refresh that arrives while saving does not remove or re-add the
  card; the saving result decides it.
- Target: default | Smart Collection | collection | member, each loading → ready |
  empty | unusable, as on Notes. Any change of Target resets Library's `offset` and every
  grid to page 1.
- Empty: the drive has no clip → "No clips yet" with today's body and no tabs; the
  drive has clips but the Target has none → the tabs stay and Home and Library show
  "No clips in this Target" (`EmptyState`, no body). The drive-wide count is asked
  (`files` `type=text&origin=webclip&limit=1`, no target) only when the Target's count
  is 0.

### 4. Data read and written

- Read: `files` (count), `shelves`, `watch-history`, `/api/files/{id}/thumbnail`, core
  Internal API `filter-file-ids`, `/files/bulk`, `/files/{id}/opening` (through
  `InternalClient.get_file_opening`).
- Written: `files.trust_tier` and `trust_reviewed_at` through the existing
  `PUT /api/files/{id}/trust-tier`, only from "Mark as verified". Nothing else; the new
  route stores nothing.
- Browser storage: the Clips target key (`litloft.addon.knowledge-clips.target.<drive>`).
  The Library face is in the URL.
- Outside hosts: the viewer's browser loads `image_url` covers from the clip's source
  site, without a referrer.

### 5. External services

No server-side call. The site is read from text already in the drive. The browser loads
external cover images (`image_url`) directly from their hosts; a slow, missing or
refusing host leaves the tint.

### 6. Authorization

Unchanged: every listing is the core's, under the viewer's unlocked drives. `clip-covers`
requires `X-Lit-Drive`, filters ids through `filter-file-ids` and drops files of other
drives, so a cover or site of a locked or other drive is never answered (I6). The cover
image is drawn through the core thumbnail route, which applies its own access check.

### 7. Effect on existing features

- Notes: none. `note-openings`, `NoteRows`, `SectionHeading`, `useNoteOpenings` keep their
  behaviour; Clips stops importing `NoteRows` and `SectionHeading`.
- The bookmarklet and `?prefill=` still open Clips with the form open.
- `TargetMenu` callers that do not pass `defaultTargetOrigin` send the same count request.
- Removed: `ClipsAll` (the date-grouped list) and `ClipsTabs`; their URL `?view=all` now
  shows the Library.

### 8. Error behavior

Item 2. The route logs a failed opening read at debug and answers nulls; it answers 502 if
the Internal API's filter or bulk call fails, 422 above 60 ids, 400 without the drive.

### 9. User-visible behavior

- Texts (en / ja): "Clips"; "N clips" / "N 件"; "All clips" / "すべてのクリップ"; "Clip a
  web page" / "Web ページをクリップ"; Home / ホーム, Library / ライブラリ; Unread / 未読,
  Recently opened / 最近開いた, Unverified / 未確認, New clips / 新しいクリップ; "See all"
  / "すべて表示"; "Mark as verified" / "確認済みにする"; "By tag" / "タグ別", "Newest
  clipped" / "クリップした順"; "Untagged" / "タグなし"; "N min" / "N 分"; "Couldn't
  load" / "Try again" as Notes.
- The age on a card is the clip's `created_at`, in the Notes date style.
- Loading: skeleton cards at final size in each shelf; empty drive (or empty target):
  `EmptyState` "No clips yet" with today's body.
- Phone (below 640px): shelves scroll sideways with cards 150px wide; grids are two
  columns.
- The page uses `PageFrame` `width="wide"`, as Notes, so the header does not move between
  the two apps.
- Card grid sizes follow `lib/cardGrid`'s book grid (minimum card width 140px, gap 20px);
  a Home or Library shelf shows the cards that fit one row at that size.

### 10. Non-functional

- `clip-covers`: at most 60 ids, 8 parallel reads of at most 4096 bytes each, as
  `note-openings`.
- Reading time: 1500 bytes a minute is about 500 Japanese characters (3 bytes each in
  UTF-8) or 250 English words (about 6 bytes each with the space); both reading rates are
  common estimates, so one constant serves both without detecting the language.
- No horizontal page scroll at 1440, 1280, 1024 and 390px (I9).

## Touch points

- Knowledge frontend: `pages/clips.tsx` (rewritten on `AppHeader`), new `clipsapp/`
  (target hook built on `notesapp/useNotesTarget.ts`, Home, Library faces, shelf page,
  `ClipCard`, `useClipCovers`, `useUnreadDots`, requests), `clips/requests.ts` (moved into
  `clipsapp/`), removed `clips/ClipsAll.tsx`, `clips/ClipsTabs.tsx`,
  `clips/ClipShelf.tsx`, `clips/ClipsHome.tsx`, `clips/ClipsEmpty.tsx` (replaced by
  `EmptyState`), `messages/en.json`, `messages/ja.json` (`knowledge.clips.*`), tests
  beside them; tests citing SPEC-ADDON-100 that cover removed code move to the new
  components so every implemented SPEC-ID keeps a citation.
- Knowledge backend: new `app/routers/clip_covers.py`, `app/main.py` (router),
  `app/schemas.py` (request/response), `manifest.json` (proxied route
  `POST /clip-covers`, scope drive, no `pre_check` or `addon_feature`, as
  `note-openings`), tests `tests/test_clip_covers.py`.
- Core frontend: `components/appshell/TargetMenu.tsx` (`defaultTargetOrigin`) and its test.
- Core tests listing knowledge files, updated in the pointer-bump PR:
  `toolbarMenuHome.test.ts`, `ime-enter-guard`, `page-headings`, `section-headings`,
  `line-clamp-display`, `escape-listeners`, `page-container-width`, `popup-dismissal`,
  `reachability`, `componentFixtureParity` and e2e-components fixtures as they apply.
- e2e-components: a Clips fixture measuring I9.
- Docs: the Clips section of `docs/user-guide/notes.md` (where Clips is documented today),
  `docs/addons/knowledge.md` (the route), `docs/ADDON-DEVELOPMENT.md`
  (`defaultTargetOrigin`).
- PRs: core (`TargetMenu`) → Knowledge → core pointer bump with the inventory tests and docs.

## Invariants

I1. Every card, count and shelf on the Clips page (Home, Library, shelf pages, scope line, the Target menu's "All clips") counts or shows only files with `md_origin` `webclip` and `type=text`, under the Target in force; Recently opened is the one shelf that ignores the Target.
I2. The scope line's N equals `files` `total` for the same Target with `type=text` and `origin=webclip`, and a tag shelf's count equals the number of cards its shelf page reaches over all its pages.
I3. Every clip in the Target is reachable from the Library: Newest clipped reaches it over its pages, and the By tag face reaches it through the shelf page of one of its tags or of "Untagged".
I4. With a profile, a card shows the unread dot exactly when the viewer has no watch-history row for it; without a profile no card shows the dot.
I5. "Mark as verified" changes only that file's trust tier (to `verified`, with `trust_reviewed_at` set), and only when the viewer pressed it; apart from it and the clip form's existing writes, no request from the Clips page writes to the core or the drive.
I6. `clip-covers` never answers an entry for a file outside the request's drive or not readable by the caller, and a non-null `image_id` is always an active image file of the same drive.
I7. A card's site is the host of the frontmatter `url` when it is an `http(s)` URL, else the host of the first `http(s)` URL in the start of the body that is not an image's target; it is never text that is not such a host.
I8. Drawing covers never moves a card: a card has its final size before its cover answer arrives.
I9. At 1440, 1280, 1024 and 390px the Clips Home and Library do not scroll horizontally, and the header draws "Clip a web page" after the Target (full width below the tabs on a phone).
I10. The Notes pages, `note-openings` and the `TargetMenu` count of every caller that does not pass `defaultTargetOrigin` behave exactly as before.

## Revises

SPEC-ADDON-100 I28. When the drive has no clip, the empty state replaces the tabs and the shelves on both tabs, and the header with its primary action is drawn; when the drive has clips but the Target has none, the tabs stay and "No clips in this Target" replaces the shelves.
SPEC-ADDON-100 I29. Clips `?view=all` is the Library: its Newest clipped face lists clips by `created_at` descending, 60 per page, as cover cards without age groups; cards show the `created_at` age.

## Checked, no action

- **A core column for the site** (the earlier design note): the production recipes carry
  no frontmatter `url`, so a column projected from it would leave 1,434 cards without a
  site. Reading the start of the body in the addon covers both, stores nothing and needs
  no core change (owner's choice, 2026-11-18).
- **Covers fetched or stored by the server**: the browser loads an external cover itself
  (owner's choice, 2026-11-18); nothing is downloaded into the drive here. Taking images
  in at clip time is a separate change.
- **Invariants for the reading time, the trust-write failure, the route's 400/422 and the
  unknown shelf id**: covered by tests from item 1 and item 2; none can silently lose or
  leak data, so they stay out of the invariant list.
- **A reading pane like Notes'**: clips are read once and are long pages with pictures;
  the file page already reads them well. Cards open the file page.
- **A connections tab or graph**: the recipe clips make a whole-drive graph unreadable.
- **Site as a shelf grouping**: not in the design; a later change if wanted.
- **A core `AppKey` with an app name** (`{ addon, app }`): Clips' own storage key is
  reached with a distinct addon key string, which `appPrefs` uses only as a prefix; a core
  change would buy nothing visible.
- **Unread dot on Recently opened**: every card there has been opened, so none has it.
