# Focusing the note editor when leaving preview

One round on the knowledge change (its PR #65), recorded here because the
submodule pointer that ships it is a core commit. `invariants.md` is the list
r1 was briefed with, plus item 8, added after r1.

- **r1** on `7c688e2`: the code held all seven invariants, but two mutations
  survived the suite. Removing the null-editor guard throws on an ordinary
  navigation (a note shown in preview, then a file change that lands in
  edit), and a reveal that also edits the text went unnoticed. Both are held
  in `e6d64c7`, which changed only tests, so it had no round of its own.

Known and not addressed, from r1:

- F3: switching to edit during a version restore scrolls to the caret although
  focus cannot enter the read-only editor.
- F4: the scroll target being the selection head rather than the anchor is not
  held by a test.
