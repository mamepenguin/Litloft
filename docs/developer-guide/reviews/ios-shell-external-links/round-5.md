# Round 5 — iOS shell: does the recorded fact end the chain?

- Reviewed SHA: `a8c8a6b902ca7d09970dcb9e9e9f2b445794ba96`
- Subject: `ba8f7b74` (keep what is on screen rather than asking WebKit for it)
- Worktree: `/private/tmp/claude-502/-Users-libre-Sources-video-share/317d1718-1596-4bf3-a3e7-5f3c9662fd2f/scratchpad/review-ext-5`
  — never moved; `git status --porcelain` empty at `a8c8a6b9` after every mutation
  and at the end of the round.
- Simulator: iPhone 17 Pro (`4AB8B4E9`), iOS 26.5, Xcode 26.5.
- Suite at the reviewed SHA, before and after the mutation campaign:
  **173 distinct tests, 231 runs, `** TEST SUCCEEDED **`**.
  `swiftlint lint --quiet` — 0 lines of output, before and after.
- All four test methods `ba8f7b74` adds or renames were confirmed by name in the
  run log (`firstLoadWithNoPage` twice, once per argument; `deadPageIsNotOnScreen`;
  `frameDownloadLeavesThePageAlone`; `failureAfterAPageIsUp`), so the
  incremental-build trap did not apply. Every mutation below was confirmed to
  compile, to change the diff stat, and to run; none was void.
- Live measurement used a temporary probe suite (`ProbeServer` + five probes)
  added to the test target, run, and deleted. No forwarding `WKNavigationDelegate`
  was inserted anywhere: the coordinator was the web view's own delegate in every
  probe, and the shell's belief was read through `Coordinator.hasPageOnScreen`.
  The Litloft on `http://localhost:3000` was read by the existing tests only;
  nothing was restarted or rebuilt.

R-0 is §3 of `docs/superpowers/specs/2026-09-18-ios-shell-external-links.md`,
including **invariant 8**: with no page on screen, a load that stops is always
reported to the viewer.

---

## The regression probes

Every probe drove real WebKit against a server built for this round, and reports
what the viewer would be looking at. `onScreen` is `Coordinator.hasPageOnScreen`.

| probe | scenario | what the viewer sees | verdict |
|---|---|---|---|
| **P-JETSAM** | process killed while away, app returns to a server that now redirects off-origin | `state=failed("There is no page to show at http://127.0.0.1:55275/.") onScreen=false opened=[https://example.com/portal] url=nil` | **round 4 finding 1 is fixed** ✅ |
| **P-RECOVER** | same death, healthy server on the way back | `cameBack=true state=loaded onScreen=true url=Optional(…/) hits=["/", "/"]`, then a stopped load after it → `policy=.cancel state=loaded` | the fact comes back, and a later stop is judged against the live page ✅ |
| **P-DOWNLOAD** | download asked for from a page that is up, driven by `location.href='/file'` | `state=loaded onScreen=true url=…(unchanged) same=true offered=1` | page survives, file offered ✅ |
| **P-1004-NOPAGE** | first load to a port that stopped listening | `state=failed("Litloft is not answering at …") onScreen=false` | ✅ |
| **P-1004-PAGEUP** | server taken down after a page is up, then a navigation | `state=failed("Litloft is not answering at …") onScreen=true url=…(page still there)` | error view over a readable page — the designed behaviour here, the server really is gone ✅ |
| **P-SPA** | `history.pushState` | `state=loaded onScreen=true url=…/spa` | no commit, fact stays right ✅ |
| **P-BACK** | two `goBack()` hops back to `/`, served from the back-forward cache (`hits=["/", "/second"]` — no new request) | `state=loaded onScreen=true url=…/` | fact stays right ✅ |

**The case round 4 raised is closed, and it is closed at the level of the
mechanism rather than of the symptom.** In P-JETSAM the back-forward list still
reports a current item after the process death (`item=true` with `url=nil`), so
the predicate `ba8f7b74` removed would still be wrong there; the recorded fact is
right, and the viewer is given the error view and the way back to the address
picker.

**Each of the author's five claimed kills was re-measured. Three hold outright;
two hold in one direction only** — see findings 1 and 2.

---

## Findings

### 1. `[introduced]` The response policy's `pageOnScreen` is held in one direction only: pinning it to `false` survives the whole suite, and a download from a live page then covers that page with the error view

`ios/Litloft/Web/WebView.swift:204-208`,
`ios/LitloftTests/CoordinatorTests.swift:126`

M6 pins the call site to `pageOnScreen: true` and is **killed** by
`firstLoadWithNoPage[attachment]` — that is round 4 finding 3's M11, closed, and
it is the real result of this commit. M7 pins the same argument to `false` and
**survives all 231 runs**.

