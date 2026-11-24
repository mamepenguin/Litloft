# Triage: r7

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/intelligence/app/database.py — partial: Lines 1270-1319: the video_frame_lines creation and the new ALTER block inside _migrate_frame_page_ocr_columns.
- addons/intelligence/app/file_find.py — partial: Lines 100-189: _row, the whole of _frame_occurrences, and the start of _usable_picture_lines. The import hunk was read in the diff.
- addons/intelligence/app/models.py — partial: Lines 875-899: the whole VideoFrameLines class.
- addons/intelligence/app/routers/search.py — partial: Lines 70-119: the passage pass-through in _to_response_model.
- addons/intelligence/app/schemas.py — partial: Grep context around SearchPassage (lines 29-44) and FileFindRow (lines 517-534).
- addons/intelligence/app/search.py — partial: Lines 2360-2714: _frame_url, _frame_segment, the frame-line reader and helpers, _passage_line, _finish_passage and _build_passages. The _build_results hunk near line 2178 was read in the diff only.
- addons/intelligence/app/workers/frame_ocr.py — partial: Lines 420-539: the segment opening in _read_video and _store_read. The _Segment dataclass hunk was read in the diff.
- addons/media_import/frontend/players/YouTubeEmbed.tsx — partial: Lines 470-549: the render tree with the iframe host, the overlay and the poster. The props hunk was read in the diff.
- frontend/e2e-components/fixtures/app.tsx — partial: Only the two import lines and the two ARRANGEMENTS spread entries changed; read in the diff.
- frontend/e2e-components/fixtures/frameCrop.tsx — full: New file; the whole file is in the diff.
- frontend/e2e-components/fixtures/frameOutline.tsx — full: New file; the whole file is in the diff.
- frontend/e2e-components/frame-crop-desktop.spec.ts — full: New 3-line file in the diff.
- frontend/e2e-components/frame-crop.cases.ts — full: New file; the whole file is in the diff.
- frontend/e2e-components/frame-crop.data.ts — full: New file; the whole file is in the diff.
- frontend/e2e-components/frame-crop.spec.ts — full: New 3-line file in the diff.
- frontend/e2e-components/frame-outline-desktop.spec.ts — full: New file; the whole file is in the diff.
- frontend/e2e-components/frame-outline.data.ts — full: New file; the whole file is in the diff.
- frontend/e2e-components/projects.ts — partial: Only the two DESKTOP_ONLY list entries changed; read in the diff.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Only three list entries changed; read in the diff.
- frontend/src/components/FileDetail/FileDetailContainer.tsx — partial: Lines 60-119, which include the useFindInFile call.
- frontend/src/components/FileDetail/find/useFindInFile.ts — partial: Lines 150-415: runFetch, changeQuery, commitQuery, openWithQuery, closeFind, step, retry, keyDown and the initial effect. The top hunks (isPlaceAt, options, clearAnswer reset) were read in the diff.
- frontend/src/components/MiniPlayerContainer.tsx — full: Whole file read.
- frontend/src/components/VideoPlayer.tsx — partial: Lines 200-299: the render tree of BrowserVideoPlayer around the new layer.
- frontend/src/components/loft/LoftPlayer.tsx — full: Whole file read.
- frontend/src/components/loft/types.ts — full: Whole file read.
- frontend/src/components/player/FindOutlineLayer.tsx — full: Whole file read.
- frontend/src/components/search/PassageList.tsx — full: Whole file read.
- frontend/src/hooks/useMiniPlayer.ts — partial: Lines 1-60, which include the new context and hook.
- frontend/src/lib/fileFind.ts — full: Lines 1-111, the whole file.
- frontend/src/lib/searchMerge.ts — partial: Lines 1-60, which include FrameQuad and SearchPassage.
- frontend/src/lib/searchPassages.ts — partial: Lines 60-139: asciiFold, linkTerm, startText and the whole of passageHref.

Test files:
- addons/intelligence/tests/test_search_passages.py — partial: Only the PASSAGE_FIELDS hunk, read in the diff.
- addons/intelligence/tests/test_spec_addon_134_frame_lines_schema.py — partial: Only the changed column-set hunk, read in the diff.
- addons/intelligence/tests/test_spec_addon_136_frame_hit_lines.py — full: New file; the whole file is in the diff.
- addons/intelligence/tests/test_spec_addon_136_frame_size.py — full: New file; the whole file is in the diff.
- addons/media_import/frontend/players/__tests__/YouTubeEmbed.pictureOverlay.test.tsx — full: New file; the whole file is in the diff.
- frontend/src/components/FileDetail/__tests__/FindInFile.test.tsx — partial: The added hunks were read in the diff, plus a grep for usePolicy and restoreAllMocks.
- frontend/src/components/FileDetail/__tests__/harness.tsx — partial: Lines 30-69, which include the changed usePolicyMock.
- frontend/src/components/loft/__tests__/LoftPlayer.pictureOverlay.test.tsx — full: New file; the whole file is in the diff.
- frontend/src/components/player/__tests__/FindOutlineLayer.test.tsx — full: New file; the whole file is in the diff.
- frontend/src/components/search/__tests__/PassageList.frameCrop.test.tsx — full: New file; the whole file is in the diff.
- frontend/src/lib/__tests__/searchPassages.frameHitLink.test.ts — full: New file; the whole file is in the diff.

