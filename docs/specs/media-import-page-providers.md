# Media Import: page providers for the video app, and no Watch page

SPEC-ID: SPEC-ADDON-091
SPEC-ID: SPEC-ADDON-092

Approval:

## Summary

The video app's Discover face shows Media Import's two lanes, **よく見るソース** (regular) and
**購読の新着** (feed), through list providers (SPEC-ADDON-088). Their **See all** goes to the
Media Import page, whose **見る** / **Watch** tab is the only other place to watch them.
SPEC-CORE-078/079 (PR #554) gave the core a shelf page for addon shelves and card bylines.
This change moves Media Import onto it, so the video app becomes the one place to watch.

- **SPEC-ADDON-091**: Media Import exports `slotPageProviders` for both entries. Each pages
  through its lane with a keyset cursor, fills each page through `restrict`, and gives
  every item a byline made of the channel name and the publish date. Both entries lose
  their `href`, so **See all** opens the core page under the video app's target.
- **SPEC-ADDON-092**: the Watch tab and its components are removed. The Media Import page
  shows what was the Manage view, with no tabs. The display-mode setting's wording, which
  says where a subscription's videos appear, now names the video app instead of Watch.

The viewer is one person on a PC browser. The phone layout runs the same pages.

## Required items

### 1. Normal flow

**Backend: keyset paging on `/watch` (SPEC-ADDON-091).** `GET /api/addons/media_import/watch`
keeps its parameters and gains `after`, an optional string.

- Each lane is ordered by `published_sort DESC, created_at DESC, file_id DESC`. `file_id`
  is added as the last key so that the order is total. The `regular` lane's per-source
  `ROW_NUMBER()` window gains the same last key, so which two videos of a source survive
  the cap is decided the same way on every read.
- Every `WatchItem` gains `cursor`, an opaque string (base64url of a JSON array) holding
  its row's `published_sort`, `created_at` and `file_id` exactly as the query returned them,
  before any conversion for the response. The `after` condition compares those values with
  the same SQL expressions the order uses:
  `(published_sort, created_at, file_id) < (:p, :c, :f)` in the lane's descending order.
- With `after`, the lane returns only the rows that come strictly after that position in
  the order, then applies `limit`. For `regular`, the per-source cap of 2 (`rn <= 2`) is
  applied first, so `after` pages through the capped lane.
- `after` together with an `offset` other than 0 is 422. A malformed `after` (one that does
  not decode) is also 422.
- Without `after`, the response is the same as today, apart from the added `cursor`
  field and the removed `playback` field.
- `/watch` no longer reads `watch_history`. Its only consumer, the Watch card, is removed,
  and the core draws the cards now. `WatchItem.playback`, `WatchPlayback`, the playback
  state helper and `load_playback_markers` go, with their tests, unless something else
  uses them.

**Frontend: page providers (SPEC-ADDON-091).** `frontend/slots.ts` exports
`slotPageProviders` with `media-import-regular` (lane `regular`) and `media-import-feed`
(lane `feed`). Each provider is called with `{ drive, locale, limit, cursor, restrict }`
and works like this:

1. Start from `cursor`, or from the lane's top when it is `null`.
2. Read the lane 60 rows at a time with `listWatch(drive, lane, { limit: 60, after })`.
   `listWatch(drive, lane, { limit, after? })` takes `limit` as required, sends `after` only
   when given, and never sends `offset`. `WATCH_LANE_CONFIG` is removed.
3. Pass each read's file ids through `restrict`, and take the accepted rows in lane order.
4. Stop as soon as `limit` rows are taken, a read comes back shorter than 60, or 10 reads
   have been made in this call.
5. Return the taken rows as `items`, each `{ id, byline }`.
   - When the lane ended (a short read, with every row of it examined), return
     `cursor: null`.
   - Otherwise return the `cursor` of the last row examined, so that the next call resumes
     after it. Rows of the last read that come after the `limit`-th taken row are not
     examined, and the next call reads them again.

The byline is the channel and the publish date, joined by ` · `. Either part is left out
when it is missing, and there is no byline when both are missing.

- The channel is `WatchItem.channel`, trimmed.
- The date is the calendar date written in `published_at`: the first 8 digits of a
  `YYYYMMDD` value, or the first 10 characters (`YYYY-MM-DD`) of an ISO date or datetime,
  whatever offset follows. This is the same date the lane's sort key uses. It is
  formatted with
  `new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })`,
  which gives, for example, 2026年11月1日 for `ja` and Nov 1, 2026 for `en`. A value that
  does not parse as a date leaves the date out.

`slotProviders` (the list providers of SPEC-ADDON-088) are removed. The core prefers the
page provider for these entries (SPEC-CORE-078 I6), so they would never run.

`ADDON_META.slots["video-discover-shelves"]` keeps both entries with their ids, priorities
and `i18n_key`, and drops `href`. **See all** then follows the core rule (SPEC-CORE-078
I5) to `/drive/{drive}/apps/video/shelf?entry=media-import-…`.

**No Watch page (SPEC-ADDON-092).** `/drive/{drive}/addons/media_import` renders the
header (icon, title, drive scope) and, below it, the Composer, the subscriptions dashboard
and the activity feed, as the Manage tab does today. There are no tabs. The page still
reads the subscription list once on mount, but only to decide whether the Composer starts
expanded (no subscriptions), as today. Until that read settles, the page shows the
existing loading line (`loadingDrive`), because the Composer reads its initial state once.
If the read fails, the page shows the management view with the Composer expanded, as
today. The page is keyed by the drive, so moving to another drive's Media Import page
starts again from the loading line and reads that drive's subscriptions. The `watch/` directory, its tests, and the
`mediaImport.nav.*` and `mediaImport.watch.*` messages are removed.

The display-mode field (`DisplayModeField`) keeps its three options and their values, and
changes only its wording. `library.label` (ライブラリのみ) and `regular.label` (よく見るソース)
stay, the latter already being the shelf's name:

| Key | ja | en |
|---|---|---|
| `legend` | 動画アプリでの表示 | Show in the video app |
| `feed.label` | 購読の新着に表示 | Show in New from subscriptions |
| `library.hint` | 取り込んで検索・Ask の対象にします。動画アプリの発見には並びません。 | Imported and searchable, including Ask. Not shown on the video app's Discover. |
| `feed.hint` | 新しい動画を、動画アプリの発見の「購読の新着」に新しい順で並べます。 | New videos appear newest first in "New from subscriptions" on the video app's Discover. |
| `regular.hint` | 習慣的に見るチャンネルとして、動画アプリの発見の「よく見るソース」に並べます。 | A source you watch habitually, shown in "Regular sources" on the video app's Discover. |

This takes over from Watch's empty-state text. That text told the user to change this
setting so that videos would appear, and the hints now say where they appear.

### 2. Failure cases

- **A `/watch` read fails**, or `restrict` rejects: the provider rejects. On Discover the
  shelf is not drawn. On the core page **Retry** appears, which resends the same cursor
  (SPEC-CORE-078 I9).
- **`viewer_required` from `restrict`**: the core handles it (SPEC-CORE-078).
- **The 10-read bound is reached with fewer than `limit` taken.** The provider returns what
  it took and the cursor of the last row examined. If it took none, the core ends the list
  there (SPEC-CORE-078 I4), even though later rows might match. See Checked, no action.
- **The lane changes while the viewer scrolls the core page.** Keyset paging does not
  shift because of rows added above the cursor. These changes still reach rows the viewer
  has not scrolled to, and are accepted; reopening the page shows the lane as it is now:
  - a row added with a sort key behind the cursor (an older video imported late) is not
    seen in this session;
  - in `regular`, a new import from a source pushes that source's second video out of the
    cap, and a deleted or trashed video lets a third one in, which may sit behind the
    cursor and be skipped;
  - a metadata refresh that changes `published_at` moves the row, so it can be skipped, or
    returned again (the core then drops the repeat, SPEC-CORE-078 I3).
- **A malformed `after`** (a stale bookmark cannot carry one, because the cursor never
  appears in a URL): 422, and the provider rejects.
- **No channel and no publish date**: the item has no byline.

### 3. States

The provider holds no state between calls. Everything it needs is in `cursor`. The core
owns the page's states (SPEC-CORE-078 §3).

The Media Import page has two states. `loading` shows the loading line while the drive is
not known or the subscription list read is in flight. `managing` shows the management view,
with the Composer expanded when the read returned no subscription or failed. `loading`
goes to `managing` once the read settles. A drive change remounts the page into
`loading`. Nothing else goes back.

### 4. Data read and written

- Read: `files`, `loft_metadata`, `subscription_videos` and `subscriptions` through
  `/watch`. It no longer reads `watch_history`. Read: the core shelves query through `restrict`.
- Written: nothing.

### 5. External services

None. Every call stays in the stack. The browser calls the in-process Media Import routes
and the core.

### 6. Authorization

Unchanged. `/watch` checks `X-Lit-Drive` against the unlocked groups and requires it to
equal `drive`. `restrict` makes the core decide what the viewer may see (SPEC-CORE-078 I2).
`after` only positions the read inside a lane the caller can already read.

### 7. Effect on existing features

- The Media Import page loses its Watch tab, and the page opens on management for everyone.
  The sidebar link and the route stay.
- Playback progress badges, the "Watched" state, **Add to collection** and **Open the
  source page** on Watch cards are gone with the cards. Opening a video and adding it to a
  collection remain on the file page. The source page remains in the `.loft` metadata panel.
- `/watch` keeps `offset`; its response gains `cursor` and loses `playback`. No other caller exists once
  Watch is gone. The endpoint is not part of the Internal API.
- The Discover shelves keep their titles, order and size (12). They gain bylines, and their
  **See all** stays in the video app.
- Home is unchanged. Continue was already Home's, and it is the video app's too.

### 8. Error behavior

No new message. The removed Watch error lane text goes with it. The backend logs nothing
new. A 422 for `after` uses FastAPI's validation response.

### 9. User-visible behavior

- Discover: **よく見るソース** and **購読の新着** show a second line on each card, such as
  `チャンネル名 · 2026年11月1日`.
- **See all** on either opens a page in the video app titled with the shelf's name. It
  shows that lane's videos under the current target, 60 at a time as the viewer scrolls,
  with bylines. The regular lane is no longer cut at 12 there: it lists 2 per source for
  every regular source.
- The Media Import page (**YouTube とフィード** / **YouTube & Feeds** in the sidebar, label
  unchanged) shows management directly, with no **見る** / **管理** tabs.
- The display-mode setting reads 動画アプリでの表示, with the hints above.

### 10. Non-functional

- A provider call makes at most 10 reads of 60 rows, plus one `restrict` per read (60 ids,
  one request each).
- Local test data (2026-11-10): drive 動画 has 73 videos under *feed* subscriptions and 210
  under *regular* ones before the per-source cap. One or two reads fill a Discover shelf,
  and the bound is far from these sizes. The production counts were not measured.
- The cursor is a few dozen bytes, and it never appears in a URL.

## Touch points

Core files that name what this change removes (the addon's CI runs core `develop`'s
vitest with the new addon tree, so these must be ready on `develop` first):

- `frontend/src/__tests__/line-clamp-display.test.ts`: the `ANCHORS` entry
  `addons/media_import/frontend/watch/WatchCard.tsx` is replaced with
  `addons/media_import/frontend/LoftDescription.tsx`, which also carries a line clamp, so
  the check keeps one Media Import anchor.
- `frontend/src/components/videoapp/__tests__/VideoApp.discoverProviders.test.tsx` and
  `VideoShelfPage.provider.test.tsx`: the fixture `i18n_key`
  `mediaImport.watch.lane.regular` becomes `mediaImport.slots.videoRegular`, whose ja and en
  text are the same.
- `frontend/scripts/check-coverage-denominator.mjs`: the `NO_INSTRUMENTABLE_CODE` entry
  `src/addons/media_import/watch/index.ts` is removed in the pointer-bump commit, because
  the file stops existing there. This script is not run by the addon's CI.

Merge order:

1. PR #554 (the core page).
2. A core PR with this spec and the two test edits above. Both work with the addon as it
   is today.
3. The addon PR.
4. A core PR with the pointer bump, the coverage-script entry and the docs.

- `docs/specs/INDEX.md`: rows for SPEC-ADDON-091 and SPEC-ADDON-092.
- `addons/media_import/backend/subscription/db.py`: `list_watch_lane` gains the `file_id`
  tiebreak, the `after` keyset condition, and a per-row cursor.
- `addons/media_import/backend/router.py`: the `/watch` parameter `after` and its 422 rules.
  `_to_watch_item` fills `cursor`. In `ADDON_META.slots`, the two entries drop `href`.
- `addons/media_import/backend/schemas.py`: `WatchItem.cursor`; `WatchItem.playback` and
  `WatchPlayback` removed. `router.py` and `subscription/db.py` lose the playback read
  (`load_playback_markers` and the state helper) unless something else uses them.
- `addons/media_import/backend/tests/`: keyset paging (order, no repeats or skips across
  pages, the regular cap, 422s) and `test_addon_meta.py` (no `href`).
- `addons/media_import/frontend/api.ts`: `listWatch(drive, lane, { limit, after? })`,
  `WatchItem.cursor` without `playback`, and no `WATCH_LANE_CONFIG`.
- `addons/media_import/frontend/watchShelfProviders.ts` (or a renamed module) and
  `frontend/slots.ts`: `slotPageProviders`, the byline, no `slotProviders`.
- `addons/media_import/frontend/__tests__/watchShelfProviders.test.ts`: rewritten for page
  providers.
- `addons/media_import/frontend/Page.tsx` and `Page.test.tsx`: no tabs, no Watch.
- `addons/media_import/frontend/watch/`: removed with its tests.
- `addons/media_import/frontend/messages/{ja,en}.json`: `displayMode` wording; `nav` and
  `watch` removed.
- `addons/media_import/frontend/DisplayMode.test.tsx` and any other test that asserts the
  removed or changed text: updated to the new text.
- The core repository: the submodule pointer bump of `addons/media_import`.
- `addons/media_import/README.md`: the `/watch` route line gains `after`, and the "Watch 面"
  section is replaced by a short note on the page providers.
- Docs:
  - `docs/user-guide/video.md`: no change. It already says that an addon shelf with a page
    provider opens a page in the video app, without naming the addon.
  - `docs/addons/media-import.md`: the Watch section becomes "In the video app" (the two
    shelves, bylines, See all, the display-mode setting). Every other mention of Watch
    goes too: "Show in Watch", "not shown in Watch", the card actions, and which tab the
    page opens on.
  - `docs/ADDON-DEVELOPMENT.md`: no change. Its UI slots table row stays, and `/watch` is
    documented nowhere today.
- Rules passed through: `design-decisions.md` (drive boundary, no core-to-addon
  dependencies, and the Addons implementation discipline: an addon's UI lives in its own
  `frontend/`), and `frontend-conventions.md` (addon translation keys only in the addon's
  messages).
- Not an Internal API change. No protected path is edited.

## Invariants

I1. For each lane and drive, reading `/watch` page after page, each page started with
`after` set to the last row's `cursor`, returns every row of the lane exactly once, in the
same order as a single unpaged read. This holds for `regular` with its cap of 2 per
source.

I2. `/watch` without `after` returns the same rows, in the same order, as before this
change, apart from rows that tie on both `published_sort` and `created_at`. Those are now
ordered by `file_id` descending, and for `regular` the same tiebreak decides which of a
source's tied videos fall within its cap of 2.

I3. `after` with a non-zero `offset`, and an `after` that does not decode, are 422.

I4. A page provider returns only ids that its own `restrict` accepted, in lane order, at
most `limit`, and never an id it returned for an earlier cursor of the same lane while the
lane is unchanged.

I5. A page provider returns `cursor: null` exactly when a read shorter than 60 rows was
examined to its last row. Otherwise its cursor makes the next call resume at the first row
it did not examine.

I6. A page provider makes at most 10 `/watch` reads per call, and makes no further read
after a short read or once `limit` rows are taken.

I7. An item's byline is `channel · date`, `channel` or `date` alone when only one exists,
and absent when neither does. The date is the calendar date of `published_at`, formatted
for the given `locale` in UTC, so it never shifts by a day with the browser's time zone.

I8. Neither `video-discover-shelves` entry declares `href`, and `slots.ts` exports no
`slotProviders` for them.

I9. The Media Import page shows no tabs and no Watch content, and no `mediaImport.nav.*` or
`mediaImport.watch.*` key remains in either locale. Until its subscription read settles it
shows only the loading line. Then it shows the Composer, the subscriptions dashboard and
the activity feed, whatever the subscriptions' display modes, with the Composer expanded
exactly when the read returned no subscription or failed.

I10. The display-mode field offers the same three values as before, and saving one stores
the same `display_mode` as before. Its legend, `feed.label` and three hints are exactly the
texts in the table above, in ja and en.

## Revises

SPEC-ADDON-088 I7. The shelves are drawn in the order Continue, Recommended, the addon
shelves by entry `priority` ascending, then New. An addon shelf's title is the entry's
translated label. **See all** on an addon shelf links to
`/drive/${encodeURIComponent(drive)}/apps/video/shelf?entry=${encodeURIComponent(entry.id)}`
when its entry has a page provider, otherwise to `/drive/${encodeURIComponent(drive)}/${href}`
when the entry declares `href`, and is absent otherwise.

SPEC-ADDON-088 I9. Each Media Import page provider returns only ids from its own lane
(`regular` or `feed`) for that drive, in that lane's order, after `restrict`. It is called
with or without a profile.

## Checked, no action

- **Watched dimming and progress on the core cards.** Deferred by the human in
  SPEC-CORE-078/079.
- **Keeping `slotProviders` beside the page providers.** The core never calls them for
  an entry that has a page provider, so they would be dead code.
- **Offset cursors.** Rejected. Feed rows arrive while a viewer scrolls, an offset would
  then repeat items, and the core ends the list at a page of repeats (SPEC-CORE-078).
- **No bound on reads per call.** Rejected. A narrow smart folder with a long lane would
  read the whole lane on every Discover visit. With 10 reads (600 rows) the measured lanes
  fit several times over. The cost is that a target matching nothing in the first 600 rows
  of a lane ends that list early.
- **Discover's 800 ms deadline.** A narrow target can make a provider call read more than
  once before it fills 12. A call that misses the deadline leaves the shelf out on that
  visit, and the stored answer draws it on the next visit that day (SPEC-CORE-076). This is
  accepted. The measured lanes fill 12 in one or two reads under the default target.
- **Relative dates ("3 days ago").** Not used. An absolute date stays true in a cached
  Discover shelf for the whole day, and the core's cache is keyed by date and locale.
- **Removing `offset` from `/watch`.** Not done. It costs nothing to keep, and a test or a
  script may still use it.
- **A design artifact for the tabless Media Import page.** Not made. The page is today's
  Manage view without the tab row above it, and nothing new is laid out. The human is asked
  to confirm at approval.
- **A link from the Media Import page to the video app.** Not added. The sidebar already
  has both entries, and the hints name the video app.
- **Add to collection and Open the source page from cards.** Gone with Watch. They remain
  on the file page.
- **The core spec's open finding TP-1** (an unlisted test file) belongs to PR #554 and is
  not handled here.
