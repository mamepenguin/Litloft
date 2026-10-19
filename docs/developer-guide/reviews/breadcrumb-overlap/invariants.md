# R-0 invariants — `fix/breadcrumb-overlap` @ 60a4ec5d

Declared before the first review. Revised only by the supervisor or the user.

1. A trail's last segment — the current folder, or the file's name — is drawn
   inside the trail's own box at every width: never clipped to nothing, never
   scrolled out of the visible strip, never painted over a control beside it.
2. No header row that holds a trail makes the document scroll horizontally,
   at any viewport width.
3. Every ancestor segment stays a working link (core) or button (archive)
   pointing at the path it names. Shrinking changes what is legible, never
   what is reachable.
4. The archive toolbar's download control stays hittable at every width and
   however deep the path inside the zip is. The entry count beside it keeps
   its full width at `sm` and above; below `sm` it leaves the row, because
   the two together leave the trail less than its segments need. (Round 3
   finding 3: this item used to promise the count its full width at every
   width. The user chose the width clause over bringing the count back,
   after seeing both at 375px.)
5. The file-detail chrome draws a way out at every width: the back control
   below `md`, the trail at `md` and above. Where the host supplies its own
   `onBack` — a file opened during collection playback — it draws both, and
   the back control is then the only thing that can return to the
   collection. (Round 2 finding 4: this item used to say "never both",
   which is false and would lead a reader to delete that control.)
6. A drag over a trail segment the row **draws** still shows that segment's
   drop ring and still drops onto that segment's path. A folder folded behind
   the marker is not drawn and has no drop target, and the marker has none
   either: where a drop on it would land is not something the row lets the
   reader predict. (Round 3 finding 5: this item used to say "a trail
   segment", from before a trail could fold. The user chose to narrow it
   rather than give the marker a target, on 2026-09-21 — a deep path loses
   the drag shortcut to its middle folders on a wide screen, and the folder
   menu's Move still reaches them.)
7. `Breadcrumb` with `driveIsAncestor` draws the drive as a link, not as the
   leaf (trash, missing, collection detail depend on this).

## Revision, after the user ran the app (R-5)

The list above was written about trails, and below `md` the file-detail row
draws no trail. The user hit the original defect there — the rename control
painting over the row's buttons — which the first fix did not touch. Added:

8. Below `md`, the file-detail row keeps both the back control and the file's
   name inside the row: neither overflows the row's box, neither is starved
   to zero width by the other, and neither is painted over the save dot, the
   view-mode toggle or the inspector button.
9. The rename control stays a control. Narrowing it must not stop it opening
   the rename field or committing an edit.
