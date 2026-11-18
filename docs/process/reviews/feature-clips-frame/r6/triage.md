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
- addons/knowledge/app/main.py — full: Both diff hunks (the import and include_router).
- addons/knowledge/app/routers/clip_covers.py — full: New file, read entirely in the diff. Compared with note_openings.py.
- addons/knowledge/app/schemas.py — full: The added model classes.
- addons/knowledge/frontend/api.ts — full: The appended fetchClipCovers hunk.
- addons/knowledge/frontend/clips/ClipShelf.tsx — full: Deleted file, shown in full in the diff.
- addons/knowledge/frontend/clips/ClipsAll.tsx — full: Deleted file, shown in full in the diff.
- addons/knowledge/frontend/clips/ClipsEmpty.tsx — full: Deleted file, shown in full in the diff.
- addons/knowledge/frontend/clips/ClipsHome.tsx — full: Deleted file, shown in full in the diff.
- addons/knowledge/frontend/clips/ClipsTabs.tsx — full: Deleted file, shown in full in the diff.
- addons/knowledge/frontend/clips/requests.ts — full: Deleted file, shown in full in the diff.
- addons/knowledge/frontend/clipsapp/ClipCard.tsx — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/ClipRow.tsx — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/ClipShelfBlock.tsx — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/CoverShelf.tsx — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/Home.tsx — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/Library.tsx — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/ShelfPage.tsx — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/clipMeta.ts — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/clipsApp.ts — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/clipsUrl.ts — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/requests.ts — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/usePagedClips.ts — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/useShelfData.ts — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/useTagShelves.ts — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/useVerify.ts — full: New file, read in the diff.
- addons/knowledge/frontend/messages/en.json — full: The clips block hunk.
- addons/knowledge/frontend/messages/ja.json — full: The clips block hunk.
- addons/knowledge/frontend/notesapp/useNotesTarget.ts — partial: Only the diff hunks (the signature, the readAppTarget calls and choose). The middle of the hook body was not read.
- addons/knowledge/frontend/pages/clips.tsx — full: Almost the whole file appears in the diff hunks.
- addons/knowledge/manifest.json — full: The added route hunk.
- frontend/e2e-components/clips-primary-action-desktop.spec.ts — full: New file, read in the diff.
- frontend/e2e-components/clips-primary-action.spec.ts — full: The rewrite covers nearly the whole file in the diff.
- frontend/e2e-components/clips-row.spec.ts — full: The rewrite covers nearly the whole file in the diff.
- frontend/e2e-components/fixtures/app.tsx — partial: Only the import and fetch-stub hunks (lines ~108-150). The rest of the stub was not read.
- frontend/e2e-components/fixtures/clipsData.ts — full: New file, read in the diff.
- frontend/e2e-components/fixtures/clipsPage.tsx — full: The rewritten file, read in the diff.
- frontend/e2e-components/fixtures/clipsRow.tsx — full: The rewritten file, read in the diff.
- frontend/e2e-components/projects.ts — full: The one-line hunk.
- frontend/e2e-components/spec-viewport.spec.ts — full: The one-line hunk.
- frontend/src/components/appshell/TargetMenu.tsx — partial: The diff hunks, plus a grep of defaultTargetOrigin. The whole Rows function was not read.

Test files:
- addons/knowledge/frontend/__tests__/clipsAppHarness.tsx — full: New file, read in the diff.
- addons/knowledge/frontend/__tests__/clipsCovers.test.tsx — full: New file, read in the diff.
- addons/knowledge/frontend/__tests__/clipsFrame.test.tsx — full: New file, read in the diff.
- addons/knowledge/frontend/__tests__/clipsHome.test.tsx — full: New file, read in the diff.
- addons/knowledge/frontend/__tests__/clipsLibrary.test.tsx — full: New file, read in the diff.
- addons/knowledge/frontend/__tests__/clipsPage.test.tsx — partial: Only the diff hunks. Unchanged mocks near the top and the clip-form tests were not read.
- addons/knowledge/frontend/__tests__/notesRoutesManifest.test.ts — partial: Only the added describe hunk.
- addons/knowledge/frontend/__tests__/popup-dismissal.test.ts — partial: Only the FILE_COUNT hunk.
- addons/knowledge/frontend/__tests__/reachability.test.ts — partial: Only the count hunk.
- addons/knowledge/frontend/clipsapp/__tests__/ClipCard.test.tsx — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/__tests__/ClipShelfBlock.test.tsx — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/__tests__/clipMeta.test.ts — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/__tests__/clipsTarget.test.tsx — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/__tests__/clipsUrl.test.ts — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/__tests__/requests.test.ts — full: New file, read in the diff.
- addons/knowledge/frontend/clipsapp/__tests__/usePagedClips.test.tsx — full: New file, read in the diff.
- addons/knowledge/tests/test_clip_covers.py — full: New file, read in the diff.
- addons/knowledge/tests/test_clip_covers_acceptance.py — full: New file, read in the diff.
- frontend/src/components/__tests__/toolbarMenuHome.test.ts — partial: Only the one-line hunk.

