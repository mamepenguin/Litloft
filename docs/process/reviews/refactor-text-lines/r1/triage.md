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

Note: The highlight hook now runs before content has loaded and can scroll the empty <pre> into view (F2).; The capture controller is not published while the file is loading or at the Load prompt, and a new store is published after each load (F3).
- claude-read: The highlight hook now runs before content has loaded and can scroll the empty <pre> into view (F2).
- claude-read: The capture controller is not published while the file is loading or at the Load prompt, and a new store is published after each load (F3).
- claude-verify: The highlight effect now runs on an empty pre on the first render or right after Load, which causes an early scrollIntoView and a dev console warning (F2).
- claude-verify: The document-capture controller is null during the prompt, loading and error states, and a new store instance is published each time TextLines mounts (F3).

### unspecified_behavior

Note: The highlight effect now runs on an empty pre on the first render or right after Load, which causes an early scrollIntoView and a dev console warning (F2).; The document-capture controller is null during the prompt, loading and error states, and a new store instance is published each time TextLines mounts (F3).
- claude-read: The highlight hook now runs before content has loaded and can scroll the empty <pre> into view (F2).
- claude-read: The capture controller is not published while the file is loading or at the Load prompt, and a new store is published after each load (F3).
- claude-verify: The highlight effect now runs on an empty pre on the first render or right after Load, which causes an early scrollIntoView and a dev console warning (F2).
- claude-verify: The document-capture controller is null during the prompt, loading and error states, and a new store instance is published each time TextLines mounts (F3).

## Findings

A: 0
B: 3
C: 0

### claude-read:F2 — bucket B, LOW, open

Claim: The extraction changes useHighlightPassage's ready flag from `content !== null` to a constant `true`. On TextPreview's first render (confirmed, loading not yet set, content null), TextLines mounts with an empty <pre> and the highlight effect already runs against it.
Impact: When a text file is opened with a search `highlight` term, the hook finds no match in the empty <pre>, smooth-scrolls that empty container into view and, in dev, logs a 'no DOM match' warning. TextPreview's fetch effect then sets loading, which unmounts TextLines. After the load, TextLines remounts and scrolls to the real mark. The user sees an extra scroll before the correct one. The final highlight is still right.
Evidence: frontend/src/components/TextLines.tsx:84 `useHighlightPassage(preRef, highlight, true)`. Before the change, TextPreview called it with `content !== null`. TextPreview.tsx:96 `useState(false)` for loading, and :160-166 renders TextLines with `content ?? ""` whenever it is not loading, not in error and confirmed, which includes the first render before the fetch effect runs. Child effects run before the parent's, so useHighlightPassage.ts:94-97 reaches the no-range branch and calls container.scrollIntoView. The same applies to the Load click on a file over 1 MB.
Repro: not_reproduced (by reading the code: mount TextPreview with highlight='x' and a pending fetch; the old code skips the effect because ready is false, the new code calls scrollIntoView on the empty <pre> once)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In TextPreview, render TextLines only once content is non-null (for example `if (content === null) return the loading block`), or add a `ready` prop to TextLines that TextPreview sets to `content !== null`.

</details>

### claude-read:F1 — bucket B, INFO, open

Claim: The diff adds a new file, frontend/src/components/TextLines.tsx, and the touch-point list does not name it. The list names only TextPreview.tsx, saying the rendering 'is taken out as a component that takes text'.
Impact: No user-visible impact. A reviewer who audits the change by the touch-point paths would not see this new module, even though it now holds the line-numbered rendering, the decoration limits, the highlight hook and capture publishing for every TextPreview caller.
Evidence: diff: new file frontend/src/components/TextLines.tsx (135 lines). frontend/src/components/TextPreview.tsx:10 imports it and :12 re-exports MAX_DECORATED_LINES from it. The touch-point list has no TextLines entry, and no 'or a sibling' wording like the one textKind.ts gets.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `frontend/src/components/TextLines.tsx` (the extracted renderer) to the touch-point list next to TextPreview.tsx.

</details>

### claude-read:F3 — bucket B, INFO, open

Claim: The document-capture controller is now published only while TextLines is mounted. Before the change, TextPreview published it for the whole life of the component, including the loading state and the over-1 MB Load prompt.
Impact: While a file is loading or waiting at the over-1 MB prompt, the parent receives `null` instead of a store whose capture is null. On load, the parent gets null and then a new store, so any capture affordance keyed on the controller's presence may mount or unmount at different times than before. The decisions record observed no capture button before Load in either case, so no visible defect was found.
Evidence: frontend/src/components/TextLines.tsx:83 `useDocumentCapturePublisher(preRef, onDocumentCaptureController)`. TextLines is not rendered in TextPreview.tsx:127-158 (the prompt, loading and error branches). useDocumentCapturePublisher.ts:20-24 publishes on mount and sends null on unmount.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Whether any consumer of onDocumentCaptureController for TextPreview reacts visibly to the null-then-new-store sequence (I did not trace FileDetail's capture action).
- claude-read: Whether the smooth scroll in F2 is visible in a real browser before the remount; I reasoned it from the code and did not run it.
- claude-read: I could not run tests or the build. Whether git object b7d59e34 itself touches more than docs/process/reviews files was not checked beyond the shown diff.
- claude-verify: How the knowledge addon's capture action handles a null or replaced documentCaptureController (the addon code was not read).
- claude-verify: Whether the pre-change file in the main checkout exactly matches origin/develop. I used it as the base because I could not run git.
- claude-verify: Runtime behaviour under React StrictMode double effects. I could not run tests or the app.

TOTAL: 3 findings
