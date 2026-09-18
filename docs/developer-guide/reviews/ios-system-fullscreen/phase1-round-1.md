# Phase 1, round 1 review — iOS system fullscreen for `.loft`

- Core: `4785a8f2` (branch `feat/ios-system-fullscreen`), reviewed as `git show 4785a8f2`.
- Addon `addons/media_import`: `9f7117a`.
- Spec: `docs/superpowers/specs/2026-09-19-ios-system-fullscreen.md` (R-0 invariants 1, 2, 3, 4, 7 in scope).
- Swift tests run on a separate simulator (iPhone 17 Pro Max, `BE039A5E-…`), with their own derived-data path.
  Every Swift mutation was confirmed applied (`git diff --stat` showed one changed file) before the run.
- Baseline: Swift `EmbedFramesTests` + `ContractTests` green. Frontend `nativeBridge.test.ts` +
  `YouTubeEmbedPlayer.test.tsx` green (63 tests).
- All code touched here is new in this commit (`EmbedFrames.swift`, the `embed.fullscreen` branch of
  `ShellBridge.route`, `shellHasSystemFullscreen`, `requestEmbedFullscreen`, `SystemFullscreenButton`,
  the `settingsToggles` wiring in `YouTubeEmbed.tsx`). Every finding below is therefore `[introduced]`.
- Both trees were restored after every mutation. At the end, `git status --short` shows only this
  review directory, and `git -C addons/media_import status --short` shows nothing.

## Mutation table

| id | file | change | want | result |
|---|---|---|---|---|
| F1 | nativeBridge.ts | `shellHasSystemFullscreen` drops `handler() !== null` | kill | killed (1) |
| F2 | nativeBridge.ts | `SYSTEM_FULLSCREEN_SHELL_VERSION` 3 → 2 | kill | killed (2) |
| F3 | nativeBridge.ts | `>=` → `>` for system fullscreen version | kill | killed (2) |
| F4 | nativeBridge.ts | `requestEmbedFullscreen` sends `videoId: ""` | kill | killed (2) |
| F5 | nativeBridge.ts | `REQUIRED_SHELL_VERSION` 2 → 3 (inv. 2) | kill | killed (9) |
| F6 | YouTubeEmbed.tsx | button gate `shellHasSystemFullscreen()` → `true` | kill | killed (2) |
| F7 | YouTubeEmbed.tsx | button gate → `false` | kill | killed (1) |
| F8 | YouTubeEmbed.tsx | `onOpen` sends a hard-coded `"dQw4w9WgXcQ"` instead of `videoId` | kill | **live** |
| F9 | YouTubeEmbed.tsx | `onOpen` does nothing | kill | killed (1) |
| F10 | NativeSettingsRows.tsx | button drops `onClick` | kill | killed (1) |
| F11 | nativeBridge.ts | system-fullscreen gate uses `REQUIRED_SHELL_VERSION` | kill | killed (2) |
| S1 | EmbedFrames.swift | `videoId`: drop `!isMainFrame` | kill | killed |
| S2 | EmbedFrames.swift | drop origin `scheme == "https"` | kill | killed |
| S3 | EmbedFrames.swift | drop origin host allow-list | kill | killed |
| S4 | EmbedFrames.swift | drop URL `scheme == "https"` | kill | killed |
| S5 | EmbedFrames.swift | URL host allow-list → any non-empty host | kill | killed |
| S6 | EmbedFrames.swift | `parts.count == 3` → `>= 3` | kill | killed |
| S7 | EmbedFrames.swift | drop `parts[1] == "embed"` | kill | **live** |
| S8 | EmbedFrames.swift | `isVideoId`: `count == 11` → `>= 11` | kill | **live** |
| S9 | EmbedFrames.swift | `isVideoId`: character-set check → `true` | kill | **live** |
| S10 | EmbedFrames.swift | `isVideoId`: drop `isASCII` | kill | **live** |
| S11 | ShellBridge.swift | `route`: `embed.fullscreen` skips `isVideoId` | kill | killed |
| S12 | ShellBridge.swift | `route`: `embed.fullscreen` bypasses `isTrusted` | kill | killed |
| S13 | EmbedFrames.swift | user script `forMainFrameOnly: true` | kill | killed |
| S14 | EmbedFrames.swift | handler added to `.page` world instead of `litloft-embeds` | kill | **live** |
| S15 | EmbedFrames.swift | user script injected into `.page` world | kill | **live** |
| S16 | EmbedFrames.swift | `callAsyncJavaScript` runs in `.page` world | kill | **live** |
| S17 | EmbedFrames.swift | script body drops `video.webkitEnterFullscreen()` | kill | **live** |
| S18 | ShellBridge.swift | `.embedFullscreen` case does nothing | kill | **live** |
| S19 | ShellBridge.swift | `install` drops `embeds.install(in:)` | kill | killed |
| S20 | EmbedFrames.swift | recorded frame is never stored (`frames[videoId] = frame` removed) | kill | **live** |
| S21 | ShellBridge.swift | `contractVersion` 3 → 2 | kill | killed |
| S22 | ShellBridge.swift | `attach` does not pass the web view to `embeds` | kill | **live** |