## Needs a human

### unspecified_behavior

Note: When the frontmatter is invalid YAML, or runs past the 4096-byte read so its closing `---` is never seen, frontmatter.parse returns the whole text as the body. extract_cover then reads URLs inside the frontmatter as body links for the site. Step 14 and I7 are silent on this case.; When a shelf page's refresh re-asks several pages, it drops drawn cards those pages no longer name, unless the card is being saved (usePagedClips.ts:103-106). Step 5 says only that later pages already drawn stay.
- claude-read: When the frontmatter is invalid YAML, or runs past the 4096-byte read so its closing `---` is never seen, frontmatter.parse returns the whole text as the body. extract_cover then reads URLs inside the frontmatter as body links for the site. Step 14 and I7 are silent on this case.
- claude-read: When a shelf page's refresh re-asks several pages, it drops drawn cards those pages no longer name, unless the card is being saved (usePagedClips.ts:103-106). Step 5 says only that later pages already drawn stay.

## Findings

A: 0
B: 6
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: The diff adds `fetchClipCovers` to the shared Knowledge client `addons/knowledge/frontend/api.ts`, which is not in the touch-point list. The list names only `requests` inside the new `clipsapp/` directory.
Impact: None for a user. `api.ts` is the addon's shared request module, which Notes and other pages also import, so this change reaches past the Clips files the list names. The function is append-only and does nothing for an empty list of ids.
Evidence: addons/knowledge/frontend/api.ts:758-777 adds `ClipCover` and `fetchClipCovers` (POST /clip-covers). It is used by clipsapp/clipMeta.ts, ClipCard.tsx and ClipRow.tsx (type import). The touch-point list names only `clipsapp/` (… requests) and `clips/requests.ts` moved.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `addons/knowledge/frontend/api.ts` (`fetchClipCovers`) to the touch points.

</details>

### claude-read:R2 — bucket B, LOW, open

Claim: The diff modifies `frontend/e2e-components/fixtures/app.tsx`, the global `window.fetch` stub that every component fixture shares, and the touch-point list does not name it.
Impact: Every e2e component arrangement goes through this stub. Today the new handlers return null unless `location.hash` contains `clips-page` or `clips-row`, so other fixtures fall through unchanged. A later edit to those hash guards could silently change other arrangements' responses.
Evidence: frontend/e2e-components/fixtures/app.tsx:111-112 changes the imports. Lines 148-149 add `const clips = clipsPageResponse(url, init) ?? clipsRowResponse(url, init); if (clips !== null) return clips;` ahead of the existing routes. Both handlers are guarded by `window.location.hash.includes(...)` (fixtures/clipsPage.tsx and fixtures/clipsRow.tsx).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List `fixtures/app.tsx` (the fetch-stub routing) among the e2e-components touch points.

</details>

### claude-read:R6 — bucket B, LOW, open

Claim: The touch point 'components/appshell/TargetMenu.tsx (defaultTargetOrigin) and its test' is only half done. The commit changes TargetMenu.tsx but no core TargetMenu test, and no file under frontend/src references `defaultTargetOrigin` outside TargetMenu.tsx itself.
Impact: I10 says every caller that does not pass `defaultTargetOrigin` keeps exactly the same count request, and nothing in the core pins that. The only coverage is the Knowledge page tests, which check that Clips sends `origin=webclip`. Nothing checks that Notes or other callers send no `origin`.
Evidence: Grep for `defaultTargetOrigin` in frontend/src matches only TargetMenu.tsx:45,97,110,129,132,188,233. frontend/src/components/appshell/__tests__/TargetMenu*.test.tsx are not in the diff.
Repro: Mutation: in TargetMenu.tsx:129, send `origin` whenever `defaultTargetTypes` contains `text`. No core test changed by this diff would fail.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a TargetMenu test asserting that the default count omits `origin` when the prop is absent and sends it alongside `exclude_origin` when both are set.

