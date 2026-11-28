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
  /api/addons/media_import/link` asks yt-dlp for the title. On success nothing changes.
  On failure the endpoint answers with an error code; the form shows the message for
  that code under the field and keeps the URL in it, as it shows an error today.
- **189.** The viewer opens a `.loft` and chooses ⋮ → "Refresh metadata". `POST
  /link/{file_id}/refresh` takes the URL from the `loft_metadata` row, or, when there is
  no row, from the `.loft` file itself, and queues a fetch. The existing toast and the
  panel's existing polling then show the metadata once the fetch stores it.
- **190.** The metadata panel draws the caption badge as today; only the no-captions
  text changes.
- **191.** The file page renders `LoftPlayer`, which picks the embed registered for the
  file's provider. An embed that has a video id and a loaded player behaves as today.
  One that has no id for its URL, or whose player script failed to load, renders
  `GenericLinkCard` with the file's URL.
- **192.** The viewer asks a question in the file's Ask tab while the player is at a
  position. For a `.loft` whose provider has no frame source (anything but a readable
  YouTube reference) no frame is loaded, and the answer is produced from the text alone,
  as for a file without an image.
- **CORE-195.** `LoftPlayer` reads `/api/files/{id}/stream`. A non-OK response, a body
  that is not JSON, or a JSON body without a string `provider` and `url` is a read
  failure.

### 2. Failure cases

- **188.** yt-dlp reports the URL as unsupported (its generic extractor finds no video,
  or no extractor matches) → code `unsupported_url`. The error matches Media Import's
  existing "unavailable" classification (private, removed, region-locked,
  members-only…) → code `unavailable`. Any other exception (network, timeout, a folder
  that cannot be resolved, disk) → code `failed`. A response the frontend cannot read
  (not JSON, unknown code, network error) shows the existing fallback text.
- **189.** The `.loft` file cannot be read, is not JSON, or has no non-empty string
  `url` → 404 as today, and the menu shows the existing "refresh failed" toast. The file
  is not active or not on the scoped drive → 404 as today.
- **191.** A Vimeo URL whose path holds no numeric id (`vimeo.com/user123`, a showcase)
  and a YouTube URL with no id fall into the link card. The YouTube restricted-embed
  view (owner disallows embedding) is unchanged.
- **192.** None new: a YouTube `.loft` whose frame fails still reports `unavailable` as
  today.
- **CORE-195.** See flow; the message replaces the player box.

### 3. States

- **188.** Form: idle → submitting → (success: cleared as today) | (error: message shown
  for one of `unsupported_url`, `unavailable`, `failed`, or the fallback). Editing the URL
  or resubmitting clears the error as today.
- **189.** No new state. A `.loft` with no metadata row moves to "has a row" when a
  fetch it queues succeeds; a failing fetch leaves it without one, as today.
- **191.** Embed: loading → playing (as today) | link card (no id, or the script failed).
  The link card is final for that mount; a new URL remounts as today.
- **192.** Image status for this case is "none" instead of "unavailable".
- **CORE-195.** loading → content | read failure (message).

### 4. Data read and written

- **188.** Reads nothing new. On every failure no `.loft` file and no `files` row is
  left behind, which is what happens today (the title is fetched before anything is
  written).
- **189.** Reads the `.loft` file (drive file system) when `loft_metadata` has no row.
  Writes nothing in the endpoint; the queued fetch writes `files.duration`, chapters, the
  thumbnail and the `loft_metadata` row exactly as an import's fetch does.
- **190, 191, CORE-195.** Frontend only; nothing stored.
- **192.** Reads the `.loft` file (already read by `_has_frame_source`). Writes nothing;
  no frame cache file is created for this case.

### 5. External services

- **188.** yt-dlp → the site. Slow: the request waits as today (no new timeout). Down:
  `failed`. Wrong (a page yt-dlp misreads as a video): out of scope, the import
  succeeds as today.
- **189.** The queued fetch calls yt-dlp as an import does; its failure handling is
  unchanged.
- **191.** YouTube's IFrame API script: a load failure now leads to the link card.
- **192.** No YouTube frame request is made for a non-YouTube `.loft`.

### 6. Authorization

Unchanged. `/link` and `/link/{file_id}/refresh` keep their `X-Lit-Drive` scoping and
`_require_active_file_in_drive` (`addons/media_import/backend/router.py`); the refresh
reads the `.loft` file only after that check passes, and resolves it inside the file's
own drive. The Ask route keeps its access checks.

### 7. Effect on existing features

- **188.** `createLoft` in `addons/media_import/frontend/api.ts` is used by the Composer
  and the dialog only. Subscriptions create `.loft` files through their own worker, not
  `/link`, and are unaffected. The MCP server does not call `/link`.
- **189.** The STT endpoint already falls back to the `.loft` file for its URL
  (`_load_stt_item`); refresh gains the same reading. Startup caption retry still reads
  only rows that exist.
- **190.** Every caption badge with `has_captions = false` shows the new text, YouTube
  included.
- **191.** `registerLoftPlayer` and `LoftEmbedProps` are unchanged; the embeds import
  core's `GenericLinkCard` (addon → core is allowed). A provider with no registered
  player already gets the link card from `LoftPlayer`.
- **192.** The frames path (`is_text_video`) already excludes these files; only the
  text path's single image attempt changes. Pictures and local videos are unchanged.
- **CORE-195.** Every `.loft` player goes through this read.

### 8. Error behavior

| Case | Viewer sees (ja / en) | Logged |
|---|---|---|
| 188 `unsupported_url` | 「このURLからは動画を読み取れません。対応していないサイトか、動画のないページです」 / "No video could be read from this URL. The site is not supported, or the page has no video." | `logger.info` with the URL |
| 188 `unavailable` | 「この動画は取り込めません。非公開・削除済み・地域制限の可能性があります」 / "This video cannot be imported. It may be private, removed or region-locked." | `logger.info` with the URL |
| 188 `failed` | the existing `errorFallback` (「取り込みに失敗しました」 / "Failed to import") | `logger.exception` as today |
| 189 unreadable `.loft` | existing toast `refreshFailed` | none new |
| 191 | the link card with the URL | none |
| CORE-195 | 「.loft ファイルを読み込めませんでした」 / "Could not read the .loft file" | none |

The two places that show 188's message use their own existing fallback keys
(`composer.errorFallback`, `importFromUrl.errorFallback`); the two new messages are
shared by both.

### 9. User-visible behavior

- The texts in item 8.
- Caption badge, no captions: 「この動画には字幕がありません」 / "This video has no
  captions" (was 「YouTubeに字幕がありません」).
- A `.loft` whose embed cannot play now shows the same link card as a site with no
  player, instead of an empty area.
- A question about a Vimeo / SoundCloud / other `.loft` no longer shows the "the image
  could not be used" note.
- No ordering, timing or default changes.

### 10. Non-functional

None new. 189 reads one small JSON file per refresh. 192 removes a yt-dlp call per
question for these files.

### Project questions (`docs/process/PROJECT.md`)

- Docker / migrations: no schema change.
- i18n: core keys go in `frontend/src/messages-core/{ja,en}.json`; Media Import keys in
  its own `frontend/messages/{ja,en}.json`.
- Docs: no public endpoint, config key or WebSocket event changes, and
  `docs/addons/media-import.md` does not document `/link` errors, so no docs page
  changes.

## Touch points

- `addons/media_import/backend/router.py` (`create_link`, `refresh_loft`)
- `addons/media_import/backend/service.py` (`create_loft_sync`, `_extract_title_sync`, `_metadata_error_is_unavailable`)
- `addons/media_import/frontend/api.ts` (`createLoft`)
- `addons/media_import/frontend/Composer.tsx`
- `addons/media_import/frontend/ImportFromUrlDialog.tsx`
- `addons/media_import/frontend/CaptionStatusBadge.tsx`
- `addons/media_import/frontend/messages/ja.json`
- `addons/media_import/frontend/messages/en.json`
- `addons/media_import/frontend/players/YouTubeEmbed.tsx`
- `addons/media_import/frontend/players/VimeoEmbed.tsx`
- `addons/intelligence/app/routers/rag.py` (file question `image_applies`)
- `addons/intelligence/app/rag/file_question.py` (`_has_frame_source`)
- `frontend/src/components/loft/LoftPlayer.tsx`
- `frontend/src/components/loft/GenericLinkCard.tsx`
- `frontend/src/messages-core/ja.json`
- `frontend/src/messages-core/en.json`
- `.claude/rules/design-decisions.md` (drive boundary; addon → core only)
- The submodule pointers `addons/media_import` and `addons/intelligence`

## Invariants

I1. A failed `POST /link` leaves no `.loft` file and no `files` row, whichever of the three codes it answers.
I2. An import that yt-dlp rejects as an unsupported URL shows the `unsupported_url` message, and one rejected as private, removed or region-locked shows the `unavailable` message; neither shows `"Failed to create link"` or any other English text in the Japanese UI.
I3. A successful `POST /link` answers and writes exactly what it does before this change.
I4. `POST /link/{file_id}/refresh` on an active `.loft` of the scoped drive with no `loft_metadata` row and a readable `url` queues a fetch and answers `{"status": "queued"}`; for a file not active on the scoped drive it answers 404 before reading the file.
I5. The caption badge text for a `.loft` with no captions contains no provider name.
I6. A Media Import embed whose URL yields no video id, or whose YouTube player script failed to load, renders a link to the file's URL; it never renders nothing.
I7. A file question about a `.loft` that is not a readable YouTube reference reports image status `"none"` and makes no frame request, while a YouTube `.loft` at a position still attempts its frame.
I8. `LoftPlayer` treats a non-OK or unparsable `/stream` response as a read failure and shows the localized message; it never renders a player or link card from such a response.

## Checked, no action

- **A link-only `.loft` for URLs yt-dlp cannot read.** The human chose to refuse with a
  localized reason instead (2026-11-28).
- **A registry-level fallback** (`registerLoftPlayer(name, C, { accepts(url) })`) so core
  decides. Core cannot see that an embed rendered nothing, and YouTube's script failure
  is only known inside the embed, so the embed renders the link card itself. No
  extension-point change.
- **Playlist / showcase URLs imported as one item, metadata refresh that fails silently,
  caption track defaulting to `ja`, the rolling-cue dedup applied to every VTT, Vimeo SDK
  controller, chapters panel without a controller, SoundCloud classified as video.**
  Found in the same survey; later batches.
- **Recording `fetch_error` when the first fetch fails, and retrying such files at
  startup.** 189 lets the viewer recover by hand; an automatic retry is a separate
  decision.
- **SPEC-ADDON-114 I8 and its revisions** ("a `.loft` that is not a text video … answer
  as they did before this change") bound what those changes touched, not later ones. 192
  keeps `file-ask-vision.md` I3 as revised (`"unavailable"` only when the route tried to
  send an image and could not, `"none"` otherwise): the route no longer tries for a file
  with no frame source, so `"none"` is that invariant's own answer. No `## Revises`.
- **Classifying `unavailable` for sites other than YouTube.** Media Import's markers are
  YouTube's messages; other sites' private/removed errors fall into `failed`, which still
  shows a localized message.