## Findings

### 1. The shell's embed path is untested past the pure functions; the script it runs in a YouTube frame is held by nothing

- Label: `[introduced]`
- Severity: Medium (test gap on the trust boundary)
- Where: `ios/Litloft/Bridge/EmbedFrames.swift:24-33` (install), `:38-52` (record), `:76-101` (lookup, call, script);
  `ios/Litloft/Bridge/ShellBridge.swift:62-63` (dispatch)
- R-0: 3 (the frame gets fullscreen and nothing else), 7 (a missing frame does nothing)
- Reproduction: S17, S18, S20 and S22 all leave `EmbedFramesTests` + `ContractTests` green. Each one
  disables the feature. More to the point for invariant 3: `enterFullscreenScript` can be replaced with
  any script and no test fails. S17 shows this. By the same path, a script that seeks, navigates,
  reads the DOM or posts it out would also pass. The same holds for the dispatch `.embedFullscreen → enterFullscreen`,
  and for the map lookup that invariant 7 depends on (`frames[videoId]` missing → return).
  The only guarantees under test are `videoId(...)`, `isVideoId`, `route`, and "a user script
  containing the handler name is not main-frame-only".
- Suggestion: Hold the script and the dispatch with a test. For example, drive `userContentController` / `enterFullscreen`
  through a seam that records `(script, frame, world)`, or check `enterFullscreenScript` against a
  declared value, in addition to a device check.

### 2. The content-world isolation is not held by any test

- Label: `[introduced]`
- Severity: Medium (test gap), Low actual exposure
- Where: `ios/Litloft/Bridge/EmbedFrames.swift:26`, `:31`, `:83`
- R-0: 3
- Reproduction: S14 (handler registered in `.page`), S15 (user script in `.page`), and S16
  (`callAsyncJavaScript` in `.page`) all pass. The spec and the type's doc depend on "a handler that
  exists only in that world, so YouTube's own scripts cannot post to it". No test observes which world is used.
