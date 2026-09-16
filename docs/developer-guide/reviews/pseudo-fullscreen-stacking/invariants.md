# core: phone player pinned for pseudo-fullscreen above the page — R-0 invariants

Change: while `useFullscreen` pins a player's frame (no element fullscreen,
iPhone), the phone player's sticky box is lifted to the immersive tier through
the root `data-player-fullscreen` attribute the hook already sets.

1. While a player on a phone file page is pseudo-fullscreen, the frame's
   corners, centre, bottom edge and the spot under the menu button hit-test to
   the frame, with the header, the resting strip or the raised sheet, and the
   menu button present.
2. When it is not pseudo-fullscreen, the player box is at z-index 10: the
   resting strip and the raised sheet are drawn over it where they overlap.
3. The frame element is not moved, wrapped or re-parented.
4. The root attribute is present exactly while pseudo-fullscreen is active,
   and gone after an exit or an unmount mid-fullscreen.
5. Native fullscreen does not set the root attribute.
6. Exiting pseudo-fullscreen still consumes its history entry as before.
