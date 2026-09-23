# R-0 invariants — fix/player-box-menus

1. Below 640px, a toolbar menu opened from inside the file page's player box is fully visible: nothing paints over it — not the app header, not the resting strip, not a half- or full-raised inspector sheet.
2. When the resting strip is shown, a bottom-sheet menu's bottom edge is above the strip's top edge; when no strip is shown (folder pages, sheet raised), it keeps its 16px inset from the screen bottom.
3. At 640px and wider, every toolbar menu stays anchored to its trigger exactly as before (direction, side, gap, max height).
4. Dismissal is unchanged at every width: a press outside the menu closes it and its click does not reach what is underneath; a press inside the menu does not close it; Escape closes it and returns focus to the trigger.
5. Selecting an item in a portalled menu performs the action and closes the menu, as before.
6. Resizing across 640px while a menu is open neither leaves a detached menu in body nor breaks the menu.
7. When the file page (and so the resting strip) unmounts, `--resting-strip` is removed from the root.

## Revised after r1 (approved by the user)

The portal became opt-in (`portalOnPhone`), used only by menus whose trigger is inside the player box: ArchiveToolbar's "More" and view menus, and PdfPreview's zoom-mode menu.

8. A menu that does not opt in renders exactly where and how it did at `3a8841db`, at every width (in particular, container-query classes on its rows keep applying).
9. The CSS lift (`--resting-strip`) applies to every bottom-sheet menu, portalled or not.
