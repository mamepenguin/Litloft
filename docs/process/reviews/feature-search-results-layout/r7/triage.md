# Triage: r7

## Trajectory

This run:
- claude-read: The commits since r6 do not show the design being patched. Most of them are develop work that the rebase brought in: the storyboard retry, the file Ask thread, and reading-app and header changes. That removed the unrelated submodule content r6 flagged (TP-1), rather than adding anything. The rounds on this branch itself mostly correct the record: SPEC-ADDON-081 is renumbered to 086, and the touch points are completed for ConditionMenu, MatchOverlay and the test registries. Earlier spec rounds removed state rather than adding it: the module-level probe cache was dropped, the sort/order URL ownership went out of scope, and the 'URL change closes …' rule was replaced by 'left as today'. The code-level additions are small and are not repeated across rounds: the saved-name truncation class and the switch width at 390 px. No round re-adds a branch, state or prediction that an earlier round had already added.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 1
C: 0

### claude-read:R7-1 — bucket B, LOW, open

Claim: The e2e-components arrangement that stands in for the search page renders SearchQueryHeader, FolderToolbar and PassageList with no horizontal padding around the header or the list. The real FolderBrowser wraps the field in PageHeader's `px-4` and the Passages list in a `px-4` content div, so the box-edge alignments the I10 cases assert (field.left == bar.left at 390 px, listRow.left == bar.left at 1280 px) hold only in the fixture.
Impact: No user-visible defect. The I1/I5/I10 browser checks measure a hand composition and not the page, so a padding or wrapper change in FolderBrowser (for example the Passages list losing its left inset, or the shelf being placed above the bar) would not fail them. The fixture's own comment says the padding was removed on purpose so that the field, bar and list line up against each other.
Evidence: frontend/e2e-components/fixtures/app.tsx SearchResultsBar: `<div className="min-w-0 pb-2 pt-5"><SearchQueryHeader …/>` with no PageHeader, and `<PassageList …/>` placed directly in the flex column. FolderBrowser.tsx:651-697 renders SearchQueryHeader as PageHeader's titleField (PageHeader: `<header className="flex flex-col gap-1 px-4 py-2">`), and the PassageList sits inside `<div className="px-4 pb-6 pt-1 sm:pb-8 sm:pt-4">`. search-results-bar.spec.ts asserts `Math.abs(m.field.left - m.bar.left) <= 1`, and search-results-bar-desktop.spec.ts asserts `Math.abs(m.listRow.left - m.bar.left) <= 1`. On the real page both differ by about 16 px, because bar.left is the padded box edge.
Repro: not_reproduced (read only). Mutation: move the shelf AddonSlot above FolderToolbar in FolderBrowser.tsx. No e2e-components case fails, because the fixture places its own stand-in shelf. Only the jsdom SearchPage.resultsBar order test would catch it.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Wrap the arrangement in the real PageHeader with SearchQueryHeader as titleField and put PassageList in the same padded content div FolderBrowser uses. Then measure alignment between the field, the first bar control and the list (content edges), not box edges.

</details>

## Not verified

- claude-read: I ran no unit or e2e test; all behaviour was read.
- claude-read: Whether PageHeader renders a TreeToggle or another leading element above the field on the search page when the tree is enabled (relevant to I1 on the real page).
- claude-read: The exact content of the submodule commit b0a5c01 beyond the FindModeSlot diff shown.
- claude-read: The fix diffs past the 600000-byte truncation point.
- claude-verify: Did not run Playwright or measure pixel values in a browser; the 16 px offset comes from the Tailwind px-4 class reading in the source.
- claude-verify: Did not check whether the e2e-layout HTML fixtures (search-header.html, passage-rows.html) model the real padding correctly.
- claude-verify: Did not verify the other invariants (I1-I9) beyond what R7-1 needed.

TOTAL: 1 findings
