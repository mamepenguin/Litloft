# Spec and design

How a change is specified and approved before any implementation exists. Code written
before the approval below is discarded.

## What a spec is

A spec is a design document written before the work starts. It lives where the project's
`process.conf` points (the template is `docs/specs/TEMPLATE.md`). It quotes the code as it
stood at design time, so it goes stale once the change merges.

- A spec file is not updated after the change merges, and nobody reads it to learn how
  the system behaves today.
- While the change is still open, the spec is the design material the reviewer reads.
- A section named `## Checked, no action` lists what the author considered and
  deliberately skipped. A reviewer reads it before reporting an omission.

## The ten required items

Every spec answers these. Stack-specific questions belong in `PROJECT.md`, not here.

| # | Item | The spec says |
|---|---|---|
| 1 | Normal flow | The steps of the main path, from the actor's action to the end state |
| 2 | Failure cases | What can go wrong at each step and what the system does |
| 3 | States | Every state the thing can be in and every allowed transition |
| 4 | Data read and written | Each store, table, file or cache touched, and whether it is read or written |
| 5 | External services | Each outside call, and what happens when it is slow, down or wrong |
| 6 | Authorization | Who may do this and where the check lives |
| 7 | Effect on existing features | What else reads or writes the same data or calls the same code |
| 8 | Error behavior | What the user or operator sees on each failure, and what is logged |
| 9 | User-visible behavior | Everything an observer can notice: text, ordering, timing, defaults |
| 10 | Non-functional | Limits on size, time, concurrency, privacy and cost that the change must respect |

## Touch points and invariants (R-0)

Before implementation, the author writes two lists in the spec, under `## Touch points`
and `## Invariants`, and the human approves them with it. The spec is the only place they
are written.

- **Touch points**: where the change is planned to reach. Tables and files it writes, the
  rules and conventions it passes through, endpoints and events it adds or changes, scripts
  and workflow files.
- **Invariants**: what must not break at those points.

Each invariant is an observable sentence that a mutation could violate. "A thumbnail
failure leaves the record and the stored bytes untouched" is an invariant; "handle errors
properly" is an intention and is rejected. Give each an id, because a bucket A finding
cites it. Invariants are lines that start with `I<N>.` (for example
`I4. A finding without a claim is rejected.`), and `invariant_ref` is that `I<N>`.

Where the list comes from, in order:

1. The project's declared rules at the touch points.
2. What the work is for.
3. Data that cannot be regenerated from the rest of the system.

### Revising the list

After the spec review the list is revised only by the human. A reviewer never revises
it, and the author never revises it mid-loop. A finding that a user can actually hit is
grounds to raise a revision.

The approved spec is not edited after its `Approval` line, so revisions go into
`docs/process/reviews/<topic>/invariants.md`. Its first line names the spec, and the
revisions follow, each an `I<N>.` line carrying the review that prompted it:

```
spec: docs/specs/retry.md

## Revisions

I4. (r2) A retry loop stops after the configured number of attempts, counting the first.
I9. (r3) A failed fetch leaves the cache untouched.
```

`review.sh` hands the reviewers the spec's two sections followed by this file. A revision
that reuses an id replaces that invariant; a new id adds one. An `invariants.md` with no
`spec:` line is read on its own, as the whole list.

### Revising another spec's invariant

A new spec that changes an invariant of an earlier approved spec says so in its own
`## Revises` section, one line per revised invariant, starting with the earlier spec's id:

```
## Revises

SPEC-CORE-001 I7. The usage line lists every subcommand, `count` included.
```

The earlier spec stays as approved; the revision lives in the revising spec and is
approved with it. The reviewers of the new change see the section. When a topic whose
spec declares that SPEC-ID is reviewed later, `review.sh` appends the revision from every
other spec that has an Approval line, as `I7. (<revising spec>) <sentence>`, after the
topic's own revisions and in the order of the approval commits, so the newest approved
revision replaces that invariant.

### Finding what the spec could not see

Omissions left after spec review come from the implementation reaching somewhere it was not
planned to. The first review of a change therefore asks which places the diff reaches that
are not in the touch-point list; only those are candidates for a missing invariant. An empty
answer means the list was complete.

## Approval

Implementation starts only after a human approves the spec. The spec file then carries one
line:

```
Approval: sha256:<64 hex> <approver> <date>
```

The hash is the first field and the date the last; the approver's name between them is
`git config user.name` of the clone that records it and may contain spaces. The hash is
what `scripts/process/spec-hash.sh <spec>` prints: the sha256 of the spec file with every
CR removed and every line that starts with `Approval:` removed. It names the content the
human approved, not a commit, so it survives a squash merge.

The ledger row for the spec moves to
an approved state at the same time.

`check-traceability` recomputes the hash from the current spec file and compares it with
the `Approval` line and with the ledger's `Approval` column, for every ledger row at an
approved or later state. A spec edited after approval fails. It does not check who wrote the
line or whether that person is who they claim to be. The gate for a human decision is the
platform's required review by someone other than the author; see `limitations.md`.

## SPEC-IDs and the ledger

- Each behavior the spec promises gets an id of the form the project sets in
  `spec_ref_pattern`, for example `SPEC-<domain>-<n>`. Domains and ledger states are keys in
  `process.conf` (`domains`, `ledger_states`).
- `docs/specs/INDEX.md` is the ledger, with one row per SPEC-ID: a spec file that defines
  several IDs has several rows, each with its `Approval`. The columns are `ID | State |
  Spec file | Approval`. `State` is one of the `ledger_states` in `process.conf` (default: draft,
  approved, implemented, superseded).
- Tests cite the id they verify, in the directories `process.conf` names in `test_dirs`.
  `check-traceability` reads those citations; an `implemented` row needs one.
- A behavior-preserving refactor carries the existing id and needs no new spec. A bug fix
  states the correct behavior as a SPEC id, or as an unspecified-behavior entry when no spec
  covered it.

## Acceptance tests are written from the spec alone

The acceptance tests are written by an agent or person who has the spec and nothing else:
not the implementation, not the diff, not the author's notes. A test written from the code
confirms the code; a test written from the spec can disagree with it.

- Each test names the SPEC-ID it checks.
- A test that fails at first is expected and proves the test can fail. The implementation
  is then written to make it pass.
- Where the platform lets a script restrict the test designer's Read access to the spec
  file, the kit does so. Otherwise this isolation is a rule the author follows.
- When the spec is ambiguous, stop and ask. Do not resolve it by reading the code.

## Skips

Which steps a refactor, a bug fix or a docs-only change may skip is stated once, in the
Skips table in `workflow.md`.
