# iOS shell Phase 1 — round 1

- Reviewed SHA: `bd5ba5ca230b6448c5ad0fa2f21440c7d10a7e06`
- Range: `2f03dfaf~1..bd5ba5ca`
- Invariants: `docs/superpowers/specs/2026-09-16-ios-native-shell-invariants.md`
- Baseline before mutating: `xcodebuild test` → **TEST SUCCEEDED**; `vitest run src/lib/__tests__/nativeBridge.test.ts` → 15 passed;
  `vitest run src/__tests__` → 616 passed / 45 files; `tsc --noEmit` clean; `swiftlint lint --quiet` clean (no `.swiftlint.yml` in the repo, so defaults).

Nearly every file under `ios/` is created by this change, so findings there are `[introduced]` without a
parent reproduction, per the brief.

---

## 1. `HttpOnly` and `SameSite` are lost when the session is restored from the keychain

`[introduced]` — `ios/Litloft/Storage/StoredCookie.swift:5-21,28-42`, applied at `ios/Litloft/Web/CookieBridge.swift:16-19`

`StoredCookie` carries `name, value, domain, path, expiresDate, isSecure` and nothing else.
`makeCookie()` rebuilds from exactly those. The backend sets `access_token` with
`httponly=True, samesite="strict"` (`backend/app/routers/auth.py:59-66`), and WebKit hands that
cookie to `CookieBridge.capture` with both attributes intact — so the attributes exist at the moment
of capture and are dropped by the round trip.

At the next launch `CookieBridge.attach` calls `store.setCookie(rebuilt)`, which **replaces** the
same name/domain/path entry in the web view's jar with a cookie that is neither `HttpOnly` nor
`SameSite`.

**Failure scenario.** Unlock a protected drive in the shell (cookie is `HttpOnly; SameSite=Strict`).
Quit and relaunch. From launch 2 until the user unlocks again — which is precisely what the feature
exists to avoid — `document.cookie` in the page returns the drive-access JWT, and the cookie is no
longer SameSite-constrained. Any content-injection bug anywhere in the web app (markdown, HTML
preview, an addon slot) can now read and exfiltrate a credential that a browser would never have
exposed.

**Measurement** (temporary probe added to `ios/LitloftTests/`, run, then deleted — tree restored):

| probe | result |
|---|---|
| source cookie `isHTTPOnly == true` | **passed** — the attribute is present at capture |
| source cookie `sameSitePolicy == .sameSiteStrict` | **passed** |
| rebuilt cookie `isHTTPOnly == true` | **failed** — dropped |
| rebuilt cookie `sameSitePolicy == .sameSiteStrict` | **failed** — dropped |
| rebuilt cookie `isSessionOnly == false` | **passed** — the expiry does survive |

Breaks no invariant as written (4 and 6 govern *where* and *which*, not *with what attributes*).
Under R-4 that makes it **B** — but it is a B a user reaches on their second launch, which R-0 names
as grounds to raise a revision. Flagging for the supervisor rather than deciding it here.

`HTTPCookiePropertyKey("HttpOnly")` and `.sameSitePolicy` both round-trip through
`HTTPCookie(properties:)` — probes A and B above are the evidence — so the fix is to carry the two
fields in `StoredCookie`.

---

## 2. Invariant 4 does not hold: the persistent session cookie is written to two persistent stores outside the keychain

`[introduced]` — `ios/Litloft/Web/WebView.swift:11`, `ios/Litloft/Web/CookieBridge.swift:18,35`

Invariant 4: *"セッション cookie は Keychain（`kSecAttrAccessibleAfterFirstUnlock`）以外の永続領域に
書かれない。"*

Two writes outside the keychain:

- `configuration.websiteDataStore = .default()` — the persistent store. Probe measured
  `WKWebsiteDataStore.default().isPersistent == true`.
- `HTTPCookieStorage.shared.setCookie(cookie)` — `.shared` keeps cookies that carry an expiry across
  launches on disk in the app container. Probe measured that a cookie with a one-year expiry is
  accepted by `.shared` with `isSessionOnly == false`.

Whether `access_token` carries an expiry is the user's choice: `/unlock` has a "Remember this
device" checkbox (`frontend/src/app/unlock/page.tsx:15,81`), and with it checked
`create_jwt(groups, remember=True)` returns `max_age = REMEMBER_MAX_AGE` = 1 year
(`backend/app/auth.py:22,122,129`). So on the remember path the JWT is written to two on-disk
stores protected only by the default file-protection class, not by the keychain.

