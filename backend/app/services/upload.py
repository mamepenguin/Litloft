import logging
import math
import shutil
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.orm import Session

import app.config as config
from app.models import File
from app.services.chapters import probe_file_chapters
from app.services.filetype import classify, is_probeable_media
from app.services.fileops import (
    _filename_to_title,
    remove_empty_folder_if_has_files,
    resolve_drive_path,
    validate_filename,
    validate_path_safe,
    validate_within_drive,
)
from app.services.thumbnail import get_thumbnail_generator, get_video_duration
from app.services.ws import broadcast_from_thread

logger = logging.getLogger(__name__)

_upload_sessions: dict[str, "UploadSession"] = {}


@dataclass
class UploadSession:
    upload_id: str
    drive: str
    folder_path: str
    filename: str
    file_size: int
    chunk_size: int
    total_chunks: int
    received_chunks: set[int] = field(default_factory=set)
    temp_dir: Path = field(default_factory=Path)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


def _merge_relative_into_folder(folder_path: str, relative_path: str) -> str:
    if not relative_path:
        return folder_path
    rel_dir = str(Path(relative_path).parent)
    if not rel_dir or rel_dir == ".":
        return folder_path
    return f"{folder_path}/{rel_dir}".strip("/") if folder_path else rel_dir


def _validate_upload_sizes(file_size: int, chunk_size: int) -> None:
    if file_size <= 0:
        raise HTTPException(status_code=400, detail="Invalid file size")
    if file_size > config.MAX_UPLOAD_SIZE:
        limit_gb = config.MAX_UPLOAD_SIZE / (1024 ** 3)
        raise HTTPException(
            status_code=400,
            detail=f"File too large (max {limit_gb:g}GB)",
        )
    if chunk_size <= 0 or chunk_size > config.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="Invalid chunk size")


def _check_disk_capacity(drive_path: Path, file_size: int) -> None:
    # Upload temp dir + final target may live on different filesystems.
    # Require headroom on whichever has less free space.
    required = int(file_size * config.UPLOAD_DISK_HEADROOM_RATIO)
    try:
        temp_free = shutil.disk_usage(config.UPLOAD_DIR.parent).free
        target_free = shutil.disk_usage(drive_path).free
    except OSError:
        return
    if min(temp_free, target_free) < required:
        raise HTTPException(
            status_code=507,
            detail=f"Insufficient disk space (need ~{required // (1024 ** 2)}MB free)",
        )


def init_upload(
    drive: str,
    filename: str,
    file_size: int,
    folder_path: str,
    chunk_size: int,
    relative_path: str = "",
) -> UploadSession:
    resolve_drive_path(drive)
    filename = validate_filename(filename)
    folder_path = validate_path_safe(folder_path)
    relative_path = validate_path_safe(relative_path) if relative_path else ""
    folder_path = _merge_relative_into_folder(folder_path, relative_path)

    _validate_upload_sizes(file_size, chunk_size)

    drive_path = config.get_drive_path(drive)
    target_rel = f"{folder_path}/{filename}" if folder_path else filename
    target_full = drive_path / target_rel
    validate_within_drive(target_full, drive_path)

    if target_full.exists():
        raise HTTPException(status_code=409, detail="File already exists")

    _check_disk_capacity(drive_path, file_size)

    total_chunks = math.ceil(file_size / chunk_size)
    upload_id = str(uuid.uuid4())
    temp_dir = config.UPLOAD_DIR / upload_id
    temp_dir.mkdir(parents=True, exist_ok=True)

    session = UploadSession(
        upload_id=upload_id,
        drive=drive,
        folder_path=folder_path,
        filename=filename,
        file_size=file_size,
        chunk_size=chunk_size,
        total_chunks=total_chunks,
        temp_dir=temp_dir,
    )
    _upload_sessions[upload_id] = session
    logger.info("Upload initiated: %s (%s, %d bytes, %d chunks)", upload_id, filename, file_size, total_chunks)
    return session


def get_session(upload_id: str) -> UploadSession:
    session = _upload_sessions.get(upload_id)
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found")
    return session


def receive_chunk(upload_id: str, chunk_index: int, chunk_data: bytes) -> UploadSession:
    session = get_session(upload_id)

    if chunk_index < 0 or chunk_index >= session.total_chunks:
        raise HTTPException(status_code=400, detail="Invalid chunk index")
    if len(chunk_data) > session.chunk_size + 1024:
        raise HTTPException(status_code=400, detail="Chunk too large")

    chunk_file = session.temp_dir / f"chunk_{chunk_index:06d}"
    chunk_file.write_bytes(chunk_data)
    session.received_chunks.add(chunk_index)

    return session


