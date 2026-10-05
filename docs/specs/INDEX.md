# Spec ledger

One row per SPEC-ID. A spec file that defines several IDs has several rows, each with its
own Approval. `ID` matches `spec_ref_pattern` in `process/process.conf`.

<!--
State is one of the `ledger_states` in process/process.conf:
  draft        written, not yet approved
  approved     a human approved it; the spec file carries the Approval line
  implemented  built and cited by tests
  superseded   replaced by a later spec
Approval is the commit sha from the spec file's Approval line, or empty while draft.
-->

| ID | State | Spec file | Approval |
|---|---|---|---|
| SPEC-CORE-001 | implemented | docs/specs/justified-hold-last-line.md | 59dc2e5f90d09804504e52a618b86d67105e8c26 |
| SPEC-CORE-002 | implemented | docs/specs/justified-hold-last-line.md | 59dc2e5f90d09804504e52a618b86d67105e8c26 |
