# Triage: r3

## Warnings

- R-5 ran at a77219f2d71f2212d7a2b211ccfa37f45d281d75, and these files changed since: docs/addons/intelligence.md, docs/reference/configuration.md, docs/user-guide/search.md; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: Most of the commits since r2 are unrelated: the image-OCR spec, its docs, the search excerpt for pictures and the gitlink bumps, plus ingest-progress merged from develop. The fixes for this feature are a77219f2d and the addon gitlink bump. They take out a branch r2 had flagged: releaseAskEntry, with its split between streaming and settled entries on tab unmount. In its place they add one page-level signal, litloft:file-page-closed. The invariant revision I11 (r1) states the same lifetime. No round adds again a branch, a state or a prediction that an earlier round added. The round removes one mechanism and replaces it with a simpler lifetime rule rather than patching on top of it. ASK-3 and ASK-4 were left unchanged.

Earlier runs:
- r2 / claude-read: The commits since r1 are not fixes to the r1 findings: those were three touch-point-list findings in bucket B, and no commit edits the list. The commits are the merge of the core PR (#506, the inspector-tabs slot, documentController and lowerInspector, as reviewed in r1), an unrelated ingest-progress feature (its spec, tests, the core endpoint, the drawer, and merges from develop) and this commit's addon gitlink bump. No round re-adds a branch, a state or a prediction that an earlier round added, and none removes one. The design of this feature is not being patched round over round.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 1
C: 0

### claude-read:R3-1 — bucket B, LOW, open

Claim: Every time the Ask tab remounts (reopening the mobile sheet from its bar, or crossing the breakpoint), it reports itself unavailable and fetches availability again. While that fetch runs, the tab holding the kept question and answer is unlisted, and it stays unlisted if the fetch fails.
Impact: On a phone, a user asks a question, lowers the sheet and reopens it. The Ask button disappears, then comes back once the fetch returns. If that fetch fails (a transient proxy error or a brief network drop), the answer kept in the store cannot be reached until the file is reopened, and the answer that file has is gone at that point.
Evidence: addons/intelligence/frontend/AskTab.tsx: a layout effect keyed on [fileId, drive] calls `availabilityRef.current?.(false)` on every mount, and an effect then refetches. MobileInspectorSheet mounts its children only while expanded (r2 verifier: MobileInspectorSheet.tsx:206-219), so every reopen remounts the tab. inspector/tabs.ts:80 lists an inspector-tabs entry only when `available === true`, and InspectorShell.tsx:42-61 drops a selection whose tab is unlisted. Separately, InspectorShell.tsx:43-44 initialises a remounted shell to the first listed tab, so the Ask tab is never the one shown on reopen.
Repro: not_reproduced. By reading: in AskTab.test.tsx, ask and settle an answer, unmount, set `net.availability = () => Promise.reject(new TypeError())`, and re-render. `onAvailability` is last called with false, so the host would unlist the tab even though `getAskEntry` still holds the answer.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Skip the reset to false and the refetch when the store already holds a known availability for this fileId and drive, for example by caching the last availability per file next to the ask entry and dropping it on file-page-closed.

</details>

## Not verified

- claude-read: I did not run any vitest or pytest suite.
- claude-read: I did not verify that an aborted browser fetch makes the core proxy cancel its upstream stream, which is what actually frees the addon's semaphore slot (pre-existing /ask path).
- claude-read: I did not check whether next.config enables reactStrictMode.
- claude-read: I did not read the truncated tail of the fix diffs past 200,000 bytes.
- claude-verify: I did not run the app or any tests. The flicker and the stuck-unlisted state on a failed refetch were traced statically, not observed in a browser.
- claude-verify: I did not check whether the desktop InspectorPane also unmounts when the pane is closed and reopened (inspectorOpenOnDesktop), which would cause the same remount on desktop.
- claude-verify: I did not check the timing of the vaul Drawer portal's mount relative to the layout effects.

TOTAL: 1 findings
