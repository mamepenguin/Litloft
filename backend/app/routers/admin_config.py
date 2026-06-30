"""Admin config GUI endpoints.

Spec: docs/superpowers/specs/2026-04-30-config-gui.md

These endpoints power the first-run wizard (``/setup``) and the admin
settings screen (``/admin/settings``). They wrap edits to:

- ``drives.json``       — drive list, paths, access groups
- ``passwords.json``    — password → groups mapping (write-only; GETs mask)
- ``drives.json.addons`` — per-drive addon policy (lives inside drives.json)

Auth model:
  GET endpoints require admin (``auth.require_admin``: viewer must hold
  every protected access_group).

  Two endpoints are unconditionally public so the first-run wizard works
  before any admin viewer exists:

  - ``GET  /setup-status``     — read the sentinel for redirect logic
  - ``POST /complete-setup``   — wizard finalisation

  Write endpoints (PUT /drives, PUT /passwords, POST /passwords/append,
  DELETE /passwords/{index}, PUT /addon-policy) use ``_admin_or_first_run``
  which is a bypass: when the ``setup_completed`` sentinel is absent, anyone
  on the LAN can write config. The bypass closes the moment the wizard
  touches the sentinel; ``require_admin`` semantics resume immediately.
  This is intentional — the wizard's first PUT establishes drive
  ``access_group``s, after which a strict ``require_admin`` would lock the
  user out before the second PUT can supply a password.

All writes go through :func:`app.services.config_writer.atomic_write_json`
which guarantees the existing config remains valid if the write fails
mid-flight, and creates a single-generation ``.bak``.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request

import app.auth as auth
import app.config as config
from app.services import addon_registry
from app.services.config_writer import atomic_write_json

logger = logging.getLogger(__name__)

# Public router (no auth gate). The two wizard endpoints live here so the
# first-run flow can run before any admin viewer exists. All other
# endpoints get the admin gate applied per-route below.
router = APIRouter(prefix="/api/admin/config", tags=["admin-config"])

MASKED_PASSWORD = "***"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _read_drives_from_disk() -> list[dict[str, Any]]:
    """Return drives.json contents (or empty list if file is absent).

    Reads directly from disk (not via ``config.load_drives``) so the GUI
    always reflects the on-disk truth — caches are written under our feet.
    """
    drives_path = Path(config.DRIVES_CONFIG)
    if not drives_path.exists():
        return []
    with drives_path.open(encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, list):
        raise HTTPException(
            status_code=500,
            detail={"code": "drives_json_invalid", "message": "drives.json is not a JSON array"},
        )
    return raw


def _read_passwords_from_disk() -> list[dict[str, Any]]:
    pw_path = Path(auth.PASSWORDS_CONFIG)
    if not pw_path.exists():
        return []
    with pw_path.open(encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, list):
        raise HTTPException(
            status_code=500,
            detail={"code": "passwords_json_invalid", "message": "passwords.json is not a JSON array"},
        )
    return raw


def _validation_error(code: str, message: str, *, field: str | None = None) -> HTTPException:
    detail: dict[str, Any] = {"code": code, "message": message}
    if field is not None:
        detail["field"] = field
    return HTTPException(status_code=422, detail=detail)


def _validate_drives_payload(payload: Any) -> list[dict[str, Any]]:
    """Validate a drives.json payload. Raises HTTPException(422) on failure.

    Rules (spec, Y mode — every error surfaced):
      1. Must be a JSON array of objects.
      2. Each entry needs ``name`` and ``path`` (non-empty strings).
      3. ``name`` values must be unique across the list.
      4. ``path`` must be absolute.
      5. ``path`` must point at an existing directory inside the container.
    """
    if not isinstance(payload, list):
        raise _validation_error("json_syntax", "drives must be a JSON array")

    seen_names: set[str] = set()
    for entry in payload:
        if not isinstance(entry, dict):
            raise _validation_error("json_syntax", "drives entry must be an object")

        name = entry.get("name")
        if not isinstance(name, str) or not name.strip():
            raise _validation_error("missing_field", "name is required", field="name")

        path_str = entry.get("path")
        if not isinstance(path_str, str) or not path_str.strip():
            raise _validation_error("missing_field", "path is required", field="path")

        if name in seen_names:
            raise _validation_error("duplicate_name", f"duplicate drive name: {name}", field="name")
        seen_names.add(name)

        if not os.path.isabs(path_str):
            raise _validation_error(
                "not_absolute_path",
                f"path must be absolute: {path_str}",
                field="path",
            )

        if not os.path.isdir(path_str):
            raise _validation_error(
                "path_not_found",
                "Path not found in container. Check docker-compose.yml volumes.",
                field="path",
            )

    return payload


def _validate_passwords_payload(
    payload: Any,
    drives_for_groups: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Validate passwords.json payload. Raises HTTPException(422) on failure.

    Rules:
      6. Each entry must have ``password`` (non-empty, non-masked) + ``groups``.
      7. Every referenced group must exist as ``access_group`` in drives.json.
      8. Password values must be unique.
    """
    if not isinstance(payload, list):
        raise _validation_error("json_syntax", "passwords must be a JSON array")

    known_groups = {
        d.get("access_group")
        for d in drives_for_groups
        if d.get("access_group")
    }

    seen_passwords: set[str] = set()
    for entry in payload:
        if not isinstance(entry, dict):
            raise _validation_error("json_syntax", "passwords entry must be an object")

        pw = entry.get("password")
        if not isinstance(pw, str) or not pw:
            raise _validation_error("missing_field", "password is required", field="password")

        if pw == MASKED_PASSWORD:
            # Refuse the round-tripped masked value — the GUI must send a
            # real password for any new/edited entry.
            raise _validation_error(
                "masked_password",
                "*** is not a valid password value (the form must send the real password)",
                field="password",
            )

        groups = entry.get("groups")
        if not isinstance(groups, list) or not groups:
            raise _validation_error("missing_field", "groups is required", field="groups")

        for g in groups:
            if not isinstance(g, str) or not g:
                raise _validation_error("missing_field", "group must be a non-empty string", field="groups")
            # Always reject unknown groups. If no drive declares an
            # access_group, ``known_groups`` is empty, so any non-empty
            # ``groups`` entry is by definition invalid (no drive uses any
            # group). The previous ``if known_groups and ...`` short-circuit
            # silently accepted invalid groups in that scenario.
            if g not in known_groups:
                raise _validation_error(
                    "unknown_group",
                    f"group '{g}' is not declared by any drive's access_group",
                    field="groups",
                )

        if pw in seen_passwords:
            raise _validation_error(
                "duplicate_password",
                "duplicate password value across entries",
                field="password",
            )
        seen_passwords.add(pw)

    return payload


