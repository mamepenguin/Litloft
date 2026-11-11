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

## Needs a human

### unspecified_behavior

Note: The scene-tile route answers 404 for a native video before checking the tile directory, a check the spec does not state. The observable result is the same 404.; A change of `drive` alone in the `.loft` panel refetches without resetting `timestamps`, so the previous rows stay until the new answer arrives.; The storyboard-leg tile crop skips a tile whose box falls outside a short sheet, so no row and no tile are written for it.
- claude-read: The scene-tile route answers 404 for a native video before checking the tile directory, a check the spec does not state. The observable result is the same 404.
- claude-read: A change of `drive` alone in the `.loft` panel refetches without resetting `timestamps`, so the previous rows stay until the new answer arrives.
- claude-read: The storyboard-leg tile crop skips a tile whose box falls outside a short sheet, so no row and no tile are written for it.
- claude-verify: The CLIP frames strip and VisualIndexSection strip are unbounded on mouse devices because the `mouse:` variant is undefined, so 20-at-a-time paging (I6) never happens in practice.

### unspecified_behavior

Note: The CLIP frames strip and VisualIndexSection strip are unbounded on mouse devices because the `mouse:` variant is undefined, so 20-at-a-time paging (I6) never happens in practice.
- claude-read: The scene-tile route answers 404 for a native video before checking the tile directory, a check the spec does not state. The observable result is the same 404.
- claude-read: A change of `drive` alone in the `.loft` panel refetches without resetting `timestamps`, so the previous rows stay until the new answer arrives.
- claude-read: The storyboard-leg tile crop skips a tile whose box falls outside a short sheet, so no row and no tile are written for it.
- claude-verify: The CLIP frames strip and VisualIndexSection strip are unbounded on mouse devices because the `mouse:` variant is undefined, so 20-at-a-time paging (I6) never happens in practice.

## Findings

A: 1
B: 6
C: 0

### claude-read:F1 — bucket A, HIGH, open

Claim: The submodule bump carries a strip-layout change to ClipFramesSection (removal of the press-and-hold arrows, `flex-wrap` plus `mouse:max-h-[17.5rem] mouse:overflow-y-auto`) whose `mouse:` variant is defined nowhere, so on a mouse the strip is unbounded and the near-end sentinel is always visible, which defeats 20-at-a-time paging for both `.loft` and native panels.
Impact: On a desktop browser the CLIP frames panel renders every row at once (112 for an 18-minute YouTube reference, 75 for a native video) in an unbounded wrapped block rather than 20 at a time in a bounded strip. The native panel also loses its horizontal strip and arrow buttons, so it does not behave 'as before'.
Evidence: addons/intelligence/frontend/ClipFramesSection.tsx (strip className `scrollbar-hover flex flex-wrap gap-2 p-1 mouse:max-h-[17.5rem] mouse:overflow-y-auto pointer-coarse:...`). No `@custom-variant mouse` exists in frontend/src/**/*.css (grep for `variant` in frontend/src css finds only a comment at globals.css:1001), and `pointer-coarse` is the only built-in pointer variant in use. docs/process/reviews/feature-youtube-scene-tiles/decisions.md R-5 evidence: 'all 112 buttons were rendered right after the expand ... not 20 at a time; the native 75-row video ... does the same ... because the strip's `mouse:max-h-[17.5rem]` produces no CSS in the built stylesheet'. ClipFramesSection.test.tsx only regex-matches the class names (`/\bmouse:max-h-/`), so it passes whether or not the variant compiles.
Repro: R-5 in decisions.md: open /files/<youtube loft> on a desktop browser and expand CLIP Frames; all 112 tile buttons are in the DOM at once. Mutation: delete `mouse:max-h-[17.5rem]` from the className and the class-name test still matches the other tokens; deleting the variant from CSS cannot be caught because it was never defined.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Define the `mouse` custom variant in the core stylesheet (or use an existing one such as `pointer-fine:`), or restore the bounded horizontal strip. Add a layout test against built CSS rather than a class-name regex.

</details>

### claude-read:F2 — bucket B, MEDIUM, open

Claim: The diff changes VisualIndexSection.tsx and its test (same `mouse:`/`pointer-coarse:` wrap layout), and neither file is in the touch-point list.
Impact: The Visual Index scene row on a file page changes from a horizontal strip to an unbounded wrapped block on a mouse, because the `mouse:` variant is undefined (same cause as F1). No invariant or reviewer covers it.
Evidence: addons/intelligence/frontend/VisualIndexSection.tsx:273 className `... flex flex-wrap gap-3 p-1 mouse:max-h-[30.75rem] mouse:overflow-y-auto pointer-coarse:flex-nowrap pointer-coarse:overflow-x-auto`. Touch-point list names only ClipFramesSection, SceneCandidatesSection and api.ts in the frontend.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Move it to its own change, or add it to the touch points with the same variant fix as F1.