**Failure scenario.** Check "Remember this device", unlock a protected drive. The JWT is now in
WebKit's on-disk cookie store *and* in `Library/Cookies` *and* in the keychain. The invariant says
one place; there are three.

**Mutation S9** — `kSecAttrAccessibleAfterFirstUnlock` → `kSecAttrAccessibleAlwaysThisDeviceOnly`
(`Keychain.swift:21`). `want=kill`. **Survived** (TEST SUCCEEDED): even the keychain half of
invariant 4 is not held by any test.

Bucket **A** by the letter of the declared list. If the intent was "no *additional* durable copy
beyond the stores iOS gives a web view anyway", the invariant is the thing that needs revising, and
that is the supervisor's call.

---

## 3. There is no path that ever clears the stored session

`[introduced]` — `ios/Litloft/Web/CookieBridge.swift:42-49`, `ios/Litloft/Storage/CookieVault.swift:20`, `ios/Litloft/RootView.swift:9`

Three things compose into one defect:

1. `CookieBridge.forget()` — the only caller of `CookieVault.clear()` — **is never called**.
   `grep -rn "forget()" ios/` finds `ServerSettings.forget` (called from `RootView.swift:9`) and
   `CookieBridge.forget` (no call site). `CookieVault.clear()` is therefore unreachable.
2. `CookieVault.save` early-returns on an empty set (`guard !stored.isEmpty else { return }`), so a
   capture that finds no tracked cookie leaves the previous keychain entry standing.
3. `CookieBridge.capture` only ever calls `HTTPCookieStorage.shared.setCookie`; it never deletes a
   cookie that has disappeared from the web view's jar.

**Failure scenario (reachable, and does not require a shared device).** A user who has never set a
profile nickname has no `lit_viewer` cookie — `lit_viewer` is written client-side by
`ProfileProvider` only once a nickname exists. They unlock a protected drive, then press Lock in the
Litloft UI. `POST /api/auth/lock` deletes `access_token` (`backend/app/routers/auth.py:70-78`);
`cookiesDidChange` fires; `tracked` is now **empty**; `save` returns at the guard; the keychain still
holds `access_token`. Relaunch the app → `CookieBridge.attach` injects it → the drive the user
explicitly locked is open again, with no prompt. This is the opposite of what
`design-decisions.md` "Access control" is for.

**Second scenario.** "Change server" (`ConnectionErrorView` → `RootView.swift:9`) clears only the
stored URL. Credentials for the previous server stay in the keychain and in
`HTTPCookieStorage.shared`. Point the app back at that server, or at the same host on another port
(cookies ignore port), and the session resumes. There is no sign-out anywhere in the app.

**Mutations.**

- **S21** — replaced the whole body of `CookieBridge.forget()` with `{}`. `want=live` (probing for
  dead code). **Survived**, confirming nothing exercises it.
- **S22** — removed `guard !stored.isEmpty else { return }`. `want=kill` (a logout should clear the
  vault). **Survived**.

The prose at `CookieBridge.swift:40-41` says the function "Drops the session everywhere." Nothing
calls it, so a reader looking for the sign-out path will believe one exists. Per `comments.md`, if
the function stays uncalled the comment should go with it; the better fix is to call it from the
"Change server" path.

---

## 4. Cookie capture is filtered by name only, never by host

`[introduced]` — `ios/Litloft/Web/CookieBridge.swift:31-32`

```swift
let cookies = await cookieStore.allCookies()
let tracked = cookies.filter { CookieVault.trackedNames.contains($0.name) }
```

`allCookies()` returns every cookie in the process-wide `.default()` store, for every domain. The
filter is on `name` alone. Anything named `access_token` or `lit_viewer`, whatever origin set it, is
copied into `HTTPCookieStorage.shared` and persisted to the keychain, and is re-injected into the
jar at the next launch.

**Reachability today is thin, and that is the only reason this is not finding #1.** External
markdown links carry `target="_blank"` (`MarkdownPreview.tsx:198`) and are dropped by the web view
(finding 6), and `HtmlPreview`'s iframe is `sandbox="allow-scripts allow-popups"` with no
`allow-same-origin` (`HtmlPreview.tsx:45`), so it cannot set cookies. So there is no live path to a
foreign cookie in this tree.

It becomes live the moment either of those changes — in particular the moment someone implements
`createWebViewWith` to fix finding 6. The filter should also match the configured server's host.

**Mutation S12** — `let tracked = cookies` (drop the filter entirely). `want=kill` (invariant 6:
*"`CookieVault` は `access_token` と `lit_viewer` 以外の cookie を保存しない"*). **Survived.**

