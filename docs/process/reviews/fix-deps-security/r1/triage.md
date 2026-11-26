# Triage: r1

## Warnings

- ran_in_app is yes but the R-5 commit is unknown (no usable at: in docs/process/reviews/fix-deps-security/decisions.md); run R-5 again if this change alters what a user sees

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
- .github/workflows/ci.yml — full: Read lines 1-565, all seven setup-node hunks and the mcp-server job.; full: Read the whole file (565 lines).
- addons/intelligence/Dockerfile.test — full: Read lines 1-74.; full: Read the whole file.
- addons/intelligence/requirements.txt — full: Read lines 1-54.; full: Read the whole file.
- addons/knowledge/requirements.txt — full: Read lines 1-14.; full: Read the whole file.
- backend/requirements.txt — full: Read lines 1-15.; full: Read the whole file, plus requirements-dev.txt, which includes it.
- frontend/Dockerfile — full: Read lines 1-46.; full: Read the whole file.
- frontend/package.json — full: Read lines 1-65.; full: Read the whole file.
- frontend/pnpm-lock.yaml — partial: Read the importer section, lines 40-139, in the file. The remaining changed hunks were read only as shown in the supplied diff.; partial: Reviewed only the changed hunks shown in the supplied diff (importers block, changed package and snapshot entries). The file was not opened with Read, and unchanged regions were not read.
- frontend/src/components/DuplicatesSection.tsx — partial: Lines 135-184: the changed hunk, the start of the enclosing DuplicateGroupCard and handleDelete.; partial: Read lines 135-184: the DuplicateGroupCard state, the filesToDelete memo and handleDelete. Did not read the rest of the JSX.
- frontend/src/components/Sidebar.tsx — partial: Lines 90-149: the changed memo and its consumer useSidebarSectionOrder (read separately).; partial: Read lines 85-154 around the availableSections memo, plus useSidebarSectionOrder.ts:29-64.
- frontend/src/components/epub/EpubPreview.tsx — partial: Lines 95-144: the changed destructure and focusBook.; partial: Read lines 95-154 around focusBook and closePanel.
- frontend/src/components/folder/useFolderFiles.ts — partial: Lines 150-239: the changed runNow block and its immediate consumers (modified, rangeImpossible).; partial: Read lines 150-239: the runNow state and its consumers. Did not read the rest of the hook.
- mcp-server/package.json — full: Read lines 1-29.; full: Read the whole file.
- mcp-server/pnpm-lock.yaml — partial: Read the importer section, lines 1-40. The other hunks were read only as shown in the supplied diff.; partial: Reviewed only the changed hunks shown in the supplied diff. The file was not opened with Read.

Test files:
- addons/intelligence/tests/ocr_fixtures.py — partial: Lines 1-90: the changed _pillow_modules, real_pillow and pillow_real, and the first caller, picture().; partial: Read lines 1-90, which cover the changed _pillow_modules, real_pillow and pillow_real in full.
- backend/tests/test_setup_token.py — partial: Lines 1-150: includes the changed _route_entries and the route-list test.; partial: Read lines 1-150, which cover the changed _route_entries and its test in full.
- backend/tests/test_startup_lifespan.py — partial: Lines 90-149: the changed _paths and its first use.; partial: Read lines 60-179, plus a grep of every _paths call site.
- mcp-server/src/__tests__/write.test.ts — partial: Lines 1-40 (the imports, including the new zod import) and the changed add_comment hunk from the supplied diff.; partial: Read lines 300-339 (the changed test). The import hunk was seen only in the diff.
- tests/test_ci_browser_jobs.py — partial: Lines 1-135: includes the changed Node 24 test and its helpers.; partial: Read lines 1-130, which cover the changed Node test in full.

## Unspecified behavior, recorded

