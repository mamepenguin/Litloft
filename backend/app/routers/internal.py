"""Internal API for external service addons.

These endpoints are intended for Docker-internal network use only.
External service addons (e.g. intelligence) call these to query
core application data such as accessible drives and file metadata.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import app.config as config
from app.auth import filter_drives, get_unlocked_groups
from app.database import get_db
from app.models import File, active_file_filter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal", tags=["internal"])


@router.get("/drive-policy")
async def drive_policy(drive: str, addon: str):
    """Return per-drive addon policy in a stable two-key shape.

    Response::

        {
          "default": bool,           # value used for any feature not in `features`
          "features": { "<name>": bool, ... }
        }

    Examples:
    - drives.json silent → ``{"default": true, "features": {}}``
    - ``"intelligence": false`` → ``{"default": false, "features": {}}``
    - ``"intelligence": {"index": true, "rag": false}`` →
      ``{"default": true, "features": {"index": true, "rag": false}}``

    Returns 404 when the drive does not exist so addons cannot probe
    unknown drives.
    """
    try:
        policy = config.get_drive_addon_policy(drive, addon)
    except ValueError:
        raise HTTPException(status_code=404, detail="Drive not found")

    if "_all" in policy:
        return {"default": bool(policy["_all"]), "features": {}}
    return {
        "default": True,
        "features": {k: bool(v) for k, v in policy.items()},
    }


@router.get("/accessible-drives")
async def accessible_drives(
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)] = [],
):
    """Return list of drive names accessible with the current token."""
    drives = filter_drives(config.load_drives(), unlocked_groups)
    return {"drives": [d["name"] for d in drives]}


@router.get("/files/{file_id}")
async def file_info(
    file_id: str,
    db=Depends(get_db),
):
    """Return basic file metadata. No access control (internal use only)."""
    file = (
        db.query(File)
        .filter(File.id == file_id, active_file_filter())
        .first()
    )
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    return {
        "id": file.id,
        "drive": file.drive,
        "filename": file.filename,
        "file_type": file.file_type,
        "folder_path": file.folder_path,
    }


class FilterFileIdsRequest(BaseModel):
    file_ids: list[str]


@router.post("/filter-file-ids")
async def filter_file_ids(
    body: FilterFileIdsRequest,
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)] = [],
    db=Depends(get_db),
):
    """Filter file IDs by access control. Returns only accessible file IDs."""
    if not body.file_ids:
        return {"accessible": []}

    accessible_drive_names = {
        d["name"] for d in filter_drives(config.load_drives(), unlocked_groups)
    }

    files = (
        db.query(File.id, File.drive)
        .filter(
            File.id.in_(body.file_ids),
            active_file_filter(),
        )
        .all()
    )

    accessible = [
        f.id for f in files if f.drive in accessible_drive_names
    ]
    return {"accessible": accessible}
