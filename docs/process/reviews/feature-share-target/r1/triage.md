# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: `CookieStoreObserverRegistry` is a process-global singleton keyed by ObjectIdentifier; it is not in the spec.; `ShareSendQueue` treats a `.networkConnectionLost` on `/complete` as an unanswered request and polls, but treats `.notConnectedToInternet` as unreachable and stops. In the latter case the item is marked failed although the server may have received `/complete`.
- claude-read: `CookieStoreObserverRegistry` is a process-global singleton keyed by ObjectIdentifier; it is not in the spec.
- claude-read: `ShareSendQueue` treats a `.networkConnectionLost` on `/complete` as an unanswered request and polls, but treats `.notConnectedToInternet` as unreachable and stops. In the latter case the item is marked failed although the server may have received `/complete`.
- claude-verify: ServerAddress.swift moved into Share/ and compiled into the extension.
- claude-verify: LITLOFT_KEYCHAIN_GROUP, keychain-access-groups and LITLOFTAppGroup/LITLOFTKeychainGroup Info.plist keys, none of them in the touch points.
- claude-verify: NSLocalNetworkUsageDescription for the app is set through INFOPLIST_KEY build settings instead of Litloft-Info.plist.
- claude-verify: inboxPage.test.tsx was edited without being a listed touch point.

### unspecified_behavior

Note: ServerAddress.swift moved into Share/ and compiled into the extension.; LITLOFT_KEYCHAIN_GROUP, keychain-access-groups and LITLOFTAppGroup/LITLOFTKeychainGroup Info.plist keys, none of them in the touch points.; NSLocalNetworkUsageDescription for the app is set through INFOPLIST_KEY build settings instead of Litloft-Info.plist.; inboxPage.test.tsx was edited without being a listed touch point.
- claude-read: `CookieStoreObserverRegistry` is a process-global singleton keyed by ObjectIdentifier; it is not in the spec.
- claude-read: `ShareSendQueue` treats a `.networkConnectionLost` on `/complete` as an unanswered request and polls, but treats `.notConnectedToInternet` as unreachable and stops. In the latter case the item is marked failed although the server may have received `/complete`.
- claude-verify: ServerAddress.swift moved into Share/ and compiled into the extension.
- claude-verify: LITLOFT_KEYCHAIN_GROUP, keychain-access-groups and LITLOFTAppGroup/LITLOFTKeychainGroup Info.plist keys, none of them in the touch points.
- claude-verify: NSLocalNetworkUsageDescription for the app is set through INFOPLIST_KEY build settings instead of Litloft-Info.plist.
- claude-verify: inboxPage.test.tsx was edited without being a listed touch point.

## Findings

A: 0
B: 3
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: The `ServerAddress` enum was moved out of `ios/Litloft/Settings/ServerSettings.swift` into a new file `ios/Litloft/Share/ServerAddress.swift`, and that file is compiled into the extension target. Neither the move nor the new file is in the touch-point list.
Impact: Every caller of `ServerAddress.parse` now depends on a file shared with the extension, and a change to it affects the app's address validation and the extension's read of `share.server`. A reader of the touch-point list would not expect to look there.
Evidence: The diff deletes about 40 lines of `enum ServerAddress` from ServerSettings.swift. It adds Litloft/Share/ServerAddress.swift with the same body. pbxproj adds ServerAddress.swift (AA...56/57) to the LitloftShare Sources phase. The touch points name only SharedSession, the destination resolver, the folder validator and the filename port under `Share/`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F2 — bucket B, LOW, open

Claim: The change reaches build-configuration surfaces that the touch points do not list: a new `LITLOFT_KEYCHAIN_GROUP` xcconfig variable, `keychain-access-groups` in both entitlements files, and custom Info.plist keys `LITLOFTAppGroup` and `LITLOFTKeychainGroup` in both the app and the extension. The listed `NSLocalNetworkUsageDescription` is not added to `Litloft-Info.plist`.
Impact: The keychain access group and the App Group lookup now depend on Info.plist values expanded at build time. A build without a team falls back silently to the bare group (`configured` returns nil), so the mirror and the extension could use different keychain scopes. The app has no local-network usage string, though the spec lists one.
Evidence: Shared.xcconfig adds LITLOFT_KEYCHAIN_GROUP. Litloft.entitlements and LitloftShare.entitlements add keychain-access-groups. The Litloft-Info.plist diff adds only LITLOFTAppGroup and LITLOFTKeychainGroup, and has no NSLocalNetworkUsageDescription. LitloftShare/Info.plist has it.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F3 — bucket B, INFO, open

Claim: The frontend test `frontend/src/__tests__/inboxPage.test.tsx` was edited (a Shared label test and a ja.json key check) but is not in the touch-point list. Only `quickNoteFilename` tests and the fixture are listed for the frontend.
Impact: This is test-only, with no runtime effect. The touch-point list undercounts the files a reviewer must read.
Evidence: The diff adds `SPEC-CORE-033 labels a shared arrival Shared` and a ja key assertion, and imports `@/messages-core/ja.json` in inboxPage.test.tsx.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: The diff was cut at 200000 bytes, so I did not read the rest of ShareSheetView.swift, ShareViewController.swift, ShareStrings.swift or the iOS tests. Further unplanned files may exist there.
- claude-read: I did not check that the pbxproj compiles. I did not check the LitloftTests target membership (the diff shows odd PBXBuildFile entries) or the Xcode synchronized-group behaviour.
- claude-read: I did not run any tests or the app.
- claude-verify: Invariants I3-I10 behaviour in the extension code
- claude-verify: Whether ServerAddress.swift is in the app target's Sources phase as well (only the compile entry at pbxproj:321 was seen)
- claude-verify: The full diff
- claude-verify: Backend changes and tests
- claude-verify: Keychain behaviour on a real device

TOTAL: 3 findings
