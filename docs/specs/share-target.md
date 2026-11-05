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

The user decided the entry point, the three kinds and the destination on 2026-11-05, and
approved the direction of the design artifact "C4 共有シート" (a mockup in the session
scratchpad, which the main session publishes).

## Required items

### 1. Normal flow

Terms used below:

- The **server** is the URL the app connects to, normalised by `ServerAddress.parse`.
- Its **origin** is `scheme://host[:port]`.
- The **group** is the App Group `group.$(LITLOFT_BUNDLE_ID)$(LITLOFT_BUNDLE_ID_SUFFIX)`.
  A Debug build and a Release build therefore have separate groups.
- **Local time** is the device's time zone, as Quick Note uses the browser's.
- A **file-creating request** is `/complete`, a text or link-note create, or a clip
  `POST`.
- Messages in bold are listed in Japanese and English in the table in 8.

#### SPEC-IOS-001: the app keeps the mirror

1. **Ownership.** `WebViewModel` creates one `SessionMirror`
   (`ios/Litloft/Share/SessionMirror.swift`) for its `serverURL`, in its initialiser, and
   holds it in a `let` property for its whole life. `WebShell` already owns the model for
   one server (`.id(serverURL)` in `RootView`), so there is exactly one mirror per shown
   server.
2. **Arming.** `WebView.Coordinator.webView(_:didCommit:)` calls `model.sessionMirror.arm()`
   when a main-frame navigation to the server's origin commits. A second call does
   nothing. The commit happens after the default data store has loaded its cookies.
   Before it is armed, the mirror writes nothing and deletes nothing, so reading an empty
   cookie store at launch never removes an existing item.
3. **Observation.** `CookieJar` gains `addObserver(_:)` and `removeObserver(_:)` taking a
   `CookieJarObserver` (one method, `cookiesDidChange()`); `WKHTTPCookieStore` conforms
   through a small adapter, and `FakeCookieJar` calls its observers on every set and
   delete. When armed, the mirror adds itself and then writes once, and again on every
   change:
   - the group's `UserDefaults` key `share.server`: the server's absolute string;
   - one keychain item, holding `{ "origin", "access_token"?, "viewer"? }`:
     - generic password, service `litloft.share.session`;
     - access group: the group;
     - `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`;
     - values: the cookies that `SessionCookies.session(in:host:)` selects for the
       server's host, copied as stored. `lit_viewer` is percent-encoded by the page and
       is sent as is (SPEC-IOS-002 step 6).

   When the store holds neither cookie, the item is deleted rather than written empty.
   The mirror writes only for the server it was created for and never reads
   `ServerSettings`.
4. **Leaving.** `WebShell`'s change-server handler calls `model.sessionMirror.disarm()`,
   which removes the observer synchronously, and only then calls `onChangeServer`, the
   closure in `RootView` that runs `ServerSettings.leave`. `leave` deletes the cookies (no
   observer sees them go) and then calls `forget()`, which deletes `share.server`, every
   other key of the group whose name starts with `share.`, and the keychain item.
   `forget()` does this deletion whenever it is called. A disarmed mirror never writes
   again.
5. **Locking.** Locking in the page deletes `access_token`. The armed mirror then rewrites
   the item without it.
6. **Session-only unlocks.** An unlock without "Remember this device" sets a session
   cookie (no expiry) holding a JWT that expires after 24 h. iOS drops the session cookie
   when the app's process ends, but the mirror is updated only at the next arming. Until
   then the extension can still use the token, at most until the JWT expires (pending
   human confirmation, question 2).

#### SPEC-IOS-002: the share

1. **Activation and identity.** The extension's bundle id is
   `$(LITLOFT_BUNDLE_ID)$(LITLOFT_BUNDLE_ID_SUFFIX).share`, and its name in the share menu
   is `$(LITLOFT_DISPLAY_NAME)` (a Debug build shows **Litloft Dev**). It activates for:
   - at most one web URL (`NSExtensionActivationSupportsWebURLWithMaxCount` 1);
   - text (`NSExtensionActivationSupportsText`);
   - up to 20 images, movies and files (`SupportsImageWithMaxCount`,
     `SupportsMovieWithMaxCount` and `SupportsFileWithMaxCount`, each 20).
