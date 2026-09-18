# Round 1 — iOS shell: external links and downloads

- Reviewed SHA: `ce70979527b803c37db3fdbb21a7dd7fcaece02c`
- Parent / comparison SHA: `3123cb8995c5abe2ad412d3d214d35273aae8ef6`
- Worktree: `/private/tmp/claude-502/-Users-libre-Sources-video-share/317d1718-1596-4bf3-a3e7-5f3c9662fd2f/scratchpad/review-ext`
- Suite: `xcodebuild test`, iPhone 17 Pro (`4AB8B4E9`), iOS 26.5 — **156 tests, all passing**, before and after every mutation was restored.
- `swiftlint lint --quiet` — 0 output, before and after.
- Live measurements were taken against the Litloft running on `http://localhost:3000` (read-only; nothing was restarted or rebuilt).

R-0 is §3 of `docs/superpowers/specs/2026-09-18-ios-shell-external-links.md`.

---

## Findings

### 1. `[introduced]` The shell has no way out when the *first* load answers with an attachment

`ios/Litloft/Web/WebViewModel.swift:46-50`, `ios/Litloft/Web/WebView.swift:183-188`,
`ios/Litloft/Web/WebShell.swift:17-23`

`isCancelled` now swallows every `WebKitErrorDomain` 102, and
`decidePolicyFor navigationResponse` turns any `Content-Disposition: attachment`
response into a download. When the page the shell loads *at startup* is such a
response, the two combine: the load is taken away as a download, WebKit reports
102, the model swallows it, and `state` stays `.loading` forever.

`WebShell` renders `ConnectionErrorView` only for `.failed`
(`WebShell.swift:17`), and `ConnectionErrorView` holds the **only** call site of
`onChangeServer` in the whole app (`grep -rn onChangeServer ios/Litloft/` →
`WebShell.swift` and `ConnectionErrorView.swift:29` only). `RootView` shows
`ServerSetupView` only while `settings.serverURL == nil`, and only
`settings.leave` clears it. So the viewer is left with a blank screen, no error,
no retry and no route back to the address picker — the app is stuck on that
server until it is reinstalled.

Measured, same probe on both trees (a `WebViewModel` + `Coordinator` + real
`WKWebView` pointed at an address that answers with an attachment,
`http://localhost:3000/api/files/ov5-au-ivreK/stream?download=true`):

| tree | result |
|---|---|
| `ce709795` (HEAD) | `state=.loading  url=nil` — blank, no error view |
| `3123cb89` (parent) | `state=.loaded  url=Optional(http://localhost:3000/api/files/…)` — the app is alive |

Breaks no R-0 item (the list is about links), but it removes a recovery path the
parent had. The narrow fix is to swallow 102 only where the shell knows it caused
it, rather than for every load: the 102 that motivated this is always preceded by
this delegate returning `.download`.

Reachability is low — the viewer has to type an address whose root answers with
an attachment — but the state it lands in is unrecoverable from inside the app.

### 2. `[introduced]` Nothing tests the download path this commit is named after

Three mutations of the download chain all survive the full 156-test suite:

- `decidePolicyFor navigationResponse` → always `.allow` (never download at all)
- `webView(_:navigationResponse:didBecome:)` → drop `downloads.take(download)`
- `downloadDidFinish` → never call `offer(place)`

