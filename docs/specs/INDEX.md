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
| SPEC-ADDON-039 | implemented | docs/specs/haas-local-transcription.md | sha256:37526c33df7af2782a18cf431f7706321bbaf26716d0d5503b9b325a6359822c |
| SPEC-CORE-022 | implemented | docs/specs/thumbnail-slot-ownership.md | sha256:9fcfcc2fd70ea2565226ed64e3d02217fe9fbc1550e8860ffa3a7e0b91195879 |
| SPEC-CORE-023 | implemented | docs/specs/thumbnail-slot-ownership.md | sha256:9fcfcc2fd70ea2565226ed64e3d02217fe9fbc1550e8860ffa3a7e0b91195879 |
| SPEC-CORE-024 | implemented | docs/specs/thumbnail-slot-ownership.md | sha256:9fcfcc2fd70ea2565226ed64e3d02217fe9fbc1550e8860ffa3a7e0b91195879 |
| SPEC-ADDON-040 | implemented | docs/specs/thumbnail-slot-ownership.md | sha256:9fcfcc2fd70ea2565226ed64e3d02217fe9fbc1550e8860ffa3a7e0b91195879 |
| SPEC-ADDON-041 | implemented | docs/specs/scene-segment-search.md | sha256:0b5308cb70945d21e1c9c1f8d1eb0297515c254a640dfb114634165e85e2de0a |
| SPEC-ADDON-042 | implemented | docs/specs/scene-segment-search.md | sha256:0b5308cb70945d21e1c9c1f8d1eb0297515c254a640dfb114634165e85e2de0a |
| SPEC-ADDON-043 | implemented | docs/specs/clip-score-gates.md | sha256:567a5e25c0ad94154e2c8f25cf61296262730ecb127fed3b31733febf7412255 |
| SPEC-ADDON-044 | implemented | docs/specs/clip-score-gates.md | sha256:567a5e25c0ad94154e2c8f25cf61296262730ecb127fed3b31733febf7412255 |
| SPEC-CORE-025 | implemented | docs/specs/scene-segment-search.md | sha256:0b5308cb70945d21e1c9c1f8d1eb0297515c254a640dfb114634165e85e2de0a |
| SPEC-CORE-026 | implemented | docs/specs/played-segments.md | sha256:c213890b2c1ed8a97c873781974d13d8f3a9a55d712f5e997133b719ba2a94e3 |
| SPEC-CORE-027 | implemented | docs/specs/played-segments.md | sha256:c213890b2c1ed8a97c873781974d13d8f3a9a55d712f5e997133b719ba2a94e3 |
| SPEC-ADDON-045 | approved | docs/specs/scene-candidates-grid.md | sha256:5bb958dd603ce5ae59f1ba65ffb17b2b291db9dbc430ba239ff0e97ac29f6196 |
| SPEC-ADDON-046 | implemented | docs/specs/semantic-search-all-hits.md | sha256:c74146104d52b81c2e35a24ff0a67a7954d92a8d56997b89770b206553028c11 |
| SPEC-ADDON-055 | implemented | docs/specs/semantic-search-all-hits.md | sha256:c74146104d52b81c2e35a24ff0a67a7954d92a8d56997b89770b206553028c11 |
| SPEC-CORE-035 | implemented | docs/specs/semantic-search-all-hits.md | sha256:c74146104d52b81c2e35a24ff0a67a7954d92a8d56997b89770b206553028c11 |
| SPEC-ADDON-047 | implemented | docs/specs/filtered-semantic-search.md | sha256:87c313b76e9348b5ef8fa0f81153a6e4c12fd7f5eca4b50ae072e50b11bdec28 |
| SPEC-CORE-039 | implemented | docs/specs/filtered-semantic-search.md | sha256:87c313b76e9348b5ef8fa0f81153a6e4c12fd7f5eca4b50ae072e50b11bdec28 |
| SPEC-ADDON-048 | implemented | docs/specs/passage-results-view.md | sha256:1db0cb47d6ee07333751cbcb3926fede6eaefdccc1116ff27f45d6a8283667f5 |
| SPEC-CORE-040 | implemented | docs/specs/passage-results-view.md | sha256:1db0cb47d6ee07333751cbcb3926fede6eaefdccc1116ff27f45d6a8283667f5 |
| SPEC-ADDON-049 | implemented | docs/specs/image-query-search.md | sha256:d551cf9af55039fc9951695bd2669d767ef70e8f6138d50abe010df006b4d9f6 |
| SPEC-CORE-046 | implemented | docs/specs/image-query-search.md | sha256:d551cf9af55039fc9951695bd2669d767ef70e8f6138d50abe010df006b4d9f6 |
| SPEC-ADDON-050 | implemented | docs/specs/image-ocr.md | sha256:10d7b3560a941338b4c1e6ac6cf5b4d59bf3cae4d282e4269885a95d77a3598a |
| SPEC-ADDON-061 | implemented | docs/specs/in-file-find.md | sha256:73aa8f34f99d39d7e66c4b9a670d4c68290c95cd3f0424ca9c1c0ba8777768db |
| SPEC-CORE-028 | implemented | docs/specs/in-file-find.md | sha256:73aa8f34f99d39d7e66c4b9a670d4c68290c95cd3f0424ca9c1c0ba8777768db |
| SPEC-CORE-029 | draft | docs/specs/office-viewer.md | |
| SPEC-ADDON-051 | superseded | docs/specs/extraction-corrections.md | |
| SPEC-ADDON-052 | draft | docs/specs/figure-aware-reading.md | |
| SPEC-CORE-030 | implemented | docs/specs/background-upload.md | sha256:ffe09b32450a1f43cf6e5aaec2211505c8508836e1a38857b51bc8b161bf5211 |
| SPEC-CORE-031 | implemented | docs/specs/ingest-progress.md | sha256:de18030f6fb3fe7172d2ef5474e6349e04ecb055520a610d4e780e8648bcfefd |
| SPEC-CORE-037 | implemented | docs/specs/ingest-progress.md | sha256:de18030f6fb3fe7172d2ef5474e6349e04ecb055520a610d4e780e8648bcfefd |
| SPEC-ADDON-057 | implemented | docs/specs/ingest-progress.md | sha256:de18030f6fb3fe7172d2ef5474e6349e04ecb055520a610d4e780e8648bcfefd |
| SPEC-CORE-032 | implemented | docs/specs/inbox.md | sha256:f45f9a5d405e187b7402a6b9812c0af748e56ba4c749f8220f9fb72f9ed8cd0f |
| SPEC-ADDON-059 | implemented | docs/specs/inbox.md | sha256:f45f9a5d405e187b7402a6b9812c0af748e56ba4c749f8220f9fb72f9ed8cd0f |
| SPEC-CORE-041 | implemented | docs/specs/inbox.md | sha256:f45f9a5d405e187b7402a6b9812c0af748e56ba4c749f8220f9fb72f9ed8cd0f |
| SPEC-CORE-033 | implemented | docs/specs/share-target.md | sha256:6213dcd55b969f6d6b4a2b0f8c68681c4176903a969da00f83cdd12ad493d763 |
| SPEC-IOS-001 | implemented | docs/specs/share-target.md | sha256:6213dcd55b969f6d6b4a2b0f8c68681c4176903a969da00f83cdd12ad493d763 |
| SPEC-IOS-002 | implemented | docs/specs/share-target.md | sha256:6213dcd55b969f6d6b4a2b0f8c68681c4176903a969da00f83cdd12ad493d763 |
| SPEC-ADDON-053 | implemented | docs/specs/ask-about-this-file.md | sha256:7da6124f365a0c64ce31532e5697fb68fbc14a639efa56394ad99bd09b8b5b6a |
| SPEC-ADDON-056 | implemented | docs/specs/ask-about-this-file.md | sha256:7da6124f365a0c64ce31532e5697fb68fbc14a639efa56394ad99bd09b8b5b6a |
| SPEC-CORE-036 | implemented | docs/specs/ask-about-this-file.md | sha256:7da6124f365a0c64ce31532e5697fb68fbc14a639efa56394ad99bd09b8b5b6a |
| SPEC-CORE-034 | implemented | docs/specs/source-sets.md | sha256:2b59d8934e302fcf42e047581757acd70a7fcb10d2eabd9e9f70c5d47e3ed33b |
| SPEC-ADDON-058 | implemented | docs/specs/source-sets.md | sha256:2b59d8934e302fcf42e047581757acd70a7fcb10d2eabd9e9f70c5d47e3ed33b |
| SPEC-CORE-038 | implemented | docs/specs/source-sets.md | sha256:2b59d8934e302fcf42e047581757acd70a7fcb10d2eabd9e9f70c5d47e3ed33b |
| SPEC-ADDON-054 | implemented | docs/specs/ask-scope.md | sha256:e2fb3ae737126e011eefd9a1c71b9bcf60839c4137a7a7f043d935caede49458 |
| SPEC-ADDON-064 | implemented | docs/specs/ask-scope.md | sha256:e2fb3ae737126e011eefd9a1c71b9bcf60839c4137a7a7f043d935caede49458 |
| SPEC-CORE-044 | implemented | docs/specs/ask-scope.md | sha256:e2fb3ae737126e011eefd9a1c71b9bcf60839c4137a7a7f043d935caede49458 |
| SPEC-CORE-045 | implemented | docs/specs/ask-scope.md | sha256:e2fb3ae737126e011eefd9a1c71b9bcf60839c4137a7a7f043d935caede49458 |
| SPEC-ADDON-060 | implemented | docs/specs/pdf-footnotes.md | sha256:12530badbd476c63dba375a305a0f2a5416ce35ff70bca2c65e360c2fa58c902 |
| SPEC-CORE-042 | implemented | docs/specs/nfd-path-resolution.md | sha256:c8ede99437f15a3e16577af66225fa4bd3cc3ef87669a1939ae9acf2ce743680 |
| SPEC-ADDON-062 | implemented | docs/specs/nfd-path-resolution.md | sha256:c8ede99437f15a3e16577af66225fa4bd3cc3ef87669a1939ae9acf2ce743680 |
| SPEC-CORE-043 | implemented | docs/specs/search-scope-operators.md | sha256:d8241feb82371ba3f7cd552cdaa3efb30009fcb1e1bf5677781257c47320341d |
| SPEC-ADDON-063 | implemented | docs/specs/search-scope-operators.md | sha256:d8241feb82371ba3f7cd552cdaa3efb30009fcb1e1bf5677781257c47320341d |
| SPEC-CORE-047 | implemented | docs/specs/search-size-duration-operators.md | sha256:6536d3ac22dd7cee8cd0beef0fd992d9e5567f331c5365e1ba577094622ebc29 |
| SPEC-ADDON-065 | implemented | docs/specs/search-size-duration-operators.md | sha256:6536d3ac22dd7cee8cd0beef0fd992d9e5567f331c5365e1ba577094622ebc29 |
| SPEC-ADDON-066 | implemented | docs/specs/frame-ocr.md | sha256:e457ec6b9ade299f547a699c43f8ac27a4fef85449791c7f3dd9a9848549aeaf |
| SPEC-ADDON-069 | implemented | docs/specs/frame-ocr.md | sha256:e457ec6b9ade299f547a699c43f8ac27a4fef85449791c7f3dd9a9848549aeaf |
| SPEC-CORE-048 | implemented | docs/specs/frame-ocr.md | sha256:e457ec6b9ade299f547a699c43f8ac27a4fef85449791c7f3dd9a9848549aeaf |
| SPEC-ADDON-070 | implemented | docs/specs/extraction-edits.md | sha256:e651a74cf4e0e80f37003a94017fed3f61d0c2242b6bdd6a2ce4995046234ae6 |
| SPEC-ADDON-067 | implemented | docs/specs/extraction-edits.md | sha256:e651a74cf4e0e80f37003a94017fed3f61d0c2242b6bdd6a2ce4995046234ae6 |
| SPEC-ADDON-068 | implemented | docs/specs/extraction-edits.md | sha256:e651a74cf4e0e80f37003a94017fed3f61d0c2242b6bdd6a2ce4995046234ae6 |
| SPEC-ADDON-071 | implemented | docs/specs/file-ask-vision.md | sha256:e56dcacbe129568785fabd48d2e73fc599d10d4e6ad781c401e97d7960907358 |
| SPEC-ADDON-072 | implemented | docs/specs/file-ask-vision.md | sha256:e56dcacbe129568785fabd48d2e73fc599d10d4e6ad781c401e97d7960907358 |
| SPEC-ADDON-073 | implemented | docs/specs/file-ask-vision.md | sha256:e56dcacbe129568785fabd48d2e73fc599d10d4e6ad781c401e97d7960907358 |
| SPEC-ADDON-074 | implemented | docs/specs/file-ask-vision.md | sha256:e56dcacbe129568785fabd48d2e73fc599d10d4e6ad781c401e97d7960907358 |
| SPEC-CORE-049 | implemented | docs/specs/resume-archive-text.md | sha256:06e38ff5bd6554465c6474e4779a2376c1afd43cc1fafc579e1f66f9322cd5fd |
| SPEC-CORE-050 | implemented | docs/specs/resume-archive-text.md | sha256:06e38ff5bd6554465c6474e4779a2376c1afd43cc1fafc579e1f66f9322cd5fd |
| SPEC-ADDON-075 | implemented | docs/specs/ocr-line-boxes.md | sha256:34e34c624bf5010e494acb27acd3d641490b7c3488504c1991d0e22a06f90414 |
| SPEC-CORE-051 | implemented | docs/specs/ocr-line-boxes.md | sha256:34e34c624bf5010e494acb27acd3d641490b7c3488504c1991d0e22a06f90414 |
| SPEC-CORE-052 | implemented | docs/specs/persistent-highlights.md | sha256:a3289475f0de7eb5baceb80b7f281b4ade7283f8f1bde522e601d41974e1cfce |
| SPEC-CORE-053 | implemented | docs/specs/persistent-highlights.md | sha256:a3289475f0de7eb5baceb80b7f281b4ade7283f8f1bde522e601d41974e1cfce |
| SPEC-CORE-054 | implemented | docs/specs/video-library-app.md | sha256:3802363ed6d4223f69c5ba8f2766457d393097f13aaa707b38aac176c4d9c549 |
| SPEC-CORE-055 | implemented | docs/specs/video-library-app.md | sha256:3802363ed6d4223f69c5ba8f2766457d393097f13aaa707b38aac176c4d9c549 |
| SPEC-CORE-056 | implemented | docs/specs/video-library-app.md | sha256:3802363ed6d4223f69c5ba8f2766457d393097f13aaa707b38aac176c4d9c549 |
| SPEC-CORE-057 | implemented | docs/specs/video-library-app.md | sha256:3802363ed6d4223f69c5ba8f2766457d393097f13aaa707b38aac176c4d9c549 |
| SPEC-CORE-059 | implemented | docs/specs/reading-app.md | sha256:d50212bc93851ad97819185b6a7ec10e43f805aabc994a912143fb2d813836fb |
| SPEC-CORE-060 | implemented | docs/specs/reading-app.md | sha256:d50212bc93851ad97819185b6a7ec10e43f805aabc994a912143fb2d813836fb |
| SPEC-CORE-061 | implemented | docs/specs/reading-app.md | sha256:d50212bc93851ad97819185b6a7ec10e43f805aabc994a912143fb2d813836fb |
| SPEC-CORE-062 | implemented | docs/specs/reading-app.md | sha256:d50212bc93851ad97819185b6a7ec10e43f805aabc994a912143fb2d813836fb |
| SPEC-CORE-063 | implemented | docs/specs/reading-app.md | sha256:d50212bc93851ad97819185b6a7ec10e43f805aabc994a912143fb2d813836fb |
| SPEC-CORE-064 | implemented | docs/specs/no-horizontal-scroll-on-mouse.md | sha256:8d3333579eb13917fd2c7f022e2309c30c7ff27573e12bb506a44c667e2ef0fd |
| SPEC-CORE-065 | implemented | docs/specs/no-horizontal-scroll-on-mouse.md | sha256:8d3333579eb13917fd2c7f022e2309c30c7ff27573e12bb506a44c667e2ef0fd |
| SPEC-ADDON-076 | implemented | docs/specs/youtube-frames.md | sha256:d505349c8947e1efea1efcd1a9d1449cf74f7df17e7f016394d7c9c1005acfb5 |
| SPEC-ADDON-077 | implemented | docs/specs/youtube-frames.md | sha256:d505349c8947e1efea1efcd1a9d1449cf74f7df17e7f016394d7c9c1005acfb5 |
| SPEC-ADDON-078 | implemented | docs/specs/youtube-frames.md | sha256:d505349c8947e1efea1efcd1a9d1449cf74f7df17e7f016394d7c9c1005acfb5 |
| SPEC-CORE-058 | implemented | docs/specs/youtube-frames.md | sha256:d505349c8947e1efea1efcd1a9d1449cf74f7df17e7f016394d7c9c1005acfb5 |
| SPEC-ADDON-079 | implemented | docs/specs/youtube-scene-tiles.md | sha256:2e9ad74c9dc5d895d20afd14405fa0ffedff7f55d74c9c3dd75e4aef4e303f1c |
| SPEC-ADDON-080 | implemented | docs/specs/youtube-scene-tiles.md | sha256:2e9ad74c9dc5d895d20afd14405fa0ffedff7f55d74c9c3dd75e4aef4e303f1c |
| SPEC-ADDON-085 | implemented | docs/specs/youtube-storyboard-retry.md | sha256:129fbbcc2779437658a633a4f0e5782b801e7d7fde9140accc6a13ca6c561cb3 |
| SPEC-ADDON-081 | implemented | docs/specs/file-ask-thread.md | sha256:dd40710470e7f0770b3cb8fecf447c14649337918576df45e399a9813aa972c6 |
| SPEC-ADDON-082 | implemented | docs/specs/file-ask-thread.md | sha256:dd40710470e7f0770b3cb8fecf447c14649337918576df45e399a9813aa972c6 |
| SPEC-ADDON-083 | implemented | docs/specs/file-ask-thread.md | sha256:dd40710470e7f0770b3cb8fecf447c14649337918576df45e399a9813aa972c6 |
| SPEC-ADDON-084 | implemented | docs/specs/file-ask-thread.md | sha256:dd40710470e7f0770b3cb8fecf447c14649337918576df45e399a9813aa972c6 |
| SPEC-CORE-066 | implemented | docs/specs/search-results-layout.md | sha256:4891e47b05a2b3cd5f7f4e90400094d58115bbfa16581441e066f6a1942dd2f7 |
| SPEC-ADDON-086 | implemented | docs/specs/search-results-layout.md | sha256:4891e47b05a2b3cd5f7f4e90400094d58115bbfa16581441e066f6a1942dd2f7 |
| SPEC-CORE-069 | implemented | docs/specs/home-continue-desk.md | sha256:19b078dd5caa04929c8afebfe7a4934986e75674e1926f3418c9efee072e5a70 |
| SPEC-CORE-070 | implemented | docs/specs/home-continue-desk.md | sha256:19b078dd5caa04929c8afebfe7a4934986e75674e1926f3418c9efee072e5a70 |
| SPEC-CORE-071 | implemented | docs/specs/home-continue-desk.md | sha256:19b078dd5caa04929c8afebfe7a4934986e75674e1926f3418c9efee072e5a70 |
| SPEC-CORE-072 | implemented | docs/specs/continue-shelf-page-order.md | sha256:b5886fc8c28ba025737cfa7e448842e75bf443aa602ad4d7bb0c23727ec81d2c |
