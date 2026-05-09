import unicodedata
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
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
    FolderTreeNode,
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


# Kind taxonomy used by Topic 2-C type filter chips (Markdown / Video / Image / PDF)
# and Topic 9 dominant_kind for the layered viewMode fallback.
TreeKind = Literal["markdown", "video", "image", "pdf"]


def _classify_kind(file_type: str | None, mime_type: str | None) -> str:
    """Map a File row's (file_type, mime_type) to the user-facing kind taxonomy."""
    if mime_type == "text/markdown":
        return "markdown"
    if mime_type == "application/pdf":
        return "pdf"
    if file_type == "video":
        return "video"
    if file_type == "image":
        return "image"
    if file_type == "audio":
        return "audio"
    if file_type == "document":
        return "document"
    return "other"


def _apply_kind_filter(query, kind: TreeKind | None):
    if kind is None:
        return query
    if kind == "markdown":
        return query.filter(File.mime_type == "text/markdown")
    if kind == "pdf":
        return query.filter(File.mime_type == "application/pdf")
    if kind == "video":
        return query.filter(File.file_type == "video")
    if kind == "image":
        return query.filter(File.file_type == "image")
    return query


_to_response = file_to_response


def _list_folder_tree_flat(
    db: Session,
    drive_name: str,
    type_filter: "TreeKind | None",
) -> list[FolderTreeNode]:
    """Return the entire drive tree (folders + files) as a flat list.

    Used by the tree filter (spec 2026-05-09) which must evaluate matches
    against the whole drive, not just the root level. Folders are emitted
    irrespective of ``type_filter`` so the filter can fall back to
    name-only matching on folders. Files honor ``type_filter`` exactly
    like the lazy-load path. Soft-deleted / missing files are excluded
    via ``active_file_filter()``.

    Caps the response at ``_FLAT_TREE_MAX_ENTRIES`` so a runaway drive
    cannot blow up the frontend.
    """
    file_query = db.query(File).filter(
        File.drive == drive_name,
        active_file_filter(),
    )
    file_query = _apply_kind_filter(file_query, type_filter)
    files = file_query.order_by(File.folder_path.asc(), File.filename.asc()).limit(
        _FLAT_TREE_MAX_ENTRIES,
    ).all()

    # Collect every folder path that contains visible content.
    folder_paths: set[str] = set()

    folder_path_query = db.query(File.folder_path).filter(
        File.drive == drive_name,
        active_file_filter(),
    ).distinct()
    for (fp,) in folder_path_query.all():
        if not fp:
            continue
        # Add the folder itself plus every ancestor segment.
        parts = fp.split("/")
        for i in range(1, len(parts) + 1):
            folder_paths.add("/".join(parts[:i]))

    ef_query = db.query(EmptyFolder.path).filter(EmptyFolder.drive == drive_name)
    for (ef_path,) in ef_query.all():
        if not ef_path:
            continue
        parts = ef_path.split("/")
        for i in range(1, len(parts) + 1):
            folder_paths.add("/".join(parts[:i]))

    folder_nodes = [
        FolderTreeNode(
            kind="folder",
            name=path.split("/")[-1],
            path=path,
            file_count=0,
            has_children=False,
        )
        for path in sorted(folder_paths)
    ]

    file_nodes = [
        FolderTreeNode(
            kind="file",
            name=f.filename,
            path=f.file_path,
            file_id=f.id,
            file_type=f.file_type,
            mime_type=f.mime_type,
        )
        for f in files
    ]

    combined = folder_nodes + file_nodes
    if len(combined) > _FLAT_TREE_MAX_ENTRIES:
        combined = combined[:_FLAT_TREE_MAX_ENTRIES]
    return combined


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

    # Compute dominant_kind per top-level folder (recursive).
    # Topic 9: ".md 過半 → two-pane / video/image 過半 → grid" の判定材料。
    dominant_kind_map: dict[str, str | None] = {fp: None for fp in folders}
    if folders:
        kind_query = db.query(
            File.folder_path,
            File.file_type,
            File.mime_type,
            func.count(File.id),
        ).filter(
            File.drive == drive_name,
            active_file_filter(),
        )
        if path:
            kind_query = kind_query.filter(
                File.folder_path.like(_escape_like(path) + "/%", escape="\\")
            )
        else:
            kind_query = kind_query.filter(File.folder_path != "")
        kind_query = kind_query.group_by(File.folder_path, File.file_type, File.mime_type)

        # Rows describe per-(folder_path, kind) totals. Roll up into the top-level
        # folder (depth-1 segment under `path`) so each row hits one bucket in O(1).
        kind_counts: dict[str, dict[str, int]] = {}
        for fp, ft, mt, count in kind_query.all():
            remainder = fp[len(path) + 1:] if path else fp
            if not remainder:
                continue
            top_segment = remainder.split("/")[0]
            top = f"{path}/{top_segment}" if path else top_segment
            if top not in folders:
                continue
            kind = _classify_kind(ft, mt)
            bucket = kind_counts.setdefault(top, {})
            bucket[kind] = bucket.get(kind, 0) + count

        for top, counts in kind_counts.items():
            dominant_kind_map[top] = max(counts.items(), key=lambda kv: kv[1])[0]

    return [
        FolderResponse(
            name=fp.split("/")[-1],
            path=fp,
            file_count=count,
            thumbnail_file_id=thumbnail_map.get(fp),
            dominant_kind=dominant_kind_map.get(fp),
        )
        for fp, count in sorted(folders.items())
    ]


