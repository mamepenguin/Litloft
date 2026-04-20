# Per-Drive Addon Policy

How operators enable or disable specific addon features per drive via `drives.json`.

HomeVault treats **drives as the primary security boundary**. The addon system supports a two-layer model:

| Layer | Owner | Mechanism |
|-------|-------|-----------|
| **Capability** (`scope`) | Addon developer | `ADDON_META.scope` / `manifest.json#scope` — `"drive"` / `"global"` / `"both"`. Cannot be changed by the operator |
| **Policy** (enable/disable) | Operator | `drives.json` `addons` field. Cannot re-enable a capability the addon doesn't support |

This document covers the second layer.

## Schema

```json
[
  { "name": "Family", "path": "/app/drives/family" },

  { "name": "Work",
    "path": "/app/drives/work",
    "access_group": "work",
    "addons": {
      "intelligence": { "rag": false, "auto_tags": true }
    }
  },

  { "name": "Backup",
    "path": "/app/drives/backup",
    "addons": {
      "intelligence": false
    }
  }
]
```

### Value types

| Shape | Meaning |
|-------|---------|
| Field absent | All features enabled (graceful degradation for pre-policy drives) |
| `"<addon>": false` | All features of this addon are disabled for this drive (umbrella off) |
| `"<addon>": true` | All features enabled (same as omitting) |
| `"<addon>": { "<feature>": bool }` | Per-feature overrides. Unlisted features default to enabled |

The feature names are addon-defined. HomeVault treats the `addons` field as an opaque dictionary and never interprets feature names itself — the addon author defines what `rag`, `auto_tags`, `index`, etc. mean.

## Conventional feature names

The intelligence addon uses these features (see `addons/intelligence/search-config.yml.example` for authoritative list):

| Feature | Controls |
|---------|----------|
| `index` | Umbrella — Whisper / CLIP / metadata indexing. Turning this off also strips the addon entry from the drive's `/api/addons/status` |
| `search` | Semantic search endpoint |
| `auto_tags` | Suggested-tags generation |
| `summaries` | Short + long AI summaries |
| `detailed_summaries` | Long-form Markdown detailed summaries |
| `rag` | Ask (question answering) |
| `transcript_refine` | LLM-based ASR correction |

Other addons (knowledge, downloader, podcast, cloud-sync) currently ignore the `addons` field beyond the umbrella boolean.

## How the policy is enforced

Policy is enforced at multiple layers so a mistake in one doesn't leak data:

1. **`GET /api/addons/status?drive={drive}`** — The drive-aware catalog returned to the frontend strips addons whose umbrella `index` feature is disabled for the drive. Slot registrations for those addons are also removed, so the file detail page, sidebar, admin dashboard, etc. render nothing.

2. **Generic Addon Proxy `addon_feature` pre-check** — Routes in each addon's manifest declare `pre_check: {type: "addon_feature", feature: "..."}`. The proxy returns 404 for disabled features before forwarding the request.

3. **Event hooks** — Entries in `event-hooks.json` may declare `addon` + `feature`; the core drops or strips disabled-drive payloads before fan-out. Failures fail open; the addon's own WHERE-clauses are the second line of defense.

4. **Addon-side workers** — External-service addons query `GET /api/internal/drive-policy?drive=&addon=` and no-op for disabled drives. Response shape:
   ```json
   { "default": true, "features": { "rag": false, "auto_tags": true } }
   ```
   Cache the response for ≤30 seconds and fail open on lookup errors.

5. **Addon purge-on-startup** — Intelligence scans its local index for distinct drives, queries the policy, and calls `purge_drive()` for any drive whose umbrella `index` is off. Drives that fail the policy lookup are **skipped** (not purged) to avoid accidental data loss.

## Operational workflow

### Changing policy

1. Edit `drives.json` (add or modify the drive's `addons` field)
2. Restart the stack: `docker compose up -d --build`
3. For intelligence, locally-indexed data for newly-disabled drives is purged on addon startup
4. Verify:
   ```bash
   curl -b "hv_token=..." \
     "http://localhost:3000/api/internal/drive-policy?drive=Family&addon=intelligence"
   ```

### Re-enabling after disable

Re-enabling does **not** automatically re-index. Trigger a reindex manually:

```bash
curl -X POST -b "hv_token=..." \
  -H "X-HV-Drive: Family" \
  "http://localhost:3000/api/addons/intelligence/queue/reindex"
```

### Checking what a user sees

```bash
# Catalog as visible to an unlocked token for this drive
curl -b "hv_token=..." "http://localhost:3000/api/addons/status?drive=Family"
```

The response strips addons whose umbrella feature is off for that drive.

## Why this design

- **Security by default**: AI features process file content (transcripts, captions, text) and may send it to an LLM API. Per-drive policy lets an operator keep AI off for sensitive drives (legal, HR, private photos) while enabling it for public ones.
- **No cross-drive leakage**: Combined with the `current_drive_only` proxy filter and `X-HV-Drive` header enforcement, a disabled drive is invisible to the addon at every layer — catalog, routes, webhooks, and UI.
- **Opaque feature names**: HomeVault core doesn't need to evolve when an addon adds a feature. Operators learn feature names from the addon's docs and set them in the dictionary.
- **Silent drives remain enabled**: Dropping policy into a previously-unaware deployment never breaks existing features for drives that don't opt in.

## Caveats

- drives.json is read at process startup. Runtime changes require a rebuild — there is no hot-reload.
- The `addons` field does not change the addon's `scope`. A `scope=drive` addon with `addons.X = false` on drive Y will still render on drive Z (if drive Z doesn't disable it).
- Addon-side purge-on-startup only handles drives the policy lookup succeeds on. If the core is unreachable at addon start, the addon's indexed data is preserved.
- Currently only intelligence implements full per-feature policy. Other addons treat `addons.<name>: false` as umbrella-off and ignore feature maps.
