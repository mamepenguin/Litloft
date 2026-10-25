# Media Import: unavailable items, automatic retry, and titles for failed items

SPEC-ID: SPEC-ADDON-027
SPEC-ID: SPEC-ADDON-028
SPEC-ID: SPEC-ADDON-029

Approval:

## Summary

Subscription items in Media Import (`addons/media_import`) that fail to import all end up
as `error_kind = 'fetch_failed'`, which marks the subscription "要対応" (Needs attention)
until the user retries or ignores each one, and the row shows no title. On production
(2026-10-25) there were 108 such rows. Fetching each one again found 69 that now import
fine (mostly whole batches of one channel's bulk uploads; the container logs that would
say why were gone, and yt-dlp's session rate-limit message is the likeliest cause, see
section 5), 30 that cannot be fetched without an account (20 members-only, 9
age-restricted, 7 "This video is not available" that are, judging by their titles, also
members-only), and 3 live events that had not started yet. This change does three things
for the person who runs Litloft:

- **SPEC-ADDON-027**: a fetch that fails because the video is members-only, age-restricted,
  private, removed or otherwise unavailable is recorded as `permanent` (取得不可). It is
  shown, does not count toward Needs attention and is not retried automatically.
- **SPEC-ADDON-028**: a fetch that fails because the live event or premiere has not
  started yet, or for an unclassified reason, is retried on later syncs. Only an
  unclassified failure on three attempts in a row becomes Needs attention. A rate limit
  stops the sync's item attempts without counting against any item.
- **SPEC-ADDON-029**: every subscription item stores the title and publish date the
  listing gave it, so a failed item shows its title, and each item carries a link to the
  video on the provider.

Signing in to YouTube (cookies) so that age-restricted or members-only videos can be
fetched is out of scope.

## Required items

### 1. Normal flow

A sync (cron, manual, initial or backfill; `SubscriptionManager._sync_diff`):

1. The provider lists the source's items (`list_items` → `ItemHeader` with `item_id`,
   `title`, `published_at`). Unchanged.
2. The **retry set** is read now, before any item is attempted: every row of this
   subscription in the retry-pending or upcoming state (section 3), ordered by
   `first_seen_at` ascending, then `rowid` ascending (rows of one sync share a
   `first_seen_at`; `rowid` is their insertion order). Rows created later in this sync
   are not in it.
3. For every listed item that already has a row, a NULL stored title is set to the
   header's title when that is non-empty, and a NULL stored publish date is set to the
   header's date, each independently. A stored value is never overwritten.
   `last_attempted_at` is not changed by this.
4. New items (not yet in `subscription_videos`) are attempted in listing order, as today.
   Each new row is written with the header's title and publish date as the listing gave
   them (no format conversion), except that an empty or whitespace-only title is stored
   as NULL.
5. Then each row in the retry set is attempted, whether or not the item is still in the
   listing.
6. Every attempt goes through the same per-item import as today (dedup lookup first; a
   reused file is not a network attempt) and ends in one outcome, recorded on the row with
   `last_attempted_at = now`:
   - **imported**: `status = 'imported'`, `file_id` set, `fail_count = 0`, caption
     sub-outcome in `error_kind` as today.
   - **unavailable**: `status = 'failed'`, `error_kind = 'permanent'`, `fail_count = 0`.
   - **not started**: `status = 'failed'`, `error_kind = 'upcoming'`, `fail_count = 0`.
   - **rate limited**: the row is not changed (an existing row keeps state, `fail_count`
     and `last_attempted_at`); the sync stops attempting (step 7).
   - **other failure**: `fail_count` increases by one. Below 3 the row is
     `error_kind = 'retry_pending'`; at 3 or more it is `error_kind = 'fetch_failed'`
     (Needs attention).
   "Three in a row" therefore means three other failures with no imported, unavailable
   or not-started outcome between them.
