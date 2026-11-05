# Save to Litloft from the iPhone share menu

SPEC-ID: SPEC-CORE-033
SPEC-ID: SPEC-IOS-001
SPEC-ID: SPEC-IOS-002

Approval:

## Summary

A page, a passage of text or a photo found on the phone reaches Litloft today only by
opening the app and uploading it by hand. This change adds **Litloft** to the iOS share
menu. A shared URL becomes a web clip through the knowledge addon. Shared text becomes a
Markdown note. Shared photos and files are uploaded. Everything saved this way arrives in
the drive's inbox (SPEC-CORE-032), in the remembered drive's `Inbox` folder unless the
viewer picks another drive or folder in the sheet.

- **SPEC-CORE-033**: the core accepts `"share"` as an upload's `inbox_source` and
  records it with the i18n key `inbox.sourceShare`; the inbox shows it as **共有** /
  **Shared**. No other core behaviour changes; the text note and the link note use the
  existing `arrival` field of `POST /api/drives/{drive}/files`.
- **SPEC-IOS-001**: the app mirrors its server address and its session (the
  `access_token` and `lit_viewer` cookies) into an App Group and a keychain item that
  the share extension can read. It keeps the copy current and deletes it when the viewer
  leaves the server or locks.
- **SPEC-IOS-002**: a Share Extension target. It classifies what was shared, picks the
  destination, shows the sheet (preview, drive and folder, progress, errors), sends the
  items through the public API and remembers the destination.

Out of scope: Android and the PWA `share_target` (the user decided on 2026-11-05),
uploading after the sheet has closed (background transfer), unlocking a drive from the
sheet, and the share menu on macOS.

The user decided the entry point, the three kinds and the destination on 2026-11-05.
Design artifact: "C4 共有シート" (mockup in the session scratchpad, published by the
main session).

## Required items

### 1. Normal flow

Terms used below: the **server** is the URL the app connects to, normalised by
`ServerAddress.parse`; its **origin** is `scheme://host[:port]`. The **group** is the App
Group `group.$(LITLOFT_BUNDLE_ID)$(LITLOFT_BUNDLE_ID_SUFFIX)`, so a Debug build and a
Release build have separate groups.

SPEC-IOS-001, the app keeps the mirror:

1. At launch, when `ServerSettings.use(_:)` stores a server, and on every
   `WKHTTPCookieStoreObserver.cookiesDidChange(in:)`, the app writes:
   - the server's absolute string to the group's `UserDefaults` under `share.server`;
   - one keychain item (generic password, service `litloft.share.session`, access group
     the group, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) holding
     `{ "origin", "access_token"?, "viewer"? }`, the values of the cookies that
     `SessionCookies.session(in:host:)` selects for the server's host, copied as stored
     (`lit_viewer` is percent-encoded by the page and is sent as is, see SPEC-IOS-002
     step 6). When neither cookie exists the item is deleted rather than written empty.
2. `ServerSettings.leave` and `forget` delete `share.server`, every `share.*` key of the
   group, and the keychain item, after the cookies are deleted.
3. Locking in the page deletes `access_token`; the observer then rewrites the item
   without it, so the extension sees exactly the drives the app sees.

SPEC-IOS-002, the share:

1. The extension activates for at most one web URL, or text, or up to 20 images, movies
   and files (`NSExtensionActivationRule` with `SupportsWebURLWithMaxCount` 1,
   `SupportsText`, `SupportsImageWithMaxCount` / `SupportsMovieWithMaxCount` /
   `SupportsFileWithMaxCount` 20).
2. It classifies the input items into one kind, first match wins:
   - **files**: any attachment with a file representation (`public.image`,
     `public.movie`, `public.data` that is not `public.url` or `public.plain-text`):
     every such attachment is one upload, in the order shared;
   - **link**: an attachment conforming to `public.url` whose scheme is `http` or
     `https`. A text attachment shared with it that is a single line of at most 200
     characters becomes the clip's `title`; any other text is not saved;
   - **text**: a `public.plain-text` attachment, saved as a Markdown note.
3. It reads the group: `share.server`, and the keychain item when its `origin` equals the
   server's origin. Then, in parallel, with `Authorization: Bearer <access_token>` when
   there is one and `X-Lit-Viewer: <viewer>` when there is one:
   `GET /api/drives`, `GET /api/auth/status`.
