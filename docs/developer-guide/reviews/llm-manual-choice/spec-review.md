# Spec review: manual LLM profile choice

Spec: `docs/superpowers/specs/2026-10-01-llm-manual-profile-choice.md`
Invariants: `docs/developer-guide/reviews/llm-manual-choice/invariants.md`
Code: `addons/intelligence` at `c9ee3c0`; core at `c448c30` (proxy, `lib/fileAiActions.ts`, `lib/api.ts`)

## Checked, holds

- **Resolve-first ordering.** All four routes already resolve before any check that writes
  or returns early: `routers/summaries.py:261` (short regenerate, before the 404, pre-flight
  400, row DELETE at 277 and re-embed at 282), `:602` (detailed start, before the 409 at 612),
  `:1057` (detailed regenerate, before the 409/force check at 1078 and every DELETE/UPDATE),
  `routers/rag.py:246` (before the length check, semaphore and stream). Passing `requested`
  into the existing `require_llm` call satisfies decision 4 with no reordering.
- **Self-resolving helpers.** None in the three features. `generate_detailed_summary`
  (`workers/summaries.py:1027-1135`) uses only the `Resolved` it is handed; `_recalculate_citations`
  and `app/citations.py` make no LLM call. Every Ask helper reads `llm_routing.bound_client()` /
  `bound_resolved()` (`rag/query_transform.py:385`, `clue_generator.py:154`,
  `category_expander.py:76`, `query_decomposer.py:301`, `service.py:991,1021,1254,1700`), and
  `stream_answer` binds per step (`service.py:2298-2315`). Agentic gating reads the bound
  profile's `agentic` (`service.py:991-996`). Decision 6 holds as written.
- **Cross-drive leak in choices.** The list is computed per drive from global profiles and that
  drive's `llm_cloud` verdict only; the proxy's drive check runs first. Nothing from another
  drive is reachable.

## Findings

### F1 — major — A requested short-summary regenerate is silently satisfied by an unrequested queue item

Evidence:
- `workers/summaries.py:1144` the queue is a plain `asyncio.Queue`; `enqueue` (`:1154-1173`)
  never dedupes against items already waiting.
- `workers/summaries.py:1293-1296` `_process_file` skips short/long once `_has_summary(file_id)`
  is true, whatever the queue item carried.
- Producers that put `(file_id, None)` for the same file once the regenerate route deleted its row
  (`routers/summaries.py:277-280`): the indexer re-enqueue on re-index (`indexer.py:1023-1034`,
  `:1293-1302`, gated on `no_summary`), the folder batch (`routers/summaries.py:487-503`, skips only
  files that *have* a row, so right after the DELETE it enqueues), the start-up sweep
  (`workers/summaries.py:1234-1248`), and a second press on the plain regenerate button.
- `SummarySection.tsx:85-101` polls and accepts whichever summary appears first.

Consequence: if `(f, None)` is ahead of `(f, "big")` in the queue (a backlog behind an on_index
sweep, a re-index, a folder batch press), routing generates the summary and the requested item
then skips because a summary exists. The user asked for `big` and gets routing's output, shown as
the regenerate's result. The reverse order (`big` then a later plain press) silently drops the
later request. Breaks invariant 3 ("never replaced by routing … at processing time").

Suggested spec change: make the request, not the queue item, carry the choice. For example a
worker-held `pending_requested: dict[file_id, str]` written by the regenerate route (last write
wins) and popped by whichever `_process_file` for that file runs first; or a requested item that
regenerates even when a summary exists, with plain items skipping while a requested one is
pending. Add an invariant: "the summary written after a requested regenerate is produced by the
requested profile or not at all, whatever other enqueues for that file happen meanwhile."

### F2 — major — `/llm/choices?feature=…` cannot be policy-gated per feature with one manifest route

Evidence:
- `manifest.json` `proxy.routes[].pre_check` is `{type: addon_feature, feature: <fixed>}`; core reads
  the single static value (`backend/app/routers/addon_proxy.py:578-583`) and matches routes on the
  path only (`:517-519`, query string not part of `route_path`). The route-level `addon_feature`
  key (`:609-615`) is also one fixed value.
- "Like the routes it serves" is itself inconsistent: `POST /files/{id}/summary/detailed/regenerate`,
  the only detailed endpoint the UI calls (`DetailedSummarySection.tsx:238`; `startDetailedSummary`
  is not used there), is gated by `file_access` alone, with no `detailed_summaries` policy gate,
  while `POST …/summary/detailed` has one.

