from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

import app.config as config
from app.database import get_db
from app.models import Tag, Video, video_tags
from app.schemas import (
    DriveResponse,
    FolderResponse,
    PaginatedResponse,
    PaginationMeta,
    ScanResponse,
    TagResponse,
    VideoResponse,
    video_to_response,
)
from app.services.scanner import scan_drive

router = APIRouter(prefix="/api/drives", tags=["drives"])


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _validate_drive(drive_name: str) -> None:
    if drive_name not in config.get_drive_names():
        raise HTTPException(status_code=404, detail=f"Drive not found: {drive_name}")


def _validate_folder_path(path: str) -> str:
    if ".." in path.split("/") or path.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid folder path")
    return path


_to_response = video_to_response


@router.get("", response_model=list[DriveResponse])
async def list_drives():
    return [DriveResponse(name=name) for name in config.get_drive_names()]


@router.get("/{drive_name}/folders", response_model=list[FolderResponse])
async def list_folders(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    path: str = "",
):
    _validate_drive(drive_name)
    if path:
        path = _validate_folder_path(path)

    query = db.query(Video.folder_path).filter(Video.drive == drive_name)

    if path:
        prefix = _escape_like(path) + "/"
        query = query.filter(Video.folder_path.like(prefix + "%", escape="\\"))
    else:
        query = query.filter(Video.folder_path != "")

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

    return [
        FolderResponse(
            name=fp.split("/")[-1],
            path=fp,
            video_count=count,
        )
        for fp, count in sorted(folders.items())
    ]


@router.get("/{drive_name}/videos", response_model=PaginatedResponse)
async def list_drive_videos(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    path: str | None = None,
    search: str | None = None,
    favorite: bool | None = None,
    tag: str | None = None,
    sort: str = Query("created_at", pattern="^(created_at|title|file_size)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
):
    _validate_drive(drive_name)
    if path is not None and path:
        path = _validate_folder_path(path)

    query = db.query(Video).filter(Video.drive == drive_name)

    if path is not None:
        query = query.filter(Video.folder_path == path)
    if search:
        escaped_search = _escape_like(search)
        query = query.filter(Video.title.ilike(f"%{escaped_search}%", escape="\\"))
    if favorite is not None:
        query = query.filter(Video.is_favorite == favorite)
    if tag:
        query = query.filter(Video.tags.any(Tag.name == tag))

    total = query.count()

    sort_column = getattr(Video, sort)
    if order == "desc":
        sort_column = sort_column.desc()
    query = query.order_by(sort_column)

    offset = (page - 1) * limit
    videos = query.offset(offset).limit(limit).all()

    return PaginatedResponse(
        data=[_to_response(v) for v in videos],
        meta=PaginationMeta(total=total, page=page, limit=limit),
    )


@router.get("/{drive_name}/tags", response_model=list[TagResponse])
async def list_drive_tags(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
):
    _validate_drive(drive_name)

    results = (
        db.query(Tag.name, func.count(video_tags.c.video_id).label("count"))
        .outerjoin(video_tags)
        .filter(Tag.drive == drive_name)
        .group_by(Tag.id)
        .order_by(Tag.name)
        .all()
    )
    return [TagResponse(name=name, count=count) for name, count in results]


@router.post("/{drive_name}/scan", response_model=ScanResponse)
async def trigger_drive_scan(drive_name: str):
    _validate_drive(drive_name)

    try:
        result = await scan_drive(drive_name)
        return ScanResponse(**result)
    except RuntimeError:
        raise HTTPException(status_code=409, detail="Scan already in progress")