---

## 5. Invariants 4, 5, 6, 7 and 8 have no test: eleven mutations that violate them all survived

`[introduced]` — `ios/LitloftTests/`

The Swift bundle covers `ServerAddress` / `ServerSettings` well and `StoredCookie` partly. Invariant
3 in particular is genuinely held — every mutation I aimed at it died:

| mutation | want | result |
|---|---|---|
| S1 `parse`: drop the port-range check | kill | **killed** (`ServerAddressTests/rejected`) |
| S4 `isValidLabel`: drop the leading/trailing hyphen guard | kill | **killed** |
| S5 `isValidHost`: `omittingEmptySubsequences: true` | kill | **killed** |
| S6 `parse`: accept any scheme | kill | **killed** |
| S10 `ServerSettings.init`: `URL(string:)` instead of `ServerAddress.parse` | kill | **killed** |

Everything else is unheld. These all ran `want=kill` and all reported **TEST SUCCEEDED**:

| mutation | invariant it violates |
|---|---|
| S23 `CookieBridge.attach`: delete the whole cookie-injection loop | 5 (and the feature itself) |
| S11 `Coordinator.start`: `webView.load(...)` before `cookies.attach(...)` | 5 |
| S7 `CookieVault.save`: drop the tracked-name filter | 6 |
| S12 `CookieBridge.capture`: drop the tracked-name filter | 6 |
| S9 `Keychain`: change the accessibility constant | 4 |
| S15 `WebViewModel.markFailed`: set `.loaded` (error screen never appears) | 7 |
| S14 `ShellBridge`: never reply to a ping | ping contract |
| S13 `ShellBridge`: reply with `seq + 1` | ping contract |
| S22 `CookieVault.save`: drop the non-empty guard | — |
| S8 `CookieVault.load`: drop the `!isExpired` filter | — |
| S21 `CookieBridge.forget`: empty the body | — |

**S23 is the one to read twice.** Deleting the entire cookie-injection loop — the whole point of
Phase 1's "a login persists" outcome — leaves the suite green. Nothing in the bundle would notice if
session restore stopped working.

`CookieVaultTests` is the shape to watch: it asserts `trackedNames.contains(...)` and
`count == 2`. That is a correct `toBe(N)`-style assertion about the *constant* (detector rule 1 and
rule 5 are both satisfied — the expected names are declared, not derived). But invariant 6 is a
sentence about **behaviour**, and S7 shows no test runs a cookie through `save` at all. The test
holds the declaration and not the thing declared.

---

## 6. External links do nothing in the shell

`[introduced]` — `ios/Litloft/Web/WebView.swift:42-88` (absence), against `frontend/src/components/MarkdownPreview.tsx:198-199`

`Coordinator` is set as the `uiDelegate` (`WebView.swift:18`) but implements only
`contextMenuConfigurationFor`. `grep -rn "createWebViewWith\|decidePolicyFor" ios/` returns nothing.
A `WKWebView` whose UI delegate does not implement
`webView(_:createWebViewWith:for:windowFeatures:)` discards `target="_blank"` navigations silently.

Every non-`loft://` markdown link is rendered with `target="_blank"` and
`rel="noopener noreferrer"` (`MarkdownPreview.tsx:198-199`).

**Failure scenario.** A note contains `[the docs](https://example.com)`. In Safari the tap opens a
tab. In the shell the tap does nothing at all — no navigation, no error, no feedback — and there is
no way to reach the link target from inside the app.

Evidence level: this is read from the code plus the documented `WKWebView` contract, not measured on
a device — I have no way to drive a tap here. It is exactly what R-5's five minutes in the running
app is for, and it should be on that checklist alongside the long-press item already queued.

Breaks no declared invariant → **B**, user-reachable.

---

## 7. A cancelled navigation raises the full-screen error view

`[introduced]` — `ios/Litloft/Web/WebView.swift:69-79`, `ios/Litloft/Web/WebViewModel.swift:29-31,38-48`

`didFailProvisionalNavigation` routes every error to `markFailed`. WebKit reports a *superseded*
load as `NSURLErrorCancelled` (-999), which is not a failure — it means a newer load took over. The
`switch` in `message(for:)` has no case for it, so it falls to `default: error.localizedDescription`
and the error overlay appears reading "cancelled".

