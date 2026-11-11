# Triage: r3

## Trajectory

This run:
- claude-read: The design is being patched. Round r2 added the boolean prop acceptUpload to UploadZone, with a guard in handleDrop, to keep upload-class drops from uploading on the search page. This round (5addec5e1) adds a second boolean prop, enabled, plus a conditional on handlers, an attribute and an effect. All of it keeps one zone component imitating 'no zone' on the search page. The zone now has three independent modes: one-image, upload and inert. Each fix added a branch or a state so the zone could behave like the absent one. This round did remove two branches: FolderBrowser's `if (!onImageQuery) return inner` early return, and GlobalSearch's conditional dropEffect. The net trend is still more flags on UploadZone, not less. The simpler design would be a separate search-page drop target for image drops that leaves UploadZone untouched.

Earlier runs:
- r2 / claude-read: The one fix commit since r1 adds a single boolean prop, acceptUpload, with one guard in handleDrop and a changed overlay condition. It removes the r1 defect (upload-class drops and non-file overlays on the search page) and adds no state or prediction. The overlay condition is simpler than r1's, though it picked up the extra `files.length` term. Round one's flaw was a missing guard, and this round supplies it, so I see no patching trend yet.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: The text-query page gains an always-present wrapper div around its content (F2).; The overlay condition gained a files.length term (F1).
- claude-read: The text-query page gains an always-present wrapper div around its content (F2).
- claude-read: The overlay condition gained a files.length term (F1).

## Findings

A: 0
B: 3
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: UploadZone.handleDragEnter still computes hasFiles as types.includes('Files') || files.length > 0, so the overlay condition for every folder page differs textually from the pre-change types-only check (unfixed r2 F1).
Impact: In real browsers files is empty at dragenter and types already holds 'Files' whenever files exist, so the term is almost certainly inert. It is still an unrequested edit to the existing upload overlay path.
Evidence: frontend/src/components/UploadZone.tsx:66-67; no test covers the folder-page overlay with this input.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Use e.dataTransfer.types.includes("Files") alone.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: The text-query results page now always renders an UploadZone wrapper div (`relative flex-1 flex flex-col`) around its content, including while image search is unavailable, whereas before this change it returned the content with no wrapper.
Impact: With image search unavailable, I7 says the text-query page behaves exactly as before. The DOM gains an extra relatively-positioned flex wrapper, which could shift layout or fixed/sticky positioning. I did not find a concrete breakage, and no test compares the unavailable-state DOM with the old one.
Evidence: frontend/src/components/FolderBrowser.tsx:903-915 (the `if (!onImageQuery) return inner` early return was removed in 5addec5e1) and UploadZone.tsx:161-170 (the div is rendered whichever value `enabled` has).
Repro: not_reproduced: render FolderBrowser with searchQuery and no onImageQuery; the output is now wrapped in a div, where before it was not.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Render the wrapper in a way that does not change the DOM shape, or add a layout test of the unavailable state.

</details>

### claude-read:F3 — bucket B, INFO, open

Claim: The in-zone 'enabled' state is not reset when it turns false mid-drag: dragClassRef and dragCounterRef keep their old values, because the handlers are detached rather than cleaned up.
Impact: If availability flips while a drag is over the page, which is very rare because it is resolved once per drive, a later drag could start with a stale class. Single-user use makes this negligible.
Evidence: UploadZone.tsx:158-170 removes the handlers with no reset of the refs; the reset happens only in handleDragLeave and handleDrop.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Addon Python code and its tests, which this commit does not touch.
- claude-read: Nothing was run; the findings come from reading UploadZone.tsx and a grep for data-upload-zone.
- claude-read: The layout impact of the wrapper div (PageFrame's root classes).
- claude-read: The CDP drag fixture in a real browser.
- claude-read: Whether FolderBrowser.tsx has other changes outside the lines read.
- claude-verify: The pre-change source of UploadZone and FolderBrowser, because I cannot run git.
- claude-verify: Backend invariants I1 to I6 and I12.
- claude-verify: The e2e layout tests.
- claude-verify: Runtime behaviour in a browser.

TOTAL: 3 findings
