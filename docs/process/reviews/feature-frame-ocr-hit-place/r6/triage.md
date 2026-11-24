# Triage: r6

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- artifact of claude-read is missing
- artifact of claude-verify is missing
- no read or mutate reviewer in the expected set

## Read coverage

Product files:
- addons/intelligence/app/database.py — missing from coverage
- addons/intelligence/app/file_find.py — missing from coverage
- addons/intelligence/app/models.py — missing from coverage
- addons/intelligence/app/routers/search.py — missing from coverage
- addons/intelligence/app/schemas.py — missing from coverage
- addons/intelligence/app/search.py — missing from coverage
- addons/intelligence/app/workers/frame_ocr.py — missing from coverage
- addons/media_import/frontend/players/YouTubeEmbed.tsx — missing from coverage
- frontend/e2e-components/fixtures/app.tsx — missing from coverage
- frontend/e2e-components/fixtures/frameCrop.tsx — missing from coverage
- frontend/e2e-components/fixtures/frameOutline.tsx — missing from coverage
- frontend/e2e-components/frame-crop-desktop.spec.ts — missing from coverage
- frontend/e2e-components/frame-crop.cases.ts — missing from coverage
- frontend/e2e-components/frame-crop.data.ts — missing from coverage
- frontend/e2e-components/frame-crop.spec.ts — missing from coverage
- frontend/e2e-components/frame-outline-desktop.spec.ts — missing from coverage
- frontend/e2e-components/frame-outline.data.ts — missing from coverage
- frontend/e2e-components/projects.ts — missing from coverage
- frontend/e2e-components/spec-viewport.spec.ts — missing from coverage
- frontend/src/components/FileDetail/FileDetailContainer.tsx — missing from coverage
- frontend/src/components/FileDetail/find/useFindInFile.ts — missing from coverage
- frontend/src/components/MiniPlayerContainer.tsx — missing from coverage
- frontend/src/components/VideoPlayer.tsx — missing from coverage
- frontend/src/components/loft/LoftPlayer.tsx — missing from coverage
- frontend/src/components/loft/types.ts — missing from coverage
- frontend/src/components/player/FindOutlineLayer.tsx — missing from coverage
- frontend/src/components/search/PassageList.tsx — missing from coverage
- frontend/src/hooks/useMiniPlayer.ts — missing from coverage
- frontend/src/lib/fileFind.ts — missing from coverage
- frontend/src/lib/searchMerge.ts — missing from coverage
- frontend/src/lib/searchPassages.ts — missing from coverage

Test files:
- addons/intelligence/tests/test_search_passages.py — missing from coverage
- addons/intelligence/tests/test_spec_addon_134_frame_lines_schema.py — missing from coverage
- addons/intelligence/tests/test_spec_addon_136_frame_hit_lines.py — missing from coverage
- addons/intelligence/tests/test_spec_addon_136_frame_size.py — missing from coverage
- addons/media_import/frontend/players/__tests__/YouTubeEmbed.pictureOverlay.test.tsx — missing from coverage
- frontend/src/components/FileDetail/__tests__/FindInFile.test.tsx — missing from coverage
- frontend/src/components/FileDetail/__tests__/harness.tsx — missing from coverage
- frontend/src/components/loft/__tests__/LoftPlayer.pictureOverlay.test.tsx — missing from coverage
- frontend/src/components/player/__tests__/FindOutlineLayer.test.tsx — missing from coverage
- frontend/src/components/search/__tests__/PassageList.frameCrop.test.tsx — missing from coverage
- frontend/src/lib/__tests__/searchPassages.frameHitLink.test.ts — missing from coverage

## Needs a human

### incomplete_read

Note: addons/intelligence/app/database.py (missing), addons/intelligence/app/file_find.py (missing), addons/intelligence/app/models.py (missing), addons/intelligence/app/routers/search.py (missing), addons/intelligence/app/schemas.py (missing), addons/intelligence/app/search.py (missing), addons/intelligence/app/workers/frame_ocr.py (missing), addons/media_import/frontend/players/YouTubeEmbed.tsx (missing), frontend/e2e-components/fixtures/app.tsx (missing), frontend/e2e-components/fixtures/frameCrop.tsx (missing), frontend/e2e-components/fixtures/frameOutline.tsx (missing), frontend/e2e-components/frame-crop-desktop.spec.ts (missing), frontend/e2e-components/frame-crop.cases.ts (missing), frontend/e2e-components/frame-crop.data.ts (missing), frontend/e2e-components/frame-crop.spec.ts (missing), frontend/e2e-components/frame-outline-desktop.spec.ts (missing), frontend/e2e-components/frame-outline.data.ts (missing), frontend/e2e-components/projects.ts (missing), frontend/e2e-components/spec-viewport.spec.ts (missing), frontend/src/components/FileDetail/FileDetailContainer.tsx (missing), frontend/src/components/FileDetail/find/useFindInFile.ts (missing), frontend/src/components/MiniPlayerContainer.tsx (missing), frontend/src/components/VideoPlayer.tsx (missing), frontend/src/components/loft/LoftPlayer.tsx (missing), frontend/src/components/loft/types.ts (missing), frontend/src/components/player/FindOutlineLayer.tsx (missing), frontend/src/components/search/PassageList.tsx (missing), frontend/src/hooks/useMiniPlayer.ts (missing), frontend/src/lib/fileFind.ts (missing), frontend/src/lib/searchMerge.ts (missing), frontend/src/lib/searchPassages.ts (missing)
Paths:
- addons/intelligence/app/database.py
- addons/intelligence/app/file_find.py
- addons/intelligence/app/models.py
- addons/intelligence/app/routers/search.py
- addons/intelligence/app/schemas.py
- addons/intelligence/app/search.py
- addons/intelligence/app/workers/frame_ocr.py
- addons/media_import/frontend/players/YouTubeEmbed.tsx
- frontend/e2e-components/fixtures/app.tsx
- frontend/e2e-components/fixtures/frameCrop.tsx
- frontend/e2e-components/fixtures/frameOutline.tsx
- frontend/e2e-components/frame-crop-desktop.spec.ts
- frontend/e2e-components/frame-crop.cases.ts
- frontend/e2e-components/frame-crop.data.ts
- frontend/e2e-components/frame-crop.spec.ts
- frontend/e2e-components/frame-outline-desktop.spec.ts
- frontend/e2e-components/frame-outline.data.ts
- frontend/e2e-components/projects.ts
- frontend/e2e-components/spec-viewport.spec.ts
- frontend/src/components/FileDetail/FileDetailContainer.tsx
- frontend/src/components/FileDetail/find/useFindInFile.ts
- frontend/src/components/MiniPlayerContainer.tsx
- frontend/src/components/VideoPlayer.tsx
- frontend/src/components/loft/LoftPlayer.tsx
- frontend/src/components/loft/types.ts
- frontend/src/components/player/FindOutlineLayer.tsx
- frontend/src/components/search/PassageList.tsx
- frontend/src/hooks/useMiniPlayer.ts
- frontend/src/lib/fileFind.ts
- frontend/src/lib/searchMerge.ts
- frontend/src/lib/searchPassages.ts

## Findings

A: 0
B: 0
C: 0


## Not verified

- none

TOTAL: 0 findings