_FLAT_TREE_MAX_ENTRIES = 50_000


@router.get("/{drive_name}/folder-tree", response_model=list[FolderTreeNode])
async def list_folder_tree(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    root: str = "",
    type_filter: TreeKind | None = None,
    depth: int = Query(1, ge=1, le=1),
    flat: bool = False,
):
    """Lazy-expandable folder tree for the 2-pane left tree (spec topic 10).

    Default mode (``flat=false``): returns one level (depth=1) of children
    under ``root``:

    - subfolders (always shown so the user can navigate even when filtered)
    - files at depth 1 whose ``mime_type`` / ``file_type`` matches ``type_filter``

    Folders carry ``file_count`` (recursive count after filter) and
    ``has_children`` (any subfolder OR file_count > 0) so the tree can
    decide whether to render an expand caret.

    Flat mode (``flat=true``, spec 2026-05-09 tree filter): returns the
    *entire* drive tree as a single flat list of folder + file nodes
    bypassing the depth cap. Used by the tree filter to evaluate matches
    deeper than the root level. Capped at ``_FLAT_TREE_MAX_ENTRIES`` (50k)
    entries; larger drives are out of scope for this phase. Access control
    filters (``active_file_filter``, drive permission) still apply.
    """
    _validate_drive(drive_name, unlocked_groups)
    if root:
        root = _validate_folder_path(root)

    if flat:
        return _list_folder_tree_flat(db, drive_name, type_filter)

    # Files at depth 1 directly under root
    file_query = db.query(File).filter(
        File.drive == drive_name,
        active_file_filter(),
        File.folder_path == root,
    )
    file_query = _apply_kind_filter(file_query, type_filter)
    direct_files = file_query.order_by(File.filename.asc()).all()

    # Subfolder enumeration: collect distinct first-segment names under root.
    # Folder visibility is independent of type_filter (Topic 2-A).
    subfolder_names: set[str] = set()

    folder_query = db.query(File.folder_path).filter(
        File.drive == drive_name,
        active_file_filter(),
    )
    if root:
        prefix = _escape_like(root) + "/"
        folder_query = folder_query.filter(File.folder_path.like(prefix + "%", escape="\\"))
    else:
        folder_query = folder_query.filter(File.folder_path != "")

    for (fp,) in folder_query.distinct().all():
        remainder = fp[len(root) + 1:] if root else fp
        if not remainder:
            continue
        subfolder_names.add(remainder.split("/")[0])

    ef_query = db.query(EmptyFolder.path).filter(EmptyFolder.drive == drive_name)
    if root:
        ef_query = ef_query.filter(EmptyFolder.path.like(_escape_like(root) + "/%", escape="\\"))
    else:
        ef_query = ef_query.filter(EmptyFolder.path != "")

    for (ef_path,) in ef_query.all():
        remainder = ef_path[len(root) + 1:] if root else ef_path
        if not remainder:
            continue
        subfolder_names.add(remainder.split("/")[0])

    # For each subfolder, compute file_count (recursive, with filter) and has_children.
    folder_nodes: list[FolderTreeNode] = []
    for name in sorted(subfolder_names):
        full_path = f"{root}/{name}" if root else name
        prefix = _escape_like(full_path)

        count_q = db.query(func.count(File.id)).filter(
            File.drive == drive_name,
            active_file_filter(),
            or_(
                File.folder_path == full_path,
                File.folder_path.like(prefix + "/%", escape="\\"),
            ),
        )
        count_q = _apply_kind_filter(count_q, type_filter)
        file_count = count_q.scalar() or 0

        # has_children: any descendant subfolder, OR file_count > 0 under filter
        has_subfolder = (
            db.query(File.id)
            .filter(
                File.drive == drive_name,
                active_file_filter(),
                File.folder_path.like(prefix + "/%", escape="\\"),
            )
            .first()
            is not None
        )
        if not has_subfolder:
            has_subfolder = (
                db.query(EmptyFolder.id)
                .filter(
                    EmptyFolder.drive == drive_name,
                    EmptyFolder.path.like(prefix + "/%", escape="\\"),
                )
                .first()
                is not None
            )

        folder_nodes.append(FolderTreeNode(
            kind="folder",
            name=name,
            path=full_path,
            file_count=file_count,
            has_children=has_subfolder or file_count > 0,
        ))

    file_nodes = [
        FolderTreeNode(
            kind="file",
            name=f.filename,
            path=f.file_path,
            file_id=f.id,
            file_type=f.file_type,
            mime_type=f.mime_type,
        )
        for f in direct_files
    ]

    # Folders before files (Topic 2: folder structure first, files as leaves).
    return folder_nodes + file_nodes


