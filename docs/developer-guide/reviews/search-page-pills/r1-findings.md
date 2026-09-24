# R1 findings: bdfc0e45e (feat/search-page-pills)

Reviewed at the fixed SHA `bdfc0e45e` in `/Users/libre/Sources/video_share-pdf-page-pills`. Parent: `b2d82556c`.
Baseline: 12 test files / 260 tests pass (the two changed test files, the parity and vocabulary detectors, GlobalSearch, ime-enter-guard, line-clamp-display, canonicalFileUrl, `app/files/[id]` page, RightPaneFile, FileDetailFullScreen, FileCard). `tsc --noEmit` is clean. `eslint` on the 4 touched files shows 0 errors (1 pre-existing `<img>` warning). The tree was restored after every mutation, and `git status` is clean at the end.

## Invariant check (R-0)

No path I found breaks invariants 1-6 in the code as written. Two of them rely on code no test holds (F1, F2, F3 below). The receiving side (invariant 6) is held: R1-R3 each killed.
- Page numbers are 1-based at the source (`addons/intelligence/app/extractors/pdf.py:170,249`). `PdfPreview` takes `initialPage` as 1-based (`PdfPreview.tsx:109,176`). No off-by-one.
- `matched_pages` is deduped and sorted in `lib/searchMerge.ts:123`, so `key={page}` cannot collide.
- Only the PDF extractor sets `page` (html/text set `None`; office sets nothing), so a `?page=` pill never lands on a non-PDF.

**Is anything missing from the list?** Keyboard reachability of the dropdown pills (`role="button"` + `tabIndex={0}`) is not declared. Mutations M16/M17 remove them and nothing notices. If "a keyboard user can Tab to a page pill and activate it" is meant to hold, it belongs on the list. Also consider "activating the pill for the page already in the URL re-seeks the viewer" (see F6); the list says nothing about it either way.

## Findings

### F1 — low — [introduced] — frontend/src/components/search/__tests__/MergedResultItem.test.tsx:155-167
**Claim:** Invariant 1 names Space, but no test presses Space on a page pill. With `" "` dropped from the key branch (`MergedResultItem.tsx:132`), the suite stays green.
**Observation:** Mutation M4 (`e.key === "Enter" || e.key === " "` → `e.key === "Enter"`) survives, 260/260 pass. The code is correct today. The gap is the test's.
**Invariant:** 1 (not held by a test).

### F2 — low — [introduced] — frontend/src/components/search/__tests__/MergedResultItem.test.tsx:155-167
**Claim:** The Enter test renders a single page (`matched_pages: [3]`). It cannot tell "this pill's page" apart from "the first page". The name says "its page only", but the test does not hold that.
**Observation:** Mutation M9 (the key handler builds the URL from `matchedPages[0]` instead of `page`) survives. The click test uses `[3, 7]` and clicks `p.7`, so M7 is caught on click but not on key.
**Invariant:** 1 (Enter on pill N → `?page=N`, not held for N ≠ first).

### F3 — low — [pre-existing] — frontend/src/components/search/__tests__/MergedResultItem.test.tsx:95-108 (row code at MergedResultItem.tsx:60)
**Claim:** Invariant 4 (a row click outside the pills selects `/files/{id}` with no `page`) has no test when `matched_pages` is present. The row-click test builds a file with no match meta.
**Observation:** Mutation M14 (the row onClick appends `?page=${matchedPages[0]}` when pages exist) survives. Labelled pre-existing: the row line is unchanged, and the same mutation survives at the parent, whose tests contain zero `matched_pages` fixtures. It is listed because invariant 4 was declared for this change.
**Invariant:** 4 (not held by a test).

