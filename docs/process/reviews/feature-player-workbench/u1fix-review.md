# Review: intelligence 81bb56b (diff 958ddf6..81bb56b), fix of review-u1 findings 1, 5, 6

Threat model: personal tool, single user. Only what goes wrong in normal use.

## Answers to the brief

- **Finding 1 fixed in every path.** Measured with a scratch host built the same way as core's `useSlotAvailability`
  (reset on file change, `active = on && reported !== false`, stable reporter) rendering the real `ScenesSection` at 81bb56b
  (scratchpad/rt3/new/probe.rt.test.tsx):
  - native off at mount: 1 clip-timestamps, 0 visual-index, ends `true`; file change: +1 clip-timestamps, ends `true`.
  - .loft off/on at mount and across a file change: 1 clip-timestamps per file, 0 visual-index, ends `true`.
  - native on at mount: ends `true`; on across a file change: ends `true` (see finding 1 below for the request count).
  - unmount before the response: only `false` is reported (the layout cleanup bumps the generation).
  - rapid f1 -> f2 -> f3 with responses resolved newest-first (f3 empty, f1/f2 with rows): no `true` for f1/f2 is applied; ends `false` for f3.
  - mount request fails while the activation's request is dropped: ends `false`. This is the spec's "request fails: stays false" case, not a defect.
- **Finding 5 fixed** for `fetchData` (file-change effect and WS reload both capture the generation). `pollUntilDone` already had a token. `fetchCitations` remains unguarded (finding 2).
- **New tests fail on the pre-fix code.** 958ddf6's `frontend/` copied to scratchpad/rt3/old with the two 81bb56b test files: 5 failures (all 4 new Scenes host cases and the new detailed-summary case), 18 pass. At 81bb56b all 14 Scenes/DetailedSummary files pass (288 tests). The test `Host` matches `useSlotAvailability` (frontend/src/components/FileDetail/hooks/useSlotAvailability.ts:28-60) and `panels.tsx:161-180`, so it exercises the production loop.
- **No new props:** native with neither `active` nor `onAvailability` still returns before the request (Container:198, unchanged). A non-panel `.loft` now applies its mount response even if the reader expanded before it arrived; before, `expand()` bumped `requestGeneration` and dropped it. That is an improvement, not a regression. Detailed summary without the new props: the generation only adds a drop on file change.

## Findings

### 1. Native Scenes that is on at page open (or at a file change) sends 3 clip-timestamps and 2 visual-index, and briefly draws the ruler, then the placeholder, then the ruler again
- Where: frontend/ScenesSection/ScenesSectionContainer.tsx:185-216 (mount request now sent even when `active` is true), :249-253 (activation `loadNative`), :256-267 (active->false bumps `requestGeneration`), :315-321 (visual-index per showing).
- What goes wrong: on the first commit `active` is true, so both the mount request and the first activation's `loadNative` + `getVideoVisualIndex` go out. The layout `false` flips `active` to false, which discards the activation's two responses. The mount response then reports `true`, the host shows the panel again, and a second activation sends clip-timestamps + visual-index again. Measured: native on at mount -> clip 3, visual-index 2; on across a file change -> +3 / +2. The commit that turns the panel back on carries the mount response's rows (`nativeState` "ready", :206-208), so the ruler paints, then the second activation's `loadNative` sets "loading"/`rows=null` (:220-221) and the placeholder replaces it for one round trip, then the ruler returns. (The flicker is by reasoning from effect order; counts are measured.)
- Spec: I10 and 089 I6 read literally are met (one request before first active; clip-timestamps + visual-index per activation, and there are two activations). The first activation is self-induced by the panel's own `false`, so half the requests are thrown away on every open.
- Trigger: open any video with Scenes on (stored list), or press next/previous with it on.
- Frequency 8, impact 1 (extra LAN requests and a sub-second ruler/placeholder/ruler flicker; nothing wrong is shown).
- Direction if wanted: skip the activation `loadNative` when the mount request for this file is still pending, or reuse its rows when it lands after activation.

### 2. Detailed summary still applies a citations response for the previous file
- Where: frontend/DetailedSummarySection.tsx:199-202 (`fetchCitations` sets `citations` with no generation check), called from the file-change effect, the WS citations effect (:249-253) and `pollUntilDone`.
- What goes wrong: if file A's citations GET resolves after the change to file B (and after B's own citations response, or B has none), B's summary carries A's citation list. The fix guarded `fetchData` only; this is the same stale-response pattern in the same component. Availability is not affected.
- Trigger: next/previous quickly while A's citations request is in flight, with responses out of order. Rare on a LAN.
- Frequency 1, impact 3 (citation popovers for B can show A's excerpts or nothing; the summary text and availability are right). Pre-existing, not introduced by this diff.

## Checked, no finding
- `availabilityGeneration` bumps only on `fileId` change and unmount. A re-run of the mount effect for the same file (e.g. `mimeType` arriving late) can leave two in-flight responses that both apply; same file and endpoint, so harmless.
- The native mount response now sets `rows`/`nativeState` while not active (089 I6 "none but the availability answer applied while not active"). The pre-fix off-at-mount path did the same, and the next activation's `loadNative` resets them before use, so nothing stale is drawn.
- Detailed summary `if (!result) return` (:224): the only consumer of the return value besides the file-change effect is `doRegenerate`'s catch, which ignores it.
- The new Container comment (:125-126) is a Why-not; the test `Host` doc is setup, not history. No prose finding.

TOTAL: 2 findings
