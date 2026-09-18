# Round 2 — iOS shell: what the two fix commits did

- Reviewed SHA: `e926e2b648be67b7ed9a361011101ec91e1b4d2d`
- Subjects: `801fe944` (save sheet over its own window; page reaches the bottom) and
  `ee5f7f81` (only forgive the load the shell turned into a download)
- Worktree: `/private/tmp/claude-502/-Users-libre-Sources-video-share/317d1718-1596-4bf3-a3e7-5f3c9662fd2f/scratchpad/review-ext-2`
- Suite: `xcodebuild test`, iPhone 17 Pro Max (`BE039A5E`), iOS 26.5 —
  **161 tests / 218 runs, all passing** at the reviewed SHA.
- `swiftlint lint --quiet` — 0 output.
- The new test methods were confirmed present in the result bundle, so the
  incremental-build trap did not apply.
- Live measurements were taken against the Litloft on `http://localhost:3000`
  (read-only; nothing restarted or rebuilt).

R-0 is §3 of `docs/superpowers/specs/2026-09-18-ios-shell-external-links.md`.
None of §3's seven items is about downloads or about the save sheet, so most of
what follows breaks no declared invariant and is marked as such.

---

## Findings

### 1. `[introduced]` `ee5f7f81` does not fix what it says it fixes: the shell is still blank and unrecoverable when the first load answers with an attachment

`ios/Litloft/Web/WebView.swift:200`, `ios/Litloft/Web/WebView.swift:217-220`

The commit message says the previous behaviour "left the app blank and
unrecoverable when the first load answered with a file". Round 1 finding 1
described exactly that. The fix narrows the forgiveness from *any* interrupted
frame load to *the load the shell diverted* — but the load in that scenario **is
the one the shell diverted**, so the new guard fires for it and the outcome is
unchanged.

The sequence at the reviewed SHA:

```
didStartProvisionalNavigation   diverted = false ; state = .loading
policy(for: response)           attachment  → .download
navigationResponse:didBecome:   divertedToDownload()  → diverted = true
didFailProvisionalNavigation    WebKitErrorDomain 102
loadFailed                      guard !diverted  → swallowed
```

`state` stays `.loading`, so `WebShell.swift:20` never renders
`ConnectionErrorView`, which still holds the only call site of `onChangeServer`
in the app. Same dead end round 1 reported.

Measured at the reviewed SHA with round 1's probe (a real `WKWebView` +
`Coordinator` pointed at an address that answers with an attachment,
`http://localhost:3000/api/files/ov5-au-ivreK/stream?download=true`, `offer`
injected so no sheet is raised):

```
PROBE1 state=loading  url=Optional(http://localhost:3000/api/files/ov5-au-ivreK/stream?download=true)
```

Round 1 measured `state=.loading url=nil` at `ce709795` and
`state=.loaded url=Optional(…)` at the parent `3123cb89`. So the label is
round 1's and is not re-derived here; what this round adds is that the state is
**the same after the fix**. (`webView.url` is now populated where round 1 saw
`nil`; the screen is decided by `state`, and that has not moved.)

Nothing in the suite covers it: `divertedLoadIsNotAFailure`
(`ExternalLinkDelegateTests.swift:126`) asserts the *forgiving* half and the
*next navigation* half, and there is no test at all for "a shell that has nothing
on screen and nothing to fail must reach the error view".

The distinction the code needs and does not have is not "did the shell divert
this load" but "was there a page under it". `model.state` already carries that:
a divert that happens while `state` has never been `.loaded` is the first load,
and it is the one case where the error must be shown.

### 2. `[introduced]` The new guard forgives *every* error, not just the interrupted-frame one, and the flag outlives the navigation it belongs to

`ios/Litloft/Web/WebView.swift:57`, `204-220`;
`ios/Litloft/Web/WebViewModel.swift:42-45`

Before this commit the forgiveness was keyed on the error: `WebKitErrorDomain`
102 and nothing else (`WebViewModel.isCancelled`, now reverted). After it, the
forgiveness is keyed on a flag and the error is not looked at at all —
`loadFailed` swallows an `NSURLErrorNotConnectedToInternet`, a
`cannotConnectToHost` or a dead content process just as readily, for as long as
`diverted` is set.

And `diverted` is set for longer than the navigation that set it. It is cleared
only in `didStartProvisionalNavigation`, so between a download diverting and the
*next* navigation starting — which may be never — every failure is swallowed.

Measured at the reviewed SHA:

| probe | sequence | `model.state` after |
|---|---|---|
| PROBE2 | `didStartProvisionalNavigation` → `divertedToDownload()` → `loadFailed(NSURLErrorDomain / notConnectedToInternet)` | `.loading` |
| PROBE3 | `divertedToDownload()` → `loadFailed(WebKitErrorDomain 204)` | `.loading` |

