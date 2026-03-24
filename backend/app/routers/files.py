import os
from pathlib import Path
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse as FastAPIFileResponse
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

import app.config as config
from app.auth import check_drive_access, get_unlocked_groups
from app.database import get_db
from app.models import File, Tag, file_tags
from app.schemas import (
    BatchIdsRequest,
    BatchMoveRequest,
    BatchTagRequest,
    FileResponse,
    FileMoveRequest,
    FileRenameRequest,
    FileUpdate,
    TagUpdate,
    file_to_response,
)
from app.services import fileops

router = APIRouter(prefix="/api/files", tags=["files"])

PLACEHOLDER_THUMBNAIL = Path(__file__).parent.parent / "static" / "placeholder.jpg"


def _validate_path(file_path: str, base_dir: Path) -> Path:
    real_path = Path(os.path.realpath(file_path))
    real_base = Path(os.path.realpath(base_dir))
    base_str = str(real_base)
    if not (str(real_path) == base_str or str(real_path).startswith(base_str + os.sep)):
        raise HTTPException(status_code=403, detail="Access denied")
    return real_path


_to_response = file_to_response


def _is_drive_accessible(drive_name: str, unlocked_groups: list[str]) -> bool:
    access_group = config.get_drive_access_group(drive_name)
    return not access_group or access_group in unlocked_groups