7. After a rate-limited attempt the sync attempts no further item. Every listed new item
   that has no row yet (the rate-limited one included) gets a row in retry-pending with
   `fail_count = 0`, its header title (empty stored as NULL) and publish date, this
   sync's `first_seen_at`, and `last_attempted_at` NULL. Rows in the retry set
   are left as they are. The sync still completes normally (`last_synced_at` set,
   `cooldown_until` cleared), because the listing succeeded.
8. The provider's `inter_item_delay_seconds` (YouTube: 3 s) is slept after every attempt
   that was not a dedup reuse, whatever its outcome (imported, unavailable, not started,
   other failure), before the next attempt; nothing is slept after the last attempt or
   after a rate-limited one, since the sync stops. The step-9 title lookup runs right
   after the attempt it belongs to, before that sleep. Today the sleep follows only a
   success.
9. After an unavailable, not-started or other-failure outcome that leaves the row's title
   NULL, the provider is asked for the item's title alone (YouTube: oEmbed). A non-empty,
   non-whitespace answer is stored; anything else leaves NULL, and the lookup is made
   again on the row's next failed attempt. No lookup follows a rate-limited outcome, and
   none is made for rows step 7 creates.
10. A manual **Retry** on one item (`_sync_single_item`) uses the outcome rules of step 6
    and step 9 unchanged, whatever state the row was in: an other failure gives
    `fail_count + 1`, `retry_pending` below 3 and `fetch_failed` at 3 or more. A
    rate-limited manual Retry changes nothing on the row. A needs-attention row with
    `fail_count` below 2 (for example a legacy `path_conflict` or `rate_limited` row, or
    one resolve-conflict reset to NULL) therefore goes to retry-pending after one failed
    manual Retry and is retried automatically from then on; this is intended. The Retry
    endpoint (`POST …/videos/{item_id}/retry`) answers 409 with detail
    `video is not retryable` for an imported or skipped row and enqueues nothing; the
    panel shows that detail in its existing error line, as it does for any Retry error
    today. An unavailable row is accepted (Q1). resolve-conflict is unchanged and does not
    touch `fail_count`.

The sync result (`_sync_blocking`'s dict, broadcast as
`media_import.subscription.sync_completed`) keeps `added`, `reused`, `failed`,
`total_new` and adds two fields:

- `added` / `reused`: imports from new items and from the retry set together.
- `failed`: attempts in this sync that ended unavailable, not started or other failure.
- `total_new`: listed items that had no row before this sync (unchanged meaning).
- `retried` (new, int): rows of the retry set whose attempt ended in an outcome other
  than rate limited.
- `rate_limited` (new, bool): whether the sync stopped on a rate limit.

The single-item retry result, per outcome:

| Outcome | added | reused | failed | total_new | retried | rate_limited |
|---|---|---|---|---|---|---|
| imported, new file | 1 | 0 | 0 | 1 | 1 | false |
| imported, dedup reuse | 0 | 1 | 0 | 1 | 1 | false |
| unavailable / not started / other failure | 0 | 0 | 1 | 0 | 1 | false |
| rate limited | 0 | 0 | 0 | 0 | 0 | true |

Upgrade: `CREATE TABLE subscription_videos` carries the three new columns, so a fresh
install has them and moves nothing. On an existing table, `_ensure_subscription_tables`
checks `PRAGMA table_info(subscription_videos)`. When `fail_count` is absent, it adds
`fail_count`, `title` and `published_at`, and moves every row with `status = 'failed'`
and `error_kind` `fetch_failed` or NULL to retry-pending with `fail_count = 0`, inside
one explicit `BEGIN` … `COMMIT` on the raw DB-API connection. The explicit `BEGIN` is
required: the sqlite3 driver opens its implicit transaction only before DML, so an
`ALTER TABLE` through the ordinary session commits on its own and would survive a failed
move (the core's own table rebuild in `backend/app/database.py` uses the same explicit
`BEGIN`). If anything in it fails the transaction is rolled back, so neither the column
nor the move remains, and the exception propagates out of `_ensure_subscription_tables`;
the next startup tries the whole step again. When `fail_count` is present nothing is
moved. (`title` / `published_at` are added on their own if missing, without a move.)

