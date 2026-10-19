# PDF reading direction from the document

One round, a fresh reviewer on `747ba8e6`. `invariants.md` is the list it was
briefed with.

- **r1**: the code held; pdf.js 5.4.296 returns `Direction` as a plain
  string. Three A findings were missing tests — a failed preferences read,
  the button opening before the read, and a declared left-to-right document
  — closed by a test-only commit, so no further round. F4 (which half a
  split page opens on) turned out equivalent: the direction effect sets the
  half on mount whatever the initialiser says. F5 is covered by the gate
  test.