PROBE2 is the reachable ordering: the page the viewer is on is committed and
still loading, the viewer taps a download link, that response becomes a download,
and then the page's own load fails on the network. `didFail navigation:`
(`WebView.swift:241`) routes it through the same guard. The viewer gets a
half-drawn page and no error view, ever — a new provisional navigation is the
only thing that clears the flag, and there is nothing left to start one.

This is one dimension **wider** than what it replaced, in the same commit that
narrowed the other dimension. Keeping both conditions — the flag *and* the 102
— costs one `&&` and removes the whole class.

Breaks no R-0 item (§3 is about links).

### 3. `[introduced]` Round 1 finding 2 is two thirds closed: nothing still holds the delegate hand-off, so no file would ever be saved

`ios/Litloft/Web/WebView.swift:201`, `ios/Litloft/Web/FileDownloads.swift:31-33`

Round 1 listed three surviving mutations over the download chain (M9, M10, M11).
`ee5f7f81` closed two of them — the response policy (M9, now killed by
`attachmentsBecomeDownloads`) and the offer (M11, now killed by
`offersWhatArrived`). The third is untouched:

| mutation | result |
|---|---|
| `WebView.swift:201` — drop `downloads.take(download)` | **SURVIVED** (161/161 green) |

Without `take`, `download.delegate` is never set, so
`decideDestinationUsing` is never asked, no destination is chosen, nothing is
written and no sheet is raised. The whole feature is inert and the suite is
green. This is the one line that joins the two halves the new tests do hold
(`policy(for:)` on one side, `keep` / `arrived` on the other), and it is the
only unheld line left in the chain.

Unlike `createWebViewWith` (round 1's M20, a survivor by design because
`WKNavigationAction` cannot be stood in for), this line is reachable from a
test: `downloads` is a `let` on the coordinator, `take` takes a `WKDownload`
only to set `.delegate` on it, and a test could assert on a seam of the same
shape as `divertedToDownload()` — which the author created two lines above for
exactly this reason.

### 4. `[introduced]` The save sheet is dropped on the floor whenever the app is not `foregroundActive`

`ios/Litloft/Web/FileDownloads.swift:75-78`, `44-47`

`801fe944` replaced

```swift
guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
      let root = scene.windows.first(where: \.isKeyWindow)?.rootViewController
```

with a gate on the scene's activation state:

```swift
.first(where: { $0.activationState == .foregroundActive })
else { return }
```

`arrived` (`FileDownloads.swift:44-47`) has already taken the entry out of
`places` by the time `offer` runs, so the early return is final: the bytes stay
in the per-download temporary folder, no sheet appears, nothing is queued, and
nothing retries when the app returns. The viewer's file is gone with no message.

`.foregroundActive` is false not only in the background but in
`.foregroundInactive` — the app switcher, Control Center, an incoming call, the
moment of a scene transition. A `WKDownload` continues to run across exactly
those moments, which is the point of tapping Download and then doing something
else.

The activation-state condition is new in this commit; that much is the diff, not
a re-derivation. The old gate (`isKeyWindow`) carried no such condition, so this
is a gate that only ever subtracts.

Breaks no R-0 item.

---

## Mutation table

Every mutation ran the whole suite (161 tests / 218 runs). The tree was restored
after each and `git status --short` verified clean.

