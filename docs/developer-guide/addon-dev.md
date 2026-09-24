# Addon development

Addons extend Litloft without changes to core. This page covers the decisions you make before writing one. The contract itself — manifest fields, proxy routes, event hooks, the Internal API endpoints and the UI slots — is in [ADDON-DEVELOPMENT.md](../ADDON-DEVELOPMENT.md).

Each addon is its own Git repository, checked out as a submodule under `addons/<name>/`. See the Git section of `CLAUDE.md` for how a change that spans core and an addon is committed.

## Choose a kind

| Kind | Use when | Examples |
|---|---|---|
| **In-process** | Plain Python with light dependencies | `cloud-sync`, `media_import` |
| **Independent service** | Heavy runtime (ML models, extra system packages), or you want failures isolated from the backend | `intelligence`, `knowledge` |

An in-process addon keeps its Python package in `addons/<name>/backend/` with a `router.py` that exports `router` and `ADDON_META`. It is loaded at backend startup and shares the FastAPI app and the database session. See [ADDON-DEVELOPMENT.md → In-Process Addon](../ADDON-DEVELOPMENT.md#in-process-addon).

An independent-service addon ships a `Dockerfile` and a `manifest.json`, runs as its own container declared in `docker-compose.override.yml`, receives browser traffic through the core's addon proxy, and calls the core through the Internal API. See [ADDON-DEVELOPMENT.md → Quick Start](../ADDON-DEVELOPMENT.md#quick-start).

## Choose a scope

Declare `scope` in `ADDON_META` or `manifest.json`:

- `drive`: works inside one drive. URL `/drive/{drive}/addons/{name}`; the frontend sends `X-Lit-Drive` on every `/api/addons/{name}/...` call, and the proxy checks it before forwarding.
- `global`: no drive. URL `/addons/{name}`.
- `both`: both URLs.

An addon without a valid scope is not registered. See [ADDON-DEVELOPMENT.md → Addon Scope](../ADDON-DEVELOPMENT.md#addon-scope).

## Per-drive policy

Operators turn an addon or its features off per drive, in `drives.json` or in the **Addon policy** section of `/admin/settings`:

```json
{
  "name": "Movies",
  "addons": {
    "my_addon": { "transcription_cloud": false }
  }
}
```

- `true` / `false` turns the whole addon on or off; an object sets features one by one.
- A key that is not set counts as enabled.
- Core treats the map as a plain dictionary and never interprets addon or feature names.
- A change takes effect after a restart.

Enforce it twice: a `pre_check` or `addon_feature` on the proxy route returns 404 for a disabled feature, and your worker checks the policy (`GET /api/internal/drive-policy`) and does nothing when the feature is off. The proxy gate applies only to proxied routes; an in-process addon's own routes keep answering, so check the policy in them too. See [ADDON-DEVELOPMENT.md → Per-Drive Policy](../ADDON-DEVELOPMENT.md#per-drive-policy).

When a drive's policy turns your addon off, delete that drive's data from your own store at startup. If the policy lookup fails, skip the delete.

## Events

Declare the lifecycle events you need (`files.*`, `scan.complete`) under `event_hooks` in `manifest.json`. `configure.py` collects them into `event-hooks.json`; do not edit that file. If an entry names `secret_env`, the core sends that variable's value in the `X-Webhook-Secret` header, and your handler should compare it. When the entry names `addon` and `feature`, events for drives where that feature is off are dropped; a failed policy lookup lets the event through, so the handler should also check. See [ADDON-DEVELOPMENT.md → Event Hooks](../ADDON-DEVELOPMENT.md#event-hooks).

## UI

- Contribute to a core slot by listing it under `slots` in `ADDON_META` or `manifest.json` and exporting the component from `addons/<name>/frontend/slots.ts`. A slot nobody fills is not drawn. See [ADDON-DEVELOPMENT.md → UI Slot System](../ADDON-DEVELOPMENT.md#ui-slot-system).
- `addons/<name>/frontend/Page.tsx` becomes the addon's page at its scope URL. `addons/<name>/frontend/pages/<slug>.tsx` becomes `/drive/{drive}/addons/{name}/<slug>` or `/addons/{name}/<slug>`. Do not write wrapper routes in core.
- Translations go in `addons/<name>/frontend/messages/{locale}.json`, never in core's `messages-core/`.

## Internal API

An independent-service addon reads core data through `/api/internal/*`, which is reachable only on the Docker network. The endpoints, their secrets and their shapes are listed in [ADDON-DEVELOPMENT.md → Internal API](../ADDON-DEVELOPMENT.md#internal-api).

### Internal API policy

The Internal API stays small. A new endpoint must pass all five rules in [`.claude/rules/internal-api-policy.md`](../../.claude/rules/internal-api-policy.md):

- **R1 First-class core entity**: it operates on something the core owns and shows in its UI (drives, files, tags, comments, playlists, watch history, profiles, file lifecycle).
- **R2 Generic shape**: no addon or feature name in the path, parameters or response.
- **R3 A second addon**: you can name a concrete second addon that would call it.
- **R4 Write asymmetry**: a write is exposed only if the core's own UI, search or access control reads that data.
- **R5 Promotion target**: an addon's suggestions are promoted only into a core entity or into the addon that owns the concept.

If any answer is no, keep the data in the addon's own database. A new endpoint also needs the two-layer contract tests described in that file, and an entry in ADDON-DEVELOPMENT.md in the same PR.

## Install and remove

- **Install**: check the submodule out under `addons/<name>/` and run `./setup-addons.sh`. For an independent service, also add its service block to `docker-compose.override.yml`.
- **Remove**: stop checking the submodule out, and remove the service block if there is one. `backend/addons/` and `frontend/src/addons/` are generated by `setup-addons.sh` and replaced with real copies in the Docker build, so deleting a link there does not remove the addon.
- **Turn off for one drive**: use the per-drive policy above. It hides the addon; it does not unload it.

## Startup order

An independent service can start before the backend is ready. Add `depends_on: backend: condition: service_healthy` to its service in `docker-compose.override.yml`. A service that takes the core's data mount must have it; see below.

## Reading the core database

Prefer the Internal API. If a service must read the core database directly, mount the data directory read-only together with the JWT-secret mask, and point the addon at the file:

```yaml
volumes:
  - ./data:/data:ro
  - /dev/null:/data/.jwt_secret:ro
environment:
  - HOMEVAULT_DB_PATH=/data/data.db
```

Never mount `data.db` on its own; the reasons are in the Addons section of [`.claude/rules/design-decisions.md`](../../.claude/rules/design-decisions.md).

## Don'ts

- Do not edit `docker-compose.yml`; add your service to `docker-compose.override.yml`.
- Do not add addon-specific code to core. Addons may import core; core never imports addons.
- Do not change core code to turn an addon on or off.

## See also

- [Addon overview](../addons/overview.md)
- [ADDON-DEVELOPMENT.md](../ADDON-DEVELOPMENT.md)
- [Architecture](architecture.md)
- [HTTP API reference](../reference/api.md)