**Failure scenario.** Server is slow. The error view appears, the user taps "Try again"; the load
starts; they tap "Try again" again (or the first `start(_:)` load is still in flight when the retry
fires). WebKit cancels the older provisional navigation. Order of callbacks is
`didStartProvisionalNavigation` for the new load → `didFailProvisionalNavigation(-999)` for the old
one, so the state machine ends at `.failed("cancelled")` and **stays there** until the new load
reaches `didFinish`. The user is looking at "Cannot reach Litloft — cancelled" while the page is
loading perfectly well behind it.

**Mutation S15** — `markFailed` sets `.loaded` instead. `want=kill` (invariant 7: an unreachable
server must show a retry). **Survived**: nothing holds the error screen in either direction.

`-999` should be swallowed, not shown.

---

## 8. The script message handler is exposed to every frame and every origin, and replies always go to the main frame

`[introduced]` — `ios/Litloft/Bridge/ShellBridge.swift:15-17,23-42,44-56`

`install` uses `userContentController.add(self, name:)` — not the variants that take
`forMainFrameOnly` or a `contentWorld` — so `window.webkit.messageHandlers.litloft` is injected into
**every frame of every origin** the web view loads, including `HtmlPreview`'s sandboxed iframe (it
has `allow-scripts`) and any third-party media embed. `userContentController(_:didReceive:)` never
looks at `message.frameInfo`, so it cannot tell who sent a command.

The mirror-image problem: `deliver` calls `webView.evaluateJavaScript(_:completionHandler:)` with no
frame argument, which always evaluates in the **main frame**. So a `ping` from a subframe is
accepted, and the `pong` is delivered into a different window than the one that asked. On the TS
side `isNativeShell()` returns `true` in that subframe (`nativeBridge.ts:31,34-36`) while
`pingShell()` there can only ever resolve `false` after the 2 s timeout.

Today's blast radius is one `pong`, because `ping` is the only command. It stops being cosmetic at
Phase 2a, when `load` / `seek` / `setRate` arrive on the same unauthenticated channel. Worth closing
now, while the handler table has one entry.

**B**, `[introduced]`. No mutation: there is no test to kill.

---

## 9. `postToShell`'s `catch` is never exercised

`[introduced]` — `frontend/src/lib/nativeBridge.ts:38-47`, `frontend/src/lib/__tests__/nativeBridge.test.ts:44-46`

Invariant 2 has two halves: `pingShell()` resolves false, and `postToShell` does not throw. The
second is tested only by `"swallows a post rather than throwing"`, which runs **outside** the shell
— `handler()` returns null and the function returns at line 40 before `postMessage` is ever reached.
The branch the `try/catch` exists for, where the handler is present and throws during teardown, is
untested.

**Mutation M4** — removed the `try`/`catch`, leaving a bare `target.postMessage(message)`.
`want=live` (probing). **Survived**: 15/15 passed.

A stub whose `postMessage` throws would close it in three lines.

---

## 10. `pingShell` seq uniqueness is unheld

`[introduced]` — `frontend/src/lib/nativeBridge.ts:87,93`

**Mutation M8** — `const seq = ++nextSeq` → `const seq = nextSeq` (every ping uses 0). `want=live`.
**Survived**: 15/15 passed.

The shipped code is correct. But `"ignores a pong that answers a different ping"` passes by sending
`sent.seq + 1`, which stays distinct even when the counter is frozen, so nothing holds the property
the counter is there for: two concurrent pings must not share a seq. A test that starts two pings
and answers only the second is the missing one. Low value while `ping` is the only command; it
becomes the basis of §4.1's ordering guarantee at Phase 2a.

---

## 11. `ServerSetupView.initialText` is dead

`[introduced]` — `ios/Litloft/Settings/ServerSetupView.swift:4,11-15`, `ios/Litloft/RootView.swift:13`

The only construction site uses the default `""`. After "Change server" discards a perfectly good
address, the user retypes it from scratch with nothing pre-filled — which is what the parameter
appears to have been written for.

**B.** Either pass the previous address (`ServerSettings` still holds it until `forget()` runs, so
this needs a small reorder) or delete the parameter.

---

## 12. `isValidHost` accepts any bracketed literal, and there is no total host-length cap

`[introduced]` — `ios/Litloft/Settings/ServerSettings.swift:65-78`

- **Mutation S3** — the bracketed branch `return host.count > 2` → `return true`. `want=live`.
  **Survived.** `[zz]`, `[hello]`, `[....]` all parse as addresses; nothing checks they are IPv6.
- **Mutation S2** — dropped `label.count <= 63`. `want=live`. **Survived.** The per-label cap is
  unheld, and there is no 253-character total cap at all.