4. Destination:
   - drive: `share.lastDrive.<origin>` when it is in the `GET /api/drives` answer; else the
     only drive when there is exactly one; else none, and **保存** stays disabled until
     the viewer picks one (the rule of `resolveQuickNoteDrive` without a current drive);
   - folder: `share.folder.<origin>.<drive>` when it passes the same check as
     `isValidQuickNoteFolder`; else `Inbox`. The empty string is the drive root.
5. For the link kind, the extension asks `GET /api/addons/status?drive=<drive>` (again
   when the drive changes). The link is a **web clip** when `knowledge` is in `addons`
   and a viewer is mirrored; otherwise it is a **link note**. The preview names which
   before **保存** is pressed.
6. The sheet shows the preview, the drive row, the folder row and **保存**. On **保存** the
   destination is fixed for this share, and the items are sent one at a time in order:
   - **file**: `POST /api/drives/{drive}/upload/init` with `filename`, `file_size`,
     `folder_path`, `chunk_size` 5 MiB for every file (not the frontend's
     `pickChunkSize`, whose 100 MiB chunks would approach the extension's memory limit)
     and `inbox_source: "share"`; then each
     chunk, read from the file on disk, to `/upload/{id}/chunk`; then `/complete`. A 409
     whose detail is `File already exists` is retried with `<stem> (N)<.ext>`, N from 1
     to 99, matching the server's own suffix for a created file; any other 409 fails the
     item.
   - **text**: `POST /api/drives/{drive}/files` with `path` = `<folder>/<name>.md`
     (the name by Quick Note's `deriveQuickNoteFilename` rule, ported to Swift), `content`
     = the shared text as UTF-8, unchanged, `conflict_mode: "rename"`, and
     `arrival: { "source": "share", "i18n_key": "inbox.sourceShare" }`.
   - **web clip**: `POST /api/addons/knowledge/clips` with `{ url, subfolder: <folder or
     omitted for the root>, title? }`, header `X-Lit-Drive: <percent-encoded drive>` and
     `X-Lit-Viewer: <viewer>`. Knowledge records the arrival as `web_clip`.
   - **link note**: as text, with content `<title>\n\n<url>\n` (or `<url>\n` without a
     title) and the name from the title, or `<host> <YYYYMMDD-HHmmss>.md` without one.
7. Each item's row shows its progress (bytes sent for a file, a spinner otherwise) and
   then a check. When every item is saved, the extension writes `share.lastDrive.<origin>`
   and `share.folder.<origin>.<drive>`, shows **保存しました** with the folder for 1 s and
   completes the extension request.

SPEC-CORE-033:

1. `UploadInitRequest.inbox_source` becomes `Literal["upload", "share"] | None`. The
   session keeps it.
2. `complete_upload` records the arrival with the i18n key looked up from the source:
   `upload` → `inbox.sourceUpload`, `share` → `inbox.sourceShare`. Everything else about
   the arrival (same commit, three branches, `inbox.updated` after the commit) is
   SPEC-CORE-032's.
3. `frontend/src/messages-core/ja.json` / `en.json` gain `inbox.sourceShare`: **共有** /
   **Shared**. The inbox row's meta line shows it like any other source.

### 2. Failure cases

SPEC-IOS-001:

- Keychain write fails: logged; the previous item stays. The extension may then use a
  stale token, which the server answers as locked (no cookie fallback for Bearer), so the
  worst case is fewer drives, never another server's drive.
- The cookie observer does not fire (app not running): the mirror is refreshed at the next
  launch. A token that expired meanwhile is answered as locked by the server.

SPEC-IOS-002:

- No `share.server` (the app was never connected, or was updated and not launched since):
  the sheet shows **Litloft を開いてサーバーに接続してください** and no **保存**.
- Server unreachable or a request times out (30 s for JSON requests, 120 s per chunk):
  the sheet shows **Litloft に接続できません** with **再試行**, which repeats step 3 or the
  failed item.
- `GET /api/drives` empty: **保存先のドライブがありません**, no **保存**.
- `has_protected_drives` true and `unlocked_groups` empty: the drive list shows what is
  public, and a line **鍵のかかったドライブは Litloft で解錠すると選べます**.
- An item fails (any status other than the 409 retried above, or a network error):
  for an upload the extension sends `DELETE /api/drives/{drive}/upload/{id}` (best
  effort) so no partial file or row stays; the item shows its error and **再試行**; the
  items after it are not sent until the viewer retries or presses **閉じる**. Items saved
  before it stay saved. Retry starts that item from its first request.
- A drive that answered 404 (or 403 through the addon proxy) since it was listed: the item
  shows **このドライブには保存できません**, and the drive row opens the picker.
- Upload init 400 `File too large`: the item shows the server's limit; 507: **空き容量が
  足りません**.
- Clip 401 (viewer rejected) or 400 (URL rejected): the item shows the error and offers
  **リンクとして保存**, which saves it as a link note.
- Clip 502 after the placeholder was created: shown as an error; a retry can leave a
  second placeholder (see Checked, no action).
- **キャンセル** during sending: the current upload is cancelled as above, nothing further
  is sent, nothing is remembered, and the extension completes.
- iOS terminates the extension mid-share (memory, or the host app leaves the
  foreground): the current upload session is abandoned on the server and removed by the
  existing `cleanup_abandoned_uploads`; no file and no inbox row exist for it. Items
  already saved stay. Nothing is remembered.

SPEC-CORE-033: an `inbox_source` other than `"upload"` or `"share"`: 422, nothing created.

### 3. States

The sheet:

| From | To | When |
|---|---|---|
| loading | ready | step 3 answered and a drive is chosen |
| loading | needs drive | several drives and no usable memory |
| loading | blocked | no server, no drives, or unreachable (with retry → loading) |
| needs drive | ready | the viewer picks a drive |
| ready | ready | the viewer changes drive or folder |
| ready | sending | **保存** |
| sending | item failed | an item fails |
| item failed | sending | **再試行** |
| sending | saved | every item saved; after 1 s the extension completes |
| any | closed | **キャンセル** / **閉じる** / swipe down when not sending |

While sending, the swipe-down dismissal is disabled (`isModalInPresentation`); only
**キャンセル** ends it. Not allowed: changing the drive or folder while sending or after a
failure (the remaining items go where the first went); remembering anything from a share
that did not save every item.

The mirror (SPEC-IOS-001): absent, or present for exactly one origin. It never holds a
token for an origin other than `share.server`.

### 4. Data read and written

- App Group `UserDefaults`: `share.server` (written by the app), `share.lastDrive.<origin>`
  and `share.folder.<origin>.<drive>` (written by the extension after a full save; both
  deleted by the app on leave).
- Keychain item `litloft.share.session` in the group's access group: written and deleted by
  the app, read by the extension.
- `WKHTTPCookieStore`: read by the app (as today, plus the observer).
- Extension temporary directory: each shared file is copied out of
  `loadFileRepresentation`'s temporary URL before its handler returns, and deleted when the
  item is saved, fails or the extension ends.
- Server, through existing endpoints only: `files`, `inbox_items`, the upload temp
  directory, knowledge's `ClipJob`. SPEC-CORE-033 adds no table and no column.
- `UserDefaults.standard["serverURL"]`: unchanged; the app still reads its own copy.

### 5. External services

- The user's Litloft server, over the LAN or whatever route reaches it. Slow: per-request
  timeouts above, progress keeps moving or stops visibly. Down: the blocked or item-failed
  state. Wrong (an unexpected body): treated as a failed request.
- The knowledge addon behind the core proxy, for web clips only. Not installed or off for
  the drive: the link becomes a link note before sending.
- iOS: the share host app, `NSItemProvider`, the keychain, and the extension's memory and
  lifetime limits.

### 6. Authorization

- The extension sends the mirrored `access_token` as `Authorization: Bearer`, which
  `get_unlocked_groups` already prefers over the cookie. Every endpoint used checks drive
  access as it does for the web UI (`check_drive_access` on drives, uploads and create;
  the addon proxy's `X-Lit-Drive` check). Nothing new is granted: the extension can reach
  exactly the drives the app's session reaches.
- The viewer is the mirrored `lit_viewer` value sent as `X-Lit-Viewer`; the proxy turns
  it into `X-Lit-Viewer-Id` as for the browser and strips any client-sent id.
- The token is sent only to `share.server`'s origin and only when the keychain item's
  `origin` matches it.
- The extension's `Info.plist` sets `NSAllowsArbitraryLoads`, because the extension's
  traffic goes through `URLSession`, which the app's `NSAllowsArbitraryLoadsInWebContent`
  does not cover, and a server reached by a plain-HTTP hostname would otherwise be refused.
  The extension only ever connects to the configured server.

### 7. Effect on existing features

- Upload init: one more accepted `inbox_source` value; `"upload"` and omission unchanged.
- Inbox page and `list_inbox`: rows with source `share` and the new label; nothing else.
- Text-file create and knowledge clips: unchanged; called by a new client.
- iOS app: a cookie observer and group writes at launch, on connect, on cookie change and
  on leave. Navigation, playback, the bridge and `shell-contract.json` are unchanged.
- Web Quick Note: unchanged; its remembered drive (browser `localStorage`) and the share
  extension's are separate.
- Building the app: the target gains the App Groups entitlement, so device signing needs a
  team that can register the group (Xcode's automatic signing does). The simulator build
  without a team keeps working.

### 8. Error behavior

As in 2. The sheet's messages are listed in 9. The extension logs each failed request
(method, path without query, status) with `os.Logger`, subsystem the extension's bundle
id; nothing about content. The server logs as today.

### 9. User-visible behavior

The sheet (iPhone, the system sheet with a navigation bar; light and dark follow the
system appearance; colours from DESIGN.md §2: **保存** in `accent`, success in
`accent-teal`, errors in `danger`):

- Navigation bar: **キャンセル** / **Cancel**, title **Litloft**, **保存** / **Save**.
- Preview, by kind:
  - files: up to 4 thumbnails (from the item provider's preview image, else a type icon),
    `N 件 · <total size>`;
  - web clip: the page's host and the URL in two lines, labelled **Web クリップ** /
    **Web clip**;
  - link note: the same, labelled **リンクのメモ** / **Link note**;
  - text: the first 6 lines of the text and the file name it will get, labelled **メモ** /
    **Note**.
- Destination, an inset-grouped list: **ドライブ** / **Drive** with the drive name, and
  **フォルダ** / **Folder** with `<folder>/` or **ルート** / **Root**. Each opens a picker:
  drives as a list with a check; folders one level at a time from
  `GET /api/drives/{drive}/folder-tree?root=<path>`, with **ここに保存** / **Save here**,
  and `Inbox` shown at the top of the root level even when it does not exist yet (it is
  created by the first save).
- Sending: **保存** becomes a spinner; each item has a row with its name and a progress bar
  (files) or spinner; saved rows show a check.
- Saved: **保存しました** / **Saved** and `<drive> · <folder>/` with a check in
  `accent-teal`, for 1 s.
- Failures: the item row turns `danger` with the message and **再試行** / **Retry**;
  the bar shows **閉じる** / **Close** in place of **キャンセル**.
- Strings: Japanese and English through a String Catalog in the extension, chosen by the
  device language.
- Defaults: the folder is `Inbox`; the drive is the last one saved to.

In Litloft: the item appears in the drive's inbox with the source **共有** / **Shared**
(files, text, link notes) or **Web クリップ** (clips), and in the folder chosen.

Docs: `docs/user-guide/ios-app.md` (a "Sharing to Litloft" section: what each kind
becomes, where it goes, keep the sheet open until it finishes, locked drives); 
`docs/user-guide/inbox.md` ("What arrives": shares from the iOS app);
`docs/reference/api.md` (`inbox_source` accepts `"share"`).

### 10. Non-functional

- Memory: a file is never read whole. The extension holds at most one 5 MiB chunk of it
  in memory. Extension memory is limited by iOS (about 120 MB, not documented); the
  thumbnails of 20 photos and the sheet must fit beside it, which R-5 checks on a device.
- Requests: a 10 GiB file is 2048 chunk requests; the server keeps one temporary file per
  chunk, as it does for the web upload.
- Size: per file, the server's `LITLOFT_MAX_UPLOAD_SIZE_GB` (50 GiB by default), as for
  the web upload. The extension imposes no cap of its own.
- Time: the upload runs while the sheet is open; there is no background transfer. On a
  home LAN at 20 MB/s, 1 GB takes about a minute.
- Disk: a shared file exists twice on the phone while it is sent (the provider's copy and
  the extension's), and is deleted after.
- Concurrency: one item at a time, one request at a time per item.
- Privacy: the token sits in the keychain, readable only by the app and its extension; the
  extension logs no content, file names or URLs.
- Cost: no extra server round trip per item beyond the web upload's.

## Touch points

Core backend (SPEC-CORE-033):
- `backend/app/schemas.py`: `UploadInitRequest.inbox_source` Literal.
- `backend/app/services/inbox.py`: `SHARE_SOURCE`, `SHARE_I18N_KEY`, the source → key
  lookup.
- `backend/app/services/upload.py`: `complete_upload` uses the lookup instead of
  `UPLOAD_I18N_KEY`.
- `backend/tests/test_inbox_arrival.py`: the accepted and rejected values.

Core frontend:
- `frontend/src/messages-core/ja.json`, `en.json`: `inbox.sourceShare`.

iOS (SPEC-IOS-001, SPEC-IOS-002):
- `ios/Litloft.xcodeproj/project.pbxproj`: a Share Extension target `LitloftShare`
  embedded in the app; App Groups entitlement on both; the extension's sources compiled
  into `LitloftTests` as well, so its logic is tested there.
- `ios/Config/Shared.xcconfig`: `LITLOFT_APP_GROUP`, derived from the bundle id and suffix.
- `ios/Litloft/Litloft.entitlements`, `ios/LitloftShare/LitloftShare.entitlements` (new).
- `ios/LitloftShare/Info.plist` (new): activation rule, `NSAllowsArbitraryLoads`.
- `ios/Litloft/Settings/ServerSettings.swift`: write and delete the group's server.
- `ios/Litloft/Web/SessionCookies.swift`, `ios/Litloft/Web/WebView.swift` or
  `WebViewModel.swift`: the cookie observer and the mirror.
- `ios/Litloft/Share/` (new, shared with the extension): `SharedSession` (group defaults +
  keychain, behind a protocol), the destination resolver, the folder validator, the
  Quick Note filename port.
- `ios/LitloftShare/` (new): the extension's view controller, the SwiftUI sheet, the item
  classifier, the API client, the chunk reader, the send queue, the String Catalog.
- `ios/LitloftTests/`: tests for the mirror (with `FakeCookieJar` and a fake keychain), the
  classifier, the destination resolver, the filename port, the chunk reader, and the send
  queue against `StubServer`. These are in `test_dirs` already; `process/process.conf` is
  not edited.

Docs: as listed in 9.

Rules passed through: `.claude/rules/design-decisions.md` (the drive is a security
boundary and the remembered drive is per server; locked drives answer 404; watch-history
and profile: the JWT and the viewer identity stay orthogonal headers; inbox sources are not
interpreted by the core), `.claude/rules/backend-conventions.md`,
`.claude/rules/frontend-conventions.md` (translation keys only in `messages-core/`),
`DESIGN.md` §2. No protected path is edited; no HIGH zone is touched.

## Invariants

I1. Every item a share saves has an open inbox row in the drive it was saved to: a file through an upload whose init carried `inbox_source: "share"`, text and a link note through a create whose `arrival` is `{ "share", "inbox.sourceShare" }`, a web clip through knowledge with source `web_clip`.
I2. Upload init accepts exactly `"upload"` and `"share"` as `inbox_source`, stores `inbox.sourceUpload` and `inbox.sourceShare` respectively, and answers 422 with nothing created for any other value.
I3. Every item of one share goes to the drive and folder shown when **保存** was pressed; a retry after a failure uses the same destination.
I4. The remembered drive and folder are written only after every item of a share is saved; a remembered drive that `GET /api/drives` does not list is never preselected, and with several drives and no usable memory no drive is preselected and **保存** is disabled.
I5. The extension sends `Authorization` only to the origin stored in the keychain item, and only when it equals `share.server`; after the viewer leaves the server or locks, the group holds no token for it.
I6. The keychain item's `access_token` and `viewer` equal the `access_token` and `lit_viewer` cookies the app holds for its server, after launch and after every cookie change; when the app holds neither, the item does not exist.
I7. An upload that fails or is cancelled leaves no file and no inbox row for that item on the server, and leaves the items saved before it in place.
I8. An upload whose name is taken lands under the first free `<stem> (N)<.ext>` name; no share overwrites an existing file or fails on a name collision while N ≤ 99 is free.
I9. A link is sent to knowledge only when `/api/addons/status?drive=` lists `knowledge` for the chosen drive and a viewer is mirrored; otherwise it is saved as a link note, and the preview shows which before **保存**.
I10. Shared text is stored byte-for-byte as UTF-8, and the extension never holds more than one chunk of a shared file in memory.

## Checked, no action

- **Background transfer (`URLSession` background configuration).** Background sessions
  take only file uploads, and the chunked API needs an init answer before the chunks and a
  complete after them; chaining them relaunches the containing app per task, with delays
  iOS decides. A single-request upload endpoint would make it fit but is a new core API
  for one client. Recorded as the follow-up if foreground sending proves too short on the
  device.
- **Unlocking from the sheet.** The password would have to be typed into a share sheet,
  and the resulting cookie written back into the app's web view store. The hint sends the
  viewer to the app once; the mirror carries the session from then on.
- **Recording a shared URL as `share`.** It would need knowledge to accept an arrival
  override on `POST /clips` (a change to the addon's API and its tests, and to
  SPEC-ADDON-059's constant). The inbox label **Web クリップ** already says what the item is
  and how to treat it; where it came from matters less for triage.
- **Several kinds in one share.** One share is one kind (files, else link, else text), so
  the preview is one shape. Text shared beside a URL becomes the clip's title or is not
  saved; the preview shows only the link, so nothing is dropped without being visible.
- **SPEC-CORE-032 says the only accepted `inbox_source` is `"upload"`.** That is a
  normal-flow sentence, not one of its invariants (I1 still holds: an arrival comes only
  from an upload with `inbox_source` or a create with `arrival`). No `## Revises` entry;
  this spec's I2 is the rule from here on, and `docs/reference/api.md` changes with it.
- **The web Quick Note's remembered drive.** It lives in the web view's `localStorage`,
  which the extension cannot read; sharing it would need a bridge message. Separate
  memories are the smaller change.
- **Creating a folder from the picker.** The default `Inbox` is created by the first save;
  other folders are made in the app.
- **A clip retried after a 502.** The placeholder of the failed attempt can stay beside
  the retried one, as it does for a web clip retried today.
- **iPad.** The extension runs on iPad with the same sheet; no iPad-specific layout.
- **Android / PWA `share_target`.** Out of scope by decision.
- **Extension localisation versus the app.** The app's own native screens are English
  only; the sheet gets Japanese and English because it is the native screen used most.

## Pending human confirmation

Each is written into the spec as recommended; approval of the spec confirms them.

1. The app mirrors the server and the `access_token` / `lit_viewer` cookie values into an
   App Group and a group keychain item, kept current by a cookie observer and deleted on
   leave and lock; the extension does not unlock drives itself. An expired or missing
   token gives public drives only, with a hint to unlock in the app. (Recommended: no
   second login surface, and the extension can never see more than the app.)
2. Shared files and text arrive as `share` (**共有** / **Shared**); a shared URL that is
   clipped arrives as `web_clip`, with no knowledge change. (Recommended: the label tells
   what the item is; changing knowledge buys only provenance.)
3. Files are sent while the sheet is open, in chunks read from disk, with no extension
   size cap beyond the server's; the sheet cannot be swiped away while sending, and
   leaving it loses the unsent items. (Recommended: fits the existing chunked API with no
   new endpoint; background transfer is the follow-up if device measurement says so.)
4. The remembered drive and folder live in the App Group, per server, written only after
   a complete save; default folder `Inbox`. (Recommended: same rules as Quick Note.)
5. A link becomes a link note when knowledge is off for the drive or no profile is set,
   and the preview says so. (Recommended: the share still succeeds and nothing is hidden.)
6. The extension allows plain HTTP to any host (`NSAllowsArbitraryLoads`). (Recommended:
   the server may be reached by a plain-HTTP hostname, which the app's web content
   exception does not cover for `URLSession`.)
7. One share is one kind; text beside a URL becomes its title or is dropped; at most 20
   files. (Recommended: one preview shape.)
8. The sheet closes by itself 1 s after a full save; it has Japanese and English strings.
   (Recommended: the share menu is a quick action.)
9. The sheet design (artifact "C4 共有シート").
