# iOS shell Phase 1 — round 2

- Reviewed SHA: `95f2ccc9` (the fix commit under review is `d65a9ef6`; `95f2ccc9` on top of it is documentation only)
- Round 1: `docs/developer-guide/reviews/ios-shell-phase1/round-1.md`
- Invariants: `docs/superpowers/specs/2026-09-16-ios-native-shell-invariants.md` (4 and 6 revised, 9–12 added by round 1)
- Baseline before mutating: `xcodebuild test` → **TEST SUCCEEDED**; `vitest run src/lib/__tests__/nativeBridge.test.ts` → 17 passed;
  `vitest run src/__tests__` → 616 passed / 45 files; `tsc --noEmit` clean. `swiftlint lint --quiet`
  could not run here — it aborts loading `sourcekitdInProc` in this environment — so nothing below
  rests on it.
- Scope: `[introduced]` here means *introduced by the fix*, not by Phase 1.

**Tree note, not a finding.** The working tree at `95f2ccc9` carries three uncommitted
modifications: `addons/knowledge` (flagged in the brief as pre-existing), plus
`ios/Litloft.xcodeproj/project.pbxproj` and `ios/Litloft-Info.plist`. The latter two are
Xcode normalisation plus `DEVELOPMENT_TEAM = LJ2FWJRA79` and the removal of
`NSLocalNetworkUsageDescription` — almost certainly residue of the author's R-5 device run.
They are not part of `d65a9ef6`. Everything below was measured with them in place, and I
restored only my own edits.

---

## 1. An empty jar now clears the keychain, so a website-data purge destroys the copy the keychain exists to be

`[introduced]` — `ios/Litloft/Storage/CookieVault.swift:4-5,28-34`, `ios/Litloft/Web/SessionCookies.swift:16-23`, `ios/Litloft/Web/CookieBridge.swift:23-27`

Round 1 finding 3 asked for a sign-out path. The fix supplied one by making an empty capture
destructive:

```swift
// CookieVault.swift:28-34
/// An empty set is a sign-out, not a no-op: it clears what was stored.
static func save(_ cookies: [HTTPCookie]) {
    let stored = cookies.compactMap(StoredCookie.init)
    guard !stored.isEmpty else {
        clear()
        return
    }
```

`capture` runs from `cookiesDidChange`, which WebKit fires on **any** change to the
process-wide jar — including one the user did not make. "The jar holds no session cookie"
and "the user signed out" are now the same event, and the file's own first sentence names a
third cause:

```swift
// CookieVault.swift:4-5
/// Keeps Litloft's session cookies across launches. WebKit may purge its own
/// website data, which is the only other place they live.
```

So the vault is cleared by precisely the event it was built to survive.

**Failure scenario.** The user unlocks a protected drive with "Remember this device"; the
JWT is in the jar and in the keychain. iOS reclaims storage, or WebKit's intelligent
tracking prevention evicts the site's data, or the user clears website data. The jar loses
`access_token`; `cookiesDidChange` fires; `capture` reads an empty tracked set;
`CookieVault.save([])` calls `clear()`. The keychain copy — the whole point of the vault —
is gone, and the next launch lands on the unlock screen. Before this commit the guard was
`guard !stored.isEmpty else { return }` and the purge was survivable.

**Measurement** (temporary probe under `ios/LitloftTests/`, run, then deleted — tree restored).
Real `WKHTTPCookieStore`, real keychain:

| probe | assertion | result |
|---|---|---|
| PROBE-W | after `capture` from an emptied jar, `CookieVault.load()` is still non-empty | **failed** — the vault was wiped |

Breaks no invariant as written (9 and 10 govern attributes and server changes; nothing
declares the vault durable). A **B** by the letter of R-4 — but one a user reaches without
doing anything, and it undoes the outcome Phase 1 exists for, so it is the supervisor's call
whether the list was incomplete. Not decided here.

If the intent is to keep the sign-out, the discriminator has to be the event, not the count:
a lock is `access_token` *disappearing while the jar is otherwise intact*, which is not the
same observation as *the jar having nothing in it*.

