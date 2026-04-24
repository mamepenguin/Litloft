import asyncio
import hashlib
import os
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path, PurePosixPath
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, Query, Request

from app.services import event_hooks
from fastapi.responses import FileResponse as FastAPIFileResponse
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

import app.config as config
from app.auth import check_drive_access, get_unlocked_groups
from app.database import get_db
from app.models import (
    File,
    FileActiveSummary,
    FileRelation,
    Tag,
    active_file_filter,
    file_tags,
)
from app.schemas import (
    ArchiveContentsResponse,
    ArchiveEntryResponse,
    BatchCopyRequest,
    BatchCopyResponse,
    BatchIdsRequest,
    BatchMoveRequest,
    BatchPurgeResponse,
    BatchRenameRequest,
    BatchRenameResponse,
    BatchRestoreResponse,
    BatchTagRequest,
    FileCopyRequest,
    FileRelationItem,
    FileRelationsResponse,
    FileResponse,
    FileMoveRequest,
    FileRenameRequest,
    FileUpdate,
    NeighborsResponse,
    RelatedFileSummary,
    SubtitleInfo,
    TagUpdate,
    file_to_response,
)
from app.services import fileops
from app.services.filetype import classify
from app.services.heic import HEIC_MIME_TYPES, convert_heic_to_jpeg
from app.services.subtitle import convert_srt_to_vtt, detect_subtitles

router = APIRouter(prefix="/api/files", tags=["files"])

FileId = Annotated[str, PathParam(min_length=12, max_length=12, pattern=r"^[A-Za-z0-9_-]+$")]

PLACEHOLDER_THUMBNAIL = Path(__file__).parent.parent / "static" / "placeholder.jpg"

_ARCHIVE_ENTRY_MAX_SIZE = 50 * 1024 * 1024  # 50MB
_MAX_ARCHIVE_ENTRIES = 10_000
_archive_semaphore = asyncio.Semaphore(3)

_TEXT_WRITE_ALLOWED_MIMES = frozenset({"text/markdown", "text/plain"})
_TEXT_WRITE_MAX_BYTES = 1 * 1024 * 1024  # 1 MB
_text_write_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


def replace_file_tags(db: Session, file: File, tag_names: list[str]) -> None:
    """Replace ``file.tags`` with the given names, reusing existing Tag rows.

    Shared by ``PUT /api/files/{id}/tags``, ``PUT /api/files/batch/tags`` and
    the internal ``POST /api/internal/files/{id}/tags`` (spec
    ``2026-04-24-knowledge-tag-unification.md``). Case-insensitive dedup
    via ``func.lower(Tag.name)``; the ``Tag`` namespace is per-drive
    (``uq_tags_drive_name``). Caller is responsible for ``db.commit()``
    and post-commit orphan cleanup via ``cleanup_orphan_tags``.
    """
    tag_objects: list[Tag] = []
    for tag_name in tag_names:
        tag = (
            db.query(Tag)
            .filter(
                func.lower(Tag.name) == tag_name.lower(),
                Tag.drive == file.drive,
            )
            .first()
        )
        if not tag:
            tag = Tag(name=tag_name, drive=file.drive)
        elif tag.name != tag_name:
            tag.name = tag_name
            db.add(tag)
            db.flush()
        tag_objects.append(tag)
    file.tags = tag_objects


def cleanup_orphan_tags(db: Session) -> int:
    """Remove Tag rows no longer referenced by any file. Returns count deleted."""
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
    return len(orphans)




def _decode_zip_filename(info: zipfile.ZipInfo) -> str:
    """Decode ZIP entry filename, handling Shift_JIS encoded names.

    ZIP files created on Japanese Windows encode filenames in Shift_JIS (CP932)
    but don't set the UTF-8 flag. Python's zipfile decodes them as CP437,
    producing garbled text. This function detects and re-decodes as CP932.
    """
    # If UTF-8 flag is set, Python already decoded correctly
    if info.flag_bits & 0x800:
        return info.filename

    # Try re-encoding from CP437 back to bytes, then decode as CP932
    try:
        raw = info.filename.encode("cp437")
    except UnicodeEncodeError:
        return info.filename

    # Pure ASCII is identical in both encodings — no need to re-decode
    if all(b < 0x80 for b in raw):
        return info.filename

    try:
        return raw.decode("cp932")
    except UnicodeDecodeError:
        # Not Shift_JIS — return as-is (original CP437 decode)
        return info.filename


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