2. **Classifying an attachment.** Each attachment of every input item gets one role, by
   the first of these its `registeredTypeIdentifiers` satisfies:
   1. **url**: it conforms to `public.url`, and the loaded URL's scheme is `http` or
      `https`. Any image or other type the same attachment also carries is a preview and
      is not saved.
   2. **file**: it conforms to `public.file-url`, `public.image`, `public.movie`, or
      `public.data` without conforming to `public.text` or `public.url`. A PDF or a web
      archive that Safari sends in place of the page is a file.
   3. **text**: it conforms to `public.text` (plain text, RTF, HTML). It is loaded as
      `public.plain-text`, so Notes' rich copy is saved as its plain text.
   4. otherwise it has no role and is ignored.

   When no attachment is a text attachment and no attachment is a url,
   `attributedContentText` of the input item, when non-empty, counts as one text
   attachment.
3. **Classifying the share.** The share takes one kind, the first that matches:
   1. **link**: some attachment is a url. The first url is saved; files and other urls
      are not. The clip's `title` is the first of these that is non-empty and, once
      trimmed, a single line of at most 200 characters: the input item's
      `attributedTitle`, its `attributedContentText`, a text attachment. Otherwise there
      is no title, and other text is not saved.
   2. **files**: some attachment is a file. Every file is one upload, in the order
      shared; urls are absent by rule 1, and text is not saved.
   3. **text**: some attachment is text. Several text attachments are joined, in order,
      with one empty line (`\n\n`) between them.
   4. **nothing**: the sheet shows **nothing to save** and **閉じる**, and sends no
      request at all.

   The preview shows only what will be saved.
4. **Session and drives.** The extension reads `share.server` from the group, and the
   keychain item when its `origin` equals the server's origin. It then sends
   `GET /api/drives` and `GET /api/auth/status` in parallel. Every request carries:
   - `Authorization: Bearer <access_token>` when a token is mirrored;
   - `X-Lit-Viewer: <viewer>` when a viewer is mirrored.
5. **Destination.**
   - Drive: `share.lastDrive.<origin>` when it is in the `GET /api/drives` answer. Else
     the only drive, when there is exactly one. Else none, and **保存** stays disabled
     until the viewer picks one. This is `resolveQuickNoteDrive`'s rule without a
     current drive.
   - Folder: `share.folder.<origin>.<drive>` when it passes the same check as
     `isValidQuickNoteFolder`; when it is missing or fails the check, `Inbox`. The empty
     string is the drive root. Picking another drive sets the folder by the same rule for
     that drive.
6. **Link kind.** For a link, the extension asks `GET /api/addons/status?drive=<drive>`,
   and asks again whenever the drive changes.
   - While that request is pending, the kind label shows a spinner and **保存** is
     disabled.
   - The link is a **web clip** when `knowledge` is in `addons` and a viewer is mirrored.
   - It is a **link note** when either is missing, or when the request failed.
7. **Sizes for the preview.** For each file the extension calls
   `loadInPlaceFileRepresentation` when the attachment offers in-place access (Files),
   else `loadFileRepresentation`, reads the file's size inside the handler, and keeps no
   copy. The count shows at once; the total size shows when every size is known. Text
   is loaded in full (it is needed for the preview and its size).
8. **Sending.** On **保存** the destination is fixed for this share, and the items are
   sent one at a time, in order:
   - **file**:
     1. **Preparing**: the file is obtained again. An in-place URL is read where it is;
        otherwise `loadFileRepresentation` is called and the file is copied into the
        extension's temporary directory before the handler returns.
     2. `POST /api/drives/{drive}/upload/init` with `filename`, `file_size`,
        `folder_path`, `chunk_size` 5 MiB and `inbox_source: "share"`.
     3. Each chunk, read from the file on disk, to `/upload/{id}/chunk`.
     4. `/complete`.
     5. The copy, if any, is deleted.

     A 409 from init whose detail is `File already exists` is retried with
     `<stem> (N)<.ext>`, for N from 1 to 99 (the suffix the server gives a created file).
     When N = 99 is also taken the item fails with **too many with this name**. Any other
     409 fails the item. The upload is the original file as the provider delivers it
     (see 9 for its name).
   - **text**: `POST /api/drives/{drive}/files` with:
     - `path`: `<folder>/<name>.md`, or `<name>.md` at the drive root, where `<name>` is
       Quick Note's `deriveQuickNoteStem` of the text, ported to Swift and run with the
       local time;
     - `content`: the text as UTF-8, unchanged;
     - `conflict_mode: "rename"`;
     - `arrival: { "source": "share", "i18n_key": "inbox.sourceShare" }`.
   - **web clip**: `POST /api/addons/knowledge/clips` with `{ url, subfolder, title? }`.
     `subfolder` is the folder, left out at the root. The request carries
     `X-Lit-Drive: <percent-encoded drive>` and `X-Lit-Viewer: <viewer>`. Knowledge
     records the arrival as `web_clip`.
   - **link note**: as text, with:
     - content `<title>\n\n<url>\n`, or `<url>\n` without a title;
     - name: `deriveQuickNoteStem(title)`, unless there is no title or that stem is the
       `note-<YYYYMMDD-HHmmss>` fallback (the title has nothing usable); then
       `<host> <YYYYMMDD-HHmmss>`, in local time.
