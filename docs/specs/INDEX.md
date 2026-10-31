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
| SPEC-ADDON-003 | implemented | docs/specs/cloud-sync-folder-mappings.md | sha256:3e90603f758d2fb357a6e81d15f5e3f9e49b1d46c8f0a9e56a0cf04f824a33bc |
| SPEC-ADDON-004 | implemented | docs/specs/cloud-sync-folder-mappings.md | sha256:3e90603f758d2fb357a6e81d15f5e3f9e49b1d46c8f0a9e56a0cf04f824a33bc |
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
| SPEC-ADDON-016 | implemented | docs/specs/whisper-local-model-display.md | sha256:741a2972be1d7b7e4713e71ac74430b0d93c17672feeb99f544e00f19849c188 |
| SPEC-CORE-004 | implemented | docs/specs/configure-keeps-gui-config.md | sha256:8cffd22588fc80b7cfbc03ab254337bb6f3510d09ca75cf980941b0316a84426 |
| SPEC-CORE-005 | implemented | docs/specs/configure-keeps-gui-config.md | sha256:8cffd22588fc80b7cfbc03ab254337bb6f3510d09ca75cf980941b0316a84426 |
| SPEC-ADDON-017 | implemented | docs/specs/cue-rewind-sentence-end.md | sha256:39488e91f639e7e4d98d9cdad703de2b7ca80bec3c6646935868010308811895 |
| SPEC-ADDON-018 | implemented | docs/specs/cue-no-overlap.md | sha256:70a699fb5c763d7902f57440762de93eb51aefa9484736a312394d24661dd85c |
| SPEC-ADDON-019 | implemented | docs/specs/refine-fts-reindex.md | sha256:404a815720c48d1f31237699add7f8a2240bbeb1a69365375f128a5d49803eb3 |
| SPEC-ADDON-020 | implemented | docs/specs/refine-accept-text-key.md | sha256:9b99bd8f515d55ac40051950f2dc19e5c97cd207eb3d2aed3551aa5db7335508 |
| SPEC-ADDON-021 | implemented | docs/specs/idf-term-table.md | sha256:e0e13a033f22fdd8ea39013ff1448838f79596b0214ffa4256604ac09e60dd5a |
| SPEC-ADDON-022 | implemented | docs/specs/vec-partition-by-type.md | sha256:30ce87b0571ed03c78aa9ccbee528588e57fd80f544c25e83cef4c947814cef8 |
| SPEC-ADDON-023 | implemented | docs/specs/vec-partition-by-type.md | sha256:30ce87b0571ed03c78aa9ccbee528588e57fd80f544c25e83cef4c947814cef8 |
| SPEC-ADDON-024 | implemented | docs/specs/similar-files-on-open.md | sha256:3ca2bc754db9122108b7e45dcf1af68f1219414612ef8cdbecf6be93c20eaf10 |
| SPEC-CORE-006 | implemented | docs/specs/transparent-image-thumbnails.md | sha256:9b02f5efcf4a5f360c8cbcf4602bb6beaf3b24880518d6258b5f928fa5889090 |
| SPEC-CORE-007 | implemented | docs/specs/transparent-image-thumbnails.md | sha256:9b02f5efcf4a5f360c8cbcf4602bb6beaf3b24880518d6258b5f928fa5889090 |
| SPEC-ADDON-025 | implemented | docs/specs/search-knn-partition.md | sha256:b67aa3da71ae87e11cbecb54e0085d54cd257fbf1ac1a371b712b3341e6e2b69 |
| SPEC-ADDON-026 | implemented | docs/specs/search-knn-partition.md | sha256:b67aa3da71ae87e11cbecb54e0085d54cd257fbf1ac1a371b712b3341e6e2b69 |
| SPEC-ADDON-027 | implemented | docs/specs/media-import-unavailable-items.md | sha256:75dc39f0468f6051067054c8c78791ede86e467ae18e0bb3b4d3f839fcb239a9 |
| SPEC-ADDON-028 | implemented | docs/specs/media-import-unavailable-items.md | sha256:75dc39f0468f6051067054c8c78791ede86e467ae18e0bb3b4d3f839fcb239a9 |
| SPEC-ADDON-029 | implemented | docs/specs/media-import-unavailable-items.md | sha256:75dc39f0468f6051067054c8c78791ede86e467ae18e0bb3b4d3f839fcb239a9 |
| SPEC-CORE-008 | implemented | docs/specs/mcp-video-frames.md | sha256:906255cb063cc388ddc4e8723c3c46b065d1016336352c3ed90d99bd0b2eb31a |
| SPEC-CORE-009 | implemented | docs/specs/mcp-video-frames.md | sha256:906255cb063cc388ddc4e8723c3c46b065d1016336352c3ed90d99bd0b2eb31a |
| SPEC-ADDON-030 | implemented | docs/specs/mcp-video-frames.md | sha256:906255cb063cc388ddc4e8723c3c46b065d1016336352c3ed90d99bd0b2eb31a |
| SPEC-ADDON-031 | implemented | docs/specs/mcp-video-frames.md | sha256:906255cb063cc388ddc4e8723c3c46b065d1016336352c3ed90d99bd0b2eb31a |
| SPEC-CORE-010 | implemented | docs/specs/mcp-read-write-granularity.md | sha256:b45a5cd6231bfc7af1ed2c43119140d37ddc83a814192125737727ee69a25fd8 |
| SPEC-CORE-011 | implemented | docs/specs/mcp-read-write-granularity.md | sha256:b45a5cd6231bfc7af1ed2c43119140d37ddc83a814192125737727ee69a25fd8 |
| SPEC-CORE-012 | implemented | docs/specs/mcp-read-write-granularity.md | sha256:b45a5cd6231bfc7af1ed2c43119140d37ddc83a814192125737727ee69a25fd8 |
| SPEC-CORE-013 | implemented | docs/specs/mcp-read-write-granularity.md | sha256:b45a5cd6231bfc7af1ed2c43119140d37ddc83a814192125737727ee69a25fd8 |
| SPEC-CORE-014 | implemented | docs/specs/mcp-read-write-granularity.md | sha256:b45a5cd6231bfc7af1ed2c43119140d37ddc83a814192125737727ee69a25fd8 |
| SPEC-CORE-015 | implemented | docs/specs/mcp-read-write-granularity.md | sha256:b45a5cd6231bfc7af1ed2c43119140d37ddc83a814192125737727ee69a25fd8 |
| SPEC-CORE-016 | implemented | docs/specs/baseline-version-on-first-write.md | sha256:0eb6a5a0f5518de9bca66d7ba42918029d5a371721498e7f195264bbd240e561 |
| SPEC-ADDON-032 | implemented | docs/specs/intelligence-exact-and-scene-search.md | sha256:66254005533f7c28ac2cfb9e6d720b72e7085e738b2346145cbe8701e3923752 |
| SPEC-ADDON-033 | implemented | docs/specs/intelligence-exact-and-scene-search.md | sha256:66254005533f7c28ac2cfb9e6d720b72e7085e738b2346145cbe8701e3923752 |
| SPEC-CORE-017 | implemented | docs/specs/intelligence-exact-and-scene-search.md | sha256:66254005533f7c28ac2cfb9e6d720b72e7085e738b2346145cbe8701e3923752 |
| SPEC-CORE-018 | implemented | docs/specs/intelligence-exact-and-scene-search.md | sha256:66254005533f7c28ac2cfb9e6d720b72e7085e738b2346145cbe8701e3923752 |
| SPEC-ADDON-034 | implemented | docs/specs/embed-numpy-truthiness.md | sha256:d132b5b3e0f34bf7e1b215b28738b42f6bb23b4312320f159efc0f5ac0a0ef67 |
| SPEC-ADDON-035 | implemented | docs/specs/ask-shortlist-exact-match.md | sha256:2282595fcfd38316d072574041e309e59411d59d26c8eb875e234554ec10ba91 |
| SPEC-ADDON-036 | implemented | docs/specs/read-document-text.md | sha256:15341188b29f879364e908d4cf07075c9802547e0c6090ce667a77a6554b83f7 |
| SPEC-CORE-019 | implemented | docs/specs/read-document-text.md | sha256:15341188b29f879364e908d4cf07075c9802547e0c6090ce667a77a6554b83f7 |
| SPEC-CORE-020 | implemented | docs/specs/txt-edit.md | sha256:b9b2bf414210170871ce18124fa5157c7e8ac0dcf816086ab41362dfc631b10d |
| SPEC-CORE-021 | implemented | docs/specs/mcp-loft-url.md | sha256:e6f6f24f2ff8ab56b128db67e6917f844890d4fe02bc66d435dd2c7794ae3e75 |
| SPEC-ADDON-037 | implemented | docs/specs/txt-edit.md | sha256:b9b2bf414210170871ce18124fa5157c7e8ac0dcf816086ab41362dfc631b10d |
| SPEC-ADDON-038 | implemented | docs/specs/citation-quote-anchor.md | sha256:e15b775cb0ffa4e65cd205e852565459fe6de56a70b18359d86047f90250fe00 |
| SPEC-ADDON-039 | draft | docs/specs/haas-local-transcription.md | |
