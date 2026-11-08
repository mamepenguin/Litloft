# No horizontal scrolling on a mouse environment

SPEC-ID: SPEC-CORE-064
SPEC-ID: SPEC-CORE-065

Approval:

## Summary

A new design rule: on a desktop or any non-touch environment (`(hover: hover) and
(pointer: fine)`), no screen may require horizontal scrolling to reach its content. A
mouse wheel scrolls vertically only, so a horizontal strip hides items from a person who
has no gesture for it. On a touch environment horizontal scrolling stays as it is. The
rule is written into `DESIGN.md`, enforced by a repository test, and applied
retroactively to the existing screens (core and addon frontends).

SPEC-CORE-064 is the rule and its enforcement. SPEC-CORE-065 is the retroactive fix of
the violations found.

Decisions already made by the human (2026-11-08):

- Carousels (video shelf, collection panel, clip frames, visual index) wrap into a grid
  on a mouse environment.
- Markdown tables, code blocks and mermaid diagrams are the exempt content: they may
  scroll horizontally. So may a viewer's zoomed pan area, which the user moves on purpose.
- The environment test is `(hover: hover) and (pointer: fine)`, the same axis as the
  existing coarse-pointer rules, never viewport width. Enforcement is measured in a real
  browser (`frontend/e2e-layout/`) plus a source scan.

## Required items

### 1. Normal flow

1. A viewer on a mouse environment opens any screen. Every item of a shelf, tab strip,
   breadcrumb or settings table is visible or reachable by click or keyboard, with no
   horizontal scrollbar on the element.
2. On a touch environment the same screens keep today's horizontal scrolling.
3. A developer adds a component with `overflow-x-auto`, `overflow-x-scroll` or `snap-x`
   without the fine-pointer guard or an exempt marker; the repository test fails.

### 2. Failure cases

- Content that cannot wrap and is not on the exempt list (a long unbroken token in a
  heading, a long file name): it truncates with an ellipsis and carries the full text in
  `title`, or breaks with `overflow-wrap: anywhere`. It never produces a scrollbar.
- A shelf with many items: it wraps to several rows; it never clips an item.
- Hybrid device whose primary pointer is fine but which also has a touchscreen: treated
  as a mouse environment, because the media query reads the primary pointer. Accepted
  trade-off; a touch-primary tablet with a paired mouse is a touch environment.
- A breadcrumb with many segments: segments shrink with an ellipsis from the first
  towards the last; the last segment keeps its natural width up to the container width and
  only then truncates with an ellipsis and a `title`. Every segment stays a link in the
  DOM, and a truncated one carries its full name in `title`.
- A tab strip that outgrows one row: it wraps onto the next row; the active-tab
  indicator (`border-b-2`) and the one tab stop are unchanged.

### 3. States

Two environments, chosen by the media query and never stored: mouse
(`hover: hover` and `pointer: fine`) and touch (anything else). No transitions inside the
app; a device that changes its primary pointer is re-evaluated by CSS.

### 4. Data read and written

None. No DB, file, cache or localStorage key is read or written.

### 5. External services

None.

### 6. Authorization

None. Presentation only; no endpoint changes.

### 7. Effect on existing features

