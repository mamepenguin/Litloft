# Invariants — one classification table (phase 1)

Declared before the first review round (R-0). Phase 1 changes where the answer
comes from, not what the answer is.

1. `classify` gives the same `(file_type, mime_type)` as the shipped container
   for every name **except one that carries a compression suffix**.
   **Revised after round 1 (finding A-1, raised to the supervisor and decided
   by the user.)** The parent passed the whole filename to
   `mimetypes.guess_type`, which peels one compression suffix and resolves what
   is inside, so `clip.mp4.gz` was `video`. 451 names moved bucket. Litloft can
   open none of them — no player, no duration, no thumbnail — so the new answer
   is kept and the old one is not restored.
2. A name carrying `.gz`, `.bz2`, `.xz`, `.Z`, `.br`, or one of the aliases
   `.tgz` `.taz` `.tz` `.tbz2` `.txz`, is `other`. `.svgz` is the exception:
   ffmpeg produces the same thumbnail from it as from the plain SVG, measured.
3. `classify` gives the same answer whatever `mimetypes.guess_type` would
   return. Nothing in the result depends on a table the host may or may not
   carry.
4. `classify` stays a pure function of the filename — no I/O, and no import of
   `mimetypes` remains on its path.
5. A subtitle extension is still decided before anything else, and a `.loft` is
   still reported as `video`, with the mime `is_probeable_media` compares
   against written once.
6. An extension the table does not name is `("other", "application/octet-stream")`.
7. The extension is matched without regard to case.
8. No bucket moves for a name with one extension. Source code is still
   `document` where it was `document`; that is phase 2's change.

TOTAL: 8 invariants
