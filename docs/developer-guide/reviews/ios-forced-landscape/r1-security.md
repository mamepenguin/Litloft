# R1 security / contract review of 498139b17 (read-only; no mutations run)

Note: the working tree was being edited by the other reviewer while I read (useFullscreen.ts in the tree differed from the commit); all citations are against `git show 498139b17:<path>`.

## 1. Input validation at the bridge
ShellBridge.route (ShellBridge.swift:~97) reads `active` and `landscape` through `boolean()`, which accepts only an NSNumber whose CFTypeID is CFBoolean. So 1, 0, "true", NSNull, objects and huge/NaN numbers are all rejected: a bad `active` drops the message (nil), a bad/absent `landscape` becomes false (never locks). No number is read from the page in this change. The page can only toggle a Bool; the lock needs `active && landscape && idiom == .phone`. Result: no type-confusion path. Outbound `videoWidth/videoHeight` come from `presentationSize` (CGSize, finite in practice); a NaN would make JSONEncoder throw and drop the whole media.state (unverified, not realistic) -- not reported.

## 2. Trust boundary
No new message type and no new handler. `page.immersive` still goes through `route` -> `origin.isTrusted(for: server)` (main frame, same scheme/host/port) before any parsing. An embedded YouTube frame, or an off-origin main frame, is dropped before `landscape` is read. The change does not widen the sender set. Off-origin main frame after a committed navigation also clears via didCommit -> setImmersive(false).

## 3. Denial / lock-in
Clear paths of `OrientationPolicy.isLocked`: page `active:false`, or any later `page.immersive` without `landscape` (lock is recomputed on every message, WebViewModel.swift setImmersive); didCommit (WebView.swift:288); WebContent termination (WebView.swift:176); refused geometry update (OrientationController.refused); WebShell teardown (controller `isolated deinit` -> apply(false) when holding; RootView id(serverURL) tears the State down); iPad never locks; already-landscape never sets isLocked. Server change / Lock go through RootView re-identity -> same teardown path. I found no path that leaves isLocked set with no way out except the page itself (finding F2 is a race that clears the wrong hold, the opposite direction; F1 is the unrecoverable-by-user case in the premise). Realistic threat in the personal-tool LAN premise: a compromised/malicious Litloft server page can already hide the status bar, widen the web view and play media (page.immersive existed); holding landscape adds an annoyance (user must kill the app or the page must send active:false), not a data or integrity exposure. The page also owns the whole UI, so it can simply stay full screen. Not exploitable beyond usability; recorded as B.

## 4. Process-wide mutable state
`OrientationPolicy.isLocked` is `@MainActor static var`; AppDelegate's method is `@MainActor` and reads it, so the delegate callback and writes are on the main actor (UIKit calls it on main). `supported(locked:idiom:)` is a pure nonisolated function and is table-tested. Single WindowGroup scene on iPhone; `SceneOrientation` takes `connectedScenes.first` -- arbitrary under multi-scene, but iPad (the only multi-window/Stage Manager idiom) never locks and returns `.all`. `OrientationController` uses `isolated deinit` (needs a recent Swift/OS runtime; unverified whether the deployment target supports it -- the project builds per the author). Discarded WebShell inits (SwiftUI re-evaluating the struct init) create throw-away controllers whose holding is false, so their deinit is a no-op; the retained model keeps its first closure bound to the retained controller. One concern: see F3 (iPad mask widening).

## 5. Information exposure
`videoWidth/videoHeight` are the picture's pixel size sent shell -> its own page; no new logging was added; nothing sensitive. The `landscape` flag is a UI hint. No finding.

## 6. Contract compatibility
- v4 (old) shell receives `landscape:true`: old route read only `active` and ignored extra keys, so it behaves exactly as before (no lock, still answers). OK.
- Old page never sends `landscape`: new shell defaults false; no lock, no delayed answer (rotationSettled is `!locked || ...`). OK.
- New page + old shell: media.state lacks videoWidth; shadow gets `undefined`; `undefined > undefined` is false so `isLandscape()` is false and no key is sent. OK. (TypeScript type says number; runtime undefined is handled by the comparison, not by validation.)
- New shell + old page: extra `videoWidth/videoHeight` fields are ignored by the older apply().
- REQUIRED_SHELL_VERSION (2), SYSTEM_FULLSCREEN (3), IMMERSIVE (4), `contractVersion = 4` untouched; fixture and ContractTests were extended in lockstep (`immersiveLandscape`, size fields; the case list uses `Set(names) == [...]` equality, not `>=`). The page's 1000 ms IMMERSIVE_ANSWER_TIMEOUT_MS bounds the wait if the shell's answer is held for a rotation that never settles. Claim "no bump needed" holds.