@router.get("/{drive_name}/files", response_model=PaginatedResponse)
async def list_drive_files(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    path: str | None = None,
    search: str | None = Query(None, max_length=200),
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
    normalized_search: str | None = None
    if search:
        normalized_search = unicodedata.normalize("NFC", search)
        escaped_search = _escape_like(normalized_search)
        pattern = f"%{escaped_search}%"
        # spec 2026-05-02-search-path-match: match both title and folder_path.
        # Catches use cases where folder-name classification is useful (e.g.
        # searching "kyoto" under travel/kyoto/...). Per-card badge routing
        # is handled by _classify_match_source below.
        query = query.filter(or_(
            File.title.ilike(pattern, escape="\\"),
            File.folder_path.ilike(pattern, escape="\\"),
        ))
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
        data=[
            _to_response(f, match_source=_classify_match_source(f, normalized_search))
            for f in files
        ],
        meta=PaginationMeta(total=total, page=page, limit=limit),
    )


def _classify_match_source(file_obj, normalized_search: str | None) -> str | None:
    if not normalized_search:
        return None
    needle = normalized_search.casefold()
    in_title = needle in (file_obj.title or "").casefold()
    in_path = needle in (file_obj.folder_path or "").casefold()
    if in_title and in_path:
        return "both"
    if in_path:
        return "path"
    # default: filename. The SQL OR guarantees a match in title or path,
    # but the casefold substring check may diverge from SQL ilike in edge cases
    # (e.g. Unicode equivalence differences) — this also acts as a safety net.
    return "filename"


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


_TEXT_CREATE_MAX_BYTES = 1 * 1024 * 1024  # 1 MB
_SUFFIX_MAX_ATTEMPTS = 99


