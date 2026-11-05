# Save to Litloft from the iPhone share menu

SPEC-ID: SPEC-CORE-033
SPEC-ID: SPEC-IOS-001
SPEC-ID: SPEC-IOS-002

Approval:

## Summary

Today a page, a passage of text or a photo found on the phone reaches Litloft only if
the viewer opens the app and uploads it by hand. This change adds **Litloft** to the iOS
share menu. A shared URL becomes a web clip through the knowledge addon. Shared text
becomes a Markdown note. Shared photos and files are uploaded. Everything saved this way
arrives in the drive's inbox (SPEC-CORE-032). It lands in the `Inbox` folder of the
remembered drive unless the viewer picks another drive or folder in the sheet.

- **SPEC-CORE-033**: the core accepts `"share"` as an upload's `inbox_source` and
  records it with the i18n key `inbox.sourceShare`. The inbox shows it as **共有** /
  **Shared**. No other core behaviour changes: the text note and the link note use the
  existing `arrival` field of `POST /api/drives/{drive}/files`.
- **SPEC-IOS-001**: the app mirrors its server address and its session (the
  `access_token` and `lit_viewer` cookies) into an App Group and a keychain item that
  the share extension can read. It keeps the copy current and deletes it when the viewer
  leaves the server or locks.
- **SPEC-IOS-002**: a Share Extension target. It classifies what was shared and picks
  the destination. It shows the sheet: the preview, the drive and folder, progress and
  errors. It sends the items through the public API and remembers the destination.

Out of scope:

- Android and the PWA `share_target` (the user decided this on 2026-11-05).
- Uploading after the sheet has closed (background transfer).
- Unlocking a drive from the sheet.
- The share menu on macOS.

The user decided the entry point, the three kinds and the destination on 2026-11-05.
The design artifact is "C4 共有シート": a mockup in the session scratchpad, which the main
session publishes.

## Required items

### 1. Normal flow

Terms used below:

- The **server** is the URL the app connects to, normalised by `ServerAddress.parse`.
- Its **origin** is `scheme://host[:port]`.
- The **group** is the App Group `group.$(LITLOFT_BUNDLE_ID)$(LITLOFT_BUNDLE_ID_SUFFIX)`.
  A Debug build and a Release build therefore have separate groups.
- **Local time** is the device's time zone, as Quick Note uses the browser's.

#### SPEC-IOS-001: the app keeps the mirror

1. One object, `SessionMirror` (`ios/Litloft/Share/SessionMirror.swift`), owns the mirror
   for one server. `WebShell` creates it for its `serverURL`. It is **armed** when the web
   view first commits a main-frame navigation to that server's origin
   (`WebView.Coordinator.webView(_:didCommit:)`). The commit happens after the default
   data store has loaded its cookies. Before it is armed, the mirror writes nothing and
   deletes nothing. Reading an empty cookie store at launch therefore never removes an
   existing item.
2. When armed, it registers as the `WKHTTPCookieStoreObserver` of the default data store.
   It then writes once, and again on every `cookiesDidChange(in:)`:
   - the group's `UserDefaults` key `share.server`: the server's absolute string;
   - one keychain item, holding `{ "origin", "access_token"?, "viewer"? }`:
     - generic password, service `litloft.share.session`;
     - access group: the group;
     - `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`;
     - values: the cookies that `SessionCookies.session(in:host:)` selects for the
       server's host, copied as stored. `lit_viewer` is percent-encoded by the page and
       is sent as is (SPEC-IOS-002 step 6).

   When the armed store holds neither cookie, the item is deleted rather than written
   empty. The mirror writes only for the server it was created for. It never reads
   `ServerSettings`, so after a leave it has no server to write.
3. Leaving: `RootView`'s change-server action first calls `SessionMirror.disarm()`, which
   removes the observer synchronously. Then it calls `ServerSettings.leave`, which
   deletes the cookies (no observer sees them go) and then, through `forget()`, deletes:
   - `share.server`;
   - every `share.*` key of the group;
   - the keychain item.

   `forget()` does this deletion whenever it is called.
4. Locking in the page deletes `access_token`. The armed observer then rewrites the item
   without it, so the extension sees exactly the drives the app sees.

#### SPEC-IOS-002: the share

1. **Activation.** The extension activates for:
   - at most one web URL (`NSExtensionActivationSupportsWebURLWithMaxCount` 1);
   - text (`NSExtensionActivationSupportsText`);
   - up to 20 images, movies and files (`SupportsImageWithMaxCount`,
     `SupportsMovieWithMaxCount` and `SupportsFileWithMaxCount`, each 20).

   Its name in the share menu is `$(LITLOFT_DISPLAY_NAME)`, so a Debug build shows
   **Litloft Dev**.
