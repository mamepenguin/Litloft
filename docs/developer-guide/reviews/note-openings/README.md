# The notes' opening text, fetched once per listing

Three rounds on the knowledge addon's change (its PR #61), recorded here
because the submodule pointer that ships it is a core commit.
`invariants.md` is the list each round was briefed with, with the additions
rounds 1 and 2 prompted.

- **r1** on `2952d94`: the listing-wide wait unmounted every row on screen
  while a further page loaded — worse than the growth the change set out to
  remove — and the reused client read whole files into memory to keep a
  kilobyte. Also: the drive header required and never used, one timeout
  losing a listing's openings, and a failed access filter reading anyway.
- **r2** on `ec68d7e`: the rewrite (a row drawn when its own opening is in
  hand, a bounded read) held, but three of the four listings and All notes'
  first page could be drawn ungated with the suite green, the read-size
  detector was built from the constant it tested, and the drive header was
  compared without being decoded — which would have silently emptied every
  note's opening in a drive whose name is not ASCII.
- **r3** on `1d55fdd`: seven of eight done; the test written for All notes
  matched an accessible name that never existed, so that surface was still
  the one nobody held. Fixed in `8c5cf8a`, where the mime set also became
  one copy and the hook got its contract back.

Every round answered the trajectory question the same way: converging. The
one qualification, raised by r3 and weighed by the author, is that two
rounds in a row added a conjunct to the same comprehension — both halves of
r1's single remedy, taken one per round on purpose.

Known and not addressed: the addon's text-mime set is a second copy of
core's `type=text` rule. They agree today; a divergence would drop the
openings silently rather than break anything.

Read the code for what the system does now. These files quote it as it stood
at the SHA each round reviewed.
