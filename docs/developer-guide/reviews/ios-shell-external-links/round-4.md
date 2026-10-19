# Round 4 — iOS shell: does the third outcome end the chain?

- Reviewed SHA: `fd6de397a37772b54c684431d8d65055f422029c`
- Subject: `3c8704b0` (let a load end in the third way it can — stopped by the shell)
- Parent for `[introduced]` reproductions: `14ea951d`, exported with `git archive`
  to a tree of its own and built separately (the reviewed worktree was never moved).
- Worktree: `/private/tmp/claude-502/-Users-libre-Sources-video-share/317d1718-1596-4bf3-a3e7-5f3c9662fd2f/scratchpad/review-ext-4`
- Simulator: iPhone 17 Pro Max (`BE039A5E`), iOS 26.5, Xcode 26.5.
- Suite at the reviewed SHA, before and after the mutation campaign:
  **170 distinct tests, 227 runs, `** TEST SUCCEEDED **`**.
  `swiftlint lint --quiet` — 0 output. Tree restored and `git status --short`
  empty at `fd6de397`.
- All nine test methods `3c8704b0` adds or renames were confirmed by name in the
  run log, so the incremental-build trap did not apply. Every mutation below was
  confirmed to compile and run (one that did not, M18, is reported as void).
- Live measurements were taken against the Litloft on `http://localhost:3000`
  (read only; nothing restarted or rebuilt) and against three purpose-built
  local servers: a redirector, a 204 answerer, and one that serves a page and
  then starts redirecting.

R-0 is §3 of `docs/superpowers/specs/2026-09-18-ios-shell-external-links.md`,
including **invariant 8**:

> when there is no page on screen, a load that stops is always reported to the
> viewer; the error view is the only way back to the address picker, so the app
> must not sit blank and silent.

---

## The measurement that decides the round

Every probe put the web view in a real key `UIWindow` and traced every
navigation-delegate entry point and every model transition, so that the
*absence* of a callback is observable rather than inferred.

