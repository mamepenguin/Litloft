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
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: ToolbarMenu now focuses its trigger on click for every caller and shape. In browsers that do not focus buttons on click (Safari), the Escape-to-close and focus behaviour of every toolbar menu changes.
- claude-read: ToolbarMenu now focuses its trigger on click for every caller and shape. In browsers that do not focus buttons on click (Safari), the Escape-to-close and focus behaviour of every toolbar menu changes.
- claude-verify: Clicking any ToolbarMenu trigger now focuses it explicitly (ToolbarMenu.tsx:199) for every shape. In browsers that don't focus a button on click, Escape now closes the menu where before it may not have.

### unspecified_behavior

Note: Clicking any ToolbarMenu trigger now focuses it explicitly (ToolbarMenu.tsx:199) for every shape. In browsers that don't focus a button on click, Escape now closes the menu where before it may not have.
- claude-read: ToolbarMenu now focuses its trigger on click for every caller and shape. In browsers that do not focus buttons on click (Safari), the Escape-to-close and focus behaviour of every toolbar menu changes.
- claude-verify: Clicking any ToolbarMenu trigger now focuses it explicitly (ToolbarMenu.tsx:199) for every shape. In browsers that don't focus a button on click, Escape now closes the menu where before it may not have.

## Findings

A: 0
B: 4
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: The ToolbarMenu trigger's onClick now focuses the trigger for every ToolbarMenu caller, a behaviour change outside the planned `quiet` shape touch point.
Impact: Every ToolbarMenu user (SortMenu, ArchiveToolbar, ViewMenu, PdfPreview, the Library sort menus) now moves focus to the trigger on click. Safari and WebKit do not focus a button on click, so Escape now closes these menus there where it did not before. The change looks harmless or even helpful, but no touch point or invariant covers it, and I15 only checks drawing.
Evidence: frontend/src/components/ToolbarMenu.tsx:196-201 adds `triggerRef.current?.focus()` to the shared onClick, which runs whatever the shape. The touch point lists only the `quiet` shape for ToolbarMenu.tsx. The new TargetMenu.addonKey.test.tsx sends Escape to `document.activeElement`, which seems to be why the line was added.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the focus change to the touch points (ToolbarMenu: trigger focus on click for every shape), or limit it to what the change needs.

</details>

### claude-read:R2 — bucket B, INFO, open

Claim: An existing test, frontend/src/components/videoapp/__tests__/VideoApp.states.test.tsx, was edited even though no touch point names it.
Impact: The assertion moved from `findByText(/main · 0/)` to finding the drive span and checking the parent's textContent. It still checks the same text, so nothing slips through, but this existing test was edited without being planned. The spec lists the existing tests that stay unedited, and this one is not among them.
Evidence: VideoApp.states.test.tsx around line 374. The edit follows from AppHeader.tsx splitting the scope into a drive span and a detail span, which breaks the single text node.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the VideoApp test that reads the scope text among the touch points.

</details>

### claude-read:R3 — bucket B, INFO, open

Claim: frontend/src/components/__tests__/componentFixtureParity.test.tsx gained the `app-header` arrangement, and no touch point names it.
Impact: None for a user. It is the required registration of the new e2e-components fixture, so it follows from the `frontend/e2e-components/` touch point, but it sits outside that directory.
Evidence: The diff adds "app-header" to the arrangement list in componentFixtureParity.test.tsx near line 325.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R4 — bucket B, INFO, open

Claim: frontend/src/components/readingapp/ReadingAppHeader.tsx and frontend/src/components/videoapp/VideoAppHeader.tsx are edited (doc comments on `actions`), and no touch point names them.
Impact: None for a user. Only comments change, and they now match the new placement of actions.
Evidence: In both files the `actions` JSDoc changed from 'Beside the Target button.' to 'Below the tabs on a phone, beside the Target at `sm` and wider.'
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run any test, unit or e2e, so I cannot say whether the suites pass.
- claude-read: I did not check whether the ToolbarMenu focus change alters an existing ToolbarMenu or popup-dismissal test's behaviour.
- claude-read: I did not check the rendered layout against the design artboards.
- claude-verify: I could not run git diff, so I could not compare against the exact develop versions of the files. That a file was touched comes from r1/classification.json, and its current content was read at HEAD.
- claude-verify: I did not run any tests or check the focus behaviour in a browser.
- claude-verify: I did not check invariants I1 to I15 beyond the four findings.

TOTAL: 4 findings