### 2. Failure cases

- Listing fails: unchanged (the sync raises; cron backoff applies; no row changes).
- The per-item fetch raises: classified by the provider (section 5), recorded per step 6.
- The message matches no marker: other failure — retried, then Needs attention after
  three in a row. A reworded message degrades to that, never to `permanent`.
- A failure after the fetch (path allocation, `.loft` write, `register_loft`): other
  failure; the `.loft` cleanup on `register_loft` failure is unchanged.
- The title lookup fails, times out or answers empty: title stays NULL; nothing else
  changes and the sync continues.
- Writing the row fails: logged and swallowed, as today (`_record_video_safe`).
- The upgrade transaction fails: rolled back, and the exception propagates from
  `_ensure_subscription_tables`, as a failure to create the tables does today. The core's
  lifespan catches it and logs `Addon startup failed: …` with the traceback. The rest of
  the addon's startup is skipped, so the subscription worker, the scheduler and the
  single-URL import worker do not run, and the subscription endpoints that read the new
  columns answer 500 until a restart succeeds. This is today's behavior for a failed
  table setup and is accepted under the personal-tool premise: the operator sees the log
  line and restarts.

### 3. States

A `subscription_videos` row (`status`, `error_kind`). Only `status = 'failed'` rows are
classified by `error_kind`; an imported row's `error_kind` is its caption outcome and
never puts it in another state.

| State | status | error_kind | Needs attention | Retried automatically | Retry button |
|---|---|---|---|---|---|
| imported | imported | NULL / caption kind | no | no | no |
| retry-pending | failed | `retry_pending` | no | yes, next sync | yes |
| upcoming | failed | `upcoming` | no | yes, next sync | yes |
| needs attention | failed | `fetch_failed`, `rate_limited`, `path_conflict`, NULL, any other value | yes | no | as today |
| unavailable | failed | `permanent` | no | no | yes (Q1) |
| skipped | failed | `dismissed` | no | no | no |

Transitions (outcome names from step 6):

- (new) → imported / unavailable / upcoming / retry-pending (`fail_count = 1`).
- (new) → retry-pending (`fail_count = 0`, `last_attempted_at` NULL): rate-limited, or
  not attempted because an earlier attempt in the sync was rate limited.
- retry-pending, upcoming → imported / unavailable / upcoming (`fail_count = 0`), or other
  failure: retry-pending while `fail_count + 1 < 3`, needs attention when it reaches 3.
  From upcoming the count is 0, so an other failure gives retry-pending with 1.
- Manual Retry, from needs attention, unavailable, retry-pending or upcoming: imported /
  unavailable / upcoming (`fail_count = 0`), or other failure with `fail_count + 1`
  (`fetch_failed` at 3 or more, `retry_pending` below). So unavailable → retry-pending
  (`fail_count = 1`) on an other failure. A rate-limited manual Retry leaves the row
  unchanged.
- any failed state except skipped → skipped (Ignore), as today.
- Forbidden: skipped → any other state; imported → any failed state through Retry (the
  endpoint answers 409 for both); unavailable → an automatic attempt; any state → any
  other state by a rate-limited attempt.
- A rate-limited attempt is not a transition. Subscription deletion removes every row
  (CASCADE), as today.

### 4. Data read and written

- `subscription_videos` (core SQLite DB, table owned by the addon): new columns
  `fail_count INTEGER NOT NULL DEFAULT 0`, `title TEXT`, `published_at TEXT`. New
  `error_kind` values `retry_pending`, `upcoming` (no CHECK constraint). Written by sync
  and retry; read by the items list, the dashboard summary and the attention counts.
- `loft_metadata`, `files`, `.loft` files, `.vtt` sidecars, thumbnails: written exactly
  as today on a successful import; not written on a failure.
