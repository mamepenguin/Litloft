spec: docs/specs/workbench-split.md

## Revisions

I6. (acceptance, human 2026-11-17) No input listed in §3 — a press, the first panel shown or the last one gone, a width change across 61rem, an inspector toggle, a form change, a `storage` event, an H-only resize, full screen and the mini player — remounts the `<video>` element or the `.loft` iframe, or changes the playback position, the play state or `workbench-panels`. Each of those inputs except a form change also leaves every panel entry mounted; a form change into or out of `stacked` with the inspector open moves the panels between the workbench and the inspector tabs, which may remount them, as SPEC-CORE-085 accepts.

I9. (acceptance, human 2026-11-17) `splitFits(width, rootFontSize)` returns true at a width of exactly 61rem and false at 61rem minus 1px, at root font sizes 16px and 20px. In a real browser a width-only resize between those widths flips the layout, an H-only resize never does, and opening Find never does unless it changes W (Find opening the inspector can, like any other change of W).
