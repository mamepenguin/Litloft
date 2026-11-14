spec: docs/specs/workbench-panel-priority.md

## Revisions

I2. (r5, human 2026-11-14) On the canonical page in a workbench form, while at least one panel is shown under a framed player and neither full screen nor the mini player is up, the 16:9 frame's height is 50% of the scroll container's visible height when the stored value is not exactly `"true"`. When it is `"true"`, the frame's height is the larger of 30% of the visible height and 270px (the height of a frame 480px wide, the player's `COMPACT_MAX_WIDTH`, below which its controls go compact), and never more than 50% of the visible height. Each within 2px, unless the canvas width limits the frame first.

I3. (r5, human 2026-11-14) With the stored value on, Find closed, the room under the row at least 18rem at the applied cap, the frame at the 50% cap limited by height rather than by the canvas width, and the applied cap smaller than the 50% cap, each shown panel ends within the visible area, the scroll container does not scroll, and each panel body is taller than it is with the value off at the same window size.