def complete_upload(upload_id: str, db: Session) -> tuple[File, bool]:
    session = get_session(upload_id)

    if len(session.received_chunks) != session.total_chunks:
        missing = session.total_chunks - len(session.received_chunks)
        raise HTTPException(status_code=400, detail=f"Missing {missing} chunks")

    drive_path = config.get_drive_path(session.drive)
    target_rel = (
        f"{session.folder_path}/{session.filename}"
        if session.folder_path
        else session.filename
    )
    target_full = drive_path / target_rel
    target_full.parent.mkdir(parents=True, exist_ok=True)

    # Stream chunks via copyfileobj so we never hold a full chunk in memory.
    # Matters for huge uploads where chunk_size may be 50-100MB.
    with open(target_full, "wb") as out:
        for i in range(session.total_chunks):
            chunk_file = session.temp_dir / f"chunk_{i:06d}"
            with open(chunk_file, "rb") as src:
                shutil.copyfileobj(src, out, length=1024 * 1024)

    actual_size = target_full.stat().st_size
    if actual_size != session.file_size:
        target_full.unlink()
        shutil.rmtree(session.temp_dir, ignore_errors=True)
        del _upload_sessions[upload_id]
        raise HTTPException(status_code=400, detail=f"File size mismatch: expected {session.file_size}, got {actual_size}")

    shutil.rmtree(session.temp_dir, ignore_errors=True)
    del _upload_sessions[upload_id]

    file_type, mime_type = classify(session.filename)

    duration = None
    if is_probeable_media(file_type, mime_type):
        duration = get_video_duration(str(target_full))

    thumbnail_rel = None
    gen_fn = get_thumbnail_generator(file_type, mime_type)
    if gen_fn is not None:
        thumbnail_rel = (
            f"{session.drive}/{session.folder_path}/{Path(session.filename).stem}.jpg"
            if session.folder_path
            else f"{session.drive}/{Path(session.filename).stem}.jpg"
        )
        thumbnail_full = config.THUMBNAILS_DIR / thumbnail_rel
        if not gen_fn(str(target_full), str(thumbnail_full)):
            thumbnail_rel = None

    # Reconcile any DB record already holding this file_path so the UNIQUE
    # constraint can't blow up at commit (consistent with
    # fileops.resolve_db_path_conflict used by move / rename / copy).
    #
    # init_upload's FS check (target_full.exists() → 409) already guaranteed
    # there was no live physical file at this path, so any record here is a
    # ghost or an entry whose FS copy was gone and is now (re)materialised by
    # this upload.
    existing = (
        db.query(File)
        .filter(File.drive == session.drive, File.file_path == target_rel)
        .first()
    )
    if existing is not None and existing.deleted_at is not None:
        # Trashed ghost: the user re-uploaded to this path, superseding the
        # earlier delete intent. Purge the ghost so the fresh upload takes
        # the slot cleanly (no fake-path leftover, no IntegrityError).
        db.delete(existing)
        db.flush()
        existing = None

    recovered_missing = False
    if existing is not None and existing.deleted_at is None:
        # Reuse the row in place. Covers a Missing ghost (classic recover)
        # and an Active row whose FS file had vanished and is now restored
        # by this upload — reusing keeps its watch-history / tags / comments.
        recovered_missing = existing.missing_since is not None
        existing.missing_since = None
        existing.filename = session.filename
        existing.title = _filename_to_title(session.filename)
        existing.folder_path = session.folder_path
        existing.file_size = target_full.stat().st_size
        existing.file_type = file_type
        existing.mime_type = mime_type
        existing.thumbnail_path = thumbnail_rel
        existing.duration = duration
        existing.file_hash = None
        existing.chapters_probed_at = None
        file_record = existing
    else:
        file_record = File(
            filename=session.filename,
            title=_filename_to_title(session.filename),
            drive=session.drive,
            folder_path=session.folder_path,
            file_path=target_rel,
            file_size=target_full.stat().st_size,
            file_type=file_type,
            mime_type=mime_type,
            thumbnail_path=thumbnail_rel,
            duration=duration,
        )
        db.add(file_record)
    db.flush()
    probe_file_chapters(db, file_record, target_full)
    remove_empty_folder_if_has_files(db, session.drive, session.folder_path)
    db.commit()
    db.refresh(file_record)

    logger.info("Upload complete: %s → %s", upload_id, target_rel)

    broadcast_from_thread("upload:complete", {
        "drive": session.drive,
        "file_id": file_record.id,
        "filename": file_record.filename,
    }, drive=session.drive)

    return file_record, recovered_missing


def cancel_upload(upload_id: str) -> None:
    session = get_session(upload_id)
    shutil.rmtree(session.temp_dir, ignore_errors=True)
    del _upload_sessions[upload_id]
    logger.info("Upload cancelled: %s", upload_id)


def cleanup_abandoned_uploads(max_age_hours: int = 24) -> int:
    if not config.UPLOAD_DIR.exists():
        return 0
    now = datetime.now(UTC)
    cleaned = 0
    for d in config.UPLOAD_DIR.iterdir():
        if not d.is_dir():
            continue
        upload_id = d.name
        if upload_id in _upload_sessions:
            session = _upload_sessions[upload_id]
            age = (now - session.created_at).total_seconds() / 3600
            if age > max_age_hours:
                shutil.rmtree(d, ignore_errors=True)
                del _upload_sessions[upload_id]
                cleaned += 1
        else:
            shutil.rmtree(d, ignore_errors=True)
            cleaned += 1
    if cleaned:
        logger.info("Cleaned up %d abandoned uploads", cleaned)
    return cleaned
