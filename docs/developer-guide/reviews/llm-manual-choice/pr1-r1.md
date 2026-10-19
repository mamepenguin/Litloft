# PR-1 review, round 1

Reviewed: `addons/intelligence` @ `6750a95` (diff `c9ee3c0..6750a95`), tree untouched after each mutation.
Baseline: full suite 3056 passed, 2 skipped.

## Findings

No bucket-A finding: every invariant-relevant mutation I ran was killed (see Mutations). Three B findings.

### F1 [introduced] B, low — `/llm/choices/*` lists profiles that the matching POST rejects when the feature is globally off

- `app/routers/llm_choices.py:15-27` (`_choices`) and `app/llm_routing.py` `choices()` consult routing and the `llm_cloud` verdict only. The POST routes first check the global feature flag (`app/routers/summaries.py` `_require_llm_enabled` / `_require_detailed_feature_enabled`, `app/routers/rag.py` `_require_rag_enabled`), and the manifest `addon_feature` pre_check is the per-drive policy, not `features.*`.
- Scenario: `features.summaries: "false"`, drive policy allows summaries. `GET /llm/choices/summaries` → 200 with `auto` and two choices; `POST /files/f1/summary/regenerate {"profile":"local"}` → 400 `Summaries feature is disabled` (not `profile_unavailable`, so the PR-2 refetch rule would not fire).
- Reproduction (scratch test, not committed): `GET` → `200 {'auto': 'local', 'choices': [local, cloud]}`; `POST` → `400 {'detail': 'Summaries feature is disabled'}`.
- Invariant 6 holds as written (it is defined against `resolve`, which ignores `features.*`), hence B. Reachable only if PR-2 renders the menu while the feature is off; the summary section is normally hidden then. Either gate `_choices` on the same feature check, or accept and record.

### F2 [introduced] B, low — a chosen short summary is not serialised against the queue or against itself