9. **The queue.** A failed item does not stop the queue: the queue goes on to the next
   item, and the failed item keeps its row with its message and its retry (pending human
   confirmation, question 7). Three failures stop the queue instead, because every later
   item would fail the same way: the server is unreachable, local network access is
   denied, or the drive answers 404 / 403. The items not yet sent then wait, marked
   **waiting**.
10. **Finish.** When every item is saved, the extension:
    - writes `share.lastDrive.<origin>` and `share.folder.<origin>.<drive>` for the drive
      and folder of the last item saved (after a change of drive, the second drive);
    - shows **saved** with `<drive> · <folder>/` for 1 s;
    - completes the extension request.

    When the viewer closes with any item unsaved, nothing is remembered.

#### An unanswered file-creating request

Each file-creating request is sent at most once per attempt, and **キャンセル** never
aborts one in flight. Timeouts:

| Request | Timeout |
|---|---|
| JSON requests (drives, status, addons, folder-tree, init, by-path, delete) | 30 s |
| A chunk | 120 s |
| A create or a clip | 60 s |
| `/complete` (assembly of a large file runs on the server) | 15 min |

When `/complete` ends without an answer (timeout or connection lost), the item shows
**checking** and the extension polls
`GET /api/drives/{drive}/files/by-path?path=<the init's target>`:

- every 5 s, for 2 min plus 1 s per 50 MiB of the file, because the server may still be
  assembling it;
- a by-path request that fails (network, 5xx) is skipped and the polling goes on;
- a 200 ends the polling: the item is saved. Init succeeded only because nothing was at
  that path, so the file found there is this upload.

A subtitle sidecar (`.srt`, `.vtt` and the other extensions the core treats as subtitles)
has no file row, so by-path cannot find it; for it the polling is skipped.

When the polling ends without a 200, or for a sidecar, the item shows **unknown** with
**もう一度保存**. Pressing it starts the item again from init **with its original name**:

- a 409 `File already exists` for that name means the earlier attempt landed: the item is
  saved, and nothing more is sent;
- a successful init means it did not land, and the upload proceeds as normal.

The suffix retry of step 8 applies only to an item's first attempt, so a retry never
creates a suffixed copy of a file that may already be there.

A text or link-note create, or a clip, that ends without an answer (or with a clip 502
or 504, see 8) also shows **unknown**. Its final name is decided by the server's rename
or by knowledge's naming, so no lookup can tell it from an earlier file. Its
**もう一度保存** sends the request again, and the label says so: a second copy can
result.

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
- **The app does not run after a cookie changes.** The mirror is refreshed at the next
  arming. A token that expired meanwhile is answered as locked.
- **The app has not been launched since the update.** There is no `share.server`; see
  below.

#### SPEC-IOS-002

Each case names the message shown; the wording is in the table in 8.

- **No `share.server`**: **connect first**, and no **保存**.
- **Server unreachable, or a JSON request times out** while loading: **cannot reach** with
  **再試行**, which repeats step 4. While sending: the queue stops (step 9).
- **Local network access denied**: a request fails and `NWPathMonitor` reports
  `unsatisfiedReason == .localNetworkDenied`. **local network denied** with **設定を開く**,
  which opens the app's page in Settings. While sending: the queue stops.
- **`GET /api/drives` is empty**: **no drives**, and no **保存**.
- **Locked drives may be hidden**: when `has_protected_drives` is true and
  `unlocked_groups` is empty, the drive picker shows the public drives and **locked
  hint**.
- **The folder picker's request fails or times out**: the picker shows **folders not
  loaded** with **再試行**. The folder already chosen stays chosen.
- **Shared text over 1 MiB (UTF-8)**: the preview shows **text too large** with the size,
  and **保存** is disabled (pending human confirmation, question 6). It is never sent.
- **An upload fails before `/complete`** (any status but a retried 409, or a network
  error on a chunk): the extension sends `DELETE /api/drives/{drive}/upload/{id}` (best
  effort), and the item fails with the message for its status. A retry starts the item
  from step 8.1.
- **Upload init answers 400 `File too large (max <n>GB)`**: **file too large**, with
  `<n>` read from that detail; when the detail does not match, the message without the
  limit.
