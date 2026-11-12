# Triage: r1

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

## Findings

A: 0
B: 7
C: 0

### claude-deep:CD-3 — bucket B, HIGH, open

Claim: The addons/knowledge gitlink is moved to f55f83458, a commit that, in the local refs I could read, exists only on a local branch and not on any remote ref of the Knowledge repository. The core code changes and the bump also ship together, although the touch points plan three separate PRs.
Impact: If f55f834 has not been pushed and merged, a fresh clone or CI checkout of core at this commit cannot run submodule update for addons/knowledge. Merging core would then pin an addon commit that never passed the addon repo's own CI.
Evidence: In the submodule gitdir (video_share/.git/worktrees/video_share-clips/modules/addons/knowledge), f55f834 appears only in refs/heads/feature/clips-app and the HEAD log ('feat(knowledge): add the Clips page...'). packed-refs lists refs/remotes/origin/main = a0bd155f0, the old gitlink, and no remote ref holds f55f834. The touch points say the gitlink is 'bumped after the addon PR merges' and that the core PR keeps it at develop's commit.
Repro: Read packed-refs and refs/heads in the submodule gitdir: origin/main is a0bd155, and f55f834 is on local feature/clips-app only. The remote refs may be stale because no fetch was run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Merge the Knowledge PR first, then bump the gitlink to the merged commit in a separate bump change, as the plan says. Keep the core PR's gitlink at a0bd155.

</details>

### claude-deep:CD-4 — bucket B, MEDIUM, open

Claim: The change bumps the gitlink but contains none of the bump step's other planned work. It adds no frontend/e2e-components measurements for D2, D4 or D7, and the SPEC-ADDON-100 and SPEC-ADDON-101 rows in INDEX.md stay 'approved'.
Impact: Regressions in the D2, D4 and D7 layout requirements are not tested in a real browser. In D2 the Clips primary action could lose its 44px icon-only size on a phone. In D4 a row's title or excerpt could wrap. In D7 the Include clips toggle could overflow at 390px. jsdom tests would pass in each case.
Evidence: A grep of frontend/e2e-components for clips/Clips/includeClips matches no Clips spec, only unrelated files. In docs/specs/INDEX.md the ADDON-100 and ADDON-101 rows read 'approved'.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the D2, D4 and D7 e2e-components specs and move the ADDON rows to implemented in the change that bumps the gitlink.

</details>

### claude-deep:CD-1 — bucket B, LOW, open

Claim: The diff changes backend/app/services/frontmatter.py by adding extract_origin and _MAX_ORIGIN_LEN, and the touch-point list does not name that module. The list allows only tagops.py or a sibling helper (origin.py); frontmatter.py is the shared parser.
Impact: No user-visible defect. frontmatter.py is one half of the twin-parser pair kept in sync by PR review (design-decisions.md:72). A reviewer working from the touch-point list would not compare this edit against addons/knowledge/app/services/frontmatter.py. The twin has no origin extractor. The parsing rules themselves are unchanged, so the two parsers do not drift on parsing today.
Evidence: backend/app/services/frontmatter.py:30 (_MAX_ORIGIN_LEN) and the new extract_origin after extract_valid_tags. backend/app/services/origin.py imports extract_origin and has_unreadable_frontmatter from it. .claude/rules/design-decisions.md:72 names both frontmatter.py implementations. A grep of addons/knowledge/app/services/frontmatter.py for 'origin' finds only a docstring sample at line 7.
Repro: Compare the files the diff changes with the Touch points list: 'backend/app/services/tagops.py, or a sibling helper' does not cover frontmatter.py.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add backend/app/services/frontmatter.py to the touch points, or move extract_origin into origin.py so the shared parser module is left alone.

</details>

### claude-read:R1-frontmatter-parser — bucket B, LOW, open

Claim: The diff edits backend/app/services/frontmatter.py (new extract_origin and _MAX_ORIGIN_LEN), a module that is not in the touch-point list, which names only tagops.py or a sibling helper for the origin projection.
Impact: No user-visible defect. A reader who uses the touch-point list to scope a review or the parser drift check would miss the change to the shared core frontmatter parser. .claude/rules/design-decisions.md:72 says this parser is kept in step with addons/knowledge/app/services/frontmatter.py only by PR review.
Evidence: diff: backend/app/services/frontmatter.py adds `_MAX_ORIGIN_LEN = 32` and `def extract_origin(content)`, which calls `parse(content).metadata.get("origin")`. The new helper backend/app/services/origin.py imports it. The touch points list `backend/app/services/tagops.py, or a sibling helper`. origin.py fits that description, but frontmatter.py is an existing shared module and is not listed. design-decisions.md:72 calls the parser a duplicated implementation whose drift is caught in review.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add backend/app/services/frontmatter.py (extract_origin) to the touch points, or move extract_origin into services/origin.py.

