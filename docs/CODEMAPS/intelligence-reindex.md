# intelligence reindex controls

**Last Updated:** 2026-05-24
**Spec:** [`docs/superpowers/specs/2026-05-24-intelligence-reindex-controls.md`](../superpowers/specs/2026-05-24-intelligence-reindex-controls.md)

How the intelligence addon exposes "regenerate this index" controls to operators after the global *Reindex all* button was removed. Two scoped paths replace it: per-file × per-task regeneration from the file detail page, and per-row retry from a global failed-jobs modal on the admin dashboard. The embedding-model swap (`reindex_pending`) is an independent flow handled at restart and is not covered here.

## What got removed

| File (in `addons/intelligence/`) | Removed |
|---|---|
| `manifest.json` | `proxy.routes` entry for `POST /queue/reindex` |
| `app/routers/queue.py` | `queue_reindex` handler |
| `app/indexer.py` | `IndexManager.reindex_all()` method (sole caller was the route above) |
| `frontend/api.ts` | `searchQueueReindex` export |
| `frontend/IndexStatusWidget.tsx` | *Reindex* button, `confirmReindex` state, the `handleReindex` callback, and the matching `ConfirmDialog` block |
| `frontend/messages/{ja,en}.json` | `reindex` and `confirmReindex` keys (the embedding-side `reindexPending` / `confirm.reindex` keys are kept) |

`tests/test_admin_manifest_parity.py` carries two **death-confirmation tests** that assert `/queue/reindex` is absent from both the manifest and the router, and that `IndexManager` has no `reindex_all` attribute. They exist to stop a future "let's just put the convenient button back" regression.

## Per-file × per-task regeneration

### Backend

| File | Role |
|---|---|
| `addons/intelligence/manifest.json` (`/files/{file_id}/reindex`) | `pre_check: file_access` — proxy verifies file exists and the caller can access its drive before forwarding |
| `addons/intelligence/app/routers/files.py` | `POST /files/{file_id}/reindex` handler — validates `tasks`, looks up `IndexedFile`, resets the matching `*_indexed` flags, enqueues each task |
| `addons/intelligence/app/schemas.py` | `ReindexRequest` (allowed tasks: `metadata` / `clip` / `whisper` / `text`), `ReindexResponse` (`status`, `file_id`, `tasks_reset`) |
| `addons/intelligence/app/indexer.py` | `IndexManager.is_queued(file_id, task)` and `enqueue_task_for_file(file_id, task)` — both used by the handler to detect duplicates and feed the in-memory queue |

Behaviour:

- Unknown task name → `422 {detail: "Unknown task: '...'. Allowed: metadata, clip, whisper, text"}`.
- File not active (deleted / missing) → `404`.
- A task already in the queue for the same file → `202 {status: "already_queued", tasks_reset: []}` (no double False-flip, no double enqueue). Worker is idempotent anyway; this is for UX of rapid clicks from the modal.
- Multiple tasks per call allowed; each is checked independently.

Tests: `addons/intelligence/tests/test_reindex_endpoint.py` (13 cases — schema validation, 404 / 422 paths, `already_queued` dedupe, cross-drive `file_access` rejection, multi-task happy path).

### Frontend

| File | Role |
|---|---|
| `addons/intelligence/frontend/IndexDetailsSection.tsx` | New section, registered into `file-detail-sections` slot at priority 30 (between `clip-frames` at 20 and `similar-files` at 40). Renders the `status` map from `GET /files/{id}/index-details` as one row per task with a *Regenerate* button (lucide `RefreshCw`), a `Loader2` spinner while in flight, and recent `provider_stats` lines for error context |
| `addons/intelligence/frontend/api.ts` | `getIndexDetails(fileId)` and `reindexFile(fileId, tasks)` — kept separate from the admin-side `getFailedJobs` because the `pre_check` differs (`file_access` vs `admin`) |
| `addons/intelligence/frontend/slots.ts` | Registers `"index-details": lazy(() => import("./IndexDetailsSection"))` |
| `addons/intelligence/frontend/messages/{ja,en}.json` | New keys for the Regenerate button label, confirm dialog copy, and per-task labels |

