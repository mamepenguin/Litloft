# P4-4: Add menu focus and outside press in a real browser — R-0 invariants (approved)

1. On desktop and on Pixel 5, opening Add and pressing Escape closes the menu and focus returns to the Add trigger.
2. On both, a tap or click outside the menu, on a position with a pressable button beneath, closes the menu and the button's onClick is not called.
3. On both, pressing a menu row (e.g. New Folder) runs that row's action once and closes the menu.
4. Green on the current code; red when DismissScrim is removed, the Escape handler is removed, or the focus return is removed.
5. Only next/navigation is stubbed (AddButton and the components it imports are not).

Revised by the supervisor before review (approved, proposed by the author): the bundle also stubs `@/addons/*` slot modules, which AddonSlot and AddonSlotsProvider import dynamically; they resolve packages from outside frontend/ and would fail the build. These are addon code, not AddButton or a core component it imports.

## Revised by the supervisor after r1

6. On both, pressing Add while the menu is open closes it.

Recorded with the fix: with the menu open, the trigger's own toggle is unreachable (the second press's click is swallowed by DismissScrim, which closes the menu), so a mutation making the trigger always open is inert; the case is held by DismissScrim's swallow instead.
