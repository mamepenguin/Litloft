# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- needs_human_record claude-read:F4
- unspecified_behavior
- unspecified_behavior

## Needs a human

### needs_human_record (claude-read:F4)

Question: Several existing gate and test files are edited that the touch points do not name: the allowlists in toolbarMenuHome.test.ts and section-rows.test.tsx, the FIXTURE_COUNT in spec-viewport.spec.ts, and the existing sidebar tests SidebarActiveRow, SidebarAddonNav, SidebarDriveSwitcher, fixedRows and libraryRowActive.
Impact: Guard tests were widened to accept the new files (a hidden scrollbar in ShelfBlock, ToolbarMenu importers), so those gates no longer protect those files; the sidebar tests were rewritten to expect the new row.
Evidence: the diff hunks of the files named above
Note: I did not open the named test and gate files or their diffs, so I cannot confirm each edit. The claim is plausible, since the new sidebar row and registry would force allowlist and fixture-count changes.

### unspecified_behavior

Note: The Video entry appears in the page-jump list.; ToolbarMenu gained label and truncation modes and disabled radio rows.
- claude-read: The Video entry appears in the page-jump list.
- claude-read: ToolbarMenu gained label and truncation modes and disabled radio rows.
- claude-verify: The change adds a Video entry to the page-jump feature, which the spec does not mention.
- claude-verify: The shared ToolbarMenu component now has new props and a changed button class, which affects every toolbar menu in the app.

### unspecified_behavior

Note: The change adds a Video entry to the page-jump feature, which the spec does not mention.; The shared ToolbarMenu component now has new props and a changed button class, which affects every toolbar menu in the app.
- claude-read: The Video entry appears in the page-jump list.
- claude-read: ToolbarMenu gained label and truncation modes and disabled radio rows.
- claude-verify: The change adds a Video entry to the page-jump feature, which the spec does not mention.
- claude-verify: The shared ToolbarMenu component now has new props and a changed button class, which affects every toolbar menu in the app.

## Findings

A: 0
B: 5
C: 0

### claude-read:F1 — bucket B, MEDIUM, open

Claim: The shared ToolbarMenu.tsx component is edited (new showLabel and truncateValue props, a changed button class, MenuRadioGroup options gain detail, disabled and title, and the option key changes from label to index:label), and this file is not in the touch-point list.
Impact: Every existing ToolbarMenu and MenuRadioGroup consumer (sort, filter and condition menus) shares this code. The key change and the new disabled styling are not covered by any consumer test in the diff, so a silent regression in other menus is possible.
Evidence: frontend/src/components/ToolbarMenu.tsx hunks at ~134-200 and ~226-290; the diff only adds allowlist entries in toolbarMenuHome.test.ts
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add ToolbarMenu to the touch points, or move the new behaviour into a videoapp-local wrapper.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: frontend/src/lib/pageJump.ts is edited to spread builtinApps into FIXED_JUMPS, which adds a Video entry to the page-jump feature; the touch-point list does not name it.
Impact: A new jump destination appears in the page-jump UI for every drive, and the pageJump test's expected list was edited to match. This extends I11 ('appears after Library') to a second surface the spec never mentions.
Evidence: frontend/src/lib/pageJump.ts FIXED_JUMPS hunk; frontend/src/lib/__tests__/pageJump.test.ts adds 'app-video'
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F3 — bucket B, LOW, open

Claim: The existing getDriveFiles client path in api.ts is refactored (filter appending extracted into appendListingFilters) and the ApiStatusError constructor signature changes; the touch point names only getShelves.
Impact: Every listing request from the frontend now goes through the extracted function, and every ApiStatusError construction goes through the changed constructor; this is the client-side counterpart of I7 with no named coverage.
Evidence: frontend/src/lib/api.ts hunks around getDriveFiles and class ApiStatusError
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F4 — bucket B, INFO, open

Claim: Several existing gate and test files are edited that the touch points do not name: the allowlists in toolbarMenuHome.test.ts and section-rows.test.tsx, the FIXTURE_COUNT in spec-viewport.spec.ts, and the existing sidebar tests SidebarActiveRow, SidebarAddonNav, SidebarDriveSwitcher, fixedRows and libraryRowActive.
Impact: Guard tests were widened to accept the new files (a hidden scrollbar in ShelfBlock, ToolbarMenu importers), so those gates no longer protect those files; the sidebar tests were rewritten to expect the new row.
Evidence: the diff hunks of the files named above
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F5 — bucket B, INFO, open

Claim: backend/app/main.py (router registration) and docs/user-guide/overview.md (an added line) are edited, and the touch-point list names neither; the new video.md page is named but the overview edit is not.
Impact: A minor unplanned reach. The main.py edit is implied by the 'new router' option, and the overview.md line only adds a link.
Evidence: backend/app/main.py import and include_router lines; docs/user-guide/overview.md hunk
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not read the full repository files, only the diff.
- claude-read: I did not review backend correctness (I1 to I5) in depth.
- claude-read: I did not run any tests.
- claude-verify: F4 test and gate file edits
- claude-verify: The MenuRadioGroup hunk in ToolbarMenu.tsx
- claude-verify: The ApiStatusError constructor change
- claude-verify: Whether the invariants hold behaviourally (backend shelves logic)

TOTAL: 5 findings
