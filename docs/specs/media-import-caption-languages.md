# Media Import: find a video's captions under its base language, and stop retrying videos that have none

SPEC-ID: SPEC-ADDON-165
SPEC-ID: SPEC-ADDON-166
SPEC-ID: SPEC-ADDON-167

Approval:

## Summary

Media Import saves a YouTube video's captions as a `.vtt` beside its `.loft`. Three
defects leave hundreds of imported videos without captions and retry them on every
backend start, without telling anyone why:

- A video whose language carries a region (`en-US`) asks yt-dlp for an `en-US` track.
  YouTube lists the automatic captions of such a video as `en` and `en-orig`, so nothing
  is written. On the production server this is 118 videos.
- A live stream's archive lists its chat replay as a subtitle named `live_chat`.
  `has_captions` is true whenever any subtitle or automatic caption is listed, so these
  videos count as having captions although they have none. Production: 334 videos, 329 of
  them from one channel, about 670 hours.
- When yt-dlp raises nothing and writes no file, the `.loft` fetch path records
  `caption_error_kind = NULL`. The subscription path records `no_transcript` for the
  same outcome, and the startup caption retry, which runs the fetch path, then erases it
  back to NULL. A NULL row with `has_captions` true is picked up by the next startup retry,
  so the same 452 videos are fetched again, 5 s apart, on every start.

After this change a video's captions are found under its base language and under the
`-orig` variant, a chat replay is not a caption, and "no caption file was produced" is
recorded as `no_transcript` on both paths and is not retried at startup. No
speech-to-text is started for subscription imports or startup retries; the owner decided
that captionless live archives stay untranscribed unless they ask for one.

SPEC-ADDON-165: caption language matching. SPEC-ADDON-166: a chat replay is not a
caption. SPEC-ADDON-167: the three caption outcomes are told apart, an empty result is
recorded as `no_transcript`, and it is not retried at startup.

## Required items

### 1. Normal flow

Both caption producers call the same two functions in
`addons/media_import/backend/service.py`: `_fetch_metadata_sync` (metadata, including
`has_captions` and `language`) and `_download_captions_sync` (writes the `.vtt`). The
subscription provider reaches them through `subscription/providers/youtube.py`'s
`_fetch_metadata_sync_for_provider` and `_download_captions_sync_for_provider`.

1. `.loft` fetch path (URL import, Refresh metadata, the caption badge's retry, the
   startup caption retry): `_fetch_and_update` fetches metadata, writes `loft_metadata`,
   and when `has_captions` is true downloads captions. On a successful download it emits
   `scan.complete` for the drive, which is how intelligence learns of the new `.vtt`.
2. Subscription path: `SubscriptionManager` imports a new item and, when `has_captions`
   is true or the subscription has `include_no_transcript`, calls the provider's
   `fetch_transcript`, which downloads captions and records the outcome with
   `update_caption_state`. The item is imported either way.

#### Language (SPEC-ADDON-165)

- The requested language `L` is the video's `language`, or `ja` when it is unknown, as
  today.
- The *base* of `L` is everything before its first hyphen (`en-US` → `en`, `es-419` →
  `es`, `zh-Hans` → `zh`). `L` without a hyphen has no separate base. Comparison is an
  exact string match against the keys YouTube lists; no case folding.
- Candidate keys, in this order, duplicates removed: `L`, `L-orig`, base, `base-orig`.
- `_download_captions_sync` extracts the video's information once, picks the first
  candidate key listed in either the manual subtitles (excluding `live_chat`) or the
  automatic captions, and then fetches that one key only. For the chosen key a manual
  subtitle is used when one is listed, otherwise the automatic caption.
- Exactly one track is fetched per attempt, so the number of YouTube requests per attempt
  is the same as today: one extraction and one subtitle fetch.
- When no candidate is listed, nothing is fetched and the outcome is "none" (below).

#### Chat replay (SPEC-ADDON-166)

`has_captions` is true only when YouTube lists at least one subtitle track other than
`live_chat`, or at least one automatic caption. A video whose only subtitle is `live_chat`
and which has no automatic captions has `has_captions = false`. The same rule decides
what counts as a manual subtitle in the key choice above.

#### Outcomes (SPEC-ADDON-167)

`_download_captions_sync` reports one of these outcomes, and both paths record them the
same way in `loft_metadata`:

| Outcome | When | `captions_downloaded` | `caption_error_kind` |
|---|---|---|---|
| saved | a track was fetched and moved into place | true | NULL |
| none | no candidate key is listed, or yt-dlp raised nothing and wrote no file | false | `no_transcript` |
| throttled | yt-dlp raised a throttling error (existing markers) | false | `rate_limited` |
| unavailable | yt-dlp raised an unavailability error (existing markers) | false | `permanent` |
| unclassified | yt-dlp raised an error matching no marker, or the `.loft`'s folder is missing | false | NULL |

- The fetch path, `_fetch_and_update`, writes the table's values. It no longer writes NULL
  for "none".
- The subscription path's `fetch_transcript` records "unclassified" as NULL instead of
  promoting it to `no_transcript`, and records "none" as `no_transcript` as it does today.
  Its `subscription_videos.error_kind` for the item follows the same value.
- The startup caption retry selects rows with `has_captions` true, `captions_downloaded`
  false, `caption_error_kind` NULL or `rate_limited`, on an active file (not trashed, not
  missing). It no longer selects `no_transcript`; it still skips `permanent`.

#### The existing rows

On the first backend start after deployment, the retry selects the 452 NULL rows once more
and runs the corrected code. A region-language video finds its captions. A
chat-replay-only video gets `has_captions` false and leaves the retry set. A video that
still produces nothing is recorded `no_transcript` and leaves the retry set.

Rows the old subscription path wrote as `no_transcript` after the last old-code start are
not NULL on that start and are not selected. The owner accepted this gap; see
`## Checked, no action` for how it is handled.

### 2. Failure cases

- Throttled during extraction or fetch: `rate_limited`, retried at the next start.
- Private, removed, region-locked: `permanent`, not retried at start.
- Unclassified error or missing `.loft` folder: NULL, retried at the next start, on both
  paths.
- The metadata fetch fails or returns nothing: `_fetch_and_update` returns early as
  today and the row keeps its previous values.
- Other languages are listed but no candidate key is (for example an unknown-language
  video whose only track is `en`): "none", `no_transcript`.
- yt-dlp leaves more than one file in the scratch directory despite one key requested:
  the file for the chosen key is kept; the scratch directory and everything else in it are
  discarded, as today.

### 3. States

Caption columns of `loft_metadata`, per `.loft`:

| State | `has_captions` | `captions_downloaded` | `caption_error_kind` | Startup retry selects |
|---|---|---|---|---|
| Not fetched (`fetched_at` NULL) | as the subscription import wrote it | false | NULL | only if `has_captions` true (as today) |
| Downloaded | true | true | NULL | no |
| YouTube has none | false | false | NULL | no |
| None, not attempted with captions listed | false | false | `no_transcript` | no |
| None | true | false | `no_transcript` | no (was: erased, then yes) |
| Throttled | true | false | `rate_limited` | yes |
| Unclassified | true | false | NULL | yes |
| Unavailable | true | false | `permanent` | no |

"None, not attempted with captions listed" is written by the subscription path when
`include_no_transcript` is on and the video has no captions.

Transitions:

- **Fetch path** (URL import, Refresh metadata, badge retry): from any state to the state
  of its new outcome, as today. A user action may re-check a `no_transcript` or
  `permanent` row.
- **Startup retry**: only from Not fetched (with `has_captions` true), Throttled and
  Unclassified, to the state of the new outcome. It never touches Downloaded, None,
  YouTube has none or Unavailable rows.
- **Subscription import**: writes the initial row for a newly imported item, then at most
  one outcome for it. A reused (already imported) item is not written.
- Not allowed: any path writing `caption_error_kind = NULL` for a "none" outcome; the
  startup retry writing to a row it did not select.

`subscription_videos` rows are written only by the subscription path, as described above.

### 4. Data read and written

- Core DB `loft_metadata`: read by the startup retry query; `has_captions`,
  `captions_downloaded`, `caption_error_kind` written by both paths, as today. No schema
  change.
- Core DB `subscription_videos.error_kind`: written by the subscription path at import,
  as today; the value for "unclassified" changes from `no_transcript` to NULL.
- `.vtt` beside the `.loft` on the drive: written when a track is saved, as today, via the
  same-filesystem scratch directory and `os.replace`.
- Intelligence `search.db`: not written by media_import; intelligence indexes the new
  `.vtt` files through its existing `scan.complete` handling.

### 5. External services