- claude-read: With lxml 6.1.3 / lxml_html_clean 0.4.6 / bleach 6.4.0, a knowledge clip saved from pasted HTML no longer has the blank line between a leading text line and the following heading in the stored Markdown.
  - F3 × I1 = 3, claude-read: Clipping pasted HTML that starts with a text line before a heading produces a slightly different .md file. decisions.md (claimed, not verified by me) reports no visible rendering difference and records this as needing the author's decision.
  - F3 × I2 = 6, claude-verify: Saving a knowledge clip from pasted HTML that starts with a text line followed by a heading stores Markdown without the blank line, a small formatting change the user may notice in the source view.
- claude-read: The knowledge addon image now prints a urllib3 PySocks DependencyWarning on import, which the old image did not.
  - F10 × I1 = 10, claude-read: Every knowledge container start adds a warning line to the logs, according to decisions.md (claimed). Nothing user-visible changes.
  - F2 × I1 = 2, claude-verify: Starting the knowledge addon container logs a harmless urllib3 PySocks DependencyWarning that only appears in logs.
- claude-read: The sidebar's availableSections memo now recomputes whenever the drive path string changes, not only when a drive becomes present or absent, so the section order list gets a new identity on every drive switch.
  - F5 × I1 = 5, claude-read: Switching drives recomputes mergeOrder in useSidebarSectionOrder, which yields the same ids. decisions.md check 4 reports that the order survives drive round trips.
  - F4 × I1 = 4, claude-verify: Switching drives gives the sidebar section list a new identity and causes an extra recompute or re-render that the user cannot see.
- claude-read: MCP tool argument validation errors are now produced by zod 4, so the error text an MCP client sees for an out-of-range or malformed argument differs from zod 3's.
  - F1 × I1 = 1, claude-read: An MCP client that passes an invalid argument, such as a comment body over 1000 characters, gets a differently worded validation error. The cap itself is still enforced (write.test.ts:327-331).
  - F1 × I2 = 2, claude-verify: When an MCP client sends a malformed or out-of-range argument, it sees zod 4's error wording instead of zod 3's, and the call is rejected either way.
- claude-deep: With lxml 6.1.3, lxml_html_clean 0.4.6 and bleach 6.4.0, a pasted-HTML clip saved by the knowledge addon no longer has a blank line between a leading text line and the following Markdown heading.
  - F2 × I1 = 2, claude-deep: Triggered when the user saves a clip whose HTML starts with a text line before a heading. The stored .md file differs byte-wise from what develop wrote, but decisions.md reports that it renders identically. The author recorded this as needing their decision.
  - F3 × I2 = 6, claude-verify: Saving a pasted-HTML clip with a leading text line and then a heading loses the blank line before the heading in the stored Markdown.
- claude-deep: The frontend container on Node 24 logs a DEP0060 (util._extend) deprecation warning at startup from http-proxy.
  - F1 × I1 = 1, claude-deep: Printed once each time the frontend container starts; the user only sees it in the container logs.
  - F2 × I1 = 2, claude-verify: Each start of the frontend container logs a DEP0060 util._extend deprecation warning from http-proxy, visible only in logs.
- claude-deep: The knowledge image built from the new pins prints a urllib3 PySocks DependencyWarning on import, which the old image did not.
  - F1 × I1 = 1, claude-deep: Printed when the knowledge container starts; the user only sees it in the logs.
  - F2 × I1 = 2, claude-verify: Importing the knowledge image prints a PySocks DependencyWarning in the logs, with no functional effect.

## Findings

A: 0
B: 6
C: 0

### claude-deep:CD-1 — bucket B, MEDIUM, open