## 7. Repo rules
- design-decisions.md: drive boundary untouched; no DB/WatchHistory writes; the `ended` rule not touched.
- Addon rule "No core-to-addon dependencies": the addon (YouTubeEmbed) imports/passes an option to the core hook; core gained a generic `isLandscape` option, no addon name or feature. Direction addon -> core is allowed. Old core + new addon: option ignored.
- comments.md: a few new doc comments in Swift narrate behaviour the code shows (OrientationController "Holds the app landscape while it is asked to...", WebViewModel `refuseLandscape` "The system refused to rotate. The page is still owed its answer..."). They are not wrong and would not lead to a wrong code change; not reported as findings (prose not reviewed for precision).
- tests.md / detector rules: new tests I read (OrientationTests, LandscapeLockTests, ContractTests) use `==`/`toBe`-style equality; no `>=`/`toBeGreaterThan` added in the diff (grep of added lines: none). ContractTests parity reads the shared JSON fixture via the Swift decoder and nativeBridge tests read it in TS: two implementations, OK.

## Findings

### F1 [B] [introduced] A server page can hold the app landscape indefinitely
WebViewModel.swift setImmersive: `setLandscapeLocked(immersive && landscape && idiom == .phone)`. A trusted main-frame page that sends `{type:"page.immersive",active:true,landscape:true}` and never `active:false` keeps `OrientationPolicy.isLocked` true (mask `.landscape`); the user cannot rotate back; only killing the app, an off-page navigation or WebContent termination clears it. Scenario: buggy/compromised server page, or a page bug that leaks a hold. Under the personal-tool LAN premise the page is first-party and already controls the status bar and layout while immersive; usability annoyance only. No code change demanded; mention only so the supervisor can decide if an app-level escape (e.g. foreground reset) is wanted.

### F2 [B] [introduced] Late refusal callback of a previous lock request can drop a newer hold
OrientationController.swift: `scene.request(.landscape) { [weak self] in self?.refused() }` wraps the geometry-update error handler in `Task { @MainActor in onRefused?() }`. `refused()` only checks `guard holding`. Sequence: lock (request 1) -> release -> lock again (request 2, holding true) -> request 1's error handler finally runs -> `refused()` sees holding true and clears the second hold, setting isLocked false and calling model.refuseLandscape() while the system accepted the rotation. Result: landscape set but unlocked; user can rotate back in full screen, and the answer path is released early. Requires a refusal arriving after a re-lock, i.e. the refused case plus fast toggling; low likelihood. Not reproduced (unverified on device); no mutation test covers a stale refusal (FakeScene stores only the latest refusal closure, so the test cannot express it).

### F3 [B] [introduced] The supported-orientation mask for iPad is now an explicit `.all` independent of build settings
OrientationPolicy.swift `supported(...)`: `guard idiom == .phone else { return .all }`. project.pbxproj sets only `INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone` (portrait + both landscapes); there is no iPad key, so what the iPad set was before depends on Xcode's generated plist default (unverified). If the previous effective iPad set excluded portrait-upside-down, the delegate now enables it (the comment in the file states both sets are spelled out; the iPad one is not compared to the plist in any test). The phone set matches the plist (portrait, landscapeLeft, landscapeRight). Behavioural change on iPad only, not a security issue.

### F4 [B] [introduced] YouTube watch URLs are all treated as landscape
addons/media_import d80dc2a `isLandscape: () => !isShortsUrl(url)`. A portrait video on a regular `/watch` URL (rare) is forced landscape; a `youtu.be/<id>` short link to a Short also reports landscape (pathname does not start with `/shorts/`). Effect is a wrong orientation request, recoverable by closing full screen; the author's invariant 2 names only `/shorts/` URLs. Does not break a declared invariant as worded.

TOTAL: 4 findings
