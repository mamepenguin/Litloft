spec: docs/specs/enlarged-row-beside.md

## Revisions

I5. (acceptance, human 2026-11-14) Outside the beside state the workbench root has no `data-row-beside` attribute. Where a row is drawn (a value-on page with side space under 17rem, a value-off page with a panel, before H is measured), the frame is centred in the canvas content (left and right gaps equal within 1px) and the row's top is 1rem under the frame's bottom (within 1px), as in SPEC-CORE-104.

I9. (acceptance, human 2026-11-14) The threshold of the beside state is 17rem, not 16rem (measured at a coarse pointer, "Detailed summary" 134.6 + 8 + the 44px button + 8 + the 65.2px quote action = 259.8px exceeds 16rem). Once H is measured, the beside state holds exactly when §3's conditions hold with 17rem. The pure function returns beside at a side space of exactly 17rem and not at 17rem minus 1px; in a real browser a width-only resize in the floor case flips the state between those two widths, and a height-only resize flips it when the side space moves at least 8px across the threshold. The state is never beside with `workbench-player-focus` other than `"true"`. The SPEC-CORE-104 e2e case for the share cap (1590x1122) stays in the beside state, asserting what it asserted, because no window of that cap case has side space under the threshold.
