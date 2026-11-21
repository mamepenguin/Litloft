# Media Import: choose a video's caption track from its metadata, and stop counting a chat replay as captions

SPEC-ID: SPEC-ADDON-165
SPEC-ID: SPEC-ADDON-166
SPEC-ID: SPEC-ADDON-167

Approval:

## Summary

Media Import saves a YouTube video's captions as a `.vtt` beside its `.loft`. On the
production server 452 imported videos have none, and the backend re-fetches every one of
them, 5 s apart, on each start:

- 118 videos have a language with a region (`en-US`). The importer asks yt-dlp for an
  `en-US` track; YouTube lists their automatic captions as `en` and `en-orig`, so nothing
  is written.
- 334 videos are live-stream archives whose only listed subtitle is the chat replay,
  `live_chat`. `has_captions` is true whenever any subtitle is listed, so they count as
  having captions, the download asks for `ja`, and nothing is written.

Both are rows with `has_captions` true and no `.vtt`, which is exactly what the startup
caption retry selects, so they are retried forever.

After this change the importer picks the caption track from the metadata it already
fetches: the video's language, its `-orig` variant, then the base language and its
`-orig` variant. `has_captions` means "a track the importer will use is listed". The
download asks for that one track. A video with no usable track has `has_captions` false,
shows "YouTube has no captions", and leaves the retry set. A video whose metadata
extraction fails as private or removed is recorded `permanent` and leaves it too. No
speech-to-text is started for subscription imports or startup retries; the owner decided
that captionless live archives stay untranscribed unless they ask for one.

SPEC-ADDON-165: the caption track is chosen from the metadata by language.
SPEC-ADDON-166: `has_captions` is true only when a chosen track exists; a chat replay is
never chosen. SPEC-ADDON-167: on the fetch path, a metadata extraction that fails as
unavailable is recorded `permanent`.

## Required items

### 1. Normal flow

Two paths produce captions. Both use `_fetch_metadata_sync` and `_download_captions_sync`
in `addons/media_import/backend/service.py`; the subscription provider reaches them through
the `_for_provider` indirections in `subscription/providers/youtube.py`. Each attempt makes
two yt-dlp extractions, as today: one for the metadata and one inside the caption download.

1. `.loft` fetch path (URL import, Refresh metadata, the caption badge's retry, the
   startup caption retry): `_fetch_and_update` fetches metadata, writes `loft_metadata`,
   and when `has_captions` is true calls `_download_captions_sync`.
2. Subscription path: `SubscriptionManager` imports a new item and, when `has_captions`
   is true or the subscription has `include_no_transcript`, calls the provider's
   `fetch_transcript`. The item is imported either way.

#### Track choice (SPEC-ADDON-165)

`_fetch_metadata_sync` adds one value to what it returns, `caption_track`, computed from the
same extraction's `subtitles` and `automatic_captions`:

- `L` is the video's `language`, or `ja` when it is unknown, as today.
- The base of `L` is the part before its first hyphen (`en-US` → `en`, `es-419` → `es`).
  `L` without a hyphen has no separate base.
- Candidates, in order, duplicates removed: `L`, `L-orig`, base, `base-orig`.
- `caption_track` is the first candidate listed as a key of `subtitles` (other than
  `live_chat`) or of `automatic_captions`; `None` when no candidate is listed.
- Keys are compared as exact strings.

Both paths pass `caption_track` to the caption download as the language it requests,
in place of the video's language:

- fetch path: `_fetch_and_update` passes `meta["caption_track"]`;
- subscription path: `ItemMetadata` gains `caption_track`, and `SubscriptionManager`
  passes it to `fetch_transcript` as `language`.

`_download_captions_sync` itself is unchanged: it requests `subtitleslangs: [<that
value>]`, yt-dlp writes the manual subtitle for that key when one is listed and otherwise
the automatic caption, and `_dedup_rolling_vtt` runs on the saved file as today. When a
subscription with `include_no_transcript` attempts a video with `caption_track` `None`,
the request falls back to `ja`, as it does today for an unknown language.

#### Has captions (SPEC-ADDON-166)

`has_captions` is `caption_track is not None`. Consequences:

- A live archive whose only subtitle is `live_chat` and which has no automatic captions
  has `has_captions` false.
- A video whose listed tracks are all in other languages than the candidates (for example
  language `en`, only `en-GB` listed) has `has_captions` false.
- Every video that today gets a `.vtt` still has a candidate listed, because today's
  request is `L` and `L` is the first candidate.

#### Unavailable at metadata (SPEC-ADDON-167)

When `_fetch_metadata_sync` raises in `_fetch_and_update` and the message classifies as
`permanent` under the existing markers (`_classify_caption_error`), the fetch path sets
`loft_metadata.caption_error_kind = 'permanent'` for that file before the error propagates
as today (logged by `_worker`). No other column is written. Any other metadata error
writes nothing, as today.

#### The existing rows

The startup retry query is unchanged: `has_captions` true, `captions_downloaded` false,
`caption_error_kind` not `permanent`, active file. On the first start after deployment it
selects the 452 rows once more and runs the corrected fetch path:

- a region-language video gets `caption_track` `en` or `en-orig` and a `.vtt`;
- a chat-replay-only video gets `has_captions` false and leaves the retry set;
- a video that has gone private or been removed gets `permanent` and leaves the retry set.

Rows the subscription path wrote between the last old-code start and deployment are
selected too, because the query does not exclude `no_transcript`.

### 2. Failure cases

- Metadata extraction raises a throttling or unclassified error: nothing written, as
  today; the row stays selected and is tried at the next start.
- Metadata extraction raises an unavailability error: `permanent` on the fetch path
  (above). On the subscription path the item fails as today
  (`subscription_videos` handling is unchanged).
- Metadata extraction returns nothing: `_fetch_and_update` returns early, as today.
- `caption_track` is set but the download raises or writes nothing: recorded exactly as
  today (`rate_limited`, `permanent`, or NULL on the fetch path; the subscription path's
  existing mapping). Such a row stays in the retry set unless `permanent`, as today.
- A track listed in the metadata is gone by the time of the download: as the previous
  case.

### 3. States

`loft_metadata` caption columns are written by the same code and with the same values as
today, with two differences: `has_captions` follows the new definition, and the fetch path
may write `permanent` on a metadata error.

| State | `has_captions` | `captions_downloaded` | `caption_error_kind` | Startup retry selects |
|---|---|---|---|---|
| Downloaded | true | true | NULL | no |
| No usable track | false | false | any | no |
| Download failed | true | false | NULL, `rate_limited`, `no_transcript` | yes |
| Unavailable | any | false | `permanent` | no |

Transitions: the fetch path and the subscription import move a row to the state of their
outcome, as today. The startup retry is a fetch-path run on the rows it selects. The new
write (`permanent` on a metadata error) moves any non-downloaded row to Unavailable; it
never touches a Downloaded row's `captions_downloaded` or its `.vtt`.

A Downloaded row whose metadata error is `permanent` (a video that went private after its
captions were saved) gets `caption_error_kind` `permanent` and keeps `captions_downloaded`
true and its `.vtt`; the badge reads `captions_downloaded` first and shows nothing.

### 4. Data read and written

- Core DB `loft_metadata`: `has_captions` (new meaning), `caption_error_kind` (new
  `permanent` write on the fetch path); other columns as today. No schema change.
- Core DB `subscription_videos`: unchanged.
- `.vtt` beside the `.loft`: written when a track is saved, as today.
- Intelligence `search.db`: not written by media_import; intelligence indexes new `.vtt`
  files through the existing `scan.complete` handling.

### 5. External services

YouTube through yt-dlp: the same calls per attempt as today (one metadata extraction, one
caption download with one requested key). Slow, throttled or failing calls are handled as
today. The first start after deployment makes the same 452 attempts it makes on every start
now; later starts attempt only rows still in the Download failed state.

### 6. Authorization

None changes.

### 7. Effect on existing features

- **Speech-to-text, URL import in "If no captions" mode** (`_should_run_stt`,
  `missing_captions`): it runs when `has_captions` is false, so it now also runs for a
  chat-replay-only archive and for a video with no candidate track. "Use captions" and
  "Always" are unchanged. Subscription imports and the startup retry never start STT,
  before or after.
- **Subscription import**: an item with `caption_track` `None` is not sent to
  `fetch_transcript` unless the subscription has `include_no_transcript`. It is imported
  either way.
- **CaptionStatusBadge**: a video with no usable track shows "YouTube has no captions"
  (not retryable) instead of "Caption download failed" (retryable). Unavailable rows show
  the existing permanent-failure label.
- **SPEC-ADDON-142 (yt-dlp Node runtime)**: the captions options dict keeps the same keys
  and shape, `subtitleslangs: [lang]`; only the value passed as `lang` changes. No
  options dict is added.
- **Intelligence**: region-language videos gain a `.vtt`, so their transcripts appear in
  search and Ask. About 118 `scan.complete` events, 5 s apart, on the first start.
- **Videos that get a `.vtt` today**: the request is `L`, the first candidate, so the same
  track is saved.

### 8. Error behavior