- **Upload init answers 507**: **disk full**.
- **The drive answers 404 (or 403 through the addon proxy) after it was listed**: **drive
  not available**, and the queue stops. The drive row becomes tappable again (pending
  human confirmation, question 8). Picking a drive sets the folder by step 5's rule for
  that drive, and both apply to the items not yet saved; **再試行** then resumes the
  queue. Saved items stay where they are.
- **A clip answers an error**:

  | Status | Message | Offers |
  |---|---|---|
  | 400 (URL rejected), 401 (no profile), 404 (route or addon missing), 422, 503 (addon not configured) | **clip unavailable** | **リンクとして保存** and **再試行** |
  | 403 | **drive not available** | as for the drive above |
  | 502, 504 | **unknown** | **もう一度保存** |
  | other 5xx | **generic failure** | **再試行** |

  A 502 or 504 can come after knowledge already created the placeholder, so it is not
  offered as a link note.
- **Any other status or error**: **generic failure** with **再試行**. The server's detail
  text is never shown.
- **キャンセル during sending**:
  - when an init is in flight, its answer is awaited and the session it opened is
    deleted with `DELETE`;
  - when a chunk is in flight, it is abandoned and the session deleted;
  - when a file-creating request is in flight, its answer is awaited, and an unanswered
    `/complete` is left to land on its own (no polling);
  - nothing after it is sent, nothing is remembered, and the extension completes.
- **iOS terminates the extension mid-share** (memory, or the host app leaves the
  foreground):
  - an unfinished upload session is abandoned on the server; its chunks stay in the
    upload directory until the server restarts (pending human confirmation,
    question 5), and no file and no inbox row exist for it;
  - a `/complete` already received by the server finishes, and its file lands with its
    inbox row;
  - items already saved stay, and nothing is remembered.

#### SPEC-CORE-033

An `inbox_source` other than `"upload"` or `"share"` answers 422, and nothing is created.

### 3. States

The sheet:

| From | To | When |
|---|---|---|
| loading | ready | step 4 answered, a drive is chosen, and (for a link) its kind is known |
| loading | resolving kind | a link, the drive chosen, `addons/status` pending |
| loading | needs drive | several drives and no usable memory |
| loading | text too large | text over 1 MiB |
| loading | blocked | no server, no drives, unreachable or local network denied (retry → loading) |
| loading | nothing to save | the share's kind is nothing (no request is sent) |
| needs drive | ready / resolving kind | the viewer picks a drive |
| ready | resolving kind | a link, and the viewer picks another drive |
| resolving kind | ready | `addons/status` answers or fails |
| ready | ready | the viewer changes the folder, or the drive of a non-link share |
| ready | sending | **保存** |
| sending | sending | an item fails and the queue goes on |
| sending | stopped | unreachable, local network denied, or a drive 404 / 403 |
| stopped | stopped | after a drive 404 / 403, the viewer picks another drive |
| stopped | sending | **再試行** |
| sending, stopped | finished with failures | the queue has no item left to send and some failed |
| finished with failures | sending | **再試行** or **もう一度保存** on an item |
| sending | saved | every item saved; after 1 s the extension completes |
| any but sending | closed | **キャンセル** / **閉じる** / swipe down |
| sending | closing | **キャンセル**; → closed when the request in flight is settled as in 2 |

An item, while sending: waiting → preparing (files only: obtaining or copying the file)
→ sending (progress bar, or spinner) → saved, or failed, or checking (after an
unanswered `/complete`) → saved or unknown.

The folder picker: loading → shown, or folders not loaded (→ loading on **再試行**).

While sending, the swipe-down dismissal is disabled (`isModalInPresentation`).

Not allowed:

- changing the folder after **保存**, except together with a new drive after a 404 / 403;
- changing the drive after **保存**, except after a 404 / 403;
- remembering anything from a share that did not save every item;
- a request of any kind for a share whose kind is nothing, or for text over 1 MiB.

The mirror (SPEC-IOS-001) is in one of three states:

- not armed: it writes nothing and deletes nothing;
- armed: the item equals the store;
- disarmed: it writes nothing.

The group never holds a token for an origin other than `share.server`.

### 4. Data read and written

- **App Group `UserDefaults`.**
  - `share.server` is written by the app's mirror.
  - `share.lastDrive.<origin>` and `share.folder.<origin>.<drive>` are written by the
    extension after a full save.
  - `forget()` deletes every key that starts with `share.`.
- **Keychain item `litloft.share.session`** in the group's access group. The app's mirror
  writes and deletes it; the extension reads it.
- **`WKHTTPCookieStore`.** Read by the app, as today, plus the observer.
- **The extension's temporary directory.** A file that is not offered in place is copied
  there just before it is sent, and the copy is deleted when the item is saved or fails,
  or when the extension ends. At most one copy exists at a time.