Tests: `addons/intelligence/frontend/IndexDetailsSection.test.tsx`.

## Failed-jobs observation + retry

### Backend

| File | Role |
|---|---|
| `addons/intelligence/manifest.json` (`/admin/failed-jobs`) | `pre_check: admin` — caller must have every protected `access_group` unlocked |
| `addons/intelligence/app/routers/admin.py` | `GET /admin/failed-jobs` — selects the latest `JobRecord` per `(file_id, job_kind, provider)` filtered to `status='failed'`, joins `IndexedFile` for `filename` / `drive`, truncates `error_message` to 256 chars, computes `attempts` as the run length of consecutive failures since the last success |
| `addons/intelligence/app/schemas.py` | `FailedJobItem`, `FailedJobsResponse` |

Behaviour:

- Window: 7 days (reuses `_PROVIDER_STATS_WINDOW_DAYS`).
- `status='skipped'` rows (e.g. `UnsupportedMimeType`) are intentionally excluded — retrying would re-skip.
- Purged files (file_id no longer in `IndexedFile`) are excluded.
- Retry is performed by the frontend calling the per-file × per-task endpoint above; the addon does not expose a separate `retry` route.

Tests: `addons/intelligence/tests/test_failed_jobs_endpoint.py` (12 cases — admin gate, aggregation, `skipped` exclusion, purge exclusion, ordering, attempt counting). `addons/intelligence/tests/test_admin_manifest_parity.py` was extended with the death-confirmation tests for `/queue/reindex` and `reindex_all` plus the parity assertion for the new `/admin/failed-jobs` route.

### Frontend

| File | Role |
|---|---|
| `addons/intelligence/frontend/IndexStatusWidget.tsx` | Failed-jobs summary row replaces the old *Reindex* button. *N == 0* → muted "no failed jobs" label; *N > 0* → amber background with `AlertTriangle`, clickable to open the modal. Pause / Resume buttons in the header are unchanged. Polled every 10 s with `?limit=1` to keep the row count fresh |
| `addons/intelligence/frontend/FailedJobsModal.tsx` | New modal. Lists each row with filename, drive, task kind, provider, `error_class`, `attempted_at`, attempts; *Retry* button calls `reindexFile(fileId, [task])`; *Details* link is an SPA navigation (`<Link>` / `router.push`, never `window.location.href`) to the file detail page anchored at the `IndexDetailsSection`. A 24px gutter is reserved at the start of each row for a future multi-select checkbox (Phase 2 only) |
| `addons/intelligence/frontend/api.ts` | `getFailedJobs({ limit, offset })` and the `FailedJobsResponse` type |

Tests: `addons/intelligence/frontend/FailedJobsModal.test.tsx`.

## Independence from the embedding-model swap

The `text_embedding` switch on the intelligence admin page writes to `embedding-overrides.json`, calls `POST /api/internal/restart-pending` to flip the core's sentinel, and rebuilds `vec_text` on the **next container restart** (`_migrate_vec_text_if_needed` in `addons/intelligence/app/database.py`). It does **not** call `IndexManager.reindex_all()` and never did, so removing that method has no impact on it. The two paths share no code and no UI surface — keep them documented as separate flows.

## Related docs

- [intelligence addon overview](../addons/intelligence.md#re-generating-indexes)
- [ADDON-DEVELOPMENT — Intelligence Addon Reference → UI Slots Provided](../ADDON-DEVELOPMENT.md#ui-slots-provided)
- Internal API policy reasoning for `pre_check: file_access` on this kind of per-file write: [`.claude/rules/internal-api-policy.md`](../../.claude/rules/internal-api-policy.md) R4
