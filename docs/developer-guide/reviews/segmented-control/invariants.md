# R-0: Shared segmented control (PR-C, feat/segmented-control)

Declared with the spec `2026-09-27-segmented-control.md`, revised after its
spec review (19 findings). Approved by the user 2026-09-27.

## Touch points

- New `frontend/src/components/SegmentedControl.tsx` (+ unit tests).
- `MarkdownViewModeToggle` (callers: `markdown/MarkdownDocumentLayout.tsx`,
  `FileDetail/FileDetailChrome.tsx`'s header row, and
  `addons/knowledge/frontend/Editor.tsx` — look only, no code change there;
  its `Editor.focusOnEdit` test is keyed on the toggle).
- `EpubTypographyPanel`: header with Reset, labels above, `SegmentedControl`
  for three fields, `Button` iconOnly for text size, dots.
- `lib/epubTypography.ts`: `isDefaultTypography`.
- `messages-core/{ja,en}.json`: `file.epubTypographyReset`,
  `file.markdownViewMode`, the A buttons' names if they change.
- `DESIGN.md` §6 "Selected-state controls".
- Tests: `SegmentedControl` unit, `MarkdownDocumentLayout.test.tsx`,
  `EpubPreview.test.tsx` (typography panel), `epubTypography` unit,
  `src/__tests__/tab-styles.test.ts` (new detector), an `e2e-components`
  fixture and spec (the Measurement section), the header-row crowding spec.
- Not touched: `epubTypography.ts` values and storage key, the reader, panel
  placement and open/close rules, Appearance / Language settings, addons' own
  code.

## Invariants

1. Every segment is a `<button>` whose `aria-pressed` is true for exactly the
   current value and false for the rest; the group has an accessible name.
2. Pressing an unselected segment calls `onChange` once with its value;
   pressing the selected one does not call it.
3. The selected segment's border is the accent colour and its background is
   transparent; unselected segments have a transparent border of the same
   width (selecting moves no pixel of layout).
4. On a coarse pointer every text segment is at least 44 px tall, every icon
   segment is 44 px wide and has a 44 × 44 hit area, and the text-size buttons
   have a 44 × 44 hit area; the file-detail header row keeps its height.
5. Changing a text setting from the panel stores it and applies it to the book
   exactly as before (same values, same storage key); Reset stores and applies
   `TYPOGRAPHY_DEFAULTS`, and at the defaults changes nothing.
6. The text-size buttons are disabled at the smallest / largest step and are
   not drawn translucent; exactly one dot is coloured, the current step's.
7. Markdown view mode: the same modes, labels, `hideSplit` behaviour and
   `view-mode-*` test ids as before.
