# Internal API policy

Rules to follow whenever you add, remove, or change an endpoint in `backend/app/routers/internal.py`. New additions must pass these rules. If reasonable people disagree, re-evaluate using the spec docs in `docs/superpowers/specs/`.

## Goal

Prevent the API the core exposes to addons from sprawling. If the Internal API grows every time a new addon feature lands, core and addon development become effectively coupled. Only expose APIs that satisfy R1-R5; everything else stays inside the addon.

## R1: First-class core entity rule

The Internal API only exposes operations on entities the core itself owns and renders.

Entities the core owns:

- drive / file / tag / comment / playlist / watch history / profile
- File lifecycle (active / missing / trash)
- File metadata (mime, size, folder_path, and other physical facts)

**Concepts that never appear in the core UI are out of scope for the Internal API.** They stay inside the addon's own domain.

## R2: Generic-shape rule

The API surface (path, parameters, response shape) must not include the name of any specific addon or feature.

- ✅ Accept `kind: str` opaquely (e.g. `file_relations.kind`).
- ❌ Surface workflow names from a specific addon directly, like `kind=not_viewed`.
- Same spirit as the "core does not interpret addon name / feature name; it's a generic dictionary" treatment of `drives.json.addons`.

## R3: Multi-addon viability test

**Ask yourself: "Can I name a concrete second addon that would use this endpoint?"**

- Yes → eligible for core (a generic foundation).
- No → it's leakage from a single addon. Keep it in that addon's DB.
- "I can't think of one but it feels conceptually generic" is a red flag. Generalization without concrete examples is just rationalization.

## R4: Write-asymmetry rule

Reads can be open to addons broadly. For writes, test "does the core's own UI / search / access control consume this data?"

- ✅ `tag` write: core search/filter UI reads tags → exposing the write is justified.
- ✅ `WatchHistory` progress: core's continue-watching UI reads it → exposing the write is justified.
- ❌ The addon writes and only the addon reads → don't add a core write; have the addon write to its own DB.

## R5: Promotion-target rule

When an addon emits "candidates / guesses / suggestions" that the user can promote, the promotion target must be one of:

- **An entity that appears in the core UI** → receive it in core (e.g. `auto_tags` Approve → `File.tags`, `suggested_relations` → `file_relations`).
- **A concept owned by a specific addon** → promote into that addon (e.g. AI summary → knowledge note).
- **Neither** → leave it in the addon DB as a candidate. Don't add a core write.

## Audit of the existing 13 endpoints (2026-04-30)

| # | Endpoint | Verdict | Notes |
|---|---|---|---|
| 1 | `GET /accessible-drives` | KEEP | drive enumeration, universal |
| 2 | `GET /drive-policy` | KEEP | drives.json policy lookup |
| 3 | `GET /files/{id}` | KEEP | file metadata |
| 4 | `GET /files/{id}/content` | KEEP | text mime allowlist + secret + size cap |
| 5 | `POST /files/{id}/tags` | KEEP | core search consumes tags |
| 6 | `GET /viewer-history` | KEEP (watch closely) | `kind=viewed/not_viewed` is conceptually generic but the use case skews toward intelligence. Borderline until a second use case appears. |
| 7 | `POST /filter-file-ids` | KEEP | access control filter |
| 8 | `POST /files/bulk-state` | KEEP | lifecycle bulk read |
| 9 | `/file_relations` (POST/GET/DELETE) | KEEP | premised on the core UI displaying it; re-evaluate if that commitment is rolled back |
| 10 | ~~`/file_active_summary` (POST/GET/DELETE)~~ | REMOVED → moved to knowledge | Completed 2026-04-30. Spec `2026-04-30-file-active-summary-to-knowledge.md` |
| 11 | `POST /addon-events` | KEEP | WS bridge, universal |
| 12 | `POST /restart-pending` | KEEP | Phase 2D (2026-05-08): addons notify the core that user-visible config changed. Phase 1 R1 (sentinel is core's), R2 (generic source/reason), R3 (knowledge note_scanner GUI / media_import config UI / intelligence transcription UI), R4 (RestartBanner reads), R5 (addon intent → core sentinel) all pass. |

## Decision flow for adding a new endpoint

When you want to add a new Internal API endpoint, walk through this in order:

1. **R1 First-class core entity**: Is the entity owned by the core? Does it appear in the core UI?
2. **R3 Multi-addon viability**: Can you name a concrete second addon that would use it?
3. **R2 Generic shape**: Does the path/parameter/response leak any addon name or feature name?
4. **R4 Write asymmetry** (for writes): Does the core's UI / search / access control read this data?
5. **R5 Promotion target** (for addon-derived data): Is the promotion target a core entity?

**All YES** → fine to add. Record the rationale in the spec doc.
**Any NO** → keep it in the addon's DB. Use the addon-to-addon proxy for cross-addon communication.

## Contract-test pattern (required when adding a new endpoint)

Two layers of contract tests are required for every new addon → core Internal API call:

**Layer 1: Wire shape test** (`httpx.MockTransport` + `monkeypatch`)
- URL, HTTP method, Content-Type, auth header presence
- Request body and response parse shape
- Error propagation (422 etc.)

**Layer 2: Validator parity test** (pytest parametrize pair table)
- Compare the addon-side input filter (e.g. `_normalise_tags`) against the core-side validator (e.g. `TagUpdate.validate_tags`)
- Detects drift between regex / cap / dedup rules on both sides
- Core schema changes will break this test, making drift visible

Both layers are necessary: Layer 1 alone misses "wire passes but core 422-rejects" silent failures; Layer 2 alone leaves the wire path (headers / secret / URL drift) unverified.

## Secret gating for write endpoints

Write endpoints require stricter secret gating than read endpoints.

- `GET /files/{id}/content` treats `CORE_INTERNAL_SECRET` as optional (no-op when unset) to preserve dev parity — **do not reuse this no-op pattern for write endpoints**.
- Threat model: compromised addon container, SSRF, future addon_proxy bugs. Reads have blast radius limited by mime allowlist + size cap; writes can corrupt integrity across any drive.
- Current pattern (personal tool premise): `CORE_INTERNAL_SECRET` unset → startup WARNING log. Full enforcement (startup error) would break dev parity and is deferred.
- If the threat model changes (production deployment, external network exposure, third-party addon providers), escalate to mandatory enforcement or a dedicated write secret.

## Why full addon-core separation (Phase 2) is deferred

The current Phase 1 stance: document R1-R5, enforce via PR review, reflect changes in the API reference in the same PR. Full separation (API stability contract, semver, breaking-change freeze) is not implemented yet because:

- **YAGNI**: Concrete use cases (e.g. `current_drive_only` filter) only revealed the right API shape after actual implementation. Pre-emptive generalization would have produced the wrong shape.
- **Patterns still evolving**: The `file_active_summary` migration is a recent example of the boundary moving. Freezing the API surface before patterns stabilize creates compatibility debt.
- **Single developer**: Core changes carry low coordination cost today.

**Phase 2 triggers** (implement when any of these appear):
- An external addon developer joins.
- Six months pass without any new Internal API additions (pattern stability signal).
- OSS public release preparation begins.

**During Phase 1**: any core change required by addon development must pass R1-R5 and be documented in the API reference in the same PR.

## References

- **Internal API reference**: [`docs/ADDON-DEVELOPMENT.md` Internal API section](../../docs/ADDON-DEVELOPMENT.md#internal-api) — wire shape, auth, and use case for every endpoint.