def _detect_file_subtitles(file: File) -> list[SubtitleInfo]:
    if file.file_type != "video" and file.mime_type != "application/vnd.litloft.loft+json":
        return []
    drive_path = config.get_drive_path(file.drive)
    raw = detect_subtitles(file.file_path, drive_path)
    return [
        SubtitleInfo(index=i, language=s["language"], format=s["format"], label=s["label"])
        for i, s in enumerate(raw)
    ]


def _is_drive_accessible(drive_name: str, unlocked_groups: list[str]) -> bool:
    access_group = config.get_drive_access_group(drive_name)
    return not access_group or access_group in unlocked_groups


def _get_file_or_404(
    db: Session, file_id: str, unlocked_groups: list[str]
) -> File:
    file = db.query(File).filter(File.id == file_id, active_file_filter()).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    check_drive_access(file.drive, unlocked_groups)
    return file


def _get_trashed_file_or_404(
    db: Session, file_id: str, unlocked_groups: list[str]
) -> File:
    file = db.query(File).filter(File.id == file_id, File.deleted_at.isnot(None)).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found in trash")
    check_drive_access(file.drive, unlocked_groups)
    return file


def _get_missing_file_or_404(
    db: Session, file_id: str, unlocked_groups: list[str]
) -> File:
    file = db.query(File).filter(
        File.id == file_id,
        File.missing_since.isnot(None),
        File.deleted_at.is_(None),
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found in missing")
    check_drive_access(file.drive, unlocked_groups)
    return file


def _get_trashed_or_missing_file_or_404(
    db: Session, file_id: str, unlocked_groups: list[str]
) -> File:
    """Get a file that is either trashed or missing (both purge-eligible)."""
    file = db.query(File).filter(
        File.id == file_id,
        or_(File.deleted_at.isnot(None), File.missing_since.isnot(None)),
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    check_drive_access(file.drive, unlocked_groups)
    return file


def _get_file_any_state_or_404(
    db: Session, file_id: str, unlocked_groups: list[str]
) -> File:
    """Get file regardless of state (for thumbnail/metadata access in trash or missing)."""
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
    files = db.query(File).filter(File.id.in_(body.ids), active_file_filter()).all()
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
    deleted_ids = []
    errors = []
    for file_id in body.ids:
        try:
            _get_file_or_404(db, file_id, unlocked_groups)
            fileops.delete_file(db, file_id)
            deleted += 1
            deleted_ids.append(file_id)
        except HTTPException as e:
            errors.append({"id": file_id, "error": e.detail})
    if deleted_ids:
        asyncio.create_task(
            event_hooks.emit("files.deleted", {"file_ids": deleted_ids, "type": "soft_delete"})
        )
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
            replace_file_tags(db, file, body.tags)
            updated += 1
        except HTTPException as e:
            errors.append({"id": file_id, "error": e.detail})
    db.commit()
    cleanup_orphan_tags(db)

    return {"updated": updated, "errors": errors}


@router.put("/batch/rename", response_model=BatchRenameResponse)
async def batch_rename(
    body: BatchRenameRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    files = []
    for file_id in body.ids:
        files.append(_get_file_or_404(db, file_id, unlocked_groups))

    kwargs = body.model_dump(
        exclude={"ids", "mode"},
        exclude_none=True,
    )
    results = fileops.batch_rename(db, files, body.mode, **kwargs)
    return {"renamed": len(results), "results": results}


@router.post("/batch/restore", response_model=BatchRestoreResponse)
async def batch_restore(
    body: BatchIdsRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    restored = 0
    restored_ids = []
    errors = []
    for file_id in body.ids:
        try:
            _get_trashed_file_or_404(db, file_id, unlocked_groups)
            fileops.restore_file(db, file_id)
            restored += 1
            restored_ids.append(file_id)
        except HTTPException as e:
            errors.append({"id": file_id, "error": e.detail})
    if restored_ids:
        asyncio.create_task(
            event_hooks.emit("files.restored", {"file_ids": restored_ids})
        )
    return {"restored": restored, "errors": errors}


@router.post("/batch/purge", response_model=BatchPurgeResponse)
async def batch_purge(
    body: BatchIdsRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    purged = 0
    purged_ids = []
    errors = []
    for file_id in body.ids:
        try:
            file = _get_trashed_or_missing_file_or_404(db, file_id, unlocked_groups)
            if file.missing_since is not None and file.deleted_at is None:
                fileops.purge_missing_file(db, file_id)
            else:
                fileops.purge_file(db, file_id)
            purged += 1
            purged_ids.append(file_id)
        except HTTPException as e:
            errors.append({"id": file_id, "error": e.detail})
    if purged_ids:
        asyncio.create_task(
            event_hooks.emit("files.purged", {"file_ids": purged_ids})
        )
    return {"purged": purged, "errors": errors}


@router.post("/batch/copy", response_model=BatchCopyResponse)
async def batch_copy(
    body: BatchCopyRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    copied = 0
    errors = []
    for file_id in body.ids:
        try:
            _get_file_or_404(db, file_id, unlocked_groups)
            fileops.copy_file(db, file_id, body.target_drive, body.target_folder_path)
            copied += 1
        except HTTPException as e:
            errors.append({"id": file_id, "error": e.detail})
    return {"copied": copied, "errors": errors}


@router.get("/{file_id}", response_model=FileResponse)
async def get_file(
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    file = _get_file_or_404(db, file_id, unlocked_groups)
    subtitles = _detect_file_subtitles(file)
    return _to_response(file, subtitles=subtitles)


@router.get("/{file_id}/active_summary")
async def get_file_active_summary(
    file_id: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    """Return the knowledge-note active summary (if any) for this file.

    Access control: protected drives locked to the caller return 404
    so the drive's existence is not leaked (same pattern as comments).
    Missing or trashed files also return 404 via active_file_filter().
    """
    file = _get_file_or_404(db, file_id, unlocked_groups)

    row = (
        db.query(FileActiveSummary)
        .filter(FileActiveSummary.file_id == file.id)
        .first()
    )
    if row is None:
        return {"has_active_summary": False, "file_id": file.id}

    note = (
        db.query(File)
        .filter(File.id == row.summary_file_id, active_file_filter())
        .first()
    )
    if note is None:
        # Summary note is missing/trashed/gone — surface as no active summary.
        return {"has_active_summary": False, "file_id": file.id}

    return {
        "has_active_summary": True,
        "file_id": file.id,
        "summary_note": {
            "file_id": note.id,
            "drive": note.drive,
            "path": note.file_path,
            "title": note.title,
        },
    }


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
        active_file_filter(),
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
    replace_file_tags(db, file, update.tags)
    db.commit()
    cleanup_orphan_tags(db)
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
    file = _get_file_any_state_or_404(db, file_id, unlocked_groups)
    if file.missing_since is not None and file.deleted_at is None:
        raise HTTPException(status_code=410, detail="File is missing")

    drive_path = config.get_drive_path(file.drive)
    file_path = _validate_path(
        str(drive_path / file.file_path), drive_path
    )
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    content_type = file.mime_type or "application/octet-stream"

    # HEIC/HEIF: serve converted JPEG for browser compatibility
    if content_type in HEIC_MIME_TYPES:
        jpeg_path = convert_heic_to_jpeg(str(file_path), config.CONVERTED_DIR)
        if jpeg_path is not None:
            file_path = jpeg_path
            content_type = "image/jpeg"

    file_size = file_path.stat().st_size
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

    # Small text files: serve as full body with ETag so clients can use
    # the content-hash for optimistic locking on PUT /content without having
    # to hash on the client (crypto.subtle is unavailable in non-secure contexts
    # like HTTP over LAN IPs).
    if (
        (file.mime_type or "") in _TEXT_WRITE_ALLOWED_MIMES
        and file_size <= _TEXT_WRITE_MAX_BYTES
    ):
        data = file_path.read_bytes()
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(len(data)),
            "Content-Type": content_type,
            "ETag": f'"{_compute_text_etag(data)}"',
        }
        if download:
            headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(file.filename, safe='')}"
        return Response(content=data, headers=headers)

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
    file = _get_file_any_state_or_404(db, file_id, unlocked_groups)

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
            decoded_name = _decode_zip_filename(info)
            is_dir = info.is_dir()
            clean_path = decoded_name.rstrip("/") if is_dir else decoded_name
            entry_name = PurePosixPath(clean_path).name
            file_type, mime_type = classify(decoded_name) if not is_dir else ("other", "")
            entries.append(ArchiveEntryResponse(
                path=decoded_name,
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
            # Look up entry by decoded name (handles Shift_JIS re-encoding)
            info = None
            for zi in zf.infolist():
                if _decode_zip_filename(zi) == path:
                    info = zi
                    break
            if info is None:
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
            with zf.open(info) as entry_fp:
                data = entry_fp.read(_ARCHIVE_ENTRY_MAX_SIZE + 1)
                if len(data) > _ARCHIVE_ENTRY_MAX_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="Decompressed entry exceeds maximum allowed size",
                    )

    _, mime_type = classify(path)
    entry_filename = PurePosixPath(path).name
    disposition = "inline" if mime_type in _SAFE_INLINE_TYPES else "attachment"

    # RFC 6266: use filename* for non-ASCII names
    encoded_filename = quote(entry_filename, safe="")
    content_disp = f"{disposition}; filename*=UTF-8''{encoded_filename}"

    return Response(
        content=data,
        media_type=mime_type,
        headers={
            "Content-Length": str(len(data)),
            "Content-Disposition": content_disp,
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{file_id}/subtitles/{index}")
async def get_subtitle(
    file_id: FileId,
    index: int,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    file = _get_file_or_404(db, file_id, unlocked_groups)
    if file.file_type != "video" and file.mime_type != "application/vnd.litloft.loft+json":
        raise HTTPException(status_code=404, detail="Not a video file")

    drive_path = config.get_drive_path(file.drive)
    raw = detect_subtitles(file.file_path, drive_path)
    if index < 0 or index >= len(raw):
        raise HTTPException(status_code=404, detail="Subtitle not found")

    sub = raw[index]
    sub_path = _validate_path(str(drive_path / sub["path"]), drive_path)
    if not sub_path.exists():
        raise HTTPException(status_code=404, detail="Subtitle file not found on disk")

    _MAX_SUBTITLE_SIZE = 5 * 1024 * 1024  # 5MB
    if sub_path.stat().st_size > _MAX_SUBTITLE_SIZE:
        raise HTTPException(status_code=413, detail="Subtitle file too large")

    content = sub_path.read_text(encoding="utf-8-sig")

    if sub["format"] == "srt":
        content = convert_srt_to_vtt(content)

    return Response(
        content=content,
        media_type="text/vtt",
        headers={"Content-Type": "text/vtt; charset=utf-8"},
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


@router.post("/{file_id}/copy", response_model=FileResponse)
async def copy_file_endpoint(
    file_id: FileId,
    body: FileCopyRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _get_file_or_404(db, file_id, unlocked_groups)
    new_file = fileops.copy_file(db, file_id, body.target_drive, body.target_folder_path)
    return _to_response(new_file)


@router.delete("/{file_id}")
async def delete_file_endpoint(
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _get_file_or_404(db, file_id, unlocked_groups)
    fileops.delete_file(db, file_id)
    asyncio.create_task(
        event_hooks.emit("files.deleted", {"file_ids": [file_id], "type": "soft_delete"})
    )
    return {"status": "deleted"}


@router.post("/{file_id}/restore", response_model=FileResponse)
async def restore_file_endpoint(
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _get_trashed_file_or_404(db, file_id, unlocked_groups)
    file = fileops.restore_file(db, file_id)
    asyncio.create_task(
        event_hooks.emit("files.restored", {"file_ids": [file_id]})
    )
    return _to_response(file)


def _compute_text_etag(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _strip_etag_quotes(value: str) -> str:
    value = value.strip()
    if value.startswith("W/"):
        value = value[2:].strip()
    if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
        return value[1:-1]
    return value


@router.put("/{file_id}/content")
async def put_file_content(
    file_id: FileId,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    """Overwrite a text file's content with optimistic-lock safety.

    Body: raw UTF-8 text, Content-Type: text/plain
    Required header: If-Match (ETag of current content)

    Responses:
    - 200 OK with new ETag on success
    - 412 if If-Match doesn't match current content's ETag
    - 413 if body exceeds size limit
    - 415 if target file's mime isn't in allowlist (text/markdown, text/plain)
    - 428 if If-Match is missing
    - 404 if file not found, trashed, or missing
    """
    if_match = request.headers.get("if-match")
    if not if_match:
        raise HTTPException(status_code=428, detail="If-Match header is required")

    body = await request.body()
    if len(body) > _TEXT_WRITE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Content exceeds size limit")

    file = _get_file_or_404(db, file_id, unlocked_groups)
    if (file.mime_type or "") not in _TEXT_WRITE_ALLOWED_MIMES:
        raise HTTPException(
            status_code=415,
            detail=f"Mime type not writable via this endpoint: {file.mime_type}",
        )

    drive_path = config.get_drive_path(file.drive)
    file_path = _validate_path(str(drive_path / file.file_path), drive_path)

    lock = _text_write_locks[file.id]
    async with lock:
        # Current ETag comes from actual file bytes (ETag is strong, content-hashed)
        try:
            current_bytes = file_path.read_bytes()
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="File not found on disk")
        current_etag = _compute_text_etag(current_bytes)

        if _strip_etag_quotes(if_match) != current_etag:
            raise HTTPException(status_code=412, detail="ETag mismatch")

        # Atomic write: tmp + os.replace. Temp file is on the same FS as target
        # so os.replace is atomic on POSIX.
        tmp_fd, tmp_name = tempfile.mkstemp(
            prefix=f".{file_path.name}.", suffix=".tmp", dir=str(file_path.parent)
        )
        try:
            with os.fdopen(tmp_fd, "wb") as f:
                f.write(body)
            os.replace(tmp_name, file_path)
        except Exception:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise

        new_etag = _compute_text_etag(body)
        # Update File.file_size (ignore mtime — FS is authoritative for mtime)
        file.file_size = len(body)
        db.commit()

    return Response(
        status_code=200,
        headers={"ETag": f'"{new_etag}"'},
    )


@router.delete("/{file_id}/purge")
async def purge_file_endpoint(
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    file = _get_trashed_or_missing_file_or_404(db, file_id, unlocked_groups)
    if file.missing_since is not None and file.deleted_at is None:
        fileops.purge_missing_file(db, file_id)
    else:
        fileops.purge_file(db, file_id)
    asyncio.create_task(
        event_hooks.emit("files.purged", {"file_ids": [file_id]})
    )
    return {"status": "purged"}


def _related_file_summary(file: File) -> RelatedFileSummary:
    return RelatedFileSummary(
        id=file.id,
        drive=file.drive,
        filename=file.filename,
        folder_path=file.folder_path,
        file_type=file.file_type,
        mime_type=file.mime_type,
        thumbnail_url=f"/api/files/{file.id}/thumbnail",
        has_thumbnail=file.thumbnail_path is not None,
        file_size=file.file_size,
        missing_since=file.missing_since,
        created_at=file.created_at,
        updated_at=file.updated_at,
    )


@router.get("/{file_id}/relations", response_model=FileRelationsResponse)
async def list_file_relations(
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    kind: Annotated[str | None, Query(max_length=32)] = None,
) -> FileRelationsResponse:
    """List files related to ``file_id`` via ``file_relations`` rows.

    The source file must be accessible to the caller (drive unlock).
    Results exclude related files that have been trashed; missing files
    are included so the UI can grey them out without dropping history.
    Related files live on the same drive as the source (spec R4), so
    access already covers both sides.
    """
    source = _get_file_or_404(db, file_id, unlocked_groups)

    q = db.query(FileRelation).filter(
        or_(
            FileRelation.file_id_a == file_id,
            FileRelation.file_id_b == file_id,
        )
    )
    if kind is not None:
        q = q.filter(FileRelation.kind == kind)
    q = q.order_by(FileRelation.created_at.desc())
    relations = q.all()
    if not relations:
        return FileRelationsResponse(relations=[])

    other_ids: list[str] = []
    relation_other: dict[int, str] = {}
    for rel in relations:
        other = rel.file_id_b if rel.file_id_a == file_id else rel.file_id_a
        relation_other[rel.id] = other
        other_ids.append(other)

    # Include missing files (missing_since set, deleted_at null) but drop
    # trashed ones. The UI wants a stable history with a greyed-out tile
    # rather than silent removal.
    other_files = (
        db.query(File)
        .filter(
            File.id.in_(other_ids),
            File.deleted_at.is_(None),
            File.drive == source.drive,
        )
        .all()
    )
    by_id = {f.id: f for f in other_files}

    items: list[FileRelationItem] = []
    for rel in relations:
        other_id = relation_other[rel.id]
        other = by_id.get(other_id)
        if other is None:
            continue
        items.append(
            FileRelationItem(
                relation_id=rel.id,
                kind=rel.kind,
                created_at=rel.created_at,
                created_by=rel.created_by,
                file=_related_file_summary(other),
            )
        )

    return FileRelationsResponse(relations=items)


