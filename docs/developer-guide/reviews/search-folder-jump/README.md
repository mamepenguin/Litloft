# Review record: search modal folder jump

Invariants: [invariants.md](invariants.md).

## r1 (`d63ad5510`) — [r1.md](r1.md)

No path broke an invariant; bucket A empty. Following the user's standing decision from
[search-page-jump](../search-page-jump/README.md) (no tests for code that is already correct):

| Finding | Bucket | Action |
|---|---|---|
| F5 folder-order test did not hold the prefix or path rule its name claims | B | test rows fixed; both rules now fail the test when broken |
| F6 comment called the detail a second line | B (prose) | comment deleted |
| F1, F2, F3, F4 correct code without a test | B | closed without tests |
| F7, F8 static-route folder names, 50,000 cap | pre-existing | recorded |

The fix commit changed only a test and a comment, so it gets no review round of its own (R-4).