- **The server, through existing endpoints only.** `files`, `inbox_items`, the upload
  temp directory, and knowledge's `ClipJob`. SPEC-CORE-033 adds no table and no column.
- **`UserDefaults.standard["serverURL"]`.** Unchanged; the app still reads its own copy.

### 5. External services

- **The user's Litloft server**, over the LAN or whatever route reaches it.
  - Slow: the timeouts in 1 apply, and progress keeps moving or visibly stops.
  - Down: the blocked or stopped state.
  - Wrong (an unexpected body): treated as **generic failure**.
- **The knowledge addon behind the core proxy**, for web clips only. When it is not
  installed, or off for the drive, the link becomes a link note before sending.
- **iOS**: the share host app, `NSItemProvider` (a Photos export can take seconds for a
  large movie: the item shows **preparing**), the keychain, local network privacy, and
  the extension's memory and lifetime limits.

### 6. Authorization

- **Token.** The extension sends the mirrored `access_token` as
  `Authorization: Bearer`, which `get_unlocked_groups` already prefers over the cookie.
  Every endpoint used checks drive access as it does for the web UI:
  `check_drive_access` on drives, uploads, create and by-path, and the addon proxy's
  `X-Lit-Drive` check. Nothing new is granted: the extension reaches the drives the app's
  session reaches, with the one window of SPEC-IOS-001 step 6.
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
  and so does the app's. A share can be the extension's first local connection, so iOS
  can ask for permission from the share sheet.

### 7. Effect on existing features

- **Upload init.** One more accepted `inbox_source` value; `"upload"` and omission are
  unchanged.
- **Inbox page and `list_inbox`.** Rows with source `share` and the new label; nothing
  else.
- **Text-file create, by-path and knowledge clips.** Unchanged; called by a new client.
- **iOS app.** `CookieJar` gains observation, and every conformer and `FakeCookieJar`
  follow. The model gains the mirror, armed at the first commit; the change-server
  handler disarms it; `forget()` deletes the group keys and the item. Navigation,
  playback, the bridge and `shell-contract.json` are unchanged.
- **Web Quick Note.** Its behaviour is unchanged. Its remembered drive (browser
  `localStorage`) and the share extension's are separate. Its filename tests gain a
  fixture table, which the Swift port is checked against.
- **Building the app.** Both targets gain the App Groups entitlement. Device signing
  needs a paid Apple Developer Program team (see Checked, no action). The simulator
  build without a team keeps working.

### 8. Error behavior

Every message the sheet shows, by the name used in this spec. Nothing else is shown: the
server's own `detail` text never reaches the screen.

| Name | 日本語 | English |
|---|---|---|
| connect first | Litloft を開いてサーバーに接続してください | Open Litloft and connect to your server |
| cannot reach | Litloft に接続できません | Can't reach Litloft |
| local network denied | ローカルネットワークへのアクセスが許可されていません | Local network access is off for Litloft |
| no drives | 保存先のドライブがありません | No drive to save to |
| locked hint | 鍵のかかったドライブは Litloft で解錠すると選べます | Unlock locked drives in Litloft to choose them |
| folders not loaded | フォルダを読み込めません | Couldn't load folders |
| nothing to save | 保存できるものがありません | Nothing here can be saved |
| text too large | テキストが大きすぎます（1 MB まで） | Text is too long (up to 1 MB) |
| file too large | ファイルが大きすぎます（上限 `<n>` GB） | File is too large (limit `<n>` GB) |
| disk full | 空き容量が足りません | Not enough space on the server |
| too many with this name | 同じ名前のファイルが多すぎます | Too many files with this name |
| drive not available | このドライブには保存できません | Can't save to this drive |
| clip unavailable | Web クリップを作れません | Couldn't make a web clip |
| unknown | 保存されたか確認できません | Couldn't confirm it was saved |
| checking | 確認しています | Checking |
| preparing | 準備しています | Preparing |
| waiting | 待機中 | Waiting |
| generic failure | 保存できませんでした | Couldn't save |
| saved | 保存しました | Saved |

Controls: **キャンセル** / **Cancel**, **保存** / **Save**, **閉じる** / **Close**,
**再試行** / **Retry**, **もう一度保存** / **Save again**, **リンクとして保存** /
**Save as link**, **設定を開く** / **Open Settings**, **ここに保存** / **Save here**.

What is logged:

- **The extension.** Each failed request goes to `os.Logger`, with the extension's bundle
  id as subsystem. A log entry carries the method, the path template
  (`/api/drives/{drive}/upload/{id}/chunk`, with no drive name, file name, folder, query
  or URL), and the status or the `URLError` code. No content, file name, folder, drive
  name or shared URL is logged.
