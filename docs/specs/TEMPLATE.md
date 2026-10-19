# <Title of the change>

SPEC-ID: SPEC-<DOMAIN>-<NNN>

Approval:

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

One paragraph: what changes and who it is for.

## Required items

Answer every item. Write "none" where one does not apply, with the reason.

### 1. Normal flow

The steps of the main path, from the actor's action to the end state.

### 2. Failure cases

What can go wrong at each step and what the system does.

### 3. States

Every state the thing can be in and every allowed transition.

### 4. Data read and written

Each store, table, file or cache touched, and whether it is read or written.

### 5. External services

Each outside call, and what happens when it is slow, down or wrong.

### 6. Authorization

Who may do this and where the check lives.

### 7. Effect on existing features

What else reads or writes the same data or calls the same code.

### 8. Error behavior

What the user or operator sees on each failure, and what is logged.

### 9. User-visible behavior

Everything an observer can notice: text, ordering, timing, defaults.

### 10. Non-functional

Limits on size, time, concurrency, privacy and cost that the change must respect.

## Touch points

Where the change is planned to reach: tables and files it writes, rules and conventions it
passes through, endpoints and events it adds or changes, scripts and workflow files. Name
every protected path the change edits.

- <touch point>

## Invariants

What must not break at the touch points. Each is one observable sentence that a mutation
could violate ("A failure to create the thumbnail leaves the record and its stored bytes
unchanged"), not an intention ("handle errors properly"). Each starts a line with its id,
`I<N>.`, because a bucket A finding cites it. After approval this spec is not edited: a
revision goes into the change's `invariants.md`.

I1. <an observable sentence>

## Revises

Optional. Each invariant of an earlier approved spec that this change replaces, one line
each: `SPEC-<DOMAIN>-<NNN> I<N>. <the new sentence>`. Delete the section when there is
none.

## Checked, no action

What the author considered and deliberately skipped, so a reviewer does not report it as
an omission.