2. **Classification.** The input items are classified into one kind. The first match
   wins:
   - **files**: every attachment with a file representation (`public.image`,
     `public.movie`, or `public.data` that is not `public.url` or `public.plain-text`) is
     one upload, in the order shared. A URL or text shared beside files is not saved, and
     the preview shows only the files.
   - **link**: an attachment conforming to `public.url` whose scheme is `http` or
     `https`. The clip's `title` is the first of these that is non-empty and, once
     trimmed, a single line of at most 200 characters:
     1. the extension item's `attributedTitle`;
     2. its `attributedContentText`;
     3. a `public.plain-text` attachment.

     Otherwise there is no title. Text beside a link is not saved as a note.
   - **text**: a `public.plain-text` attachment, saved as a Markdown note.
   - **nothing**: none of the above matches (a `mailto:`, `file:` or other non-http URL,
     or only unsupported attachments). The sheet shows **保存できるものがありません** and
     **閉じる**. Nothing is sent.
3. **Session and drives.** The extension reads `share.server` from the group, and the
   keychain item when its `origin` equals the server's origin. It then sends
   `GET /api/drives` and `GET /api/auth/status` in parallel. Every request carries:
   - `Authorization: Bearer <access_token>` when a token is mirrored;
   - `X-Lit-Viewer: <viewer>` when a viewer is mirrored.
4. **Destination.**
   - Drive: `share.lastDrive.<origin>` when it is in the `GET /api/drives` answer. Else
     the only drive, when there is exactly one. Else none, and **保存** stays disabled
     until the viewer picks one. This is `resolveQuickNoteDrive`'s rule without a
     current drive.
   - Folder: `share.folder.<origin>.<drive>` when it passes the same check as
     `isValidQuickNoteFolder`, else `Inbox`. The empty string is the drive root.
5. **Link kind.** For the link kind, the extension asks
   `GET /api/addons/status?drive=<drive>`, and asks again when the drive changes.
   - While that request is pending, the preview's kind label shows a spinner and **保存**
     is disabled.
   - The link is a **web clip** when `knowledge` is in `addons` and a viewer is mirrored.
   - It is a **link note** when either is missing, or when the request failed.

   The preview names the kind before **保存** is pressed.
6. **Sending.** On **保存** the destination is fixed for this share. The items are sent
   one at a time, in order:
   - **file**:
     1. `POST /api/drives/{drive}/upload/init` with `filename`, `file_size`,
        `folder_path`, `chunk_size` and `inbox_source: "share"`. `chunk_size` is
        5 MiB for every file.
     2. Each chunk, read from the file on disk, to `/upload/{id}/chunk`.
     3. `/complete`.

     A 409 from init whose detail is `File already exists` is retried with
     `<stem> (N)<.ext>`, for N from 1 to 99. This is the suffix the server gives a
     created file. Any other 409 fails the item. The upload is the original file as
     the item provider gives it (see 9 for the name).
   - **text**: `POST /api/drives/{drive}/files` with:
     - `path`: `<folder>/<name>.md`, the name by Quick Note's `deriveQuickNoteFilename`
       rule, ported to Swift and run with the local time;
     - `content`: the shared text as UTF-8, unchanged;
     - `conflict_mode: "rename"`;
     - `arrival: { "source": "share", "i18n_key": "inbox.sourceShare" }`.
   - **web clip**: `POST /api/addons/knowledge/clips` with
     `{ url, subfolder, title? }`. `subfolder` is the folder, left out for the root. The
     request carries `X-Lit-Drive: <percent-encoded drive>` and `X-Lit-Viewer: <viewer>`.
     Knowledge records the arrival as `web_clip`.
   - **link note**: as text, with:
     - content `<title>\n\n<url>\n`, or `<url>\n` without a title;
     - name: the Quick Note rule applied to the title, or
       `<host> <YYYYMMDD-HHmmss>.md` in local time without one.
7. **Progress and finish.** Each item's row shows its progress (bytes sent for a file, a
   spinner otherwise) and then a check. When every item is saved, the extension:
   - writes `share.lastDrive.<origin>` and `share.folder.<origin>.<drive>`;
   - shows **保存しました** with the folder for 1 s;
   - completes the extension request.

#### Requests that create a file

A request that creates a file is `/complete`, a text or link-note create, or a clip
`POST`. Each one is sent at most once per item, and **キャンセル** never aborts one in
flight. Timeouts:

| Request | Timeout |
|---|---|
| JSON requests (drives, status, addons, init, by-path, delete) | 30 s |
| A chunk | 120 s |
| A create or a clip | 60 s |
| `/complete` (assembly of a large file takes time on the server) | 15 min |

When a file-creating request ends without an answer (timeout or connection lost):

