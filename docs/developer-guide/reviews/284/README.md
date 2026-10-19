# #284 — Markdown link sync owns only its own relation rows

Five review rounds, with the invariants the last rounds were briefed with.

| File | SHA reviewed | What it reviewed |
|---|---|---|
| `r1.md` | `d7cd07d9` | First attempt: reconcile rows by direction. Discarded — direction does not say who wrote a row. |
| `r2.md` | `07de9066` + knowledge `1764bd6` | `origin` column, create-path sync, startup resync. |
| `r3.md` | `e4645012` | Startup resync without claiming unmarked rows, run before serving. |
| `r4.md` | `853bdceb` | Startup resync replaced by a seed flip. |
| `r5.md` | `e4159ba3` | Startup processing removed; pre-origin rows follow the old rule. |

Read the code for what the system does now. These files quote it as it stood at
the SHA each round reviewed.