YouTube through yt-dlp: one information extraction and at most one subtitle fetch per
attempt, as today. Slow or throttled: classified as above. The first start after
deployment makes the same 452 attempts it already makes on every start; later starts
attempt only throttled, unclassified and not-fetched rows.

### 6. Authorization

None changes. The startup retry runs inside the backend; the fetch path's HTTP routes keep
their existing drive checks.

### 7. Effect on existing features

- **Speech-to-text, URL import in "If no captions" mode** (`_should_run_stt`,
  `missing_captions`): a chat-replay-only live archive imported by URL in this mode now
  has `has_captions` false, so STT runs for it, which is what the mode promises. "Use
  captions" and "Always" are unchanged. Subscription imports and the startup retry never
  start STT, before or after.
- **Subscription import**: a chat-replay-only item is no longer sent to
  `fetch_transcript` unless the subscription has `include_no_transcript`; it is imported
  either way and its `subscription_videos.error_kind` is NULL.
- **CaptionStatusBadge**: a chat-replay-only video now shows "YouTube has no captions"
  (not retryable) instead of "Caption download failed" (retryable). A `no_transcript` row
  with `has_captions` true shows "Caption download failed", retryable, as today.
- **Frontend type** `CaptionErrorKind` in `addons/media_import/frontend/api.ts` gains
  `"no_transcript"`, which the backend already returns for subscription rows. Rendering
  is unchanged: it falls through to "Caption download failed".
- **Intelligence**: region-language videos gain a `.vtt`, so their transcripts appear in
  search and Ask.
- **Videos whose exact language key is listed, including Japanese videos with a `ja`
  track**: the first candidate is `L`, so the same track as today is saved.

### 8. Error behavior

Nothing new is shown. The badge states are those in item 7. Logs: the existing
"Retrying caption download for N loft ref(s)" line now counts only the rows the new
query selects. No new log line.

### 9. User-visible behavior

- Region-language videos (on production: Samson Wrestle, Oscar Moves, Omi Claudio Bulos,
  and two others) get captions, and the player offers the track.
- Live archives with only a chat replay show "YouTube has no captions".
- Backend start no longer spends about 38 minutes re-fetching the same videos.

### 10. Non-functional

- No YouTube call is added on any path. The first start after deployment makes the same
  number of calls as today's starts, at the existing 5 s spacing.
- The first start emits about 118 `scan.complete` events, 5 s apart, one per newly saved
  `.vtt`. Intelligence handles each as an ordinary scan notification; at that spacing it
  is below the rate of a normal subscription sync.
- One `.vtt` per `.loft`, as today. No video or audio is downloaded by this change.
- No change to what is sent off the host.

### Premises about YouTube, and who checks them

YouTube and yt-dlp are in `agent_cannot_verify`; acceptance tests mock yt-dlp and only
confirm this spec's model of them. The model was measured on 2026-11-21 in the production
backend container's yt-dlp against 15 affected videos:

- 4 region-language (`en-US`) videos: no manual subtitles, automatic captions listed
  under `en` and `en-orig`, none under `en-US`.
- 11 unknown-language videos: all live archives (`was_live` true on the 10 where it was
  read), only `live_chat` in subtitles, no automatic captions.

After deployment the author runs, read-only on production: the caption state counts of the
452 rows after the first start, and the number in the next start's "Retrying caption
download" line, and reports them to the owner.

## Touch points

- `addons/media_import/backend/service.py`: `_fetch_metadata_sync` (`has_captions`),
  `_download_captions_sync` (key choice, single fetch, outcome), `_fetch_and_update`
  (recorded values per outcome), `_retry_failed_captions` (selection query).
- `addons/media_import/backend/subscription/providers/youtube.py`: `fetch_transcript`
  (recording of "none" and "unclassified") and the two `_for_provider` indirections.
- `addons/media_import/backend/subscription/manager.py` / `subscription/db.py`: read
  for the values they record; changed only if the outcome shape requires it.
- `addons/media_import/frontend/api.ts`: `CaptionErrorKind`.
- Core DB tables `loft_metadata` and `subscription_videos` (columns above). No schema
  change.
- The `.vtt` file beside each `.loft` on the drives.
- `scan.complete` emitted by the fetch path after a saved outcome (existing).
- `addons/media_import/backend/tests/`: new tests citing the SPEC-IDs; existing tests that
  assert today's behaviour change only where this spec changes it
  (`test_loft_caption_state.py` retry query and the `(False, None)` case,
  `test_nfc_names.py` "none" vs "raises").