def _validate_addon_policy_payload(
    payload: Any,
    drives_for_names: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Validate addon-policy payload: ``{drive_name: {addon_name: bool|dict}}``.

    Rules:
      9. Every addon name must match an installed addon in
         :mod:`addon_registry`.
      10. Every top-level drive name must match an entry in drives.json.
         Without this guard the merge loop in ``put_addon_policy`` silently
         drops policy for drives that don't exist on disk, and the admin
         gets ``{"ok": true}`` despite their change being a no-op.
    """
    if not isinstance(payload, dict):
        raise _validation_error("json_syntax", "addon-policy must be a JSON object")

    known_addons = set(addon_registry.get_all().keys())
    known_drive_names = {
        d.get("name")
        for d in drives_for_names
        if isinstance(d, dict) and d.get("name")
    }

    for drive_name, drive_policy in payload.items():
        if drive_name not in known_drive_names:
            raise _validation_error(
                "unknown_drive",
                f"drive '{drive_name}' is not configured",
                field=drive_name,
            )
        if not isinstance(drive_policy, dict):
            raise _validation_error(
                "json_syntax",
                f"policy for drive '{drive_name}' must be an object",
                field=drive_name,
            )
        for addon_name, value in drive_policy.items():
            if addon_name not in known_addons:
                raise _validation_error(
                    "unknown_addon",
                    f"addon '{addon_name}' is not installed",
                    field=addon_name,
                )
            if not isinstance(value, (bool, dict)):
                raise _validation_error(
                    "json_syntax",
                    f"addon policy for {drive_name}.{addon_name} must be bool or object",
                    field=addon_name,
                )

    return payload


# ---------------------------------------------------------------------------
# First-run admin bypass
# ---------------------------------------------------------------------------


def _admin_or_first_run(request: Request) -> None:
    """Allow unauthenticated writes while first-run setup is incomplete.

    The wizard sequences three writes — PUT /drives, PUT /passwords,
    POST /complete-setup — and the first one establishes drive
    ``access_group``s. ``require_admin`` re-evaluates after that write and
    sees ``required = {access_group}`` with ``unlocked = []``, which 403s
    the second write. The user is then locked out: drives.json now
    requires admin, but no password exists yet to unlock.

    To avoid the brick, we exempt config writes from the admin gate while
    the ``setup_completed`` sentinel is absent. The bypass closes the
    instant the wizard touches the sentinel; ``require_admin`` semantics
    resume immediately.

    This means: a clean install where the sentinel doesn't exist allows
    anyone on the LAN to write config until the wizard completes. This is
    intentional and documented in the spec — the first-run window must be
    short. GETs remain admin-gated since the wizard doesn't need to read
    config to do first-run setup.
    """
    sentinel = config.DATA_DIR / "setup_completed"
    if not sentinel.exists():
        return  # first-run: anyone can write
    auth.require_admin(request)


# ---------------------------------------------------------------------------
# Public endpoints (no auth — needed by first-run wizard)
# ---------------------------------------------------------------------------


def _setup_status_drives() -> list[dict[str, Any]]:
    """Project the on-disk drives into the minimal shape /setup needs.

    Only ``name`` / ``path`` (and ``access_group`` when present) are
    surfaced — the wizard does not need addon policy here. A seeded stub
    has no ``access_group``, so the key is omitted (not nulled) so the
    DriveStep can treat "no group" cleanly.
    """
    drives: list[dict[str, Any]] = []
    for entry in _read_drives_from_disk():
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        path = entry.get("path")
        if not name or not path:
            continue
        item: dict[str, Any] = {"name": name, "path": path}
        group = entry.get("access_group")
        if group:
            item["access_group"] = group
        drives.append(item)
    return drives


@router.get("/setup-status")
def get_setup_status() -> dict[str, Any]:
    """Return first-run setup state plus the seeded drive list.

    No auth so the frontend can (a) decide whether to redirect anonymous
    visitors to ``/setup`` before any password entry exists, and (b)
    render the detected drives in the DriveStep without going through the
    admin-gated ``GET /drives`` (the first-run bypass does not cover that
    route — spec §3.3, M1).

    ``completed`` is kept unconditionally for backward compatibility
    (``SetupRedirector`` and others read it). ``drives`` is an additive
    field; it is ``[]`` when drives.json is empty or unreadable.
    """
    sentinel = config.DATA_DIR / "setup_completed"
    completed = sentinel.exists()
    # Expose the detected drive list ONLY during first-run. This endpoint
    # is unauthenticated; once setup is complete the DriveStep never reads
    # it again, so returning drive names / container paths / access groups
    # post-completion is pure information disclosure to any unauthenticated
    # network peer and contradicts the "hide protected drive existence"
    # rule in .claude/rules/design-decisions.md.
    drives: list[dict[str, Any]] = []
    if not completed:
        try:
            drives = _setup_status_drives()
        except HTTPException:
            # drives.json invalid (not a JSON array): the wizard should
            # still be reachable, so degrade to an empty list rather
            # than 500.
            drives = []
    return {"completed": completed, "drives": drives}


@router.post("/complete-setup")
def post_complete_setup() -> dict[str, bool]:
    """Mark first-run setup complete by touching the sentinel.

    409 if the sentinel already exists — re-running the wizard would
    silently overwrite admin's intentional state changes. The frontend
    should send users to ``/admin/settings`` in that case.
    """
    sentinel = config.DATA_DIR / "setup_completed"
    if sentinel.exists():
        raise HTTPException(status_code=409, detail={"code": "already_completed"})
    sentinel.parent.mkdir(parents=True, exist_ok=True)
    sentinel.touch()
    return {"completed": True}


# ---------------------------------------------------------------------------
# Admin-gated endpoints
# ---------------------------------------------------------------------------


@router.get("/drives", dependencies=[Depends(auth.require_admin)])
def get_drives() -> list[dict[str, Any]]:
    """Return the on-disk drives.json (full fidelity, including addons)."""
    return _read_drives_from_disk()


@router.put("/drives", dependencies=[Depends(_admin_or_first_run)])
def put_drives(payload: Any = Body(...)) -> dict[str, Any]:
    """Atomically rewrite drives.json after validation."""
    validated = _validate_drives_payload(payload)
    try:
        atomic_write_json(Path(config.DRIVES_CONFIG), validated)
    except OSError as exc:
        logger.exception("Failed to write drives.json")
        raise HTTPException(
            status_code=500,
            detail={"code": "write_failed", "message": str(exc)},
        ) from exc
    config._drives_cache = None
    return {"ok": True, "count": len(validated)}


@router.get("/passwords", dependencies=[Depends(auth.require_admin)])
def get_passwords() -> list[dict[str, Any]]:
    """Return passwords.json with every password value masked.

    Real passwords MUST never leave the server; the GUI prompts for a new
    value when the admin wants to rotate one.
    """
    entries = _read_passwords_from_disk()
    return [
        {"password": MASKED_PASSWORD, "groups": list(e.get("groups", []))}
        for e in entries
    ]


@router.put("/passwords", dependencies=[Depends(_admin_or_first_run)])
def put_passwords(payload: Any = Body(...)) -> dict[str, Any]:
    """Atomically rewrite passwords.json after validation."""
    drives = _read_drives_from_disk()
    validated = _validate_passwords_payload(payload, drives)
    try:
        atomic_write_json(Path(auth.PASSWORDS_CONFIG), validated)
    except OSError as exc:
        logger.exception("Failed to write passwords.json")
        raise HTTPException(
            status_code=500,
            detail={"code": "write_failed", "message": str(exc)},
        ) from exc
    auth._passwords_cache = None
    return {"ok": True, "count": len(validated)}


def _validate_password_entry(
    entry: Any,
    drives_for_groups: list[dict[str, Any]],
    existing_entries: list[dict[str, Any]],
) -> dict[str, Any]:
    """Validate a single new password entry for /append.

    Applies the same per-entry rules as :func:`_validate_passwords_payload`
    (rule 6 unknown_group, rule 7 duplicate_password, masked rejection)
    but checks duplicates against the *existing* on-disk list — the caller
    is appending one entry, not rewriting the whole list.
    """
    if not isinstance(entry, dict):
        raise _validation_error("json_syntax", "password entry must be an object")

    pw = entry.get("password")
    if not isinstance(pw, str) or not pw:
        raise _validation_error("missing_field", "password is required", field="password")

    if pw == MASKED_PASSWORD:
        raise _validation_error(
            "masked_password",
            "*** is not a valid password value (the form must send the real password)",
            field="password",
        )

    groups = entry.get("groups")
    if not isinstance(groups, list) or not groups:
        raise _validation_error("missing_field", "groups is required", field="groups")

    known_groups = {
        d.get("access_group")
        for d in drives_for_groups
        if d.get("access_group")
    }

    for g in groups:
        if not isinstance(g, str) or not g:
            raise _validation_error(
                "missing_field", "group must be a non-empty string", field="groups"
            )
        # Always reject unknown groups (see _validate_passwords_payload for
        # rationale — empty ``known_groups`` means no drive uses any group,
        # so any non-empty ``groups`` entry is invalid).
        if g not in known_groups:
            raise _validation_error(
                "unknown_group",
                f"group '{g}' is not declared by any drive's access_group",
                field="groups",
            )

    for existing in existing_entries:
        if isinstance(existing, dict) and existing.get("password") == pw:
            raise _validation_error(
                "duplicate_password",
                "duplicate password value across entries",
                field="password",
            )

    return {"password": pw, "groups": list(groups)}


@router.post("/passwords/append", dependencies=[Depends(_admin_or_first_run)])
def post_passwords_append(payload: Any = Body(...)) -> dict[str, Any]:
    """Append a single new password entry without touching existing entries.

    Used by the admin settings GUI for incremental edits — the GET masks
    real password values, so a full PUT round-trip cannot preserve the
    untouched entries. POST /append takes only the new entry.
    """
    drives = _read_drives_from_disk()
    existing = _read_passwords_from_disk()
    validated_entry = _validate_password_entry(payload, drives, existing)

    # Immutable rebuild: do not mutate the on-disk list in place.
    updated = [*existing, validated_entry]

    try:
        atomic_write_json(Path(auth.PASSWORDS_CONFIG), updated)
    except OSError as exc:
        logger.exception("Failed to append passwords.json")
        raise HTTPException(
            status_code=500,
            detail={"code": "write_failed", "message": str(exc)},
        ) from exc
    auth._passwords_cache = None
    return {"ok": True, "count": len(updated)}


@router.delete(
    "/passwords/{index}", dependencies=[Depends(_admin_or_first_run)]
)
def delete_password(index: int) -> dict[str, Any]:
    """Delete the password entry at the given 0-based index.

    Used by the admin settings GUI to remove an existing entry without
    needing to re-send the (masked) values of every other entry.
    """
    existing = _read_passwords_from_disk()
    if index < 0 or index >= len(existing):
        raise HTTPException(
            status_code=404,
            detail={
                "code": "index_out_of_range",
                "message": f"no password entry at index {index}",
            },
        )

    # Immutable rebuild: build a new list excluding the removed index.
    updated = [entry for i, entry in enumerate(existing) if i != index]

    try:
        atomic_write_json(Path(auth.PASSWORDS_CONFIG), updated)
    except OSError as exc:
        logger.exception("Failed to delete password entry")
        raise HTTPException(
            status_code=500,
            detail={"code": "write_failed", "message": str(exc)},
        ) from exc
    auth._passwords_cache = None
    return {"ok": True, "count": len(updated)}


@router.get("/addon-policy", dependencies=[Depends(auth.require_admin)])
def get_addon_policy() -> dict[str, dict[str, Any]]:
    """Project per-drive addon policy out of drives.json.

    Drives that have no ``addons`` field still appear (with an empty dict)
    so the GUI can render an editable row for them.
    """
    drives = _read_drives_from_disk()
    return {
        drive["name"]: dict(drive.get("addons") or {})
        for drive in drives
        if isinstance(drive, dict) and "name" in drive
    }


@router.put("/addon-policy", dependencies=[Depends(_admin_or_first_run)])
def put_addon_policy(payload: Any = Body(...)) -> dict[str, Any]:
    """Merge new addon policy into drives.json without losing other fields.

    Each drive entry's ``addons`` key is replaced wholesale with the
    submitted policy for that drive (omitted drives keep their existing
    ``addons``). All non-addon fields are preserved.
    """
    drives = _read_drives_from_disk()
    validated = _validate_addon_policy_payload(payload, drives)

    # Immutable rebuild: do not mutate items from the on-disk list in place.
    updated = []
    for drive in drives:
        name = drive.get("name") if isinstance(drive, dict) else None
        if name in validated:
            updated.append({**drive, "addons": validated[name]})
        else:
            updated.append(dict(drive) if isinstance(drive, dict) else drive)

    try:
        atomic_write_json(Path(config.DRIVES_CONFIG), updated)
    except OSError as exc:
        logger.exception("Failed to write addon policy")
        raise HTTPException(
            status_code=500,
            detail={"code": "write_failed", "message": str(exc)},
        ) from exc
    config._drives_cache = None
    return {"ok": True}


@router.get("/restart-status", dependencies=[Depends(auth.require_admin)])
def get_restart_status() -> dict[str, Any]:
    """Whether a backend restart is required for pending config changes.

    The flag is touched by every successful PUT in this router and cleared
    on the next backend startup (lifespan in ``main.py``).
    """
    flag = config.DATA_DIR / "restart_pending"
    pending = flag.exists()
    if not pending:
        return {"pending": False, "files": []}

    drives_path = Path(config.DRIVES_CONFIG)
    pw_path = Path(auth.PASSWORDS_CONFIG)
    return {
        "pending": True,
        "files": [
            {"name": "drives.json", "exists": drives_path.exists()},
            {"name": "passwords.json", "exists": pw_path.exists()},
        ],
    }
