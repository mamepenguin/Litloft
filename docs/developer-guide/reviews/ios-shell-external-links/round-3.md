# Round 3 — iOS shell: did the rebuild remove the defect, or move it?

- Reviewed SHA: `14ea951d9ad061f2b373d03fbb4c326627a303da`
- Subject: `14ea951d` (decide a failure by what is on screen, not by why the load stopped)
- Parent for `[introduced]` reproductions: `e926e2b6`, exported with `git archive`
  to a tree of its own and built separately (the reviewed worktree was never moved).
- Worktree: `/private/tmp/claude-502/-Users-libre-Sources-video-share/317d1718-1596-4bf3-a3e7-5f3c9662fd2f/scratchpad/review-ext-3`
- Suite at the reviewed SHA: `xcodebuild test`, iPhone 17 Pro Max (`BE039A5E`),
  iOS 26.5 — **164 tests, all passing**.
- `swiftlint lint --quiet` — 0 output.
- All four test methods this commit adds were confirmed present in the result
  bundle, so the incremental-build trap did not apply.
- Live measurements were taken against the Litloft on `http://localhost:3000`
  (read only; nothing restarted or rebuilt).

R-0 is §3 of `docs/superpowers/specs/2026-09-18-ios-shell-external-links.md`,
including **invariant 8**, added after round 2, which this commit exists to
satisfy:

> when there is no page on screen, a load that stops is always reported to the
> viewer; the error view is the only way back to the address picker, so the app
> must not sit blank and silent.

---

## The measurement that decides the round

