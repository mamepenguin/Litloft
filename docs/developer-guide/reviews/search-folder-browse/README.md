# Review record: search modal folder browse

Invariants: [invariants.md](invariants.md).

## r1 (`2365027f6`) — [r1.md](r1.md)

No invariant break a user can reach. Triage, decided by the user:

| Finding | Bucket | Action |
|---|---|---|
| F1 a / typed mid-composition started browsing | fixed | ignored while composing (`be63ea940`) |
| F2 › left focus on body | fixed | entering a folder refocuses the field (`be63ea940`) |
| F3 the history test could never fail | B (test) | the test types a filter first (`be63ea940`) |
| F4–F10 correct code without a test, or unmeasured platform notes | B | closed without tests |
