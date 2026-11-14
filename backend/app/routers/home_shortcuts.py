"""The drive's Home shortcuts: Smart Folders, pins and collections put on Home.

Like the Smart Folders, pins and collections themselves, shortcuts are shared
within the drive, so no query filters by ``viewer_id``.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, update
from sqlalchemy.orm import Session

import app.config as config
from app.auth import check_drive_access, get_unlocked_groups
from app.database import get_db
from app.models import Collection, PinnedFolder, SmartFolder
from app.schemas import HomeShortcutResponse, HomeShortcutUpdate

router = APIRouter(prefix="/api/drives", tags=["home-shortcuts"])

_KINDS = {
    "smart_folder": (SmartFolder, SmartFolder.id, SmartFolder.updated_at),
    "pin": (PinnedFolder, PinnedFolder.path, None),
    "collection": (Collection, Collection.id, Collection.updated_at),
}


def _validate_drive(drive_name: str, unlocked_groups: list[str]) -> None:
    if drive_name not in config.get_drive_names():
        raise HTTPException(status_code=404, detail=f"Drive not found: {drive_name}")
    check_drive_access(drive_name, unlocked_groups)


def _smart_folder_shortcut(row: SmartFolder) -> HomeShortcutResponse:
    return HomeShortcutResponse(
        kind="smart_folder",
        id=row.id,
        name=row.name,
        query=row.query,
        file_type=row.file_type,
    )


def _pin_shortcut(row: PinnedFolder) -> HomeShortcutResponse:
    return HomeShortcutResponse(
        kind="pin",
        id=row.path,
        name=row.path.rsplit("/", 1)[-1],
        query=None,
        file_type=None,
    )


def _collection_shortcut(row: Collection) -> HomeShortcutResponse:
    return HomeShortcutResponse(
        kind="collection",
        id=row.id,
        name=row.name,
        query=None,
        file_type=None,
    )


@router.get(
    "/{drive_name}/home-shortcuts",
    response_model=list[HomeShortcutResponse],
)
def list_home_shortcuts(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)

    placed = [
        (row.home_added_at, _smart_folder_shortcut(row))
        for row in db.query(SmartFolder)
        .filter(
            SmartFolder.drive == drive_name,
            SmartFolder.home_added_at.is_not(None),
        )
        .all()
    ]
    placed += [
        (row.home_added_at, _pin_shortcut(row))
        for row in db.query(PinnedFolder)
        .filter(
            PinnedFolder.drive == drive_name,
            PinnedFolder.home_added_at.is_not(None),
        )
        .all()
    ]
    placed += [
        (row.home_added_at, _collection_shortcut(row))
        for row in db.query(Collection)
        .filter(
            Collection.drive == drive_name,
            Collection.home_added_at.is_not(None),
        )
        .all()
    ]
    placed.sort(key=lambda entry: (entry[0], entry[1].kind, entry[1].id))
    return [shortcut for _, shortcut in placed]


@router.put("/{drive_name}/home-shortcuts", status_code=204)
def set_home_shortcut(
    drive_name: str,
    body: HomeShortcutUpdate,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)

    model, identity, updated_at = _KINDS[body.kind]
    # ``updated_at`` is named in the SET clause to keep its ``onupdate`` from
    # firing: putting a row on Home is not an edit of it.
    stamp = (
        func.coalesce(model.home_added_at, datetime.now(UTC))
        if body.on_home
        else None
    )
    values = {"home_added_at": stamp}
    if updated_at is not None:
        values["updated_at"] = updated_at
    result = db.execute(
        update(model)
        .where(model.drive == drive_name, identity == body.id)
        .values(**values)
    )
    if not result.rowcount:
        raise HTTPException(status_code=404, detail="Home shortcut target not found")
    db.commit()
    return Response(status_code=204)
