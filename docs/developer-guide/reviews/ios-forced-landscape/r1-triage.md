# Round 1 triage

Reviewed at `498139b17`: `r1-code.md` (4 findings) and `r1-security.md` (4 findings). Triaged by the author; the user approved the dispositions.

## Bucket A (test gaps; closed by tests only, `OrientationWiringTests`)

- code F1: removing `@UIApplicationDelegateAdaptor` left every suite green. Now killed by `theApplicationDelegateAnswersFromThePolicy` (mutation run).
- code F2: removing `orientation.onRefused = …` left every suite green. The wiring is `WebShell.connect`; `modelAndControllerAreJoined` kills removal of either line (mutation run).

## Bucket B (findings files only)

- code F3 / security F2, a late refusal of an earlier request can clear a later hold: not fixed. A request token adds a state, the window is narrow and it did not reproduce.
- security F1, a trusted page that never sends `active: false` keeps the app landscape: accepted under the personal-tool premise.
- security F3, `OrientationPolicy` returns `.all` for iPad: the built Info.plist has only `UISupportedInterfaceOrientations~iphone`, so `.all` restates the iPad default. Not run on an iPad.
- code F4, the `channel` guard in `ShellVideoPlayer`'s `isLandscape`: its type is `MediaChannel | null`, so dropping `?.` fails `tsc`; no test added.

## Known issue (reachable by a user)

- security F4, a Short at a `youtu.be` address, or a portrait `/watch` video, is turned sideways. Added to `known-issues.md`.

## For the device check (R-5)

- A portrait video recorded on an iPhone carries a rotation transform. Whether `presentationSize` is reported rotated is unmeasured (the only fixture is a 64×36 landscape file).
- Removing the `rotationSettled` clause from the layout guard survived the simulator integration test in one run and was killed in the reviewer's. The predicate is held by its own unit test; whether the clause is needed on a device is unmeasured.
