import asyncio
import os
import zipfile
from pathlib import Path, PurePosixPath
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, Query, Request
from fastapi.responses import FileResponse as FastAPIFileResponse
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

import app.config as config
from app.auth import check_drive_access, get_unlocked_groups
from app.database import get_db
from app.models import File, Tag, file_tags
from app.schemas import (
    ArchiveContentsResponse,
    ArchiveEntryResponse,
    BatchIdsRequest,
    BatchMoveRequest,
    BatchTagRequest,
    FileResponse,
    FileMoveRequest,
    FileRenameRequest,
    FileUpdate,
    NeighborsResponse,
    TagUpdate,
    file_to_response,
)
from app.services import fileops
from app.services.filetype import classify

router = APIRouter(prefix="/api/files", tags=["files"])

FileId = Annotated[str, PathParam(min_length=12, max_length=12, pattern=r"^[A-Za-z0-9_-]+$")]

PLACEHOLDER_THUMBNAIL = Path(__file__).parent.parent / "static" / "placeholder.jpg"

_ARCHIVE_ENTRY_MAX_SIZE = 50 * 1024 * 1024  # 50MB
_MAX_ARCHIVE_ENTRIES = 10_000
_archive_semaphore = asyncio.Semaphore(3)

_SAFE_INLINE_TYPES = frozenset({
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
    "image/bmp", "text/plain",
})


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
    db: Session, file_id: str, unlocked_groups: list[str]
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
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    file = _get_file_or_404(db, file_id, unlocked_groups)
    return _to_response(file)