What that costs was measured, not argued: with M7 applied, P-DOWNLOAD gives

```
PROBE5[DOWNLOAD] state=failed("There is no page to show at http://127.0.0.1:57838/.")
                 onScreen=true url=Optional(http://127.0.0.1:57838/) same=true offered=1
```

The page is still there, the file is still handed over, and "Cannot reach
Litloft" is laid over the top of it. Tapping Download in the app would look
broken. `xcodebuild test` reports `** TEST SUCCEEDED **`.

The reason nothing catches it is one line: `downloadLeavesThePageUp` — the test
written for exactly this scenario, and the only one with a real page from the
running Litloft — calls
`coordinator.policy(for: attachment, isForMainFrame: true, pageOnScreen: true)`
and supplies the argument by hand. So does every `Rig.answer` seam test. The
delegate's own computation of the argument is exercised in the no-page direction
only.

Breaks no invariant as the code stands. It is a test that claims to hold a call
site and holds half of it, in the direction that produces the class of
regression rounds 2, 3 and 4 each shipped.

The fix is cheap and was measured working during this round: a live test that
loads a page and then navigates the main frame to an attachment URL on the same
server kills M7 (P-DOWNLOAD is about thirty lines).

### 2. `[introduced]` `navigationResponse.isForMainFrame` is wired in but held by nothing: pinning it to `true` survives

`ios/Litloft/Web/WebView.swift:206`

M8 removes the guard inside `policy(for:isForMainFrame:pageOnScreen:)` and is
**killed** by `frameDownloadLeavesThePageAlone`, so the seam is held. M9 pins the
argument at the call site to `true` and **survives all 231 runs** — the wiring
from `navigationResponse.isForMainFrame` into the policy is held by nothing, and
with it pinned the new guard is inert.

The behaviour that restores is the one round 4 finding 5 measured directly: a
subframe whose response is an attachment calls `markStopped` for the main frame,
declaring the main frame's in-flight load finished. Round 4's trace
(`PROBE[FRAME] … markStopped pageOnScreen=true from=loading`) is the same
mechanism; this round only establishes that nothing in the suite would notice its
return.

Identical shape to finding 1: the new argument is tested where a test supplies
it, not where the delegate computes it.

### 3. `[introduced]` `firstLoadWithNoPage` is flaky — it fails about one run in fifteen at the reviewed SHA with nothing mutated — and it is the only end-to-end hold on invariant 8

`ios/LitloftTests/CoordinatorTests.swift:158-185`,
`ios/LitloftTests/StubServer.swift:62-70`

Three failures in roughly 45 unmutated runs of this test, across four
configurations, on both arguments:

| run | configuration | failing argument | message |
|---|---|---|---|
| `sub-baseline` | seven suites, parallel clones | `.attachment` | `await waitUntil { offered.files.count == 1 }: the file was not handed to the viewer` |
| `flake2` | this test alone, parallel | `.attachment` | same |
| `iter` (14 iterations = 28 runs) | this test alone, parallel | `.redirect` | `await waitUntil { opener.opened == [URL(string: …` |

Always the **second** expectation — the observable effect — and never the first.
The first is `waitUntil { if case .failed = model.state }`, which is satisfied by
*any* failure, including an ordinary connection error, so a run in which the stub
server does not answer reaches `.failed` by the wrong road and then times out
waiting for the file or for Safari. The test cannot tell "the shell said so
itself" from "the load failed", which is what makes the flake present as
"state right, effect missing".

Why this is worth a finding rather than a shrug: this is the test that closes
round 4 finding 3 and drives, end to end, the case three rounds were about. A
detector that reddens the whole suite at random is a detector people re-run, and
the next real regression inside it will read as the same flake.

**The mechanism is localised but not proven.** `StubServer.serve` cancels the
connection the moment `contentProcessed` fires
(`connection.send(…, completion: .contentProcessed { _ in connection.cancel() })`),
and nothing else in the loop can abort a transfer. Contrast measured this round:

- with `-parallel-testing-enabled NO`, 4 of 4 runs passed and the download
  completed in about two milliseconds each time — instrumented, the whole
  `take` → `decideDestination` → `didFinish` sequence spans 2 ms;
- the probe server written for this round is the same shape but delays the cancel
  by one second, and lost no download in any probe run (four runs of P-DOWNLOAD,
  which is few — offered as a direction, not as proof);
- fanning the attachment argument out to sixteen concurrent copies in one run
  produced 16 passes, so ordinary load is not the trigger on its own.

---

## Mutation table