Claim: The four addon repositories' CI workflows, including those of the intelligence and knowledge commits this change pins, still set up Node 20. They run core's develop frontend lockfile, which now resolves packages whose declared engines exclude Node 20.
Impact: Once this lands on develop, every addon CI run (`frontend` and `frontend-shards` jobs) installs core's lockfile under Node 20. The new lockfile carries isomorphic-dompurify 3.23.0 (engines ^22.22.2 || ^24.15.0, marked deprecated for exactly this break), jsdom 30.1.3 (^22.22.2 || ^24.15.0) and undici 8.13.1 (>=22.19.0). MarkdownPreview imports isomorphic-dompurify, which loads jsdom 30 and undici 8 in vitest's Node runtime. pnpm has no engine-strict setting here, so the install only warns, and the failure, if any, surfaces at test runtime. The likely result is red addon CI unrelated to the addon's own change, or a suite exercising the sanitizer on an unsupported runtime. Core's own CI and images moved to Node 24, so core does not see this.
Evidence: addons/intelligence/.github/workflows/ci.yml:150 and :246 have `node-version: 20` with `cache-dependency-path: core/frontend/pnpm-lock.yaml`; this is the submodule at the SHA the commit bumps to. addons/knowledge/.github/workflows/ci.yml:147,:243 (also bumped), addons/cloud-sync/.github/workflows/ci.yml:127 and addons/media_import/.github/workflows/ci.yml:176,:272 all have node-version 20. .github/workflows/ci.yml:65-67 states that the four addon repositories call `pnpm test` against core's develop tip. In frontend/pnpm-lock.yaml (diff), isomorphic-dompurify@3.23.0 has `engines: {node: ^22.22.2 || ^24.15.0 || >=26.0.0}` plus a deprecated note, jsdom@30.1.3 has the same range, and undici@8.13.1 has `>=22.19.0`. frontend/pnpm-workspace.yaml has no engine-strict. frontend/src/components/MarkdownPreview.tsx imports isomorphic-dompurify.
Repro: not_reproduced. I only read the files: an addon CI run on Node 20 against this lockfile was not executed, so whether it fails at install, at import, or not at all is unconfirmed.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In the intelligence and knowledge submodule commits that this change pins, and in cloud-sync and media_import, change `node-version: 20` to 24 in the addon CI workflows, or pin isomorphic-dompurify to a release that still supports Node 20 until they move.

</details>

### claude-read:R1 — bucket B, MEDIUM, open

Claim: The addon repositories' CI workflows still install and test core develop's frontend on Node 20, but core's frontend lockfile now resolves runtime dependencies whose declared engines exclude Node 20.
Impact: After this merges to develop, CI for every addon that tests against core's frontend (intelligence, knowledge, media_import, cloud-sync) runs on an engine the dependencies do not support. The frontend suite there can fail at import or behave differently. Either way, an addon PR's red or green result stops reflecting the addon's own change. The intelligence and knowledge pointers bumped by this commit did not update their workflows.
Evidence: addons/intelligence/.github/workflows/ci.yml:148-152 and :244-248 check out `ref: develop` of core and use `node-version: 20` with `cache-dependency-path: core/frontend/pnpm-lock.yaml`. addons/knowledge/.github/workflows/ci.yml:147,243, addons/media_import/.github/workflows/ci.yml:176,272 and addons/cloud-sync/.github/workflows/ci.yml:127 also use Node 20. The new frontend/pnpm-lock.yaml pins isomorphic-dompurify@3.23.0 with engines `^22.22.2 || ^24.15.0 || >=26.0.0`, marked deprecated with 'pin 3.19.0 for Node < 22.22.2'. That pulls in jsdom@30.1.3 (same engines) and undici@8.13.1 (`>=22.19.0`). frontend/src/components/MarkdownPreview.tsx:21 imports isomorphic-dompurify. frontend/vitest.config.ts:67-72 has no alias for it, and at least 8 core test files render MarkdownPreview. Core's own ci.yml was moved to Node 24 at lines 46, 128, 187, 271, 328, 375 and 423, but these workflows were not.
Repro: not_reproduced. Expected: run an addon repository's `frontend-shards` job against core develop after merge. `pnpm install --frozen-lockfile` warns about the engine mismatch, and vitest imports jsdom 30 / undici 8 on Node 20 when it collects MarkdownPreview tests.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Move `node-version` to 24 in each addon repository's ci.yml (intelligence, knowledge, media_import, cloud-sync), and bump the pinned submodules, in the same change set as core's Node 24 move.

