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
  is written. On the production server this is 118 videos, all with automatic captions
  that YouTube serves.
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
recorded as `no_transcript` on both paths and is not retried at startup. The existing
452 rows are corrected by the first startup retry after deployment, with no separate
migration. No speech-to-text is started for subscription imports or startup retries; the
owner decided that captionless live archives stay untranscribed unless they ask for one.

SPEC-ADDON-165: caption language matching. SPEC-ADDON-166: a chat replay is not a
caption. SPEC-ADDON-167: an empty caption result is recorded as `no_transcript` and is not
retried at startup.

## Required items

### 1. Normal flow

Both caption producers call the same two functions in
`addons/media_import/backend/service.py`: `_fetch_metadata_sync` (metadata, including
`has_captions` and `language`) and `_download_captions_sync` (writes the `.vtt`). The
subscription provider reaches them through
`subscription/providers/youtube.py`'s `_fetch_metadata_sync_for_provider` and
`_download_captions_sync_for_provider`.

1. `.loft` fetch path (URL import, Refresh metadata, the caption badge's retry, the
   startup caption retry): `_fetch_and_update` fetches metadata, writes `loft_metadata`,
   and when `has_captions` is true downloads captions.
2. Subscription path: `SubscriptionManager` imports a new item and, when `has_captions`
   is true or the subscription has `include_no_transcript`, calls the provider's
   `fetch_transcript`, which downloads captions and records the outcome with
   `update_caption_state`.

Changes:

- **Language (SPEC-ADDON-165).** For a requested language `L` (the video's
  `language`, or `ja` when it is unknown, as today), the download accepts the first
  track YouTube lists under these keys, in this order, manual subtitles before automatic
  captions for each key: `L`, `L-orig`, then, when `L` has a region part (`xx-YY`), `xx`
  and `xx-orig`. Exactly one `.vtt` is saved, from the first key that exists.
- **Chat replay (SPEC-ADDON-166).** `has_captions` is true only when YouTube lists at
  least one subtitle track other than `live_chat`, or at least one automatic caption.
  A video whose only subtitle is `live_chat` and which has no automatic captions has
  `has_captions = false`.
- **Empty result (SPEC-ADDON-167).** When the download raises nothing and produces no
  file, the fetch path records `caption_error_kind = 'no_transcript'` (the subscription
  path already does). The startup caption retry selects rows with `has_captions` true,
  `captions_downloaded` false, and `caption_error_kind` NULL or `rate_limited`; it no
  longer selects `no_transcript` or `permanent`.

Effect on the existing rows, on the first backend start after deployment: the 452 rows
are NULL today, so the retry selects them once more and runs the corrected code. A
region-language video now finds its captions (`captions_downloaded` true, `scan.complete`
emitted, intelligence indexes the `.vtt`). A chat-replay-only video now has
`has_captions` false and leaves the retry set. A video that still produces no file is
recorded `no_transcript` and leaves the retry set.

### 2. Failure cases

- YouTube throttles a request during the download: yt-dlp raises, the message is
  classified as today (`rate_limited`), and the row stays in the retry set.
- A private, removed or region-locked video: classified `permanent` as today, not retried.
- An error yt-dlp raises that matches neither marker list: recorded NULL as today, and
  retried at the next start. Unchanged.
- The metadata fetch fails or returns nothing: `_fetch_and_update` returns early as
  today and the row keeps its previous values.
- None of the accepted keys is listed although other languages are (for example a video
  with unknown language whose only track is `en`): no file, recorded `no_transcript`.
- yt-dlp writes more than one file despite one key being requested: the first by the
  key order above is kept, the rest are discarded with the scratch directory.

### 3. States

`loft_metadata` caption columns, per `.loft`:

| State | `has_captions` | `captions_downloaded` | `caption_error_kind` | Startup retry |
|---|---|---|---|---|
| Not fetched | any | false | NULL, `fetched_at` NULL | not selected unless `has_captions` true |
| Downloaded | true | true | NULL | no |
| YouTube has none | false | false | NULL | no |
| Nothing produced | true | false | `no_transcript` | **no** (was: erased to NULL, then yes) |
| Throttled | true | false | `rate_limited` | yes |
| Unclassified error | true | false | NULL | yes |
| Unavailable | true | false | `permanent` | no |

Any fetch-path run (Refresh metadata, the badge's retry) can move a row from any state to
any other by its new outcome, as today. `subscription_videos` rows are not changed by
this spec.

### 4. Data read and written

- Core DB `loft_metadata`: read by the startup retry query; `has_captions`,
  `captions_downloaded`, `caption_error_kind` written by both paths, as today. No schema
  change.
- `.vtt` beside the `.loft` on the drive: written when a track is found, as today, via the
  same-filesystem scratch directory and `os.replace`.
- `subscription_videos`: not written by this change.
- Intelligence `search.db`: not written by media_import; intelligence indexes the new
  `.vtt` files through its existing `scan.complete` handling.

### 5. External services

YouTube through yt-dlp, unchanged in kind: one metadata extraction and one subtitle
download per attempt. Slow or throttled: classified as today. The first start after
deployment makes the same 452 attempts it already makes on every start; later starts
attempt only the throttled and unclassified rows.

### 6. Authorization

None changes. The startup retry runs inside the backend; the fetch path's HTTP routes keep
their existing drive checks.

### 7. Effect on existing features

- **Speech-to-text, URL import in "If no captions" mode** (`_should_run_stt`,
  `missing_captions`): a chat-replay-only live archive imported by URL in this mode now
  has `has_captions` false, so STT runs for it, which is what the mode promises. Imports
  in "Use captions" and "Always" are unchanged. Subscription imports and the startup
  retry never start STT, before or after.
- **Subscription import**: the transcript fetch is attempted when `has_captions` or
  `include_no_transcript`. A chat-replay-only item is no longer attempted unless the
  subscription has `include_no_transcript`; its `subscription_videos.error_kind` is then
  NULL instead of `no_transcript`. It is imported either way.
- **CaptionStatusBadge**: a chat-replay-only video now shows "YouTube has no captions"
  (not retryable) instead of "Caption download failed" (retryable). A `no_transcript`
  row with `has_captions` true shows "Caption download failed" as today; clicking it still
  re-runs the fetch path.
- **Intelligence**: region-language videos gain a `.vtt`, so their transcripts appear in
  search and Ask; their OCR / storyboard work is unaffected.
- **Videos in Japanese or with an exact language track**: the first accepted key is `L`,
  so the same track as today is saved.

### 8. Error behavior

Nothing new is shown. The badge states are those in item 7. Logs: the existing
"Retrying caption download for N loft ref(s)" line now counts only throttled and
unclassified rows. No new log line.

### 9. User-visible behavior

- Region-language videos (on production: Samson Wrestle, Oscar Moves, Omi Claudio Bulos,
  and two others) get captions, and the player offers the track.
- Live archives with only a chat replay show "YouTube has no captions".
- Backend start no longer spends about 38 minutes re-fetching the same videos.

### 10. Non-functional

- The first start after deployment makes the same number of YouTube calls as today's
  starts, at the existing 5 s spacing. No call is added on any path.
- One `.vtt` per `.loft`, as today. No video or audio is downloaded by this change.
- No change to what is sent off the host.

## Touch points

- `addons/media_import/backend/service.py`: `_fetch_metadata_sync` (`has_captions`),
  `_download_captions_sync` (accepted keys, choice of one file), `_fetch_and_update`
  (the recorded `caption_error_kind` for an empty result), `_retry_failed_captions`
  (the selection query).
- `addons/media_import/backend/subscription/providers/youtube.py`: reached through the
  two `_for_provider` indirections; `fetch_transcript`'s existing promotion of
  `(False, None)` to `no_transcript` stays.
- Core DB table `loft_metadata` (columns `has_captions`, `captions_downloaded`,
  `caption_error_kind`), written by both paths. No schema change.
- The `.vtt` file beside each `.loft` on the drives.
- `scan.complete` event emitted by the fetch path on a successful download (existing).
- `addons/media_import/backend/tests/`: new and updated tests citing the SPEC-IDs.
- `docs/addons/media-import.md`: one sentence that a live stream's chat replay is not
  captions.
- Rule passed through: `.claude/rules/design-decisions.md` (no core-to-addon dependency;
  nothing in core changes). `.claude/rules/backend-conventions.md` "LLM and string
  processing must not embed language-dependent rules": the language matching works on
  the structure of BCP 47 tags (`xx-YY` → `xx`) and YouTube's `-orig` suffix, not on any
  language's vocabulary.
- Core repository: the submodule pointer bump of `addons/media_import`, and this spec and
  its ledger rows. No protected path is edited.

## Invariants

I1. For a video whose language is `xx-YY`, when YouTube lists no `xx-YY` or `xx-YY-orig` track but lists `xx` or `xx-orig`, the fetch path and the subscription path each save a `.vtt` beside the `.loft` and record `captions_downloaded` true with `caption_error_kind` NULL.
I2. When a track under the video's exact language key exists, that track is the one saved, not the base-language or `-orig` track.
I3. A caption download leaves at most one `.vtt` beside the `.loft`, at the path it used before this change.
I4. A video whose only listed subtitle is `live_chat` and which has no automatic captions is recorded with `has_captions` false; a video that lists `live_chat` together with any other subtitle or any automatic caption is recorded with `has_captions` true.
I5. A caption download that raises nothing and produces no file is recorded as `caption_error_kind = 'no_transcript'` by the fetch path, including when the startup retry runs it; it is never written back as NULL.
I6. The startup caption retry re-attempts rows whose `caption_error_kind` is NULL or `rate_limited` and never re-attempts rows whose `caption_error_kind` is `no_transcript` or `permanent`, or whose `captions_downloaded` is true.
I7. A download that raises a throttling error is recorded `rate_limited`, and one that raises an unavailability error is recorded `permanent`, as before this change.
I8. Neither a subscription import nor the startup caption retry starts speech-to-text for any video.
I9. A video whose language is unknown, or whose exact language key is listed, gets the same `.vtt` as before this change.

## Checked, no action

- **Transcribing captionless live archives.** The owner decided against automatic STT
  (about 670 hours on the production Mac mini, while the frame-OCR backlog already needs
  about three weeks). Manual "Generate captions with speech-to-text" stays available per
  video. No per-subscription STT setting is added.
- **Unknown language defaulting to `ja`.** A video with no `language` still asks for
  `ja`; for a non-Japanese video this can pick YouTube's machine translation into
  Japanese, or nothing. Changing the default is a separate decision and no production
  case needed it here.
- **`subscription_videos.error_kind` for the existing 452 rows.** They keep
  `no_transcript`, which is what the subscription path recorded; only `loft_metadata`
  had been erased. Region-language videos that gain captions keep `no_transcript` there;
  that column is not shown as caption state anywhere (the badge reads `loft_metadata`).
- **The 37 rows that are `no_transcript` in `subscription_videos` but downloaded in
  `loft_metadata`.** A later retry already succeeded for them; nothing to change.
- **A separate backfill or migration for the existing rows.** The first startup retry
  after deployment re-runs exactly the affected rows through the corrected code, so a
  one-off script would duplicate it.
- **Badge wording for `no_transcript`.** It keeps showing the retryable "Caption download
  failed"; the retry button is how the owner re-checks a video after YouTube adds
  captions, so making it non-retryable would remove that.
- **Translated automatic captions (`en` → `ja` machine translations).** Not added as a
  fallback: a machine translation is not the video's speech.
