# Replacing the LLM prompt goldens

The change lives in the intelligence addon
([#75](https://github.com/mamepenguin/Litloft-Intelligence-addon/pull/75)):
26 whole-text prompt goldens were replaced by assertions naming the decision
each builder makes. One golden remains, for `summaries/_common_rules.jinja2` —
the single include with two consumers.

## Invariants declared before the review

1. Every branch a prompt builder takes — a field suppressed, a section added,
   an ordering, a language line — fails some test when removed.
2. Editing `summaries/_common_rules.jinja2` fails the tests of both system
   prompts that include it.
3. An `output_language` value the lookup table does not hold reaches the model
   through each feature's fallback.
4. A test fails on a logic change and not on a rewording.
5. No branch a deleted golden was holding is left with no successor.

## Outcome

`r1.md` — 39 mutations, 7 findings. Three broke a declared invariant and were
fixed before merge: the builders for `auto_tags`, `rag.query_decomposer` and
`rag.query_transform` each name a template, and nothing pinned that name once
the goldens went (#5); the six goldens that remained also failed on rewording
outside the shared include (#4). A pre-existing gap in #3 — three of five
features had no fallback test — was closed in the same PR at the user's call.

Two findings stay open as coverage gaps over correct behaviour, which is why
they are here and not in `known-issues.md`: `clue_generator` passes its
`clue_count` to a template nothing checks it reaches, and the `.loft` → `video`
normalisation in `rag/prompt.py` has no test.