</details>

### claude-deep:CD-2 — bucket B, LOW, open

Claim: The Node 24 requirement is pinned by a test at only 2 of the 7 setup-node sites in ci.yml, and nothing checks the node:24-alpine base images in frontend/Dockerfile.
Impact: The lockfile now needs Node >=22.22.2 or >=24.15 at runtime for the sanitizer path. Reverting any of the five untested setup-node sites, or a Dockerfile stage, to 20 fails no test. The `images` job only builds the frontend image and never runs it, so a server-side import failure of isomorphic-dompurify under an older runtime would not be caught.
Evidence: tests/test_ci_browser_jobs.py:118-125 parametrizes only BROWSER_JOBS (frontend-components, frontend-layout-epub). The setup-node sites in the frontend, frontend-coverage, frontend-static, frontend-shuffled and mcp-server jobs (.github/workflows/ci.yml:46,128,187,271,423) are unchecked. frontend/Dockerfile:1,28,32 is unchecked. ci.yml:560-561 builds the image without running it.
Repro: Mutation in thought: set ci.yml:46 to `node-version: 20`. No test in tests/ reads that job's setup-node step, so the suite stays green.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Parametrize the Node-version assertion over every job with a setup-node step, or assert that all setup-node steps share one version.

</details>

### claude-deep:CD-3 — bucket B, LOW, open

Claim: The only test of the per-run search clock asserts the last listing request, so it cannot detect a request built from the previous run's clock, which the new render-time state update exists to prevent.
Impact: A refactor that moves the clock reset into a useEffect would commit one render with the stale `modifiedNow`. That render would fire a listing or semantic request with the old relative cutoff (for example `modified:<1y` resolved against yesterday), and every test would still pass. In the UI this shows as a transient or wrong result set when the user changes the query after time has passed.
Evidence: frontend/src/components/folder/useFolderFiles.ts:185-192 adjusts runNow during render; the comment says this is so that no render commits a request built from the previous run's clock. frontend/src/components/folder/__tests__/useFolderFiles.modified.test.tsx:274-286 checks only `listingModified().at(-1)`, waits until the last call matches, and never asserts that every call after the rerender carries the new cutoff.
Repro: Mutation in thought: replace the render-time `setRunNow(...)` with `useEffect(() => setRunNow({key: runKey, now: Date.now()}), [runKey])`. The first commit after the rerender sends `lt:${NOW-365d}` and the second sends `lt:${NOW+1d-365d}`. `.at(-1)` matches, so the test passes and the mutant survives.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> After the rerender, assert that every listing and fetchHits call made after the q change carries the new cutoff, for example by clearing the mocks before the rerender and checking all calls.

</details>

### claude-deep:CD-4 — bucket B, LOW, open

