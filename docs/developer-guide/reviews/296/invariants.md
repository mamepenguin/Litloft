# R-0 invariants — folder bulk actions menu (approved by the user 2026-09-15)

1. With intelligence installed, on a folder or drive root in Library with ≥1 file,
   the three AI rows appear in `…` and **not** in Add.  (Phase 3 — not reachable at Phase 1)
2. Add still shows knowledge's *New note* / *Clip web page* and media_import's
   *Import from URL* where it did before, and they do not appear in `…`.
3. On search results, a tag-filtered root and special views (`?view=…`), the
   bulk rows appear in neither menu.
4. With no declarer, or with every entry rendering `null` (zero files, policy
   off), the `…` menu shows no separator below its core rows.
5. Pressing a bulk row closes the `…` menu, focus lands on the `…` trigger, and
   the confirm/queue/toast flow is unchanged.
6. Escape closes the `…` menu from any row; while an entry reports a dialog open,
   neither Escape nor a press outside closes the menu.
7. An entry cannot override `onRequestClose` / `onDialogOpenChange` by passing
   its own.
8. The `…` menu's existing rows (View/Sort under 768px, Select mode, Rescan, Pin)
   behave as before.

## Revision after round 1 (review-p1.md), approved by the user 2026-09-15

9. With the `…` menu closed, or while an entry reports a dialog, Escape reaches the
   layers beneath the toolbar as before (e.g. the phone sidebar drawer closes). (F2)
10. One Escape closes one layer: with the New Folder field focused while `…` is
    open, Escape cancels the field and leaves the menu open. (F1)
