# Triage: r1

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

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

Note: Each PDF full-screen page mounts its own HighlightControls, so there are several selectionchange and scroll listeners.; The remove control is dismissed on any window scroll (capture phase).; Mark wrappers are unwrapped and `normalize()` is called on the parent on every redraw, which could merge adjacent text nodes that other code (in-file find) holds references to.
- claude-read: Each PDF full-screen page mounts its own HighlightControls, so there are several selectionchange and scroll listeners.
- claude-read: The remove control is dismissed on any window scroll (capture phase).
- claude-read: Mark wrappers are unwrapped and `normalize()` is called on the parent on every redraw, which could merge adjacent text nodes that other code (in-file find) holds references to.
- claude-verify: HighlightControls.tsx, types/raw.d.ts, the TextLines key change and the DEFERRED_ARRANGEMENTS bootstrap are not in the touch points.

### unspecified_behavior

Note: HighlightControls.tsx, types/raw.d.ts, the TextLines key change and the DEFERRED_ARRANGEMENTS bootstrap are not in the touch points.
- claude-read: Each PDF full-screen page mounts its own HighlightControls, so there are several selectionchange and scroll listeners.
- claude-read: The remove control is dismissed on any window scroll (capture phase).
- claude-read: Mark wrappers are unwrapped and `normalize()` is called on the parent on every redraw, which could merge adjacent text nodes that other code (in-file find) holds references to.
- claude-verify: HighlightControls.tsx, types/raw.d.ts, the TextLines key change and the DEFERRED_ARRANGEMENTS bootstrap are not in the touch points.

## Findings

A: 0
B: 5
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: The new component frontend/src/components/HighlightControls.tsx is not in the touch-point list, yet it holds the whole UI logic: selection reading, the Highlight and Remove controls, the click handler on the container, the window scroll listener, and message display.
Impact: This is the biggest unplanned surface and it sits next to the quote button. It registers a document selectionchange listener and a capture-phase window scroll listener per mounted instance, and in the PDF full-screen viewer there is one instance per page. The touch-point list gave reviewers no cue to check I9 (no cover of the quote button, no change to capture) in this file.
Evidence: frontend/src/components/HighlightControls.tsx:1-288 (new file). Touch points name only MarkdownPreview, TextLines, PdfPreview and PdfFullscreenViewer as hosts of the controls.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add HighlightControls.tsx to the touch points.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: The diff changes the React keys of TextLines line spans from the index to `${i}:${line}`, which is not a listed touch point and is not needed to draw marks.
Impact: Any line whose text changes now remounts its span. For a large text file with highlights this adds remount cost and discards DOM nodes. It exists to drop the stale split-text nodes left by marks, so the unmark/redraw cycle interacts with React reconciliation in a way nothing documents. A wrong key scheme could let React reuse a node that the mark code has split, though the added tests do not show that happening.
Evidence: frontend/src/components/TextLines.tsx:145 and :155 (`key={`${i}:${line}`}` replacing `key={i}`). Spec I8 and the text-scroll behaviour of SPEC-CORE-050 are what this could touch.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F3 — bucket B, INFO, open

Claim: The shared type file frontend/src/types/index.ts (Highlight, HighlightInput) and a new global declaration file frontend/src/types/raw.d.ts (`*?raw` module) are not in the touch points.
Impact: raw.d.ts adds an ambient `*?raw` module declaration to the whole frontend type space. It exists only for the e2e fixture's worker import, but it applies to production code as well and silently types every `?raw` import in the app.
Evidence: frontend/src/types/raw.d.ts:1-4 (new). frontend/src/types/index.ts:342-358 (new interfaces).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F4 — bucket B, INFO, open

Claim: The shared e2e bootstrap frontend/e2e-components/fixtures/app.tsx now defers setting `data-arrangement` for the arrangement `persistent-highlights` (DEFERRED_ARRANGEMENTS). The touch points list `fixtures` only generically, and this is a change to code shared by all arrangements.
Impact: A future arrangement added to DEFERRED_ARRANGEMENTS that never sets the attribute makes the spec wait forever. The other arrangements' behaviour is unchanged for now. The fixture also monkey-patches `window.fetch` and `XMLHttpRequest.prototype.open` globally. Both patches are confined to the fixture page.
Evidence: frontend/e2e-components/fixtures/app.tsx:2047-2060; fixtures/persistentHighlights.tsx:46-62 and :108-125.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F5 — bucket B, INFO, open

Claim: The new e2e spec header still says the fixture arrangement 'does not exist yet'. The spec was written before the fixture, so the comment is stale.
Impact: A reader could be led to add a second fixture.
Evidence: frontend/e2e-components/persistent-highlights-desktop.spec.ts:2-14
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the sentence.

</details>

## Not verified

- claude-read: I did not run any test or the browser e2e specs.
- claude-read: I did not read the repository files outside the supplied diff, such as documentCapture.ts or the rules documents.
- claude-read: The effect of the TextLines key change on scroll restoration was not verified.
- claude-read: I reviewed the whole-branch diff as supplied, not only the single commit 1bcae5b29, so I cannot say which unplanned places belong to the drag-select fix.
- claude-verify: Whether the TextLines key change affects scroll position (I8)
- claude-verify: Backend routes and invariants I1-I10
- claude-verify: HighlightControls.tsx logic beyond the file's existence
- claude-verify: Whether the changes in F1-F4 are covered by the spec

TOTAL: 5 findings