Consequence: implemented as written, the single route gets one feature's gate (wrong for the other
two) or none. Decision 7's "gated by the feature's addon policy" and "other feature values → 422"
can't both hold through the proxy. An implementer working it out on the spot will pick
arbitrarily.

Suggested spec change: either three literal routes (`/llm/choices/summaries`,
`/llm/choices/detailed_summaries`, `/llm/choices/rag`), each with its own `addon_feature`
pre_check (an unknown feature then gets the proxy's 404, not 422), or one route with the policy
checked inside the addon via `policy_client.is_feature_enabled(drive, feature)`, stating
fail-open or fail-closed. State whether the detailed choices follow the detailed regenerate
route's current lack of a policy gate.

### F3 — major — Invariant 7 asserts a status code the proxy does not return

Evidence: `backend/app/routers/addon_proxy.py:510-515`. An `X-Lit-Drive` the viewer cannot access
is rejected with **403** "Drive not accessible" before route matching, for every route of a
`scope: drive` addon (`manifest.json` `scope: "drive"`). Only `file_access` pre_checks give 404.

Consequence: a test written against invariant 7 fails against an unchanged proxy. Making it pass
means changing the core proxy, which this spec says is out of scope ("core `docs/` only") and
which would change every intelligence route. The invariant would push the implementer toward a
wrong code change.

Suggested spec change: rewrite invariant 7 as "a request for a drive the viewer cannot access is
refused by the proxy's drive check exactly as `/ask` is, and returns no profile data". Test it
at the addon by asserting that the route requires `X-Lit-Drive` (`require_drive`) and that the
manifest entry has no `drive_optional`.

### F4 — major — The detailed-summary confirm dialog drops the chosen profile

Evidence: `DetailedSummarySection.tsx:247-263`. When the summary is edited or a knowledge note is
active, `handleGenerate` only opens a dialog. `handleConfirmRegenerate` then calls
`doRegenerate(true)` with no other context.

Consequence: if the profile is threaded through as an argument the way `force` is, the confirm
path never receives it. The edited summary is overwritten by **routing's** profile after the user
confirmed losing edits in order to use model X. That is a substitution of the explicit choice.
The spec says nothing about it, so the natural implementation has this bug.

Suggested spec change: the pending choice is held across the confirm dialog (state set when the
"▾" entry is pressed, consumed by `handleConfirmRegenerate`). Add a test: an edited summary,
"Regenerate with X", then confirm, sends `{force: true, profile: "X"}`.

### F5 — minor — `400 profile_unavailable` can't be distinguished by the summary/detailed clients as they are

Evidence: `regenerateSummary` / `regenerateDetailedSummary` use core `fetchJSON`
(`frontend/src/lib/api.ts:7-13`), which throws `API error: 400 Bad Request` and discards the body.
The same route already returns other 400s (`insufficient_content`, `unsupported_type`,
"LLM is not enabled"). `SummarySection.tsx:97-99` swallows every error. `DetailedSummarySection.tsx:240-241`
only refetches.

Consequence: decision 8's "message + refetch choices" on `profile_unavailable` can't be keyed on
the detail without either changing core `fetchJSON` (out of the declared repos) or adding an
addon-local fetch that reads the body, as `askQuestionStream` already does (`api.ts:1557-1575`).
Left unstated, the implementer either edits core or matches on a status code that also covers
the pre-flight 400s.

Suggested spec change: state that the two summary calls get an addon-local fetch that surfaces
`{status, detail}`, and that the UI reacts only to `detail === "profile_unavailable"`.

### F6 — minor — "Shown only with two or more choices" hides the only usable profile

Evidence: decision 7 sets `auto = null` when `resolve(drive, feature)` is `Skip`. Example: routing
assigns an off-host profile, the drive denies `llm_cloud`, and there is no `local_fallback`
(`llm_routing.py:310-312`). A local profile still resolves for a request (no policy step for
local, `:330`), so `choices = [local]`.

Consequence: with one entry the control is hidden. The plain button returns 400 "LLM is not
enabled" (`llm_gate.py:17-18`) and nothing is offered, although a working profile exists. In
Ask, an "Auto" option is offered even when `auto` is null, and choosing it returns 400.

Suggested spec change: show the control when `choices` contains any profile other than `auto`
(which covers `auto == null` with one choice). When `auto` is null, hide the "Auto" entry or show
it disabled.

### F7 — minor — A processing-time `Defer`/`Skip` for a requested short summary is newly reachable, and later filled by routing

Evidence: `workers/summaries.py:1313-1318`. A non-`Resolved` result is dropped with no retry. The
row was already deleted (`routers/summaries.py:277-280`). With `on_index`, the next indexer
re-enqueue or start-up sweep regenerates with routing (`indexer.py:1023-1034`, `main.py:257-263`).
The policy cache TTL is 30 s and the queue may be long, so the processing-time lookup is a fresh
call.

Consequence: "Checked, no action" says this change does not make the empty-summary outcome
easier to hit. It does in one case: on a drive whose routing is local, choosing an off-host
profile adds a second `llm_cloud` lookup at processing time, and that lookup can fail (Defer) or
flip (Skip). The user's regenerate ends with no summary, and on `on_index` installs routing's
summary appears later.

Suggested spec change: either carry the route's `Resolved` (or the profile snapshot) in the queue
item, as detailed summaries and Ask already do, so policy is checked once at request time.
Stage 1 decision 10 already says in-flight jobs keep their client. Or list this case explicitly
under "Checked, no action".

### F8 — minor — Touch points miss the parts of the worker and `/status` that a tuple queue item reaches

Evidence: `workers/summaries.py:1247` (`enqueue_unprocessed` puts a bare `file_id` directly),
`:1252-1268` (`run` appends the dequeued item to `_processing`), `:1147-1152` (`get_status`), which
is exposed through `/status` (`main.py:471-472`) and read by the admin index status UI.

Consequence: changing the item to `(file_id, requested)` in `enqueue` alone leaves
`enqueue_unprocessed` putting bare strings, so the worker's unpack fails on start-up sweep
items. Or, if `run` stores the tuple, `/status.processing` changes shape for the dashboard.

Suggested spec change: add `enqueue_unprocessed`, `run` and `get_status` to the touch points, and
add the invariant "`/status` `tasks.summaries.processing` remains a list of file ids."

### F9 — minor — "Page's lifetime" for Ask is ambiguous against the citation round-trip and drive changes

Evidence: Ask has no conversation. Each submit is an independent `runAsk` (`Page.tsx:428-500`). A
citation click followed by Back remounts the page component. The page then restores the answer
from the sessionStorage cache keyed by `(drive, question)` only (`Page.tsx:72-85`, `:807-822`),
or, on a cache miss, auto-fires `?q=` again. `drive` comes from `useCurrentDrive()` (`:382`), and
choices are per drive.

Consequence: "reset on a new page load" doesn't say whether the SPA remount after a citation
round-trip counts. In practice it resets the select to Auto, and a cache-miss auto-fire re-asks
with Auto. If the drive changes while the page stays mounted, the kept choice may be off-host
and denied on the new drive, which returns 400.

Suggested spec change: state that the choice lives in component state, resets on mount (so the
citation round-trip and `?q=` auto-fire use Auto), and resets with a refetch when `drive`
changes. After a `profile_unavailable` refetch, a selection that is no longer listed falls back
to Auto, so the retry button does not resend it.

### F10 — minor — The AI-menu entries need a shape the spec does not give

Evidence: core `useOfferFileAiAction` registers exactly one entry per hook call, keyed by `id`,
with a flat menu and no submenu (`frontend/src/lib/fileAiActions.ts:95-130`).
`useOfferIntelligenceAction` takes a fixed `labelKey` with no interpolation
(`offerIntelligenceAction.ts:43-65`). The summary/detailed offers are active only when no summary
exists (`SummarySection.tsx:163-172`, `DetailedSummarySection.tsx:395-406`).

Consequence: "The file-level AI menu offers the same entries" needs a dynamic number of offers.
That works without a core change only if each choice is rendered as its own child component (one
hook call each) with a distinct `id` (for example `intelligence.summary.with.<name>`) and a
parameterised label. Otherwise the implementer reaches for a core change, outside the declared
repos. The entries also read as "Generate with…", not "Regenerate with…", because the menu only
lists missing outputs.

Suggested spec change: specify one offer per choice via child components, the id scheme, a label
parameter on `useOfferIntelligenceAction`, and the "Generate with…" wording for the menu.

### F11 — minor — The encoding of `profile` for Auto is unspecified, and an empty string becomes a 400

Evidence: `AskRequest` / the summary bodies use pydantic's default (extra ignored,
`schemas.py:500-525`). With `profile: str | None`, `""` reaches `resolve` as an unknown name, which
decision 3 turns into `Skip` and then 400 `profile_unavailable`.

Consequence: a `<select>` whose Auto option has value `""` sends `profile: ""`, and every Auto
Ask fails with "profile unavailable".

Suggested spec change: the client omits `profile` (or sends `null`) for Auto, and the schema
validates `profile` against the profile-name pattern (`llm_routing._PROFILE_NAME_RE`) so `""` and
malformed names get 422, not 400.

TOTAL: 11 findings