## Findings

A: 0
B: 4
C: 0

### claude-read:CR-3 — bucket B, LOW, open

Claim: `_frame_segment` now runs a second query (the segment's chunk texts) for every `screen_text` passage, the vector-only ones included, so passages outside the keyword case also gain a read.
Impact: A search with many vector-only frame-text passages makes one extra intelligence-DB read per passage, even though only keyword passages use the chunks. Latency only; the answer is unchanged.
Evidence: addons/intelligence/app/search.py:2371-2396 always runs the `SELECT text AS chunk_text ... ORDER BY chunk_index` query. _finish_passage at :2606-2615 calls it for every screen_text passage, and the chunks are used only at :2648-2655 under `keyword_matches`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Read the chunk texts only when the passage is keyword-matched and not a .loft, for example lazily inside _passage_line.

</details>

### claude-read:CR-1 — bucket B, INFO, open

Claim: The diff changes the shared FileDetail test harness default (`usePolicyMock` now returns `{enabled: true, isLoading: false}` instead of undefined), a place that is not in the touch-point list and that about ten other test suites import.
Impact: No user impact. Every suite that imports `harness.tsx` (DocumentController, FileDetailCanvas, FileDetailContent, FileDetailHeaderRow, FileDetailInboxNav, FileDetailPageRow, FileNavInPageRow, FilePageClosedEvent, ...) now gets a fail-open policy by default. A test that relied on the old undefined default without calling mockReturnValue would silently change what it exercises. The change appears to compensate for the new `vi.restoreAllMocks()` calls in FindInFile.test.tsx (lines 2804 and 2892), which reset the per-file `mockReturnValue` set in beforeEach at line 611.
Evidence: frontend/src/components/FileDetail/__tests__/harness.tsx:50 `export const usePolicyMock = vi.fn(() => ({ enabled: true, isLoading: false }));`. The grep for usePolicyMock shows importers across frontend/src/components/FileDetail/__tests__/*. FindInFile.test.tsx:2804 and :2892 call vi.restoreAllMocks().
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name harness.tsx in the touch points, or scope the restore in FindInFile.test.tsx so it does not reset the shared mock.

</details>

### claude-read:CR-2 — bucket B, INFO, open

Claim: The diff amends an existing SPEC-ADDON-134 test (`test_spec_addon_134_frame_lines_schema.py`) to expect the new columns, and SPEC-ADDON-134 is neither among the touch points nor under Revises.
Impact: No user impact. A reader tracing SPEC-ADDON-134's schema test will find columns that belong to SPEC-ADDON-136 with no pointer to it.
Evidence: addons/intelligence/tests/test_spec_addon_134_frame_lines_schema.py:103-116 adds `frame_width`/`frame_height` (INTEGER, nullable) to the exact column set asserted for the SPEC-ADDON-134 migration test.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:CR-4 — bucket B, INFO, open

Claim: Mounting `FindOutlineLayer` inside the shared `VideoPlayer` and `LoftPlayer` also reaches every surface that uses those players, which the touch points do not name: the collection surface `FileDetailFullScreen` (listed as 'not touched'), the shelf apps and the mini player.
Impact: On those surfaces there is no FindProvider, so `useFindMarks` returns EMPTY_MARKS (term null) and nothing is drawn. The layer still attaches 10 media event listeners, three document listeners and a ResizeObserver, and it re-renders itself on every `timeupdate`. LoftPlayer now holds controller state and passes a new overlay element on each render, so the embed re-renders once more when its controller arrives. No visible change was found.
Evidence: frontend/src/components/VideoPlayer.tsx:264 `<FindOutlineLayer video={videoElement} controller={mc} />` is unconditional. frontend/src/components/loft/LoftPlayer.tsx:37-45 and :87 set `pictureOverlay` unconditionally. frontend/src/components/player/FindOutlineLayer.tsx:151-170 adds the listeners. frontend/src/components/FileDetail/find/FindContext.tsx:37-44 holds the default marks (term null).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: No test was run, neither vitest, pytest nor playwright; every conclusion comes from reading the code.
- claude-read: The YouTube embed's real behaviour under the IFrame API, including the ad state and full screen, was not checked.
- claude-read: Every path that renders PassageList was not traced to confirm that rows unmount between queries.
- claude-read: Not every suite that imports harness.tsx was checked for reliance on the old undefined usePolicyMock default.
- claude-read: docs/process/spec-and-design.md was not read to confirm how this repository counts test files against the touch points.
- claude-verify: The value of usePolicyMock's default before the change: git history is not readable with the available tools.
- claude-verify: Whether any suite importing harness.tsx relies on the default implementation after a mock reset.
- claude-verify: The tests were not run.
- claude-verify: The YouTubeEmbed.tsx rendering of pictureOverlay and the mini-player state hook were not read.

TOTAL: 4 findings
