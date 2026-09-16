# core: mobile sheet non-modal when raised, resting strip clears the safe area — R-0 invariants

Change: the file-detail Bottom Sheet on phones is non-modal at half and full
(no `aria-hidden` on the page, no focus trap, no backdrop), and sits below the
overlay sidebar. The resting strip and the page's bottom reserve include the
bottom safe-area inset. The resting strip no longer carries addon buttons.

1. At half and full, no element outside the sheet has `aria-hidden` set by the
   sheet, `body` has no `pointer-events: none`, and focus is not pulled back
   into the sheet: a tap or a page control can take it out. *(Revised by the
   user after round 1: Tab still cycles inside the sheet, which Radix does
   and which is accepted.)*
2. At half, a tap on the page (the player included) reaches the page, and the
   sheet stays at half.
3. At rest nothing of the drawer is mounted: no Radix layer, so an Escape or a
   focused field on the page is the page's alone.
4. The strip is 56px above the bottom inset, which it pads; the page's last
   content ends above the strip's top edge, inset included.
5. An overlay sidebar or its backdrop opened while the sheet is raised is drawn
   above the sheet.
6. The strip shows the file name, like, favourite and `⋮`, and no
   `file-detail-actions` addon entry; the raised sheet still shows those
   entries, once.
7. Escape, a content pull and a knob release below half still collapse the
   sheet to the strip, never closing it.
8. Changing files resets the sheet to the strip.
9. *(Added by the user after round 1.)* A dialog opened from inside the raised
   sheet is on screen, above the sheet and the page.
10. *(Added by the user after round 1.)* The page scrolls while the sheet is
    raised.
11. *(Added by the user after round 1.)* The raised sheet is drawn above the
    sticky player and the file page's header, measured in a browser.
