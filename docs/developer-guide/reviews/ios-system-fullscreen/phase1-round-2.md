# Phase 1, round 2 review — iOS system fullscreen for `.loft`

- Core tree: `75874310`. The fix commit is `e18f88b8`. Addon `addons/media_import`: `232ce61`, which is the fix commit.
- Round 1: `phase1-round-1.md`, which reviewed core `4785a8f2` and addon `9f7117a`.
- Spec: `docs/superpowers/specs/2026-09-19-ios-system-fullscreen.md`. R-0 invariants 1, 2, 3, 4 and 7 are in scope.
- Swift tests ran on simulator `BE039A5E-…` (iPhone 17 Pro Max) with a scratch derived-data path. The booted
  simulator `4AB8B4E9-…` was not touched, and no docker command was run.
- Baseline: Swift `EmbedFramesPageTests`, `EmbedFramesTests` and `ContractTests` passed twice (once at the start and
  once mid-way). The frontend `YouTubeEmbedPlayer.test.tsx` passed (41 tests).
- Before each run, the mutation was confirmed applied (`git diff --stat` showed one changed file, and the changed
  line was printed). The file was restored with `git checkout` after each run.
- Everything touched in `e18f88b8` / `232ce61` is new on this branch, so every finding is `[introduced]`.

## Did each fix do what it claims?

