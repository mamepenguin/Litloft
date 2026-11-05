# Triage: r4

## Trajectory

This run:
- claude-read: The design is being simplified. r2 added the `acceptUpload` flag to UploadZone and r3 added an `enabled` flag, both to make the zone pretend to be absent on the search page. This round removes both flags and every image-query branch from UploadZone, restoring the original file. It moves the one-image behaviour into a separate component that renders nothing until a one-image drag. That deletes the earlier states (three zone modes, a drag-class state, a wrapper div) and adds one new component with its own depth counter and class variable. The new component does not repeat the flags of the earlier rounds. The one new risk is a document-level listener that does not know about the modal (F1).

Earlier runs:
- r2 / claude-read: The one fix commit since r1 adds a single boolean prop, acceptUpload, with one guard in handleDrop and a changed overlay condition. It removes the r1 defect (upload-class drops and non-file overlays on the search page) and adds no state or prediction. The overlay condition is simpler than r1's, though it picked up the extra `files.length` term. Round one's flaw was a missing guard, and this round supplies it, so I see no patching trend yet.
- r3 / claude-read: The design is being patched. Round r2 added the boolean prop acceptUpload to UploadZone, with a guard in handleDrop, to keep upload-class drops from uploading on the search page. This round (5addec5e1) adds a second boolean prop, enabled, plus a conditional on handlers, an attribute and an effect. All of it keeps one zone component imitating 'no zone' on the search page. The zone now has three independent modes: one-image, upload and inert. Each fix added a branch or a state so the zone could behave like the absent one. This round did remove two branches: FolderBrowser's `if (!onImageQuery) return inner` early return, and GlobalSearch's conditional dropEffect. The net trend is still more flags on UploadZone, not less. The simpler design would be a separate search-page drop target for image drops that leaves UploadZone untouched.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: Document-level drag listeners on the text-query page also see drags aimed at the open search modal when the modal does not stop them (F1).; A drop of a non-image file on the text-query page is now cancelled with preventDefault while image search is available (F2).
- claude-read: Document-level drag listeners on the text-query page also see drags aimed at the open search modal when the modal does not stop them (F1).
- claude-read: A drop of a non-image file on the text-query page is now cancelled with preventDefault while image search is available (F2).

## Findings

A: 0
B: 2
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: ImageQueryDropTarget listens on `document` and ignores whether the search modal is open, so while the modal is scoped or browsing (imageEnabled false, so GlobalSearch registers no drop handler) a one-image drop on the modal still reaches the document listener and starts an image query from the page behind it.
Impact: On the text-query results page with image search available, opening the modal in scoped or browse mode and dropping one image into it navigates to an image query. The spec says a scoped or browsing modal behaves as when image search is unavailable. This is an edge case for a single user, and nothing is uploaded.
Evidence: frontend/src/components/search/ImageQueryDropTarget.tsx: the document-level dragenter/drop listeners have no check for an open modal. GlobalSearch.tsx sets onDrop to undefined when !imageEnabled, so nothing stops the event before it reaches `document`.
Repro: not_reproduced (read only): open /drive/x/search?q=a, open the modal with a scope chip, drag one PNG onto the panel. The document listener classes the drag as one_image and calls onImageQuery.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Have the modal call stopPropagation on drag events whenever it is open, or have the target skip events whose target is inside the modal.

</details>

### claude-read:F2 — bucket B, INFO, open

Claim: The document-level `drop` handler calls preventDefault for any drag carrying files, including an upload-class drop, so a drop of a non-image file on the text-query page while image search is available no longer reaches the browser's default (opening the file) as it did before this change.
Impact: The drop does nothing instead of the browser opening the file in the tab. This matches the settled reading that an upload-class drop does nothing. The behaviour differs between the available and unavailable states.
Evidence: ImageQueryDropTarget.tsx onDrop: `if (!hasFiles(...)) return; event.preventDefault();` runs before the class check.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Addon Python code and its tests.
- claude-read: Whether UploadZone.tsx is byte-identical to origin/develop. I relied on the diff, which shows only reverts.
- claude-read: Nothing was run. This is a read of the diff only.
- claude-read: Real-browser behaviour of dataTransfer.types and files in dragleave events.
- claude-read: Interaction with other document-level drag listeners elsewhere in the app.
- claude-verify: I ran no code and no tests.
- claude-verify: I did not read the addon (backend) changes.
- claude-verify: I did not check whether the modal's z-index or overlay would block pointer events from the page in a real browser.
- claude-verify: I did not read the ImageQueryDropTarget tests.

TOTAL: 2 findings