- `DESIGN.md` lines that assume horizontal scrolling are scoped to touch: the inspector
  tab strip ("Scrolls, never wraps") and the table note ("Do not reflow — horizontal
  scroll is preferred").
- Tab strips (`PageTabs`, `InspectorShell`) keep the one-tab-stop and `←` / `→` behavior.
- The settings table keeps its sticky headings capped at `70vh`.
- Existing e2e-layout specs that measure shelves or tab strips are updated to the new
  mouse-environment expectation.

### 8. Error behavior

None at runtime. The repository test names each offending file and line when it fails.

### 9. User-visible behavior

On a mouse environment:

- The video shelf lays its cards out in wrapped rows, at most two rows when the shelf has a
  "see all" link; the cards beyond the second row are not drawn there and are all on the
  page that link opens. A shelf without that link draws every row.
- The collection panel under the player lays its tracks out in wrapped rows inside a box
  about two rows tall that scrolls vertically; every track is reachable by scrolling it.
- Clip frames and visual index lay their cards out in wrapped rows. Whether they also
  get a bounded height is decided from their measured item counts when the addon is
  checked out, and recorded in that addon's PR.
- Tab strips (page tabs, inspector tabs) wrap onto a second row instead of scrolling.
- The breadcrumb shrinks its segments with ellipsis; the last segment stays whole.
- The add-on policy table and other settings tables fit the container width; columns wrap.
- The setup wizard's command snippet is code content and keeps its own scrolling (exempt).

On touch nothing changes.

### 10. Non-functional

- Layout is decided by CSS media queries only, with no JS pointer sniffing and no
  hydration flash.
- The source scan is an ordinary vitest file, so it runs in the existing CI frontend
  shards and needs no change to `.github/` or `scripts/process-gates/` (protected).
  It reads `.tsx`, `.ts` and `.css` under `frontend/src` and `addons/*/frontend`, skips an
  addon directory that is not checked out, and finishes in seconds.
- The mouse environment is a custom variant, `mouse:`, defined in `globals.css` as
  `@media (hover: hover) and (pointer: fine)`. Tailwind's own `pointer-fine:` tests the
  pointer only, and DESIGN.md's rule needs `hover` as well.
- The exempt marker is a `data-hscroll-exempt` attribute on the element, or one of the
  four selectors named in `globals.css` for Markdown content, listed in the scan's
  allowlist. Adding a new exempt entry is a design decision for the human.
- No new dependency.

## Touch points

DESIGN.md and tests:
- `DESIGN.md` (new rule; scope the two touch-only sentences; list the exempt content)
- `frontend/src/app/globals.css` (the `mouse:` custom variant; the four `overflow-x:
  auto` rules, `.markdown-body pre`, `.markdown-table-scroll`, `.code-block` and
  `.mermaid-diagram`, stay as exempt content; `.code-view`, the file-detail source viewer,
  is code content and exempt)
- a new source-scan vitest and a new e2e-layout spec with fixtures under
  `frontend/e2e-layout/`; the fixtures reuse the real component markup where the
  component can be rendered statically, and a parity test keeps hand-written fixture
  markup in step with the component, as `mobileInspectorSheetFixtureParity.test.tsx` does
- existing tests that match the old class strings and change with them:
  `video-app.spec.ts`, `addon-policy.spec.ts`, `mobile-inspector-sheet.spec.ts`,
  `InspectorShell.test.tsx`, `AddonPolicySection.test.tsx`, `section-rows.test.tsx`,
  `mobileInspectorSheetFixtureParity.test.tsx`

Core components with horizontal scrolling today:
- `frontend/src/components/videoapp/ShelfBlock.tsx`
- `frontend/src/components/CollectionPanel.tsx`
- `frontend/src/components/PageTabs.tsx`
- `frontend/src/components/FileDetail/inspector/InspectorShell.tsx`
- `frontend/src/components/Breadcrumb.tsx`
- `frontend/src/app/admin/settings/AddonPolicySection.tsx` and `settings/page.tsx`
- `frontend/src/app/setup/steps/DriveStep.tsx` (its `pre` is a command snippet: exempt,
  marked)
- `frontend/src/components/ToolbarMenu.tsx` (an `overflow-y` list whose `overflow-x`
  resolves to `auto`; measured, and fixed only if its content can overflow)

Audit only (`overflow-auto` panes; fixed only if measurement shows horizontal overflow):
- `frontend/src/components/InspectorPane.tsx`, `FileDetailShell.tsx`,
  `MobileInspectorSheet.tsx`, `folder/RightPaneFile.tsx`, `folder/RightPaneFolder.tsx`,
  `FileDetail/find/FindTabPresenter.tsx`, `archive/ArchiveTextViewer.tsx`,
  `PdfPreview.tsx`

Addon frontends (separate repositories; each needs its own PR, then a pointer bump in
the core, per `CLAUDE.md` Git):
- `addons/intelligence/frontend/ClipFramesSection.tsx`, `VisualIndexSection.tsx`,
  `AdminFeaturesSettingsSection.tsx`, `FailedJobsModal.tsx`
- `addons/cloud-sync/frontend/SyncDriveCard.tsx`
- `addons/knowledge/frontend/Editor.tsx`, `WikiLinkAutocomplete.tsx`,
  `VersionHistoryPanel.tsx`

Merge order: each addon PR merges first, then the core pointer bump, so the core's scan
never sees a pinned commit that still violates the rule. In a core CI run where an addon
is not checked out, the scan skips it.

Audit result: every audited pane gets a one-line outcome (fixed, or measured clean) in the
PR description.

Docs: `docs/user-guide/` needs no edit (layout only, per `CLAUDE.md`).

Protected paths: none edited.

## Invariants

I1. On a mouse environment, no element on an in-scope screen has `scrollWidth >
clientWidth` while its `overflow-x` is `auto` or `scroll`, except the exempt content of I2.
The in-scope screens are the fixtures the new e2e-layout spec renders, one per component
named under Touch points; the list lives in that spec.
I2. The exempt content is exactly Markdown tables, code blocks (including the file-detail
source viewer and the setup command snippet), mermaid diagrams, and a viewer's pan area
only while it is zoomed (at the default zoom it does not overflow); any other element that scrolls horizontally on a mouse
environment fails the check.
I3. On a touch environment the shelf, collection panel, clip frames, visual index, page
tabs, inspector tabs and breadcrumb remain horizontally scrollable as they were.
I4. On a mouse environment no drawn item is clipped by a wrapper: the bounding box of every
drawn card, tab and breadcrumb segment lies inside its container's box. A shelf with a "see
all" link draws at most two rows; a shelf without one, the clip frames and the visual index
draw every card in wrapped rows; the collection panel keeps every track reachable through
its vertical scroll.
I5. On a mouse environment every tab of a page or inspector tab strip is visible without
scrolling, `←` / `→` still move between tabs, and the strip is still one tab stop.
I6. On a mouse environment the breadcrumb's last segment is fully visible however many
segments precede it, and no breadcrumb segment is lost from the DOM.
I7. On a mouse environment the add-on policy table fits its container width and its column
headings stay sticky inside the `70vh` cap.
I8. A `.tsx`, `.ts` or `.css` file under `frontend/src` or `addons/*/frontend` that
contains `overflow-x-auto`, `overflow-x-scroll`, `overflow-x: auto|scroll` or `snap-x`
outside a `touch`-only guard and without the exempt marker fails the repository test.
`overflow-auto` and `overflow-y-*` are not flagged by the scan; I1 measures them.
I9. The `mouse:` variant is defined as `(hover: hover) and (pointer: fine)` and nothing
else defines the mouse environment.
I10. The audited `overflow-auto` panes either measure clean under I1 or are fixed; none is
left unmeasured.

## Checked, no action

- The human's decisions on carousels, exempt content and the environment test are
  recorded in the Summary.
- `DESIGN.md` is not compared with code by any test (`frontend-conventions.md` forbids
  it); the two touch-only sentences are edited by hand and reviewed.
- Shelf row count (human decision 2026-11-08): the shelf caps at two rows and relies on
  its existing "see all" link; the collection panel, which has no such link, scrolls
  vertically instead. No new control is added.
- The hybrid-device trade-off and the knowledge `Editor` / `WikiLinkAutocomplete` handling
  (measure, then fix, never exempt) stand as the recommended defaults; the human has not
  contradicted them.
- No scroll-into-view logic exists in the tab strips or breadcrumb (checked by grep), so
  none needs to change.
- The iOS device behavior of I3 cannot be verified by an agent (`agent_cannot_verify`);
  CI measures it under emulated `pointer: coarse` only.
- Which invariant belongs to which id: I1, I2, I8, I9 are SPEC-CORE-064 (the rule and its
  enforcement); I3 to I7 and I10 are SPEC-CORE-065 (the retroactive fixes).

- iOS app (`ios/`): it wraps the web UI in a touch environment, so the rule does not
  apply to it.
- The `.markdown-body` table and code rules keep their `overflow-x: auto` on purpose
  (exempt content, human decision).
- Image and PDF zoom pan areas scroll or pan because the user zooms in; exempt by I2.
- Viewport-width breakpoints are not used for the environment test (I9), so a narrow
  mouse window still gets the no-scroll layout.
- A screen that is too narrow to fit its content without scrolling even after wrapping
  (a mouse window narrower than roughly 320px) is out of scope.
