# Decisions

decision:
ran_in_app: not-applicable
at: addons/intelligence 4f001d6
by: agent
evidence: Behavior-preserving performance change; the difference only shows at production scale, so it was measured there read-only (`init_readonly_databases()`), with the change's `app/` copied under /tmp in the intelligence container, against the running code, twice each:
  - 8wfhxjRMhwtc: load_selection_inputs 2.23 / 2.22 s -> 0.02 / 0.02 s; choose_frame_set 2.25 / 2.22 s -> 0.01 / 0.01 s
  - iKal5TJTx7Pc: load_selection_inputs 2.30 / 2.25 s -> 0.04 / 0.03 s; choose_frame_set 2.29 / 2.19 s -> 0.03 / 0.03 s
  Cause measured before the change: on vec_text (1.68 M rows) and vec_clip (1.40 M rows), `embedding_id = :id` and `IN` with one id take about 0 ms, `IN` with two or more ids 1-2.5 s per statement (87 ids: one IN 1.0 s, 87 `=` 0.007 s).
pending: none
author_resolutions:
  - F1 accept: detector misses other spellings of a join read; its docstring states it matches the written form. Test gap below threshold.
  - F2 accept: the indexer.py skip is unneeded; harmless, below threshold.
  - F3 accept: rank_scenes reads one statement per scene embedding; production holds 23 and 37 scene embeddings per drive, far below the 12k-30k where it would be slower than one IN (frequency 0).