Nothing new is shown beyond the badge changes in item 7. The existing log lines stay
(the `_worker` exception log on a metadata error; "Retrying caption download for N loft
ref(s)" at start, now counting fewer rows).

### 9. User-visible behavior

- Region-language videos (production: Samson Wrestle, Oscar Moves, Omi Claudio Bulos and
  two others) get captions; the player offers the track.
- Live archives with only a chat replay show "YouTube has no captions".
- Videos that went private or were removed show the permanent-failure label.
- Backend start no longer spends about 38 minutes re-fetching the same videos.

### 10. Non-functional

- No YouTube call is added on any path.
- One `.vtt` per `.loft`, as today. No video or audio is downloaded by this change.
- No change to what is sent off the host.

### Premises about YouTube, and who checks them

YouTube and yt-dlp are in `agent_cannot_verify`; acceptance tests mock yt-dlp and confirm
only this spec's model. The model was measured on 2026-11-21 with the production backend
container's yt-dlp against 15 of the 452 videos:

- 4 region-language (`en-US`) videos: no manual subtitles; automatic captions listed under
  `en` and `en-orig`, none under `en-US`.
- 11 unknown-language videos: live archives (`was_live` true on the 10 where it was read),
  only `live_chat` in `subtitles`, no automatic captions.

After deployment the author reads, on production and read-only, the caption state of the
452 rows after the first start and the count in the next start's "Retrying caption
download" line, and reports them to the owner.

## Touch points

- `addons/media_import/backend/service.py`: `_fetch_metadata_sync` (`caption_track`,
  `has_captions`), `_fetch_and_update` (passes `caption_track`; `permanent` on a metadata
  error). `_download_captions_sync` and `_retry_failed_captions` are not changed.
- `addons/media_import/backend/subscription/registry.py`: `ItemMetadata.caption_track`.
- `addons/media_import/backend/subscription/providers/youtube.py`: `fetch_item` fills
  `caption_track`.
- `addons/media_import/backend/subscription/manager.py`: passes `caption_track` to
  `fetch_transcript`.
- Core DB table `loft_metadata` (`has_captions`, `caption_error_kind`). No schema change.
- The `.vtt` file beside each `.loft`.
- `addons/media_import/backend/tests/`: new tests citing the SPEC-IDs. Existing test fakes
  whose metadata lists captions only under the video's exact language keep passing; a fake
  that lists only `live_chat` or only non-candidate keys and expects `has_captions` true is
  changed to the new meaning.
- `docs/addons/media-import.md`: one sentence that a live stream's chat replay is not
  captions, and that a region language also matches the base language's captions.
- Rules passed through: `.claude/rules/design-decisions.md` (nothing in core changes).
  `.claude/rules/backend-conventions.md`, the prohibition on language-dependent rules: the
  choice splits a BCP 47 tag at its first hyphen and appends YouTube's `-orig` suffix; it
  reads no language's vocabulary.
- Core repository: the `addons/media_import` pointer bump, this spec and its ledger rows.
  No protected path is edited.

## Invariants

I1. For a video whose language is `xx-YY`, when YouTube lists neither `xx-YY` nor `xx-YY-orig` but lists `xx` or `xx-orig`, the fetch path and the subscription path each save a `.vtt` beside the `.loft` and record `captions_downloaded` true.
I2. `caption_track` is the first of `L`, `L-orig`, base, `base-orig` that is listed in `subtitles` (other than `live_chat`) or `automatic_captions`, and is `None` when none is.
I3. The caption download requests exactly one key, `caption_track`, and the same number of yt-dlp extractions is made per attempt as before this change.
I4. `has_captions` is true exactly when `caption_track` is not `None`; a video whose only subtitle is `live_chat` and which has no automatic captions has `has_captions` false.
I5. A video for which today's code saves a `.vtt` (its language key, or `ja` for an unknown language, is listed) saves the track of that same key after this change.
I6. A fetch-path metadata extraction that raises an error classified `permanent` sets `caption_error_kind` to `permanent` and changes no other column; one classified otherwise writes nothing.
I7. The startup caption retry selects the same rows as before this change: `has_captions` true, `captions_downloaded` false, `caption_error_kind` not `permanent`, active file.
I8. Neither a subscription import nor the startup caption retry starts speech-to-text for any video.
I9. A subscription item with `caption_track` `None` on a subscription without `include_no_transcript` is imported, and no caption download is attempted for it.

## Checked, no action

- **Transcribing captionless live archives.** The owner decided against automatic STT
  (about 670 hours on the production Mac mini, while the frame-OCR backlog already needs
  about three weeks). Manual "Generate captions with speech-to-text" stays available per
  video. No per-subscription STT setting is added.
- **Telling "nothing produced" apart from an unclassified error in the caption download.**
  Not needed once the track is chosen from the metadata: a download is attempted only for
  a listed track, so an empty result is unexpected and stays retryable, as today. The
  startup retry erasing a subscription row's `no_transcript` to NULL also stays; with a
  listed track, retrying is the right response.
- **Base language widening to regional keys** (`L = en`, only `en-GB` listed). Not
  matched; `has_captions` false. No production video needed it, and choosing among
  several regions would need a preference.
- **Scripts and multi-part tags.** `zh-Hans` falls back to `zh`, `sr-Latn-RS` to `sr`.
  No production video has such a tag.
- **Case-insensitive matching.** `language` and the listed keys come from the same yt-dlp
  extraction.
- **Unknown language defaulting to `ja`.** Unchanged, including that it can pick
  YouTube's machine translation into Japanese for a non-Japanese video.
- **Translated automatic captions as a further fallback.** A machine translation is not
  the video's speech.
- **Classifying metadata errors on the subscription path.** Its failed items are handled
  by the existing `subscription_videos` outcome logic, which already records `permanent`.
- **A separate backfill or migration for the 452 rows.** The first startup retry after
  deployment re-runs exactly them through the corrected code.
- **`subscription_videos.error_kind` of the existing rows.** Not shown as caption state;
  the badge reads `loft_metadata`.
