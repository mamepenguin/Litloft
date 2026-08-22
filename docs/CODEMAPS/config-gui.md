# Codemap: Config GUI (first-run wizard + admin settings)

**Last Updated:** 2026-04-30
**Spec:** `docs/superpowers/specs/2026-04-30-config-gui.md`
**Scope:** Browser-based editing of `drives.json`, `passwords.json`, and per-drive addon policy. First-run wizard for new installs. Restart-pending banner driven by a filesystem flag.

## Architecture

```
Browser
  ├─ /setup            (first-run wizard, redirects until sentinel exists)
  └─ /admin/settings   (drives / passwords / addon-policy editor)
        │
        ▼  X-HV-* auth headers
  /api/admin/config/*  (FastAPI, gated by is_admin_viewer)
        │
        ▼  atomic_write_json (tmp → replace, .bak retained)
  drives.json / passwords.json
        │
        └─ touches data/restart_pending  → RestartBanner shows on /admin/*
                                          (cleared on backend startup)

  Backend startup:
    drives.json exists ∧ data/setup_completed missing  →  touch sentinel
    data/restart_pending exists                        →  unlink (changes applied)
```

## Backend

| Path | Purpose |
|---|---|
| `backend/app/routers/admin_config.py` | 11 endpoints under `/api/admin/config/*`: GET/PUT for drives, passwords (masked), addon-policy; GET restart-status, setup-status; POST complete-setup |
| `backend/app/services/config_writer.py` | `atomic_write_json` helper: `*.tmp` → `os.replace`, retains `.bak`, touches `restart_pending` flag |
| `backend/app/auth.py` | `is_admin_viewer(request)` — returns True when viewer holds every protected `access_group`, or when `passwords.json` is absent (public mode) |
| `backend/app/config.py` | `SETUP_COMPLETED_SENTINEL`, `RESTART_PENDING_FLAG` path helpers under `DATA_DIR` |
| `backend/app/main.py` | Startup hook: auto-touch sentinel when `drives.json` already exists; clear `restart_pending` flag on every boot (changes are now live) |
| `backend/tests/test_admin_config.py` | 43 tests covering the 11 endpoints, atomic write, validation rules (R1–R8 in the spec), admin-gate matrix |

## Frontend

| Path | Purpose |
|---|---|
| `frontend/src/app/admin/layout.tsx` | Admin shell: enforces admin gate, mounts `RestartBanner`, renders admin tabs |
| `frontend/src/app/admin/settings/page.tsx` | `/admin/settings` entry; composes the three section components |
| `frontend/src/app/admin/settings/DrivesSection.tsx` | Drives editor: add/remove/rename/path with inline validation against `os.path.isdir` errors |
| `frontend/src/app/admin/settings/PasswordsSection.tsx` | Passwords editor: masked current values, add/replace/delete entries; group consistency check |
| `frontend/src/app/admin/settings/AddonPolicySection.tsx` | Per-drive addon ON/OFF toggle matrix (drives × addons) |
| `frontend/src/app/setup/page.tsx` | First-run wizard route entry |
| `frontend/src/app/setup/SetupWizard.tsx` | Wizard orchestrator (6 steps, forward/back navigation) |
| `frontend/src/app/setup/steps/LanguageStep.tsx` | Step 1: ja / en (writes `NEXT_LOCALE` cookie) |
| `frontend/src/app/setup/steps/DriveStep.tsx` | Step 2: add at least one drive with live `path_not_found` validation |
| `frontend/src/app/setup/steps/AccessModeStep.tsx` | Step 3: choose public vs password protected |
| `frontend/src/app/setup/steps/PasswordStep.tsx` | Step 4: master password (covers every group from step 2) |
| `frontend/src/app/setup/steps/AddonPolicyStep.tsx` | Step 5: optional per-drive addon toggle |
| `frontend/src/app/setup/steps/CompleteStep.tsx` | Step 6: POST `/complete-setup` (touches sentinel), navigate to `/admin` |
| `frontend/src/components/RestartBanner.tsx` | Pulls `/api/admin/config/restart-status`, shows pending counts and a copyable `docker compose restart backend` command |
| `frontend/src/components/SetupRedirector.tsx` | Mounted in root layout; redirects to `/setup` when sentinel is missing and pathname ≠ `/setup` |
| `frontend/src/lib/adminConfig.ts` | Typed API client for the 11 endpoints; centralizes inline error code mapping |
| `frontend/src/components/__tests__/RestartBanner.test.tsx` | RestartBanner pending/clear states, copy-to-clipboard |
| `frontend/src/components/__tests__/SetupRedirector.test.tsx` | Redirector logic for sentinel present/missing |
| `frontend/src/app/admin/settings/__tests__/*.test.tsx` | Section editors: optimistic UI, validation surfacing, save flow |
| `frontend/src/app/setup/__tests__/*.test.tsx` | Wizard step navigation, completion, edge cases |

42 frontend tests in total across `__tests__/` directories above.

## API Surface

All routes under `/api/admin/config/`. Gate: `is_admin_viewer` (skipped only on `setup-status`, which is needed before auth state can be evaluated).

| Method | Path | Purpose |
|---|---|---|
| GET | `/drives` | Read `drives.json` verbatim |
| PUT | `/drives` | Validate + atomic-write `drives.json` |
| GET | `/passwords` | Read `passwords.json`, mask password field |
| PUT | `/passwords` | Validate + atomic-write `passwords.json` |
| GET | `/addon-policy` | Read `drives.json.addons` extracted per drive |
| PUT | `/addon-policy` | Validate addon names against manifests + atomic-write embedded into `drives.json` |
| GET | `/restart-status` | `{ pending: bool, files: [{name, count}] }` |
| GET | `/setup-status` | `{ completed: bool }` (auth-free) |
| POST | `/complete-setup` | Touch `data/setup_completed` (refuses if already set) |

Validation error codes are stable identifiers (`json_syntax`, `missing_field`, `duplicate_name`, `not_absolute_path`, `path_not_found`, `unknown_group`, `duplicate_password`, `unknown_addon`) consumed by the GUI's inline error surface.

## Filesystem State

| Path | Lifecycle |
|---|---|
| `drives.json` | Created by wizard (or manually); rewritten by GUI; `.bak` retained on every write |
| `passwords.json` | Created when user enables password protection; absent = public mode |
| `data/setup_completed` | Sentinel; presence skips the wizard. Auto-created on startup if `drives.json` already exists |
| `data/restart_pending` | Flag; touched by every successful PUT. Cleared on backend startup. Drives the RestartBanner |

## Path Collision Warning

`/api/admin/*` (dashboard) and `/api/admin/config/*` (this map) are reserved for core. Addons must not register proxy routes under `/api/admin/...` — see [`docs/ADDON-DEVELOPMENT.md`](../ADDON-DEVELOPMENT.md#pre-check-hooks) `admin` pre-check note.

## Related

- Spec: `docs/superpowers/specs/2026-04-30-config-gui.md`
- Auth model: `.claude/rules/design-decisions.md` (sections "Access control", "Watch history and profiles")
- Backend conventions (atomic write pattern): `.claude/rules/backend-conventions.md`
- Frontend conventions (Next.js 16 params, i18n): `.claude/rules/frontend-conventions.md`