- `subscriptions`: `last_synced_at` / `cooldown_until` written as today.

### 5. External services

- YouTube via yt-dlp (`fetch_item` → `_fetch_metadata_sync`): the YouTube provider
  classifies the exception message, checking the groups **in this order**, first match
  wins. Before matching, the message (`str(exc)`) has U+2018 / U+2019 replaced by `'`,
  because YouTube's playability reasons, which yt-dlp passes through, may use the
  typographic apostrophe. A marker then matches when it is a case-insensitive substring
  of the whole message; none of the markers can occur inside an 11-character video id,
  because each contains a space or a character an id cannot hold. The bot-check text was
  read from the extractor, not observed. Messages were measured on production on
  2026-10-25 with yt-dlp 2026.10.21, and
  the rate-limit texts were read from that version's YouTube extractor
  (`extractor/youtube/_video.py`):
  1. rate limited: `try again later`, `rate-limited`, `captcha`,
     `confirm you're not a bot`, `HTTP Error 429`, `Too Many Requests`. yt-dlp reports YouTube's
     session limit as `Video unavailable. This content isn't available, try again
     later. The current session has been rate-limited by YouTube for up to an hour…`,
     which is why this group goes before the `Video unavailable` marker.
  2. unavailable: `members-only content`, `available to this channel's members`,
     `confirm your age`, `This video is not available`, `Video unavailable`,
     `Private video`, `This video has been removed`, `not available in your country`.
  3. not started: `This live event will begin`, `Premieres in`.
  4. anything else: other failure.
  The age gate (`Sign in to confirm your age`) matches no rate-limit marker, so it is
  unavailable.
- The classification is exposed as typed exceptions in `registry.py`
  (`ItemUnavailable`, `ItemNotStarted`, `ItemRateLimited`) raised by `fetch_item`, so the
  manager does not read provider text.
- YouTube oEmbed (`https://www.youtube.com/oembed?format=json&url=…watch?v=<id>`), title
  only, through the provider's existing YouTube-only opener, 10-second timeout.
  Measured: 200 with a title for all 27 members-only / age-restricted / unavailable
  videos; 200 with an empty title for the 3 upcoming ones (treated as no answer).
- A provider without a title lookup returns None; one without an item URL returns None.

### 6. Authorization

Unchanged. The items list, Retry and Ignore keep `_scoped_drive` +
`_load_owned_subscription`. The new fields are returned only through the existing items
endpoint.

### 7. Effect on existing features

- **Needs attention** is counted in five places, all moving to the state table's
  definition (`status = 'failed'` and `error_kind` not in `retry_pending`, `upcoming`,
  `permanent`, `dismissed`): `subdb.summary_for_drive` (`failed_count`,
  `attention_subscription_ids`), the dashboard's `summariseVideos`, the card failed count
  that reads it, `SubscriptionStatusPill.deriveStatus` (through that count), and the
  detail panel's 要対応 group. The frontend predicate lives once, in
  `lib/errorMessages.ts`.
- **`isRetryable`**: `retry_pending`, `upcoming` retryable; `permanent` retryable on a failed row (Q1).
- **resolve-conflict / dismiss**: unchanged. resolve-conflict's rename sets
  `error_kind = NULL` and enqueues a retry; that row is needs attention, and the upgrade
  move only runs on the startup that adds the column, so it cannot catch it later.
- **Backfill** (`count_seen_item_ids`): unchanged; the new states are rows.
- **Dedup**: an attempt from the retry set still goes through `lookup_dedup`, so an item
  whose `.loft` exists is reused, not written a second time.
- **Worker**: one job at a time, as today. A long first sync after upgrade delays other
  subscriptions' cron and a manual Retry during it returns `already_queued` (today's
  behavior, more likely during that one sync).
- **Single-URL import**, **caption classification** (`_classify_caption_error`),
  **Watch surface / activity feed**: not changed.

