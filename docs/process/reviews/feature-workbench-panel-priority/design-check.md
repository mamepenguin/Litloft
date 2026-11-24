# Design check

at: a42e727705b2b670783988d67fb7254e369a83f1
design: docs/process/reviews/feature-workbench-panel-priority/design/ (agreed-layout.md) and spec §9

## Decisions read from the design
- agreed-layout: one icon-only button per page = in the workbench row (agreed-layout.md:20)
- agreed-layout: placed after the panel toggles, before the preview actions (Quote) (agreed-layout.md:3, :11, :20)
- agreed-layout: not in each panel header; not a text pill (agreed-layout.md:21-22)
- agreed-layout: panels sit under the row, body grows, each has a close x (agreed-layout.md:12-16)
- agreed-layout: player capped at 30% of the visible height while on (agreed-layout.md:23)
- spec §9: circle button 2rem x 2rem, bordered like the panel toggles, accent while pressed, 16px icon (spec:132-134)
- spec §9: right end of the row; 0.5rem left of the first preview action; edge = row edge when none (spec:135-139)

## Checked against screenshots
- r5/1376x878-on.png: one circular icon button at the row's right end, after Transcript/Scenes, accent outline while on, player visibly smaller, panel fills to the bottom. Matches.
- r5/1376x878-two-panels-on.png: two panels side by side, each with its own x, no button in a panel header. Matches.
- r5/fixture-1376x878-quote-on.png: button directly left of the Quote pill, Quote at the row's right edge. Matches (fixture only; no addon registers file-preview-actions in the app, per decisions.md).

## Findings
None.

TOTAL: 0 findings
