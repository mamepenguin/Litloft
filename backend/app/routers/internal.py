"""Internal API for external service addons.

These endpoints are intended for Docker-internal network use only.
External service addons (e.g. intelligence) call these to query
core application data such as accessible drives and file metadata.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, StringConstraints
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

import app.config as config
from app.auth import filter_drives, get_unlocked_groups
from app.database import get_db
from app.models import File, FileActiveSummary, FileRelation, active_file_filter

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


# ---------------------------------------------------------------------------
# file_relations / file_active_summaries (Step A of knowledge promotion)
# ---------------------------------------------------------------------------


class FileRelationCreate(BaseModel):
    file_id_a: str
    file_id_b: str
    kind: Annotated[
        str, StringConstraints(min_length=1, max_length=32, pattern=r"^[a-z][a-z0-9_.-]*$")
    ]
    viewer_id: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{16}$")] | None = None


def _relation_to_dict(rel: FileRelation) -> dict:
    return {
        "id": rel.id,
        "file_id_a": rel.file_id_a,
        "file_id_b": rel.file_id_b,
        "kind": rel.kind,
        "created_at": rel.created_at.isoformat() if rel.created_at else None,
        "created_by": rel.created_by,
    }


def _active_summary_to_dict(row: FileActiveSummary) -> dict:
    return {
        "file_id": row.file_id,
        "summary_file_id": row.summary_file_id,
        "set_at": row.set_at.isoformat() if row.set_at else None,
    }


@router.post("/file_relations", status_code=201)
async def create_file_relation(
    body: FileRelationCreate,
    db=Depends(get_db),
):
    """Create a relation between two files in the same drive.

    Returns 400 when the two file IDs are equal (self-relation),
    400 when the files belong to different drives (spec R4),
    404 when either file does not exist (active files only),
    409 when the (a, b, kind) triple already exists.
    """
    if body.file_id_a == body.file_id_b:
        raise HTTPException(status_code=400, detail="files must differ")

    files = (
        db.query(File)
        .filter(File.id.in_([body.file_id_a, body.file_id_b]))
        .all()
    )
    by_id = {f.id: f for f in files}
    if body.file_id_a not in by_id or body.file_id_b not in by_id:
        raise HTTPException(status_code=404, detail="file not found")

    if by_id[body.file_id_a].drive != by_id[body.file_id_b].drive:
        raise HTTPException(
            status_code=400, detail="files must be in the same drive"
        )

    rel = FileRelation(
        file_id_a=body.file_id_a,
        file_id_b=body.file_id_b,
        kind=body.kind,
        created_by=body.viewer_id,
    )
    db.add(rel)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="relation already exists")
    db.refresh(rel)
    return _relation_to_dict(rel)


@router.get("/file_relations")
async def list_file_relations(
    file_id: str = Query(...),
    kind: str | None = Query(None),
    db=Depends(get_db),
):
    """List relations where file_id appears on either side, optionally filtered by kind."""
    q = db.query(FileRelation).filter(
        or_(
            FileRelation.file_id_a == file_id,
            FileRelation.file_id_b == file_id,
        )
    )
    if kind is not None:
        q = q.filter(FileRelation.kind == kind)
    return [_relation_to_dict(r) for r in q.all()]


@router.delete("/file_relations/{relation_id}", status_code=204)
async def delete_file_relation(
    relation_id: int,
    db=Depends(get_db),
):
    rel = (
        db.query(FileRelation).filter(FileRelation.id == relation_id).first()
    )
    if not rel:
        raise HTTPException(status_code=404, detail="relation not found")
    db.delete(rel)
    db.commit()
    return Response(status_code=204)


class FileActiveSummaryUpsert(BaseModel):
    file_id: str
    summary_file_id: str


@router.post("/file_active_summary")
async def upsert_file_active_summary(
    body: FileActiveSummaryUpsert,
    db=Depends(get_db),
):
    """UPSERT the active summary pointer for file_id → summary_file_id.

    Returns 400 when file_id == summary_file_id,
    400 when the two files live on different drives,
    404 when either file does not exist (active files only).
    """
    if body.file_id == body.summary_file_id:
        raise HTTPException(status_code=400, detail="files must differ")

    files = (
        db.query(File)
        .filter(File.id.in_([body.file_id, body.summary_file_id]))
        .all()
    )
    by_id = {f.id: f for f in files}
    if body.file_id not in by_id or body.summary_file_id not in by_id:
        raise HTTPException(status_code=404, detail="file not found")

    if by_id[body.file_id].drive != by_id[body.summary_file_id].drive:
        raise HTTPException(
            status_code=400, detail="files must be in the same drive"
        )

    row = (
        db.query(FileActiveSummary)
        .filter(FileActiveSummary.file_id == body.file_id)
        .first()
    )
    if row is None:
        row = FileActiveSummary(
            file_id=body.file_id, summary_file_id=body.summary_file_id
        )
        db.add(row)
    else:
        row.summary_file_id = body.summary_file_id
        # Force onupdate to fire even when summary_file_id is unchanged.
        from datetime import UTC, datetime

        row.set_at = datetime.now(UTC)
    db.commit()
    db.refresh(row)
    return _active_summary_to_dict(row)


@router.get("/file_active_summary/{file_id}")
async def get_file_active_summary(
    file_id: str,
    db=Depends(get_db),
):
    row = (
        db.query(FileActiveSummary)
        .filter(FileActiveSummary.file_id == file_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="active summary not found")
    return _active_summary_to_dict(row)


@router.delete("/file_active_summary/{file_id}", status_code=204)
async def delete_file_active_summary(
    file_id: str,
    db=Depends(get_db),
):
    row = (
        db.query(FileActiveSummary)
        .filter(FileActiveSummary.file_id == file_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="active summary not found")
    db.delete(row)
    db.commit()
    return Response(status_code=204)