| claim | verdict | evidence |
|---|---|---|
| The address is checked when the shell acts, from values passed as `callAsyncJavaScript` arguments | **Yes, for the path.** The host and protocol legs are present but not held | M1, M2, M5 killed. M3, M4 live (finding 1) |
| `ShellBridge` takes an injectable `EmbedFrames(provider:)` | Yes. The production default is not held | M16 killed. M23 live (finding 5) |
| Page test: request → frame fullscreen | Yes | M12, M14, M15, M16, M22 killed. The asserted event (`webkitbeginfullscreen`) comes only from the shell's script |
| Page test: stale-frame refusal | Yes, for a frame that moved to another **path** on the same host | M1 and M2 were killed. The whole test failed in about 2 s, so the stale fullscreen landed inside the 2 s negative window, not at its edge. The stale `WKFrameInfo` really does reach the navigated document |
| Page test: handler out of reach | Yes, for the frame's and the page's `.page` world | M10 killed (all three page tests), M11 killed |
| New unit cases: video-id shape and the `/embed/` segment | Yes | M17, M18, M19, M20 killed (round 1's S7–S10 are now all killed) |
| The addon test uses a video id different from the shared sample's | Yes | F8 (hard-code `"dQw4w9WgXcQ"`) killed |

## Security checks (cleared, not counted)

- **Can a page or a frame get text evaluated as code through the new arguments?** No. `arguments` are
  serialized as values and bound as parameters. `scheme` and `hosts` come from the compiled `Provider`. `path` is
  `"/embed/" + videoId`, where `videoId` has already passed `isVideoId` in `route`
  (`ios/Litloft/Bridge/ShellBridge.swift:90-92`), and it is still a value, not source text. Nothing the frame
  controls is passed in. The script body is a static string.
- **Case.** `location.hostname` is lowercased by the URL parser, and the provider's hosts are lowercase literals.
  The record side lowercases too (`EmbedFrames.swift:78-82`). Consistent.
- **`www` vs bare host.** The record side only records `www.youtube.com` / `www.youtube-nocookie.com`, and the
  act side accepts the same set. A bare `youtube.com` frame is never recorded, so it can never be acted on. The addon's
  `YT.Player` builds `https://www.youtube.com/embed/<id>?…`, so production frames match.
- **Query strings.** These are not part of `location.pathname`, so `?enablejsapi=1&origin=…` does not break the match.
- **Unforgeable reads.** `location.protocol` / `location.pathname` are `[LegacyUnforgeable]`. In the
  `litloft-embeds` world, `Array.prototype.includes`, `document.querySelector` and the element wrappers belong to that world,
  so the frame's document cannot patch them. See finding 2 for what happens when the world is not held.

## Mutation table

`want` was declared before each run. F = frontend, M = Swift.

| id | file | change | want | result |
|---|---|---|---|---|
| M1 | EmbedFrames.swift:121 | act-time address check → `if (false)` | kill | killed (movedFrameIsLeftAlone) |
| M2 | EmbedFrames.swift:121 | drop `location.pathname !== path` | kill | killed (movedFrameIsLeftAlone) |
| M3 | EmbedFrames.swift:121 | drop `!hosts.includes(location.hostname)` | kill | **live** |
| M4 | EmbedFrames.swift:121 | drop `location.protocol !== scheme` | kill | **live** |
| M5 | EmbedFrames.swift:106 | `path` last character forced to `"A"` | kill | killed (movedFrameIsLeftAlone only; pageRequestEntersFullscreen passed because its id is `AAAAAAAAAAA`) |
| M6 | EmbedFrames.swift:106 | `path` = `/embed/` + reversed id | kill | **live** |
| M7 | EmbedFrames.swift:65 | frame stored under the reversed id | kill | **live** |
| M8 | EmbedFrames.swift:65,97 | single slot: store and look up under `"one"` | kill | **live** |
| M9 | EmbedFrames.swift:109 | `callAsyncJavaScript` in `.page` | kill | **live** |
| M10 | EmbedFrames.swift:38 | handler registered in `.page` | kill | killed (all 3 page tests) |
| M11 | EmbedFrames.swift:43 | user script injected into `.page` | kill | killed |
| M12 | EmbedFrames.swift:126 | script drops `video.webkitEnterFullscreen()` | kill | killed |
| M13 | EmbedFrames.swift:126 | script also runs `video.currentTime = 0; video.pause(); location.hash = "x"` | kill | **live** |
| M14 | ShellBridge.swift:64 | `.embedFullscreen` does nothing | kill | killed |
| M15 | ShellBridge.swift:44 | `attach` does not pass the web view to `embeds` | kill | killed |
| M16 | ShellBridge.swift:28 | `self.embeds = EmbedFrames()` (ignores the injected one) | kill | killed |
| M17 | EmbedFrames.swift:85 | drop `parts[1] == "embed"` | kill | killed |
| M18 | EmbedFrames.swift:90 | `count == 11` → `>= 11` | kill | killed |
| M19 | EmbedFrames.swift:90 | drop `isASCII` | kill | killed |
| M20 | EmbedFrames.swift:90 | character-set check → `true` | kill | killed |
| M22 | EmbedFrames.swift:104 | `scheme` argument without the trailing `:` | kill | killed |
| M23 | EmbedFrames.swift:32 | `init` default provider → `Provider(scheme: "https", hosts: [])` | kill | **live** |
| F8 | YouTubeEmbed.tsx:515 | `onOpen` sends a hard-coded `"dQw4w9WgXcQ"` | kill | killed |

(There is no M21. Swift runs that failed showed an `FBSOpenApplicationServiceErrorDomain` launch error on a
simulator clone. The tests then ran, and the same page tests passed on the unmutated tree both times, so the
failures are attributed to the mutations.)

## Findings

### 1. The host and protocol legs of the act-time address check are not held

- Label: `[introduced]`
- Severity: Low
- Where: `ios/Litloft/Bridge/EmbedFrames.swift:121`; test `ios/LitloftTests/EmbedFramesPageTests.swift:120-137`
- R-0: 3 ("in a YouTube-origin frame whose videoId matches")
- Reproduction: M3 (drop the host test) and M4 (drop the protocol test) both leave every test green. The stale-frame
  test navigates the frame from `frames.test/embed/AAAAAAAAAAA` to `frames.test/embed/BBBBBBBBBBB`, which changes
  only the path. A recorded frame that moves to another host or another scheme at the same `/embed/<id>` path is the
  case round 1's finding 3 was about ("or a non-YouTube origin"). With M3 applied, the shell would act on that frame.
- Suggestion: The scheme handler serves every host of its scheme. In the stale test, navigate the frame to
  `embedtest://other.test/embed/AAAAAAAAAAA` and ask for `AAAAAAAAAAA`. Register a second scheme for the protocol leg.

### 2. The world `callAsyncJavaScript` runs in is still not held, and the new check now depends on it

- Label: `[introduced]` (round 1 finding 2, S16, is unchanged)
- Severity: Low
- Where: `ios/Litloft/Bridge/EmbedFrames.swift:109`
- R-0: 3
- Reproduction: M9 (`in: .page`) passes every test. In round 1 the world only protected
  `document.querySelector` / `webkitEnterFullscreen`, which is harmless for fullscreen. Now the address check calls
  `hosts.includes(...)`. In `.page` that call resolves through the frame document's own `Array.prototype`, which
  that document can replace (`Array.prototype.includes = () => true`). So under M9, a frame that navigated to any
  host, served over `https:` at `/embed/<id>`, passes the host leg. The two `location` reads are unforgeable and
  unaffected.
- Suggestion: One test covers this and finding 1 together. The fixture document at `other.test` patches
  `Array.prototype.includes` to return `true`, and the test asserts that no fullscreen follows. It kills M3 and M9.

### 3. The page test's ids are single repeated characters, so the id → frame mapping and the id → path argument are not held

- Label: `[introduced]`
- Severity: Low
- Where: `ios/Litloft/Bridge/EmbedFrames.swift:65`, `:97`, `:106`; test ids `AAAAAAAAAAA` / `BBBBBBBBBBB` at
  `ios/LitloftTests/EmbedFramesPageTests.swift:111-135`
- R-0: 3 (the videoId must match), 7
- Reproduction: M6 (the path argument uses the reversed id), M7 (the frame is stored under the reversed id) and
  M8 (every frame goes in one slot) all pass. M5 is killed only by the second test.
  - For a real id, M6 and M7 make every request do nothing. The feature is dead with the tests green.
  - M8 means that with two embeds on one page, only the last one loaded can go fullscreen.
  - The act-time check keeps invariant 3 intact under all three, so the effect is lost function, not a wrong
    frame acting. This is the same shape as round 1's finding 6 (an id that cannot be told apart), moved to the
    Swift side.
- Suggestion: Use distinct, non-palindromic ids of YouTube's alphabet (for example `M7lc1UVf-VE` and
  `dQw4w9WgXcQ`). Add a case with two embeds on one page, where each id's request reaches its own frame.

