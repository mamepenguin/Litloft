"""Public per-drive addon policy endpoint.

Spec: ``docs/superpowers/specs/2026-05-10-markdown-document-layout.md`` §4 D4.

Exposes a read-only snapshot of the per-drive addon policy so the frontend
can toggle features (for example the Knowledge inline editor) without each
addon having to ship its own discovery endpoint. Lives outside
``routers/internal.py`` because the consumer is the browser, not addons —
the Internal API Policy (R1-R5) does not directly apply, but the design
satisfies its spirit: read-only, generic shape (no addon name in the
path/parameters), and the response is a generic dictionary.

Access control piggybacks on ``accessible_drives`` via ``check_drive_access``:
locked protected drives surface as 404 (consistent with
``.claude/rules/design-decisions.md`` Access control rule).
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

import app.config as config
from app.auth import check_drive_access, get_unlocked_groups
from app.schemas import AddonPolicy, DriveAddonPoliciesResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/drives", tags=["drive-policies"])


def _normalize_policy(raw: bool | dict) -> AddonPolicy:
    """Map a raw drives.json addon value to the public policy envelope.

    - ``True`` / ``False``  → ``{default: <bool>, features: {}}``
    - ``{feature: bool}``   → ``{default: True, features: {...}}``

    ``load_drives()`` rejects any other shape at config-load time, so the
    branches here are exhaustive for valid configs.
    """
    if isinstance(raw, bool):
        return AddonPolicy(default=raw, features={})
    # dict branch: graceful-degradation default is True (anything not listed
    # is enabled), per ``.claude/rules/design-decisions.md`` Addons section.
    coerced = {key: bool(value) for key, value in raw.items()}
    return AddonPolicy(default=True, features=coerced)


def _build_policies(drive: dict) -> dict[str, AddonPolicy]:
    addons = drive.get("addons") or {}
    if not isinstance(addons, dict):
        return {}
    return {
        addon_name: _normalize_policy(value)
        for addon_name, value in addons.items()
    }


@router.get(
    "/{drive_name}/addon-policies",
    response_model=DriveAddonPoliciesResponse,
)
def get_drive_addon_policies(
    drive_name: str,
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
) -> DriveAddonPoliciesResponse:
    """Return the addon policy snapshot for ``drive_name``.

    Errors:
    - 404 when the drive does not exist or is a locked protected drive
      (existence is hidden, mirroring the project's "404 not 403" rule).
    - 5xx surfaces ``load_drives`` errors for malformed config (e.g. an
      addon value that is neither bool nor dict). The endpoint must not
      silently swallow broken config as "all enabled".
    """
    try:
        drives = config.load_drives()
    except ValueError as exc:
        # Malformed drives.json (e.g. addon value that is neither bool nor
        # dict). Log the schema fragment server-side, return a generic body
        # to avoid leaking config structure to unauthenticated callers.
        logger.exception("drives.json malformed", exc_info=exc)
        raise HTTPException(
            status_code=500, detail="Configuration error"
        ) from exc
    drive = next((d for d in drives if d["name"] == drive_name), None)
    if drive is None:
        raise HTTPException(status_code=404, detail=f"Drive not found: {drive_name}")

    # Hide locked protected drives behind 404 (raises HTTPException(404)).
    check_drive_access(drive_name, unlocked_groups)

    return DriveAddonPoliciesResponse(addons=_build_policies(drive))