def _get_file_or_404(
    db: Session, file_id: int, unlocked_groups: list[str]
) -> File:
    file = db.query(File).filter(File.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    check_drive_access(file.drive, unlocked_groups)
    return file


@router.post("/batch/get", response_model=list[FileResponse])
async def batch_get(
    body: BatchIdsRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    files = db.query(File).filter(File.id.in_(body.ids)).all()
    file_map = {f.id: f for f in files}
    return [
        _to_response(file_map[fid])
        for fid in body.ids
        if fid in file_map and _is_drive_accessible(file_map[fid].drive, unlocked_groups)
    ]


@router.post("/batch/delete")
async def batch_delete(
    body: BatchIdsRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    deleted = 0
    errors = []
    for file_id in body.ids:
        try:
            _get_file_or_404(db, file_id, unlocked_groups)
            fileops.delete_file(db, file_id)
            deleted += 1
        except HTTPException as e:
            errors.append({"id": file_id, "error": e.detail})
    return {"deleted": deleted, "errors": errors}


@router.put("/batch/move")
async def batch_move(
    body: BatchMoveRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    moved = 0
    errors = []
    for file_id in body.ids:
        try:
            _get_file_or_404(db, file_id, unlocked_groups)
            fileops.move_file(db, file_id, body.target_drive, body.target_folder_path)
            moved += 1
        except HTTPException as e:
            errors.append({"id": file_id, "error": e.detail})
    return {"moved": moved, "errors": errors}


@router.put("/batch/tags")
async def batch_tags(
    body: BatchTagRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    updated = 0
    errors = []
    for file_id in body.ids:
        try:
            file = _get_file_or_404(db, file_id, unlocked_groups)
            tag_objects = []
            for tag_name in body.tags:
                tag = db.query(Tag).filter(func.lower(Tag.name) == tag_name.lower(), Tag.drive == file.drive).first()
                if not tag:
                    tag = Tag(name=tag_name, drive=file.drive)
                elif tag.name != tag_name:
                    tag.name = tag_name
                    db.add(tag)
                    db.flush()
                tag_objects.append(tag)
            file.tags = tag_objects
            updated += 1
        except HTTPException as e:
            errors.append({"id": file_id, "error": e.detail})
    db.commit()

    orphans = (
        db.query(Tag)
        .outerjoin(file_tags)
        .filter(file_tags.c.file_id.is_(None))
        .all()
    )
    for orphan in orphans:
        db.delete(orphan)
    if orphans:
        db.commit()

    return {"updated": updated, "errors": errors}


@router.get("/{file_id}", response_model=FileResponse)
async def get_file(
    file_id: int,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    file = _get_file_or_404(db, file_id, unlocked_groups)
    return _to_response(file)


@router.put("/{file_id}", response_model=FileResponse)
async def update_file(
    file_id: int,
    update: FileUpdate,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    file = _get_file_or_404(db, file_id, unlocked_groups)

    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(file, key, value)

    db.commit()
    db.refresh(file)
    return _to_response(file)


@router.post("/{file_id}/like", response_model=FileResponse)
async def like_file(
    file_id: int,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    file = _get_file_or_404(db, file_id, unlocked_groups)

    file.likes = File.likes + 1
    db.commit()
    db.refresh(file)
    return _to_response(file)


@router.post("/{file_id}/dislike", response_model=FileResponse)
async def dislike_file(
    file_id: int,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    file = _get_file_or_404(db, file_id, unlocked_groups)

    file.dislikes = File.dislikes + 1
    db.commit()
    db.refresh(file)
    return _to_response(file)


@router.post("/{file_id}/favorite", response_model=FileResponse)
async def toggle_favorite(
    file_id: int,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    file = _get_file_or_404(db, file_id, unlocked_groups)

    file.is_favorite = not file.is_favorite
    db.commit()
    db.refresh(file)
    return _to_response(file)


@router.put("/{file_id}/tags", response_model=FileResponse)
async def update_file_tags(
    file_id: int,
    update: TagUpdate,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    file = _get_file_or_404(db, file_id, unlocked_groups)

    tag_objects = []
    for tag_name in update.tags:
        tag = db.query(Tag).filter(func.lower(Tag.name) == tag_name.lower(), Tag.drive == file.drive).first()
        if not tag:
            tag = Tag(name=tag_name, drive=file.drive)
        elif tag.name != tag_name:
            tag.name = tag_name
            db.add(tag)
            db.flush()
        tag_objects.append(tag)

    file.tags = tag_objects
    db.commit()

    orphans = (
        db.query(Tag)
        .outerjoin(file_tags)
        .filter(file_tags.c.file_id.is_(None))
        .all()
    )
    for orphan in orphans:
        db.delete(orphan)
    if orphans:
        db.commit()

    db.refresh(file)
    return _to_response(file)


@router.get("/{file_id}/stream")
async def stream_file(
    file_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    download: bool = False,
):
    file = _get_file_or_404(db, file_id, unlocked_groups)

    drive_path = config.get_drive_path(file.drive)
    file_path = _validate_path(
        str(drive_path / file.file_path), drive_path
    )
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    file_size = file_path.stat().st_size
    content_type = file.mime_type or "application/octet-stream"
    range_header = request.headers.get("range")

    if range_header:
        try:
            range_spec = range_header.replace("bytes=", "").split(",")[0]
            parts = range_spec.split("-")
            start = int(parts[0])
            end = (
                int(parts[1])
                if parts[1]
                else min(start + config.CHUNK_SIZE - 1, file_size - 1)
            )
            end = min(end, file_size - 1)
            if start < 0 or start > end or start >= file_size:
                raise HTTPException(status_code=416, detail="Range not satisfiable")
        except HTTPException:
            raise
        except (ValueError, IndexError):
            raise HTTPException(status_code=416, detail="Invalid range header")

        def iter_chunks():
            with open(file_path, "rb") as f:
                f.seek(start)
                remaining = end - start + 1
                while remaining > 0:
                    chunk = f.read(min(config.CHUNK_SIZE, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(end - start + 1),
            "Content-Type": content_type,
        }
        if download:
            headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(file.filename, safe='')}"

        return StreamingResponse(iter_chunks(), status_code=206, headers=headers)

    def iter_full():
        with open(file_path, "rb") as f:
            while chunk := f.read(config.CHUNK_SIZE):
                yield chunk

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(file_size),
        "Content-Type": content_type,
    }
    if download:
        headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(file.filename, safe='')}"

    return StreamingResponse(iter_full(), headers=headers)


@router.get("/{file_id}/thumbnail")
async def get_thumbnail(
    file_id: int,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    file = _get_file_or_404(db, file_id, unlocked_groups)

    if file.thumbnail_path:
        thumb_path = _validate_path(
            str(config.THUMBNAILS_DIR / file.thumbnail_path), config.DATA_DIR
        )
        if thumb_path.exists():
            return FastAPIFileResponse(str(thumb_path), media_type="image/jpeg")

    if PLACEHOLDER_THUMBNAIL.exists():
        return FastAPIFileResponse(str(PLACEHOLDER_THUMBNAIL), media_type="image/jpeg")

    raise HTTPException(status_code=404, detail="Thumbnail not found")


@router.put("/{file_id}/rename", response_model=FileResponse)
async def rename_file_endpoint(
    file_id: int,
    body: FileRenameRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _get_file_or_404(db, file_id, unlocked_groups)
    file = fileops.rename_file(db, file_id, body.new_filename)
    return _to_response(file)


@router.put("/{file_id}/move", response_model=FileResponse)
async def move_file_endpoint(
    file_id: int,
    body: FileMoveRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _get_file_or_404(db, file_id, unlocked_groups)
    file = fileops.move_file(db, file_id, body.target_drive, body.target_folder_path)
    return _to_response(file)


@router.delete("/{file_id}")
async def delete_file_endpoint(
    file_id: int,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _get_file_or_404(db, file_id, unlocked_groups)
    fileops.delete_file(db, file_id)
    return {"status": "deleted"}