Claim: After the move to zod 4 and MCP SDK 1.32, no test asserts the JSON Schema that tools/list advertises for each tool's arguments, and the R-5 app check skipped the mcp-server.
Impact: If the SDK's zod-to-JSON-Schema path produced an empty or degraded schema for zod 4 shapes, MCP clients would see tools with no declared arguments. Calls would still validate server-side, so the server tests stay green while an assistant cannot discover the parameters. Neither the existing tests nor R-5 would notice.
Evidence: mcp-server/src/server.ts:75-83 passes `tool.inputSchema` (raw zod shapes) to registerTool. mcp-server/src/__tests__/toolMetadata.test.ts:118 reads listTools() but contains no `inputSchema`/`properties` assertion (grep). The mcp-server/pnpm-lock.yaml diff still resolves zod-to-json-schema@3.25.2 against zod@4.6.7. docs/process/reviews/fix-deps-security/decisions.md:111 says 'The mcp-server, which was skipped.'
Repro: not_reproduced (node_modules is absent, so the SDK's conversion code could not be read).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a toolMetadata assertion that each listed tool's inputSchema.properties keys equal the keys of its zod shape, and that required fields are listed.

</details>

### claude-read:R2 — bucket B, LOW, open

Claim: SPEC-CORE-149 invariant I9 and item 3 still say the browser jobs run on Node 20, while the test that cites I9 now asserts Node 24.
Impact: A reader who checks the test against its cited invariant finds a contradiction. Restoring the spec's value means changing the test and ci.yml back to Node 20, and that version cannot run the new lockfile's jsdom 30 / isomorphic-dompurify 3.23 dependencies.
Evidence: docs/specs/ci-browser-container.md:45-51 says 'sets up pnpm and Node 20 … `setup-node` puts Node 20 first on `PATH`, so pnpm and the tests run on Node 20'. docs/specs/ci-browser-container.md:226 says 'I9. The browser jobs run their tests on Node 20'. tests/test_ci_browser_jobs.py:118-123 says '# SPEC-CORE-149 I9, item 3: Node 24' and asserts `== "24"`.
Repro: Read the two files side by side.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the Node-version wording from SPEC-CORE-149 item 3 and I9, or record a revision to Node 24, so that the spec no longer pins Node 20.

</details>

## Not verified

- claude-deep: Whether pnpm install and vitest actually fail under Node 20 with the new lockfile (CD-1). I ran nothing.
- claude-deep: The MCP SDK 1.32 zod-4 JSON Schema conversion, because mcp-server/node_modules is absent.
- claude-deep: Whether the submodule working trees equal the pinned SHAs 2f82f47 (intelligence) and 244d875 (knowledge). decisions.md records the in-app run on intelligence d6e2909 and knowledge 329a379.
- claude-deep: Whether Pillow 13 removed or only deprecated Image.getdata, and the pillow-heif 1.x API changes, beyond the register_heif_opener call sites found.
- claude-deep: FastAPI 0.165's timing of yield-dependency teardown for StreamingResponse handlers (files.py:855-958 holds get_db). The engine pool is pool_size=20 and max_overflow=40 (database.py:15-27), and its comment already assumes a session held for the whole stream.
- claude-deep: Whether effective_route_contexts flattens routers nested more than one level deep.
- claude-deep: The full contents of both lockfiles beyond the changed hunks in the supplied diff.
- claude-read: No installed site-packages exist in the tree, so I could not confirm API removals or behavior changes in FastAPI 0.165, starlette 1.x, Pillow 13, pillow-heif 1.9, PyJWT 2.15, python-multipart 0.0.34, lxml 6, bleach 6.4 or zod 4.
- claude-read: Whether vitest on Node 20 actually fails when importing isomorphic-dompurify 3.23.0 / jsdom 30 / undici 8 (R1 is not_reproduced).
- claude-read: Route-matching precedence between in-process addon routers and addon_proxy under FastAPI's new router inclusion.
- claude-read: Compatibility of trafilatura 1.12.2 and readability-lxml 0.8.1 with lxml 6.1.3, and of whisperx/open-clip-torch with Pillow 13. I relied on decisions.md's R-5 claims only.
- claude-read: The full frontend/pnpm-lock.yaml and mcp-server/pnpm-lock.yaml. I read only the importer sections and the hunks in the supplied diff.
- claude-read: The R-5 evidence in decisions.md (screenshots and logs under /private/tmp) is cited as claimed, not verified.
- claude-read: No tests were run; I have only Read/Glob/Grep.
- claude-verify: Did not run any addon CI job on Node 20 to confirm that jsdom 30 or undici 8 actually fail at runtime there.
- claude-verify: Did not count the core test files that render MarkdownPreview (claimed at least 8).
- claude-verify: Did not run the knowledge clip conversion or containers to observe the unspecified behaviors.
- claude-verify: Did not check whether the MCP SDK 1.32 advertised JSON Schema actually differs from before.

TOTAL: 6 findings