- **The app.** A keychain failure, with its `OSStatus` only.
- **The server** logs as today.

### 9. User-visible behavior

The sheet is the iPhone system sheet with a navigation bar. Light and dark follow the
system appearance. Colours come from DESIGN.md §2: **保存** in `accent`, success in
`accent-teal`, errors in `danger`.

- **Navigation bar.** **キャンセル**, the title **Litloft**, and **保存**.
- **Preview, by kind.**
  - Files: up to 4 thumbnails (the item provider's preview image, else a type icon), and
    `N 件 · <total size>` / `N items · <total size>` once the sizes are known.
  - Web clip: the page's host and the URL, in two lines, labelled **Web クリップ** /
    **Web clip**.
  - Link note: the same, labelled **リンクのメモ** / **Link note**.
  - Text: the first 6 lines of the text and the file name it will get, labelled
    **メモ** / **Note**.
- **Destination**, an inset-grouped list.
  - **ドライブ** / **Drive** shows the drive name and opens a list of drives with a check
    on the current one.
  - **フォルダ** / **Folder** shows `<folder>/` or **ルート** / **Root**. It opens the
    folders one level at a time from
    `GET /api/drives/{drive}/folder-tree?root=<path>`, with **ここに保存**. At the root
    level, `Inbox` is listed first even when the drive has no such folder; the first save
    creates it.
- **Sending.** **保存** becomes a spinner. Each item has a row with its name and its
  state: **waiting**, **preparing**, a progress bar (files) or a spinner, a check.
- **Saved.** **saved** and `<drive> · <folder>/`, with a check in `accent-teal`, for 1 s.
- **Failures.** The item row turns `danger` and shows its message and its control. An
  **unknown** row is not `danger`: it shows a question mark and **もう一度保存**. When
  the queue has stopped or finished with failures, the bar shows **閉じる** in place of
  **キャンセル**.
- **Strings.** Japanese and English, through a String Catalog in the extension, chosen by
  the device language.
- **Defaults.** The folder is `Inbox`; the drive is the last one saved to.
- **Upload file names.** The item provider's `suggestedName` with the extension of the
  file it delivers (`IMG_4021.HEIC`, `IMG_4025.MOV`, or `FullSizeRender.heic` for an
  edited photo). Without a suggested name, `shared-<YYYYMMDD-HHmmss>-<n>.<ext>` in local
  time, where n is the item's position. Photos and movies are uploaded in their original
  format (pending human confirmation, question 4).

In Litloft, the item appears in the drive's inbox and in the folder chosen. Its source is
**共有** / **Shared** for files, text and link notes, and **Web クリップ** for clips. A
shared subtitle file is saved as a sidecar and, as for any upload, has no inbox row.

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
  a home LAN at 20 MB/s, 1 GB takes about a minute. An unanswered `/complete` adds at
  most its polling window.
- **Disk.** A file that is not offered in place exists twice on the phone while it is
  sent (the provider's copy and the extension's); one copy at a time.
- **Concurrency.** One item at a time, and one request at a time per item.
- **Privacy.** The token is kept in the keychain, where only the app and its extension
  can read it. The logs carry no content, names or URLs.
- **Cost.** No extra server round trip per item beyond the web upload's, except the
  by-path polling after an unanswered `/complete`.

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
  (new): rows of `{ "body", "local": { "year", "month", "day", "hour", "minute",
  "second" }, "stem" }`. The time is a wall-clock time in the runner's own time zone:
  vitest builds `new Date(year, month - 1, day, hour, minute, second)`, and Swift builds
  it from `DateComponents` with `TimeZone.current`. The `quickNoteFilename` tests read
  it.

iOS (SPEC-IOS-001, SPEC-IOS-002):

- `ios/Litloft.xcodeproj/project.pbxproj`:
  - a Share Extension target, `LitloftShare`, embedded in the app, with
    `PRODUCT_BUNDLE_IDENTIFIER = $(LITLOFT_BUNDLE_ID)$(LITLOFT_BUNDLE_ID_SUFFIX).share`;
  - `CODE_SIGN_ENTITLEMENTS` set on both targets;
  - the shared sources compiled into `LitloftTests` as well.
- `ios/Config/Shared.xcconfig`: `LITLOFT_APP_GROUP`, derived from the bundle id and
  suffix.
- `ios/Litloft/Litloft.entitlements` (new): App Groups.
- `ios/LitloftShare/LitloftShare.entitlements` (new): App Groups.
- `ios/Litloft-Info.plist`: `NSLocalNetworkUsageDescription`.
- `ios/LitloftShare/Info.plist` (new): the activation rule,
  `CFBundleDisplayName = $(LITLOFT_DISPLAY_NAME)`, `NSAllowsArbitraryLoads`,
  `NSLocalNetworkUsageDescription`.
- `ios/Litloft/Web/CookieJar.swift`: `CookieJarObserver`, `addObserver`,
  `removeObserver`, and the `WKHTTPCookieStore` adapter.
- `ios/Litloft/Share/SessionMirror.swift` (new): arm, disarm, the writes.
- `ios/Litloft/Share/` (new, shared with the extension): `SharedSession` (the group
  defaults and the keychain, behind a protocol), the destination resolver, the folder
  validator, the Quick Note filename port.
- `ios/Litloft/Web/WebViewModel.swift`: holds the mirror.
- `ios/Litloft/Web/WebView.swift`: arms it at a main-frame commit for the server.
- `ios/Litloft/Web/WebShell.swift`: the change-server handler disarms it before
  `onChangeServer`.
- `ios/Litloft/RootView.swift`: unchanged in behaviour; `onChangeServer` still runs
  `leave`.
- `ios/Litloft/Settings/ServerSettings.swift`: `forget()` deletes every `share.` key and
  the keychain item.
- `ios/LitloftShare/` (new): the view controller and the SwiftUI sheet, the attachment
  and share classifier, the API client and its logger, the file preparer, the chunk
  reader, the send queue with the unanswered-`/complete` polling, the String Catalog.
- `ios/LitloftTests/FakeCookieJar.swift`: observers called on set and delete.
- `ios/LitloftTests/`: tests for the mirror, the classifier, the destination resolver,
  the filename port (reading the fixture through `#filePath`, as `ContractTests` reads
  `shell-contract.json`), the chunk reader, the send queue against `StubServer`
  (unanswered `/complete`, retry with the original name, cancel in each phase, the 409
  suffix and its exhaustion, the queue going on and stopping), and the logger. These
  live in a directory already in `test_dirs`, so `process/process.conf` is not edited.

Docs: as listed in 9, including `docs/user-guide/ios-app.md` step 2.

Rules passed through:

- `.claude/rules/design-decisions.md`: the drive is a security boundary, and the
  remembered drive is kept per server; locked drives answer 404; the JWT and the viewer
  identity travel as separate headers; the core does not interpret inbox sources.
- `.claude/rules/backend-conventions.md`.
- `.claude/rules/frontend-conventions.md`: translation keys only in `messages-core/`.
- `DESIGN.md` §2.

This change edits no protected path and touches no HIGH zone.

## Invariants

I1. Every item a share saves has an open inbox row in the drive it was saved to, labelled **共有** / **Shared** for a file (upload init with `inbox_source: "share"`), text or link note (create with `arrival` `{ "share", "inbox.sourceShare" }`), and **Web クリップ** for a web clip (`web_clip`); a subtitle sidecar, which has no file row, has no row.
I2. Upload init accepts exactly `"upload"` and `"share"` as `inbox_source`, stores `inbox.sourceUpload` and `inbox.sourceShare` respectively, and answers 422 with nothing created for any other value.
I3. A share is a link when any attachment is an http(s) URL, else files when any attachment is a file, else text, else nothing; only the first URL, or the files, or the joined text is saved; a share of kind nothing and text over 1 MiB send no request; text is stored byte-for-byte as UTF-8.
I4. Every item goes to the drive and folder shown at **保存**, except that after a 404 or 403 a drive (and its folder) picked by the viewer applies to the items not yet saved; the remembered drive and folder, written only after every item is saved, are those of the last item saved; a remembered drive not listed by `GET /api/drives` is never preselected, a remembered folder that is missing or invalid gives `Inbox`, and `Inbox` is listed first at the root level even when absent.
I5. Once the mirror is armed, the keychain item equals the app's `access_token` and `lit_viewer` cookies for its server after every change and is absent when the app holds neither; before arming nothing is written or deleted, after disarming nothing is written, and `forget()` deletes the item and every group key starting with `share.`; the extension sends `Authorization` only to the item's origin and only when it equals `share.server`.
I6. A failed item does not stop the queue unless the server is unreachable, local network access is denied or the drive answers 404 / 403; an upload that fails or is cancelled before `/complete` leaves no file and no inbox row; no file-creating request is sent twice without the viewer pressing a retry; after an unanswered `/complete` the item is saved exactly when by-path finds its target within the window, or when its retry's init with the original name answers 409.
I7. An upload's first attempt whose name is taken lands under the first free `<stem> (N)<.ext>`, N ≤ 99, and fails visibly when all are taken; a retry never takes a suffix, and no share overwrites an existing file.
I8. A link is sent to knowledge only when `/api/addons/status?drive=` answered with `knowledge` for the chosen drive and a viewer is mirrored; otherwise, including while that request is pending (**保存** disabled) or after it failed, it is a link note, and the preview shows the kind before **保存**.
I9. A text note's name, and a titled link note's, equals web Quick Note's `deriveQuickNoteStem` for the same input and local time (the shared fixture) plus `.md`; a link note with no usable title is named `<host> <YYYYMMDD-HHmmss>.md`, and its content is `<title>\n\n<url>\n` or `<url>\n`.
I10. The extension uploads in 5 MiB chunks, never holds more than one chunk of a file in memory and never more than one temporary copy, shows only the messages of the table in 8 and never a server `detail`, and logs no shared content, file name, folder name, drive name or URL.

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
- **Several kinds in one share.** One share is one kind, so the preview has one shape,
  and it shows only what will be saved.
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
  earlier one. The sheet says the result is unknown, and its retry label says it saves
  again.
- **Matching the proxy's `Addon service unavailable` detail.** The proxy answers 502 both
  when the addon is down and when it times out after creating the placeholder, so a 502
  is always treated as unknown rather than parsed.
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

1. **Credentials.** The app mirrors its cookies into the App Group keychain; the
   extension never unlocks. (Recommended: no second login, and never more than the app.)
2. **Session-only unlock.** Accept that such an unlock stays usable in the extension until
   the app next shows a page, at most 24 h. (Recommended: the JWT bounds it; storing
   expiries adds state.)
3. **Foreground sending.** Files go while the sheet is open, 5 MiB chunks, no own size
   cap. (Recommended: fits today's chunked API; background upload is a later follow-up.)
4. **Photo format.** Originals (HEIC, MOV), named by the provider, with a time-stamped
   fallback. (Recommended: Litloft already handles HEIC, and originals keep quality.)
5. **Abandoned chunks.** Chunks of a killed upload stay until the next server restart.
   (Recommended: restarts come with every deploy; a sweep is core work for a rare leak.)
6. **Text over 1 MiB.** Not saved; the sheet says so. (Recommended: the core reads a
   `.md` only up to 1 MiB, and such a share is almost surely a mistake.)
7. **A failed item.** The queue goes on with the rest; unreachable, no local network, or a
   drive 404/403 stop it. (Recommended: one bad file should not hold back nineteen.)
8. **Drive after a 404/403.** The viewer can pick another drive for the unsaved items.
   (Recommended: sharing again would save the first items twice.)
9. **Source labels.** Files and text arrive as 共有 / Shared; clips stay Web クリップ.
   (Recommended: the label says what the item is, with no knowledge change.)
10. **Remembered destination.** Per server in the App Group, after a full save; default
    `Inbox`. (Recommended: the same rules as Quick Note.)
11. **Links without knowledge.** Saved as a link note, shown in the preview first.
    (Recommended: the share still succeeds, and nothing happens out of sight.)
12. **Plain HTTP.** The extension allows any plain-HTTP host. (Recommended: the app's
    web exception does not cover `URLSession`, and it only talks to your server.)
13. **One kind per share.** Link beats files beats text; up to 20 files. (Recommended:
    one preview shape, and a URL from another app is rarely meant as a photo.)
14. **Closing and language.** Closes 1 s after saving; Japanese and English. (Recommended:
    the share menu is a quick action.)
15. **Device checks.** The seven R-5 checks below, done by you on an iPhone.
    (Recommended: they are exactly what simulator and unit tests cannot reach.)
    - Photos app, 20 photos, then a movie over 2 GB: all in the inbox as **共有**, in
      `Inbox/`, no termination for memory.
    - Safari: a clip arrives as **Web クリップ** with a title, under the same profile as
      in the app.
    - Notes: the `.md` file's content matches the note's plain text.
    - Lock in the app, then share: only public drives, with the hint; unlock, then
      share: the protected drive is listed.
    - Change server, then share: **connect first**.
    - Fresh install, first share: the local network prompt; denying it shows **local
      network denied**, and **設定を開く** opens the app's settings.
    - Switch apps during a large upload: no file and no row for that item; earlier items
      saved.

    R-5 also exercises the core side without a device, by replaying the extension's
    requests with curl (Bearer and `X-Lit-Viewer`; init, chunk and complete with
    `inbox_source: "share"`; a create with `arrival`; a clip through the proxy) and
    checking **共有** on the inbox page in a browser, and runs the extension in the
    simulator through the Photos and Safari share sheets with the ios-simulator skill.
