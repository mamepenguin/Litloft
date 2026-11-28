# A .loft of another site never shows a confusing error

SPEC-ID: SPEC-ADDON-188
SPEC-ID: SPEC-ADDON-189
SPEC-ID: SPEC-ADDON-190
SPEC-ID: SPEC-ADDON-191
SPEC-ID: SPEC-ADDON-192
SPEC-ID: SPEC-CORE-195

Approval:

## Summary

Recent `.loft` work has targeted YouTube. A survey of core, Media Import and
Intelligence found six places where a `.loft` that is not YouTube, or an import that
fails, ends in an English message, a blank player, a 404 toast or a note about a
failure the viewer did not ask about. Features that only YouTube offers stay
YouTube-only; what this change promises is that each of those six places either says
what happened, in the viewer's language, or offers the link instead of nothing. It is
for the single viewer of a personal Litloft who imports links from sites other than
YouTube.

- **SPEC-ADDON-188**: Import from URL names the reason it failed (the site or page has
  no video yt-dlp can read; the video is private, removed or region-locked; anything
  else), localized, and writes no `.loft`.
- **SPEC-ADDON-189**: "Refresh metadata" on a `.loft` whose first metadata fetch never
  stored a row fetches it, instead of answering 404.
- **SPEC-ADDON-190**: The caption badge for a video with no captions does not name
  YouTube.
- **SPEC-ADDON-191**: A Media Import embed (YouTube, Vimeo) that cannot play its URL —
  no video id in it, or YouTube's player script failed to load — shows the link card,
  not an empty box.
- **SPEC-ADDON-192**: A file question about a `.loft` with no frame source attempts no
  frame and reports no image failure.
- **SPEC-CORE-195**: When the player cannot read the `.loft` file, it says so in the
  viewer's language, and an error response is never read as the file's content.

## Required items

### 1. Normal flow