- Security assessment of the world choice as written:
  - **Who can make the shell act.** Only the `litloft` handler causes an action. `route` checks
    `isTrusted` first, so only Litloft's main frame gets through. S12 is killed by `onlyTheServerAsks`,
    which includes a YouTube-origin sub-frame and a server-origin sub-frame. Cleared.
  - **Can YouTube's scripts or another frame reach `litloftEmbed`?** As written, no: only the shell's
    user script runs in `litloft-embeds`. Even if they could (S14), the message body is ignored. The
    frame is judged from `message.frameInfo` (WebKit's own security origin and request), so a post
    could only record the posting frame under its own URL. Cleared, but unheld.
  - **Can a hostile frame get itself recorded under a videoId?** Only a frame whose security origin
    *and* request URL are `https://www.youtube.com|www.youtube-nocookie.com/embed/<11 chars>`.
    S2–S6 are killed. That frame is YouTube's own document. A hostile parent can still cause one to load:
    a third-party frame nested anywhere inside Litloft can embed the same videoId. The *last* such frame to load
    then owns the entry (`frames[videoId] = frame` overwrites). The payoff is that the fullscreen
    request goes to a YouTube player of the same video in the other frame, which that parent can steer
    with the IFrame API. The impact is negligible. Recorded, not a defect.
  - **S16 matters most of the three.** In `.page`, `document.querySelector` and
    `webkitEnterFullscreen` would resolve through YouTube's own (patchable) prototypes. That is harmless
    for fullscreen, but it is the reason the world exists.

### 3. A recorded frame is not rechecked when the shell acts on it; the entry outlives the document it was recorded for

- Label: `[introduced]`
- Severity: Low
- Where: `ios/Litloft/Bridge/EmbedFrames.swift:51` (store), `:76-88` (use)
- R-0: 3 ("in a YouTube-origin frame whose videoId matches")
- Reproduction (code reading; not reproduced on a device): the origin/URL/videoId check runs once, when
  the frame's document starts. `frames` is never pruned or revalidated. `callAsyncJavaScript(in: frame, …)`
  targets the frame, not the document, so if that frame later navigates, the old entry now points at
  whatever it shows. That could be another `/embed/<id>` (which is then *also* recorded under the new id), or a
  non-YouTube origin. The script then runs there, and `webkitEnterFullscreen` targets the first
  `<video>` of a document whose videoId, or even origin, no longer matches. Main-frame navigations do not
  clear the map either. Stale entries for destroyed frames fail inside `callAsyncJavaScript` and are
  logged, which is consistent with invariant 7.
- Suggestion: Pass the expected videoId as an `arguments` value, never interpolated. Have the script check
  `location.origin` / `location.pathname` before it acts. An alternative is to drop the entry when a
  different document announces itself in the same frame.

### 4. `isVideoId`'s character set and upper length bound are not held; the negative cases fail on length first

- Label: `[introduced]`
- Severity: Low
- Where: `ios/Litloft/Bridge/EmbedFrames.swift:70-72`; tests at
  `ios/LitloftTests/EmbedFramesTests.swift:37` and `:77-79`
- R-0: 3 (input validation on `embed.fullscreen`)
- Reproduction: S8, S9 and S10 all pass. The case that looks like it covers the character set,
  `…/embed/dQw4w9WgX%3C`, decodes to `dQw4w9WgX<`, which is 10 characters, so the length check rejects it.
  The injection body `dQw4w9WgXcQ"); alert(1); ("` is rejected for length too. No negative case is 11
  characters long.
- Security assessment: **script injection into `callAsyncJavaScript` is cleared.** The videoId never
  reaches a script: `arguments` is `[:]`, and the script is a static string. The videoId is used only as
  a dictionary key and a log value. So the gap has no exploit today. It becomes one the moment someone
  interpolates the id into the script, and this validation would then be the only guard. It
  is only held for length.
- Suggestion: Add an 11-character case with a bad character on both the `route` and the `videoId` sides,
  for example `dQw4w9WgX"<`, and a 12-character valid-alphabet case.

### 5. The path-segment check `embed` is not held

- Label: `[introduced]`
- Severity: Low
- Where: `ios/Litloft/Bridge/EmbedFrames.swift:65`
- R-0: 3
- Reproduction: S7 passes. With the check removed, any 3-segment YouTube path would be recorded, for example
  `/v/<id>` or `/shorts/<id>`. The only negative cases fail on segment count (`/watch`, `/embed/x/extra`).
  The recorded frame is still YouTube's, so the impact is small.
- Suggestion: Add a 3-segment non-`embed` case, such as `https://www.youtube.com/shorts/dQw4w9WgXcQ`.

### 6. The addon test cannot tell the page's videoId from the contract sample's

- Label: `[introduced]`
- Severity: Low
- Where: `addons/media_import/frontend/players/YouTubeEmbed.tsx:515`; test
  `addons/media_import/frontend/players/__tests__/YouTubeEmbedPlayer.test.tsx` ("asks the shell to open this video in the iOS player")
- R-0: 3 ("whose videoId matches"). A wrong id makes the shell act on another recorded embed's frame.
- Reproduction: F8 (hard-code `"dQw4w9WgXcQ"`) passes. The mounted player's URL uses the same id as the
  shared contract sample, so the assertion cannot detect a wrong or stale id.
- Suggestion: Mount the player with a second, distinct id in this test.

### 7. Invariant 4 has no test and cannot have one in this harness

- Label: `[introduced]` (a new invariant for a new path)
- Severity: Info. This needs the R-5 device run.
- Where: the whole path; nothing in the diff observes the return from system fullscreen
- R-0: 4
- Observation: no test covers position, play/pause, or watch-history saving after `webkitEnterFullscreen` returns.
  The code gives some reason to expect it holds: `playsinline: 1` stays set in Litloft-controls mode,
  `allowsInlineMediaPlayback = true` (`ios/Litloft/Web/WebView.swift:9`), and the controller reads
  state from the IFrame API, which follows the same `<video>`. The same button is also offered in
  YouTube-UI mode, where `playsinline` is absent. Both modes need the device check.

## Other checks (cleared, not counted as findings)

- **Input validation on `embed.fullscreen`:** type must be a String, and it must pass `isVideoId`. `route` rejects a
  missing, empty or non-string id, or one of the wrong length (S11 killed). The gaps are in finding 4.
- **Anything in the frame beyond fullscreen:** the injected user script only posts `null`. The
  evaluated script only queries the first `<video>` and calls `webkitEnterFullscreen`. Neither
  exposes shell state to the frame. The user script runs in every frame of every origin (S13 killed
  means it must), and each run costs one ignored message. What is unheld is finding 1.
- **Frame bookkeeping:** `frames` grows by one entry per distinct embed loaded in the session and is
  never cleared. This is bounded by use and not a user-visible issue.
- **Invariants 1 and 2 (frontend):** held. F1 (outside the shell), F2/F3/F11 (version gate), F5
  (older shell keeps playback), F6/F7 (button gate) are all killed.

## Is anything missing from the R-0 list? (round 1 only)

- Invariant 3 does not say *when* the videoId must match. As worded, a check made at frame load passes
  it, which is finding 3. Suggest: "…whose origin and videoId match **at the moment the shell acts**."
- There is no invariant saying the shell never evaluates text supplied by the page (the videoId or any other body
  field) as script in any frame. Today this holds only by construction (finding 4).

TOTAL: 7 findings