### 4. Nothing holds that the frame script does *only* fullscreen

- Label: `[introduced]` (the remainder of round 1 finding 1; the fullscreen path itself is now held)
- Severity: Low
- Where: `ios/Litloft/Bridge/EmbedFrames.swift:120-128`
- R-0: 3 ("the shell does only one thing"), 4 ("does not stop or rewind")
- Reproduction: M13 adds `video.currentTime = 0; video.pause(); location.hash = "x";` before
  `webkitEnterFullscreen()`, and every test passes. The fixture video is at time 0 and paused, so a rewind or a
  pause cannot be observed.
- Suggestion: In the fixture, play the video (it is muted and inline, so autoplay is allowed) or seek it to a
  non-zero time before the request. Have the fixture report `currentTime`, `paused` and `location.href` after
  `webkitbeginfullscreen`, and assert that they are unchanged.

### 5. The production provider is reached only through a default argument that no test exercises

- Label: `[introduced]` (the injection seam is new in `e18f88b8`)
- Severity: Low
- Where: `ios/Litloft/Bridge/EmbedFrames.swift:32` (`init(provider: Provider = .youtube)`),
  `ios/Litloft/Bridge/ShellBridge.swift:26` (`embeds: EmbedFrames = EmbedFrames()`),
  `ios/Litloft/Web/WebView.swift:74` (`ShellBridge(server:)`)
- R-0: none directly. With M23 applied, invariant 7 still holds ("nothing happens"), but the feature is gone in
  the app.
- Reproduction: M23 changes `init`'s default to a provider with no hosts, and every test passes. The unit tests
  reach `.youtube` only through the static `videoId(…, provider: = .youtube)` default. That is a second default,
  independent of the instance's. The page test always injects its own provider. So the value production uses
  when it records a frame and checks its address is held by nothing but the R-5 device run.
- Suggestion: Either drop the instance default and make `WebView.swift` pass `.youtube` explicitly, or add a unit
  assertion on the default `EmbedFrames()`'s provider. Whichever is chosen, keep a single place that names
  `.youtube`.

### 6. Recording and acting parse the address with different parsers, and they disagree on edge paths

- Label: `[introduced]`
- Severity: Info (fails silently; not reachable through `YT.Player`)
- Where: `ios/Litloft/Bridge/EmbedFrames.swift:84-85` (`URL.pathComponents`) vs `:121` (`location.pathname`)
- R-0: 7 holds (nothing happens)
- Reproduction (measured with `URL.pathComponents` on this toolchain): `/embed/dQw4w9WgXcQ/`,
  `/embed/%64Qw4w9WgXcQ` and `//embed//dQw4w9WgXcQ` all give `["/", "embed", "dQw4w9WgXcQ"]`. So each is recorded
  under `dQw4w9WgXcQ`. At act time `location.pathname` is the raw path, which does not equal `"/embed/dQw4w9WgXcQ"`, so
  the script returns `false`. The disagreement always fails toward refusal. It is recorded here because a later
  fix that "reconciles" the two parsers would be the pattern described below.
- Suggestion: none required. See the trajectory answer.

## Trajectory

Round 1's code validated a frame's address once, when it loaded: origin scheme and host, URL scheme and host,
the `/embed/` segment and the id shape, in Swift over `WKFrameInfo`. This round's fix removes none of that. It adds
a **second address predicate of the same kind**: scheme, host set and path, in JavaScript over `location`, evaluated
when the shell acts. It also adds a new seam (`Provider`) with two independent defaults.

So yes, this round adds a prediction of the kind round 1 already had. It is the first fix round, so it is not yet
two rounds in a row. Two things point the same way, though:

- Under the act-time check, the record-time address validation and the id-keyed map no longer carry invariant 3.
  M8 (one slot for every frame) is invisible to every test, and invariant 3 still holds under it. The two
  predicates now overlap, and they already disagree (finding 6).
- The fixes this review suggests for findings 1–4 are test-only. If a round-3 *code* fix adds another address
  predicate, a normalisation step, or more state to keep the two checks in step, that is the second consecutive
  addition, which R-4 defines as a C. The converging alternative would remove one of the two checks, for example
  recording every non-main frame and letting the act-time check alone decide. The supervisor should decide which
  of the two checks is the design.

TOTAL: 6 findings