### F4 — low — [introduced] — frontend/src/components/MatchOverlay.tsx:119-121
**Claim:** The Link's own `e.stopPropagation()` is not what holds invariant 2 in the running app, and no test holds invariant 2 for page pills. Both hosts wrap the overlay in a `role="presentation"` div that already stops click and keydown (`FileCard.tsx:188-195`, `FileListRow.tsx:188-195`). So the Link's call is redundant there. And no FileCard/FileListRow test clicks an overlay link and checks that the card's own selection does not fire.
**Observation:** Mutation O1 (drop the Link's stopPropagation) survives, as expected. This mirrors `TimestampLink` (pre-existing), so it is not a defect. The note is that invariant 2 is held only by host code that no page-pill test exercises. If a new host renders `MatchOverlay` without the wrapper, the Link's stopPropagation is the only guard, and no test would catch its removal.
**Invariant:** 2 (not held by a test).

### F5 — low (B) — [introduced] — frontend/src/components/search/MergedResultItem.tsx:122-142
**Claim:** A focusable `span role="button"` nested inside the row's `<button>` is invalid content (interactive content inside `<button>`), and assistive tech may flatten or skip it. The pattern is pre-existing (timestamp pills, lines 88-108). This change adds another instance of it, one per matched page with no cap. A PDF matching many pages puts one tab stop per page inside a single dropdown row. Accessible name is `p.N` (read as "p dot N"), with no `aria-label` such as "Page N".
**Observation:** Read only. M16/M17 (remove `role` / `tabIndex`) survive, so no test holds the a11y attributes. The same is true of the timestamp pills.
**Invariant:** none declared (see "missing from the list").

### F6 — low (B) — [pre-existing] — frontend/src/components/MatchOverlay.tsx:117-118, MergedResultItem.tsx:127
**Claim (read, not reproduced in a browser):** Say a PDF is already open at `?file=X&page=3` and the viewer has scrolled to page 10. Activating `p.3` for the same file again resolves, through the `/files/[id]` redirect, to the same canonical URL. `initialPage` is then unchanged, and the `PdfPreview` effect keyed on `[fileId, initialPage]` does not re-run, so the viewer likely does not jump back to page 3. The same holds for `?t=` timestamp pills, hence pre-existing.
**Observation:** Code path `app/files/[id]/page.tsx` → `buildCanonicalFileUrl` → `RightPaneFile.tsx:85` → `PdfPreview.tsx:173-180`. Not verified in a running app.
**Invariant:** none (candidate for the list, see above).

### F7 — info (B) — [pre-existing] — frontend/src/components/MatchOverlay.tsx:117
**Claim:** Pills link to `/files/{id}?page=N`, which the server redirects to the file's folder and drops `q`. So on the drive search page a page pill leaves the results. `fileLinkHref` (`lib/canonicalFileUrl.ts:49`) exists to build the direct link. Same as `TimestampLink`, so it is not introduced; recorded only because this change multiplies the links.
**Invariant:** none.

### F8 — info (B) — [introduced] — frontend/src/components/MatchOverlay.tsx:127, MergedResultItem.tsx:141
**Claim:** The ICU argument is still named `pages` (`"matchedPages": "p.{pages}"`), but it now receives one number. This reads wrong but is harmless: intl-messageformat stringifies a plain number argument, so `p.1234` is not rendered as `p.1,234`. No detector needed to change: `core-search-vocabulary.test.ts` counts distinct keys, and the key is unchanged. `matchTimestampPills.parity.test.tsx` covers timestamp pills only. There is no parity test that the two surfaces draw the same page pills. Both surfaces map `matched_pages` directly, so nothing shared could drift, and none is suggested.
**Invariant:** none.

### F9 — info — [pre-existing] — frontend/src/components/MatchOverlay.tsx:79-86
**Claim:** Dropping `matchedPages.length === 0` from the render-nothing condition (O7) survives. A pages-only hit would then render nothing. It is unreachable in practice, because a paged match always also carries a `content` badge (`searchMerge.ts`). The line is unchanged by this commit.
**Invariant:** 5 (edge, not reachable).

## Mutations

| id | file | mutation | want | got |
|---|---|---|---|---|
| M1 | MergedResultItem.tsx | page pill onClick stopPropagation removed | kill | kill |
| M2 | MergedResultItem.tsx | page pill onKeyDown stopPropagation removed | live | live |
| M3 | MergedResultItem.tsx | page pill onKeyDown preventDefault removed | live | live |
| M4 | MergedResultItem.tsx | Space dropped from key branch | kill | **live** (F1) |
| M5 | MergedResultItem.tsx | Enter dropped from key branch | kill | kill |
| M6 | MergedResultItem.tsx | click URL param `page`→`p` | kill | kill |
| M7 | MergedResultItem.tsx | click URL value `page+1` | kill | kill |
| M8 | MergedResultItem.tsx | key URL param `page`→`p` | kill | kill |
| M9 | MergedResultItem.tsx | key URL uses `matchedPages[0]` | kill | **live** (F2) |
| M10 | MergedResultItem.tsx | only first page rendered | kill | kill |
| M11 | MergedResultItem.tsx | cap at 3 pages | kill | kill |
| M12 | MergedResultItem.tsx | label shows joined pages | kill | kill |
| M13 | MergedResultItem.tsx | guard `> 0` → `>= 0` | live | live (equivalent: empty div) |
| M14 | MergedResultItem.tsx | row onClick carries first page | kill | **live** (F3) |
| M15 | MergedResultItem.tsx | pages reversed | kill | kill |
| M16 | MergedResultItem.tsx | `role="button"` removed | live | live (F5) |
| M17 | MergedResultItem.tsx | `tabIndex` removed | live | live (F5) |
| O1 | MatchOverlay.tsx | Link onClick stopPropagation removed | live | live (F4) |
| O2 | MatchOverlay.tsx | href param `page`→`p` | kill | kill |
| O3 | MatchOverlay.tsx | href value `page-1` | kill | kill |
| O4 | MatchOverlay.tsx | only first page | kill | kill |
| O5 | MatchOverlay.tsx | joined label | kill | kill |
| O6 | MatchOverlay.tsx | guard `> 0` → `>= 0` | live | live (equivalent) |
| O7 | MatchOverlay.tsx | drop pages from render-nothing condition | kill | **live** (F9) |
| O8 | MatchOverlay.tsx | Link → span without href | kill | kill |
| O9 | MatchOverlay.tsx | wrong file id in href | kill | kill |
| R1 | lib/canonicalFileUrl.ts | drop `"page"` from CARRIED_QUERY_KEYS | kill | kill |
| R2 | FileDetailFullScreen.tsx | read `?p` instead of `?page` | kill | kill |
| R3 | folder/RightPaneFile.tsx | read `?p` instead of `?page` | kill | kill |

Prose: nothing that would lead a reader into a wrong code change.

TOTAL: 9 findings
