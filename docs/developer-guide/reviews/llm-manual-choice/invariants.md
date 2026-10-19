# Invariants: manual LLM profile choice

## Touch points

- `llm_routing.resolve` / `describe_route`; `llm_gate.require_llm`.
- Routes: `POST /files/{id}/summary/regenerate`, `POST /files/{id}/summary/detailed`,
  `POST /files/{id}/summary/detailed/regenerate`, `POST /ask`, new `GET /llm/choices/*`.
- Summaries short/long generation called in-process from the regenerate route.
- `manifest.json` routes for `/llm/choices/*`.
- Frontend: summary, detailed summary (incl. confirm dialog), Ask page.
- design-decisions.md: "LLM features (intelligence addon)", "Addons: scope and policy".

## Invariants

1. A request without `profile` (or with `null`) resolves, writes and records
   exactly what it does on `main` today.
2. A requested off-host profile is never used on a drive whose `llm_cloud`
   verdict is denied or unknown; denied answers 400 and unknown 503, and
   neither sends anything.
3. A request with a profile that cannot be served is never answered by
   routing or `local_fallback`: it is rejected, and the job it starts uses
   only the requested profile.
4. A rejected choice changes nothing: the short summary row, the detailed
   summary row (including an edited one) and the embeddings are untouched.
5. `on_index`, folder batch and every queued job resolve through routing only;
   a choice never enters the summaries queue.
6. `GET /llm/choices/*` lists exactly the profiles that `resolve(drive, feature,
   name)` would serve, and returns no `base_url`, key name or key presence.
7. `GET /llm/choices/*` is rejected by the proxy for a drive the viewer cannot
   access, and by the feature's policy gate (404) where that feature is off.
8. Every helper call inside one Ask uses the profile that Ask resolved.
9. `resolve` without `requested` serves, skips and defers exactly as on `main`
   for every feature, including the seven that cannot take a choice.

## Revisions

- PR-1 r1: added 9 (the resolver rewrite reaches every worker's feature, not
  only the three choosable ones). Approved by the user.