Every mutation ran the suites that can reach this code —
`ExternalLinkDelegateTests`, `ExternalLinkTests`, `FileDownloadsTests`,
`ContractTests`, `WebViewModelTests`, `ShellBridgeTests`,
`SharedMediaState/CoordinatorTests`, 136 runs — and the tree was restored and
`git status --porcelain` verified empty after each. Both survivors were then
re-run against the **full 231-run suite** and survived that too. The full suite
was run green before the campaign and again after the last restore.

| id | file:line | mutation | want | result | killed by |
|---|---|---|---|---|---|
| **the recorded fact** ||||||
| M1 | `WebView.swift:239` | `didCommit` no longer sets the fact | kill | **KILLED** | `deadPageIsNotOnScreen`, `offOriginNavigationIsHandedOver` |
| M2 | `WebView.swift:128` | terminate no longer clears the fact | kill | **KILLED** | `deadPageIsNotOnScreen` |
| M19 | `WebView.swift:128` | terminate sets it `true` instead | kill | **KILLED** | `deadPageIsNotOnScreen` |
| M3 | `WebView.swift:62` | the fact starts `true` | kill | **KILLED** | `firstLoadWithNoPage` (both arguments) |
| **the two reads of it** ||||||
| M4 | `WebView.swift:178` | action call site pinned `pageOnScreen: true` | kill | **KILLED** | `firstLoadWithNoPage[redirect]` |
| M5 | `WebView.swift:178` | action call site pinned `pageOnScreen: false` | kill | **KILLED** | `offOriginNavigationIsHandedOver` |
| M6 | `WebView.swift:207` | response call site pinned `pageOnScreen: true` | kill | **KILLED** | `firstLoadWithNoPage[attachment]` (round 4 #3's M11, closed) |
| M7 | `WebView.swift:207` | response call site pinned `pageOnScreen: false` | kill | **SURVIVED** | — (finding 1) |
| **the frame guard** ||||||
| M8 | `WebView.swift:219` | the guard is dropped; a frame ends the page's load | kill | **KILLED** | `frameDownloadLeavesThePageAlone` |
| M10 | `WebView.swift:219` | the guard is inverted | kill | **KILLED** | `attachmentWithNothingOnScreen`, `stoppedWithAPageUp`, `downloadLeavesThePageUp`, +2 |
| M9 | `WebView.swift:206` | call site pinned `isForMainFrame: true` | kill | **SURVIVED** | — (finding 2) |
| M18 | `WebView.swift:219` | the response policy no longer marks stopped at all | kill | **KILLED** | `attachmentWithNothingOnScreen`, `downloadLeavesThePageUp`, +2 |
| **`markLoading` and the `state == .loading` guard** ||||||
| M11 | `WebView.swift:232` | `didStartProvisionalNavigation` no longer calls `markLoading` | kill | **KILLED** | `failureAfterAPageIsUp` (round 4 #4, closed) |
| M12 | `WebViewModel.swift:33` | drop `state == .loading` | kill | **KILLED** | `failuresOnlyCountWhileLoading`, `failuresFollowTheLoadInFlight`, `downloadLeavesThePageUp` |
| M13 | `WebViewModel.swift:42` | invert `markStopped`'s guard | kill | **KILLED** | 10 tests |
| **the failure reports** ||||||
| M14 | `WebView.swift:255-257` | `didFail navigation:` reports nothing | kill | **KILLED** | `failuresFollowTheLoadInFlight` (round 4 #7 / round 3 #3, closed) |
| M15 | `WebView.swift:247-253` | `didFailProvisionalNavigation` reports nothing | kill | **KILLED** | `failureAfterAPageIsUp`, `failuresFollowTheLoadInFlight` |
| **the action policy** ||||||
| M16 | `WebView.swift:183` | drop the main-frame guard (R-0 5) | kill | **KILLED** | `subframesAreLeftAlone` |
| M17 | `WebView.swift:190` | `.system` no longer marks stopped | kill | **KILLED** | `handedAwayWithNothingOnScreen`, `stoppedWithAPageUp` — **not** `firstLoadWithNoPage` |

## Survivors that were meant to survive

None. Both survivors are reported as findings: each is a new argument this commit
introduced, held at the seam and not at the call site that computes it.

Not re-run, as the brief directs: `createWebViewWith` (`WKNavigationAction` still
cannot be built), the two lines inside `didBecome download:`, and the `spent`
guard in `FileDownloads.whenActive` (round 4 #6, recorded and open).

## Checked, not a finding

- **The author's structural claim is true.** `hasCommittedPage` and the
  `WKWebView` extension are gone; no product file reads `backForwardList`. One
  `webView.url` read survives, at `WebView.swift:158`, where it is passed as
  `current:` to `ExternalLink.destination` — a different question ("what address
  is the shell at", for the fragment-only test), not the on-screen predicate.
- **The fact cannot go stale, as far as the transitions go.** Enumerated and
  probed: a commit (sets it), a process death (clears it), an SPA navigation and
  a back-forward move (neither changes what is drawn, and the fact stays true —
  P-SPA, P-BACK), `retry()` and the reload token (both go through
  `webView.load` → `didStartProvisionalNavigation` → `didCommit`), and a
  commit-then-fail, where the page is replaced by a partial one but `markFailed`
  fires with `state == .loading` and the error view covers it. I found no
  transition that changes whether anything is drawn and bypasses both writes.
- **Round 4 #2 (the `204`/`102` case) is unchanged and was not re-derived**, as
  the brief directs; likewise round 4 #6, the `.loft` mini player, the back-swipe
  theme colours, `isAttachment`'s thin assertions, and the absence of an
  `xcodebuild` CI job.
- **Round 4 finding 8's sentence is gone**, and the one that replaced it
  (`CoordinatorTests.swift:154-157`) is closer to what the test does. It is still
  not exactly true of the redirect half: M17 shows that removing `markStopped`
  from the `.system` branch leaves `firstLoadWithNoPage[redirect]` green, because
  WebKit's own `102` reports that load. A reader who deleted that call on the
  strength of the sentence would be caught by `handedAwayWithNothingOnScreen` and
  `stoppedWithAPageUp`, so it does not lead to a wrong code change and is not
  filed.
- **`WebView.swift:64-65`** ("for a test to check against the page it can see")
  describes a test, which `comments.md` puts outside what a comment may say. It
  misleads nobody about the code; noted, not filed.
- **R-0 1 to 7 are untouched.** `ExternalLink.swift` and `openInNewWindow` are not
  in the diff; M16 confirms the subframe guard is still held (R-0 5); `didCommit`
  still carries `player?.stopForNavigation()` and `didStartProvisionalNavigation`
  still does not (R-0 6).
- **Docs.** `ba8f7b74` changes the shell's error screen in one direction only —
  it now appears where the app used to sit blank. No page under `docs/` describes
  the shell's error screen, and nothing in `CLAUDE.md`'s table matches. Not filed.
- **`StubServer` replacing `RedirectServer`** is a generalisation, not a new
  state: one enum with two cases, each producing one response. The only thing
  wrong with it is finding 3.

---

## The trajectory question

> *Read the fix diffs in order. Does each round add a branch, a state or a
> prediction that the round before it also added?*

**No. `ba8f7b74` ends the chain the previous four rounds were in, and the count
goes the other way for the first time.**

| | removed | added |
|---|---|---|
| `ee5f7f81` | — | a `diverted` flag |
| `14ea951d` | the 102 classifier | the prediction `url != nil` |
| `3c8704b0` | `reaches(_:pageOnScreen:)`, the whole "which stopped load may be forgiven" question | the prediction `currentItem != nil`, the `state == .loading` precondition, three call sites |
| **`ba8f7b74`** | **the prediction, the `WKWebView` extension that held it, and the coupling that let a subframe decide the main frame's state** | **one stored `Bool` with exactly two writes, and one guard** |

A stored fact is still a state, and the brief is right to ask which kind it is.
The distinction that decides it: **rounds 1 to 4 each *derived* the predicate from
something else, and round 5 *records* it.** A derived predicate is wrong wherever
its source disagrees with it, and there were three sources, each wrong in a
different place — which is why round 4 could write that the cases traded off, and
why a fifth source would have traded again. A recorded fact can only be wrong if
a transition that changes the answer bypasses the recorder. There are two such
transitions, the shell already passes through both, and I enumerated and probed
the candidates for a third (above, under "the fact cannot go stale") without
finding one.

So I do not have a case that forces a sixth correction, and I looked for one
specifically. The `isForMainFrame` guard is not another special case either: it
is a different axis — *which frame* rather than *is anything drawn* — and what it
does is delete a coupling, not add a prediction.

**What is repeating is not the design. It is one testing habit, and it has now
repeated three rounds running:**

| round | the new thing | held at the seam | held where the delegate computes it |
|---|---|---|---|
| 3 | `pageOnScreen` on the response policy | yes | no (round 4 #3) |
| 4 | `markLoading` as a precondition | — | no (round 4 #4) |
| **5** | `pageOnScreen` in the page-up direction; `isForMainFrame` | yes | **no (findings 1 and 2)** |

Every round has added an argument to a pure function, tested the pure function by
passing the argument by hand, and left the line that computes it uncovered. That
is why round 4 could half-close and this round can half-close again: `M11` died
and `M11b` lived. It is a gap of method, not of design, and one live test —
a page up, then a main-frame navigation to an attachment on the same origin —
closes finding 1 today; the same shape with an iframe closes finding 2.

Reported, not assigned. `review-workflow.md` R-4 reserves the C to the supervisor,
and on this round my reading is that there is no C to assign.

TOTAL: 3 findings
