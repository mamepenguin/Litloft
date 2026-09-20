# The cover over the YouTube frame while it loads

Two rounds on the media_import change (its PR #22), recorded here because
the submodule pointer that ships it is a core commit. `invariants.md` is the
list both rounds were briefed with, and the brightness measurements that
ended each shape.

- **r1** on `03633c0`: the tests asserted an attribute that rendered
  nothing, so every visible part of the change — the cover appearing, the
  cover leaving, the fade — could be deleted with the suite green, including
  the variant that ships the whole thing as a no-op. And the cover was drawn
  from the thumbnail route, which answers 200 with a placeholder image for a
  file that has none, so such a file got a grey card over its player; the
  comment justifying the `onError` handler described a broken-image mark the
  backend cannot produce.
- **r2** on `8814b33`: the guard and the tests held, but the new rebuild
  test drove a rebuild a viewer cannot cause (the file's url never changes
  under a mounted player), which left the YouTube-skin path — every first
  open for a viewer who stored that preference — able to lose the cover
  entirely with the suite green. Class assertions also passed while the
  cover was behind the iframe. Both are held now, in `dc0feeb`.

Both rounds answered the trajectory question the same way: converging. r2
left a warning worth keeping: the remaining hole (N1 below) is the same
defect class as r1's F2, so a third guard in the embed would be the wrong
place — the fix belongs to the thumbnail route or to `has_thumbnail`.

Known and not addressed, from r2:

- The cover is skipped on `has_thumbnail`, which reports a database column,
  not whether the file's bytes are still on disk. If they are removed out of
  band, the placeholder covers the player again, and for a `.loft` nothing
  regenerates them.
- The embed-restricted card draws the same route directly and predates this
  change.
- A player reporting neither ready nor an error leaves the cover up; it is
  not playing anything in that state either.

Read the code for what the system does now. These files quote it as it stood
at the SHA each round reviewed.
