# Drive access on the loft metadata and refresh routes

One round on the media_import change (its PR #25), recorded here because
the submodule pointer that ships it is a core commit. `invariants.md` is the
list the round was briefed with.

- **r1** on `5789513`: no invariant broken. At the parent, a `.loft` on a
  locked drive answered its metadata with 200 and accepted a refresh; at
  `5789513` both answer 404. The tests let four mutations through: an
  absent `X-Lit-Drive` (only an empty one was tested), dropping `unquote`
  (a non-ASCII drive name), the frontend sending no header, and moving the
  drive check below the metadata lookup. The first three are held in
  `c977298`. The last one changes only which 404 body an unreachable file
  gets, and was closed as B.

Known and not addressed, from r1 (all pre-existing):

- `_scoped_drive` answers a locked drive and an unknown drive with different
  404 bodies (in `known-issues.md`).
- `enqueue_stt` answers `already_queued` before it checks the drive (in
  `known-issues.md`).
- The fetch worker writes to the file row by id without checking that it is
  still active. Not reproduced.

Read the code for what the system does now. These files quote it as it stood
at the SHA the round reviewed.
