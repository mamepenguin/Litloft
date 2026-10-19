# Principles

The process rests on one premise: an agent can be wrong. Every rule below exists to
catch that error with something other than the agent that made it.

## 1. An agent can be wrong

Treat every output of an agent, including a review that says "no problems", as a claim
to be checked. A result is trusted in proportion to the independent checks it passed.

## 2. The approved spec is the standard of correctness

A behavior is correct when the approved spec says so. In a comment, docstring or other
prose, the code wins: prose that disagrees with the code is deleted.

A spec is approved by a human before implementation starts. Work done before approval is
discarded.

## 3. Whoever implements does not grade

The agent that wrote a change does not review it, does not choose which findings count,
and does not assign the bucket of a finding. Reviewers are fresh processes that do not
carry the author's context. A fork of the author's session is not a fresh process.

Acceptance tests are written from the spec alone, before the implementation, by a role
that has not seen the implementation.

## 4. Two separate checks

- **Matches the spec.** Does the change do what the approved spec says?
- **Problems the spec does not mention.** Does the change break something the spec never
  considered?

A change can pass one and fail the other. A review answers both, separately, and neither
answer substitutes for the other.

## 5. Verification strength follows risk

The cost of checking is spent where a mistake is expensive. Risk selects how deep the
automated review goes (`min_risk`). A human is needed for a kind of question, not at a
risk level; the kinds are in `risk-and-human-review.md`, What needs a human. Risk is classified by configuration the project
owns, not by the agent that made the change.

## 6. Do not fill unknowns by guessing

When the spec is silent or ambiguous, stop and ask. A silent guess is
the most dangerous failure the process has. See `escalation.md`.

## 7. Do not loosen a check to pass

When a test or gate fails, the code is what changes. Changing the check so that it stops
failing destroys the ability to detect the problem. See `prohibited.md`.

## 8. Minimal change

Change only what the request covers. Do not mix in unrelated refactoring, renaming or
dependency updates. A pre-existing problem found along the way is recorded, not fixed in
the same change.

## 9. Prose describes the present

Comments say why the code is the way it is now, and only where a reader could
misunderstand it. History belongs in commit messages. A comment that restates the code is
a second copy that nothing keeps in step; delete it.