Low: the outcome of letting one through is a DNS failure that lands on the error view, which is the
same place the user ends up anyway. Worth a line because the docstring at `:63-64` states the
function's purpose as keeping typos out of the network, and these are typos it lets through.
**B.**

---

## 13. The iOS tests do not run in CI

`[introduced]` — `.github/workflows/ci.yml`

`grep -rln "ios\|xcodebuild\|swift" .github/workflows/` matches nothing. There is no iOS job. The
`ServerAddress` coverage that killed five mutations above is real work that no pipeline enforces:
a later change can break invariant 3 and every check stays green.

There is also no `.swiftlint.yml` anywhere in the repo, so the `swiftlint lint` step in the review
brief runs on stock defaults and is wired to nothing.

`review-workflow.md`: *"A detector CI does not run is not a detector."* **B**, and cheap to fix —
a `macos-latest` job running the same `xcodebuild test` line.

---

## Mutations that survived deliberately (`want=live`)

Probes, not defects — recorded so the author can see what was covered.

| mutation | file | note |
|---|---|---|
| M7 `installReceiver`: drop the already-installed early return | `nativeBridge.ts:61` | Re-installing an equivalent receiver is harmless. No test, and none needed. |
| M9 `finish`: drop `clearTimeout(timer)` | `nativeBridge.ts:99` | Leaks a timer; `settled` already makes the late fire a no-op. |
| M10 `pingShell`: `postToShell` before `subscribeToShell` | `nativeBridge.ts:104-109` | Only matters if the shell could answer synchronously, which `WKScriptMessage` cannot. Current order is the safer one; keep it. |
| S16 `updateUIView`: reload on every update | `WebView.swift:32` | The `lastReloadToken` guard is correct; surviving only means no test drives SwiftUI updates. |
| S19 `StoredCookie.isExpired`: `<=` → `<` | `StoredCookie.swift:25` | The boundary case is one instant wide. |
| S20 `StoredCookie.init`: drop the empty-name guard | `StoredCookie.swift:14` | `HTTPCookie` cannot produce an empty name in practice. |

## Checked, no finding

- **`evaluateJavaScript` interpolation is not injectable.** `ShellBridge.deliver` builds
  `window.__litloft?.receive(\(json))` from a `ShellMessage` whose `type` is always a shell-side
  constant (`ShellMessageType.pong`) and whose `seq` is an `Int` — `body["seq"] as? Int` at
  `ShellBridge.swift:29` rejects anything else before it is echoed. `JSONEncoder` on an `Int`
  cannot emit a string break. Nothing the web side controls reaches the interpolation as text.
- **No retain cycle through the message handler.** `WKUserContentController` retains `ShellBridge`
  and `ShellBridge` holds `webView` `weak` (`ShellBridge.swift:12`), so the classic
  webView → configuration → contentController → handler → webView cycle is broken. `CookieBridge`
  likewise holds `store` `weak`.
- **Cookie-before-first-load ordering is correct as written.** `Coordinator.start` awaits
  `cookies.attach` and only then calls `webView.load` (`WebView.swift:54-59`), and
  `makeUIView` primes `lastReloadToken` so the `updateUIView` that SwiftUI fires immediately
  afterwards does not race a second load in. The defect is that nothing holds it (S11, S23 above),
  not the ordering itself.
- **`CookieBridge` is never removed as a `WKHTTPCookieStoreObserver`**, and `.default()` is
  process-wide, so each server change adds an observer. WebKit holds observers weakly, so a
  deallocated `CookieBridge` stops receiving; what is left is a stale map entry. Not worth a
  finding.
- **Swift 6 concurrency.** `ShellBridge`, `CookieBridge`, `WebViewModel`, `ServerSettings` and
  `Coordinator` are all `@MainActor`; the one hop off it, `cookiesDidChange`, is `nonisolated` and
  bounces back through `Task { @MainActor in ... }` (`CookieBridge.swift:24-28`). Builds clean in
  `SWIFT_VERSION = 6.0` with no concurrency diagnostics.
- **The `popup-dismissal` count bump is a live detector.** `toBe(433)` → `toBe(434)` fails, so the
  bump is doing its job and satisfies detector rule 1.
- **Already accepted, per the brief, not re-derived**: long-press suppression unverified by hand;
  the cookie path not exercisable against the local server (`passwords.json` is `[]`); server
  address in `UserDefaults` rather than the keychain; one-directional cookie sync.

TOTAL: 13 findings