- `docs/addons/media-import.md`: one sentence that a live stream's chat replay is not
  captions.
- Rules passed through: `.claude/rules/design-decisions.md` (no core-to-addon
  dependency; nothing in core changes). `.claude/rules/backend-conventions.md`, the
  prohibition on language-dependent rules: the key choice splits a BCP 47 tag at its first
  hyphen and appends YouTube's `-orig` suffix; it reads no language's vocabulary.
- Core repository: the submodule pointer bump of `addons/media_import`, this spec and its
  ledger rows. No protected path is edited.

## Invariants

I1. For a video whose language is `xx-YY`, when YouTube lists neither `xx-YY` nor `xx-YY-orig` but lists `xx` or `xx-orig`, the fetch path and the subscription path each save a `.vtt` beside the `.loft` and record `captions_downloaded` true with `caption_error_kind` NULL.
I2. Of the candidate keys listed, the one saved is the first in the order `L`, `L-orig`, base, `base-orig`; for that key a manual subtitle is saved over an automatic caption.
I3. An attempt fetches the subtitle track of exactly one key and leaves at most one `.vtt` beside the `.loft`, at the path it used before this change.
I4. A video whose only listed subtitle is `live_chat` and which has no automatic captions is recorded with `has_captions` false; a video that lists `live_chat` together with any other subtitle or any automatic caption is recorded with `has_captions` true.
I5. An attempt in which no candidate key is listed, or yt-dlp raises nothing and writes no file, is recorded `caption_error_kind = 'no_transcript'` by both paths, including when the startup retry runs it, and never as NULL.
I6. An error matching the throttling markers is recorded `rate_limited`, one matching the unavailability markers `permanent`, and any other raised error or a missing `.loft` folder NULL, by both paths.
I7. The startup caption retry re-attempts exactly the active-file rows with `has_captions` true, `captions_downloaded` false and `caption_error_kind` NULL or `rate_limited`, and writes to no other row.
I8. Neither a subscription import nor the startup caption retry starts speech-to-text for any video.
I9. A subscription item with `has_captions` false on a subscription without `include_no_transcript` is imported, and no caption fetch is attempted for it.
I10. The fetch path emits `scan.complete` for the drive after a saved outcome, and not after any other outcome.

## Checked, no action

- **Transcribing captionless live archives.** The owner decided against automatic STT
  (about 670 hours on the production Mac mini, while the frame-OCR backlog already needs
  about three weeks). Manual "Generate captions with speech-to-text" stays available per
  video. No per-subscription STT setting is added.
- **Rows the old subscription path wrote as `no_transcript` between the last old-code
  start and deployment.** Not handled in code: a one-off pass would need a marker for "ran
  once" for a window of hours. After deployment the author counts the rows with
  `has_captions` true, `captions_downloaded` false and `caption_error_kind =
  'no_transcript'` whose `fetched_at` is later than the last old-code start, and re-runs
  them through the existing badge retry endpoint. This is an operator step, decided by the
  owner with this spec.
- **Unknown language defaulting to `ja`.** A video with no `language` still asks for
  `ja` (now also `ja-orig`). For a non-Japanese video this can pick YouTube's machine
  translation into Japanese, or nothing. Changing the default is a separate decision and
  no production case needed it here.
- **Scripts and other multi-part tags.** `zh-Hans` falls back to `zh`, which YouTube may
  list for the other script; `sr-Latn-RS` falls back to `sr`. No production video has such
  a tag, and a wrong-script caption is still the video's language.
- **Case-insensitive matching.** `language` and the listed keys both come from the same
  yt-dlp extraction, so their case agrees.
- **`subscription_videos.error_kind` for the existing rows.** They keep what the
  subscription path recorded; only `loft_metadata` had been erased. No UI shows that
  column as caption state (the badge reads `loft_metadata`).
- **The 37 rows that are `no_transcript` in `subscription_videos` but downloaded in
  `loft_metadata`.** A later retry already succeeded for them.
- **A separate backfill or migration for the 452 rows.** The first startup retry after
  deployment re-runs exactly them through the corrected code.
- **Badge wording for `no_transcript`.** It keeps showing the retryable "Caption download
  failed"; the retry button is how the owner re-checks a video after YouTube adds
  captions.
- **Translated automatic captions (`en` → `ja` machine translations) as a fallback.** A
  machine translation is not the video's speech.
