# Triage: r2

## Trajectory

This run:
- claude-read: The one fix commit since r1 adds a single boolean prop, acceptUpload, with one guard in handleDrop and a changed overlay condition. It removes the r1 defect (upload-class drops and non-file overlays on the search page) and adds no state or prediction. The overlay condition is simpler than r1's, though it picked up the extra `files.length` term. Round one's flaw was a missing guard, and this round supplies it, so I see no patching trend yet.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-verify:V1 is bucket A or BLOCKER

## Needs a human

### unspecified_behavior

Note: Upload behaviour on the text-query page depends on whether image search is available for the drive.; UploadZone's hasFiles check now also accepts files.length > 0.
- claude-verify: Upload behaviour on the text-query page depends on whether image search is available for the drive.
- claude-verify: UploadZone's hasFiles check now also accepts files.length > 0.

## Findings

A: 1
B: 2
C: 0

### claude-verify:V1 — bucket A, HIGH, open

Claim: On the text-query results page (isSearch true) with image search available, FolderBrowser wraps the page in UploadZone with acceptUpload={false}, so a drag classed 'upload' no longer uploads. This contradicts I8 ('uploads exactly as before this change on the text-query page') and the spec's confirmed item that every other drop still uploads.
Impact: A drop of non-image files, several files or a folder on the text-query page does nothing while image search is available. Uploads still work while it is unavailable, because inner is returned without a zone. The behaviour differs by availability state, and the overlay (isDragging) is also suppressed for upload-class drags.
Evidence: frontend/src/components/FolderBrowser.tsx:88 (isSearch = non-blank searchQuery, i.e. the text-query page) and :903-915 (isSearch with onImageQuery renders UploadZone acceptUpload={false}); frontend/src/components/UploadZone.tsx:109 (`if (!acceptUpload) return;`) and :64-69 (overlay shown only for one_image or acceptUpload). docs/specs/image-query-search.md:793-795 and I8 say the upload still happens.
Repro: Read the code path: with onImageQuery set and a text query, drop a PDF. classifyDrag gives upload, dropped !== 'one_image', acceptUpload is false, and handleDrop returns before addFiles.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Pass acceptUpload (default true) on the text-query page. Pass false only on the image query view, if that view uses this wrapper.

</details>

### claude-read:F1 — bucket B, LOW, open

Claim: UploadZone.handleDragEnter's overlay condition now also accepts `dataTransfer.files.length > 0`, which the original `types.includes("Files")` check did not, and this applies to folder pages as well as the search page.
Impact: Browsers normally report an empty `files` list at dragenter, so in practice the added term is a no-op, but it is an unrequested change to the existing upload overlay path that I8 says must not change.
Evidence: frontend/src/components/UploadZone.tsx:62-67: `hasFiles = types.includes("Files") || files.length > 0`; with acceptUpload defaulting to true and no onImageQuery, this differs from the pre-change condition. No test covers the folder-page overlay with this input.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Use `e.dataTransfer.types.includes("Files")` alone.

</details>

### claude-read:F2 — bucket B, INFO, open

Claim: Spec prose (step 0 and step 2: 'every drop on the results page goes to the upload zone as today', 'uploads exactly as before') still describes uploads on the text-query page, while the code now does nothing for an upload-class drop there.
Impact: A reader of the spec could change the code back to uploading from the search page.
Evidence: docs/specs/image-query-search.md step 0 and I8 text versus FolderBrowser.tsx:903-915 with acceptUpload={false} and UploadZone.tsx:109.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the 'uploads as today' claim for the text-query page from the spec.

</details>

## Not verified

- claude-read: Addon Python code, which this commit does not touch.
- claude-read: Nothing was run; findings come from reading UploadZone.tsx, FolderBrowser.tsx, useFilePicker.tsx and FolderToolbar.tsx.
- claude-read: Real-browser values of dataTransfer.files at dragenter.
- claude-read: Other callers of UploadZone and dispatchUploadEvent outside the files grepped.
- claude-verify: Addon (Python) code and its tests
- claude-verify: Whether the image query view uses FolderBrowser or another wrapper
- claude-verify: classifyDrag behaviour in imageQuery.ts
- claude-verify: Frontend tests and e2e-layout
- claude-verify: Browser behaviour of dataTransfer.files at dragenter

TOTAL: 3 findings