Every measurement below put the web view in a real key `UIWindow` and
instrumented the whole download chain, so that the *absence* of a callback is
observable rather than inferred. (Worth recording for later rounds: a `WKWebView`
that is in no window at all never gets `didBecome download:` either, so a probe
built that way cannot tell "the shell mishandled the download" from "no download
happened". Both of this round's blank-screen cases were confirmed in a window.)

| probe | first load | page already committed? | what the shell does |
|---|---|---|---|
| **PROBE-H** | `…/stream?download=true` | no | `trace=[]`, nothing offered, **`state = .loading` forever** |
| **PROBE-G** | `http://localhost:3000/` then the same download URL | yes | `didBecome → take → decideDestination → finish`, file offered, `102` forgiven |
| **PROBE-CANCEL** | `https://example.com/` (models a redirect off the origin) | no | Safari opened, `url = nil`, **`state = .loading` forever**, no error callback at all |
| **PROBE-C** | `http://127.0.0.1:59999/` (nothing listening) | no | `failProvisional NSURLErrorDomain/-1004 pageOnScreen=false` → `.failed` ✅ |

PROBE-G and PROBE-H differ in one thing — whether a page was already committed —
and that is what decides whether the download happens at all. The conclusion the
whole round turns on is in the first row: **when there is nothing on screen, the
shell is told nothing at all.** No `didBecome`, no `102`, no `-999`. The
navigation simply never ends (`isLoading` stays `true`).

That matters because all three rounds have assumed the opposite: that WebKit
reports the interrupted load and the only question is who forgives it. Round 1
narrowed the forgiveness, round 2 said the narrowing missed, and `14ea951d`
re-derived the question as *is there a page on screen*. All three are answers
about an error that, in this case, is never delivered.

---

## Findings

### 1. `[pre-existing]` (introduced by the branch at `ce709795`) Invariant 8 is still violated in exactly the case it was written for, and the new rule cannot see it because no error is ever delivered

`ios/Litloft/Web/WebViewModel.swift:47-51`, `ios/Litloft/Web/WebView.swift:228`, `232`

The commit's premise is that WebKit reports the interrupted load and the only
question is whether to forgive it. Measured at the reviewed SHA, with the app's
own `Coordinator` and `FileDownloads`, a real `WKWebView` inside a key window,
and the real server:

```
PROBE1h t=2s  state=loading url=Optional(http://localhost:3000/api/files/ov5-au-ivreK/stream?download=true) offered=[] trace=[]
PROBE1h t=10s state=loading url=Optional(http://localhost:3000/api/files/ov5-au-ivreK/stream?download=true) offered=[] trace=[]
```

`trace` is instrumentation temporarily added to `FileDownloads.take`,
`decideDestinationUsing`, `downloadDidFinish`, `download(_:didFailWithError:)`
and `Coordinator.loadFailed`; it is empty. So in this case:

- `webView(_:navigationResponse:didBecome:)` is **never called** — the response
  policy returns `.download` (measured: `responsePolicy=2`) and the navigation
  then hangs. No file is written and none is offered.
- `loadFailed` is **never called**, so `markFailed` is never reached, so
  `reaches(_:pageOnScreen:)` — the whole of this commit — never runs.
- `model.state` stays `.loading`, `WebShell.swift:20` never renders
  `ConnectionErrorView`, and `ConnectionErrorView` still holds the only call
  site of `onChangeServer`. The app is blank, silent and has no way back to the
  address picker. **Invariant 8.**

Same reproduction at the parent `e926e2b6` (exported tree, built separately):

```
PARENT t=2s state=loading url=Optional(…stream?download=true) offered=[]
PARENT t=8s state=loading url=Optional(…stream?download=true) offered=[]
```

Identical. `14ea951d` changed nothing for this case — which is the case it
exists to fix. Hence the `[pre-existing]` label with respect to the parent; with
respect to `develop` the state is introduced by `ce709795`, which is where
`policy(for response:)` began returning `.download`.

That the same download **works** once a page is committed (PROBE-G:
`trace=["didBecome", "take", "decideDestination Meet new APIs for iPhone Duo.loft", "finish", "loadFailed WebKitErrorDomain/102 page=true"]`,
file offered) is what makes this a first-load defect specifically, not a broken
feature.

**The error view cannot be the way out of this, because it removes itself.**
`retry()` (`WebViewModel.swift:37-40`) sets `.loading`, which hides
`ConnectionErrorView`, and `updateUIView` then re-loads `serverURL`. If that load
is the one that hangs, a viewer who *had* the error view in front of them loses
it by pressing Retry, and cannot get it back.

**Why the rule cannot reach it.** `reaches` is a filter on errors. Its input is
an error that must first be delivered. The failure mode here is the *absence* of
delivery: the load neither finishes nor fails. No classification of errors —
`diverted`, `isCancelled`, or `pageOnScreen` — can decide anything about a
callback that never comes. Nothing in the shell watches for a load that has
simply stopped happening.

### 2. `[pre-existing]` (introduced by the branch at `aa8a045e`) A second route to the same blank screen: the first navigation being cancelled by the shell's own policy

`ios/Litloft/Web/WebView.swift:167-179`, `ios/Litloft/Web/WebViewModel.swift:49`

The brief asks what else can leave the app blank and silent by another route.
This is one, and it does not involve downloads.

When the first navigation resolves to another origin — an address that redirects
off the server, a captive portal, a reverse proxy pointing elsewhere —
`policy(for:inMainFrame:)` returns `.cancel` and hands the URL to Safari.
Measured at the reviewed SHA, in a key window, with a recording `URLOpener`:

```
PROBE-CANCEL t=2s state=loading url=nil opened=[https://example.com/] trace=[]
PROBE-CANCEL t=8s state=loading url=nil opened=[https://example.com/] trace=[]
```

Safari opens; the shell is left at `.loading` with nothing on screen and no way
to the address picker when the viewer comes back. `trace` shows `loadFailed` was
never called here either, and even if WebKit had reported the cancellation,
`reaches` (`WebViewModel.swift:49`) discards `NSURLErrorCancelled`
unconditionally — `pageOnScreen` is not consulted on that branch. So this route
is closed off twice over.

R-0 2 and R-0 1 are satisfied (the shell did not navigate, Safari got the
address). **Invariant 8 is not.**

### 3. `[introduced]` `didFail navigation:` — the second call site of the new rule — is held by nothing

`ios/Litloft/Web/WebView.swift:231-233`

The commit adds `pageOnScreen:` at two call sites. Only one of them is reachable
from the suite: every test that exercises the rule through the coordinator goes
through `didFailProvisionalNavigation`
(`ExternalLinkDelegateTests.swift:126`, `CoordinatorTests.swift:99`). Mutations
M6 and M7 below pin both constants into `didFail navigation:` and the suite stays
green either way.

This is the call site that matters for the case round 2's PROBE2 was about — a
committed page whose own load then fails — and it is the one with no test.

### 4. `[introduced]` A page that is on screen is left in `state == .loading` for good after a download

`ios/Litloft/Web/WebViewModel.swift:32-35`, `ios/Litloft/Web/WebView.swift:202-204`

PROBE-G's trace ends with `loadFailed WebKitErrorDomain/102 page=true`, correctly
forgiven — but `didStartProvisionalNavigation` had already set `.loading`, and
forgiving the error means nothing sets it back. Measured: `state = .loading` ten
seconds after the file was offered, with the page fully readable on screen.

Nothing renders differently for `.loading` (`WebShell.swift:14-27` draws the web
view and, only for `.failed`, the error view), so no viewer sees this today. It
is a model that no longer describes the screen, and the next reader of `state`
inherits it.

The same shape reaches further than downloads, by reading the code rather than by
measurement: any navigation that starts and is then discarded without a
replacement leaves `.loading` behind, because `markLoading` is unconditional at
`didStartProvisionalNavigation` and every discard path — `NSURLErrorCancelled`,
the `102`, the policy `.cancel` of finding 2 — ends in a return from `markFailed`
and not in a state. An abandoned back-forward swipe
(`WebView.swift:19` enables them) is the everyday case.

Nothing holds the `.loading` half of the state machine at all: mutation M13
deletes `model.markLoading()` from `didStartProvisionalNavigation` outright and
the suite stays green.

Breaks no R-0 item.

### 5. `[introduced]` Everything `14ea951d` adds to `FileDownloads` is unheld, and the retry it adds can fire more than once

`ios/Litloft/Web/FileDownloads.swift:78-83`, `108-118`

The `whenActive { share(file) }` retry, the observer's self-removal and
`window.isOpaque = false` are all unreachable from a test (`share` is
`private static`, and `offer` is replaced by every test that touches this class).
Mutations M8, M9 and M10 all survive: the retry can be deleted outright, the
observer can be left registered, and the opacity line can be reverted, with the
suite green.

Two shapes in the added code are worth naming while it has no test:

- `whenActive` registers a **new** observer per off-screen `share`. Two downloads
  finishing while the app is away means two observers, and on return both call
  `share`, so two windows go up at `windowLevel` 0 over the app at once — round 2
  finding 5 measured that such a window takes every touch on the screen. Nothing
  serialises them and nothing tests it. (Re-arming when the scene is still not
  `.foregroundActive` is the right behaviour, not a leak: the observer removes
  itself first.)
- `MainActor.assumeIsolated` inside a `.main`-queue notification block is an
  assertion, not a hop. `UIApplication.didBecomeActiveNotification` is posted on
  the main thread, so it holds; it is a trap for anyone who later moves the
  `queue:` argument.

Breaks no R-0 item.

### 6. `[introduced]` The test named for invariant 8 holds the rule, not the case, and its green is what makes the fix look finished

`ios/LitloftTests/ExternalLinkDelegateTests.swift:122-134`

`interruptedFirstLoadIsShown` hands a `WebKitErrorDomain` 102 to
`didFailProvisionalNavigation` on `Rig`'s `SpyWebView`. That is a faithful unit:
`SpyWebView` never loads, so `webView.url` is `nil`, and PROBE-C measured that a
real provisional failure with nothing committed also reports `url = nil` at the
callback. What the test holds is *if this error is delivered with no page up, the
viewer is told* — and that is true.

The case it is named for is *an interrupted first load still reaches the viewer*,
and finding 1 measures that no error is delivered there at all. So the suite is
green over a rule that the scenario never invokes. The gap is not in the
assertion; it is that nothing in the suite, and nothing in `CoordinatorTests`'
live-server rig either, ever starts a real first load that answers with an
attachment — the one sequence three rounds have now been about.

`CoordinatorTests.swift:98-111` (`interruptedLoadWithAPageUp`) is the honest
half: `openShell` waits for `model.state == .loaded && webView.url != nil`
against the running Litloft before the 102 is delivered, so the `pageOnScreen ==
true` side really is exercised.

Reported here rather than under "survivors" because R-4 says a test that lets an
A through is an A.

---

## Mutation table

Every mutation ran the whole suite at the reviewed SHA (164 tests). The tree was
restored after each and `git status --short` verified clean; the restored tree
builds, passes all 164 tests and lints clean.

| id | file:line | mutation | want | result | killed by |
|---|---|---|---|---|---|
| **the new rule, `reaches(_:pageOnScreen:)`** ||||||
| M1 | `WebViewModel.swift:50` | drop `pageOnScreen` from the conjunction (forgive 102 always) | kill | **KILLED** | `interruptedFirstLoadIsShown`, `interruptedDependsOnWhatIsOnScreen` |
| M2 | `WebViewModel.swift:49` | drop the `NSURLErrorCancelled` branch | kill | **KILLED** | `cancelledIsNotAFailure` |
| M3 | `WebViewModel.swift:50` | `pageOnScreen` → `!pageOnScreen` | kill | **KILLED** | `interruptedFirstLoadIsShown`, `interruptedLoadWithAPageUp`, `interruptedDependsOnWhatIsOnScreen` |
| M4 | `WebViewModel.swift:50` | forgiven code `102` → `103` | kill | **KILLED** | `interruptedLoadWithAPageUp`, `interruptedDependsOnWhatIsOnScreen` |
| M5 | `WebViewModel.swift:50` | forgiven domain `WebKitErrorDomain` → `WKErrorDomain` | kill | **KILLED** | `interruptedLoadWithAPageUp`, `foreignDomainKeepsItsMessage`, `interruptedDependsOnWhatIsOnScreen` |
| **both call sites that compute `webView.url != nil`** ||||||
| M6 | `WebView.swift:228` | `didFailProvisionalNavigation` pinned to `pageOnScreen: true` | kill | **KILLED** | `interruptedFirstLoadIsShown` |
| M7 | `WebView.swift:232` | `didFail navigation:` pinned to `pageOnScreen: true` | kill | **SURVIVED** | — (finding 3) |
| M7b | `WebView.swift:232` | `didFail navigation:` pinned to `pageOnScreen: false` | kill | **SURVIVED** | — (finding 3) |
| **the state machine around it** ||||||
| M13 | `WebView.swift:203` | `didStartProvisionalNavigation` no longer calls `markLoading()` | kill | **SURVIVED** | — (finding 4) |
| M11 | `WebView.swift:199` | drop `downloads.take(download)` | kill | **SURVIVED** | — (known open, round 2 #3) |
| **`keep` / `arrived` / `lost`** ||||||
| M12 | `FileDownloads.swift:41` | `keep` stores nothing | kill | **KILLED** | `offersWhatArrived` |
| **what `14ea951d` adds to `FileDownloads`** ||||||
| M8 | `FileDownloads.swift:81` | drop the `whenActive { share(file) }` retry (back to dropping the file) | kill | **SURVIVED** | — (finding 5) |
| M9 | `FileDownloads.swift:115` | the activation observer never removes itself | kill | **SURVIVED** | — (finding 5) |
| M10 | `FileDownloads.swift:87` | drop `window.isOpaque = false` | kill | **SURVIVED** | — (finding 5) |

After the last restore the tree is clean at `14ea951d`, builds, passes all 164
tests and lints clean; the probe files written during the round were deleted.

## Survivors that were meant to survive

- **M11** (`WebView.swift:199`, drop `downloads.take(download)`) and the rest of
  `webView(_:navigationResponse:didBecome:)` — already filed and open as round 2
  finding 3, and named in this round's brief as not to be re-derived.
  `[pre-existing]`.
- **M7b** (`didFail navigation:` pinned to `pageOnScreen: false`) survives for the
  same reason as M7: nothing drives that call site. Listed once, as finding 3,
  not twice.
- Round 1's **M20** (`createWebViewWith` no longer routing the request) was not
  re-run; `WKNavigationAction` still cannot be built, and the reasoning that made
  it a survivor by design is unchanged.

## Checked, not a finding

- **The author's claim about the four mutations over the new rule holds.** M1
  (drop `pageOnScreen`), M3 (invert it), M4 (`102` → `103`) and M6 (pin the
  provisional call site to `true`) all fail the suite, killed by
  `interruptedDependsOnWhatIsOnScreen`, `interruptedFirstLoadIsShown` and
  `interruptedLoadWithAPageUp`. Re-measured here rather than taken on the
  author's word. What the four do not cover is the second call site (finding 3)
  and everything the same commit added to `FileDownloads` (finding 5).
- **`webView.url` is a faithful stand-in for the errors that are delivered.**
  Measured at the callback, not before it: a provisional failure with nothing
  committed reports `url = nil` (PROBE-C, `-1004`), even though `url` is non-nil
  while that same navigation is in flight (`start url=Optional(…)`); a failure
  with a page committed reports the committed page (PROBE-G, `page=true`). So the
  "non-nil but nothing readable" case the brief asks about does not arise on this
  path. The stand-in's limit is elsewhere: it says nothing when no callback
  comes (findings 1 and 2).
- **`pageOnScreen` is always computed from the web view that failed.** Both call
  sites (`WebView.swift:228`, `232`) read the delegate's own `webView` parameter,
  not the coordinator's `weak var webView`.
- **`interruptedLoadWithAPageUp` really has a page up.** `openShell`
  (`CoordinatorTests.swift:66-77`) loads `http://localhost:3000/` against the
  running Litloft and waits for `model.state == .loaded && webView.url != nil`
  before the 102 is delivered; M3 is killed by this test, which it could not be
  if `url` were nil.
- **R-0 1 to 7 are untouched by this commit.** It changes `WebViewModel.reaches`,
  the two failure call sites, `FileDownloads`' off-screen retry and window
  opacity, and tests. `ExternalLink.swift`, `openInNewWindow` and
  `policy(for:inMainFrame:)` are not in the diff, and neither is `frontend/` or
  `addons/`. R-0 6 in particular: `didCommit` still carries
  `player?.stopForNavigation()` and `didStartProvisionalNavigation` still does
  not.
- **Docs.** This commit changes no observable behaviour — measured, that is the
  finding — so `CLAUDE.md`'s same-PR documentation rule asks for nothing here.
- **Prose.** The comments this commit adds describe the code rather than its
  history and name nothing from the review process. `WebViewModel.swift:44-46`
  ("An interrupted frame load is how WebKit reports a load the shell stopped on
  its own say-so") is true of every 102 that is actually delivered, which is the
  claim it makes; it does not claim one is always delivered. Nothing here would
  lead a reader to a wrong code change, so nothing is proposed for deletion.
- **`SharedMediaState/VideoSurfacePictureInPictureTests/failedStartLetsGo()`
  appears in the kill lists and is not a kill.** My harness matched
  `"failed" in line`, and that test's *name* contains the word. Verdicts come
  from the suite's own `** TEST SUCCEEDED **` / `** TEST FAILED **`, so they are
  unaffected; the name has been dropped from the lists below.
- Known and open, one line each as the brief asks: no CI job runs `xcodebuild`
  `[pre-existing]`; `.loft` has no mini player at iPad width `[pre-existing]`;
  theme colours on a back swipe `[pre-existing]`; `isAttachment` is thinly
  asserted, round 1 #6 `[pre-existing]`; the two lines inside
  `didBecome download:` cannot be held by a test, round 2 #3 `[pre-existing]`.

## The trajectory question

> *Read the fix diffs in order. Does each round add a branch, a state or a
> prediction that the round before it also added?*

**`14ea951d` extends the chain. It is the third answer to a question that has
never been the right one.**

| commit | what it added that can be wrong |
|---|---|
| `aa8a045e` | one decision: `ExternalLink.destination` |
| `ce709795` | a second decision (`isAttachment`), a reordering (player stop start → commit), and a prediction: *WebKit 102 is never a real failure* |
| `801fe944` | a window with a hand-written lifetime, a `.foregroundActive` gate, a layout override |
| `ee5f7f81` | a mutable state (`diverted`) with two seams, replacing the prediction |
| `14ea951d` | removes `diverted` and its two seams — and adds a new prediction (*`webView.url != nil` means a page is on screen*) computed at two call sites, plus a new pending state in `FileDownloads` (`whenActive`) with an observer per download |

On the letter of the test, this round is mixed: it **removes** a state, which is
the shape of convergence, and in the same diff **adds** one for a case round 2
raised (a download finishing off screen). On the substance it is not mixed at
all. Three rounds have now refined the same predicate — *which stopped load may
be forgiven* — and the case that opened the loop is bit-for-bit unchanged, at
the parent and at HEAD (finding 1). Each round handled one more case the last
one did not anticipate, which is exactly what `review-workflow.md` names.

**The question is being asked in the wrong place.** `markFailed` is reached only
when WebKit delivers an error. Invariant 8 is about the screen, and the screen
can be blank for three reasons, of which the rule can see one:

| the load … | delivered? | invariant 8 today |
|---|---|---|
| fails (`-1004`, dead process, `102` with a page up) | yes | held (PROBE-C, PROBE-G) |
| is turned into a download with nothing on screen | **no** | **broken** (PROBE-H) |
| is cancelled by the shell's own policy with nothing on screen | **no** | **broken** (PROBE-CANCEL) |

A fourth correction inside `reaches` would leave rows two and three exactly
where they are. **The case that will force it, if the shape does not change:**
the first load answering with an attachment — the same case as round 1 finding 1,
round 2 finding 1 and this round's finding 1.

What the shell does not have is anything that watches the *screen* rather than
the error stream: nothing notices that `markLoading` was called and neither
`markLoaded` nor `markFailed` followed. Every case in the table above is visible
from there, including the two that deliver nothing.

Reported, not assigned. `review-workflow.md` R-4 reserves the C to the
supervisor.

TOTAL: 6 findings