- **188.** The viewer pastes a URL into Import from URL (the Composer on the Media Import
  page, or the dialog from a folder's menu) and submits. `POST
  /api/addons/media_import/link` (`create_loft` in `router.py`) asks yt-dlp for the
  title. On success nothing changes. On failure it answers with one of three codes as
  the string `detail` of the JSON body:

  | Code | Status | When |
  |---|---|---|
  | `unsupported_url` | 422 | the title fetch (`_extract_title_sync`) raises `DownloadError` whose underlying exception (`exc_info[1]`) is `yt_dlp.utils.UnsupportedError`: no extractor matched, or the generic extractor found no video on the page |
  | `unavailable` | 422 | otherwise, the title fetch's exception is classified `ItemUnavailable` by Media Import's existing `_classify_fetch_error` (private, removed, region-locked, members-only…) |
  | `failed` | 500 | any other exception from `create_loft_sync`: a title fetch that is rate-limited, not yet started, a network error or anything unclassified, and every exception raised after the title was fetched (folder resolution, file write, DB) |

  The checks run in that order, and only on the title fetch's exception. Classification
  uses `_classify_fetch_error` unchanged (rate-limit markers before unavailable markers),
  imported inside the function as `_metadata_error_is_unavailable` already does, because
  `subscription/providers/youtube.py` imports `service` at module level. The form shows
  the message for the code under the field and keeps the URL in it, as it shows an error
  today. Only `createLoft` failures are mapped: the Composer's subscription calls
  (`createSubscription`, `syncSubscription`) keep showing their server text as today.
- **189.** The viewer opens a `.loft` and chooses ⋮ → "Refresh metadata". `POST
  /link/{file_id}/refresh` checks the file as today, then takes the URL from the
  `loft_metadata` row when one exists, and otherwise from the `.loft` file itself, and
  queues a fetch with `stt_mode` `"manual"`, as every refresh does today. The existing
  toast is shown; the panel re-reads its metadata once, 3 s after the refresh answers,
  as it does for every refresh today.
- **190.** The metadata panel draws the caption badge as today; only the no-captions
  text changes.
- **191.** The file page renders `LoftPlayer`, which picks the embed registered for the
  file's provider. An embed that has a video id and a loaded player behaves as today.
  One that has no id for its URL, or whose YouTube IFrame API load rejected, renders
  core's `GenericLinkCard` with the props it received.
- **192.** The viewer asks a question in the file's Ask tab while the player is at a
  position. For a `.loft` with no frame source (`_has_frame_source` false: anything but
  a readable YouTube reference) no image is prepared, and the answer is produced from
  the text alone, as for a file whose profile cannot see.
- **CORE-195.** `LoftPlayer` reads `/api/files/{id}/stream`. A non-OK response, a body
  that is not JSON, or a JSON body without a non-empty string `provider` and a non-empty
  string `url` is a read failure.

### 2. Failure cases

- **188.** Any non-OK answer whose `detail` is not one of the three codes (the existing
  422 `URL is required`, 400 drive mismatch, 404 `Drive not found`), a body that is not
  JSON, or a network error shows the form's own existing fallback text.
- **189.** The file is not active or not on the scoped drive → 404 before the file is
  read, as today. With no row: the file's mime type is not the `.loft` type, the file
  cannot be read, is not JSON, or has no non-empty string `url` → 404, and the menu shows
  the existing "refresh failed" toast. A fetch that then fails leaves the file without a
  row, as today.
- **191.** A Vimeo URL whose path holds no numeric id (`vimeo.com/user123`, a showcase)
  and a YouTube URL with no id fall into the link card. The YouTube restricted-embed view
  (owner disallows embedding, errors 101/150) is unchanged. A failed IFrame API script
  leaves no `<script>` tag behind, so a later YouTube embed in the same page session
  tries the load again and, failing again, also shows the link card.
- **192.** None new: a YouTube `.loft` whose frame fails still reports `"unavailable"`
  as today.
- **CORE-195.** See flow; the message replaces the player box.

### 3. States

- **188.** Form: idle → submitting → (success: cleared as today) | (error: message for
  `unsupported_url`, `unavailable`, `failed`, or the fallback). The error is cleared only
  when the form is submitted again, as today; editing the URL does not clear it. No
  transition from an error to another error without a submit.
- **189.** No new state. A `.loft` with no metadata row moves to "has a row" when a fetch
  it queues succeeds.
- **191.** Embed: loading → playing (as today) | restricted (as today) | link card. The
  link card stays until the embed is given another URL or is mounted again; nothing else
  (a `youtubeUi` toggle, a late promise) turns it back into a player. Restricted never
  becomes the link card. When the URL changes, YouTubeEmbed starts at loading again, as
  it does today.
- **192.** Image status for this case is `"none"` instead of `"unavailable"`.
- **CORE-195.** loading → content | read failure. When `fileId` changes, what is shown
  stays as it is until the answer for the new `fileId` arrives, as today (so an embed
  rebuilt in place keeps its fullscreen and mini-player box on a queue advance); that
  answer then decides content or read failure. An answer for an earlier `fileId` that
  arrives later is ignored. Content and read failure change only through a new
  `fileId`'s answer.

### 4. Data read and written

- **188.** Reads nothing new. A failure of the title fetch or folder resolution leaves no
  `.loft` file and no `files` row, because nothing is written before them; a DB failure
  leaves none because `create_loft_sync` already removes the file then. A `write_text`
  that fails partway (a full disk) can leave a partial file, as today.
- **189.** Reads the `.loft` file (drive file system) when `loft_metadata` has no row.
  Writes nothing in the endpoint; the queued fetch writes `files.duration`, chapters, the
  thumbnail and the `loft_metadata` row as a refresh's fetch does.
- **190, 191, CORE-195.** Frontend only; nothing stored.
- **192.** Writes nothing; no frame cache file is created for this case.

### 5. External services

- **188.** yt-dlp → the site. Slow: the request waits as today (no new timeout). Down:
  `failed`. Wrong (a page yt-dlp misreads as a video): out of scope, the import succeeds
  as today.
- **189.** The queued fetch calls yt-dlp as a refresh does; its failure handling is
  unchanged.
- **191.** YouTube's IFrame API script: a load failure (`onerror`) leads to the link
  card.
- **192.** No YouTube frame request is made for a non-YouTube `.loft`.

### 6. Authorization

Unchanged. `/link` and `/link/{file_id}/refresh` keep their `X-Lit-Drive` scoping and
`_require_active_file_in_drive` (`addons/media_import/backend/router.py`); the refresh
reads the `.loft` file only after that check passes, and resolves it inside the file's
own drive. The Ask route keeps its access checks.

### 7. Effect on existing features

- **188.** `createLoft` in `addons/media_import/frontend/api.ts` is used by the Composer
  and the dialog only. Subscriptions create `.loft` files through their own worker, not
  `/link`, and are unaffected. The MCP server does not call `/link`. Tests asserting the
  English detail `"Failed to create link"` change to the new contract.
- **189.** The STT endpoint already reads the `.loft` file for its URL when there is no
  row (`_load_stt_item`); refresh gains the same reading. Startup caption retry still
  reads only rows that exist.
- **190.** Every caption badge with no captions shows the new text, YouTube included.
- **191.** `registerLoftPlayer` and `LoftEmbedProps` are unchanged; the embeds import
  core's `GenericLinkCard` (addon → core is allowed). The YouTube overlay, fullscreen and
  restricted-view behaviour is unchanged.
- **192.** With a profile that can see, local videos and YouTube `.loft` files with text
  go to the frames path (`is_text_video`), which is unchanged; only the text path's
  single image attempt changes. With a profile that cannot see, the `meta` event of such
  a file no longer carries the `image` key, which `file-ask-vision.md` I3 (r1) reads as
  `"none"`; `meta_event`'s condition is not changed. Pictures and local videos are
  unchanged.
- **CORE-195.** Every `.loft` player goes through this read.

### 8. Error behavior

| Case | Viewer sees (ja / en) | Logged |
|---|---|---|
| 188 `unsupported_url` | 「このURLからは動画を読み取れません。対応していないサイトか、動画のないページです」 / "No video could be read from this URL. The site is not supported, or the page has no video." | `logger.info` with the URL |
| 188 `unavailable` | 「この動画は取り込めません。非公開・削除済み・地域制限の可能性があります」 / "This video cannot be imported. It may be private, removed or region-locked." | `logger.info` with the URL |
| 188 `failed`, Composer | existing `composer.errorFallback` (「取り込みに失敗しました」 / "Failed to import") | `logger.exception` as today |
| 188 `failed`, dialog | existing `importFromUrl.errorFallback` (「取り込みに失敗しました」 / "Import failed") | `logger.exception` as today |
| 189 unreadable `.loft` | existing toast `refreshFailed` | none new |
| 191 | the link card with the URL | none |
| CORE-195 | 「.loft ファイルを読み込めませんでした」 / "Could not read the .loft file" | none |

The two new messages are shared by the Composer and the dialog.

### 9. User-visible behavior

- The texts in item 8.
- Caption badge, no captions: 「この動画には字幕がありません」 / "This video has no
  captions" (was 「YouTubeに字幕がありません」 / "YouTube has no captions for this video").
- A `.loft` whose embed cannot play now shows the same link card as a site with no
  player, instead of an empty area.
- A question about a Vimeo / SoundCloud / other `.loft` no longer shows the "the image
  could not be used" note.
- No ordering, timing or default changes.

### 10. Non-functional

None new. 189 reads one small JSON file per refresh. 192 stops, per question for these
files, a `.loft` read and the "file question image failed" warning log.

### Verification

`agent_cannot_verify` covers real third-party calls. Acceptance tests build failures
from yt-dlp's own classes (`DownloadError` carrying a real `UnsupportedError` instance in
`exc_info`) and from Media Import's existing unavailable marker text, and simulate the
IFrame API script's `onerror`. R-5 blocks `youtube.com/iframe_api` in the browser to see
the link card. The human checks once against real sites: a page with no video, and a
private or removed YouTube video.

### Project questions (`docs/process/PROJECT.md`)

- Docker / migrations: no schema change.
- i18n: core keys go in `frontend/src/messages-core/{ja,en}.json`; Media Import keys in
  its own `frontend/messages/{ja,en}.json`.
- Docs: `docs/addons/media-import.md`, the page that documents Media Import's
  endpoints (`docs/reference/api.md` points there):
  - "Importing a video": a URL with no video yt-dlp can read, or a private or removed
    video, is refused with the reason and no file is created; `POST /link` answers 422
    `unsupported_url` / `unavailable` or 500 `failed` as `detail`.
  - "Watching": the Vimeo row says a Vimeo URL with no video number shows the link card,
    and the table says the link card is also shown when a YouTube or Vimeo embed cannot
    load.
  - "Where the details are": the new badge text.

  `docs/ADDON-DEVELOPMENT.md` "Registering a `.loft` player" gets one sentence: an embed
  that cannot play its URL renders `GenericLinkCard` from
  `@/components/loft/GenericLinkCard`. No config key or WebSocket event page changes.

## Touch points

- `addons/media_import/backend/router.py` (`create_loft`, `refresh_loft`)
- `addons/media_import/backend/service.py` (`create_loft_sync`, `_extract_title_sync`, error classification)
- `addons/media_import/backend/subscription/providers/youtube.py` (`_classify_fetch_error`, read only)
- `addons/media_import/backend/subscription/registry.py` (`ItemUnavailable`, read only)
- `addons/media_import/frontend/api.ts` (`createLoft`)
- `addons/media_import/frontend/Composer.tsx`
- `addons/media_import/frontend/ImportFromUrlDialog.tsx`
- `addons/media_import/frontend/messages/ja.json`
- `addons/media_import/frontend/messages/en.json`
- `addons/media_import/frontend/players/YouTubeEmbed.tsx`
- `addons/media_import/frontend/players/VimeoEmbed.tsx`
- `addons/media_import/frontend/players/loadYouTubeIframeApi.ts`
- `addons/intelligence/app/routers/rag.py` (file question `image_applies`)
- `addons/intelligence/app/rag/file_question.py` (`_has_frame_source`)
- `frontend/src/components/loft/LoftPlayer.tsx`
- `frontend/src/messages-core/ja.json`
- `frontend/src/messages-core/en.json`
- `docs/addons/media-import.md`
- `docs/ADDON-DEVELOPMENT.md`
- `.claude/rules/design-decisions.md` (drive boundary; addon → core only)
- The submodule pointers `addons/media_import` and `addons/intelligence`

## Invariants

I1. A `POST /link` whose title fetch, folder resolution or DB write fails leaves no `.loft` file and no `files` row, whichever of the three codes it answers.
I2. An import whose title fetch raises `UnsupportedError` shows the `unsupported_url` message, and one classified `ItemUnavailable` (and not rate-limited) shows the `unavailable` message, in both the Composer and the dialog; neither shows `"Failed to create link"` or any other English text in the Japanese UI.
I2b. A `/link` failure answering `failed`, any other `detail`, a body that is not JSON, or a network error shows the form's own `errorFallback` and never the server's text or the code itself.
I3. A successful `POST /link` answers and writes exactly what it does before this change.
I4. `POST /link/{file_id}/refresh` on an active `.loft` of the scoped drive queues a fetch with `stt_mode` `"manual"` of the `loft_metadata` row's URL when a row exists, and of the `.loft` file's `url` when none exists, answering `{"status": "queued"}`; for a file not active on the scoped drive it answers 404 without reading the file.
I4b. With no row, a refresh of a file whose mime type is not the `.loft` type, or whose file cannot be read, is not a JSON object, or has no non-empty string `url`, answers 404 and queues nothing.
I5. The caption badge text for a video with no captions contains no provider name, in ja and en.
I6. A Media Import embed whose URL yields no video id, or whose YouTube IFrame API load rejected (also on a later mount after an earlier failure), renders a link to the file's URL; it never renders nothing.
I7. A YouTube embed whose owner disallows embedding still shows the restricted view, and one that loads still plays in the embed; neither shows the link card.
I8. A file question about a `.loft` that is not a readable YouTube reference reports image status `"none"` and prepares no image, while a YouTube `.loft` with text still takes the frames path.
I9. `LoftPlayer` treats a non-OK response, an unparsable body, or a body without a non-empty string `provider` and `url` as a read failure and shows the localized message; it never renders a player or link card from such a response.
I10. After `LoftPlayer`'s `fileId` changes, an answer for an earlier `fileId`, success or failure, never changes what it shows.

## Revises

SPEC-ADDON-053 I1. The LLM receives passages, and for a picture one image, for a video with a profile that can see up to 8 frames plus up to 12 frames it requests (a `.loft` with a text chunk that is not a text video gets no image and no attempt: its image status is `"none"`), for a PDF with a profile that can see up to 12 page images it requests under SPEC-ADDON-183, and on the document tool path of SPEC-ADDON-182 the requested passages it reads, of the requested file only, and only when the file is an active file of the `X-Lit-Drive` drive that the viewer can access and whose `rag` feature is on.

## Checked, no action

- **A link-only `.loft` for URLs yt-dlp cannot read.** The human chose to refuse with a
  localized reason instead (2026-11-28).
- **A registry-level fallback** (`registerLoftPlayer(name, C, { accepts(url) })`) so core
  decides. Core cannot see that an embed rendered nothing, and YouTube's script failure
  is only known inside the embed, so the embed renders the link card itself. No
  extension-point change.
- **A timeout for an IFrame API script that loads but never calls
  `onYouTubeIframeAPIReady`.** A blocked script fails with `onerror`, which 191 covers;
  a script that loads and never becomes ready has not been observed.
- **Showing metadata from a fetch that takes longer than 3 s without reopening the
  page.** Every refresh behaves so today; the panel waiting for its row belongs with the
  later fix for refreshes that fail silently.
- **Playlist / showcase URLs imported as one item, metadata refresh that fails silently,
  caption track defaulting to `ja`, the rolling-cue dedup applied to every VTT, Vimeo SDK
  controller, chapters panel without a controller, SoundCloud classified as video.**
  Found in the same survey; later batches.
- **Recording `fetch_error` when the first fetch fails, and retrying such files at
  startup.** 189 lets the viewer recover by hand; an automatic retry is a separate
  decision.
- **Removing a partial `.loft` when `write_text` itself fails.** A full disk during a
  few-hundred-byte write; the behaviour is today's.
- **Clearing the import error when the URL is edited.** Not done today; out of scope.
- **Keeping the specific 422 / 400 / 404 texts of `/link` in the form.** They answer a
  malformed client, not a viewer's action; the fallback text is shown.
- **SPEC-ADDON-114 I8 and its revisions** ("a `.loft` that is not a text video … answer
  as they did before this change") bound what those changes touched. 192 keeps
  `file-ask-vision.md` I3 as revised (`"unavailable"` only when the route tried to send
  an image and could not, `"none"` otherwise): the route no longer tries for a file with
  no frame source. The one sentence that named the old result, SPEC-ADDON-053 I1, is
  revised above.
- **Classifying `unavailable` for sites other than YouTube.** Media Import's markers are
  YouTube's messages; other sites' private/removed errors fall into `failed`, which
  still shows a localized message.
