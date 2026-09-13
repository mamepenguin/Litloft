"""Public per-drive addon policy endpoint.

Lives outside ``routers/internal.py`` because the consumer is the browser, not
addons.
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

    ``load_drives`` errors for malformed config surface as 5xx: the endpoint
    must not silently swallow broken config as "all enabled".
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

    check_drive_access(drive_name, unlocked_groups)

    return DriveAddonPoliciesResponse(addons=_build_policies(drive))