</details>

### claude-read:R3 — bucket B, INFO, open

Claim: The diff adds a new e2e spec `frontend/e2e-components/clips-primary-action-desktop.spec.ts` and a new shared fixture module `frontend/e2e-components/fixtures/clipsData.ts`. Neither is in the touch-point list, which names only rewrites of `clips-primary-action.spec.ts`, `clips-row.spec.ts`, `fixtures/clipsPage.tsx`, `fixtures/clipsRow.tsx` and their registrations.
Impact: None for a user. The desktop project now runs one more spec file, registered in DESKTOP_ONLY and AT_THE_DESKTOP_WIDTH. The I9 desktop checks live in a file the plan did not name.
Evidence: Both files are new in the diff. frontend/e2e-components/projects.ts:47 and spec-viewport.spec.ts:129 register `clips-primary-action-desktop.spec.ts`. clipsData.ts provides `armCoverGate`, `clipCoversResponse` and `window.__releaseClipCovers/__releaseClipShelves`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name the desktop spec and `fixtures/clipsData.ts` in the e2e-components touch point.

</details>

### claude-read:R4 — bucket B, INFO, open

Claim: Two Knowledge test files outside the touch-point list are added or changed: `addons/knowledge/tests/test_clip_covers_acceptance.py` (new) and `addons/knowledge/frontend/__tests__/notesRoutesManifest.test.ts` (adds a `/clip-covers` manifest case). The list names only `tests/test_clip_covers.py` for the backend.
Impact: None for a user. The second backend test file overlaps `test_clip_covers.py` with its own `CoversFake`, so the two fakes can drift apart.
Evidence: addons/knowledge/tests/test_clip_covers_acceptance.py is a new 374-line file. notesRoutesManifest.test.ts:30-41 adds the describe block for SPEC-ADDON-140.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R5 — bucket B, INFO, open

Claim: The modules added under `clipsapp/` do not match the components the touch-point list names. `useClipCovers` and `useUnreadDots` do not exist. They are replaced by the `ClipMeta` class in `clipMeta.ts`. The diff also adds unnamed modules: `usePagedClips.ts`, `useShelfData.ts`, `useTagShelves.ts`, `useVerify.ts`, `clipsUrl.ts`, `clipsApp.ts`, `CoverShelf.tsx`, `ClipShelfBlock.tsx` and `ClipRow.tsx`.
Impact: A reader who follows the touch-point list will look for hooks that do not exist. Cover and dot caching, along with the viewer_required handling for dots (I4, I11), lives in one shared class held in a context.
Evidence: addons/knowledge/frontend/clipsapp/clipMeta.ts:20-151 (`ClipMeta`, `ClipMetaContext`, `useClipMeta`). No file named useClipCovers or useUnreadDots appears in the diff.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Replace `useClipCovers`, `useUnreadDots` in the touch points with the modules actually added (clipMeta, usePagedClips, useShelfData, useTagShelves, useVerify, clipsUrl, CoverShelf, ClipShelfBlock, ClipRow).

</details>

## Not verified

- claude-read: I did not run any test, vitest, pytest or Playwright. The read-only tools cannot execute them.
- claude-read: I did not check whether the core inventory tests the touch points list (ime-enter-guard, page-headings, section-headings, line-clamp-display, escape-listeners, page-container-width, componentFixtureParity, check-coverage-denominator) needed updates for the new clipsapp files.
- claude-read: I did not check that PageTabs accepts the `wrap` prop, or that useScopedLoad keeps its old data on a failed refresh.
- claude-read: I did not check whether the core /files/bulk excludes trashed files. I assumed it matches note-openings.
- claude-verify: I did not run git diff against origin/develop, so whether each file is new or changed in this exact range is inferred from the files present and the readers' evidence.
- claude-verify: I did not run any test.
- claude-verify: I did not check whether clipsFrame.test.tsx renders the real core TargetMenu or a mock.

TOTAL: 6 findings