- **Upload.** The extension asks
  `GET /api/drives/{drive}/files/by-path?path=<the init's target>`. Init succeeded only
  because no file was at that path, so a file found there is this upload. Found: the
  item is shown as saved. Not found: the item fails. Either way the item is not sent
  again by the extension on its own.
- **Text, link note or clip.** The item shows **保存されたか確認できません**. Its retry
  is labelled **もう一度保存**, and pressing it can make a second copy (the name gets the
  server's ` (1)` suffix). There is no by-path check, because the rename mode or the
  clip's own naming makes the final name unknowable.

#### SPEC-CORE-033

1. `UploadInitRequest.inbox_source` becomes `Literal["upload", "share"] | None`. The
   session keeps it.
2. `complete_upload` records the arrival with the i18n key looked up from the source:
   `upload` → `inbox.sourceUpload`, `share` → `inbox.sourceShare`. Everything else about
   the arrival is SPEC-CORE-032's: the same commit, the three branches, and
   `inbox.updated` after the commit. A subtitle sidecar still produces no file row and
   no arrival.
3. `frontend/src/messages-core/ja.json` and `en.json` gain `inbox.sourceShare`: **共有** /
   **Shared**. The inbox row's meta line shows it like any other source.

### 2. Failure cases

#### SPEC-IOS-001

- **A keychain write fails.** It is logged, and the previous item stays. The extension
  may then use a stale token. The server answers a stale token as locked, because a
  Bearer credential never falls back to the cookie. The worst case is fewer drives,
  never another server's drive.
- **The app does not run after a cookie changes.** The mirror is refreshed the next time
  the app arms. A token that expired meanwhile is answered as locked.
- **The app has not been launched since the update.** There is no `share.server`; see
  below.

#### SPEC-IOS-002

- **No `share.server`.** The sheet shows **Litloft を開いてサーバーに接続してください**
  and no **保存**.
- **Server unreachable, or a request times out.** The sheet shows
  **Litloft に接続できません** with **再試行**. The retry repeats step 3, or repeats
  the failed item under the rules above.
- **Local network access denied.** A request fails, and `NWPathMonitor` reports
  `unsatisfiedReason == .localNetworkDenied`. The sheet shows
  **ローカルネットワークへのアクセスが許可されていません** with **設定を開く**, which
  opens the app's page in Settings.
- **`GET /api/drives` is empty.** The sheet shows **保存先のドライブがありません**, and
  no **保存**.
- **Locked drives may be hidden.** When `has_protected_drives` is true and
  `unlocked_groups` is empty, the drive list shows the public drives and the line
  **鍵のかかったドライブは Litloft で解錠すると選べます**.
- **An item fails before its file-creating request is sent.** This covers any status
  other than the retried 409, and network errors. For an upload, the extension sends
  `DELETE /api/drives/{drive}/upload/{id}` (best effort).
  - The item shows its error and **再試行**.
  - The items after it are not sent until the viewer retries or presses **閉じる**.
  - Items saved before it stay saved.
  - A retry starts the item from its first request.
- **A drive that answers 404 (or 403 through the addon proxy) after it was listed.** The
  item shows **このドライブには保存できません**. The drive row becomes tappable again
  (pending human confirmation, question 7): a new drive applies to this item and the
  ones after it. Saved items stay where they are.
- **Upload init answers 400 `File too large`.** The item shows the server's limit.
- **Upload init answers 507.** The item shows **空き容量が足りません**.
- **Shared text over 1 MiB (UTF-8).** The preview shows its size and
  **テキストが大きすぎます（1 MB まで）**, and **保存** is disabled (pending human
  confirmation, question 6).
- **Clip 401 (viewer rejected) or 400 (URL rejected).** The item shows the error and
  offers **リンクとして保存**, which saves it as a link note.
- **Clip 502 after the placeholder was created.** It is shown as an error. A retry can
  leave a second placeholder (see Checked, no action).
- **キャンセル during sending.**
  - The upload in progress is cancelled with `DELETE` when it is still in init or
    chunks.
  - A file-creating request in flight is awaited, and its result is shown.
  - Nothing after it is sent, and nothing is remembered.
  - The extension then completes.
- **iOS terminates the extension mid-share** (memory, or the host app leaves the
  foreground).
  - An unfinished upload session is abandoned on the server. Its chunks stay in the
    upload directory until the server restarts (pending human confirmation,
    question 5). No file and no inbox row exist for it.
  - A `/complete` already received by the server finishes, and its file lands with its
    inbox row.
  - Items already saved stay. Nothing is remembered.

#### SPEC-CORE-033

An `inbox_source` other than `"upload"` or `"share"` answers 422, and nothing is created.

### 3. States

The sheet:

| From | To | When |
|---|---|---|
| loading | ready | step 3 answered, a drive is chosen and (for a link) its kind is known |
| loading | needs drive | several drives and no usable memory |
| loading | blocked | no server, no drives, unreachable or local network denied (retry → loading) |
| loading | nothing to save | classification found no kind |
| needs drive | ready | the viewer picks a drive |
| ready | ready | the viewer changes the drive or folder |
| ready | sending | **保存** |
| sending | item failed | an item fails, or its result is unknown |
| item failed | sending | **再試行** / **もう一度保存** |
| item failed | item failed | the viewer picks another drive after a 404 / 403 |
| sending | saved | every item saved; after 1 s the extension completes |
| any but sending | closed | **キャンセル** / **閉じる** / swipe down |
| sending | closed | **キャンセル**, after the request in flight that creates a file answers |

While sending, the swipe-down dismissal is disabled (`isModalInPresentation`).

Not allowed:

- changing the folder after **保存**;
- changing the drive after **保存**, except after a 404 / 403;
- remembering anything from a share that did not save every item.

The mirror (SPEC-IOS-001) is in one of these states:

- not armed: it writes nothing and deletes nothing;
- armed: the item equals the store;
- disarmed: it writes nothing.

The group never holds a token for an origin other than `share.server`.

### 4. Data read and written

- **App Group `UserDefaults`.**
  - `share.server` is written by the app's mirror.
  - `share.lastDrive.<origin>` and `share.folder.<origin>.<drive>` are written by the
    extension after a full save.
  - `forget()` deletes all three.
- **Keychain item `litloft.share.session`** in the group's access group. The app's mirror
  writes and deletes it; the extension reads it.
- **`WKHTTPCookieStore`.** Read by the app, as today, plus the observer.
- **The extension's temporary directory.** Each shared file is copied out of
  `loadFileRepresentation`'s temporary URL before its handler returns. The copy is
  deleted when the item is saved or fails, or when the extension ends.
- **The server, through existing endpoints only.** `files`, `inbox_items`, the upload
  temp directory, and knowledge's `ClipJob`. SPEC-CORE-033 adds no table and no column.
- **`UserDefaults.standard["serverURL"]`.** Unchanged; the app still reads its own copy.

### 5. External services

- **The user's Litloft server**, over the LAN or whatever route reaches it.
  - Slow: the timeouts in 1 apply, and progress keeps moving or visibly stops.
  - Down: the blocked or item-failed state.
  - Wrong (an unexpected body): treated as a failed request.
- **The knowledge addon behind the core proxy**, for web clips only. When it is not
  installed, or off for the drive, the link becomes a link note before sending.
- **iOS**: the share host app, `NSItemProvider`, the keychain, local network privacy, and
  the extension's memory and lifetime limits.

### 6. Authorization

- **Token.** The extension sends the mirrored `access_token` as
  `Authorization: Bearer`, which `get_unlocked_groups` already prefers over the cookie.
  Every endpoint used checks drive access as it does for the web UI:
  `check_drive_access` on drives, uploads, create and by-path, and the addon proxy's
  `X-Lit-Drive` check. Nothing new is granted: the extension can reach exactly the
  drives the app's session reaches.
- **Viewer.** The mirrored `lit_viewer` value is sent as `X-Lit-Viewer`. The proxy turns
  it into `X-Lit-Viewer-Id`, as it does for the browser, and strips any id the client
  sent. The value is sent exactly as the cookie stores it. Starlette does not
  percent-decode cookies, so the browser's viewer id is the hash of this same string.
- **Origin.** The token is sent only to `share.server`'s origin, and only when the
  keychain item's `origin` matches it.
- **Plain HTTP.** The extension's `Info.plist` sets `NSAllowsArbitraryLoads`. Its traffic
  goes through `URLSession`, which the app's `NSAllowsArbitraryLoadsInWebContent` does
  not cover, so a server reached by a plain-HTTP hostname would otherwise be refused.
  The extension only ever connects to the configured server.
- **Local network.** The extension's `Info.plist` sets `NSLocalNetworkUsageDescription`,
  and so does the app's. A share is often the first local connection the extension makes,
  so iOS can ask for permission from the share sheet.

### 7. Effect on existing features

- **Upload init.** One more accepted `inbox_source` value; `"upload"` and omission are
  unchanged.
- **Inbox page and `list_inbox`.** Rows with source `share` and the new label; nothing
  else.
- **Text-file create, by-path and knowledge clips.** Unchanged; called by a new client.
- **iOS app.** It gains a cookie observer, armed at the first commit, and group writes.
  Leave now disarms and deletes. Navigation, playback, the bridge and
  `shell-contract.json` are unchanged.
- **Web Quick Note.** Its behaviour is unchanged; its remembered drive (browser
  `localStorage`) and the share extension's are separate. Its filename rule gains a
  fixture table that the Swift port is checked against.
- **Building the app.** Both targets gain the App Groups entitlement. Device signing
  needs a paid Apple Developer Program team (see Checked, no action). The simulator
  build without a team keeps working.

### 8. Error behavior

- **What the viewer sees.** The messages in 2, worded as listed in 9.
- **What the extension logs.** Each failed request goes to `os.Logger`, with the
  extension's bundle id as subsystem. A log entry carries:
  - the method;
  - the path template (`/api/drives/{drive}/upload/{id}/chunk`, with no drive name, file
    name, folder, query or URL);
  - the status or the `URLError` code.

  No content, file name, folder or shared URL is logged.
- **What the app logs.** A keychain failure, with its `OSStatus` only.
- **The server** logs as today.

### 9. User-visible behavior

The sheet is the iPhone system sheet with a navigation bar. Light and dark follow the
system appearance. Colours come from DESIGN.md §2: **保存** in `accent`, success in
`accent-teal`, errors in `danger`.

- **Navigation bar.** **キャンセル** / **Cancel**, the title **Litloft**, and
  **保存** / **Save**.
- **Preview, by kind.**
  - Files: up to 4 thumbnails (the item provider's preview image, else a type icon),
    and `N 件 · <total size>`.
  - Web clip: the page's host and the URL, in two lines, labelled **Web クリップ** /
    **Web clip**.
  - Link note: the same, labelled **リンクのメモ** / **Link note**.
  - Text: the first 6 lines of the text and the file name it will get, labelled
    **メモ** / **Note**.
- **Destination**, an inset-grouped list.
  - **ドライブ** / **Drive** shows the drive name, and opens a list of drives with a
    check on the current one.
  - **フォルダ** / **Folder** shows `<folder>/` or **ルート** / **Root**. It opens the
    folders one level at a time from
    `GET /api/drives/{drive}/folder-tree?root=<path>`, with **ここに保存** /
    **Save here**. At the root level, `Inbox` is listed first even when the drive has
    no such folder; the first save creates it.
- **Sending.** **保存** becomes a spinner. Each item has a row with its name and either
  a progress bar (files) or a spinner. Saved rows show a check.
- **Saved.** **保存しました** / **Saved**, then `<drive> · <folder>/`, with a check in
  `accent-teal`, for 1 s.
- **Failures.** The item row turns `danger` and shows its message with **再試行** /
  **Retry** (or **もう一度保存** / **Save again** when the result is unknown). The bar
  shows **閉じる** / **Close** in place of **キャンセル**.
- **Strings.** Japanese and English, through a String Catalog in the extension, chosen by
  the device language.
- **Defaults.** The folder is `Inbox`; the drive is the last one saved to.
- **Upload file names.** The item provider's `suggestedName` with the extension of the
  file it delivers (`IMG_4021.HEIC`, `IMG_4025.MOV`, or `FullSizeRender.heic` for an
  edited photo). Without a suggested name, the name is `shared-<YYYYMMDD-HHmmss>-<n>.<ext>`
  in local time, where n is the item's position. Photos and movies are uploaded in their
  original format (pending human confirmation, question 4).

In Litloft, the item appears in the drive's inbox and in the folder chosen. Its source is
**共有** / **Shared** for files, text and link notes, and **Web クリップ** for clips. A
shared subtitle file (`.srt`, `.vtt`, …) is saved as a sidecar and, as for any upload,
has no inbox row.

Docs:

- `docs/user-guide/ios-app.md`:
  - a "Sharing to Litloft" section: what each kind becomes, where it goes, keeping the
    sheet open until it finishes, locked drives, and the local network prompt;
  - step 2 of "Building and installing": a paid Apple Developer Program team is required
    to install on a phone.
- `docs/user-guide/inbox.md`: under "What arrives", shares from the iOS app.
- `docs/reference/api.md`: `inbox_source` accepts `"share"`.

### 10. Non-functional

- **Memory.** A file is never read whole: the extension holds at most one 5 MiB chunk of
  it in memory. iOS limits extension memory (about 120 MB, not documented). The
  thumbnails of 20 photos and the sheet must fit beside the chunk, which R-5 checks on a
  device.
- **Requests.** A 10 GiB file takes 2048 chunk requests. The server keeps one temporary
  file per chunk, as it does for the web upload.
- **Size.**
  - A file: up to the server's `LITLOFT_MAX_UPLOAD_SIZE_GB` (50 GiB by default), as for
    the web upload. The extension sets no limit of its own.
  - Text: up to 1 MiB.
- **Time.** The upload runs while the sheet is open; there is no background transfer. On
  a home LAN at 20 MB/s, 1 GB takes about a minute.
- **Disk.** A shared file exists twice on the phone while it is sent (the provider's copy
  and the extension's), and the extension's copy is deleted afterwards.
- **Concurrency.** One item at a time, and one request at a time per item.
- **Privacy.** The token is kept in the keychain, where only the app and its extension
  can read it. The logs carry no content, names or URLs.
- **Cost.** No extra server round trip per item beyond the web upload's, except the one
  by-path request after an unanswered `/complete`.

## Touch points

Core backend (SPEC-CORE-033):

- `backend/app/schemas.py`: the `UploadInitRequest.inbox_source` Literal.
- `backend/app/services/inbox.py`: `SHARE_SOURCE`, `SHARE_I18N_KEY` and the lookup from
  source to key.
- `backend/app/services/upload.py`: `complete_upload` uses the lookup instead of
  `UPLOAD_I18N_KEY`.
- `backend/tests/test_inbox_arrival.py`: the accepted and rejected values.

Core frontend:

- `frontend/src/messages-core/ja.json` and `en.json`: `inbox.sourceShare`.
- `frontend/src/components/quick-note/__tests__/fixtures/quick-note-filenames.json`
  (new): body, time and expected name. The `quickNoteFilename` tests read it, and so
  does the Swift test.

iOS (SPEC-IOS-001, SPEC-IOS-002):

- `ios/Litloft.xcodeproj/project.pbxproj`:
  - a Share Extension target, `LitloftShare`, embedded in the app;
  - `CODE_SIGN_ENTITLEMENTS` set on both targets;
  - the shared sources compiled into `LitloftTests` as well.
- `ios/Config/Shared.xcconfig`: `LITLOFT_APP_GROUP`, derived from the bundle id and
  suffix.
- `ios/Litloft/Litloft.entitlements` (new): App Groups.
- `ios/LitloftShare/LitloftShare.entitlements` (new): App Groups.
- `ios/Litloft-Info.plist`: `NSLocalNetworkUsageDescription`.
- `ios/LitloftShare/Info.plist` (new):
  - the activation rule;
  - `CFBundleDisplayName = $(LITLOFT_DISPLAY_NAME)`;
  - `NSAllowsArbitraryLoads`;
  - `NSLocalNetworkUsageDescription`.
- `ios/Litloft/Share/SessionMirror.swift` (new): the only cookie observer, with arm and
  disarm.
- `ios/Litloft/Share/` (new, shared with the extension):
  - `SharedSession`: the group defaults and the keychain, behind a protocol;
  - the destination resolver;
  - the folder validator;
  - the Quick Note filename port.
- `ios/Litloft/Web/WebView.swift`: arms the mirror at the first main-frame commit for
  the server.
- `ios/Litloft/Web/WebShell.swift`: owns the mirror for its `serverURL`.
- `ios/Litloft/RootView.swift`: the change-server action disarms the mirror before
  `leave`.
- `ios/Litloft/Settings/ServerSettings.swift`: `forget()` deletes the group keys and the
  keychain item.
- `ios/LitloftShare/` (new):
  - the extension's view controller and the SwiftUI sheet;
  - the item classifier;
  - the API client and its logger;
  - the chunk reader;
  - the send queue;
  - the String Catalog.
- `ios/LitloftTests/`: tests for:
  - the mirror (`FakeCookieJar` and a fake keychain);
  - the classifier;
  - the destination resolver;
  - the filename port, against the shared fixture;
  - the chunk reader;
  - the send queue against `StubServer`: unanswered `/complete`, cancel in flight, and
    the 409 suffix;
  - the logger.

  These live in a directory already listed in `test_dirs`, so `process/process.conf` is
  not edited.

Docs: as listed in 9, including `docs/user-guide/ios-app.md` step 2.

Rules passed through:

- `.claude/rules/design-decisions.md`:
  - the drive is a security boundary, and the remembered drive is kept per server;
  - locked drives answer 404;
  - watch history and profiles: the JWT and the viewer identity travel as separate
    headers;
  - the core does not interpret inbox sources.
- `.claude/rules/backend-conventions.md`.
- `.claude/rules/frontend-conventions.md`: translation keys only in `messages-core/`.
- `DESIGN.md` §2.

This change edits no protected path and touches no HIGH zone.

## Invariants

I1. Every item a share saves has an open inbox row in the drive it was saved to: a file through an upload whose init carried `inbox_source: "share"`, text and a link note through a create whose `arrival` is `{ "share", "inbox.sourceShare" }`, a web clip through knowledge with source `web_clip`; a subtitle sidecar, which has no file row, has no row.
I2. Upload init accepts exactly `"upload"` and `"share"` as `inbox_source`, stores `inbox.sourceUpload` and `inbox.sourceShare` respectively, and answers 422 with nothing created for any other value.
I3. Every item of one share goes to the folder shown when **保存** was pressed and to that drive, unless the viewer picks another drive after a 404 or 403, which applies only to the items not yet saved.
I4. The remembered drive and folder are written only after every item of a share is saved; a remembered drive that `GET /api/drives` does not list is never preselected; with several drives and no usable memory no drive is preselected and **保存** is disabled; the default folder is `Inbox`, listed first at the root level even when the drive has no such folder.
I5. The keychain item's `access_token` and `viewer` equal the cookies the app holds for its server after every cookie change once the mirror is armed, and the item is absent when the app holds neither; before arming nothing is written or deleted, after disarming nothing is written, and after a leave the group holds no server and no token; the extension sends `Authorization` only to the origin in the item and only when it equals `share.server`.
I6. An upload that fails or is cancelled before its `/complete` was sent leaves no file and no inbox row on the server; a `/complete`, create or clip request is sent at most once per item without the viewer pressing retry, and an upload whose `/complete` went unanswered is shown as saved exactly when by-path finds its target.
I7. An upload whose name is taken lands under the first free `<stem> (N)<.ext>`, N ≤ 99; no share overwrites an existing file.
I8. A link is sent to knowledge only when `/api/addons/status?drive=` answered with `knowledge` for the chosen drive and a viewer is mirrored; otherwise, including while that request is pending (**保存** disabled) or after it failed, it is a link note, and the preview shows the kind before **保存**.
I9. Shared text is stored byte-for-byte as UTF-8; a text or link note's name equals what web Quick Note's `deriveQuickNoteFilename` gives for the same body and local time (shared fixture), and a link note's content is `<title>\n\n<url>\n` or `<url>\n`.
I10. The extension uploads in 5 MiB chunks and never holds more than one chunk of a file in memory, and its logs contain no shared content, file name, folder name, drive name or URL.

## Checked, no action

- **Background transfer (`URLSession` background configuration).** A background session
  takes only file uploads. The chunked API needs the init answer before the chunks and a
  complete after them, and chaining those relaunches the containing app per task, with
  delays that iOS decides. A single-request upload endpoint would make it fit, but it
  would be a new core API for one client. It is recorded as the follow-up if sending in
  the foreground proves too short on the device.
- **Unlocking from the sheet.** The password would have to be typed into a share sheet,
  and the resulting cookie written back into the app's web view store. Instead, the hint
  sends the viewer to the app once, and the mirror carries the session from then on.
- **Recording a shared URL as `share`.** That would need knowledge to accept an arrival
  override on `POST /clips`: a change to the addon's API and its tests, and to
  SPEC-ADDON-059's constant. The inbox label **Web クリップ** already says what the item
  is and how to treat it; where it came from matters less for triage.
- **Several kinds in one share.** One share is one kind (files, else link, else text), so
  the preview has one shape. A URL or text beside files, and text beside a link that does
  not qualify as its title, is not saved. The preview shows only what is saved, so
  nothing is dropped out of sight.
- **SPEC-CORE-032 says the only accepted `inbox_source` is `"upload"`.** That is a
  normal-flow sentence, not one of its invariants: its I1 still holds, because an arrival
  comes only from an upload with `inbox_source` or a create with `arrival`. So there is
  no `## Revises` entry. This spec's I2 is the rule from here on, and
  `docs/reference/api.md` changes with it.
- **The web Quick Note's remembered drive.** It lives in the web view's `localStorage`,
  which the extension cannot read, and sharing it would need a bridge message. Keeping
  two separate memories is the smaller change.
- **Creating a folder from the picker.** The first save creates the default `Inbox`;
  other folders are made in the app.
- **Detecting an unanswered text create or clip.** The final name is decided by the
  server's rename or by knowledge's naming, so no lookup can tell this item from an
  earlier one. The sheet says the result is unknown and labels the retry
  **もう一度保存**. A clip retried after a 502 can leave a second placeholder, as a web
  clip retried today does.
- **Personal Team builds.** The app is built only by its owner, who signs it with a paid
  Apple Developer Program team (confirmed by the user on 2026-11-05). Both targets carry
  the App Groups entitlement unconditionally, with no build switch. Building with a
  Personal Team is not supported once this lands, and `docs/user-guide/ios-app.md`
  step 2 says a paid team is required. (Apple's capability table lists App Groups for
  every membership type, the free one included:
  https://developer.apple.com/help/account/reference/supported-capabilities-ios. Free
  provisioning still limits App IDs and profile lifetime, so it was not pursued.)
- **iPad.** The extension runs on iPad with the same sheet; there is no iPad-specific
  layout.
- **Android / PWA `share_target`.** Out of scope by decision.
- **Extension localisation versus the app.** The app's own native screens are English
  only. The sheet gets Japanese and English because it is the native screen used most.

## Pending human confirmation

Each is written into the spec as recommended; approval of the spec confirms them.

1. **Credentials.** The app mirrors the server and the `access_token` / `lit_viewer`
   cookie values into an App Group and a group keychain item. A cookie observer keeps
   the copy current from the first page commit, and leave and lock delete it. The
   extension does not unlock drives itself. (Recommended: there is no second login
   surface, and the extension can never see more than the app.)
2. **Source labels.** Shared files and text arrive as `share` (**共有** / **Shared**); a
   shared URL that is clipped arrives as `web_clip`, with no knowledge change.
   (Recommended: the label tells what the item is, and changing knowledge buys only
   provenance.)
3. **Sending in the foreground.** Files are sent while the sheet is open, in 5 MiB chunks
   read from disk, with no size limit beyond the server's. While sending, the sheet
   cannot be swiped away, and leaving it loses the unsent items. (Recommended: this fits
   the existing chunked API with no new endpoint; background transfer is the follow-up
   if device measurement calls for it.)
4. **Photo and movie format.** They are uploaded in their original format (HEIC, MOV),
   named by the provider's suggested name plus the delivered file's extension, with a
   `shared-<local time>-<n>` fallback. (Recommended: Litloft already thumbnails HEIC, and
   the original keeps full quality and metadata.)
5. **Abandoned upload chunks.** An upload abandoned when iOS kills the extension leaves
   its chunks in the upload directory until the server's next restart. The existing
   startup `cleanup_abandoned_uploads` removes them. (Recommended: accept it. The server
   restarts on every deploy, the case needs the extension to be killed mid-file, and a
   periodic sweep would be a core change for a rare leak.)
6. **Text size.** Shared text over 1 MiB is not saved, and the sheet shows its size with
   **保存** disabled. (Recommended: 1 MiB is the size above which the core stops reading
   a `.md` for tags, and text that long shared from the menu is almost certainly a
   mistake.)
7. **Changing the drive after a failure.** After a 404 or 403, the viewer can pick
   another drive for the failed item and the ones after it, and the saved ones stay.
   (Recommended: otherwise the only way out is sharing again, which would save the first
   items twice.)
8. **Remembered destination.** The remembered drive and folder live in the App Group,
   per server, and are written only after a complete save. The default folder is
   `Inbox`. (Recommended: these are the same rules as Quick Note.)
9. **Links without knowledge.** A link becomes a link note when knowledge is off for the
   drive, when no profile is set, or when the addon check fails, and the preview says
   so. (Recommended: the share still succeeds, and nothing happens out of sight.)
10. **Plain HTTP.** The extension allows plain HTTP to any host
    (`NSAllowsArbitraryLoads`). (Recommended: the server may be reached by a plain-HTTP
    hostname, and the app's web content exception does not cover `URLSession`.)
11. **One kind per share.** Text beside a URL becomes its title or is dropped, a URL or
    text beside files is dropped, and a share takes at most 20 files. (Recommended: the
    preview keeps one shape.)
12. **Closing and language.** The sheet closes by itself 1 s after a full save, and it has
    Japanese and English strings. (Recommended: the share menu is a quick action.)
13. **Design.** The sheet design, design artifact "C4 共有シート". (Recommended: it uses
    native iOS sheet conventions with DESIGN.md colours.)
14. **Device checks.** These R-5 checks run on a real iPhone. They are human checks,
    because an agent cannot run the extension on a device (PROJECT.md
    `agent_cannot_verify`). Each passes on the stated result.
    - **Sharing from the Photos app** (20 photos; then one movie over 2 GB): every item
      appears in the inbox as **共有**, in `Inbox/`, with no termination for memory.
    - **Sharing from Safari:** a clip appears as **Web クリップ** with a title, attributed
      to the profile (it shows in the clip list of the same viewer in the app).
    - **Sharing text from Notes:** the `.md` file's content matches the original.
    - **Lock in the app, then share:** only public drives are listed, with the hint.
      **Unlock in the app, then share:** the protected drive is listed.
    - **Change server, then share:** the sheet asks to connect.
    - **First share on a fresh install:** the local network prompt appears; denying it
      shows the local network message, and **設定を開く** opens the app's settings.
    - **Switching to another app during a large upload:** no file and no inbox row for
      that item, and the items before it are saved.

    R-5 also exercises the core side without a device. It replays the extension's
    requests with curl (Bearer and `X-Lit-Viewer`; init, chunk and complete with
    `inbox_source: "share"`; a create with `arrival`; a clip through the proxy) and
    checks the **共有** label on the inbox page in a browser. It runs the extension in
    the simulator, through the Photos and Safari share sheets, with the ios-simulator
    skill. (Recommended: these are the cases the unit tests cannot reach.)
