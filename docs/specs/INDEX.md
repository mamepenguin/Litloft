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
| SPEC-ADDON-008 | implemented | docs/specs/json-mode-fallback.md | sha256:19de2e5a5c56a8cceebbe27b623b2df92d1c80a4ff28b0225637ee9dd4522bfd |
| SPEC-ADDON-009 | implemented | docs/specs/whisper-langdetect-refine-digits.md | sha256:8be8731afa3c6953b4f50a38c4d0aa9881c527cdbea7a71b7f20c9c47ca07c8b |
| SPEC-ADDON-010 | implemented | docs/specs/whisper-langdetect-refine-digits.md | sha256:8be8731afa3c6953b4f50a38c4d0aa9881c527cdbea7a71b7f20c9c47ca07c8b |
| SPEC-ADDON-011 | implemented | docs/specs/whisper-langdetect-refine-digits.md | sha256:8be8731afa3c6953b4f50a38c4d0aa9881c527cdbea7a71b7f20c9c47ca07c8b |
| SPEC-ADDON-012 | implemented | docs/specs/whisper-langdetect-vad-aligner-sentences.md | sha256:19351a069b5b1fd71deb6c77dd9f96c268c72df7de55411c04f42956fac35509 |
| SPEC-ADDON-013 | implemented | docs/specs/whisper-langdetect-vad-aligner-sentences.md | sha256:19351a069b5b1fd71deb6c77dd9f96c268c72df7de55411c04f42956fac35509 |
| SPEC-ADDON-014 | implemented | docs/specs/whisper-langdetect-vad-aligner-sentences.md | sha256:19351a069b5b1fd71deb6c77dd9f96c268c72df7de55411c04f42956fac35509 |
| SPEC-ADDON-015 | implemented | docs/specs/digit-colon-times.md | sha256:c19907e7074c1d4761a052d6e5c1879cda0648ce8d3ddc17b43a68f77dd77864 |
| SPEC-CORE-004 | draft | docs/specs/configure-keeps-gui-config.md | |
| SPEC-CORE-005 | draft | docs/specs/configure-keeps-gui-config.md | |
