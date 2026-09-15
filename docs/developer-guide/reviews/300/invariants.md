# R-0 invariants — folder toolbar one row on phones (core 1a0ee4f0, rebased as 2dc45781)

1. Below 768px the folder toolbar renders a single sticky bar; no toolbar
   control is rendered outside it (no second row above the bar).
2. Every action reachable before the change stays reachable at every width:
   Add (and its menu with New Folder and addon rows), Play, View, Sort, Filter,
   Selection mode, Rescan, Pin, and the bulk-actions addon rows.
3. Play is offered on the bar from 768px up and inside `…` below 768px — never
   in neither place at any width, and in neither place when the listing is not
   playable, tag-scoped, a search, or a special view.
4. Choosing Play from `…` calls `onPlayAll` once and closes the menu.
5. Add is the screen's only accent fill, counted once.
6. The new-folder name field renders once, on its own line inside the bar, and
   Enter / Escape / Create / Cancel behave as before.
7. At 320, 360 and 375px, in en and ja, with no, one or two filter axes active,
   the bar's controls sit on one line (measured in a real browser, not jsdom).
8. The Filter face never drops its label or icon; a capped label is truncated
   with an ellipsis and the full text stays in the accessible name. From 640px
   up, a single active axis is not capped.
9. Every control on the bar keeps its coarse-pointer touch floor.
