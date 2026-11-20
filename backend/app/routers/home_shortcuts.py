"""The drive's Home shortcuts: Smart Folders, pins, collections and app targets
put on Home.

Like the Smart Folders, pins and collections themselves, shortcuts are shared
within the drive, so no query filters by ``viewer_id``.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, func, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

import app.config as config
from app.auth import check_drive_access, get_unlocked_groups
from app.database import get_db
from app.models import Collection, HomeAppShortcut, PinnedFolder, SmartFolder
from app.schemas import HomeShortcutResponse, HomeShortcutUpdate

router = APIRouter(prefix="/api/drives", tags=["home-shortcuts"])

_KINDS = {
    "smart_folder": (SmartFolder, SmartFolder.id, SmartFolder.updated_at),
    "pin": (PinnedFolder, PinnedFolder.path, None),
    "collection": (Collection, Collection.id, Collection.updated_at),
}

_COLLECTION_PREFIX = "collection:"


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
        app=None,
    )


def _pin_shortcut(row: PinnedFolder) -> HomeShortcutResponse:
    return HomeShortcutResponse(
        kind="pin",
        id=row.path,
        name=row.path.rsplit("/", 1)[-1],
        query=None,
        file_type=None,
        app=None,
    )


def _collection_shortcut(row: Collection) -> HomeShortcutResponse:
    return HomeShortcutResponse(
        kind="collection",
        id=row.id,
        name=row.name,
        query=None,
        file_type=None,
        app=None,
    )


def _app_shortcut(row: HomeAppShortcut, name: str) -> HomeShortcutResponse:
    return HomeShortcutResponse(
        kind="app_target",
        id=row.target,
        name=name,
        query=None,
        file_type=None,
        app=row.app,
    )


def _app_target_name(
    target: str,
    smart_folders: dict[str, SmartFolder],
    collections: dict[str, Collection],
) -> str | None:
    if target.startswith(_COLLECTION_PREFIX):
        row = collections.get(target.removeprefix(_COLLECTION_PREFIX))
    else:
        row = smart_folders.get(target)
    return row.name if row is not None else None


def _app_target_exists(db: Session, drive_name: str, target: str) -> bool:
    if target.startswith(_COLLECTION_PREFIX):
        query = db.query(Collection.id).filter(
            Collection.drive == drive_name,
            Collection.id == target.removeprefix(_COLLECTION_PREFIX),
        )
    else:
        query = db.query(SmartFolder.id).filter(
            SmartFolder.drive == drive_name,
            SmartFolder.id == target,
        )
    return query.first() is not None


def _order_key(shortcut: HomeShortcutResponse) -> tuple[str, str, bool, str]:
    return (
        shortcut.kind,
        shortcut.id,
        shortcut.app is not None,
        shortcut.app or "",
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

    smart_folders = (
        db.query(SmartFolder).filter(SmartFolder.drive == drive_name).all()
    )
    collections = db.query(Collection).filter(Collection.drive == drive_name).all()
    pins = (
        db.query(PinnedFolder)
        .filter(
            PinnedFolder.drive == drive_name,
            PinnedFolder.home_added_at.is_not(None),
        )
        .all()
    )
    app_rows = (
        db.query(HomeAppShortcut).filter(HomeAppShortcut.drive == drive_name).all()
    )

    placed = [
        (row.home_added_at, _smart_folder_shortcut(row))
        for row in smart_folders
        if row.home_added_at is not None
    ]
    placed += [
        (row.home_added_at, _collection_shortcut(row))
        for row in collections
        if row.home_added_at is not None
    ]
    placed += [(row.home_added_at, _pin_shortcut(row)) for row in pins]

    smart_folders_by_id = {row.id: row for row in smart_folders}
    collections_by_id = {row.id: row for row in collections}
    for row in app_rows:
        name = _app_target_name(row.target, smart_folders_by_id, collections_by_id)
        if name is not None:
            placed.append((row.home_added_at, _app_shortcut(row, name)))

    placed.sort(
        key=lambda entry: (entry[0], *_order_key(entry[1]))
    )
    return [shortcut for _, shortcut in placed]


@router.put("/{drive_name}/home-shortcuts", status_code=204)
def set_home_shortcut(
    drive_name: str,
    body: HomeShortcutUpdate,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)

    if body.kind == "app_target":
        if not _app_target_exists(db, drive_name, body.id):
            raise HTTPException(
                status_code=404, detail="Home shortcut target not found"
            )
        if body.on_home:
            db.execute(
                sqlite_insert(HomeAppShortcut)
                .values(
                    drive=drive_name,
                    app=body.app,
                    target=body.id,
                    home_added_at=datetime.now(UTC),
                )
                .on_conflict_do_nothing(
                    index_elements=["drive", "app", "target"]
                )
            )
        else:
            db.execute(
                delete(HomeAppShortcut).where(
                    HomeAppShortcut.drive == drive_name,
                    HomeAppShortcut.app == body.app,
                    HomeAppShortcut.target == body.id,
                )
            )
        db.commit()
        return Response(status_code=204)

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
