# Triage: r6

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

## Read coverage

Product files:
- addons/media_import/.github/workflows/ci.yml — full: Read the whole file (1-328).
- addons/media_import/backend/router.py — full: Read the new handler whole in the diff, plus `_scoped_drive` (router.py:125-144).
- addons/media_import/backend/schemas.py — full: The changed hunk adds two complete model classes; read them in the diff.
- addons/media_import/backend/subscription/db.py — full: Read both diff hunks (`_published_sort_key`, `list_channel_videos`), the imports, and the Watch lane user at db.py:395-434.
- addons/media_import/frontend/ChannelVideos.test.tsx — full: New file, read whole in the diff.
- addons/media_import/frontend/ChannelVideos.tsx — full: New file, read whole in the diff.
- addons/media_import/frontend/LoftMetadataPanel.test.tsx — partial: Read only the changed hunks: the next/link mock and the new 'SPEC-ADDON-160 channel link' describe block. The rest of the file, including makeMetadata, was not read.
- addons/media_import/frontend/LoftMetadataPanel.tsx — full: Read the whole file (1-123).
- addons/media_import/frontend/Page.test.tsx — full: The only changed hunk is the module-level next/navigation mock; read it in the diff.
- addons/media_import/frontend/Page.tsx — full: Read the whole file (1-121).
- addons/media_import/frontend/api.ts — full: Read the new `listChannelVideos` and `ChannelVideoItem` in the diff, plus `driveHeaders` (api.ts:6-8), `_json` (api.ts:211-217) and the `LoftMetadata` type.
- addons/media_import/frontend/lib/publishedDate.test.ts — full: New file, read whole in the diff.
- addons/media_import/frontend/lib/publishedDate.ts — full: New file, read whole in the diff.
- addons/media_import/frontend/messages/en.json — full: Read the changed hunk (channelView.empty) in the diff.
- addons/media_import/frontend/messages/ja.json — full: Read the changed hunk (channelView.empty) in the diff.
- addons/media_import/frontend/watchShelfProviders.ts — full: Read the changed hunks in the diff, including the whole `bylineOf` and the removed `calendarDate`.

Test files:
- addons/media_import/backend/tests/test_channel_videos.py — full: New file, read whole in the diff.
- addons/media_import/backend/tests/test_drive_scope.py — partial: Read only the changed hunks: the ROUTES entry and the count assertion moving from 20 to 21.

## Needs a human

### unspecified_behavior

Note: CI: vitest `--retry=1` and a 4-way shard matrix with an aggregator job under the required-check name. The spec mentions neither.; After this change, frontend tests run only in the shard jobs. The static job checks only collection and tsc.
- claude-read: CI: vitest `--retry=1` and a 4-way shard matrix with an aggregator job under the required-check name. The spec mentions neither.
- claude-read: After this change, frontend tests run only in the shard jobs. The static job checks only collection and tsc.

## Findings

A: 0
B: 4
C: 0

### claude-read:CR-1 — bucket B, MEDIUM, open

Claim: The change edits the addon's CI workflow, which is not among the declared touch points. It splits the frontend job into a static job and four vitest shards run with `--retry=1`, and it removes the single `pnpm test` run.
Impact: A frontend test that fails once and passes on its retry now reports as flaky, and the required `frontend (core vitest / tsc)` check stays green. That covers this change's own timing-dependent tests: ChannelVideos.test.tsx relies on `settle(30)` sleeps, fake timers and IntersectionObserver triggers. A regression that only sometimes fails one of them, such as an intermittent stale-answer race (I6) or a double load step (I5), can merge without anyone noticing. The way the required check is computed also changed: an aggregator job now reads `needs.*.result`. None of this was approved as part of the spec.
Evidence: addons/media_import/.github/workflows/ci.yml:123-140 renames the job to `frontend-static` and drops the `Test` step that ran `pnpm test`, which is `vitest run` (frontend/package.json:11). ci.yml:227-309 adds the `frontend-shards` matrix, running `pnpm exec vitest run --retry=1 --shard=N/4`. ci.yml:311-327 adds the `frontend` aggregator under the old required-check name. docs/process/spec-and-design.md:41-43 says touch points include 'scripts and workflow files'. The spec's Touch points list names no workflow file.
Repro: Read-only review. Diff the touch-point list in docs/specs/loft-channel-videos.md against the submodule diff: `.github/workflows/ci.yml` appears only in the diff. For the retry effect: a vitest case that fails on its first attempt and passes on the second exits 0 under `--retry=1`, while under the previous `pnpm test` (no retry) it exited 1. not_reproduced by execution.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Take the CI change out of this branch and give it its own spec or change. Otherwise, add `.github/workflows/ci.yml` to the touch points and have the human approve the `--retry=1` policy explicitly.

