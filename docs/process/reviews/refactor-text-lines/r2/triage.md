# Triage: r2

## Trajectory

This run:
- claude-read: One code fix round so far: 9de832c87. It merges `content === null` into the existing loading branch and moves the error branch ahead of it. This adds no new state, prop or prediction. It widens one existing guard so TextLines only mounts with loaded text, and it removes the `content ?? \"\"` fallback, so a code path was removed rather than added. No earlier fix round exists for it to repeat, and nothing so far suggests the design is being patched. The other two commits (8040bfe87, 88e897df4) only record reviews.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 2
C: 0

### claude-read:F1 — bucket B, LOW, rejected

Claim: No test checks that TextPreview still marks and scrolls to a `highlight` term after the text loads. The only highlight test checks that nothing scrolls while loading.
Impact: A later change could stop search-term highlighting in every text viewer and the suite would stay green. Two examples: dropping the `useHighlightPassage` call from TextLines, or passing `ready=false`. The upcoming plain-text Read view (I6) will reuse TextLines and relies on this behaviour.
Evidence: frontend/src/components/__tests__/TextPreview.test.tsx:42-57 is the only test that passes `highlight`. It asserts `scrollIntoView` is not called while fetch never resolves. A grep of that file for `highlight|scrollIntoView` finds nothing else. TextLines.tsx:86 `useHighlightPassage(preRef, highlight, true)` is the only thing that applies the mark.
Repro: Mutation (by reading): delete `useHighlightPassage(preRef, highlight, true);` in TextLines.tsx. The new test still passes because nothing scrolls, and the other tests pass no highlight. So no test fails.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a test that resolves fetch with text containing the term and asserts a `mark.ask-citation-highlight` appears and `scrollIntoView` is called once.

</details>

### claude-read:F2 — bucket B, INFO, open

Claim: The highlight hook's `scrolledRef` now lives in TextLines, which unmounts during every load. If TextPreview's `fileId` changes while `highlight` stays the same, the page now scrolls to the term again. Before the extraction it did not, because the ref survived in TextPreview and was reset only when the quote changed.
Impact: Only reachable if FilePreview reuses one TextPreview instance across files with the same highlight. FilePreview.tsx:236 renders TextPreview with no key, so it depends on whether the parent remounts per file. The result would be an extra scroll to the mark on the new file, which is arguably the more correct behaviour. Nothing silently breaks.
Evidence: useHighlightPassage.ts:65-69 keeps `scrolledRef` per hook instance and resets it only on a change of `quote`. TextPreview.tsx:152-158 returns the loading block whenever `loading || content === null`, which unmounts TextLines (TextLines.tsx:83-86) on each fetch. FilePreview.tsx:236-242 renders `<TextPreview fileId={file.id} …>` with no key.
Repro: not_reproduced (by reading only; I did not trace whether FilePreview's parent remounts per file)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I could not run the test suite or the build. Whether the new test passes under jsdom (Element.prototype.scrollIntoView stubbing) was reasoned, not run.
- claude-read: Whether FilePreview's parents remount TextPreview per file (this bears on F2).
- claude-read: Whether the knowledge addon's capture action reacts to the null controller during loading (r1 F3).
- claude-verify: I could not run any test. Whether code-viewer-desktop.spec.ts passes at this commit, or runs in CI, is not checked.
- claude-verify: I did not read the origin/develop version of TextPreview.tsx directly. The prior hook placement and the ready flag come from the r1 review record.
- claude-verify: I did not check every ancestor of FilePreview for a key that would remount TextPreview on a file change.
- claude-verify: Other invariants (I1-I5, I7, I9, I10) are outside the findings and were not reviewed.

TOTAL: 2 findings