- `app/routers/summaries.py:294-304` (task added at :301) runs `generate_summary` as a BackgroundTask; nothing marks the file as in flight (`SummariesWorker._processing` is not touched, the queue's `_has_summary` dedup does not apply).
- Scenario A: viewer presses plain Regenerate (Auto) — the worker is now inside the LLM call for file X — then picks "Regenerate with <faster local profile>". Both write via `_save_summary` (`ON CONFLICT ... DO UPDATE`); the routing result lands last and silently replaces the chosen one. Only the model name shows it.
- Scenario B: two POSTs with the same `profile` (double submit) → two concurrent LLM calls for the same file; the queue path would have run one and skipped the other.
- This is the only way I found for a request with a `profile` to end up served by a different profile later. Spec "Checked, no action" accepts concurrent *indexer, batch or sweep* items; Scenario A's trigger is the viewer's own earlier Auto regenerate, which is the most likely one and is not named there. Invariant 3 (the job it starts uses only the requested profile) still holds, hence B. Supervisor to decide whether the accepted-risk entry covers it; PR-2 disabling the menu while a regenerate is pending would close B.

### F3 [introduced] B, low — the re-embed after the DELETE on the chosen path is unguarded by any test

- `app/routers/summaries.py:292` (`await _reembed_metadata_after_summary_change(file_id)` before the `requested is None` branch).
- Mutation R5 moved the re-embed into the `requested is None` branch (so a chosen regenerate deletes the row but leaves the old `long_summary` in the metadata embedding): all tests pass. Consequence if it regressed: a chosen generation that then fails (non-dict LLM output, exception swallowed in `generate_summary`) leaves Stage-1 retrieval steering on deleted text until the next re-embed. Current code is correct; `test_summary_regenerate_with_a_choice_runs_it_beside_the_queue` replaces the re-embed with a bare `AsyncMock()` and never asserts it was awaited. Adding `assert_awaited_once_with("f1")` there would kill R5.

## Answers to the brief's questions

**Places the diff reaches that are not in the touch-point list** (only these are candidates for a missing invariant):

1. `llm_routing.resolve` for the seven *non-requestable* features, called by every worker (auto_tags, chapter_suggestions, retrieval_keywords, vision, video_visual_index, plus the summaries worker). The routing path was rewritten into `_resolve` + lazy `_Verdict`. The touch-point list names `resolve`, but invariant 1 is phrased about *requests*, so worker-initiated resolution of every feature has no invariant. Existing table `test_resolve_never_sends_offhost_without_an_allowed_answer` covers it (M11 killed); candidate invariant: "`resolve(drive, f)` without `requested` is unchanged for every feature".
2. `SummariesWorker._process_file` (queue path for on_index, indexer, batch, Auto regenerate) now calls module-level `_generate_short_long`. AST comparison of the old method and the new function (docstrings dropped, `self` removed): identical. Covered in spirit by invariants 1 and 5.
3. `app/schemas.py` now imports `app.llm_routing` at module load (new import edge schemas → llm_routing → policy_client/llm). Harmless today (suite green); noted only as reach.
4. `_Active.clients` cache: `GET /llm/choices/*` instantiates a client for every profile via `_serve`. Construction does no I/O (`LLMClient.__init__`), so no side effect beyond memory.
5. `tests/conftest.py` `use_llm` fake now accepts and ignores `requested` for every test that uses it (see test notes below).

**Worker parity (invariant 1).** The moved body is AST-identical; the call site differs only in `self.` removal; W1/W6/W7 killed by existing worker tests. Without `profile`, `regenerate_summary` runs the same DELETE → re-embed → `enqueue` → "Regeneration queued" sequence. Interaction of the in-process path with the worker: no shared state is corrupted (`_processing` is untouched, `/status` deliberately does not show it per spec decision 5, re-embed order is DELETE→re-embed in the route, then `_save_summary`'s own re-embed in the task). The only interaction is the unserialised double write in F2.

**Can a `profile` request be served by another profile?** At request time, no: `_resolve_requested` has no fallback branch (M1/M3/M5/M6/M10 killed), every route passes the `Resolved` it got from the gate into the job (X1/X2/X8 killed), and Ask binds it for the whole stream. Later: only via F2's race, or if the chosen generation fails and an unrelated later job (indexer `requeue_after_whisper`, startup sweep) fills the empty row through routing — the latter is the pre-existing "Checked, no action" item 1.

**`/llm/choices/*` leakage and agreement.** Response is `{auto, choices:[{name, model, offhost}]}` only (R11/X6 killed by an exact-JSON assertion). The verdict is looked up for the header drive only, once. `client.enabled` does not depend on the API key (`base_url` and `model` only), so absence from the list does not reveal key presence. Agreement with POST: exact for routing/policy/profile state (both go through `_resolve`), but not for the global feature flag (F1).

**Tests that would let a defect through.** No `>=` detectors, no expectation derived from the observation (choice name lists and responses are declared literals). `use_llm` returns the same client whatever `requested` is, so caller tests rely on `asked.requested == [...]` to prove the choice was forwarded; every caller test that matters does assert it (X1/X2/X8 killed through that assertion). The one vacuous mock is F3's `AsyncMock()` re-embed.

## Mutations run

Test set for each run: `test_llm_routing.py test_llm_routing_callers.py test_detailed_edit_endpoints.py test_file_insights_regenerate.py test_summaries.py test_rag_router.py test_detailed_summary_endpoints.py` (411 tests). Tree restored with `git checkout -- <file>` after each; `git status` clean at the end.

| id | target | want | result |
|---|---|---|---|
| M1 | requested off-host served on `denied` | kill | killed |
| M2 | requested `unknown` → Skip instead of Defer | kill | killed |
| M3 | requested `denied` → `local_fallback` | kill | killed |
| M4 | drop `REQUESTABLE_FEATURES` guard in `_resolve_requested` | kill | killed |
| M5 | unknown profile name → routing | kill | killed |
| M6 | `requested` ignored in `_resolve` | kill | killed |
| M7 | `_Verdict` not cached | kill | killed |
| M8 | `choices` skips a Defer instead of returning it | kill | killed |
| M9 | `choices.auto` = assigned profile ignoring policy | kill | killed |
| M10 | requested path bypasses `_serve` (disabled profile served) | kill | killed |
| M11 | routing path keeps off-host profile after fallback | kill | killed |
| M12 | drop `REQUESTABLE_FEATURES` guard in `choices` | kill | **live** — equivalent: the loop reaches `_resolve_requested`, which raises the same ValueError |
| M13 | gate loses `profile_unavailable` detail | kill | killed |
| M14 | gate does not forward `requested` | kill | killed |
| R1 | summary regenerate does not forward `profile` | kill | killed |
| R2 | chosen regenerate also enqueues | kill | killed |
| R3 | chosen regenerate goes through queue | kill | killed |
| R4 | resolve after DELETE | kill | killed |
| R5 | chosen path skips re-embed after DELETE | kill | **live** — F3 |
| R6 | detailed start drops `profile` | kill | killed |
| R7 | detailed regenerate re-resolves without `profile` | kill | killed |
| R8 | detailed regenerate resolves after 409/clear | kill | killed |
| R9 | Ask drops `profile` | kill | killed |
| R10 | choices `auto` = first choice | kill | killed |
| R11 | choices leak `api_key_env` | kill | killed |
| R12 | `/llm/choices/rag` serves summaries | kill | killed |
| R13 | choices Defer → 200 empty | kill | killed |
| S1 | Ask `profile` pattern dropped | kill | killed |
| S2 | pattern accepts uppercase | kill | killed |
| W1 | short summary records `settings.llm.model` | kill | killed |
| W2 | `generate_summary` re-resolves through routing | kill | killed |
| W3 | `generate_summary` exception not caught | live | live (BackgroundTask error is only logged either way) |
| W4 | `generate_summary` unsupported-type guard removed | live | live (route pre-flight rejects first; `_build_context` returns None) |
| W5 | `generate_summary` empty-context guard removed | live | live (same pre-flight) |
| W6 | worker ignores `_has_summary` | kill | killed |
| W7 | empty short/long check removed | kill | killed |
| MF1 | manifest `/llm/choices/rag` gated by `summaries` | kill | killed |
| MN1 | choices router not included in `app.main` | kill | killed |
| X1 | chosen regenerate task gets a routing re-resolve | kill | killed |
| X2 | Ask stream gets a routing re-resolve | kill | killed |
| X4 | chosen regenerate skips DELETE | kill | killed |
| X5 | requested on-host profile asks the policy | kill | killed |
| X6 | choices `offhost` constant | kill | killed |
| X7 | requested Defer → 400 | kill | killed |
| X8 | detailed start task gets a routing re-resolve | kill | killed |

45 mutations: 39 killed, 6 live (M12 equivalent, W3–W5 declared live, R5 → F3).

Probes (scratch copy of `tests/`, not committed): wire `POST /files/f1/summary/detailed` with no body, with `null`, and with `{"profile":"big"}` → 200/200/200, forwarded `requested` = `[None, None, "big"]` (no-body behaviour unchanged). F1 reproduction as above.

TOTAL: 3 findings
