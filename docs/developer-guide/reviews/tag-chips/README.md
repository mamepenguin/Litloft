# Tag field — offer recent and frequent tags when nothing is typed

Each round is a fresh reviewer on one commit. `invariants.md` is the list the
rounds were briefed with.

- **spec** on `4208249a` (before any code): the design was reviewed against the
  existing code rather than mutated, because there was nothing to mutate yet.
  It caught that orphan `Tag` rows are returned for every folder, that
  `selectedIndex` has no reset and was only safe because an empty field
  returned no suggestions, that `DismissScrim` would arm a click earlier than
  before, and that clearing the fetched list inside the effect is a paint too
  late. Two claims the spec made about the code were simply false. The file
  list was right but its counts were low — six sites named, 27 found by `tsc`.
- **r1** on `e7b9e76c`: the implementation. A tag created in the session was
  filtered out of the chips on the next file in the same folder, because the
  fold on write updated the drive-wide list and not the folder one — the
  feature's own purpose, with every invariant intact. Four guards were correct
  but held by no test, including the drive half of the scope check.
- **r2** on `e270b934`: the fix. The fold it added had no unwind, so a tag
  taken off again stayed in the chips at the front, and a refused save left it
  there too. Asked the trajectory question, the round answered that all three
  rounds had added a branch, a state or a prediction and none had removed one:
  the scope guard r2 added was dead (deleting it left the suite green), and the
  prediction it added was false in two reachable states. Raised to the user,
  who chose to remove the prediction rather than unwind it.
- **`0e8dafb8`** is that removal, and was not reviewed by a fresh round: the
  lists are fetched when the field opens, so the fold, the guard it needed and
  the synthetic count rows are gone. The user ran the application along the
  path the change touches (R-5) and accepted it.

Left alone deliberately: orphan `Tag` rows surviving a purge (a backend defect
this change only defends against, in `known-issues.md`), the typed five-suggestion
cap being held by no test, and the anchored-direction hook counting the list as
open while chips show.

Read the code for what the system does now. These files quote it as it stood at
the SHA each round reviewed.