</details>

### claude-deep:CD-2 — bucket B, INFO, open

Claim: The diff edits existing guard tests and fixtures that the touch-point list does not name: test_database_migration_drive_scoped_file_path.py (the FILES_INDEXES table), SidebarDriveSwitcher.test.tsx (the fixture gains key), and Knowledge's reachability.test.ts and popup-dismissal.test.ts (the module counts go from 59 to 66 and from 18 to 19).
Impact: These are side effects of the planned changes, not defects. Both count guards exclude __tests__, and the 7 new modules (pages/clips.tsx and clips/*, one of which is the .ts file requests.ts) account for the new numbers exactly. The guards therefore still bite.
Evidence: addons/knowledge/frontend/__tests__/reachability.test.ts:66 skips __tests__ and messages, and :166 expects 19 .ts files. popup-dismissal.test.ts:62 skips __tests__ and *.test.*. backend/tests/test_database_migration_drive_scoped_file_path.py adds idx_files_drive_md_origin to FILES_INDEXES.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R1-existing-core-tests — bucket B, INFO, open

Claim: The diff edits two existing core test files that are not in the touch-point list: backend/tests/test_database_migration_drive_scoped_file_path.py (FILES_INDEXES gains idx_files_drive_md_origin) and frontend/src/components/sidebar/__tests__/SidebarDriveSwitcher.test.tsx (fixture entry gains `key`).
Impact: No user-visible defect. The first test pins the whole files index set after the drive-scoped file_path migration, so the new index changes an expectation outside the new SPEC-CORE-091 tests. The second follows from the new required AddonNavEntry.key field. Both are consequences of listed changes, but the list does not name them.
Evidence: diff: test_database_migration_drive_scoped_file_path.py line ~203 adds `"idx_files_drive_md_origin": ["drive", "md_origin"]`; SidebarDriveSwitcher.test.tsx line ~213 adds `key: "media_import"`. The touch points mention only new tests citing SPEC-CORE-091/092/093.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Note in the touch points that existing tests pinning the files index set and the AddonNavEntry shape are updated.

</details>

### claude-read:R1-knowledge-guard-tests — bucket B, INFO, open

Claim: The diff changes two Knowledge guard tests that are not in the touch-point list: __tests__/popup-dismissal.test.ts (FILE_COUNT 59→66) and __tests__/reachability.test.ts (module count 59→66, .ts count 18→19).
Impact: No user-visible defect. These are pinned counts that guard against orphaned or unscanned modules. Raising them is expected when 7 modules are added (pages/clips.tsx, five clips/*.tsx and clips/requests.ts). Because the list does not name them, a reviewer would not know to check that the new counts match the new files exactly.
Evidence: diff: addons/knowledge/frontend/__tests__/popup-dismissal.test.ts `const FILE_COUNT = 66;`; reachability.test.ts `expect(moduleFiles.size).toBe(66)` and `.ts` count `toBe(19)`. The touch points name only manifest.test.ts among Knowledge tests, plus jsdom tests citing SPEC-ADDON-100/101.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the two count-pinning guard tests among the Knowledge touch points.

</details>

## Not verified

- claude-deep: Whether f55f834 exists on the Knowledge remote: no fetch was run, so the local remote refs may be stale.
- claude-deep: What commit 79035747f contains on its own: I reviewed the branch-wide diff I was given, because I cannot run git.
- claude-deep: I ran no tests and checked no TypeScript compilation.
- claude-deep: Concurrency: I checked statically only. No concurrency modifier matched, and the scan/write race is the one the spec already records.
- claude-read: I ran no tests. I could not run commands.
- claude-read: I did not inspect the submodule commit f55f834 on disk to confirm that it is a merged Knowledge commit.
- claude-read: I did not search the whole frontend for other callers of isAddonNavRowActive or other consumers of AddonNavEntry.name used as a key.
- claude-read: I did not check whether DriveHome.tsx needs a change for the new entry key.
- claude-verify: Previous values of the guard-test counts (59 and 18); I could not run git diff.
- claude-verify: Whether f55f834 exists on the GitHub remote; I checked only local refs.
- claude-verify: Correctness of the invariants I1-I31 in the code; I verified only the listed findings.

TOTAL: 7 findings
