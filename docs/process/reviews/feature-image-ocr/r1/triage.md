# Triage: r1

## Warnings

- R-5 ran at b480c193688f32879ffe6b5f956988800cbdc6fc, and these files changed since: backend/app/main.py, backend/app/routers/addon_proxy.py, backend/app/routers/files_processing.py, backend/app/schemas.py, backend/app/services/addon_registry.py and 6 more; run R-5 again if any of them changes what a user sees

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

Note: A reindex request that mixes `ocr` with valid tasks is refused as a whole with 422, not split per task.; isPicture in core searchCapture.ts matches any `image/*` mime, not just the OCR set. Only text_content rows produce content_matches, so in practice it affects only pictures with OCR rows.; IndexDetailsDialog keeps its own copy of the OCR mime set (OCR_MIME_TYPES), so it can drift from the backend's OCR_IMAGE_TYPES.
- claude-read: A reindex request that mixes `ocr` with valid tasks is refused as a whole with 422, not split per task.
- claude-read: isPicture in core searchCapture.ts matches any `image/*` mime, not just the OCR set. Only text_content rows produce content_matches, so in practice it affects only pictures with OCR rows.
- claude-read: IndexDetailsDialog keeps its own copy of the OCR mime set (OCR_MIME_TYPES), so it can drift from the backend's OCR_IMAGE_TYPES.
- claude-verify: IndexDetailsResponse.image_ocr is a new API field that the touch points do not name.
- claude-verify: reindex_file returns 422 for an ocr task on a non-picture file, which no invariant names (I4 names only mode false).

### unspecified_behavior

Note: IndexDetailsResponse.image_ocr is a new API field that the touch points do not name.; reindex_file returns 422 for an ocr task on a non-picture file, which no invariant names (I4 names only mode false).
- claude-read: A reindex request that mixes `ocr` with valid tasks is refused as a whole with 422, not split per task.
- claude-read: isPicture in core searchCapture.ts matches any `image/*` mime, not just the OCR set. Only text_content rows produce content_matches, so in practice it affects only pictures with OCR rows.
- claude-read: IndexDetailsDialog keeps its own copy of the OCR mime set (OCR_MIME_TYPES), so it can drift from the backend's OCR_IMAGE_TYPES.
- claude-verify: IndexDetailsResponse.image_ocr is a new API field that the touch points do not name.
- claude-verify: reindex_file returns 422 for an ocr task on a non-picture file, which no invariant names (I4 names only mode false).

## Findings

A: 0
B: 6
C: 0

### claude-read:TP-2 — bucket B, LOW, open

Claim: The diff adds a new API field that the touch points do not name. `IndexDetailsResponse.image_ocr` is added in app/schemas.py and set by `get_index_details`, and `IndexDetailsResponse.image_ocr` and `IndexDetailsStatus.ocr` are added in frontend/api.ts. The schemas.py list names only StatusResponse, FeaturesStatus and FeaturesUpdate.
Impact: The index-details endpoint's response shape changes. The dialog now hides or shows the OCR row based on this field, and on `undefined` (an older backend) it hides the row.
Evidence: app/schemas.py IndexDetailsResponse adds `image_ocr: Literal[...] = "on_index"`. app/routers/files.py get_index_details passes `image_ocr=settings.features.image_ocr`. frontend/api.ts IndexDetailsResponse adds `image_ocr?: string`. IndexDetailsDialog.tsx isTaskApplicable returns false when imageOcr is undefined.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add IndexDetailsResponse (schemas.py and api.ts) and get_index_details's `image_ocr` to the touch points.

</details>

### claude-read:TP-3 — bucket B, LOW, open

Claim: The diff changes parts of app/routers/files.py beyond the three items the touch points name (`_REINDEX_ALLOWED_TASKS`, `_REINDEX_FLAG_COLUMN` and the index-details `status`). The `_get_indexed_file_or_404` result dict gains `ocr_indexed`, and the `reindex_file` handler gains a new 422 gate that reads the row's mime type.
Impact: A reindex request that includes `ocr` together with other tasks (for example ["metadata","ocr"] on a document) is now refused as a whole with 422, where before it would have reset the other tasks. It also does this for a picture while the mode is `false`.
Evidence: app/routers/files.py: `_get_indexed_file_or_404` adds `"ocr_indexed": indexed.ocr_indexed`. In reindex_file, `indexed = await asyncio.to_thread(_get_indexed_file_or_404, ...)` is followed by `if "ocr" in tasks and (...): raise HTTPException(422)`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name `reindex_file` and `_get_indexed_file_or_404` in the files.py touch point.