Only `FileDownloads.isAttachment` and `FileDownloads.place` are held by tests;
the wiring that turns those two pure functions into a saved file is not. The
`offer` seam exists for exactly this (`FileDownloads.swift:9-10`, *"Apart so a
test does not raise a sheet it cannot dismiss"*) and no test uses it.

The behaviour itself is correct — measured end to end against the running
Litloft, driving `Coordinator.openInNewWindow` with the real download URL and
injecting `offer`:

```
PROBEB landed=http://localhost:3000/  after=http://localhost:3000/
       offered=["Meet new APIs for iPhone Duo.loft"]  bytes=83
```

The page it was asked from stays, the file arrives whole (83 bytes, matching the
server's `content-length: 83`), and the name survives. So this is a test gap, not
a behaviour defect — but it is the gap over the one thing the second commit adds,
and `offer` injection makes it cheap to close.

### 3. `[introduced]` `FileDownloadsTests/places()` cannot catch the loss of the empty-name fallback

`ios/LitloftTests/FileDownloadsTests.swift:44`

```swift
#expect(!FileDownloads.place(named: "").lastPathComponent.isEmpty, "a file with no name is still a file")
```

Mutating `FileDownloads.swift:27` from
`let name = suggested.isEmpty ? "download" : suggested` to `let name = suggested`
leaves the whole suite green.

Measured cause: `URL(fileURLWithPath: "/tmp/UUID-X").appendingPathComponent("")`
returns the folder unchanged, so `lastPathComponent` is the UUID — non-empty
either way. The assertion is satisfied by the observation it was built from and
holds nothing (`review-workflow.md` detector rule 5).

Without the fallback the returned destination is an existing *directory*, which
`WKDownload` cannot write to — so the guard is right and only the test is wrong.
`#expect(FileDownloads.place(named: "").lastPathComponent == "download")` kills it.

### 4. `[introduced]` The comment on `isCancelled` names a producer that does not exist

`ios/Litloft/Web/WebViewModel.swift:43-45`

> *"WebKit reports a load it stopped on the shell's own say-so — a file taken as
> a download, **an address handed to another app** — as a failure of the page
> that is still perfectly well on screen."*

Measured: a main-frame navigation to another origin, cancelled by
`policy(for:inMainFrame:)`, produces **no failure callback at all**. The model's
state is untouched:

```
PROBEA state=.loaded  opened=[http://127.0.0.1:3000/]  url=Optional(http://localhost:3000/)
```

(`state` was set to `.loaded` before the off-origin load; it stayed there.)
`.cancel` from `decidePolicyFor navigationAction` happens before a provisional
navigation starts, so `didFailProvisionalNavigation` never runs. Only the
download path reaches 102.

Reported under R-3's exception because it would lead to a wrong code change:
it tells a reader the external-link path depends on this swallow, which is
what makes finding 1 look like a cost that has to be paid. Remedy: delete the
"an address handed to another app" clause. Nothing needs to be written in its
place.

### 5. `[introduced]` `policy()` returning `.cancel` for `.nothing` is unheld

`ios/Litloft/Web/WebView.swift:176-177`

Mutating it to `.allow` leaves the suite green. The branch fires for a main-frame
navigation with no URL or an inert scheme (`javascript:`, `data:`, `about:`) —
cancelling those is sensible hardening, but nothing records the decision. Low
impact; the delegate seam (`policy(for:inMainFrame:)`) already exists, so a line
in `ExternalLinkDelegateTests` closes it.

### 6. `[introduced]` `isAttachment` matching is looser than the assertions claim

`ios/Litloft/Web/FileDownloads.swift:19`

Mutating `hasPrefix("attachment")` to `contains("attachment")` leaves the suite
green: the negative cases are `"inline"`, absent, and non-HTTP, none of which
contain the word. So `Content-Disposition: inline; filename="attachment.pdf"`
would be taken as a download and nothing would notice. Litloft only ever emits
`attachment; …` or `inline` (`backend/app/routers/files.py:901,922,937,1046`),
so this is not reachable through the core today; it is the assertion set that is
thin, not the implementation.

---

## Mutation table

| id | file:line | mutation | want | result | killed by |
|---|---|---|---|---|---|
| M1 | `ExternalLink.swift:18` | drop the inert-scheme guard | kill | KILLED | `ExternalLinkTests/neutralised`, `ExternalLinkDelegateTests/newWindowForNothing` |
| M2 | `ExternalLink.swift:19` | invert the same-origin guard | kill | KILLED | 8 link tests + 3 `CoordinatorTests` dead-page tests |
| M3 | `ExternalLink.swift:21` | drop the same-page suppression | kill | KILLED | `ExternalLinkTests/samePage` |
| M4 | `ExternalLink.swift:31` | stop stripping the fragment in `page(of:)` | kill | KILLED | `ExternalLinkTests/samePage` |
| M5 | `WebView.swift:168` | invert `guard inMainFrame` | kill | KILLED | `navigationToAnotherSite`, `subframesAreLeftAlone` |
| M6 | `WebView.swift:176` | `.nothing` → `.allow` instead of `.cancel` | kill | **SURVIVED** | — (finding 5) |
| M7 | `WebView.swift:174` | `.cancel` without handing the address to the system | kill | KILLED | `navigationToAnotherSite` |
| M8 | `WebView.swift:148-149` | swap `.shell` / `.system` in `openInNewWindow` | kill | KILLED | `newWindowToAnotherSite`, `newWindowToTheServer` |
| M9 | `WebView.swift:187` | never take a response as a download | kill | **SURVIVED** | — (finding 2) |
| M10 | `WebView.swift:195` | drop `downloads.take(download)` | kill | **SURVIVED** | — (finding 2) |
| M11 | `FileDownloads.swift:47` | never call `offer(place)` | kill | **SURVIVED** | — (finding 2) |
| M12 | `FileDownloads.swift:19` | drop `.lowercased()` | kill | KILLED | `FileDownloadsTests/attachments` |
| M13 | `FileDownloads.swift:19` | `hasPrefix` → `contains` | kill | **SURVIVED** | — (finding 6) |
| M14 | `FileDownloads.swift:27` | drop the empty-name `"download"` fallback | kill | **SURVIVED** | — (finding 3) |
| M15 | `FileDownloads.swift:25` | one fixed folder instead of a UUID per download | kill | KILLED | `FileDownloadsTests/places` |
| M16 | `FileDownloads.swift:26` | do not create the folder | kill | KILLED | `FileDownloadsTests/places` |
| M17 | `WebViewModel.swift:49` | swallowed code 102 → 103 | kill | KILLED | `WebViewModelTests/stoppedByTheShellIsNotAFailure` |
| M18 | `WebView.swift:205-207` | `didCommit` no longer stops the player | kill | KILLED | `navigationStopsThePlayer`, `deadPageOffScreenWaits`, `deadPageOnScreenIsReloaded` |
| M19 | `WebView.swift:198-200` | also stop the player on `didStartProvisionalNavigation` | kill | KILLED | `CoordinatorTests/downloadKeepsThePlayer` |
| M20 | `WebView.swift:140` | `createWebViewWith` no longer routes the request | kill | **SURVIVED** | — (survivor by design, below) |

The tree was restored after each mutation and `git status --short` verified clean;
the final restored tree builds, passes all 156 tests, and lints clean.

## Survivors that were meant to survive

- **M20** — `createWebViewWith` and `decidePolicyFor navigationAction` are
  deliberately thin, because `WKNavigationAction` and `WKFrameInfo` cannot be
  stood in for (a subclass crashes in `dealloc`). The decisions live in
  `openInNewWindow` and `policy(for:inMainFrame:)`, which *are* tested. The
  one-line forwarding is the price of that design and is covered instead by
  running the app. Noted, not a finding.
- **M13 / M6** are survivors whose blast radius is bounded by what the core
  server can emit; they are listed as findings 5 and 6 only because closing them
  is a single assertion each.

## Checked, not a finding

- **R-0 1 and 2 hold, measured.** Off-origin main-frame navigation: the address
  reaches `URLOpener` exactly once and `webView.url` is unchanged — nothing is
  loaded in the shell (PROBEA above). M2, M5 and M7 all kill.
- **R-0 3.** `openInNewWindow` calls `webView.load(request)` on the *same* web
  view, whose configuration keeps `websiteDataStore = .default()`
  (`WebView.swift:11`), so the session is structurally the same one. M8 kills the
  routing half.
- **R-0 4.** `#`-only and fragment-only windows resolve to `.nothing`; M3 and M4
  both kill. Confirmed `MarkdownPreview.tsx` is unchanged by either commit.
- **R-0 5.** Subframe navigations are allowed unconditionally; M5 kills.
  `targetFrame == nil` (a `target="_blank"` request) also takes the `.allow`
  path, which is required — cancelling it would stop `createWebViewWith` ever
  being asked, and the external-link feature with it.
- **R-0 6.** A hand-off to Safari cancels before any navigation starts, so
  `didCommit` never runs and `stopForNavigation` is not called; playback is left
  to the 2b rules. M19 confirms the commit-vs-start distinction is load-bearing.
- **R-0 7.** Neither commit touches `frontend/` or `addons/`; the diff is
  `ios/` plus two files under `docs/`. Browser and PWA behaviour is unchanged by
  construction.
- **`blob:` URLs would be handed to `UIApplication.open` and silently vanish**
  (scheme is not inert, `url.host()` is nil so `isSameOrigin` is false →
  `.system`). Not reachable: `grep -rn createObjectURL frontend/src` finds
  nothing, and the only two `window.open` call sites
  (`useFileMenuItems.ts:75`, `FolderTreePane.tsx:485`) pass server paths.
- **SVG and HTML previews are not caught by the attachment rule.** `/stream`
  does force `attachment` for `_DANGEROUS_INLINE_MIMES`
  (`backend/app/routers/files.py:109-116`), but SVG is rendered through `<img>`
  (a subresource, which never reaches `decidePolicyFor navigationResponse`) and
  HTML through `/render`, which sends `Content-Disposition: inline`
  (`files.py:1046`). No regression.
- **`place(named:)` and a hostile suggested filename.** Measured on the Swift
  side: `folder.appendingPathComponent("../../evil.txt")` standardises to
  `/evil.txt`, i.e. `appendingPathComponent` does not constrain the result to the
  UUID folder. Not reported as a defect because WebKit sanitises
  `suggestedFilename` before handing it over and the server is the viewer's own
  Litloft; raising it would mean excavating past what this change introduced
  (R-4 scope). Worth a `standardizedFileURL`-prefix check if the shell is ever
  pointed at something the viewer does not run.
- **Docs.** `docs/user-guide/ios-app.md` and `docs/developer-guide/known-issues.md`
  are updated in the same commit as the behaviour, as `CLAUDE.md` requires, and
  they describe what the code does. Not audited for precision (R-3).

## The trajectory question

> *Does the second commit add a branch, a state or a prediction that the first
> one also added?*

**No.** The two commits do not repeat a shape.

`aa8a045e` adds one decision — `ExternalLink.destination`, a three-way routing
prediction — and two thin delegate methods that consult it. `ce709795` adds a
different decision, on the *response* rather than the request
(`isAttachment`), plus the two corrections that decision forces on its own
account: a download never commits, so the player stop moves from
`didStartProvisionalNavigation` to `didCommit`; and a download aborts its load,
so the resulting error is not a page failure. Neither of those is a case
`aa8a045e` had already handled and got wrong.

It also was not discovered late. §4 of the spec named this exact branch point
before either commit ("`WKDownloadDelegate` を足して… 推測で片方に倒さない"),
required a measurement, and the measurement came out the way the code now
assumes. That is a scheduled second half, not a patch.

The one caution worth recording: `ce709795`'s new prediction — *WebKit 102 is
never a real failure* — is **wider than the case that motivated it**. It was
added for the download it creates itself, but it is applied to every load,
including the very first one, and that breadth is finding 1. Narrowing it to the
navigations the shell knows it diverted would leave the loop converging with one
fewer standing prediction rather than one more.

TOTAL: 6 findings