</details>

### claude-read:F4 — bucket B, MEDIUM, open

Claim: The diff reaches the whole SPEC-ADDON-076/077/078 and SPEC-CORE-058 implementation, none of which is in this spec's touch-point list: the new app/youtube_source.py, app/rag/file_question.py, app/routers/scenes.py, the frame route's `.loft` branch and `_image_route_indexed_file` in app/routers/files.py, `frame_ffmpeg_argv` in app/frame_cache.py, and `_index_clip_loft`/`_handle_thumbnail_fallback` in app/workers/clip.py.
Impact: Network-reaching code (yt-dlp, ffmpeg on remote streams, sheet downloads) and Ask image behavior ship under a review whose invariants cover only scene tiles. Unless the youtube-frames change was reviewed separately, no declared invariant here checks them.
Evidence: Submodule diff 1f38a24..a4d4cce adds addons/intelligence/app/youtube_source.py (470 lines), changes file_question.py `_frame_image`, scenes.py `_require_youtube_loft`, and files.py `get_frame` `.loft` branch. The youtube-scene-tiles touch-point list names only `_embed_tiles`/`_index_youtube_storyboard`, the tile path helper, and the scene-tile route.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F5 — bucket B, MEDIUM, open

Claim: The diff edits addons/intelligence/Dockerfile and Dockerfile.test (installing yt-dlp), which the youtube-frames spec itself calls a protected path (`**/Dockerfile*` CRITICAL), while this change's touch points say 'No protected path is edited' and classification.json lists no protected path touched.
Impact: An image-build change classified CRITICAL by the project's own risk zones is not counted in this review's risk classification, so it may merge without the human review a protected path requires.
Evidence: Submodule diff hunks for addons/intelligence/Dockerfile (+`RUN pip install --no-cache-dir "yt-dlp>=2026.8.19"`) and Dockerfile.test. docs/specs/youtube-frames.md touch points: '**Protected path**: `risk-zones.conf` classifies `**/Dockerfile*` CRITICAL'. r1/classification.json: `protected_paths_touched: []`, zones only `addons/intelligence` (MEDIUM).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F3 — bucket B, LOW, open

Claim: The diff changes AdminFeaturesSettingsSection.tsx and its test (adding `break-anywhere` to header and cell classes), and neither file is in the touch-point list.
Impact: Text wrapping in the admin features table changes, unrelated to scene tiles. The risk is low, but the change is unreviewed against any spec.
Evidence: addons/intelligence/frontend/AdminFeaturesSettingsSection.tsx headClass and first `<td>`. The touch-point list does not name this file.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F6 — bucket B, LOW, open

Claim: The diff changes mcp-server/src/tools/video.ts, its tests (loftUrl.test.ts, new loftYoutube.test.ts) and mcp-server/README.md, and none of them is in the touch-point list.
Impact: The MCP tools' behavior on a YouTube `.loft` changes (they now return frames), under a review whose invariants do not cover the MCP tools beyond I5.
Evidence: mcp-server/src/tools/video.ts `readLoftReference` and the `loft?.provider !== "youtube"` branches in get_video_frame and list_video_scenes.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F7 — bucket B, INFO, open

Claim: docs/addons/intelligence.md is changed beyond the listed paragraph and route list: a new privacy bullet, a `GET /files/{file_id}/frame` YouTube paragraph, a container outbound-access and yt-dlp paragraph, and an Ask sentence. docs/user-guide/search.md also gets an Ask sentence about YouTube references. None of these is in the touch points.
Impact: Only the documentation scope is broader than declared. Nothing here would mislead a code change.
Evidence: docs/addons/intelligence.md hunks at lines 31, 214-218 and 289. docs/user-guide/search.md hunk at line 141.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Whether the youtube-frames change (SPEC-ADDON-076..078, SPEC-CORE-058) had its own review cycle that would make F4–F7 expected carry-over.
- claude-read: Whether a `mouse` variant is defined somewhere other than frontend/src/**/*.css (e.g. an addon stylesheet or Tailwind plugin); I relied on the R-5 evidence that no CSS is produced.
- claude-read: I did not run any test or build.
- claude-verify: Did not read git objects to confirm origin/develop's gitlink is exactly 1f38a24 or which addon commit (d420278) introduced the strip classes; I inferred this from the submodule reflog and the reviewer's stated range.
- claude-verify: Did not run the build to confirm the compiled stylesheet lacks a 17.5rem rule; I relied on the source grep and the R-5 record.
- claude-verify: Did not inspect the actual diff hunks of docs/addons/intelligence.md lines 212-218 and 289 or search.md:141 (omitted long lines).

TOTAL: 7 findings