---

## 2. `SessionCookies.capture` has no test at all, so invariant 6 is held only for a helper and not for the path that stores anything

`[introduced]` — `ios/Litloft/Web/SessionCookies.swift:18-23`, `ios/Litloft/Storage/CookieVault.swift:29-30`, `ios/Litloft/Web/CookieBridge.swift:23-27`

The fix moved the tracked-name filter **out of** `CookieVault.save`. Round 1 mutated that
filter (S7); it no longer exists:

```swift
static func save(_ cookies: [HTTPCookie]) {
    let stored = cookies.compactMap(StoredCookie.init)   // no filter
```

`save` will now persist anything handed to it. The filter lives in `CookieVault.tracked`,
which only `SessionCookies.capture` and `SessionCookies.forget` call — and **no test calls
`capture`**. `SessionCookiesTests` exercises `restore`, `restoreThenLoad`, `forget`,
`CookieVault.tracked` and `CookieVault.matches`, and stops there.

**Mutations.**

| mutation | want | result |
|---|---|---|
| N5 — `capture`: `let tracked = await jar.allCookies()` (skip `CookieVault.tracked` entirely) | kill | **survived** |
| M-K — `cookiesDidChange`: replace the body with `_ = cookieStore` (never capture at all) | kill | **survived** |
| SA1 — `CookieVault.tracked`: drop `matches(domain:host:)` | kill | killed (`foreignHostIsNotTracked`) |

N5 is round-1's S12 in its new location, and it still survives. The pure helper is held; the
only caller that reaches the keychain is not. M-K is the capture-side twin of round 1's S23:
the entire "keep the keychain in step" half of the bridge can be deleted and the suite stays
green.

**Failure scenario for N5.** Any cookie named anything, from any origin the web view has
visited, is written to the keychain and injected into the jar at the next launch — round 1
finding 4 in full, reintroduced by one line, with nothing to catch it.

Invariant 6. A test that runs a jar through `SessionCookies.capture` and asserts what lands
in the vault closes N5, M-K and half of finding 1 at once.

---

## 3. `CookieBridge.attach` can load before restoring, and nothing fails

`[introduced]` — `ios/Litloft/Web/CookieBridge.swift:17-21`, `ios/Litloft/Web/SessionCookies.swift:25-30`

`SessionCookies.restoreThenLoad` exists so the ordering can be tested, and
`restoreComesBeforeLoad` does hold it — for that function. But the production object is free
to stop calling it:

**Mutation M-A** — in `CookieBridge.attach`, replace

```swift
await SessionCookies.restoreThenLoad(into: jar, stored: CookieVault.load(), load: load)
```

with

```swift
load()
await SessionCookies.restore(into: jar, from: CookieVault.load())
```