</details>

### claude-read:CR-2 — bucket B, INFO, open

Claim: Three new test files are not named in the touch points, which list only the existing tests that change (Page.test.tsx, LoftMetadataPanel.test.tsx, test_drive_scope.py).
Impact: This adds no runtime behaviour. A reader checking the planned reach against the diff finds three files the plan does not account for. publishedDate.test.ts also pins locale output (`ja` → `2026年11月1日`), so it depends on the ICU data in the test environment.
Evidence: New files: addons/media_import/frontend/ChannelVideos.test.tsx, addons/media_import/frontend/lib/publishedDate.test.ts, addons/media_import/backend/tests/test_channel_videos.py. The spec's Touch points bullet for tests reads 'Existing addon tests that change … Page.test.tsx … LoftMetadataPanel.test.tsx'. test_drive_scope.py is listed separately.
Repro: not_reproduced (list comparison only).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the three new test files to the spec's touch points.

</details>

### claude-read:CR-3 — bucket B, INFO, open

Claim: The touch point says the channel query 'reuses `_PUBLISHED_SORT_KEY`'. Instead, the diff rewrites that constant as a generator, `_published_sort_key(files_table, metadata_table)`, which the existing Watch lane query now also goes through. Spec §7 declares 'No change to … Watch lanes'.
Impact: None observed. With the default arguments (`f`, `m`) the generated SQL text matches the old constant character for character, so `list_watch_lane`'s ORDER BY and `published_sort` projection are unchanged. Still, the Watch lane code path is reached, and a later edit to the generator now changes the Watch lanes and the channel view together.
Evidence: addons/media_import/backend/subscription/db.py:301-324 defines `_published_sort_key` and sets `_PUBLISHED_SORT_KEY = _published_sort_key()`. db.py:415 has the Watch lane's `f" {_PUBLISHED_SORT_KEY} AS published_sort "`. The new `list_channel_videos` calls `_published_sort_key("files", "loft_metadata")` inside `text()`.
Repro: Substitute f/m into the new template and compare it with the removed literal: the strings are identical. not_reproduced by execution.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:CR-4 — bucket B, INFO, open

Claim: ChannelVideos.tsx imports the core module `@/types` (`FileItem`). It is the first non-test addon source to do so, and the module is missing from the touch points' list of core frontend modules the addon starts importing.
Impact: The import is type-only, so it has no runtime effect. It adds an addon → core type dependency that the plan does not record.
Evidence: addons/media_import/frontend/ChannelVideos.tsx:20 `import type { FileItem } from "@/types";`. Grepping `from "@/types"` under addons/media_import/frontend matches only ChannelVideos.tsx among non-test sources. `PageFrame` is also imported, but Page.tsx:13 already imported it before this change, so it is not new.
Repro: not_reproduced (grep only).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `types` (`FileItem`) to the touch points' list of imported core modules.

</details>

## Not verified

- claude-read: I could not run any test, build, tsc or vitest. All conclusions come from reading the code.
- claude-read: I did not check whether the core route that mounts the addon page tolerates `useSearchParams` (Suspense boundary or dynamic rendering) in a production build.
- claude-read: I did not check core inventory tests beyond the ten named (e.g. card-titles, row-action-reveal, coarseNeedleSources, tailwind-scans-addons, accent-budget) against ChannelVideos.tsx.
- claude-read: I could not see which addon commit introduced the CI change, or whether it was meant to be part of this feature.
- claude-read: I did not read the parts of LoftMetadataPanel.test.tsx and test_drive_scope.py outside the changed hunks.
- claude-verify: I assumed the working tree and the addon submodule match commit 78b89eca and could not confirm this, because I had no git access.
- claude-verify: Pre-change file contents, such as the old ci.yml `Test` step and the old `_PUBLISHED_SORT_KEY` text, were not diffed. Claims about removal or rewriting were checked against the current state and product-files.txt only.
- claude-verify: Whether Page.tsx imported PageFrame before this change.
- claude-verify: Whether test_channel_videos.py is new in this change, since it is absent from product-files.txt.
- claude-verify: I did not check behavioural invariants I1-I10 beyond what the four findings needed.

TOTAL: 4 findings
