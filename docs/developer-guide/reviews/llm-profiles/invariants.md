# Invariants: LLM profiles and routing

Declared at spec time (2026-09-30). Revised only by the supervisor or the user.

## Touch points

- `addons/intelligence/app/config.py` (`LLMConfig`, new profile/routing types)
- `addons/intelligence/app/llm.py`, `app/dependencies.py` (client construction, cache)
- Every LLM caller: `app/workers/{summaries,auto_tags,vision,video_visual,refine,retrieval_keywords,chapter_suggestions}.py`, `app/rag/*`
- `app/policy_client.py` (new `llm_cloud` lookup), `manifest.json` `policy_features`
- `app/llm_overrides.py`, `app/routers/admin.py` `/admin/llm`, `/admin/features`
- `file_insights.metadata_json`, `video_visual_runs`, `transcript_chunks` (provenance; migrations)
- `app/main.py` (worker start-up gating), router `enabled` checks, `app/rag/tools/*`
- vision / video-visual "already described" checks
- `app/evals/*`, `scripts/` (must stay unreachable from routes/workers)
- `frontend/AdminLLMSettingsSection.tsx`, `frontend/AdminFeaturesSettingsSection.tsx`
- design-decisions.md: "Addons: scope and policy" (two-layer policy defence), "LLM features"

## Invariants

1. No request carrying a file's content, transcript, frames or image bytes reaches an `offhost` profile when that file's drive has `llm_cloud: false`.
2. When the `llm_cloud` lookup fails, nothing is sent to an `offhost` profile, the job does not fall back to `local_fallback`, and it writes nothing (so a later sweep or request picks it up again).
3. A profile with no `offhost` key is treated as offhost.
4. An install with no `llm.profiles` key sends every request to the same provider/model it used before this change, and `llm-overrides.json` written by the previous GUI still applies.
5. A request with an explicit `requested` profile that the drive does not allow fails; it is never silently served by another profile.
6. `on_index` jobs never use a `requested` profile.
7. Every newly stored LLM output records the model of the profile that produced it.
8. After a GUI save of profiles/routing, the next job resolves against the new values without a restart; a job already running completes on the profile it started with.
9. Existing LLM outputs (summaries, tags, chapters, descriptions) are not deleted or invalidated by a routing or profile change.
10. An agentic Ask tool never returns content from a file whose drive differs from the Ask's drive.
11. A skipped job writes no output row, no failed job record and no event. Exception: auto_tags stores its local-only (CLIP/TF-IDF) suggestion, which sends nothing off-host.
12. A profile's API key comes only from an environment variable named `LLM_API_KEY` or `LLM_API_KEY_<NAME>`; no other container variable can be named as a key.
13. A save from one admin section never undoes what the other section saved: saving the LLM section keeps the feature→profile choices, and saving the Features section keeps every profile's settings.
14. A profile the GUI did not touch keeps its key source on save (its `api_key_env`, or none).

## Revisions

- PR-2a round 1 (2026-09-30, user): inv 2 no longer requires an in-process retry — a deferred job writes nothing and is picked up by the next sweep or request (the retry mechanism lost and duplicated jobs). Inv 11 gains the auto_tags local-only exception, matching its behaviour when no LLM is configured.
- PR-2b start (2026-09-30, user): inv 7 records the model only, not the profile name (profile names are renamable in the GUI; only refine lacked a model record).
- PR-3 round 1 (2026-10-01, user): inv 12 added after F1 (any env var, e.g. CORE_INTERNAL_SECRET, could be named as a profile key and sent to base_url).
- PR-4 round 1 (2026-10-01, user): inv 13 and 14 added after F1 (the two sections overwrote each other) and F2 (an untouched profile gained LLM_API_KEY).
