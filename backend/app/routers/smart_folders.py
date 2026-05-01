"""Smart Folder CRUD endpoints (Phase 1 of search-ui-rich-redesign).

Spec: docs/superpowers/specs/2026-05-01-search-ui-rich-redesign.md

A Smart Folder is a saved search query bound to a single drive. The DB
schema records ``viewer_id`` of the creator (when a viewer cookie is
present), but list queries deliberately do NOT filter by ``viewer_id``
— the current UX is "shared within the drive". The column is reserved
so a future "personal smart folders" mode can be enabled without a
migration. See spec § Smart Folder.

Drive boundary rules follow the project-wide policy:

- A locked drive returns 404 (not 403) — existence is hidden.
- A SF created in drive A is invisible / not editable via drive B's URL.

Both rules are enforced by ``_validate_drive`` plus ``_get_or_404``
filtering on ``SmartFolder.drive``.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

import app.config as config
from app.auth import check_drive_access, get_unlocked_groups, get_viewer_id
from app.database import get_db
from app.models import SmartFolder
from app.schemas import (
    SmartFolderCreate,
    SmartFolderResponse,
    SmartFolderUpdate,
)

router = APIRouter(prefix="/api/drives", tags=["smart-folders"])


def _validate_drive(drive_name: str, unlocked_groups: list[str]) -> None:
    if drive_name not in config.get_drive_names():
        raise HTTPException(status_code=404, detail=f"Drive not found: {drive_name}")
    check_drive_access(drive_name, unlocked_groups)


def _get_or_404(db: Session, sf_id: str, drive_name: str) -> SmartFolder:
    sf = (
        db.query(SmartFolder)
        .filter(SmartFolder.id == sf_id, SmartFolder.drive == drive_name)
        .first()
    )
    if not sf:
        raise HTTPException(status_code=404, detail="Smart folder not found")
    return sf


@router.get(
    "/{drive_name}/smart-folders",
    response_model=list[SmartFolderResponse],
)
def list_smart_folders(
    drive_name: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
):
    unlocked = get_unlocked_groups(request)
    _validate_drive(drive_name, unlocked)
    rows = (
        db.query(SmartFolder)
        .filter(SmartFolder.drive == drive_name)
        .order_by(SmartFolder.created_at.desc())
        .all()
    )
    return rows


@router.post(
    "/{drive_name}/smart-folders",
    response_model=SmartFolderResponse,
    status_code=201,
)
def create_smart_folder(
    drive_name: str,
    payload: SmartFolderCreate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    viewer_id: Annotated[str | None, Depends(get_viewer_id)] = None,
):
    unlocked = get_unlocked_groups(request)
    _validate_drive(drive_name, unlocked)

    sf = SmartFolder(
        drive=drive_name,
        viewer_id=viewer_id,
        name=payload.name,
        query=payload.query,
        file_type=payload.file_type,
        sort_by=payload.sort_by,
        sort_order=payload.sort_order,
    )
    db.add(sf)
    db.commit()
    db.refresh(sf)
    return sf


@router.patch(
    "/{drive_name}/smart-folders/{sf_id}",
    response_model=SmartFolderResponse,
)
def update_smart_folder(
    drive_name: str,
    sf_id: str,
    payload: SmartFolderUpdate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
):
    unlocked = get_unlocked_groups(request)
    _validate_drive(drive_name, unlocked)

    sf = _get_or_404(db, sf_id, drive_name)

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(sf, key, value)

    db.commit()
    db.refresh(sf)
    return sf


@router.delete(
    "/{drive_name}/smart-folders/{sf_id}",
    status_code=204,
)
def delete_smart_folder(
    drive_name: str,
    sf_id: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
):
    unlocked = get_unlocked_groups(request)
    _validate_drive(drive_name, unlocked)

    sf = _get_or_404(db, sf_id, drive_name)
    db.delete(sf)
    db.commit()
    return Response(status_code=204)
