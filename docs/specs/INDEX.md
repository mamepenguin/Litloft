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
| SPEC-CORE-001 | implemented | docs/specs/justified-hold-last-line.md | sha256:9dbf1b7e1bc182e39da30e263df5d53c91e72ac5435d98bd71be31180790c8c7 |
| SPEC-CORE-002 | implemented | docs/specs/justified-hold-last-line.md | sha256:9dbf1b7e1bc182e39da30e263df5d53c91e72ac5435d98bd71be31180790c8c7 |
| SPEC-ADDON-001 | implemented | docs/specs/nfc-tolerant-name-matching.md | sha256:1811edf305fbf39b2e77f979c1443d32946b0e2be702bac326f376f01e7767bf |
| SPEC-ADDON-002 | implemented | docs/specs/nfc-tolerant-name-matching.md | sha256:1811edf305fbf39b2e77f979c1443d32946b0e2be702bac326f376f01e7767bf |
| SPEC-CORE-003 | implemented | docs/specs/nfc-tolerant-name-matching.md | sha256:1811edf305fbf39b2e77f979c1443d32946b0e2be702bac326f376f01e7767bf |
| SPEC-ADDON-003 | approved | docs/specs/cloud-sync-folder-mappings.md | sha256:3e90603f758d2fb357a6e81d15f5e3f9e49b1d46c8f0a9e56a0cf04f824a33bc |
| SPEC-ADDON-004 | approved | docs/specs/cloud-sync-folder-mappings.md | sha256:3e90603f758d2fb357a6e81d15f5e3f9e49b1d46c8f0a9e56a0cf04f824a33bc |
| SPEC-ADDON-005 | implemented | docs/specs/cloud-sync-settings-gui.md | sha256:0c74f206e754bee2ca119e7326ff05b1991ac79cb8cd3876289aebfbd8849ce1 |
| SPEC-ADDON-006 | implemented | docs/specs/cloud-sync-settings-gui.md | sha256:0c74f206e754bee2ca119e7326ff05b1991ac79cb8cd3876289aebfbd8849ce1 |
| SPEC-ADDON-007 | implemented | docs/specs/cloud-sync-settings-gui.md | sha256:0c74f206e754bee2ca119e7326ff05b1991ac79cb8cd3876289aebfbd8849ce1 |
