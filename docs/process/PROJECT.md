# Project facts

Fill in each section. The process documents under `docs/process/` read this file for
what is specific to this project. Delete a prompt only after answering it; write "none"
where nothing applies.

## What the project is

One or two sentences: what it does and who uses it.

## Threat model

A personal tool. Its single user writes the inputs and the configuration, and no
adversary exists. A defect is what silently passes a check or silently gives a wrong
result in normal use; misuse and crafted input are out of scope.

## Stack

Languages, frameworks, build tools and the services it runs against.

## How to run the gates

The commands that build, lint and test, and how a run is told apart from "zero tests
ran". These go into `process/gates.conf`; note here anything a command needs that the
row cannot say (environment variables, a service that must be up).

## Risk zones and why

Which areas of the code deserve a higher level, and why. These become `zone` rows in
`process/risk-zones.conf`.

## Human zones

Areas where failure is not allowed, or where reviewers are known to miss errors (for
example authentication, data migration, billing). A change there needs a human to read
the diff. These become `human` rows in `process/risk-zones.conf`. Leave empty if the
project declares none.

## agent_cannot_verify

What no agent can drive in the real environment (a real device, hardware, audio, a
third-party account). A list; empty means none. Those parts are recorded as pending in
the review's `decisions.md` and a human checks them before release.

- <item>

## Where invariants live

In the spec, under `## Touch points` and `## Invariants`. Invariants are lines that start
with `I<N>.` (for example `I4. A finding without a claim is rejected.`). Revisions made
after approval go in `docs/process/reviews/<topic>/invariants.md`, whose `spec:` line names
the spec.
Note here any project-wide invariants that every change must respect.

## Where specs live

`docs/specs/`. The template is `docs/specs/TEMPLATE.md` and the ledger is
`docs/specs/INDEX.md`. Change this only together with `process/process.conf`.

## Shared state a `mutate` run could touch

A mutating reviewer works in a throwaway worktree, which isolates files only. List what
else it could affect: databases, ports, containers, caches, other branches.

## known_issues_file

Optional. A path to the file that records B and C findings a user can actually reach.
Leave empty if the project keeps none.