| id | file:line | mutation | want | result | killed by |
|---|---|---|---|---|---|
| **Re-measuring round 1's five** ||||||
| A | `WebView.swift:192` | `policy(for response:)` → always `.allow` (never take a download) | kill | **KILLED** | `ExternalLinkDelegateTests/attachmentsBecomeDownloads` |
| B | `FileDownloads.swift:46` | `arrived` never calls `offer(place)` | kill | **KILLED** | `FileDownloadsTests/offersWhatArrived` |
| C | `FileDownloads.swift:27` | drop the empty-name `"download"` fallback | kill | **KILLED** | `FileDownloadsTests/places` |
| D | `WebView.swift:178` | `.nothing` → `.allow` instead of `.cancel` | kill | **KILLED** | `ExternalLinkDelegateTests/navigationToNothing` |
| E | `WebView.swift:218` | remove the failure guard (`guard !diverted`) | kill | **KILLED** | `ExternalLinkDelegateTests/divertedLoadIsNotAFailure` |
| **The `diverted` flag and its seams** ||||||
| G | `WebView.swift:211-213` | `divertedToDownload()` becomes a no-op | kill | **KILLED** | `divertedLoadIsNotAFailure` |
| H | `WebView.swift:205` | drop `diverted = false` from `didStartProvisionalNavigation` | kill | **KILLED** | `divertedLoadIsNotAFailure` |
| I | `WebView.swift:200` | drop the `divertedToDownload()` call from `didBecome download:` | kill | **SURVIVED** | — (finding 3) |
| **`keep` / `arrived` / `lost`** ||||||
| J | `FileDownloads.swift:40-42` | `keep` stores nothing | kill | **KILLED** | `FileDownloadsTests/offersWhatArrived` |
| K | `FileDownloads.swift:49-51` | `lost` forgets nothing | kill | **KILLED** | `FileDownloadsTests/offersNothingElse` |
| L | `FileDownloads.swift:45` | `arrived` reads without removing (a file can be offered twice) | live | SURVIVED | — (survivor by design, below) |
| **The wiring into WebKit** ||||||
| F | `WebView.swift:201` | drop `downloads.take(download)` | kill | **SURVIVED** | — (finding 3) |
| **`801fe944`** ||||||
| M | `WebShell.swift:18` | drop `.ignoresSafeArea(edges: .bottom)` | live | SURVIVED | — (survivor by design, below) |
| N | `FileDownloads.swift:96` | drop `held.insert(window)` (the window dies before the sheet) | kill | **SURVIVED** | — (finding 5) |
| O | `FileDownloads.swift:77` | drop the `.foregroundActive` filter | kill | **SURVIVED** | — (finding 5) |

`P` (`hasPrefix` → `contains`, round 1 finding 6) was not re-run: it is already
recorded and open.

`F` and `I` together mean the whole of
`webView(_:navigationResponse:didBecome:)` (`WebView.swift:195-202`) can be
emptied and the suite stays green.

### 5. `[introduced]` Everything `801fe944` added is unheld, including the window's lifetime

`ios/Litloft/Web/FileDownloads.swift:74-100`, `ios/Litloft/Web/WebShell.swift:18`

Three mutations across the commit (M, N, O) all survive. `share` is
`private static` and unreachable from a test, so the window it raises — a new
`UIWindow` whose only teardown is one closure — has no coverage of any kind.

Measured with a probe that replicates `share`'s window setup line for line in the
test host:

```
PROBE4 rootBackground=nil rootOpaque=true windowOpaque=true level=0.0
       appWindowLevel=Optional(0.0) windowsInScene=3
       hitTestAtCentre=UIView (touch is taken)
PROBE5 handlerFired=true   (on a dismissal the code did not ask for)
```

Two things follow:

- **The window takes every touch over the whole screen for as long as it is up.**
  It sits at the same `windowLevel` as the app's own window and is created after
  it, so it is on top and hit-tests first. `completionWithItemsHandler` is the
  only thing that hides it and drops it from `held`; PROBE5 shows the handler is
  reliable enough to fire even on a dismissal the code did not initiate, so this
  is a fragility rather than a demonstrated leak — but it is a fragility with no
  test and a failure mode of a frozen app.
- **`window.isOpaque` is left `true` while `backgroundColor` is `.clear`.** The
  two contradict each other. Nothing is drawn in practice (neither the window nor
  the root view has any content), so the app shows through, but the opaque hint
  is wrong and nothing would catch it becoming visible.

The commit also bundles a second, unrelated change: `.ignoresSafeArea(edges: .bottom)`
on the web view. It is correct in principle — `frontend/src/app/layout.tsx:43`
sets `viewportFit: "cover"` and the page reads `env(safe-area-inset-bottom)` in
`SelectionBar`, `MobileInspectorSheet`, `MiniPlayerContainer` and the media
controls — so the page really can paint the band. But jsdom lays nothing out and
`frontend/e2e-layout/` does not run the shell, so this is reachable only by R-5:
someone using the app.

Note for the R-5 pass: `.ignoresSafeArea(edges: .bottom)` defaults its `regions`
argument to `.all`, which includes `.keyboard`, so SwiftUI no longer lifts the
web view when the keyboard appears. `WKWebView` insets its own scroll view for
the keyboard, so this is probably what is wanted — but it changed in this commit
and nothing measured it.

Breaks no R-0 item.

## Survivors that were meant to survive

- **L** — `arrived` reading without removing would let a file be offered twice if
  `downloadDidFinish` were delivered twice. WebKit delivers it once, and
  `offersNothingElse` already holds the case that matters (a lost download is
  never offered). Not worth an assertion.
- **M** — `.ignoresSafeArea` is a layout property. `review-workflow.md` is
  explicit that matching stylesheet text cannot verify one and that jsdom lays
  nothing out; there is no iOS equivalent of `frontend/e2e-layout/` here. It is
  listed under finding 5 only to say what is not covered, not as a missing test.
