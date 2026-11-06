# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:F1 is bucket A or BLOCKER
- open finding claude-read:F2 is bucket A or BLOCKER
- open finding claude-verify:V1 is bucket A or BLOCKER

## Needs a human

### needs_human_record (claude-read:F4)

Question: The diff handed to this review was cut at 200000 bytes, so the addon changes, imageQuery.ts, SearchQueryHeader.tsx, PassageList.tsx, useImageInput.ts, messages and the rest of ImageQueryViewPresenter.tsx could not be checked for out-of-list reach.
Impact: Out-of-list reach in the unseen files, especially the addon side, is not ruled out. The gitlink bump hides the addon diff in any case.
Evidence: Notice 'truncated: this diff was cut at 200000 bytes' in the diff.
Note: This is a statement about the review input, which I cannot see. It is not a statement about the code. The files it lists do exist in the repository. I read only the frontend UploadZone and FolderBrowser code, so I cannot say whether the truncated parts reach outside the touch list.

### unspecified_behavior

Note: The search page gains an UploadZone, and so uploads, while image search is available (F1).; The upload overlay appears for non-file drags when onImageQuery is set (F2).
- claude-read: The search page gains an UploadZone, and so uploads, while image search is available (F1).
- claude-read: The upload overlay appears for non-file drags when onImageQuery is set (F2).
- claude-verify: The upload zone is now active on the text-query page whenever image search is available.
- claude-verify: The drag overlay appears for non-file drags whenever onImageQuery is set.

### unspecified_behavior

Note: The upload zone is now active on the text-query page whenever image search is available.; The drag overlay appears for non-file drags whenever onImageQuery is set.
- claude-read: The search page gains an UploadZone, and so uploads, while image search is available (F1).
- claude-read: The upload overlay appears for non-file drags when onImageQuery is set (F2).
- claude-verify: The upload zone is now active on the text-query page whenever image search is available.
- claude-verify: The drag overlay appears for non-file drags whenever onImageQuery is set.

## Findings

A: 3
B: 2
C: 0

### claude-read:F1 — bucket A, MEDIUM, open

Claim: FolderBrowser now wraps the text-query search page in an UploadZone when onImageQuery is passed, although before this change the search branch returned `inner` with no UploadZone at all, so drags classed 'upload' now upload into the drive root from a page that never accepted uploads.
Impact: While image search is available, dropping a non-image file, several files or a folder on the text-query results page starts an upload into the drive root. Before this change that drop did nothing in the app. The spec's premise that 'every drop on the results page goes to the upload zone as today' does not match the code.
Evidence: frontend/src/components/FolderBrowser.tsx diff: old `if (isSearch) return inner;` became a branch returning `<UploadZone ... onImageQuery={onImageQuery}>{inner}</UploadZone>` when onImageQuery is set. UploadZone.handleDrop falls through to addFiles/addFileEntries for the 'upload' class. UploadZone.imageQuery.test.tsx tests the zone alone and never checks that the search page had no zone before.
Repro: not_reproduced (read only): open /drive/x/search?q=a with image search available and drop a .txt file; the code path reaches addFiles(drive, '', files).
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> For the search branch, either give the zone an 'upload' class that does nothing (preventDefault only), or state in the spec that the search page gains uploads.

</details>

### claude-verify:V1 — bucket A, MEDIUM, open

Claim: The spec (step 2, I8, and the pending item at line 794) assumes the text-query search page already has an UploadZone and that an upload-class drop 'uploads as today'. In the code before this change the search branch returned `inner` with no UploadZone. The change adds one, so the search page gains a new upload-into-drive-root behaviour. This also contradicts the spec's own regression note (lines 484-486), which says the page is unchanged for every drag except a one-image drag.
Impact: With image search available, dropping several files, a folder or a non-image on the text-query page now starts an upload into the drive root. The page never did that before. I8's wording 'uploads exactly as before' is false for that page. The spec's premise is wrong and the human's confirmation of the item at line 794 rested on it.
Evidence: frontend/src/components/FolderBrowser.tsx:903-915: `if (isSearch) { if (!onImageQuery) return inner; return <UploadZone ... onImageQuery={onImageQuery}>`. The `return inner` line shows the earlier no-zone branch. frontend/src/components/UploadZone.tsx:101-142: the upload-class path calls addFiles/addFileEntries. docs/specs/image-query-search.md:107 and :794 assume an existing zone.
Repro: Reading only: with image search available, open /drive/<d>/search?q=x and drop two files. UploadZone classifies the drag as 'upload' and handleDrop reaches addFiles(drive, '', files). Before this change the search page had no drop target for that.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

### claude-read:F2 — bucket A, LOW, open

Claim: UploadZone.handleDragEnter shows the overlay for every drag whenever onImageQuery is set, because the condition `onImageQuery || ... || types.includes('Files')` no longer requires 'Files' in the drag types.
Impact: With image search available, dragging selected text or an internal app item over the page shows the upload overlay, which was not shown before. On the non-search folder pages that also pass onImageQuery, the same applies. This is a behaviour change to an existing path that was meant to stay unchanged.
Evidence: frontend/src/components/UploadZone.tsx diff in handleDragEnter: `if (onImageQuery || dragClassRef.current === 'one_image' || e.dataTransfer.types.includes('Files')) setIsDragging(true)`.
Repro: not_reproduced: drag a text selection over the zone with onImageQuery set; isDragging becomes true.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Keep the `types.includes('Files')` condition and drop `onImageQuery ||`.

</details>

### claude-read:F3 — bucket B, INFO, open

Claim: Files outside the touch-point list are reached: frontend/src/components/search/ImageQueryViewPresenter.tsx (new, about 400 lines), frontend/e2e-layout/spec-viewport.spec.ts (FIXTURES list and count), frontend/src/__tests__/core-search-vocabulary.test.ts (CALLERS table and key count), and frontend/src/__tests__/helpers/imageQuery.ts.
Impact: The Presenter is the Container/Presenter pair the rules require, and the other three are test files. The e2e spec and vocabulary test are existing shared tests whose counts (17 fixtures, 93 keys, per-file caller counts) now couple to this feature. No user-facing risk.
Evidence: Diff headers for the four paths; the touch list names ImageQueryView.tsx, 'frontend tests beside the existing search tests' and an e2e fixture, but not these files.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F4 — bucket B, INFO, open

Claim: The diff handed to this review was cut at 200000 bytes, so the addon changes, imageQuery.ts, SearchQueryHeader.tsx, PassageList.tsx, useImageInput.ts, messages and the rest of ImageQueryViewPresenter.tsx could not be checked for out-of-list reach.
Impact: Out-of-list reach in the unseen files, especially the addon side, is not ruled out. The gitlink bump hides the addon diff in any case.
Evidence: Notice 'truncated: this diff was cut at 200000 bytes' in the diff.
Repro: not_reproduced
Introduced: unverified
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Addon Python changes, the manifest, imageQuery.ts, SearchQueryHeader.tsx, PassageList.tsx, useImageInput.ts and the messages JSON (cut from the diff).
- claude-read: Nothing was run; every finding comes from reading the diff.
- claude-read: The baseline UploadZone behaviour in the repository outside the diff.
- claude-verify: Addon Python code (routes, semaphore, OCR lock, floors).
- claude-verify: Whether the review diff was truncated.
- claude-verify: Frontend tests and e2e-layout measurements.
- claude-verify: Messages and docs.

TOTAL: 5 findings