@router.get("/{file_id}/neighbors", response_model=NeighborsResponse)
async def get_file_neighbors(
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    sort: str = Query("created_at", pattern="^(created_at|title|file_size|likes)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    file = _get_file_or_404(db, file_id, unlocked_groups)

    sort_col = getattr(File, sort)
    current_val = getattr(file, sort)

    base = db.query(File.id).filter(
        File.drive == file.drive,
        File.folder_path == file.folder_path,
        File.id != file.id,
    )

    if order == "asc":
        prev_query = base.filter(
            or_(
                sort_col < current_val,
                and_(sort_col == current_val, File.id < file.id),
            )
        ).order_by(sort_col.desc(), File.id.desc()).limit(1)

        next_query = base.filter(
            or_(
                sort_col > current_val,
                and_(sort_col == current_val, File.id > file.id),
            )
        ).order_by(sort_col.asc(), File.id.asc()).limit(1)
    else:
        prev_query = base.filter(
            or_(
                sort_col > current_val,
                and_(sort_col == current_val, File.id > file.id),
            )
        ).order_by(sort_col.asc(), File.id.asc()).limit(1)

        next_query = base.filter(
            or_(
                sort_col < current_val,
                and_(sort_col == current_val, File.id < file.id),
            )
        ).order_by(sort_col.desc(), File.id.desc()).limit(1)

    prev_row = prev_query.first()
    next_row = next_query.first()

    return NeighborsResponse(
        prev_id=prev_row[0] if prev_row else None,
        next_id=next_row[0] if next_row else None,
    )


@router.put("/{file_id}", response_model=FileResponse)
async def update_file(
    file_id: FileId,
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
    file_id: FileId,
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
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    file = _get_file_or_404(db, file_id, unlocked_groups)

    file.likes = File.likes - 1
    db.commit()
    db.refresh(file)
    return _to_response(file)


@router.post("/{file_id}/favorite", response_model=FileResponse)
async def toggle_favorite(
    file_id: FileId,
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
    file_id: FileId,
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
    file_id: FileId,
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
    file_id: FileId,
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
        return FastAPIFileResponse(
            str(PLACEHOLDER_THUMBNAIL),
            media_type="image/jpeg",
            headers={"Cache-Control": "no-cache"},
        )

    raise HTTPException(status_code=404, detail="Thumbnail not found")


@router.get("/{file_id}/archive", response_model=ArchiveContentsResponse)
async def get_archive_contents(
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    file = _get_file_or_404(db, file_id, unlocked_groups)
    if file.file_type != "archive":
        raise HTTPException(status_code=404, detail="File is not an archive")

    drive_path = config.get_drive_path(file.drive)
    file_path = _validate_path(str(drive_path / file.file_path), drive_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    entries = []
    total_size = 0
    with zipfile.ZipFile(str(file_path), "r") as zf:
        for info in zf.infolist():
            if len(entries) >= _MAX_ARCHIVE_ENTRIES:
                break
            # Skip symlink entries
            if info.external_attr != 0:
                mode = info.external_attr >> 16
                if mode != 0 and (mode & 0o170000) == 0o120000:
                    continue
            is_dir = info.is_dir()
            clean_path = info.filename.rstrip("/") if is_dir else info.filename
            entry_name = PurePosixPath(clean_path).name
            file_type, mime_type = classify(info.filename) if not is_dir else ("other", "")
            entries.append(ArchiveEntryResponse(
                path=info.filename,
                filename=entry_name,
                file_size=info.file_size,
                compressed_size=info.compress_size,
                file_type=file_type if not is_dir else "directory",
                mime_type=mime_type,
                is_dir=is_dir,
            ))
            total_size += info.file_size

    entries_sorted = sorted(entries, key=lambda e: e.path)
    return ArchiveContentsResponse(
        entries=entries_sorted,
        total_entries=len(entries_sorted),
        total_size=total_size,
    )


@router.get("/{file_id}/archive/entry")
async def get_archive_entry(
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    path: str = Query(..., min_length=1),
):
    clean = PurePosixPath(path)
    if clean.is_absolute() or ".." in clean.parts:
        raise HTTPException(status_code=400, detail="Invalid entry path")

    file = _get_file_or_404(db, file_id, unlocked_groups)
    if file.file_type != "archive":
        raise HTTPException(status_code=404, detail="File is not an archive")

    drive_path = config.get_drive_path(file.drive)
    file_path = _validate_path(str(drive_path / file.file_path), drive_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    async with _archive_semaphore:
        with zipfile.ZipFile(str(file_path), "r") as zf:
            try:
                info = zf.getinfo(path)
            except KeyError:
                raise HTTPException(
                    status_code=404, detail="Entry not found in archive"
                )

            # Reject symlink entries
            if info.external_attr != 0:
                mode = info.external_attr >> 16
                if mode != 0 and (mode & 0o170000) == 0o120000:
                    raise HTTPException(
                        status_code=400, detail="Symlink entries not supported"
                    )

            if info.file_size > _ARCHIVE_ENTRY_MAX_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail="Entry exceeds maximum allowed size",
                )

            # Read with size limit to defend against ZIP bombs
            # (declared file_size can be spoofed in ZIP headers)
            with zf.open(path) as entry_fp:
                data = entry_fp.read(_ARCHIVE_ENTRY_MAX_SIZE + 1)
                if len(data) > _ARCHIVE_ENTRY_MAX_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="Decompressed entry exceeds maximum allowed size",
                    )

    _, mime_type = classify(path)
    entry_filename = PurePosixPath(path).name
    disposition = "inline" if mime_type in _SAFE_INLINE_TYPES else "attachment"

    return Response(
        content=data,
        media_type=mime_type,
        headers={
            "Content-Length": str(len(data)),
            "Content-Disposition": f'{disposition}; filename="{entry_filename}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.put("/{file_id}/rename", response_model=FileResponse)
async def rename_file_endpoint(
    file_id: FileId,
    body: FileRenameRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _get_file_or_404(db, file_id, unlocked_groups)
    file = fileops.rename_file(db, file_id, body.new_filename)
    return _to_response(file)


@router.put("/{file_id}/move", response_model=FileResponse)
async def move_file_endpoint(
    file_id: FileId,
    body: FileMoveRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _get_file_or_404(db, file_id, unlocked_groups)
    file = fileops.move_file(db, file_id, body.target_drive, body.target_folder_path)
    return _to_response(file)


@router.delete("/{file_id}")
async def delete_file_endpoint(
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _get_file_or_404(db, file_id, unlocked_groups)
    fileops.delete_file(db, file_id)
    return {"status": "deleted"}
