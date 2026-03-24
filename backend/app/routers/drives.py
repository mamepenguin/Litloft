import unicodedata
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

import app.config as config
from app.auth import check_drive_access, filter_drives, get_unlocked_groups
from app.database import get_db
from app.models import EmptyFolder, File, Tag, file_tags
from app.schemas import (
    DriveResponse,
    FileResponse,
    FolderCreateRequest,
    FolderRenameRequest,
    FolderResponse,
    PaginatedResponse,
    PaginationMeta,
    ScanResponse,
    TagResponse,
    file_to_response,
)
from app.services import fileops
from app.services.scanner import scan_drive

router = APIRouter(prefix="/api/drives", tags=["drives"])


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _validate_drive(drive_name: str, unlocked_groups: list[str]) -> None:
    if drive_name not in config.get_drive_names():
        raise HTTPException(status_code=404, detail=f"Drive not found: {drive_name}")
    check_drive_access(drive_name, unlocked_groups)


def _validate_folder_path(path: str) -> str:
    if "\x00" in path:
        raise HTTPException(status_code=400, detail="Invalid folder path")
    if ".." in path.split("/") or path.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid folder path")
    return path


_to_response = file_to_response


@router.get("", response_model=list[DriveResponse])
async def list_drives(
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    drives = filter_drives(config.load_drives(), unlocked_groups)
    return [
        DriveResponse(name=d["name"], protected=bool(d.get("access_group")))
        for d in drives
    ]


@router.get("/{drive_name}/folders", response_model=list[FolderResponse])
async def list_folders(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    path: str = "",
):
    _validate_drive(drive_name, unlocked_groups)
    if path:
        path = _validate_folder_path(path)

    query = db.query(File.folder_path).filter(File.drive == drive_name)

    if path:
        prefix = _escape_like(path) + "/"
        query = query.filter(File.folder_path.like(prefix + "%", escape="\\"))
    else:
        query = query.filter(File.folder_path != "")

    all_paths = {row[0] for row in query.all()}

    folders: dict[str, int] = {}
    for fp in all_paths:
        if path:
            remainder = fp[len(path) + 1:]
        else:
            remainder = fp
        if not remainder:
            continue
        top_segment = remainder.split("/")[0]
        folder_full_path = f"{path}/{top_segment}" if path else top_segment
        folders[folder_full_path] = folders.get(folder_full_path, 0) + 1

    # Merge empty folders from DB
    ef_query = db.query(EmptyFolder).filter(EmptyFolder.drive == drive_name)
    if path:
        ef_query = ef_query.filter(EmptyFolder.path.like(_escape_like(path) + "/%", escape="\\"))
    else:
        ef_query = ef_query.filter(EmptyFolder.path != "")

    for ef in ef_query.all():
        ef_path = ef.path
        if path:
            remainder = ef_path[len(path) + 1:]
        else:
            remainder = ef_path
        if not remainder:
            continue
        top_segment = remainder.split("/")[0]
        folder_full_path = f"{path}/{top_segment}" if path else top_segment
        if folder_full_path not in folders:
            folders[folder_full_path] = 0

    return [
        FolderResponse(
            name=fp.split("/")[-1],
            path=fp,
            file_count=count,
        )
        for fp, count in sorted(folders.items())
    ]


@router.get("/{drive_name}/files", response_model=PaginatedResponse)
async def list_drive_files(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    path: str | None = None,
    search: str | None = None,
    favorite: bool | None = None,
    tag: str | None = None,
    type: str | None = None,
    sort: str = Query("created_at", pattern="^(created_at|title|file_size)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
):
    _validate_drive(drive_name, unlocked_groups)
    if path is not None and path:
        path = _validate_folder_path(path)

    query = db.query(File).filter(File.drive == drive_name)

    if path is not None:
        query = query.filter(File.folder_path == path)
    if search:
        escaped_search = _escape_like(unicodedata.normalize("NFC", search))
        query = query.filter(File.title.ilike(f"%{escaped_search}%", escape="\\"))
    if favorite is not None:
        query = query.filter(File.is_favorite == favorite)
    if tag:
        query = query.filter(File.tags.any(func.lower(Tag.name) == tag.lower()))
    if type:
        query = query.filter(File.file_type == type)

    total = query.count()

    sort_column = getattr(File, sort)
    if order == "desc":
        sort_column = sort_column.desc()
    query = query.order_by(sort_column)

    offset = (page - 1) * limit
    files = query.offset(offset).limit(limit).all()

    return PaginatedResponse(
        data=[_to_response(f) for f in files],
        meta=PaginationMeta(total=total, page=page, limit=limit),
    )


@router.get("/{drive_name}/tags", response_model=list[TagResponse])
async def list_drive_tags(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)

    results = (
        db.query(Tag.name, func.count(file_tags.c.file_id).label("count"))
        .outerjoin(file_tags)
        .filter(Tag.drive == drive_name)
        .group_by(Tag.id)
        .order_by(Tag.name)
        .all()
    )
    return [TagResponse(name=name, count=count) for name, count in results]


@router.post("/{drive_name}/folders", response_model=FolderResponse)
async def create_folder(
    drive_name: str,
    body: FolderCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    result = fileops.create_folder(drive_name, body.path, body.name, db)
    return FolderResponse(**result)


@router.put("/{drive_name}/folders", response_model=FolderResponse)
async def rename_folder(
    drive_name: str,
    body: FolderRenameRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    result = fileops.rename_folder(drive_name, body.path, body.new_name, db)
    return FolderResponse(**result)


@router.delete("/{drive_name}/folders")
async def delete_folder(
    drive_name: str,
    path: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    fileops.delete_folder(drive_name, path, db)
    return {"status": "deleted"}


@router.post("/{drive_name}/scan", response_model=ScanResponse)
async def trigger_drive_scan(
    drive_name: str,
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)

    try:
        result = await scan_drive(drive_name)
        return ScanResponse(**result)
    except RuntimeError:
        raise HTTPException(status_code=409, detail="Scan already in progress")