- **Round 1's M20** (`createWebViewWith` no longer routing the request) was not
  re-run; the reasoning that made it a survivor by design is unchanged.

## Checked, not a finding

- **The author's claim about round 1's five mutations is true.** A, B, C, D and E
  all fail the suite now, and each is killed by a test this commit added
  (`attachmentsBecomeDownloads`, `offersWhatArrived`, `places`,
  `navigationToNothing`, `divertedLoadIsNotAFailure`). Re-measured here rather
  than taken on the author's word.
- **The new tests really ran.** The incremental-build trap was checked: all five
  new method names appear in the result bundle
  (`xcresulttool get test-results tests`).
- **R-0 1, 2, 3, 4, 5 and 7 are untouched by both fix commits.** Neither
  `801fe944` nor `ee5f7f81` changes `ExternalLink.swift`, `openInNewWindow` or
  `policy(for:inMainFrame:)` beyond D's branch, and D kills. `frontend/` and
  `addons/` are not touched at all, so R-0 7 holds by construction.
- **R-0 6 (playback during a hand-off) is untouched.** `didCommit` still carries
  the player stop and `didStartProvisionalNavigation` still does not; the only
  line added to the latter is `diverted = false`.
- **A download begun from a navigation *action* rather than a response would not
  set the flag.** `webView(_:navigationAction:didBecome:)` is not implemented and
  `policy(for:inMainFrame:)` never returns `.download`, so WebKit has no way to
  produce one. Not reachable today; worth remembering if a `download` attribute
  is ever honoured.
- **`FileDownloads.keep` is keyed by `ObjectIdentifier`, which is reused after a
  deallocation.** `offersNothingElse` leans on this (it uses the identifier of a
  throwaway `FileDownloads`). In the real path the `WKDownload` is alive for the
  whole span between `keep` and `arrived`/`lost`, so no reuse can collide.
- **`held` is a `Set<UIWindow>` mutated from `share`.** Both are inside a
  `@MainActor` class and neither is `nonisolated`, so the access is isolated.
- **The docs.** `docs/user-guide/ios-app.md` and
  `docs/developer-guide/known-issues.md` were updated in `ce709795`; neither fix
  commit changes what a user observes in a way those pages describe. Not audited
  for precision (R-3).
- **Prose.** `WebViewModel.swift:43-45`'s misleading clause — round 1 finding 4,
  triaged delete-the-prose — is gone. The comments added by both fix commits
  describe the code rather than its history and name nothing from the review
  process; no prose here would lead a reader to a wrong code change.

## The trajectory question

> *Read the fix diffs in order. Does each round add a branch, a state or a
> prediction that the round before it also added?*

**Yes. Both fix commits continue the chain rather than closing it.**

| commit | what it added that can be wrong |
|---|---|
| `aa8a045e` | one decision: `ExternalLink.destination` |
| `ce709795` | a second decision (`isAttachment`), a reordering (player stop moves start → commit), and **a prediction**: WebKit 102 is never a real failure |
| `801fe944` | a window with a hand-written lifetime (`held`), **a new gate** (`.foregroundActive`), and a layout override |
| `ee5f7f81` | **a new mutable state** (`diverted`) with two seams, replacing `ce709795`'s prediction |

Round 1 called `ce709795`'s prediction too wide and said narrowing it would
"leave the loop converging with one fewer standing prediction rather than one
more". That is not what happened. `ee5f7f81` did delete the prediction from
`WebViewModel` — a removal, which is the shape of convergence — but it put a
longer-lived and **wider** one in the coordinator in its place: the old rule
looked at the error (`WebKitErrorDomain` 102 only), the new rule looks at a flag
and at no error at all, and the flag outlives the navigation that set it
(findings 1 and 2). And the case the round was written for is still broken
(finding 1). That is the test `review-workflow.md` names: *each round handling
one more case the last one did not anticipate.*

`801fe944` is the same shape from the other side. It fixes a symptom whose cause
the author says was never found, by taking the presentation out of the app's view
hierarchy, and pays for it with a second window the app must now manage and a
gate that silently discards the viewer's file (finding 4). Two new states to get
wrong, in exchange for one symptom, with nothing measuring either.

**The question behind all of it is being answered from the wrong place.** The
shell keeps asking *"why did this load stop?"* from a widening set of
side-channels — first an error code, now a flag whose lifetime nobody
specified — when what it needs to decide is *"is there a page on screen to
protect?"* `model.state` already answers that, and it is the answer that would
have made finding 1 impossible: a load that fails while nothing has ever loaded
must reach the error view, whatever stopped it.

Reported, not assigned. `review-workflow.md` R-4 reserves the C to the
supervisor.

TOTAL: 5 findings
