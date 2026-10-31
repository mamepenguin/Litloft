# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: The eval CLI `--help` output changes as a side effect of extending `ALL_PROVIDERS` and now misdescribes the default run (TP-1).; The admin settings help `languageHintHelp` still says 'Leave empty for auto-detect' and `hotwordsHelp` still names Whisper-family providers, while `haas_local` ignores both fields. The spec states they are accepted and ignored, but the form gives no hint of this while Haas is selected.
- claude-read: The eval CLI `--help` output changes as a side effect of extending `ALL_PROVIDERS` and now misdescribes the default run (TP-1).
- claude-read: The admin settings help `languageHintHelp` still says 'Leave empty for auto-detect' and `hotwordsHelp` still names Whisper-family providers, while `haas_local` ignores both fields. The spec states they are accepted and ignored, but the form gives no hint of this while Haas is selected.

## Findings

A: 0
B: 2
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The eval CLI entry point `app/evals_transcription/__main__.py`, which is not in the touch-point list, builds its `--providers` help from `ALL_PROVIDERS`, so the help now names `haas_local` as part of the default run although a run naming no providers leaves it out.
Impact: An operator running `python -m app.evals_transcription --help` is told the default covers `haas_local`, then runs with no `--providers` and gets a comparison report with no Haas row and no message saying it was excluded. They could wrongly conclude the provider was evaluated or was skipped by mistake. No transcript or index data is affected.
Evidence: `addons/intelligence/app/evals_transcription/__main__.py:68-69` formats `all available ({','.join(ALL_PROVIDERS)})`, and `:44` says 'Run every available transcription provider'. `addons/intelligence/app/evals_transcription/runner.py:58-60` and `:135` make the default `_DEFAULT_PROVIDERS`, which excludes `haas_local`. `__main__.py:89-95` passes `None` when `--providers` is absent. The touch points name only `app/evals_transcription/runner.py` for the harness, and no test covers the help text.
Repro: not_reproduced: read in code only, no command can be run in this role. Expected: `python -m app.evals_transcription --help` prints a default list containing `haas_local`, while `resolve_providers(None)` omits it (asserted by `test_spec_addon_039_i10_runner_accepts_haas_local_by_name_only`).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Export `_DEFAULT_PROVIDERS` from `runner.py`, use it in the `--providers` default text, and state that `haas_local` runs only when named. Add `__main__.py` to the touch points.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The change makes `huggingface_hub` a direct dependency of the addon, but `requirements.txt` neither pins nor names it, and the touch-point entry for that file lists only `sherpa-onnx==2.0.1`.
Impact: The version comes from whatever the other dependencies resolve to at image build. The provider's fetch classification (I7) relies on `snapshot_download` and on the `huggingface_hub.errors` classes, and R-5 measured these only at 0.36.2. A rebuild that resolves another version could change how a partial cache or a vanished file is classified. A missing module fails loudly as `FatalError`, so the exposure is a changed failure class on a first-use or partial-cache fetch. A complete cache is not at risk in the same way.
Evidence: `addons/intelligence/app/workers/transcription/haas_local.py:71-77` imports from `huggingface_hub` and `huggingface_hub.errors`. A search of the repository outside tests and process documents for `huggingface.hub` finds only that file, so `addons/intelligence/requirements.txt` has no such line. `docs/process/reviews/feature-haas-local-transcription/decisions.md` step 8 records the measured behaviour at huggingface_hub 0.36.2. CI cannot catch a drift, because `tests/haas_fakes.py` replaces the module and `Dockerfile.test` does not install it.
Repro: not_reproduced: read in code and requirements only. The resolved version in a fresh image build was not observed.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Pin `huggingface-hub` in `requirements.txt` at the measured version, if that is compatible with the existing pins, and list it in the touch points.

</details>

## Not verified

- claude-read: No test, build or command was run; every statement comes from reading the supplied diff and the working tree.
- claude-read: I could not confirm that the working tree of `addons/intelligence` is exactly commit `f8f66fff`; its HEAD is a branch ref and I did not resolve it.
- claude-read: The file list was taken from the supplied diff, not from git itself.
- claude-read: The `huggingface_hub` version resolved in a fresh image build was not observed.
- claude-read: `--help` output of the eval CLI was read in code, not executed.
- claude-read: This review answered the touch-point question; the invariants were not each checked with mutations.
- claude-verify: No command was run: neither `python -m app.evals_transcription --help` nor a pip resolve, because only Read, Glob and Grep were available.
- claude-verify: The upper and lower bounds that transformers, tokenizers, faster-whisper and others place on `huggingface_hub` were not checked, because package metadata is not in the repository.
- claude-verify: Whether the packages installed by `Dockerfile.test` pull in `huggingface_hub` transitively was not checked. The fake in `sys.modules` makes this irrelevant to the Haas tests.
- claude-verify: The submodule tree was read from the working directory, not extracted from the commit object. The session's git status showed no modification to `addons/intelligence`, which is the basis for treating it as the pinned tree.
- claude-verify: The invariants other than I10's eval part were not checked, because this pass verified only the two listed findings.

TOTAL: 2 findings