</details>

### claude-read:TP-4 — bucket B, LOW, open

Claim: The diff changes `assemble_contexts` in app/rag/context.py, which r1 does not list: r1 adds only `build_file_context` and `_collect_image_snippets`. `_needs_vector` now also holds when any candidate has file_type `image`.
Impact: Every Ask that returns any picture now embeds the query once, even when no picture has OCR rows. This adds a text-embedding call per such question. The result is unchanged.
Evidence: app/rag/context.py assemble_contexts: `any(c.file_type in ("document", "text", "image") for c in candidates)`. The test TestAssembleContextsPictureOcr pins it.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `assemble_contexts` to the I11 touch points.

</details>

### claude-read:TP-6 — bucket B, LOW, open

Claim: The touch points say the engine and its system libraries are pinned in requirements.txt and the Dockerfile, but `opencv-python-headless` is added unpinned and the Dockerfile is not changed.
Impact: A later image rebuild can pull an opencv-python-headless release that does not work with numpy==2.2.4 or rapidocr 3.10.0. Engine creation would then fail, OCR would log a single ERROR, and every picture would stay pending, without any test catching it.
Evidence: addons/intelligence/requirements.txt has `opencv-python-headless` with no version, next to `rapidocr==3.10.0`. addons/intelligence/Dockerfile is unchanged: base python:3.12-slim, with no libglib2.0-0 or libgl1.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Pin opencv-python-headless to the version measured on production.

</details>

### claude-read:TP-1 — bucket B, INFO, open

Claim: The diff changes addons/intelligence/Dockerfile.test, which is not in the touch-point list. It installs pillow-heif==0.22.0 into the test image and copies search-config.yml.example into it.
Impact: The test image now differs from what the touch points describe. The HEIC fixture and the example-config test depend on this file. Nothing changes for a user at run time.
Evidence: addons/intelligence/Dockerfile.test:44 (`pip install pillow pillow-heif==0.22.0`) and :60-61 (`COPY search-config.yml.example .`). The touch points list only `addons/intelligence/Dockerfile`. That file is unchanged in this diff, and I read its current content: it has no libgl1 or libglib2.0-0.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add Dockerfile.test to the touch-point list.

</details>

### claude-read:TP-5 — bucket B, INFO, open

Claim: Test files outside the listed `addons/intelligence/tests/` are reached. Three are new: addons/intelligence/frontend/AdminFeaturesSettingsSectionOcr.test.tsx, IndexDetailsDialogOcr.test.tsx and IndexStatusWidgetOcr.test.tsx. Two existing ones are modified: AdminFeaturesSettingsSection.test.tsx (combobox count 11→12) and the core frontend/src/lib/__tests__/searchCapture.test.ts.
Impact: None for users. The touch-point list understates where tests live, and in particular it does not name the core test file.
Evidence: The diff headers for these five files.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the frontend test files and the core searchCapture test as touch points.

</details>

## Not verified

- claude-read: I did not run any test or build an image.
- claude-read: I did not check whether rapidocr 3.10.0 accepts the params used in _create_engine, or whether it runs on onnxruntime 1.21.0.
- claude-read: I did not check whether opencv-python-headless needs libglib2.0-0 on python:3.12-slim.
- claude-read: I did not check core consumers of a `document_selection` capture without a locator on a picture (for example, adding it to the Knowledge base).
- claude-read: I did not verify that upsert_fts_text_content with an empty list deletes the earlier FTS rows.
- claude-verify: The diff itself (git diff against origin/develop); file contents at the worktree were read instead, assuming the worktree matches d850b31e0.
- claude-verify: Whether opencv-python-headless needs libglib2.0-0 on python:3.12-slim at run time.
- claude-verify: No test was run.

TOTAL: 6 findings
