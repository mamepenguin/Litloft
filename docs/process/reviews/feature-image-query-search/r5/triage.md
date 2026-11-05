# Triage: r5

## Trajectory

This run:
- claude-read: The earlier rounds each added a flag to UploadZone: acceptUpload in r2, and enabled plus conditional handlers, an attribute and an effect in r3. Each flag made the zone imitate 'no zone' on the search page. This round removes all of those flags and returns UploadZone to its original form. It adds one separate component with no wrapper and no state beyond the overlay. That is the simpler design the r3 reviewer suggested. The new component adds one drag class variable and one depth counter, which is the same drag logic that the zone used to hold, now moved. I do not see a patching trend in this round. The only new branches are the guards in the component itself. The cost is the F2 interaction with the modal, caused by document-level listeners.

Earlier runs:
- r2 / claude-read: The one fix commit since r1 adds a single boolean prop, acceptUpload, with one guard in handleDrop and a changed overlay condition. It removes the r1 defect (upload-class drops and non-file overlays on the search page) and adds no state or prediction. The overlay condition is simpler than r1's, though it picked up the extra `files.length` term. Round one's flaw was a missing guard, and this round supplies it, so I see no patching trend yet.
- r3 / claude-read: The design is being patched. Round r2 added the boolean prop acceptUpload to UploadZone, with a guard in handleDrop, to keep upload-class drops from uploading on the search page. This round (5addec5e1) adds a second boolean prop, enabled, plus a conditional on handlers, an attribute and an effect. All of it keeps one zone component imitating 'no zone' on the search page. The zone now has three independent modes: one-image, upload and inert. Each fix added a branch or a state so the zone could behave like the absent one. This round did remove two branches: FolderBrowser's `if (!onImageQuery) return inner` early return, and GlobalSearch's conditional dropEffect. The net trend is still more flags on UploadZone, not less. The simpler design would be a separate search-page drop target for image drops that leaves UploadZone untouched.

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:F3 is bucket A or BLOCKER

## Needs a human

### unspecified_behavior

Note: With image search available, the text page now calls preventDefault on every file drop. Before this change the browser's default would run (opening the file).
- claude-read: With image search available, the text page now calls preventDefault on every file drop. Before this change the browser's default would run (opening the file).

## Findings

A: 1
B: 2
C: 0

### claude-read:F3 — bucket A, LOW, open

Claim: The drop target's tests render it on document.body with no page around it, and nothing tests that it attaches no listener and calls no preventDefault when onImageQuery is absent.
Impact: If the guard 'if (!onImageQuery) return' were removed, no test would fail. The result would be that, while image search is unavailable, file drops on the text page would be preventDefault-ed and the browser would no longer open the file, which differs from the old behaviour that I7 says must be unchanged.
Evidence: ImageQueryDropTarget.test.tsx has no case that renders without onImageQuery and checks that a drop is not defaulted. The component guard is at ImageQueryDropTarget.tsx useEffect start.
Repro: Mutation: delete the 'if (!onImageQuery) return' guard. No test is expected to fail.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a test that a drop with no onImageQuery is not defaultPrevented.

</details>

### claude-read:F1 — bucket B, LOW, open

Claim: ImageQueryDropTarget's document-level dragover handler sets dropEffect to copy for every file drag, including those classed upload, so the cursor offers a copy while the drop does nothing.
Impact: On the text-query page, with image search available, dragging a PDF or several files shows a copy cursor and no overlay, then the drop silently does nothing. The page showed nothing before this change.
Evidence: frontend/src/components/search/ImageQueryDropTarget.tsx onDragOver: sets dropEffect = 'copy' without checking the kept class.
Repro: not_reproduced (read only)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Set dropEffect to none when the kept class is upload.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: When the modal is scoped or browsing, imageEnabled is false and the modal registers no drop handlers, so a file dropped on the modal over a text-query page reaches the page's document-level drop target and can start an image query.
Impact: A one-image drop on a scoped modal opened over the text results page navigates to an image query, which the modal is meant not to offer. Navigating also leaves the modal open. Rare.
Evidence: GlobalSearch.tsx handlers are attached only when imageEnabled; ImageQueryDropTarget.tsx listens on document and has no knowledge of the modal.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Have the drop target ignore events whose target is inside the modal, or always swallow drops in the modal.

</details>

## Not verified

- claude-read: Addon Python code, which this commit does not change.
- claude-read: Nothing was run; I read the diff and ran one grep of the usages.
- claude-read: Real-browser drag behaviour, including the files list at dragenter.
- claude-read: The full current UploadZone.tsx and FolderBrowser.tsx against origin/develop; I trusted that the diff reverts them.
- claude-verify: I did not run any tests or a browser; every conclusion comes from reading the code.
- claude-verify: I did not check the addon (Python) side.
- claude-verify: I did not check the rest of the invariants I1-I13 beyond these three findings.

TOTAL: 3 findings