`want=kill` (invariant 5: *the first page load begins after the stored cookies are in the web
view's jar*). **Survived** (TEST SUCCEEDED).

Round 1's S11 was "`Coordinator.start`: `webView.load(...)` before `cookies.attach(...)`".
The fix moved the ordering into a helper and tested the helper. The mutation simply moved
with it. The failure this protects against — the first request going out without the session
and landing on the unlock screen — is still one edit away from shipping unnoticed.

`restore` is separately reachable and `@discardableResult`, which is what makes the mutation
compile. Either `restore` becomes private to `SessionCookies` so `restoreThenLoad` is the
only way in, or `CookieBridge` gets a test.

---

## 4. `CookieBridge.forget()` is still dead code, and the fix gave it a branch for a state nothing produces

`[introduced]` — `ios/Litloft/Web/CookieBridge.swift:29-35`

Round 1 finding 3, item 1, was "`CookieBridge.forget()` — the only caller of
`CookieVault.clear()` — is never called". After the fix it is still never called. The sign-out
was wired up somewhere else entirely, in `RootView`:

```swift
// RootView.swift:22-30
private func changeServer(from serverURL: URL) {
    Task {
        await SessionCookies.forget(
            from: WKWebsiteDataStore.default().httpCookieStore,
            host: serverURL.host() ?? ""
        )
        settings.forget()
    }
}
```

`grep -rn "forget(" ios/` over `.swift` returns `ServerSettings.forget`,
`SessionCookies.forget`, `CookieBridge.forget` (declaration only) and the two call sites in
`RootView` — neither of which is `CookieBridge.forget`.

**Mutation M-B** — replace the whole body of `CookieBridge.forget()` with `{}`. `want=live`
(dead-code probe). **Survived**, confirming nothing exercises it.

What changed is that the dead function grew:

```swift
func forget() async {
    guard let jar else {
        CookieVault.clear()
        return
    }
    await SessionCookies.forget(from: jar, host: host)
}
```

The brief asks what happens to `SessionCookies.forget` if the jar is gone. Nothing does: the
branch answering that question is inside a function no caller reaches, and the path that does
run takes `WKWebsiteDataStore.default().httpCookieStore`, which always exists. This is the one
place in the commit where the shape is a handler added for a case rather than a case removed.

Delete it, or make `RootView` go through it. The second is better — see finding 6, where
`RootView` re-derives the host that `CookieBridge` already holds.

---

## 5. Invariant 10 has no test on the path that implements it

`[introduced]` — `ios/Litloft/RootView.swift:22-30`

Invariant 10 (added by round 1): *changing the server leaves the previous server's session in
no store.* `forgetClearsTheJar` holds `SessionCookies.forget`. Nothing holds that
`changeServer` calls it.

**Mutation M-L** — in `RootView.changeServer`, delete the `await SessionCookies.forget(...)`
call, keeping `settings.forget()`. `want=kill`. **Survived** (TEST SUCCEEDED).

So the shipped behaviour of finding 3's second scenario — "Change server" clearing only the
stored URL while credentials stay behind — can return without a single test noticing. Round 1
reported that scenario; the fix is real but unheld.

**Also unheld: the vault half of `forget` itself.**

**Mutation N6** — delete `CookieVault.clear()` from the end of `SessionCookies.forget`.
`want=kill`. **Survived**: `forgetClearsTheJar` asserts only
`jar.allCookies().map(\.name) == ["NEXT_LOCALE"]` and never reads the vault. Invariant 10 says
*no store*; the test covers one of the two.

**Checked, no finding — the double tap and the mid-flight replacement.** `changeServer` is
reachable twice (the button stays on screen for the whole `await`). Two overlapping runs are
safe: deleting an absent cookie is a no-op, and `ServerSettings.forget`'s
`lastAddress = serverURL?.absoluteString ?? lastAddress` is exactly the fallback that keeps
the second call from blanking the address. `settings` is a class held in `@State`, so the
continuation after the `await` reaches the live object. The only cost is that nothing on
screen changes until the jar enumeration finishes.

---

## 6. The configured host reaches `CookieBridge` untested, and a wrong host is now destructive

`[introduced]` — `ios/Litloft/Web/WebView.swift:50`, `ios/Litloft/RootView.swift:26`

Two separate places derive the host with the same `?? ""` fallback:

```swift
// WebView.swift:50
self.cookies = CookieBridge(host: model.serverURL.host() ?? "")
// RootView.swift:26
host: serverURL.host() ?? ""
```

**Mutation M-J** — `CookieBridge(host: "")`. `want=kill`. **Survived** (TEST SUCCEEDED).

An empty host matches no domain, so `tracked` returns nothing on every capture — and after
finding 1 that is not a no-op, it is a wipe.

**Measurement** (probe, since this is the interaction between two of the round-1 fixes):

| probe | assertion | result |
|---|---|---|
| PROBE-X | jar holds `access_token` for `litloft.local`, vault holds it, then `capture(from: jar, host: "")` — vault still non-empty | **failed** — the vault was wiped |
| — | `matches(domain: "litloft.local", host: "")` is `false` | passed (confirms the mechanism) |

`ServerAddress.parse` guarantees a host, so `?? ""` should be unreachable today; the finding
is that nothing holds it and the consequence of it becoming reachable changed from "cookies
are not persisted" to "the stored session is destroyed".

---

## 7. `matches` folds case, and nothing holds the fold — which a mixed-case address makes reachable

`[introduced]` — `ios/Litloft/Storage/CookieVault.swift:21-26`, `ios/LitloftTests/SessionCookiesTests.swift:66-74`

**Mutation N3** — drop both `.lowercased()` calls in `CookieVault.matches`. `want=kill`.
**Survived.** The parametrized table has five pairs and every host and domain in it is
already lowercase, so the fold is never exercised:

```swift
(".litloft.local", "litloft.local", true),
("litloft.local", "litloft.local", true),
("litloft.local", "sub.litloft.local", true),
("litloft.local", "notlitloft.local", false),
("evil.example", "litloft.local", false)
```

Mixed case is reachable. `ServerAddress.parse` normalises the scheme and the port but assigns
the host through, unchanged (`ServerSettings.swift:62`, `normalized.host = host`):

| probe | assertion | result |
|---|---|---|
| PROBE-C | `ServerAddress.parse("Litloft.Local:3000")?.host() == "Litloft.Local"` | **passed** |
| PROBE-D | …`== "litloft.local"` | failed |

WebKit stores cookie domains lower-cased, so a user who types `Litloft.local:3000` in the
setup field depends entirely on the fold. Losing it takes `tracked` to empty on every capture,
which after finding 1 wipes the vault. Adding one mixed-case pair to the existing table closes
it.

The other mutations on this function are held: **M-H** — `host.hasSuffix(lowered)` without the
separating dot — `want=kill`, **killed** by the `notlitloft.local` pair.

---

## 8. The bridge closed the frame half of round-1 finding 8 and not the origin half

`[introduced]` — `ios/Litloft/Bridge/ShellBridge.swift:40-48`

Round 1 finding 8 was "exposed to every frame **and every origin**". `route` takes
`fromMainFrame` and nothing about the sender's origin, and `install` still uses the plain
`userContentController.add(self, name:)`, so any document the web view loads as its main frame
can command the shell. Invariant 12 only names the main frame, so this is a **B**, and today
the whole command table is one `pong`. Recorded because finding 8's own argument was that it
stops being cosmetic when `load` / `seek` / `setRate` arrive on the same channel.

The frame half is genuinely closed: **M-C** — `guard fromMainFrame` → `guard true` —
`want=kill`, **killed** (`subframeIsNotTrusted`).

---

## 9. The cancelled guard compares a code without its domain

`[introduced]` — `ios/Litloft/Web/WebViewModel.swift:32`

```swift
guard URLError.Code(rawValue: (error as NSError).code) != .cancelled else { return }
```

`(error as NSError).code` is read without `(error as NSError).domain`, so any error numbered
`-999` in any domain is swallowed, not only `NSURLErrorDomain`'s cancellation. No current
WebKit domain uses `-999`, so this is a **B** and low; it is worth a line because the same
`message(for:)` below it has the same shape and this commit is what made a wrong answer here
silent rather than merely mislabelled.

The guard itself is held: **M-E** — delete it — `want=kill`, **killed**
(`cancelledIsNotAFailure`).

Related, checked, not a finding: a `-999` on a load with **no** successor now leaves the model
at `.loading` forever, and `WebShell` renders no overlay for `.loading`
(`WebShell.swift:13-24`), so the user would face a blank web view with no retry and no
"Change server" — invariant 7's exact wording. I could not construct a reachable case: every
`-999` I can name arrives because a newer load superseded the old one, and downloads and
policy refusals arrive as `WKErrorDomain` 102, which still reaches the error view. Naming it
so R-5 can look for it.

---

## The trajectory question

> Read the round-1 findings and then the fix diff. Does the fix add a branch, a state or a
> prediction for each case round 1 raised, or does it remove them and converge?

**It converges, with one exception.** This is not a design being patched case by case.

What the fix **removed**, and these are the load-bearing moves:

- **A whole durable store.** `HTTPCookieStorage.shared` and its three call sites are gone
  (`CookieBridge.swift`, −4 lines of mirroring, −1 delete loop). Invariant 4 was revised
  *down* — fewer places, not more. Round 1's finding 2 was closed by deleting a thing, which
  is the strongest available shape.
- **A decision expressed as control flow became data.** `ShellBridge`'s handler was a
  `guard`/`switch` interleaved with logging and delivery; it is now
  `route(body:fromMainFrame:) -> ShellMessage?` plus `reply(to:seq:) -> ShellMessage?`, two
  pure functions, with the logging pushed out of the decision. The branch count is the same;
  the number of places that can be wrong dropped, and it is the reason M-C, M-F and the whole
  malformed-body table are now killable. Genuinely simpler, not a second layer.
- **Three copies of "which cookies are ours" became one.** `CookieVault.tracked` /
  `matches` are the single predicate; `capture` and `forget` both go through it.

What it **added**: `CookieJar`, `SessionCookies`, `FakeCookieJar`, `host` on `CookieBridge`,
`lastAddress` on `ServerSettings`, two fields on `StoredCookie`, the cancelled guard, the
`fromMainFrame` parameter. Judged by shape rather than size, almost all of that is *the same
decision moved to where it can be observed* — nine of my mutations died inside it. That is
what a converging round looks like.

**The exception, and it is a real one.** The seam was drawn just inside the tested boundary
rather than at the edge of the app. `CookieJar` abstracts `WKHTTPCookieStore`, but
`CookieBridge` — the object that actually runs — takes a concrete `WKHTTPCookieStore`, is not
behind the protocol, and has no test. So the new layer is a well-held core inside an unheld
shell, and five mutations survived in that shell: M-A (load before restore), M-B (dead
`forget`), M-K (never capture), M-J (empty host), M-L (never forget on change-server). Round 1
reported S11 and S23 as "the ordering and the injection are unheld". The fix made the
*extracted* ordering and injection held and left the *wired* ones unheld. That is not a new
case being special-cased; it is the same gap one level up.

**One addition does have the patching shape**: `CookieBridge.forget()`'s `guard let jar`
(finding 4) is a branch for a state no caller produces, inside a function no caller calls —
round 1 reported the function as dead and it is still dead. And `ServerSettings.forget`'s
`?? lastAddress` is a second fallback guarding a re-entry the single call site makes possible.
Two small predictions; not a pattern.

I am reporting the shape, not deciding what follows.

---

## `want=live` survivors

Probes and deliberate survivors, recorded so the author can see what was covered.

| mutation | file | note |
|---|---|---|
| M-B `CookieBridge.forget`: empty body | `CookieBridge.swift:29` | Ran as a dead-code probe; it is finding 4. |
| M-I `ServerSettings.init`: `lastAddress = stored` (the raw, untrusted string) | `ServerSettings.swift:17` | Survived. Harmless: `lastAddress` only pre-fills the text field, and `connect()` puts it back through `ServerAddress.parse` before it becomes a URL. Invariant 3 is about what is *restored*, and `serverURL` is still parsed. Not worth a test. |
| N3 `matches`: drop case folding | `CookieVault.swift:23-24` | Survived, and it is finding 7 — recorded here too because the shipped code is correct and only the test is missing. |

## Checked, no finding

- **The HttpOnly / SameSite round trip works end to end, including through WebKit's jar.**
  This was the fix's biggest new risk: `WKHTTPCookieStore.setCookie` had to accept a cookie
  that Phase 1 never gave it. Probed against a real `WKWebsiteDataStore` with a live
  `WKWebView` (an earlier run without one produced a false negative on the *control*, which
  is why the control is listed):

  | probe | assertion | result |
  |---|---|---|
  | P1 (control) | a plain cookie is visible in `allCookies()` | passed |
  | P2 | an `HttpOnly`-only cookie is visible | passed |
  | P3 | a `SameSite=Strict`-only cookie is visible | passed |
  | P4 | both attributes together, visible | passed |
  | P7 | the jar returns `isHTTPOnly == true` | passed |
  | P8 | the jar returns `sameSitePolicy == .sameSiteStrict` | passed |
  | P5 | `HTTPCookiePropertyKey("HttpOnly")` really yields `isHTTPOnly` | passed |
  | P6 | `StoredCookie(cookie)?.makeCookie()` keeps `isHTTPOnly` | passed |

  So restore still works and capture can still see what it restored. Finding 1 is closed
  correctly, and both halves are held: **M-D** (drop the `HttpOnly` property) and **M-M**
  (drop the `sameSitePolicy` property) are both `want=kill` and both **killed** by
  `attributesSurvive`.

- **A stale `CookieBridge` cannot wipe a later server's vault.** I expected this to be the
  worst consequence of finding 1: nothing calls `WKHTTPCookieStore.remove(_:)`, so a bridge
  for the previous host stays registered, and one capture from it with the wrong host would
  clear the new server's session. Measured instead:

  | probe | assertion | result |
  |---|---|---|
  | PROBE-A | after dropping the last strong reference, the observer has **not** deinited | **failed** — it deinited |
  | PROBE-B | a dropped observer still receives `cookiesDidChange` | **failed** — it does not |

  WebKit holds cookie-store observers weakly and stops delivering once they go, so round 1's
  "not worth a finding" note still holds after the fix. The reachable host-mismatch case is
  finding 6, not this.

- **`matches` and the hostile-domain question.** A *parent* domain matches
  (`matches(".local", "litloft.local")` is `true`), which is RFC 6265 domain-match semantics —
  a cookie WebKit would itself send to that host — so it is intended, not a hole. The
  confusable sibling (`notlitloft.local` against `litloft.local`) is correctly rejected and
  tested (M-H killed). A leading dot is stripped and tested. A **trailing-dot** host does not
  match (`matches("litloft.local", "litloft.local.")` is `false`), but it is unreachable:
  `isValidHost` splits with `omittingEmptySubsequences: false`, so `litloft.local.` has an
  empty final label and `ServerAddress.parse` rejects it before it can become a server URL.

- **Swift 6 concurrency across the new surface.** `CookieJar` is `@MainActor` and
  `WKHTTPCookieStore` conforms without a shim; `SessionCookies` is a `@MainActor enum` of
  statics; `ShellBridge.route` / `reply` are `nonisolated static` over `Any` and `String`,
  touching no actor state, which is what lets `ShellBridgeTests` be a non-`@MainActor` struct.
  Builds clean in `SWIFT_VERSION = 6.0` with no concurrency diagnostics. The one hop off the
  actor, `cookiesDidChange`, is still `nonisolated` bouncing through `Task { @MainActor in }`.

- **The new tests do not pass vacuously, and the ordering shape the author found is not
  repeated.** `restoreComesBeforeLoad` records `jar.cookies.map(\.name)` *inside* the `load`
  closure and asserts `jarWhenLoadRan == ["access_token"]` — an expected set that is declared,
  not derived, and one that a reordering changes (M-G and M-A behave differently against it,
  which is the point). `restorePutsCookiesBack` asserts `jar.calls` as an ordered declared
  list. `forgetClearsTheJar` asserts the surviving names as a declared list rather than a
  count. `domainMatching` declares five pairs. `CookieVaultTests`' `count == 2` is still a
  `toBe(N)` on a constant. Detector rule 5 is satisfied throughout: I found no second test of
  the shape the author already fixed.

- **The two new frontend tests close findings 9 and 10 for real.**

  | mutation | want | result |
  |---|---|---|
  | F1 `pingShell`: `const seq = nextSeq` (freeze the counter) | kill | **killed** (`gives two pings in flight different seqs`) |
  | F2 `postToShell`: remove the `try`/`catch` | kill | **killed** (`swallows a handler that throws while the view tears down`) |
  | F3 `isInbound`: accept any object | kill | **killed** (`ignores a payload that is not a message`) |

  `installThrowingShell` plus `vi.resetModules()` puts the throwing handler in place *before*
  the module is loaded, so the `catch` is genuinely on the path — round 1's M4 is closed.

- **Deferred items, one line each as instructed.** Finding 6 (external `target="_blank"`
  links) and the long-press item are in `known-issues.md` as agreed; finding 12 (`isValidHost`
  bracketed literals, no total host cap) and finding 13 (no iOS job in CI) are unchanged in
  this commit and were accepted. Not re-derived.

- **Prose.** Nothing in the commit's comments or docs would lead a reader to a wrong code
  change, so nothing to report under R-3. (`ShellBridge.swift:37-38` says WebKit offers no way
  to scope a message handler to the main frame; that is accurate — `add(_:name:)` and
  `add(_:contentWorld:name:)` are the only variants, and neither takes `forMainFrameOnly`.)

---

## Summary of mutations

| id | target | want | result |
|---|---|---|---|
| SA1 | `CookieVault.tracked`: drop the host match | kill | killed |
| N3 | `CookieVault.matches`: drop case folding | kill | **survived** (finding 7) |
| N4 | `CookieVault.save`: empty → early return instead of `clear()` | kill | killed |
| N5 | `SessionCookies.capture`: skip `CookieVault.tracked` | kill | **survived** (finding 2) |
| N6 | `SessionCookies.forget`: drop `CookieVault.clear()` | kill | **survived** (finding 5) |
| M-A | `CookieBridge.attach`: load before restore | kill | **survived** (finding 3) |
| M-B | `CookieBridge.forget`: empty body | live | survived (finding 4) |
| M-C | `ShellBridge.route`: drop `fromMainFrame` | kill | killed |
| M-D | `StoredCookie.makeCookie`: drop `HttpOnly` | kill | killed |
| M-E | `WebViewModel.markFailed`: drop the cancelled guard | kill | killed |
| M-F | `ShellBridge.reply`: answer every type with a pong | kill | killed |
| M-G | `SessionCookies.restore`: put nothing in the jar | kill | killed |
| M-H | `CookieVault.matches`: `hasSuffix` without the dot | kill | killed |
| M-I | `ServerSettings.init`: offer the raw stored string | live | survived |
| M-J | `Coordinator`: `CookieBridge(host: "")` | kill | **survived** (finding 6) |
| M-K | `CookieBridge.cookiesDidChange`: never capture | kill | **survived** (finding 2) |
| M-L | `RootView.changeServer`: never forget the session | kill | **survived** (finding 5) |
| M-M | `StoredCookie.makeCookie`: drop `SameSite` | kill | killed |
| M-N | `CookieVault.load`: drop the `!isExpired` filter | kill | killed |
| F1 | `pingShell`: freeze the seq counter | kill | killed |
| F2 | `postToShell`: remove the `try`/`catch` | kill | killed |
| F3 | `isInbound`: accept any object | kill | killed |

Spot-checks of the author's reported kills: **SA1, M-C, M-D, M-E, M-F, M-G, M-M, M-N, F1, F2**
all confirmed killed. Two of the author's reported kills do **not** hold at the call site:
"deleting the whole cookie-injection loop" is killed for `SessionCookies.restore` (M-G) but
not for `CookieBridge` (M-A, M-K), and "dropping the tracked-name/host filter" is killed for
`CookieVault.tracked` (SA1) but not for `SessionCookies.capture` (N5).

Tree restored: `git status --short` shows only `addons/knowledge`, `ios/Litloft-Info.plist`
and `ios/Litloft.xcodeproj/project.pbxproj`, all pre-existing; `git diff HEAD` over
`ios/Litloft`, `ios/LitloftTests` and `frontend/src` is empty. Nothing was committed, pushed
or branched, and nothing was fixed.

TOTAL: 9 findings