| probe | scenario | `14ea951d` (parent) | `fd6de397` (reviewed) |
|---|---|---|---|
| **PROBE-H** | first load answers with an attachment | `.loading` forever, nothing offered (round 3 #1) | **`.failed`, file offered** ✅ |
| **PROBE-CANCEL** | first navigation cancelled by the shell's own policy, no page | `.loading` forever (round 3 #2) | **`.failed`** ✅ |
| **PROBE-G** | download from a page that is up | `.loading` forever (round 3 #4) | **`.loaded`, page survives, file offered** ✅ |
| **PROBE-C** | `-1004`, nothing listening | `.failed` | `.failed` ✅ |
| **PROBE-DEAD** | content process killed while on screen | reload, `.loaded` | reload, `.loaded` ✅ |
| **PROBE-JETSAM** | process died while away, server now redirects | `.failed` | **`.loaded` — blank and silent** ✗ |
| **PROBE-204** | same-origin navigation answered 204, page up | `.loading`, page stays readable | **`.failed` over a good page** ✗ |

**The three cases this commit was written for are fixed.** Measured, not taken
on the author's word: the first-load attachment (PROBE-H) — the case round 1 #1,
round 2 #1 and round 3 #1 were all about — now reaches the viewer, and so does
the first navigation the shell hands to Safari (PROBE-CANCEL).

**Two cases the parent held are now broken.** Both come from the same move: the
question *is there a page on screen* is still being asked of `WKWebView`, and the
property it is asked of has changed for the third time. The predicate has been
wrong in a **different** case each round.

| round | predicate for "a page is on screen" | wrong in |
|---|---|---|
| `ee5f7f81` | a `diverted` flag the shell sets | the first-load attachment (round 2 #1) |
| `14ea951d` | `webView.url != nil` | a redirect, where `url` is the in-flight address (this commit's own premise) |
| `3c8704b0` | `webView.backForwardList.currentItem != nil` | a dead content process, where the item outlives the page (finding 1) |

---

## Findings

### 1. `[introduced]` Invariant 8, again: a web process that died while the app was away leaves `backForwardList.currentItem` non-nil with nothing on screen, and the shell reports the stopped load as success

`ios/Litloft/Web/WebView.swift:8`, `ios/Litloft/Web/WebView.swift:174`,
`ios/Litloft/Web/WebViewModel.swift:41-48`

`hasCommittedPage` is `backForwardList.currentItem != nil`. Measured at the
reviewed SHA, that is **not** the same question as "is anything drawn". Killing
the web content process while `isActive()` is false:

```
PROBE[DEADOFF] before      state=loaded committed=true
PROBE[DEADOFF] whileAway   url=nil committed=true state=loaded
```

`url` goes to `nil`, the screen is blank, and `currentItem` survives. The
existing test `deadPageOffScreenWaits` asserts exactly that `url == nil` here, so
this state is one the suite already knows about.

Now let the app come back to a server that has started redirecting — a LAN
server replaced by a portal, a proxy that now sends visitors to a sign-in. The
shell reloads `lastPage`, the policy hands the address to Safari, and:

```
PROBE[JETSAM] page up:      state=loaded committed=true
PROBE[JETSAM] dead & away:  url=nil committed=true state=loaded
PROBE[JETSAM] state=loaded  url=nil committed=true  opened=["https://example.com/portal"]
PROBE[JETSAM]   | actionPolicy url=https://example.com/portal main=true pageOnScreen=true
PROBE[JETSAM]   | markStopped pageOnScreen=true from=loading
PROBE[JETSAM]   | didFailProvisional WebKitErrorDomain/102 url=nil committed=true
PROBE[JETSAM]   | markFailed WebKitErrorDomain/102 from=loaded
```

`markStopped(pageOnScreen: true)` settles on `.loaded` although nothing is
drawn. `WebShell.swift:20` never renders `ConnectionErrorView`, which still
holds the only call site of `onChangeServer`. The app is blank, silent, and has
no way back to the address picker. **Invariant 8.**

The last two lines are the sharp part: WebKit *did* deliver a report here, and
the new `state == .loading` guard (`WebViewModel.swift:33`) threw it away
**because `markStopped` had already declared the load a success.** The commit
did not merely fail to see this case; it silenced the one signal that covered it.

Same reproduction at the parent `14ea951d` (exported tree, built separately):

```
PARENT[JETSAM] dead & away: url=nil committed=true state=loaded
PARENT[JETSAM] state=failed("フレームの読み込みが中断しました。") opened=["https://example.com/portal"]
PARENT[JETSAM]   | loadFailed WebKitErrorDomain/102 pageOnScreen=false from=loading
```

The parent tells the viewer. `[introduced]`.

Reproduced twice, identically, in separate runs.

### 2. `[introduced]` Deleting the `102` special case means an interrupted load the shell did **not** stop now raises the error view over a readable page

`ios/Litloft/Web/WebViewModel.swift:32-34`, `56-59`

`markFailed` no longer looks at the error at all beyond `NSURLErrorCancelled`.
The commit's premise is that every `WebKitErrorDomain` 102 worth forgiving is
preceded by a `markStopped` that has already moved the state off `.loading`.
That is true of the download path and of the policy-cancel path — both measured
above — but it is a claim about *all* producers of a 102, and there is at least
one the shell does not cause. A same-origin main-frame navigation answered with
`204 No Content`, with a good page on screen:

```
PROBE[204] after first load state=loaded committed=true
PROBE[204] state=failed("フレームの読み込みが中断しました。")
PROBE[204] url=http://localhost:62635/ committed=true loading=false
PROBE[204]   | didFailProvisional WebKitErrorDomain/102 url=http://localhost:62635/ committed=true
PROBE[204]   | markFailed WebKitErrorDomain/102 from=loading
```

The viewer gets `ConnectionErrorView` — heading "Cannot reach Litloft", body
WebKit's localized "frame load interrupted" — laid over a page that is fine and
still there behind it. At the parent, `reaches(102, pageOnScreen: true)`
forgave it and nothing was shown (`PARENT[204] state=loading`). `[introduced]`.

**Reachability is unproven.** I could not name a Litloft URL a main frame
navigates to that answers 204 or otherwise produces a 102 the shell did not
cause: the backend's 204s are on `DELETE`/`POST` routes and on
`GET /api/files/{id}/progress`, none of which the UI navigates the main frame
to; and a same-origin response WebKit cannot draw does **not** produce one
(PROBE-MIME: `application/vnd.litloft.loft+json` with no attachment disposition
commits and finishes normally). So this is the mechanism measured on a synthetic
server, not a path a viewer is known to reach. Recorded as what the commit
changed, for whoever triages it.

### 3. `[introduced]` The `pageOnScreen` the response policy computes is held by nothing — the first-load attachment case has no end-to-end test

`ios/Litloft/Web/WebView.swift:200`

Mutations M11 and M11b pin that argument to `true` and to `false`. **Both
survive the whole suite.** The three tests that exercise the download path all
supply `pageOnScreen` themselves rather than letting the delegate compute it:
`ExternalLinkDelegateTests`' `Rig.answer` passes a parameter, and
`CoordinatorTests/downloadLeavesThePageUp` — the one with a real page from the
running Litloft — calls
`coordinator.policy(for: attachment, pageOnScreen: webView.url != nil)`, which
both bypasses `hasCommittedPage` and reintroduces the predicate this commit
exists to replace.

So PROBE-H passes at this SHA by measurement and not by the suite. The sequence
three rounds have been about is still the one with no test that drives it end to
end. This is round 3 finding 3's shape at a different call site: the seam is
tested, the wiring into it is not.

The navigation-action call site is not in this state — M12, M13 and M14 are all
killed, by `firstLoadRedirectedAway` and `offOriginNavigationIsHandedOver`. The
difference is that those two tests drive real WebKit; the download tests do not.

### 4. `[introduced]` `markLoading` is now the precondition for every failure the viewer is ever shown, and nothing holds it

`ios/Litloft/Web/WebView.swift:217-219`, `ios/Litloft/Web/WebViewModel.swift:33`

M17 deletes `model.markLoading()` from `didStartProvisionalNavigation`. **The
whole suite stays green** — as it did at round 3 (M13 there). What changed is
the cost. Before this commit `markLoading` only decided what the screen said
while a load was in flight; now `state == .loading` gates `markFailed`, so
without it every failure after the first page is swallowed.

Measured, with M17 applied, against a local server taken down after a page was
up:

```
PROBE[GONE] page up: state=loaded
PROBE[GONE] after:   state=loaded url=http://localhost:51490/
```

The server is gone, the viewer taps a link, nothing happens, no error, no way to
the address picker — and `xcodebuild test` reports success. Unmutated, the same
probe gives
`state=failed("Litloft is not answering at http://localhost:51247/.")`, so the
behaviour is right at this SHA; it is simply held by nothing.

R-4: a test that lets an A through is an A.

### 5. `[introduced]` The response policy has no main-frame guard, so a subframe's download decides the main frame's state

`ios/Litloft/Web/WebView.swift:196-207`

`policy(for response:)` never consults `navigationResponse.isForMainFrame`. Until
this commit that only decided whether the bytes were taken as a download; now the
same branch writes `model.state`, which describes the main frame. Measured, with
a page whose iframe points at an attachment URL:

```
PROBE[FRAME]   | didCommit url=http://localhost:63001/ committed=true
PROBE[FRAME]   | actionPolicy url=…/stream?download=true main=false pageOnScreen=true
PROBE[FRAME]   | responsePolicy url=…/stream?download=true attach=true pageOnScreen=true
PROBE[FRAME]   | markStopped pageOnScreen=true from=loading
PROBE[FRAME]   | didFinish url=http://localhost:63001/
```

`from=loading` is the point: the main frame's own load was still in flight, and a
subframe declared it finished. Here the main frame then finished anyway, so
nothing is visible. Had it failed instead, `markFailed` would have found
`state == .loaded` and dropped the report — finding 1's mechanism, reached from
a different direction.

The navigation-action side has the guard (`WebView.swift:179`); the response side
does not.

Breaks no declared invariant as measured.

### 6. `[introduced]` The `spent` flag added to `whenActive` is held by nothing, and does not close what round 3 named

`ios/Litloft/Web/FileDownloads.swift:109-122`

M19 removes `guard !spent else { return }` and `spent = true` outright; the suite
stays green (M18, which tried to neutralise the flag by making it a `let`, did
not compile and is void).

What the flag does is make the block inert if it runs before `token` has been
assigned, so an observer that could not remove itself at least does nothing. Round
3 finding 5 named a different shape: **`whenActive` registers a new observer per
off-screen `share`**, and `spent` is a local of each call, so two downloads
finishing while the app is away still produce two observers, two `share` calls and
two windows at `windowLevel` 0 — the arrangement round 2 finding 5 measured as
taking every touch on the screen. That is unchanged.

Breaks no declared invariant.

### 7. `[pre-existing]` `didFail navigation:` is still held by nothing

`ios/Litloft/Web/WebView.swift:240-242`

M15 empties the method; the suite stays green. Round 3 finding 3, still open;
`3c8704b0` edited this call site (dropping the `pageOnScreen:` argument) without
giving it a test. Its sibling `didFailProvisionalNavigation` is held — M16 is
killed by `failuresFollowTheLoadInFlight` — but by a seam test only; no live test
drives a real failure through either.

### 8. `[introduced]` A docstring states the opposite of what was measured

`ios/LitloftTests/CoordinatorTests.swift:149-152`

> "WebKit reports nothing for a load stopped this way, so the shell has to say
> it itself"

For the scenario that test actually runs — a **redirect** off the origin — WebKit
does report it: `didFailProvisional WebKitErrorDomain/102` arrives after the
policy cancel (trace in PROBE-CANCEL-redirect). Only the case where the first
navigation is off-origin with no redirect delivers nothing at all. M7 confirms
the consequence: removing `markStopped` from the `.system` branch leaves
`firstLoadRedirectedAway` **green**, because the 102 then reports the load
instead.

A reader who believes the sentence will read this test as holding the `.system`
call site, which it does not (the seam tests do). Per R-3 the remedy is deletion
of the sentence, not a rewording.

---

## Mutation table

Every mutation ran the suites that can reach this code —
`ExternalLinkDelegateTests`, `ExternalLinkTests`, `FileDownloadsTests`,
`ContractTests`, `WebViewModelTests`, `ShellBridgeTests`,
`SharedMediaState/CoordinatorTests`, 130 runs — and the tree was restored and
`git status --short` verified empty after each. The full 227-run suite was run
before the campaign and again after the last restore; both green.

| id | file:line | mutation | want | result | killed by |
|---|---|---|---|---|---|
| **`markStopped`, the new third outcome** ||||||
| M1 | `WebViewModel.swift:42` | invert the `pageOnScreen` guard | kill | **KILLED** | `stoppedSettlesOnTheScreen`, `firstLoadRedirectedAway`, `offOriginNavigationIsHandedOver`, +7 |
| M2 | `WebViewModel.swift:43` | with a page up, leave the state alone | kill | **KILLED** | `stoppedWithAPageUp`, `downloadLeavesThePageUp`, `failuresOnlyCountWhileLoading`, +2 |
| M3 | `WebViewModel.swift:47` | with no page, say nothing (invariant 8) | kill | **KILLED** | `firstLoadRedirectedAway`, `attachmentWithNothingOnScreen`, `handedAwayWithNothingOnScreen`, +2 |
| M20 | `WebViewModel.swift:47` | drop the server address from the message | kill | **KILLED** | `stoppedSettlesOnTheScreen` |
| **the `state == .loading` guard** ||||||
| M4 | `WebViewModel.swift:33` | drop `state == .loading` | kill | **KILLED** | `failuresOnlyCountWhileLoading`, `failuresFollowTheLoadInFlight`, `downloadLeavesThePageUp` |
| M5 | `WebViewModel.swift:33` | drop `!isCancelled(error)` | kill | **KILLED** | `cancelledIsNotAFailure` |
| M6 | `WebViewModel.swift:58` | drop the domain test in `isCancelled` | kill | **KILLED** | `foreignDomainIsNotCancelled` |
| **the three call sites** ||||||
| M7 | `WebView.swift:186` | `.system` no longer marks stopped | kill | **KILLED** | `handedAwayWithNothingOnScreen`, `stoppedWithAPageUp` (**not** `firstLoadRedirectedAway` — finding 8) |
| M8 | `WebView.swift:189` | `.nothing` no longer marks stopped | kill | **KILLED** | `navigationToNothing` |
| M9 | `WebView.swift:205` | the response policy no longer marks stopped | kill | **KILLED** | `attachmentWithNothingOnScreen`, `stoppedWithAPageUp`, `downloadLeavesThePageUp`, +1 |
| M11 | `WebView.swift:200` | response call site pinned to `pageOnScreen: true` | kill | **SURVIVED** | — (finding 3) |
| M11b | `WebView.swift:200` | response call site pinned to `pageOnScreen: false` | kill | **SURVIVED** | — (finding 3) |
| M12 | `WebView.swift:174` | action call site pinned to `pageOnScreen: true` | kill | **KILLED** | `firstLoadRedirectedAway` |
| **`hasCommittedPage`, the new prediction** ||||||
| M10 | `WebView.swift:8` | back to `url != nil` | kill | **KILLED** | `firstLoadRedirectedAway` (on the state, not on the test's own `hasCommittedPage` assertion — confirmed by removing that line and re-running) |
| M13 | `WebView.swift:8` | always `true` | kill | **KILLED** | `firstLoadRedirectedAway` |
| M14 | `WebView.swift:8` | always `false` | kill | **KILLED** | `offOriginNavigationIsHandedOver` |
| **the rest of the state machine** ||||||
| M15 | `WebView.swift:241` | `didFail navigation:` reports nothing | kill | **SURVIVED** | — (finding 7, round 3 #3) |
| M16 | `WebView.swift:237` | `didFailProvisionalNavigation` reports nothing | kill | **KILLED** | `failuresFollowTheLoadInFlight` |
| M17 | `WebView.swift:218` | `didStartProvisionalNavigation` no longer calls `markLoading` | kill | **SURVIVED** | — (finding 4) |
| M21 | `WebView.swift:204` | invert the attachment guard | kill | **KILLED** | `attachmentsBecomeDownloads`, `downloadLeavesThePageUp`, `deadPageOnScreenIsReloaded`, +6 |
| **what `3c8704b0` adds to `FileDownloads`** ||||||
| M18 | `FileDownloads.swift:111` | `var spent` → `let spent` | kill | **VOID** | did not compile; re-run as M19 |
| M19 | `FileDownloads.swift:117-118` | drop the `spent` guard | kill | **SURVIVED** | — (finding 6) |

## Survivors that were meant to survive

- **M19** is reported as finding 6 rather than as a design survivor because the
  guard is new code in this commit; the shape it guards against is unreachable in
  practice (the notification cannot be delivered before `addObserver` returns on
  the main thread), so a test for it would be worth less than the finding.
- Round 2 finding 3 (`downloads.take(download)` and the two lines inside
  `didBecome download:` cannot be held by a test) was named in the brief as not
  to be re-derived; not re-run.
- Round 1's `createWebViewWith` mutation was not re-run: `WKNavigationAction`
  still cannot be built, and the reasoning that made it a survivor by design is
  unchanged.

## Checked, not a finding

- **The author's central claim is true and was re-measured.** `webView.url`
  answers with a navigation still in flight at the policy decision:
  `actionPolicy url=https://example.com/article main=true` arrives while
  `committed=false`, and M10 (reverting `hasCommittedPage` to `url != nil`)
  fails `firstLoadRedirectedAway` on the state, not on the test's own
  `hasCommittedPage` assertion — verified by deleting that assertion and
  re-running.
- **Every load that ends does reach one of the three, with one exception, and it
  is pre-existing.** `didFinish` → `markLoaded`; `didFail` and
  `didFailProvisionalNavigation` → `markFailed`; the `.system`, `.nothing` and
  attachment branches → `markStopped`. The exception is a load cancelled by
  anyone other than the shell's own policy: `webView.stopLoading()` (and so
  `window.stop()`) delivers `NSURLErrorDomain/-999`, which `isCancelled` drops
  unconditionally, leaving `state = .loading` for good (PROBE-STOP, measured).
  A page is on screen in that case so nothing is drawn wrong, and the swallow
  predates this commit. An abandoned back-forward swipe is the same shape;
  reasoned, not measured.
- **`webViewWebContentProcessDidTerminate` and `updateUIView`'s reload-token
  load** both go through `webView.load` → `didStartProvisionalNavigation`, so
  they inherit the three outcomes. Measured on screen (PROBE-DEAD: reload,
  `didCommit`, `didFinish`, `.loaded`) and off screen (PROBE-DEADOFF: nothing
  until the app returns — which is finding 1's setup).
- **A real failure can arrive when the state is not `.loading`, and it is
  dropped.** Two ways were measured: after `markStopped` settled on `.loaded`
  (PROBE-G, PROBE-JETSAM), and — with M17 — when `markLoading` never ran. The
  first is intended for downloads (PROBE-G) and is the defect in finding 1
  (PROBE-JETSAM). `retry()` sets `.loading` itself, so the error view's Try
  again button is not affected.
- **`markStopped` overwriting a `.failed`** was looked for and not found on a
  path a viewer can drive: `ConnectionErrorView` covers the screen, so the only
  navigation that can start under it is the one `retry()` begins, and that sets
  `.loading` first.
- **R-0 1 to 7 are untouched.** `ExternalLink.swift` and `openInNewWindow` are
  not in the diff; `ExternalLink.destination` still decides the routing and
  still returns `.nothing` for `javascript:`/`data:`/`about:` (R-0 4) and the
  guard at `WebView.swift:179` still passes every subframe navigation (R-0 5).
  `didCommit` still carries `player?.stopForNavigation()` and
  `didStartProvisionalNavigation` still does not (R-0 6).
- **Docs.** `3c8704b0` changes what the app shows in three measured cases, but
  all three are the error view appearing where nothing appeared before; no page
  under `docs/` describes the shell's error screen, and the iOS shell has no
  user-guide page yet. Nothing in `CLAUDE.md`'s table matches. Not filed.
- **Prose other than finding 8.** The comments this commit adds describe the
  code rather than its history and name nothing from the review process.
  `WebView.swift:5-7` ("`url` answers with the address of a navigation still in
  flight") is true as measured. `FileDownloads.swift:108` ("Once, however many
  times the app is brought back") is true of one `whenActive` call, which is
  what it is attached to.
- Known and open, one line each as the brief asks: no CI job runs `xcodebuild`
  `[pre-existing]`; `.loft` has no mini player at iPad width `[pre-existing]`;
  theme colours on a back swipe `[pre-existing]`; `isAttachment` is thinly
  asserted, round 1 #6 `[pre-existing]`; the two lines inside
  `didBecome download:` cannot be held by a test, round 2 #3 `[pre-existing]`.

---

## The trajectory question

> *Read the fix diffs in order. Does each round add a branch, a state or a
> prediction that the round before it also added?*

**No, and yes. `3c8704b0` is the first round whose fix is structurally right,
and it still does not end the chain.**

What it removes is real and is the shape of convergence:

| removed | |
|---|---|
| the prediction *a `WebKitErrorDomain` 102 with a page up is never a real failure* | `ce709795`'s, narrowed by `ee5f7f81`, kept by `14ea951d` |
| `reaches(_:pageOnScreen:)`, a classifier over error domains and codes | three rounds of refinement, deleted |
| the whole question *which stopped load may be forgiven* | replaced by naming the third outcome |

Naming the third outcome is not another special case. It is the thing the
previous three rounds were each approximating, and it is why PROBE-H and
PROBE-CANCEL — the cases that opened the loop — are fixed here and were not
fixed at any earlier SHA. That is a real result and it should be said plainly.

What it adds:

| added | |
|---|---|
| a new prediction: `backForwardList.currentItem != nil` means a page is on screen | wrong in a measured case (finding 1) |
| a new precondition: no failure is ever reported unless `state == .loading` | held by nothing (finding 4); it is what silences finding 1 |
| three call sites that must each compute the predicate | one of them held by nothing (finding 3) |
| a guard (`spent`) on the state round 3 added (`whenActive`) | held by nothing, and not the case round 3 named (finding 6) |

So the letter of the test is met — this round's fix adds a branch and a
prediction, as round 3's did and round 2's did. But the substance is sharper than
the letter, and it is this:

**The predicate has been wrong in a different case each round, and the cases
trade off.** `url != nil` was right for a dead process and wrong for a redirect;
`currentItem != nil` is right for a redirect and wrong for a dead process. Round
3 closed nothing and opened nothing; round 4 closes three cases and opens two.
A fifth round that changes the predicate again will close finding 1 and open
whatever the next property is wrong about, because **`WKWebView` has no property
that answers "is anything drawn"** — `url`, `currentItem`, `isLoading` and
`title` each answer a different question, and each is right for some of the ways
a page can be absent.

**The case that forces a fifth correction, if the shape does not change:**
finding 1 — the web content process dying while the app is in the background,
which on iOS is routine, followed by a first load that the shell hands away or
takes as a file.

What the shell does not have is a record of the one thing it needs. Every
transition that changes whether something is drawn passes through this
coordinator already — `didCommit` starts it, `webViewWebContentProcessDidTerminate`
ends it — so the answer is a fact the shell can hold rather than a property it
interrogates and gets wrong. Both cases in finding 1 and finding 2 are visible
from there, and so is the one in finding 5, because a fact the shell keeps is
naturally per-frame while `webView.<anything>` is not.

Reported, not assigned. `review-workflow.md` R-4 reserves the C to the
supervisor.

TOTAL: 8 findings