@router.post("/{drive_name}/files", response_model=FileResponse)
async def create_text_file(
    drive_name: str,
    body: TextFileCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    """Create a new file with initial UTF-8 text content.

    Lightweight JSON alternative to multipart upload, intended for text
    editors and content creators (e.g., quick notes from the FolderToolbar
    "New File" button or the Cmd+N shortcut).

    Phase 4 of the Vault-Core merger removed the extension allowlist —
    any extension is creatable. Name conflicts with active or trashed
    files are auto-resolved by appending `` (n)`` before the extension.
    Conflicts with a *missing* row at the same path are still treated as
    UPSERT recovery (the existing row's content is replaced) and return
    200.

    Responses:
    - 201 on new file creation (incl. suffix-numbered fallback)
    - 200 on recovery of a missing file (same File.id reused)
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

    import unicodedata
    from pathlib import Path as _Path

    rel_path = body.path.strip()
    if not rel_path:
        raise HTTPException(status_code=400, detail="Path is required")

    # Safe path resolution FIRST — rejects traversal, NUL, symlinks, etc.
    # We do this before classify() so that path validation errors are
    # surfaced as 400 (not 415 / mime), matching test expectations.
    resolved = resolve_safe_path(drive_name, rel_path)
    drive_path = config.get_drive_path(drive_name)
    drive_root = _Path(drive_path).resolve()

    normalized_rel = unicodedata.normalize(
        "NFC", str(resolved.relative_to(drive_root))
    )

    # Missing-state precedence: if a row exists with missing_since set,
    # reuse it (UPSERT) rather than falling through to suffix numbering.
    existing_missing = (
        db.query(File)
        .filter(File.drive == drive_name, File.file_path == normalized_rel)
        .filter(File.missing_since.isnot(None))
        .filter(File.deleted_at.is_(None))
        .first()
    )

    import os as _os
    from sqlalchemy.exc import IntegrityError

    if existing_missing is not None:
        # Missing-state recovery: the existing row already owns this
        # path (UNIQUE constraint), so we are not racing for the slot.
        # Use os.replace via a same-dir tmp for atomic content swap.
        import tempfile as _tempfile

        resolved.parent.mkdir(parents=True, exist_ok=True)
        filename = resolved.name
        file_type, mime_type = classify(filename)

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

        nfc_name = unicodedata.normalize("NFC", resolved.name)
        parent_rel = str(_Path(normalized_rel).parent)
        folder_path = (
            "" if parent_rel in (".", "")
            else unicodedata.normalize("NFC", parent_rel)
        )
        existing_missing.missing_since = None
        existing_missing.file_size = len(content_bytes)
        existing_missing.file_type = file_type
        existing_missing.mime_type = mime_type
        existing_missing.filename = nfc_name
        existing_missing.folder_path = folder_path
        db.commit()
        db.refresh(existing_missing)
        return _to_response(existing_missing)

    base, ext = _os.path.splitext(normalized_rel)
    candidate_rel = normalized_rel
    candidate_resolved = resolved

    def _row_taken(rel: str) -> bool:
        return (
            db.query(File)
            .filter(File.drive == drive_name, File.file_path == rel)
            .first()
            is not None
        )

    new_file = None
    for attempt in range(0, _SUFFIX_MAX_ATTEMPTS + 1):
        if attempt > 0:
            candidate_rel = f"{base} ({attempt}){ext}"
            try:
                candidate_resolved = resolve_safe_path(drive_name, candidate_rel)
            except HTTPException:
                continue

        if _row_taken(candidate_rel):
            continue

        candidate_resolved.parent.mkdir(parents=True, exist_ok=True)
        try:
            fd = _os.open(
                str(candidate_resolved),
                _os.O_CREAT | _os.O_EXCL | _os.O_WRONLY,
                0o644,
            )
        except FileExistsError:
            continue
        try:
            with _os.fdopen(fd, "wb") as f:
                f.write(content_bytes)
        except Exception:
            try:
                _os.unlink(candidate_resolved)
            except OSError:
                pass
            raise

        nfc_candidate_rel = unicodedata.normalize(
            "NFC", str(candidate_resolved.relative_to(drive_root))
        )
        nfc_name = unicodedata.normalize("NFC", candidate_resolved.name)
        parent_rel = str(_Path(nfc_candidate_rel).parent)
        folder_path = (
            "" if parent_rel in (".", "")
            else unicodedata.normalize("NFC", parent_rel)
        )
        file_type, mime_type = classify(candidate_resolved.name)

        new_file = File(
            filename=nfc_name,
            title=_Path(nfc_name).stem,
            drive=drive_name,
            folder_path=folder_path,
            file_path=nfc_candidate_rel,
            file_size=len(content_bytes),
            file_type=file_type,
            mime_type=mime_type,
        )
        db.add(new_file)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            try:
                _os.unlink(candidate_resolved)
            except OSError:
                pass
            new_file = None
            continue
        db.refresh(new_file)
        break

    if new_file is None:
        raise HTTPException(status_code=409, detail="Too many naming conflicts")

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
    file_ids = result.get("file_ids") or []
    if file_ids:
        event_hooks.emit_sync("files.moved", {"file_ids": file_ids})
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
    file_ids = result.get("file_ids") or []
    if file_ids:
        event_hooks.emit_sync("files.moved", {"file_ids": file_ids})
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
