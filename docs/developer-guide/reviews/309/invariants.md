# core: compact folder rows — R-0 invariants

Change: in list mode, `FolderListRow` drops the 96×56 thumbnail-sized tile and
keeps a 96px glyph column, so the row is one short line. The kind breakdown was
added to the row in round 1 and removed again after round 3; `FolderCard` is
unchanged.

The list as the rounds were briefed with it. Items 5 and 7 were added or
revised by the user between rounds, and both were withdrawn when the breakdown
left the row.

1. A folder row's name starts at the same x as a file row's title in the same
   column, at 288 / 343 / 700px, on both pointers.
2. A folder row's ⋮ button right edge equals a file row's ⋮ right edge, and is
   44×44 on a coarse pointer. *(Revised after round 1: on both pointers; it was
   measured on coarse only.)*
3. A folder row is 45px on a coarse pointer at every width, 45px on a fine
   pointer below `sm`, 41px on a fine pointer at `sm` and up, including its 1px
   bottom border.
4. `FolderCard`'s meta is unchanged: the count, then at most two kinds; a single
   kind is named without its number; an empty folder shows the count alone.
5. *(Rounds 1–3, withdrawn.)* Below `sm` the row shows the count and no
   breakdown.
6. Right-click, ⋮, drag (disabled while renaming), drop target ring and inline
   rename behave as before; the row never contains an `<img>`.
7. *(Added by the user after round 1, withdrawn after round 3.)* Wherever the
   breakdown can show, it gives way before the folder name: while the name is
   truncated the breakdown takes no width, including the gap before it; the
   count always stays whole.
