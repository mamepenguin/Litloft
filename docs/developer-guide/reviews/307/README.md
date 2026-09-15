# #307 — `/setup` addon choices across a drive rename, and a failed addon list

Four review rounds, with the invariants they were briefed with.

| File | SHA reviewed | What it reviewed |
|---|---|---|
| `r1.md` | `dd40eadf` | Addon choices keyed by drive path; load failure and retry; rejected policy save stops Finish. |
| `r2.md` | `f574831a` | Rejected drives and passwords saves stop Finish. |
| `r3.md` | `0e86ebcc` | The password validators accept `__admin__`. |
| `r4.md` | `fda544a4` | Finish always writes passwords (`[]` for Public). |

Rounds 2 to 4 each exposed a first-run security question — what Public means
when drives keep access groups, and the unauthenticated first-run write window —
so `32e572d5` restored the production code to `dd40eadf`, kept only tests that
hold its behaviour, and filed the Protected-mode password defect in
`known-issues.md`. `invariants.md` #9 to #11 describe the abandoned rounds.

Read the code for what the system does now. These files quote it as it stood at
the SHA each round reviewed.
