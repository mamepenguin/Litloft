import unicodedata
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

import app.config as config
from app.auth import check_drive_access, filter_drives, get_unlocked_groups
from app.database import get_db
from app.models import EmptyFolder, File, PinnedFolder, Tag, WatchHistory, active_file_filter, file_tags
from app.routers.progress import get_viewer_id
from app.services import event_hooks
from app.schemas import (
    DriveResponse,
    DriveSummaryResponse,
    DuplicateGroup,
    DuplicatesResponse,
    FileResponse,
    FolderCreateRequest,
    FolderMoveRequest,
    FolderRenameRequest,
    FolderResponse,
    PaginatedResponse,
    PaginationMeta,
    PinnedFolderCreateRequest,
    PinnedFolderResponse,
    ScanResponse,
    TagResponse,
    TextFileCreateRequest,
    WatchHistoryItemResponse,
    WatchHistoryResponse,
    WatchProgressInfo,
    file_to_response,
)
from app.services import fileops
from app.services.filetype import classify
from app.services.safepath import resolve_safe_path
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


@router.get("/{drive_name}/summary", response_model=DriveSummaryResponse)
async def get_drive_summary(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    trash_count = (
        db.query(func.count(File.id))
        .filter(File.drive == drive_name, File.deleted_at.isnot(None))
        .scalar()
        or 0
    )
    missing_count = (
        db.query(func.count(File.id))
        .filter(
            File.drive == drive_name,
            File.missing_since.isnot(None),
            File.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )
    return DriveSummaryResponse(
        name=drive_name,
        trash_count=trash_count,
        missing_count=missing_count,
    )


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

    query = db.query(File.folder_path, func.count(File.id)).filter(
        File.drive == drive_name,
        active_file_filter(),
    )

    if path:
        prefix = _escape_like(path) + "/"
        query = query.filter(File.folder_path.like(prefix + "%", escape="\\"))
    else:
        query = query.filter(File.folder_path != "")

    path_counts = query.group_by(File.folder_path).all()

    folders: dict[str, int] = {}
    for fp, count in path_counts:
        if path:
            remainder = fp[len(path) + 1:]
        else:
            remainder = fp
        if not remainder:
            continue
        top_segment = remainder.split("/")[0]
        folder_full_path = f"{path}/{top_segment}" if path else top_segment
        folders[folder_full_path] = folders.get(folder_full_path, 0) + count

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

    # Collect thumbnail file IDs for each folder
    thumbnail_map: dict[str, str] = {}
    if folders:
        thumb_query = db.query(File.id, File.folder_path, File.filename).filter(
            File.drive == drive_name,
            active_file_filter(),
            File.file_type.in_(["video", "image"]),
        )
        if path:
            thumb_query = thumb_query.filter(
                File.folder_path.like(_escape_like(path) + "/%", escape="\\")
            )
        else:
            thumb_query = thumb_query.filter(File.folder_path != "")

        thumb_query = thumb_query.order_by(File.filename.asc())

        for file_id, file_folder_path, _ in thumb_query.all():
            for folder_path in folders:
                if folder_path in thumbnail_map:
                    continue
                if file_folder_path == folder_path or file_folder_path.startswith(folder_path + "/"):
                    thumbnail_map[folder_path] = file_id
            # Early exit if all folders have thumbnails
            if len(thumbnail_map) == len(folders):
                break

    return [
        FolderResponse(
            name=fp.split("/")[-1],
            path=fp,
            file_count=count,
            thumbnail_file_id=thumbnail_map.get(fp),
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
    sort: str = Query("created_at", pattern="^(created_at|title|file_size|likes|random)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=500),
):
    _validate_drive(drive_name, unlocked_groups)
    if path is not None and path:
        path = _validate_folder_path(path)

    query = db.query(File).filter(File.drive == drive_name, active_file_filter())

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

    if sort == "random":
        query = query.order_by(func.random())
    else:
        sort_column = getattr(File, sort)
        id_column = File.id
        if order == "desc":
            sort_column = sort_column.desc()
            id_column = id_column.desc()
        query = query.order_by(sort_column, id_column)

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
        .outerjoin(File, File.id == file_tags.c.file_id)
        .filter(
            Tag.drive == drive_name,
            (file_tags.c.file_id.is_(None)) | active_file_filter(),
        )
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


_TEXT_CREATE_ALLOWED_MIMES = frozenset({"text/markdown", "text/plain"})
_TEXT_CREATE_MAX_BYTES = 1 * 1024 * 1024  # 1 MB


@router.post("/{drive_name}/files", response_model=FileResponse)
async def create_text_file(
    drive_name: str,
    body: TextFileCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    """Create a new text file (`.md` / `.txt`) with initial content.

    Lightweight JSON alternative to multipart upload, intended for text
    editors and content creators (e.g., the knowledge addon). Handles
    missing-file recovery: if the same path is in the missing state,
    the existing File row is reused (UPSERT semantics) rather than
    rejected.

    Responses:
    - 201 on new file creation
    - 200 on recovery of a missing file (same File.id reused)
    - 409 on existing active or trashed file
    - 415 on non-text extension
    - 413 on oversize body (> 1 MB)
    - 400 on unsafe path
    - 404 on unknown drive
    - 403 on protected drive without unlock
    """
    _validate_drive(drive_name, unlocked_groups)

    # Body size check first (before touching FS)
    content_bytes = body.content.encode("utf-8")
    if len(content_bytes) > _TEXT_CREATE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Content exceeds size limit")

    # Classify by filename to reject non-text types upfront
    # (safepath.resolve_safe_path validates structure, classify checks extension)
    import unicodedata
    from pathlib import Path as _Path

    rel_path = body.path.strip()
    if not rel_path:
        raise HTTPException(status_code=400, detail="Path is required")

    filename = _Path(rel_path.replace("\\", "/")).name
    file_type, mime_type = classify(filename)
    if mime_type not in _TEXT_CREATE_ALLOWED_MIMES:
        raise HTTPException(
            status_code=415,
            detail=f"Mime type not creatable via this endpoint: {mime_type}",
        )

    # Safe path resolution — rejects traversal, NUL, symlinks, etc.
    resolved = resolve_safe_path(drive_name, rel_path)
    drive_path = config.get_drive_path(drive_name)

    # Check for existing DB record at this path (active, trashed, or missing)
    normalized_rel = unicodedata.normalize(
        "NFC", str(resolved.relative_to(_Path(drive_path).resolve()))
    )
    existing = (
        db.query(File)
        .filter(File.drive == drive_name, File.file_path == normalized_rel)
        .first()
    )

    recovery = False
    if existing is not None:
        if existing.deleted_at is not None:
            raise HTTPException(
                status_code=409,
                detail="File exists in trash; purge it before recreating",
            )
        if existing.missing_since is None:
            raise HTTPException(status_code=409, detail="File already exists")
        # Missing — recovery path
        recovery = True

    # Create parent directory, then atomically write content
    import os as _os
    import tempfile as _tempfile
    resolved.parent.mkdir(parents=True, exist_ok=True)
    if resolved.exists() and not recovery:
        # FS has a file we don't know about (e.g., created out-of-band).
        # Reject to avoid surprising overwrites.
        raise HTTPException(status_code=409, detail="File already exists on disk")

    tmp_fd, tmp_name = _tempfile.mkstemp(
        prefix=f".{resolved.name}.", suffix=".tmp", dir=str(resolved.parent)
    )
    try:
        with _os.fdopen(tmp_fd, "wb") as f:
            f.write(content_bytes)
        _os.replace(tmp_name, resolved)
    except Exception:
        try:
            _os.unlink(tmp_name)
        except OSError:
            pass
        raise

    # Build folder_path + filename from the resolved relative path
    nfc_name = unicodedata.normalize("NFC", resolved.name)
    parent_rel = str(_Path(normalized_rel).parent)
    folder_path = "" if parent_rel in (".", "") else unicodedata.normalize("NFC", parent_rel)

    if recovery:
        existing.missing_since = None
        existing.file_size = len(content_bytes)
        existing.file_type = file_type
        existing.mime_type = mime_type
        existing.filename = nfc_name
        existing.folder_path = folder_path
        db.commit()
        db.refresh(existing)
        return _to_response(existing)

    new_file = File(
        filename=nfc_name,
        title=_Path(nfc_name).stem,
        drive=drive_name,
        folder_path=folder_path,
        file_path=normalized_rel,
        file_size=len(content_bytes),
        file_type=file_type,
        mime_type=mime_type,
    )
    db.add(new_file)
    db.commit()
    db.refresh(new_file)

    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=201,
        content=_to_response(new_file).model_dump(mode="json"),
    )


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


@router.put("/{drive_name}/folders/move", response_model=FolderResponse)
async def move_folder(
    drive_name: str,
    body: FolderMoveRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    result = fileops.move_folder(drive_name, body.path, body.target_path, db)
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


@router.get("/{drive_name}/pins", response_model=list[PinnedFolderResponse])
async def list_pinned_folders(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    pins = (
        db.query(PinnedFolder)
        .filter(PinnedFolder.drive == drive_name)
        .order_by(PinnedFolder.id)
        .all()
    )
    return [PinnedFolderResponse(path=pin.path) for pin in pins]


@router.post("/{drive_name}/pins", response_model=PinnedFolderResponse, status_code=201)
async def pin_folder(
    drive_name: str,
    body: PinnedFolderCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    path = _validate_folder_path(body.path) if body.path else body.path

    existing = (
        db.query(PinnedFolder)
        .filter(PinnedFolder.drive == drive_name, PinnedFolder.path == path)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Folder already pinned")

    pin = PinnedFolder(drive=drive_name, path=path)
    db.add(pin)
    db.commit()
    db.refresh(pin)
    return PinnedFolderResponse(path=pin.path)


@router.delete("/{drive_name}/pins", status_code=204)
async def unpin_folder(
    drive_name: str,
    path: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)

    pin = (
        db.query(PinnedFolder)
        .filter(PinnedFolder.drive == drive_name, PinnedFolder.path == path)
        .first()
    )
    if not pin:
        raise HTTPException(status_code=404, detail="Pin not found")

    db.delete(pin)
    db.commit()


@router.get("/{drive_name}/watch-history", response_model=WatchHistoryResponse)
async def get_watch_history(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    viewer_id: Annotated[str | None, Depends(get_viewer_id)],
    limit: int = Query(20, ge=1, le=50),
    filter: str = Query("unfinished", pattern=r"^(unfinished|all)$"),
):
    _validate_drive(drive_name, unlocked_groups)

    if viewer_id is None:
        return WatchHistoryResponse(data=[])

    query = (
        db.query(WatchHistory)
        .join(File, WatchHistory.file_id == File.id)
        .filter(
            WatchHistory.viewer_id == viewer_id,
            File.drive == drive_name,
            active_file_filter(),
        )
    )

    if filter == "unfinished":
        query = query.filter(
            WatchHistory.playback_position < WatchHistory.duration * 0.9,
        )

    records = (
        query
        .order_by(WatchHistory.last_played_at.desc())
        .limit(limit)
        .all()
    )

    items = [
        WatchHistoryItemResponse(
            **_to_response(record.file).model_dump(),
            watch_progress=WatchProgressInfo(
                position=record.playback_position,
                duration=record.duration,
            ),
        )
        for record in records
    ]

    return WatchHistoryResponse(data=items)


@router.get("/{drive_name}/duplicates", response_model=DuplicatesResponse)
async def list_duplicates(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)

    # Find (hash, size) pairs that appear more than once.
    # Grouping by both file_hash AND file_size prevents false positives
    # from files that share the same first 1MB but differ in total size.
    dup_keys = (
        db.query(File.file_hash, File.file_size, func.count(File.id))
        .filter(
            File.drive == drive_name,
            active_file_filter(),
            File.file_hash.isnot(None),
        )
        .group_by(File.file_hash, File.file_size)
        .having(func.count(File.id) > 1)
        .all()
    )

    if not dup_keys:
        return DuplicatesResponse(groups=[], total_groups=0, total_wasted_bytes=0)

    # Fetch all duplicate files in one query to avoid N+1
    hash_list = [h for h, _, _ in dup_keys]
    all_dup_files = (
        db.query(File)
        .filter(
            File.drive == drive_name,
            active_file_filter(),
            File.file_hash.in_(hash_list),
        )
        .order_by(File.file_hash, File.created_at.asc())
        .all()
    )

    # Group by (file_hash, file_size)
    dup_size_set = {(h, s) for h, s, _ in dup_keys}
    grouped: dict[tuple[str, int], list[File]] = {}
    for f in all_dup_files:
        key = (f.file_hash, f.file_size)
        if key in dup_size_set:
            grouped.setdefault(key, []).append(f)

    groups = []
    total_wasted = 0

    for (file_hash, _file_size), files in grouped.items():
        if len(files) < 2:
            continue
        total_size = sum(f.file_size for f in files)
        wasted = total_size - files[0].file_size
        total_wasted += wasted

        groups.append(DuplicateGroup(
            hash=file_hash,
            total_size=total_size,
            files=[_to_response(f) for f in files],
        ))

    return DuplicatesResponse(
        groups=groups,
        total_groups=len(groups),
        total_wasted_bytes=total_wasted,
    )


@router.get("/{drive_name}/trash", response_model=PaginatedResponse)
async def list_trash(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    sort: str = Query("deleted_at", pattern="^(deleted_at|created_at|title|file_size)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=500),
):
    _validate_drive(drive_name, unlocked_groups)

    query = db.query(File).filter(
        File.drive == drive_name,
        File.deleted_at.isnot(None),
    )

    total = query.count()

    sort_column = getattr(File, sort)
    id_column = File.id
    if order == "desc":
        sort_column = sort_column.desc()
        id_column = id_column.desc()
    query = query.order_by(sort_column, id_column)

    offset = (page - 1) * limit
    files = query.offset(offset).limit(limit).all()

    return PaginatedResponse(
        data=[_to_response(f) for f in files],
        meta=PaginationMeta(total=total, page=page, limit=limit),
    )


@router.post("/{drive_name}/trash/empty")
async def empty_trash(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    count = fileops.purge_all_trash(db, drive_name)
    return {"purged": count}


@router.get("/{drive_name}/missing", response_model=PaginatedResponse)
async def list_missing(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    sort: str = Query("missing_since", pattern="^(missing_since|created_at|title|file_size)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=500),
):
    _validate_drive(drive_name, unlocked_groups)

    query = db.query(File).filter(
        File.drive == drive_name,
        File.missing_since.isnot(None),
        File.deleted_at.is_(None),
    )

    total = query.count()

    sort_column = getattr(File, sort)
    id_column = File.id
    if order == "desc":
        sort_column = sort_column.desc()
        id_column = id_column.desc()
    query = query.order_by(sort_column, id_column)

    offset = (page - 1) * limit
    files = query.offset(offset).limit(limit).all()

    return PaginatedResponse(
        data=[_to_response(f) for f in files],
        meta=PaginationMeta(total=total, page=page, limit=limit),
    )


@router.post("/{drive_name}/missing/purge-all")
async def purge_all_missing_endpoint(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    purged_ids = fileops.purge_all_missing(db, drive_name)
    if purged_ids:
        event_hooks.emit_sync("files.purged", {"file_ids": purged_ids})
    return {"purged": len(purged_ids)}
