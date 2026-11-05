# Triage: r7

## Trajectory

This run:
- claude-read: r2 and r3 added flags to UploadZone (acceptUpload, enabled) so it would imitate an absent zone. r4 removed them and moved the logic into a separate drop target. This round (c9d9900aa) adds one lookup of the frame element and two class checks in the handlers. It removes the document-level listeners and the unconditional preventDefault, which are subtractions of earlier behaviour, and adds a branch. It adds no new state. The remaining defect is a consequence of the move: the overlay is now outside the element that listens (F1). I see this round as converging and not as patching, though it needs a real-browser check.

Earlier runs:
- r2 / claude-read: The one fix commit since r1 adds a single boolean prop, acceptUpload, with one guard in handleDrop and a changed overlay condition. It removes the r1 defect (upload-class drops and non-file overlays on the search page) and adds no state or prediction. The overlay condition is simpler than r1's, though it picked up the extra `files.length` term. Round one's flaw was a missing guard, and this round supplies it, so I see no patching trend yet.
- r3 / claude-read: The design is being patched. Round r2 added the boolean prop acceptUpload to UploadZone, with a guard in handleDrop, to keep upload-class drops from uploading on the search page. This round (5addec5e1) adds a second boolean prop, enabled, plus a conditional on handlers, an attribute and an effect. All of it keeps one zone component imitating 'no zone' on the search page. The zone now has three independent modes: one-image, upload and inert. Each fix added a branch or a state so the zone could behave like the absent one. This round did remove two branches: FolderBrowser's `if (!onImageQuery) return inner` early return, and GlobalSearch's conditional dropEffect. The net trend is still more flags on UploadZone, not less. The simpler design would be a separate search-page drop target for image drops that leaves UploadZone untouched.
- r5 / claude-read: The earlier rounds each added a flag to UploadZone: acceptUpload in r2, and enabled plus conditional handlers, an attribute and an effect in r3. Each flag made the zone imitate 'no zone' on the search page. This round removes all of those flags and returns UploadZone to its original form. It adds one separate component with no wrapper and no state beyond the overlay. That is the simpler design the r3 reviewer suggested. The new component adds one drag class variable and one depth counter, which is the same drag logic that the zone used to hold, now moved. I do not see a patching trend in this round. The only new branches are the guards in the component itself. The cost is the F2 interaction with the modal, caused by document-level listeners.

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:F1 is bucket A or BLOCKER
- open finding claude-read:F2 is bucket A or BLOCKER

## Findings

A: 2
B: 1
C: 0

### claude-read:F1 — bucket A, MEDIUM, open

Claim: After the move from document to the [data-page-frame] element, the drop overlay is portalled to document.body without pointer-events-none, so it sits outside the frame that holds the listeners and intercepts the drag it was meant to accept.
Impact: On the text-query page, a one-image drag shows the overlay. The pointer then lies over the overlay, which is not inside the frame. The frame gets dragleave, depth drops to 0, reset() removes the overlay, and dragenter fires again, so the overlay flickers. A drop onto the overlay targets a body-level node and never reaches the frame's drop listener, so the image query may not start. The page's main image drop path can therefore fail in a real browser.
Evidence: frontend/src/components/search/ImageQueryDropTarget.tsx:83-86 listeners on frame; :97-109 createPortal to document.body with class 'fixed inset-0 z-50 ...' and no pointer-events-none (the modal overlay in GlobalSearch uses pointer-events-none). Native listeners do not see events from portalled DOM outside the frame. The jsdom tests dispatch on the frame element itself (ImageQueryDropTarget.test.tsx renderZone), so they cannot see the overlay intercept.
Repro: not_reproduced (read only): in a real browser drag one PNG over /drive/x/search?q=a with image search available; the overlay appears, the pointer is over it, the frame sees dragleave. Mutation: remove the overlay or add pointer-events-none and the real-browser behaviour changes, while no jsdom test would fail.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Add pointer-events-none to the overlay, as the modal's overlay has, and add a real-browser drag test for the text page.

</details>

### claude-read:F2 — bucket A, LOW, open

Claim: The drop target still has no test for the case where onImageQuery is absent, and the new frame lookup 'if (!frame) return' has no test either.
Impact: Removing the 'if (!onImageQuery) return' guard would make file drops on the page preventDefault'ed while image search is unavailable (I7), with no test failing.
Evidence: ImageQueryDropTarget.test.tsx: every case renders with onImageQuery; renderZone(undefined) is never called.
Repro: Mutation: delete the guard at ImageQueryDropTarget.tsx:31; no test fails (the upload-class path no longer calls preventDefault, so the main risk is smaller than in r5, but dragenter of a one-image drag still would).
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a test that with no onImageQuery a one-image drag adds no overlay and is not defaultPrevented.

</details>

### claude-read:F3 — bucket B, LOW, open

Claim: The effect depends on [onImageQuery], and search/page.tsx passes a new handleImageQuery function on every render, so listeners are removed and re-added and reset() runs on every parent render, including mid-drag.
Impact: A re-render of the page during a drag (for example the preparing or error state) clears the kept class and overlay; the next dragenter reclassifies. Minor.
Evidence: page.tsx: onImageQuery={availability === 'available' ? handleImageQuery : undefined}, with handleImageQuery defined inline; ImageQueryDropTarget.tsx:94 dependency array.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Hold the callback in a ref and key the effect on its presence only.

</details>

## Not verified

- claude-read: Addon Python code; not touched by this commit.
- claude-read: Nothing was run; real-browser drag event targeting for the overlay was reasoned from the DOM structure, not observed.
- claude-read: Whether PageFrame wraps the whole search-page content so the frame covers every area users drop on.
- claude-read: The rest of the 200000-byte-truncated diff.
- claude-verify: Real browser drag-event ordering. I reasoned from the DOM spec and did not run it.
- claude-verify: The e2e-layout fixtures.
- claude-verify: The addon (backend) side of the commit.
- claude-verify: Whether FolderBrowser.tsx:908 renders the frame/data-page-frame as expected.

TOTAL: 3 findings