### 8. Error behavior

- The user sees each failed item with its title (or 未取得の動画), its state label and
  hint (section 9) and a link to the video.
- Logged: each classified fetch failure at WARNING with subscription id, item id and
  outcome; an other failure keeps today's `logger.exception`. A rate-limit stop logs at
  WARNING with how many items were left for the next sync. The upgrade logs how many rows
  it moved at INFO, or the exception if it rolled back.
- A rate-limited sync or manual Retry shows the one-line notice of Q3 in an open detail
  panel of that subscription.

### 9. User-visible behavior

Items endpoint (`GET /subscriptions/{id}/videos`, `SubscriptionVideoResponse` /
`SubscriptionVideo` in `api.ts`):

- `title`: the imported file's name without `.loft`, else the stored title, else null.
  This applies to every row, imported ones included (an imported row whose file was
  deleted then shows its stored title).
- `source_url` (new, `string | null`): the provider's URL for the item
  (`https://www.youtube.com/watch?v=<item_id>`) for every row.
- `published_at`: unchanged, from `loft_metadata` only; the stored column is not read.

Subscription detail panel, items section, in this order:

Colour tokens (`DESIGN.md`, `globals.css` `@theme inline`; all already used in these
files): amber heading `text-accent-amber`, muted heading `text-text-muted` (as the
imported group's), red pill `bg-danger/10 text-danger` (today's failed pill), amber pill
`bg-accent-amber/15 text-accent-amber` (today's pending pill), gray pill
`bg-bg-elevated text-text-muted`.

1. **要対応 (n)** — Needs attention rows, as today (heading amber, pill red, Retry /
   Ignore / resolve conflict as today).
2. **再試行待ち (n)** — retry-pending and upcoming rows. Heading muted. Pill amber.
   retry-pending: label `再試行待ち`, hint `次回の同期で自動的に再試行します。`.
   upcoming: label `配信前`, hint `配信・プレミア公開が始まったら取り込みます。`.
   Retry and Ignore buttons.
3. **取得不可 (n)** — unavailable rows. Heading muted. Pill muted (gray). Label
   `取得不可`, hint `メンバー限定・年齢制限・非公開・削除などで取得できません。` (replaces
   today's `非公開・削除・地域制限の可能性があります。`). Retry and Ignore buttons (Q1).
4. **取り込み済み (n)** and **スキップ済み (n)** — unchanged (skipped rows are a count
   only, not rendered as rows).

English: `Retrying` / `Will be tried again on the next sync.`; `Not started` / `Will be
imported once the live stream or premiere starts.`; `Unavailable` / `Members-only,
age-restricted, private or removed; cannot be fetched.`; group headings
`Retrying ({count})`, `Unavailable ({count})`.

Every row in groups 1–3 shows `title` or the placeholder, and an icon button
(`ExternalLink`, the icon imported rows already use) labelled `元のページを開く` /
`Open the source page` that opens `source_url` in a new tab
(`rel="noopener noreferrer"`). Imported rows keep their existing open-file button and get
no source link. The stored publish date is not displayed.

The dashboard's Needs attention filter, summary (N 件が要対応), status pill and card
failed count count only group 1. A subscription whose failures are all retry-pending,
upcoming or unavailable shows as 正常, or paused / syncing as today.

After upgrading, the first sync of each subscription takes longer while it re-attempts
the existing failed rows (about 48 rows for the largest subscription on production, 3 s
apart, a few minutes).

`docs/addons/media-import.md` gains a short paragraph: members-only, age-restricted and
removed videos are listed as unavailable and not retried; other failures are retried on
the next syncs and appear under Needs attention after three failures in a row; a sync
that YouTube rate-limits stops and resumes on the next one.

### 10. Non-functional

- One yt-dlp metadata call per attempted row per sync, 3 s apart. No cap on retries per
  sync.
- At most one oEmbed request per failed attempt whose row has no title.
- The marker test reads the provider's own error text, not content language: yt-dlp's
  English `ExtractorError` messages, measured on 2026-10-25 for videos on Japanese,
  Korean and English channels. An unmatched message falls to the retried path, which is
  today's outcome plus retries (`.claude/rules/backend-conventions.md`, Prohibitions,
  conditions 1–3).
- No new dependency.

## Touch points

- `addons/media_import/backend/subscription/manager.py` — `_sync_diff`,
  `_sync_single_item`, `_record_video_safe`, retry pass, rate-limit stop, delay, sync
  result fields.
- `addons/media_import/backend/subscription/db.py` — `upsert_video_row` (new columns),
  `summary_for_drive` (attention predicate), queries for the retry set and the title fill.
- `addons/media_import/backend/subscription/registry.py` — error kinds `retry_pending`,
  `upcoming`; exceptions `ItemUnavailable`, `ItemNotStarted`, `ItemRateLimited`; provider
  methods for the title lookup and the item URL.
- `addons/media_import/backend/subscription/providers/youtube.py` — classification in
  `fetch_item`, oEmbed lookup, item URL.
- `addons/media_import/backend/service.py` — `_ensure_subscription_tables` (three
  `ALTER TABLE subscription_videos ADD COLUMN`, the one-time move).
- `addons/media_import/backend/router.py`, `schemas.py` — items endpoint `title` fallback
  and `source_url`; Retry endpoint 409 for imported and skipped rows; sync result fields.
- `addons/media_import/frontend/lib/errorMessages.ts` — new kinds, retryability, the
  shared Needs attention predicate.
- `addons/media_import/frontend/SubscriptionDetailPanel.tsx`, `SubscriptionItemRow.tsx`,
  `SubscriptionsDashboard.tsx`, `api.ts`.
- `addons/media_import/frontend/messages/ja.json`, `en.json`.
- `addons/media_import/backend/tests/`, frontend tests next to the components.
- `docs/addons/media-import.md` (core repo).
- The detail panel's `sync_completed` handler (rate-limit notice, Q3).
- `addons/media_import` submodule pointer in the core repo.
- Rules passed through: `.claude/rules/backend-conventions.md` (Prohibitions),
  `.claude/rules/frontend-conventions.md` (addon translation keys stay in the addon;
  `DESIGN.md` colour tokens), `.claude/rules/design-decisions.md` (no core code for an
  addon). No protected path is edited. The `ALTER TABLE` makes the change schema (HIGH)
  by `risk-zones.conf`.

## Invariants

I1. A fetch whose message matches a rate-limit marker is never recorded as `permanent`, even when it also contains `Video unavailable`; a message matching an unavailable marker and no rate-limit marker leaves the row `failed` / `permanent`.
I2. A `permanent` row is not attempted by a later sync but is accepted by a manual Retry, while a Retry on an imported or skipped row answers 409 and enqueues no job.
I3. A message matching no marker is never recorded as `permanent`; the row becomes `fetch_failed` exactly on the third other failure in a row and is `retry_pending` before that, and an imported, unavailable or not-started outcome resets `fail_count` to 0.
I4. Every row in the retry-pending or upcoming state when a sync starts is attempted by that sync unless a rate limit stops it, whether or not the listing still contains it, and counts in the result's `retried`; a row created during a sync is attempted at most once in it; and the provider's inter-item delay is slept after every attempt that was not a dedup reuse, failed ones included, and never after a dedup reuse.
I5. A rate-limited attempt, in a sync or a manual Retry, changes no existing row, makes the result's `rate_limited` true and shows the rate-limit notice in that subscription's open detail panel; after it the sync makes no further fetch or title request, and every listed new item has a row.
I6. The Needs attention predicate is the same in `summary_for_drive`, the dashboard summary, the card failed count, the status pill and the detail panel group: a failed row with `error_kind` `retry_pending`, `upcoming`, `permanent` or `dismissed` is excluded everywhere, every other failed row is included, and an imported row is never included.
I7. An empty or whitespace title is stored as NULL; a NULL stored title is filled from a non-empty listing title; a stored title is never replaced by NULL, by an empty string or by a later listing; and a failed or empty title lookup changes nothing else on the row or in the sync.
I8. Every item row returned by the items endpoint carries `source_url`; every row in the 要対応, 再試行待ち and 取得不可 groups shows its stored title when no imported file supplies one, links to `source_url`, and shows Ignore and Retry (resolve conflict in place of Retry for a `path_conflict` row).
I9. The upgrade move runs only on the startup that adds `fail_count`, changes only `failed` rows whose `error_kind` is `fetch_failed` or NULL, and is rolled back together with the column if it fails; adding a missing `title` or `published_at` alone moves no row.
I10. A successful import writes the same `.loft`, `files`, `loft_metadata`, thumbnail and caption state as before this change, whether it came from a new item, the retry set or a manual Retry, and an item whose `.loft` already exists is reused rather than written again.

## Questions decided at approval

The human accepted the recommended answer to each on 2026-10-25.

- **Q1. Does an unavailable row keep a manual Retry?** Recommended: yes. The row stays out
  of Needs attention and is never retried automatically, but a Retry button is shown and
  the endpoint accepts it, with the outcomes of step 6. A misclassification can then be
  undone from the UI. `isRetryable('permanent')` becomes true for failed rows.
- **Q2. One item rate limited on every attempt**: accepted, as stated in Checked, no
  action.
- **Q3. Feedback for a rate-limited manual Retry.** Recommended: when the detail panel
  receives `media_import.subscription.sync_completed` for its subscription with
  `rate_limited: true`, it shows one line above the items,
  `YouTube に一時的に制限されています。しばらくしてから再試行してください。` /
  `YouTube is limiting requests for now. Try again later.`, in the panel's existing
  error-text style, until the next `sync_completed` without it or the panel closes.
  This applies to a sync's stop too.

## Checked, no action

- **Signing in to YouTube for age-restricted / members-only videos**: out of scope (the
  user asked to treat it separately).
- **Caption error classification** (`_PERMANENT_MARKERS` in `service.py`): reached only
  after the metadata fetch succeeded; left unchanged, and the item classifier does not
  share its list (its `Premieres in` means permanent for captions).
- **Auto-retrying Needs attention rows**: not done. After three failures in a row the row
  stops costing a request per sync and asks the user; a manual Retry still works.
- **A cap on retries per sync**: not added. The largest backlog measured is about 48 rows
  for one subscription, a few minutes of one sync, once; a rate limit stops it early.
- **Why the 69 now-fetchable rows failed**: not recoverable (logs gone). The design does
  not depend on the cause: a rate limit is now recognised and anything unclassified is
  retried.
- **Displaying the stored publish date**: stored as the listing gave it, not displayed.
- **A Design Artifact for the new groups**: the panel gains two groups built from the
  existing group heading and `SubscriptionItemRow`, with an icon button the row already
  uses; no new component or layout.
- **Upcoming items scheduled far ahead**: retried every sync (one request per cooldown
  interval) until they air or become unavailable.
- **Reporting the rate-limit stop outside an open detail panel** (dashboard, card): not
  done; the rows it leaves show as 再試行待ち, and the panel notice is Q3.
- **One item that is rate limited on every attempt** (Q2): it would stop every sync at
  that item and never reach Needs attention. The rate-limit markers are yt-dlp's
  session-level messages, so this needs YouTube to throttle one video and not the
  session; accepted.
- **yt-dlp placeholder titles** (`[Private video]`, `[Deleted video]` in playlist
  listings): stored and shown as given; they describe the item, and oEmbed would fail
  for such an item anyway.
- **The sync result's changed `failed` meaning**: nothing in the frontend reads it; the
  backend tests that assert it change with the spec.
- **Single-URL import failures**: a different flow with its own error display.
