# Decisions

decision:
ran_in_app: yes
at: b75bae54e28135f1fd422d97958075ef2f342d27
by: agent
evidence: Second run, after the fixes for A1-A4. Same setup as the first run: stack `litloft-r5-c4` on :3993 (backend, frontend, knowledge; `.r5/` config), the extension's requests replayed with curl, the inbox page in Chromium (`shots/c4b-inbox-ja.png`, `c4b-inbox-en.png`); a fresh Debug build of `Litloft` + `LitloftShare` on an iPhone 17 Pro simulator (iOS 26.5, ja), driven with idb through the Safari (link and selected text) and Photos share sheets. Core passed. On iOS, A1-A4 are fixed: the keychain item is written and deleted, the web clip and Bearer/locked-drive paths work from the sheet, the files preview reads `3 件 · 6.4 MB`, and the text preview is labelled **メモ**. A5 (type icons in place of thumbnails) is unchanged. Screenshots `shots/sim2-*.png`. Details under "Second run" below; the first run's report follows it.
pending: The seven real-device checks of spec question 15 (Photos 20 photos and a >2 GB movie without memory termination; Safari clip as Web クリップ with title under the app's profile; Notes plain text; lock/unlock then share; change server then share; first-share local network prompt, deny, 設定を開く; switching apps during a large upload). Also left to the device: lock in the page → mirror rewrite without `access_token` (SPEC-IOS-001 step 5); the page's Lock button could not be reached in the simulator (see "Second run"), and whether a team-signed device build behaves as the simulator's simulated entitlements do.

## R-5 report, second run (b75bae54e)

### Core (curl replay, SPEC-CORE-033): pass

- `GET /api/drives` with no credentials: `scratch`, `写真 テスト`. `auth/status` `has_protected_drives:true`, `unlocked_groups:[]`. With `Authorization: Bearer <token>`: `locked` is added and `unlocked_groups:["private"]`. A bogus Bearer next to a valid cookie: public drives only.
- Upload `inbox_source:"share"`, 7 000 000 B in two 5 MiB chunks: init, both chunks and `/complete` 200 → `Inbox/R5b_223640.HEIC`, bytes equal to the source. The same name again: 409 `File already exists`. `R5b_223640 (1).HEIC` then 200. `"upload"` is still accepted (row **アップロード**). `"email"`: 422 `Input should be 'upload' or 'share'`. `locked` with a Bearer: 200.
- Text create with `arrival {share, inbox.sourceShare}`, `conflict_mode:"rename"`: 201 `共有テスト メモ (2).md`, `(3).md`. A link-note create: 201. by-path: 200 for an existing path, 404 for a missing one. `addons/status` lists `knowledge` for `scratch` and not for `写真 テスト`. folder-tree root lists `Inbox`.
- Clip through the proxy (`X-Lit-Drive: scratch`, `X-Lit-Viewer`): 200. With no viewer: 401. `X-Lit-Drive: locked` with no token: 403.
- Inbox page (ja): the new rows show **共有** for the uploads and notes, **アップロード** for the `upload` one, and **Web クリップ** for the clip (`c4b-inbox-ja.png`; en in `c4b-inbox-en.png`).

### iOS simulator (SPEC-IOS-001/002)

- The build's simulated entitlements now carry `keychain-access-groups = LJ2FWJRA79.group.com.mamepenguin.Litloft.dev` for both the app and the extension.
- Fresh install, nothing in the group yet. Safari share: **Litloft を開いてサーバーに接続してください**, 保存 disabled (`sim2-01`).
- App launched: the group holds `share.server = http://localhost:3993`. With no cookies, no keychain item exists (the "delete rather than write empty" rule).
- **A1 fixed.** After setting the profile `R5c4b` in the app, a generic-password item appears in access group `LJ2FWJRA79.group.com.mamepenguin.Litloft.dev` with `pdmn = cku` (AfterFirstUnlockThisDeviceOnly). No `share keychain … failed` line in the log.
- Safari link share: there is no `share.lastDrive` yet, so no drive is chosen and the label is **リンクのメモ** with the locked hint (`sim2-02`). Picking `scratch` changes it to **Web クリップ**, 保存 enabled (`sim2-03`). Changing to `写真 テスト` (knowledge off) gives **リンクのメモ** (`sim2-04`), and switching back gives **Web クリップ**. Each change sends `GET /api/addons/status?drive=…`. Saved: the item check, **保存しました**, `scratch · Inbox/` (`sim2-05`). Result: `scratch/Inbox/example-domain (1).md`, inbox source `web_clip`. The knowledge `clip_jobs.viewer_id` is `ef7d4277c4aaf863` = sha256(`R5c4b`)[:16], the app's profile.
- Photos, 3 photos: **A2 and A3 fixed.** The preview reads `3 件 · 6.4 MB` (`sim2-07`). The three uploaded files total 6 418 895 B. `scratch · Inbox/` was preselected from the memory of the previous share (`sim2-08`). Saved as `shared-20261105-224238-1/2/3.JPG`, each inbox row `share`; all three rows were checked, then **保存しました** (`sim2-09`).
- **A5 unchanged.** The three thumbnails are still the `doc.fill` type icon (`sim2-07`).
- Safari selected text ("for"): **A4 fixed.** The preview is labelled **メモ**, then `for`, then `Inbox/for.md` (`sim2-10`). Saved: `scratch/Inbox/for.md` = bytes `for`, inbox row `share`.
- Unlock in the app (`r5-pass`, without "Remember this device"): the keychain item's modification time advanced. The next Safari share lists `scratch`, `写真 テスト` and `locked` (`sim2-11`). Picking `locked` gives **Web クリップ** (`sim2-12`). Saved: `locked · Inbox/` (`sim2-13`), `locked/Inbox/example-domain.md` with inbox source `web_clip`. So the mirrored Bearer reaches the locked drive through both `/api/drives` and the addon proxy.
- Change server, from the app's "Cannot reach Litloft" screen (frontend stopped): the keychain item count went 1 → 0, and the group plist is empty. No `-34018` was logged. The next share shows **connect first** (`sim2-14`).

Not reached:
- **Lock → share.** After unlocking, the page's sidebar showed no **Lock** button and still read `Drives (2)`, both on the home page and inside `locked`. `Sidebar.tsx` shows Lock only when `authStatus.unlocked_groups` is non-empty, so the page's auth state looked stale after the unlock. That is outside the paths this change touched. It was not pursued, and the lock rewrite stays pending.

Environment incident (not caused by the change): partway through, the backend answered 500 `sqlite3.OperationalError: disk I/O error`. The sheet then correctly showed **Litloft に接続できません** with **再試行**. The cause was this run reading the WAL-mode `data.db` with the host's `sqlite3` across the bind mount. After `docker compose restart backend`, `integrity_check` was `ok`, and **再試行** on the open sheet loaded `scratch · Inbox/`. Later DB reads went through `docker compose exec backend`.

Teardown: the simulator I booted was shut down; `docker compose -p litloft-r5-c4 … down`. `video_share` on :3000 was not touched.

## R-5 report, first run (a09fa8d84)

### Core (curl replay, SPEC-CORE-033) — PASS

- `GET /api/drives` without credentials: `scratch`, `写真 テスト`; `auth/status` `has_protected_drives:true`, `unlocked_groups:[]`. With `Authorization: Bearer <token from /api/auth/unlock>`: `locked` is listed too and `unlocked_groups:["private"]`. A bogus Bearer next to a valid cookie: only public drives (no fallback to the cookie).
- Upload init `inbox_source:"share"`, 7 000 000 B in two 5 MiB chunks, `/complete` 200 → `Inbox/IMG_4021.HEIC`. Same name again: 409 `File already exists`; `IMG_4021 (1).HEIC` then uploaded. `inbox_source:"email"` → 422 (`Input should be 'upload' or 'share'`); `"upload"` still accepted. `locked` without token: 404 `Drive not found`; with token: 200 and an inbox row in `locked`.
- Create with `arrival {share, inbox.sourceShare}` and `conflict_mode:"rename"`: `共有テスト メモ.md`, then `共有テスト メモ (1).md`; bytes on disk equal the UTF-8 of the sent text (CRLF, emoji, accents kept). Link-note create: `example.com 20261105-221900.md`.
- by-path 200 for an existing target, 404 otherwise. `addons/status?drive=scratch` lists `knowledge`; for `写真 テスト` it does not. folder-tree root lists `Inbox`.
- Clip through the proxy with `X-Lit-Drive: scratch` + `X-Lit-Viewer`: 200, `Inbox/example-domain.md`, inbox source `web_clip`. Without a viewer: 401. `X-Lit-Drive: locked` without token: 403.
- Inbox page (`shots/c4-inbox-ja.png`, `c4-inbox-en.png`, `c4-inbox-final-ja.png`): rows from uploads, text and link notes show **共有** / **Shared**, the clip **Web クリップ** / **Web clip**.
- Observation outside this change: the proxy accepted a clip on `写真 テスト`, whose `drives.json` sets `knowledge:false` (200, file created). The extension never sends one there, because `addons/status` omits knowledge for that drive.

### iOS simulator (SPEC-IOS-001/002)

Passed:
- Built extension: bundle id `com.mamepenguin.Litloft.dev.share`, menu name **Litloft Dev**, activation rule as spec item 1 (URL 1, text, image/movie/file 20 each), `NSAllowsArbitraryLoads`, `NSLocalNetworkUsageDescription`. It appears in both the Safari and the Photos share menus (`sim-03`, Photos screenshot in `sim-12` flow).
- Fresh install, no `share.server`: **Litloft を開いてサーバーに接続してください**, 保存 disabled (`sim-04`).
- After the app showed the server: `share.server = http://localhost:3993` in the group. Safari share: kind **リンクのメモ** (no viewer mirrored), two drives and no memory → drive empty, 保存 disabled, **locked hint** shown (`sim-06`); the drive list has the two public drives (`sim-07`); after picking `scratch` 保存 enabled (`sim-08`). Saved `Inbox/Example Domain.md` = `Example Domain\n\nhttps://example.com/\n` (title from Safari's item title); sheet showed the item check, **保存しました** and `scratch · Inbox/` and closed after ~1 s (`sim-09`). The group then held `share.lastDrive…=scratch`, `share.folder….scratch=Inbox`.
- Next share preselected `scratch · Inbox/` (`sim-10`).
- Photos, 3 photos: three uploads in order to `scratch/Inbox`, each init/chunk/complete 200, each inbox row **共有**; sheet closed after saving.
- Safari selected text "is": preview `is` / `Inbox/is.md`; drive changed to `写真 テスト` → folder `Inbox/` (default); folder picker at root lists `Inbox` first although that drive has no such folder (`sim-15`); **ここに保存** at root → `ルート`; saved `is.md` (bytes `is`) at the drive root with an inbox row `share`; memory became `写真 テスト` / `""`.
- Frontend stopped: **Litloft に接続できません** with **再試行**, 保存 disabled (`sim-17`); after restarting, 再試行 loaded `写真 テスト · ルート` (`sim-18`). キャンセル then sent no request and created nothing.
- Change server (from the connection-error screen): every `share.*` key removed from the group; the next share showed **connect first** (`sim-19`).

Differences from the spec (bugs for the author):
- **A1. The keychain mirror never writes in the simulator build.** The app logs `share keychain write failed: -34018` (and `delete failed: -34018` from `forget()`). The query uses access group `LJ2FWJRA79.group.com.mamepenguin.Litloft.dev` (`LITLOFT_KEYCHAIN_GROUP = $(AppIdentifierPrefix)$(LITLOFT_APP_GROUP)`), while the build's entitlements carry only `com.apple.security.application-groups = group.com.mamepenguin.Litloft.dev` and no `keychain-access-groups`. Consequence seen: after setting the profile `R5 共有` in the app, a link to `scratch` (knowledge on) still shows **リンクのメモ**, so the web-clip path and the Bearer/locked-drive path cannot be reached from the sheet. Spec SPEC-IOS-001 step 3 / I5, SPEC-IOS-002 step 6 / I8. Whether a team-signed device build behaves differently is not known from here.
- **A2. The files preview shows a raw key.** It reads `share.items 3`, not `3 件 · <total size>` (`sim-12`). `ShareSheetView.swift` looks up `"share.items \(count)"`; the catalog has `share.itemsCount %lld`.
- **A3. The files preview never shows the total size.** Spec SPEC-IOS-002 step 7 and section 9 say it appears once every size is known. Nothing appeared after waiting 5 s (`sim-12b`), and `FilePreview` has no size.
- **A4. The text preview has no **メモ** / **Note** label** (`sim-14`; spec 9). The link preview does carry **リンクのメモ**.
- **A5. Thumbnails are type icons, not preview images.** All three Photos items showed the `doc.fill` icon (`sim-12`). Spec 9 says to use the item provider's preview image, else the icon, so the icon may be the correct fallback if Photos in the simulator offers no preview.
- **A6. A test run left state in the real App Group.** On this shared simulator, before this R-5 run, the group already held `share.server = http://127.0.0.1:52826/` (plist written 21:55). As a result, the first share showed **cannot reach** instead of **connect first** until the app was reinstalled. The likely writer is a test that builds a real `WebViewModel` against `StubServer` (`CoordinatorTests.swift:167`), whose mirror uses the real group store.
- Observation: the Photos uploads were named `shared-20261105-222728-1.JPG`, `shared-…-2.JPG` and `shared-…-3.jpeg`, so the simulator's Photos provided no `suggestedName`. The `.heic` added to the library was delivered as JPEG. The two `…-2` and `…-3` items carry a different second (`222729`) from the first (`222728`). Original-format delivery is left to the device check.

### Teardown

`docker compose -p litloft-r5-c4 -f docker-compose.yml -f .r5/override.yml down`; the webkit proxy was killed and the simulator I booted was shut down. `video_share` on :3000 was not touched.
