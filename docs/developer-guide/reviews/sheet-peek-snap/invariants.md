# core: mobile sheet non-modal, peek as a snap — R-0 invariants

Change: the file-detail Bottom Sheet on phones is non-modal in every state and
stays mounted, with peek as vaul's first snap point, so the resting bar can be
dragged up. The resting bar clears the bottom safe-area inset. The action row
lives only in the sheet's header on phones.

Approved by the user on 2026-09-16.

1. While the sheet is at peek, no element outside the sheet has `aria-hidden`
   set by the sheet, `body` has no `pointer-events: none`, and the page scrolls.
2. At half, a tap on the player reaches the player (play/pause), and the sheet
   stays at half.
3. A tap or pointerdown outside the sheet never changes the sheet's state.
4. Exactly one `FileActionRow` is mounted on a mobile file-detail page, in every
   sheet state.
5. At peek the header row's bottom edge is at
   `innerHeight − safe-area-inset-bottom`; the page's last content ends above
   the header's top edge.
6. Dragging the knob up from peek and releasing settles on half or full;
   releasing near peek settles on peek.
7. A content pull or a knob flick that used to close the sheet leaves it at
   peek, never unmounted or off screen.
8. Content below the header is not focusable at peek (`inert`).
9. Changing files resets the sheet to peek.
